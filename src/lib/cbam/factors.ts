import type { EmissionFactor } from "./types";

/**
 * Emission factor library.
 *
 * Every entry carries its source, edition and uncertainty because a verifier
 * will ask for all three. Values here are the published defaults an Indian
 * operator would start from; where the operator has plant-specific measured
 * values (a lab NCV for their own coal, a metered grid factor from their DISCOM)
 * those override the library entry and raise the method tier for that stream.
 *
 * IPCC values are the 2006 Guidelines Vol. 2 Table 1.4 stationary combustion
 * defaults, still the reference set the CBAM Implementing Regulation points to
 * for fuels without operator-specific data.
 */

const IPCC = "IPCC 2006 Guidelines for National GHG Inventories, Vol. 2 Ch. 1";
const IPCC_REF = "Table 1.4 (default CO2 emission factors) / Table 1.2 (default NCV)";

export const FACTORS: EmissionFactor[] = [
  // ---------------------------------------------------------------- fuels
  {
    id: "coal_bituminous_in",
    name: "Non-coking coal (Indian, grade G8-G11)",
    basis: "energy",
    value: 94.6,
    unit: "tCO2e/TJ",
    ncvGJPerTonne: 18.0,
    oxidationFactor: 1,
    source: IPCC,
    sourceRef: IPCC_REF,
    vintage: "2006",
    uncertainty: 0.07,
    tier: 2,
    notes:
      "NCV lowered to 18.0 GJ/t to reflect the high ash content of Indian domestic coal; " +
      "IPCC's 25.8 GJ/t default assumes internationally traded bituminous coal and " +
      "overstates energy input by roughly 40% for domestic supply. Replace with the " +
      "plant's own ultimate/proximate analysis to reach tier 3.",
  },
  {
    id: "coal_coking",
    name: "Coking coal (imported)",
    basis: "energy",
    value: 94.6,
    unit: "tCO2e/TJ",
    ncvGJPerTonne: 28.2,
    oxidationFactor: 1,
    source: IPCC,
    sourceRef: IPCC_REF,
    vintage: "2006",
    uncertainty: 0.05,
    tier: 1,
  },
  {
    id: "coke_oven_coke",
    name: "Coke oven coke",
    basis: "energy",
    value: 107.0,
    unit: "tCO2e/TJ",
    ncvGJPerTonne: 28.2,
    oxidationFactor: 1,
    source: IPCC,
    sourceRef: IPCC_REF,
    vintage: "2006",
    uncertainty: 0.05,
    tier: 1,
  },
  {
    id: "natural_gas",
    name: "Natural gas",
    basis: "energy",
    value: 56.1,
    unit: "tCO2e/TJ",
    ncvGJPerTonne: 48.0,
    densityTPerM3: 0.000717,
    oxidationFactor: 1,
    source: IPCC,
    sourceRef: IPCC_REF,
    vintage: "2006",
    uncertainty: 0.04,
    tier: 1,
  },
  {
    id: "furnace_oil",
    name: "Furnace oil / residual fuel oil",
    basis: "energy",
    value: 77.4,
    unit: "tCO2e/TJ",
    ncvGJPerTonne: 40.4,
    densityTPerM3: 0.96,
    oxidationFactor: 1,
    source: IPCC,
    sourceRef: IPCC_REF,
    vintage: "2006",
    uncertainty: 0.05,
    tier: 1,
  },
  {
    id: "diesel",
    name: "Diesel / gas oil (HSD)",
    basis: "energy",
    value: 74.1,
    unit: "tCO2e/TJ",
    ncvGJPerTonne: 43.0,
    densityTPerM3: 0.84,
    oxidationFactor: 1,
    source: IPCC,
    sourceRef: IPCC_REF,
    vintage: "2006",
    uncertainty: 0.04,
    tier: 1,
  },
  {
    id: "lpg",
    name: "LPG",
    basis: "energy",
    value: 63.1,
    unit: "tCO2e/TJ",
    ncvGJPerTonne: 47.3,
    densityTPerM3: 0.54,
    oxidationFactor: 1,
    source: IPCC,
    sourceRef: IPCC_REF,
    vintage: "2006",
    uncertainty: 0.04,
    tier: 1,
  },
  {
    id: "petroleum_coke",
    name: "Petroleum coke",
    basis: "energy",
    value: 97.5,
    unit: "tCO2e/TJ",
    ncvGJPerTonne: 32.5,
    oxidationFactor: 1,
    source: IPCC,
    sourceRef: IPCC_REF,
    vintage: "2006",
    uncertainty: 0.06,
    tier: 1,
  },
  {
    id: "biomass_agri_residue",
    name: "Agricultural residue briquettes",
    basis: "energy",
    value: 0,
    unit: "tCO2e/TJ",
    ncvGJPerTonne: 14.5,
    oxidationFactor: 1,
    source: IPCC,
    sourceRef: "Vol. 2 Ch. 2, biomass CO2 reported as memo item",
    vintage: "2006",
    uncertainty: 0.15,
    tier: 1,
    notes:
      "Biogenic CO2 carries a zero factor for the CBAM direct-emissions total. " +
      "Sustainability criteria must be documented or the zero rating fails verification.",
  },

  // ------------------------------------------------------- process materials
  {
    id: "limestone",
    name: "Limestone (CaCO3) calcination",
    basis: "mass",
    value: 0.4397,
    unit: "tCO2e/t",
    source: IPCC,
    sourceRef: "Vol. 3 Ch. 2, stoichiometric ratio CO2/CaCO3",
    vintage: "2006",
    uncertainty: 0.03,
    tier: 1,
    notes:
      "Assumes complete calcination; apply the plant's measured calcination fraction if lower.",
  },
  {
    id: "dolomite",
    name: "Dolomite (CaMg(CO3)2) calcination",
    basis: "mass",
    value: 0.4773,
    unit: "tCO2e/t",
    source: IPCC,
    sourceRef: "Vol. 3 Ch. 2, stoichiometric ratio",
    vintage: "2006",
    uncertainty: 0.03,
    tier: 1,
  },
  {
    id: "graphite_electrode",
    name: "Graphite electrode consumption (EAF)",
    basis: "mass",
    value: 3.6,
    unit: "tCO2e/t",
    source: IPCC,
    sourceRef: "Vol. 3 Ch. 4, carbon content 99%, oxidised to CO2",
    vintage: "2006",
    uncertainty: 0.05,
    tier: 1,
  },
  {
    id: "carbon_anode_paste",
    name: "Carbon anode / Soderberg paste (aluminium)",
    basis: "mass",
    value: 3.4,
    unit: "tCO2e/t",
    source: IPCC,
    sourceRef: "Vol. 3 Ch. 4.4, prebake anode consumption",
    vintage: "2006",
    uncertainty: 0.06,
    tier: 1,
  },

  // ----------------------------------------------------------- electricity
  {
    id: "grid_in_national",
    name: "Indian national grid (average)",
    basis: "electricity",
    value: 0.716,
    unit: "tCO2e/MWh",
    source: "Central Electricity Authority, CO2 Baseline Database for the Indian Power Sector",
    sourceRef: "Weighted average emission rate, all-India",
    vintage: "v20 (2024)",
    uncertainty: 0.05,
    tier: 2,
    notes:
      "In the definitive period the default for grid electricity is the Commission's country " +
      "factor in Annex II to Implementing Regulation (EU) 2025/2621 (IEA-based, licensed data " +
      "not redistributed here). Enter it under Settings to replace this national value. For " +
      "iron & steel, aluminium and hydrogen indirect emissions do not create an obligation, so " +
      "the choice changes what is reported, not what is charged.",
  },
  {
    id: "grid_in_western",
    name: "Indian grid - Western region",
    basis: "electricity",
    value: 0.732,
    unit: "tCO2e/MWh",
    source: "Central Electricity Authority, CO2 Baseline Database",
    sourceRef: "Regional weighted average, Western grid",
    vintage: "v20 (2024)",
    uncertainty: 0.06,
    tier: 2,
  },
  {
    id: "captive_coal_power",
    name: "Captive coal-fired generation",
    basis: "electricity",
    value: 0.95,
    unit: "tCO2e/MWh",
    source: "Derived",
    sourceRef: "Subcritical CFBC unit at 32% net efficiency on Indian coal",
    vintage: "derived",
    uncertainty: 0.1,
    tier: 1,
    notes:
      "Placeholder pending the plant's own generation and fuel records. Where the captive unit " +
      "sits inside the installation boundary its fuel is already counted as a direct emission, " +
      "so applying this factor as well would double count.",
  },
  {
    id: "ppa_solar",
    name: "Solar PPA (contracted, unbundled)",
    basis: "electricity",
    value: 0,
    unit: "tCO2e/MWh",
    source: "Contractual instrument",
    sourceRef: "CBAM IR Annex III - PPA with a direct technical connection",
    vintage: "n/a",
    uncertainty: 0.0,
    tier: 3,
    notes:
      "A zero factor is only defensible for a direct-line PPA or where the CBAM rules on power " +
      "purchase agreements are met. An unbundled REC purchase does not qualify.",
  },

  // ------------------------------------------------------------------ heat
  {
    id: "heat_generic",
    name: "Measurable heat (net of generation losses)",
    basis: "energy",
    value: 66.7,
    unit: "tCO2e/TJ",
    source: "CBAM transitional-period default, Implementing Regulation (EU) 2023/1773",
    sourceRef: "Annex III, heat from natural gas at 90% efficiency",
    vintage: "2023",
    uncertainty: 0.08,
    tier: 1,
  },
];

const BY_ID = new Map(FACTORS.map((f) => [f.id, f]));

export function getFactor(id: string): EmissionFactor {
  const factor = BY_ID.get(id);
  if (!factor) throw new Error(`Unknown emission factor "${id}"`);
  return factor;
}

export function tryGetFactor(id: string): EmissionFactor | undefined {
  return BY_ID.get(id);
}

export function factorsByBasis(basis: EmissionFactor["basis"]): EmissionFactor[] {
  return FACTORS.filter((f) => f.basis === basis);
}
