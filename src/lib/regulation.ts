import * as z from "zod/v4";
import { env } from "@/config/env";
import { MARKER } from "./regulation-format";

/**
 * "Ask the regulation", answered by an evalgate service
 * (github.com/aquiadi/CI-harness).
 *
 * evalgate retrieves passages from the CBAM texts it indexes, writes an answer
 * that cites them as [chunk#id] markers, and checks each citation against what
 * it retrieved. Its quality is gated in its own CI: retrieval recall, judged
 * groundedness and citation correctness against a frozen baseline. CarbonPass
 * only relays the question and renders the answer with its passages; it adds
 * nothing to the answer path, so what evalgate measured is what the reader
 * gets.
 *
 * The response is validated against evalgate's contract (serve/schemas.py),
 * so a changed or foreign service fails loudly instead of rendering nonsense.
 */

const ChunkSchema = z.object({
  chunk_id: z.string(),
  doc_id: z.string(),
  doc_title: z.string(),
  section: z.string().nullable(),
  rank: z.number(),
  score: z.number(),
  text: z.string(),
});

const QueryResponseSchema = z.object({
  answer: z.string(),
  citations: z.array(z.object({ chunk_id: z.string(), valid: z.boolean() })),
  retrieval: z.object({ retriever: z.string(), k: z.number(), chunks: z.array(ChunkSchema) }),
  latency: z.object({ total_s: z.number() }),
  provenance: z.object({
    corpus: z.string(),
    corpus_hash: z.string(),
    generator_model: z.string(),
    replayed: z.boolean(),
  }),
});

const HealthSchema = z.object({
  status: z.string(),
  corpus: z.string(),
  corpus_hash: z.string(),
  chunks: z.number(),
  retriever: z.string(),
  generator_model: z.string(),
});

export type RegulationHealth = z.infer<typeof HealthSchema>;

export interface Passage {
  chunkId: string;
  docTitle: string;
  section: string | null;
  text: string;
  /** Whether the answer cites it, and whether evalgate verified that citation. */
  cited: "verified" | "unsupported" | null;
}

export interface RegulationAnswer {
  answer: string;
  passages: Passage[];
  /** Cited chunk ids that are not among the retrieved passages - evalgate marks these invalid. */
  unsupported: string[];
  corpus: string;
  corpusHash: string;
  model: string;
  retriever: string;
  seconds: number;
}

export class RegulationError extends Error {}

export function regulationConfigured(): boolean {
  return Boolean(env.EVALGATE_URL);
}

/** Whether the corpus being served is evalgate's synthetic test corpus, which is not law. */
export function isSyntheticCorpus(corpus: string): boolean {
  return /synthetic/i.test(corpus);
}

async function call(path: string, init: RequestInit = {}, timeoutMs = 60_000): Promise<unknown> {
  if (!env.EVALGATE_URL) throw new RegulationError("The regulation service is not configured.");
  const url = new URL(
    path,
    env.EVALGATE_URL.endsWith("/") ? env.EVALGATE_URL : `${env.EVALGATE_URL}/`,
  );
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(env.EVALGATE_API_KEY ? { "x-api-key": env.EVALGATE_API_KEY } : {}),
      },
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
  } catch {
    throw new RegulationError("The regulation service could not be reached.");
  }
  if (res.status === 429)
    throw new RegulationError("The regulation service is busy. Try again in a minute.");
  if (res.status === 401 || res.status === 403) {
    throw new RegulationError("The regulation service refused the key (EVALGATE_API_KEY).");
  }
  if (!res.ok)
    throw new RegulationError(`The regulation service answered with an error (${res.status}).`);
  return res.json();
}

export async function regulationHealth(): Promise<RegulationHealth | null> {
  try {
    const parsed = HealthSchema.safeParse(await call("health", {}, 5_000));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function askRegulation(question: string): Promise<RegulationAnswer> {
  const raw = await call("query", { method: "POST", body: JSON.stringify({ question }) });
  const parsed = QueryResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new RegulationError("The regulation service returned an answer in an unexpected shape.");
  }
  const r = parsed.data;
  const validity = new Map(r.citations.map((c) => [c.chunk_id, c.valid]));
  const cited = new Set([...r.answer.matchAll(MARKER)].map((m) => m[1]!));
  const retrieved = new Set(r.retrieval.chunks.map((c) => c.chunk_id));
  return {
    answer: r.answer,
    passages: [...r.retrieval.chunks]
      .sort((a, b) => a.rank - b.rank)
      .map((c) => ({
        chunkId: c.chunk_id,
        docTitle: c.doc_title,
        section: c.section,
        text: c.text,
        cited: cited.has(c.chunk_id)
          ? validity.get(c.chunk_id) === false
            ? "unsupported"
            : "verified"
          : null,
      })),
    unsupported: [...cited].filter((id) => !retrieved.has(id) || validity.get(id) === false),
    corpus: r.provenance.corpus,
    corpusHash: r.provenance.corpus_hash,
    model: r.provenance.generator_model,
    retriever: `${r.retrieval.retriever} (k=${r.retrieval.k})`,
    seconds: r.latency.total_s,
  };
}
