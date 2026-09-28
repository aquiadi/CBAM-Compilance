import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type Db } from "../db";
import { UserError } from "../errors";
import { seal, unseal } from "../secret-box";
import { createUser, type User } from "./accounts";
import { base32Decode, base32Encode, counterAt, hotp, matchCode, otpauthUri } from "./totp";
import {
  beginEnrolment,
  completeLoginChallenge,
  confirmEnrolment,
  createLoginChallenge,
  disableTwoFactor,
  twoFactorStatus,
} from "./two-factor";

/** Two-factor sign-in: the code arithmetic against RFC 6238, and the flows against a real database. */

// RFC 6238 appendix B: the ASCII secret "12345678901234567890".
const RFC_SECRET = base32Encode(new TextEncoder().encode("12345678901234567890"));

describe("TOTP", () => {
  it("matches the RFC 6238 test vectors (last six digits)", () => {
    expect(hotp(RFC_SECRET, counterAt(59_000))).toBe("287082");
    expect(hotp(RFC_SECRET, counterAt(1_111_111_109_000))).toBe("081804");
    expect(hotp(RFC_SECRET, counterAt(1_234_567_890_000))).toBe("005924");
  });

  it("round-trips base32", () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255, 7]);
    expect([...base32Decode(base32Encode(bytes))]).toEqual([...bytes]);
  });

  it("accepts one step of clock drift either way, and nothing further", () => {
    const now = 1_700_000_000_000;
    const step = counterAt(now);
    expect(matchCode(RFC_SECRET, hotp(RFC_SECRET, step - 1), now)).toBe(step - 1);
    expect(matchCode(RFC_SECRET, hotp(RFC_SECRET, step + 1), now)).toBe(step + 1);
    expect(matchCode(RFC_SECRET, hotp(RFC_SECRET, step + 2), now)).toBeNull();
    expect(matchCode(RFC_SECRET, "12345", now)).toBeNull();
  });

  it("writes an otpauth URI authenticator apps understand", () => {
    expect(otpauthUri("a@b.in", "ABC")).toBe(
      "otpauth://totp/CarbonPass%3Aa%40b.in?secret=ABC&issuer=CarbonPass&algorithm=SHA1&digits=6&period=30",
    );
  });
});

describe("secret-box", () => {
  it("round-trips, marking unsealed values so they can be sealed later", () => {
    const stored = seal("JBSWY3DPEHPK3PXP");
    expect(unseal(stored)).toBe("JBSWY3DPEHPK3PXP");
    // No key in the test environment.
    expect(stored.startsWith("plain:")).toBe(true);
  });
});

let db: Db;
let user: User;
const now = () => hotp(currentSecret, counterAt(Date.now()));
let currentSecret = "";

beforeAll(async () => {
  db = await createTestDb();
  await db.query("INSERT INTO organisations (id, name) VALUES ('org_tf', 'TF')");
  user = await createUser(db, {
    email: "tf@example.com",
    name: "T F",
    password: "a long password here",
  });
  await db.query("INSERT INTO memberships (org_id, user_id, role) VALUES ('org_tf', $1, 'owner')", [
    user.id,
  ]);
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("two-factor flows", () => {
  let recovery: string[] = [];

  it("enrols only after a correct first code, and hands out ten recovery codes", async () => {
    const { secret, qr } = await beginEnrolment(db, user);
    currentSecret = secret;
    expect(qr).toMatch(/^data:image\/svg\+xml;base64,/);
    await expect(confirmEnrolment(db, user, "000000")).rejects.toBeInstanceOf(UserError);
    expect((await twoFactorStatus(db, user.id)).enabled).toBe(false);

    recovery = await confirmEnrolment(db, user, now());
    expect(recovery).toHaveLength(10);
    expect(await twoFactorStatus(db, user.id)).toMatchObject({
      enabled: true,
      recoveryCodesLeft: 10,
    });
  });

  it("does not accept the same code twice", async () => {
    const token = await createLoginChallenge(db, user.id);
    // The code that confirmed enrolment has been used.
    await expect(completeLoginChallenge(db, token, now())).rejects.toThrow(/did not match/);
  });

  it("signs in with a recovery code once, and counts wrong codes even though they fail", async () => {
    const token = await createLoginChallenge(db, user.id);
    await expect(completeLoginChallenge(db, token, "wrong-codes")).rejects.toThrow(/did not match/);
    const { rows } = await db.query<{ attempts: number }>("SELECT attempts FROM login_challenges");
    expect(rows[0]?.attempts).toBe(1);

    const signedIn = await completeLoginChallenge(db, token, recovery[0]!.toUpperCase());
    expect(signedIn.id).toBe(user.id);
    expect((await twoFactorStatus(db, user.id)).recoveryCodesLeft).toBe(9);

    const again = await createLoginChallenge(db, user.id);
    await expect(completeLoginChallenge(db, again, recovery[0]!)).rejects.toThrow(/did not match/);
  });

  it("locks a challenge after five wrong codes", async () => {
    const token = await createLoginChallenge(db, user.id);
    for (let i = 0; i < 5; i++) {
      await expect(completeLoginChallenge(db, token, "000000")).rejects.toThrow(/did not match/);
    }
    await expect(completeLoginChallenge(db, token, recovery[1]!)).rejects.toThrow(/Too many/);
  });

  it("turns off only with a valid code", async () => {
    await expect(disableTwoFactor(db, user, "nope-nope")).rejects.toBeInstanceOf(UserError);
    await disableTwoFactor(db, user, recovery[2]!);
    expect(await twoFactorStatus(db, user.id)).toMatchObject({
      enabled: false,
      recoveryCodesLeft: 0,
    });
  });
});
