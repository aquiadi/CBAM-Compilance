import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The evalgate client: what is sent, how citations are classified, and that a
 * response outside evalgate's contract is refused rather than rendered.
 */

vi.mock("@/config/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/config/env")>();
  return {
    ...actual,
    env: { ...actual.env, EVALGATE_URL: "https://evalgate.test", EVALGATE_API_KEY: "k-123" },
  };
});

const { askRegulation, isSyntheticCorpus, RegulationError, regulationHealth } =
  await import("./regulation");
const { answerSegments } = await import("./regulation-format");

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const chunk = (id: string, rank: number) => ({
  chunk_id: id,
  doc_id: id.split("#")[0],
  doc_title: "Regulation (EU) 2023/956",
  section: "Article 22",
  rank,
  score: 1 - rank / 10,
  text: `Passage ${id}`,
});

function answer(text: string, citations: { chunk_id: string; valid: boolean }[]) {
  return new Response(
    JSON.stringify({
      answer: text,
      citations,
      retrieval: {
        retriever: "hybrid",
        k: 3,
        index_hash: "i",
        chunks: [chunk("reg#0002", 1), chunk("reg#0001", 0), chunk("reg#0003", 2)],
        latency_s: 0.01,
      },
      cost: { input_tokens: 1, output_tokens: 1, context_tokens: 1, usd: 0, projected_usd: 0 },
      latency: { retrieval_s: 0.01, generation_s: 1.2, total_s: 1.21 },
      provenance: {
        corpus: "cbam",
        corpus_hash: "abc",
        index_hash: "i",
        generator_model: "openai/gpt-oss-20b",
        generator_prompt_hash: "p",
        config_hash: "c",
        replayed: false,
      },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

describe("askRegulation", () => {
  it("sends the question with the key and marks each cited passage", async () => {
    fetchMock.mockResolvedValue(
      answer("The declarant surrenders certificates [reg#0001]. See also [reg#0009].", [
        { chunk_id: "reg#0001", valid: true },
        { chunk_id: "reg#0009", valid: false },
      ]),
    );
    const r = await askRegulation("Who surrenders certificates?");

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://evalgate.test/query");
    expect(init.headers["x-api-key"]).toBe("k-123");
    expect(JSON.parse(init.body)).toEqual({ question: "Who surrenders certificates?" });

    expect(r.passages.map((p) => [p.chunkId, p.cited])).toEqual([
      ["reg#0001", "verified"],
      ["reg#0002", null],
      ["reg#0003", null],
    ]);
    // Cited but never retrieved: surfaced, not silently dropped.
    expect(r.unsupported).toEqual(["reg#0009"]);
    expect(r.model).toBe("openai/gpt-oss-20b");
  });

  it("refuses a response outside evalgate's contract", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ answer: "trust me" })));
    await expect(askRegulation("anything")).rejects.toBeInstanceOf(RegulationError);
  });

  it("explains a rejected key and a busy service", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 401 }));
    await expect(askRegulation("q?")).rejects.toThrow(/EVALGATE_API_KEY/);
    fetchMock.mockResolvedValue(new Response("{}", { status: 429 }));
    await expect(askRegulation("q?")).rejects.toThrow(/busy/);
  });
});

describe("regulationHealth", () => {
  it("returns null rather than throwing when the service is down", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    expect(await regulationHealth()).toBeNull();
  });
});

describe("answer format", () => {
  it("splits an answer into text and citation markers", () => {
    expect(answerSegments("A [x#1] and B [y#2].")).toEqual([
      { text: "A " },
      { cite: "x#1" },
      { text: " and B " },
      { cite: "y#2" },
      { text: "." },
    ]);
  });

  it("recognises the synthetic corpus, which is not law", () => {
    expect(isSyntheticCorpus("cbam_synthetic")).toBe(true);
    expect(isSyntheticCorpus("cbam")).toBe(false);
  });
});
