import { describe, expect, it } from "vitest";
import { abatementValueEur, carbonPriceCredit, cbamFactor, computeExposure } from "./cost";
import type { CarbonPriceActivity, DeclarationLine, Lineage } from "./types";

const lineage: Lineage = { datasetId: "d", fileName: "f.csv", row: 1, raw: {} };

const steelLine: DeclarationLine = {
  cnCode: "72071100",
  description: "Semi-finished steel",
  category: "crude_steel",
  sector: "iron_steel",
  directOnly: true,
  processId: "p1",
  processName: "BOF",
  quantityT: 10000,
  quantityEuT: 10000,
  quantityInternalT: 0,
  seeDirectOwn: 2.0,
  seeIndirectOwn: 0.5,
  seeDirectPrecursor: 0,
  seeIndirectPrecursor: 0,
  seeDirect: 2.0,
  seeIndirect: 0.5,
  seeTotal: 2.5,
  seeForObligation: 2.0,
  embeddedTotalT: 25000,
  embeddedForObligationT: 20000,
  embeddedEuT: 20000,
  uncertainty: 0.06,
  lowestTier: 2,
};

const assumptions = { etsPriceEur: 80, inrPerEur: 90, year: 2026 };

describe("cbamFactor", () => {
  it("follows the free-allocation phase-out schedule", () => {
    expect(cbamFactor(2025)).toBe(0);
    expect(cbamFactor(2026)).toBe(0.025);
    expect(cbamFactor(2030)).toBe(0.485);
    expect(cbamFactor(2034)).toBe(1);
    expect(cbamFactor(2040)).toBe(1);
  });
});

describe("computeExposure", () => {
  it("charges only the CBAM factor share in the phase-in years", () => {
    const r = computeExposure([steelLine], [], assumptions);
    // 20,000 t obligation x 2.5% = 500 certificates x EUR 80 = EUR 40,000
    expect(r.obligationEmissionsT).toBe(20000);
    expect(r.grossCertificates).toBeCloseTo(500, 6);
    expect(r.netCostEur).toBeCloseTo(40000, 6);
    expect(r.netCostInr).toBeCloseTo(3600000, 3);
  });

  it("excludes indirect emissions from the obligation for Annex II goods but still reports them", () => {
    const r = computeExposure([steelLine], [], assumptions);
    expect(r.totalEmbeddedT).toBe(25000);
    expect(r.obligationEmissionsT).toBe(20000);
    expect(r.notes.join(" ")).toContain("excluded from the obligation under Annex II");
  });

  it("projects the full phase-in trajectory", () => {
    const r = computeExposure([steelLine], [], assumptions);
    expect(r.trajectory).toHaveLength(9);
    expect(r.trajectory[0]).toMatchObject({ year: 2026 });
    const last = r.trajectory.at(-1)!;
    expect(last.year).toBe(2034);
    expect(last.costEur).toBeCloseTo(20000 * 80, 3);
    // Cost is monotonically increasing across the phase-in.
    for (let i = 1; i < r.trajectory.length; i++) {
      expect(r.trajectory[i]!.costEur).toBeGreaterThan(r.trajectory[i - 1]!.costEur);
    }
  });

  it("reports zero certificates in the transitional period", () => {
    const r = computeExposure([steelLine], [], { ...assumptions, year: 2025 });
    expect(r.netCertificates).toBe(0);
    expect(r.notes.join(" ")).toContain("Transitional period");
  });
});

describe("EU-bound volume", () => {
  it("charges only the share actually shipped to the EU", () => {
    // Same plant, but only a quarter of output goes to Europe.
    const partial = {
      ...steelLine,
      quantityEuT: 2500,
      embeddedEuT: 5000,
    };
    const r = computeExposure([partial], [], assumptions);
    expect(r.obligationEmissionsT).toBe(5000);
    expect(r.nonEuEmissionsT).toBe(15000);
    expect(r.grossCertificates).toBeCloseTo(125, 6);
  });

  it("never charges output consumed on site as a precursor", () => {
    // Sponge iron produced and fed straight into the melt shop. Its emissions
    // travel downstream inside the steel line; charging them here as well
    // would double count.
    const internalOnly = {
      ...steelLine,
      cnCode: "72031000",
      quantityEuT: 0,
      quantityInternalT: 10000,
      embeddedEuT: 0,
    };
    const r = computeExposure([internalOnly], [], assumptions);
    expect(r.obligationEmissionsT).toBe(0);
    expect(r.netCostEur).toBe(0);
    expect(r.lines).toHaveLength(0);
    expect(r.notes.join(" ")).toContain("not counted twice");
  });
});

describe("carbonPriceCredit", () => {
  const claim = (over: Partial<CarbonPriceActivity>): CarbonPriceActivity => ({
    id: "cp1",
    kind: "carbon_price",
    processId: "p1",
    periodStart: "2026-01-01",
    periodEnd: "2026-12-31",
    provenance: "measured",
    tier: 3,
    lineage,
    scheme: "CCTS",
    amount: 900000,
    currency: "INR",
    tonnesCovered: 1000,
    evidenceAttached: true,
    ...over,
  });

  it("credits a documented payment at its effective rate", () => {
    // INR 900,000 / 90 = EUR 10,000 over 1,000 t = EUR 10/t.
    // At a EUR 80 certificate price that offsets 10/80 = 12.5% of those tonnes.
    const { credit } = carbonPriceCredit([claim({})], assumptions);
    expect(credit).toBeCloseTo(125, 6);
  });

  it("refuses to credit a claim with no evidence", () => {
    const { credit, notes } = carbonPriceCredit([claim({ evidenceAttached: false })], assumptions);
    expect(credit).toBe(0);
    expect(notes[0]).toContain("no documentary evidence");
  });

  it("caps the credit at the certificate price", () => {
    const { credit, notes } = carbonPriceCredit(
      [claim({ amount: 90000000, tonnesCovered: 1000 })], // EUR 1,000/t
      assumptions,
    );
    expect(credit).toBeCloseTo(1000, 6);
    expect(notes.join(" ")).toContain("capped at the certificate price");
  });

  it("never lets the credit push the obligation below zero", () => {
    // EUR 1,000/t paid over 1,000,000 t: the credit far exceeds the obligation.
    const huge = claim({ amount: 90_000_000_000, tonnesCovered: 1_000_000 });
    const r = computeExposure([steelLine], [huge], assumptions);
    expect(r.netCertificates).toBe(0);
    expect(r.netCostEur).toBe(0);
  });

  it("scales the credit by the same CBAM factor as the obligation", () => {
    // Both sides of the subtraction must be in post-factor certificate units,
    // otherwise a small origin carbon price wipes out the whole early-year
    // obligation. EUR 10/t over 1,000 t offsets 125 t of emissions, which is
    // 125 x 2.5% = 3.125 certificates in 2026.
    const r = computeExposure([steelLine], [claim({})], assumptions);
    expect(r.carbonPriceCredit).toBeCloseTo(3.125, 6);
    expect(r.netCertificates).toBeCloseTo(500 - 3.125, 6);
  });
});

describe("abatementValueEur", () => {
  it("prices a tonne avoided against the phase-in, not the headline ETS price", () => {
    const values = abatementValueEur(1000, assumptions);
    expect(values[0]).toMatchObject({ year: 2026 });
    expect(values[0]!.valueEur).toBeCloseTo(1000 * 0.025 * 80, 6);
    expect(values.at(-1)!.valueEur).toBeCloseTo(1000 * 1 * 80, 6);
  });
});
