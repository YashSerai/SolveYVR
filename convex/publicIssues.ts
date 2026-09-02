import { query } from "./_generated/server";
import {
  paginationOptsValidator,
  type ExpressionOrValue,
} from "convex/server";
import { v } from "convex/values";

export const list = query({
  args: {
    status: v.optional(v.union(v.literal("open"), v.literal("closed"))),
    local_area: v.optional(v.string()),
    department: v.optional(v.string()),
    service_request_type: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const { status, local_area, department, service_request_type } = args;

    let q;
    if (status) {
      q = ctx.db
        .query("publicIssues")
        .withIndex("by_status_opened_at", (idx) => idx.eq("status", status))
        .order("desc");
    } else if (local_area) {
      q = ctx.db
        .query("publicIssues")
        .withIndex("by_local_area_opened_at", (idx) =>
          idx.eq("local_area", local_area)
        )
        .order("desc");
    } else if (department) {
      q = ctx.db
        .query("publicIssues")
        .withIndex("by_department_opened_at", (idx) =>
          idx.eq("department", department)
        )
        .order("desc");
    } else if (service_request_type) {
      q = ctx.db
        .query("publicIssues")
        .withIndex("by_service_request_type_opened_at", (idx) =>
          idx.eq("service_request_type", service_request_type)
        )
        .order("desc");
    } else {
      q = ctx.db
        .query("publicIssues")
        .withIndex("by_opened_at")
        .order("desc");
    }

    if (status && (local_area || department || service_request_type)) {
      q = q.filter((row) => {
        let cond: ExpressionOrValue<boolean> = true;
        if (local_area) cond = row.eq(row.field("local_area"), local_area);
        if (department) cond = row.eq(row.field("department"), department);
        if (service_request_type)
          cond = row.eq(
            row.field("service_request_type"),
            service_request_type
          );
        return cond;
      });
    }

    return await q.paginate(args.paginationOpts);
  },
});

export const listForMap = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("publicIssues")
      .withIndex("by_has_location", (q) => q.eq("has_location", true))
      .order("desc")
      .collect();
  },
});

export const get = query({
  args: { id: v.id("publicIssues") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const stats = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("publicIssues").collect();
    const open = all.filter((r) => r.status === "open").length;
    const closed = all.filter((r) => r.status === "closed").length;
    const withLocation = all.filter((r) => r.has_location).length;
    const categories = [
      ...new Set(all.map((r) => r.service_request_type)),
    ].sort();
    const localAreas = [
      ...new Set(all.map((r) => r.local_area).filter(Boolean)),
    ].sort() as string[];
    const departments = [
      ...new Set(all.map((r) => r.department)),
    ].sort();

    return {
      total: all.length,
      open,
      closed,
      withLocation,
      categories,
      localAreas,
      departments,
    };
  },
});
