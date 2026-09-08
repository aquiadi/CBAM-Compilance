import type { DatasetKind } from "../../lib/ingest/schema";

/**
 * Gold mappings for the schema-mapping agent.
 *
 * Each case is a header shape that actually shows up in Indian plant exports.
 * The point is not to test whether a model can read English - it is to test the
 * cases where the obvious answer is wrong: a unit column that contradicts the
 * header, "MU" where a reader expects MWh, two columns that both look like a
 * quantity, an export where the tonnage columns are destinations rather than
 * separate materials.
 */

export interface MappingCase {
  id: string;
  /** Why this case exists. Printed in the eval report next to a failure. */
  intent: string;
  fileName: string;
  csv: string;
  expected: {
    kind: DatasetKind;
    /** Column header -> canonical field id, or null when it should be unmapped. */
    columns: Record<string, string | null>;
    /** Canonical unit the quantity column must resolve to. */
    quantityUnit?: string;
    /** Source value -> engine id. */
    values?: Record<string, string | null>;
  };
}

export const PROCESSES = [
  { id: "proc_dri", name: "DRI Kiln #1 & #2", route: "Coal-based rotary kiln", aliases: ["Material Handling"] },
  { id: "proc_eaf", name: "Melt Shop (IF/EAF)", route: "DRI-EAF with scrap", aliases: ["SMS"] },
  { id: "proc_rolling", name: "Rolling Mill", route: "Hot rolling, TMT", aliases: ["Bar Mill"] },
];

export const CASES: MappingCase[] = [
  {
    id: "power-bill-mu",
    intent:
      "The unit is MU (million units). Reading it as MWh understates electricity 1000x. Magnitude is the only clue in the values themselves.",
    fileName: "power_bill_register.csv",
    csv: `Billing Month,Consumer No.,Supply Source,Units Drawn (MU),Demand (KVA),Amount (Rs),Section
Jan-26,CSPDCL/HT/44127,CSPDCL Grid (HT),21.34,"28,500","16,90,00,000",Melt Shop (IF/EAF)
Feb-26,CSPDCL/HT/44127,CSPDCL Grid (HT),20.11,"28,500","15,98,00,000",Melt Shop (IF/EAF)
Mar-26,PPA/SOLAR/RG-22,Solar PPA (open access),1.42,-,"85,00,000",Melt Shop (IF/EAF)`,
    expected: {
      kind: "electricity",
      columns: {
        "Billing Month": "period",
        "Consumer No.": null,
        "Supply Source": "supply_source",
        "Units Drawn (MU)": "quantity",
        "Demand (KVA)": null,
        "Amount (Rs)": null,
        Section: "process",
      },
      quantityUnit: "MU",
      values: {
        "CSPDCL Grid (HT)": "grid_in_national",
        "Solar PPA (open access)": "ppa_solar",
        "Melt Shop (IF/EAF)": "proc_eaf",
      },
    },
  },
  {
    id: "fuel-separate-uom-column",
    intent:
      "The unit lives in its own column and differs per row: coal in MT, oil in KL. A header-only unit reader gets this wrong.",
    fileName: "fuel_consumption_register.csv",
    csv: `Month,Plant / Section,Material Desc.,GRN Ref,Qty Consumed,UOM,Rate (Rs/MT),Remarks
Jan-26,DRI Kiln #1 & #2,NON COKING COAL (G11),GRN/202601/0114,"19,240.80",MT,"4,850",
Jan-26,Rolling Mill,FURNACE OIL,GRN/202601/0231,608.18,KL,"42,500",
Feb-26,Material Handling,HSD (DIESEL),GRN/202602/0388,38.50,KL,"89,000",incl. DG set`,
    expected: {
      kind: "fuel",
      columns: {
        Month: "period",
        "Plant / Section": "process",
        "Material Desc.": "material",
        "GRN Ref": null,
        "Qty Consumed": "quantity",
        UOM: "unit",
        "Rate (Rs/MT)": null,
        Remarks: "notes",
      },
      values: {
        "NON COKING COAL (G11)": "coal_bituminous_in",
        "FURNACE OIL": "furnace_oil",
        "HSD (DIESEL)": "diesel",
        "DRI Kiln #1 & #2": "proc_dri",
        "Material Handling": "proc_dri",
      },
    },
  },
  {
    id: "production-destination-columns",
    intent:
      "Four numeric columns. Only one is the activity level; the others are destinations. Treating them all as production triples the denominator.",
    fileName: "production_despatch.csv",
    csv: `Month,Section,Product,HS / CN Code,Production (MT),Despatched to EU (MT),Domestic Despatch (MT),Internal Transfer (MT)
Jan-26,Melt Shop (IF/EAF),MS BILLETS 125x125,7207 11 00,"24,600.00","4,428.00","4,920.00","15,252.00"
Jan-26,Rolling Mill,TMT REBAR Fe500D,7213 10 00,"15,100.00","6,191.00","8,909.00",0`,
    expected: {
      kind: "production",
      columns: {
        Month: "period",
        Section: "process",
        Product: "material",
        "HS / CN Code": "cn_code",
        "Production (MT)": "quantity",
        "Despatched to EU (MT)": "quantity_eu",
        "Domestic Despatch (MT)": "quantity_domestic",
        "Internal Transfer (MT)": "quantity_internal",
      },
      quantityUnit: "MT",
    },
  },
  {
    id: "precursor-supplier-see",
    intent:
      "Supplier-declared embedded emissions, split direct and indirect, with a blank meaning 'no CBAM communication' rather than zero.",
    fileName: "precursor_receipts.csv",
    csv: `Month,Consuming Section,Material,CN Code,Qty Received (MT),Supplier,CBAM Communication Recd?,Supplier SEE Direct (tCO2e/t),Supplier SEE Indirect
Jan-26,Melt Shop (IF/EAF),SPONGE IRON (bought out),7203 10 00,"4,200.00",Jindal Sponge,Yes,1.038,0.071
Jan-26,Melt Shop (IF/EAF),SPONGE IRON (bought out),7203 10 00,"1,950.00",Maa Ambey Ispat,No,-,-`,
    expected: {
      kind: "precursor",
      columns: {
        Month: "period",
        "Consuming Section": "process",
        Material: "material",
        "CN Code": "cn_code",
        "Qty Received (MT)": "quantity",
        Supplier: "supplier",
        "CBAM Communication Recd?": "communication_received",
        "Supplier SEE Direct (tCO2e/t)": "see_direct",
        "Supplier SEE Indirect": "see_indirect",
      },
    },
  },
  {
    id: "process-material-vs-fuel",
    intent:
      "Limestone and dolomite are process materials, not fuels; graphite electrodes are neither obviously. Misfiling them as fuel needs an NCV that does not exist.",
    fileName: "process_materials.csv",
    csv: `Period,Cost Centre,Item Description,Consumption,Unit,Vendor Code,Batch
Jan-26,DRI Kiln #1 & #2,DOLOMITE (CALCINED),534.20,MT,V-10233,B2601
Jan-26,Melt Shop (IF/EAF),GRAPHITE ELECTRODE (UHP 400mm),62.40,MT,V-20871,B2601
Jan-26,Melt Shop (IF/EAF),LIME / LIMESTONE FLUX,781.00,MT,V-10233,B2601`,
    expected: {
      kind: "process_material",
      columns: {
        Period: "period",
        "Cost Centre": "process",
        "Item Description": "material",
        Consumption: "quantity",
        Unit: "unit",
        "Vendor Code": null,
        Batch: null,
      },
      values: {
        "DOLOMITE (CALCINED)": "dolomite",
        "GRAPHITE ELECTRODE (UHP 400mm)": "graphite_electrode",
        "LIME / LIMESTONE FLUX": "limestone",
      },
    },
  },
  {
    id: "terse-headers",
    intent:
      "Minimal headers with no units anywhere. The mapper must infer from values and flag low confidence rather than assert.",
    fileName: "consumption.csv",
    csv: `Mth,Sec,Item,Qty
Apr-26,SMS,Coal,18500
May-26,SMS,Coal,19200
Jun-26,Bar Mill,FO,600`,
    expected: {
      kind: "fuel",
      columns: { Mth: "period", Sec: "process", Item: "material", Qty: "quantity" },
      values: { Coal: "coal_bituminous_in", SMS: "proc_eaf", "Bar Mill": "proc_rolling" },
    },
  },
  {
    id: "trade-names",
    intent:
      "Indian plant trade names that defeat keyword matching. 'Dolochar' is spent char from a DRI kiln - a carbonaceous fuel - but it contains the string 'dolo', so substring matching confidently files it as dolomite and applies a carbonate factor to a fuel. The right answer when nothing fits is null, not a plausible-looking wrong id.",
    fileName: "kiln_consumables.csv",
    csv: `Month,Section,Material,Qty (MT),Remarks
Jan-26,DRI Kiln #1 & #2,DOLOCHAR (recycled),1240.00,kiln bed recycle
Jan-26,DRI Kiln #1 & #2,LDO,18.40,startup burner
Jan-26,DRI Kiln #1 & #2,COKE BREEZE,320.00,`,
    expected: {
      kind: "fuel",
      columns: {
        Month: "period",
        Section: "process",
        Material: "material",
        "Qty (MT)": "quantity",
        Remarks: "notes",
      },
      quantityUnit: "MT",
      values: {
        // Nothing in the library represents spent kiln char. A null sends this
        // to a human; "dolomite" silently applies 0.44 tCO2e/t to a fuel.
        "DOLOCHAR (recycled)": null,
        LDO: "diesel",
        "COKE BREEZE": "coke_oven_coke",
      },
    },
  },
  {
    id: "two-quantity-columns",
    intent:
      "Two columns both read as a quantity. Only gross production is the activity level; rejects are a subset already inside it. Picking the wrong one, or both, corrupts the SEE denominator.",
    fileName: "melt_shop_output.csv",
    csv: `Mth,Shop,Grade,CN,Gross Production (MT),Rejection (MT),Net Saleable (MT),EU Despatch (MT)
Jan-26,Melt Shop (IF/EAF),Fe500D,7207 11 00,"24,600.00",312.00,"24,288.00","4,428.00"
Feb-26,Melt Shop (IF/EAF),Fe500D,7207 11 00,"23,910.00",287.00,"23,623.00","4,102.00"`,
    expected: {
      kind: "production",
      columns: {
        Mth: "period",
        Shop: "process",
        Grade: "material",
        CN: "cn_code",
        "Gross Production (MT)": "quantity",
        "Rejection (MT)": null,
        "Net Saleable (MT)": null,
        "EU Despatch (MT)": "quantity_eu",
      },
      quantityUnit: "MT",
    },
  },
  {
    id: "kwh-not-mu",
    intent:
      "The mirror of the MU case: a sub-meter reading genuinely in kWh. A mapper that has learned 'electricity means MU' fails here.",
    fileName: "submeter_log.csv",
    csv: `Date,Feeder,Reading (kWh),Remarks
2026-01-31,Rolling Mill aux,2450000,monthly total
2026-02-28,Rolling Mill aux,2310000,monthly total`,
    expected: {
      kind: "electricity",
      columns: { Date: "period", Feeder: "process", "Reading (kWh)": "quantity", Remarks: "notes" },
      quantityUnit: "kWh",
    },
  },
];
