/**
 * Unit and number normalisation.
 *
 * Production data from an Indian plant arrives in whatever the MIS exported:
 * "1,23,456.78" (lakh-grouped digits), "12.5 MU" (million units of electricity),
 * "450 KL" of furnace oil, "3.2 Lakh SCM" of natural gas. Getting this wrong is
 * not a rounding error, it is a factor-of-100,000 error in a legal declaration,
 * so every conversion here is explicit and unit-tested.
 */

export class UnitError extends Error {
  constructor(
    message: string,
    readonly input: string,
  ) {
    super(message);
    this.name = "UnitError";
  }
}

/** Canonical dimensions the engine works in. */
export type Dimension = "mass" | "volume" | "energy" | "electricity" | "currency" | "dimensionless";

export interface NormalisedQuantity {
  value: number;
  /** Canonical unit: t | m3 | TJ | MWh. */
  unit: string;
  dimension: Dimension;
  /** The unit token as written in the source file. */
  sourceUnit: string;
  /** Multiplier applied, so the audit trail can show the conversion. */
  factor: number;
}

/**
 * Indian digit grouping puts separators every two digits after the first three
 * ("1,23,45,678"), so a naive locale parse silently mangles the value. We strip
 * grouping separators entirely and validate what is left.
 *
 * Handles: "1,234.5" | "1,23,456.78" | "1 234,56" (EU) | "(1234)" negative |
 * "12.5%" | "₹1,23,456" | "1.2e3" | "" | "-" | "N/A".
 */
export function parseNumeric(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") return Number.isFinite(input) ? input : null;

  let s = input.trim();
  if (s === "") return null;

  // Common spreadsheet null markers.
  if (/^(n\/?a|nil|null|none|-{1,2}|—|\?+)$/i.test(s)) return null;

  // Accounting negatives: (1,234) means -1234.
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }

  // Strip currency symbols, unit suffixes and whitespace we do not need here.
  s = s.replace(/[₹$€£]/g, "").replace(/\s/g, "");
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  }
  if (s.startsWith("+")) s = s.slice(1);

  const isPercent = s.endsWith("%");
  if (isPercent) s = s.slice(0, -1);

  // Scientific notation passes through untouched.
  if (/^\d+(\.\d+)?[eE][+-]?\d+$/.test(s)) {
    const v = Number(s);
    return Number.isFinite(v) ? (negative ? -v : v) * (isPercent ? 0.01 : 1) : null;
  }

  const hasComma = s.includes(",");
  const hasDot = s.includes(".");

  if (hasComma && hasDot) {
    // Whichever separator appears last is the decimal mark.
    s = s.lastIndexOf(",") > s.lastIndexOf(".")
      ? s.replace(/\./g, "").replace(",", ".")
      : s.replace(/,/g, "");
  } else if (hasComma) {
    // One comma is ambiguous: "1,234" is grouping, "1234,56" is a European
    // decimal mark. Digit grouping - Western or Indian - always leaves exactly
    // three digits after the *first* separator, and never more than three
    // before it. Anything else is a decimal mark.
    const parts = s.split(",");
    if (parts.length === 2) {
      const head = parts[0] ?? "";
      const tail = parts[1] ?? "";
      const looksLikeGrouping = tail.length === 3 && head.length >= 1 && head.length <= 3;
      s = looksLikeGrouping ? s.replace(",", "") : s.replace(",", ".");
    } else {
      // Several commas can only be digit grouping.
      s = s.replace(/,/g, "");
    }
  }

  if (!/^\d*\.?\d+$/.test(s)) return null;
  const value = Number(s);
  if (!Number.isFinite(value)) return null;
  return (negative ? -value : value) * (isPercent ? 0.01 : 1);
}

interface UnitSpec {
  canonical: string;
  dimension: Dimension;
  factor: number;
}

/**
 * Unit token -> canonical conversion. Keys are lowercased and stripped of
 * punctuation and spaces by `normaliseToken`.
 */
const UNITS: Record<string, UnitSpec> = {
  // ---- Mass, canonical tonne ----
  t: { canonical: "t", dimension: "mass", factor: 1 },
  tonne: { canonical: "t", dimension: "mass", factor: 1 },
  tonnes: { canonical: "t", dimension: "mass", factor: 1 },
  ton: { canonical: "t", dimension: "mass", factor: 1 },
  tons: { canonical: "t", dimension: "mass", factor: 1 },
  mt: { canonical: "t", dimension: "mass", factor: 1 }, // Indian usage: metric tonne
  mts: { canonical: "t", dimension: "mass", factor: 1 },
  metrictonne: { canonical: "t", dimension: "mass", factor: 1 },
  metricton: { canonical: "t", dimension: "mass", factor: 1 },
  te: { canonical: "t", dimension: "mass", factor: 1 },
  kt: { canonical: "t", dimension: "mass", factor: 1e3 },
  kilotonne: { canonical: "t", dimension: "mass", factor: 1e3 },
  kg: { canonical: "t", dimension: "mass", factor: 1e-3 },
  kgs: { canonical: "t", dimension: "mass", factor: 1e-3 },
  kilogram: { canonical: "t", dimension: "mass", factor: 1e-3 },
  kilograms: { canonical: "t", dimension: "mass", factor: 1e-3 },
  quintal: { canonical: "t", dimension: "mass", factor: 0.1 },
  qtl: { canonical: "t", dimension: "mass", factor: 0.1 },
  lakhtonne: { canonical: "t", dimension: "mass", factor: 1e5 },
  lakht: { canonical: "t", dimension: "mass", factor: 1e5 },

  // ---- Volume, canonical cubic metre ----
  m3: { canonical: "m3", dimension: "volume", factor: 1 },
  cum: { canonical: "m3", dimension: "volume", factor: 1 },
  cubicmetre: { canonical: "m3", dimension: "volume", factor: 1 },
  cubicmeter: { canonical: "m3", dimension: "volume", factor: 1 },
  scm: { canonical: "m3", dimension: "volume", factor: 1 }, // standard cubic metre
  nm3: { canonical: "m3", dimension: "volume", factor: 1 }, // normal cubic metre
  sm3: { canonical: "m3", dimension: "volume", factor: 1 },
  lakhscm: { canonical: "m3", dimension: "volume", factor: 1e5 },
  mmscm: { canonical: "m3", dimension: "volume", factor: 1e6 },
  l: { canonical: "m3", dimension: "volume", factor: 1e-3 },
  ltr: { canonical: "m3", dimension: "volume", factor: 1e-3 },
  ltrs: { canonical: "m3", dimension: "volume", factor: 1e-3 },
  litre: { canonical: "m3", dimension: "volume", factor: 1e-3 },
  litres: { canonical: "m3", dimension: "volume", factor: 1e-3 },
  liter: { canonical: "m3", dimension: "volume", factor: 1e-3 },
  kl: { canonical: "m3", dimension: "volume", factor: 1 }, // kilolitre == m3
  kilolitre: { canonical: "m3", dimension: "volume", factor: 1 },
  kilolitres: { canonical: "m3", dimension: "volume", factor: 1 },

  // ---- Energy, canonical terajoule ----
  tj: { canonical: "TJ", dimension: "energy", factor: 1 },
  gj: { canonical: "TJ", dimension: "energy", factor: 1e-3 },
  mj: { canonical: "TJ", dimension: "energy", factor: 1e-6 },
  kj: { canonical: "TJ", dimension: "energy", factor: 1e-9 },
  mmbtu: { canonical: "TJ", dimension: "energy", factor: 1.055056e-3 },
  gcal: { canonical: "TJ", dimension: "energy", factor: 4.1868e-3 },
  mcal: { canonical: "TJ", dimension: "energy", factor: 4.1868e-6 },
  kcal: { canonical: "TJ", dimension: "energy", factor: 4.1868e-9 },

  // ---- Electricity, canonical MWh ----
  mwh: { canonical: "MWh", dimension: "electricity", factor: 1 },
  kwh: { canonical: "MWh", dimension: "electricity", factor: 1e-3 },
  gwh: { canonical: "MWh", dimension: "electricity", factor: 1e3 },
  unit: { canonical: "MWh", dimension: "electricity", factor: 1e-3 }, // 1 "unit" = 1 kWh
  units: { canonical: "MWh", dimension: "electricity", factor: 1e-3 },
  // "MU" = million units = 1e6 kWh = 1000 MWh. Ubiquitous on Indian power bills
  // and a classic 1000x error when read as MWh.
  mu: { canonical: "MWh", dimension: "electricity", factor: 1e3 },
  millionunits: { canonical: "MWh", dimension: "electricity", factor: 1e3 },
  lakhunits: { canonical: "MWh", dimension: "electricity", factor: 1e2 },
};

/** Lowercase, drop punctuation, spaces and a trailing plural "s" where safe. */
function normaliseToken(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/[.\s_\-/]/g, "")
    .replace(/³/g, "3")
    .trim();
}

/** Look up a unit token. Returns null when the token is not recognised. */
export function resolveUnit(token: string): UnitSpec | null {
  const key = normaliseToken(token);
  if (key === "") return null;
  return UNITS[key] ?? null;
}

/**
 * Convert a value expressed in `sourceUnit` into the canonical unit for its
 * dimension. Throws `UnitError` rather than guessing, because a silent unit
 * assumption is exactly the failure mode this whole product exists to prevent.
 */
export function normaliseQuantity(
  value: number,
  sourceUnit: string,
  expected?: Dimension,
): NormalisedQuantity {
  const spec = resolveUnit(sourceUnit);
  if (!spec) {
    throw new UnitError(`Unrecognised unit "${sourceUnit}"`, sourceUnit);
  }
  if (expected && spec.dimension !== expected) {
    throw new UnitError(
      `Unit "${sourceUnit}" is a ${spec.dimension} unit but a ${expected} unit was expected`,
      sourceUnit,
    );
  }
  return {
    value: value * spec.factor,
    unit: spec.canonical,
    dimension: spec.dimension,
    sourceUnit,
    factor: spec.factor,
  };
}

/**
 * Pull a unit out of a free-text header such as "Coal Consumed (MT)" or
 * "Power drawn - MU". Returns null when the header carries no unit, which is
 * itself a finding: the mapper then has to infer it and flag lower confidence.
 */
export function extractUnitFromHeader(header: string): string | null {
  const bracketed = header.match(/[([{]([^)\]}]+)[)\]}]/);
  if (bracketed?.[1]) {
    const inner = bracketed[1].trim();
    if (resolveUnit(inner)) return inner;
    // "(in MT)" / "(in '000 MT)"
    const stripped = inner.replace(/^in\s+/i, "").trim();
    if (resolveUnit(stripped)) return stripped;
  }
  const trailing = header.match(/[-–,:]\s*([A-Za-z0-9³/.]+)\s*$/);
  if (trailing?.[1] && resolveUnit(trailing[1])) return trailing[1];

  const lastWord = header.trim().split(/\s+/).pop();
  if (lastWord && resolveUnit(lastWord) && !/^[a-z]+$/i.test(header.trim())) {
    return lastWord;
  }
  return null;
}

/** Every unit token the engine understands. Used by the mapper's prompt and the UI. */
export function knownUnits(): string[] {
  return Object.keys(UNITS);
}

/**
 * Convert a fuel quantity into energy content (TJ), which is what the
 * combustion emission factors are expressed against.
 */
export function fuelEnergyTJ(args: {
  quantity: number;
  unit: "t" | "m3" | "TJ";
  ncvGJPerTonne?: number;
  densityTPerM3?: number;
}): number {
  const { quantity, unit, ncvGJPerTonne, densityTPerM3 } = args;
  if (unit === "TJ") return quantity;
  if (ncvGJPerTonne === undefined) {
    throw new UnitError("Cannot convert fuel to energy without a net calorific value", unit);
  }
  if (unit === "t") return (quantity * ncvGJPerTonne) / 1000;
  if (densityTPerM3 === undefined) {
    throw new UnitError("Cannot convert a volumetric fuel to energy without a density", unit);
  }
  return (quantity * densityTPerM3 * ncvGJPerTonne) / 1000;
}
