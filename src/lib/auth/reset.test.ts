import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type Db } from "../db";
import { hashToken } from "../ids";
import { createOrganisation, createUser, findUserByEmail } from "./accounts";
import { verifyPassword } from "./password";
import { completeReset, createPasswordReset, findReset } from "./reset";

/** Password resets against a real (embedded) Postgres. */

let db: Db;
let userId: string;

beforeAll(async () => {
  db = await createTestDb();
  const user = await createUser(db, {
    email: "reset@example.com",
    name: "Reset Person",
    password: "the old password",
  });
  userId = user.id;
  await createOrganisation(db, { name: "Reset Org", owner: user });
  await db.query(
    "INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, $2, now() + interval '1 day')",
    [hashToken("some-session"), userId],
  );
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("password resets", () => {
  it("sets the new password, ends every session and works only once", async () => {
    const { token } = await createPasswordReset(db, { userId, issuedBy: "self", minutes: 60 });
    expect((await findReset(db, token))?.email).toBe("reset@example.com");

    await completeReset(db, token, "a brand new password");
    const user = await findUserByEmail(db, "reset@example.com");
    expect(await verifyPassword("a brand new password", user!.passwordHash)).toBe(true);
    expect(await verifyPassword("the old password", user!.passwordHash)).toBe(false);

    const { rows } = await db.query("SELECT 1 FROM sessions WHERE user_id = $1", [userId]);
    expect(rows).toHaveLength(0);

    await expect(completeReset(db, token, "yet another password")).rejects.toThrow(/expired|used/);
  }, 30_000);

  it("refuses an expired link", async () => {
    const { token } = await createPasswordReset(db, { userId, issuedBy: "self", minutes: -1 });
    expect(await findReset(db, token)).toBeNull();
    await expect(completeReset(db, token, "a fine long password")).rejects.toThrow(/expired/);
  });

  it("replaces an older unused link when a new one is issued", async () => {
    const first = await createPasswordReset(db, { userId, issuedBy: "self", minutes: 60 });
    const second = await createPasswordReset(db, { userId, issuedBy: "usr_owner", minutes: 60 });
    expect(await findReset(db, first.token)).toBeNull();
    expect(await findReset(db, second.token)).not.toBeNull();
  });

  it("applies the password rules", async () => {
    const { token } = await createPasswordReset(db, { userId, issuedBy: "self", minutes: 60 });
    await expect(completeReset(db, token, "short")).rejects.toThrow(/10 characters/);
    // A rejected attempt does not spend the link.
    expect(await findReset(db, token)).not.toBeNull();
  });
});
