import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Workspace state location.
 *
 * The container sets CARBONPASS_DATA_DIR to an absolute path that is also the
 * volume mount point. `join` would nest that under the working directory
 * (/app + /app/.data = /app/app/.data), writing state outside the mounted
 * volume where it silently fails to survive a restart. `resolve` is the correct
 * primitive and this pins it.
 */
describe("data directory resolution", () => {
  it("honours an absolute directory, as the container supplies", () => {
    expect(resolve("/app", "/app/.data")).toBe("/app/.data");
  });

  it("resolves a relative directory against the working directory", () => {
    expect(resolve("/app", ".data")).toBe("/app/.data");
  });

  it("is what store.ts actually uses", async () => {
    const source = await import("node:fs").then((fs) =>
      fs.readFileSync("src/lib/store.ts", "utf8"),
    );
    expect(source).toMatch(/resolve\(process\.cwd\(\), env\.CARBONPASS_DATA_DIR\)/);
    expect(source).not.toMatch(/join\(process\.cwd\(\), env\.CARBONPASS_DATA_DIR\)/);
  });
});
