import type Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type * as z from "zod/v4";
import { aiProvider, getClient, MODEL } from "./client";
import { groqDocumentContent, groqObject } from "./groq";

/**
 * One structured answer from whichever provider is configured.
 *
 * Callers describe what they want (a system prompt, a text prompt or a
 * document, a zod schema) and get back the validated value or the reason
 * there is none. Which API answered, and how the document had to be sent to
 * it, stays in here.
 */

export interface DocumentPrompt {
  bytes: Uint8Array;
  mediaType: string;
  kind: "pdf" | "image" | "text";
  fileName: string;
  /** The document's text layer, when it has one. */
  text: string | null;
  instruction: string;
}

export interface StructuredAnswer<T> {
  value: T | null;
  stop: "done" | "refusal" | "max_tokens";
  model: string;
  inputTokens?: number;
  outputTokens?: number;
}

export async function structured<S extends z.ZodType>(args: {
  /** A short identifier for the answer, e.g. "document_reading". */
  name: string;
  system: string;
  prompt: string | DocumentPrompt;
  schema: S;
}): Promise<StructuredAnswer<z.infer<S>>> {
  if (aiProvider() === "groq") {
    const { content, vision } =
      typeof args.prompt === "string"
        ? { content: args.prompt, vision: false }
        : groqDocumentContent(args.prompt);
    const answer = await groqObject({
      name: args.name,
      system: args.system,
      content,
      schema: args.schema,
      vision,
    });
    return { ...answer, stop: answer.truncated ? "max_tokens" : "done" };
  }

  const client = getClient();
  if (!client) throw new Error("The AI model is not available.");
  const response =
    typeof args.prompt === "string"
      ? await client.messages.parse({
          model: MODEL,
          max_tokens: 16000,
          system: args.system,
          thinking: { type: "adaptive" },
          messages: [{ role: "user", content: args.prompt }],
          output_config: { format: zodOutputFormat(args.schema) },
        })
      : await client.beta.messages.parse({
          model: MODEL,
          max_tokens: 16000,
          // A declined request is re-run server-side on Anthropic's recommended
          // fallback model instead of coming back empty.
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          thinking: { type: "adaptive" },
          system: args.system,
          messages: [{ role: "user", content: anthropicDocumentContent(args.prompt) }],
          output_config: { format: betaZodOutputFormat(args.schema) },
        });
  return {
    value: (response.parsed_output ?? null) as z.infer<S> | null,
    stop:
      response.stop_reason === "refusal"
        ? "refusal"
        : response.stop_reason === "max_tokens"
          ? "max_tokens"
          : "done",
    model: response.model ?? MODEL,
    inputTokens: response.usage?.input_tokens,
    outputTokens: response.usage?.output_tokens,
  };
}

/** The document as a Claude content block, followed by the instruction. */
function anthropicDocumentContent(doc: DocumentPrompt): Anthropic.Beta.BetaContentBlockParam[] {
  const data = Buffer.from(doc.bytes).toString("base64");
  const source: Anthropic.Beta.BetaContentBlockParam =
    doc.kind === "pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
      : doc.kind === "text"
        ? {
            type: "document",
            source: {
              type: "text",
              media_type: "text/plain",
              data: new TextDecoder().decode(doc.bytes),
            },
          }
        : {
            type: "image",
            source: {
              type: "base64",
              media_type: doc.mediaType as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
              data,
            },
          };
  return [source, { type: "text", text: `File name: ${doc.fileName}\n${doc.instruction}` }];
}
