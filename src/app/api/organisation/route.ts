import { NextResponse } from "next/server";
import * as z from "zod/v4";
import { apiContext } from "@/lib/auth/context";
import { WORKSPACE_COOKIE } from "@/lib/auth/session";
import { errorResponse, parseJson } from "@/lib/http";
import { deleteOrganisation } from "@/lib/organisation-data";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

const Body = z.object({ confirm: z.string().max(200) });

/** Deletes the organisation and everything in it. Owners only; the name must be typed. */
export async function DELETE(request: Request) {
  const r = await apiContext(request, { roles: ["owner"] });
  if (!r.ok) return r.response;
  const body = await parseJson(request, Body);
  if (!body.ok) return body.response;
  try {
    await deleteOrganisation(r.ctx.db, r.ctx.org, body.data.confirm);
    (await cookies()).delete(WORKSPACE_COOKIE);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
