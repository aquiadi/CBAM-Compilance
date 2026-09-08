import { getFactor, tryGetFactor } from "./factors";
import { lookupGoods } from "./goods";
import { fuelEnergyTJ } from "./units";
import type {
  ActivityRecord,
  DeclarationLine,
  ElectricityActivity,
  FuelActivity,
  HeatActivity,
  Installation,
  MethodTier,
  PrecursorActivity,
  ProcessMaterialActivity,
  ProductionActivity,
  ProductionProcess,
} from "./types";

/**
 * The calculation core.
 *
 * Deliberately pure: activities in, numbers out, no I/O and no model calls.
 * The language model in this product never touches these functions - it maps
 * columns and explains findings, and that separation is the whole reason a
 * number produced here can be defended to a verifier.
 *
 * Methodology follows Annex III (determination of emissions) and Annex IV
 * (specific embedded emissions) of Regulation (EU) 2023/956 and the
 * Implementing Regulation (EU) 2023/1773.
 */

/** One term of a computed total, retained so the UI can show the arithmetic. */
export interface Contribution {
  activityId: string;
  label: string;
  /** Activity data as it entered the calculation. */
  quantity: number;
  quantityUnit: string;
  /** Intermediate energy value for fuels, TJ. */
  energyTJ?: number;
  factorId: string;
  factorValue: number;
  factorUnit: string;
  /** tCO2e contributed. */
  emissionsT: number;
  formula: string;
  uncertainty: number;
}

export interface ProcessEmissions {
  processId: string;
  processName: string;
  category: ProductionProcess["category"];
  route?: string;
  /** tCO2e from combustion and process chemistry inside the boundary. */
  directT: number;
  /** tCO2e from electricity consumed. */
  indirectT: number;
  /** tCO2e imported as measurable heat, already inside directT. */
  heatImportedT: number;
  /** tCO2e credited out with exported heat, already netted off directT. */
  heatExportedT: number;
  /** Tonnes of goods produced by this process in the period. */
  activityLevelT: number;
  /** tCO2e carried in by bought-in CBAM precursors. */
  precursorDirectT: number;
  precursorIndirectT: number;
  /** tCO2e carried in from an upstream process in the same installation. */
  internalPrecursorDirectT: number;
  internalPrecursorIndirectT: number;
  contributions: {
    fuel: Contribution[];
    processMaterial: Contribution[];
    electricity: Contribution[];
    heat: Contribution[];
    precursor: Contribution[];
    internalPrecursor: Contribution[];
  };
  /** Weakest method tier feeding this process. */
  lowestTier: MethodTier;
  /** Propagated relative uncertainty of directT. */
  directUncertainty: number;
  /** Anything the calculation could not do, e.g. a fuel with no NCV. */
  errors: string[];
}

function combineUncertainty(terms: { emissionsT: number; uncertainty: number }[]): number {
  // Independent terms combine in quadrature, weighted by their contribution.
  const total = terms.reduce((s, t) => s + Math.abs(t.emissionsT), 0);
  if (total === 0) return 0;
  const variance = terms.reduce(
    (s, t) => s + Math.pow(Math.abs(t.emissionsT) * t.uncertainty, 2),
    0,
  );
  return Math.sqrt(variance) / total;
}

function round(n: number, dp = 6): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

/** Emissions from one combusted fuel stream. */
export function fuelContribution(a: FuelActivity): Contribution | { error: string } {
  const factor = tryGetFactor(a.factorId);
  if (!factor) return { error: `Fuel record ${a.id} references unknown factor "${a.factorId}"` };

  const ncv = a.ncvGJPerTonne ?? factor.ncvGJPerTonne;
  let energyTJ: number;
  try {
    energyTJ = fuelEnergyTJ({
      quantity: a.quantity,
      unit: a.unit,
      ncvGJPerTonne: ncv,
      densityTPerM3: factor.densityTPerM3,
    });
  } catch (e) {
    return { error: `${factor.name}: ${(e as Error).message}` };
  }

  const oxidation = factor.oxidationFactor ?? 1;
  const emissionsT = energyTJ * factor.value * oxidation;
  const ncvNote = a.ncvGJPerTonne ? " (plant-measured NCV)" : "";

  return {
    activityId: a.id,
    label: factor.name,
    quantity: a.quantity,
    quantityUnit: a.unit,
    energyTJ: round(energyTJ),
    factorId: factor.id,
    factorValue: factor.value,
    factorUnit: factor.unit,
    emissionsT: round(emissionsT),
    formula:
      a.unit === "TJ"
        ? `${a.quantity} TJ x ${factor.value} tCO2e/TJ x ${oxidation}`
        : `${a.quantity} ${a.unit} x ${ncv} GJ/t${ncvNote} / 1000 x ${factor.value} tCO2e/TJ x ${oxidation}`,
    uncertainty: factor.uncertainty,
  };
}

export function processMaterialContribution(
  a: ProcessMaterialActivity,
): Contribution | { error: string } {
  const factor = tryGetFactor(a.factorId);
  if (!factor) {
    return { error: `Process material record ${a.id} references unknown factor "${a.factorId}"` };
  }
  const emissionsT = a.quantityT * factor.value;
  return {
    activityId: a.id,
    label: factor.name,
    quantity: a.quantityT,
    quantityUnit: "t",
    factorId: factor.id,
    factorValue: factor.value,
    factorUnit: factor.unit,
    emissionsT: round(emissionsT),
    formula: `${a.quantityT} t x ${factor.value} tCO2e/t`,
    uncertainty: factor.uncertainty,
  };
}

export function electricityContribution(a: ElectricityActivity): Contribution | { error: string } {
  const factor = tryGetFactor(a.factorId);
  if (!factor) {
    return { error: `Electricity record ${a.id} references unknown factor "${a.factorId}"` };
  }
  const emissionsT = a.quantityMWh * factor.value;
  return {
    activityId: a.id,
    label: `${factor.name} (${a.supply})`,
    quantity: a.quantityMWh,
    quantityUnit: "MWh",
    factorId: factor.id,
    factorValue: factor.value,
    factorUnit: factor.unit,
    emissionsT: round(emissionsT),
    formula: `${a.quantityMWh} MWh x ${factor.value} tCO2e/MWh`,
    uncertainty: factor.uncertainty,
  };
}

export function heatContribution(a: HeatActivity): Contribution | { error: string } {
  const factor = tryGetFactor(a.factorId);
  if (!factor) return { error: `Heat record ${a.id} references unknown factor "${a.factorId}"` };
  const sign = a.direction === "imported" ? 1 : -1;
  const emissionsT = sign * a.quantityTJ * factor.value;
  return {
    activityId: a.id,
    label: `Measurable heat ${a.direction}`,
    quantity: a.quantityTJ,
    quantityUnit: "TJ",
    factorId: factor.id,
    factorValue: factor.value,
    factorUnit: factor.unit,
    emissionsT: round(emissionsT),
    formula: `${sign < 0 ? "-" : ""}${a.quantityTJ} TJ x ${factor.value} tCO2e/TJ`,
    uncertainty: factor.uncertainty,
  };
}

export function precursorContribution(a: PrecursorActivity): Contribution {
  const goods = lookupGoods(a.cnCode);
  const see = a.seeDirect + a.seeIndirect;
  // Applying a default precursor value instead of a supplier figure is a real
  // source of error, so it carries a much wider uncertainty band.
  const uncertainty = a.seeSource === "default" ? 0.3 : a.seeSource === "supplier" ? 0.1 : 0.05;
  return {
    activityId: a.id,
    label: `${goods?.description ?? a.cnCode} (precursor, ${a.seeSource})`,
    quantity: a.quantityT,
    quantityUnit: "t",
    factorId: `precursor:${a.cnCode}`,
    factorValue: see,
    factorUnit: "tCO2e/t",
    emissionsT: round(a.quantityT * see),
    formula: `${a.quantityT} t x (${a.seeDirect} direct + ${a.seeIndirect} indirect) tCO2e/t`,
    uncertainty,
  };
}

/** Aggregate every activity attributed to one production process. */
export function computeProcessEmissions(
  process: ProductionProcess,
  activities: ActivityRecord[],
): ProcessEmissions {
  const mine = activities.filter((a) => a.processId === process.id);
  const errors: string[] = [];

  const collect = <T extends ActivityRecord>(
    records: T[],
    fn: (r: T) => Contribution | { error: string },
  ): Contribution[] => {
    const out: Contribution[] = [];
    for (const r of records) {
      const result = fn(r);
      if ("error" in result) errors.push(result.error);
      else out.push(result);
    }
    return out;
  };

  const fuel = collect(
    mine.filter((a): a is FuelActivity => a.kind === "fuel"),
    fuelContribution,
  );
  const processMaterial = collect(
    mine.filter((a): a is ProcessMaterialActivity => a.kind === "process_material"),
    processMaterialContribution,
  );
  const electricity = collect(
    mine.filter((a): a is ElectricityActivity => a.kind === "electricity"),
    electricityContribution,
  );
  const heatRecords = mine.filter((a): a is HeatActivity => a.kind === "heat");
  const heat = collect(heatRecords, heatContribution);
  const precursors = mine.filter((a): a is PrecursorActivity => a.kind === "precursor");
  const precursor = precursors.map(precursorContribution);

  const sum = (c: Contribution[]) =>
    round(
      c.reduce((s, x) => s + x.emissionsT, 0),
      4,
    );

  const heatImportedT = sum(heat.filter((h) => h.emissionsT > 0));
  const heatExportedT = -sum(heat.filter((h) => h.emissionsT < 0));

  // Annex III: attributed direct emissions are combustion plus process
  // emissions, plus heat imported, less heat exported out of the boundary.
  const directT = round(sum(fuel) + sum(processMaterial) + sum(heat), 4);
  const indirectT = sum(electricity);

  const activityLevelT = round(
    mine
      .filter((a): a is ProductionActivity => a.kind === "production")
      .reduce((s, a) => s + a.quantityT, 0),
    4,
  );

  const precursorDirectT = round(
    precursors.reduce((s, p) => s + p.quantityT * p.seeDirect, 0),
    4,
  );
  const precursorIndirectT = round(
    precursors.reduce((s, p) => s + p.quantityT * p.seeIndirect, 0),
    4,
  );

  const tiers = mine.map((a) => a.tier);
  const lowestTier = (tiers.length ? Math.min(...tiers) : 1) as MethodTier;

  return {
    processId: process.id,
    processName: process.name,
    category: process.category,
    route: process.route,
    directT,
    indirectT,
    heatImportedT,
    heatExportedT,
    activityLevelT,
    precursorDirectT,
    precursorIndirectT,
    contributions: { fuel, processMaterial, electricity, heat, precursor, internalPrecursor: [] },
    internalPrecursorDirectT: 0,
    internalPrecursorIndirectT: 0,
    lowestTier,
    directUncertainty: combineUncertainty([...fuel, ...processMaterial, ...heat]),
    errors,
  };
}

/**
 * Specific embedded emissions per Annex IV:
 *
 *   SEE = (AttrEm + sum over precursors of M_i * SEE_i) / activity level
 *
 * Direct and indirect are tracked separately throughout, because Annex II
 * decides which of the two creates a certificate obligation, and that decision
 * is per good, not per installation.
 */
export function buildDeclarationLines(
  installation: Installation,
  activities: ActivityRecord[],
  emissionsByProcess: ProcessEmissions[],
): DeclarationLine[] {
  const lines: DeclarationLine[] = [];

  for (const process of installation.processes) {
    const em = emissionsByProcess.find((e) => e.processId === process.id);
    if (!em) continue;

    const production = activities.filter(
      (a): a is ProductionActivity => a.kind === "production" && a.processId === process.id,
    );
    if (production.length === 0) continue;

    // Where one process yields several CN codes, attributed emissions are
    // allocated across them by mass, which is the Annex III fallback when no
    // more precise physical basis is available.
    const totalT = production.reduce((s, p) => s + p.quantityT, 0);
    if (totalT <= 0) continue;

    interface CnTotals {
      total: number;
      eu: number;
      internal: number;
    }
    const byCn = new Map<string, CnTotals>();
    for (const p of production) {
      const acc = byCn.get(p.cnCode) ?? { total: 0, eu: 0, internal: 0 };
      acc.total += p.quantityT;
      if (p.destination === "eu_export") acc.eu += p.quantityT;
      if (p.destination === "internal_transfer") acc.internal += p.quantityT;
      byCn.set(p.cnCode, acc);
    }

    for (const [cnCode, totals] of byCn) {
      const quantityT = totals.total;
      const goods = lookupGoods(cnCode);
      if (!goods) continue;

      const seeDirectOwn = round(em.directT / totalT, 6);
      const seeIndirectOwn = round(em.indirectT / totalT, 6);
      const seeDirectPrecursor = round(
        (em.precursorDirectT + em.internalPrecursorDirectT) / totalT,
        6,
      );
      const seeIndirectPrecursor = round(
        (em.precursorIndirectT + em.internalPrecursorIndirectT) / totalT,
        6,
      );

      const seeDirect = round(seeDirectOwn + seeDirectPrecursor, 6);
      const seeIndirect = round(seeIndirectOwn + seeIndirectPrecursor, 6);
      const seeTotal = round(seeDirect + seeIndirect, 6);
      const seeForObligation = goods.directOnly ? seeDirect : seeTotal;

      lines.push({
        cnCode,
        description: goods.description,
        category: goods.category,
        sector: goods.sector,
        directOnly: goods.directOnly,
        processId: process.id,
        processName: process.name,
        route: process.route,
        quantityT: round(quantityT, 4),
        quantityEuT: round(totals.eu, 4),
        quantityInternalT: round(totals.internal, 4),
        seeDirectOwn,
        seeIndirectOwn,
        seeDirectPrecursor,
        seeIndirectPrecursor,
        seeDirect,
        seeIndirect,
        seeTotal,
        seeForObligation,
        embeddedTotalT: round(quantityT * seeTotal, 3),
        embeddedForObligationT: round(quantityT * seeForObligation, 3),
        embeddedEuT: round(totals.eu * seeForObligation, 3),
        uncertainty: em.directUncertainty,
        lowestTier: em.lowestTier,
      });
    }
  }

  return lines.sort(
    (a, b) => b.embeddedEuT - a.embeddedEuT || b.embeddedForObligationT - a.embeddedForObligationT,
  );
}

export { getFactor };
