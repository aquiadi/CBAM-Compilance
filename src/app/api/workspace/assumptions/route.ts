import { NextResponse } from "next/server";
import * as z from "zod/v4";
import { apiWorkspaceContext } from "@/lib/auth/context";
import { errorResponse, parseJson } from "@/lib/http";
import { updateWorkspace } from "@/lib/workspace/store";

export const dynamic = "force-dynamic";

const Body = z.object({
  etsPriceEur: z.number().positive().max(1000).optional(),
  inrPerEur: z.number().positive().max(1000).optional(),
});

/** The certificate price assumed for unpublished quarters, and the INR rate. */
export async function PATCH(request: Request) {
  const r = await apiWorkspaceContext(request, { write: true });
  if (!r.ok) return r.response;
  const body = await parseJson(request, Body);
  if (!body.ok) return body.response;
  try {
    await updateWorkspace(r.ctx.db, {
      workspaceId: r.ctx.workspace.id,
      actor: r.ctx.actor,
      action: "assumptions.updated",
      detail: { ...body.data, before: r.ctx.workspace.state.assumptions },
      mutate: (s) => {
        if (body.data.etsPriceEur !== undefined) s.assumptions.etsPriceEur = body.data.etsPriceEur;
        if (body.data.inrPerEur !== undefined) s.assumptions.inrPerEur = body.data.inrPerEur;
      },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
