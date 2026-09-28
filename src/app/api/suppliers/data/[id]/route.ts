import { NextResponse } from "next/server";
import { apiWorkspaceContext, jsonError } from "@/lib/auth/context";
import { errorResponse } from "@/lib/http";
import { updateWorkspace } from "@/lib/workspace/store";

export const dynamic = "force-dynamic";

/** Stops applying accepted supplier values; the precursors fall back to defaults. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await apiWorkspaceContext(request, { write: true });
  if (!r.ok) return r.response;
  const entry = r.ctx.workspace.state.supplierData.find((d) => d.id === id);
  if (!entry) return jsonError(404, "Not found.");
  try {
    await updateWorkspace(r.ctx.db, {
      workspaceId: r.ctx.workspace.id,
      actor: r.ctx.actor,
      action: "supplier.data_removed",
      detail: { supplier: entry.supplierName, cnCode: entry.cnCode },
      mutate: (s) => {
        s.supplierData = s.supplierData.filter((d) => d.id !== id);
      },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
