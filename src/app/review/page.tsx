import { getDeclaration, getState } from "@/lib/store";
import { BAND_LABELS } from "@/lib/cbam/readiness";
import { isAiAvailable } from "@/lib/ai/client";
import { Card, fmt, Page, PageHeader } from "@/components/ui";
import { MiniBar } from "@/components/charts";
import { FindingsPanel } from "./findings-panel";

export const dynamic = "force-dynamic";

/**
 * Review.
 *
 * The heart of the product. The rules engine has already decided what is wrong;
 * this is where an operator works through it. Excluding a record here is a
 * first-class, reversible, recorded action - not a hidden filter - because a
 * declaration where someone quietly deleted an inconvenient row is worse than
 * no declaration at all.
 */
export default function ReviewPage() {
  const state = getState();
  const d = getDeclaration(state);

  const excludedById = new Map(state.exclusions.map((e) => [e.activityId, e]));
  const activityById = new Map(
    state.datasets.flatMap((ds) => ds.activities.map((a) => [a.id, a] as const)),
  );

  return (
    <>
      <PageHeader
        eyebrow="Step 2"
        title="Review and data quality"
        description={
          <>
            {d.findings.length} findings from{" "}
            {fmt(state.datasets.reduce((s, x) => s + x.activities.length, 0))} records. The rules
            engine decides what is wrong and how serious it is; the model can explain a finding and
            rank what to fix first, but it cannot create one, clear one, or change a severity.
          </>
        }
      />

      <Page>
        <div className="grid grid-cols-4 gap-5">
          <div className="col-span-3">
            <FindingsPanel
              findings={d.findings.map((f) => ({
                code: f.code,
                severity: f.severity,
                title: f.title,
                detail: f.detail,
                remedy: f.remedy,
                reference: f.reference,
                activityIds: f.activityIds,
                excludable: f.allowExclusion
                  ? f.activityIds.filter((id) => activityById.has(id))
                  : [],
                alreadyExcluded: f.activityIds.filter((id) => excludedById.has(id)),
              }))}
              aiAvailable={isAiAvailable()}
            />
          </div>

          <div className="space-y-5">
            <Card title="Readiness" subtitle={BAND_LABELS[d.readiness.band]}>
              <div className="space-y-3.5">
                {d.readiness.components.map((c) => (
                  <div key={c.id}>
                    <div className="flex items-baseline justify-between text-[11.5px]">
                      <span className="text-ink-2">{c.label}</span>
                      <span className="tnum text-ink">{c.score.toFixed(0)}</span>
                    </div>
                    <div className="mt-1">
                      <MiniBar value={c.score} />
                    </div>
                    <p className="mt-1 text-[10.5px] leading-[1.45] text-muted">{c.detail}</p>
                  </div>
                ))}
              </div>
            </Card>

            {state.exclusions.length > 0 ? (
              <Card
                title={`${state.exclusions.length} records excluded`}
                subtitle="Retained in the audit trail with the reason."
              >
                <ul className="space-y-2.5">
                  {state.exclusions.slice(0, 8).map((e) => {
                    const a = activityById.get(e.activityId);
                    return (
                      <li key={e.activityId} className="text-[11px] leading-[1.5]">
                        <div className="font-mono text-[10.5px] text-ink-2">
                          {a
                            ? `${a.lineage.fileName} row ${a.lineage.row}`
                            : e.activityId.slice(0, 8)}
                        </div>
                        <div className="text-muted">{e.reason}</div>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            ) : null}

            <Card title="How to read this">
              <div className="space-y-3 text-[11.5px] leading-[1.6] text-ink-2">
                <p>
                  <span className="text-critical">Blockers</span> stop a filing. An intensity far
                  outside the plausible band is not an unusual plant, it is an error in the data.
                </p>
                <p>
                  <span className="text-warning">Warnings</span> are things a verifier is entitled
                  to question. They do not stop a filing but each one is a conversation you will
                  have.
                </p>
                <p>
                  <span className="text-accent">Info</span> items are opportunities — usually a
                  cheaper, more accurate number available for the asking.
                </p>
              </div>
            </Card>
          </div>
        </div>
      </Page>
    </>
  );
}
