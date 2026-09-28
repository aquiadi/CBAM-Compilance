import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type Db } from "./db";
import { UserError } from "./errors";
import { getFile, storeFile } from "./files";
import { acceptSupplierDocument } from "./supplier-documents";
import { declarationFor } from "./workspace/declaration";
import { createDemoWorkspace } from "./workspace/seed";
import { getWorkspace } from "./workspace/store";
import type { Actor, Workspace } from "./workspace/types";

/** Supplier values from a supplier's document, applied after a person has checked them. */

let db: Db;
let ws: Workspace;
const actor: Actor = { id: null, label: "test@example.com" };

beforeAll(async () => {
  db = await createTestDb();
  await db.query("INSERT INTO organisations (id, name) VALUES ('org_sd', 'SD Org')");
  ws = await createDemoWorkspace(db, "org_sd", actor);
}, 60_000);

afterAll(async () => {
  await db.close();
});

async function document(): Promise<string> {
  const f = await storeFile(db, {
    workspaceId: ws.id,
    purpose: "evidence",
    fileName: "maa-ambey-communication.pdf",
    contentType: "application/pdf",
    bytes: new TextEncoder().encode("%PDF-1.4 test"),
    actor,
  });
  return f.id;
}

describe("acceptSupplierDocument", () => {
  it("applies the values to that supplier's precursors and files the document as evidence", async () => {
    const before = declarationFor(ws.state);
    expect(before.findings.some((f) => f.code === "CP-007")).toBe(true);

    const fileId = await document();
    const applied = await acceptSupplierDocument(db, ws, actor, {
      fileId,
      supplierName: "Maa Ambey Ispat",
      verified: true,
      verifierName: "Example Verification GmbH",
      goods: [
        { cnCode: "7203 10 00", seeDirect: 2.6, seeIndirect: 0.08, sefa: 0.29, origin: "model" },
      ],
    });
    expect(applied).toBe(1);

    const fresh = (await getWorkspace(db, ws.id))!;
    const entry = fresh.state.supplierData.find((d) => d.supplierName === "Maa Ambey Ispat");
    expect(entry).toMatchObject({ cnCode: "72031000", source: "document", evidenceFileId: fileId });
    // The default-value finding for that supplier's DRI is gone.
    expect(declarationFor(fresh.state).findings.some((f) => f.code === "CP-007")).toBe(false);

    const doc = await getFile(db, ws.id, fileId);
    expect(doc?.category).toBe("verification_report");
    expect(doc?.links.supplierName).toBe("Maa Ambey Ispat");
  }, 60_000);

  it("refuses a CN code that is not a CBAM good, and verification without a verifier", async () => {
    const fileId = await document();
    const base = { fileId, supplierName: "X", verified: false };
    await expect(
      acceptSupplierDocument(db, ws, actor, {
        ...base,
        goods: [{ cnCode: "84559000", seeDirect: 1, seeIndirect: 0, origin: "manual" }],
      }),
    ).rejects.toBeInstanceOf(UserError);
    await expect(
      acceptSupplierDocument(db, ws, actor, {
        ...base,
        verified: true,
        goods: [{ cnCode: "72031000", seeDirect: 1, seeIndirect: 0, origin: "manual" }],
      }),
    ).rejects.toThrow(/verifier/);
  });
});
