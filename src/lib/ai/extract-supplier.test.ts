import { describe, expect, it } from "vitest";
import {
  crossCheckSupplier,
  validateSupplierCommunication,
  type RawSupplierCommunication,
} from "./extract-supplier";

/** Reading a supplier's CBAM communication: what happens to the model's reading. */

function raw(over: Partial<RawSupplierCommunication> = {}): RawSupplierCommunication {
  return {
    supplierName: "Jindal Sponge Ltd",
    installationName: "Raigarh DRI plant",
    country: "India",
    reportingPeriod: "2026",
    verified: true,
    verifierName: "Example Verification GmbH",
    warnings: [],
    goods: [
      {
        cnCode: "7203 10 00",
        description: "Direct reduced iron",
        seeDirect: 2.61,
        seeIndirect: 0.08,
        sefa: 0.29,
        evidence: "SEE direct 2.61 tCO2e/t",
        page: 2,
        confidence: 0.9,
      },
    ],
    ...over,
  };
}

describe("validateSupplierCommunication", () => {
  it("keeps a clean reading and normalises the CN code and country", () => {
    const c = validateSupplierCommunication(raw());
    expect(c.country).toBe("IN");
    expect(c.verified).toBe(true);
    expect(c.goods[0]).toMatchObject({ cnCode: "72031000", cnValid: true, seeDirect: 2.61 });
  });

  it("does not count verification without a named verifier", () => {
    const c = validateSupplierCommunication(raw({ verifierName: null }));
    expect(c.verified).toBe(false);
    expect(c.warnings.join(" ")).toMatch(/names no verifier/);
  });

  it("drops figures outside the plausible range and flags codes that are not CBAM goods", () => {
    const c = validateSupplierCommunication(
      raw({
        goods: [{ ...raw().goods[0]!, seeDirect: 260, cnCode: "8455 90 00" }],
      }),
    );
    expect(c.goods[0]?.seeDirect).toBeNull();
    expect(c.goods[0]?.cnValid).toBe(false);
    expect(c.warnings).toHaveLength(2);
  });
});

describe("crossCheckSupplier", () => {
  it("marks goods whose every figure is in the document's text", () => {
    const text = "Product 7203 10 00 SEE direct 2.61 indirect 0.08 SEFA 0.29";
    const c = crossCheckSupplier(validateSupplierCommunication(raw()), text);
    expect(c.goods[0]?.check).toBe("found");
  });

  it("flags a good with a figure the document does not contain", () => {
    const c = crossCheckSupplier(validateSupplierCommunication(raw()), "SEE direct 2.16");
    expect(c.goods[0]?.check).toBe("not_found");
    expect(c.warnings[0]).toMatch(/not in the document's text/);
  });
});
