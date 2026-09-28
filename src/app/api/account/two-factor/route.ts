import { NextResponse } from "next/server";
import * as z from "zod/v4";
import { apiContext, jsonError } from "@/lib/auth/context";
import {
  beginEnrolment,
  confirmEnrolment,
  disableTwoFactor,
  regenerateRecoveryCodes,
} from "@/lib/auth/two-factor";
import { errorResponse, parseJson } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("begin") }),
  z.object({ action: z.literal("confirm"), code: z.string().trim().max(20) }),
  z.object({ action: z.literal("disable"), code: z.string().trim().max(20) }),
  z.object({ action: z.literal("recovery-codes"), code: z.string().trim().max(20) }),
]);

/** Setting up, confirming, turning off and renewing two-factor sign-in. */
export async function POST(request: Request) {
  const r = await apiContext(request);
  if (!r.ok) return r.response;
  const body = await parseJson(request, Body);
  if (!body.ok) return body.response;
  try {
    const limit = await rateLimit(r.ctx.db, `two-factor:${r.ctx.user.id}`, 20, 900);
    if (!limit.allowed) return jsonError(429, "Too many attempts. Wait a few minutes.");
    const { db, user } = r.ctx;
    switch (body.data.action) {
      case "begin":
        return NextResponse.json({ ok: true, ...(await beginEnrolment(db, user)) });
      case "confirm":
        return NextResponse.json({
          ok: true,
          recoveryCodes: await confirmEnrolment(db, user, body.data.code),
        });
      case "disable":
        await disableTwoFactor(db, user, body.data.code);
        return NextResponse.json({ ok: true });
      case "recovery-codes":
        return NextResponse.json({
          ok: true,
          recoveryCodes: await regenerateRecoveryCodes(db, user, body.data.code),
        });
    }
  } catch (error) {
    return errorResponse(error);
  }
}
