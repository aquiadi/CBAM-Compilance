import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The built-in rulebook behind "Ask the regulation" when no evalgate service
 * is connected: what it retrieves, and how answers and citations are handled.
 */

const structured = vi.fn();
let aiOn = false;

vi.mock("./ai/generate", () => ({ structured: (...a: unknown[]) => structured(...a) }));
vi.mock("./ai/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./ai/client")>();
  return { ...actual, isAiAvailable: () => aiOn, aiProvider: () => (aiOn ? "groq" : null) };
});

const { askRulebook, rulebook, searchRulebook } = await import("./rulebook");

beforeEach(() => {
  structured.mockReset();
  aiOn = false;
});

describe("rulebook passages", () => {
  it("states the CBAM factor from the engine's own table", () => {
    const factor = rulebook().find((e) => e.id === "rb#cbam-factor")!;
    expect(factor.text).toContain("2027: 95%");
    expect(factor.text).toContain("2034: 0%");
  });

  it("finds the obligation for a question about certificates", () => {
    const ids = searchRulebook("How is the number of CBAM certificates calculated?").map(
      (e) => e.id,
    );
    expect(ids).toContain("rb#obligation");
  });

  it("finds the declaration deadline", () => {
    const top = searchRulebook("When is the first annual declaration due?")[0]!;
    expect(top.text).toContain("30 September 2027");
  });
});

describe("askRulebook", () => {
  it("without an AI, returns the matching passages to read", async () => {
    const r = await askRulebook("What is the default value mark-up in 2027?");
    expect(r.model).toBe("none");
    expect(r.passages.map((p) => p.chunkId)).toContain("rb#markup");
    expect(r.passages.every((p) => p.cited === null)).toBe(true);
  });

  it("with an AI, keeps citations to retrieved passages and flags any other", async () => {
    aiOn = true;
    structured.mockResolvedValue({
      value: {
        answer:
          "Surrender certificates for embedded emissions minus the free allocation adjustment [rb#obligation]. Also see [rb#made-up].",
      },
      stop: "done",
      model: "openai/gpt-oss-120b",
    });
    const r = await askRulebook("How many CBAM certificates must be surrendered?");
    const request = structured.mock.calls[0]![0];
    expect(request.prompt).toContain("[rb#obligation]");
    expect(r.passages.find((p) => p.chunkId === "rb#obligation")?.cited).toBe("verified");
    expect(r.unsupported).toEqual(["rb#made-up"]);
    expect(r.model).toBe("openai/gpt-oss-120b");
  });

  it("falls back to the passages when the model fails", async () => {
    aiOn = true;
    structured.mockRejectedValue(new Error("rate limited"));
    const r = await askRulebook("What is the CBAM factor for 2030?");
    expect(r.model).toBe("none");
    expect(r.passages.length).toBeGreaterThan(0);
  });

  it("says so when nothing matches", async () => {
    const r = await askRulebook("zzzz qqqq");
    expect(r.passages).toEqual([]);
    expect(r.answer).toMatch(/Nothing in the built-in rulebook/);
  });
});
