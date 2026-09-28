import { NextResponse } from "next/server";
import * as z from "zod/v4";
import { CAN_WRITE, createOrganisation, membershipsFor } from "@/lib/auth/accounts";
import { jsonError, optionalUser, sameOrigin } from "@/lib/auth/context";
import { selectWorkspaceCookie, selectedWorkspaceId } from "@/lib/auth/session";
import { errorResponse, parseJson } from "@/lib/http";
import {
  blankInstallation,
  calendarYear,
  createBlankWorkspace,
  createDemoWorkspace,
} from "@/lib/workspace/seed";
import { getWorkspace } from "@/lib/workspace/store";

export const dynamic = "force-dynamic";
// Seeding the demo parses and maps five files.
export const maxDuration = 60;

const Body = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("demo"), organisation: z.string().trim().max(160).optional() }),
  z.object({
    mode: z.literal("blank"),
    organisation: z.string().trim().max(160).optional(),
    installationName: z.string().trim().min(1).max(160),
    operator: z.string().trim().min(1).max(160),
    city: z.string().trim().max(120).default(""),
    state: z.string().trim().max(120).default(""),
    country: z.string().trim().length(2).default("IN"),
    year: z.number().int().min(2026).max(2034),
  }),
]);

/**
 * Creates a workspace in the current organisation - or, for a user who
 * belongs to none yet, creates their organisation first.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return jsonError(403, "Cross-origin request refused.");
  const body = await parseJson(request, Body);
  if (!body.ok) return body.response;
  const session = await optionalUser();
  if (!session?.user) return jsonError(401, "Sign in first.");
  const { db, user } = session;
  const actor = { id: user.id, label: user.email };

  try {
    let memberships = await membershipsFor(db, user.id);
    if (memberships.length === 0) {
      if (!body.data.organisation) return jsonError(400, "Enter your organisation's name.");
      await createOrganisation(db, { name: body.data.organisation, owner: user });
      memberships = await membershipsFor(db, user.id);
    }

    // The organisation of the currently selected workspace, else the first.
    const selected = await selectedWorkspaceId();
    const current = selected ? await getWorkspace(db, selected) : null;
    const membership = memberships.find((m) => m.orgId === current?.orgId) ?? memberships[0];
    if (!membership) return jsonError(403, "No organisation.");
    if (!CAN_WRITE.includes(membership.role)) {
      return jsonError(403, `Your role (${membership.role}) cannot create workspaces.`);
    }

    const data = body.data;
    const ws =
      data.mode === "demo"
        ? await createDemoWorkspace(db, membership.orgId, actor)
        : await createBlankWorkspace(db, {
            orgId: membership.orgId,
            name: `${data.installationName} ${data.year}`,
            installation: {
              ...blankInstallation(data.operator, user.name, user.email),
              name: data.installationName,
              city: data.city,
              state: data.state,
              country: data.country.toUpperCase(),
            },
            period: calendarYear(data.year),
            actor,
          });
    await selectWorkspaceCookie(ws.id, request);
    return NextResponse.json({ ok: true, workspaceId: ws.id });
  } catch (error) {
    return errorResponse(error);
  }
}
