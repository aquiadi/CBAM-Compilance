import { NextResponse } from "next/server";
import { DatabaseNotConfiguredError, getDb } from "@/lib/db";
import { buildDeclaration } from "@/lib/cbam/declaration";
import { DEMO_INSTALLATION, DEMO_PERIOD } from "@/lib/demo";

export const dynamic = "force-dynamic";

/**
 * Health check for load balancers and platform probes: the database answers,
 * migrations have run, and the engine can compute a declaration.
 */
export async function GET() {
  const started = Date.now();
  try {
    const db = await getDb();
    const { rows } = await db.query<{ v: number }>(
      "SELECT max(version) AS v FROM schema_migrations",
    );
    const engine = buildDeclaration(DEMO_INSTALLATION, DEMO_PERIOD, []);
    return NextResponse.json({
      ok: true,
      database: db.kind,
      schemaVersion: Number(rows[0]?.v ?? 0),
      engine: engine.sources.benchmarks.version,
      ms: Date.now() - started,
    });
  } catch (error) {
    // The endpoint is public, so a connection failure is logged for the
    // operator rather than echoed (it can name hosts and users).
    const configured = !(error instanceof DatabaseNotConfiguredError);
    if (configured) console.error(error);
    return NextResponse.json(
      {
        ok: false,
        database: configured ? "error" : "not configured",
        error: configured
          ? "The database did not answer or could not be migrated. See the server log."
          : (error as Error).message,
      },
      { status: 503 },
    );
  }
}
