import { apiWorkspaceContext, jsonError } from "@/lib/auth/context";
import { deleteFile, getFile } from "@/lib/files";
import { recordAudit } from "@/lib/audit";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Downloads a stored file of the current workspace: a source file or evidence. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await apiWorkspaceContext(request);
  if (!r.ok) return r.response;
  const file = await getFile(r.ctx.db, r.ctx.workspace.id, id);
  if (!file) return jsonError(404, "File not found.");
  const name = file.fileName.replace(/["\r\n]/g, "_");
  return new Response(Buffer.from(file.bytes), {
    headers: {
      // Served as a download, never rendered inline, so an uploaded HTML or
      // SVG file cannot run script on this origin.
      "content-type": "application/octet-stream",
      "content-disposition": `attachment; filename="${name}"`,
      "x-content-type-options": "nosniff",
      "x-checksum-sha256": file.sha256,
    },
  });
}

/** Deletes evidence. Source files are kept: they are part of the audit trail. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await apiWorkspaceContext(request, { write: true });
  if (!r.ok) return r.response;
  const file = await getFile(r.ctx.db, r.ctx.workspace.id, id);
  if (!file) return jsonError(404, "File not found.");
  if (file.purpose === "source") {
    return jsonError(400, "Source files are kept for the audit trail. Remove the dataset instead.");
  }
  await deleteFile(r.ctx.db, r.ctx.workspace.id, id);
  await recordAudit(r.ctx.db, {
    orgId: r.ctx.org.id,
    workspaceId: r.ctx.workspace.id,
    actor: r.ctx.actor,
    action: "evidence.deleted",
    detail: { fileId: id, fileName: file.fileName, sha256: file.sha256 },
  });
  return NextResponse.json({ ok: true });
}
