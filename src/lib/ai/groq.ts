import * as z from "zod/v4";
import { env } from "@/config/env";

/**
 * Groq: the free way to run the AI steps.
 *
 * Groq serves open-weight models behind an OpenAI-compatible API with a free
 * tier. Two differences from Claude shape what this module does:
 *
 * - There is no PDF input. A PDF is sent as its text layer, which is also what
 *   every figure is checked against afterwards. A scanned PDF has no text
 *   layer; the reader is told to upload photos of the pages instead.
 * - Photos need a model that accepts images, which is a different (smaller)
 *   model from the one that handles text, so images go to GROQ_VISION_MODEL.
 *
 * Structured output uses a JSON schema generated from the same zod schema the
 * Claude path uses, and the answer is validated against that schema again
 * here: nothing the model returns is trusted because the request asked
 * nicely.
 */

const BASE_URL = "https://api.groq.com/openai/v1";

/** Groq's limit for an image sent inline. */
export const GROQ_MAX_IMAGE_BYTES = 4 * 1024 * 1024;

/** How much of a PDF's text is sent. Free-tier token limits are small. */
const MAX_DOCUMENT_CHARS = 24_000;

export class GroqError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = "GroqError";
  }

  /** A sentence for the person using the app. */
  describe(): string {
    if (this.status === null) return this.message;
    if (this.status === 401) return "The Groq API key was rejected.";
    if (this.status === 429) {
      return "Groq's free-tier limit was reached. Wait a minute and try again, or enter the figures by hand.";
    }
    if (this.status === 413) {
      return "Too much for Groq's free tier in one request. Split the document, or enter the figures by hand.";
    }
    return `Groq API error ${this.status}: ${this.message}`;
  }
}

type Part = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
export type GroqContent = string | Part[];

interface ChatCompletion {
  model: string;
  choices: { finish_reason: string; message: { content: string | null } }[];
  usage?: { prompt_tokens: number; completion_tokens: number };
}

async function post(body: Record<string, unknown>): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
      // fetch rejects with a TypeError when the network fails; anything else
      // (a replay harness refusing an unrecorded call, say) keeps its message.
      if (!(error instanceof TypeError)) throw error;
      throw new GroqError("Could not reach the Groq API.", null);
    }
    if (res.ok) return res;

    // Retry a server error, or a per-minute rate limit: the free tier allows
    // a few thousand tokens a minute, so a second request often has to wait
    // a little. A longer wait (a daily limit) is reported instead.
    const retryAfter = Number(res.headers.get("retry-after"));
    const wait = res.status === 429 ? retryAfter : 2;
    if (attempt < 3 && (res.status >= 500 || res.status === 429) && wait > 0 && wait <= 30) {
      await new Promise((resolve) => setTimeout(resolve, wait * 1000));
      continue;
    }
    let message = res.statusText;
    try {
      const data = (await res.json()) as { error?: { message?: string } };
      message = data.error?.message ?? message;
    } catch {
      // Keep the status text.
    }
    throw new GroqError(message, res.status);
  }
}

const UNSUPPORTED = new Set([
  "$schema",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "minLength",
  "maxLength",
  "minItems",
  "maxItems",
  "pattern",
  "format",
  "default",
]);

/**
 * The JSON schema for a zod schema, in the strict form Groq's constrained
 * decoding accepts: every property required (nullable where optional),
 * no additional properties, and no numeric or length bounds. The bounds are
 * still enforced - by zod, on the answer.
 */
export function strictJsonSchema(schema: z.ZodType): Record<string, unknown> {
  return tighten(z.toJSONSchema(schema)) as Record<string, unknown>;
}

function tighten(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(tighten);
  if (!node || typeof node !== "object") return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (UNSUPPORTED.has(key)) continue;
    out[key] =
      key === "properties"
        ? Object.fromEntries(
            Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, tighten(v)]),
          )
        : tighten(value);
  }
  if (out.type === "object" && out.properties) {
    out.required = Object.keys(out.properties);
    out.additionalProperties = false;
  }
  return out;
}

/** The JSON object in a model's answer, tolerating a code fence around it. */
function jsonIn(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

export interface GroqAnswer<T> {
  value: T | null;
  truncated: boolean;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
}

/** One structured answer, validated against `schema`. */
export async function groqObject<S extends z.ZodType>(args: {
  name: string;
  system: string;
  content: GroqContent;
  schema: S;
  vision?: boolean;
  maxTokens?: number;
}): Promise<GroqAnswer<z.infer<S>>> {
  const model = args.vision ? env.GROQ_VISION_MODEL : env.GROQ_MODEL;
  // Only the gpt-oss models decode strictly against a schema on Groq; the
  // others follow it on a best-effort basis, which the validation below backs.
  const strict = model.startsWith("openai/gpt-oss");
  const res = await post({
    model,
    temperature: 0,
    max_completion_tokens: args.maxTokens ?? 8192,
    ...(strict ? { reasoning_effort: "medium", include_reasoning: false } : {}),
    messages: [
      {
        role: "system",
        content: `${args.system}\n\nAnswer with a single JSON object that matches the schema you were given.`,
      },
      { role: "user", content: args.content },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: args.name, schema: strictJsonSchema(args.schema), strict },
    },
  });
  const data = (await res.json()) as ChatCompletion;
  const choice = data.choices[0];
  const usage = {
    model: data.model ?? model,
    inputTokens: data.usage?.prompt_tokens,
    outputTokens: data.usage?.completion_tokens,
  };
  if (!choice || choice.finish_reason === "length") {
    return { value: null, truncated: true, ...usage };
  }
  const parsed = args.schema.safeParse(jsonIn(choice.message.content ?? ""));
  return { value: parsed.success ? parsed.data : null, truncated: false, ...usage };
}

/** Streams a plain-text answer. */
export async function* groqStream(args: {
  system: string;
  prompt: string;
  maxTokens?: number;
}): AsyncGenerator<string> {
  const model = env.GROQ_MODEL;
  const res = await post({
    model,
    stream: true,
    temperature: 0.2,
    max_completion_tokens: args.maxTokens ?? 8192,
    ...(model.startsWith("openai/gpt-oss")
      ? { reasoning_effort: "medium", include_reasoning: false }
      : {}),
    messages: [
      { role: "system", content: args.system },
      { role: "user", content: args.prompt },
    ],
  });
  if (!res.body) throw new GroqError("Groq returned an empty stream.", null);
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    buffer += value;
    let newline: number;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") return;
      let chunk: {
        choices?: { delta?: { content?: string } }[];
        error?: { message?: string };
      };
      try {
        chunk = JSON.parse(payload);
      } catch {
        continue;
      }
      if (chunk.error) throw new GroqError(chunk.error.message ?? "Stream error.", 500);
      const text = chunk.choices?.[0]?.delta?.content;
      if (text) yield text;
    }
  }
}

/**
 * A document as Groq can take it: photos as images for the vision model,
 * PDFs and text files as their text. Throws a GroqError with a sentence for
 * the reader when the document cannot be sent.
 */
export function groqDocumentContent(doc: {
  bytes: Uint8Array;
  mediaType: string;
  kind: "pdf" | "image" | "text";
  fileName: string;
  text: string | null;
  instruction: string;
}): { content: GroqContent; vision: boolean } {
  if (doc.kind === "image") {
    if (doc.bytes.byteLength > GROQ_MAX_IMAGE_BYTES) {
      throw new GroqError(
        "This photo is larger than the free model accepts (4 MB). Take it at a lower resolution, or enter the figures by hand.",
        null,
      );
    }
    const data = Buffer.from(doc.bytes).toString("base64");
    return {
      vision: true,
      content: [
        { type: "text", text: `File name: ${doc.fileName}\n${doc.instruction}` },
        { type: "image_url", image_url: { url: `data:${doc.mediaType};base64,${data}` } },
      ],
    };
  }
  const text = doc.text?.trim();
  if (!text) {
    throw new GroqError(
      "This PDF has no text layer (it is a scan), and the free model cannot read scanned PDFs. Upload a photo of each page (JPEG or PNG) instead, or enter the figures by hand.",
      null,
    );
  }
  const clipped = text.length > MAX_DOCUMENT_CHARS;
  return {
    vision: false,
    content:
      `File name: ${doc.fileName}\n\n` +
      `The document's text, as extracted from the file. Layout may be lost; figures are as printed.` +
      (clipped ? ` Only the first ${MAX_DOCUMENT_CHARS} characters are included.` : "") +
      `\n\n<document>\n${text.slice(0, MAX_DOCUMENT_CHARS)}\n</document>\n\n${doc.instruction}`,
  };
}
