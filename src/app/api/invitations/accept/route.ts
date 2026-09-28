import { NextResponse } from "next/server";
import * as z from "zod/v4";
import { acceptInvitation, findInvitation } from "@/lib/auth/accounts";
import { jsonError, optionalUser, sameOrigin } from "@/lib/auth/context";
import { errorResponse, parseJson } from "@/lib/http";

export const dynamic = "force-dynamic";

const Body = z.object({ token: z.string().min(10).max(200) });

/** Accepts an invitation for the signed-in user. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return jsonError(403, "Cross-origin request refused.");
  const body = await parseJson(request, Body);
  if (!body.ok) return body.response;
  const session = await optionalUser();
  if (!session?.user) return jsonError(401, "Sign in first.");
  const invitation = await findInvitation(session.db, body.data.token);
  if (!invitation) return jsonError(404, "This invitation link is not valid.");
  try {
    await acceptInvitation(session.db, invitation, session.user);
  } catch (error) {
    return errorResponse(error);
  }
  return NextResponse.json({ ok: true });
}
