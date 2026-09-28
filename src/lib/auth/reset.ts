import { recordAudit } from "../audit";
import type { Db, Queryable } from "../db";
import { UserError } from "../errors";
import { hashToken, newId, newToken } from "../ids";
import { membershipsFor, type User } from "./accounts";
import { hashPassword, passwordProblem } from "./password";

/**
 * Password resets.
 *
 * A reset is a random token, stored hashed, usable once, that expires. Two
 * ways to get one:
 *
 * - "Forgot password" e-mails a link that is valid for an hour. It is only
 *   offered when mail is configured, and the response is the same whether or
 *   not the address has an account, so it cannot be used to find out who
 *   does.
 * - An owner creates a link for a member of their organisation, valid for a
 *   day, and passes it on themselves. This works with no mail at all.
 *
 * Using a reset changes the password and signs the person out everywhere,
 * so a stolen session dies with the old password.
 */

export const SELF_SERVICE_MINUTES = 60;
export const OWNER_ISSUED_HOURS = 24;

export async function createPasswordReset(
  q: Queryable,
  args: { userId: string; issuedBy: string; minutes: number },
): Promise<{ token: string; expiresAt: string }> {
  const token = newToken();
  const expiresAt = new Date(Date.now() + args.minutes * 60_000).toISOString();
  // A new link replaces any unused one for the same person.
  await q.query(
    "UPDATE password_resets SET used_at = now() WHERE user_id = $1 AND used_at IS NULL",
    [args.userId],
  );
  await q.query(
    `INSERT INTO password_resets (id, user_id, token_hash, issued_by, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [newId("pwr"), args.userId, hashToken(token), args.issuedBy, expiresAt],
  );
  return { token, expiresAt };
}

export interface PendingReset {
  userId: string;
  email: string;
  name: string;
  expiresAt: string;
}

/** The reset a token belongs to, if it is still usable. */
export async function findReset(q: Queryable, token: string): Promise<PendingReset | null> {
  const { rows } = await q.query<{
    user_id: string;
    email: string;
    name: string;
    expires_at: Date | string;
  }>(
    `SELECT r.user_id, u.email, u.name, r.expires_at FROM password_resets r
       JOIN users u ON u.id = r.user_id
      WHERE r.token_hash = $1 AND r.used_at IS NULL AND r.expires_at > now()`,
    [hashToken(token)],
  );
  const r = rows[0];
  return r
    ? {
        userId: r.user_id,
        email: r.email,
        name: r.name,
        expiresAt: new Date(r.expires_at).toISOString(),
      }
    : null;
}

/** Sets the new password, spends the token and ends every session of that user. */
export async function completeReset(db: Db, token: string, password: string): Promise<User> {
  const problem = passwordProblem(password);
  if (problem) throw new UserError(problem, 400);
  const reset = await findReset(db, token);
  if (!reset) {
    throw new UserError(
      "This reset link has expired or has already been used. Ask for a new one.",
      410,
    );
  }
  const hash = await hashPassword(password);
  await db.tx(async (q) => {
    const spent = await q.query<{ id: string }>(
      `UPDATE password_resets SET used_at = now()
        WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now() RETURNING id`,
      [hashToken(token)],
    );
    // Two tabs racing on the same link: only one wins.
    if (spent.rows.length === 0) throw new UserError("This reset link has already been used.", 410);
    await q.query("UPDATE users SET password_hash = $1 WHERE id = $2", [hash, reset.userId]);
    await q.query("DELETE FROM sessions WHERE user_id = $1", [reset.userId]);
    for (const m of await membershipsFor(q, reset.userId)) {
      await recordAudit(q, {
        orgId: m.orgId,
        actor: { id: reset.userId, label: reset.email },
        action: "account.password_reset",
        detail: {},
      });
    }
  });
  return { id: reset.userId, email: reset.email, name: reset.name };
}
