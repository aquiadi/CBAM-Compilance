/**
 * Generates the demo dataset: eight months of production data from a mid-size
 * Indian DRI-EAF steel plant, in the state it actually arrives in.
 *
 * Every defect below is deliberate and corresponds to something the pipeline is
 * supposed to catch. Keeping them in one place means the demo doubles as an
 * integration fixture - if a rule stops firing, the seeded defect is the
 * regression test.
 *
 *   1. Electricity metered in "MU" (million units). Read as MWh it understates
 *      power by 1000x. The classic Indian energy-data error.
 *   2. One coal row exported in kg while the unit column still says MT.
 *   3. A duplicated fuel delivery row.
 *   4. A missing month of electricity data.
 *   5. Sponge iron bought from a vendor with no CBAM communication.
 *   6. A non-CBAM CN code sitting in the despatch register.
 *   7. Indian digit grouping, "-"/"NA" nulls, and vendor/GRN noise columns.
 *
 * Deterministic: the seeded PRNG means the same dataset every run, so the
 * numbers in the README and the screenshots stay true.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// --- deterministic PRNG (mulberry32) ------------------------------------
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20260101);

/** Vary a base figure by +/- pct, the way real monthly output does. */
function jitter(base: number, pct = 0.08): number {
  return base * (1 + (rand() * 2 - 1) * pct);
}

/** Format with Indian digit grouping, as every Indian MIS export does. */
function inr(n: number, dp = 0): string {
  const fixed = n.toFixed(dp);
  const [intPart = "0", decPart] = fixed.split(".");
  const last3 = intPart.slice(-3);
  const rest = intPart.slice(0, -3);
  const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${last3}` : last3;
  return decPart ? `${grouped}.${decPart}` : grouped;
}

const MONTHS = [
  { key: "2026-01", label: "Jan-26", days: 31 },
  { key: "2026-02", label: "Feb-26", days: 28 },
  { key: "2026-03", label: "Mar-26", days: 31 },
  { key: "2026-04", label: "Apr-26", days: 30 },
  { key: "2026-05", label: "May-26", days: 31 },
  { key: "2026-06", label: "Jun-26", days: 30 },
  { key: "2026-07", label: "Jul-26", days: 31 },
  { key: "2026-08", label: "Aug-26", days: 31 },
];

function toCsv(rows: string[][]): string {
  return rows
    .map((r) =>
      r.map((cell) => (/[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell)).join(","),
    )
    .join("\n");
}

const OUT = join(process.cwd(), "data", "demo");
mkdirSync(OUT, { recursive: true });

// ----------------------------------------------------- 1. fuel consumption
// Column names lifted from the shape of a real SAP/Tally consumption extract:
// noise columns, an abbreviated material description, a separate UOM column.
const fuelRows: string[][] = [
  [
    "Month",
    "Plant / Section",
    "Material Desc.",
    "GRN Ref",
    "Qty Consumed",
    "UOM",
    "Rate (Rs/MT)",
    "Remarks",
  ],
];

for (const m of MONTHS) {
  // DRI kiln non-coking coal: ~1.15 t coal per t sponge iron, 17,500 t/month.
  const kilnCoal = jitter(20125, 0.09);
  fuelRows.push([
    m.label,
    "DRI Kiln #1 & #2",
    "NON COKING COAL (G11)",
    `GRN/${m.key.replace("-", "")}/0114`,
    inr(kilnCoal, 2),
    "MT",
    inr(4850),
    "",
  ]);

  // Rolling mill reheating furnace, furnace oil in kilolitres.
  fuelRows.push([
    m.label,
    "Rolling Mill",
    "FURNACE OIL",
    `GRN/${m.key.replace("-", "")}/0231`,
    inr(jitter(596, 0.11), 2),
    "KL",
    inr(42500),
    "",
  ]);

  // Site diesel for material handling. Small, and often forgotten entirely.
  fuelRows.push([
    m.label,
    "Material Handling",
    "HSD (DIESEL)",
    `GRN/${m.key.replace("-", "")}/0388`,
    inr(jitter(38.5, 0.16), 2),
    "KL",
    inr(89000),
    m.key === "2026-05" ? "incl. DG set running" : "",
  ]);
}

// DEFECT 2: June kiln coal exported in kg while the UOM column still reads MT.
// 45,000,000 against a ~20,000 median: the outlier rule should catch it.
fuelRows.push([
  "Jun-26",
  "DRI Kiln #1 & #2",
  "NON COKING COAL (G11) - suppl.",
  "GRN/202606/0119",
  inr(45_000_000),
  "MT",
  inr(4850),
  "revised entry - check UOM",
]);

// DEFECT 3: an exact duplicate of the March furnace oil line.
const marchOil = fuelRows.find((r) => r[0] === "Mar-26" && r[2] === "FURNACE OIL");
if (marchOil) fuelRows.push([...marchOil.slice(0, 3), "GRN/202603/0231", ...marchOil.slice(4)]);

writeFileSync(join(OUT, "fuel_consumption_register.csv"), toCsv(fuelRows));

// ------------------------------------------------------- 2. electricity
// DEFECT 1: quantities are in MU. DEFECT 4: April is missing entirely.
const powerRows: string[][] = [
  [
    "Billing Month",
    "Consumer No.",
    "Supply Source",
    "Units Drawn (MU)",
    "Demand (KVA)",
    "Amount (Rs)",
    "Section",
  ],
];
for (const m of MONTHS) {
  if (m.key === "2026-04") continue; // DEFECT 4: bill not exported from the portal
  powerRows.push([
    m.label,
    "CSPDCL/HT/44127",
    "CSPDCL Grid (HT)",
    jitter(21.3, 0.07).toFixed(2),
    inr(28500),
    inr(jitter(16_80_00_000, 0.07)),
    "Melt Shop (IF/EAF)",
  ]);
  powerRows.push([
    m.label,
    "CSPDCL/HT/44127",
    "CSPDCL Grid (HT)",
    jitter(1.87, 0.09).toFixed(2),
    inr(28500),
    inr(jitter(1_47_00_000, 0.08)),
    "Rolling Mill",
  ]);
  powerRows.push([
    m.label,
    "PPA/SOLAR/RG-22",
    "Solar PPA (open access)",
    jitter(1.42, 0.22).toFixed(2),
    "-",
    inr(jitter(85_00_000, 0.2)),
    "Melt Shop (IF/EAF)",
  ]);
}
writeFileSync(join(OUT, "power_bill_register.csv"), toCsv(powerRows));

// -------------------------------------------- 3. process materials / fluxes
const materialRows: string[][] = [
  ["Period", "Cost Centre", "Item Description", "Consumption", "Unit", "Vendor Code", "Batch"],
];
for (const m of MONTHS) {
  materialRows.push([
    m.label,
    "DRI Kiln #1 & #2",
    "DOLOMITE (CALCINED)",
    inr(jitter(534, 0.1), 2),
    "MT",
    "V-10233",
    `B${m.key.slice(2).replace("-", "")}`,
  ]);
  materialRows.push([
    m.label,
    "Melt Shop (IF/EAF)",
    "GRAPHITE ELECTRODE (UHP 400mm)",
    inr(jitter(62.4, 0.12), 2),
    "MT",
    "V-20871",
    `B${m.key.slice(2).replace("-", "")}`,
  ]);
  materialRows.push([
    m.label,
    "Melt Shop (IF/EAF)",
    "LIME / LIMESTONE FLUX",
    inr(jitter(781, 0.09), 2),
    "MT",
    "V-10233",
    m.key === "2026-07" ? "NA" : `B${m.key.slice(2).replace("-", "")}`,
  ]);
}
writeFileSync(join(OUT, "process_materials.csv"), toCsv(materialRows));

// --------------------------------------------------- 4. production/despatch
// DEFECT 6: a non-CBAM CN code (spare parts) sits in the despatch register.
const prodRows: string[][] = [
  [
    "Month",
    "Section",
    "Product",
    "HS / CN Code",
    "Production (MT)",
    "Despatched to EU (MT)",
    "Domestic Despatch (MT)",
    "Internal Transfer (MT)",
  ],
];
for (const m of MONTHS) {
  const dri = jitter(17_500, 0.08);
  prodRows.push([
    m.label,
    "DRI Kiln #1 & #2",
    "SPONGE IRON (DRI)",
    "7203 10 00",
    inr(dri, 2),
    "0",
    "0",
    inr(dri, 2),
  ]);

  const billet = jitter(24_600, 0.07);
  const billetEu = billet * 0.18;
  const billetInternal = billet * 0.62;
  prodRows.push([
    m.label,
    "Melt Shop (IF/EAF)",
    "MS BILLETS 125x125",
    "7207 11 00",
    inr(billet, 2),
    inr(billetEu, 2),
    inr(billet - billetEu - billetInternal, 2),
    inr(billetInternal, 2),
  ]);

  const tmt = jitter(15_100, 0.08);
  const tmtEu = tmt * 0.41;
  prodRows.push([
    m.label,
    "Rolling Mill",
    "TMT REBAR Fe500D",
    "7213 10 00",
    inr(tmt, 2),
    inr(tmtEu, 2),
    inr(tmt - tmtEu, 2),
    "0",
  ]);
}
prodRows.push([
  "Aug-26",
  "Workshop",
  "MS FABRICATED SPARES",
  "8455 90 00",
  "42.00",
  "12.00",
  "30.00",
  "0",
]);
writeFileSync(join(OUT, "production_despatch.csv"), toCsv(prodRows));

// ------------------------------------------------------- 5. precursors
// DEFECT 5: the second sponge-iron vendor has supplied no CBAM communication.
const precursorRows: string[][] = [
  [
    "Month",
    "Consuming Section",
    "Material",
    "CN Code",
    "Qty Received (MT)",
    "Supplier",
    "CBAM Communication Recd?",
    "Supplier SEE Direct (tCO2e/t)",
    "Supplier SEE Indirect",
  ],
];
for (const m of MONTHS) {
  precursorRows.push([
    m.label,
    "Melt Shop (IF/EAF)",
    "SPONGE IRON (bought out)",
    "7203 10 00",
    inr(jitter(4_200, 0.15), 2),
    "Jindal Sponge (Raigarh)",
    "Yes",
    "1.038",
    "0.071",
  ]);
  precursorRows.push([
    m.label,
    "Melt Shop (IF/EAF)",
    "SPONGE IRON (bought out)",
    "7203 10 00",
    inr(jitter(1_950, 0.2), 2),
    "Maa Ambey Ispat",
    "No",
    "-",
    "-",
  ]);
  precursorRows.push([
    m.label,
    "Melt Shop (IF/EAF)",
    "FERRO SILICON 70%",
    "7202 21 00",
    inr(jitter(148, 0.14), 2),
    "Balasore Alloys",
    "Yes",
    "2.410",
    "1.580",
  ]);
}
writeFileSync(join(OUT, "precursor_receipts.csv"), toCsv(precursorRows));

console.log(`Wrote 5 demo files to ${OUT}`);
for (const [name, rows] of [
  ["fuel_consumption_register.csv", fuelRows],
  ["power_bill_register.csv", powerRows],
  ["process_materials.csv", materialRows],
  ["production_despatch.csv", prodRows],
  ["precursor_receipts.csv", precursorRows],
] as const) {
  console.log(`  ${name.padEnd(34)} ${rows.length - 1} rows`);
}
