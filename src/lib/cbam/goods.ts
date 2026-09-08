import type { AggregatedGoodsCategoryId, GoodsDefinition } from "./types";

/**
 * CBAM goods catalogue, keyed by CN code.
 *
 * Scope is set by Annex I of Regulation (EU) 2023/956. The `directOnly` flag
 * reflects Annex II: for iron & steel, aluminium and hydrogen the certificate
 * obligation covers direct emissions only. Indirect emissions are still
 * reported for those goods - operators routinely assume "not counted" means
 * "not reported", and it does not.
 *
 * This is a working subset covering the CN codes an Indian exporter actually
 * ships in volume, not the complete Annex I list.
 */

type Row = [cn: string, description: string, category: AggregatedGoodsCategoryId];

function build(
  sector: GoodsDefinition["sector"],
  directOnly: boolean,
  rows: Row[],
): GoodsDefinition[] {
  return rows.map(([cnCode, description, category]) => ({
    cnCode,
    description,
    category,
    sector,
    directOnly,
  }));
}

export const GOODS: GoodsDefinition[] = [
  ...build("iron_steel", true, [
    ["72011000", "Non-alloy pig iron, <=0.5% phosphorus", "pig_iron"],
    ["72031000", "Ferrous products obtained by direct reduction of iron ore (DRI)", "dri"],
    ["72061000", "Iron and non-alloy steel ingots", "crude_steel"],
    ["72071100", "Semi-finished non-alloy steel, rectangular cross-section, <0.25% C", "crude_steel"],
    ["72071900", "Other semi-finished products of non-alloy steel", "crude_steel"],
    ["72081000", "Flat-rolled iron/non-alloy steel, hot-rolled, in coils, with patterns", "iron_or_steel_products"],
    ["72083900", "Flat-rolled hot-rolled coil, width >=600mm, thickness <3mm", "iron_or_steel_products"],
    ["72085100", "Flat-rolled hot-rolled plate, width >=600mm, thickness >10mm", "iron_or_steel_products"],
    ["72091700", "Flat-rolled cold-rolled coil, thickness 0.5-1mm", "iron_or_steel_products"],
    ["72104900", "Flat-rolled, plated or coated with zinc (galvanised)", "iron_or_steel_products"],
    ["72131000", "Hot-rolled bars and rods, with indentations (rebar)", "iron_or_steel_products"],
    ["72139100", "Other hot-rolled bars and rods, circular cross-section <14mm", "iron_or_steel_products"],
    ["72142000", "Bars and rods, with indentations from rolling", "iron_or_steel_products"],
    ["73043900", "Tubes and pipes, seamless, of iron or steel", "iron_or_steel_products"],
    ["73063000", "Welded tubes and pipes, circular cross-section, of iron/non-alloy steel", "iron_or_steel_products"],
    ["73084000", "Equipment for scaffolding, shuttering, propping", "iron_or_steel_products"],
    ["73089099", "Other structures and parts of structures, of iron or steel", "iron_or_steel_products"],
    ["73181500", "Threaded screws and bolts, of iron or steel", "iron_or_steel_products"],
    ["73269098", "Other articles of iron or steel", "iron_or_steel_products"],
    ["72022100", "Ferro-silicon, >55% silicon", "ferro_alloys"],
    ["26011200", "Agglomerated iron ores and concentrates (sinter)", "sintered_ore"],
  ]),
  ...build("aluminium", true, [
    ["76011000", "Unwrought aluminium, not alloyed", "unwrought_aluminium"],
    ["76012000", "Unwrought aluminium alloys", "unwrought_aluminium"],
    ["76041000", "Bars, rods and profiles of non-alloy aluminium", "aluminium_products"],
    ["76042900", "Bars, rods and profiles of aluminium alloys", "aluminium_products"],
    ["76061200", "Plates, sheets and strip of aluminium alloys, thickness >0.2mm", "aluminium_products"],
    ["76071110", "Aluminium foil, rolled but not further worked, thickness <0.021mm", "aluminium_products"],
    ["76109090", "Other aluminium structures and parts", "aluminium_products"],
    ["76169990", "Other articles of aluminium", "aluminium_products"],
  ]),
  ...build("cement", false, [
    ["25070080", "Calcined clay", "cement_clinker"],
    ["25231000", "Cement clinkers", "cement_clinker"],
    ["25232100", "White Portland cement", "cement"],
    ["25232900", "Other Portland cement", "cement"],
    ["25233000", "Aluminous cement", "aluminous_cement"],
    ["25239000", "Other hydraulic cements", "cement"],
  ]),
  ...build("fertilisers", false, [
    ["28080000", "Nitric acid; sulphonitric acids", "nitric_acid"],
    ["28141000", "Anhydrous ammonia", "ammonia"],
    ["28142000", "Ammonia in aqueous solution", "ammonia"],
    ["31021000", "Urea, whether or not in aqueous solution", "urea"],
    ["31023000", "Ammonium nitrate", "mixed_fertilisers"],
    ["31052000", "Mineral or chemical fertilisers containing N, P and K", "mixed_fertilisers"],
  ]),
  ...build("hydrogen", true, [["28041000", "Hydrogen", "hydrogen"]]),
  ...build("electricity", false, [["27160000", "Electrical energy", "electricity"]]),
];

const BY_CN = new Map(GOODS.map((g) => [g.cnCode, g]));

/** Normalise a CN code as typed by a human: "7207 11 00", "7207.11.00", "72071100". */
export function normaliseCnCode(input: string): string {
  return input.replace(/\D/g, "");
}

export function lookupGoods(cnCode: string): GoodsDefinition | undefined {
  const digits = normaliseCnCode(cnCode);
  const exact = BY_CN.get(digits);
  if (exact) return exact;
  // Fall back to the 6-digit HS subheading, then the 4-digit heading, so a
  // partially specified code still resolves to the right sector and scope.
  for (const length of [6, 4]) {
    if (digits.length < length) continue;
    const prefix = digits.slice(0, length);
    const match = GOODS.find((g) => g.cnCode.startsWith(prefix));
    if (match) return match;
  }
  return undefined;
}

/** True when the CN code falls inside CBAM scope at all. */
export function isCbamGood(cnCode: string): boolean {
  return lookupGoods(cnCode) !== undefined;
}

export const CATEGORY_LABELS: Record<AggregatedGoodsCategoryId, string> = {
  cement_clinker: "Cement clinker",
  cement: "Cement",
  aluminous_cement: "Aluminous cement",
  nitric_acid: "Nitric acid",
  ammonia: "Ammonia",
  urea: "Urea",
  mixed_fertilisers: "Mixed fertilisers",
  sintered_ore: "Sintered ore",
  pig_iron: "Pig iron",
  ferro_alloys: "Ferro-alloys",
  dri: "Direct reduced iron",
  crude_steel: "Crude steel",
  iron_or_steel_products: "Iron or steel products",
  unwrought_aluminium: "Unwrought aluminium",
  aluminium_products: "Aluminium products",
  hydrogen: "Hydrogen",
  electricity: "Electricity",
};

/**
 * Typical precursor relationships, used to check that a declared production
 * route is internally coherent (an EAF with no scrap and no DRI is suspicious).
 */
export const TYPICAL_PRECURSORS: Partial<Record<AggregatedGoodsCategoryId, AggregatedGoodsCategoryId[]>> = {
  crude_steel: ["pig_iron", "dri", "ferro_alloys"],
  iron_or_steel_products: ["crude_steel"],
  pig_iron: ["sintered_ore"],
  cement: ["cement_clinker"],
  urea: ["ammonia"],
  mixed_fertilisers: ["ammonia", "nitric_acid"],
  aluminium_products: ["unwrought_aluminium"],
};
