import { NextResponse } from "next/server";
import * as z from "zod/v4";
import { findUserByEmail, validEmail } from "@/lib/auth/accounts";
import { jsonError, publicBaseUrl, sameOrigin } from "@/lib/auth/context";
import { createPasswordReset, SELF_SERVICE_MINUTES } from "@/lib/auth/reset";
import { getDb } from "@/lib/db";
import { errorResponse, parseJson } from "@/lib/http";
import { mailConfigured, sendMail } from "@/lib/mail";
import { clientAddress, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const Body = z.object({ email: z.string().trim().max(254) });

/**
 * "Forgot password". Answers the same way whether or not the address has an
 * account, so it cannot be used to discover who does. Without mail configured
 * it says so, and points to an owner who can issue a reset link.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return jsonError(403, "Cross-origin request refused.");
  const body = await parseJson(request, Body);
  if (!body.ok) return body.response;
  if (!validEmail(body.data.email)) return jsonError(400, "Enter a valid e-mail address.");
  if (!mailConfigured()) {
    return NextResponse.json({ ok: true, mailConfigured: false });
  }
  try {
    const db = await getDb();
    const byIp = await rateLimit(db, `forgot:ip:${clientAddress(request)}`, 10, 3600);
    const byEmail = await rateLimit(db, `forgot:email:${body.data.email.toLowerCase()}`, 3, 3600);
    if (!byIp.allowed || !byEmail.allowed) {
      return jsonError(429, "Too many reset requests. Try again in an hour.");
    }
    const user = await findUserByEmail(db, body.data.email);
    if (user) {
      const { token } = await createPasswordReset(db, {
        userId: user.id,
        issuedBy: "self",
        minutes: SELF_SERVICE_MINUTES,
      });
      await sendMail({
        to: user.email,
        subject: "Reset your CarbonPass password",
        text: [
          `Hello ${user.name},`,
          "",
          "Someone - hopefully you - asked to reset the password for this CarbonPass account.",
          `Choose a new password here within the next ${SELF_SERVICE_MINUTES} minutes:`,
          "",
          `${publicBaseUrl(request)}/reset/${token}`,
          "",
          "If you did not ask for this, ignore this e-mail; your password stays as it is.",
        ].join("\n"),
      });
    }
    return NextResponse.json({ ok: true, mailConfigured: true });
  } catch (error) {
    return errorResponse(error);
  }
}
