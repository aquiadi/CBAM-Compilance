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
   * Default EU ETS certificate price in EUR. Bounded rather than merely
   * numeric: a price of 0 or 10,000 is a configuration error, and silently
   * accepting it would produce a confidently wrong exposure figure.
   */
  CARBONPASS_ETS_PRICE_EUR: z.coerce.number().positive().max(1000).default(78),

  /** INR per EUR, for reporting exposure in the currency the operator budgets in. */
  CARBONPASS_INR_PER_EUR: z.coerce.number().positive().max(1000).default(92),

  /** Compliance year driving the CBAM factor. */
  CARBONPASS_YEAR: z.coerce.number().int().min(2023).max(2040).default(2026),

  /** Where workspace state is persisted. */
  CARBONPASS_DATA_DIR: z.string().default(".data"),
});

export type Env = z.infer<typeof EnvSchema>;

function load(): Env {
  const parsed = EnvSchema.safeParse(process.env);

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

/**
 * Exported for tests so the validation rules can be exercised without mutating
 * the real process environment.
 */
export function parseEnv(input: Record<string, string | undefined>): Env {
  const parsed = EnvSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  }
  return parsed.data;
}

export { EnvSchema };
