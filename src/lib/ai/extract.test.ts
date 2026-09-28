import { describe, expect, it } from "vitest";
import {
  crossCheck,
  documentMediaType,
  documentText,
  normaliseDate,
  validateExtraction,
  type RawExtraction,
} from "./extract";

/**
 * Document reading guardrails. The model's reading is fed in as a fixture:
 * these tests pin down what happens to it before a person ever sees it, and
 * need no API key.
 */

function raw(lines: Partial<RawExtraction["lines"][number]>[]): RawExtraction {
  return {
    documentType: "fuel_invoice",
    issuer: " Indian Oil ",
    documentNumber: "INV-42",
    documentDate: "15/03/2026",
    billingPeriod: null,
    warnings: [],
    lines: lines.map((l) => ({
      description: "HSD",
      category: "fuel",
      quantity: 12.45,
      unit: "KL",
      date: "2026-03-15",
      cnCode: null,
      supplySource: null,
      evidence: "HSD 12.45 KL",
      page: 1,
      confidence: 0.9,
      ...l,
    })),
  };
}

describe("validateExtraction", () => {
  it("keeps a clean line as read, with the unit untouched", () => {
    const e = validateExtraction(raw([{}]));
    expect(e.lines[0]).toMatchObject({
      description: "HSD",
      quantity: 12.45,
      unit: "KL",
      date: "2026-03-15",
      unitKnown: true,
      check: "no_text",
    });
    expect(e.issuer).toBe("Indian Oil");
    expect(e.documentDate).toBe("2026-03-15");
  });

  it("drops an impossible quantity instead of passing it on, and says so", () => {
    const e = validateExtraction(raw([{ quantity: -5 }, { quantity: Number.NaN }]));
    expect(e.lines.map((l) => l.quantity)).toEqual([null, null]);
    expect(e.warnings).toHaveLength(2);
  });

  it("clamps confidence and discards dates it cannot read", () => {
    const e = validateExtraction(raw([{ confidence: 7, date: "next Tuesday" }]));
    expect(e.lines[0]?.confidence).toBe(1);
    expect(e.lines[0]?.date).toBeNull();
  });

  it("flags a unit the engine does not know rather than guessing one", () => {
    const e = validateExtraction(raw([{ unit: "bags" }, { unit: "Metric Tonne" }]));
    expect(e.lines.map((l) => l.unitKnown)).toEqual([false, true]);
  });

  it("normalises the date shapes printed on Indian documents", () => {
    expect(normaliseDate("2026-03")).toBe("2026-03");
    expect(normaliseDate("5.3.2026")).toBe("2026-03-05");
    expect(normaliseDate("March 2026")).toBeNull();
  });
});

describe("crossCheck against the document's own text", () => {
  const text =
    "Tax invoice INV-42\nHSD (High Speed Diesel) 12.45 KL @ 89,500\nCoal G11 1,23,456.50 MT";

  it("finds figures however they are grouped", () => {
    const e = crossCheck(
      validateExtraction(
        raw([{ quantity: 12.45 }, { description: "Coal G11", quantity: 123456.5, unit: "MT" }]),
      ),
      text,
    );
    expect(e.textChecked).toBe(true);
    expect(e.lines.map((l) => l.check)).toEqual(["found", "found"]);
    expect(e.warnings).toEqual([]);
  });

  it("flags a figure the document does not contain", () => {
    const e = crossCheck(validateExtraction(raw([{ quantity: 124.5 }])), text);
    expect(e.lines[0]?.check).toBe("not_found");
    expect(e.warnings[0]).toMatch(/not found in the document's text/);
  });

  it("does not match a figure inside a longer number", () => {
    // 89.5 appears only as part of "89,500": grouping is removed, so 89500 is
    // present but 89.5 must not match it.
    const e = crossCheck(validateExtraction(raw([{ quantity: 89.5 }])), text);
    expect(e.lines[0]?.check).toBe("not_found");
  });

  it("leaves photos to be checked by eye", () => {
    const e = crossCheck(validateExtraction(raw([{}])), null);
    expect(e.textChecked).toBe(false);
    expect(e.lines[0]?.check).toBe("no_text");
  });
});

describe("documents", () => {
  it("accepts PDFs, photos and text, and refuses the rest", () => {
    expect(documentMediaType("bill.pdf", "")).toBe("application/pdf");
    expect(documentMediaType("slip.JPG", "")).toBe("image/jpeg");
    expect(documentMediaType("x", "image/png")).toBe("image/png");
    expect(documentMediaType("photo.heic", "image/heic")).toBeNull();
    expect(documentMediaType("sheet.xlsx", "")).toBeNull();
  });

  it("reads a PDF's text layer for the cross-check", async () => {
    const pdf = [
      "%PDF-1.4",
      "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj",
      "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj",
      "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 200]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj",
      "4 0 obj<</Length 60>>stream",
      "BT /F1 12 Tf 20 150 Td (HSD Diesel 12,450.50 Litre) Tj ET",
      "endstream endobj",
      "5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj",
      "trailer<</Root 1 0 R>>",
      "%%EOF",
    ].join("\n");
    const text = await documentText(new TextEncoder().encode(pdf), "application/pdf");
    expect(text).toContain("12,450.50");
    const e = crossCheck(validateExtraction(raw([{ quantity: 12450.5, unit: "Litre" }])), text);
    expect(e.lines[0]?.check).toBe("found");
  }, 30_000);
});
