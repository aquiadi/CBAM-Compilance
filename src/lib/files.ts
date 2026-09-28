import type { Queryable } from "./db";
import { newId, sha256 } from "./ids";
import type { Actor } from "./workspace/types";

/**
 * Stored files: the source spreadsheets behind every dataset, evidence
 * (verification reports, supplier communications, bills, carbon-price
 * receipts) and supplier uploads.
 *
 * Kept in Postgres rather than an object store so a deployment is one database
 * and nothing else. Files are small - uploads are capped - and every one is
 * checksummed, so the verifier pack can prove which bytes a figure came from.
 */

export type FilePurpose = "source" | "evidence" | "supplier";

export interface StoredFileMeta {
  id: string;
  workspaceId: string;
  purpose: FilePurpose;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  label: string | null;
  category: string | null;
  links: FileLinks;
  uploadedByLabel: string;
  createdAt: string;
}

/** What a piece of evidence supports. */
export interface FileLinks {
  activityIds?: string[];
  supplierName?: string;
  findingCode?: string;
  datasetId?: string;
  /** Datasets read from this document (bills, receipts, photos). */
  datasetIds?: string[];
}

export const EVIDENCE_CATEGORIES = {
  verification_report: "Verification report (accredited verifier)",
  supplier_communication: "Supplier CBAM communication",
  electricity_bill: "Electricity bill / DISCOM statement",
  purchase_receipt: "Purchase receipt, delivery note or weighbridge slip",
  fuel_invoice: "Fuel invoice or lab analysis",
  carbon_price: "Carbon price payment evidence",
  monitoring_plan: "Monitoring plan / methodology document",
  other: "Other",
} as const;

export type EvidenceCategory = keyof typeof EVIDENCE_CATEGORIES;

interface FileRow {
  id: string;
  workspace_id: string;
  purpose: FilePurpose;
  file_name: string;
  content_type: string;
  size_bytes: number;
  sha256: string;
  label: string | null;
  category: string | null;
  links: FileLinks | string;
  uploaded_by_label: string;
  created_at: Date | string;
}

function toMeta(r: FileRow): StoredFileMeta {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    purpose: r.purpose,
    fileName: r.file_name,
    contentType: r.content_type,
    sizeBytes: Number(r.size_bytes),
    sha256: r.sha256,
    label: r.label,
    category: r.category,
    links: typeof r.links === "string" ? JSON.parse(r.links) : (r.links ?? {}),
    uploadedByLabel: r.uploaded_by_label,
    createdAt: new Date(r.created_at).toISOString(),
  };
}

const META_COLUMNS =
  "id, workspace_id, purpose, file_name, content_type, size_bytes, sha256, label, category, links, uploaded_by_label, created_at";

export async function storeFile(
  q: Queryable,
  file: {
    workspaceId: string;
    purpose: FilePurpose;
    fileName: string;
    contentType: string;
    bytes: Uint8Array;
    label?: string;
    category?: string;
    links?: FileLinks;
    actor: Actor;
  },
): Promise<StoredFileMeta> {
  const id = newId("file");
  const { rows } = await q.query<FileRow>(
    `INSERT INTO files (id, workspace_id, purpose, file_name, content_type, size_bytes, sha256,
                        content, label, category, links, uploaded_by, uploaded_by_label)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING ${META_COLUMNS}`,
    [
      id,
      file.workspaceId,
      file.purpose,
      file.fileName,
      file.contentType || "application/octet-stream",
      file.bytes.byteLength,
      sha256(file.bytes),
      Buffer.from(file.bytes),
      file.label ?? null,
      file.category ?? null,
      JSON.stringify(file.links ?? {}),
      file.actor.id,
      file.actor.label,
    ],
  );
  const row = rows[0];
  if (!row) throw new Error("File was not stored");
  return toMeta(row);
}

export async function listFiles(
  q: Queryable,
  workspaceId: string,
  purpose?: FilePurpose,
): Promise<StoredFileMeta[]> {
  const { rows } = await q.query<FileRow>(
    purpose
      ? `SELECT ${META_COLUMNS} FROM files WHERE workspace_id = $1 AND purpose = $2 ORDER BY created_at DESC`
      : `SELECT ${META_COLUMNS} FROM files WHERE workspace_id = $1 ORDER BY created_at DESC`,
    purpose ? [workspaceId, purpose] : [workspaceId],
  );
  return rows.map(toMeta);
}

export async function getFile(
  q: Queryable,
  workspaceId: string,
  id: string,
): Promise<(StoredFileMeta & { bytes: Uint8Array }) | null> {
  const { rows } = await q.query<FileRow & { content: Uint8Array }>(
    `SELECT ${META_COLUMNS}, content FROM files WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, id],
  );
  const row = rows[0];
  if (!row) return null;
  return { ...toMeta(row), bytes: new Uint8Array(row.content) };
}

/** Merges links into a stored file's links, e.g. the datasets read from a document. */
export async function addFileLinks(
  q: Queryable,
  workspaceId: string,
  id: string,
  links: FileLinks,
): Promise<void> {
  await q.query("UPDATE files SET links = links || $3::jsonb WHERE workspace_id = $1 AND id = $2", [
    workspaceId,
    id,
    JSON.stringify(links),
  ]);
}

export async function deleteFile(q: Queryable, workspaceId: string, id: string): Promise<boolean> {
  const { rows } = await q.query<{ id: string }>(
    "DELETE FROM files WHERE workspace_id = $1 AND id = $2 RETURNING id",
    [workspaceId, id],
  );
  return rows.length > 0;
}
