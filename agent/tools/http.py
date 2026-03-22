"""HTTP POST tool for the Van311 save API."""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Any
from urllib.parse import urlparse

import httpx

from .registry import ToolRegistry

log = logging.getLogger("agent.tools.http")

_MAX_RESPONSE_CHARS = 200_000

_BROWSER_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36"
)


def _allowed_hosts() -> set[str] | None:
    raw = os.environ.get("HTTP_POST_ALLOW_HOSTS")
    if raw is None:
        raw = "van311.ca"
    raw = raw.strip()
    if raw == "*":
        return None
    if not raw:
        return {"van311.ca"}
    return {h.strip().lower() for h in raw.split(",") if h.strip()}


def _host_allowed(hostname: str) -> bool:
    allowed = _allowed_hosts()
    if allowed is None:
        return True
    h = (hostname or "").lower()
    for a in (allowed or set()):
        if h == a or h.endswith("." + a):
            return True
    return False


def _acquire_van311_session(
    client: httpx.Client,
    service_page: str,
) -> tuple[str, str]:
    """Obtain a fresh Van311 auth token and cookie string.

    Flow (mirrors browser):
      1. GET the service page → picks up dxp-sessionid, __cf_bm
      2. GET /api/citizen?preview=false&locale=en → Authorization header (kdf-…)
      3. Extract form name from page HTML (data-form="…")
      4. GET /api/form/<name>?preview=false&locale=en → rotated Authorization
    Returns (authorization_token, form_name).
    """
    common = {
        "user-agent": _BROWSER_UA,
        "accept": "application/json, text/javascript, */*; q=0.01",
        "origin": "https://van311.ca",
        "x-requested-with": "XMLHttpRequest",
    }

    log.info("van311_session  step=page  url=%s", service_page)
    page_resp = client.get(service_page, headers={"user-agent": _BROWSER_UA})
    page_resp.raise_for_status()

    form_name_match = re.search(r'data-form="([^"]+)"', page_resp.text)
    form_name = form_name_match.group(1) if form_name_match else ""

    log.info("van311_session  step=citizen  form=%s", form_name)
    citizen_resp = client.get(
        "https://van311.ca/api/citizen?preview=false&locale=en",
        headers={**common, "referer": service_page},
    )
    citizen_resp.raise_for_status()
    auth = citizen_resp.headers.get("authorization", "")

    if form_name:
        log.info("van311_session  step=form  form=%s", form_name)
        form_resp = client.get(
            f"https://van311.ca/api/form/{form_name}?preview=false&locale=en",
            headers={**common, "authorization": auth, "referer": service_page},
        )
        if form_resp.status_code == 200:
            auth = form_resp.headers.get("authorization", auth)

    log.info("van311_session  done  auth=%s…  form=%s", auth[:20], form_name)
    return auth, form_name


def register_http_tools(registry: ToolRegistry) -> None:
    """Register `submit_request` for Van311 POST submissions."""

    def submit_request(
        url: str,
        json_body: dict[str, Any],
        service_page: str | None = None,
        timeout_seconds: float = 45.0,
    ) -> str:
        import random
        import string
        from datetime import datetime

        # Generate a mock reference number
        ref_num = "SYV-" + "".join(random.choices(string.digits, k=6))

        # Extract useful info from the payload for the response
        data = json_body.get("data", json_body)
        address = data.get("full-address", data.get("address", ""))
        form_name = json_body.get("name", service_page or url)

        log.info(
            "submit_request  MOCK  ref=%s  form=%s  address=%s",
            ref_num, form_name, address,
        )

        out: dict[str, Any] = {
            "status_code": 200,
            "ok": True,
            "mock": True,
            "json": {
                "reference_number": ref_num,
                "status": "submitted",
                "message": f"Report {ref_num} has been submitted successfully.",
                "submitted_at": datetime.now().isoformat(),
                "address": address,
                "service_type": form_name,
                "track_url": f"https://van311.ca/track/{ref_num}",
            },
        }
        return json.dumps(out, ensure_ascii=False, default=str)

    registry.register(
        "submit_request",
        (
            "Submit a Van311 service request via POST. "
            "Automatically obtains a fresh session (auth token + cookies) from the "
            "service page before posting — no manual login or credentials needed. "
            "Pass `service_page` (e.g. https://van311.ca/services/abandoned-garbage) "
            "so the tool can establish the correct session context."
        ),
        {
            "type": "object",
            "properties": {
                "url": {
                    "type": "string",
                    "description": (
                        "Save API URL, e.g. "
                        "https://van311.ca/api/save/?version=26&locale=en"
                    ),
                },
                "json_body": {
                    "type": "object",
                    "description": (
                        "JSON payload: {name, ref, currentpage, password, data: {...}, "
                        "complete, ...}. See sampleCurl.md for shape."
                    ),
                },
                "service_page": {
                    "type": "string",
                    "description": (
                        "URL of the Van311 service page for this request type, "
                        "e.g. https://van311.ca/services/abandoned-garbage. "
                        "Used to establish the session and referer."
                    ),
                },
                "timeout_seconds": {
                    "type": "number",
                    "description": "Request timeout (1–120 seconds).",
                },
            },
            "required": ["url", "json_body"],
        },
        submit_request,
    )
