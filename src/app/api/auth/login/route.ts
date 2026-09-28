import { NextResponse } from "next/server";
import * as z from "zod/v4";
import { findUserByEmail } from "@/lib/auth/accounts";
import { jsonError, sameOrigin } from "@/lib/auth/context";
import { verifyAgainstDecoy, verifyPassword } from "@/lib/auth/password";
import { startSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { errorResponse, parseJson } from "@/lib/http";
import { clientAddress, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const Body = z.object({ email: z.string().trim().max(254), password: z.string().max(200) });

export async function POST(request: Request) {
  if (!sameOrigin(request)) return jsonError(403, "Cross-origin request refused.");
  const body = await parseJson(request, Body);
  if (!body.ok) return body.response;

  try {
    const db = await getDb();
    // Per address and per account, so neither spraying nor guessing one
    // account's password gets far.
    const byIp = await rateLimit(db, `login:ip:${clientAddress(request)}`, 30, 900);
    const byEmail = await rateLimit(db, `login:email:${body.data.email.toLowerCase()}`, 10, 900);
    if (!byIp.allowed || !byEmail.allowed) {
      return jsonError(429, "Too many sign-in attempts. Wait a few minutes and try again.");
    }
    const user = await findUserByEmail(db, body.data.email);
    const ok = user
      ? await verifyPassword(body.data.password, user.passwordHash)
      : await verifyAgainstDecoy(body.data.password);
    if (!user || !ok) return jsonError(401, "E-mail or password is incorrect.");
    await startSession(db, user, request);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
