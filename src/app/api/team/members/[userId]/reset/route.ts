import { NextResponse } from "next/server";
import { recordAudit } from "@/lib/audit";
import { orgMembers } from "@/lib/auth/accounts";
import { apiContext, jsonError, publicBaseUrl } from "@/lib/auth/context";
import { createPasswordReset, OWNER_ISSUED_HOURS } from "@/lib/auth/reset";
import { errorResponse } from "@/lib/http";
import { sendMail } from "@/lib/mail";

export const dynamic = "force-dynamic";

/**
 * An owner creates a password-reset link for a member of their organisation.
 * It is shown to the owner to pass on (and e-mailed to the member when mail is
 * configured), so a forgotten password never locks anyone out of a deployment
 * that has no mail service.
 */
export async function POST(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const r = await apiContext(request, { roles: ["owner"] });
  if (!r.ok) return r.response;
  if (userId === r.ctx.user.id) {
    return jsonError(400, "Change your own password by signing out and using “Forgot password”.");
  }
  try {
    const member = (await orgMembers(r.ctx.db, r.ctx.org.id)).find((m) => m.userId === userId);
    if (!member) return jsonError(404, "Member not found.");
    const { token, expiresAt } = await createPasswordReset(r.ctx.db, {
      userId,
      issuedBy: r.ctx.user.id,
      minutes: OWNER_ISSUED_HOURS * 60,
    });
    const link = `${publicBaseUrl(request)}/reset/${token}`;
    const emailed = await sendMail({
      to: member.email,
      subject: "Your CarbonPass password reset link",
      text: [
        `Hello ${member.name},`,
        "",
        `${r.ctx.user.name} (${r.ctx.org.name}) created a link for you to choose a new CarbonPass password.`,
        `It works once, within ${OWNER_ISSUED_HOURS} hours:`,
        "",
        link,
      ].join("\n"),
    });
    await recordAudit(r.ctx.db, {
      orgId: r.ctx.org.id,
      actor: r.ctx.actor,
      action: "team.password_reset_issued",
      detail: { email: member.email, emailed },
    });
    return NextResponse.json({ ok: true, link, expiresAt, emailed });
  } catch (error) {
    return errorResponse(error);
  }
}
