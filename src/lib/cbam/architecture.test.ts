import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Architecture tests.
 *
 * The central claim of this codebase is that the emissions engine is pure and
 * deterministic, and that no language model output can reach a calculation.
 * That claim is worth exactly as much as its enforcement, so it is enforced
 * here rather than left to code review and good intentions.
 */

const ENGINE_DIR = join(process.cwd(), "src", "lib", "cbam");

function engineSources(): { file: string; source: string }[] {
  return readdirSync(ENGINE_DIR)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .map((file) => ({ file, source: readFileSync(join(ENGINE_DIR, file), "utf8") }));
}

describe("engine purity", () => {
  it("has source files to check", () => {
    expect(statSync(ENGINE_DIR).isDirectory()).toBe(true);
    expect(engineSources().length).toBeGreaterThan(5);
  });

  it("imports nothing from the AI layer", () => {
    for (const { file, source } of engineSources()) {
      expect(source, `${file} must not import the AI layer`).not.toMatch(
        /from\s+["'](@\/lib\/ai|\.\.\/ai)/,
      );
    }
  });

  it("imports no model SDK", () => {
    for (const { file, source } of engineSources()) {
      expect(source, `${file} must not import a model SDK`).not.toMatch(/@anthropic-ai|openai/);
    }
  });

  it("reads no environment configuration, so the same inputs always give the same figures", () => {
    for (const { file, source } of engineSources()) {
      expect(source, `${file} must not read process.env`).not.toMatch(/process\.env/);
      expect(source, `${file} must not import config`).not.toMatch(/from\s+["']@\/config/);
    }
  });

  it("performs no network or filesystem I/O", () => {
    for (const { file, source } of engineSources()) {
      expect(source, `${file} must not fetch`).not.toMatch(/\bfetch\s*\(/);
      expect(source, `${file} must not touch the filesystem`).not.toMatch(/from\s+["']node:fs["']/);
    }
  });

  it("does not read the clock outside the declaration's own timestamp", () => {
    // A figure that changes with the wall clock is not reproducible. Only
    // declaration.ts may stamp the moment a declaration was computed.
    for (const { file, source } of engineSources()) {
      if (file === "declaration.ts") continue;
      expect(source, `${file} must not read the clock`).not.toMatch(/Date\.now\(\)|new Date\(\)/);
    }
  });
});
