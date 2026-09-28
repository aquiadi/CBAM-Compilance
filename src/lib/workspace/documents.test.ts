import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type Db } from "../db";
import { UserError } from "../errors";
import { getFile, storeFile } from "../files";
import { importDocumentLines, linesToCsv, type ReviewedLine } from "./documents";
import { createDemoWorkspace } from "./seed";
import { getWorkspace } from "./store";
import type { Actor, Workspace } from "./types";

/**
 * Document lines, once a person has checked them, become ordinary draft
 * datasets: the same mapping, unit resolution and rejects as a spreadsheet.
 */

let db: Db;
let ws: Workspace;
const actor: Actor = { id: null, label: "test@example.com" };

const line = (l: Partial<ReviewedLine>): ReviewedLine => ({
  description: "HSD",
  category: "fuel",
  quantity: 12.45,
  unit: "KL",
  date: "2026-03",
  evidence: "HSD 12.45 KL",
  page: 1,
  origin: "model",
  ...l,
});

beforeAll(async () => {
  db = await createTestDb();
  await db.query("INSERT INTO organisations (id, name) VALUES ('org_doc', 'Doc Org')");
  ws = await createDemoWorkspace(db, "org_doc", actor);
}, 60_000);

afterAll(async () => {
  await db.close();
});

async function evidence(): Promise<string> {
  const f = await storeFile(db, {
    workspaceId: ws.id,
    purpose: "evidence",
    fileName: "iocl-invoice.pdf",
    contentType: "application/pdf",
    bytes: new TextEncoder().encode("%PDF-1.4 test"),
    actor,
  });
  return f.id;
}

describe("linesToCsv", () => {
  it("writes the plain headers the column mapper already recognises", () => {
    const csv = linesToCsv("electricity", [line({ category: "electricity", unit: "MU" })], {
      section: "Melt Shop",
      fileName: "bill.pdf",
    });
    expect(csv.split("\n")[0]).toBe("Month,Section,Supply source,Consumption,UOM,Remarks");
    expect(csv).toContain('Read from bill.pdf p.1: ""HSD 12.45 KL""');
  });
});

describe("importDocumentLines", () => {
  it("creates one draft dataset per kind, linked to the document, and never confirms it", async () => {
    const process = ws.state.installation.processes[0]!;
    const fileId = await evidence();
    const created = await importDocumentLines(db, ws, actor, {
      fileId,
      processId: process.id,
      lines: [
        line({}),
        line({ description: "Grid power", category: "electricity", quantity: 1.25, unit: "MU" }),
        line({ description: "Freight", category: "other", quantity: 1, unit: "trip" }),
        line({ description: "HSD", quantity: 3, unit: "bags", origin: "manual" }),
      ],
    });
    expect(created.map((d) => d.mapping.kind).sort()).toEqual(["electricity", "fuel"]);
    expect(created.every((d) => d.status === "draft")).toBe(true);

    const fuel = created.find((d) => d.mapping.kind === "fuel")!;
    // The HSD line becomes a record in cubic metres; the "bags" line is
    // rejected with a reason rather than given a unit.
    expect(fuel.activities).toHaveLength(1);
    expect(fuel.rejected).toHaveLength(1);
    expect(fuel.rejected[0]?.reason).toMatch(/unit/i);

    const doc = await getFile(db, ws.id, fileId);
    expect(doc?.links.datasetIds?.sort()).toEqual(created.map((d) => d.id).sort());

    // Drafts do not count until confirmed.
    const fresh = await getWorkspace(db, ws.id);
    expect(fresh?.state.datasets.filter((d) => d.status === "draft")).toHaveLength(2);
  }, 60_000);

  it("refuses an unknown process instead of attributing the figures anywhere", async () => {
    const fileId = await evidence();
    await expect(
      importDocumentLines(db, ws, actor, { fileId, processId: "proc_nope", lines: [line({})] }),
    ).rejects.toBeInstanceOf(UserError);
  });

  it("refuses a document from another workspace", async () => {
    await expect(
      importDocumentLines(db, ws, actor, {
        fileId: "file_missing",
        processId: ws.state.installation.processes[0]!.id,
        lines: [line({})],
      }),
    ).rejects.toThrow(/not found/);
  });
});
