import { buildDeclarationLines, computeProcessEmissions, type ProcessEmissions } from "./calc";
import { resolveInternalPrecursors } from "./internal";
import {
  computeExposure,
  DEFAULT_ASSUMPTIONS,
  type CostAssumptions,
  type ExposureResult,
} from "./cost";
import { BENCHMARK_DISCLAIMER, getBenchmark } from "./defaults";
import { runRules, type Finding } from "./rules";
import { assessReadiness, type ReadinessResult } from "./readiness";
import type {
  ActivityRecord,
  CarbonPriceActivity,
  DeclarationLine,
  Installation,
  ReportingPeriod,
} from "./types";

/**
 * The one entry point that turns a mapped dataset into a declaration.
 *
 * Everything is recomputed from the activity records on every call - there is
 * no incremental state and no cached total anywhere in the engine. It costs a
 * few milliseconds and it means a figure on screen can never be stale relative
 * to the data behind it.
 */

export interface DeclarationResult {
  installation: Installation;
  period: ReportingPeriod;
  emissions: ProcessEmissions[];
  lines: DeclarationLine[];
  exposure: ExposureResult;
  findings: Finding[];
  readiness: ReadinessResult;
  totals: {
    /** Stack emissions of the installation itself, tCO2e. */
    directT: number;
    /** Emissions of the electricity the installation consumed, tCO2e. */
    indirectT: number;
    /** Emissions carried in with bought-in precursors, tCO2e. */
    precursorT: number;
    /**
     * Cradle-to-gate footprint of everything the site produced.
     *
     * Deliberately NOT the sum of the lines' embedded emissions: specific
     * embedded emissions cascade, so sponge iron's emissions appear again
     * inside the billet line and a third time inside the rebar line. Summing
     * the lines would trebly count the same tonne of coal.
     */
    totalEmbeddedT: number;
    /** Embedded emissions of EU-bound goods only - the chargeable figure. */
    obligationT: number;
    goodsT: number;
    goodsEuT: number;
  };
  assumptions: CostAssumptions;
  excludedActivityIds: string[];
  internalWarnings: string[];
  computedAt: string;
  disclaimer: string;
}

export interface DeclarationOptions {
  assumptions?: CostAssumptions;
  /**
   * Activity ids the operator has excluded after review - a duplicated row, a
   * unit error they could not correct at source. Excluded records stay in the
   * audit trail with a reason; they just stop feeding the calculation.
   */
  excludedActivityIds?: string[];
  /** Rows that could not be materialised during ingest, for rule CP-013. */
  rejectedRowCount?: number;
}

export function buildDeclaration(
  installation: Installation,
  period: ReportingPeriod,
  allActivities: ActivityRecord[],
  optionsOrAssumptions: DeclarationOptions | CostAssumptions = {},
): DeclarationResult {
  // Accept the bare assumptions object too, which is how the engine tests and
  // most callers use it.
  const options: DeclarationOptions =
    "etsPriceEur" in optionsOrAssumptions
      ? { assumptions: optionsOrAssumptions }
      : optionsOrAssumptions;
  const assumptions = options.assumptions ?? DEFAULT_ASSUMPTIONS;

  const excluded = new Set(options.excludedActivityIds ?? []);
  const activities = excluded.size
    ? allActivities.filter((a) => !excluded.has(a.id))
    : allActivities;

  const emissions = installation.processes.map((p) => computeProcessEmissions(p, activities));

  // On-site precursor flows have to be resolved in dependency order before any
  // downstream intensity means anything.
  const internal = resolveInternalPrecursors(installation, activities, emissions);
  for (const em of emissions) {
    const inj = internal.injected.get(em.processId);
    if (!inj) continue;
    em.internalPrecursorDirectT = Number(inj.directT.toFixed(4));
    em.internalPrecursorIndirectT = Number(inj.indirectT.toFixed(4));
    em.contributions.internalPrecursor = inj.contributions;
  }

  const lines = buildDeclarationLines(installation, activities, emissions);
  const claims = activities.filter((a): a is CarbonPriceActivity => a.kind === "carbon_price");
  const exposure = computeExposure(lines, claims, assumptions);
  const findings = runRules({
    installation,
    period,
    activities,
    emissions,
    lines,
    rejectedRowCount: options.rejectedRowCount ?? 0,
    excludedCount: excluded.size,
  });
  const readiness = assessReadiness(activities, emissions, lines, findings);

  const directT = emissions.reduce((s, e) => s + e.directT, 0);
  const indirectT = emissions.reduce((s, e) => s + e.indirectT, 0);
  const boughtInPrecursorT = emissions.reduce(
    (s, e) => s + e.precursorDirectT + e.precursorIndirectT,
    0,
  );

  const withBenchmarks = lines.map((l) => {
    const benchmark = getBenchmark(l.category);
    if (!benchmark) return l;
    const defaultSee = l.directOnly ? benchmark.direct : benchmark.direct + benchmark.indirect;
    return {
      ...l,
      defaultSee,
      vsDefault: defaultSee > 0 ? (l.seeForObligation - defaultSee) / defaultSee : undefined,
    };
  });

  return {
    installation,
    period,
    emissions,
    lines: withBenchmarks,
    exposure,
    findings,
    readiness,
    totals: {
      directT,
      indirectT,
      precursorT: boughtInPrecursorT,
      // Internal precursor emissions are recirculation, not new emissions, so
      // they are excluded here even though they are real inside each line.
      totalEmbeddedT: directT + indirectT + boughtInPrecursorT,
      obligationT: withBenchmarks.reduce((s, l) => s + l.embeddedEuT, 0),
      goodsT: withBenchmarks.reduce((s, l) => s + l.quantityT, 0),
      goodsEuT: withBenchmarks.reduce((s, l) => s + l.quantityEuT, 0),
    },
    assumptions,
    excludedActivityIds: [...excluded],
    internalWarnings: internal.warnings,
    computedAt: new Date().toISOString(),
    disclaimer: BENCHMARK_DISCLAIMER,
  };
}

// ------------------------------------------------------------------ exports

/**
 * The CBAM communication an installation operator sends to its EU importer.
 * This is the artefact that actually travels: the importer needs it to file
 * their own declaration, and it is what a verifier reads first.
 */
export function toCommunication(result: DeclarationResult) {
  return {
    documentType: "CBAM communication from operator to reporting declarant",
    generatedBy: "CarbonPass AI",
    generatedAt: result.computedAt,
    installation: {
      name: result.installation.name,
      operator: result.installation.operator,
      address: {
        street: result.installation.street,
        city: result.installation.city,
        state: result.installation.state,
        postcode: result.installation.postcode,
        country: result.installation.country,
      },
      unlocode: result.installation.unlocode,
      contact: {
        name: result.installation.contactName,
        email: result.installation.contactEmail,
      },
    },
    reportingPeriod: {
      year: result.period.year,
      from: result.period.start,
      to: result.period.end,
      regime: result.period.regime,
    },
    goods: result.lines.map((l) => ({
      cnCode: l.cnCode,
      description: l.description,
      productionRoute: l.route ?? null,
      quantityTonnes: l.quantityT,
      quantityTonnesToEu: l.quantityEuT,
      specificEmbeddedEmissions: {
        direct: l.seeDirect,
        indirect: l.seeIndirect,
        total: l.seeTotal,
        unit: "tCO2e per tonne",
        countedTowardsObligation: l.directOnly ? "direct only (Annex II)" : "direct and indirect",
      },
      embeddedEmissionsTonnes: {
        total: l.embeddedTotalT,
        obligation: l.embeddedForObligationT,
      },
      monitoringTier: l.lowestTier,
      relativeUncertainty: l.uncertainty,
    })),
    carbonPricePaid: result.exposure.carbonPriceCredit,
    dataQuality: {
      readinessScore: result.readiness.score,
      band: result.readiness.band,
      openBlockers: result.readiness.blockers,
      openWarnings: result.readiness.warnings,
    },
    notes: result.exposure.notes,
    disclaimer: result.disclaimer,
  };
}

function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(result: DeclarationResult): string {
  const header = [
    "cn_code",
    "description",
    "process",
    "route",
    "quantity_t",
    "see_direct_own",
    "see_direct_precursor",
    "see_direct_total",
    "see_indirect_total",
    "see_total",
    "see_for_obligation",
    "embedded_total_tco2e",
    "embedded_obligation_tco2e",
    "benchmark_see",
    "vs_benchmark_pct",
    "tier",
    "uncertainty_pct",
  ];
  const rows = result.lines.map((l) =>
    [
      l.cnCode,
      l.description,
      l.processName,
      l.route ?? "",
      l.quantityT,
      l.seeDirectOwn,
      l.seeDirectPrecursor,
      l.seeDirect,
      l.seeIndirect,
      l.seeTotal,
      l.seeForObligation,
      l.embeddedTotalT,
      l.embeddedForObligationT,
      l.defaultSee ?? "",
      l.vsDefault !== undefined ? (l.vsDefault * 100).toFixed(1) : "",
      l.lowestTier,
      (l.uncertainty * 100).toFixed(1),
    ]
      .map(csvCell)
      .join(","),
  );
  return [header.join(","), ...rows].join("\n");
}

function xmlEscape(s: string): string {
  return s.replace(
    /[<>&'"]/g,
    (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c] ?? c,
  );
}

/**
 * XML in the shape of the CBAM Transitional Registry's quarterly report.
 *
 * Deliberately not claimed to be schema-valid against the Registry XSD - that
 * schema is versioned and distributed by DG TAXUD, and shipping a
 * near-miss that looks official is worse than shipping an honest export. This
 * gets the structure and the field names right so it can be diffed against the
 * real submission, and the operator's own filing agent completes the last mile.
 */
export function toRegistryXml(result: DeclarationResult): string {
  const lines = result.lines
    .map(
      (l) => `    <GoodsItem>
      <CNCode>${xmlEscape(l.cnCode)}</CNCode>
      <Description>${xmlEscape(l.description)}</Description>
      <ProductionRoute>${xmlEscape(l.route ?? "")}</ProductionRoute>
      <QuantityTonnes>${l.quantityT}</QuantityTonnes>
      <SpecificEmbeddedEmissionsDirect>${l.seeDirect}</SpecificEmbeddedEmissionsDirect>
      <SpecificEmbeddedEmissionsIndirect>${l.seeIndirect}</SpecificEmbeddedEmissionsIndirect>
      <TotalEmbeddedEmissions>${l.embeddedTotalT}</TotalEmbeddedEmissions>
      <MonitoringTier>${l.lowestTier}</MonitoringTier>
    </GoodsItem>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- Generated by CarbonPass AI at ${result.computedAt}.
     Structure mirrors the CBAM Transitional Registry quarterly report. Validate
     against the current DG TAXUD schema before submission. -->
<CBAMReport>
  <Declarant>
    <Name>${xmlEscape(result.installation.operator)}</Name>
    <Country>${xmlEscape(result.installation.country)}</Country>
  </Declarant>
  <Installation>
    <Name>${xmlEscape(result.installation.name)}</Name>
    <City>${xmlEscape(result.installation.city)}</City>
    <Country>${xmlEscape(result.installation.country)}</Country>
    <UNLOCODE>${xmlEscape(result.installation.unlocode ?? "")}</UNLOCODE>
  </Installation>
  <ReportingPeriod>
    <Year>${result.period.year}</Year>
    <From>${result.period.start}</From>
    <To>${result.period.end}</To>
  </ReportingPeriod>
  <Goods>
${lines}
  </Goods>
  <Totals>
    <EmbeddedEmissionsTonnes>${result.totals.totalEmbeddedT.toFixed(3)}</EmbeddedEmissionsTonnes>
    <ObligationTonnes>${result.totals.obligationT.toFixed(3)}</ObligationTonnes>
  </Totals>
</CBAMReport>`;
}
