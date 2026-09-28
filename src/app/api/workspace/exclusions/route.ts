import { NextResponse } from "next/server";
import * as z from "zod/v4";
import { apiWorkspaceContext, jsonError } from "@/lib/auth/context";
import { errorResponse, parseJson } from "@/lib/http";
import { updateWorkspace } from "@/lib/workspace/store";

export const dynamic = "force-dynamic";

const Body = z.object({
  activityIds: z.array(z.string().max(100)).min(1).max(5000),
  reason: z.string().trim().min(3).max(500),
  restore: z.boolean().optional(),
});

/**
 * Exclude or restore activity records after review.
 *
 * Excluded records are never deleted - they stay in the audit trail with the
 * operator's reason and name attached, because "why is this row not in the
 * declaration" is the first thing a verifier asks.
 */
export async function POST(request: Request) {
  const r = await apiWorkspaceContext(request, { write: true });
  if (!r.ok) return r.response;
  const body = await parseJson(request, Body);
  if (!body.ok) return body.response;
  const { activityIds, reason, restore } = body.data;

  const known = new Set(
    r.ctx.workspace.state.datasets.flatMap((d) => d.activities.map((a) => a.id)),
  );
  const valid = activityIds.filter((id) => known.has(id));
  if (valid.length === 0) return jsonError(404, "No matching records.");

  try {
    await updateWorkspace(r.ctx.db, {
      workspaceId: r.ctx.workspace.id,
      actor: r.ctx.actor,
      action: restore ? "records.restored" : "records.excluded",
      detail: { activityIds: valid, reason },
      mutate: (s) => {
        if (restore) {
          s.exclusions = s.exclusions.filter((e) => !valid.includes(e.activityId));
          return;
        }
        const at = new Date().toISOString();
        for (const id of valid) {
          if (s.exclusions.some((e) => e.activityId === id)) continue;
          s.exclusions.push({ activityId: id, reason, at, by: r.ctx.actor.label });
        }
      },
    });
    return NextResponse.json({ ok: true, affected: valid.length });
  } catch (error) {
    return errorResponse(error);
  }
}
