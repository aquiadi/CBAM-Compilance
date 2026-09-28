import { NextResponse } from "next/server";
import * as z from "zod/v4";
import {
  createInvitation,
  INVITATION_DAYS,
  normaliseEmail,
  orgMembers,
  ROLES,
  validEmail,
} from "@/lib/auth/accounts";
import { apiContext, jsonError, publicBaseUrl } from "@/lib/auth/context";
import { errorResponse, parseJson } from "@/lib/http";
import { sendMail } from "@/lib/mail";

export const dynamic = "force-dynamic";

const Body = z.object({
  email: z.string().trim().max(254),
  role: z.enum(["owner", "editor", "viewer", "verifier"]),
});

/**
 * Invites someone to the organisation. The link is always returned for the
 * owner to pass on, and also e-mailed when mail is configured, so no mail
 * service is needed to run it.
 */
export async function POST(request: Request) {
  const r = await apiContext(request, { roles: ["owner"] });
  if (!r.ok) return r.response;
  const body = await parseJson(request, Body);
  if (!body.ok) return body.response;
  if (!validEmail(body.data.email)) return jsonError(400, "Enter a valid e-mail address.");
  try {
    const members = await orgMembers(r.ctx.db, r.ctx.org.id);
    if (members.some((m) => m.email === normaliseEmail(body.data.email))) {
      return jsonError(409, "That person is already a member.");
    }
    const inv = await createInvitation(r.ctx.db, {
      orgId: r.ctx.org.id,
      email: body.data.email,
      role: body.data.role,
      invitedBy: r.ctx.user,
    });
    const link = `${publicBaseUrl(request)}/invite/${inv.token}`;
    const emailed = await sendMail({
      to: body.data.email,
      subject: `${r.ctx.user.name} invited you to ${r.ctx.org.name} on CarbonPass`,
      text: [
        `${r.ctx.user.name} invited you to join ${r.ctx.org.name} on CarbonPass as ${ROLES[body.data.role].label.toLowerCase()}.`,
        "",
        "CarbonPass prepares the CBAM emissions data EU importers and verifiers need.",
        `Accept the invitation (valid for ${INVITATION_DAYS} days, for this e-mail address only):`,
        "",
        link,
      ].join("\n"),
    });
    return NextResponse.json({ ok: true, link, expiresAt: inv.expiresAt, emailed });
  } catch (error) {
    return errorResponse(error);
  }
}
