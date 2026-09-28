import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { env } from "@/config/env";

/**
 * Secrets at rest.
 *
 * With CARBONPASS_ENCRYPTION_KEY set, values are sealed with AES-256-GCM
 * ("v1:" prefix); a copied database table is then useless without the key.
 * Without it, values are stored marked "plain:" so they can be sealed later
 * without guessing which rows are which. Opening checks the tag, so a
 * tampered value fails loudly rather than decrypting to garbage.
 */

function key(): Buffer | null {
  return env.CARBONPASS_ENCRYPTION_KEY
    ? createHash("sha256").update(env.CARBONPASS_ENCRYPTION_KEY).digest()
    : null;
}

export function seal(value: string): string {
  const k = key();
  if (!k) return `plain:${value}`;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", k, iv);
  const ct = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["v1", iv, cipher.getAuthTag(), ct]
    .map((p) => (typeof p === "string" ? p : p.toString("base64url")))
    .join(":");
}

export function unseal(stored: string): string {
  if (stored.startsWith("plain:")) return stored.slice("plain:".length);
  const [version, iv, tag, ct] = stored.split(":");
  if (version !== "v1" || !iv || !tag || !ct) throw new Error("Unrecognised sealed value.");
  const k = key();
  if (!k) throw new Error("CARBONPASS_ENCRYPTION_KEY is needed to read a sealed value.");
  const decipher = createDecipheriv("aes-256-gcm", k, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString(
    "utf8",
  );
}
