/**
 * Eval harness for the schema-mapping agent.
 *
 *   npm run eval             heuristic baseline only, free and offline
 *   npm run eval -- --model  also runs the LLM mapper and prints both columns
 *
 * The baseline is the point. A model that cannot beat token overlap on this
 * task is not worth its latency, and the only way to know is to measure both on
 * the same cases every time.
 */
import { heuristicMapping } from "../lib/ingest/heuristic";
import { parseCsv } from "../lib/ingest/parse";
import { mapDataset } from "../lib/ai/mapper";
import { isAiAvailable, MODEL } from "../lib/ai/client";
import { CASES, PROCESSES } from "./fixtures/mapping";
import { formatReport, scoreCase, summarise, type CaseScore, type EvalSummary } from "./score";

const useModel = process.argv.includes("--model");
const verbose = process.argv.includes("--verbose");

async function runHeuristic(): Promise<EvalSummary> {
  const started = Date.now();
  const scores: CaseScore[] = CASES.map((testCase) => {
    const dataset = parseCsv(testCase.fileName, testCase.csv, testCase.id);
    return scoreCase(testCase, heuristicMapping(dataset, PROCESSES));
  });
  return summarise("heuristic", scores, Date.now() - started);
}

async function runModel(): Promise<EvalSummary> {
  const started = Date.now();
  // Cases run concurrently; they are independent and this keeps the loop short.
  const scores = await Promise.all(
    CASES.map(async (testCase) => {
      const dataset = parseCsv(testCase.fileName, testCase.csv, testCase.id);
      const { mapping, outcome } = await mapDataset(dataset, PROCESSES);
      if (outcome.producedBy !== "model") {
        console.warn(`  ! ${testCase.id} fell back to the heuristic: ${outcome.fallbackReason}`);
      }
      return scoreCase(testCase, mapping);
    }),
  );
  return summarise(MODEL, scores, Date.now() - started);
}

async function main() {
  console.log(`CarbonPass mapping eval - ${CASES.length} cases\n`);

  const summaries: EvalSummary[] = [await runHeuristic()];

  if (useModel) {
    if (!isAiAvailable()) {
      console.error("No model API key is set, so --model has nothing to run.\n");
      process.exitCode = 1;
    } else {
      summaries.push(await runModel());
    }
  }

  console.log(formatReport(summaries));

  for (const summary of summaries) {
    const failures = summary.cases.filter((c) => c.errors.length > 0);
    if (failures.length === 0) continue;
    console.log(`\n--- ${summary.label}: ${failures.length} case(s) with errors ---`);
    for (const c of failures) {
      console.log(`\n  ${c.caseId}`);
      console.log(`    why this case exists: ${c.intent}`);
      for (const e of c.errors.slice(0, verbose ? 100 : 6)) console.log(`    - ${e}`);
    }
  }

  if (!useModel) {
    console.log("\nRun with --model to compare against the LLM mapper (needs an API key).");
  }

  // The gate is the error rate, not accuracy: a miss is recoverable in the UI,
  // a confidently wrong mapping is what corrupts a declaration.
  const worst = Math.max(...summaries.map((s) => s.columnErrorRate));
  if (worst > 0.15) {
    console.error(`\nFAIL: column error rate ${(worst * 100).toFixed(1)}% exceeds the 15% gate.`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
