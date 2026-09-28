import { NextResponse } from "next/server";
import * as z from "zod/v4";
import { jsonError, sameOrigin } from "@/lib/auth/context";
import { clearChallengeCookie, startSession, takeChallengeCookie } from "@/lib/auth/session";
import { completeLoginChallenge } from "@/lib/auth/two-factor";
import { getDb } from "@/lib/db";
import { errorResponse, parseJson } from "@/lib/http";
import { clientAddress, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const Body = z.object({ code: z.string().trim().min(6).max(20) });

/** The second step of sign-in: the authenticator code, or a recovery code. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return jsonError(403, "Cross-origin request refused.");
  const body = await parseJson(request, Body);
  if (!body.ok) return body.response;
  const token = await takeChallengeCookie();
  if (!token) return jsonError(410, "That sign-in has expired. Enter your password again.");
  try {
    const db = await getDb();
    const limit = await rateLimit(db, `login2fa:ip:${clientAddress(request)}`, 30, 900);
    if (!limit.allowed)
      return jsonError(429, "Too many attempts. Wait a few minutes and try again.");
    const user = await completeLoginChallenge(db, token, body.data.code);
    await clearChallengeCookie();
    await startSession(db, user, request);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
