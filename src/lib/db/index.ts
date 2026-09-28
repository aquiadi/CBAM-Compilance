import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { env, onVercel } from "@/config/env";
import { MIGRATIONS } from "./migrations";

/**
 * Database access.
 *
 * Two drivers behind one small interface:
 *
 * - Postgres via node-postgres when DATABASE_URL is set - Neon on Vercel,
 *   the Postgres plugin on Railway, or any managed instance.
 * - PGlite, an embedded Postgres compiled to WebAssembly, when it is not. It
 *   keeps its files under CARBONPASS_DATA_DIR, so `npm run dev` needs nothing
 *   installed and a single container with a volume needs no database service.
 *
 * Both speak the same SQL, so the application code does not know which one it
 * is talking to. On Vercel the filesystem is not persistent and functions do
 * not share memory, so an external database is required there and the app
 * says so rather than silently losing data between requests.
 */

export interface Queryable {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  /** Runs several statements with no parameters (migrations). */
  exec(sql: string): Promise<void>;
}

export interface Db extends Queryable {
  kind: "postgres" | "embedded";
  /** Runs `fn` in a transaction; rolls back if it throws. */
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super(
      "No database is configured. On Vercel the filesystem is not persistent, so set DATABASE_URL " +
        "to a Postgres connection string (for example from the Neon integration).",
    );
    this.name = "DatabaseNotConfiguredError";
  }
}

async function postgres(connectionString: string): Promise<Db> {
  const { Pool } = await import("pg");
  // Serverless functions each hold their own pool; keep it small and let the
  // provider's pooler (Neon, PgBouncer) multiplex.
  const pool = new Pool({ connectionString, max: onVercel() ? 3 : 10, idleTimeoutMillis: 10_000 });
  return {
    kind: "postgres",
    async query<T>(sql: string, params: unknown[] = []) {
      const result = await pool.query(sql, params);
      return { rows: result.rows as T[] };
    },
    async exec(sql: string) {
      await pool.query(sql);
    },
    async tx<T>(fn: (q: Queryable) => Promise<T>) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await fn({
          async query<R>(sql: string, params: unknown[] = []) {
            const r = await client.query(sql, params);
            return { rows: r.rows as R[] };
          },
          async exec(sql: string) {
            await client.query(sql);
          },
        });
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    async close() {
      await pool.end();
    },
  };
}

async function embedded(dataDir: string | null): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  let pg;
  if (dataDir) {
    mkdirSync(dataDir, { recursive: true });
    pg = await PGlite.create(dataDir);
  } else {
    pg = await PGlite.create();
  }
  // PGlite is a single connection; serialise transactions so two concurrent
  // requests cannot interleave statements inside one BEGIN/COMMIT.
  let chain: Promise<unknown> = Promise.resolve();
  return {
    kind: "embedded",
    async query<T>(sql: string, params: unknown[] = []) {
      await chain;
      const result = await pg.query<T>(sql, params);
      return { rows: result.rows };
    },
    async exec(sql: string) {
      await chain;
      await pg.exec(sql);
    },
    async tx<T>(fn: (q: Queryable) => Promise<T>) {
      const run = chain.then(() =>
        pg.transaction(async (t) =>
          fn({
            async query<R>(sql: string, params: unknown[] = []) {
              const r = await t.query<R>(sql, params);
              return { rows: r.rows };
            },
            async exec(sql: string) {
              await t.exec(sql);
            },
          }),
        ),
      );
      chain = run.catch(() => undefined);
      return run as Promise<T>;
    },
    async close() {
      await pg.close();
    },
  };
}

async function migrate(db: Db): Promise<void> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version integer PRIMARY KEY,
      name text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  for (const m of MIGRATIONS) {
    await db.tx(async (q) => {
      // Several serverless instances can start at once; the advisory lock makes
      // exactly one of them apply each migration.
      if (db.kind === "postgres") await q.query("SELECT pg_advisory_xact_lock(4829101)");
      const done = await q.query("SELECT 1 FROM schema_migrations WHERE version = $1", [m.version]);
      if (done.rows.length > 0) return;
      await q.exec(m.sql);
      await q.query("INSERT INTO schema_migrations (version, name) VALUES ($1, $2)", [
        m.version,
        m.name,
      ]);
    });
  }
}

const globalDb = globalThis as unknown as { __carbonpassDb?: Promise<Db> };

/**
 * The process-wide database handle, migrated on first use. Survives dev-server
 * hot reloads, which would otherwise open a new pool on every edit.
 */
export function getDb(): Promise<Db> {
  if (!globalDb.__carbonpassDb) {
    globalDb.__carbonpassDb = (async () => {
      let db: Db;
      if (env.DATABASE_URL) {
        db = await postgres(env.DATABASE_URL);
      } else if (onVercel()) {
        throw new DatabaseNotConfiguredError();
      } else if (env.NODE_ENV === "test") {
        db = await embedded(null);
      } else {
        db = await embedded(resolve(process.cwd(), env.CARBONPASS_DATA_DIR, "pglite"));
      }
      await migrate(db);
      return db;
    })().catch((error) => {
      // Do not cache a failed start: the next request retries.
      globalDb.__carbonpassDb = undefined;
      throw error;
    });
  }
  return globalDb.__carbonpassDb;
}

/** A fresh in-memory database, migrated. For tests. */
export async function createTestDb(): Promise<Db> {
  const db = await embedded(null);
  await migrate(db);
  return db;
}

/** Replace the process-wide handle. For tests. */
export function setDbForTests(db: Db | undefined): void {
  globalDb.__carbonpassDb = db ? Promise.resolve(db) : undefined;
}

export function isDatabaseConfigured(): boolean {
  return Boolean(env.DATABASE_URL) || !onVercel();
}
