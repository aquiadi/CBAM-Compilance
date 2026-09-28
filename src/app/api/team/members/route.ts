import { NextResponse } from "next/server";
import { orgMembers } from "@/lib/auth/accounts";
import { apiContext } from "@/lib/auth/context";
import { errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

/** The members of the current organisation, for anyone in it. */
export async function GET(request: Request) {
  const r = await apiContext(request);
  if (!r.ok) return r.response;
  try {
    return NextResponse.json({ ok: true, members: await orgMembers(r.ctx.db, r.ctx.org.id) });
  } catch (error) {
    return errorResponse(error);
  }
}
