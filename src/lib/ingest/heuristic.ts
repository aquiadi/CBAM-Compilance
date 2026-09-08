import { FACTORS } from "../cbam/factors";
import { extractUnitFromHeader, resolveUnit } from "../cbam/units";
import type { ParsedDataset } from "./parse";
import {
  DATASET_SCHEMAS,
  fieldsFor,
  requiredFieldsFor,
  type ColumnMapping,
  type DatasetKind,
  type DatasetMapping,
  type ValueMapping,
} from "./schema";

/**
 * The deterministic mapper.
 *
 * Two jobs. It is the fallback when no API key is configured, so the product
 * works end to end offline. And it is the baseline the model is measured
 * against in `src/evals` - a model that cannot beat token overlap on this task
 * is not earning its latency.
 */

function tokenise(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1);
}

/** Jaccard-ish overlap, weighted so a full alias match beats scattered tokens. */
function similarity(header: string, alias: string): number {
  const h = tokenise(header);
  const a = tokenise(alias);
  if (h.length === 0 || a.length === 0) return 0;

  const hSet = new Set(h);
  const aSet = new Set(a);
  const shared = [...aSet].filter((t) => hSet.has(t)).length;
  if (shared === 0) {
    // Substring rescue: "qty" inside "qtyconsumed".
    const hJoined = h.join("");
    const aJoined = a.join("");
    if (hJoined.includes(aJoined) || aJoined.includes(hJoined)) return 0.55;
    return 0;
  }
  const coverage = shared / aSet.size;
  const precision = shared / hSet.size;
  return 0.7 * coverage + 0.3 * precision;
}

/** Classify the file itself before mapping its columns. */
export function classifyKind(dataset: ParsedDataset): { kind: DatasetKind; confidence: number } {
  const haystack = [dataset.fileName, ...dataset.headers].join(" ").toLowerCase();
  const sampleText = dataset.columns
    .flatMap((c) => c.samples)
    .join(" ")
    .toLowerCase();
  const all = `${haystack} ${sampleText}`;

  const signals: Record<DatasetKind, string[]> = {
    electricity: [
      "power",
      "electricity",
      "kwh",
      "mwh",
      "units drawn",
      "discom",
      "billing",
      "kva",
      "energy",
      "mu",
    ],
    precursor: [
      "precursor",
      "receipt",
      "supplier",
      "vendor",
      "cbam communication",
      "bought out",
      "purchase",
    ],
    production: [
      "production",
      "despatch",
      "dispatch",
      "output",
      "cn code",
      "hs code",
      "produced",
      "sales",
    ],
    process_material: [
      "dolomite",
      "limestone",
      "flux",
      "electrode",
      "lime",
      "consumable",
      "process material",
    ],
    fuel: ["coal", "fuel", "furnace oil", "diesel", "hsd", "consumption", "lpg", "gas", "coke"],
  };

  let best: { kind: DatasetKind; confidence: number } = { kind: "fuel", confidence: 0.2 };
  for (const [kind, tokens] of Object.entries(signals) as [DatasetKind, string[]][]) {
    const hits = tokens.filter((t) => all.includes(t)).length;
    const score = Math.min(0.95, hits / 4);
    if (score > best.confidence) best = { kind, confidence: score };
  }
  return best;
}

export function mapColumns(
  dataset: ParsedDataset,
  kind: DatasetKind,
  processes: { id: string; name: string; route?: string; aliases?: string[] }[] = [],
): ColumnMapping[] {
  const fields = fieldsFor(kind);

  /** True when a column's own values look like plant sections. Content beats
   *  header wording: "Feeder" is ambiguous, "Rolling Mill aux" is not. */
  const looksLikeProcessColumn = (samples: string[]): boolean => {
    if (processes.length === 0 || samples.length === 0) return false;
    const hits = samples.filter((v) => resolveProcess(v, processes).confidence >= 0.8).length;
    return hits / samples.length >= 0.5;
  };
  const claimed = new Set<string>();
  const scored: { column: string; field: string; score: number; unit?: string | null }[] = [];

  for (const column of dataset.columns) {
    for (const field of fields) {
      let score = Math.max(
        similarity(column.name, field.label),
        ...field.aliases.map((a) => similarity(column.name, a)),
      );

      // Shape evidence: a column's contents should agree with the field type.
      if (field.type === "number" && column.numericRate > 0.8) score += 0.12;
      if (field.type === "number" && column.numericRate < 0.3) score -= 0.45;
      if (field.type === "date" && column.dateRate > 0.7) score += 0.25;
      if (field.type === "date" && column.dateRate < 0.2) score -= 0.4;
      if (field.type === "text" && column.numericRate > 0.9) score -= 0.3;
      if (field.type === "unit" && column.samples.every((s) => resolveUnit(s))) score += 0.3;
      if (field.type === "cn_code" && column.samples.some((s) => /\d{4}[\s.]?\d{2}/.test(s))) {
        score += 0.3;
      }
      if (field.type === "boolean" && column.distinctCount <= 3) score += 0.15;

      // A numeric column whose header carries a real unit token is a quantity,
      // whatever the noun in front of it says.
      if (
        field.id === "quantity" &&
        column.numericRate > 0.8 &&
        extractUnitFromHeader(column.name) !== null
      ) {
        score += 0.4;
      }
      // When a column's values resolve to known plant sections, that outweighs
      // whatever noun the header uses. "Feeder" reads as distribution
      // vocabulary, but a column full of "Rolling Mill aux" is a section column
      // regardless, and content is the harder evidence.
      if (field.id === "process" && looksLikeProcessColumn(column.samples)) score += 0.7;
      if (field.id === "supply_source" && looksLikeProcessColumn(column.samples)) score -= 0.45;

      if (score > 0.35) {
        // Capped at 0.9. Token overlap plus a shape check cannot distinguish
        // "certainly right" from "probably right", and a mapper that reports
        // 0.99 on a guess defeats the review step that confidence exists to
        // drive. Only an operator-configured alias earns a higher number, and
        // that is a fact rather than an inference.
        scored.push({ column: column.name, field: field.id, score: Math.min(score, 0.9) });
      }
    }
  }

  scored.sort((a, b) => b.score - a.score);

  const byColumn = new Map<string, ColumnMapping>();
  for (const s of scored) {
    if (byColumn.has(s.column) || claimed.has(s.field)) continue;
    const column = dataset.columns.find((c) => c.name === s.column);
    const detectedUnit = column ? extractUnitFromHeader(column.name) : null;
    claimed.add(s.field);
    byColumn.set(s.column, {
      sourceColumn: s.column,
      targetField: s.field,
      confidence: Number(s.score.toFixed(2)),
      detectedUnit,
      rationale: `Header tokens match "${s.field}" and the column shape agrees with the expected type.`,
    });
  }

  return dataset.columns.map(
    (c) =>
      byColumn.get(c.name) ?? {
        sourceColumn: c.name,
        targetField: null,
        confidence: 0.9,
        detectedUnit: null,
        rationale: "No canonical field matched; the column carries nothing the engine needs.",
      },
  );
}

/** Keyword rules for resolving a free-text material to an emission factor. */
const FACTOR_HINTS: { factorId: string; any: string[]; not?: string[] }[] = [
  {
    factorId: "coal_coking",
    any: ["coking coal", "met coal", "metallurgical coal"],
    not: ["non coking", "non-coking"],
  },
  {
    factorId: "coke_oven_coke",
    any: ["coke oven", "lam coke", "met coke", "nut coke", "coke breeze"],
  },
  {
    factorId: "coal_bituminous_in",
    any: ["non coking", "non-coking", "steam coal", "thermal coal", "coal", "slack coal"],
  },
  { factorId: "furnace_oil", any: ["furnace oil", "fo ", "lsho", "residual fuel", "heavy oil"] },
  { factorId: "diesel", any: ["diesel", "hsd", "gas oil", "dg set"] },
  { factorId: "natural_gas", any: ["natural gas", "png", "lng", "rlng", "cng", "producer gas"] },
  { factorId: "lpg", any: ["lpg", "propane", "butane"] },
  { factorId: "petroleum_coke", any: ["pet coke", "petcoke", "petroleum coke"] },
  {
    factorId: "biomass_agri_residue",
    any: ["biomass", "briquette", "husk", "agri residue", "bagasse"],
  },
  { factorId: "limestone", any: ["limestone", "lime", "caco3", "flux"] },
  { factorId: "dolomite", any: ["dolomite", "dolo"] },
  { factorId: "graphite_electrode", any: ["graphite", "electrode"] },
  { factorId: "carbon_anode_paste", any: ["anode", "soderberg", "paste"] },
];

export function resolveFactor(value: string): {
  id: string | null;
  confidence: number;
  why: string;
} {
  const v = ` ${value.toLowerCase()} `;
  for (const hint of FACTOR_HINTS) {
    if (hint.not?.some((n) => v.includes(n))) continue;
    const hit = hint.any.find((a) => v.includes(a));
    if (hit) {
      return {
        id: hint.factorId,
        confidence: 0.88,
        why: `"${hit}" in the description matches ${FACTORS.find((f) => f.id === hint.factorId)?.name}.`,
      };
    }
  }
  return { id: null, confidence: 0, why: "No emission factor keyword matched this description." };
}

export function resolveSupply(value: string): {
  id: "grid" | "captive" | "ppa" | "onsite_renewable";
  factorId: string;
  confidence: number;
  why: string;
} {
  const v = value.toLowerCase();
  if (/(solar|wind|renewable|ppa|open access)/.test(v)) {
    return {
      id: "ppa",
      factorId: "ppa_solar",
      confidence: 0.85,
      why: "Named as a renewable power purchase agreement.",
    };
  }
  if (/(captive|cpp|own generation|dg set|turbine)/.test(v)) {
    return {
      id: "captive",
      factorId: "captive_coal_power",
      confidence: 0.8,
      why: "Named as captive generation.",
    };
  }
  return {
    id: "grid",
    factorId: "grid_in_national",
    confidence: 0.7,
    why: "Defaulted to the state grid supply.",
  };
}

/**
 * Resolve a plant section to a production process. Matching is on tokens shared
 * with the process name and route, which is exactly the kind of judgement the
 * model does better - the heuristic gets the obvious ones and flags the rest.
 */
export function resolveProcess(
  value: string,
  processes: { id: string; name: string; route?: string; aliases?: string[] }[],
): { id: string | null; confidence: number; why: string } {
  const v = value.toLowerCase().trim();

  // A configured alias is an operator decision, not an inference.
  for (const p of processes) {
    if (p.aliases?.some((a) => a.toLowerCase().trim() === v)) {
      return { id: p.id, confidence: 0.99, why: `"${value}" is a configured alias of ${p.name}.` };
    }
  }

  let best: { id: string; score: number } | null = null;
  for (const p of processes) {
    const score = Math.max(similarity(value, p.name), p.route ? similarity(value, p.route) : 0);
    if (!best || score > best.score) best = { id: p.id, score };
  }
  // Direct keyword rescue for the vocabulary a heuristic would otherwise miss.
  const keywords: [RegExp, string][] = [
    [/kiln|dri|sponge/, "dri"],
    [/melt|eaf|induction|\bif\b|furnace shop|steel melt/, "eaf"],
    [/roll|mill|tmt|bar mill/, "rolling"],
  ];
  for (const [re, hint] of keywords) {
    if (re.test(v)) {
      const match = processes.find(
        (p) => p.id.includes(hint) || p.name.toLowerCase().includes(hint),
      );
      if (match)
        return { id: match.id, confidence: 0.86, why: `Section name indicates the ${match.name}.` };
    }
  }
  if (best && best.score > 0.4) {
    return {
      id: best.id,
      confidence: Number(best.score.toFixed(2)),
      why: "Section name overlaps the process name.",
    };
  }
  return {
    id: null,
    confidence: 0,
    why: "Section could not be matched to a declared production process.",
  };
}

export function mapValues(
  dataset: ParsedDataset,
  kind: DatasetKind,
  columns: ColumnMapping[],
  processes: { id: string; name: string; route?: string; aliases?: string[] }[],
): ValueMapping[] {
  const out: ValueMapping[] = [];
  const columnFor = (field: string) => columns.find((c) => c.targetField === field)?.sourceColumn;

  const distinct = (columnName: string | undefined): string[] => {
    if (!columnName) return [];
    const profile = dataset.columns.find((c) => c.name === columnName);
    if (profile?.distinctValues) return profile.distinctValues;
    return [
      ...new Set(dataset.rows.map((r) => String(r[columnName] ?? "").trim()).filter(Boolean)),
    ].slice(0, 40);
  };

  if (kind === "fuel" || kind === "process_material") {
    for (const value of distinct(columnFor("material"))) {
      const r = resolveFactor(value);
      out.push({
        sourceValue: value,
        resolvedId: r.id,
        target: "factor",
        confidence: r.confidence,
        rationale: r.why,
      });
    }
  }

  if (kind === "electricity") {
    for (const value of distinct(columnFor("supply_source"))) {
      const r = resolveSupply(value);
      out.push({
        sourceValue: value,
        resolvedId: r.factorId,
        target: "supply",
        confidence: r.confidence,
        rationale: r.why,
      });
    }
  }

  for (const value of distinct(columnFor("process"))) {
    const r = resolveProcess(value, processes);
    out.push({
      sourceValue: value,
      resolvedId: r.id,
      target: "process",
      confidence: r.confidence,
      rationale: r.why,
    });
  }

  return out;
}

export function heuristicMapping(
  dataset: ParsedDataset,
  processes: { id: string; name: string; route?: string; aliases?: string[] }[],
  forceKind?: DatasetKind,
): DatasetMapping {
  const classified = forceKind ? { kind: forceKind, confidence: 1 } : classifyKind(dataset);
  const columns = mapColumns(dataset, classified.kind, processes);
  const values = mapValues(dataset, classified.kind, columns, processes);

  const mapped = new Set(columns.map((c) => c.targetField).filter(Boolean) as string[]);
  const missingRequired = requiredFieldsFor(classified.kind).filter((f) => !mapped.has(f));

  const warnings: string[] = [];
  if (missingRequired.length > 0) {
    warnings.push(
      `No column mapped to required field${missingRequired.length > 1 ? "s" : ""}: ${missingRequired.join(", ")}.`,
    );
  }
  const unresolved = values.filter((v) => v.resolvedId === null);
  if (unresolved.length > 0) {
    warnings.push(
      `${unresolved.length} source value${unresolved.length > 1 ? "s" : ""} could not be resolved: ` +
        unresolved
          .slice(0, 4)
          .map((v) => `"${v.sourceValue}"`)
          .join(", ") +
        (unresolved.length > 4 ? "..." : ""),
    );
  }

  return {
    datasetId: dataset.datasetId,
    fileName: dataset.fileName,
    kind: classified.kind,
    kindConfidence: classified.confidence,
    columns,
    values,
    producedBy: "heuristic",
    missingRequired,
    warnings,
  };
}

export { DATASET_SCHEMAS };
