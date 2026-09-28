/**
 * Generates the public document-reading eval corpus: bills, invoices and slips
 * laid out like Indian plant paperwork, each with the figures a person would
 * enter from it. Run once; the output is committed and the gate hashes it.
 *
 *   node scripts/generate-eval-documents.mjs
 *
 * Re-running rewrites the files (a PDF embeds its creation time), which
 * changes the corpus hash, so the gate will refuse until the baseline is
 * re-frozen. That is deliberate: a changed corpus is a changed measurement.
 *
 * Every document is made up. Real bills belong in evals/documents/private/,
 * which is gitignored - see README, "Document-reading gate".
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const OUT = join(process.cwd(), "evals", "documents", "corpus");

const page = (body, extra = "") => `<!doctype html><html><head><meta charset="utf-8"><style>
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 13px; }
  .paper { background: #fff; width: 720px; padding: 28px 32px; box-sizing: border-box; }
  h1 { font-size: 17px; margin: 0 0 2px; } h2 { font-size: 14px; margin: 10px 0 4px; }
  p { margin: 3px 0; } table { border-collapse: collapse; width: 100%; margin: 8px 0; }
  td, th { border: 1px solid #444; padding: 4px 6px; text-align: left; font-size: 12px; }
  th { background: #eee; } .r { text-align: right; } .small { font-size: 11px; color: #333; }
  ${extra}
</style></head><body><div class="paper">${body}</div></body></html>`;

/** Each document: what it tests, how it is rendered, and what should be read from it. */
const DOCUMENTS = [
  {
    id: "fuel-invoice",
    format: "pdf",
    why: "A fuel invoice with two fuels, rupee rates beside every quantity and a freight line that is not a quantity at all.",
    expected: [
      { item: "HSD", category: "fuel", quantity: 24.5, unit: "KL" },
      { item: "LSHS", category: "fuel", quantity: 61.32, unit: "MT" },
    ],
    html: page(`
      <h1>INDIAN OIL CORPORATION LTD</h1><p>Raipur Terminal, Chhattisgarh · GSTIN 22AAACI1681G1Z0</p>
      <h2>TAX INVOICE No. RPR/26/004417 &nbsp; Date: 02.04.2026</h2>
      <p>Bill to: Shakti Steel &amp; Power Ltd, Raigarh Works</p>
      <table><tr><th>Sl</th><th>Product</th><th>HSN</th><th class="r">Qty</th><th>UOM</th><th class="r">Rate (Rs)</th><th class="r">Amount (Rs)</th></tr>
      <tr><td>1</td><td>HSD (High Speed Diesel)</td><td>27101944</td><td class="r">24.500</td><td>KL</td><td class="r">89,150.00</td><td class="r">21,84,175.00</td></tr>
      <tr><td>2</td><td>LSHS</td><td>27101990</td><td class="r">61.320</td><td>MT</td><td class="r">52,400.00</td><td class="r">32,13,168.00</td></tr>
      <tr><td>3</td><td>Freight</td><td>9965</td><td class="r">1</td><td>LS</td><td class="r">18,000.00</td><td class="r">18,000.00</td></tr></table>
      <p>Total: Rs 54,15,343.00 &nbsp; Supply period: March 2026</p>`),
  },
  {
    id: "fuel-invoice-photo",
    format: "photo",
    why: "The same invoice as a phone photo: tilted, soft and without a text layer, so nothing can be checked against the document's text.",
    expected: [
      { item: "HSD", category: "fuel", quantity: 24.5, unit: "KL" },
      { item: "LSHS", category: "fuel", quantity: 61.32, unit: "MT" },
    ],
    sameAs: "fuel-invoice",
  },
  {
    id: "ht-bill-kva-trap",
    format: "pdf",
    why: "An HT electricity bill. Contract and maximum demand in kVA, and two meter readings, sit next to the one figure that matters: kWh consumed.",
    expected: [{ item: "units", category: "electricity", quantity: 1165140, unit: "kWh" }],
    html: page(`
      <h1>CHHATTISGARH STATE POWER DISTRIBUTION CO. LTD</h1><p>HT Energy Bill · Consumer No. 1000234567 · Tariff HV-4 (Steel)</p>
      <p>Bill month: March 2026 &nbsp; Bill date: 07.04.2026 &nbsp; Due date: 21.04.2026</p>
      <table><tr><th>Particulars</th><th class="r">Value</th><th>Unit</th></tr>
      <tr><td>Contract Demand</td><td class="r">5,000</td><td>kVA</td></tr>
      <tr><td>Maximum Demand Recorded</td><td class="r">4,213</td><td>kVA</td></tr>
      <tr><td>Billing Demand</td><td class="r">4,250</td><td>kVA</td></tr>
      <tr><td>Previous Reading (KWH)</td><td class="r">1,84,52,310</td><td></td></tr>
      <tr><td>Present Reading (KWH)</td><td class="r">1,96,17,450</td><td></td></tr>
      <tr><td>Multiplying Factor</td><td class="r">1</td><td></td></tr>
      <tr><td><b>Units Consumed</b></td><td class="r"><b>11,65,140</b></td><td>kWh</td></tr>
      <tr><td>Power Factor</td><td class="r">0.97</td><td></td></tr></table>
      <table><tr><th>Charges</th><th class="r">Amount (Rs)</th></tr>
      <tr><td>Demand charges @ Rs 350/kVA</td><td class="r">14,87,500.00</td></tr>
      <tr><td>Energy charges @ Rs 6.10/kWh</td><td class="r">71,07,354.00</td></tr>
      <tr><td>Electricity duty</td><td class="r">5,68,588.32</td></tr>
      <tr><td><b>Net payable</b></td><td class="r"><b>91,63,442.32</b></td></tr></table>`),
  },
  {
    id: "ht-bill-mu-photo",
    format: "photo",
    why: "A monthly power statement in million units (MU). Reading MU as MWh understates power a thousandfold.",
    expected: [{ item: "energy", category: "electricity", quantity: 21.36, unit: "MU" }],
    html: page(`
      <h1>MAHARASHTRA STATE ELECTRICITY DISTRIBUTION CO. LTD</h1><p>EHV Consumer Statement · Nagpur Zone</p>
      <p>Consumer: Vidarbha Alloys Pvt Ltd · Period 01.02.2026 to 28.02.2026</p>
      <table><tr><th>Item</th><th class="r">Quantity</th><th>Unit</th></tr>
      <tr><td>Energy billed (import)</td><td class="r">21.36</td><td>MU</td></tr>
      <tr><td>Maximum demand</td><td class="r">38.4</td><td>MVA</td></tr>
      <tr><td>Load factor</td><td class="r">82.8</td><td>%</td></tr></table>
      <p>Energy charge @ Rs 7.05 per unit: Rs 15,05,88,000.00</p>`),
  },
  {
    id: "weighbridge-coal",
    format: "photo",
    why: "A weighbridge slip: gross and tare are printed as prominently as net. Only net weight was delivered.",
    expected: [{ item: "coal", category: "fuel", quantity: 27.44, unit: "MT" }],
    html: page(
      `
      <h1>SHRI BALAJI WEIGH BRIDGE</h1><p class="small">Kharsia Road, Raigarh · Computerised weighment</p>
      <table><tr><td>Slip No.</td><td>WB-88412</td><td>Date</td><td>14/03/2026</td></tr>
      <tr><td>Vehicle</td><td>CG 13 AK 4471</td><td>Material</td><td>Non-coking coal G11</td></tr>
      <tr><td>Supplier</td><td colspan="3">SECL Gevra (e-auction)</td></tr></table>
      <table><tr><th>Weighment</th><th class="r">Weight (MT)</th><th>Time</th></tr>
      <tr><td>Gross</td><td class="r">42.310</td><td>09:14</td></tr>
      <tr><td>Tare</td><td class="r">14.870</td><td>11:02</td></tr>
      <tr><td><b>Net</b></td><td class="r"><b>27.440</b></td><td></td></tr></table>
      <p class="small">Operator signature ______</p>`,
      "body{font-family:'Courier New',monospace}",
    ),
  },
  {
    id: "material-receipt",
    format: "pdf",
    why: "A goods receipt note for two process materials, with accepted and rejected quantities and rupee values alongside.",
    expected: [
      { item: "limestone", category: "process_material", quantity: 312.5, unit: "MT" },
      { item: "dolomite", category: "process_material", quantity: 148.25, unit: "MT" },
    ],
    html: page(`
      <h1>GOODS RECEIPT NOTE</h1><p>Shakti Steel &amp; Power Ltd · Raigarh Works · Stores</p>
      <p>GRN No. 26/GRN/01984 · Date 18.03.2026 · Vendor: Katni Minerals &amp; Co.</p>
      <table><tr><th>Material</th><th class="r">Received</th><th class="r">Rejected</th><th class="r">Accepted</th><th>UOM</th><th class="r">Value (Rs)</th></tr>
      <tr><td>Limestone (BF grade)</td><td class="r">320.000</td><td class="r">7.500</td><td class="r">312.500</td><td>MT</td><td class="r">5,31,250.00</td></tr>
      <tr><td>Dolomite 20-60 mm</td><td class="r">150.000</td><td class="r">1.750</td><td class="r">148.250</td><td>MT</td><td class="r">2,96,500.00</td></tr></table>
      <p class="small">Accepted quantity is taken into stock.</p>`),
  },
  {
    id: "natural-gas-lakh",
    format: "pdf",
    why: "A gas invoice with Indian lakh grouping (1,24,560.00): the digits must be read as one number.",
    expected: [{ item: "gas", category: "fuel", quantity: 124560, unit: "SCM" }],
    html: page(`
      <h1>GAIL (INDIA) LIMITED</h1><p>Natural Gas Sales Invoice · Invoice No. GL/NG/26/7751 · 01.04.2026</p>
      <p>Customer: Gujarat Ferro Castings Ltd, Vapi · Contract No. NG-2231</p>
      <table><tr><th>Description</th><th class="r">Quantity</th><th>Unit</th><th class="r">GCV (kcal/SCM)</th><th class="r">Amount (Rs)</th></tr>
      <tr><td>Natural Gas (APM) - March 2026</td><td class="r">1,24,560.00</td><td>SCM</td><td class="r">9,540</td><td class="r">44,59,248.00</td></tr></table>
      <p>Energy supplied: 1,188.30 MMBTU (for reference)</p>`),
  },
  {
    id: "pump-receipt-litres",
    format: "photo",
    why: "A fuel-pump receipt in litres, with a rate and a total in rupees that are larger than the quantity.",
    expected: [{ item: "HSD", category: "fuel", quantity: 450, unit: "L" }],
    html: page(
      `
      <h1 style="text-align:center">HP PETROL PUMP</h1><p style="text-align:center" class="small">Hindustan Petroleum · NH-49 Raigarh</p>
      <p>Receipt 004812 · 22/03/2026 10:41</p><p>Vehicle: CG 13 L 2290 (site loader)</p>
      <table><tr><td>Product</td><td>HSD</td></tr><tr><td>Volume (L)</td><td class="r">450.00</td></tr>
      <tr><td>Rate (Rs/L)</td><td class="r">89.62</td></tr><tr><td>Amount (Rs)</td><td class="r">40,329.00</td></tr></table>
      <p style="text-align:center" class="small">Thank you. Visit again.</p>`,
      ".paper{width:380px} body{font-family:'Courier New',monospace}",
    ),
  },
  {
    id: "dri-precursor-invoice",
    format: "pdf",
    why: "A bought-in precursor (sponge iron) with its CN code; it must be read as a precursor, not a fuel or material.",
    expected: [{ item: "sponge iron", category: "precursor", quantity: 520, unit: "MT" }],
    html: page(`
      <h1>MAA AMBEY ISPAT PVT LTD</h1><p>Siltara Industrial Area, Raipur · GSTIN 22AABCM4412K1Z3</p>
      <h2>TAX INVOICE No. MAI/26/0318 · Date 28.03.2026</h2>
      <table><tr><th>Description</th><th>HSN / CN</th><th class="r">Qty</th><th>UOM</th><th class="r">Rate (Rs/MT)</th><th class="r">Amount (Rs)</th></tr>
      <tr><td>Sponge Iron (DRI) lumps, Fe(M) 80%</td><td>7203 10 00</td><td class="r">520.000</td><td>MT</td><td class="r">27,800.00</td><td class="r">1,44,56,000.00</td></tr></table>
      <p>Dispatched in 20 trucks between 01.03.2026 and 27.03.2026.</p>`),
  },
  {
    id: "handwritten-challan",
    format: "photo",
    why: "A delivery challan filled in by hand, with a quantity corrected in ink.",
    expected: [{ item: "furnace oil", category: "fuel", quantity: 18.4, unit: "KL" }],
    html: page(
      `
      <h1>DELIVERY CHALLAN</h1><p class="small">Raigarh Petro Traders · Challan No. <span class="hw">1147</span></p>
      <table><tr><th>Item</th><th class="r">Qty</th><th>Unit</th></tr>
      <tr><td class="hw">Furnace Oil (FO)</td><td class="r hw"><s>19.2</s> 18.4</td><td class="hw">KL</td></tr></table>
      <p>Date: <span class="hw">09/03/2026</span> &nbsp; Received by: <span class="hw">R. Sahu</span></p>`,
      ".hw{font-family:'Comic Sans MS','Segoe Script',cursive;font-size:16px;color:#1a2a8a} s{color:#1a2a8a}",
    ),
  },
];

const PHOTO_CSS = `html,body{background:#6d6a64;margin:0}
  .frame{padding:40px;display:inline-block}
  .paper{transform:rotate(-2.2deg);box-shadow:4px 8px 18px rgba(0,0,0,.45);filter:blur(0.45px) contrast(0.92) brightness(0.97)}`;

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
});
const tab = await browser.newPage({ viewport: { width: 820, height: 600 } });
const byId = Object.fromEntries(DOCUMENTS.map((d) => [d.id, d]));
const labels = [];

for (const doc of DOCUMENTS) {
  const html = doc.html ?? byId[doc.sameAs].html;
  if (doc.format === "pdf") {
    await tab.setContent(html);
    const file = `${doc.id}.pdf`;
    await tab.pdf({
      path: join(OUT, file),
      width: "210mm",
      height: "297mm",
      printBackground: true,
    });
    labels.push({
      id: doc.id,
      file,
      mediaType: "application/pdf",
      why: doc.why,
      expected: doc.expected,
    });
  } else {
    await tab.setContent(
      html
        .replace("</style>", `${PHOTO_CSS}</style>`)
        .replace('<div class="paper">', '<div class="frame"><div class="paper">')
        .replace("</body>", "</div></body>"),
    );
    const file = `${doc.id}.jpg`;
    await tab.locator(".frame").screenshot({ path: join(OUT, file), type: "jpeg", quality: 72 });
    labels.push({
      id: doc.id,
      file,
      mediaType: "image/jpeg",
      why: doc.why,
      expected: doc.expected,
    });
  }
  console.log(`  ${doc.id}`);
}
await browser.close();

writeFileSync(
  join(OUT, "..", "labels.json"),
  JSON.stringify(
    {
      corpus: "public-synthetic",
      note: "Made-up documents in the layout of Indian plant paperwork. Not real bills.",
      documents: labels,
    },
    null,
    2,
  ) + "\n",
);
console.log(`${labels.length} documents written to ${OUT}`);
