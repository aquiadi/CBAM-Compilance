import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type Db } from "../db";
import { listAudit } from "../audit";
import { getFile, listFiles } from "../files";
import { DEMO_INSTALLATION } from "../demo";
import { addDataset, setDatasetStatus, updateDatasetMapping, UploadError } from "./datasets";
import { declarationFor } from "./declaration";
import { createDemoWorkspace, createBlankWorkspace, calendarYear } from "./seed";
import { getWorkspace, updateWorkspace } from "./store";
import type { Actor } from "./types";

/**
 * The workspace layer against a real Postgres - the embedded PGlite build, so
 * the same SQL that runs on Neon or Railway runs here with nothing installed.
 */

let db: Db;
const actor: Actor = { id: null, label: "test@example.com" };

beforeAll(async () => {
  db = await createTestDb();
  await db.query("INSERT INTO organisations (id, name) VALUES ('org_test', 'Test Org')");
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("demo workspace", () => {
  it("seeds the demo plant, stores its source files and computes a declaration", async () => {
    const ws = await createDemoWorkspace(db, "org_test", actor);
    const fresh = await getWorkspace(db, ws.id);
    expect(fresh?.state.datasets).toHaveLength(5);
    expect(fresh?.state.datasets.every((d) => d.status === "confirmed")).toBe(true);

    const sources = await listFiles(db, ws.id, "source");
    expect(sources).toHaveLength(5);
    expect(sources.every((f) => /^[0-9a-f]{64}$/.test(f.sha256))).toBe(true);

    const d = declarationFor(fresh!.state);
    expect(d.lines.map((l) => l.cnCode).sort()).toEqual(["72031000", "72071114", "72142000"]);
    // The seeded kg row is caught and ferro-silicon is recognised as out of scope.
    const codes = d.findings.map((f) => f.code);
    expect(codes).toContain("CP-005");
    expect(codes).toContain("CP-020");
    expect(codes).not.toContain("CP-013");

    const audit = await listAudit(db, { orgId: "org_test", workspaceId: ws.id });
    expect(audit.some((e) => e.action === "workspace.created")).toBe(true);
    expect(audit.filter((e) => e.action === "dataset.uploaded")).toHaveLength(5);
  }, 60_000);

  it("gives the same record ids when the same file is imported again", async () => {
    const a = await createDemoWorkspace(db, "org_test", actor);
    const b = await createDemoWorkspace(db, "org_test", actor);
    const idsA = a.state.datasets.flatMap((d) => d.activities.map((x) => x.id));
    const idsB = b.state.datasets.flatMap((d) => d.activities.map((x) => x.id));
    // Dataset ids differ per upload, so record ids differ across workspaces...
    expect(idsA).not.toEqual(idsB);
    // ...but within a dataset they are a pure function of dataset, row and kind.
    const ds = a.state.datasets[0]!;
    const again = await updateDatasetMapping(db, a, ds.id, {}, actor);
    expect(again.activities.map((x) => x.id)).toEqual(ds.activities.map((x) => x.id));
  }, 60_000);
});

describe("concurrent edits", () => {
  it("re-applies a change on top of a concurrent write instead of overwriting it", async () => {
    const ws = await createBlankWorkspace(db, {
      orgId: "org_test",
      name: "Concurrency",
      installation: { ...DEMO_INSTALLATION },
      period: calendarYear(2026),
      actor,
    });
    await Promise.all([
      updateWorkspace(db, {
        workspaceId: ws.id,
        actor,
        action: "test.a",
        mutate: (s) => {
          s.acknowledged.push("a");
        },
      }),
      updateWorkspace(db, {
        workspaceId: ws.id,
        actor,
        action: "test.b",
        mutate: (s) => {
          s.acknowledged.push("b");
        },
      }),
    ]);
    const fresh = await getWorkspace(db, ws.id);
    expect(fresh?.state.acknowledged.sort()).toEqual(["a", "b"]);
    expect(fresh?.version).toBe(3);
  });
});

describe("uploads and mapping review", () => {
  async function blank() {
    return createBlankWorkspace(db, {
      orgId: "org_test",
      name: "Uploads",
      installation: { ...DEMO_INSTALLATION },
      period: calendarYear(2026),
      actor,
    });
  }

  it("reads an Excel workbook with title rows above the header", async () => {
    const ws = await blank();
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet("Power");
    sheet.addRow(["Raigarh Works - power register"]);
    sheet.addRow(["Generated 2026-09-01"]);
    sheet.addRow([]);
    sheet.addRow(["Billing Month", "Section", "Supply Source", "Units Drawn (MU)"]);
    sheet.addRow(["Jan-26", "Melt Shop (IF/EAF)", "CSPDCL Grid (HT)", 19.96]);
    sheet.addRow(["Feb-26", "Melt Shop (IF/EAF)", "CSPDCL Grid (HT)", 20.45]);
    const bytes = new Uint8Array(await wb.xlsx.writeBuffer());

    const ds = await addDataset(db, ws, {
      fileName: "power.xlsx",
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      bytes,
      actor,
    });
    expect(ds.headerRow).toBe(4);
    expect(ds.sheetName).toBe("Power");
    expect(ds.status).toBe("draft");
    expect(ds.mapping.kind).toBe("electricity");
    // MU read from the header: 19.96 MU = 19,960 MWh.
    const first = ds.activities[0];
    expect(first?.kind === "electricity" && first.quantityMWh).toBeCloseTo(19960, 6);

    // A draft does not count until it is confirmed.
    let fresh = await getWorkspace(db, ws.id);
    expect(declarationFor(fresh!.state).totals.indirectT).toBe(0);
    await setDatasetStatus(db, fresh!, ds.id, "confirmed", actor);
    fresh = await getWorkspace(db, ws.id);
    expect(declarationFor(fresh!.state).totals.indirectT).toBeGreaterThan(0);

    const stored = await getFile(db, ws.id, ds.fileId!);
    expect(stored?.bytes.byteLength).toBe(bytes.byteLength);
  }, 60_000);

  it("lets the operator correct a mapping, and validates the correction", async () => {
    const ws = await blank();
    const csv = [
      "Month,Plant,Item,Qty,Unit",
      "Jan-26,Melt Shop,GRAPHITE ELECTRODE,60,MT",
      "Feb-26,Melt Shop,GRAPHITE ELECTRODE,62,MT",
    ].join("\n");
    const ds = await addDataset(db, ws, {
      fileName: "materials.csv",
      contentType: "text/csv",
      bytes: new TextEncoder().encode(csv),
      actor,
    });
    const fresh = (await getWorkspace(db, ws.id))!;

    await expect(
      updateDatasetMapping(
        db,
        fresh,
        ds.id,
        {
          values: [{ target: "factor", sourceValue: "GRAPHITE ELECTRODE", resolvedId: "made_up" }],
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(UploadError);

    const edited = await updateDatasetMapping(
      db,
      fresh,
      ds.id,
      {
        kind: "process_material",
        values: [
          { target: "factor", sourceValue: "GRAPHITE ELECTRODE", resolvedId: "graphite_electrode" },
        ],
      },
      actor,
    );
    expect(edited.activities).toHaveLength(2);
    expect(edited.activities.every((a) => a.kind === "process_material")).toBe(true);
    const audit = await listAudit(db, { orgId: "org_test", workspaceId: ws.id });
    expect(audit.some((e) => e.action === "dataset.mapping_edited")).toBe(true);
  }, 60_000);

  it("refuses files it cannot read rather than guessing", async () => {
    const ws = await blank();
    await expect(
      addDataset(db, ws, {
        fileName: "bill.pdf",
        contentType: "application/pdf",
        bytes: new Uint8Array([1, 2, 3]),
        actor,
      }),
    ).rejects.toThrow(/Unsupported file type/);
  });
});
