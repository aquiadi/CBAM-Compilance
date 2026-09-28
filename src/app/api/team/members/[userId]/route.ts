import { NextResponse } from "next/server";
import * as z from "zod/v4";
import { recordAudit } from "@/lib/audit";
import { orgMembers, ownerCount } from "@/lib/auth/accounts";
import { apiContext, jsonError } from "@/lib/auth/context";
import { parseJson } from "@/lib/http";

export const dynamic = "force-dynamic";

const Body = z.object({ role: z.enum(["owner", "editor", "viewer", "verifier"]) });

export async function PATCH(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const r = await apiContext(request, { roles: ["owner"] });
  if (!r.ok) return r.response;
  const body = await parseJson(request, Body);
  if (!body.ok) return body.response;
  const member = (await orgMembers(r.ctx.db, r.ctx.org.id)).find((m) => m.userId === userId);
  if (!member) return jsonError(404, "Member not found.");
  if (
    member.role === "owner" &&
    body.data.role !== "owner" &&
    (await ownerCount(r.ctx.db, r.ctx.org.id)) <= 1
  ) {
    return jsonError(400, "An organisation needs at least one owner.");
  }
  await r.ctx.db.query("UPDATE memberships SET role = $1 WHERE org_id = $2 AND user_id = $3", [
    body.data.role,
    r.ctx.org.id,
    userId,
  ]);
  await recordAudit(r.ctx.db, {
    orgId: r.ctx.org.id,
    actor: r.ctx.actor,
    action: "team.role_changed",
    detail: { email: member.email, from: member.role, to: body.data.role },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params;
  const r = await apiContext(request);
  if (!r.ok) return r.response;
  const leaving = userId === r.ctx.user.id;
  if (!leaving && r.ctx.role !== "owner")
    return jsonError(403, "Only an owner can remove members.");
  const member = (await orgMembers(r.ctx.db, r.ctx.org.id)).find((m) => m.userId === userId);
  if (!member) return jsonError(404, "Member not found.");
  if (member.role === "owner" && (await ownerCount(r.ctx.db, r.ctx.org.id)) <= 1) {
    return jsonError(
      400,
      "An organisation needs at least one owner. Make someone else owner first.",
    );
  }
  await r.ctx.db.query("DELETE FROM memberships WHERE org_id = $1 AND user_id = $2", [
    r.ctx.org.id,
    userId,
  ]);
  await recordAudit(r.ctx.db, {
    orgId: r.ctx.org.id,
    actor: r.ctx.actor,
    action: leaving ? "team.left" : "team.removed",
    detail: { email: member.email, role: member.role },
  });
  return NextResponse.json({ ok: true });
}
