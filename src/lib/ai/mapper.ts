// The SDK's zodOutputFormat helper is typed against zod/v4, which zod 3.25+
// ships alongside the classic API. Importing the same module keeps the
// inferred parsed_output type intact instead of collapsing to {}.
import * as z from "zod/v4";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { FACTORS } from "../cbam/factors";
import { knownUnits } from "../cbam/units";
import { heuristicMapping } from "../ingest/heuristic";
import { profileForPrompt, type ParsedDataset } from "../ingest/parse";
import {
  DATASET_SCHEMAS,
  requiredFieldsFor,
  type DatasetKind,
  type DatasetMapping,
} from "../ingest/schema";
import { getClient, MODEL, withFallback, type AiOutcome } from "./client";

/**
 * The schema-mapping agent.
 *
 * This is the one genuinely hard problem in the pipeline and the reason the
 * product needs a model at all: "Qty Consumed" in a file whose sibling column
 * says "UOM: MU" means something different from "Qty Consumed" next to "UOM:
 * MT", and no amount of regex gets that reliably.
 *
 * What the model is allowed to do: propose a mapping, extract a unit token,
 * resolve a free-text material to a factor id from a fixed list, and say how
 * confident it is.
 *
 * What it is not allowed to do: invent a field, invent a factor, or produce a
 * number that reaches a calculation. Every id it returns is validated against
 * the engine's own tables before use, and anything unrecognised is discarded
 * and reported.
 */

const ColumnMappingSchema = z.object({
  sourceColumn: z.string(),
  targetField: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  detectedUnit: z.string().nullable(),
  rationale: z.string(),
});

const ValueMappingSchema = z.object({
  sourceValue: z.string(),
  resolvedId: z.string().nullable(),
  target: z.enum(["factor", "process", "supply"]),
  confidence: z.number().min(0).max(1),
  rationale: z.string(),
});

const MappingSchema = z.object({
  kind: z.enum(["fuel", "electricity", "process_material", "production", "precursor"]),
  kindConfidence: z.number().min(0).max(1),
  columns: z.array(ColumnMappingSchema),
  values: z.array(ValueMappingSchema),
  warnings: z.array(z.string()),
});

const SYSTEM = `You map messy industrial production data onto a fixed schema for CBAM emissions reporting.

The files come from Indian manufacturing plants: SAP and Tally exports, DISCOM electricity bills, despatch registers. Headers are abbreviated, units are inconsistent, and irrelevant columns (vendor codes, GRN references, rates) sit alongside the ones that matter.

Rules you must follow:

1. Only ever use target field ids from the schema you are given. If a column has no place in the schema, map it to null. Never invent a field id.
2. Only ever use factor ids, process ids and supply factor ids from the lists you are given. If nothing fits, return null with a rationale. A wrong id is far worse than a null - a null gets reviewed by a human, a wrong id silently corrupts a legal declaration.
3. Units matter more than anything else here. Indian electricity data is very often in MU (million units = 1000 MWh); reading it as MWh understates power by a factor of 1000. Look at the header, the unit column, and the magnitude of the sample values together. A steel plant drawing "21.3" per month is reading in MU, not MWh.
4. Confidence must be calibrated, not decorative. Use above 0.9 only when the header is unambiguous and the sample values confirm it. Use below 0.6 when you are guessing from a single weak signal. Your confidence scores decide what a human is asked to review, so inflating them defeats the review step.
5. Rationale must cite the actual evidence you used - the header text, a sample value, a sibling column. One sentence.

Return a mapping for every column in the file, including the ones you map to null.`;

function buildPrompt(
  dataset: ParsedDataset,
  processes: { id: string; name: string; route?: string; aliases?: string[] }[],
): string {
  const schemas = Object.entries(DATASET_SCHEMAS)
    .map(([kind, def]) => {
      const fields = def.fields
        .map((f) => `    - ${f.id} (${f.type}${f.required ? ", required" : ""}): ${f.description}`)
        .join("\n");
      return `  ${kind} - ${def.label}\n    ${def.description}\n${fields}`;
    })
    .join("\n\n");

  const factors = FACTORS.map((f) => `    - ${f.id}: ${f.name}`).join("\n");
  const processList = processes
    .map(
      (p) =>
        `    - ${p.id}: ${p.name}${p.route ? ` (route: ${p.route})` : ""}` +
        (p.aliases?.length ? `\n        also known in plant systems as: ${p.aliases.join(", ")}` : ""),
    )
    .join("\n");

  return `# Dataset schemas

${schemas}

# Emission factor ids (for target "factor")

${factors}

# Production process ids (for target "process")

${processList}

# Electricity supply factor ids (for target "supply")

    - grid_in_national: state or national grid supply
    - grid_in_western: western regional grid
    - captive_coal_power: captive coal-fired generation
    - ppa_solar: renewable power purchase agreement / open access solar

# Recognised unit tokens

${knownUnits().join(", ")}

# The file to map

${profileForPrompt(dataset)}

# Task

1. Classify which dataset schema this file matches.
2. Map every column to a target field id from that schema, or to null.
3. For a quantity column, set detectedUnit to the unit token that applies - from the header, from a sibling unit column's values, or inferred from magnitude. Null if genuinely unknown.
4. Resolve the distinct values of the material, process/section and supply-source columns to the ids listed above.
5. List anything a human should check before these numbers reach a calculation.`;
}

export interface MappingOutcome {
  mapping: DatasetMapping;
  outcome: AiOutcome;
}

export async function mapDataset(
  dataset: ParsedDataset,
  processes: { id: string; name: string; route?: string; aliases?: string[] }[],
  forceKind?: DatasetKind,
): Promise<MappingOutcome> {
  const fallback = () => heuristicMapping(dataset, processes, forceKind);

  const { value, outcome } = await withFallback<DatasetMapping>(async () => {
    const client = getClient();
    if (!client) throw new Error("No client");
    const started = Date.now();

    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM,
      thinking: { type: "adaptive" },
      messages: [{ role: "user", content: buildPrompt(dataset, processes) }],
      output_config: { format: zodOutputFormat(MappingSchema) },
    });

    if (response.stop_reason === "refusal") {
      throw new Error("Model declined to map this dataset.");
    }
    const parsed = response.parsed_output;
    if (!parsed) throw new Error("Model returned no parseable mapping.");

    return {
      value: validateMapping(dataset, parsed, processes, forceKind),
      outcome: {
        producedBy: "model",
        model: MODEL,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        latencyMs: Date.now() - started,
      },
    };
  }, fallback);

  return { mapping: value, outcome };
}

/**
 * Validate the model's output against the engine's own tables.
 *
 * Everything the model returns is treated as a proposal. Ids that do not exist
 * are dropped and reported rather than passed through, so a hallucinated factor
 * id can never reach a calculation.
 */
export function validateMapping(
  dataset: ParsedDataset,
  proposed: z.infer<typeof MappingSchema>,
  processes: { id: string; name: string; route?: string; aliases?: string[] }[],
  forceKind?: DatasetKind,
): DatasetMapping {
  const kind = forceKind ?? proposed.kind;
  const warnings = [...proposed.warnings];

  const validFields = new Set(DATASET_SCHEMAS[kind].fields.map((f) => f.id));
  const validFactors = new Set(FACTORS.map((f) => f.id));
  const validProcesses = new Set(processes.map((p) => p.id));
  const sourceColumns = new Set(dataset.headers);

  const columns = proposed.columns
    .filter((c) => sourceColumns.has(c.sourceColumn))
    .map((c) => {
      if (c.targetField !== null && !validFields.has(c.targetField)) {
        warnings.push(
          `Discarded mapping of "${c.sourceColumn}" to unknown field "${c.targetField}".`,
        );
        return { ...c, targetField: null, confidence: 0 };
      }
      return c;
    });

  // Any column the model omitted is explicitly unmapped, never silently absent.
  for (const header of dataset.headers) {
    if (!columns.some((c) => c.sourceColumn === header)) {
      columns.push({
        sourceColumn: header,
        targetField: null,
        confidence: 0,
        detectedUnit: null,
        rationale: "Not returned by the mapper; left unmapped for review.",
      });
    }
  }

  // One canonical field cannot be fed by two columns. Keep the confident one.
  const byField = new Map<string, (typeof columns)[number]>();
  for (const c of columns) {
    if (c.targetField === null) continue;
    const existing = byField.get(c.targetField);
    if (!existing || c.confidence > existing.confidence) {
      if (existing) {
        existing.targetField = null;
        warnings.push(
          `Both "${existing.sourceColumn}" and "${c.sourceColumn}" were mapped to ${c.targetField}; kept the higher-confidence column.`,
        );
      }
      byField.set(c.targetField, c);
    } else {
      c.targetField = null;
    }
  }

  const values = proposed.values.filter((v) => {
    if (v.resolvedId === null) return true;
    const valid =
      v.target === "factor" || v.target === "supply"
        ? validFactors.has(v.resolvedId)
        : validProcesses.has(v.resolvedId);
    if (!valid) {
      warnings.push(
        `Discarded resolution of "${v.sourceValue}" to unknown ${v.target} id "${v.resolvedId}".`,
      );
    }
    return valid;
  });

  const mapped = new Set(columns.map((c) => c.targetField).filter(Boolean) as string[]);
  const missingRequired = requiredFieldsFor(kind).filter((f) => !mapped.has(f));
  if (missingRequired.length > 0) {
    warnings.push(`No column mapped to required field(s): ${missingRequired.join(", ")}.`);
  }

  return {
    datasetId: dataset.datasetId,
    fileName: dataset.fileName,
    kind,
    kindConfidence: proposed.kindConfidence,
    columns,
    values,
    producedBy: "model",
    model: MODEL,
    missingRequired,
    warnings,
  };
}

export { MappingSchema };
