import { NextResponse } from "next/server";
import * as z from "zod/v4";
import { apiWorkspaceContext } from "@/lib/auth/context";
import { errorResponse, parseJson } from "@/lib/http";
import { setDatasetStatus } from "@/lib/workspace/datasets";

export const dynamic = "force-dynamic";

const Body = z.object({ status: z.enum(["draft", "confirmed"]) });

/** Confirms a reviewed mapping (the dataset starts to count) or sets it back to draft. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await apiWorkspaceContext(request, { write: true });
  if (!r.ok) return r.response;
  const body = await parseJson(request, Body);
  if (!body.ok) return body.response;
  try {
    await setDatasetStatus(r.ctx.db, r.ctx.workspace, id, body.data.status, r.ctx.actor);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
