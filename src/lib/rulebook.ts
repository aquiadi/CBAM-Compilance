import * as z from "zod/v4";
import { aiProvider, isAiAvailable } from "./ai/client";
import { structured } from "./ai/generate";
import { GOODS, SECTOR_LABELS } from "./cbam/goods";
import { RULE_CATALOGUE } from "./cbam/rules";
import {
  CBAM_FACTOR,
  CSCF,
  defaultValueMarkup,
  PUBLISHED_CERTIFICATE_PRICES,
  REGULATORY_SOURCES,
  ROUTE_INDICATORS,
  type Sector,
} from "./cbam/regulatory";
import type { Passage, RegulationAnswer } from "./regulation";

/**
 * The built-in rulebook: "Ask the regulation" without an evalgate service.
 *
 * The passages are the rules this engine already applies - the acts it
 * implements, the CBAM factor and CSCF per year, the default-value mark-ups,
 * the published certificate prices, how the obligation is calculated - taken
 * from the same tables and statements the Methodology page shows. Nothing here
 * is new legal text; each passage names the act it comes from.
 *
 * An answer is drafted by whichever AI is configured, from the passages that
 * match the question, and must cite them as [rb#id]. Citations to a passage
 * that was not retrieved are marked unsupported, exactly as evalgate does.
 * With no AI configured, the matching passages are returned on their own.
 */

interface RulebookEntry {
  id: string;
  source: string;
  section: string | null;
  text: string;
}

const pct = (x: number) => `${Math.round(x * 1000) / 10}%`;

function entries(): RulebookEntry[] {
  const out: RulebookEntry[] = [];
  const add = (id: string, source: string, section: string | null, text: string) =>
    out.push({ id: `rb#${id}`, source, section, text });

  add(
    "cbam-regulation",
    "Regulation (EU) 2023/956, as amended by Regulation (EU) 2025/2083",
    "Scope and annexes",
    "Regulation (EU) 2023/956, as amended by Regulation (EU) 2025/2083, establishes the carbon border adjustment mechanism. Annex I lists the goods in scope; Annex II lists the goods for which only direct emissions count towards the obligation (iron and steel, aluminium and hydrogen); Annex IV sets out how specific embedded emissions and precursors are calculated. The simplification added a 50-tonne annual threshold per importer and moved the first annual CBAM declaration to 30 September 2027.",
  );
  add(
    "roles",
    "Regulation (EU) 2023/956",
    "Who does what",
    "The authorised CBAM declarant - the EU importer - files the annual CBAM declaration in the CBAM Registry and surrenders CBAM certificates for the embedded emissions of the goods it imported. An accredited verifier verifies the installation operator's emissions. Actual values can be used by the declarant only once verified; without them the declarant must use the Commission's default values.",
  );
  add(
    "obligation",
    "Implementing Regulation (EU) 2025/2620 with Regulation (EU) 2023/956",
    "The certificate obligation",
    "The number of CBAM certificates to surrender is the embedded emissions of the imported goods minus the free allocation adjustment: (specific embedded emissions minus the specific embedded free allocation, SEFA) multiplied by the tonnes imported, less any carbon price effectively paid in the country of origin under Article 9.",
  );
  add(
    "see",
    "Implementing Regulation (EU) 2025/2547, Annex IV of Regulation (EU) 2023/956",
    "Specific embedded emissions",
    "Specific embedded emissions (SEE) of a good are the attributed emissions of its production process plus the embedded emissions of its relevant precursors, divided by the activity level of the process. Where one process yields more than one CN code, attributed emissions are allocated across them by mass. Direct emissions cover fuel combustion, process emissions from carbonate and carbon-bearing materials, and measurable heat; indirect emissions are electricity consumed multiplied by the emission factor of the supply.",
  );
  add(
    "precursors",
    "Implementing Regulations (EU) 2025/2547 and 2025/2621",
    "Precursors and default values",
    "A precursor is an input good that is itself in CBAM scope, such as sponge iron (DRI) used to make steel. Its embedded emissions are carried into the good made from it. Precursors bought without verified supplier data carry the Commission's default value for their country of production, increased by the mark-up for the production year.",
  );
  add(
    "sefa",
    "Implementing Regulation (EU) 2025/2620; Guidance Document 4 (DG TAXUD)",
    "Free allocation adjustment",
    "The specific embedded free allocation (SEFA) of a good is the CBAM factor times the cross-sectoral correction factor (CSCF) times the process benchmark (column A of the benchmark table when actual data are used, column B with default values), plus the free allocation embedded in its precursors per tonne of good. The production route selects the benchmark, so a wrong route gives a wrong SEFA.",
  );
  add(
    "cbam-factor",
    "Implementing Regulation (EU) 2025/2620; Guidance Document 4, Table 2-1",
    "CBAM factor by year",
    `The CBAM factor is the share of EU free allocation still granted, and it multiplies the benchmark in the free allocation adjustment: ${Object.entries(
      CBAM_FACTOR,
    )
      .map(([y, f]) => `${y}: ${pct(f)}`)
      .join(", ")}. It reaches zero in 2034, when the free allocation adjustment ends.`,
  );
  add(
    "cscf",
    "Guidance Document 4 (DG TAXUD), Table 2-1",
    "Cross-sectoral correction factor",
    `The cross-sectoral correction factor (CSCF) applied is ${Object.entries(CSCF)
      .map(([y, c]) => `${y}: ${c.value}${c.preliminary ? " (preliminary)" : ""}`)
      .join(", ")}.`,
  );
  const sectors: Sector[] = [
    "iron_steel",
    "aluminium",
    "cement",
    "hydrogen",
    "fertilisers",
    "electricity",
  ];
  add(
    "markup",
    "Implementing Regulation (EU) 2025/2621 (as corrected by 2026/1740)",
    "Default-value mark-up",
    `Default values carry a mark-up by production year. ${sectors
      .map(
        (s) =>
          `${SECTOR_LABELS[s]}: ${[2026, 2027, 2028].map((y) => `${y} ${pct(defaultValueMarkup(s, y))}`).join(", ")}`,
      )
      .join("; ")}.`,
  );
  add(
    "prices",
    REGULATORY_SOURCES.certificatePrice.act,
    "Certificate prices",
    `${REGULATORY_SOURCES.certificatePrice.act} sets how the Commission calculates and publishes the price of CBAM certificates; for 2026 it is published quarterly. Published prices: ${PUBLISHED_CERTIFICATE_PRICES.map(
      (p) => `${p.quarter} EUR ${p.priceEur} (published ${p.published})`,
    ).join("; ")}. ${REGULATORY_SOURCES.certificatePrice.caveat}`,
  );
  add(
    "article-9",
    "Regulation (EU) 2023/956, Article 9",
    "Carbon price paid in the country of origin",
    "Article 9 allows a deduction for a carbon price effectively paid in the country of origin. It requires documentary evidence of the price paid and confirmation that no export rebate or other compensation was received.",
  );
  add(
    "routes",
    REGULATORY_SOURCES.benchmarks.act,
    "Production routes",
    `The benchmark table distinguishes production routes by indicator: ${Object.entries(
      ROUTE_INDICATORS,
    )
      .map(([k, v]) => `${k} - ${v}`)
      .join("; ")}.`,
  );
  const bySector = new Map<string, number>();
  for (const g of GOODS) bySector.set(g.sector, (bySector.get(g.sector) ?? 0) + 1);
  add(
    "goods",
    "Regulation (EU) 2023/956, Annex I",
    "Goods in scope",
    `CBAM covers ${GOODS.length} CN codes: ${[...bySector]
      .map(([s, n]) => `${SECTOR_LABELS[s as Sector] ?? s} (${n})`)
      .join(", ")}. Goods are identified at the 8-digit CN level.`,
  );
  add(
    "verification",
    REGULATORY_SOURCES.verification.act,
    REGULATORY_SOURCES.verification.title,
    `${REGULATORY_SOURCES.verification.act} set the verification principles and the accreditation and verification requirements for verifiers of installation emissions. ${REGULATORY_SOURCES.verification.caveat}`,
  );
  for (const key of [
    "methodology",
    "benchmarks",
    "defaultValues",
    "guidanceFreeAllocation",
    "guidanceMethods",
  ] as const) {
    const s = REGULATORY_SOURCES[key];
    add(
      `source-${key}`,
      s.act,
      s.title,
      `${s.act}: ${s.title} (${s.publisher}, version ${s.version}; ${s.table}). ${s.caveat}`,
    );
  }
  add(
    "factors",
    "IPCC 2006 Guidelines, Volume 2; CEA CO2 Baseline Database",
    "Emission factors",
    "Default combustion emission factors and net calorific values come from the IPCC 2006 Guidelines, Volume 2. Indian grid emission factors come from the Central Electricity Authority's CO2 Baseline Database. Plant-measured values override defaults and raise the monitoring tier.",
  );
  add(
    "quality-rules",
    "CarbonPass data-quality rules",
    "Checks run on every calculation",
    `CarbonPass runs ${RULE_CATALOGUE.length} data-quality rules on every recalculation: ${RULE_CATALOGUE.map(
      (r) => `${r.code} ${r.title} (${r.severity})`,
    ).join(
      "; ",
    )}. Blockers must be fixed or excluded with a recorded reason before a declaration is filable.`,
  );
  return out;
}

let cache: RulebookEntry[] | null = null;
export function rulebook(): RulebookEntry[] {
  cache ??= entries();
  return cache;
}

const STOP = new Set(
  "a an and are as at be by can do does for from how i if in is it its me my of on or the this to was what when where which who why will with you your".split(
    " ",
  ),
);

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9%.]+/g, " ")
    .split(" ")
    .map((t) => t.replace(/\.$/, ""))
    .filter((t) => t.length > 1 && !STOP.has(t))
    .map((t) => (t.length > 4 ? t.replace(/(ies|es|s)$/, "") : t));
}

/** The passages that share the most (rarer) words with the question. */
export function searchRulebook(question: string, k = 5): RulebookEntry[] {
  const all = rulebook();
  const docs = all.map((e) => new Set(tokens(`${e.section ?? ""} ${e.source} ${e.text}`)));
  const df = new Map<string, number>();
  for (const d of docs) for (const t of d) df.set(t, (df.get(t) ?? 0) + 1);
  const q = [...new Set(tokens(question))];
  return all
    .map((e, i) => ({
      e,
      score: q.reduce(
        (s, t) => (docs[i]!.has(t) ? s + Math.log(1 + all.length / (df.get(t) ?? 1)) : s),
        0,
      ),
    }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((r) => r.e);
}

const AnswerSchema = z.object({
  answer: z
    .string()
    .describe(
      "The answer in plain English, citing each sentence with the [rb#id] marker of the passage it comes from.",
    ),
});

const SYSTEM = `You answer questions about the EU Carbon Border Adjustment Mechanism for the operators of plants that export to the EU, mostly in India.

Answer ONLY from the passages you are given. After each sentence, cite the passage it comes from with its marker exactly as given, e.g. [rb#obligation]. Never cite a marker you were not given.
If the passages do not answer the question, say so in one sentence and suggest what to check instead - do not answer from your own knowledge.
Plain words, short: two to five sentences. This explains the rules; it is not legal advice.`;

const MARKER = /\[([^\]\s]+#[^\]\s]+)\]/g;

/** Answers from the built-in rulebook. Never throws for a model failure. */
export async function askRulebook(question: string): Promise<RegulationAnswer & { note: string }> {
  const started = Date.now();
  const found = searchRulebook(question);
  const base = {
    corpus: "CarbonPass rulebook",
    corpusHash: "",
    retriever: `keyword (k=${found.length})`,
  };
  const toPassages = (cited: Set<string>): Passage[] =>
    found.map((e) => ({
      chunkId: e.id,
      docTitle: e.source,
      section: e.section,
      text: e.text,
      cited: cited.has(e.id) ? "verified" : null,
    }));

  if (found.length === 0) {
    return {
      ...base,
      answer:
        "Nothing in the built-in rulebook matches that question. Try the words the regulation uses - for example certificates, default values, free allocation, precursors or verification.",
      passages: [],
      unsupported: [],
      model: "none",
      seconds: (Date.now() - started) / 1000,
      note: "rulebook",
    };
  }

  if (!isAiAvailable()) {
    return {
      ...base,
      answer:
        "No AI model is configured on this installation, so here are the passages of the rulebook that match your question most closely.",
      passages: toPassages(new Set()),
      unsupported: [],
      model: "none",
      seconds: (Date.now() - started) / 1000,
      note: "rulebook",
    };
  }

  try {
    const prompt = `Passages:\n\n${found
      .map((e) => `[${e.id}] ${e.source}${e.section ? ` - ${e.section}` : ""}\n${e.text}`)
      .join("\n\n")}\n\nQuestion: ${question}`;
    const result = await structured({
      name: "rulebook_answer",
      system: SYSTEM,
      prompt,
      schema: AnswerSchema,
    });
    if (!result.value) throw new Error("no answer");
    const answer = result.value.answer.trim();
    const ids = new Set(found.map((e) => e.id));
    const cited = new Set([...answer.matchAll(MARKER)].map((m) => m[1]!));
    return {
      ...base,
      answer,
      passages: toPassages(new Set([...cited].filter((id) => ids.has(id)))),
      unsupported: [...cited].filter((id) => !ids.has(id)),
      model: result.model,
      seconds: (Date.now() - started) / 1000,
      note: "rulebook",
    };
  } catch {
    return {
      ...base,
      answer: `The AI model (${aiProvider()}) could not answer just now, so here are the passages of the rulebook that match your question most closely.`,
      passages: toPassages(new Set()),
      unsupported: [],
      model: "none",
      seconds: (Date.now() - started) / 1000,
      note: "rulebook",
    };
  }
}
