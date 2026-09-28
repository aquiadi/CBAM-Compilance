import { recordAudit } from "../audit";
import type { Db, Queryable } from "../db";
import { hashToken, newId, newToken } from "../ids";
import { UserError } from "../errors";
import { hashPassword } from "./password";

/**
 * Users, organisations, memberships and invitations.
 *
 * An organisation is the exporter; its workspaces are installations and
 * reporting years. Roles:
 *
 * - owner    - everything, including the team and deleting workspaces
 * - editor   - uploads, mappings, settings, evidence, supplier requests
 * - viewer   - reads everything, changes nothing
 * - verifier - read-only access for the accredited verifier, including every
 *              source file and the verifier pack
 */

export type Role = "owner" | "editor" | "viewer" | "verifier";

export const ROLES: Record<Role, { label: string; description: string }> = {
  owner: {
    label: "Owner",
    description: "Full access, including the team and deleting workspaces.",
  },
  editor: {
    label: "Editor",
    description: "Uploads data, reviews mappings, edits settings, manages evidence and suppliers.",
  },
  viewer: { label: "Viewer", description: "Reads everything; changes nothing." },
  verifier: {
    label: "Verifier",
    description:
      "Read-only access for your accredited verifier, including source files and the verifier pack.",
  },
};

export const CAN_WRITE: Role[] = ["owner", "editor"];

export interface User {
  id: string;
  email: string;
  name: string;
}

export interface Membership {
  orgId: string;
  orgName: string;
  role: Role;
}

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function validEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

export async function findUserByEmail(
  q: Queryable,
  email: string,
): Promise<(User & { passwordHash: string }) | null> {
  const { rows } = await q.query<{
    id: string;
    email: string;
    name: string;
    password_hash: string;
  }>("SELECT id, email, name, password_hash FROM users WHERE email = $1", [normaliseEmail(email)]);
  const r = rows[0];
  return r ? { id: r.id, email: r.email, name: r.name, passwordHash: r.password_hash } : null;
}

export async function createUser(
  q: Queryable,
  args: { email: string; name: string; password: string },
): Promise<User> {
  const id = newId("usr");
  const email = normaliseEmail(args.email);
  await q.query("INSERT INTO users (id, email, name, password_hash) VALUES ($1, $2, $3, $4)", [
    id,
    email,
    args.name.trim(),
    await hashPassword(args.password),
  ]);
  return { id, email, name: args.name.trim() };
}

export async function createOrganisation(
  db: Db,
  args: { name: string; owner: User },
): Promise<{ id: string; name: string }> {
  const id = newId("org");
  await db.tx(async (q) => {
    await q.query("INSERT INTO organisations (id, name) VALUES ($1, $2)", [id, args.name.trim()]);
    await q.query("INSERT INTO memberships (org_id, user_id, role) VALUES ($1, $2, 'owner')", [
      id,
      args.owner.id,
    ]);
    await recordAudit(q, {
      orgId: id,
      actor: { id: args.owner.id, label: args.owner.email },
      action: "organisation.created",
      detail: { name: args.name.trim() },
    });
  });
  return { id, name: args.name.trim() };
}

export async function membershipsFor(q: Queryable, userId: string): Promise<Membership[]> {
  const { rows } = await q.query<{ org_id: string; name: string; role: Role }>(
    `SELECT m.org_id, o.name, m.role FROM memberships m JOIN organisations o ON o.id = m.org_id
      WHERE m.user_id = $1 ORDER BY m.created_at`,
    [userId],
  );
  return rows.map((r) => ({ orgId: r.org_id, orgName: r.name, role: r.role }));
}

export async function orgMembers(
  q: Queryable,
  orgId: string,
): Promise<{ userId: string; email: string; name: string; role: Role; since: string }[]> {
  const { rows } = await q.query<{
    user_id: string;
    email: string;
    name: string;
    role: Role;
    created_at: Date | string;
  }>(
    `SELECT m.user_id, u.email, u.name, m.role, m.created_at FROM memberships m
       JOIN users u ON u.id = m.user_id WHERE m.org_id = $1 ORDER BY m.created_at`,
    [orgId],
  );
  return rows.map((r) => ({
    userId: r.user_id,
    email: r.email,
    name: r.name,
    role: r.role,
    since: new Date(r.created_at).toISOString(),
  }));
}

export async function ownerCount(q: Queryable, orgId: string): Promise<number> {
  const { rows } = await q.query<{ n: string | number }>(
    "SELECT count(*) AS n FROM memberships WHERE org_id = $1 AND role = 'owner'",
    [orgId],
  );
  return Number(rows[0]?.n ?? 0);
}

// ---------------------------------------------------------------- invitations

export const INVITATION_DAYS = 14;

export async function createInvitation(
  db: Db,
  args: { orgId: string; email: string; role: Role; invitedBy: User },
): Promise<{ id: string; token: string; expiresAt: string }> {
  const id = newId("inv");
  const token = newToken();
  const expiresAt = new Date(Date.now() + INVITATION_DAYS * 86_400_000).toISOString();
  await db.tx(async (q) => {
    await q.query(
      `INSERT INTO invitations (id, org_id, email, role, token_hash, invited_by, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        id,
        args.orgId,
        normaliseEmail(args.email),
        args.role,
        hashToken(token),
        args.invitedBy.id,
        expiresAt,
      ],
    );
    await recordAudit(q, {
      orgId: args.orgId,
      actor: { id: args.invitedBy.id, label: args.invitedBy.email },
      action: "team.invited",
      detail: { email: normaliseEmail(args.email), role: args.role },
    });
  });
  return { id, token, expiresAt };
}

export interface Invitation {
  id: string;
  orgId: string;
  orgName: string;
  email: string;
  role: Role;
  expiresAt: string;
  acceptedAt: string | null;
}

export async function findInvitation(q: Queryable, token: string): Promise<Invitation | null> {
  const { rows } = await q.query<{
    id: string;
    org_id: string;
    name: string;
    email: string;
    role: Role;
    expires_at: Date | string;
    accepted_at: Date | string | null;
  }>(
    `SELECT i.id, i.org_id, o.name, i.email, i.role, i.expires_at, i.accepted_at
       FROM invitations i JOIN organisations o ON o.id = i.org_id WHERE i.token_hash = $1`,
    [hashToken(token)],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    orgId: r.org_id,
    orgName: r.name,
    email: r.email,
    role: r.role,
    expiresAt: new Date(r.expires_at).toISOString(),
    acceptedAt: r.accepted_at ? new Date(r.accepted_at).toISOString() : null,
  };
}

export async function pendingInvitations(
  q: Queryable,
  orgId: string,
): Promise<{ id: string; email: string; role: Role; expiresAt: string }[]> {
  const { rows } = await q.query<{
    id: string;
    email: string;
    role: Role;
    expires_at: Date | string;
  }>(
    `SELECT id, email, role, expires_at FROM invitations
      WHERE org_id = $1 AND accepted_at IS NULL AND expires_at > now() ORDER BY created_at DESC`,
    [orgId],
  );
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    role: r.role,
    expiresAt: new Date(r.expires_at).toISOString(),
  }));
}

/** Why this invitation cannot be accepted by `email`, or null when it can. */
export function invitationProblem(invitation: Invitation, email: string): UserError | null {
  if (invitation.acceptedAt) return new UserError("This invitation has already been used.", 410);
  if (new Date(invitation.expiresAt).getTime() < Date.now()) {
    return new UserError("This invitation has expired. Ask for a new one.", 410);
  }
  if (normaliseEmail(invitation.email) !== normaliseEmail(email)) {
    return new UserError(`This invitation was sent to ${invitation.email}. Use that address.`, 403);
  }
  return null;
}

/** Adds the user to the invited organisation. The invitation's e-mail must match. */
export async function acceptInvitation(db: Db, invitation: Invitation, user: User): Promise<void> {
  const problem = invitationProblem(invitation, user.email);
  if (problem) throw problem;
  await db.tx(async (q) => {
    await q.query(
      `INSERT INTO memberships (org_id, user_id, role) VALUES ($1, $2, $3)
       ON CONFLICT (org_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
      [invitation.orgId, user.id, invitation.role],
    );
    await q.query("UPDATE invitations SET accepted_at = now() WHERE id = $1", [invitation.id]);
    await recordAudit(q, {
      orgId: invitation.orgId,
      actor: { id: user.id, label: user.email },
      action: "team.joined",
      detail: { role: invitation.role },
    });
  });
}
