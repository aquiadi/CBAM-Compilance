import { NextResponse } from "next/server";
import { env } from "@/config/env";
import { recordAudit } from "@/lib/audit";
import { apiWorkspaceContext, jsonError } from "@/lib/auth/context";
import { EVIDENCE_CATEGORIES, storeFile, type EvidenceCategory } from "@/lib/files";
import { errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Attaches supporting evidence: verification reports, supplier communications,
 * bills, lab analyses, carbon-price receipts. Optionally linked to a supplier,
 * a finding or specific records (a carbon-price claim counts as evidenced once
 * a document is linked to it).
 */
export async function POST(request: Request) {
  const r = await apiWorkspaceContext(request, { write: true });
  if (!r.ok) return r.response;
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError(400, "Send the file as multipart/form-data.");
  }
  const file = form.get("file");
  if (!(file instanceof File)) return jsonError(400, "No file was attached.");
  if (file.size === 0) return jsonError(400, "The file is empty.");
  if (file.size > env.CARBONPASS_MAX_UPLOAD_MB * 1024 * 1024) {
    return jsonError(413, `The file is larger than ${env.CARBONPASS_MAX_UPLOAD_MB} MB.`);
  }
  const categoryRaw = String(form.get("category") ?? "other");
  const category = (categoryRaw in EVIDENCE_CATEGORIES ? categoryRaw : "other") as EvidenceCategory;
  const label =
    String(form.get("label") ?? "")
      .trim()
      .slice(0, 200) || file.name;
  const supplierName =
    String(form.get("supplierName") ?? "")
      .trim()
      .slice(0, 200) || undefined;
  const findingCode =
    String(form.get("findingCode") ?? "")
      .trim()
      .slice(0, 20) || undefined;
  const known = new Set(
    r.ctx.workspace.state.datasets.flatMap((d) => d.activities.map((a) => a.id)),
  );
  const activityIds = String(form.get("activityIds") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((id) => id && known.has(id));

  try {
    const stored = await storeFile(r.ctx.db, {
      workspaceId: r.ctx.workspace.id,
      purpose: "evidence",
      fileName: file.name.slice(0, 200),
      contentType: file.type,
      bytes: new Uint8Array(await file.arrayBuffer()),
      label,
      category,
      links: {
        supplierName,
        findingCode,
        activityIds: activityIds.length ? activityIds : undefined,
      },
      actor: r.ctx.actor,
    });
    await recordAudit(r.ctx.db, {
      orgId: r.ctx.org.id,
      workspaceId: r.ctx.workspace.id,
      actor: r.ctx.actor,
      action: "evidence.added",
      detail: { fileId: stored.id, fileName: stored.fileName, category, sha256: stored.sha256 },
    });
    return NextResponse.json({ ok: true, fileId: stored.id });
  } catch (error) {
    return errorResponse(error);
  }
}
