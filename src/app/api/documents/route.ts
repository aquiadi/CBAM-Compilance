import { NextResponse } from "next/server";
import { documentMediaType, extractDocument } from "@/lib/ai/extract";
import { recordAudit } from "@/lib/audit";
import { apiWorkspaceContext, jsonError } from "@/lib/auth/context";
import { takeDocument } from "@/lib/document-upload";
import { getFile, storeFile, type EvidenceCategory } from "@/lib/files";
import { errorResponse } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
// Reading a long PDF with the model can take a minute (Vercel's default is lower).
export const maxDuration = 120;

const CATEGORY_FOR_TYPE: Record<string, EvidenceCategory> = {
  fuel_invoice: "fuel_invoice",
  electricity_bill: "electricity_bill",
  material_receipt: "purchase_receipt",
  weighbridge_slip: "purchase_receipt",
  delivery_note: "purchase_receipt",
  supplier_emissions_communication: "supplier_communication",
};

/**
 * Reads a bill, receipt or photo. The document is stored as evidence first, so
 * it is kept whatever happens next; the model's reading comes back as proposed
 * lines for a person to check. Nothing is added to a dataset here.
 *
 * Sending `fileId` instead of a file reads a document already stored - to try
 * again after a rate limit, without keeping a second copy.
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
  const fileId = form.get("fileId");
  if (typeof fileId === "string" && fileId) return readAgain(r.ctx, fileId);
  const doc = await takeDocument(form);
  if (!doc.ok) return jsonError(doc.status, doc.message);

  try {
    const limit = await rateLimit(r.ctx.db, `documents:${r.ctx.user.id}`, 60, 3600);
    if (!limit.allowed) {
      return jsonError(429, "Too many documents in the last hour. Try again later.");
    }
    const { extraction, outcome } = await extractDocument(doc);
    const stored = await storeFile(r.ctx.db, {
      workspaceId: r.ctx.workspace.id,
      purpose: "evidence",
      fileName: doc.fileName,
      contentType: doc.mediaType,
      bytes: doc.bytes,
      label:
        [extraction.issuer, extraction.documentNumber].filter(Boolean).join(" · ") || doc.fileName,
      category: CATEGORY_FOR_TYPE[extraction.documentType] ?? "other",
      actor: r.ctx.actor,
    });
    await recordAudit(r.ctx.db, {
      orgId: r.ctx.org.id,
      workspaceId: r.ctx.workspace.id,
      actor: r.ctx.actor,
      action: "document.read",
      detail: {
        fileId: stored.id,
        fileName: stored.fileName,
        sha256: stored.sha256,
        readBy: outcome.producedBy === "model" ? outcome.model : "nobody (manual entry)",
        lines: extraction.lines.length,
        notFoundInText: extraction.lines.filter((l) => l.check === "not_found").length,
      },
    });
    return NextResponse.json({
      ok: true,
      fileId: stored.id,
      fileName: stored.fileName,
      mediaType: doc.mediaType,
      extraction,
      outcome,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

type Ctx = Extract<Awaited<ReturnType<typeof apiWorkspaceContext>>, { ok: true }>["ctx"];

async function readAgain(ctx: Ctx, fileId: string) {
  try {
    const limit = await rateLimit(ctx.db, `documents:${ctx.user.id}`, 60, 3600);
    if (!limit.allowed) {
      return jsonError(429, "Too many documents in the last hour. Try again later.");
    }
    const stored = await getFile(ctx.db, ctx.workspace.id, fileId);
    const mediaType = stored && documentMediaType(stored.fileName, stored.contentType);
    if (!stored || stored.purpose !== "evidence" || !mediaType) {
      return jsonError(404, "Document not found.");
    }
    const { extraction, outcome } = await extractDocument({
      bytes: stored.bytes,
      mediaType,
      fileName: stored.fileName,
    });
    if (outcome.producedBy === "model") {
      const label = [extraction.issuer, extraction.documentNumber].filter(Boolean).join(" · ");
      await ctx.db.query(
        "UPDATE files SET category = $1, label = $2 WHERE workspace_id = $3 AND id = $4",
        [
          CATEGORY_FOR_TYPE[extraction.documentType] ?? "other",
          label || stored.fileName,
          ctx.workspace.id,
          stored.id,
        ],
      );
    }
    await recordAudit(ctx.db, {
      orgId: ctx.org.id,
      workspaceId: ctx.workspace.id,
      actor: ctx.actor,
      action: "document.read",
      detail: {
        fileId: stored.id,
        fileName: stored.fileName,
        sha256: stored.sha256,
        readBy: outcome.producedBy === "model" ? outcome.model : "nobody (manual entry)",
        lines: extraction.lines.length,
        notFoundInText: extraction.lines.filter((l) => l.check === "not_found").length,
        again: true,
      },
    });
    return NextResponse.json({
      ok: true,
      fileId: stored.id,
      fileName: stored.fileName,
      mediaType,
      extraction,
      outcome,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
