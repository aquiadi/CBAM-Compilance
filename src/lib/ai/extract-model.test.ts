import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RawExtraction } from "./extract";

/**
 * The model path of document reading, with the API client stubbed: what is
 * sent (the document block, structured output, the refusal fallback) and how
 * each kind of answer is handled. No network, no key.
 */

const parse = vi.fn();

vi.mock("./client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./client")>();
  return {
    ...actual,
    isAiAvailable: () => true,
    getClient: () => ({ beta: { messages: { parse } } }),
    MODEL: "claude-opus-5",
  };
});

const { extractDocument } = await import("./extract");

const reading: RawExtraction = {
  documentType: "electricity_bill",
  issuer: "CSPDCL",
  documentNumber: "B-9",
  documentDate: "2026-04-02",
  billingPeriod: { start: "2026-03-01", end: "2026-03-31" },
  warnings: [],
  lines: [
    {
      description: "Energy consumed",
      category: "electricity",
      quantity: 1.25,
      unit: "MU",
      date: "2026-03",
      cnCode: null,
      supplySource: "Grid",
      evidence: "Units consumed 1.25 MU",
      page: 1,
      confidence: 0.95,
    },
  ],
};

const photo = {
  bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
  mediaType: "image/jpeg" as const,
  fileName: "bill.jpg",
};

beforeEach(() => {
  parse.mockReset();
});

describe("extractDocument with a model", () => {
  it("sends the document with structured output and the refusal fallback", async () => {
    parse.mockResolvedValue({
      stop_reason: "end_turn",
      parsed_output: reading,
      model: "claude-opus-5",
      usage: { input_tokens: 1500, output_tokens: 300 },
    });
    const { extraction, outcome } = await extractDocument(photo);

    const request = parse.mock.calls[0]![0];
    expect(request.fallbacks).toBe("default");
    expect(request.betas).toContain("server-side-fallback-2026-07-01");
    expect(request.output_config.format).toBeDefined();
    expect(request.messages[0].content[0]).toMatchObject({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg" },
    });

    expect(outcome).toMatchObject({ producedBy: "model", model: "claude-opus-5" });
    expect(extraction.lines[0]).toMatchObject({ quantity: 1.25, unit: "MU", check: "no_text" });
  });

  it("turns a refusal into an empty table for manual entry", async () => {
    parse.mockResolvedValue({ stop_reason: "refusal", parsed_output: null, usage: {} });
    const { extraction, outcome } = await extractDocument(photo);
    expect(extraction.lines).toEqual([]);
    expect(outcome.producedBy).toBe("heuristic");
    expect(extraction.warnings[0]).toMatch(/declined/);
  });

  it("never throws when the API fails", async () => {
    parse.mockRejectedValue(new Error("socket hang up"));
    const { extraction } = await extractDocument(photo);
    expect(extraction.lines).toEqual([]);
    expect(extraction.warnings[0]).toMatch(/could not be read automatically/);
  });
});
