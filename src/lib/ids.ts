import { createHash, randomBytes } from "node:crypto";

/** Opaque, URL-safe, prefixed identifiers: "ws_3kq9...". */
export function newId(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString("base64url")}`;
}

/** A secret token for links (sessions, invitations, supplier requests). */
export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Tokens are stored hashed, so a database leak does not leak live links. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}
