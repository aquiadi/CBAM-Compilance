import { NextResponse } from "next/server";
import * as z from "zod/v4";
import { apiContext, jsonError } from "@/lib/auth/context";
import { errorResponse } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { askRegulation, RegulationError, regulationConfigured } from "@/lib/regulation";
import { askRulebook } from "@/lib/rulebook";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({ question: z.string().trim().min(3).max(2000) });

/**
 * Answers a question about the rules. With an evalgate service connected, from
 * the full text of the regulation it indexes; otherwise - or when it is down -
 * from CarbonPass's built-in rulebook, the acts and tables the engine applies.
 * Server-side, so the service's key never reaches the browser; limited per
 * person, so one account cannot spend the model budget.
 */
export async function POST(request: Request) {
  const r = await apiContext(request);
  if (!r.ok) return r.response;
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return jsonError(400, "Ask a question of 3 to 2,000 characters.");
  try {
    const limit = await rateLimit(r.ctx.db, `regulation:${r.ctx.user.id}`, 30, 3600);
    if (!limit.allowed)
      return jsonError(429, "Too many questions in the last hour. Try again later.");
    if (regulationConfigured()) {
      try {
        const answer = await askRegulation(body.data.question);
        return NextResponse.json({ ok: true, source: "evalgate", ...answer });
      } catch (error) {
        if (!(error instanceof RegulationError)) throw error;
        const answer = await askRulebook(body.data.question);
        return NextResponse.json({
          ok: true,
          source: "rulebook",
          notice: `${error.message} This answer comes from the built-in rulebook instead.`,
          ...answer,
        });
      }
    }
    return NextResponse.json({
      ok: true,
      source: "rulebook",
      ...(await askRulebook(body.data.question)),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
