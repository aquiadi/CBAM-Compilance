import { randomBytes } from "node:crypto";
import QRCode from "qrcode";
import { recordAudit } from "../audit";
import type { Db, Queryable } from "../db";
import { UserError } from "../errors";
import { hashToken, newId, newToken } from "../ids";
import { seal, unseal } from "../secret-box";
import { membershipsFor, type User } from "./accounts";
import { matchCode, newSecret, otpauthUri } from "./totp";

/**
 * Two-factor sign-in.
 *
 * After the password, a person with two-factor on enters a six-digit code from
 * their authenticator app, or one of ten single-use recovery codes. The secret
 * is sealed at rest (see ../secret-box), recovery codes are stored hashed, a
 * code's time step cannot be used twice, and a sign-in challenge allows five
 * tries in five minutes.
 *
 * Losing both the phone and the recovery codes is recoverable: an owner of the
 * organisation can reset a member's two-factor, which is recorded in the
 * activity log.
 */

export const CHALLENGE_MINUTES = 5;
const MAX_ATTEMPTS = 5;
const RECOVERY_CODES = 10;

export interface TwoFactorStatus {
  enabled: boolean;
  enabledAt: string | null;
  recoveryCodesLeft: number;
}

export async function twoFactorStatus(q: Queryable, userId: string): Promise<TwoFactorStatus> {
  const { rows } = await q.query<{ totp_enabled_at: Date | string | null; left: string | number }>(
    `SELECT u.totp_enabled_at,
            (SELECT count(*) FROM recovery_codes r WHERE r.user_id = u.id AND r.used_at IS NULL) AS left
       FROM users u WHERE u.id = $1`,
    [userId],
  );
  const r = rows[0];
  return {
    enabled: Boolean(r?.totp_enabled_at),
    enabledAt: r?.totp_enabled_at ? new Date(r.totp_enabled_at).toISOString() : null,
    recoveryCodesLeft: Number(r?.left ?? 0),
  };
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

/** Starts enrolment: a new secret, pending until a code from it is confirmed. */
export async function beginEnrolment(
  q: Queryable,
  user: User,
): Promise<{ secret: string; uri: string; qr: string }> {
  if ((await twoFactorStatus(q, user.id)).enabled) {
    throw new UserError(
      "Two-factor sign-in is already on. Turn it off first to set it up again.",
      409,
    );
  }
  const secret = newSecret();
  await q.query("UPDATE users SET totp_secret = $1, totp_last_step = NULL WHERE id = $2", [
    seal(secret),
    user.id,
  ]);
  const uri = otpauthUri(user.email, secret);
  const svg = await QRCode.toString(uri, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  return { secret, uri, qr: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}` };
}

function newRecoveryCode(): string {
  // 10 characters from an unambiguous alphabet, shown as xxxxx-xxxxx.
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(10);
  const raw = [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
  return `${raw.slice(0, 5)}-${raw.slice(5)}`;
}

const normaliseRecovery = (code: string) => code.toLowerCase().replace(/[^a-z0-9]/g, "");

async function issueRecoveryCodes(q: Queryable, userId: string): Promise<string[]> {
  await q.query("DELETE FROM recovery_codes WHERE user_id = $1", [userId]);
  const codes = Array.from({ length: RECOVERY_CODES }, newRecoveryCode);
  for (const code of codes) {
    await q.query("INSERT INTO recovery_codes (id, user_id, code_hash) VALUES ($1, $2, $3)", [
      newId("rc"),
      userId,
      hashToken(normaliseRecovery(code)),
    ]);
  }
  return codes;
}

async function storedSecret(q: Queryable, userId: string) {
  const { rows } = await q.query<{
    totp_secret: string | null;
    totp_enabled_at: Date | string | null;
    totp_last_step: string | number | null;
  }>("SELECT totp_secret, totp_enabled_at, totp_last_step FROM users WHERE id = $1", [userId]);
  const r = rows[0];
  return r?.totp_secret
    ? {
        secret: unseal(r.totp_secret),
        enabled: Boolean(r.totp_enabled_at),
        lastStep: r.totp_last_step === null ? null : Number(r.totp_last_step),
      }
    : null;
}

/**
 * Checks an authenticator code and records its time step, so the same code
 * cannot be used again. Runs inside the caller's transaction.
 */
async function acceptTotp(q: Queryable, userId: string, code: string): Promise<boolean> {
  const stored = await storedSecret(q, userId);
  if (!stored) return false;
  const step = matchCode(stored.secret, code);
  if (step === null || (stored.lastStep !== null && step <= stored.lastStep)) return false;
  const updated = await q.query(
    `UPDATE users SET totp_last_step = $1
      WHERE id = $2 AND (totp_last_step IS NULL OR totp_last_step < $1) RETURNING id`,
    [step, userId],
  );
  return updated.rows.length === 1;
}

async function acceptRecoveryCode(q: Queryable, userId: string, code: string): Promise<boolean> {
  const spent = await q.query(
    `UPDATE recovery_codes SET used_at = now()
      WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL RETURNING id`,
    [userId, hashToken(normaliseRecovery(code))],
  );
  return spent.rows.length === 1;
}

/** Either kind of code; which one was used goes in the activity log. */
async function acceptAnyCode(
  q: Queryable,
  userId: string,
  code: string,
): Promise<"totp" | "recovery" | null> {
  if (/^\s*\d{6}\s*$/.test(code)) return (await acceptTotp(q, userId, code)) ? "totp" : null;
  return (await acceptRecoveryCode(q, userId, code)) ? "recovery" : null;
}

/** Confirms enrolment with a first code; returns the recovery codes, shown once. */
export async function confirmEnrolment(db: Db, user: User, code: string): Promise<string[]> {
  return db.tx(async (q) => {
    const stored = await storedSecret(q, user.id);
    if (!stored) throw new UserError("Start setting up two-factor sign-in first.", 400);
    if (stored.enabled) throw new UserError("Two-factor sign-in is already on.", 409);
    if (!(await acceptTotp(q, user.id, code))) {
      throw new UserError(
        "That code did not match. Check the time on your phone is set automatically, then try the current code.",
        400,
      );
    }
    await q.query("UPDATE users SET totp_enabled_at = now() WHERE id = $1", [user.id]);
    const codes = await issueRecoveryCodes(q, user.id);
    await audit(q, user, "account.two_factor_enabled");
    return codes;
  });
}

/** Turning it off needs a current code (or a recovery code) as well as the session. */
export async function disableTwoFactor(db: Db, user: User, code: string): Promise<void> {
  await db.tx(async (q) => {
    if (!(await twoFactorStatus(q, user.id)).enabled) return;
    if (!(await acceptAnyCode(q, user.id, code)))
      throw new UserError("That code did not match.", 400);
    await clearTwoFactor(q, user.id);
    await audit(q, user, "account.two_factor_disabled");
  });
}

export async function regenerateRecoveryCodes(db: Db, user: User, code: string): Promise<string[]> {
  return db.tx(async (q) => {
    if (!(await twoFactorStatus(q, user.id)).enabled) {
      throw new UserError("Two-factor sign-in is off.", 400);
    }
    if (!(await acceptTotp(q, user.id, code))) {
      throw new UserError("Enter the current code from your authenticator app.", 400);
    }
    const codes = await issueRecoveryCodes(q, user.id);
    await audit(q, user, "account.recovery_codes_regenerated");
    return codes;
  });
}

async function clearTwoFactor(q: Queryable, userId: string) {
  await q.query(
    "UPDATE users SET totp_secret = NULL, totp_enabled_at = NULL, totp_last_step = NULL WHERE id = $1",
    [userId],
  );
  await q.query("DELETE FROM recovery_codes WHERE user_id = $1", [userId]);
}

/** An owner resets a locked-out member's two-factor; they set it up again after signing in. */
export async function resetMemberTwoFactor(
  db: Db,
  args: { orgId: string; owner: User; memberId: string; memberEmail: string },
): Promise<void> {
  await db.tx(async (q) => {
    await clearTwoFactor(q, args.memberId);
    await q.query("DELETE FROM sessions WHERE user_id = $1", [args.memberId]);
    await recordAudit(q, {
      orgId: args.orgId,
      actor: { id: args.owner.id, label: args.owner.email },
      action: "team.two_factor_reset",
      detail: { member: args.memberEmail },
    });
  });
}

// ------------------------------------------------------------ sign-in challenge

/** After a correct password: a short-lived challenge the code must answer. */
export async function createLoginChallenge(q: Queryable, userId: string): Promise<string> {
  const token = newToken();
  await q.query("DELETE FROM login_challenges WHERE user_id = $1 OR expires_at < now()", [userId]);
  await q.query("INSERT INTO login_challenges (id, user_id, expires_at) VALUES ($1, $2, $3)", [
    hashToken(token),
    userId,
    new Date(Date.now() + CHALLENGE_MINUTES * 60_000).toISOString(),
  ]);
  return token;
}

/**
 * Answers a challenge; returns the user to start a session for. A wrong code
 * is counted in its own committed write, so the limit holds.
 */
export async function completeLoginChallenge(db: Db, token: string, code: string): Promise<User> {
  const id = hashToken(token);
  const outcome = await db.tx(
    async (q): Promise<{ user: User } | { error: string; status: 400 | 410 | 422 }> => {
      const { rows } = await q.query<{
        user_id: string;
        attempts: number;
        email: string;
        name: string;
      }>(
        `SELECT c.user_id, c.attempts, u.email, u.name FROM login_challenges c
           JOIN users u ON u.id = c.user_id
          WHERE c.id = $1 AND c.expires_at > now()`,
        [id],
      );
      const challenge = rows[0];
      if (!challenge)
        return { error: "That sign-in has expired. Enter your password again.", status: 410 };
      if (challenge.attempts >= MAX_ATTEMPTS) {
        await q.query("DELETE FROM login_challenges WHERE id = $1", [id]);
        return { error: "Too many wrong codes. Enter your password again.", status: 422 };
      }
      const user: User = { id: challenge.user_id, email: challenge.email, name: challenge.name };
      const used = await acceptAnyCode(q, user.id, code);
      if (!used) {
        await q.query("UPDATE login_challenges SET attempts = attempts + 1 WHERE id = $1", [id]);
        return { error: "That code did not match.", status: 400 };
      }
      await q.query("DELETE FROM login_challenges WHERE id = $1", [id]);
      if (used === "recovery") await audit(q, user, "account.recovery_code_used");
      return { user };
    },
  );
  if ("error" in outcome) throw new UserError(outcome.error, outcome.status);
  return outcome.user;
}
