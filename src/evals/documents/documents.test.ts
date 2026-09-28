import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExtractedLine, Extraction } from "../../lib/ai/extract";
import { CassetteMissError, startCassettes } from "./cassette";
import { gate, type Baseline } from "./gate";
import { sameUnit, scoreDocument, summarise, type LabelledDocument } from "./score";

/** The document-reading gate: scoring, the gate's rules, and record/replay. */

const doc: LabelledDocument = {
  id: "bill",
  file: "bill.pdf",
  mediaType: "application/pdf",
  why: "test",
  expected: [{ item: "units", category: "electricity", quantity: 1165140, unit: "kWh" }],
};

function line(over: Partial<ExtractedLine>): ExtractedLine {
  return {
    id: over.id ?? "l1",
    description: "Units consumed",
    category: "electricity",
    quantity: 1165140,
    unit: "kWh",
    date: null,
    cnCode: null,
    supplySource: null,
    evidence: "",
    page: 1,
    confidence: 0.9,
    check: "found",
    unitKnown: true,
    ...over,
  };
}

function extraction(lines: ExtractedLine[]): Extraction {
  return {
    documentType: "electricity_bill",
    issuer: null,
    documentNumber: null,
    documentDate: null,
    billingPeriod: null,
    lines,
    warnings: [],
    textChecked: true,
  };
}

describe("scoreDocument", () => {
  it("counts a correct reading", () => {
    const s = scoreDocument(doc, extraction([line({})]), true);
    expect(s).toMatchObject({ found: 1, unitCorrect: 1, categoryCorrect: 1, silentErrors: 0 });
  });

  it("counts the kVA figure as a silent error: it is in the text, so nothing flags it", () => {
    const s = scoreDocument(
      doc,
      extraction([line({}), line({ id: "l2", quantity: 4213, unit: "kVA" })]),
      true,
    );
    expect(s.silentErrors).toBe(1);
    expect(s.problems.join()).toMatch(/4213 kVA/);
  });

  it("does not count a wrong figure the text check flagged", () => {
    const s = scoreDocument(
      doc,
      extraction([line({}), line({ id: "l2", quantity: 999, check: "not_found" })]),
      true,
    );
    expect(s).toMatchObject({ silentErrors: 0, flaggedErrors: 1 });
  });

  it("counts the right number in the wrong unit as a silent error", () => {
    const mu: LabelledDocument = {
      ...doc,
      expected: [{ item: "energy", category: "electricity", quantity: 21.36, unit: "MU" }],
    };
    const s = scoreDocument(mu, extraction([line({ quantity: 21.36, unit: "MWh" })]), true);
    expect(s).toMatchObject({ found: 1, unitCorrect: 0, silentErrors: 1 });
  });

  it("treats spellings of the same unit as the same unit", () => {
    expect(sameUnit("MT", "tonnes")).toBe(true);
    expect(sameUnit("KL", "kl")).toBe(true);
    expect(sameUnit("MWh", "MU")).toBe(false);
  });

  it("summarises the rates", () => {
    const m = summarise([
      scoreDocument(doc, extraction([line({})]), true),
      scoreDocument(doc, extraction([]), false),
    ]);
    expect(m).toMatchObject({ documents: 2, readRate: 0.5, lineRecall: 0.5, silentErrorRate: 0 });
  });
});

const baseline: Baseline = {
  frozenAt: "2026-09-28T00:00:00Z",
  commit: "abc",
  corpus: "public-synthetic",
  corpusHash: "h1",
  provider: "groq",
  models: ["a", "b"],
  cassettes: 10,
  metrics: {
    documents: 10,
    readRate: 1,
    lineRecall: 0.9,
    unitAccuracy: 1,
    categoryAccuracy: 1,
    silentErrorRate: 0.05,
  },
};
const same = {
  metrics: baseline.metrics,
  corpusHash: "h1",
  provider: "groq",
  models: ["b", "a"],
};

describe("gate", () => {
  it("passes an unchanged run", () => {
    expect(gate(same, baseline, "replay").every((c) => c.passed)).toBe(true);
  });

  it("fails without a baseline", () => {
    expect(gate(same, null, "replay")[0]).toMatchObject({ passed: false });
  });

  it("fails when silent errors rise at all on replay", () => {
    const checks = gate(
      { ...same, metrics: { ...baseline.metrics, silentErrorRate: 0.06 } },
      baseline,
      "replay",
    );
    expect(checks.find((c) => c.name === "silentErrorRate")?.passed).toBe(false);
  });

  it("fails on changed ground instead of comparing", () => {
    const checks = gate({ ...same, corpusHash: "h2" }, baseline, "replay");
    expect(checks.find((c) => c.name === "corpus")).toMatchObject({ passed: false });
  });

  it("fails when a metric is missing from the baseline", () => {
    const broken = {
      ...baseline,
      metrics: { ...baseline.metrics, unitAccuracy: undefined as unknown as number },
    };
    expect(gate(same, broken, "replay").find((c) => c.name === "unitAccuracy")?.passed).toBe(false);
  });

  it("allows a live run the model's own variation", () => {
    const live = { ...same, metrics: { ...baseline.metrics, lineRecall: 0.85 } };
    expect(gate(live, baseline, "live").every((c) => c.passed)).toBe(true);
    expect(gate(live, baseline, "replay").every((c) => c.passed)).toBe(false);
  });
});

describe("cassettes", () => {
  const real = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = real;
  });

  it("records a model call, then replays it without the network", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cassettes-"));
    const network = vi.fn(
      async () => new Response('{"ok":true}', { headers: { "content-type": "application/json" } }),
    );
    globalThis.fetch = network as unknown as typeof fetch;
    const body = JSON.stringify({
      model: "m",
      image: "data:image/jpeg;base64," + "A".repeat(2000),
    });
    const call = () =>
      fetch("https://api.groq.com/openai/v1/chat/completions", { method: "POST", body });

    const recording = startCassettes(dir, "record");
    await call();
    recording.restore();
    const files = readdirSync(dir);
    expect(files).toHaveLength(1);
    // The committed copy is reviewable: the image is summarised, not inlined.
    expect(readFileSync(join(dir, files[0]!), "utf8")).toMatch(/characters of base64/);

    globalThis.fetch = network as unknown as typeof fetch;
    const replaying = startCassettes(dir, "replay");
    const res = await call();
    replaying.restore();
    expect(await res.json()).toEqual({ ok: true });
    expect(network).toHaveBeenCalledTimes(1);
  });

  it("refuses an unrecorded call in replay instead of reaching the network", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cassettes-"));
    const network = vi.fn();
    globalThis.fetch = network as unknown as typeof fetch;
    const session = startCassettes(dir, "replay");
    await expect(
      fetch("https://api.groq.com/openai/v1/chat/completions", { method: "POST", body: "{}" }),
    ).rejects.toBeInstanceOf(CassetteMissError);
    session.restore();
    expect(network).not.toHaveBeenCalled();
    expect(session.misses).toHaveLength(1);
  });
});
