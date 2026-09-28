import Papa from "papaparse";
import { profileDataset, type ParsedDataset } from "./parse";

/**
 * Reading an uploaded file into rows.
 *
 * Plant exports rarely start at row 1: an SAP report puts the plant name, a
 * date range and a blank line above the header; an Excel workbook has three
 * sheets and the data is on the second. This finds the sheet and the header
 * row, and reports what it chose so the operator can override it on the
 * mapping review screen - the choice is shown, never silent.
 */

export const ACCEPTED_EXTENSIONS = [".csv", ".txt", ".xlsx"] as const;
export const MAX_ROWS = 20_000;
export const MAX_COLUMNS = 80;

export interface ReadOptions {
  sheetName?: string;
  /** 1-based row number of the header. Detected when omitted. */
  headerRow?: number;
}

export interface ReadResult {
  parsed: ParsedDataset;
  /** Every sheet in a workbook; empty for CSV. */
  sheets: string[];
  sheetName?: string;
  headerRow: number;
  /** Rows above the header, shown so the operator can see what was skipped. */
  preamble: string[][];
}

export class UploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadError";
  }
}

function extensionOf(fileName: string): string {
  const i = fileName.lastIndexOf(".");
  return i >= 0 ? fileName.slice(i).toLowerCase() : "";
}

function looksNumeric(v: string): boolean {
  return /^[\s₹$€£(+-]*[\d,.\s]+%?\)?$/.test(v) && /\d/.test(v);
}

/**
 * The header is the first row that is mostly text and about as wide as the
 * data under it. Title rows are narrow; data rows are mostly numbers.
 */
export function detectHeaderRow(grid: string[][]): number {
  const sample = grid.slice(0, 30);
  const widths = sample.map((r) => r.filter((c) => c.trim() !== "").length);
  const maxWidth = Math.max(0, ...widths);
  if (maxWidth === 0) return 1;
  for (let i = 0; i < sample.length; i++) {
    const cells = (sample[i] ?? []).filter((c) => c.trim() !== "");
    if (cells.length < Math.max(2, Math.ceil(maxWidth * 0.6))) continue;
    const textShare = cells.filter((c) => !looksNumeric(c)).length / cells.length;
    if (textShare >= 0.6) return i + 1;
  }
  return 1;
}

function dedupeHeaders(raw: string[]): string[] {
  const seen = new Map<string, number>();
  return raw.map((h, i) => {
    const base = h.trim() || `Column ${i + 1}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base} (${n})`;
  });
}

function gridToDataset(
  fileName: string,
  datasetId: string,
  grid: string[][],
  options: ReadOptions,
): { parsed: ParsedDataset; headerRow: number; preamble: string[][] } {
  const headerRow = options.headerRow ?? detectHeaderRow(grid);
  const headerCells = grid[headerRow - 1] ?? [];
  const width = Math.max(headerCells.length, ...grid.slice(headerRow).map((r) => r.length));
  if (width > MAX_COLUMNS) {
    throw new UploadError(`The file has ${width} columns; at most ${MAX_COLUMNS} are supported.`);
  }
  const headers = dedupeHeaders(Array.from({ length: width }, (_, i) => headerCells[i] ?? ""));

  const body = grid.slice(headerRow).filter((r) => r.some((c) => c.trim() !== ""));
  if (body.length > MAX_ROWS) {
    throw new UploadError(
      `The file has ${body.length.toLocaleString("en-IN")} data rows; split it into files of at ` +
        `most ${MAX_ROWS.toLocaleString("en-IN")} rows.`,
    );
  }
  const rows = body.map((cells) =>
    Object.fromEntries(headers.map((h, i) => [h, (cells[i] ?? "").trim()])),
  );
  // Columns with no header and no data are spreadsheet noise.
  const used = headers.filter(
    (h, i) => (headerCells[i] ?? "").trim() !== "" || rows.some((r) => r[h] !== ""),
  );
  const trimmed = rows.map((r) => Object.fromEntries(used.map((h) => [h, r[h] ?? ""])));

  return {
    parsed: profileDataset(fileName, datasetId, used, trimmed),
    headerRow,
    preamble: grid.slice(0, headerRow - 1),
  };
}

function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "");
  } catch {
    // Excel on Windows saves CSV as Windows-1252 unless told otherwise.
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

function readCsv(
  fileName: string,
  datasetId: string,
  bytes: Uint8Array,
  options: ReadOptions,
): ReadResult {
  const text = decodeText(bytes);
  const result = Papa.parse<string[]>(text, { skipEmptyLines: false });
  const grid = (result.data ?? []).map((r) => r.map((c) => String(c ?? "")));
  const { parsed, headerRow, preamble } = gridToDataset(fileName, datasetId, grid, options);
  return { parsed, sheets: [], headerRow, preamble };
}

type Cell = import("exceljs").CellValue;

function cellText(value: Cell): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((r) => r.text).join("");
    if ("result" in value) return cellText(value.result as Cell);
    if ("text" in value && typeof value.text === "string") return value.text;
    if ("error" in value) return "";
  }
  return String(value);
}

async function readXlsx(
  fileName: string,
  datasetId: string,
  bytes: Uint8Array,
  options: ReadOptions,
): Promise<ReadResult> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    );
  } catch {
    throw new UploadError(
      "The workbook could not be read. Save it as .xlsx (Excel 2007 or later) or export the sheet as CSV.",
    );
  }
  const sheets = wb.worksheets.map((w) => w.name);
  const sheet = options.sheetName
    ? wb.getWorksheet(options.sheetName)
    : (wb.worksheets.find((w) => w.actualRowCount > 1) ?? wb.worksheets[0]);
  if (!sheet) throw new UploadError(`Sheet "${options.sheetName}" was not found in the workbook.`);

  const grid: string[][] = [];
  sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const values = (row.values as Cell[]).slice(1);
    grid[rowNumber - 1] = values.map(cellText);
  });
  for (let i = 0; i < grid.length; i++) grid[i] ??= [];

  const { parsed, headerRow, preamble } = gridToDataset(fileName, datasetId, grid, options);
  return { parsed, sheets, sheetName: sheet.name, headerRow, preamble };
}

export async function readUpload(args: {
  fileName: string;
  datasetId: string;
  bytes: Uint8Array;
  options?: ReadOptions;
}): Promise<ReadResult> {
  const ext = extensionOf(args.fileName);
  const options = args.options ?? {};
  if (ext === ".xlsx") return readXlsx(args.fileName, args.datasetId, args.bytes, options);
  if (ext === ".csv" || ext === ".txt") {
    return readCsv(args.fileName, args.datasetId, args.bytes, options);
  }
  if (ext === ".xls") {
    throw new UploadError(
      "Legacy .xls workbooks are not supported. Save the file as .xlsx or CSV.",
    );
  }
  throw new UploadError(
    `Unsupported file type "${ext || "none"}". Upload a CSV or an .xlsx workbook.`,
  );
}
