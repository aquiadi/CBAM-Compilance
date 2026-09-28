import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawExtraction } from "./extract";

/**
 * The Groq path, with fetch stubbed: the request that is sent (schema,
 * model, how the document travels), how each kind of answer is handled, and
 * the memo stream. No network, no key.
 */

vi.mock("./client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./client")>();
  return { ...actual, aiProvider: () => "groq", isAiAvailable: () => true };
});

const { extractDocument, ExtractionSchema } = await import("./extract");
const { GroqError, groqDocumentContent, groqStream, strictJsonSchema } = await import("./groq");

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const reading: RawExtraction = {
  documentType: "fuel_invoice",
  issuer: "Indian Oil",
  documentNumber: "INV-7",
  documentDate: "2026-04-02",
  billingPeriod: null,
  warnings: [],
  lines: [
    {
      description: "HSD",
      category: "fuel",
      quantity: 12.5,
      unit: "KL",
      date: "2026-03",
      cnCode: null,
      supplySource: null,
      evidence: "HSD 12.5 KL",
      page: null,
      confidence: 0.9,
    },
  ],
};

function completion(content: string, finish = "stop") {
  return new Response(
    JSON.stringify({
      model: "openai/gpt-oss-120b",
      choices: [{ finish_reason: finish, message: { content } }],
      usage: { prompt_tokens: 900, completion_tokens: 120 },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

const invoice = {
  bytes: new TextEncoder().encode("Tax invoice INV-7\nHSD 12.5 KL @ 89,000"),
  mediaType: "text/plain" as const,
  fileName: "invoice.txt",
};

describe("strictJsonSchema", () => {
  it("requires every property, forbids extras and drops bounds zod enforces itself", () => {
    const schema = strictJsonSchema(ExtractionSchema) as {
      required: string[];
      additionalProperties: boolean;
      properties: Record<string, unknown>;
    };
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(Object.keys(schema.properties));
    expect(schema.required).toContain("billingPeriod");
    expect(JSON.stringify(schema)).not.toMatch(/"(minimum|maximum|\$schema)"/);
    const line = (schema.properties.lines as { items: { required: string[] } }).items;
    expect(line.required).toContain("evidence");
  });
});

describe("extractDocument with Groq", () => {
  it("sends the document text with a JSON schema and cross-checks the answer", async () => {
    fetchMock.mockResolvedValue(completion(JSON.stringify(reading)));
    const { extraction, outcome } = await extractDocument(invoice);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    const body = JSON.parse(init.body);
    expect(body.model).toBe("openai/gpt-oss-120b");
    expect(body.response_format).toMatchObject({
      type: "json_schema",
      json_schema: { name: "document_reading", strict: true },
    });
    expect(body.messages[1].content).toContain("HSD 12.5 KL");

    expect(outcome).toMatchObject({ producedBy: "model", model: "openai/gpt-oss-120b" });
    expect(extraction.lines[0]).toMatchObject({ quantity: 12.5, unit: "KL", check: "found" });
  });

  it("sends a photo to the vision model as an image", async () => {
    fetchMock.mockResolvedValue(completion("```json\n" + JSON.stringify(reading) + "\n```"));
    const photo = {
      bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
      mediaType: "image/jpeg" as const,
      fileName: "slip.jpg",
    };
    const { extraction } = await extractDocument(photo);
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.model).toBe("qwen/qwen3.8-27b");
    expect(body.response_format.json_schema.strict).toBe(false);
    expect(body.messages[1].content[1].image_url.url).toMatch(/^data:image\/jpeg;base64,/);
    // The answer was fenced; it is still read, and a photo cannot be text-checked.
    expect(extraction.lines[0]).toMatchObject({ quantity: 12.5, check: "no_text" });
  });

  it("refuses an answer that does not match the schema", async () => {
    fetchMock.mockResolvedValue(completion(JSON.stringify({ lines: "twelve" })));
    const { extraction, outcome } = await extractDocument(invoice);
    expect(extraction.lines).toEqual([]);
    expect(outcome.producedBy).toBe("heuristic");
    expect(extraction.warnings[0]).toMatch(/could not be read/);
  });

  it("reports a cut-off answer as too long", async () => {
    fetchMock.mockResolvedValue(completion('{"lines": [', "length"));
    const { extraction } = await extractDocument(invoice);
    expect(extraction.warnings[0]).toMatch(/too long/);
  });

  it("explains a daily rate limit instead of waiting it out", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "Rate limit reached" } }), {
        status: 429,
        headers: { "retry-after": "3600" },
      }),
    );
    const { extraction } = await extractDocument(invoice);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(extraction.warnings[0]).toMatch(/free-tier limit/);
  });
});

describe("groqDocumentContent", () => {
  it("asks for photos when a PDF is a scan with no text", () => {
    expect(() =>
      groqDocumentContent({
        bytes: new Uint8Array([1]),
        mediaType: "application/pdf",
        kind: "pdf",
        fileName: "scan.pdf",
        text: null,
        instruction: "Read it.",
      }),
    ).toThrow(GroqError);
  });

  it("refuses a photo over Groq's size limit with a reason", () => {
    try {
      groqDocumentContent({
        bytes: new Uint8Array(4 * 1024 * 1024 + 1),
        mediaType: "image/png",
        kind: "image",
        fileName: "big.png",
        text: null,
        instruction: "Read it.",
      });
      expect.unreachable();
    } catch (error) {
      expect((error as InstanceType<typeof GroqError>).describe()).toMatch(/4 MB/);
    }
  });
});

describe("groqStream", () => {
  it("yields the text of each streamed chunk", async () => {
    const events = [
      'data: {"choices":[{"delta":{"content":"## Scope"}}]}',
      'data: {"choices":[{"delta":{"content":" and boundary"}}]}',
      'data: {"choices":[{"delta":{}}]}',
      "data: [DONE]",
    ];
    fetchMock.mockResolvedValue(new Response(events.join("\n\n") + "\n\n", { status: 200 }));
    let text = "";
    for await (const chunk of groqStream({ system: "s", prompt: "p" })) text += chunk;
    expect(text).toBe("## Scope and boundary");
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body).stream).toBe(true);
  });
});
