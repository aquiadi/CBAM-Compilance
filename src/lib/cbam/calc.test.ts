import { describe, expect, it } from "vitest";
import { buildDeclarationLines, computeProcessEmissions } from "./calc";
import { buildDeclaration } from "./declaration";
import type {
  ActivityRecord,
  Installation,
  Lineage,
  ProductionProcess,
  ReportingPeriod,
} from "./types";

const lineage = (row: number): Lineage => ({
  datasetId: "ds1",
  fileName: "test.csv",
  row,
  raw: {},
});

const base = {
  periodStart: "2026-01-01",
  periodEnd: "2026-12-31",
  provenance: "calculated" as const,
  tier: 2 as const,
};

const eaf: ProductionProcess = {
  id: "p_eaf",
  name: "EAF Steelmaking",
  category: "crude_steel",
  route: "EAF (scrap)",
};

const installation: Installation = {
  id: "inst1",
  name: "Test Works",
  operator: "Test Steel Ltd",
  street: "1 Plant Road",
  city: "Raipur",
  state: "Chhattisgarh",
  postcode: "492001",
  country: "IN",
  unlocode: "INIXY",
  contactName: "A. Engineer",
  contactEmail: "a@example.com",
  processes: [eaf],
};

const period: ReportingPeriod = {
  year: 2026,
  start: "2026-01-01",
  end: "2026-12-31",
  regime: "definitive",
};

describe("computeProcessEmissions", () => {
  it("computes fuel emissions through NCV and the emission factor", () => {
    // 1,000 t coal x 18 GJ/t / 1000 = 18 TJ; 18 TJ x 94.6 tCO2e/TJ = 1,702.8 t
    const activities: ActivityRecord[] = [
      {
        ...base,
        id: "a1",
        kind: "fuel",
        processId: "p_eaf",
        factorId: "coal_bituminous_in",
        quantity: 1000,
        unit: "t",
        lineage: lineage(1),
      },
    ];
    const em = computeProcessEmissions(eaf, activities);
    expect(em.directT).toBeCloseTo(1702.8, 3);
    expect(em.errors).toHaveLength(0);
    expect(em.contributions.fuel[0]?.energyTJ).toBeCloseTo(18, 6);
  });

  it("prefers a plant-measured NCV over the library default", () => {
    const activities: ActivityRecord[] = [
      {
        ...base,
        id: "a1",
        kind: "fuel",
        processId: "p_eaf",
        factorId: "coal_bituminous_in",
        quantity: 1000,
        unit: "t",
        ncvGJPerTonne: 22,
        tier: 3,
        lineage: lineage(1),
      },
    ];
    const em = computeProcessEmissions(eaf, activities);
    expect(em.directT).toBeCloseTo(22 * 94.6, 3);
    expect(em.contributions.fuel[0]?.formula).toContain("plant-measured NCV");
  });

  it("nets exported heat off direct emissions and keeps imported heat in", () => {
    const activities: ActivityRecord[] = [
      {
        ...base,
        id: "h1",
        kind: "heat",
        processId: "p_eaf",
        direction: "imported",
        quantityTJ: 10,
        factorId: "heat_generic",
        lineage: lineage(1),
      },
      {
        ...base,
        id: "h2",
        kind: "heat",
        processId: "p_eaf",
        direction: "exported",
        quantityTJ: 4,
        factorId: "heat_generic",
        lineage: lineage(2),
      },
    ];
    const em = computeProcessEmissions(eaf, activities);
    expect(em.directT).toBeCloseTo((10 - 4) * 66.7, 3);
    expect(em.heatImportedT).toBeCloseTo(667, 3);
    expect(em.heatExportedT).toBeCloseTo(266.8, 3);
  });

  it("keeps electricity out of direct emissions", () => {
    const activities: ActivityRecord[] = [
      {
        ...base,
        id: "e1",
        kind: "electricity",
        processId: "p_eaf",
        quantityMWh: 1000,
        supply: "grid",
        factorId: "grid_in_national",
        lineage: lineage(1),
      },
    ];
    const em = computeProcessEmissions(eaf, activities);
    expect(em.directT).toBe(0);
    expect(em.indirectT).toBeCloseTo(716, 3);
  });

  it("reports an error instead of silently dropping an unknown factor", () => {
    const activities: ActivityRecord[] = [
      {
        ...base,
        id: "a1",
        kind: "fuel",
        processId: "p_eaf",
        factorId: "unobtanium",
        quantity: 10,
        unit: "t",
        lineage: lineage(1),
      },
    ];
    const em = computeProcessEmissions(eaf, activities);
    expect(em.directT).toBe(0);
    expect(em.errors[0]).toContain("unobtanium");
  });

  it("takes the lowest tier across all inputs", () => {
    const activities: ActivityRecord[] = [
      {
        ...base,
        id: "a1",
        kind: "fuel",
        processId: "p_eaf",
        factorId: "coal_bituminous_in",
        quantity: 1,
        unit: "t",
        tier: 3,
        lineage: lineage(1),
      },
      {
        ...base,
        id: "a2",
        kind: "fuel",
        processId: "p_eaf",
        factorId: "diesel",
        quantity: 1,
        unit: "m3",
        tier: 1,
        lineage: lineage(2),
      },
    ];
    expect(computeProcessEmissions(eaf, activities).lowestTier).toBe(1);
  });
});

describe("specific embedded emissions (Annex IV)", () => {
  const activities: ActivityRecord[] = [
    // 1,000 t coal -> 1,702.8 tCO2e direct
    {
      ...base,
      id: "f1",
      kind: "fuel",
      processId: "p_eaf",
      factorId: "coal_bituminous_in",
      quantity: 1000,
      unit: "t",
      lineage: lineage(1),
    },
    // 10,000 MWh -> 7,160 tCO2e indirect
    {
      ...base,
      id: "e1",
      kind: "electricity",
      processId: "p_eaf",
      quantityMWh: 10000,
      supply: "grid",
      factorId: "grid_in_national",
      lineage: lineage(2),
    },
    // 10,000 t of crude steel
    {
      ...base,
      id: "pr1",
      kind: "production",
      processId: "p_eaf",
      cnCode: "72071100",
      quantityT: 10000,
      destination: "eu_export",
      lineage: lineage(3),
    },
  ];

  it("divides attributed emissions by the activity level", () => {
    const em = [computeProcessEmissions(eaf, activities)];
    const [line] = buildDeclarationLines(installation, activities, em);
    expect(line).toBeDefined();
    expect(line!.seeDirect).toBeCloseTo(0.17028, 6);
    expect(line!.seeIndirect).toBeCloseTo(0.716, 6);
    expect(line!.seeTotal).toBeCloseTo(0.88628, 6);
  });

  it("counts only direct emissions towards the obligation for Annex II goods", () => {
    const em = [computeProcessEmissions(eaf, activities)];
    const [line] = buildDeclarationLines(installation, activities, em);
    // Steel is direct-only for the obligation, but indirect is still reported.
    expect(line!.directOnly).toBe(true);
    expect(line!.seeForObligation).toBeCloseTo(line!.seeDirect, 9);
    expect(line!.seeIndirect).toBeGreaterThan(0);
    expect(line!.embeddedForObligationT).toBeCloseTo(1702.8, 2);
    expect(line!.embeddedTotalT).toBeCloseTo(8862.8, 2);
  });

  it("counts direct and indirect for goods outside Annex II", () => {
    const cementProcess: ProductionProcess = { id: "p_kiln", name: "Kiln", category: "cement" };
    const cementInstallation = { ...installation, processes: [cementProcess] };
    const cementActivities: ActivityRecord[] = [
      {
        ...base,
        id: "f1",
        kind: "fuel",
        processId: "p_kiln",
        factorId: "coal_bituminous_in",
        quantity: 1000,
        unit: "t",
        lineage: lineage(1),
      },
      {
        ...base,
        id: "e1",
        kind: "electricity",
        processId: "p_kiln",
        quantityMWh: 10000,
        supply: "grid",
        factorId: "grid_in_national",
        lineage: lineage(2),
      },
      {
        ...base,
        id: "pr1",
        kind: "production",
        processId: "p_kiln",
        cnCode: "25232900",
        quantityT: 10000,
        lineage: lineage(3),
      },
    ];
    const em = [computeProcessEmissions(cementProcess, cementActivities)];
    const [line] = buildDeclarationLines(cementInstallation, cementActivities, em);
    expect(line!.directOnly).toBe(false);
    expect(line!.seeForObligation).toBeCloseTo(line!.seeTotal, 9);
  });

  it("adds precursor emissions on top of the process's own", () => {
    const withPrecursor: ActivityRecord[] = [
      ...activities,
      {
        ...base,
        id: "pc1",
        kind: "precursor",
        processId: "p_eaf",
        cnCode: "72031000",
        quantityT: 5000,
        seeDirect: 1.05,
        seeIndirect: 0.09,
        seeSource: "supplier",
        lineage: lineage(4),
      },
    ];
    const em = [computeProcessEmissions(eaf, withPrecursor)];
    const [line] = buildDeclarationLines(installation, withPrecursor, em);
    // 5,000 t x 1.05 = 5,250 tCO2e direct over 10,000 t of output = 0.525 tCO2e/t
    expect(line!.seeDirectPrecursor).toBeCloseTo(0.525, 6);
    expect(line!.seeDirect).toBeCloseTo(0.17028 + 0.525, 6);
    expect(line!.seeDirectOwn).toBeCloseTo(0.17028, 6);
  });

  it("allocates a shared process across CN codes by mass", () => {
    const twoProducts: ActivityRecord[] = [
      {
        ...base,
        id: "f1",
        kind: "fuel",
        processId: "p_eaf",
        factorId: "coal_bituminous_in",
        quantity: 1000,
        unit: "t",
        lineage: lineage(1),
      },
      {
        ...base,
        id: "pr1",
        kind: "production",
        processId: "p_eaf",
        cnCode: "72071100",
        quantityT: 7500,
        lineage: lineage(2),
      },
      {
        ...base,
        id: "pr2",
        kind: "production",
        processId: "p_eaf",
        cnCode: "72071900",
        quantityT: 2500,
        lineage: lineage(3),
      },
    ];
    const em = [computeProcessEmissions(eaf, twoProducts)];
    const lines = buildDeclarationLines(installation, twoProducts, em);
    expect(lines).toHaveLength(2);
    // Intensity is identical; the split shows up in the tonnage-weighted totals.
    expect(lines[0]!.seeDirect).toBeCloseTo(lines[1]!.seeDirect, 9);
    const total = lines.reduce((s, l) => s + l.embeddedForObligationT, 0);
    expect(total).toBeCloseTo(1702.8, 2);
  });

  it("produces no line when there is no production, rather than dividing by zero", () => {
    const noOutput = activities.filter((a) => a.kind !== "production");
    const em = [computeProcessEmissions(eaf, noOutput)];
    expect(buildDeclarationLines(installation, noOutput, em)).toHaveLength(0);
  });
});

describe("buildDeclaration", () => {
  it("is deterministic: identical inputs give identical figures", () => {
    const activities: ActivityRecord[] = [
      {
        ...base,
        id: "f1",
        kind: "fuel",
        processId: "p_eaf",
        factorId: "coal_bituminous_in",
        quantity: 1000,
        unit: "t",
        lineage: lineage(1),
      },
      {
        ...base,
        id: "pr1",
        kind: "production",
        processId: "p_eaf",
        cnCode: "72071100",
        quantityT: 10000,
        lineage: lineage(2),
      },
    ];
    const a = buildDeclaration(installation, period, activities);
    const b = buildDeclaration(installation, period, activities);
    expect(a.totals).toEqual(b.totals);
    expect(a.lines).toEqual(b.lines);
  });
});
