import type { Queryable } from "./db";
import type { Actor } from "./workspace/types";

/**
 * The activity log.
 *
 * Every change to a workspace, a team or a supplier request is recorded with
 * who made it and what it touched - "who excluded this row, and why" is a
 * question a verifier asks, and the answer has to be better than "someone".
 * Append-only: nothing in the application updates or deletes an event.
 */

export interface AuditEvent {
  id: string;
  orgId: string;
  workspaceId: string | null;
  actorId: string | null;
  actorLabel: string;
  action: string;
  detail: Record<string, unknown>;
  createdAt: string;
}

export async function recordAudit(
  q: Queryable,
  event: {
    orgId: string;
    workspaceId?: string | null;
    actor: Actor;
    action: string;
    detail?: Record<string, unknown>;
  },
): Promise<void> {
  await q.query(
    `INSERT INTO audit_events (org_id, workspace_id, actor_id, actor_label, action, detail)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      event.orgId,
      event.workspaceId ?? null,
      event.actor.id,
      event.actor.label,
      event.action,
      JSON.stringify(event.detail ?? {}),
    ],
  );
}

interface AuditRow {
  id: string | number;
  org_id: string;
  workspace_id: string | null;
  actor_id: string | null;
  actor_label: string;
  action: string;
  detail: Record<string, unknown> | string;
  created_at: Date | string;
}

export async function listAudit(
  q: Queryable,
  filter: { orgId: string; workspaceId?: string; limit?: number },
): Promise<AuditEvent[]> {
  const { rows } = await q.query<AuditRow>(
    filter.workspaceId
      ? `SELECT * FROM audit_events WHERE org_id = $1 AND (workspace_id = $2 OR workspace_id IS NULL)
         ORDER BY created_at DESC, id DESC LIMIT $3`
      : `SELECT * FROM audit_events WHERE org_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2`,
    filter.workspaceId
      ? [filter.orgId, filter.workspaceId, filter.limit ?? 200]
      : [filter.orgId, filter.limit ?? 200],
  );
  return rows.map((r) => ({
    id: String(r.id),
    orgId: r.org_id,
    workspaceId: r.workspace_id,
    actorId: r.actor_id,
    actorLabel: r.actor_label,
    action: r.action,
    detail: typeof r.detail === "string" ? JSON.parse(r.detail) : r.detail,
    createdAt: new Date(r.created_at).toISOString(),
  }));
}
