import { NextResponse } from "next/server";
import * as z from "zod/v4";
import { changePassword } from "@/lib/auth/account";
import { apiContext, jsonError } from "@/lib/auth/context";
import { currentSessionId } from "@/lib/auth/session";
import { errorResponse, parseJson } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const Body = z.object({ current: z.string().max(200), next: z.string().max(200) });

export async function POST(request: Request) {
  const r = await apiContext(request);
  if (!r.ok) return r.response;
  const body = await parseJson(request, Body);
  if (!body.ok) return body.response;
  try {
    const limit = await rateLimit(r.ctx.db, `password-change:${r.ctx.user.id}`, 10, 3600);
    if (!limit.allowed) return jsonError(429, "Too many attempts. Try again later.");
    await changePassword(r.ctx.db, r.ctx.user, {
      current: body.data.current,
      next: body.data.next,
      currentSessionId: await currentSessionId(),
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
