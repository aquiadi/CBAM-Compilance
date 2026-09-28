import { NextResponse } from "next/server";
import { recordAudit } from "@/lib/audit";
import { endOtherSessions } from "@/lib/auth/account";
import { apiContext } from "@/lib/auth/context";
import { currentSessionId } from "@/lib/auth/session";
import { errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Signs this person out everywhere except here. */
export async function DELETE(request: Request) {
  const r = await apiContext(request);
  if (!r.ok) return r.response;
  try {
    const ended = await endOtherSessions(r.ctx.db, r.ctx.user.id, await currentSessionId());
    await recordAudit(r.ctx.db, {
      orgId: r.ctx.org.id,
      actor: r.ctx.actor,
      action: "account.other_sessions_ended",
      detail: { ended },
    });
    return NextResponse.json({ ok: true, ended });
  } catch (error) {
    return errorResponse(error);
  }
}
