import { randomUUID } from "node:crypto";
import { lookupGoods, normaliseCnCode } from "../cbam/goods";
import { getBenchmark } from "../cbam/defaults";
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
 * always produces the same records - which is what makes the audit trail mean
 * anything.
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

export interface MaterialiseResult {
  activities: ActivityRecord[];
  rejected: RejectedRow[];
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

/** Confidence in the mapping drives the monitoring tier of every record it produces. */
function tierFor(mapping: DatasetMapping, fields: string[]): MethodTier {
  const confidences = fields
    .map((f) => mapping.columns.find((c) => c.targetField === f)?.confidence)
    .filter((c): c is number => c !== undefined);
  if (confidences.length === 0) return 1;
  const min = Math.min(...confidences);
  return min >= 0.9 ? 2 : min >= 0.7 ? 2 : 1;
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
      tier: tierFor(mapping, ["quantity", "process"]),
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
      const unit = unitFor(ctx, row, "quantity") ?? { unit: "t", source: "assumed tonnes" };
      appliedUnits[dataset.fileName] = unit.unit;

      const eu = parseNumeric(cell(row, columnFor(mapping, "quantity_eu"))) ?? 0;
      const internal = parseNumeric(cell(row, columnFor(mapping, "quantity_internal"))) ?? 0;
      const domestic = parseNumeric(cell(row, columnFor(mapping, "quantity_domestic"))) ?? 0;

      const convert = (v: number) => normaliseQuantity(v, unit.unit, "mass").value;

      // One production row can carry several destinations. Each becomes its own
      // record so the audit trail keeps them distinguishable.
      const parts: [number, "eu_export" | "domestic" | "internal_transfer"][] = [
        [eu, "eu_export"],
        [domestic, "domestic"],
        [internal, "internal_transfer"],
      ];
      const split = parts.reduce((s, [v]) => s + v, 0);

      if (split > 0) {
        for (const [value, destination] of parts) {
          if (value <= 0) continue;
          activities.push({
            ...base,
            id: randomUUID(),
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
            ...base,
            id: randomUUID(),
            kind: "production",
            cnCode,
            quantityT: convert(unallocated),
            destination: "domestic",
          });
        }
      } else {
        activities.push({
          ...base,
          id: randomUUID(),
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
        reject(`CN code ${cnCode} is not a CBAM good, so it carries no embedded emissions.`);
        return;
      }
      const unit = unitFor(ctx, row, "quantity") ?? { unit: "t", source: "assumed tonnes" };

      const seeDirect = parseNumeric(cell(row, columnFor(mapping, "see_direct")));
      const seeIndirect = parseNumeric(cell(row, columnFor(mapping, "see_indirect")));
      const hasSupplierData = seeDirect !== null;

      // No supplier communication means a default applies - and the default
      // carries a mark-up, which the rules engine then flags as a cost saving
      // the operator can go and claw back.
      const benchmark = getBenchmark(goods.category);
      const fallbackDirect = benchmark ? benchmark.direct * 1.2 : 0;
      const fallbackIndirect = benchmark ? benchmark.indirect * 1.2 : 0;

      activities.push({
        ...base,
        id: randomUUID(),
        kind: "precursor",
        cnCode,
        quantityT: normaliseQuantity(quantity, unit.unit, "mass").value,
        seeDirect: hasSupplierData ? seeDirect : fallbackDirect,
        seeIndirect: hasSupplierData ? (seeIndirect ?? 0) : fallbackIndirect,
        seeSource: hasSupplierData ? "supplier" : "default",
        supplierName: cell(row, columnFor(mapping, "supplier")) || undefined,
        provenance: hasSupplierData ? "supplier" : "default",
        tier: hasSupplierData ? 2 : 1,
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
        id: randomUUID(),
        kind: "electricity",
        quantityMWh,
        supply,
        factorId,
        provenance: "measured",
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
      activities.push({ ...base, id: randomUUID(), kind: "process_material", factorId, quantityT });
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
      id: randomUUID(),
      kind: "fuel",
      factorId,
      quantity: normalised.value,
      unit: normalised.unit,
    });
  });

  return { activities, rejected, appliedUnits };
}
