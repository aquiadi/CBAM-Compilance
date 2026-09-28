import { redirect } from "next/navigation";
import { cache } from "react";
import { NextResponse } from "next/server";
import { env } from "@/config/env";
import { DatabaseNotConfiguredError, getDb, type Db } from "../db";
import { getWorkspace, listWorkspaces } from "../workspace/store";
import type { Actor, Workspace } from "../workspace/types";
import { CAN_WRITE, membershipsFor, type Membership, type Role, type User } from "./accounts";
import { selectedWorkspaceId, sessionUser } from "./session";

/**
 * Who is asking, on behalf of which organisation, about which workspace, and
 * what they are allowed to do. Every page and route handler starts here; the
 * role check is in one place rather than sprinkled through handlers.
 */

export interface AppContext {
  db: Db;
  user: User;
  actor: Actor;
  memberships: Membership[];
  org: { id: string; name: string };
  role: Role;
  canWrite: boolean;
  workspaces: Awaited<ReturnType<typeof listWorkspaces>>;
  workspace: Workspace | null;
}

// Memoised per request: the layout and the page both ask, and should hit the
// database once.
const resolve = cache(async function resolve(): Promise<
  | { kind: "no-db" }
  | { kind: "anonymous"; db: Db }
  | { kind: "no-org"; db: Db; user: User }
  | { kind: "ok"; ctx: AppContext }
> {
  let db: Db;
  try {
    db = await getDb();
  } catch (error) {
    if (error instanceof DatabaseNotConfiguredError) return { kind: "no-db" };
    throw error;
  }
  const user = await sessionUser(db);
  if (!user) return { kind: "anonymous", db };
  const memberships = await membershipsFor(db, user.id);
  if (memberships.length === 0) return { kind: "no-org", db, user };

  // The selected workspace decides the organisation; fall back to the first
  // organisation's most recent workspace.
  let workspace: Workspace | null = null;
  const wanted = await selectedWorkspaceId();
  if (wanted) {
    const ws = await getWorkspace(db, wanted);
    if (ws && memberships.some((m) => m.orgId === ws.orgId)) workspace = ws;
  }
  let membership = workspace
    ? memberships.find((m) => m.orgId === workspace?.orgId)
    : memberships[0];
  if (!membership) membership = memberships[0]!;
  const workspaces = await listWorkspaces(db, membership.orgId);
  if (!workspace && workspaces[0]) workspace = await getWorkspace(db, workspaces[0].id);

  return {
    kind: "ok",
    ctx: {
      db,
      user,
      actor: { id: user.id, label: user.email },
      memberships,
      org: { id: membership.orgId, name: membership.orgName },
      role: membership.role,
      canWrite: CAN_WRITE.includes(membership.role),
      workspaces,
      workspace,
    },
  };
});

/** For server-rendered pages: redirects instead of failing. */
export async function pageContext(): Promise<AppContext> {
  const r = await resolve();
  if (r.kind === "no-db") redirect("/setup");
  if (r.kind === "anonymous") redirect("/login");
  if (r.kind === "no-org") redirect("/onboarding");
  return r.ctx;
}

/** For pages that need a workspace: sends the user to create one if they have none. */
export async function workspaceContext(): Promise<AppContext & { workspace: Workspace }> {
  const ctx = await pageContext();
  if (!ctx.workspace) redirect("/onboarding");
  return ctx as AppContext & { workspace: Workspace };
}

/** The signed-in user, if any, without requiring an organisation. For auth pages. */
export async function optionalUser(): Promise<{ db: Db; user: User | null } | null> {
  const r = await resolve();
  if (r.kind === "no-db") return null;
  if (r.kind === "anonymous") return { db: r.db, user: null };
  if (r.kind === "no-org") return { db: r.db, user: r.user };
  return { db: r.ctx.db, user: r.ctx.user };
}

export function jsonError(status: number, error: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error, ...extra }, { status });
}

/**
 * A write from another site riding on the user's cookie is refused. SameSite
 * cookies already stop most of it; checking Origin closes the rest.
 */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const allowed = new Set<string>();
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto =
    request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", "");
  if (host) allowed.add(`${proto}://${host}`);
  allowed.add(new URL(request.url).origin);
  if (env.APP_URL) allowed.add(new URL(env.APP_URL).origin);
  return allowed.has(origin);
}

type ApiResult<T> = { ok: true; ctx: T } | { ok: false; response: NextResponse };

export async function apiContext(
  request: Request,
  options: { write?: boolean; roles?: Role[] } = {},
): Promise<ApiResult<AppContext>> {
  if (request.method !== "GET" && request.method !== "HEAD" && !sameOrigin(request)) {
    return { ok: false, response: jsonError(403, "Cross-origin request refused.") };
  }
  const r = await resolve();
  if (r.kind === "no-db") {
    return { ok: false, response: jsonError(503, new DatabaseNotConfiguredError().message) };
  }
  if (r.kind === "anonymous") return { ok: false, response: jsonError(401, "Sign in first.") };
  if (r.kind === "no-org") {
    return { ok: false, response: jsonError(403, "Create or join an organisation first.") };
  }
  const { ctx } = r;
  if (options.write && !ctx.canWrite) {
    return {
      ok: false,
      response: jsonError(403, `Your role (${ctx.role}) can view but not change this workspace.`),
    };
  }
  if (options.roles && !options.roles.includes(ctx.role)) {
    return {
      ok: false,
      response: jsonError(403, `This needs one of these roles: ${options.roles.join(", ")}.`),
    };
  }
  return { ok: true, ctx };
}

export async function apiWorkspaceContext(
  request: Request,
  options: { write?: boolean; roles?: Role[] } = {},
): Promise<ApiResult<AppContext & { workspace: Workspace }>> {
  const r = await apiContext(request, options);
  if (!r.ok) return r;
  if (!r.ctx.workspace) {
    return { ok: false, response: jsonError(404, "No workspace selected. Create one first.") };
  }
  return { ok: true, ctx: r.ctx as AppContext & { workspace: Workspace } };
}

/** The public base URL for links sent to other people. */
export function publicBaseUrl(request: Request): string {
  if (env.APP_URL) return env.APP_URL.replace(/\/$/, "");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : new URL(request.url).origin;
}
