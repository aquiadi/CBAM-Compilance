import { NextResponse } from "next/server";
import * as z from "zod/v4";
import { env } from "@/config/env";
import {
  acceptInvitation,
  createOrganisation,
  createUser,
  findInvitation,
  findUserByEmail,
  invitationProblem,
  validEmail,
} from "@/lib/auth/accounts";
import { jsonError, sameOrigin } from "@/lib/auth/context";
import { passwordProblem } from "@/lib/auth/password";
import { startSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { errorResponse, parseJson } from "@/lib/http";
import { clientAddress, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const Body = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().max(254),
  password: z.string(),
  organisation: z.string().trim().max(160).optional(),
  inviteToken: z.string().max(200).optional(),
});

/**
 * Creates an account. With an invitation token the user joins that
 * organisation; otherwise (when sign-up is open) they create their own.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return jsonError(403, "Cross-origin request refused.");
  const body = await parseJson(request, Body);
  if (!body.ok) return body.response;
  const { name, email, password, organisation, inviteToken } = body.data;

  try {
    const db = await getDb();
    const limit = await rateLimit(db, `signup:${clientAddress(request)}`, 10, 3600);
    if (!limit.allowed) {
      return jsonError(429, "Too many sign-ups from this address. Try again later.");
    }
    if (!validEmail(email)) return jsonError(400, "Enter a valid e-mail address.");
    const problem = passwordProblem(password);
    if (problem) return jsonError(400, problem);

    const invitation = inviteToken ? await findInvitation(db, inviteToken) : null;
    if (inviteToken && !invitation) return jsonError(400, "This invitation link is not valid.");
    // Checked before the account exists, so a wrong address does not leave an
    // account behind with no organisation.
    const inviteProblem = invitation ? invitationProblem(invitation, email) : null;
    if (inviteProblem) return jsonError(inviteProblem.status, inviteProblem.message);
    if (!invitation && env.CARBONPASS_SIGNUP === "invite") {
      return jsonError(403, "Sign-up is by invitation only on this installation.");
    }
    if (!invitation && !organisation) {
      return jsonError(400, "Enter your organisation's name.");
    }
    if (await findUserByEmail(db, email)) {
      return jsonError(409, "An account with this e-mail already exists. Sign in instead.");
    }

    const user = await createUser(db, { email, name, password });
    if (invitation) {
      await acceptInvitation(db, invitation, user);
    } else if (organisation) {
      await createOrganisation(db, { name: organisation, owner: user });
    }
    await startSession(db, user, request);
    return NextResponse.json({ ok: true, next: invitation ? "/overview" : "/onboarding" });
  } catch (error) {
    return errorResponse(error);
  }
}
