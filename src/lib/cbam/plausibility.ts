import type { AggregatedGoodsCategoryId } from "./types";

/**
 * Indicative plausibility bands for specific embedded emissions.
 *
 * These are NOT regulatory values. The Commission's default values and CBAM
 * benchmarks live in ./regulatory and are the only figures that reach a
 * declaration or a cost. The bands below are assembled from public literature
 * (worldsteel and IAI route intensities, typical Indian kiln and smelter
 * configurations) and are used for exactly one purpose: to raise a finding when
 * a calculated intensity is far enough outside what the route can physically
 * produce that a unit error or a missing stream is the likelier explanation.
 */
export interface PlausibilityBand {
  category: AggregatedGoodsCategoryId;
  /** Typical direct and indirect intensity for the route, tCO2e per tonne. */
  direct: number;
  indirect: number;
  /** Plausible range for the direct component, used by rule CP-003. */
  plausibleDirect: [min: number, max: number];
  status: "indicative";
  basis: string;
}

export const PLAUSIBILITY_BANDS: PlausibilityBand[] = [
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

const BY_CATEGORY = new Map(PLAUSIBILITY_BANDS.map((b) => [b.category, b]));

export function getPlausibilityBand(
  category: AggregatedGoodsCategoryId,
): PlausibilityBand | undefined {
  return BY_CATEGORY.get(category);
}

/** Shown wherever a plausibility band is displayed. */
export const PLAUSIBILITY_NOTE =
  "Plausibility bands are indicative literature ranges used only to flag likely data errors. " +
  "They are not the Commission's default values or CBAM benchmarks and never enter a figure.";
