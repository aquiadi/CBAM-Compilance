/**
 * Canonical domain model for CBAM reporting.
 *
 * Every quantity that reaches this module has already been normalised to an SI
 * base unit by `units.ts`, and carries a `Lineage` pointer back to the exact
 * cell of the exact uploaded file it came from. Nothing in the engine is
 * allowed to invent a number: if a value is missing, it becomes a `Finding`,
 * not a guess.
 */

/** Where a value came from. This is what makes a declaration auditable. */
export interface Lineage {
  /** Id of the uploaded dataset. */
  datasetId: string;
  /** Original filename as uploaded, e.g. "furnace_log_Q3.csv". */
  fileName: string;
  /** 1-based row number in the source file, excluding the header. */
  row: number;
  /** The raw, pre-normalisation cell values that produced this record. */
  raw: Record<string, string>;
}

/** How a number came to exist. Surfaced in the UI on every figure. */
export type Provenance =
  /** Measured or metered at the installation. */
  | "measured"
  /** Calculated from primary activity data and a published factor. */
  | "calculated"
  /** Supplier-provided (e.g. a precursor's embedded emissions). */
  | "supplier"
  /** A published default value stood in for missing primary data. */
  | "default"
  /** Estimated by the operator; weakest tier, always raises a finding. */
  | "estimated";

/**
 * MRV method tier, mirroring the Implementing Regulation's hierarchy.
 * Higher tiers survive verification with less challenge.
 */
export type MethodTier = 1 | 2 | 3;

export type AggregatedGoodsCategoryId =
  | "cement_clinker"
  | "cement"
  | "aluminous_cement"
  | "nitric_acid"
  | "ammonia"
  | "urea"
  | "mixed_fertilisers"
  | "sintered_ore"
  | "pig_iron"
  | "ferro_alloys"
  | "dri"
  | "crude_steel"
  | "iron_or_steel_products"
  | "unwrought_aluminium"
  | "aluminium_products"
  | "hydrogen"
  | "electricity";

/** A CBAM good, keyed by CN code. */
export interface GoodsDefinition {
  /** Combined Nomenclature code, digits only, e.g. "72071100". */
  cnCode: string;
  description: string;
  category: AggregatedGoodsCategoryId;
  /** Sector as used in Annex I of Regulation (EU) 2023/956. */
  sector: "cement" | "iron_steel" | "aluminium" | "fertilisers" | "hydrogen" | "electricity";
  /**
   * True when Annex II restricts the certificate obligation to direct
   * emissions only (iron & steel, aluminium, hydrogen). Indirect emissions are
   * still *reported* for these goods, they just do not create an obligation.
   */
  directOnly: boolean;
}

/** An emission factor with the provenance a verifier will ask for. */
export interface EmissionFactor {
  id: string;
  name: string;
  /** What the factor multiplies. */
  basis: "energy" | "mass" | "volume" | "electricity";
  /** tCO2e per TJ (energy), per tonne (mass), per m3 (volume), per MWh (electricity). */
  value: number;
  unit: "tCO2e/TJ" | "tCO2e/t" | "tCO2e/m3" | "tCO2e/MWh";
  /** Net calorific value in GJ/t, for mass-based fuels burned for energy. */
  ncvGJPerTonne?: number;
  /** Density in t/m3, for fuels metered by volume. */
  densityTPerM3?: number;
  /** Fraction of carbon oxidised. 1.0 unless the operator measures otherwise. */
  oxidationFactor?: number;
  source: string;
  sourceRef: string;
  /** Year or edition the value is drawn from. */
  vintage: string;
  /** Relative uncertainty, as a fraction (0.05 = +/- 5%). */
  uncertainty: number;
  notes?: string;
}

export type ActivityKind =
  | "fuel"
  | "electricity"
  | "process_material"
  | "heat"
  | "production"
  | "precursor"
  | "carbon_price";

interface ActivityBase {
  id: string;
  kind: ActivityKind;
  /** Id of the production process this record is attributed to. */
  processId: string;
  /** ISO date, inclusive. */
  periodStart: string;
  /** ISO date, inclusive. */
  periodEnd: string;
  provenance: Provenance;
  tier: MethodTier;
  lineage: Lineage;
  /** Set by the rules engine when an operator has reviewed and accepted a flag. */
  reviewed?: boolean;
}

/** A fuel combusted on site. Quantity is normalised to tonnes or m3. */
export interface FuelActivity extends ActivityBase {
  kind: "fuel";
  factorId: string;
  quantity: number;
  /** Unit the normalised quantity is in. */
  unit: "t" | "m3" | "TJ";
  /** Operator-measured NCV overriding the factor library default, in GJ/t. */
  ncvGJPerTonne?: number;
}

export interface ElectricityActivity extends ActivityBase {
  kind: "electricity";
  /** Always MWh after normalisation. */
  quantityMWh: number;
  supply: "grid" | "captive" | "ppa" | "onsite_renewable";
  /** Factor id; a PPA with a verified contract may use a supplier-specific factor. */
  factorId: string;
}

/** Carbonate inputs, reducing agents and electrodes: emissions from the process itself. */
export interface ProcessMaterialActivity extends ActivityBase {
  kind: "process_material";
  factorId: string;
  quantityT: number;
}

/** Measurable heat crossing the installation boundary. */
export interface HeatActivity extends ActivityBase {
  kind: "heat";
  direction: "imported" | "exported";
  quantityTJ: number;
  factorId: string;
}

/** Goods produced. The denominator of every specific embedded emissions figure. */
export interface ProductionActivity extends ActivityBase {
  kind: "production";
  cnCode: string;
  quantityT: number;
  /**
   * Where the goods went. Specific embedded emissions are calculated over all
   * production, but only the EU-bound share creates a CBAM obligation - and
   * `internal_transfer` output must never be charged, because its emissions are
   * already carried into the downstream process as a precursor.
   */
  destination?: "eu_export" | "domestic" | "other_export" | "internal_transfer";
}

/** A CBAM precursor consumed, carrying its own embedded emissions. */
export interface PrecursorActivity extends ActivityBase {
  kind: "precursor";
  cnCode: string;
  quantityT: number;
  /** Specific embedded emissions of the precursor, tCO2e/t. */
  seeDirect: number;
  seeIndirect: number;
  /** Where the precursor's SEE came from. "default" triggers a markup warning. */
  seeSource: "supplier" | "default" | "own_installation";
  supplierName?: string;
}

/** A carbon price already paid in the country of origin, deductible under Art. 9. */
export interface CarbonPriceActivity extends ActivityBase {
  kind: "carbon_price";
  /** Scheme name, e.g. "CCTS compliance obligation". */
  scheme: string;
  /** Amount paid, in the original currency. */
  amount: number;
  currency: "INR" | "EUR" | "USD";
  /** Tonnes of CO2e the payment covers. */
  tonnesCovered: number;
  /** Whether documentary evidence has been attached. Without it, no deduction. */
  evidenceAttached: boolean;
}

export type ActivityRecord =
  | FuelActivity
  | ElectricityActivity
  | ProcessMaterialActivity
  | HeatActivity
  | ProductionActivity
  | PrecursorActivity
  | CarbonPriceActivity;

/** A production process within an installation, per Annex II of the IR. */
export interface ProductionProcess {
  id: string;
  name: string;
  category: AggregatedGoodsCategoryId;
  /** Production route, e.g. "BF-BOF", "DRI-EAF", "EAF (scrap)". */
  route?: string;
  /**
   * Cost-centre and section names from the plant's own systems that belong to
   * this process. Configured once per installation; it is what lets a mapper
   * resolve "Material Handling" without guessing.
   */
  aliases?: string[];
}

/**
 * An on-site precursor flow: goods made by one process and consumed by another
 * inside the same installation. Annex IV treats these exactly like a bought-in
 * precursor, except the specific embedded emissions are the ones you calculated
 * upstream rather than a supplier's. Without these links an integrated plant's
 * downstream products look impossibly clean, because the rolling mill only
 * burns reheating fuel - all the real emissions are upstream in the melt shop.
 */
export interface PrecursorLink {
  fromProcessId: string;
  toProcessId: string;
  /** CN code of the intermediate good moving between them. */
  cnCode: string;
}

export interface Installation {
  id: string;
  name: string;
  operator: string;
  street: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
  /** UN/LOCODE of the nearest port, required on the CBAM declaration. */
  unlocode?: string;
  contactName: string;
  contactEmail: string;
  processes: ProductionProcess[];
  /** On-site precursor flows between processes. */
  precursorLinks?: PrecursorLink[];
}

export interface ReportingPeriod {
  /** Calendar year the declaration covers. */
  year: number;
  start: string;
  end: string;
  /** "transitional" = reporting only; "definitive" = certificates due. */
  regime: "transitional" | "definitive";
}

/** A single line of a declaration: one CN code, one route, one destination. */
export interface DeclarationLine {
  cnCode: string;
  description: string;
  category: AggregatedGoodsCategoryId;
  sector: GoodsDefinition["sector"];
  directOnly: boolean;
  processId: string;
  processName: string;
  route?: string;
  /** Tonnes of the good produced in the period. The SEE denominator. */
  quantityT: number;
  /** Of which shipped to the EU. Only this share creates an obligation. */
  quantityEuT: number;
  /** Of which consumed on site as a precursor to a downstream process. */
  quantityInternalT: number;
  /** tCO2e/t attributable to the process itself, precursors excluded. */
  seeDirectOwn: number;
  seeIndirectOwn: number;
  /** tCO2e/t inherited from CBAM precursors. */
  seeDirectPrecursor: number;
  seeIndirectPrecursor: number;
  /** Totals. */
  seeDirect: number;
  seeIndirect: number;
  seeTotal: number;
  /** The figure that creates a certificate obligation under Annex II. */
  seeForObligation: number;
  /** Total embedded emissions of all production on this line, tCO2e. */
  embeddedTotalT: number;
  embeddedForObligationT: number;
  /** Embedded emissions of the EU-bound share only - what actually gets charged. */
  embeddedEuT: number;
  /** EU default value for comparison, where one is published. */
  defaultSee?: number;
  /** Fractional delta vs the default; negative means the plant beats the default. */
  vsDefault?: number;
  /** Aggregate uncertainty of the line, as a fraction. */
  uncertainty: number;
  /** Weakest tier among the inputs that fed this line. */
  lowestTier: MethodTier;
}
