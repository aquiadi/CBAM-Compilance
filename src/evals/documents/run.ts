import { execFileSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { cassetteCount, startCassettes, type CassetteMode } from "./cassette";
import { corpusHash, gate, type Baseline, type Check } from "./gate";
import {
  scoreDocument,
  summarise,
  type DocumentMetrics,
  type DocumentScore,
  type LabelledDocument,
} from "./score";

/**
 * The document-reading quality gate.
 *
 *   npm run eval:documents                        replay the cassettes, gate on the baseline (CI)
 *   npm run eval:documents -- --record --freeze   call the model, save cassettes, freeze a baseline
 *   npm run eval:documents -- --live              call the model, save nothing, gate (nightly)
 *   add --private                                 use evals/documents/private (real bills, gitignored)
 *
 * The design is evalgate's (github.com/aquiadi/CI-harness): pull requests
 * replay committed cassettes, so the full evaluation runs with no key, in
 * seconds, and cannot fail on somebody else's rate limit; a nightly job runs
 * the same suite live against the same baseline, to catch the model moving
 * under us. Nothing in CI freezes a baseline - that is a deliberate,
 * reviewable commit.
 */

const args = process.argv.slice(2);
const mode: CassetteMode = args.includes("--record")
  ? "record"
  : args.includes("--live")
    ? "live"
    : "replay";
const freeze = args.includes("--freeze");
const root = join(process.cwd(), "evals", "documents", args.includes("--private") ? "private" : "");
const reportPath =
  args[args.indexOf("--report") + 1] && args.includes("--report")
    ? args[args.indexOf("--report") + 1]!
    : join(process.cwd(), "artifacts", "evals", "documents-report.md");

function fail(message: string): never {
  console.error(`\n${message}\n`);
  process.exit(1);
}

if (!existsSync(join(root, "labels.json"))) {
  fail(`No corpus at ${root}. See README, "Document-reading gate".`);
}
const labels = JSON.parse(readFileSync(join(root, "labels.json"), "utf8")) as {
  corpus: string;
  documents: LabelledDocument[];
};
const baselinePath = join(root, "baseline.json");
const baseline: Baseline | null = existsSync(baselinePath)
  ? (JSON.parse(readFileSync(baselinePath, "utf8")) as Baseline)
  : null;

// Which provider answers. Replay needs no key, only to know which API the
// cassettes were recorded against; a placeholder key routes the client there.
if (mode === "replay") {
  const provider = baseline?.provider ?? "groq";
  if (provider === "groq") {
    delete process.env.ANTHROPIC_API_KEY;
    process.env.GROQ_API_KEY = "replay";
  } else {
    process.env.ANTHROPIC_API_KEY = "replay";
  }
} else if (!process.env.ANTHROPIC_API_KEY && !process.env.GROQ_API_KEY) {
  fail(`--${mode} calls the model: set GROQ_API_KEY (free) or ANTHROPIC_API_KEY.`);
}

const cassettes = join(root, "cassettes");
const session = startCassettes(cassettes, mode);

// Imported after the environment is settled: it is read once, at load.
const { env } = await import("../../config/env");
const { aiProvider } = await import("../../lib/ai/client");
const { extractDocument } = await import("../../lib/ai/extract");

const provider = aiProvider() ?? "none";
const models =
  provider === "groq" ? [env.GROQ_MODEL, env.GROQ_VISION_MODEL] : [env.CARBONPASS_MODEL];

console.log(
  `Document-reading eval - ${labels.documents.length} documents (${labels.corpus}), ${mode}, ${provider}\n`,
);

const scores: DocumentScore[] = [];
const rateLimited: string[] = [];
const notes: string[] = [];
const started = Date.now();
for (const doc of labels.documents) {
  const bytes = new Uint8Array(readFileSync(join(root, "corpus", doc.file)));
  const input = {
    bytes,
    mediaType: doc.mediaType as Parameters<typeof extractDocument>[0]["mediaType"],
    fileName: doc.file,
  };
  let { extraction, outcome } = await extractDocument(input);
  // A free-tier rate limit says nothing about reading; wait it out rather than
  // score it (twice at most, a minute each).
  for (
    let wait = 0;
    mode !== "replay" && wait < 2 && /limit/i.test(outcome.fallbackReason ?? "");
    wait++
  ) {
    console.log(`  (rate limited on ${doc.id}; waiting a minute)`);
    await new Promise((r) => setTimeout(r, 60_000));
    ({ extraction, outcome } = await extractDocument(input));
  }
  if (/limit/i.test(outcome.fallbackReason ?? "")) rateLimited.push(doc.id);
  const read = outcome.producedBy === "model";
  const score = scoreDocument(doc, extraction, read);
  scores.push(score);
  if (!read) notes.push(`${doc.id}: not read - ${outcome.fallbackReason ?? "unknown"}`);
  const mark = score.silentErrors > 0 ? "!" : score.found === score.expected && read ? " " : "~";
  console.log(
    `${mark} ${doc.id.padEnd(24)} found ${score.found}/${score.expected}  silent ${score.silentErrors}${
      score.problems.length ? `  - ${score.problems.join("; ")}` : ""
    }`,
  );
}
session.restore();

const metrics = summarise(scores);
const hash = corpusHash(root, labels.documents);
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

console.log(`
metric              value     baseline
------------------  --------  --------`);
for (const key of Object.keys(metrics) as (keyof DocumentMetrics)[]) {
  const value = key === "documents" ? String(metrics[key]) : pct(metrics[key]);
  const was = baseline?.metrics?.[key];
  const wasText = typeof was !== "number" ? "-" : key === "documents" ? String(was) : pct(was);
  console.log(`${key.padEnd(18)}  ${value.padStart(8)}  ${wasText.padStart(8)}`);
}
console.log(`wall time           ${((Date.now() - started) / 1000).toFixed(1)}s`);
for (const n of notes) console.log(`  note: ${n}`);

if (session.misses.length > 0) {
  fail(
    `${session.misses.length} model call(s) had no cassette. A prompt, model, schema or document changed.\n` +
      `Re-record: npm run eval:documents -- --record --freeze (needs GROQ_API_KEY or ANTHROPIC_API_KEY), then review the diff.`,
  );
}

function git(argv: string[]): string | null {
  try {
    return execFileSync("git", argv, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

let checks: Check[] = [];
if (freeze) {
  if (mode === "live")
    fail("--freeze needs --record (or a replay): a live run leaves no cassettes to replay.");
  if (rateLimited.length > 0) {
    fail(
      `Not freezing: ${rateLimited.join(", ")} hit a rate limit, and a baseline must measure the model, not the limit. Try again later.`,
    );
  }
  if (mode === "record") {
    // The directory holds exactly this run's calls, so the diff shows what changed.
    for (const f of readdirSync(cassettes)) {
      if (f.endsWith(".json") && !session.used.has(f)) unlinkSync(join(cassettes, f));
    }
  }
  const frozen: Baseline = {
    frozenAt: new Date().toISOString(),
    commit: git(["rev-parse", "--short", "HEAD"]),
    corpus: labels.corpus,
    corpusHash: hash,
    provider,
    models,
    cassettes: cassetteCount(cassettes),
    metrics,
  };
  writeFileSync(baselinePath, JSON.stringify(frozen, null, 2) + "\n");
  console.log(`\nFroze ${baselinePath}. Review and commit it with the cassettes.`);
} else {
  checks = gate(
    { metrics, corpusHash: hash, provider, models },
    baseline,
    mode === "live" ? "live" : "replay",
  );
  console.log("\ncheck               result  detail");
  for (const c of checks) {
    console.log(
      `${c.name.padEnd(18)}  ${c.passed ? "PASS" : "FAIL"}    ${c.reason ?? (c.baseline !== null && c.current !== null ? `${pct(c.baseline)} -> ${pct(c.current)}, ${c.allowed}` : "")}`,
    );
  }
}

// A markdown report for the CI artifact and the job summary.
const report = [
  `## Document-reading gate (${mode}, ${provider})`,
  "",
  `${labels.documents.length} documents from \`${labels.corpus}\`, models ${models.map((m) => `\`${m}\``).join(", ")}.`,
  "",
  "| metric | value | baseline |",
  "| --- | --- | --- |",
  ...(Object.keys(metrics) as (keyof DocumentMetrics)[]).map((k) => {
    const was = baseline?.metrics?.[k];
    const f = (x: number) => (k === "documents" ? String(x) : pct(x));
    return `| ${k} | ${f(metrics[k])} | ${typeof was === "number" ? f(was) : "-"} |`;
  }),
  "",
  ...(checks.length
    ? [
        "| check | result | detail |",
        "| --- | --- | --- |",
        ...checks.map(
          (c) => `| ${c.name} | ${c.passed ? "PASS" : "**FAIL**"} | ${c.reason ?? c.allowed} |`,
        ),
        "",
      ]
    : []),
  "| document | found | silent errors | problems |",
  "| --- | --- | --- | --- |",
  ...scores.map(
    (s) =>
      `| ${s.id} | ${s.found}/${s.expected} | ${s.silentErrors} | ${s.read ? s.problems.join("; ") || "-" : "not read"} |`,
  ),
  "",
].join("\n");
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, report);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);

if (checks.some((c) => !c.passed)) {
  fail("Document-reading gate FAILED. See the checks above.");
}
console.log(freeze ? "" : "\nDocument-reading gate passed.");
