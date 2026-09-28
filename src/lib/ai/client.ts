import Anthropic from "@anthropic-ai/sdk";
import { env, hasModelKey } from "@/config/env";
import { GroqError } from "./groq";

/**
 * Model client access.
 *
 * The whole product is designed to degrade cleanly: if there is no key, every
 * AI step falls back to a deterministic implementation and the UI says so. That
 * is not a demo convenience - a compliance tool that stops working when an
 * upstream API is down is not a compliance tool.
 *
 * Two providers: Anthropic (Claude) when ANTHROPIC_API_KEY is set, otherwise
 * Groq (free tier, open-weight models) when GROQ_API_KEY is set.
 */

export type AiProvider = "anthropic" | "groq";

export function aiProvider(): AiProvider | null {
  if (env.ANTHROPIC_API_KEY) return "anthropic";
  if (env.GROQ_API_KEY) return "groq";
  return null;
}

/** The model that answers text requests, for labels and provenance. */
export const MODEL = aiProvider() === "groq" ? env.GROQ_MODEL : env.CARBONPASS_MODEL;

/** A short name for the AI in use, for labels; null when there is none. */
export function aiLabel(): string | null {
  const provider = aiProvider();
  return provider === "groq" ? "Groq free tier" : provider === "anthropic" ? MODEL : null;
}

/**
 * Who receives documents and data when the AI is used, in words for the
 * people whose documents they are.
 */
export function aiProcessor(): string | null {
  const provider = aiProvider();
  return provider === "groq"
    ? "Groq (GroqCloud)"
    : provider === "anthropic"
      ? "Anthropic (Claude API)"
      : null;
}

/**
 * Whether the model proposes column mappings. On Groq's free model the
 * mapping eval found the rule-based mapper more accurate on materials - the
 * model filed DOLOCHAR, a fuel, as dolomite - so there the rule-based mapper
 * maps columns and the model is kept for reading documents, triage and the
 * memo. `npm run eval -- --model` still measures it, to revisit this.
 */
export function modelMapsColumns(): boolean {
  return aiProvider() === "anthropic";
}

export const RULE_BASED_ON_GROQ =
  "The rule-based mapper is used: on the mapping eval it was more accurate than the free Groq model.";

let cached: Anthropic | null = null;

export function isAiAvailable(): boolean {
  return hasModelKey();
}

/** The Anthropic client, when Anthropic is the provider. */
export function getClient(): Anthropic | null {
  if (!env.ANTHROPIC_API_KEY) return null;
  cached ??= new Anthropic({ maxRetries: 3 });
  return cached;
}

/** How an AI step ended up producing its answer. Rendered next to every inference. */
export interface AiOutcome {
  producedBy: "model" | "heuristic";
  model?: string;
  /** Populated when the model was tried and failed, so the UI can be honest. */
  fallbackReason?: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs?: number;
}

/**
 * Run a model call, falling back to a deterministic implementation on any
 * failure. Errors are classified rather than string-matched so the fallback
 * reason shown to the user is accurate.
 */
export async function withFallback<T>(
  attempt: () => Promise<{ value: T; outcome: AiOutcome }>,
  fallback: () => T,
): Promise<{ value: T; outcome: AiOutcome }> {
  if (!isAiAvailable()) {
    return {
      value: fallback(),
      outcome: { producedBy: "heuristic", fallbackReason: "No API key configured." },
    };
  }
  try {
    return await attempt();
  } catch (error) {
    return {
      value: fallback(),
      outcome: { producedBy: "heuristic", fallbackReason: describeError(error) },
    };
  }
}

export function describeError(error: unknown): string {
  if (error instanceof GroqError) return error.describe();
  if (error instanceof Anthropic.AuthenticationError) return "The model API key was rejected.";
  if (error instanceof Anthropic.RateLimitError) return "Rate limited by the model API.";
  if (error instanceof Anthropic.BadRequestError) return `Request rejected: ${error.message}`;
  if (error instanceof Anthropic.APIConnectionError) return "Could not reach the model API.";
  if (error instanceof Anthropic.APIError) return `Model API error ${error.status}.`;
  return error instanceof Error ? error.message : "Unknown error.";
}
