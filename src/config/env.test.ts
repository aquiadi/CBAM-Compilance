import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

/**
 * Configuration validation.
 *
 * These test the boundary where a deployment mistake becomes a wrong number.
 * A certificate price of "abc" or 0 must stop the process with a message naming
 * the variable, not coerce to NaN and surface later as a silently wrong
 * exposure figure in a legal declaration.
 */
describe("parseEnv", () => {
  it("applies documented defaults when nothing is set", () => {
    const env = parseEnv({});
    expect(env.CARBONPASS_ETS_PRICE_EUR).toBe(75);
    expect(env.CARBONPASS_INR_PER_EUR).toBe(92);
    expect(env.CARBONPASS_DATA_DIR).toBe(".data");
    expect(env.CARBONPASS_SIGNUP).toBe("open");
    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it("coerces numeric strings, because env vars are always strings", () => {
    const env = parseEnv({ CARBONPASS_ETS_PRICE_EUR: "95.5", CARBONPASS_MAX_UPLOAD_MB: "8" });
    expect(env.CARBONPASS_ETS_PRICE_EUR).toBe(95.5);
    expect(env.CARBONPASS_MAX_UPLOAD_MB).toBe(8);
  });

  it("rejects a non-numeric price rather than coercing it to NaN", () => {
    expect(() => parseEnv({ CARBONPASS_ETS_PRICE_EUR: "abc" })).toThrow(/CARBONPASS_ETS_PRICE_EUR/);
  });

  it("rejects an out-of-band certificate price", () => {
    // Zero and absurd prices are configuration errors, not valid inputs.
    expect(() => parseEnv({ CARBONPASS_ETS_PRICE_EUR: "0" })).toThrow(/CARBONPASS_ETS_PRICE_EUR/);
    expect(() => parseEnv({ CARBONPASS_ETS_PRICE_EUR: "-5" })).toThrow(/CARBONPASS_ETS_PRICE_EUR/);
    expect(() => parseEnv({ CARBONPASS_ETS_PRICE_EUR: "50000" })).toThrow(
      /CARBONPASS_ETS_PRICE_EUR/,
    );
  });

  it("accepts a Postgres URL under either name and rejects anything else", () => {
    expect(parseEnv({ DATABASE_URL: "postgres://u:p@h:5432/db" }).DATABASE_URL).toContain(
      "postgres://",
    );
    expect(parseEnv({ POSTGRES_URL: "postgresql://u:p@h/db" }).DATABASE_URL).toContain(
      "postgresql://",
    );
    expect(parseEnv({ DATABASE_URL: "" }).DATABASE_URL).toBeUndefined();
    expect(() => parseEnv({ DATABASE_URL: "mysql://u@h/db" })).toThrow(/DATABASE_URL/);
  });

  it("only allows the documented sign-up modes", () => {
    expect(parseEnv({ CARBONPASS_SIGNUP: "invite" }).CARBONPASS_SIGNUP).toBe("invite");
    expect(() => parseEnv({ CARBONPASS_SIGNUP: "anyone" })).toThrow(/CARBONPASS_SIGNUP/);
  });

  it("treats an empty API key as absent rather than as a usable credential", () => {
    expect(parseEnv({ ANTHROPIC_API_KEY: "" }).ANTHROPIC_API_KEY).toBeUndefined();
  });

  it("starts with .env.example copied verbatim", () => {
    const example = readFileSync(join(process.cwd(), ".env.example"), "utf8");
    const vars = Object.fromEntries(
      example
        .split("\n")
        .filter((line) => /^[A-Z_]+=/.test(line))
        .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
    );
    expect(Object.keys(vars)).toContain("DATABASE_URL");
    expect(() => parseEnv(vars)).not.toThrow();
  });

  it("accepts a full valid configuration", () => {
    const env = parseEnv({
      NODE_ENV: "production",
      ANTHROPIC_API_KEY: "sk-test",
      CARBONPASS_MODEL: "some-model-id",
      CARBONPASS_ETS_PRICE_EUR: "120",
      CARBONPASS_INR_PER_EUR: "95",
      CARBONPASS_DATA_DIR: "/var/lib/carbonpass",
      DATABASE_URL: "postgres://app:secret@db.internal:5432/carbonpass",
      CARBONPASS_SIGNUP: "invite",
      APP_URL: "https://carbonpass.example.com",
    });
    expect(env).toMatchObject({
      NODE_ENV: "production",
      CARBONPASS_MODEL: "some-model-id",
      CARBONPASS_ETS_PRICE_EUR: 120,
      CARBONPASS_DATA_DIR: "/var/lib/carbonpass",
      CARBONPASS_SIGNUP: "invite",
      APP_URL: "https://carbonpass.example.com",
    });
  });
});
