import * as z from "zod/v4";

/**
 * Environment configuration, parsed and validated once at module load.
 *
 * The point is to fail loudly and early. A misconfigured certificate price or a
 * malformed model id should stop the process with a message naming the variable,
 * not surface three screens later as a wrong number in a legal declaration.
 *
 * Nothing outside this module reads `process.env`, so every tunable in the
 * system has exactly one definition, one type and one default.
 */

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  /**
   * Model API key. Optional by design: without it every AI step falls back to
   * its deterministic implementation and the UI labels the provenance
   * accordingly. The product is fully functional either way.
   */
  ANTHROPIC_API_KEY: z.string().min(1).optional(),

  /** Model used for column mapping, finding triage and the assurance memo. */
  CARBONPASS_MODEL: z.string().min(1).default("claude-opus-5"),

  /**
   * Certificate price in EUR assumed for quarters the Commission has not yet
   * published (the published 2026 quarterly prices are built in). Bounded
   * rather than merely numeric: a price of 0 or 10,000 is a configuration
   * error, and silently accepting it would produce a confidently wrong figure.
   * Each workspace can override it.
   */
  CARBONPASS_ETS_PRICE_EUR: z.coerce.number().positive().max(1000).default(75),

  /** INR per EUR, for reporting exposure in the currency the operator budgets in. */
  CARBONPASS_INR_PER_EUR: z.coerce.number().positive().max(1000).default(92),

  /**
   * Postgres connection string (Neon, Railway, RDS, local). When unset the app
   * runs on an embedded Postgres (PGlite) stored under CARBONPASS_DATA_DIR,
   * which suits local use and a single server with a persistent volume.
   */
  DATABASE_URL: z
    .string()
    .regex(/^postgres(ql)?:\/\//, "must be a postgres:// or postgresql:// connection string")
    .optional(),

  /** Where the embedded database keeps its files when DATABASE_URL is unset. */
  CARBONPASS_DATA_DIR: z.string().default(".data"),

  /**
   * Who may create an account: "open" lets anyone sign up and create an
   * organisation; "invite" allows sign-up only through an invitation link.
   */
  CARBONPASS_SIGNUP: z.enum(["open", "invite"]).default("open"),

  /** Public base URL, used in invitation and supplier links. Derived from the request when unset. */
  APP_URL: z.string().url().optional(),

  /** Largest accepted upload. Serverless hosts cap request bodies at about 4.5 MB. */
  CARBONPASS_MAX_UPLOAD_MB: z.coerce.number().positive().max(50).default(4),

  /** Set by Vercel on its build and runtime; used to require an external database there. */
  VERCEL: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

/** Vercel's Postgres integrations expose POSTGRES_URL; accept it as an alias. */
function withAliases(
  input: Record<string, string | undefined>,
): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = { ...input };
  if (!out.DATABASE_URL && out.POSTGRES_URL) out.DATABASE_URL = out.POSTGRES_URL;
  // An empty variable (a blank line copied from .env.example, a cleared field
  // in a dashboard) means "not set", not "set to nothing".
  for (const key of Object.keys(out)) {
    if (out[key] === "") delete out[key];
  }
  return out;
}

function load(): Env {
  const parsed = EnvSchema.safeParse(withAliases(process.env));

  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${detail}`);
  }

  return parsed.data;
}

export const env: Env = load();

/** True when a model API key is configured. */
export const hasModelKey = (): boolean => Boolean(env.ANTHROPIC_API_KEY);

/** True when running on Vercel, where the filesystem is not persistent. */
export const onVercel = (): boolean => Boolean(env.VERCEL);

/**
 * Exported for tests so the validation rules can be exercised without mutating
 * the real process environment.
 */
export function parseEnv(input: Record<string, string | undefined>): Env {
  const parsed = EnvSchema.safeParse(withAliases(input));
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  }
  return parsed.data;
}

export { EnvSchema };
