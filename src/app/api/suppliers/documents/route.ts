import { NextResponse } from "next/server";
import { readSupplierCommunication } from "@/lib/ai/extract-supplier";
import { recordAudit } from "@/lib/audit";
import { apiWorkspaceContext, jsonError } from "@/lib/auth/context";
import { takeDocument } from "@/lib/document-upload";
import { storeFile } from "@/lib/files";
import { errorResponse } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Reads a supplier's CBAM communication. The document is stored as evidence;
 * the values come back as a proposal for a person to check - nothing is
 * applied here.
 */
export async function POST(request: Request) {
  const r = await apiWorkspaceContext(request, { write: true });
  if (!r.ok) return r.response;
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError(400, "Send the document as multipart/form-data.");
  }
  const doc = await takeDocument(form);
  if (!doc.ok) return jsonError(doc.status, doc.message);
  try {
    const limit = await rateLimit(r.ctx.db, `documents:${r.ctx.user.id}`, 60, 3600);
    if (!limit.allowed)
      return jsonError(429, "Too many documents in the last hour. Try again later.");
    const { communication, outcome } = await readSupplierCommunication(doc);
    const stored = await storeFile(r.ctx.db, {
      workspaceId: r.ctx.workspace.id,
      purpose: "evidence",
      fileName: doc.fileName,
      contentType: doc.mediaType,
      bytes: doc.bytes,
      label: communication.supplierName
        ? `${communication.supplierName} - CBAM communication`
        : doc.fileName,
      category: communication.verified ? "verification_report" : "supplier_communication",
      links: communication.supplierName ? { supplierName: communication.supplierName } : {},
      actor: r.ctx.actor,
    });
    await recordAudit(r.ctx.db, {
      orgId: r.ctx.org.id,
      workspaceId: r.ctx.workspace.id,
      actor: r.ctx.actor,
      action: "supplier.document_read",
      detail: {
        fileId: stored.id,
        fileName: stored.fileName,
        sha256: stored.sha256,
        readBy: outcome.producedBy === "model" ? outcome.model : "nobody (manual entry)",
        goods: communication.goods.length,
      },
    });
    return NextResponse.json({
      ok: true,
      fileId: stored.id,
      fileName: stored.fileName,
      mediaType: doc.mediaType,
      communication,
      outcome,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
