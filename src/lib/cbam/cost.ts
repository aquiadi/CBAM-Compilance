import type { CarbonPriceActivity, DeclarationLine } from "./types";

/**
 * Certificate exposure model.
 *
 * The number an exporter actually cares about: what does this cost, and when.
 * Three things drive it - how much CO2 is embedded, what share of it is
 * chargeable in a given year while EU free allocation is phased out, and the
 * certificate price.
 */

/**
 * The CBAM factor mirrors the phase-out of free allocation in the EU ETS.
 * Only this share of embedded emissions requires certificates in a given year.
 * Schedule per Regulation (EU) 2023/956 Art. 31 as amended.
 */
export const CBAM_FACTOR_SCHEDULE: Record<number, number> = {
  2026: 0.025,
  2027: 0.05,
  2028: 0.1,
  2029: 0.225,
  2030: 0.485,
  2031: 0.615,
  2032: 0.735,
  2033: 0.865,
  2034: 1.0,
};

export function cbamFactor(year: number): number {
  if (year < 2026) return 0; // transitional period: reporting only, no certificates
  if (year >= 2034) return 1;
  return CBAM_FACTOR_SCHEDULE[year] ?? 1;
}

export interface CostAssumptions {
  /** Certificate price in EUR per tonne CO2e. Tracks the EU ETS auction average. */
  etsPriceEur: number;
  /** INR per EUR, for reporting the exposure in the currency the operator budgets in. */
  inrPerEur: number;
  /** Year the goods are imported into the EU. */
  year: number;
}

/**
 * Fallback assumptions for callers that supply none.
 *
 * Deliberately literal rather than read from the environment: the engine has to
 * stay pure so that the same activity records always produce the same figures,
 * whatever machine they are computed on. Deployment-specific values are injected
 * by the application layer (see `src/lib/store.ts`), which is where
 * configuration belongs.
 */
export const DEFAULT_ASSUMPTIONS: CostAssumptions = {
  etsPriceEur: 78,
  inrPerEur: 92,
  year: 2026,
};

export interface LineExposure {
  cnCode: string;
  description: string;
  /** Tonnes shipped to the EU. Domestic and internally transferred output is
   *  reported but never charged. */
  quantityT: number;
  /** tCO2e that counts towards the obligation for this good. */
  chargeableEmissionsT: number;
  /** After the CBAM factor for the year. */
  certificatesRequired: number;
  costEur: number;
  /** Cost as a share of a nominal goods value, if one was supplied. */
  costPerTonneEur: number;
}

export interface ExposureResult {
  year: number;
  cbamFactor: number;
  etsPriceEur: number;
  lines: LineExposure[];
  /** Total embedded emissions across all lines, tCO2e (reported figure). */
  totalEmbeddedT: number;
  /** Portion creating an obligation under Annex II, before the CBAM factor.
   *  Covers EU-bound goods only. */
  obligationEmissionsT: number;
  /** Emissions of production that stayed in India or moved on site. Reported,
   *  never charged - shown so the two figures are never confused. */
  nonEuEmissionsT: number;
  /** After the CBAM factor. */
  grossCertificates: number;
  /** Certificates avoided by a carbon price already paid at origin. */
  carbonPriceCredit: number;
  netCertificates: number;
  grossCostEur: number;
  netCostEur: number;
  netCostInr: number;
  /** Exposure over the full phase-in, holding volumes and intensity constant. */
  trajectory: { year: number; factor: number; certificates: number; costEur: number }[];
  notes: string[];
}

/**
 * A carbon price paid in the country of origin reduces the certificates due.
 * India has no economy-wide carbon price today; the Carbon Credit Trading
 * Scheme creates a compliance obligation for designated obligated entities,
 * and the coal cess is a fuel levy rather than a price on emissions, so it
 * generally does not qualify. Any claim needs documentary evidence, and this
 * function refuses to credit one without it.
 */
export function carbonPriceCredit(
  claims: CarbonPriceActivity[],
  assumptions: CostAssumptions,
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
    const rate =
      claim.currency === "EUR"
        ? claim.amount
        : claim.currency === "INR"
          ? claim.amount / assumptions.inrPerEur
          : claim.amount * 0.92; // USD
    const perTonne = rate / claim.tonnesCovered;
    // The credit cannot exceed the certificate price it is offsetting.
    const effective = Math.min(perTonne, assumptions.etsPriceEur);
    const certificatesAvoided = (effective / assumptions.etsPriceEur) * claim.tonnesCovered;
    credit += certificatesAvoided;
    if (perTonne > assumptions.etsPriceEur) {
      notes.push(
        `Carbon price paid under "${claim.scheme}" (EUR ${perTonne.toFixed(2)}/t) exceeds the ` +
          `certificate price; the credit is capped at the certificate price.`,
      );
    }
  }

  return { credit, notes };
}

export function computeExposure(
  lines: DeclarationLine[],
  claims: CarbonPriceActivity[],
  assumptions: CostAssumptions = DEFAULT_ASSUMPTIONS,
): ExposureResult {
  const factor = cbamFactor(assumptions.year);
  const notes: string[] = [];

  // Only the EU-bound share is chargeable. Charging total production would
  // double count any output consumed on site, whose emissions already travel
  // downstream as a precursor.
  const lineExposures: LineExposure[] = lines
    .filter((l) => l.quantityEuT > 0)
    .map((l) => {
      const chargeable = l.embeddedEuT;
      const certificates = chargeable * factor;
      const costEur = certificates * assumptions.etsPriceEur;
      return {
        cnCode: l.cnCode,
        description: l.description,
        quantityT: l.quantityEuT,
        chargeableEmissionsT: chargeable,
        certificatesRequired: certificates,
        costEur,
        costPerTonneEur: l.quantityEuT > 0 ? costEur / l.quantityEuT : 0,
      };
    });

  const totalEmbeddedT = lines.reduce((s, l) => s + l.embeddedTotalT, 0);
  const obligationEmissionsT = lines.reduce((s, l) => s + l.embeddedEuT, 0);
  const nonEuEmissionsT = lines.reduce((s, l) => s + (l.embeddedForObligationT - l.embeddedEuT), 0);
  const grossCertificates = obligationEmissionsT * factor;
  const { credit, notes: creditNotes } = carbonPriceCredit(claims, assumptions);
  notes.push(...creditNotes);

  // `credit` is denominated in tonnes of emissions offset by the origin carbon
  // price. The obligation has already been scaled down by the CBAM factor, so
  // the credit is scaled by the same factor before subtracting - otherwise a
  // modest origin price would erase the entire obligation in the early
  // phase-in years, which is not what Art. 9 does.
  const appliedCredit = Math.min(credit * factor, grossCertificates);
  const netCertificates = Math.max(0, grossCertificates - appliedCredit);

  const indirectExcluded = lines
    .filter((l) => l.directOnly)
    .reduce((s, l) => s + l.seeIndirect * l.quantityEuT, 0);
  if (indirectExcluded > 0) {
    notes.push(
      `${indirectExcluded.toFixed(0)} tCO2e of indirect emissions are reported but excluded from ` +
        `the obligation under Annex II (iron & steel, aluminium and hydrogen are direct-only). ` +
        `They must still appear in the declaration.`,
    );
  }

  if (assumptions.year < 2026) {
    notes.push(
      "Transitional period: quarterly reports are due but no certificates are surrendered. " +
        "The figures below show what the same production would cost under the definitive regime.",
    );
  }

  const trajectory = Object.keys(CBAM_FACTOR_SCHEDULE)
    .map(Number)
    .sort((a, b) => a - b)
    .map((year) => {
      const f = cbamFactor(year);
      const certificates = Math.max(0, obligationEmissionsT * f - credit * f);
      return { year, factor: f, certificates, costEur: certificates * assumptions.etsPriceEur };
    });

  const internal = lines.reduce((s, l) => s + l.quantityInternalT, 0);
  if (internal > 0) {
    notes.push(
      `${internal.toLocaleString("en-IN", { maximumFractionDigits: 0 })} t of output is consumed ` +
        `on site and carried downstream as a precursor. It is excluded from the obligation here ` +
        `so its emissions are not counted twice.`,
    );
  }

  return {
    year: assumptions.year,
    cbamFactor: factor,
    etsPriceEur: assumptions.etsPriceEur,
    lines: lineExposures,
    totalEmbeddedT,
    obligationEmissionsT,
    nonEuEmissionsT,
    grossCertificates,
    carbonPriceCredit: appliedCredit,
    netCertificates,
    grossCostEur: grossCertificates * assumptions.etsPriceEur,
    netCostEur: netCertificates * assumptions.etsPriceEur,
    netCostInr: netCertificates * assumptions.etsPriceEur * assumptions.inrPerEur,
    trajectory,
    notes,
  };
}

/**
 * What a marginal improvement is worth. Exporters ask "should I switch to scrap
 * or buy renewable power" and the honest answer needs the phase-in in it: a
 * tonne saved in 2026 is worth 2.5% of a tonne saved in 2034.
 */
export function abatementValueEur(
  tonnesAvoided: number,
  assumptions: CostAssumptions = DEFAULT_ASSUMPTIONS,
): { year: number; valueEur: number }[] {
  return Object.keys(CBAM_FACTOR_SCHEDULE)
    .map(Number)
    .sort((a, b) => a - b)
    .map((year) => ({
      year,
      valueEur: tonnesAvoided * cbamFactor(year) * assumptions.etsPriceEur,
    }));
}
