/**
 * Imports the Commission's published CBAM reference tables into the engine.
 *
 *   npm run regulatory:import
 *
 * Reads the two workbooks DG TAXUD publishes alongside the implementing acts
 * and writes compact JSON the engine imports directly:
 *
 * - CBAM benchmarks (Annex to Implementing Regulation (EU) 2025/2620), used for
 *   the free allocation adjustment.
 * - Default values (Annex I and IV to Implementing Regulation (EU) 2025/2621 as
 *   corrected by Implementing Regulation (EU) 2026/1740), used wherever actual
 *   embedded emissions are not available.
 *
 * The source workbooks are committed under data/regulatory/source so the import
 * is reproducible offline, and the SHA-256 of each is written into the output.
 * Replacing a workbook with a newer Commission release and re-running this
 * script is the whole update procedure; nothing in the engine is hand-edited.
 *
 * The Commission marks these files as informational, with the Official Journal
 * text authoritative. The generated tables record that caveat alongside the
 * data so it travels into every export.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import ExcelJS from "exceljs";

const ROOT = process.cwd();
const SOURCE_DIR = join(ROOT, "data", "regulatory", "source");
const OUT_DIR = join(ROOT, "src", "lib", "cbam", "regulatory", "generated");

const BENCHMARK_FILE = "cbam-benchmarks-ir-2025-2620-v20260206.xlsx";
const DEFAULTS_FILE = "cbam-default-values-ir-2025-2621-corrected-2026-1740-v20260806.xlsx";

const BENCHMARK_URL =
  "https://taxation-customs.ec.europa.eu/document/download/9877523c-2a02-4926-a211-aefae7cf6d0d_en?filename=CBAM%20Benchmarks_20260206.xlsx";
const DEFAULTS_URL =
  "https://taxation-customs.ec.europa.eu/document/download/1c05d211-80cb-4aaa-8ef0-e08005a95d7e_en";

/** Sheet names in the default-values workbook, mapped to ISO 3166-1 alpha-2. */
const COUNTRY_CODES: Record<string, string> = {
  Albania: "AL",
  Algeria: "DZ",
  Angola: "AO",
  Argentina: "AR",
  Armenia: "AM",
  Australia: "AU",
  Azerbaijan: "AZ",
  Bangladesh: "BD",
  Bahrain: "BH",
  Belarus: "BY",
  Benin: "BJ",
  Bolivia: "BO",
  "Bosnia and Herzegovina": "BA",
  Brazil: "BR",
  Brunei: "BN",
  Cambodia: "KH",
  Cameroon: "CM",
  Canada: "CA",
  Chile: "CL",
  China: "CN",
  Colombia: "CO",
  Congo: "CG",
  "Congo, Democratic Republic of": "CD",
  "Costa Rica": "CR",
  Cuba: "CU",
  Curaçao: "CW",
  "Dominican Republic": "DO",
  Ecuador: "EC",
  Egypt: "EG",
  "El Salvador": "SV",
  "Equatorial Guinea": "GQ",
  Eritrea: "ER",
  Eswatini: "SZ",
  Ethiopia: "ET",
  Gabon: "GA",
  Georgia: "GE",
  Ghana: "GH",
  Guatemala: "GT",
  Haiti: "HT",
  Honduras: "HN",
  "Hong Kong": "HK",
  India: "IN",
  Indonesia: "ID",
  "Iran, Islamic Republic of": "IR",
  Iraq: "IQ",
  Israel: "IL",
  "Ivory Coast": "CI",
  Jamaica: "JM",
  Japan: "JP",
  Jordan: "JO",
  Kazakhstan: "KZ",
  Kenya: "KE",
  "Korea, Republic of (South Korea": "KR",
  Kuwait: "KW",
  Kyrgyzstan: "KG",
  Laos: "LA",
  Lebanon: "LB",
  Liberia: "LR",
  Libya: "LY",
  Madagascar: "MG",
  Malaysia: "MY",
  Mali: "ML",
  Mauritania: "MR",
  Mauritius: "MU",
  Mexico: "MX",
  "Moldova, Republic of": "MD",
  Mongolia: "MN",
  Montenegro: "ME",
  Morocco: "MA",
  Mozambique: "MZ",
  Myanmar: "MM",
  Namibia: "NA",
  Nepal: "NP",
  "New Caledonia and dependencies": "NC",
  "New Zealand": "NZ",
  Nicaragua: "NI",
  Niger: "NE",
  Nigeria: "NG",
  "North Korea (Democratic People’": "KP",
  "North Macedonia": "MK",
  Oman: "OM",
  Pakistan: "PK",
  Panama: "PA",
  "Papua New Guinea": "PG",
  Paraguay: "PY",
  Peru: "PE",
  Philippines: "PH",
  Qatar: "QA",
  "Russian Federation": "RU",
  Rwanda: "RW",
  "Saudi Arabia": "SA",
  Senegal: "SN",
  Serbia: "RS",
  "Sierra Leone": "SL",
  Singapore: "SG",
  "South Africa": "ZA",
  "Sri Lanka": "LK",
  Sudan: "SD",
  Suriname: "SR",
  Syria: "SY",
  Taiwan: "TW",
  Tajikistan: "TJ",
  "Tanzania, United Republic of": "TZ",
  Thailand: "TH",
  Togo: "TG",
  "Trinidad and Tobago": "TT",
  Tunisia: "TN",
  Türkiye: "TR",
  Turkmenistan: "TM",
  Uganda: "UG",
  Ukraine: "UA",
  "United Arab Emirates": "AE",
  "United Kingdom": "GB",
  "United States": "US",
  Uruguay: "UY",
  Uzbekistan: "UZ",
  Venezuela: "VE",
  "Viet Nam": "VN",
  Yemen: "YE",
  Zambia: "ZM",
  Zimbabwe: "ZW",
};

/** Display names for the sheets whose tab names the workbook truncates. */
const COUNTRY_NAMES: Record<string, string> = {
  KR: "Korea, Republic of",
  KP: "Korea, Democratic People's Republic of",
};

type Sector = "cement" | "fertilisers" | "iron_steel" | "aluminium" | "hydrogen" | "electricity";

const SECTOR_HEADINGS: Record<string, Sector> = {
  cement: "cement",
  fertilisers: "fertilisers",
  "iron & steel": "iron_steel",
  "iron and steel": "iron_steel",
  aluminium: "aluminium",
  hydrogen: "hydrogen",
  electricity: "electricity",
};

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function text(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((r) => r.text).join("");
    if ("result" in value) return text(value.result as ExcelJS.CellValue);
    if (value instanceof Date) return value.toISOString();
  }
  return String(value).trim();
}

/** "4,270" (EU decimal comma), 4.27, "-" (no value), "N/A" (not applicable). */
function number(value: ExcelJS.CellValue): number | null {
  const s = text(value).replace(/\s/g, "").replace(",", ".");
  if (s === "" || s === "-" || /^n\/?a$/i.test(s) || /see/i.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function route(value: ExcelJS.CellValue): string {
  // "(C)", "(1)", "(C)/(F)" -> "C", "1", "C/F"
  return text(value).replace(/[()]/g, "").replace(/\s/g, "");
}

function rows(sheet: ExcelJS.Worksheet): ExcelJS.CellValue[][] {
  const out: ExcelJS.CellValue[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values = row.values as ExcelJS.CellValue[];
    // ExcelJS rows are 1-indexed; drop the empty slot at index 0.
    out.push(values.slice(1));
  });
  return out;
}

// ------------------------------------------------------------------ benchmarks

interface BenchmarkEntry {
  /** CN description as published. */
  d: string;
  s: Sector;
  /** Column A: process-level benchmark BMg*, as [value, indicator] pairs. */
  a: [number, string][];
  /** Column B: default benchmark BMg including precursors. */
  b: [number, string][];
}

async function importBenchmarks() {
  const path = join(SOURCE_DIR, BENCHMARK_FILE);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  const sheet = wb.getWorksheet("Benchmarks");
  if (!sheet) throw new Error("Benchmarks sheet not found");

  const entries: Record<string, BenchmarkEntry> = {};
  let sector: Sector | null = null;
  let current: BenchmarkEntry | null = null;
  let currentCn = "";

  for (const r of rows(sheet)) {
    const [cnCell, descCell, aVal, aRoute, bVal, bRoute] = r;
    const cn = text(cnCell).replace(/\D/g, "");
    const heading = text(cnCell).toLowerCase();

    if (!cn && heading && SECTOR_HEADINGS[heading]) {
      sector = SECTOR_HEADINGS[heading];
      current = null;
      continue;
    }
    if (heading.startsWith("cn code")) continue;

    // The workbook merges the CN cell across a code's route rows, and ExcelJS
    // repeats a merged cell's value on every row it spans - so a repeated code
    // is a continuation of the same entry, not a new one.
    if (cn && cn !== currentCn) {
      if (!sector) throw new Error(`CN ${cn} appears before any sector heading`);
      current = { d: text(descCell), s: sector, a: [], b: [] };
      entries[cn] = current;
      currentCn = cn;
    }
    if (!current) continue;

    // Merged value cells repeat too, so identical pairs are recorded once.
    const push = (list: [number, string][], value: number | null, indicator: string) => {
      if (value === null) return;
      if (list.some(([v, i]) => v === value && i === indicator)) return;
      list.push([value, indicator]);
    };
    push(current.a, number(aVal), route(aRoute));
    push(current.b, number(bVal), route(bRoute));
  }

  const out = {
    source: {
      act: "Commission Implementing Regulation (EU) 2025/2620",
      title:
        "Calculation of the free allocation adjustment to the number of CBAM certificates to be surrendered",
      table: "Annex, point 5 (CBAM benchmarks, columns A and B)",
      publisher: "European Commission, DG TAXUD",
      version: "2026-02-06",
      url: BENCHMARK_URL,
      file: BENCHMARK_FILE,
      sha256: sha256(path),
      caveat:
        "Informational copy published by the Commission; only the text in the Official Journal is legally binding.",
    },
    entries,
  };

  writeFileSync(join(OUT_DIR, "benchmarks.json"), JSON.stringify(out));
  console.log(`benchmarks: ${Object.keys(entries).length} CN codes`);
}

// --------------------------------------------------------------- default values

/** [code digits, direct, indirect, total, route] - null where the act gives none. */
type DefaultRow = [string, number | null, number | null, number | null, string];

async function importDefaults() {
  const path = join(SOURCE_DIR, DEFAULTS_FILE);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);

  const descriptions: Record<string, string> = {};
  const sectors: Record<string, Sector> = {};
  const countries: Record<string, { name: string; rows: DefaultRow[] }> = {};
  let other: DefaultRow[] = [];
  let annexIV: DefaultRow[] = [];

  for (const sheet of wb.worksheets) {
    const name = sheet.name;
    if (name === "Overview" || name === "Version History") continue;

    const isAnnexIV = name === "Annex IV";
    const isOther = name.startsWith("_Other");
    const iso = COUNTRY_CODES[name];
    if (!isAnnexIV && !isOther && !iso) throw new Error(`No ISO code for sheet "${name}"`);

    const out: DefaultRow[] = [];
    let sector: Sector | null = null;

    for (const r of rows(sheet)) {
      const code = text(r[0]);
      const digits = code.replace(/\D/g, "");
      const heading = code.toLowerCase();
      if (!digits) {
        if (SECTOR_HEADINGS[heading]) sector = SECTOR_HEADINGS[heading];
        continue;
      }
      if (!sector) continue;
      descriptions[digits] ??= text(r[1]);
      sectors[digits] ??= sector;

      if (isAnnexIV) {
        // Annex IV has one value column: the highest default value.
        const total = number(r[2]);
        if (total === null) continue;
        out.push([digits, null, null, total, route(r[3])]);
        continue;
      }

      const direct = number(r[2]);
      const indirect = number(r[3]);
      const total = number(r[4]);
      // "see below" parent rows and "-" rows carry no value for this country.
      if (direct === null && total === null) continue;
      out.push([digits, direct, indirect, total, route(r[5])]);
    }

    if (isAnnexIV) annexIV = out;
    else if (isOther) other = out;
    else if (iso) countries[iso] = { name: COUNTRY_NAMES[iso] ?? name, rows: out };
  }

  const result = {
    source: {
      act: "Commission Implementing Regulation (EU) 2025/2621, as corrected by Commission Implementing Regulation (EU) 2026/1740",
      title: "Default values for the specific embedded emissions of CBAM goods",
      table: "Annex I (per country and 'Other countries and territories') and Annex IV",
      publisher: "European Commission, DG TAXUD",
      version: "2026-08-06",
      url: DEFAULTS_URL,
      file: DEFAULTS_FILE,
      sha256: sha256(path),
      caveat:
        "Informational copy published by the Commission; only the text in the Official Journal is legally binding. " +
        "Values exclude the mark-up, which is applied by year and sector.",
    },
    descriptions,
    sectors,
    countries,
    other,
    annexIV,
  };

  writeFileSync(join(OUT_DIR, "default-values.json"), JSON.stringify(result));
  const total = Object.values(countries).reduce((s, c) => s + c.rows.length, 0);
  console.log(
    `default values: ${Object.keys(countries).length} countries, ${total} rows, ` +
      `${other.length} 'other', ${annexIV.length} Annex IV`,
  );
}

await importBenchmarks();
await importDefaults();
