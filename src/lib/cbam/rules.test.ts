import { describe, expect, it } from "vitest";
import { buildDeclaration } from "./declaration";
import type { ActivityRecord, Installation, Lineage, ReportingPeriod } from "./types";

const lineage = (row: number, fileName = "plant.csv"): Lineage => ({
  datasetId: "d",
  fileName,
  row,
  raw: {},
});

const base = {
  periodStart: "2026-01-01",
  periodEnd: "2026-01-31",
  provenance: "calculated" as const,
  tier: 2 as const,
};

const installation: Installation = {
  id: "i1",
  name: "Works",
  operator: "Op",
  street: "s",
  city: "Raipur",
  state: "CG",
  postcode: "492001",
  country: "IN",
  contactName: "n",
  contactEmail: "e@x.com",
  processes: [{ id: "p1", name: "EAF", category: "crude_steel", route: "EAF (scrap)" }],
};

const period: ReportingPeriod = {
  year: 2026,
  start: "2026-01-01",
  end: "2026-01-31",
  regime: "definitive",
};

function codes(activities: ActivityRecord[]): string[] {
  return buildDeclaration(installation, period, activities).findings.map((f) => f.code);
}

describe("rules engine", () => {
  it("CP-001 blocks when emissions exist with no production", () => {
    const found = codes([
      { ...base, id: "f1", kind: "fuel", processId: "p1", factorId: "coal_bituminous_in", quantity: 100, unit: "t", lineage: lineage(1) },
    ]);
    expect(found).toContain("CP-001");
  });

  it("CP-003 flags an intensity below the plausible band as a blocker", () => {
    // A trickle of fuel against a huge tonnage: intensity far below any real plant.
    const findings = buildDeclaration(installation, period, [
      { ...base, id: "f1", kind: "fuel", processId: "p1", factorId: "coal_bituminous_in", quantity: 1, unit: "t", lineage: lineage(1) },
      { ...base, id: "pr1", kind: "production", processId: "p1", cnCode: "72071100", quantityT: 100000, lineage: lineage(2) },
    ]).findings;
    const cp003 = findings.find((f) => f.code === "CP-003");
    expect(cp003).toBeDefined();
    expect(cp003!.severity).toBe("blocker");
  });

  it("CP-005 catches an order-of-magnitude outlier in a series", () => {
    const rows: ActivityRecord[] = [1, 2, 3, 4, 5].map((i) => ({
      ...base,
      id: `f${i}`,
      kind: "fuel" as const,
      processId: "p1",
      factorId: "coal_bituminous_in",
      quantity: i === 5 ? 100000 : 1000, // one row read in kg instead of tonnes
      unit: "t" as const,
      lineage: lineage(i),
    }));
    rows.push({ ...base, id: "pr1", kind: "production", processId: "p1", cnCode: "72071100", quantityT: 50000, lineage: lineage(9) });
    const findings = buildDeclaration(installation, period, rows).findings;
    const outlier = findings.find((f) => f.code === "CP-005");
    expect(outlier).toBeDefined();
    expect(outlier!.activityIds).toContain("f5");
  });

  it("CP-006 catches duplicated rows", () => {
    const dup: ActivityRecord[] = [
      { ...base, id: "f1", kind: "fuel", processId: "p1", factorId: "coal_bituminous_in", quantity: 500, unit: "t", lineage: lineage(4) },
      { ...base, id: "f2", kind: "fuel", processId: "p1", factorId: "coal_bituminous_in", quantity: 500, unit: "t", lineage: lineage(5) },
      { ...base, id: "pr1", kind: "production", processId: "p1", cnCode: "72071100", quantityT: 5000, lineage: lineage(6) },
    ];
    expect(codes(dup)).toContain("CP-006");
  });

  it("CP-007 warns when a precursor uses a default value", () => {
    const withDefault: ActivityRecord[] = [
      { ...base, id: "f1", kind: "fuel", processId: "p1", factorId: "coal_bituminous_in", quantity: 500, unit: "t", lineage: lineage(1) },
      { ...base, id: "pc1", kind: "precursor", processId: "p1", cnCode: "72031000", quantityT: 1000, seeDirect: 1.4, seeIndirect: 0.1, seeSource: "default", lineage: lineage(2) },
      { ...base, id: "pr1", kind: "production", processId: "p1", cnCode: "72071100", quantityT: 5000, lineage: lineage(3) },
    ];
    expect(codes(withDefault)).toContain("CP-007");
  });

  it("CP-008 blocks a carbon price claim with no evidence", () => {
    const claim: ActivityRecord[] = [
      { ...base, id: "f1", kind: "fuel", processId: "p1", factorId: "coal_bituminous_in", quantity: 5000, unit: "t", lineage: lineage(1) },
      { ...base, id: "pr1", kind: "production", processId: "p1", cnCode: "72071100", quantityT: 5000, lineage: lineage(2) },
      { ...base, id: "cp1", kind: "carbon_price", processId: "p1", scheme: "Coal cess", amount: 100000, currency: "INR", tonnesCovered: 500, evidenceAttached: false, lineage: lineage(3) },
    ];
    const findings = buildDeclaration(installation, period, claim).findings;
    const cp008 = findings.find((f) => f.code === "CP-008");
    expect(cp008?.severity).toBe("blocker");
  });

  it("CP-010 warns when a route that needs precursors has none", () => {
    const noPrecursor: ActivityRecord[] = [
      { ...base, id: "f1", kind: "fuel", processId: "p1", factorId: "coal_bituminous_in", quantity: 5000, unit: "t", lineage: lineage(1) },
      { ...base, id: "pr1", kind: "production", processId: "p1", cnCode: "72071100", quantityT: 5000, lineage: lineage(2) },
    ];
    expect(codes(noPrecursor)).toContain("CP-010");
  });

  it("CP-012 excludes a CN code that is not a CBAM good", () => {
    const outOfScope: ActivityRecord[] = [
      { ...base, id: "f1", kind: "fuel", processId: "p1", factorId: "coal_bituminous_in", quantity: 5000, unit: "t", lineage: lineage(1) },
      { ...base, id: "pr1", kind: "production", processId: "p1", cnCode: "72071100", quantityT: 5000, lineage: lineage(2) },
      { ...base, id: "pr2", kind: "production", processId: "p1", cnCode: "84innn", quantityT: 100, lineage: lineage(3) },
    ];
    const result = buildDeclaration(installation, period, outOfScope);
    expect(result.findings.map((f) => f.code)).toContain("CP-012");
    expect(result.lines.map((l) => l.cnCode)).not.toContain("84innn");
  });

  it("orders findings with blockers first", () => {
    const messy: ActivityRecord[] = [
      { ...base, id: "f1", kind: "fuel", processId: "p1", factorId: "coal_bituminous_in", quantity: 1, unit: "t", lineage: lineage(1) },
      { ...base, id: "pr1", kind: "production", processId: "p1", cnCode: "72071100", quantityT: 100000, lineage: lineage(2) },
      { ...base, id: "cp1", kind: "carbon_price", processId: "p1", scheme: "x", amount: 1, currency: "INR", tonnesCovered: 1, evidenceAttached: false, lineage: lineage(3) },
    ];
    const severities = buildDeclaration(installation, period, messy).findings.map((f) => f.severity);
    const firstWarning = severities.indexOf("warning");
    const lastBlocker = severities.lastIndexOf("blocker");
    if (firstWarning !== -1 && lastBlocker !== -1) expect(lastBlocker).toBeLessThan(firstWarning);
  });
});

describe("readiness", () => {
  it("refuses to call a declaration filable while a blocker is open", () => {
    const result = buildDeclaration(installation, period, [
      { ...base, id: "f1", kind: "fuel", processId: "p1", factorId: "coal_bituminous_in", quantity: 100, unit: "t", lineage: lineage(1) },
    ]);
    expect(result.readiness.blockers).toBeGreaterThan(0);
    expect(result.readiness.band).toBe("not_filable");
  });

  it("scores a clean, well-evidenced dataset highly", () => {
    const good: ActivityRecord[] = [
      { ...base, tier: 3, provenance: "measured", id: "f1", kind: "fuel", processId: "p1", factorId: "coal_bituminous_in", quantity: 2000, unit: "t", ncvGJPerTonne: 19, lineage: lineage(1) },
      { ...base, tier: 3, provenance: "measured", id: "e1", kind: "electricity", processId: "p1", quantityMWh: 3000, supply: "grid", factorId: "grid_in_national", lineage: lineage(2) },
      { ...base, tier: 3, provenance: "supplier", id: "pc1", kind: "precursor", processId: "p1", cnCode: "72031000", quantityT: 3000, seeDirect: 1.0, seeIndirect: 0.08, seeSource: "supplier", lineage: lineage(3) },
      { ...base, tier: 3, provenance: "measured", id: "pr1", kind: "production", processId: "p1", cnCode: "72071100", quantityT: 10000, lineage: lineage(4) },
    ];
    const result = buildDeclaration(installation, period, good);
    expect(result.readiness.blockers).toBe(0);
    expect(result.readiness.score).toBeGreaterThan(70);
  });
});
