import type { AggregatedGoodsCategoryId } from "./types";

/**
 * Benchmark values for specific embedded emissions, used for comparison only.
 *
 * IMPORTANT - read before relying on these numbers.
 *
 * The Commission publishes the authoritative default values that a declarant
 * may use where actual emissions cannot be adequately determined. Those
 * published values change between the transitional and definitive regimes, and
 * in the definitive regime they carry a mark-up designed to make defaults less
 * attractive than real data.
 *
 * The figures below are INDICATIVE sector benchmarks assembled from public
 * literature (worldsteel and IAI route intensities, EU ETS benchmark curves).
 * CarbonPass uses them for exactly one purpose: to tell an operator whether
 * their calculated figure is in a plausible band, and roughly how their plant
 * compares to a typical one. They are NOT a substitute for the Commission's
 * published defaults and the app never files a declaration using them.
 *
 * `status` is rendered next to every comparison in the UI so the distinction
 * survives contact with a user in a hurry.
 */
export interface BenchmarkValue {
  category: AggregatedGoodsCategoryId;
  /** tCO2e per tonne of goods. */
  direct: number;
  indirect: number;
  /** Plausible range for the direct component, used by the rules engine. */
  plausibleDirect: [min: number, max: number];
  status: "indicative";
  basis: string;
}

export const BENCHMARKS: BenchmarkValue[] = [
  {
    category: "sintered_ore",
    direct: 0.24,
    indirect: 0.03,
    plausibleDirect: [0.1, 0.5],
    status: "indicative",
    basis: "Sinter plant, coke breeze fired",
  },
  {
    category: "pig_iron",
    direct: 1.45,
    indirect: 0.05,
    plausibleDirect: [1.0, 2.2],
    status: "indicative",
    basis: "Blast furnace hot metal, excluding upstream coke and sinter",
  },
  {
    category: "dri",
    direct: 1.95,
    indirect: 0.09,
    plausibleDirect: [0.5, 2.9],
    status: "indicative",
    basis:
      "Coal-based rotary kiln DRI, the dominant Indian route, at roughly 1.1 t coal per t sponge " +
      "iron. Gas-based DRI sits near the bottom of the range at 0.6-1.0; the band spans both " +
      "because the route, not the country, decides the number.",
  },
  {
    category: "crude_steel",
    direct: 2.05,
    indirect: 0.18,
    plausibleDirect: [0.2, 3.2],
    status: "indicative",
    basis:
      "Integrated BF-BOF route, cradle-to-crude-steel. Scrap-fed EAF sits near the bottom " +
      "of the range at 0.2-0.5 tCO2e/t direct, which is why route matters more than country.",
  },
  {
    category: "iron_or_steel_products",
    direct: 2.2,
    indirect: 0.25,
    plausibleDirect: [0.3, 3.5],
    status: "indicative",
    basis: "Crude steel plus rolling and finishing",
  },
  {
    category: "ferro_alloys",
    direct: 2.4,
    indirect: 1.6,
    plausibleDirect: [1.2, 4.5],
    status: "indicative",
    basis: "Submerged arc furnace, highly electricity intensive",
  },
  {
    category: "cement_clinker",
    direct: 0.83,
    indirect: 0.06,
    plausibleDirect: [0.6, 1.0],
    status: "indicative",
    basis: "Dry process kiln with preheater/precalciner",
  },
  {
    category: "cement",
    direct: 0.59,
    indirect: 0.07,
    plausibleDirect: [0.3, 0.9],
    status: "indicative",
    basis: "Blended cement at a typical Indian clinker factor of ~0.70",
  },
  {
    category: "aluminous_cement",
    direct: 0.95,
    indirect: 0.08,
    plausibleDirect: [0.6, 1.4],
    status: "indicative",
    basis: "Calcium aluminate cement kiln",
  },
  {
    category: "unwrought_aluminium",
    direct: 1.65,
    indirect: 11.2,
    plausibleDirect: [1.2, 2.5],
    status: "indicative",
    basis:
      "Hall-Heroult smelting. Direct covers anode consumption and PFCs. The indirect figure " +
      "assumes coal-fired captive power at ~14 MWh/t; it does not create a certificate " +
      "obligation (Annex II) but dominates the true footprint.",
  },
  {
    category: "aluminium_products",
    direct: 1.8,
    indirect: 11.8,
    plausibleDirect: [1.3, 2.8],
    status: "indicative",
    basis: "Unwrought aluminium plus extrusion or rolling",
  },
  {
    category: "ammonia",
    direct: 1.9,
    indirect: 0.12,
    plausibleDirect: [1.5, 2.8],
    status: "indicative",
    basis: "Steam methane reforming",
  },
  {
    category: "urea",
    direct: 1.05,
    indirect: 0.1,
    plausibleDirect: [0.6, 1.8],
    status: "indicative",
    basis: "Net of CO2 chemically bound into the urea",
  },
  {
    category: "nitric_acid",
    direct: 0.35,
    indirect: 0.04,
    plausibleDirect: [0.1, 1.2],
    status: "indicative",
    basis: "Dominated by N2O; abatement efficiency drives the spread",
  },
  {
    category: "mixed_fertilisers",
    direct: 0.85,
    indirect: 0.12,
    plausibleDirect: [0.4, 1.6],
    status: "indicative",
    basis: "NPK blend, weighted by nitrogen content",
  },
  {
    category: "hydrogen",
    direct: 9.5,
    indirect: 0.4,
    plausibleDirect: [0.5, 12],
    status: "indicative",
    basis: "Grey hydrogen via SMR; electrolytic hydrogen sits far lower on direct",
  },
  {
    category: "electricity",
    direct: 0.72,
    indirect: 0,
    plausibleDirect: [0.0, 1.1],
    status: "indicative",
    basis: "All-India grid average",
  },
];

const BY_CATEGORY = new Map(BENCHMARKS.map((b) => [b.category, b]));

export function getBenchmark(category: AggregatedGoodsCategoryId): BenchmarkValue | undefined {
  return BY_CATEGORY.get(category);
}

/**
 * Shown verbatim in the UI and in every export. If this product ever files a
 * real declaration, this sentence is the thing standing between a user and a
 * penalty for a misdeclaration.
 */
export const BENCHMARK_DISCLAIMER =
  "Comparison values are indicative sector benchmarks, not the European Commission's published " +
  "default values. Use them to sanity-check a calculated figure, never as a substitute for " +
  "primary data in a filed declaration.";
