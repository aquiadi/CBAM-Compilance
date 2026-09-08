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
    expect(env.CARBONPASS_ETS_PRICE_EUR).toBe(78);
    expect(env.CARBONPASS_INR_PER_EUR).toBe(92);
    expect(env.CARBONPASS_YEAR).toBe(2026);
    expect(env.CARBONPASS_DATA_DIR).toBe(".data");
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it("coerces numeric strings, because env vars are always strings", () => {
    const env = parseEnv({ CARBONPASS_ETS_PRICE_EUR: "95.5", CARBONPASS_YEAR: "2030" });
    expect(env.CARBONPASS_ETS_PRICE_EUR).toBe(95.5);
    expect(env.CARBONPASS_YEAR).toBe(2030);
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

  it("rejects a compliance year outside the regime's lifetime", () => {
    expect(() => parseEnv({ CARBONPASS_YEAR: "1999" })).toThrow(/CARBONPASS_YEAR/);
    expect(() => parseEnv({ CARBONPASS_YEAR: "2099" })).toThrow(/CARBONPASS_YEAR/);
  });

  it("rejects a non-integer compliance year", () => {
    expect(() => parseEnv({ CARBONPASS_YEAR: "2026.5" })).toThrow(/CARBONPASS_YEAR/);
  });

  it("treats an empty API key as absent rather than as a usable credential", () => {
    expect(() => parseEnv({ ANTHROPIC_API_KEY: "" })).toThrow(/ANTHROPIC_API_KEY/);
  });

  it("accepts a full valid configuration", () => {
    const env = parseEnv({
      NODE_ENV: "production",
      ANTHROPIC_API_KEY: "sk-test",
      CARBONPASS_MODEL: "some-model-id",
      CARBONPASS_ETS_PRICE_EUR: "120",
      CARBONPASS_INR_PER_EUR: "95",
      CARBONPASS_YEAR: "2034",
      CARBONPASS_DATA_DIR: "/var/lib/carbonpass",
    });
    expect(env).toMatchObject({
      NODE_ENV: "production",
      CARBONPASS_MODEL: "some-model-id",
      CARBONPASS_ETS_PRICE_EUR: 120,
      CARBONPASS_YEAR: 2034,
      CARBONPASS_DATA_DIR: "/var/lib/carbonpass",
    });
  });
});
