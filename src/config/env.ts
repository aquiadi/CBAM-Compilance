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
   * Groq API key: the free alternative. Used when ANTHROPIC_API_KEY is unset.
   * Groq serves open-weight models and has no PDF input, so PDFs are read
   * from their text layer and photos go to a vision model.
   */
  GROQ_API_KEY: z.string().min(1).optional(),

  /** Groq model for mapping, triage, the memo and reading PDF text. */
  GROQ_MODEL: z.string().min(1).default("openai/gpt-oss-120b"),

  /** Groq model for reading photos and scans. It must accept images. */
  GROQ_VISION_MODEL: z.string().min(1).default("qwen/qwen3.8-27b"),

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

  /**
   * Public base URL, used in invitation and supplier links. A bare domain is
   * accepted and read as https://. Derived from the request when unset.
   */
  APP_URL: z
    .string()
    .url("must be a web address such as https://carbonpass.example.com")
    .optional(),

  /** Largest accepted upload. Serverless hosts cap request bodies at about 4.5 MB. */
  CARBONPASS_MAX_UPLOAD_MB: z.coerce.number().positive().max(50).default(4),

  /**
   * Outgoing mail, optional: smtp://user:password@host:587 (STARTTLS) or
   * smtps://...:465. When set, password resets, invitations and supplier
   * requests are e-mailed; when unset, links are shown for you to send.
   */
  SMTP_URL: z
    .string()
    .regex(/^smtps?:\/\//, "must be an smtp:// or smtps:// URL")
    .optional(),

  /** The From address for outgoing mail, e.g. "CarbonPass <cbam@yourcompany.com>". */
  MAIL_FROM: z.string().min(3).max(200).optional(),

  /**
   * An evalgate service (github.com/aquiadi/CI-harness) for "Ask the
   * regulation": questions answered from the CBAM texts, each claim cited to a
   * passage and every citation checked. Deploy it as its own service; unset
   * hides the page's question box and explains how to set it up.
   */
  EVALGATE_URL: z.string().url("must be the evalgate service's address").optional(),

  /** Sent as x-api-key when the evalgate service requires one (its EVALGATE_API_KEY). */
  EVALGATE_API_KEY: z.string().min(1).optional(),

  /**
   * Encrypts secrets at rest - today, each user's two-factor secret - with
   * AES-256-GCM. Any long random string (at least 32 characters; e.g.
   * `openssl rand -base64 48`). Without it those secrets are stored as-is,
   * relying on the database's own protection.
   */
  CARBONPASS_ENCRYPTION_KEY: z
    .string()
    .min(32, "must be at least 32 characters - e.g. openssl rand -base64 48")
    .optional(),

  /**
   * Who runs this deployment and how to reach them, shown on the privacy and
   * terms pages - e.g. "Shakti Compliance Services Pvt Ltd" and
   * "privacy@example.in". Unset, the pages refer to "the operator".
   */
  CARBONPASS_OPERATOR: z.string().min(2).max(200).optional(),
  CARBONPASS_CONTACT_EMAIL: z.string().email("must be an e-mail address").optional(),

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
  // Hosts hand out bare domains (Railway's RAILWAY_PUBLIC_DOMAIN, a copied
  // address bar without the scheme). A public address is HTTPS, so add it.
  const appUrl = out.APP_URL?.trim();
  if (appUrl && !/^[a-z][a-z0-9+.-]*:\/\//i.test(appUrl)) out.APP_URL = `https://${appUrl}`;
  else if (appUrl) out.APP_URL = appUrl;
  // On Railway, fall back to the service's public domain when APP_URL is unset.
  if (!out.APP_URL && out.RAILWAY_PUBLIC_DOMAIN) {
    out.APP_URL = `https://${out.RAILWAY_PUBLIC_DOMAIN.trim()}`;
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

/** True when a model API key is configured (Anthropic or Groq). */
export const hasModelKey = (): boolean => Boolean(env.ANTHROPIC_API_KEY || env.GROQ_API_KEY);

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
