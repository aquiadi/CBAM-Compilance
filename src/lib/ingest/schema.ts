import type { Dimension } from "../cbam/units";

/**
 * The canonical schema every uploaded file is mapped onto.
 *
 * This is the contract between the messy world and the engine. The language
 * model proposes a mapping onto these fields; it never invents a field, and
 * anything it cannot place is surfaced as unmapped rather than quietly dropped.
 */

export type DatasetKind = "fuel" | "electricity" | "process_material" | "production" | "precursor";

export interface CanonicalField {
  id: string;
  label: string;
  required: boolean;
  /** What the column holds, for validation after mapping. */
  type: "date" | "text" | "number" | "unit" | "cn_code" | "boolean";
  /** For numeric columns, the physical dimension expected. */
  dimension?: Dimension;
  description: string;
  /** Tokens that suggest this field. Drives the heuristic mapper and seeds the prompt. */
  aliases: string[];
}

const PERIOD: CanonicalField = {
  id: "period",
  label: "Period",
  required: true,
  type: "date",
  description: "The month or date the record covers.",
  aliases: ["month", "period", "date", "billing month", "mth", "for the month", "posting date"],
};

const PROCESS: CanonicalField = {
  id: "process",
  label: "Process / section",
  required: true,
  type: "text",
  description:
    "The plant section or cost centre the record belongs to. Used to attribute emissions to a production process.",
  aliases: [
    "section",
    "plant",
    "cost centre",
    "cost center",
    "department",
    "unit",
    "area",
    "shop",
    "division",
  ],
};

const QUANTITY: CanonicalField = {
  id: "quantity",
  label: "Quantity",
  required: true,
  type: "number",
  description: "The amount consumed, produced or received in the period.",
  aliases: [
    "qty",
    "quantity",
    "consumption",
    "consumed",
    "qty consumed",
    "volume",
    "weight",
    "receipt",
    "drawn",
  ],
};

const UNIT: CanonicalField = {
  id: "unit",
  label: "Unit of measure",
  required: false,
  type: "unit",
  description:
    "The unit the quantity is expressed in. If there is no unit column, the unit is taken from the quantity column header.",
  aliases: ["uom", "unit", "units", "u.o.m", "measure"],
};

const NOTES: CanonicalField = {
  id: "notes",
  label: "Notes",
  required: false,
  type: "text",
  description: "Free-text remarks. Retained in the audit trail; never used in a calculation.",
  aliases: ["remarks", "notes", "comment", "narration", "description of change"],
};

const MATERIAL: CanonicalField = {
  id: "material",
  label: "Material description",
  required: true,
  type: "text",
  description:
    "What was consumed, as written in the source system. Resolved to an emission factor in the value-mapping step.",
  aliases: [
    "material",
    "material desc",
    "item",
    "item description",
    "product",
    "description",
    "particulars",
    "fuel",
  ],
};

export const DATASET_SCHEMAS: Record<
  DatasetKind,
  { label: string; description: string; fields: CanonicalField[] }
> = {
  fuel: {
    label: "Fuel consumption",
    description:
      "Fuels combusted on site. Drives direct emissions via net calorific value and a combustion factor.",
    fields: [PERIOD, PROCESS, MATERIAL, QUANTITY, UNIT, NOTES],
  },
  electricity: {
    label: "Electricity",
    description:
      "Electricity consumed. Drives indirect emissions. Watch the unit: Indian bills are often in MU (million units), not MWh.",
    fields: [
      PERIOD,
      PROCESS,
      {
        id: "supply_source",
        label: "Supply source",
        required: false,
        type: "text",
        description:
          "Who supplied the power: state grid, captive generation, or a power purchase agreement. Determines the emission factor.",
        aliases: [
          "source",
          "supply",
          "supply source",
          "consumer",
          "connection",
          "feeder",
          "discom",
        ],
      },
      {
        ...QUANTITY,
        dimension: "electricity",
        aliases: [
          ...QUANTITY.aliases,
          "units drawn",
          "energy",
          "reading",
          "meter reading",
          "kwh",
          "mwh",
          "mu",
        ],
      },
      UNIT,
      NOTES,
    ],
  },
  process_material: {
    label: "Process materials",
    description:
      "Carbonates, reducing agents and electrodes whose chemistry releases CO2 independently of combustion.",
    fields: [PERIOD, PROCESS, MATERIAL, QUANTITY, UNIT, NOTES],
  },
  production: {
    label: "Production and despatch",
    description:
      "Goods produced, and where they went. Production is the denominator for specific embedded emissions; the EU-bound share is what creates a CBAM obligation.",
    fields: [
      PERIOD,
      PROCESS,
      { ...MATERIAL, label: "Product", required: false },
      {
        id: "cn_code",
        label: "CN / HS code",
        required: true,
        type: "cn_code",
        description:
          "Combined Nomenclature code of the goods. Determines whether they are in CBAM scope at all.",
        aliases: ["cn code", "hs code", "hsn", "tariff", "cn", "itc hs", "commodity code"],
      },
      {
        ...QUANTITY,
        label: "Production quantity",
        dimension: "mass",
        aliases: [...QUANTITY.aliases, "production", "output", "produced"],
      },
      {
        id: "quantity_eu",
        label: "Despatched to EU",
        required: false,
        type: "number",
        dimension: "mass",
        description:
          "Tonnes shipped to the European Union. Only this share creates a certificate obligation.",
        aliases: ["eu", "export to eu", "despatched to eu", "europe", "eu despatch", "export"],
      },
      {
        id: "quantity_domestic",
        label: "Domestic despatch",
        required: false,
        type: "number",
        dimension: "mass",
        description: "Tonnes sold in India or to non-EU markets. Reported, never charged.",
        aliases: ["domestic", "local", "india", "domestic despatch", "home market"],
      },
      {
        id: "quantity_internal",
        label: "Internal transfer",
        required: false,
        type: "number",
        dimension: "mass",
        description:
          "Tonnes consumed on site by a downstream process. Excluded from the obligation so its emissions are not counted twice.",
        aliases: [
          "internal",
          "captive consumption",
          "transfer",
          "internal transfer",
          "self consumption",
        ],
      },
      UNIT,
      NOTES,
    ],
  },
  precursor: {
    label: "Precursor receipts",
    description:
      "CBAM goods bought in and consumed. They carry their supplier's embedded emissions into your product.",
    fields: [
      PERIOD,
      { ...PROCESS, label: "Consuming process" },
      MATERIAL,
      {
        id: "cn_code",
        label: "CN code",
        required: true,
        type: "cn_code",
        description: "CN code of the precursor.",
        aliases: ["cn code", "hs code", "hsn", "tariff", "cn"],
      },
      {
        ...QUANTITY,
        dimension: "mass",
        aliases: [...QUANTITY.aliases, "qty received", "received", "purchase"],
      },
      {
        id: "supplier",
        label: "Supplier",
        required: false,
        type: "text",
        description: "Who supplied the precursor. Needed to chase a CBAM communication.",
        aliases: ["supplier", "vendor", "party", "source", "manufacturer"],
      },
      {
        id: "see_direct",
        label: "Supplier SEE (direct)",
        required: false,
        type: "number",
        description:
          "Direct specific embedded emissions declared by the supplier, tCO2e per tonne. Blank means a default is applied.",
        aliases: [
          "see direct",
          "specific embedded",
          "direct emissions",
          "supplier see",
          "embedded direct",
        ],
      },
      {
        id: "see_indirect",
        label: "Supplier SEE (indirect)",
        required: false,
        type: "number",
        description:
          "Indirect specific embedded emissions declared by the supplier, tCO2e per tonne.",
        aliases: ["see indirect", "indirect emissions", "embedded indirect"],
      },
      {
        id: "communication_received",
        label: "CBAM communication received",
        required: false,
        type: "boolean",
        description:
          "Whether the supplier has provided a CBAM communication. Without one, a default value with a mark-up applies.",
        aliases: ["cbam communication", "communication recd", "cbam data", "declaration received"],
      },
      UNIT,
      NOTES,
    ],
  },
};

export function fieldsFor(kind: DatasetKind): CanonicalField[] {
  return DATASET_SCHEMAS[kind].fields;
}

export function requiredFieldsFor(kind: DatasetKind): string[] {
  return DATASET_SCHEMAS[kind].fields.filter((f) => f.required).map((f) => f.id);
}

/** A single column's mapping decision. */
export interface ColumnMapping {
  sourceColumn: string;
  /** Canonical field id, or null when the column carries nothing the engine needs. */
  targetField: string | null;
  /** 0-1. Anything under 0.7 is surfaced for confirmation before it is used. */
  confidence: number;
  /** Unit token detected for a quantity column, e.g. "MU", "MT". */
  detectedUnit?: string | null;
  /** Why the mapper chose this. Shown in the UI and kept in the audit trail. */
  rationale: string;
}

/** A distinct source value resolved to an engine identifier. */
export interface ValueMapping {
  sourceValue: string;
  /** Factor id, process id, or supply type depending on `target`. */
  resolvedId: string | null;
  target: "factor" | "process" | "supply";
  confidence: number;
  rationale: string;
}

export interface DatasetMapping {
  datasetId: string;
  fileName: string;
  kind: DatasetKind;
  kindConfidence: number;
  columns: ColumnMapping[];
  values: ValueMapping[];
  /** Which engine produced this mapping. Surfaced on every screen. */
  producedBy: "model" | "heuristic";
  model?: string;
  /** Fields the schema requires that no column was mapped to. */
  missingRequired: string[];
  warnings: string[];
}
