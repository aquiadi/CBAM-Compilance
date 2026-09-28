import { NextResponse } from "next/server";
import { env } from "@/config/env";
import {
  documentMediaType,
  extractDocument,
  MAX_IMAGE_BYTES,
  DOCUMENT_MEDIA_TYPES,
} from "@/lib/ai/extract";
import { recordAudit } from "@/lib/audit";
import { apiWorkspaceContext, jsonError } from "@/lib/auth/context";
import { storeFile, type EvidenceCategory } from "@/lib/files";
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
  const file = form.get("file");
  if (!(file instanceof File)) return jsonError(400, "No file was attached.");
  if (file.size === 0) return jsonError(400, "The file is empty.");
  if (file.size > env.CARBONPASS_MAX_UPLOAD_MB * 1024 * 1024) {
    return jsonError(413, `The file is larger than ${env.CARBONPASS_MAX_UPLOAD_MB} MB.`);
  }
  const mediaType = documentMediaType(file.name, file.type);
  if (!mediaType) {
    const heic = /\.(heic|heif)$/i.test(file.name) || /heic|heif/i.test(file.type);
    return jsonError(
      415,
      heic
        ? "iPhone HEIC photos are not supported. Set the camera to “Most Compatible” (JPEG), or share the photo as JPEG."
        : "Upload a PDF, a photo (JPEG, PNG, WebP) or a text file. Spreadsheets go through “Upload a file” above.",
    );
  }
  if (DOCUMENT_MEDIA_TYPES[mediaType] === "image" && file.size > MAX_IMAGE_BYTES) {
    return jsonError(413, "Photos can be at most 5 MB. Take it at a lower resolution or crop it.");
  }

  try {
    const limit = await rateLimit(r.ctx.db, `documents:${r.ctx.user.id}`, 60, 3600);
    if (!limit.allowed)
      return jsonError(429, "Too many documents in the last hour. Try again later.");

    const bytes = new Uint8Array(await file.arrayBuffer());
    const { extraction, outcome } = await extractDocument({
      bytes,
      mediaType,
      fileName: file.name,
    });
    const stored = await storeFile(r.ctx.db, {
      workspaceId: r.ctx.workspace.id,
      purpose: "evidence",
      fileName: file.name.slice(0, 200),
      contentType: mediaType,
      bytes,
      label:
        [extraction.issuer, extraction.documentNumber].filter(Boolean).join(" · ") || file.name,
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
      mediaType,
      extraction,
      outcome,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
