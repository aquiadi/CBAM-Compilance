import { NextResponse } from "next/server";
import * as z from "zod/v4";
import { apiWorkspaceContext } from "@/lib/auth/context";
import { errorResponse, parseJson } from "@/lib/http";
import { decideSupplierRequest } from "@/lib/suppliers";

export const dynamic = "force-dynamic";

const Body = z.object({ decision: z.enum(["accept", "reject", "revoke"]) });

/** Accepts or rejects a supplier's submission, or revokes an open link. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await apiWorkspaceContext(request, { write: true });
  if (!r.ok) return r.response;
  const body = await parseJson(request, Body);
  if (!body.ok) return body.response;
  try {
    await decideSupplierRequest(r.ctx.db, r.ctx.workspace, id, body.data.decision, r.ctx.actor);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
