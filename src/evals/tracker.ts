import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { EvalSummary } from "./score";

/**
 * Eval run tracking.
 *
 * The ML-tooling habit worth importing here is not a hosted dashboard, it is
 * the discipline behind one: a metric printed to a terminal and lost is not a
 * measurement. Every run is written to an append-only log with the commit that
 * produced it, so "did that change help" is answerable after the fact rather
 * than from memory.
 *
 * Deliberately a JSONL file rather than a tracking service. The run is a few
 * hundred bytes, it belongs next to the code that produced it, and adding a
 * server to a repo that trains nothing would be theatre.
 */

export interface EvalRun {
  /** ISO timestamp of the run. */
  at: string;
  /** Commit the run was measured against, or "uncommitted". */
  commit: string;
  /** True when the working tree had uncommitted changes - the number is not reproducible. */
  dirty: boolean;
  nodeVersion: string;
  /** Which mapper produced these numbers. */
  label: string;
  caseCount: number;
  metrics: {
    columnAccuracy: number;
    columnErrorRate: number;
    columnMissRate: number;
    kindAccuracy: number;
    unitAccuracy: number;
    valueAccuracy: number;
    meanConfidenceOnErrors: number;
  };
  durationMs: number;
  /** Case ids that produced at least one error, for a quick diff between runs. */
  failingCases: string[];
}

const ARTIFACT_DIR = join(process.cwd(), "artifacts", "evals");
const HISTORY = join(ARTIFACT_DIR, "history.jsonl");

function git(args: string[]): string | null {
  try {
    return execFileSync("git", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

export function toRun(summary: EvalSummary): EvalRun {
  const commit = git(["rev-parse", "--short", "HEAD"]);
  const status = git(["status", "--porcelain"]);
  return {
    at: new Date().toISOString(),
    commit: commit ?? "uncommitted",
    dirty: Boolean(status && status.length > 0),
    nodeVersion: process.version,
    label: summary.label,
    caseCount: summary.cases.length,
    metrics: {
      columnAccuracy: summary.columnAccuracy,
      columnErrorRate: summary.columnErrorRate,
      columnMissRate: summary.columnMissRate,
      kindAccuracy: summary.kindAccuracy,
      unitAccuracy: summary.unitAccuracy,
      valueAccuracy: summary.valueAccuracy,
      meanConfidenceOnErrors: summary.meanConfidenceOnErrors,
    },
    durationMs: summary.durationMs,
    failingCases: summary.cases.filter((c) => c.errors.length > 0).map((c) => c.caseId),
  };
}

export function record(run: EvalRun): void {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  appendFileSync(HISTORY, `${JSON.stringify(run)}\n`, "utf8");
  writeFileSync(join(ARTIFACT_DIR, "latest.json"), `${JSON.stringify(run, null, 2)}\n`, "utf8");
}

/** The most recent recorded run for the same mapper, excluding the one just made. */
export function previousRun(label: string): EvalRun | null {
  if (!existsSync(HISTORY)) return null;
  const runs = readFileSync(HISTORY, "utf8")
    .split("\n")
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as EvalRun];
      } catch {
        return []; // a truncated write should not break the next run
      }
    })
    .filter((r) => r.label === label);
  return runs.at(-1) ?? null;
}

/**
 * Renders the change since the last recorded run.
 *
 * Only regressions and improvements are worth screen space; an unchanged metric
 * is noise. Returns null when there is nothing to compare against.
 */
export function formatDelta(current: EvalRun, previous: EvalRun | null): string | null {
  if (!previous) return null;

  const rows: string[] = [];
  const metrics: [keyof EvalRun["metrics"], string, "higher" | "lower"][] = [
    ["columnAccuracy", "column accuracy", "higher"],
    ["columnErrorRate", "column ERROR rate", "lower"],
    ["columnMissRate", "column miss rate", "lower"],
    ["kindAccuracy", "dataset kind", "higher"],
    ["unitAccuracy", "unit resolution", "higher"],
    ["valueAccuracy", "value resolution", "higher"],
  ];

  for (const [key, label, better] of metrics) {
    const now = current.metrics[key];
    const then = previous.metrics[key];
    const diff = now - then;
    if (Math.abs(diff) < 1e-9) continue;
    const improved = better === "higher" ? diff > 0 : diff < 0;
    const arrow = improved ? "improved" : "REGRESSED";
    rows.push(
      `  ${label.padEnd(20)} ${(then * 100).toFixed(1)}% -> ${(now * 100).toFixed(1)}%  (${arrow})`,
    );
  }

  const fixed = previous.failingCases.filter((c) => !current.failingCases.includes(c));
  const broken = current.failingCases.filter((c) => !previous.failingCases.includes(c));
  if (fixed.length) rows.push(`  now passing: ${fixed.join(", ")}`);
  if (broken.length) rows.push(`  newly failing: ${broken.join(", ")}`);

  if (rows.length === 0) return `No change since ${previous.commit} (${previous.at.slice(0, 10)}).`;

  return [
    `Change since ${previous.commit}${previous.dirty ? " (dirty)" : ""} on ${previous.at.slice(0, 10)}:`,
    ...rows,
  ].join("\n");
}
