import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { buildDeclaration, type DeclarationResult } from "./cbam/declaration";
import type { CostAssumptions } from "./cbam/cost";
import type { ActivityRecord, Installation, ReportingPeriod } from "./cbam/types";
import { DEMO_INSTALLATION, DEMO_PERIOD, loadDemoFiles } from "./demo";
import { heuristicMapping } from "./ingest/heuristic";
import { parseCsv } from "./ingest/parse";
import { materialise, type RejectedRow } from "./ingest/materialise";
import type { DatasetMapping } from "./ingest/schema";
import type { AiOutcome } from "./ai/client";
import { env } from "@/config/env";

/**
 * Workspace state.
 *
 * A JSON file on disk rather than a database: the app has to run with `npm run
 * dev` and nothing else, and the whole state is a few hundred kilobytes. The
 * seam is narrow enough that swapping in Postgres later is a change to this
 * file only.
 *
 * Derived values - emissions, findings, exposure - are never stored. They are
 * recomputed from the activity records on every read, so a figure on screen
 * cannot drift from the data behind it.
 */

export interface StoredDataset {
  id: string;
  fileName: string;
  uploadedAt: string;
  rowCount: number;
  mapping: DatasetMapping;
  aiOutcome: AiOutcome;
  activities: ActivityRecord[];
  rejected: RejectedRow[];
}

export interface WorkspaceState {
  installation: Installation;
  period: ReportingPeriod;
  assumptions: CostAssumptions;
  datasets: StoredDataset[];
  /** Records the operator excluded after review, with their reasons. */
  exclusions: { activityId: string; reason: string; at: string }[];
  /** Finding keys the operator has reviewed and accepted. */
  acknowledged: string[];
}

// `resolve`, not `join`: the container sets an absolute CARBONPASS_DATA_DIR
// (/app/.data) which is also the volume mount point, and join would nest it
// under the working directory as /app/app/.data - silently writing state
// outside the mounted volume, so it would not survive a restart.
const DATA_DIR = resolve(process.cwd(), env.CARBONPASS_DATA_DIR);
const STATE_FILE = join(DATA_DIR, "workspace.json");

// Survives HMR in development, where module state is otherwise discarded.
const globalStore = globalThis as unknown as { __carbonpass?: WorkspaceState };

function seed(): WorkspaceState {
  const datasets: StoredDataset[] = [];

  for (const file of loadDemoFiles()) {
    const parsed = parseCsv(file.fileName, file.content, file.fileName);
    // Seeding uses the deterministic mapper so a first page load never makes a
    // network call. The Ingest screen offers a per-file re-map with the model.
    const mapping = heuristicMapping(parsed, DEMO_INSTALLATION.processes);
    const { activities, rejected } = materialise(parsed, mapping, DEMO_INSTALLATION.processes);
    datasets.push({
      id: file.fileName,
      fileName: file.fileName,
      uploadedAt: new Date().toISOString(),
      rowCount: parsed.rowCount,
      mapping,
      aiOutcome: { producedBy: "heuristic", fallbackReason: "Seeded without a model call." },
      activities,
      rejected,
    });
  }

  return {
    installation: DEMO_INSTALLATION,
    period: DEMO_PERIOD,
    // Configuration is injected here rather than read inside the engine, which
    // must stay pure and deterministic.
    assumptions: {
      etsPriceEur: env.CARBONPASS_ETS_PRICE_EUR,
      inrPerEur: env.CARBONPASS_INR_PER_EUR,
      year: env.CARBONPASS_YEAR,
    },
    datasets,
    exclusions: [],
    acknowledged: [],
  };
}

export function getState(): WorkspaceState {
  if (globalStore.__carbonpass) return globalStore.__carbonpass;

  if (existsSync(STATE_FILE)) {
    try {
      const parsed = JSON.parse(readFileSync(STATE_FILE, "utf8")) as WorkspaceState;
      globalStore.__carbonpass = parsed;
      return parsed;
    } catch {
      // A corrupt state file should not brick the app; reseed from the demo data.
    }
  }

  const fresh = seed();
  globalStore.__carbonpass = fresh;
  persist(fresh);
  return fresh;
}

export function persist(state: WorkspaceState): void {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
  } catch {
    // A read-only filesystem is survivable - the in-memory state still works
    // for the session. Failing the request over it would not be.
  }
}

export function updateState(mutate: (state: WorkspaceState) => void): WorkspaceState {
  const state = getState();
  mutate(state);
  globalStore.__carbonpass = state;
  persist(state);
  return state;
}

export function resetState(): WorkspaceState {
  const fresh = seed();
  globalStore.__carbonpass = fresh;
  persist(fresh);
  return fresh;
}

export function allActivities(state: WorkspaceState = getState()): ActivityRecord[] {
  return state.datasets.flatMap((d) => d.activities);
}

export function rejectedRowCount(state: WorkspaceState = getState()): number {
  return state.datasets.reduce((s, d) => s + d.rejected.length, 0);
}

/** The single source of every number rendered anywhere in the UI. */
export function getDeclaration(state: WorkspaceState = getState()): DeclarationResult {
  return buildDeclaration(state.installation, state.period, allActivities(state), {
    assumptions: state.assumptions,
    excludedActivityIds: state.exclusions.map((e) => e.activityId),
    rejectedRowCount: rejectedRowCount(state),
  });
}

/** Stable key for a finding, so acknowledgements survive a recompute. */
export function findingKey(code: string, title: string): string {
  return `${code}::${title}`;
}
