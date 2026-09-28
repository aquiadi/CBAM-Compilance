import { NextResponse } from "next/server";
import * as z from "zod/v4";
import { apiContext, jsonError } from "@/lib/auth/context";
import { errorResponse } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { askRegulation, RegulationError, regulationConfigured } from "@/lib/regulation";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({ question: z.string().trim().min(3).max(2000) });

/**
 * Relays a question to the evalgate service. Server-side, so the service's key
 * never reaches the browser; limited per person, so one account cannot spend
 * the service's model budget.
 */
export async function POST(request: Request) {
  const r = await apiContext(request);
  if (!r.ok) return r.response;
  if (!regulationConfigured()) {
    return jsonError(503, "The regulation service is not configured (EVALGATE_URL).");
  }
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return jsonError(400, "Ask a question of 3 to 2,000 characters.");
  try {
    const limit = await rateLimit(r.ctx.db, `regulation:${r.ctx.user.id}`, 30, 3600);
    if (!limit.allowed)
      return jsonError(429, "Too many questions in the last hour. Try again later.");
    return NextResponse.json({ ok: true, ...(await askRegulation(body.data.question)) });
  } catch (error) {
    if (error instanceof RegulationError) return jsonError(502, error.message);
    return errorResponse(error);
  }
}
