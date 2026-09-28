import { lookupGoods } from "./goods";
import {
  cbamFactor,
  cscf,
  defaultValueMarkup,
  lookupBenchmark,
  lookupDefaultValue,
  type Sector,
} from "./regulatory";
import type { PrecursorActivity } from "./types";

/**
 * The values a bought-in precursor carries into the calculation.
 *
 * Where the supplier communicated actual values they are used as given. Where
 * they did not, the Commission's default value applies, increased by the
 * year's mark-up, taken from the country of production's table - or, for a
 * precursor of unknown origin, Annex IV (the highest default). Nothing is
 * estimated: if no published value exists the precursor is reported as
 * unresolved and the rules engine raises a blocker.
 *
 * The same resolution produces the precursor's specific embedded free
 * allocation (SEFA), which feeds the free allocation adjustment of the good it
 * ends up in.
 */

export interface ResolvedPrecursor {
  status: "supplier" | "default" | "unresolved";
  seeDirect: number;
  seeIndirect: number;
  /** Human-readable reference for the audit trail. */
  reference: string;
  /** Specific embedded free allocation, tCO2e per tonne of precursor. */
  sefa: number;
  sefaReference: string;
  /** Problems resolving SEFA; the SEE may still be fine. */
  sefaIssue?: string;
  /** Problems resolving SEE; set when status is "unresolved". */
  issue?: string;
  /** Mark-up applied to a default value, as a fraction. */
  markup?: number;
}

function defaultSefa(
  cnCode: string,
  route: string,
  year: number,
): { sefa: number; reference: string; issue?: string } {
  const bm = lookupBenchmark({ cnCode, column: "B", year, route });
  if (!bm.ok) {
    return { sefa: 0, reference: "-", issue: bm.message };
  }
  const factor = cbamFactor(year);
  const correction = cscf(year).value;
  return {
    sefa: factor * correction * bm.choice.value,
    reference:
      `${(factor * 100).toFixed(1)}% CBAM factor x CSCF ${correction} x column B benchmark ` +
      `${bm.choice.value}${bm.choice.indicator ? ` (${bm.choice.indicator})` : ""}`,
  };
}

export function resolvePrecursor(activity: PrecursorActivity, year: number): ResolvedPrecursor {
  const goods = lookupGoods(activity.cnCode);
  const sector = (goods?.sector ?? "iron_steel") as Sector;

  // ------------------------------------------------------ supplier actuals
  if (activity.supplier) {
    const s = activity.supplier;
    let sefa = s.sefa;
    let sefaReference = "Communicated by the supplier";
    let sefaIssue: string | undefined;
    if (sefa === undefined) {
      // Guidance 4, s. 2.2.1.1: where the producer does not provide the value,
      // SEFA is determined from the column B benchmark for the precursor.
      const dv = lookupDefaultValue({
        cnCode: activity.cnCode,
        country: activity.originCountry,
        precursorOfUnknownOrigin: !activity.originCountry,
      });
      const fallback = defaultSefa(activity.cnCode, dv.ok ? dv.value.route : "", year);
      sefa = fallback.sefa;
      sefaReference = `Not communicated; ${fallback.reference}`;
      sefaIssue = fallback.issue;
    }
    return {
      status: "supplier",
      seeDirect: s.seeDirect,
      seeIndirect: s.seeIndirect,
      reference: s.verified
        ? `Supplier communication (verified)${activity.supplierName ? `, ${activity.supplierName}` : ""}`
        : `Supplier communication (not verified)${activity.supplierName ? `, ${activity.supplierName}` : ""}`,
      sefa,
      sefaReference,
      sefaIssue,
    };
  }

  // --------------------------------------------------------- default values
  const dv = lookupDefaultValue({
    cnCode: activity.cnCode,
    country: activity.originCountry,
    precursorOfUnknownOrigin: !activity.originCountry,
  });
  if (!dv.ok) {
    return {
      status: "unresolved",
      seeDirect: 0,
      seeIndirect: 0,
      reference: "-",
      sefa: 0,
      sefaReference: "-",
      issue: dv.message,
    };
  }

  const markup = defaultValueMarkup(dv.value.sector ?? sector, year);
  const direct = (dv.value.direct ?? dv.value.total) * (1 + markup);
  // Indirect default values are only published where indirect emissions count.
  const indirect = (dv.value.indirect ?? 0) * (1 + markup);
  const sefa = defaultSefa(activity.cnCode, dv.value.route, year);

  return {
    status: "default",
    seeDirect: direct,
    seeIndirect: indirect,
    reference:
      `Default value, ${dv.value.table}, CN ${dv.value.tableCode}: ` +
      `${dv.value.total.toFixed(3)} tCO2e/t + ${(markup * 100).toFixed(0)}% mark-up (${year})`,
    markup,
    sefa: sefa.sefa,
    sefaReference: sefa.reference,
    sefaIssue: sefa.issue,
  };
}
