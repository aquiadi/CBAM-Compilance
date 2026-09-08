/**
 * Demo fixture integrity.
 *
 *   npm run data:manifest   regenerate the manifest after an intentional change
 *   npm run data:verify     fail if the fixtures no longer match it
 *
 * Why this exists rather than a data-versioning tool: the whole dataset is five
 * CSVs totalling a few tens of kilobytes, generated deterministically from a
 * seeded script. Pulling in a Python data-versioning stack with a remote store
 * to track that would be ceremony, not engineering.
 *
 * What actually matters is the guarantee such a tool provides: the numbers in
 * the README and the screenshots were produced from *these* bytes, and a silent
 * change to the demo data cannot pass unnoticed. A checksum manifest verified in
 * CI delivers exactly that, with no runtime dependency.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DEMO_DIR = join(process.cwd(), "data", "demo");
const MANIFEST = join(DEMO_DIR, "manifest.json");

interface FixtureEntry {
  file: string;
  sha256: string;
  bytes: number;
  /** Data rows, excluding the header. */
  rows: number;
}

interface Manifest {
  description: string;
  generator: string;
  /** Seed used by the generator; changing it changes every figure downstream. */
  seed: number;
  generatedAt: string;
  fixtures: FixtureEntry[];
}

const SEED = 20260101;

function describe(file: string): FixtureEntry {
  const content = readFileSync(join(DEMO_DIR, file));
  const text = content.toString("utf8").trim();
  return {
    file,
    sha256: createHash("sha256").update(content).digest("hex"),
    bytes: content.byteLength,
    rows: text.split("\n").length - 1,
  };
}

function currentFixtures(): FixtureEntry[] {
  return readdirSync(DEMO_DIR)
    .filter((f) => f.endsWith(".csv"))
    .sort()
    .map(describe);
}

function write(): void {
  const manifest: Manifest = {
    description:
      "Checksums for the seeded demo dataset. Verified in CI so the figures in " +
      "the README and screenshots always correspond to these exact bytes.",
    generator: "scripts/generate-fixtures.ts",
    seed: SEED,
    generatedAt: new Date().toISOString(),
    fixtures: currentFixtures(),
  };
  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`Wrote manifest for ${manifest.fixtures.length} fixtures:`);
  for (const f of manifest.fixtures) {
    console.log(
      `  ${f.file.padEnd(34)} ${f.rows.toString().padStart(3)} rows  ${f.sha256.slice(0, 12)}…`,
    );
  }
}

function verify(): void {
  let manifest: Manifest;
  try {
    manifest = JSON.parse(readFileSync(MANIFEST, "utf8")) as Manifest;
  } catch {
    console.error(`No readable manifest at ${MANIFEST}. Run: npm run data:manifest`);
    process.exit(1);
  }

  const actual = new Map(currentFixtures().map((f) => [f.file, f]));
  const expected = new Map(manifest.fixtures.map((f) => [f.file, f]));
  const problems: string[] = [];

  for (const [file, want] of expected) {
    const got = actual.get(file);
    if (!got) {
      problems.push(`missing: ${file}`);
      continue;
    }
    if (got.sha256 !== want.sha256) {
      problems.push(
        `changed: ${file}\n    expected sha256 ${want.sha256}\n    actual   sha256 ${got.sha256}\n` +
          `    rows ${want.rows} -> ${got.rows}, bytes ${want.bytes} -> ${got.bytes}`,
      );
    }
  }
  for (const file of actual.keys()) {
    if (!expected.has(file)) problems.push(`untracked: ${file}`);
  }

  if (problems.length > 0) {
    console.error("Demo fixtures do not match the manifest:\n");
    for (const p of problems) console.error(`  ${p}`);
    console.error(
      "\nIf the change was intentional, regenerate with `npm run seed` then " +
        "`npm run data:manifest`, and re-check any figures quoted in the README.",
    );
    process.exit(1);
  }

  console.log(
    `Demo fixtures verified: ${manifest.fixtures.length} files, ` +
      `${manifest.fixtures.reduce((s, f) => s + f.rows, 0)} rows, all checksums match.`,
  );
}

const mode = process.argv[2];
if (mode === "write") write();
else if (mode === "verify") verify();
else {
  console.error("Usage: tsx scripts/fixtures.ts <write|verify>");
  process.exit(1);
}
