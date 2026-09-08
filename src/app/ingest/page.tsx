import { getState } from "@/lib/store";
import { DATASET_SCHEMAS } from "@/lib/ingest/schema";
import { isAiAvailable, MODEL } from "@/lib/ai/client";
import { Badge, Card, fmt, Note, Page, PageHeader, Table, Td, Th } from "@/components/ui";
import { RemapButton } from "./remap-button";

export const dynamic = "force-dynamic";

/**
 * Ingest.
 *
 * The screen where the AI actually earns its place, so it shows its work: what
 * each column was mapped to, how confident the mapper was, and the evidence it
 * used. Anything below 0.7 is flagged for confirmation, and every row that
 * could not be imported is listed rather than quietly dropped.
 */
export default function IngestPage() {
  const state = getState();
  const totalRejected = state.datasets.reduce((s, d) => s + d.rejected.length, 0);

  return (
    <>
      <PageHeader
        eyebrow="Step 1"
        title="Ingest and column mapping"
        description={
          <>
            Five files straight out of the plant&apos;s systems — an SAP consumption extract, DISCOM
            bills, a despatch register. Each column is mapped onto the engine&apos;s schema, each
            free-text material resolved to an emission factor, and every id checked against the
            engine&apos;s own tables before it can reach a calculation.
          </>
        }
        actions={
          <Badge tone={isAiAvailable() ? "accent" : "neutral"}>
            {isAiAvailable() ? `${MODEL} available` : "No API key — deterministic mapper"}
          </Badge>
        }
      />

      <Page>
        {!isAiAvailable() ? (
          <div className="mb-5">
            <Note tone="accent">
              <span className="font-medium text-ink">No model API key is set</span>, so mapping ran
              on the deterministic token-overlap mapper. The app is fully functional this way — that
              is the point of the fallback — but the model handles the ambiguous cases better. Set a
              key and press <span className="text-ink">Re-map with AI</span> on any file to compare.
            </Note>
          </div>
        ) : null}

        {totalRejected > 0 ? (
          <div className="mb-5">
            <Note tone="critical">
              <span className="font-medium text-critical">
                {totalRejected} rows could not be imported.
              </span>{" "}
              They carried data but no usable process, unit or quantity. A row that never becomes a
              record is invisible to every downstream check, so it is listed in full below rather
              than dropped.
            </Note>
          </div>
        ) : null}

        <div className="space-y-5">
          {state.datasets.map((ds) => {
            const schema = DATASET_SCHEMAS[ds.mapping.kind];
            const mapped = ds.mapping.columns.filter((c) => c.targetField);
            const unmapped = ds.mapping.columns.filter((c) => !c.targetField);
            const lowConfidence = ds.mapping.columns.filter(
              (c) => c.targetField && c.confidence < 0.7,
            );

            return (
              <Card
                key={ds.id}
                title={
                  <span className="font-mono text-[12.5px]">{ds.fileName}</span>
                }
                subtitle={
                  <>
                    Detected as <span className="text-ink-2">{schema.label}</span> ·{" "}
                    {fmt(ds.rowCount)} rows → {fmt(ds.activities.length)} activity records ·{" "}
                    {mapped.length} of {ds.mapping.columns.length} columns mapped
                  </>
                }
                actions={
                  <div className="flex items-center gap-2">
                    <Badge tone={ds.mapping.producedBy === "model" ? "accent" : "neutral"}>
                      {ds.mapping.producedBy === "model"
                        ? ds.mapping.model ?? "AI model"
                        : "Deterministic"}
                    </Badge>
                    <RemapButton datasetId={ds.id} enabled={isAiAvailable()} />
                  </div>
                }
                padded={false}
              >
                <div className="grid grid-cols-2 divide-x divide-line">
                  <div>
                    <div className="border-b border-line px-5 py-2 text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted">
                      Column mapping
                    </div>
                    <Table>
                      <thead>
                        <tr>
                          <Th>Source column</Th>
                          <Th>Canonical field</Th>
                          <Th align="right">Conf.</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {ds.mapping.columns.map((c) => (
                          <tr key={c.sourceColumn} className="group hover:bg-surface-2">
                            <Td className="font-mono text-[11.5px] text-ink">{c.sourceColumn}</Td>
                            <Td>
                              {c.targetField ? (
                                <span className="text-ink">
                                  {c.targetField}
                                  {c.detectedUnit ? (
                                    <span className="ml-1.5 rounded bg-surface-3 px-1 py-0.5 font-mono text-[10px] text-accent">
                                      {c.detectedUnit}
                                    </span>
                                  ) : null}
                                </span>
                              ) : (
                                <span className="text-muted">— not used</span>
                              )}
                              <div className="mt-0.5 max-w-[280px] text-[10.5px] leading-[1.45] text-muted">
                                {c.rationale}
                              </div>
                            </Td>
                            <Td align="right" numeric>
                              {c.targetField ? (
                                <span
                                  className={
                                    c.confidence >= 0.9
                                      ? "text-good"
                                      : c.confidence >= 0.7
                                        ? "text-ink-2"
                                        : "text-warning"
                                  }
                                >
                                  {c.confidence.toFixed(2)}
                                </span>
                              ) : (
                                <span className="text-muted">—</span>
                              )}
                            </Td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </div>

                  <div>
                    <div className="border-b border-line px-5 py-2 text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted">
                      Value resolution
                    </div>
                    {ds.mapping.values.length === 0 ? (
                      <p className="px-5 py-4 text-[11.5px] text-muted">
                        This file has no free-text values needing resolution.
                      </p>
                    ) : (
                      <Table>
                        <thead>
                          <tr>
                            <Th>Source value</Th>
                            <Th>Resolved to</Th>
                            <Th align="right">Conf.</Th>
                          </tr>
                        </thead>
                        <tbody>
                          {ds.mapping.values.map((v) => (
                            <tr key={`${v.target}-${v.sourceValue}`} className="hover:bg-surface-2">
                              <Td className="text-ink">{v.sourceValue}</Td>
                              <Td>
                                {v.resolvedId ? (
                                  <span className="font-mono text-[11px] text-ink">
                                    {v.resolvedId}
                                  </span>
                                ) : (
                                  <Badge tone="warning">unresolved</Badge>
                                )}
                                <span className="ml-1.5 text-[10px] uppercase tracking-wide text-muted">
                                  {v.target}
                                </span>
                                <div className="mt-0.5 max-w-[280px] text-[10.5px] leading-[1.45] text-muted">
                                  {v.rationale}
                                </div>
                              </Td>
                              <Td align="right" numeric>
                                <span
                                  className={
                                    v.confidence >= 0.9
                                      ? "text-good"
                                      : v.confidence >= 0.7
                                        ? "text-ink-2"
                                        : "text-warning"
                                  }
                                >
                                  {v.confidence.toFixed(2)}
                                </span>
                              </Td>
                            </tr>
                          ))}
                        </tbody>
                      </Table>
                    )}
                  </div>
                </div>

                {(ds.mapping.warnings.length > 0 || lowConfidence.length > 0) ? (
                  <div className="space-y-2 border-t border-line px-5 py-3.5">
                    {lowConfidence.length > 0 ? (
                      <Note tone="warning">
                        {lowConfidence.length} column
                        {lowConfidence.length > 1 ? "s were" : " was"} mapped below 0.70 confidence
                        and should be confirmed before filing:{" "}
                        {lowConfidence.map((c) => c.sourceColumn).join(", ")}.
                      </Note>
                    ) : null}
                    {ds.mapping.warnings.map((w, i) => (
                      <Note key={i} tone="warning">
                        {w}
                      </Note>
                    ))}
                  </div>
                ) : null}

                {ds.rejected.length > 0 ? (
                  <div className="border-t border-line">
                    <div className="px-5 py-2 text-[10.5px] font-medium uppercase tracking-[0.12em] text-critical">
                      {ds.rejected.length} rows not imported
                    </div>
                    <Table>
                      <thead>
                        <tr>
                          <Th align="right">Row</Th>
                          <Th>Reason</Th>
                          <Th>Source values</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {ds.rejected.slice(0, 6).map((r, i) => (
                          <tr key={i} className="hover:bg-surface-2">
                            <Td align="right" numeric>
                              {r.row}
                            </Td>
                            <Td className="text-ink-2">{r.reason}</Td>
                            <Td className="font-mono text-[10.5px] text-muted">
                              {Object.entries(r.raw)
                                .filter(([, v]) => v)
                                .slice(0, 4)
                                .map(([k, v]) => `${k}=${v}`)
                                .join("  ")}
                            </Td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                    {ds.rejected.length > 6 ? (
                      <p className="px-5 py-2 text-[11px] text-muted">
                        and {ds.rejected.length - 6} more.
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {unmapped.length > 0 ? (
                  <div className="border-t border-line px-5 py-2.5 text-[11px] text-muted">
                    Ignored as not needed by the engine:{" "}
                    <span className="font-mono">{unmapped.map((c) => c.sourceColumn).join(", ")}</span>
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      </Page>
    </>
  );
}
