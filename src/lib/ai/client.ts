import Anthropic from "@anthropic-ai/sdk";
import { env, hasModelKey } from "@/config/env";

/**
 * Model client access.
 *
 * The whole product is designed to degrade cleanly: if there is no key, every
 * AI step falls back to a deterministic implementation and the UI says so. That
 * is not a demo convenience - a compliance tool that stops working when an
 * upstream API is down is not a compliance tool.
 */

export const MODEL = env.CARBONPASS_MODEL;

let cached: Anthropic | null = null;

export function isAiAvailable(): boolean {
  return hasModelKey();
}

export function getClient(): Anthropic | null {
  if (!isAiAvailable()) return null;
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
  if (error instanceof Anthropic.AuthenticationError) return "The model API key was rejected.";
  if (error instanceof Anthropic.RateLimitError) return "Rate limited by the model API.";
  if (error instanceof Anthropic.BadRequestError) return `Request rejected: ${error.message}`;
  if (error instanceof Anthropic.APIConnectionError) return "Could not reach the model API.";
  if (error instanceof Anthropic.APIError) return `Model API error ${error.status}.`;
  return error instanceof Error ? error.message : "Unknown error.";
}
