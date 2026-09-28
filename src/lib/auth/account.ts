import { recordAudit } from "../audit";
import type { Db, Queryable } from "../db";
import { UserError } from "../errors";
import { findUserByEmail, membershipsFor, type User } from "./accounts";
import { hashPassword, passwordProblem, verifyPassword } from "./password";

/**
 * A person's own account: changing the password and ending sessions on other
 * devices. Two-factor lives in ./two-factor.
 */

export interface SessionInfo {
  id: string;
  createdAt: string;
  expiresAt: string;
  userAgent: string | null;
  current: boolean;
}

export async function listSessions(
  q: Queryable,
  userId: string,
  currentId: string | null,
): Promise<SessionInfo[]> {
  const { rows } = await q.query<{
    id: string;
    created_at: Date | string;
    expires_at: Date | string;
    user_agent: string | null;
  }>(
    `SELECT id, created_at, expires_at, user_agent FROM sessions
      WHERE user_id = $1 AND expires_at > now() ORDER BY created_at DESC`,
    [userId],
  );
  return rows.map((r) => ({
    // Only a prefix leaves the server: enough to tell sessions apart, never enough to use one.
    id: r.id.slice(0, 8),
    createdAt: new Date(r.created_at).toISOString(),
    expiresAt: new Date(r.expires_at).toISOString(),
    userAgent: r.user_agent,
    current: r.id === currentId,
  }));
}

/** Ends every session of this person except the one making the request. */
export async function endOtherSessions(
  q: Queryable,
  userId: string,
  currentId: string | null,
): Promise<number> {
  const { rows } = await q.query<{ id: string }>(
    "DELETE FROM sessions WHERE user_id = $1 AND id <> $2 RETURNING id",
    [userId, currentId ?? ""],
  );
  return rows.length;
}

async function audit(
  q: Queryable,
  user: User,
  action: string,
  detail: Record<string, unknown> = {},
) {
  for (const m of await membershipsFor(q, user.id)) {
    await recordAudit(q, {
      orgId: m.orgId,
      actor: { id: user.id, label: user.email },
      action,
      detail,
    });
  }
}

/**
 * Changes the password after checking the current one, and signs out every
 * other device - the usual reason to change a password is suspecting someone
 * else has it.
 */
export async function changePassword(
  db: Db,
  user: User,
  args: { current: string; next: string; currentSessionId: string | null },
): Promise<void> {
  const problem = passwordProblem(args.next);
  if (problem) throw new UserError(problem, 400);
  const stored = await findUserByEmail(db, user.email);
  if (!stored || !(await verifyPassword(args.current, stored.passwordHash))) {
    throw new UserError("Your current password is not right.", 400);
  }
  const hash = await hashPassword(args.next);
  await db.tx(async (q) => {
    await q.query("UPDATE users SET password_hash = $1 WHERE id = $2", [hash, user.id]);
    const ended = await endOtherSessions(q, user.id, args.currentSessionId);
    await audit(q, user, "account.password_changed", { otherSessionsEnded: ended });
  });
}
