import { NextResponse } from "next/server";
import * as z from "zod/v4";
import { apiContext, jsonError } from "@/lib/auth/context";
import { errorResponse, parseJson } from "@/lib/http";
import { deleteWorkspace, getWorkspace, updateWorkspace } from "@/lib/workspace/store";

export const dynamic = "force-dynamic";

const Rename = z.object({ name: z.string().trim().min(1).max(160) });

async function load(request: Request, id: string, write: boolean, owner = false) {
  const r = await apiContext(request, owner ? { roles: ["owner"] } : { write });
  if (!r.ok) return r;
  const ws = await getWorkspace(r.ctx.db, id);
  if (!ws || ws.orgId !== r.ctx.org.id) {
    return { ok: false as const, response: jsonError(404, "Workspace not found.") };
  }
  return { ok: true as const, ctx: r.ctx, ws };
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await load(request, id, true);
  if (!r.ok) return r.response;
  const body = await parseJson(request, Rename);
  if (!body.ok) return body.response;
  try {
    await updateWorkspace(r.ctx.db, {
      workspaceId: id,
      actor: r.ctx.actor,
      action: "workspace.renamed",
      detail: { from: r.ws.name, to: body.data.name },
      rename: body.data.name,
      mutate: () => undefined,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await load(request, id, true, true);
  if (!r.ok) return r.response;
  try {
    await deleteWorkspace(r.ctx.db, r.ws, r.ctx.actor);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
