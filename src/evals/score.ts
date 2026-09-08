import { resolveUnit } from "../lib/cbam/units";
import type { DatasetMapping } from "../lib/ingest/schema";
import type { MappingCase } from "./fixtures/mapping";

/**
 * Scoring for the schema-mapping agent.
 *
 * Column mapping is not a single accuracy number, because the two ways of being
 * wrong cost very different amounts. Mapping a column to the wrong field
 * corrupts a calculation silently. Leaving a column unmapped surfaces in the UI
 * and gets fixed by a human in ten seconds. So they are scored separately, and
 * the headline metric penalises the dangerous one.
 */

export interface CaseScore {
  caseId: string;
  intent: string;
  /** Columns mapped exactly right, over all columns. */
  columnAccuracy: number;
  /** Columns given the WRONG field, over all columns. The one that matters. */
  columnErrorRate: number;
  /** Columns left null that should have had a field. Recoverable. */
  columnMissRate: number;
  kindCorrect: boolean;
  unitCorrect: boolean | null;
  valueAccuracy: number | null;
  /** Mean confidence on the columns it got wrong. High = badly calibrated. */
  confidenceOnErrors: number | null;
  errors: string[];
}

export interface EvalSummary {
  label: string;
  cases: CaseScore[];
  columnAccuracy: number;
  columnErrorRate: number;
  columnMissRate: number;
  kindAccuracy: number;
  unitAccuracy: number;
  valueAccuracy: number;
  /** Calibration: mean confidence on wrong answers. Lower is better. */
  meanConfidenceOnErrors: number;
  durationMs: number;
}

function mean(values: number[]): number {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;
}

export function scoreCase(testCase: MappingCase, mapping: DatasetMapping): CaseScore {
  const errors: string[] = [];
  const expectedColumns = testCase.expected.columns;
  const headers = Object.keys(expectedColumns);

  let correct = 0;
  let wrong = 0;
  let missed = 0;
  const wrongConfidences: number[] = [];

  for (const header of headers) {
    const want = expectedColumns[header] ?? null;
    const got = mapping.columns.find((c) => c.sourceColumn === header);
    const gotField = got?.targetField ?? null;

    if (gotField === want) {
      correct++;
    } else if (gotField === null) {
      missed++;
      errors.push(`"${header}": expected ${want}, got nothing`);
    } else {
      wrong++;
      wrongConfidences.push(got?.confidence ?? 0);
      errors.push(
        `"${header}": expected ${want ?? "null"}, got ${gotField} (confidence ${got?.confidence ?? 0})`,
      );
    }
  }

  const kindCorrect = mapping.kind === testCase.expected.kind;
  if (!kindCorrect) errors.push(`kind: expected ${testCase.expected.kind}, got ${mapping.kind}`);

  // The unit is checked by what it resolves to, not the literal token: "MU" and
  // "million units" are both right, "MWh" is a 1000x error.
  let unitCorrect: boolean | null = null;
  if (testCase.expected.quantityUnit) {
    const quantityColumn = mapping.columns.find((c) => c.targetField === "quantity");
    const gotUnit = quantityColumn?.detectedUnit ?? null;
    const wantSpec = resolveUnit(testCase.expected.quantityUnit);
    const gotSpec = gotUnit ? resolveUnit(gotUnit) : null;
    unitCorrect =
      gotSpec !== null &&
      wantSpec !== null &&
      gotSpec.canonical === wantSpec.canonical &&
      gotSpec.factor === wantSpec.factor;
    if (!unitCorrect) {
      errors.push(
        `unit: expected ${testCase.expected.quantityUnit} (x${wantSpec?.factor ?? "?"}), got ${gotUnit ?? "none"} (x${gotSpec?.factor ?? "?"})`,
      );
    }
  }

  let valueAccuracy: number | null = null;
  if (testCase.expected.values) {
    const entries = Object.entries(testCase.expected.values);
    let hits = 0;
    for (const [source, want] of entries) {
      const got = mapping.values.find(
        (v) => v.sourceValue.trim().toLowerCase() === source.trim().toLowerCase(),
      );
      if ((got?.resolvedId ?? null) === want) hits++;
      else errors.push(`value "${source}": expected ${want}, got ${got?.resolvedId ?? "none"}`);
    }
    valueAccuracy = entries.length ? hits / entries.length : null;
  }

  return {
    caseId: testCase.id,
    intent: testCase.intent,
    columnAccuracy: headers.length ? correct / headers.length : 0,
    columnErrorRate: headers.length ? wrong / headers.length : 0,
    columnMissRate: headers.length ? missed / headers.length : 0,
    kindCorrect,
    unitCorrect,
    valueAccuracy,
    confidenceOnErrors: wrongConfidences.length ? mean(wrongConfidences) : null,
    errors,
  };
}

export function summarise(label: string, cases: CaseScore[], durationMs: number): EvalSummary {
  const withUnit = cases.filter((c) => c.unitCorrect !== null);
  const withValues = cases.filter((c) => c.valueAccuracy !== null);
  const withErrors = cases.filter((c) => c.confidenceOnErrors !== null);

  return {
    label,
    cases,
    columnAccuracy: mean(cases.map((c) => c.columnAccuracy)),
    columnErrorRate: mean(cases.map((c) => c.columnErrorRate)),
    columnMissRate: mean(cases.map((c) => c.columnMissRate)),
    kindAccuracy: mean(cases.map((c) => (c.kindCorrect ? 1 : 0))),
    unitAccuracy: withUnit.length ? mean(withUnit.map((c) => (c.unitCorrect ? 1 : 0))) : 1,
    valueAccuracy: withValues.length ? mean(withValues.map((c) => c.valueAccuracy ?? 0)) : 1,
    meanConfidenceOnErrors: withErrors.length
      ? mean(withErrors.map((c) => c.confidenceOnErrors ?? 0))
      : 0,
    durationMs,
  };
}

export function formatReport(summaries: EvalSummary[]): string {
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  const rows = [
    ["metric", ...summaries.map((s) => s.label)],
    ["column accuracy", ...summaries.map((s) => pct(s.columnAccuracy))],
    ["column ERROR rate", ...summaries.map((s) => pct(s.columnErrorRate))],
    ["column miss rate", ...summaries.map((s) => pct(s.columnMissRate))],
    ["dataset kind", ...summaries.map((s) => pct(s.kindAccuracy))],
    ["unit resolution", ...summaries.map((s) => pct(s.unitAccuracy))],
    ["value resolution", ...summaries.map((s) => pct(s.valueAccuracy))],
    ["confidence on errors", ...summaries.map((s) => pct(s.meanConfidenceOnErrors))],
    ["wall time", ...summaries.map((s) => `${(s.durationMs / 1000).toFixed(1)}s`)],
  ];

  const widths = rows[0]!.map((_, i) => Math.max(...rows.map((r) => (r[i] ?? "").length)));
  const line = (cells: string[]) =>
    cells.map((c, i) => (i === 0 ? c.padEnd(widths[i]!) : c.padStart(widths[i]!))).join("  ");

  return [
    line(rows[0]!),
    widths.map((w) => "-".repeat(w)).join("  "),
    ...rows.slice(1).map((r) => line(r)),
  ].join("\n");
}
