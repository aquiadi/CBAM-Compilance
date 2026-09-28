import benchmarksFile from "./generated/benchmarks.json";
import defaultValuesFile from "./generated/default-values.json";

/**
 * The Commission's published reference tables, and the rules for reading them.
 *
 * Everything in here is data the engine is not allowed to make up: CBAM
 * benchmarks for the free allocation adjustment, default values for embedded
 * emissions, the CBAM factor that phases free allocation out, the default-value
 * mark-ups and the published certificate prices. Each carries the act and the
 * version it came from, and each is rendered on the Methodology screen.
 *
 * The large tables are generated from the Commission's own workbooks by
 * `scripts/import-regulatory.ts`. The small ones are transcribed below with the
 * document they come from, because they are short enough to check by eye.
 */

// ---------------------------------------------------------------- source docs

export interface RegulatorySource {
  act: string;
  title: string;
  table: string;
  publisher: string;
  version: string;
  url: string;
  file?: string;
  sha256?: string;
  caveat: string;
}

interface BenchmarksFile {
  source: RegulatorySource;
  entries: Record<string, { d: string; s: Sector; a: [number, string][]; b: [number, string][] }>;
}

/** [code digits, direct, indirect, total, route indicator] */
type DefaultRow = [string, number | null, number | null, number | null, string];

interface DefaultValuesFile {
  source: RegulatorySource;
  descriptions: Record<string, string>;
  sectors: Record<string, Sector>;
  countries: Record<string, { name: string; rows: DefaultRow[] }>;
  other: DefaultRow[];
  annexIV: DefaultRow[];
}

const BENCHMARKS = benchmarksFile as unknown as BenchmarksFile;
const DEFAULT_VALUES = defaultValuesFile as unknown as DefaultValuesFile;

export type Sector =
  "cement" | "fertilisers" | "iron_steel" | "aluminium" | "hydrogen" | "electricity";

export const CBAM_REGULATION =
  "Regulation (EU) 2023/956, as amended by Regulation (EU) 2025/2083 (simplification)";

export const REGULATORY_SOURCES: Record<
  | "benchmarks"
  | "defaultValues"
  | "methodology"
  | "verification"
  | "guidanceFreeAllocation"
  | "guidanceMethods"
  | "certificatePrice",
  RegulatorySource
> = {
  benchmarks: BENCHMARKS.source,
  defaultValues: DEFAULT_VALUES.source,
  methodology: {
    act: "Commission Implementing Regulation (EU) 2025/2547",
    title: "Methodology for calculating embedded emissions (definitive period)",
    table: "Annexes I-III",
    publisher: "European Commission",
    version: "2025-12",
    url: "http://data.europa.eu/eli/reg_impl/2025/2547/oj",
    caveat: "Only the text in the Official Journal is legally binding.",
  },
  verification: {
    act: "Commission Implementing Regulation (EU) 2025/2546 and Delegated Regulation (EU) 2025/2551",
    title: "Verification principles; accreditation and verification requirements",
    table: "-",
    publisher: "European Commission",
    version: "2025-12",
    url: "http://data.europa.eu/eli/reg_impl/2025/2546/oj",
    caveat: "Only the text in the Official Journal is legally binding.",
  },
  guidanceFreeAllocation: {
    act: "Guidance Document 4 (DG TAXUD)",
    title: "CBAM calculation of the free allocation adjustment",
    table: "Table 2-1 (CBAM factor and CSCF), equations 1-6",
    publisher: "European Commission, DG TAXUD",
    version: "2026-08-14",
    url: "https://taxation-customs.ec.europa.eu/carbon-border-adjustment-mechanism/cbam-legislation-and-guidance_en",
    caveat: "Guidance is explanatory and not legally binding.",
  },
  guidanceMethods: {
    act: "Guidance Document 3 (DG TAXUD)",
    title: "CBAM methods for the calculation of emissions embedded in goods",
    table: "Section 4.10 (default values and mark-ups)",
    publisher: "European Commission, DG TAXUD",
    version: "2026",
    url: "https://taxation-customs.ec.europa.eu/carbon-border-adjustment-mechanism/cbam-legislation-and-guidance_en",
    caveat: "Guidance is explanatory and not legally binding.",
  },
  certificatePrice: {
    act: "Commission Implementing Regulation (EU) 2025/2548",
    title: "Methodology for calculating and publishing the price of CBAM certificates",
    table: "Quarterly prices 2026",
    publisher: "European Commission, DG TAXUD",
    version: "2026-07-06",
    url: "https://taxation-customs.ec.europa.eu/carbon-border-adjustment-mechanism/price-cbam-certificates_en",
    caveat: "Prices for quarters not yet published are the user's assumption, and are labelled so.",
  },
};

// ------------------------------------------------------ CBAM factor and CSCF

/**
 * The CBAM factor of Article 10a(1a) of the EU ETS Directive: the share of EU
 * free allocation still granted in a year. It is the multiplier on the CBAM
 * benchmark in the free allocation adjustment, so the obligation per tonne is
 * embedded emissions minus (factor x CSCF x benchmark), not a share of the
 * embedded emissions. Source: Guidance Document 4, Table 2-1.
 */
export const CBAM_FACTOR: Record<number, number> = {
  2025: 1.0,
  2026: 0.975,
  2027: 0.95,
  2028: 0.9,
  2029: 0.775,
  2030: 0.515,
  2031: 0.39,
  2032: 0.265,
  2033: 0.14,
  2034: 0,
};

/**
 * Cross-sectoral correction factor. Guidance Document 4 (Table 2-1) lists 1.0
 * for 2026-2030, published in Implementing Decision (EU) 2026/1862; values from
 * 2031 are preliminary until the Commission publishes them.
 */
export const CSCF: Record<number, { value: number; preliminary: boolean }> = {
  2025: { value: 1, preliminary: false },
  2026: { value: 1, preliminary: false },
  2027: { value: 1, preliminary: false },
  2028: { value: 1, preliminary: false },
  2029: { value: 1, preliminary: false },
  2030: { value: 1, preliminary: false },
  2031: { value: 1, preliminary: true },
  2032: { value: 1, preliminary: true },
  2033: { value: 1, preliminary: true },
  2034: { value: 1, preliminary: true },
};

export const FIRST_DEFINITIVE_YEAR = 2026;
export const LAST_PHASE_IN_YEAR = 2034;

export function cbamFactor(year: number): number {
  if (year <= 2025) return 1;
  if (year >= LAST_PHASE_IN_YEAR) return 0;
  return CBAM_FACTOR[year] ?? 0;
}

export function cscf(year: number): { value: number; preliminary: boolean } {
  return (
    CSCF[Math.min(Math.max(year, 2025), LAST_PHASE_IN_YEAR)] ?? { value: 1, preliminary: true }
  );
}

// ------------------------------------------------------------------ mark-ups

/**
 * Default values are increased by a mark-up: 10% in 2026, 20% in 2027 and 30%
 * from 2028; fertilisers carry 1% from 2026 onwards. Guidance Document 3,
 * section 4.10.1.
 */
export function defaultValueMarkup(sector: Sector, year: number): number {
  if (year < FIRST_DEFINITIVE_YEAR) return 0;
  if (sector === "fertilisers") return 0.01;
  if (sector === "electricity") return 0;
  if (year === 2026) return 0.1;
  if (year === 2027) return 0.2;
  return 0.3;
}

// ------------------------------------------------------- certificate prices

export interface QuarterlyPrice {
  quarter: string;
  priceEur: number;
  published: string;
}

/**
 * Prices the Commission has published for 2026, one per calendar quarter. From
 * 2027 prices are weekly and certificates are bought on the central platform.
 */
export const PUBLISHED_CERTIFICATE_PRICES: QuarterlyPrice[] = [
  { quarter: "2026-Q1", priceEur: 75.36, published: "2026-04-07" },
  { quarter: "2026-Q2", priceEur: 75.28, published: "2026-07-06" },
];

export function publishedPrice(quarter: string): QuarterlyPrice | undefined {
  return PUBLISHED_CERTIFICATE_PRICES.find((p) => p.quarter === quarter);
}

export function quarterOf(isoDate: string): string {
  const year = isoDate.slice(0, 4);
  const month = Number(isoDate.slice(5, 7));
  return `${year}-Q${Math.floor((Math.max(1, month) - 1) / 3) + 1}`;
}

// --------------------------------------------------------------- benchmarks

/**
 * Route indicators used in the benchmark and default-value tables.
 * Guidance Document 4, Table 2-2.
 */
export const ROUTE_INDICATORS: Record<string, string> = {
  A: "Grey clinker / cement",
  B: "White clinker / cement",
  C: "Carbon steel, BF/BOF (blast furnace / basic oxygen furnace)",
  D: "Carbon steel, DRI/EAF (direct reduced iron / electric arc furnace)",
  E: "Carbon steel, scrap/EAF",
  F: "Low alloy steel, BF/BOF",
  G: "Low alloy steel, DRI/EAF",
  H: "Low alloy steel, scrap/EAF",
  J: "High alloy steel (EAF)",
  K: "Primary aluminium (electrolysis)",
  L: "Secondary aluminium (remelted scrap)",
};

export interface BenchmarkChoice {
  value: number;
  indicator: string;
  column: "A" | "B";
  cnCode: string;
}

export type BenchmarkLookup =
  | { ok: true; choice: BenchmarkChoice }
  | { ok: false; reason: "not_found" | "route_required"; options?: string[]; message: string };

export function benchmarkEntry(cnCode: string) {
  return BENCHMARKS.entries[cnCode.replace(/\D/g, "").slice(0, 8)];
}

/** "1" for production years 2026-27, "2" for 2028 onwards (Table 2-2). */
function yearIndicator(year: number): "1" | "2" {
  return year <= 2027 ? "1" : "2";
}

/**
 * Select a CBAM benchmark. Column A is the process-level benchmark used with
 * actual data; column B covers the whole production chain and is used with
 * default values. Some codes differ by production route (C/D/E...) or by
 * production year ((1) 2026-27, (2) 2028-30), and some by both ("F1").
 */
export function lookupBenchmark(args: {
  cnCode: string;
  column: "A" | "B";
  year: number;
  route?: string | null;
}): BenchmarkLookup {
  const cn = args.cnCode.replace(/\D/g, "").slice(0, 8);
  const entry = BENCHMARKS.entries[cn];
  if (!entry) {
    return {
      ok: false,
      reason: "not_found",
      message: `No CBAM benchmark is published for CN ${cn}.`,
    };
  }
  const values = args.column === "A" ? entry.a : entry.b;
  const yi = yearIndicator(args.year);

  // Keep the candidates whose year component (if any) matches.
  const byYear = values.filter(([, ind]) => {
    const digit = ind.replace(/\D/g, "");
    return digit === "" || digit === yi;
  });
  const routes = [...new Set(byYear.map(([, ind]) => ind.replace(/\d/g, "")))];

  if (routes.length <= 1) {
    const first = byYear[0];
    if (!first) {
      return {
        ok: false,
        reason: "not_found",
        message: `No benchmark for CN ${cn} in ${args.year}.`,
      };
    }
    return {
      ok: true,
      choice: { value: first[0], indicator: first[1], column: args.column, cnCode: cn },
    };
  }

  const wanted = (args.route ?? "").toUpperCase();
  const hit = byYear.find(([, ind]) => ind.replace(/\d/g, "") === wanted);
  if (!hit) {
    return {
      ok: false,
      reason: "route_required",
      options: routes,
      message:
        `The column ${args.column} benchmark for CN ${cn} depends on the production route ` +
        `(${routes.map((r) => `${r}: ${ROUTE_INDICATORS[r] ?? r}`).join("; ")}).`,
    };
  }
  return {
    ok: true,
    choice: { value: hit[0], indicator: hit[1], column: args.column, cnCode: cn },
  };
}

/** CN codes with a published benchmark: the Annex I goods other than electricity. */
export function benchmarkedCnCodes(): string[] {
  return Object.keys(BENCHMARKS.entries);
}

export function benchmarkDescription(cnCode: string): string | undefined {
  return benchmarkEntry(cnCode)?.d;
}

export function benchmarkSector(cnCode: string): Sector | undefined {
  return benchmarkEntry(cnCode)?.s;
}

// ------------------------------------------------------------ default values

export interface DefaultValue {
  cnCode: string;
  /** Code as it appears in the table (4-10 digits). */
  tableCode: string;
  description: string;
  sector: Sector;
  direct: number | null;
  indirect: number | null;
  /** The value that counts: direct only for Annex II goods, else direct + indirect. */
  total: number;
  /** Route indicator used to pick the column B benchmark. */
  route: string;
  table: string;
  country: string | null;
}

export type DefaultValueLookup =
  | { ok: true; value: DefaultValue }
  | { ok: false; reason: "not_found" | "ambiguous"; options?: string[]; message: string };

function bestRow(rows: DefaultRow[], cn: string): DefaultRow[] {
  // Rows whose code is a prefix of the CN code; the longest wins. A table code
  // longer than the CN code (a 10-digit TARIC split) is ambiguous without it.
  const prefixes = rows.filter(([code]) => cn.startsWith(code));
  if (prefixes.length > 0) {
    const longest = Math.max(...prefixes.map(([code]) => code.length));
    return prefixes.filter(([code]) => code.length === longest);
  }
  return rows.filter(([code]) => code.startsWith(cn) && code.length > cn.length);
}

function toValue(row: DefaultRow, cn: string, table: string, country: string | null): DefaultValue {
  const [code, direct, indirect, total, route] = row;
  const sector = DEFAULT_VALUES.sectors[code] ?? "iron_steel";
  return {
    cnCode: cn,
    tableCode: code,
    description: DEFAULT_VALUES.descriptions[code] ?? "",
    sector,
    direct,
    indirect,
    total: total ?? direct ?? 0,
    route,
    table,
    country,
  };
}

/**
 * Default value for a good from a given country, following the Commission's
 * look-up order: the country's table in Annex I; where the good is not listed
 * there (or shows "-"), the "Other countries and territories" table; and for a
 * precursor of unknown origin, Annex IV (the highest default value).
 */
export function lookupDefaultValue(args: {
  cnCode: string;
  country?: string | null;
  precursorOfUnknownOrigin?: boolean;
}): DefaultValueLookup {
  const cn = args.cnCode.replace(/\D/g, "");
  const tables: { rows: DefaultRow[]; label: string; country: string | null }[] = [];

  if (args.precursorOfUnknownOrigin || !args.country) {
    tables.push({
      rows: args.precursorOfUnknownOrigin ? DEFAULT_VALUES.annexIV : DEFAULT_VALUES.other,
      label: args.precursorOfUnknownOrigin
        ? "Annex IV (highest default value, origin unknown)"
        : "Annex I - Other countries and territories",
      country: null,
    });
  } else {
    const country = DEFAULT_VALUES.countries[args.country.toUpperCase()];
    if (country) {
      tables.push({
        rows: country.rows,
        label: `Annex I - ${country.name}`,
        country: args.country.toUpperCase(),
      });
    }
    tables.push({
      rows: DEFAULT_VALUES.other,
      label: "Annex I - Other countries and territories",
      country: null,
    });
  }

  for (const table of tables) {
    const rows = bestRow(table.rows, cn);
    if (rows.length === 1 && rows[0]) {
      return { ok: true, value: toValue(rows[0], cn, table.label, table.country) };
    }
    if (rows.length > 1) {
      return {
        ok: false,
        reason: "ambiguous",
        options: rows.map(([code]) => code),
        message:
          `${table.label} lists CN ${cn} at TARIC level (${rows.map(([code]) => code).join(", ")}); ` +
          `the 10-digit code is needed to choose a default value.`,
      };
    }
  }
  return {
    ok: false,
    reason: "not_found",
    message: `No default value is published for CN ${cn}${args.country ? ` from ${args.country}` : ""}.`,
  };
}

export function defaultValueCountries(): { code: string; name: string }[] {
  return Object.entries(DEFAULT_VALUES.countries)
    .map(([code, c]) => ({ code, name: c.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Rows of one country's table, for the methodology and settings screens. */
export function defaultValueTable(country: string): DefaultValue[] {
  const c = DEFAULT_VALUES.countries[country.toUpperCase()];
  if (!c) return [];
  return c.rows.map((row) => toValue(row, row[0], `Annex I - ${c.name}`, country.toUpperCase()));
}

const COUNTRY_ALIASES: Record<string, string> = {
  usa: "US",
  "united states of america": "US",
  us: "US",
  uk: "GB",
  "great britain": "GB",
  britain: "GB",
  england: "GB",
  uae: "AE",
  "south korea": "KR",
  korea: "KR",
  "republic of korea": "KR",
  russia: "RU",
  turkey: "TR",
  turkiye: "TR",
  vietnam: "VN",
  iran: "IR",
  "cote d'ivoire": "CI",
  "côte d'ivoire": "CI",
  bharat: "IN",
};

/**
 * ISO 3166-1 alpha-2 code for a country as written in a source file: a code
 * ("IN"), the Commission's sheet name ("India") or a common alias ("UAE").
 * Returns null rather than guessing when nothing matches.
 */
export function countryCode(input: string | null | undefined): string | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;
  const upper = raw.toUpperCase();
  if (upper.length === 2 && /^[A-Z]{2}$/.test(upper)) return upper;
  const lower = raw.toLowerCase();
  if (COUNTRY_ALIASES[lower]) return COUNTRY_ALIASES[lower];
  for (const [code, c] of Object.entries(DEFAULT_VALUES.countries)) {
    if (c.name.toLowerCase() === lower) return code;
  }
  return null;
}
