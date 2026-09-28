import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Record and replay of model calls - the mechanism from evalgate
 * (github.com/aquiadi/CI-harness) that lets every pull request run the full
 * document-reading evaluation deterministically, in seconds, with no key and
 * no bill.
 *
 * A cassette is one JSON file per call: the request that was made and the
 * response that came back, committed and reviewable in a diff. It works at the
 * fetch level, so it covers the Groq client and the Anthropic SDK alike.
 *
 * - replay (the default): a call is served from its cassette. A call with no
 *   cassette is an error, never a network request - a changed prompt, model
 *   or schema shows up as a miss that asks for a re-recording, not as a
 *   silent live call or a surprise invoice.
 * - record: calls go to the API and each successful response is saved.
 * - live: calls go to the API and nothing is saved (the nightly run).
 */

export type CassetteMode = "replay" | "record" | "live";

export class CassetteMissError extends Error {
  constructor(readonly file: string) {
    super(
      `No cassette for this model call (${file}). The request changed - a prompt, model, schema or document. Re-record with: npm run eval:documents -- --record`,
    );
    this.name = "CassetteMissError";
  }
}

interface Cassette {
  recordedAt: string;
  key: string;
  request: { url: string; model: string | null; body: unknown };
  response: { status: number; contentType: string | null; body: string };
}

export interface CassetteSession {
  mode: CassetteMode;
  /** Requests replay could not serve. Any miss fails the run. */
  misses: string[];
  /** Cassettes written (record) or served (replay). */
  used: Set<string>;
  restore: () => void;
}

/** Long base64 payloads are kept out of the reviewable copy of the request. */
function redact(value: unknown): unknown {
  if (typeof value === "string") {
    return value.length > 400 && /^(data:[^,]+,)?[A-Za-z0-9+/=\s]+$/.test(value.slice(0, 400))
      ? `<${value.length} characters of base64, sha256 ${sha256(value).slice(0, 16)}>`
      : value;
  }
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redact(v)]));
  }
  return value;
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

function requestParts(input: string | URL | Request, init?: RequestInit) {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const body = typeof init?.body === "string" ? init.body : "";
  return { url, body };
}

/**
 * Replaces the global fetch for the rest of the run. Only POSTs to model APIs
 * go through cassettes; anything else passes through untouched.
 */
export function startCassettes(dir: string, mode: CassetteMode): CassetteSession {
  const realFetch = globalThis.fetch;
  const session: CassetteSession = {
    mode,
    misses: [],
    used: new Set(),
    restore: () => {
      globalThis.fetch = realFetch;
    },
  };

  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const { url, body } = requestParts(input, init);
    const host = new URL(url).hostname;
    const isModelCall = /(^|\.)(groq\.com|anthropic\.com)$/.test(host);
    if (!isModelCall || mode === "live") return realFetch(input, init);

    const key = sha256(`${url}\n${body}`);
    let parsed: { model?: string } = {};
    try {
      parsed = JSON.parse(body);
    } catch {
      // Not JSON; keyed on the raw body all the same.
    }
    const file = `${host.split(".").slice(-2, -1)[0]}-${key.slice(0, 16)}.json`;
    const path = join(dir, file);

    if (mode === "replay") {
      if (!existsSync(path)) {
        session.misses.push(file);
        throw new CassetteMissError(file);
      }
      const cassette = JSON.parse(readFileSync(path, "utf8")) as Cassette;
      session.used.add(file);
      return new Response(cassette.response.body, {
        status: cassette.response.status,
        headers: cassette.response.contentType
          ? { "content-type": cassette.response.contentType }
          : {},
      });
    }

    const res = await realFetch(input, init);
    // Rate limits and server errors are retried by the client; only a real
    // answer is worth keeping.
    if (res.ok) {
      const text = await res.clone().text();
      const cassette: Cassette = {
        recordedAt: new Date().toISOString(),
        key,
        request: { url, model: parsed.model ?? null, body: redact(parsed) },
        response: {
          status: res.status,
          contentType: res.headers.get("content-type"),
          body: text,
        },
      };
      mkdirSync(dir, { recursive: true });
      writeFileSync(path, JSON.stringify(cassette, null, 2) + "\n");
      session.used.add(file);
    }
    return res;
  };
  return session;
}

export function cassetteCount(dir: string): number {
  return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")).length : 0;
}
