import {
  cbamFactor,
  cscf,
  defaultValueMarkup,
  lookupBenchmark,
  lookupDefaultValue,
  publishedPrice,
  quarterOf,
} from "./regulatory";
import type { CarbonPriceActivity, DeclarationLine, ProductionActivity } from "./types";

/**
 * Certificate exposure.
 *
 * The number an exporter's importer will actually pay, per Articles 22 and 31
 * of the CBAM Regulation: certificates equal embedded emissions of the goods
 * imported, less the free allocation adjustment (SEFA x mass, computed in
 * sefa.ts), less any carbon price effectively paid at origin (Art. 9).
 *
 * The obligation per tonne is therefore (SEE - SEFA), not a percentage of SEE.
 * While EU free allocation is phased out the SEFA shrinks with the CBAM factor,
 * and a plant well above the EU benchmark pays on most of its emissions from
 * the first year - which is why the difference matters.
 */

export interface CostAssumptions {
  /**
   * Certificate price in EUR used wherever the Commission has not published
   * one (future quarters, and every year after 2026).
   */
  etsPriceEur: number;
  /** INR per EUR, for reporting the exposure in the currency the operator budgets in. */
  inrPerEur: number;
  /** Production year of the goods: drives the CBAM factor, mark-ups and benchmarks. */
  year: number;
}

/**
 * Fallback assumptions for callers that supply none. Literal rather than read
 * from the environment so the engine stays pure; the application layer injects
 * deployment values (see src/lib/workspace.ts).
 */
export const DEFAULT_ASSUMPTIONS: CostAssumptions = {
  etsPriceEur: 75,
  inrPerEur: 92,
  year: 2026,
};

export interface DefaultScenario {
  /** Default value incl. mark-up, tCO2e per tonne. */
  seeWithMarkup: number;
  /** SEFA from the column B benchmark, tCO2e per tonne. */
  sefa: number;
  obligationPerTonne: number;
  reference: string;
}

export interface LineExposure {
  cnCode: string;
  description: string;
  processId: string;
  /** Tonnes shipped to the EU; domestic and internal output is never charged. */
  quantityEuT: number;
  seeForObligation: number;
  sefa: number;
  /** max(0, SEE - SEFA), tCO2e per tonne. */
  obligationPerTonne: number;
  embeddedEuT: number;
  freeAllocationAdjustmentT: number;
  certificates: number;
  costEur: number;
  costPerTonneEur: number;
  /** What the importer would owe on default values instead of this plant's data. */
  defaultScenario?: DefaultScenario & { certificates: number; costEur: number };
}

export interface QuarterPricing {
  quarter: string;
  priceEur: number;
  basis: "published" | "assumption";
  euTonnes: number;
}

export interface ExposureResult {
  year: number;
  cbamFactor: number;
  cscf: number;
  lines: LineExposure[];
  /** EU-tonnage-weighted certificate price actually applied. */
  effectivePriceEur: number;
  pricing: QuarterPricing[];
  /** Total embedded emissions across all lines, tCO2e (reported figure). */
  totalEmbeddedT: number;
  /** Embedded emissions of EU-bound goods that count towards the obligation. */
  obligationEmissionsT: number;
  /** Deducted for free allocation, tCO2e. */
  freeAllocationAdjustmentT: number;
  /** Emissions of production that stayed in India or moved on site - reported, never charged. */
  nonEuEmissionsT: number;
  grossCertificates: number;
  /** Certificates avoided by a carbon price already paid at origin. */
  carbonPriceCredit: number;
  netCertificates: number;
  grossCostEur: number;
  netCostEur: number;
  netCostInr: number;
  /** The same goods declared on default values. */
  defaultScenario: { certificates: number; costEur: number; complete: boolean };
  trajectory: TrajectoryPoint[];
  notes: string[];
}

export interface TrajectoryPoint {
  year: number;
  /** CBAM factor: the share of free allocation still granted. */
  factor: number;
  certificates: number;
  costEur: number;
  /** Cost on default values, for the same volumes. */
  defaultCostEur: number;
}

/** Default value and column B SEFA for a good from a country, as an importer would use them. */
export function defaultScenarioFor(
  cnCode: string,
  country: string,
  year: number,
): DefaultScenario | { error: string } {
  const dv = lookupDefaultValue({ cnCode, country });
  if (!dv.ok) return { error: dv.message };
  const markup = defaultValueMarkup(dv.value.sector, year);
  const seeWithMarkup = dv.value.total * (1 + markup);
  const bm = lookupBenchmark({ cnCode, column: "B", year, route: dv.value.route });
  if (!bm.ok) return { error: bm.message };
  const sefa = cbamFactor(year) * cscf(year).value * bm.choice.value;
  return {
    seeWithMarkup,
    sefa,
    obligationPerTonne: Math.max(0, seeWithMarkup - sefa),
    reference:
      `${dv.value.table} CN ${dv.value.tableCode} ${dv.value.total.toFixed(3)} + ` +
      `${(markup * 100).toFixed(0)}% mark-up; column B benchmark ${bm.choice.value}` +
      `${bm.choice.indicator ? ` (${bm.choice.indicator})` : ""}`,
  };
}

/**
 * A carbon price paid in the country of origin reduces the certificates due
 * (Art. 9). India has no economy-wide carbon price today; the Carbon Credit
 * Trading Scheme creates obligations for designated entities, and the coal cess
 * is a fuel levy rather than a price on emissions. Any claim needs documentary
 * evidence, and this refuses to credit one without it.
 *
 * The claim is spread over the installation's chargeable emissions, so only
 * the EU-bound share of the tonnes it covers is credited. The exact deduction
 * is set by the Commission's implementing rules on Art. 9 and is reported here
 * as an estimate.
 */
export function carbonPriceCredit(
  claims: CarbonPriceActivity[],
  assumptions: CostAssumptions,
  euShare: number,
): { credit: number; notes: string[] } {
  const notes: string[] = [];
  let credit = 0;

  for (const claim of claims) {
    if (!claim.evidenceAttached) {
      notes.push(
        `Carbon price claim under "${claim.scheme}" ignored: no documentary evidence attached. ` +
          `Art. 9 requires proof of the price actually paid and that no export rebate was received.`,
      );
      continue;
    }
    if (claim.tonnesCovered <= 0) {
      notes.push(`Carbon price claim under "${claim.scheme}" ignored: covers zero tonnes.`);
      continue;
    }
    // Amounts are converted with the operator's EUR rate; USD claims need a
    // EUR equivalent entered by the operator rather than a hard-coded rate.
    if (claim.currency === "USD") {
      notes.push(
        `Carbon price claim under "${claim.scheme}" is in USD. Enter the EUR equivalent at the ` +
          `rate of payment; it has not been credited.`,
      );
      continue;
    }
    const eur = claim.currency === "EUR" ? claim.amount : claim.amount / assumptions.inrPerEur;
    const perTonne = eur / claim.tonnesCovered;
    const effective = Math.min(perTonne, assumptions.etsPriceEur);
    credit += (effective / assumptions.etsPriceEur) * claim.tonnesCovered * euShare;
    if (perTonne > assumptions.etsPriceEur) {
      notes.push(
        `Carbon price paid under "${claim.scheme}" (EUR ${perTonne.toFixed(2)}/t) exceeds the ` +
          `certificate price; the credit is capped at the certificate price.`,
      );
    }
  }

  return { credit, notes };
}

function euTonnesByQuarter(
  production: ProductionActivity[],
  processId: string,
  cnCode: string,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const p of production) {
    if (p.processId !== processId || p.cnCode !== cnCode || p.destination !== "eu_export") continue;
    const q = quarterOf(p.periodStart);
    out.set(q, (out.get(q) ?? 0) + p.quantityT);
  }
  return out;
}

export function computeExposure(args: {
  lines: DeclarationLine[];
  production: ProductionActivity[];
  claims: CarbonPriceActivity[];
  assumptions: CostAssumptions;
  country: string;
  trajectory?: TrajectoryPoint[];
}): ExposureResult {
  const { lines, production, claims, assumptions, country } = args;
  const year = assumptions.year;
  const notes: string[] = [];

  const pricing = new Map<string, QuarterPricing>();
  const lineExposures: LineExposure[] = [];
  let defaultCertificates = 0;
  let defaultCost = 0;
  let defaultComplete = true;

  for (const l of lines.filter((x) => x.quantityEuT > 0)) {
    const obligationPerTonne = Math.max(0, l.seeForObligation - l.sefa);
    const quarters = euTonnesByQuarter(production, l.processId, l.cnCode);
    let certificates = 0;
    let costEur = 0;
    for (const [quarter, tonnes] of quarters) {
      const published = publishedPrice(quarter);
      const price = published?.priceEur ?? assumptions.etsPriceEur;
      const c = tonnes * obligationPerTonne;
      certificates += c;
      costEur += c * price;
      const acc = pricing.get(quarter) ?? {
        quarter,
        priceEur: price,
        basis: published ? "published" : "assumption",
        euTonnes: 0,
      };
      acc.euTonnes += tonnes;
      pricing.set(quarter, acc);
    }

    const scenario = defaultScenarioFor(l.cnCode, country, year);
    let defaultScenario: LineExposure["defaultScenario"];
    if ("error" in scenario) {
      defaultComplete = false;
    } else {
      const c = l.quantityEuT * scenario.obligationPerTonne;
      const price = certificates > 0 ? costEur / certificates : assumptions.etsPriceEur;
      defaultScenario = { ...scenario, certificates: c, costEur: c * price };
      defaultCertificates += c;
      defaultCost += c * price;
    }

    lineExposures.push({
      cnCode: l.cnCode,
      description: l.description,
      processId: l.processId,
      quantityEuT: l.quantityEuT,
      seeForObligation: l.seeForObligation,
      sefa: l.sefa,
      obligationPerTonne,
      embeddedEuT: l.embeddedEuT,
      freeAllocationAdjustmentT: l.quantityEuT * l.sefa,
      certificates,
      costEur,
      costPerTonneEur: l.quantityEuT > 0 ? costEur / l.quantityEuT : 0,
      defaultScenario,
    });
  }

  const totalEmbeddedT = lines.reduce((s, l) => s + l.embeddedTotalT, 0);
  const obligationEmissionsT = lines.reduce((s, l) => s + l.embeddedEuT, 0);
  const freeAllocationAdjustmentT = lineExposures.reduce(
    (s, l) => s + Math.min(l.freeAllocationAdjustmentT, l.embeddedEuT),
    0,
  );
  const nonEuEmissionsT = lines.reduce((s, l) => s + (l.embeddedForObligationT - l.embeddedEuT), 0);
  const grossCertificates = lineExposures.reduce((s, l) => s + l.certificates, 0);
  const grossCostEur = lineExposures.reduce((s, l) => s + l.costEur, 0);
  const effectivePriceEur =
    grossCertificates > 0 ? grossCostEur / grossCertificates : assumptions.etsPriceEur;

  const totalObligationBase = lines.reduce((s, l) => s + l.embeddedForObligationT, 0);
  const euShare = totalObligationBase > 0 ? obligationEmissionsT / totalObligationBase : 0;
  const { credit, notes: creditNotes } = carbonPriceCredit(claims, assumptions, euShare);
  notes.push(...creditNotes);
  const appliedCredit = Math.min(credit, grossCertificates);
  const netCertificates = Math.max(0, grossCertificates - appliedCredit);
  const netCostEur = netCertificates * effectivePriceEur;

  const indirectExcluded = lines
    .filter((l) => l.directOnly)
    .reduce((s, l) => s + l.seeIndirect * l.quantityEuT, 0);
  if (indirectExcluded > 0) {
    notes.push(
      `${indirectExcluded.toFixed(0)} tCO2e of indirect emissions are reported but excluded from ` +
        `the obligation under Annex II (iron & steel, aluminium and hydrogen are direct-only).`,
    );
  }

  const assumed = [...pricing.values()].filter((p) => p.basis === "assumption");
  if (assumed.length > 0) {
    notes.push(
      `No Commission price is published yet for ${assumed.map((p) => p.quarter).join(", ")}; ` +
        `those quarters use the assumed EUR ${assumptions.etsPriceEur.toFixed(2)} per certificate.`,
    );
  }

  const internal = lines.reduce((s, l) => s + l.quantityInternalT, 0);
  if (internal > 0) {
    notes.push(
      `${internal.toLocaleString("en-IN", { maximumFractionDigits: 0 })} t of output is consumed ` +
        `on site and carried downstream as a precursor. It is excluded from the obligation so its ` +
        `emissions are not counted twice.`,
    );
  }

  if (cscf(year).preliminary) {
    notes.push(
      `The cross-sectoral correction factor for ${year} is not yet published; 1.0 is used.`,
    );
  }

  notes.push(
    "Certificates are surrendered by the EU importer (the authorised CBAM declarant), who files " +
      "the annual declaration by 30 September of the following year. These figures are what the " +
      "operator's verified data implies for that declaration.",
  );

  return {
    year,
    cbamFactor: cbamFactor(year),
    cscf: cscf(year).value,
    lines: lineExposures,
    effectivePriceEur,
    pricing: [...pricing.values()].sort((a, b) => a.quarter.localeCompare(b.quarter)),
    totalEmbeddedT,
    obligationEmissionsT,
    freeAllocationAdjustmentT,
    nonEuEmissionsT,
    grossCertificates,
    carbonPriceCredit: appliedCredit,
    netCertificates,
    grossCostEur,
    netCostEur,
    netCostInr: netCostEur * assumptions.inrPerEur,
    defaultScenario: {
      certificates: defaultCertificates,
      costEur: defaultCost,
      complete: defaultComplete,
    },
    trajectory: args.trajectory ?? [],
    notes,
  };
}
