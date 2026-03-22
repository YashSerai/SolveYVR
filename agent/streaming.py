"""Streaming agent loop: token deltas + thinking traces over SSE-friendly event dicts."""

from __future__ import annotations

import json
import logging
from typing import Any, Iterator

from openai import OpenAI

from .config import AgentConfig
from .loop import _default_headers
from .tools import ToolRegistry

log = logging.getLogger("agent.streaming")

_FRIENDLY_LABELS: dict[str, str] = {
    "geocode_address": "Looking up location",
    "lookup_service_fields": "Checking what information is needed",
    "submit_request": "Submitting your report to the City",
}


def _friendly_label(name: str) -> str:
    return _FRIENDLY_LABELS.get(name, name.replace("_", " ").title())


def _arg_summary(name: str, args: dict[str, Any]) -> str | None:
    """One-line human-readable summary of the tool arguments."""
    if name == "geocode_address":
        return args.get("address")
    if name == "lookup_service_fields":
        urls = args.get("urls")
        if urls and isinstance(urls, list):
            return urls[0] if len(urls) == 1 else f"{len(urls)} service pages"
        return None
    if name == "submit_request":
        return args.get("url", "")[:80] or None
    return None


def _result_summary(name: str, raw: str) -> str:
    """Short human-readable summary of the tool result."""
    try:
        d = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return raw[:200]

    if isinstance(d, dict):
        if "error" in d:
            return f"Error: {d.get('detail', d['error'])}"
        if name == "geocode_address":
            addr = d.get("display_address") or d.get("input_address", "")
            return f"Found: {addr}" if addr else "Location resolved"
        if name == "lookup_service_fields":
            fields = d.get("required_fields", [])
            if fields:
                preview = ", ".join(fields[:5])
                more = f" (+{len(fields)-5} more)" if len(fields) > 5 else ""
                return f"Fields: {preview}{more}"
            return "Fields retrieved"
        if name == "submit_request":
            ok = d.get("ok")
            code = d.get("status_code", "")
            if ok:
                body = d.get("json", {})
                ref = (body.get("reference_number") or body.get("ref", "")) if isinstance(body, dict) else ""
                caseid = body.get("caseid", "") if isinstance(body, dict) else ""
                parts = [f"Submitted successfully (status {code})"]
                if ref:
                    parts.append(f"ref={ref}")
                if caseid:
                    parts.append(f"caseid={caseid}")
                return " ".join(parts)
            body = d.get("json") or d.get("text", "")
            if isinstance(body, dict):
                body = json.dumps(body, ensure_ascii=False)
            detail = str(body)[:300]
            reason = d.get("reason", "")
            msg = f"Error {code}"
            if reason:
                msg += f" {reason}"
            if detail:
                msg += f" — {detail}"
            return msg

    return raw[:200] + ("…" if len(raw) > 200 else "")


def _merge_tool_delta(
    buf: dict[int, dict[str, str]],
    delta_tool_calls: list[Any] | None,
) -> None:
    if not delta_tool_calls:
        return
    for tc in delta_tool_calls:
        idx = tc.index
        if idx not in buf:
            buf[idx] = {"id": "", "name": "", "arguments": ""}
        if getattr(tc, "id", None):
            buf[idx]["id"] = tc.id
        fn = tc.function
        if fn is not None:
            if getattr(fn, "name", None):
                buf[idx]["name"] = fn.name
            if getattr(fn, "arguments", None):
                buf[idx]["arguments"] += fn.arguments


def _assistant_dict_from_stream(
    content_parts: list[str], tool_buf: dict[int, dict[str, str]]
) -> dict[str, Any]:
    content = "".join(content_parts) if content_parts else None
    if not tool_buf:
        return {"role": "assistant", "content": content}
    tool_calls: list[dict[str, Any]] = []
    for idx in sorted(tool_buf.keys()):
        t = tool_buf[idx]
        tool_calls.append(
            {
                "id": t["id"],
                "type": "function",
                "function": {"name": t["name"], "arguments": t["arguments"]},
            }
        )
    return {"role": "assistant", "content": content, "tool_calls": tool_calls}


def run_agent_stream_events(
    messages: list[dict[str, Any]],
    registry: ToolRegistry,
    *,
    config: AgentConfig | None = None,
    client: OpenAI | None = None,
) -> Iterator[dict[str, Any]]:
    """
    Yields JSON-serializable events for SSE:
      - {"type": "delta", "text": "..."}               — token text
      - {"type": "thinking_start", "steps": [...]}     — about to run tools
      - {"type": "thinking_step", ...}                  — per-tool progress
      - {"type": "thinking_end"}                        — tool round finished
      - {"type": "done", "messages": [...], "reply": str|None, "tool_rounds_used": int}
    """
    cfg = config or AgentConfig.from_env()
    if client is None:
        headers = _default_headers(cfg)
        client = OpenAI(
            base_url=cfg.base_url,
            api_key=cfg.api_key,
            default_headers=headers,
            timeout=cfg.request_timeout_seconds,
        )

    tools = registry.openapi_tools()
    if not tools:
        raise ValueError("ToolRegistry has no tools registered")

    msgs = messages
    tool_rounds_used = 0
    final_reply: str | None = None

    for _ in range(cfg.max_tool_rounds):
        stream = client.chat.completions.create(
            model=cfg.model,
            messages=msgs,
            tools=tools,
            tool_choice="auto",
            stream=True,
        )

        content_parts: list[str] = []
        tool_buf: dict[int, dict[str, str]] = {}

        for chunk in stream:
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta
            if delta is None:
                continue
            if delta.content:
                text = delta.content
                content_parts.append(text)
                yield {"type": "delta", "text": text}
            if delta.tool_calls:
                _merge_tool_delta(tool_buf, delta.tool_calls)

        assistant_dict = _assistant_dict_from_stream(content_parts, tool_buf)
        msgs.append(assistant_dict)

        if not assistant_dict.get("tool_calls"):
            final_reply = assistant_dict.get("content")
            yield {
                "type": "done",
                "messages": msgs,
                "reply": final_reply,
                "tool_rounds_used": tool_rounds_used,
            }
            return

        tool_calls = assistant_dict["tool_calls"]
        tool_rounds_used += 1

        steps_preview = [
            {"name": tc["function"]["name"], "label": _friendly_label(tc["function"]["name"])}
            for tc in tool_calls
        ]
        yield {"type": "thinking_start", "steps": steps_preview}

        for tc in tool_calls:
            fn = tc["function"]
            name = fn["name"]
            call_id = tc["id"]
            raw_args = fn.get("arguments") or "{}"

            try:
                args = json.loads(raw_args)
                if not isinstance(args, dict):
                    args = {"value": args}
            except json.JSONDecodeError as e:
                log.warning("tool_args_parse_error  name=%s  id=%s  error=%s", name, call_id, e)
                result = json.dumps({"error": "invalid_arguments_json", "detail": str(e)})
                args = {}
            else:
                result = registry.execute(name, args)

            yield {
                "type": "thinking_step",
                "name": name,
                "label": _friendly_label(name),
                "detail": _arg_summary(name, args),
                "result_summary": _result_summary(name, result),
                "status": "error" if '"error"' in result[:50] else "ok",
            }

            msgs.append({"role": "tool", "tool_call_id": call_id, "content": result})

        yield {"type": "thinking_end"}

    yield {
        "type": "done",
        "messages": msgs,
        "reply": final_reply,
        "tool_rounds_used": tool_rounds_used,
    }
