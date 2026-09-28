import * as z from "zod/v4";
import { resolveUnit } from "../cbam/units";
import type { DatasetKind } from "../ingest/schema";
import { describeError, isAiAvailable, type AiOutcome } from "./client";
import { structured, type DocumentPrompt } from "./generate";

/**
 * Reading figures off documents: fuel invoices, electricity bills, material
 * receipts, weighbridge slips - as PDFs, scans or phone photos.
 *
 * The model reads; it does not decide. What it returns is a list of proposed
 * line items, each with the text it read the number from. Then:
 *
 * 1. `validateExtraction` drops anything that is not a finite number, clamps
 *    confidence, normalises dates and refuses categories the engine has no
 *    dataset for. It never converts a unit - units stay as printed and the
 *    ingest step resolves or rejects them, exactly as for a spreadsheet.
 * 2. `crossCheck` looks for every quantity in the PDF's own text layer. A
 *    figure the model reports that is not in the document is flagged, so a
 *    misread or invented number is visible before anyone confirms it.
 * 3. A person reviews every line next to the document, edits or removes it,
 *    and only then does it become a draft dataset - which still goes through
 *    column mapping, unit resolution, the data-quality rules and a second
 *    confirmation like any uploaded file.
 *
 * Without an API key the same review table opens empty, for figures typed in
 * by hand from the document; the document is kept as evidence either way.
 */

export const DOCUMENT_MEDIA_TYPES = {
  "application/pdf": "pdf",
  "image/jpeg": "image",
  "image/png": "image",
  "image/webp": "image",
  "image/gif": "image",
  "text/plain": "text",
} as const;

export type DocumentMediaType = keyof typeof DOCUMENT_MEDIA_TYPES;

const EXTENSION_TYPES: Record<string, DocumentMediaType> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  txt: "text/plain",
  eml: "text/plain",
};

/** The API's per-image limit; larger photos must be resized before upload. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Media type from the browser's claim, falling back to the extension. */
export function documentMediaType(fileName: string, claimed: string): DocumentMediaType | null {
  if (claimed in DOCUMENT_MEDIA_TYPES) return claimed as DocumentMediaType;
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  return EXTENSION_TYPES[ext] ?? null;
}

export const LINE_CATEGORIES = [
  "fuel",
  "electricity",
  "process_material",
  "precursor",
  "other",
] as const;
export type LineCategory = (typeof LINE_CATEGORIES)[number];

/** Which dataset a category becomes. "other" lines are shown but never imported. */
export const CATEGORY_KIND: Record<LineCategory, DatasetKind | null> = {
  fuel: "fuel",
  electricity: "electricity",
  process_material: "process_material",
  precursor: "precursor",
  other: null,
};

export const DOCUMENT_TYPES = [
  "fuel_invoice",
  "electricity_bill",
  "material_receipt",
  "weighbridge_slip",
  "delivery_note",
  "supplier_emissions_communication",
  "other",
] as const;

const LineSchema = z.object({
  description: z
    .string()
    .describe("The item exactly as printed, e.g. 'HSD', 'Non-coking coal G11'."),
  category: z.enum(LINE_CATEGORIES),
  quantity: z
    .number()
    .nullable()
    .describe("The consumed or delivered quantity as printed. Null if unreadable. Never a price."),
  unit: z
    .string()
    .nullable()
    .describe(
      "The unit exactly as printed next to the quantity (MT, KL, kWh, MU, Nm3). Never converted.",
    ),
  date: z
    .string()
    .nullable()
    .describe("The date or billing month this line covers, as YYYY-MM-DD or YYYY-MM."),
  cnCode: z.string().nullable().describe("CN/HS code if printed on the line, else null."),
  supplySource: z
    .string()
    .nullable()
    .describe("Electricity only: grid/DISCOM, captive or open access, if stated."),
  evidence: z
    .string()
    .describe("A short verbatim quote from the document that contains the quantity."),
  page: z.number().nullable().describe("1-based page number the line was read from."),
  confidence: z
    .number()
    .describe("0 to 1: how sure you are that quantity and unit are read correctly."),
});

export const ExtractionSchema = z.object({
  documentType: z.enum(DOCUMENT_TYPES),
  issuer: z.string().nullable().describe("Who issued the document (supplier, DISCOM)."),
  documentNumber: z.string().nullable(),
  documentDate: z.string().nullable().describe("YYYY-MM-DD"),
  billingPeriod: z
    .object({ start: z.string(), end: z.string() })
    .nullable()
    .describe("For bills: the consumption period, YYYY-MM-DD."),
  lines: z.array(LineSchema),
  warnings: z
    .array(z.string())
    .describe(
      "Anything a person should check: unreadable parts, handwriting, crossed-out figures.",
    ),
});

export type RawExtraction = z.infer<typeof ExtractionSchema>;

export type CheckStatus = "found" | "not_found" | "no_text";

export interface ExtractedLine {
  id: string;
  description: string;
  category: LineCategory;
  quantity: number | null;
  unit: string | null;
  date: string | null;
  cnCode: string | null;
  supplySource: string | null;
  evidence: string;
  page: number | null;
  confidence: number;
  /** Whether the quantity appears in the document's own text layer. */
  check: CheckStatus;
  /** Whether the unit is one the engine knows; unknown units are rejected at ingest. */
  unitKnown: boolean;
}

export interface Extraction {
  documentType: (typeof DOCUMENT_TYPES)[number];
  issuer: string | null;
  documentNumber: string | null;
  documentDate: string | null;
  billingPeriod: { start: string; end: string } | null;
  lines: ExtractedLine[];
  warnings: string[];
  /** True when the PDF had a text layer the figures could be checked against. */
  textChecked: boolean;
}

const SYSTEM = `You read industrial purchase and utility documents for a CBAM emissions inventory: fuel invoices, electricity bills, raw-material receipts, weighbridge slips and delivery notes from plants, mostly in India.

Return one line per consumed or delivered item. Rules:
- Copy each quantity exactly as printed and its unit exactly as printed. Do not convert units, add up lines, or work out a figure the document does not state.
- Quantities are physical amounts: tonnes, litres, kilolitres, kWh, MU, Nm3, kg. Never report prices, rates, taxes, totals in money, meter constants or sanctioned load.
- For electricity bills, report the energy consumed or billed in the period (kWh, MWh or MU), not maximum demand (kVA) and not the previous or current meter reading.
- Indian number formats are common: 1,23,456.78 is one hundred twenty-three thousand four hundred fifty-six point seven eight.
- "evidence" must be a short verbatim quote from the document that includes the number you report.
- If a figure is unreadable, handwritten, crossed out or ambiguous, set quantity to null or lower the confidence, and say why in warnings. Never guess.
- category: fuel (burned on site: coal, coke, diesel/HSD/LDO, furnace oil/FO/LSHS, LPG, natural gas), electricity, process_material (limestone, dolomite, electrodes, fluxes, ore), precursor (bought-in CBAM goods such as sponge iron/DRI, pig iron, billets, clinker, ammonia), otherwise other.`;

/** A document and what to do with it, for whichever model is configured. */
export function documentPrompt(
  args: { bytes: Uint8Array; mediaType: DocumentMediaType; fileName: string },
  text: string | null,
  instruction: string,
): DocumentPrompt {
  return { ...args, kind: DOCUMENT_MEDIA_TYPES[args.mediaType], text, instruction };
}

/** Said when no model key is set, so the reader knows why the table is empty. */
export const NO_MODEL_CONFIGURED =
  "No AI model is configured (ANTHROPIC_API_KEY, or GROQ_API_KEY for the free option), so the document was not read automatically.";

export interface ExtractResult {
  extraction: Extraction;
  outcome: AiOutcome;
}

/**
 * Read a document with the model, validate what came back, and check each
 * figure against the PDF's text layer. Never throws for a model failure: the
 * result is then an empty extraction with the reason, for manual entry.
 */
export async function extractDocument(args: {
  bytes: Uint8Array;
  mediaType: DocumentMediaType;
  fileName: string;
}): Promise<ExtractResult> {
  const text = await documentText(args.bytes, args.mediaType);
  const empty = (reason: string): ExtractResult => ({
    extraction: {
      ...emptyExtraction(),
      textChecked: text !== null,
      warnings: [reason],
    },
    outcome: { producedBy: "heuristic", fallbackReason: reason },
  });

  if (!isAiAvailable()) return empty(`${NO_MODEL_CONFIGURED} Enter its figures below.`);

  const started = Date.now();
  try {
    const answer = await structured({
      name: "document_reading",
      system: SYSTEM,
      prompt: documentPrompt(
        args,
        text,
        "Extract every consumed or delivered item from this document.",
      ),
      schema: ExtractionSchema,
    });
    if (answer.stop === "refusal") {
      return empty("The model declined to read this document. Enter its figures below.");
    }
    if (answer.stop === "max_tokens") {
      return empty(
        "The document is too long to read in one pass. Split it, or enter its figures below.",
      );
    }
    if (!answer.value) {
      return empty("The model's answer could not be read. Enter the figures below.");
    }

    const extraction = crossCheck(validateExtraction(answer.value), text);
    return {
      extraction,
      outcome: {
        producedBy: "model",
        model: answer.model,
        inputTokens: answer.inputTokens,
        outputTokens: answer.outputTokens,
        latencyMs: Date.now() - started,
      },
    };
  } catch (error) {
    return empty(`The document could not be read automatically: ${describeError(error)}`);
  }
}

export function emptyExtraction(): Extraction {
  return {
    documentType: "other",
    issuer: null,
    documentNumber: null,
    documentDate: null,
    billingPeriod: null,
    lines: [],
    warnings: [],
    textChecked: false,
  };
}

/** A date the ingest step can read: YYYY-MM-DD or YYYY-MM, else null. */
export function normaliseDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  if (/^\d{4}-\d{2}(-\d{2})?$/.test(v)) return v;
  const dmy = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(v);
  if (dmy) return `${dmy[3]}-${dmy[2]!.padStart(2, "0")}-${dmy[1]!.padStart(2, "0")}`;
  return null;
}

/**
 * Treat the model's output as a proposal. Nothing here invents a value: bad
 * numbers are dropped (the line stays, with a null quantity, so a person sees
 * it), dates are normalised or cleared, confidence is clamped.
 */
export function validateExtraction(raw: RawExtraction): Extraction {
  const warnings = [...raw.warnings];
  const lines: ExtractedLine[] = raw.lines.slice(0, 200).map((l, i) => {
    let quantity = l.quantity;
    if (quantity !== null && (!Number.isFinite(quantity) || quantity < 0)) {
      warnings.push(`Line ${i + 1} (${l.description}): the quantity read was not a valid amount.`);
      quantity = null;
    }
    const unit = l.unit?.trim() || null;
    return {
      id: `l${i + 1}`,
      description: l.description.trim().slice(0, 200),
      category: (LINE_CATEGORIES as readonly string[]).includes(l.category) ? l.category : "other",
      quantity,
      unit,
      date: normaliseDate(l.date),
      cnCode: l.cnCode?.replace(/\s+/g, " ").trim() || null,
      supplySource: l.supplySource?.trim() || null,
      evidence: l.evidence.trim().slice(0, 300),
      page: l.page !== null && Number.isInteger(l.page) && l.page > 0 ? l.page : null,
      confidence: Math.min(1, Math.max(0, Number.isFinite(l.confidence) ? l.confidence : 0)),
      check: "no_text",
      unitKnown: unit !== null && resolveUnit(unit) !== null,
    };
  });
  if (raw.lines.length > 200) warnings.push("Only the first 200 lines were kept.");
  return {
    documentType: raw.documentType,
    issuer: raw.issuer?.trim() || null,
    documentNumber: raw.documentNumber?.trim() || null,
    documentDate: normaliseDate(raw.documentDate),
    billingPeriod:
      raw.billingPeriod &&
      normaliseDate(raw.billingPeriod.start) &&
      normaliseDate(raw.billingPeriod.end)
        ? {
            start: normaliseDate(raw.billingPeriod.start)!,
            end: normaliseDate(raw.billingPeriod.end)!,
          }
        : null,
    lines,
    warnings,
    textChecked: false,
  };
}

/**
 * Grouping commas removed, so "1,23,456.50" and "123,456.50" both read as
 * 123456.50. Spaces are left alone: they separate figures far more often than
 * they group digits, and removing them would fuse "G11 1,234" into one number.
 */
function numeric(s: string): string {
  return s.replace(/(?<=\d),(?=\d)/g, "");
}

/** The ways a quantity can be written, as bare digit strings. */
function renderings(q: number): string[] {
  const out = new Set<string>([String(q)]);
  for (const dp of [1, 2, 3]) out.add(q.toFixed(dp));
  if (Number.isInteger(q)) out.add(q.toFixed(0));
  return [...out];
}

/**
 * Look for every quantity in the document's own text. Photos and scans have
 * no text layer, so their lines stay "no_text" and are checked by eye.
 */
/**
 * Whether `value` is written anywhere in `text` as a whole number (not inside
 * a longer one), however its thousands are grouped. Shared by every reader
 * that checks a model's figure against the document it came from.
 */
export function numberInText(text: string, value: number): boolean {
  const haystack = numeric(text);
  return renderings(value).some((r) =>
    new RegExp(`(^|[^\\d.])${r.replace(".", "\\.")}(?![\\d])`).test(haystack),
  );
}

export function crossCheck(extraction: Extraction, text: string | null): Extraction {
  if (text === null || text.trim() === "") return { ...extraction, textChecked: false };
  const lines = extraction.lines.map((l) => {
    if (l.quantity === null) return { ...l, check: "not_found" as const };
    const found = numberInText(text, l.quantity);
    return { ...l, check: found ? ("found" as const) : ("not_found" as const) };
  });
  const missing = lines.filter((l) => l.check === "not_found" && l.quantity !== null).length;
  const warnings = [...extraction.warnings];
  if (missing > 0) {
    warnings.unshift(
      `${missing} figure${missing > 1 ? "s were" : " was"} not found in the document's text. Check ${missing > 1 ? "them" : "it"} against the document before using ${missing > 1 ? "them" : "it"}.`,
    );
  }
  return { ...extraction, lines, warnings, textChecked: true };
}

/** The PDF's text layer, or null for images and scans without one. */
export async function documentText(
  bytes: Uint8Array,
  mediaType: DocumentMediaType,
): Promise<string | null> {
  const kind = DOCUMENT_MEDIA_TYPES[mediaType];
  if (kind === "text") return new TextDecoder().decode(bytes);
  if (kind !== "pdf") return null;
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { text } = await extractText(pdf, { mergePages: true });
    return text.trim() ? text : null;
  } catch {
    return null;
  }
}
