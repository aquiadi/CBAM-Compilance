import Papa from "papaparse";
import * as z from "zod/v4";
import { CATEGORY_KIND, LINE_CATEGORIES } from "../ai/extract";
import { recordAudit } from "../audit";
import type { Db } from "../db";
import { UserError } from "../errors";
import { addFileLinks, getFile } from "../files";
import type { DatasetKind } from "../ingest/schema";
import { addDataset } from "./datasets";
import type { Actor, StoredDataset, Workspace } from "./types";

/**
 * From reviewed document lines to draft datasets.
 *
 * A person has checked every line against the document (or typed it in). The
 * lines are written as an ordinary CSV per dataset kind and uploaded through
 * `addDataset`, so they get the same column mapping, unit resolution, rejects
 * with reasons, data-quality rules and draft -> confirmed step as a file from
 * SAP. The CSV is the dataset's source; the original document stays attached
 * as evidence and links to the datasets read from it, so a verifier can go
 * from any figure to the page it was read from.
 */

export const ReviewedLineSchema = z.object({
  description: z.string().trim().min(1).max(200),
  category: z.enum(LINE_CATEGORIES),
  quantity: z.number().positive().finite(),
  unit: z.string().trim().min(1).max(40),
  date: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}(-\d{2})?$/, "use YYYY-MM or YYYY-MM-DD"),
  cnCode: z.string().trim().max(20).nullish(),
  supplySource: z.string().trim().max(80).nullish(),
  evidence: z.string().trim().max(300).nullish(),
  page: z.number().int().positive().nullish(),
  origin: z.enum(["model", "manual"]),
});

export const DocumentImportSchema = z.object({
  fileId: z.string().min(1).max(60),
  processId: z.string().min(1).max(60),
  supplier: z.string().trim().max(200).nullish(),
  lines: z.array(ReviewedLineSchema).min(1).max(200),
});

export type ReviewedLine = z.infer<typeof ReviewedLineSchema>;
export type DocumentImport = z.infer<typeof DocumentImportSchema>;

const KIND_LABEL: Record<DatasetKind, string> = {
  fuel: "fuel",
  electricity: "electricity",
  process_material: "process materials",
  precursor: "precursors",
  production: "production",
};

function remark(line: ReviewedLine, fileName: string): string {
  if (line.origin === "manual") return `Entered by hand from ${fileName}`;
  const where = line.page ? `${fileName} p.${line.page}` : fileName;
  return line.evidence ? `Read from ${where}: "${line.evidence}"` : `Read from ${where}`;
}

/**
 * The CSV for one dataset kind. Headers are the plain names the column mapper
 * already recognises, so no special path is needed downstream.
 */
export function linesToCsv(
  kind: DatasetKind,
  lines: ReviewedLine[],
  ctx: { section: string; fileName: string; supplier?: string | null },
): string {
  const rows: (string | number)[][] = [];
  if (kind === "electricity") {
    rows.push(["Month", "Section", "Supply source", "Consumption", "UOM", "Remarks"]);
    for (const l of lines) {
      rows.push([
        l.date,
        ctx.section,
        l.supplySource ?? "",
        l.quantity,
        l.unit,
        remark(l, ctx.fileName),
      ]);
    }
  } else if (kind === "precursor") {
    rows.push([
      "Month",
      "Section",
      "Material",
      "CN code",
      "Qty received",
      "UOM",
      "Supplier",
      "Remarks",
    ]);
    for (const l of lines) {
      rows.push([
        l.date,
        ctx.section,
        l.description,
        l.cnCode ?? "",
        l.quantity,
        l.unit,
        ctx.supplier ?? "",
        remark(l, ctx.fileName),
      ]);
    }
  } else {
    rows.push(["Month", "Section", "Material", "Quantity", "UOM", "Remarks"]);
    for (const l of lines) {
      rows.push([l.date, ctx.section, l.description, l.quantity, l.unit, remark(l, ctx.fileName)]);
    }
  }
  return Papa.unparse(rows, { newline: "\n" });
}

export async function importDocumentLines(
  db: Db,
  ws: Workspace,
  actor: Actor,
  input: DocumentImport,
): Promise<StoredDataset[]> {
  const file = await getFile(db, ws.id, input.fileId);
  if (!file || file.purpose !== "evidence") {
    throw new UserError("The document was not found. Upload it again.", 404);
  }
  const process = ws.state.installation.processes.find((p) => p.id === input.processId);
  if (!process) {
    throw new UserError("Choose which part of the plant these figures belong to.", 400);
  }

  const byKind = new Map<DatasetKind, ReviewedLine[]>();
  for (const line of input.lines) {
    const kind = CATEGORY_KIND[line.category];
    if (!kind) continue;
    byKind.set(kind, [...(byKind.get(kind) ?? []), line]);
  }
  if (byKind.size === 0) {
    throw new UserError(
      "None of the lines is fuel, electricity, a process material or a precursor, so there is nothing to import.",
      400,
    );
  }

  const base = file.fileName.replace(/\.[^.]+$/, "");
  const created: StoredDataset[] = [];
  for (const [kind, lines] of byKind) {
    const csv = linesToCsv(kind, lines, {
      section: process.name,
      fileName: file.fileName,
      supplier: input.supplier,
    });
    const dataset = await addDataset(db, ws, {
      fileName: `${base} - ${KIND_LABEL[kind]} (from document).csv`,
      contentType: "text/csv",
      bytes: new TextEncoder().encode(csv),
      actor,
      kind,
      status: "draft",
    });
    created.push(dataset);
  }

  await addFileLinks(db, ws.id, file.id, { datasetIds: created.map((d) => d.id) });
  await recordAudit(db, {
    orgId: ws.orgId,
    workspaceId: ws.id,
    actor,
    action: "document.imported",
    detail: {
      fileId: file.id,
      fileName: file.fileName,
      sha256: file.sha256,
      datasets: created.map((d) => d.id),
      lines: input.lines.length,
      readByModel: input.lines.filter((l) => l.origin === "model").length,
      enteredByHand: input.lines.filter((l) => l.origin === "manual").length,
    },
  });
  return created;
}
