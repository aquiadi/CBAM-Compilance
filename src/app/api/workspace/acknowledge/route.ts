import { NextResponse } from "next/server";
import * as z from "zod/v4";
import { apiWorkspaceContext } from "@/lib/auth/context";
import { errorResponse, parseJson } from "@/lib/http";
import { findingKey } from "@/lib/workspace/declaration";
import { updateWorkspace } from "@/lib/workspace/store";

export const dynamic = "force-dynamic";

const Body = z.object({
  code: z.string().max(20),
  title: z.string().max(500),
  note: z.string().trim().min(3).max(1000),
  undo: z.boolean().optional(),
});

/**
 * Records that the operator has reviewed a warning or info finding and
 * accepts it, with a note. Blockers cannot be acknowledged away - they are
 * cleared by fixing the data.
 */
export async function POST(request: Request) {
  const r = await apiWorkspaceContext(request, { write: true });
  if (!r.ok) return r.response;
  const body = await parseJson(request, Body);
  if (!body.ok) return body.response;
  const key = findingKey(body.data.code, body.data.title);
  try {
    await updateWorkspace(r.ctx.db, {
      workspaceId: r.ctx.workspace.id,
      actor: r.ctx.actor,
      action: body.data.undo ? "finding.reopened" : "finding.acknowledged",
      detail: { code: body.data.code, title: body.data.title, note: body.data.note },
      mutate: (s) => {
        s.acknowledged = s.acknowledged.filter((k) => k !== key);
        s.acknowledgementNotes ??= {};
        delete s.acknowledgementNotes[key];
        if (!body.data.undo) {
          s.acknowledged.push(key);
          s.acknowledgementNotes[key] = {
            note: body.data.note,
            by: r.ctx.actor.label,
            at: new Date().toISOString(),
          };
        }
      },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
