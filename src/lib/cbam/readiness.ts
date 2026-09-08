import type { ProcessEmissions } from "./calc";
import type { Finding } from "./rules";
import type { ActivityRecord, DeclarationLine } from "./types";

/**
 * Declaration readiness.
 *
 * Not a vanity score. Each component maps to something a verifier will actually
 * test, and the weightings put traceability and method tier ahead of cosmetics
 * because that is the order an accredited verifier works in.
 */

export interface ReadinessComponent {
  id: string;
  label: string;
  /** 0-100. */
  score: number;
  weight: number;
  detail: string;
  /** The single most valuable thing to fix in this component. */
  nextAction?: string;
}

export interface ReadinessResult {
  /** 0-100, weighted. */
  score: number;
  band: "not_filable" | "needs_work" | "defensible" | "verification_ready";
  components: ReadinessComponent[];
  blockers: number;
  warnings: number;
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, n));
}

export function assessReadiness(
  activities: ActivityRecord[],
  emissions: ProcessEmissions[],
  lines: DeclarationLine[],
  findings: Finding[],
): ReadinessResult {
  const blockers = findings.filter((f) => f.severity === "blocker" && !f.acknowledged).length;
  const warnings = findings.filter((f) => f.severity === "warning" && !f.acknowledged).length;

  // 1. Completeness - is there production, and inputs behind every process?
  const processesWithOutput = emissions.filter((e) => e.activityLevelT > 0).length;
  const processesWithInput = emissions.filter(
    (e) => e.contributions.fuel.length + e.contributions.processMaterial.length > 0,
  ).length;
  const completeness =
    emissions.length === 0
      ? 0
      : clamp(((processesWithOutput + processesWithInput) / (emissions.length * 2)) * 100);

  // 2. Traceability - every record must point at a source row.
  const traced = activities.filter((a) => a.lineage?.fileName && a.lineage.row > 0).length;
  const traceability = activities.length === 0 ? 0 : clamp((traced / activities.length) * 100);

  // 3. Method tier - measurement beats calculation beats defaults.
  const tierScores = activities.map((a) => (a.tier === 3 ? 100 : a.tier === 2 ? 70 : 35));
  const methodTier = tierScores.length
    ? clamp(tierScores.reduce((s, v) => s + v, 0) / tierScores.length)
    : 0;

  // 4. Primary data - defaults and estimates are where declarations get challenged.
  const primary = activities.filter(
    (a) => a.provenance === "measured" || a.provenance === "calculated",
  ).length;
  const primaryData = activities.length === 0 ? 0 : clamp((primary / activities.length) * 100);

  // 5. Plausibility - findings against the calculated intensities.
  const plausibility = clamp(100 - blockers * 30 - warnings * 8);

  // 6. Precision - propagated uncertainty on the lines that matter most.
  const weighted = lines.reduce((s, l) => s + l.embeddedForObligationT, 0);
  const uncertainty =
    weighted > 0
      ? lines.reduce((s, l) => s + l.uncertainty * l.embeddedForObligationT, 0) / weighted
      : 0.2;
  // 2% uncertainty scores 100, 20% scores 0.
  const precision = clamp(100 - ((uncertainty - 0.02) / 0.18) * 100);

  const components: ReadinessComponent[] = [
    {
      id: "completeness",
      label: "Completeness",
      score: completeness,
      weight: 0.2,
      detail: `${processesWithOutput}/${emissions.length} processes have output tonnage, ${processesWithInput}/${emissions.length} have input streams.`,
      nextAction:
        completeness < 100 ? "Attach input or output data to every declared process." : undefined,
    },
    {
      id: "traceability",
      label: "Traceability",
      score: traceability,
      weight: 0.25,
      detail: `${traced} of ${activities.length} records resolve to a named file and row.`,
      nextAction:
        traceability < 100
          ? "Records without a source row cannot be verified and should be removed or re-imported."
          : undefined,
    },
    {
      id: "tier",
      label: "Method tier",
      score: methodTier,
      weight: 0.2,
      detail: `Average monitoring tier across ${activities.length} records.`,
      nextAction:
        methodTier < 70
          ? "Replace library defaults with plant lab analyses to move streams to tier 3."
          : undefined,
    },
    {
      id: "primary",
      label: "Primary data share",
      score: primaryData,
      weight: 0.15,
      detail: `${primary} of ${activities.length} records are measured or calculated from primary activity data.`,
      nextAction:
        primaryData < 90
          ? "Chase suppliers for actual precursor data to displace defaults."
          : undefined,
    },
    {
      id: "plausibility",
      label: "Plausibility",
      score: plausibility,
      weight: 0.1,
      detail: `${blockers} blocking and ${warnings} warning findings open.`,
      nextAction: blockers > 0 ? "Clear all blocking findings before filing." : undefined,
    },
    {
      id: "precision",
      label: "Precision",
      score: precision,
      weight: 0.1,
      detail: `Emission-weighted uncertainty of ±${(uncertainty * 100).toFixed(1)}%.`,
      nextAction:
        precision < 60 ? "Tighten the factors carrying the largest share of emissions." : undefined,
    },
  ];

  const score = Math.round(components.reduce((s, c) => s + c.score * c.weight, 0));

  const band: ReadinessResult["band"] =
    blockers > 0
      ? "not_filable"
      : score >= 85
        ? "verification_ready"
        : score >= 70
          ? "defensible"
          : "needs_work";

  return { score, band, components, blockers, warnings };
}

export const BAND_LABELS: Record<ReadinessResult["band"], string> = {
  not_filable: "Not filable",
  needs_work: "Needs work",
  defensible: "Defensible",
  verification_ready: "Verification ready",
};
