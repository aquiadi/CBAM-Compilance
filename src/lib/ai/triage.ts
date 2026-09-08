import * as z from "zod/v4";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { DeclarationResult } from "../cbam/declaration";
import type { Finding } from "../cbam/rules";
import { getClient, MODEL, withFallback, type AiOutcome } from "./client";

/**
 * Finding triage.
 *
 * The rules engine decides *what* is wrong. This decides *what to do first*,
 * and says it in the operator's language rather than the regulation's.
 *
 * Hard constraint: triage can reorder, explain and estimate the effort of a
 * finding. It cannot create one, delete one, or change its severity. A model
 * that could clear a compliance blocker by talking about it would be a
 * liability, so the merge step below only ever attaches commentary to findings
 * the deterministic engine already produced.
 */

const TriageItemSchema = z.object({
  code: z.string(),
  /** 1 = do this first. */
  priority: z.number().int().min(1),
  /** What this actually means for the operator, in their vocabulary. */
  plainEnglish: z.string(),
  /** The most likely root cause, given the plant's context. */
  likelyCause: z.string(),
  /** Concrete first step, naming a file or a person where possible. */
  firstStep: z.string(),
  effort: z.enum(["minutes", "hours", "days", "weeks"]),
  /** Rough tCO2e the declaration moves if this is resolved. 0 when unknown. */
  estimatedImpactT: z.number(),
});

const TriageSchema = z.object({
  summary: z.string(),
  items: z.array(TriageItemSchema),
});

export type TriageItem = z.infer<typeof TriageItemSchema>;

export interface TriagedFinding extends Finding {
  triage?: TriageItem;
}

export interface TriageResult {
  summary: string;
  findings: TriagedFinding[];
  outcome: AiOutcome;
}

const SYSTEM = `You triage data-quality findings on a CBAM emissions declaration for an Indian exporter.

You are given findings produced by a deterministic rules engine, plus the calculated declaration. Your job is to tell a plant engineer what to fix first and why it matters, in their language.

Constraints:

- You may only comment on findings that were given to you, identified by their code. Never invent a finding, never suggest a finding can be ignored because it is probably fine, and never contradict a severity. Blockers are blockers.
- Priority should reflect the emissions or money at stake and how cheap the fix is - not the order the findings arrived in. A warning worth 40,000 tCO2e outranks a blocker worth 12 tCO2e, so say so in the rationale while leaving the severity alone.
- estimatedImpactT is the change in declared emissions if the finding is resolved. Derive it from the numbers you were given. If you cannot derive it, use 0 - do not guess.
- Write for someone who runs a steel plant, not someone who reads regulations. "Your power bill is in million units but the import read it as megawatt-hours" beats "unit dimension mismatch in the electricity dataset".
- firstStep should name the file, the row, or the person to call.

Be concise. One or two sentences per field.`;

function buildPrompt(result: DeclarationResult): string {
  const findings = result.findings
    .map(
      (f) =>
        `- ${f.code} [${f.severity}] ${f.title}\n  detail: ${f.detail}\n  remedy: ${f.remedy}` +
        (f.activityIds.length ? `\n  affects ${f.activityIds.length} record(s)` : ""),
    )
    .join("\n");

  const lines = result.lines
    .map(
      (l) =>
        `- ${l.cnCode} ${l.description}: ${l.quantityT.toFixed(0)} t produced, ` +
        `${l.quantityEuT.toFixed(0)} t to the EU, ${l.seeDirect.toFixed(3)} tCO2e/t direct, ` +
        `${l.seeTotal.toFixed(3)} total` +
        (l.defaultSee ? ` (benchmark ${l.defaultSee})` : ""),
    )
    .join("\n");

  return `# Installation

${result.installation.name}, ${result.installation.operator} - ${result.installation.city}, ${result.installation.state}.
Processes: ${result.installation.processes.map((p) => `${p.name} (${p.route ?? p.category})`).join("; ")}.
Reporting period: ${result.period.start} to ${result.period.end}.

# Declaration as calculated

Total direct emissions: ${result.totals.directT.toFixed(0)} tCO2e
Total indirect emissions: ${result.totals.indirectT.toFixed(0)} tCO2e
Chargeable (EU-bound) emissions: ${result.totals.obligationT.toFixed(0)} tCO2e
Certificates at the ${result.exposure.year} CBAM factor of ${(result.exposure.cbamFactor * 100).toFixed(1)}%: ${result.exposure.netCertificates.toFixed(0)}
Cost at EUR ${result.exposure.etsPriceEur}/certificate: EUR ${result.exposure.netCostEur.toFixed(0)}

## Goods

${lines}

# Findings to triage

${findings}

Return one triage item per finding code above, ordered by priority.`;
}

export async function triageFindings(result: DeclarationResult): Promise<TriageResult> {
  if (result.findings.length === 0) {
    return {
      summary: "No open findings. The declaration is internally consistent.",
      findings: [],
      outcome: { producedBy: "heuristic", fallbackReason: "Nothing to triage." },
    };
  }

  const fallback = () => ({
    summary: heuristicSummary(result),
    items: [] as TriageItem[],
  });

  const { value, outcome } = await withFallback(async () => {
    const client = getClient();
    if (!client) throw new Error("No client");
    const started = Date.now();

    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM,
      thinking: { type: "adaptive" },
      messages: [{ role: "user", content: buildPrompt(result) }],
      output_config: { format: zodOutputFormat(TriageSchema) },
    });

    if (response.stop_reason === "refusal") throw new Error("Model declined to triage.");
    const parsed = response.parsed_output;
    if (!parsed) throw new Error("Model returned no parseable triage.");

    return {
      value: parsed,
      outcome: {
        producedBy: "model" as const,
        model: MODEL,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        latencyMs: Date.now() - started,
      },
    };
  }, fallback);

  return { summary: value.summary, findings: merge(result.findings, value.items), outcome };
}

/**
 * Attach triage commentary to findings.
 *
 * Only codes the engine actually produced survive. Anything the model invented
 * is dropped silently here rather than surfaced, because a fabricated finding
 * in a compliance queue costs an engineer a day chasing something that does not
 * exist.
 */
export function merge(findings: Finding[], items: TriageItem[]): TriagedFinding[] {
  const byCode = new Map<string, TriageItem[]>();
  for (const item of items) {
    byCode.set(item.code, [...(byCode.get(item.code) ?? []), item]);
  }

  const consumed = new Map<string, number>();
  const merged: TriagedFinding[] = findings.map((f) => {
    const queue = byCode.get(f.code);
    if (!queue || queue.length === 0) return f;
    // Several findings can share a code; hand them out in order.
    const index = consumed.get(f.code) ?? 0;
    consumed.set(f.code, index + 1);
    const triage = queue[Math.min(index, queue.length - 1)];
    return triage ? { ...f, triage } : f;
  });

  // Severity always wins over the model's priority: a blocker cannot be
  // demoted below a warning no matter how the model ranked it.
  const rank = { blocker: 0, warning: 1, info: 2 } as const;
  return merged.sort(
    (a, b) =>
      rank[a.severity] - rank[b.severity] ||
      (a.triage?.priority ?? 99) - (b.triage?.priority ?? 99) ||
      a.code.localeCompare(b.code),
  );
}

function heuristicSummary(result: DeclarationResult): string {
  const { blockers, warnings } = result.readiness;
  if (blockers > 0) {
    return (
      `${blockers} blocking finding${blockers > 1 ? "s" : ""} and ${warnings} warning${warnings === 1 ? "" : "s"} are open. ` +
      `The declaration cannot be filed until the blockers are cleared.`
    );
  }
  return (
    `No blocking findings. ${warnings} warning${warnings === 1 ? "" : "s"} remain, each of which a ` +
    `verifier is entitled to question.`
  );
}
