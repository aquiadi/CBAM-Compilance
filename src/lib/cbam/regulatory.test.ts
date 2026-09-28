import { describe, expect, it } from "vitest";
import {
  countryCode,
  defaultValueMarkup,
  lookupBenchmark,
  lookupDefaultValue,
  publishedPrice,
  quarterOf,
  REGULATORY_SOURCES,
} from "./regulatory";
import { isCbamGood, lookupGoods } from "./goods";

/**
 * The published tables are data, so these tests pin a handful of values
 * against the Commission's own workbooks. If a re-import changes one of them,
 * the failure says exactly which figure moved.
 */

describe("CBAM benchmarks (IR (EU) 2025/2620)", () => {
  it("returns the single value where the benchmark does not depend on route", () => {
    const bm = lookupBenchmark({ cnCode: "72031000", column: "A", year: 2026 });
    expect(bm.ok && bm.choice.value).toBe(0.295);
    const b = lookupBenchmark({ cnCode: "7203 10 00", column: "B", year: 2026 });
    expect(b.ok && b.choice.value).toBe(0.397);
  });

  it("selects by production route and refuses to guess without one", () => {
    const d = lookupBenchmark({ cnCode: "72071114", column: "A", year: 2026, route: "D" });
    expect(d.ok && d.choice.value).toBe(0.065);
    const c = lookupBenchmark({ cnCode: "72071114", column: "B", year: 2026, route: "C" });
    expect(c.ok && c.choice.value).toBe(1.364);
    const none = lookupBenchmark({ cnCode: "72071114", column: "A", year: 2026 });
    expect(none.ok).toBe(false);
    if (!none.ok) {
      expect(none.reason).toBe("route_required");
      expect(none.options).toEqual(["C", "D", "E"]);
    }
  });

  it("selects by production year where the benchmark changes in 2028", () => {
    const early = lookupBenchmark({ cnCode: "72021120", column: "A", year: 2026 });
    const late = lookupBenchmark({ cnCode: "72021120", column: "A", year: 2028 });
    expect(early.ok && early.choice.value).toBe(1.361);
    expect(late.ok && late.choice.value).toBe(1.277);
  });

  it("carries the act, version and checksum of the source workbook", () => {
    expect(REGULATORY_SOURCES.benchmarks.act).toContain("2025/2620");
    expect(REGULATORY_SOURCES.benchmarks.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(REGULATORY_SOURCES.defaultValues.act).toContain("2026/1740");
  });
});

describe("default values (IR (EU) 2025/2621 as corrected)", () => {
  it("finds the country's value at the most specific published level", () => {
    const dri = lookupDefaultValue({ cnCode: "72031000", country: "IN" });
    expect(dri.ok && dri.value.total).toBe(4.2);
    expect(dri.ok && dri.value.table).toContain("India");
    const rebar = lookupDefaultValue({ cnCode: "72142000", country: "IN" });
    expect(rebar.ok && rebar.value.total).toBe(4.27);
    expect(rebar.ok && rebar.value.route).toBe("C");
  });

  it("uses Annex IV for a precursor whose origin is unknown", () => {
    const v = lookupDefaultValue({ cnCode: "72031000", precursorOfUnknownOrigin: true });
    expect(v.ok && v.value.table).toContain("Annex IV");
  });

  it("asks for the TARIC code where the table splits a CN code", () => {
    const clinker = lookupDefaultValue({ cnCode: "25231000", country: "IN" });
    expect(clinker.ok).toBe(false);
    if (!clinker.ok) expect(clinker.reason).toBe("ambiguous");
    const grey = lookupDefaultValue({ cnCode: "2523100090", country: "IN" });
    expect(grey.ok && grey.value.total).toBe(1.44);
  });

  it("applies the phased mark-up, with the lower rate for fertilisers", () => {
    expect(defaultValueMarkup("iron_steel", 2026)).toBe(0.1);
    expect(defaultValueMarkup("iron_steel", 2027)).toBe(0.2);
    expect(defaultValueMarkup("cement", 2030)).toBe(0.3);
    expect(defaultValueMarkup("fertilisers", 2026)).toBe(0.01);
    expect(defaultValueMarkup("fertilisers", 2030)).toBe(0.01);
  });
});

describe("goods scope", () => {
  it("follows Annex I exactly: ferro-silicon is not a CBAM good", () => {
    expect(isCbamGood("7202 21 00")).toBe(false);
    expect(isCbamGood("7202 11 20")).toBe(true);
  });

  it("does not resolve a heading-level code to an arbitrary subheading", () => {
    expect(lookupGoods("7207")).toBeUndefined();
    expect(lookupGoods("720711")).toBeUndefined();
    expect(lookupGoods("7207 11 14")?.directOnly).toBe(true);
    expect(lookupGoods("2523 29 00")?.directOnly).toBe(false);
  });
});

describe("certificate prices", () => {
  it("returns the published 2026 quarterly prices", () => {
    expect(publishedPrice("2026-Q1")?.priceEur).toBe(75.36);
    expect(publishedPrice("2026-Q2")?.priceEur).toBe(75.28);
    expect(publishedPrice("2026-Q4")).toBeUndefined();
    expect(quarterOf("2026-08-01")).toBe("2026-Q3");
  });
});

describe("countryCode", () => {
  it("reads ISO codes, the Commission's names and common aliases", () => {
    expect(countryCode("IN")).toBe("IN");
    expect(countryCode("India")).toBe("IN");
    expect(countryCode("UAE")).toBe("AE");
    expect(countryCode("Atlantis")).toBeNull();
  });
});
