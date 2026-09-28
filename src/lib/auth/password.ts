import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

/**
 * Password hashing with scrypt from Node's standard library - memory-hard, no
 * native dependency to build on a serverless host. The parameters are stored
 * with the hash so they can be raised later without invalidating old ones.
 */

const N = 16384;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;

function derive(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, { N: n, r, p, maxmem: 64 * 1024 * 1024 }, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, N, R, P);
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !n || !r || !p || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const actual = await derive(
    password,
    Buffer.from(salt, "base64"),
    Number(n),
    Number(r),
    Number(p),
  );
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/**
 * A well-formed hash of a random password, checked when the e-mail has no
 * account so an unknown address takes as long to refuse as a wrong password -
 * otherwise the response time says which addresses are registered.
 */
const DECOY = `scrypt$${N}$${R}$${P}$${randomBytes(16).toString("base64")}$${randomBytes(KEY_LENGTH).toString("base64")}`;

export async function verifyAgainstDecoy(password: string): Promise<false> {
  await verifyPassword(password, DECOY);
  return false;
}

/** Minimum rules, stated to the user as they are enforced. */
export function passwordProblem(password: string): string | null {
  if (password.length < 10) return "Use at least 10 characters.";
  if (password.length > 200) return "Use at most 200 characters.";
  return null;
}
