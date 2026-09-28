import { NextResponse } from "next/server";
import * as z from "zod/v4";
import { membershipsFor } from "@/lib/auth/accounts";
import { jsonError, optionalUser, sameOrigin } from "@/lib/auth/context";
import { selectWorkspaceCookie } from "@/lib/auth/session";
import { parseJson } from "@/lib/http";
import { getWorkspace } from "@/lib/workspace/store";

export const dynamic = "force-dynamic";

const Body = z.object({ workspaceId: z.string().min(1).max(100) });

export async function POST(request: Request) {
  if (!sameOrigin(request)) return jsonError(403, "Cross-origin request refused.");
  const body = await parseJson(request, Body);
  if (!body.ok) return body.response;
  const session = await optionalUser();
  if (!session?.user) return jsonError(401, "Sign in first.");
  const ws = await getWorkspace(session.db, body.data.workspaceId);
  const memberships = await membershipsFor(session.db, session.user.id);
  if (!ws || !memberships.some((m) => m.orgId === ws.orgId)) {
    return jsonError(404, "Workspace not found.");
  }
  await selectWorkspaceCookie(ws.id, request);
  return NextResponse.json({ ok: true });
}
