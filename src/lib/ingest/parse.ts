import Papa from "papaparse";

/**
 * CSV parsing and profiling.
 *
 * The profile is what gets sent to the model: headers, a few sample values per
 * column, and the distinct values of the low-cardinality columns. Sending the
 * whole file would be slower, more expensive, and no more accurate - column
 * semantics are visible in a handful of rows.
 */

export interface ColumnProfile {
  name: string;
  index: number;
  /** Up to 5 non-empty sample values, taken from across the file. */
  samples: string[];
  /** Distinct values, when there are few enough to enumerate. */
  distinctValues?: string[];
  distinctCount: number;
  /** Share of rows where the cell is empty or a null marker. */
  emptyRate: number;
  /** Share of non-empty cells that parse as a number. */
  numericRate: number;
  /** Share of non-empty cells that look like a date or a month label. */
  dateRate: number;
}

export interface ParsedDataset {
  datasetId: string;
  fileName: string;
  headers: string[];
  rows: Record<string, string>[];
  columns: ColumnProfile[];
  rowCount: number;
  parseErrors: string[];
}

const NULL_MARKERS = new Set(["", "-", "--", "n/a", "na", "nil", "null", "none", "?", "—"]);

function isNullish(v: string): boolean {
  return NULL_MARKERS.has(v.trim().toLowerCase());
}

const DATE_PATTERNS = [
  /^\d{4}-\d{2}(-\d{2})?$/, // 2026-01, 2026-01-31
  /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/, // 31/01/2026
  /^[A-Za-z]{3,9}[-\s]?\d{2,4}$/, // Jan-26, January 2026
  /^Q[1-4][-\s]?\d{2,4}$/i, // Q1-26
];

function looksLikeDate(v: string): boolean {
  return DATE_PATTERNS.some((p) => p.test(v.trim()));
}

function looksNumeric(v: string): boolean {
  const cleaned = v.replace(/[₹$€£,\s()]/g, "");
  return cleaned !== "" && /^[+-]?\d*\.?\d+([eE][+-]?\d+)?%?$/.test(cleaned);
}

/** Spread samples across the file rather than taking the first N rows, which
 *  are often unrepresentative (headers repeated, opening-balance rows). */
function spreadSamples(values: string[], count: number): string[] {
  const nonEmpty = values.filter((v) => !isNullish(v));
  if (nonEmpty.length <= count) return nonEmpty;
  const step = Math.floor(nonEmpty.length / count);
  return Array.from({ length: count }, (_, i) => nonEmpty[i * step] ?? "").filter(Boolean);
}

export function parseCsv(fileName: string, content: string, datasetId: string): ParsedDataset {
  const result = Papa.parse<Record<string, string>>(content.trim(), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });

  const rows = (result.data ?? []).filter((r) =>
    Object.values(r).some((v) => v !== undefined && v !== null && String(v).trim() !== ""),
  );
  const headers = (result.meta.fields ?? []).filter((h) => h !== "");

  const columns: ColumnProfile[] = headers.map((name, index) => {
    const values = rows.map((r) => String(r[name] ?? ""));
    const nonEmpty = values.filter((v) => !isNullish(v));
    const distinct = new Set(nonEmpty.map((v) => v.trim()));
    return {
      name,
      index,
      samples: spreadSamples(values, 5),
      // Only enumerate when the column is plainly categorical.
      distinctValues:
        distinct.size <= 25 && distinct.size > 0 ? [...distinct].slice(0, 25) : undefined,
      distinctCount: distinct.size,
      emptyRate: values.length ? (values.length - nonEmpty.length) / values.length : 0,
      numericRate: nonEmpty.length
        ? nonEmpty.filter(looksNumeric).length / nonEmpty.length
        : 0,
      dateRate: nonEmpty.length ? nonEmpty.filter(looksLikeDate).length / nonEmpty.length : 0,
    };
  });

  return {
    datasetId,
    fileName,
    headers,
    rows,
    columns,
    rowCount: rows.length,
    parseErrors: (result.errors ?? []).slice(0, 5).map((e) => `Row ${e.row ?? "?"}: ${e.message}`),
  };
}

/** The compact profile handed to the model. Keeps the prompt small and stable. */
export function profileForPrompt(dataset: ParsedDataset): string {
  const lines = [`File: ${dataset.fileName}`, `Rows: ${dataset.rowCount}`, "", "Columns:"];
  for (const c of dataset.columns) {
    const stats = [
      `${(c.numericRate * 100).toFixed(0)}% numeric`,
      `${(c.dateRate * 100).toFixed(0)}% date-like`,
      `${c.distinctCount} distinct`,
      `${(c.emptyRate * 100).toFixed(0)}% empty`,
    ].join(", ");
    lines.push(`  [${c.index}] "${c.name}" (${stats})`);
    lines.push(`      samples: ${c.samples.map((s) => JSON.stringify(s)).join(", ") || "none"}`);
    if (c.distinctValues && c.distinctCount <= 12) {
      lines.push(`      all values: ${c.distinctValues.map((s) => JSON.stringify(s)).join(", ")}`);
    }
  }
  return lines.join("\n");
}

/** Normalise a period label of any common shape to "YYYY-MM". */
export function normalisePeriod(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;

  let m = v.match(/^(\d{4})-(\d{1,2})(-\d{1,2})?$/);
  if (m) return `${m[1]}-${String(Number(m[2])).padStart(2, "0")}`;

  const MONTHS: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", sept: "09", oct: "10", nov: "11", dec: "12",
  };

  m = v.match(/^([A-Za-z]{3,9})[-\s]?(\d{2,4})$/);
  if (m?.[1] && m[2]) {
    const month = MONTHS[m[1].slice(0, 3).toLowerCase()];
    if (month) {
      const yr = m[2].length === 2 ? `20${m[2]}` : m[2];
      return `${yr}-${month}`;
    }
  }

  m = v.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (m?.[2] && m[3]) {
    const yr = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${yr}-${String(Number(m[2])).padStart(2, "0")}`;
  }

  return null;
}

/** Last day of a "YYYY-MM" period, so a record spans its whole month. */
export function periodBounds(period: string): { start: string; end: string } {
  const [y, m] = period.split("-").map(Number);
  const year = y ?? 2026;
  const month = m ?? 1;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    start: `${period}-01`,
    end: `${period}-${String(last).padStart(2, "0")}`,
  };
}
