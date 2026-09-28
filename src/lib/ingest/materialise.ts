import { createHash } from "node:crypto";
import { tryGetFactor } from "../cbam/factors";
import { lookupGoods, normaliseCnCode } from "../cbam/goods";
import { countryCode } from "../cbam/regulatory";
import { normaliseQuantity, parseNumeric, resolveUnit } from "../cbam/units";
import type {
  ActivityRecord,
  Lineage,
  MethodTier,
  ProductionProcess,
  Provenance,
} from "../cbam/types";
import { normalisePeriod, periodBounds, type ParsedDataset } from "./parse";
import type { DatasetMapping } from "./schema";

/**
 * Turns rows plus a mapping into activity records.
 *
 * Entirely deterministic. The model's influence ends at the mapping object; from
 * here the transformation is pure code, so re-running this on the same mapping
 * always produces the same records - with the same ids, derived from the
 * dataset, row and record kind - which is what lets an exclusion or an
 * acknowledgement survive a re-import and makes the audit trail mean anything.
 *
 * Rows that cannot be materialised are rejected with a reason rather than
 * skipped, because a row silently missing from a declaration is an
 * understatement, and understatements are the ones that carry penalties.
 */

export interface RejectedRow {
  fileName: string;
  row: number;
  reason: string;
  raw: Record<string, string>;
}

/** A row read correctly but deliberately left out: goods outside CBAM scope. */
export interface SkippedRow {
  fileName: string;
  row: number;
  cnCode: string;
  description: string;
  reason: string;
}

export interface MaterialiseResult {
  activities: ActivityRecord[];
  rejected: RejectedRow[];
  skipped: SkippedRow[];
  /** Unit actually applied per column, after header/unit-column/model resolution. */
  appliedUnits: Record<string, string>;
}

interface Ctx {
  dataset: ParsedDataset;
  mapping: DatasetMapping;
  processes: ProductionProcess[];
  defaultProcessId?: string;
}

function columnFor(mapping: DatasetMapping, field: string): string | undefined {
  return mapping.columns.find((c) => c.targetField === field)?.sourceColumn;
}

function cell(row: Record<string, string>, column: string | undefined): string {
  if (!column) return "";
  return String(row[column] ?? "").trim();
}

function resolveValue(
  mapping: DatasetMapping,
  target: "factor" | "process" | "supply",
  value: string,
): string | null {
  const exact = mapping.values.find(
    (v) => v.target === target && v.sourceValue.trim().toLowerCase() === value.trim().toLowerCase(),
  );
  return exact?.resolvedId ?? null;
}

/**
 * Stable record id: the same row of the same dataset always yields the same id,
 * so operator decisions keyed on it (exclusions) survive a re-map.
 */
function recordId(datasetId: string, row: number, kind: string, part = 0): string {
  return (
    "act_" +
    createHash("sha256").update(`${datasetId}:${row}:${kind}:${part}`).digest("hex").slice(0, 20)
  );
}

function truthy(value: string): boolean | null {
  const v = value.trim().toLowerCase();
  if (!v) return null;
  if (["y", "yes", "true", "1", "verified", "received", "done"].includes(v)) return true;
  if (["n", "no", "false", "0", "not verified", "pending", "-", "na", "n/a"].includes(v))
    return false;
  return null;
}

/**
 * Decide the unit for a quantity. Priority: an explicit unit column on the row,
 * then the unit the mapper detected in the header, then nothing - and "nothing"
 * means the row is rejected, not guessed at.
 */
function unitFor(
  ctx: Ctx,
  row: Record<string, string>,
  quantityField: string,
): { unit: string; source: string } | null {
  const unitColumn = columnFor(ctx.mapping, "unit");
  const fromRow = cell(row, unitColumn);
  if (fromRow && resolveUnit(fromRow))
    return { unit: fromRow, source: `unit column "${unitColumn}"` };

  const column = ctx.mapping.columns.find((c) => c.targetField === quantityField);
  if (column?.detectedUnit && resolveUnit(column.detectedUnit)) {
    return { unit: column.detectedUnit, source: `header of "${column.sourceColumn}"` };
  }
  return null;
}

export function materialise(
  dataset: ParsedDataset,
  mapping: DatasetMapping,
  processes: ProductionProcess[],
): MaterialiseResult {
  const ctx: Ctx = { dataset, mapping, processes };
  const activities: ActivityRecord[] = [];
  const rejected: RejectedRow[] = [];
  const skipped: SkippedRow[] = [];
  const appliedUnits: Record<string, string> = {};

  const periodCol = columnFor(mapping, "period");
  const processCol = columnFor(mapping, "process");
  const materialCol = columnFor(mapping, "material");
  const quantityCol = columnFor(mapping, "quantity");

  dataset.rows.forEach((row, index) => {
    const rowNumber = index + 1;
    const lineage: Lineage = {
      datasetId: dataset.datasetId,
      fileName: dataset.fileName,
      row: rowNumber,
      raw: row,
    };
    const reject = (reason: string) =>
      rejected.push({ fileName: dataset.fileName, row: rowNumber, reason, raw: row });

    const period = normalisePeriod(cell(row, periodCol));
    if (!period) {
      reject(`Could not read a reporting period from "${cell(row, periodCol) || "(empty)"}".`);
      return;
    }
    const { start, end } = periodBounds(period);

    const processValue = cell(row, processCol);
    const processId = resolveValue(mapping, "process", processValue) ?? ctx.defaultProcessId;
    if (!processId) {
      reject(`Section "${processValue || "(empty)"}" does not map to a production process.`);
      return;
    }

    const base = {
      processId,
      periodStart: start,
      periodEnd: end,
      lineage,
      provenance: "calculated" as Provenance,
      tier: 2 as MethodTier,
    };

    // ------------------------------------------------------------- production
    if (mapping.kind === "production") {
      const cnRaw = cell(row, columnFor(mapping, "cn_code"));
      const cnCode = normaliseCnCode(cnRaw);
      if (!cnCode) {
        reject(`No CN code on this row.`);
        return;
      }
      const total = parseNumeric(cell(row, quantityCol));
      if (total === null || total <= 0) {
        reject(`Production quantity "${cell(row, quantityCol)}" is not a usable number.`);
        return;
      }
      const unit = unitFor(ctx, row, "quantity");
      if (!unit) {
        reject(`No unit found for the production quantity. Refusing to assume tonnes.`);
        return;
      }
      appliedUnits[dataset.fileName] = unit.unit;

      const eu = parseNumeric(cell(row, columnFor(mapping, "quantity_eu"))) ?? 0;
      const internal = parseNumeric(cell(row, columnFor(mapping, "quantity_internal"))) ?? 0;
      const domestic = parseNumeric(cell(row, columnFor(mapping, "quantity_domestic"))) ?? 0;

      let convert: (v: number) => number;
      try {
        normaliseQuantity(total, unit.unit, "mass");
        convert = (v: number) => normaliseQuantity(v, unit.unit, "mass").value;
      } catch (e) {
        reject((e as Error).message);
        return;
      }
      // Weighbridge and despatch records are measured quantities.
      const productionBase = {
        ...base,
        provenance: "measured" as Provenance,
        tier: 3 as MethodTier,
      };

      // One production row can carry several destinations. Each becomes its own
      // record so the audit trail keeps them distinguishable.
      const parts: [number, "eu_export" | "domestic" | "internal_transfer"][] = [
        [eu, "eu_export"],
        [domestic, "domestic"],
        [internal, "internal_transfer"],
      ];
      const split = parts.reduce((s, [v]) => s + v, 0);

      if (split > 0) {
        for (const [index, [value, destination]] of parts.entries()) {
          if (value <= 0) continue;
          activities.push({
            ...productionBase,
            id: recordId(dataset.datasetId, rowNumber, "production", index),
            kind: "production",
            cnCode,
            quantityT: convert(value),
            destination,
          });
        }
        // Any production not accounted for by a destination column is still
        // production and must appear in the SEE denominator. The tolerance is
        // relative, not absolute: destination columns are rounded to 2dp in the
        // source, so on a 24,000 t row they routinely miss the total by a few
        // hundredths, and an absolute threshold turns that rounding dust into a
        // 0.01 t "record" that then trips the outlier detector.
        const unallocated = total - split;
        if (unallocated > Math.max(0.5, total * 0.001)) {
          activities.push({
            ...productionBase,
            id: recordId(dataset.datasetId, rowNumber, "production", 3),
            kind: "production",
            cnCode,
            quantityT: convert(unallocated),
            destination: "domestic",
          });
        }
      } else {
        activities.push({
          ...productionBase,
          id: recordId(dataset.datasetId, rowNumber, "production", 0),
          kind: "production",
          cnCode,
          quantityT: convert(total),
          destination: "domestic",
        });
      }
      return;
    }

    // ------------------------------------------------------------- precursor
    if (mapping.kind === "precursor") {
      const cnCode = normaliseCnCode(cell(row, columnFor(mapping, "cn_code")));
      const quantity = parseNumeric(cell(row, quantityCol));
      if (!cnCode || quantity === null || quantity <= 0) {
        reject(`Precursor row needs a CN code and a positive quantity.`);
        return;
      }
      const goods = lookupGoods(cnCode);
      if (!goods) {
        if (cnCode.length < 8) {
          reject(
            `CN code ${cnCode} is not specific enough; precursors are identified by 8-digit CN code.`,
          );
          return;
        }
        // Read correctly, but not a CBAM good: it carries no embedded
        // emissions in CBAM. Recorded so the operator can see it was seen.
        skipped.push({
          fileName: dataset.fileName,
          row: rowNumber,
          cnCode,
          description: cell(row, materialCol),
          reason: `CN ${cnCode} is not listed in Annex I, so it carries no embedded emissions.`,
        });
        return;
      }
      const unit = unitFor(ctx, row, "quantity");
      if (!unit) {
        reject(`No unit found for the precursor quantity. Refusing to assume tonnes.`);
        return;
      }
      let quantityT: number;
      try {
        quantityT = normaliseQuantity(quantity, unit.unit, "mass").value;
      } catch (e) {
        reject((e as Error).message);
        return;
      }

      const seeDirect = parseNumeric(cell(row, columnFor(mapping, "see_direct")));
      const seeIndirect = parseNumeric(cell(row, columnFor(mapping, "see_indirect")));
      const sefa = parseNumeric(cell(row, columnFor(mapping, "see_sefa")));
      const verified = truthy(cell(row, columnFor(mapping, "verified"))) ?? false;
      const originRaw = cell(row, columnFor(mapping, "origin_country"));
      const originCountry =
        countryCode(originRaw) ?? countryCode(mapping.defaults?.originCountry) ?? undefined;
      if (originRaw && !countryCode(originRaw)) {
        reject(
          `Country of production "${originRaw}" is not recognised. Use an ISO code (e.g. IN) or ` +
            `the country's name as the Commission lists it.`,
        );
        return;
      }

      // Supplier actual values are stored as communicated. Where there are
      // none, nothing is stored: the engine applies the Commission default for
      // the production year, so no figure here is invented.
      const hasSupplierData = seeDirect !== null;

      activities.push({
        ...base,
        id: recordId(dataset.datasetId, rowNumber, "precursor"),
        kind: "precursor",
        cnCode: goods.cnCode,
        quantityT,
        supplierName: cell(row, columnFor(mapping, "supplier")) || undefined,
        originCountry,
        supplier: hasSupplierData
          ? {
              seeDirect,
              seeIndirect: seeIndirect ?? 0,
              sefa: sefa ?? undefined,
              verified,
            }
          : undefined,
        provenance: hasSupplierData ? "supplier" : "default",
        tier: hasSupplierData ? (verified ? 3 : 2) : 1,
      });
      return;
    }

    // ----------------------------------------------------------- electricity
    if (mapping.kind === "electricity") {
      const quantity = parseNumeric(cell(row, quantityCol));
      if (quantity === null || quantity <= 0) {
        reject(`Electricity quantity "${cell(row, quantityCol)}" is not a usable number.`);
        return;
      }
      const unit = unitFor(ctx, row, "quantity");
      if (!unit) {
        reject(
          `No unit found for the electricity quantity. Refusing to assume MWh - if this is MU, ` +
            `assuming MWh would understate power by a factor of 1,000.`,
        );
        return;
      }
      appliedUnits[dataset.fileName] = unit.unit;

      const supplyValue = cell(row, columnFor(mapping, "supply_source"));
      const factorId = resolveValue(mapping, "supply", supplyValue) ?? "grid_in_national";
      const supply: "grid" | "captive" | "ppa" | "onsite_renewable" =
        factorId === "ppa_solar" ? "ppa" : factorId === "captive_coal_power" ? "captive" : "grid";

      let quantityMWh: number;
      try {
        quantityMWh = normaliseQuantity(quantity, unit.unit, "electricity").value;
      } catch (e) {
        reject((e as Error).message);
        return;
      }

      activities.push({
        ...base,
        id: recordId(dataset.datasetId, rowNumber, "electricity"),
        kind: "electricity",
        quantityMWh,
        supply,
        factorId,
        provenance: "measured",
        tier: tryGetFactor(factorId)?.tier ?? 1,
      });
      return;
    }

    // -------------------------------------------------- fuel / process material
    const materialValue = cell(row, materialCol);
    const factorId = resolveValue(mapping, "factor", materialValue);
    if (!factorId) {
      reject(`"${materialValue || "(empty)"}" does not resolve to an emission factor.`);
      return;
    }
    const quantity = parseNumeric(cell(row, quantityCol));
    if (quantity === null || quantity <= 0) {
      reject(`Quantity "${cell(row, quantityCol)}" is not a usable number.`);
      return;
    }
    const unit = unitFor(ctx, row, "quantity");
    if (!unit) {
      reject(`No unit found for "${materialValue}". Refusing to assume one.`);
      return;
    }
    appliedUnits[dataset.fileName] = unit.unit;

    if (mapping.kind === "process_material") {
      let quantityT: number;
      try {
        quantityT = normaliseQuantity(quantity, unit.unit, "mass").value;
      } catch (e) {
        reject((e as Error).message);
        return;
      }
      activities.push({
        ...base,
        id: recordId(dataset.datasetId, rowNumber, "process_material"),
        kind: "process_material",
        factorId,
        quantityT,
        tier: tryGetFactor(factorId)?.tier ?? 1,
      });
      return;
    }

    // fuel
    let normalised: { value: number; unit: string };
    try {
      normalised = normaliseQuantity(quantity, unit.unit);
    } catch (e) {
      reject((e as Error).message);
      return;
    }
    if (normalised.unit !== "t" && normalised.unit !== "m3" && normalised.unit !== "TJ") {
      reject(`Fuel quantity resolved to ${normalised.unit}, which is not a fuel dimension.`);
      return;
    }

    activities.push({
      ...base,
      id: recordId(dataset.datasetId, rowNumber, "fuel"),
      kind: "fuel",
      factorId,
      quantity: normalised.value,
      unit: normalised.unit,
      tier: tryGetFactor(factorId)?.tier ?? 1,
    });
  });

  return { activities, rejected, skipped, appliedUnits };
}
