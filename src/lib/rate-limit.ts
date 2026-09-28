import type { Queryable } from "./db";

/**
 * Fixed-window rate limiting in the database, so it holds across serverless
 * instances where in-memory counters would each start at zero. Used on the
 * endpoints an attacker would hammer: sign-in, sign-up and the public
 * supplier form.
 */
export async function rateLimit(
  q: Queryable,
  key: string,
  max: number,
  windowSeconds: number,
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const { rows } = await q.query<{ count: number; reset_at: Date | string }>(
    `INSERT INTO rate_limits (key, count, reset_at)
     VALUES ($1, 1, now() + ($2 || ' seconds')::interval)
     ON CONFLICT (key) DO UPDATE SET
       count = CASE WHEN rate_limits.reset_at < now() THEN 1 ELSE rate_limits.count + 1 END,
       reset_at = CASE WHEN rate_limits.reset_at < now()
                       THEN now() + ($2 || ' seconds')::interval ELSE rate_limits.reset_at END
     RETURNING count, reset_at`,
    [key, String(windowSeconds)],
  );
  const row = rows[0];
  const count = Number(row?.count ?? 0);
  const reset = row ? new Date(row.reset_at).getTime() : Date.now();
  return {
    allowed: count <= max,
    retryAfterSeconds: Math.max(1, Math.ceil((reset - Date.now()) / 1000)),
  };
}

/** Best-effort client address behind a proxy (Vercel and Railway both set x-forwarded-for). */
export function clientAddress(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}
