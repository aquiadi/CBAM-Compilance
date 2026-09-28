import type { ProcessEmissions } from "./calc";
import { topologicalOrder } from "./internal";
import { lookupGoods } from "./goods";
import { cbamFactor, cscf, lookupBenchmark, type BenchmarkChoice } from "./regulatory";
import type { ActivityRecord, Installation, PrecursorActivity, ProductionActivity } from "./types";

/**
 * Specific embedded free allocation (SEFA): the free allocation adjustment.
 *
 * The CBAM obligation is not a share of embedded emissions. It is embedded
 * emissions minus the free allocation an EU producer of the same good would
 * still receive, and that allowance is built from CBAM benchmarks along the
 * value chain (Implementing Regulation (EU) 2025/2620; Guidance Document 4):
 *
 *   SFAProc_g = CBAM_y x CSCF_y x BM*_g                      (Equation 2)
 *   SEFA_g    = SFAProc_g + sum_i m_i x SEFA_i               (Equation 4)
 *   m_i       = M_i / AL_g                                   (Equation 5)
 *   FAA_g     = SEFA_g x M_g                                 (Equation 1)
 *
 * BM* is the process-level benchmark from column A of the Annex, selected by
 * CN code, production route and year. Precursors made on site carry the SEFA
 * calculated for their own process; bought-in precursors carry the SEFA their
 * supplier communicated, or one derived from the column B benchmark where they
 * did not (see precursors.ts).
 *
 * Processes are resolved in dependency order for the same reason as embedded
 * emissions: rebar inherits the allowance of the billets it was rolled from.
 */

export interface SefaTerm {
  kind: "bought" | "internal";
  label: string;
  /** Tonnes of precursor consumed in the period (M_i). */
  quantityT: number;
  /** Tonnes of precursor per tonne of good (m_i). */
  specificMass: number;
  /** SEFA of the precursor, tCO2e per tonne of precursor. */
  sefa: number;
  /** Contribution to the good's SEFA, tCO2e per tonne of good. */
  perTonne: number;
  reference: string;
}

export interface GoodSefa {
  processId: string;
  processName: string;
  cnCode: string;
  benchmark?: BenchmarkChoice;
  /** Process-level specific free allocation, tCO2e/t (Equation 2). */
  sfaProc: number;
  terms: SefaTerm[];
  /** Specific embedded free allocation, tCO2e/t (Equation 4). */
  sefa: number;
  issues: string[];
}

export interface SefaResult {
  year: number;
  cbamFactor: number;
  cscf: number;
  cscfPreliminary: boolean;
  goods: GoodSefa[];
}

export function sefaKey(processId: string, cnCode: string): string {
  return `${processId}|${cnCode}`;
}

export function computeSefa(
  installation: Installation,
  activities: ActivityRecord[],
  emissions: ProcessEmissions[],
  year: number,
): SefaResult {
  const factor = cbamFactor(year);
  const correction = cscf(year);
  const links = installation.precursorLinks ?? [];
  const { order } = topologicalOrder(
    installation.processes.map((p) => p.id),
    links,
  );

  const byKey = new Map<string, GoodSefa>();
  const goods: GoodSefa[] = [];

  for (const processId of order) {
    const process = installation.processes.find((p) => p.id === processId);
    const em = emissions.find((e) => e.processId === processId);
    if (!process || !em || em.activityLevelT <= 0) continue;
    const activityLevel = em.activityLevelT;

    // -------------------------------------------- precursor terms (process)
    const terms: SefaTerm[] = [];

    const bought = activities.filter(
      (a): a is PrecursorActivity => a.kind === "precursor" && a.processId === processId,
    );
    // Group by CN code and how the value was resolved, so twelve monthly
    // deliveries of the same material read as one line.
    const groups = new Map<string, { quantity: number; allowance: number; reference: string }>();
    for (const p of bought) {
      const resolved = em.precursorResolutions[p.id];
      if (!resolved) continue;
      const key = `${p.cnCode}|${resolved.sefaReference}`;
      const g = groups.get(key) ?? { quantity: 0, allowance: 0, reference: resolved.sefaReference };
      g.quantity += p.quantityT;
      g.allowance += p.quantityT * resolved.sefa;
      groups.set(key, g);
    }
    for (const [key, g] of groups) {
      const cn = key.split("|")[0] ?? "";
      terms.push({
        kind: "bought",
        label: `${lookupGoods(cn)?.description ?? cn} (bought in)`,
        quantityT: g.quantity,
        specificMass: g.quantity / activityLevel,
        sefa: g.quantity > 0 ? g.allowance / g.quantity : 0,
        perTonne: g.allowance / activityLevel,
        reference: g.reference,
      });
    }

    const issues: string[] = [];
    for (const link of links.filter((l) => l.toProcessId === processId)) {
      const tonnes = activities
        .filter(
          (a): a is ProductionActivity =>
            a.kind === "production" &&
            a.processId === link.fromProcessId &&
            a.cnCode === link.cnCode &&
            a.destination === "internal_transfer",
        )
        .reduce((s, a) => s + a.quantityT, 0);
      if (tonnes <= 0) continue;
      const upstream = byKey.get(sefaKey(link.fromProcessId, link.cnCode));
      const fromName =
        installation.processes.find((p) => p.id === link.fromProcessId)?.name ?? link.fromProcessId;
      if (!upstream) {
        issues.push(
          `No SEFA could be calculated for CN ${link.cnCode} from ${fromName}, so its allowance ` +
            `is not carried into this process.`,
        );
        continue;
      }
      terms.push({
        kind: "internal",
        label: `${lookupGoods(link.cnCode)?.description ?? link.cnCode} from ${fromName}`,
        quantityT: tonnes,
        specificMass: tonnes / activityLevel,
        sefa: upstream.sefa,
        perTonne: (tonnes * upstream.sefa) / activityLevel,
        reference: `Calculated for ${fromName}`,
      });
    }

    const precursorPerTonne = terms.reduce((s, t) => s + t.perTonne, 0);

    // ------------------------------------------------- per good (CN code)
    const cnCodes = [
      ...new Set(
        activities
          .filter(
            (a): a is ProductionActivity => a.kind === "production" && a.processId === processId,
          )
          .map((a) => a.cnCode),
      ),
    ];

    for (const cnCode of cnCodes) {
      const good = lookupGoods(cnCode);
      if (!good) continue;
      const goodIssues = [...issues];
      let sfaProc = 0;
      let benchmark: BenchmarkChoice | undefined;

      if (good.sector !== "electricity") {
        const bm = lookupBenchmark({
          cnCode,
          column: "A",
          year,
          route: process.benchmarkRoute,
        });
        if (bm.ok) {
          benchmark = bm.choice;
          sfaProc = factor * correction.value * bm.choice.value;
        } else {
          goodIssues.push(bm.message);
        }
      }

      const result: GoodSefa = {
        processId,
        processName: process.name,
        cnCode,
        benchmark,
        sfaProc,
        terms,
        sefa: sfaProc + precursorPerTonne,
        issues: goodIssues,
      };
      byKey.set(sefaKey(processId, cnCode), result);
      goods.push(result);
    }
  }

  return {
    year,
    cbamFactor: factor,
    cscf: correction.value,
    cscfPreliminary: correction.preliminary,
    goods,
  };
}
