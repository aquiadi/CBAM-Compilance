import { buildDeclaration, type DeclarationResult } from "../cbam/declaration";
import type { ActivityRecord, PrecursorActivity } from "../cbam/types";
import type { SupplierData, WorkspaceState } from "./types";

/**
 * Turns a workspace into the engine's inputs and runs it.
 *
 * Only confirmed datasets count. Accepted supplier data fills in precursor
 * records from that supplier that carry no values of their own; a row's own
 * values always win, because they are what the source document says.
 */

function normaliseName(name: string | undefined): string {
  return (name ?? "")
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function applySupplierData(
  activities: ActivityRecord[],
  supplierData: SupplierData[],
): ActivityRecord[] {
  if (supplierData.length === 0) return activities;
  return activities.map((a) => {
    if (a.kind !== "precursor" || a.supplier) return a;
    const match = supplierData.find(
      (s) =>
        s.cnCode === a.cnCode &&
        normaliseName(s.supplierName) !== "" &&
        normaliseName(s.supplierName) === normaliseName(a.supplierName),
    );
    if (!match) return a;
    const updated: PrecursorActivity = {
      ...a,
      supplier: {
        seeDirect: match.seeDirect,
        seeIndirect: match.seeIndirect,
        sefa: match.sefa,
        verified: match.verified,
      },
      provenance: "supplier",
      tier: match.verified ? 3 : 2,
    };
    return updated;
  });
}

export function workspaceActivities(state: WorkspaceState): ActivityRecord[] {
  const confirmed = state.datasets.filter((d) => d.status === "confirmed");
  return applySupplierData(
    confirmed.flatMap((d) => d.activities),
    state.supplierData,
  );
}

export function declarationFor(
  state: WorkspaceState,
  options: { evidenceActivityIds?: Set<string> } = {},
): DeclarationResult {
  const confirmed = state.datasets.filter((d) => d.status === "confirmed");
  const evidence = options.evidenceActivityIds ?? new Set<string>();
  const activities = workspaceActivities(state).map((a) =>
    a.kind === "carbon_price" && !a.evidenceAttached && evidence.has(a.id)
      ? { ...a, evidenceAttached: true }
      : a,
  );

  return buildDeclaration(state.installation, state.period, activities, {
    assumptions: {
      etsPriceEur: state.assumptions.etsPriceEur,
      inrPerEur: state.assumptions.inrPerEur,
      year: state.period.year,
    },
    excludedActivityIds: state.exclusions.map((e) => e.activityId),
    rejectedRowCount: confirmed.reduce((s, d) => s + d.rejected.length, 0),
    outOfScopeRows: confirmed.flatMap((d) =>
      d.skipped.map((r) => ({
        fileName: r.fileName,
        row: r.row,
        cnCode: r.cnCode,
        description: r.description,
      })),
    ),
    acknowledged: state.acknowledged,
  });
}

/** Stable key for a finding, so acknowledgements survive a recompute. */
export function findingKey(code: string, title: string): string {
  return `${code}::${title}`;
}

/**
 * The declaration as the app shows it: workspace state plus evidence links
 * from the files table (a carbon-price claim counts as evidenced once a
 * document is attached to it).
 */
export async function computeDeclaration(
  q: import("../db").Queryable,
  ws: { id: string; state: WorkspaceState },
): Promise<DeclarationResult> {
  const { listFiles } = await import("../files");
  const evidence = await listFiles(q, ws.id, "evidence");
  const ids = new Set(evidence.flatMap((f) => f.links.activityIds ?? []));
  return declarationFor(ws.state, { evidenceActivityIds: ids });
}
