import { describe, expect, it } from "vitest";
import { buildDeclaration } from "./declaration";
import type { ActivityRecord, Installation, Lineage, ReportingPeriod } from "./types";

/**
 * The free allocation adjustment along an integrated DRI -> EAF -> rolling
 * chain, checked by hand against Guidance Document 4 equations 2, 4 and 5 and
 * the column A benchmarks of IR (EU) 2025/2620.
 */

const lineage = (row: number): Lineage => ({ datasetId: "d", fileName: "f.csv", row, raw: {} });
const base = {
  periodStart: "2026-01-01",
  periodEnd: "2026-12-31",
  provenance: "measured" as const,
  tier: 3 as const,
};

const installation: Installation = {
  id: "i",
  name: "Works",
  operator: "Op",
  street: "s",
  city: "c",
  state: "st",
  postcode: "1",
  country: "IN",
  contactName: "n",
  contactEmail: "e@x.com",
  processes: [
    { id: "dri", name: "DRI kiln", category: "dri" },
    { id: "eaf", name: "Melt shop", category: "crude_steel", benchmarkRoute: "D" },
    { id: "mill", name: "Rolling mill", category: "iron_or_steel_products" },
  ],
  precursorLinks: [
    { fromProcessId: "dri", toProcessId: "eaf", cnCode: "72031000" },
    { fromProcessId: "eaf", toProcessId: "mill", cnCode: "72071114" },
  ],
};

const period: ReportingPeriod = {
  year: 2026,
  start: "2026-01-01",
  end: "2026-12-31",
  regime: "definitive",
};

const activities: ActivityRecord[] = [
  {
    ...base,
    id: "fuel",
    kind: "fuel",
    processId: "dri",
    factorId: "coal_bituminous_in",
    quantity: 1000,
    unit: "t",
    lineage: lineage(1),
  },
  {
    ...base,
    id: "dri-out",
    kind: "production",
    processId: "dri",
    cnCode: "72031000",
    quantityT: 1100,
    destination: "internal_transfer",
    lineage: lineage(2),
  },
  {
    ...base,
    id: "billet-internal",
    kind: "production",
    processId: "eaf",
    cnCode: "72071114",
    quantityT: 1000,
    destination: "internal_transfer",
    lineage: lineage(3),
  },
  {
    ...base,
    id: "rebar",
    kind: "production",
    processId: "mill",
    cnCode: "72142000",
    quantityT: 950,
    destination: "eu_export",
    lineage: lineage(4),
  },
];

describe("specific embedded free allocation", () => {
  const d = buildDeclaration(installation, period, activities);
  const sefa = (processId: string) => d.sefa.goods.find((g) => g.processId === processId);

  it("gives a simple good its process benchmark times the CBAM factor", () => {
    // DRI: 0.975 x 1.0 x 0.295
    expect(sefa("dri")?.sefa).toBeCloseTo(0.975 * 0.295, 9);
  });

  it("adds the precursor's allowance per tonne of good (Equation 4)", () => {
    // Melt shop, route D: 0.975 x 0.065 + (1,100 / 1,000) x SEFA_DRI
    const expected = 0.975 * 0.065 + 1.1 * (0.975 * 0.295);
    expect(sefa("eaf")?.sefa).toBeCloseTo(expected, 9);
  });

  it("carries the allowance down the chain to the shipped product", () => {
    const billet = 0.975 * 0.065 + 1.1 * (0.975 * 0.295);
    // Rolling mill: 0.975 x 0.038 + (1,000 / 950) x SEFA_billet
    const expected = 0.975 * 0.038 + (1000 / 950) * billet;
    expect(sefa("mill")?.sefa).toBeCloseTo(expected, 9);
    const line = d.lines.find((l) => l.cnCode === "72142000");
    expect(line?.sefa).toBeCloseTo(expected, 9);
  });

  it("charges the EU-bound tonnes on SEE minus SEFA", () => {
    const line = d.lines.find((l) => l.cnCode === "72142000");
    if (!line) throw new Error("no rebar line");
    expect(d.exposure.grossCertificates).toBeCloseTo(
      950 * Math.max(0, line.seeForObligation - line.sefa),
      6,
    );
  });

  it("shrinks the allowance with the CBAM factor across the phase-in", () => {
    const t2026 = d.exposure.trajectory.find((t) => t.year === 2026);
    const t2034 = d.exposure.trajectory.find((t) => t.year === 2034);
    expect(t2034?.factor).toBe(0);
    // With no free allocation left, every embedded tonne is chargeable.
    const line = d.lines.find((l) => l.cnCode === "72142000");
    expect(t2034?.certificates).toBeCloseTo(950 * (line?.seeForObligation ?? 0), 6);
    expect(t2034!.certificates).toBeGreaterThan(t2026!.certificates);
  });
});
