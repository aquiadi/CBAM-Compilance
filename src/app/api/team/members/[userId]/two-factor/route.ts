import { NextResponse } from "next/server";
import { orgMembers } from "@/lib/auth/accounts";
import { apiContext, jsonError } from "@/lib/auth/context";
import { resetMemberTwoFactor } from "@/lib/auth/two-factor";
import { errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * An owner turns off two-factor for a member who has lost both their phone and
 * their recovery codes. The member is signed out everywhere and sets it up
 * again; the activity log records who did it.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params;
  const r = await apiContext(request, { roles: ["owner"] });
  if (!r.ok) return r.response;
  if (userId === r.ctx.user.id) {
    return jsonError(400, "Turn off your own two-factor sign-in from Your account.");
  }
  try {
    const member = (await orgMembers(r.ctx.db, r.ctx.org.id)).find((m) => m.userId === userId);
    if (!member) return jsonError(404, "Member not found.");
    await resetMemberTwoFactor(r.ctx.db, {
      orgId: r.ctx.org.id,
      owner: r.ctx.user,
      memberId: userId,
      memberEmail: member.email,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
