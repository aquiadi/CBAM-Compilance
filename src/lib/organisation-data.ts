import { strToU8, zipSync } from "fflate";
import { listAudit } from "./audit";
import { orgMembers, pendingInvitations } from "./auth/accounts";
import type { Db } from "./db";
import { UserError } from "./errors";
import { verifierPack } from "./exports/verifier-pack";
import { computeDeclaration } from "./workspace/declaration";
import { getWorkspace, listWorkspaces } from "./workspace/store";

/**
 * An organisation's data, all of it: to take away, and to erase.
 *
 * Export gives each workspace as the same verifier pack a verifier receives
 * (every source file, every piece of evidence, every export, with checksums),
 * plus the workspace state, the members and invitations, and the whole
 * activity log - enough to leave CarbonPass and prove every figure elsewhere.
 *
 * Deletion removes the organisation, its workspaces, files, supplier requests,
 * invitations, memberships and activity log. People's own accounts remain,
 * since they may belong to other organisations; each can be closed separately.
 * India's DPDP Act and the GDPR both give customers these rights; this makes
 * them a button rather than a support ticket.
 */

function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "workspace"
  );
}

export async function exportOrganisation(
  db: Db,
  org: { id: string; name: string },
  generatedBy: string,
): Promise<Uint8Array> {
  const [members, invitations, activity, workspaces] = await Promise.all([
    orgMembers(db, org.id),
    pendingInvitations(db, org.id),
    listAudit(db, { orgId: org.id, limit: 1_000_000 }),
    listWorkspaces(db, org.id),
  ]);
  const files: Record<string, Uint8Array> = {};
  const used = new Set<string>();
  for (const summary of workspaces) {
    const ws = await getWorkspace(db, summary.id);
    if (!ws) continue;
    let dir = slug(`${summary.name}`);
    while (used.has(dir)) dir = `${dir}-${used.size}`;
    used.add(dir);
    const declaration = await computeDeclaration(db, ws);
    files[`workspaces/${dir}/verifier-pack.zip`] = await verifierPack(
      db,
      ws,
      declaration,
      generatedBy,
    );
    files[`workspaces/${dir}/workspace-state.json`] = strToU8(JSON.stringify(ws.state, null, 2));
  }
  files["organisation.json"] = strToU8(
    JSON.stringify(
      {
        organisation: org,
        exportedAt: new Date().toISOString(),
        exportedBy: generatedBy,
        members: members.map((m) => ({
          name: m.name,
          email: m.email,
          role: m.role,
          since: m.since,
          twoFactor: m.twoFactor,
        })),
        pendingInvitations: invitations.map((i) => ({
          email: i.email,
          role: i.role,
          expiresAt: i.expiresAt,
        })),
        workspaces: workspaces.map((w) => ({
          name: w.name,
          installation: w.installation,
          year: w.year,
        })),
      },
      null,
      2,
    ),
  );
  files["activity-log.json"] = strToU8(JSON.stringify(activity, null, 2));
  files["README.txt"] = strToU8(
    [
      `CarbonPass export of ${org.name}, ${new Date().toISOString()}, by ${generatedBy}.`,
      "",
      "organisation.json       members, pending invitations and workspaces",
      "activity-log.json       every recorded change, oldest last",
      "workspaces/<name>/verifier-pack.zip    everything a verifier receives, with SHA-256 checksums",
      "workspaces/<name>/workspace-state.json the workspace exactly as stored",
      "",
      "Passwords, sessions and two-factor secrets are never exported.",
    ].join("\n"),
  );
  return zipSync(files, { level: 6 });
}

/** Deletes everything the organisation owns. The name must be typed to confirm. */
export async function deleteOrganisation(
  db: Db,
  org: { id: string; name: string },
  confirmation: string,
): Promise<void> {
  if (confirmation.trim() !== org.name.trim()) {
    throw new UserError(`Type the organisation's name, "${org.name}", to confirm.`, 400);
  }
  await db.tx(async (q) => {
    await q.query("DELETE FROM audit_events WHERE org_id = $1", [org.id]);
    // Memberships, invitations, workspaces - and through them files and
    // supplier requests - go with the organisation (ON DELETE CASCADE).
    await q.query("DELETE FROM organisations WHERE id = $1", [org.id]);
  });
}
