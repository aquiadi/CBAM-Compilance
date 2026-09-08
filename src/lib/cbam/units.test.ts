import { describe, expect, it } from "vitest";
import {
  extractUnitFromHeader,
  fuelEnergyTJ,
  normaliseQuantity,
  parseNumeric,
  resolveUnit,
  UnitError,
} from "./units";

describe("parseNumeric", () => {
  it("parses Indian lakh/crore digit grouping", () => {
    expect(parseNumeric("1,23,456.78")).toBe(123456.78);
    expect(parseNumeric("12,34,56,789")).toBe(123456789);
    expect(parseNumeric("₹1,23,456")).toBe(123456);
  });

  it("parses Western grouping", () => {
    expect(parseNumeric("1,234,567.89")).toBe(1234567.89);
    expect(parseNumeric("1,234")).toBe(1234);
  });

  it("treats a lone comma with two decimals as a European decimal mark", () => {
    expect(parseNumeric("1234,56")).toBe(1234.56);
    expect(parseNumeric("12,50")).toBe(12.5);
  });

  it("does not mistake three-digit grouping for a decimal mark", () => {
    expect(parseNumeric("1,234")).toBe(1234);
    expect(parseNumeric("45,000")).toBe(45000);
  });

  it("handles accounting negatives and signs", () => {
    expect(parseNumeric("(1,234.5)")).toBe(-1234.5);
    expect(parseNumeric("-42")).toBe(-42);
    expect(parseNumeric("+42")).toBe(42);
  });

  it("returns null for spreadsheet null markers rather than zero", () => {
    // Coercing these to 0 would silently understate emissions.
    for (const v of ["", "  ", "N/A", "n/a", "NIL", "-", "--", "?"]) {
      expect(parseNumeric(v), `"${v}" should be null`).toBeNull();
    }
  });

  it("parses percentages and scientific notation", () => {
    expect(parseNumeric("12.5%")).toBeCloseTo(0.125, 10);
    expect(parseNumeric("1.2e3")).toBe(1200);
  });

  it("rejects text that merely contains digits", () => {
    expect(parseNumeric("Q3 2025")).toBeNull();
    expect(parseNumeric("abc")).toBeNull();
  });
});

describe("resolveUnit", () => {
  it("understands Indian plant vocabulary", () => {
    expect(resolveUnit("MT")?.canonical).toBe("t");
    expect(resolveUnit("KL")?.factor).toBe(1);
    expect(resolveUnit("SCM")?.canonical).toBe("m3");
    expect(resolveUnit("Qtl")?.factor).toBe(0.1);
  });

  it("maps MU to MWh with the 1000x factor, not 1x", () => {
    // A million units is 1e6 kWh = 1000 MWh. Reading "MU" as "MWh" is a
    // 1000x understatement of electricity and the single most common error
    // in Indian energy data.
    const mu = resolveUnit("MU");
    expect(mu?.canonical).toBe("MWh");
    expect(mu?.factor).toBe(1000);
    expect(resolveUnit("MWh")?.factor).toBe(1);
  });

  it("normalises punctuation and case", () => {
    expect(resolveUnit("m³")?.canonical).toBe("m3");
    expect(resolveUnit("k.g.")?.canonical).toBe("t");
    expect(resolveUnit("Nm3")?.canonical).toBe("m3");
  });

  it("returns null for unknown tokens instead of guessing", () => {
    expect(resolveUnit("widgets")).toBeNull();
    expect(resolveUnit("")).toBeNull();
  });
});

describe("normaliseQuantity", () => {
  it("converts to canonical units", () => {
    expect(normaliseQuantity(1500, "kg").value).toBe(1.5);
    expect(normaliseQuantity(2.5, "MU").value).toBe(2500);
    expect(normaliseQuantity(1000, "kWh").value).toBe(1);
  });

  it("throws rather than assume a dimension", () => {
    expect(() => normaliseQuantity(5, "MWh", "mass")).toThrow(UnitError);
    expect(() => normaliseQuantity(5, "bananas")).toThrow(UnitError);
  });
});

describe("extractUnitFromHeader", () => {
  it("pulls units out of real-world headers", () => {
    expect(extractUnitFromHeader("Coal Consumed (MT)")).toBe("MT");
    expect(extractUnitFromHeader("Total Power Drawn (in MU)")).toBe("MU");
    expect(extractUnitFromHeader("Furnace Oil - KL")).toBe("KL");
  });

  it("returns null when the header carries no unit", () => {
    expect(extractUnitFromHeader("Material Description")).toBeNull();
    expect(extractUnitFromHeader("Date")).toBeNull();
  });
});

describe("fuelEnergyTJ", () => {
  it("converts mass to energy via NCV", () => {
    // 1000 t of coal at 18 GJ/t = 18,000 GJ = 18 TJ
    expect(fuelEnergyTJ({ quantity: 1000, unit: "t", ncvGJPerTonne: 18 })).toBeCloseTo(18, 9);
  });

  it("converts volume via density then NCV", () => {
    // 100 m3 furnace oil x 0.96 t/m3 x 40.4 GJ/t = 3878.4 GJ
    const tj = fuelEnergyTJ({
      quantity: 100,
      unit: "m3",
      ncvGJPerTonne: 40.4,
      densityTPerM3: 0.96,
    });
    expect(tj).toBeCloseTo(3.8784, 9);
  });

  it("passes energy through untouched", () => {
    expect(fuelEnergyTJ({ quantity: 42, unit: "TJ" })).toBe(42);
  });

  it("refuses to convert without the data it needs", () => {
    expect(() => fuelEnergyTJ({ quantity: 10, unit: "t" })).toThrow(UnitError);
    expect(() => fuelEnergyTJ({ quantity: 10, unit: "m3", ncvGJPerTonne: 40 })).toThrow(UnitError);
  });
});
