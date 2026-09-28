import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { DocumentMetrics, LabelledDocument } from "./score";

/**
 * Comparing a run to the frozen baseline. The rules are evalgate's
 * (github.com/aquiadi/CI-harness, gate/check.py):
 *
 * - Missing data fails. No baseline, or a metric absent from either side, is a
 *   failure: the state where a regression is invisible must not be the state
 *   where the build is green.
 * - Changed ground fails. If the corpus, the provider or the models differ
 *   from the baseline's, the numbers are not comparable and the gate says so
 *   rather than producing one. Changing them is legitimate - it needs a
 *   deliberate re-freeze, which is a reviewable diff.
 * - Every metric has its own floor, so an improvement in one cannot hide a
 *   collapse in another.
 */

export interface Baseline {
  frozenAt: string;
  commit: string | null;
  corpus: string;
  corpusHash: string;
  provider: string;
  models: string[];
  cassettes: number;
  metrics: DocumentMetrics;
  /** Formatted copies of the headline numbers for the README badges. */
  badges?: Record<string, string>;
}

export interface Check {
  name: string;
  baseline: number | null;
  current: number | null;
  allowed: string;
  passed: boolean;
  reason?: string;
}

type Metric = Exclude<keyof DocumentMetrics, "documents">;

/**
 * How far each metric may move. Replay is deterministic, so any movement
 * comes from a code change and the tolerance is tight; a live run also
 * carries the model's own run-to-run variation.
 */
const TOLERANCE: Record<"replay" | "live", Record<Metric, number>> = {
  replay: {
    readRate: 0,
    lineRecall: 0.02,
    unitAccuracy: 0.02,
    categoryAccuracy: 0.02,
    silentErrorRate: 0,
  },
  live: {
    readRate: 0.1,
    lineRecall: 0.1,
    unitAccuracy: 0.1,
    categoryAccuracy: 0.1,
    silentErrorRate: 0.05,
  },
};

const LOWER_IS_BETTER: Metric[] = ["silentErrorRate"];

/** A hash over the labels and every document's bytes: what "the same corpus" means. */
export function corpusHash(root: string, documents: LabelledDocument[]): string {
  const h = createHash("sha256");
  h.update(readFileSync(join(root, "labels.json")));
  for (const d of [...documents].sort((a, b) => a.id.localeCompare(b.id))) {
    h.update(d.file);
    h.update(readFileSync(join(root, "corpus", d.file)));
  }
  return h.digest("hex");
}

export function gate(
  current: {
    metrics: DocumentMetrics;
    corpusHash: string;
    provider: string;
    models: string[];
  },
  baseline: Baseline | null,
  mode: "replay" | "live",
): Check[] {
  if (!baseline) {
    return [
      {
        name: "baseline",
        baseline: null,
        current: null,
        allowed: "exists",
        passed: false,
        reason: "No baseline. Freeze one deliberately: npm run eval:documents -- --record --freeze",
      },
    ];
  }
  const checks: Check[] = [];
  const ground = (name: string, was: string, now: string) =>
    checks.push({
      name,
      baseline: null,
      current: null,
      allowed: "unchanged",
      passed: was === now,
      reason:
        was === now
          ? undefined
          : `${name} changed (${was.slice(0, 40)} -> ${now.slice(0, 40)}); the numbers are not comparable. Re-record and re-freeze deliberately.`,
    });
  ground("corpus", baseline.corpusHash, current.corpusHash);
  ground("provider", baseline.provider, current.provider);
  ground("models", [...baseline.models].sort().join(","), [...current.models].sort().join(","));

  for (const [metric, tolerance] of Object.entries(TOLERANCE[mode]) as [Metric, number][]) {
    const was = baseline.metrics?.[metric];
    const now = current.metrics[metric];
    const lower = LOWER_IS_BETTER.includes(metric);
    if (typeof was !== "number" || typeof now !== "number" || !Number.isFinite(now)) {
      checks.push({
        name: metric,
        baseline: typeof was === "number" ? was : null,
        current: typeof now === "number" ? now : null,
        allowed: "present",
        passed: false,
        reason: "missing from the run or the baseline",
      });
      continue;
    }
    const passed = lower ? now <= was + tolerance + 1e-12 : now >= was - tolerance - 1e-12;
    checks.push({
      name: metric,
      baseline: was,
      current: now,
      allowed: `${lower ? "rise" : "drop"} of at most ${(tolerance * 100).toFixed(0)} pts`,
      passed,
    });
  }
  return checks;
}
