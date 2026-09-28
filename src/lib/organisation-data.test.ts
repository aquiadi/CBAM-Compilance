import { unzipSync, strFromU8 } from "fflate";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type Db } from "./db";
import { UserError } from "./errors";
import { deleteOrganisation, exportOrganisation } from "./organisation-data";
import { createDemoWorkspace } from "./workspace/seed";

/** Taking an organisation's data away, and erasing it. */

let db: Db;
const org = { id: "org_od", name: "Export Steel Ltd" };

beforeAll(async () => {
  db = await createTestDb();
  await db.query("INSERT INTO organisations (id, name) VALUES ($1, $2)", [org.id, org.name]);
  await createDemoWorkspace(db, org.id, { id: null, label: "owner@example.com" });
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("organisation data", () => {
  it("exports every workspace as a verifier pack, with the activity log", async () => {
    const zip = unzipSync(await exportOrganisation(db, org, "owner@example.com"));
    const names = Object.keys(zip);
    expect(names).toContain("organisation.json");
    expect(names).toContain("activity-log.json");
    expect(names.some((n) => /^workspaces\/.+\/verifier-pack\.zip$/.test(n))).toBe(true);
    const meta = JSON.parse(strFromU8(zip["organisation.json"]!));
    expect(meta.organisation.name).toBe(org.name);
    expect(strFromU8(zip["README.txt"]!)).toMatch(/never exported/);
    // The nested pack is itself a complete verifier pack.
    const pack = unzipSync(zip[names.find((n) => n.endsWith("verifier-pack.zip"))!]!);
    expect(Object.keys(pack)).toContain("declaration.json");
  }, 60_000);

  it("deletes only when the name is typed, and then deletes everything", async () => {
    await expect(deleteOrganisation(db, org, "export steel")).rejects.toBeInstanceOf(UserError);
    await deleteOrganisation(db, org, "Export Steel Ltd ");
    for (const [table, column] of [
      ["organisations", "id"],
      ["workspaces", "org_id"],
      ["audit_events", "org_id"],
    ] as const) {
      const { rows } = await db.query<{ n: string | number }>(
        `SELECT count(*) AS n FROM ${table} WHERE ${column} = $1`,
        [org.id],
      );
      expect(Number(rows[0]?.n), table).toBe(0);
    }
    const files = await db.query<{ n: string | number }>("SELECT count(*) AS n FROM files");
    expect(Number(files.rows[0]?.n)).toBe(0);
  });
});
