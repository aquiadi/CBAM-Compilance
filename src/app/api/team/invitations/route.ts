import { NextResponse } from "next/server";
import * as z from "zod/v4";
import { createInvitation, normaliseEmail, orgMembers, validEmail } from "@/lib/auth/accounts";
import { apiContext, jsonError, publicBaseUrl } from "@/lib/auth/context";
import { errorResponse, parseJson } from "@/lib/http";

export const dynamic = "force-dynamic";

const Body = z.object({
  email: z.string().trim().max(254),
  role: z.enum(["owner", "editor", "viewer", "verifier"]),
});

/**
 * Invites someone to the organisation. The link is returned for the owner to
 * send; this installation does not send e-mail, so no mail service is needed
 * to run it.
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
    return NextResponse.json({
      ok: true,
      link: `${publicBaseUrl(request)}/invite/${inv.token}`,
      expiresAt: inv.expiresAt,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
