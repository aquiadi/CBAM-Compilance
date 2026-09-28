import { buildDeclarationLines, computeProcessEmissions, type ProcessEmissions } from "./calc";
import { resolveInternalPrecursors } from "./internal";
import {
  computeExposure,
  defaultScenarioFor,
  DEFAULT_ASSUMPTIONS,
  type CostAssumptions,
  type ExposureResult,
  type TrajectoryPoint,
} from "./cost";
import { runRules, type Finding } from "./rules";
import { assessReadiness, type ReadinessResult } from "./readiness";
import { computeSefa, sefaKey, type SefaResult } from "./sefa";
import {
  cbamFactor,
  FIRST_DEFINITIVE_YEAR,
  LAST_PHASE_IN_YEAR,
  REGULATORY_SOURCES,
  ROUTE_INDICATORS,
} from "./regulatory";
import type {
  ActivityRecord,
  CarbonPriceActivity,
  DeclarationLine,
  Installation,
  ProductionActivity,
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

export const DECLARATION_DISCLAIMER =
  "Computed from the operator's activity data with the European Commission's published CBAM " +
  "tables (versions listed under sources). Actual values become usable by an EU declarant only " +
  "once verified by an accredited verifier; until then the declarant must use default values. " +
  "This is a calculation aid, not legal advice, and it does not file anything.";

export interface DeclarationResult {
  installation: Installation;
  period: ReportingPeriod;
  emissions: ProcessEmissions[];
  lines: DeclarationLine[];
  sefa: SefaResult;
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
    /** Embedded emissions of EU-bound goods only, before the free allocation adjustment. */
    obligationT: number;
    goodsT: number;
    goodsEuT: number;
  };
  assumptions: CostAssumptions;
  excludedActivityIds: string[];
  internalWarnings: string[];
  computedAt: string;
  disclaimer: string;
  sources: typeof REGULATORY_SOURCES;
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
  /** Rows skipped as outside CBAM scope during ingest, for rule CP-020. */
  outOfScopeRows?: { fileName: string; row: number; cnCode: string; description: string }[];
  /** Finding keys the operator has reviewed and accepted. */
  acknowledged?: string[];
}

interface Core {
  emissions: ProcessEmissions[];
  lines: DeclarationLine[];
  sefa: SefaResult;
  internalWarnings: string[];
}

/** Embedded emissions and free allocation for one production year. */
function computeCore(installation: Installation, activities: ActivityRecord[], year: number): Core {
  const emissions = installation.processes.map((p) =>
    computeProcessEmissions(p, activities, {
      year,
      gridEmissionFactor: installation.gridEmissionFactor,
    }),
  );

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

  const sefa = computeSefa(installation, activities, emissions, year);
  const sefaByKey = new Map(sefa.goods.map((g) => [sefaKey(g.processId, g.cnCode), g]));

  const lines = buildDeclarationLines(installation, activities, emissions).map((l) => {
    const good = sefaByKey.get(sefaKey(l.processId, l.cnCode));
    const scenario = defaultScenarioFor(l.cnCode, installation.country, year);
    const defaultSee = "error" in scenario ? undefined : scenario.seeWithMarkup;
    return {
      ...l,
      sefa: good?.sefa ?? 0,
      sefaIssues: good ? good.issues : ["No free allocation could be calculated for this good."],
      defaultSee,
      vsDefault:
        defaultSee !== undefined && defaultSee > 0
          ? (l.seeForObligation - defaultSee) / defaultSee
          : undefined,
    };
  });

  return { emissions, lines, sefa, internalWarnings: internal.warnings };
}

function obligationFor(lines: DeclarationLine[]): number {
  return lines.reduce((s, l) => s + l.quantityEuT * Math.max(0, l.seeForObligation - l.sefa), 0);
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
  const assumptions: CostAssumptions = {
    ...(options.assumptions ?? DEFAULT_ASSUMPTIONS),
    // The production year of the goods is the reporting period's year; the
    // CBAM factor, mark-ups and year-dependent benchmarks all follow it.
    year: period.year,
  };

  const excluded = new Set(options.excludedActivityIds ?? []);
  const activities = excluded.size
    ? allActivities.filter((a) => !excluded.has(a.id))
    : allActivities;

  const core = computeCore(installation, activities, period.year);
  const { emissions, lines, sefa } = core;

  const production = activities.filter((a): a is ProductionActivity => a.kind === "production");
  const claims = activities.filter((a): a is CarbonPriceActivity => a.kind === "carbon_price");

  // The same volumes in each year of the phase-in: the free allocation
  // adjustment shrinks and default mark-ups rise, so each year is recomputed
  // rather than scaled.
  const trajectory: TrajectoryPoint[] = [];
  for (let y = Math.max(FIRST_DEFINITIVE_YEAR, period.year); y <= LAST_PHASE_IN_YEAR; y++) {
    const yearLines = y === period.year ? lines : computeCore(installation, activities, y).lines;
    const certificates = obligationFor(yearLines);
    const defaultCertificates = yearLines.reduce((s, l) => {
      const scenario = defaultScenarioFor(l.cnCode, installation.country, y);
      return "error" in scenario ? s : s + l.quantityEuT * scenario.obligationPerTonne;
    }, 0);
    trajectory.push({
      year: y,
      factor: cbamFactor(y),
      certificates,
      costEur: certificates * assumptions.etsPriceEur,
      defaultCostEur: defaultCertificates * assumptions.etsPriceEur,
    });
  }

  const exposure = computeExposure({
    lines,
    production,
    claims,
    assumptions,
    country: installation.country,
    trajectory,
  });
  // The period's own year is priced at the published quarterly prices.
  const current = exposure.trajectory.find((t) => t.year === period.year);
  if (current) {
    current.costEur = exposure.grossCostEur;
    current.defaultCostEur = exposure.defaultScenario.costEur;
  }

  const acknowledged = new Set(options.acknowledged ?? []);
  const findings = runRules({
    installation,
    period,
    activities,
    emissions,
    lines,
    sefa,
    rejectedRowCount: options.rejectedRowCount ?? 0,
    excludedCount: excluded.size,
    outOfScopeRows: options.outOfScopeRows ?? [],
  }).map((f) =>
    // A blocker is cleared by fixing the data, never by acknowledging it.
    f.severity !== "blocker" && acknowledged.has(`${f.code}::${f.title}`)
      ? { ...f, acknowledged: true }
      : f,
  );
  const readiness = assessReadiness(activities, emissions, lines, findings);

  const directT = emissions.reduce((s, e) => s + e.directT, 0);
  const indirectT = emissions.reduce((s, e) => s + e.indirectT, 0);
  const boughtInPrecursorT = emissions.reduce(
    (s, e) => s + e.precursorDirectT + e.precursorIndirectT,
    0,
  );

  return {
    installation,
    period,
    emissions,
    lines,
    sefa,
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
      obligationT: lines.reduce((s, l) => s + l.embeddedEuT, 0),
      goodsT: lines.reduce((s, l) => s + l.quantityT, 0),
      goodsEuT: lines.reduce((s, l) => s + l.quantityEuT, 0),
    },
    assumptions,
    excludedActivityIds: [...excluded],
    internalWarnings: core.internalWarnings,
    computedAt: new Date().toISOString(),
    disclaimer: DECLARATION_DISCLAIMER,
    sources: REGULATORY_SOURCES,
  };
}

// ------------------------------------------------------------------ exports

/**
 * The data an installation operator communicates to its EU importers, in the
 * order of the Commission's communication template: installation, production
 * processes and routes, goods with direct/indirect SEE and the free allocation
 * data (SEFA) the declarant now needs, and any carbon price paid.
 */
export function toCommunication(result: DeclarationResult) {
  const sefaByKey = new Map(result.sefa.goods.map((g) => [sefaKey(g.processId, g.cnCode), g]));
  return {
    documentType: "CBAM communication from installation operator to authorised CBAM declarant",
    generatedBy: "CarbonPass",
    generatedAt: result.computedAt,
    verificationStatus:
      "Not verified by CarbonPass. Attach the accredited verifier's report before a declarant relies on these values.",
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
      unlocode: result.installation.unlocode ?? null,
      coordinates:
        result.installation.latitude !== undefined && result.installation.longitude !== undefined
          ? { latitude: result.installation.latitude, longitude: result.installation.longitude }
          : null,
      economicActivity: result.installation.economicActivity ?? null,
      registryOperatorId: result.installation.registryOperatorId ?? null,
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
    productionProcesses: result.installation.processes.map((p) => ({
      name: p.name,
      aggregatedGoodsCategory: p.category,
      route: p.route ?? null,
      benchmarkRouteIndicator: p.benchmarkRoute ?? null,
      benchmarkRoute: p.benchmarkRoute ? (ROUTE_INDICATORS[p.benchmarkRoute] ?? null) : null,
    })),
    goods: result.lines.map((l) => {
      const s = sefaByKey.get(sefaKey(l.processId, l.cnCode));
      return {
        cnCode: l.cnCode,
        description: l.description,
        productionProcess: l.processName,
        productionRoute: l.route ?? null,
        quantityProducedTonnes: l.quantityT,
        specificEmbeddedEmissions: {
          direct: l.seeDirect,
          indirect: l.seeIndirect,
          total: l.seeTotal,
          counted: l.seeForObligation,
          unit: "tCO2e per tonne",
          countedTowardsObligation: l.directOnly ? "direct only (Annex II)" : "direct and indirect",
        },
        freeAllocation: {
          specificEmbeddedFreeAllocation: l.sefa,
          unit: "tCO2e per tonne",
          processBenchmark: s?.benchmark
            ? { value: s.benchmark.value, indicator: s.benchmark.indicator || null }
            : null,
          cbamFactor: result.sefa.cbamFactor,
          crossSectoralCorrectionFactor: result.sefa.cscf,
          issues: l.sefaIssues,
        },
        defaultValueForComparison: l.defaultSee ?? null,
        monitoringTier: l.lowestTier,
        relativeUncertainty: l.uncertainty,
      };
    }),
    carbonPricePaid: {
      certificatesAvoided: result.exposure.carbonPriceCredit,
      note:
        result.exposure.carbonPriceCredit > 0
          ? "Evidence of the price paid is attached to the workspace."
          : "No carbon price effectively paid is claimed.",
    },
    dataQuality: {
      readinessScore: result.readiness.score,
      band: result.readiness.band,
      openBlockers: result.readiness.blockers,
      openWarnings: result.readiness.warnings,
    },
    sources: Object.values(result.sources).map((s) => `${s.act} - ${s.title} (${s.version})`),
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
    "benchmark_route",
    "quantity_t",
    "quantity_eu_t",
    "see_direct_own",
    "see_direct_precursor",
    "see_direct_total",
    "see_indirect_total",
    "see_total",
    "see_for_obligation",
    "sefa",
    "obligation_per_t",
    "embedded_total_tco2e",
    "embedded_eu_tco2e",
    "default_value_incl_markup",
    "vs_default_pct",
    "tier",
    "uncertainty_pct",
  ];
  const routeOf = (processId: string) =>
    result.installation.processes.find((p) => p.id === processId)?.benchmarkRoute ?? "";
  const rows = result.lines.map((l) =>
    [
      l.cnCode,
      l.description,
      l.processName,
      l.route ?? "",
      routeOf(l.processId),
      l.quantityT,
      l.quantityEuT,
      l.seeDirectOwn,
      l.seeDirectPrecursor,
      l.seeDirect,
      l.seeIndirect,
      l.seeTotal,
      l.seeForObligation,
      l.sefa.toFixed(6),
      Math.max(0, l.seeForObligation - l.sefa).toFixed(6),
      l.embeddedTotalT,
      l.embeddedEuT,
      l.defaultSee !== undefined ? l.defaultSee.toFixed(4) : "",
      l.vsDefault !== undefined ? (l.vsDefault * 100).toFixed(1) : "",
      l.lowestTier,
      (l.uncertainty * 100).toFixed(1),
    ]
      .map(csvCell)
      .join(","),
  );
  return [header.join(","), ...rows].join("\n");
}
