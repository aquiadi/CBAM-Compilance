import { benchmarkEntry, benchmarkedCnCodes, type Sector } from "./regulatory";
import type { AggregatedGoodsCategoryId, GoodsDefinition } from "./types";

/**
 * CBAM goods catalogue, keyed by 8-digit CN code.
 *
 * Built from the Commission's CBAM benchmark table (Implementing Regulation
 * (EU) 2025/2620), which lists every Annex I good except electricity at CN
 * level. Scope therefore follows the published list exactly rather than a
 * hand-maintained subset: ferro-silicon (7202 21), for example, is not in
 * Annex I and is not a CBAM good, however much it looks like one.
 *
 * The `directOnly` flag reflects Annex II: for iron & steel, aluminium and
 * hydrogen only direct emissions are taken into account in the definitive
 * period. Cement and fertilisers count direct and indirect emissions.
 */

const DIRECT_ONLY: Record<Sector, boolean> = {
  iron_steel: true,
  aluminium: true,
  hydrogen: true,
  cement: false,
  fertilisers: false,
  electricity: false,
};

/**
 * Aggregated goods category by CN prefix, most specific first. The categories
 * follow Annex II to the methodology act and drive plausibility bands and the
 * expected-precursor check - never a calculation.
 */
const CATEGORY_BY_PREFIX: [prefix: string, category: AggregatedGoodsCategoryId][] = [
  ["25070080", "cement_clinker"],
  ["252310", "cement_clinker"],
  ["252330", "aluminous_cement"],
  ["2523", "cement"],
  ["2808", "nitric_acid"],
  ["2814", "ammonia"],
  ["310210", "urea"],
  ["3102", "mixed_fertilisers"],
  ["3105", "mixed_fertilisers"],
  ["2834", "mixed_fertilisers"],
  ["2804", "hydrogen"],
  ["2601", "sintered_ore"],
  ["7201", "pig_iron"],
  ["7205", "pig_iron"],
  ["7202", "ferro_alloys"],
  ["7203", "dri"],
  ["7206", "crude_steel"],
  ["7207", "crude_steel"],
  ["721810", "crude_steel"],
  ["721891", "crude_steel"],
  ["721899", "crude_steel"],
  ["722410", "crude_steel"],
  ["722490", "crude_steel"],
  ["72", "iron_or_steel_products"],
  ["73", "iron_or_steel_products"],
  ["7601", "unwrought_aluminium"],
  ["76", "aluminium_products"],
  ["2716", "electricity"],
];

export function categoryFor(cnCode: string): AggregatedGoodsCategoryId | undefined {
  return CATEGORY_BY_PREFIX.find(([prefix]) => cnCode.startsWith(prefix))?.[1];
}

function sentence(description: string): string {
  const trimmed = description.trim();
  return trimmed.length > 160 ? `${trimmed.slice(0, 157)}...` : trimmed;
}

export const GOODS: GoodsDefinition[] = [
  ...benchmarkedCnCodes().flatMap((cnCode) => {
    const entry = benchmarkEntry(cnCode);
    const category = categoryFor(cnCode);
    if (!entry || !category) return [];
    return [
      {
        cnCode,
        description: sentence(entry.d),
        category,
        sector: entry.s,
        directOnly: DIRECT_ONLY[entry.s],
      },
    ];
  }),
  {
    cnCode: "27160000",
    description: "Electrical energy",
    category: "electricity",
    sector: "electricity",
    directOnly: false,
  },
];

const BY_CN = new Map(GOODS.map((g) => [g.cnCode, g]));

/** Normalise a CN code as typed by a human: "7207 11 14", "7207.11.14", "72071114". */
export function normaliseCnCode(input: string): string {
  return input.replace(/\D/g, "");
}

/**
 * Look up an 8-digit CN code (a 10-digit TARIC code resolves through its first
 * eight digits). Shorter codes do not resolve: a 4- or 6-digit heading can span
 * goods inside and outside scope, and guessing the subheading would put a
 * wrong code on a declaration.
 */
export function lookupGoods(cnCode: string): GoodsDefinition | undefined {
  const digits = normaliseCnCode(cnCode);
  if (digits.length < 8) return undefined;
  return BY_CN.get(digits.slice(0, 8));
}

/** True when the CN code falls inside CBAM scope at all. */
export function isCbamGood(cnCode: string): boolean {
  return lookupGoods(cnCode) !== undefined;
}

/** CN codes under a 4- or 6-digit heading, for suggesting a correction. */
export function goodsUnderHeading(prefix: string): GoodsDefinition[] {
  const digits = normaliseCnCode(prefix);
  if (digits.length < 4) return [];
  return GOODS.filter((g) => g.cnCode.startsWith(digits));
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

export const SECTOR_LABELS: Record<Sector, string> = {
  cement: "Cement",
  fertilisers: "Fertilisers",
  iron_steel: "Iron and steel",
  aluminium: "Aluminium",
  hydrogen: "Hydrogen",
  electricity: "Electricity",
};

/**
 * Typical precursor relationships, used to check that a declared production
 * route is internally coherent (an EAF with no scrap and no DRI is suspicious).
 */
export const TYPICAL_PRECURSORS: Partial<
  Record<AggregatedGoodsCategoryId, AggregatedGoodsCategoryId[]>
> = {
  crude_steel: ["pig_iron", "dri", "ferro_alloys"],
  iron_or_steel_products: ["crude_steel"],
  pig_iron: ["sintered_ore"],
  cement: ["cement_clinker"],
  urea: ["ammonia"],
  mixed_fertilisers: ["ammonia", "nitric_acid"],
  aluminium_products: ["unwrought_aluminium"],
};
