import type { Extraction, ExtractedLine, LineCategory } from "../../lib/ai/extract";
import { resolveUnit } from "../../lib/cbam/units";

/**
 * Scoring a document reading against what a person would have entered.
 *
 * The number that matters is not accuracy but *silent* error: a wrong figure
 * that would be imported with nothing on screen to flag it. The review step
 * puts every line in front of a person, and the text check flags a PDF figure
 * the document does not contain, so a wrong line that is flagged is caught. A
 * wrong line that is neither flagged nor obviously wrong is how a kVA figure
 * ends up in an emissions declaration.
 *
 * A line is included by default when it has a quantity and a category the
 * engine imports - the same rule the review screen uses to pre-tick it.
 */

export interface ExpectedLine {
  /** A word the description should contain, for the report only. */
  item: string;
  category: LineCategory;
  quantity: number;
  /** The unit as printed. */
  unit: string;
}

export interface LabelledDocument {
  id: string;
  file: string;
  mediaType: string;
  why: string;
  expected: ExpectedLine[];
}

export interface DocumentScore {
  id: string;
  read: boolean;
  expected: number;
  found: number;
  unitCorrect: number;
  categoryCorrect: number;
  included: number;
  silentErrors: number;
  flaggedErrors: number;
  /** One sentence per problem, for the report. */
  problems: string[];
}

export interface DocumentMetrics {
  documents: number;
  /** Share of documents the model read at all (no fallback to manual entry). */
  readRate: number;
  /** Share of expected lines whose quantity was read exactly. */
  lineRecall: number;
  /** Of the lines found, the share with the right unit. */
  unitAccuracy: number;
  /** Of the lines found, the share in the right category. */
  categoryAccuracy: number;
  /** Of the lines that would be imported by default, the share wrong and unflagged. */
  silentErrorRate: number;
}

function sameQuantity(a: number, b: number): boolean {
  return Math.abs(a - b) <= Math.max(1e-6, Math.abs(b) * 1e-9);
}

/** Two unit tokens mean the same thing when they resolve to the same unit and scale. */
export function sameUnit(read: string | null, printed: string): boolean {
  if (!read) return false;
  const a = resolveUnit(read);
  const b = resolveUnit(printed);
  if (a && b) return a.canonical === b.canonical && a.factor === b.factor;
  const norm = (s: string) => s.toLowerCase().replace(/[\s.]/g, "");
  return norm(read) === norm(printed);
}

const isIncluded = (l: ExtractedLine) => l.category !== "other" && l.quantity !== null;

export function scoreDocument(
  doc: LabelledDocument,
  extraction: Extraction,
  read: boolean,
): DocumentScore {
  const lines = extraction.lines;
  const used = new Set<string>();
  const problems: string[] = [];
  let found = 0;
  let unitCorrect = 0;
  let categoryCorrect = 0;
  const wrongMatched = new Set<string>();

  for (const want of doc.expected) {
    const hit = lines.find(
      (l) => !used.has(l.id) && l.quantity !== null && sameQuantity(l.quantity, want.quantity),
    );
    if (!hit) {
      problems.push(`missed ${want.item}: ${want.quantity} ${want.unit}`);
      continue;
    }
    used.add(hit.id);
    found++;
    const unitOk = sameUnit(hit.unit, want.unit);
    const categoryOk = hit.category === want.category;
    if (unitOk) unitCorrect++;
    else problems.push(`${want.item}: unit read as "${hit.unit ?? ""}", printed "${want.unit}"`);
    if (categoryOk) categoryCorrect++;
    else problems.push(`${want.item}: filed as ${hit.category}, should be ${want.category}`);
    if (!unitOk || !categoryOk) wrongMatched.add(hit.id);
  }

  let included = 0;
  let silentErrors = 0;
  let flaggedErrors = 0;
  for (const l of lines) {
    if (!isIncluded(l)) continue;
    included++;
    const wrong = !used.has(l.id) || wrongMatched.has(l.id);
    if (!wrong) continue;
    if (l.check === "not_found") {
      flaggedErrors++;
    } else {
      silentErrors++;
      if (!used.has(l.id)) {
        problems.push(
          `would import ${l.quantity} ${l.unit ?? ""} (${l.description}) unflagged; it is not an expected line`,
        );
      }
    }
  }

  return {
    id: doc.id,
    read,
    expected: doc.expected.length,
    found,
    unitCorrect,
    categoryCorrect,
    included,
    silentErrors,
    flaggedErrors,
    problems,
  };
}

const ratio = (n: number, d: number) => (d === 0 ? 0 : n / d);

export function summarise(scores: DocumentScore[]): DocumentMetrics {
  const sum = (f: (s: DocumentScore) => number) => scores.reduce((a, s) => a + f(s), 0);
  const found = sum((s) => s.found);
  return {
    documents: scores.length,
    readRate: ratio(scores.filter((s) => s.read).length, scores.length),
    lineRecall: ratio(
      found,
      sum((s) => s.expected),
    ),
    unitAccuracy: ratio(
      sum((s) => s.unitCorrect),
      found,
    ),
    categoryAccuracy: ratio(
      sum((s) => s.categoryCorrect),
      found,
    ),
    silentErrorRate: ratio(
      sum((s) => s.silentErrors),
      sum((s) => s.included),
    ),
  };
}
