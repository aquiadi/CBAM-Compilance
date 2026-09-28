import { env } from "@/config/env";
import { recordAudit } from "../audit";
import type { Db, Queryable } from "../db";
import { newId } from "../ids";
import type { Installation, ReportingPeriod } from "../cbam/types";
import type { Actor, Workspace, WorkspaceState } from "./types";

/**
 * Workspace persistence.
 *
 * One JSONB document per workspace with a version number. Every write is
 * compare-and-swap on that version, so two people editing at once cannot
 * silently overwrite each other: the second write reloads, re-applies its
 * change to the fresh state and tries again, and every write lands in the
 * audit log inside the same transaction.
 */

export class WorkspaceConflictError extends Error {
  constructor() {
    super("The workspace was changed by someone else at the same time. Reload and try again.");
    this.name = "WorkspaceConflictError";
  }
}

interface WorkspaceRow {
  id: string;
  org_id: string;
  name: string;
  state: WorkspaceState | string;
  version: number;
  updated_at: Date | string;
}

function toWorkspace(r: WorkspaceRow): Workspace {
  const state = (typeof r.state === "string" ? JSON.parse(r.state) : r.state) as WorkspaceState;
  // Documents written before a field existed get its empty default.
  state.supplierData ??= [];
  state.acknowledged ??= [];
  state.exclusions ??= [];
  return {
    id: r.id,
    orgId: r.org_id,
    name: r.name,
    state,
    version: Number(r.version),
    updatedAt: new Date(r.updated_at).toISOString(),
  };
}

export function emptyState(installation: Installation, period: ReportingPeriod): WorkspaceState {
  return {
    schemaVersion: 1,
    installation,
    period,
    assumptions: {
      etsPriceEur: env.CARBONPASS_ETS_PRICE_EUR,
      inrPerEur: env.CARBONPASS_INR_PER_EUR,
    },
    datasets: [],
    exclusions: [],
    acknowledged: [],
    supplierData: [],
  };
}

export async function createWorkspace(
  db: Db,
  args: { orgId: string; name: string; state: WorkspaceState; actor: Actor },
): Promise<Workspace> {
  const id = newId("ws");
  return db.tx(async (q) => {
    const { rows } = await q.query<WorkspaceRow>(
      `INSERT INTO workspaces (id, org_id, name, state) VALUES ($1, $2, $3, $4)
       RETURNING id, org_id, name, state, version, updated_at`,
      [id, args.orgId, args.name, JSON.stringify(args.state)],
    );
    await recordAudit(q, {
      orgId: args.orgId,
      workspaceId: id,
      actor: args.actor,
      action: "workspace.created",
      detail: { name: args.name, installation: args.state.installation.name },
    });
    const row = rows[0];
    if (!row) throw new Error("Workspace was not created");
    return toWorkspace(row);
  });
}

export async function getWorkspace(q: Queryable, id: string): Promise<Workspace | null> {
  const { rows } = await q.query<WorkspaceRow>(
    "SELECT id, org_id, name, state, version, updated_at FROM workspaces WHERE id = $1",
    [id],
  );
  return rows[0] ? toWorkspace(rows[0]) : null;
}

export async function listWorkspaces(
  q: Queryable,
  orgId: string,
): Promise<{ id: string; name: string; updatedAt: string; installation: string; year: number }[]> {
  const { rows } = await q.query<{
    id: string;
    name: string;
    updated_at: Date | string;
    installation: string | null;
    year: number | string | null;
  }>(
    `SELECT id, name, updated_at,
            state->'installation'->>'name' AS installation,
            (state->'period'->>'year') AS year
       FROM workspaces WHERE org_id = $1 ORDER BY updated_at DESC`,
    [orgId],
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    updatedAt: new Date(r.updated_at).toISOString(),
    installation: r.installation ?? "",
    year: Number(r.year ?? 0),
  }));
}

/**
 * Apply a change to a workspace and record it. `mutate` may be re-run against
 * fresher state if someone else wrote in between, so it must be a pure
 * function of the state it is given.
 */
export async function updateWorkspace<T = void>(
  db: Db,
  args: {
    workspaceId: string;
    actor: Actor;
    action: string;
    detail?: Record<string, unknown>;
    mutate: (state: WorkspaceState, ws: Workspace) => T | Promise<T>;
    rename?: string;
  },
): Promise<{ workspace: Workspace; result: T }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await getWorkspace(db, args.workspaceId);
    if (!current) throw new Error("Workspace not found");
    const state = structuredClone(current.state);
    const result = await args.mutate(state, current);

    const saved = await db.tx(async (q) => {
      const { rows } = await q.query<WorkspaceRow>(
        `UPDATE workspaces SET state = $1, version = version + 1, updated_at = now(), name = $4
           WHERE id = $2 AND version = $3
         RETURNING id, org_id, name, state, version, updated_at`,
        [JSON.stringify(state), args.workspaceId, current.version, args.rename ?? current.name],
      );
      const row = rows[0];
      if (!row) return null;
      await recordAudit(q, {
        orgId: current.orgId,
        workspaceId: current.id,
        actor: args.actor,
        action: args.action,
        detail: args.detail,
      });
      return toWorkspace(row);
    });
    if (saved) return { workspace: saved, result };
  }
  throw new WorkspaceConflictError();
}

export async function deleteWorkspace(db: Db, ws: Workspace, actor: Actor): Promise<void> {
  await db.tx(async (q) => {
    await q.query("DELETE FROM workspaces WHERE id = $1", [ws.id]);
    await recordAudit(q, {
      orgId: ws.orgId,
      workspaceId: null,
      actor,
      action: "workspace.deleted",
      detail: { workspaceId: ws.id, name: ws.name },
    });
  });
}
