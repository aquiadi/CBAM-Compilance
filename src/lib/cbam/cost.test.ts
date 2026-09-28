import { describe, expect, it } from "vitest";
import { carbonPriceCredit, computeExposure, defaultScenarioFor } from "./cost";
import { cbamFactor } from "./regulatory";
import type { CarbonPriceActivity, DeclarationLine, Lineage, ProductionActivity } from "./types";

const lineage: Lineage = { datasetId: "d", fileName: "f.csv", row: 1, raw: {} };

const steelLine: DeclarationLine = {
  cnCode: "72071114",
  description: "Semi-finished steel",
  category: "crude_steel",
  sector: "iron_steel",
  directOnly: true,
  processId: "p1",
  processName: "Melt shop",
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
  sefa: 0.5,
  sefaIssues: [],
  embeddedTotalT: 25000,
  embeddedForObligationT: 20000,
  embeddedEuT: 20000,
  uncertainty: 0.06,
  lowestTier: 2,
};

function euShipment(month: string, tonnes: number, cnCode = "72071114"): ProductionActivity {
  return {
    id: `p-${month}`,
    kind: "production",
    processId: "p1",
    cnCode,
    quantityT: tonnes,
    destination: "eu_export",
    periodStart: `${month}-01`,
    periodEnd: `${month}-28`,
    provenance: "measured",
    tier: 3,
    lineage,
  };
}

const assumptions = { etsPriceEur: 80, inrPerEur: 90, year: 2026 };

describe("CBAM factor", () => {
  it("is the share of EU free allocation still granted, not the share charged", () => {
    // Guidance Document 4, Table 2-1.
    expect(cbamFactor(2026)).toBe(0.975);
    expect(cbamFactor(2027)).toBe(0.95);
    expect(cbamFactor(2030)).toBe(0.515);
    expect(cbamFactor(2033)).toBe(0.14);
    expect(cbamFactor(2034)).toBe(0);
    expect(cbamFactor(2040)).toBe(0);
  });
});

describe("computeExposure", () => {
  it("charges embedded emissions less the free allocation adjustment", () => {
    const r = computeExposure({
      lines: [steelLine],
      production: [euShipment("2026-11", 10000)],
      claims: [],
      assumptions,
      country: "IN",
    });
    // 10,000 t x (2.0 - 0.5) = 15,000 certificates - not 2.5% of 20,000.
    expect(r.obligationEmissionsT).toBe(20000);
    expect(r.freeAllocationAdjustmentT).toBeCloseTo(5000, 6);
    expect(r.grossCertificates).toBeCloseTo(15000, 6);
    // Q4 2026 has no published price yet, so the assumption applies.
    expect(r.netCostEur).toBeCloseTo(15000 * 80, 6);
    expect(r.netCostInr).toBeCloseTo(15000 * 80 * 90, 3);
  });

  it("prices each quarter at the Commission's published certificate price", () => {
    const r = computeExposure({
      lines: [steelLine],
      production: [euShipment("2026-02", 4000), euShipment("2026-05", 6000)],
      claims: [],
      assumptions,
      country: "IN",
    });
    // Q1 2026 EUR 75.36 and Q2 2026 EUR 75.28, as published.
    const expected = 4000 * 1.5 * 75.36 + 6000 * 1.5 * 75.28;
    expect(r.grossCostEur).toBeCloseTo(expected, 6);
    expect(r.pricing.every((p) => p.basis === "published")).toBe(true);
  });

  it("never lets the allowance turn a line into a negative obligation", () => {
    const efficient = { ...steelLine, seeForObligation: 0.3, seeDirect: 0.3, sefa: 0.5 };
    const r = computeExposure({
      lines: [efficient],
      production: [euShipment("2026-11", 10000)],
      claims: [],
      assumptions,
      country: "IN",
    });
    expect(r.grossCertificates).toBe(0);
  });

  it("excludes indirect emissions from the obligation for Annex II goods but still reports them", () => {
    const r = computeExposure({
      lines: [steelLine],
      production: [euShipment("2026-11", 10000)],
      claims: [],
      assumptions,
      country: "IN",
    });
    expect(r.totalEmbeddedT).toBe(25000);
    expect(r.notes.join(" ")).toContain("excluded from the obligation under Annex II");
  });

  it("charges only the share actually shipped to the EU", () => {
    const partly = {
      ...steelLine,
      quantityEuT: 2500,
      embeddedEuT: 5000,
      quantityInternalT: 5000,
    };
    const r = computeExposure({
      lines: [partly],
      production: [euShipment("2026-11", 2500)],
      claims: [],
      assumptions,
      country: "IN",
    });
    expect(r.grossCertificates).toBeCloseTo(2500 * 1.5, 6);
    expect(r.nonEuEmissionsT).toBeCloseTo(15000, 6);
    expect(r.notes.join(" ")).toContain("consumed on site");
  });

  it("shows what the same goods would cost on default values", () => {
    const r = computeExposure({
      lines: [{ ...steelLine, cnCode: "72142000" }],
      production: [euShipment("2026-11", 10000, "72142000")],
      claims: [],
      assumptions,
      country: "IN",
    });
    // Annex I India, 7214 20 00: 4.270 + 10% = 4.697; column B (C) 1.364 x 0.975.
    const perTonne = 4.27 * 1.1 - 0.975 * 1.364;
    expect(r.defaultScenario.certificates).toBeCloseTo(10000 * perTonne, 3);
    expect(r.defaultScenario.complete).toBe(true);
  });
});

describe("defaultScenarioFor", () => {
  it("follows the route the Default Values Act gives for the country", () => {
    const s = defaultScenarioFor("72142000", "IN", 2026);
    if ("error" in s) throw new Error(s.error);
    expect(s.seeWithMarkup).toBeCloseTo(4.697, 6);
    expect(s.sefa).toBeCloseTo(0.975 * 1.364, 6);
    expect(s.reference).toContain("(C)");
  });

  it("uses the 30% mark-up from 2028", () => {
    const s = defaultScenarioFor("72142000", "IN", 2028);
    if ("error" in s) throw new Error(s.error);
    expect(s.seeWithMarkup).toBeCloseTo(4.27 * 1.3, 6);
    expect(s.sefa).toBeCloseTo(0.9 * 1.364, 6);
  });
});

describe("carbonPriceCredit", () => {
  const claim = (overrides: Partial<CarbonPriceActivity>): CarbonPriceActivity => ({
    id: "c1",
    kind: "carbon_price",
    processId: "p1",
    periodStart: "2026-01-01",
    periodEnd: "2026-12-31",
    provenance: "measured",
    tier: 3,
    lineage,
    scheme: "Test scheme",
    amount: 0,
    currency: "EUR",
    tonnesCovered: 0,
    evidenceAttached: true,
    ...overrides,
  });

  it("refuses to credit a claim without evidence", () => {
    const r = carbonPriceCredit(
      [claim({ amount: 10000, tonnesCovered: 1000, evidenceAttached: false })],
      assumptions,
      1,
    );
    expect(r.credit).toBe(0);
    expect(r.notes[0]).toContain("no documentary evidence");
  });

  it("credits a documented payment at its effective rate, on the EU-bound share", () => {
    // EUR 40/t on 1,000 t against an EUR 80 certificate: 500 certificates, half EU-bound.
    const r = carbonPriceCredit([claim({ amount: 40000, tonnesCovered: 1000 })], assumptions, 0.5);
    expect(r.credit).toBeCloseTo(250, 6);
  });

  it("caps the credit at the certificate price", () => {
    const r = carbonPriceCredit([claim({ amount: 200000, tonnesCovered: 1000 })], assumptions, 1);
    expect(r.credit).toBeCloseTo(1000, 6);
    expect(r.notes.join(" ")).toContain("capped");
  });

  it("does not convert USD at a made-up rate", () => {
    const r = carbonPriceCredit(
      [claim({ amount: 1000, tonnesCovered: 10, currency: "USD" })],
      assumptions,
      1,
    );
    expect(r.credit).toBe(0);
    expect(r.notes[0]).toContain("EUR equivalent");
  });

  it("never lets the credit push the obligation below zero", () => {
    const r = computeExposure({
      lines: [steelLine],
      production: [euShipment("2026-11", 10000)],
      claims: [claim({ amount: 10_000_000, tonnesCovered: 100_000 })],
      assumptions,
      country: "IN",
    });
    expect(r.netCertificates).toBe(0);
    expect(r.netCostEur).toBe(0);
  });
});
