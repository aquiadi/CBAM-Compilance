import { cookies } from "next/headers";
import { env } from "@/config/env";
import type { Queryable } from "../db";
import { hashToken, newToken } from "../ids";
import type { User } from "./accounts";

/**
 * Sessions: a random token in an HttpOnly cookie, stored hashed in the
 * database so a leaked table does not hand out live sessions. SameSite=Lax
 * keeps the cookie off cross-site form posts; route handlers also check the
 * Origin header on every write (see ./context.ts).
 */

export const SESSION_COOKIE = "cp_session";
export const WORKSPACE_COOKIE = "cp_ws";
export const SESSION_DAYS = 30;

function cookieOptions(maxAgeSeconds: number, secure: boolean) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

/**
 * Secure cookies whenever the request came over HTTPS (directly or via the
 * platform's proxy). Keying this on NODE_ENV instead would break sign-in for a
 * production container reached over plain HTTP on a private network.
 */
export function isHttps(request: Request): boolean {
  const forwarded = request.headers.get("x-forwarded-proto");
  if (forwarded) return forwarded.split(",")[0]?.trim() === "https";
  return new URL(request.url).protocol === "https:" || env.APP_URL?.startsWith("https:") === true;
}

export async function startSession(q: Queryable, user: User, request: Request) {
  const userAgent = request.headers.get("user-agent");
  const token = newToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await q.query(
    "INSERT INTO sessions (id, user_id, expires_at, user_agent) VALUES ($1, $2, $3, $4)",
    [hashToken(token), user.id, expires.toISOString(), userAgent?.slice(0, 300) ?? null],
  );
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, cookieOptions(SESSION_DAYS * 86_400, isHttps(request)));
}

export async function sessionUser(q: Queryable): Promise<User | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const { rows } = await q.query<{ id: string; email: string; name: string }>(
    `SELECT u.id, u.email, u.name FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.id = $1 AND s.expires_at > now()`,
    [hashToken(token)],
  );
  return rows[0] ?? null;
}

export async function endSession(q: Queryable): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await q.query("DELETE FROM sessions WHERE id = $1", [hashToken(token)]);
  jar.delete(SESSION_COOKIE);
  jar.delete(WORKSPACE_COOKIE);
}

export async function selectWorkspaceCookie(workspaceId: string, request: Request): Promise<void> {
  const jar = await cookies();
  jar.set(WORKSPACE_COOKIE, workspaceId, cookieOptions(365 * 86_400, isHttps(request)));
}

export async function selectedWorkspaceId(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(WORKSPACE_COOKIE)?.value ?? null;
}
