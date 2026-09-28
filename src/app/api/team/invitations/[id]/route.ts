import { NextResponse } from "next/server";
import { recordAudit } from "@/lib/audit";
import { apiContext, jsonError } from "@/lib/auth/context";

export const dynamic = "force-dynamic";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await apiContext(request, { roles: ["owner"] });
  if (!r.ok) return r.response;
  const { rows } = await r.ctx.db.query<{ email: string }>(
    "DELETE FROM invitations WHERE id = $1 AND org_id = $2 AND accepted_at IS NULL RETURNING email",
    [id, r.ctx.org.id],
  );
  if (!rows[0]) return jsonError(404, "Invitation not found.");
  await recordAudit(r.ctx.db, {
    orgId: r.ctx.org.id,
    actor: r.ctx.actor,
    action: "team.invitation_revoked",
    detail: { email: rows[0].email },
  });
  return NextResponse.json({ ok: true });
}
