import { NextResponse } from "next/server";
import { env } from "@/config/env";
import { jsonError, sameOrigin } from "@/lib/auth/context";
import { getDb } from "@/lib/db";
import { errorResponse } from "@/lib/http";
import { clientAddress, rateLimit } from "@/lib/rate-limit";
import { findRequestByToken, submitSupplierData, validateSubmission } from "@/lib/suppliers";

export const dynamic = "force-dynamic";

const ALLOWED_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
  "image/png",
  "image/jpeg",
  "",
]);

/**
 * The supplier's submission. Public - the token in the link is the
 * credential - rate limited, and never applied until the operator accepts it.
 */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!sameOrigin(request)) return jsonError(403, "Cross-origin request refused.");
  try {
    const db = await getDb();
    const limit = await rateLimit(db, `supplier:${clientAddress(request)}`, 20, 3600);
    if (!limit.allowed) return jsonError(429, "Too many submissions. Try again later.");

    const req = await findRequestByToken(db, token);
    if (!req) return jsonError(404, "This link is not valid.");
    if (new Date(req.expiresAt).getTime() < Date.now())
      return jsonError(410, "This link has expired.");
    if (req.status !== "open" && req.status !== "submitted") {
      return jsonError(409, "This request is closed.");
    }

    const form = await request.formData();
    const fields: Record<string, string> = {};
    for (const [k, v] of form.entries()) if (typeof v === "string") fields[k] = v;
    const submission = validateSubmission(fields);
    if (typeof submission === "string") return jsonError(400, submission);

    const file = form.get("file");
    let upload: { fileName: string; contentType: string; bytes: Uint8Array } | null = null;
    if (file instanceof File && file.size > 0) {
      if (file.size > env.CARBONPASS_MAX_UPLOAD_MB * 1024 * 1024) {
        return jsonError(413, `The file is larger than ${env.CARBONPASS_MAX_UPLOAD_MB} MB.`);
      }
      if (!ALLOWED_TYPES.has(file.type)) {
        return jsonError(415, "Attach a PDF, spreadsheet or image.");
      }
      upload = {
        fileName: file.name.slice(0, 200),
        contentType: file.type,
        bytes: new Uint8Array(await file.arrayBuffer()),
      };
    }
    if (submission.verified && !upload && !req.fileId) {
      return jsonError(400, "Attach the verification report for verified values.");
    }
    await submitSupplierData(db, req, submission, upload);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
