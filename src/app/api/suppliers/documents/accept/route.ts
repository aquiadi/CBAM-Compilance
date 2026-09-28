import { NextResponse } from "next/server";
import { apiWorkspaceContext } from "@/lib/auth/context";
import { errorResponse, parseJson } from "@/lib/http";
import { acceptSupplierDocument, SupplierDocumentAcceptSchema } from "@/lib/supplier-documents";

export const dynamic = "force-dynamic";

/** Applies supplier values that a person has checked against the supplier's document. */
export async function POST(request: Request) {
  const r = await apiWorkspaceContext(request, { write: true });
  if (!r.ok) return r.response;
  const body = await parseJson(request, SupplierDocumentAcceptSchema);
  if (!body.ok) return body.response;
  try {
    const applied = await acceptSupplierDocument(r.ctx.db, r.ctx.workspace, r.ctx.actor, body.data);
    return NextResponse.json({ ok: true, applied });
  } catch (error) {
    return errorResponse(error);
  }
}
