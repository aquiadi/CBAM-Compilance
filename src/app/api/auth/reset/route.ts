import { NextResponse } from "next/server";
import * as z from "zod/v4";
import { jsonError, sameOrigin } from "@/lib/auth/context";
import { completeReset } from "@/lib/auth/reset";
import { startSession } from "@/lib/auth/session";
import { twoFactorStatus } from "@/lib/auth/two-factor";
import { getDb } from "@/lib/db";
import { errorResponse, parseJson } from "@/lib/http";
import { clientAddress, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const Body = z.object({ token: z.string().min(10).max(200), password: z.string() });

/**
 * Sets a new password from a reset link and signs in on this device only -
 * unless two-factor is on, in which case the person signs in normally so the
 * code is still asked for. A reset link alone never gets past two-factor.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return jsonError(403, "Cross-origin request refused.");
  const body = await parseJson(request, Body);
  if (!body.ok) return body.response;
  try {
    const db = await getDb();
    const limit = await rateLimit(db, `reset:${clientAddress(request)}`, 20, 3600);
    if (!limit.allowed) return jsonError(429, "Too many attempts. Try again later.");
    const user = await completeReset(db, body.data.token, body.data.password);
    if ((await twoFactorStatus(db, user.id)).enabled) {
      return NextResponse.json({ ok: true, signIn: true });
    }
    await startSession(db, user, request);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
