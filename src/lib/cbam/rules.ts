import { getPlausibilityBand } from "./plausibility";
import { goodsUnderHeading, lookupGoods, TYPICAL_PRECURSORS } from "./goods";
import type { ProcessEmissions } from "./calc";
import type { SefaResult } from "./sefa";
import type {
  ActivityRecord,
  DeclarationLine,
  ElectricityActivity,
  FuelActivity,
  Installation,
  PrecursorActivity,
  ProductionActivity,
  ReportingPeriod,
} from "./types";

/**
 * Deterministic data-quality rules.
 *
 * These run before any model is involved and they are the authority on whether
 * a declaration is filable. The language model's job is to explain a finding in
 * the operator's own vocabulary and propose a fix - it can neither create a
 * finding nor clear one. That asymmetry is intentional: a hallucinated
 * all-clear on a compliance check is the worst failure this product could have.
 */

export type Severity = "blocker" | "warning" | "info";

export interface Finding {
  /** Stable rule id, cited in the audit trail and the memo. */
  code: string;
  severity: Severity;
  title: string;
  /** Plain statement of what was observed. Never speculative. */
  detail: string;
  /** Ids of the activity records implicated. */
  activityIds: string[];
  processId?: string;
  /** What the operator should do about it. */
  remedy: string;
  /** Regulatory hook, where one applies. */
  reference?: string;
  /**
   * Whether excluding the implicated records is a sensible remedy.
   *
   * True only where the record should not be in the declaration at all - a
   * duplicate, a unit error, goods out of scope. False for findings that name
   * a real quantity measured badly: dropping those understates emissions,
   * which is the failure mode that carries penalties.
   */
  allowExclusion?: boolean;
  /** Set once an operator has reviewed and accepted the finding. */
  acknowledged?: boolean;
}

/** Calendar months a period touches, inclusive. Day-count approximations get
 *  this wrong at the boundaries and produce phantom coverage gaps. */
function monthsBetween(start: string, end: string): number {
  const a = new Date(start);
  const b = new Date(end);
  const months =
    (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth()) + 1;
  return Math.max(1, months);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
    : (sorted[mid] ?? 0);
}

export interface RuleContext {
  installation: Installation;
  period: ReportingPeriod;
  activities: ActivityRecord[];
  emissions: ProcessEmissions[];
  lines: DeclarationLine[];
  /** Rows that could not be turned into activity records during ingest. */
  rejectedRowCount?: number;
  /** Records the operator excluded after review. */
  excludedCount?: number;
  /** Free allocation results, for the benchmark-route and SEFA checks. */
  sefa?: SefaResult;
  /** Rows skipped at ingest because the goods are outside CBAM scope. */
  outOfScopeRows?: { fileName: string; row: number; cnCode: string; description: string }[];
}

type Rule = (ctx: RuleContext) => Finding[];

// ---------------------------------------------------------------- rules

/** CP-001 Activity level missing or zero: the SEE denominator does not exist. */
const activityLevelPresent: Rule = ({ installation, emissions }) =>
  emissions
    .filter((e) => e.activityLevelT <= 0)
    .map((e) => ({
      code: "CP-001",
      severity: "blocker" as const,
      title: `No production recorded for ${e.processName}`,
      detail:
        `Emissions of ${e.directT.toFixed(1)} tCO2e are attributed to ${e.processName}, but no ` +
        `output tonnage was found for the period. Specific embedded emissions cannot be ` +
        `calculated without an activity level.`,
      activityIds: [],
      processId: e.processId,
      remedy:
        `Upload production tonnage for ${e.processName}, or reattribute these inputs to the ` +
        `process that actually produced goods.`,
      reference: "Annex IV, specific embedded emissions",
    }))
    .filter(() => installation.processes.length > 0);

/** CP-002 Fuel quantity with no calorific value and no library default. */
const fuelCalorificValue: Rule = ({ emissions }) =>
  emissions.flatMap((e) =>
    e.errors
      .filter((msg) => msg.includes("calorific"))
      .map((msg) => ({
        code: "CP-002",
        severity: "blocker" as const,
        title: `Fuel cannot be converted to energy in ${e.processName}`,
        detail: msg,
        activityIds: [],
        processId: e.processId,
        remedy:
          "Attach the fuel's net calorific value from a lab certificate, or map the stream to a " +
          "fuel type whose default NCV applies.",
        reference: "Annex III, calculation-based approach",
      })),
  );

/** CP-003 Specific emissions outside the plausible band for the goods category. */
const plausibility: Rule = ({ lines }) =>
  lines.flatMap((l) => {
    const band = getPlausibilityBand(l.category);
    if (!band) return [];
    const [min, max] = band.plausibleDirect;
    if (l.seeDirect >= min && l.seeDirect <= max) return [];
    const direction = l.seeDirect < min ? "below" : "above";
    // Severity scales with how far out the figure is. A plant genuinely 20%
    // above a benchmark is worth a look; one 200x above is not a plant, it is
    // a unit error, and no verifier would accept it.
    const magnitude = l.seeDirect > max ? l.seeDirect / max : min / Math.max(l.seeDirect, 1e-9);
    const severity: Severity = l.seeDirect < min || magnitude >= 3 ? "blocker" : "warning";
    return [
      {
        code: "CP-003",
        severity,
        title: `Direct intensity for ${l.cnCode} is ${direction} the plausible range`,
        detail:
          `Calculated ${l.seeDirect.toFixed(3)} tCO2e/t against a plausible band of ` +
          `${min}-${max} for ${l.category.replace(/_/g, " ")}` +
          (magnitude >= 3 ? ` - roughly ${magnitude.toFixed(0)}x outside it` : "") +
          `. A figure ${direction} the band usually means a unit error, a missing input stream, ` +
          `or output attributed to the wrong process - not a genuinely exceptional plant.`,
        activityIds: [],
        processId: l.processId,
        remedy:
          l.seeDirect < min
            ? "Check that every fuel and process material stream has been mapped, and that no " +
              "input has been attributed to a different process."
            : "Check for a unit misread (kg vs t, MU vs MWh) and confirm the production tonnage " +
              "covers the same period as the fuel data.",
        reference: "Plausibility check (indicative band, not a regulatory value)",
      },
    ];
  });

/** CP-004 Reporting period not fully covered by the underlying data. */
const periodCoverage: Rule = ({ period, activities }) => {
  const findings: Finding[] = [];
  const expected = monthsBetween(period.start, period.end);
  const kinds: ActivityRecord["kind"][] = ["fuel", "electricity", "production"];

  for (const kind of kinds) {
    const records = activities.filter((a) => a.kind === kind);
    if (records.length === 0) continue;
    const months = new Set(records.map((r) => r.periodStart.slice(0, 7)));
    if (months.size < expected) {
      findings.push({
        code: "CP-004",
        severity: "warning",
        title: `${kind.replace("_", " ")} data covers ${months.size} of ${expected} months`,
        detail:
          `The reporting period runs ${period.start} to ${period.end} but ${kind} records were ` +
          `only found for ${months.size} distinct months. Gaps understate embedded emissions.`,
        activityIds: [],
        remedy:
          `Upload the missing ${kind} records, or confirm the installation was not ` +
          `operating in those months.`,
        reference: "IR Art. 3, completeness of monitoring",
      });
    }
  }
  return findings;
};

/** CP-005 Order-of-magnitude outliers, the classic unit misread. */
const outliers: Rule = ({ activities }) => {
  const findings: Finding[] = [];
  const groups = new Map<string, (FuelActivity | ElectricityActivity | ProductionActivity)[]>();

  for (const a of activities) {
    let key: string | null = null;
    if (a.kind === "fuel") key = `fuel:${a.factorId}:${a.processId}`;
    else if (a.kind === "electricity") key = `elec:${a.processId}`;
    else if (a.kind === "production") key = `prod:${a.cnCode}`;
    if (!key) continue;
    const list = groups.get(key) ?? [];
    list.push(a as FuelActivity | ElectricityActivity | ProductionActivity);
    groups.set(key, list);
  }

  const quantityOf = (a: FuelActivity | ElectricityActivity | ProductionActivity): number =>
    a.kind === "fuel" ? a.quantity : a.kind === "electricity" ? a.quantityMWh : a.quantityT;

  for (const [key, records] of groups) {
    if (records.length < 4) continue;
    const values = records.map(quantityOf).filter((v) => v > 0);
    const med = median(values);
    if (med <= 0) continue;
    for (const r of records) {
      const v = quantityOf(r);
      const ratio = v / med;
      if (ratio > 50 || (v > 0 && ratio < 1 / 50)) {
        findings.push({
          code: "CP-005",
          severity: "warning",
          title: `Outlier in ${key.split(":")[0]} series (row ${r.lineage.row} of ${r.lineage.fileName})`,
          detail:
            `Value ${v.toLocaleString("en-IN")} is ${ratio > 1 ? ratio.toFixed(0) + "x above" : (1 / ratio).toFixed(0) + "x below"} ` +
            `the median of ${med.toLocaleString("en-IN")} for the same stream. Ratios near 1,000 ` +
            `or 100,000 usually mean a unit was read as MWh instead of MU, or tonnes instead of kg.`,
          activityIds: [r.id],
          processId: r.processId,
          allowExclusion: true,
          remedy:
            `Open ${r.lineage.fileName} row ${r.lineage.row} and confirm the unit in the ` +
            `source system.`,
        });
      }
    }
  }
  return findings;
};

/** CP-006 Duplicate records: same stream, same period, same quantity. */
const duplicates: Rule = ({ activities }) => {
  const seen = new Map<string, ActivityRecord>();
  const findings: Finding[] = [];
  for (const a of activities) {
    const quantity =
      a.kind === "fuel"
        ? a.quantity
        : a.kind === "electricity"
          ? a.quantityMWh
          : a.kind === "production" || a.kind === "precursor"
            ? a.quantityT
            : a.kind === "process_material"
              ? a.quantityT
              : 0;
    const key = `${a.kind}|${a.processId}|${a.periodStart}|${a.periodEnd}|${quantity}`;
    const prior = seen.get(key);
    if (prior && quantity > 0) {
      findings.push({
        code: "CP-006",
        severity: "warning",
        title: `Possible duplicate ${a.kind} record`,
        detail:
          `Rows ${prior.lineage.row} and ${a.lineage.row} of ${a.lineage.fileName} carry the ` +
          `same process, period and quantity (${quantity.toLocaleString("en-IN")}). If both are ` +
          `counted the declaration overstates emissions.`,
        activityIds: [a.id],
        processId: a.processId,
        allowExclusion: true,
        remedy:
          `Confirm whether this is a genuine second delivery or a double export from the MIS. ` +
          `Excluding removes the later of the two rows and keeps the first.`,
      });
    } else {
      seen.set(key, a);
    }
  }
  return findings;
};

/**
 * CP-007 Precursor embedded emissions taken from the Commission's default
 * values rather than the supplier. Aggregated per CN code and supplier: twelve
 * monthly deliveries from one vendor is one problem to chase, not twelve.
 */
const precursorDefaults: Rule = ({ activities, emissions }) => {
  const resolutions = Object.assign({}, ...emissions.map((e) => e.precursorResolutions)) as Record<
    string,
    ProcessEmissions["precursorResolutions"][string]
  >;
  const defaults = activities.filter(
    (a): a is PrecursorActivity =>
      a.kind === "precursor" && resolutions[a.id]?.status === "default",
  );
  const groups = new Map<string, PrecursorActivity[]>();
  for (const a of defaults) {
    const key = `${a.cnCode}|${a.supplierName ?? "unknown supplier"}`;
    groups.set(key, [...(groups.get(key) ?? []), a]);
  }

  return [...groups.entries()].flatMap(([key, records]) => {
    const [first] = records;
    if (!first) return [];
    const resolved = resolutions[first.id];
    const tonnes = records.reduce((s, r) => s + r.quantityT, 0);
    const see = (resolved?.seeDirect ?? 0) + (resolved?.seeIndirect ?? 0);
    const supplier = key.split("|")[1] ?? "unknown supplier";
    return {
      code: "CP-007",
      severity: "warning" as const,
      title: `Default values used for ${records.length} ${lookupGoods(first.cnCode)?.description ?? first.cnCode} deliveries`,
      detail:
        `${tonnes.toLocaleString("en-IN", { maximumFractionDigits: 0 })} t from ${supplier} carries ` +
        `the Commission default of ${see.toFixed(3)} tCO2e/t including the mark-up ` +
        `(${resolved?.reference ?? "default value"}). Defaults are set to avoid underestimating ` +
        `emissions, so they usually overstate this plant's obligation.`,
      activityIds: records.map((r) => r.id),
      processId: first.processId,
      remedy:
        `Request a verified CBAM communication from ${supplier}, including its specific embedded ` +
        `emissions and free allocation (SEFA). On ${tonnes.toLocaleString("en-IN", { maximumFractionDigits: 0 })} t ` +
        `this is usually the highest-value data request available before filing.`,
      reference: "IR (EU) 2025/2621 Annex I/IV; mark-up per Guidance Document 3, s. 4.10",
    };
  });
};

/** CP-008 Carbon price claimed with no evidence attached. */
const carbonPriceEvidence: Rule = ({ activities }) =>
  activities
    .filter((a) => a.kind === "carbon_price" && !a.evidenceAttached)
    .map((a) => ({
      code: "CP-008",
      severity: "blocker" as const,
      title: "Carbon price claimed without evidence",
      detail:
        `A deduction has been claimed under "${a.kind === "carbon_price" ? a.scheme : ""}" but no ` +
        `supporting documentation is attached. The claim will be rejected and, if it materially ` +
        `understates the obligation, treated as a misdeclaration.`,
      activityIds: [a.id],
      remedy:
        "Attach proof of payment and confirmation that no rebate or compensation was received on export.",
      reference: "Art. 9, carbon price paid in a third country",
    }));

/** CP-009 Electricity intensity implausible for the route. */
const electricityIntensity: Rule = ({ emissions }) => {
  const bands: Partial<Record<string, [number, number]>> = {
    crude_steel: [0.05, 1.0],
    iron_or_steel_products: [0.05, 1.2],
    unwrought_aluminium: [12, 17],
    dri: [0.05, 0.35],
    cement: [0.05, 0.18],
    cement_clinker: [0.03, 0.12],
    ferro_alloys: [2.5, 12],
  };
  return emissions.flatMap((e) => {
    const band = bands[e.category];
    if (!band || e.activityLevelT <= 0) return [];
    // Back out MWh/t from the indirect emissions and the applied grid factor.
    const mwhPerT =
      e.contributions.electricity.reduce((s, c) => s + c.quantity, 0) / e.activityLevelT;
    if (mwhPerT === 0) return [];
    const [min, max] = band;
    if (mwhPerT >= min && mwhPerT <= max) return [];
    return [
      {
        code: "CP-009",
        severity: "warning" as Severity,
        title: `Electricity intensity of ${e.processName} looks wrong`,
        detail:
          `${mwhPerT.toFixed(3)} MWh per tonne against a typical ${min}-${max} MWh/t for ` +
          `${e.category.replace(/_/g, " ")}. A factor of 1,000 here is almost always "MU" on a ` +
          `power bill read as MWh.`,
        activityIds: [],
        processId: e.processId,
        remedy: "Re-check the unit on the electricity source file.",
      },
    ];
  });
};

/** CP-010 A production route with no precursors where the route implies them. */
const missingPrecursors: Rule = ({ installation, activities, emissions }) =>
  installation.processes.flatMap((p) => {
    const expected = TYPICAL_PRECURSORS[p.category];
    if (!expected || expected.length === 0) return [];
    const em = emissions.find((e) => e.processId === p.id);
    if (!em || em.activityLevelT <= 0) return [];
    // A precursor can arrive either bought in, or from an upstream process in
    // the same installation. Both satisfy the check.
    const boughtIn = activities.some((a) => a.kind === "precursor" && a.processId === p.id);
    const internal =
      em.internalPrecursorDirectT > 0 ||
      (installation.precursorLinks ?? []).some((l) => l.toProcessId === p.id);
    if (boughtIn || internal) return [];
    return [
      {
        code: "CP-010",
        severity: "warning" as Severity,
        title: `No precursors declared for ${p.name}`,
        detail:
          `${p.category.replace(/_/g, " ")} normally consumes ` +
          `${expected.map((c) => c.replace(/_/g, " ")).join(" or ")}. With no precursor recorded, ` +
          `the declaration only carries this process's own emissions and will understate the total.`,
        activityIds: [],
        processId: p.id,
        remedy:
          "Add the precursor consumption, or confirm the process genuinely starts from " +
          "non-CBAM inputs such as purchased scrap.",
        reference: "Annex IV(4), embedded emissions of precursors",
      },
    ];
  });

/**
 * CP-011 Grid electricity on a national average rather than the Commission's
 * Annex II default or an evidenced supplier factor.
 */
const gridFactorSpecificity: Rule = ({ activities, installation }) => {
  if (installation.gridEmissionFactor) return [];
  const generic = activities.filter(
    (a): a is ElectricityActivity =>
      a.kind === "electricity" && a.supply === "grid" && a.factorId.startsWith("grid_in"),
  );
  if (generic.length === 0) return [];
  const totalMWh = generic.reduce((s, a) => s + a.quantityMWh, 0);
  return [
    {
      code: "CP-011",
      severity: "info",
      title: "National grid average applied to purchased electricity",
      detail:
        `${totalMWh.toLocaleString("en-IN", { maximumFractionDigits: 0 })} MWh uses the CEA national ` +
        `grid average. In the definitive period the default for grid electricity is the ` +
        `Commission's country factor (Annex II to IR (EU) 2025/2621); a lower actual factor needs ` +
        `the evidence required for power purchase agreements or a direct technical link.`,
      activityIds: generic.map((a) => a.id),
      remedy:
        "Enter the Annex II factor for India under Settings, or evidence a supplier-specific " +
        "factor. For goods where only direct emissions count this changes what is reported, not " +
        "what is charged.",
      reference: "IR (EU) 2025/2621 Annex II; IR (EU) 2025/2547",
    },
  ];
};

/** CP-012 Goods declared that fall outside CBAM scope. One finding per code. */
const scopeCheck: Rule = ({ activities }) => {
  const outOfScope = activities
    .filter((a): a is ProductionActivity => a.kind === "production")
    .filter((a) => !lookupGoods(a.cnCode));
  const seen = new Set<string>();
  return outOfScope
    .filter((a) => {
      if (seen.has(a.cnCode)) return false;
      seen.add(a.cnCode);
      return true;
    })
    .map((a) => {
      const candidates = a.cnCode.length < 8 ? goodsUnderHeading(a.cnCode) : [];
      const partial = a.cnCode.length < 8;
      return {
        code: "CP-012",
        severity: (partial && candidates.length > 0 ? "blocker" : "info") as Severity,
        title: partial
          ? `CN code ${a.cnCode} is not specific enough`
          : `CN code ${a.cnCode} is not a CBAM good`,
        detail: partial
          ? `Row ${a.lineage.row} of ${a.lineage.fileName} declares ${a.cnCode}. Declarations are ` +
            `made per 8-digit CN code; under this heading ${candidates.length} codes are in scope ` +
            `(e.g. ${candidates
              .slice(0, 3)
              .map((c) => c.cnCode)
              .join(", ")}). The goods are left out until the full code is given.`
          : `Row ${a.lineage.row} of ${a.lineage.fileName} declares ${a.cnCode}, which is not in ` +
            `Annex I. It has been left out of the declaration.`,
        activityIds: outOfScope.filter((x) => x.cnCode === a.cnCode).map((x) => x.id),
        processId: a.processId,
        allowExclusion: !partial,
        remedy: partial
          ? "Correct the CN code in the source file to the 8-digit code on the customs invoice and re-import."
          : "Confirm the CN code. If the goods are in scope, correct the code and re-import.",
        reference: "Annex I, list of goods",
      };
    });
};

/**
 * CP-013 Rows dropped at ingest. A row that never became a record is invisible
 * to every other rule here, so it gets its own check - silent data loss is an
 * understatement, and understatements are what carry penalties.
 */
const rejectedRows: Rule = ({ rejectedRowCount }) => {
  if (!rejectedRowCount || rejectedRowCount === 0) return [];
  return [
    {
      code: "CP-013",
      severity: "blocker",
      title: `${rejectedRowCount} source row${rejectedRowCount > 1 ? "s" : ""} could not be imported`,
      detail:
        `These rows carried data but could not be turned into activity records - usually an ` +
        `unrecognised plant section or a missing unit. They contribute nothing to the ` +
        `declaration, which understates emissions.`,
      activityIds: [],
      remedy:
        "Review the rejected rows on the Ingest screen and either map the missing values or " +
        "confirm the rows are genuinely out of scope.",
      reference: "IR Art. 3, completeness of monitoring",
    },
  ];
};

/**
 * CP-014 Reporting period shorter than a calendar year. The definitive regime
 * reports embedded emissions per calendar year of production; a part-year is a
 * provisional estimate, not a figure a verifier can sign.
 */
const partialYear: Rule = ({ period }) => {
  const full = period.start.endsWith("-01-01") && period.end.endsWith("-12-31");
  if (full || period.start.slice(0, 4) !== period.end.slice(0, 4)) return [];
  return [
    {
      code: "CP-014",
      severity: "warning",
      title: `Reporting period covers ${monthsBetween(period.start, period.end)} of 12 months`,
      detail:
        `Figures cover ${period.start} to ${period.end}. Embedded emissions are determined per ` +
        `calendar year of production, so these are provisional until the year is complete.`,
      activityIds: [],
      remedy:
        "Use these figures for planning and supplier conversations; recompute on the full year's " +
        "data before verification.",
      reference: "IR (EU) 2025/2547 Art. 7; Guidance Document 1, s. 2.4.5",
    },
  ];
};

/**
 * CP-015 The free allocation adjustment could not be determined - most often
 * because the benchmark depends on the production route and none is set.
 */
const freeAllocationDetermined: Rule = ({ lines, sefa }) => {
  if (!sefa) return [];
  return lines
    .filter((l) => l.sefaIssues.length > 0)
    .map((l) => {
      const routeMissing = l.sefaIssues.some((i) => i.includes("production route"));
      return {
        code: "CP-015",
        severity: (routeMissing ? "blocker" : "warning") as Severity,
        title: routeMissing
          ? `Production route needed for the benchmark of CN ${l.cnCode}`
          : `Free allocation incomplete for CN ${l.cnCode}`,
        detail: l.sefaIssues.join(" "),
        activityIds: [],
        processId: l.processId,
        remedy: routeMissing
          ? `Set the benchmark route for ${l.processName} under Settings > Installation.`
          : "Check that every precursor of this good resolves to a value, then recompute.",
        reference: "IR (EU) 2025/2620 Annex, point 5; Guidance Document 4, Table 2-2",
      };
    });
};

/** CP-016 Supplier actual values without a verification report. */
const unverifiedSupplierData: Rule = ({ activities }) => {
  const unverified = activities.filter(
    (a): a is PrecursorActivity => a.kind === "precursor" && !!a.supplier && !a.supplier.verified,
  );
  const bySupplier = new Map<string, PrecursorActivity[]>();
  for (const a of unverified) {
    const key = a.supplierName ?? "unknown supplier";
    bySupplier.set(key, [...(bySupplier.get(key) ?? []), a]);
  }
  return [...bySupplier.entries()].map(([supplier, records]) => ({
    code: "CP-016",
    severity: "warning" as const,
    title: `Actual values from ${supplier} are not verified`,
    detail:
      `${records.length} deliveries use values communicated by ${supplier} without an accredited ` +
      `verifier's report. Actual data can be used in a CBAM declaration only once verified; ` +
      `otherwise the declarant must fall back to default values.`,
    activityIds: records.map((r) => r.id),
    processId: records[0]?.processId,
    remedy: `Ask ${supplier} for the verification report covering these values and attach it as evidence.`,
    reference: "Regulation (EU) 2023/956 Art. 8; IR (EU) 2025/2546",
  }));
};

/** CP-017 A precursor with no supplier value and no published default. */
const unresolvedPrecursors: Rule = ({ activities, emissions }) => {
  const findings: Finding[] = [];
  for (const e of emissions) {
    const unresolved = activities.filter(
      (a): a is PrecursorActivity =>
        a.kind === "precursor" &&
        a.processId === e.processId &&
        e.precursorResolutions[a.id]?.status === "unresolved",
    );
    if (unresolved.length === 0) continue;
    const first = unresolved[0];
    findings.push({
      code: "CP-017",
      severity: "blocker",
      title: `${unresolved.length} precursor deliveries have no embedded emissions value`,
      detail:
        `${first ? e.precursorResolutions[first.id]?.issue : ""} Without a supplier value or a ` +
        `published default these deliveries contribute nothing, which understates ${e.processName}.`,
      activityIds: unresolved.map((a) => a.id),
      processId: e.processId,
      remedy:
        "Obtain the supplier's CBAM communication, or record the full CN code and country of " +
        "production so the correct default value applies.",
      reference: "IR (EU) 2025/2621 Annex I and IV",
    });
  }
  return findings;
};

/** CP-018 Supplier gave SEE but not SEFA, so a default benchmark stands in. */
const supplierSefaMissing: Rule = ({ activities }) => {
  const missing = activities.filter(
    (a): a is PrecursorActivity =>
      a.kind === "precursor" && !!a.supplier && a.supplier.sefa === undefined,
  );
  if (missing.length === 0) return [];
  const suppliers = [...new Set(missing.map((a) => a.supplierName ?? "unknown supplier"))];
  return [
    {
      code: "CP-018",
      severity: "info",
      title: "Precursor free allocation (SEFA) not communicated by suppliers",
      detail:
        `${missing.length} deliveries from ${suppliers.join(", ")} carry actual emissions but no ` +
        `specific embedded free allocation. The column B benchmark is used instead, as the Free ` +
        `Allocation Adjustment Act provides.`,
      activityIds: missing.map((a) => a.id),
      remedy:
        "Ask suppliers to include SEFA in their communication; it is part of the verified report.",
      reference: "IR (EU) 2025/2620; Guidance Document 4, s. 2.2.1.1",
    },
  ];
};

/** CP-019 Installation details the communication template asks for. */
const installationDetails: Rule = ({ installation }) => {
  const missing = [
    !installation.unlocode && "UN/LOCODE",
    (installation.latitude === undefined || installation.longitude === undefined) &&
      "coordinates of the main emission source",
    !installation.economicActivity && "economic activity",
    !installation.contactEmail && "contact e-mail",
  ].filter((x): x is string => Boolean(x));
  if (missing.length === 0) return [];
  return [
    {
      code: "CP-019",
      severity: "warning",
      title: "Installation details incomplete for the communication",
      detail: `The communication to importers is missing: ${missing.join(", ")}.`,
      activityIds: [],
      remedy: "Complete the installation details under Settings > Installation.",
      reference: "Commission communication template for installations, sheet A_InstData",
    },
  ];
};

/** CP-020 Rows skipped at ingest because their goods are outside CBAM scope. */
const outOfScopeInputs: Rule = ({ outOfScopeRows }) => {
  if (!outOfScopeRows || outOfScopeRows.length === 0) return [];
  const codes = [
    ...new Set(outOfScopeRows.map((r) => `${r.cnCode} (${r.description || "no description"})`)),
  ];
  return [
    {
      code: "CP-020",
      severity: "info",
      title: `${outOfScopeRows.length} rows are goods outside CBAM scope`,
      detail:
        `Rows declaring ${codes.slice(0, 4).join("; ")}${codes.length > 4 ? "; ..." : ""} were ` +
        `recorded but carry no embedded emissions, because the goods are not in Annex I.`,
      activityIds: [],
      remedy:
        "Nothing to do if the CN codes are right. If a code is wrong, correct it and re-import.",
      reference: "Annex I to Regulation (EU) 2023/956",
    },
  ];
};

const RULES: Rule[] = [
  rejectedRows,
  activityLevelPresent,
  fuelCalorificValue,
  plausibility,
  periodCoverage,
  outliers,
  duplicates,
  precursorDefaults,
  carbonPriceEvidence,
  electricityIntensity,
  missingPrecursors,
  gridFactorSpecificity,
  scopeCheck,
  partialYear,
  freeAllocationDetermined,
  unverifiedSupplierData,
  unresolvedPrecursors,
  supplierSefaMissing,
  installationDetails,
  outOfScopeInputs,
];

const SEVERITY_ORDER: Record<Severity, number> = { blocker: 0, warning: 1, info: 2 };

export function runRules(ctx: RuleContext): Finding[] {
  return RULES.flatMap((rule) => rule(ctx)).sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.code.localeCompare(b.code),
  );
}

/** Catalogue for the methodology page, so every rule is documented in the product. */
export const RULE_CATALOGUE = [
  { code: "CP-001", title: "Activity level present", severity: "blocker" },
  { code: "CP-002", title: "Fuel convertible to energy", severity: "blocker" },
  { code: "CP-003", title: "Intensity within plausible band", severity: "blocker / warning" },
  { code: "CP-004", title: "Reporting period fully covered", severity: "warning" },
  { code: "CP-005", title: "Order-of-magnitude outliers", severity: "warning" },
  { code: "CP-006", title: "Duplicate records", severity: "warning" },
  { code: "CP-007", title: "Precursor default values in use", severity: "warning" },
  { code: "CP-008", title: "Carbon price evidence attached", severity: "blocker" },
  { code: "CP-009", title: "Electricity intensity plausible", severity: "warning" },
  { code: "CP-010", title: "Expected precursors present", severity: "warning" },
  { code: "CP-011", title: "Grid factor is the Commission default or evidenced", severity: "info" },
  {
    code: "CP-012",
    title: "Goods within CBAM scope, at 8-digit CN level",
    severity: "info / blocker",
  },
  { code: "CP-013", title: "All source rows imported", severity: "blocker" },
  { code: "CP-014", title: "Full calendar year reported", severity: "warning" },
  { code: "CP-015", title: "Free allocation adjustment determined", severity: "blocker / warning" },
  { code: "CP-016", title: "Supplier actual values verified", severity: "warning" },
  { code: "CP-017", title: "Every precursor has a value", severity: "blocker" },
  { code: "CP-018", title: "Supplier SEFA communicated", severity: "info" },
  { code: "CP-019", title: "Installation details complete", severity: "warning" },
  { code: "CP-020", title: "Out-of-scope inputs recorded", severity: "info" },
] as const;
