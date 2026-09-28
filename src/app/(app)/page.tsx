import Link from "next/link";
import { BAND_LABELS } from "@/lib/cbam/readiness";
import { workspaceContext } from "@/lib/auth/context";
import { computeDeclaration } from "@/lib/workspace/declaration";
import {
  Badge,
  Card,
  Empty,
  fmt,
  fmtCompact,
  fmtEur,
  Note,
  Page,
  PageHeader,
  SeverityBadge,
  Stat,
  Table,
  Td,
  Th,
} from "@/components/ui";
import {
  BenchmarkBars,
  ReadinessMeter,
  StackBar,
  TrajectoryLine,
  Waterfall,
} from "@/components/charts";
import { NEUTRAL, scoreColor, SERIES } from "@/lib/palette";

export default async function OverviewPage() {
  const ctx = await workspaceContext();
  const state = ctx.workspace.state;
  const d = await computeDeclaration(ctx.db, ctx.workspace);
  const inst = state.installation;

  const confirmed = state.datasets.filter((x) => x.status === "confirmed");
  const drafts = state.datasets.filter((x) => x.status === "draft");
  const records = confirmed.reduce((s, x) => s + x.activities.length, 0);
  const rejected = confirmed.reduce((s, x) => s + x.rejected.length, 0);
  const blockers = d.findings.filter((f) => f.severity === "blocker");
  const topFindings = d.findings.slice(0, 5);
  const saving = d.exposure.defaultScenario.costEur - d.exposure.netCostEur;

  if (inst.processes.length === 0 || state.datasets.length === 0) {
    return (
      <>
        <PageHeader eyebrow={inst.operator} title={inst.name || ctx.workspace.name} />
        <Page>
          <Card title="Getting started">
            <ol className="list-decimal space-y-2 pl-5 text-[12.5px] leading-[1.6] text-ink-2">
              <li className={inst.processes.length > 0 ? "text-muted line-through" : ""}>
                <Link href="/settings" className="text-accent hover:underline">
                  Define the installation
                </Link>{" "}
                - its production processes, the route of each (it selects the CBAM benchmark) and
                which processes feed which.
              </li>
              <li>
                <Link href="/ingest" className="text-accent hover:underline">
                  Upload your data
                </Link>{" "}
                - fuel, electricity, process materials, production and despatch, precursor receipts.
                CSV or Excel, straight out of SAP, Tally or the DISCOM portal.
              </li>
              <li>Review each file&apos;s mapping and confirm it.</li>
              <li>Work through the findings, then export the report and the verifier pack.</li>
            </ol>
          </Card>
        </Page>
      </>
    );
  }

  const sum = (items: { emissionsT: number }[]) => items.reduce((a, c) => a + c.emissionsT, 0);
  const waterfall = [
    {
      label: "Combustion",
      value: Math.round(d.emissions.reduce((s, e) => s + sum(e.contributions.fuel), 0)),
      color: SERIES.direct,
      detail: "Fuels burned on site, converted through net calorific value.",
    },
    {
      label: "Process",
      value: Math.round(d.emissions.reduce((s, e) => s + sum(e.contributions.processMaterial), 0)),
      color: SERIES.other,
      detail: "Carbonate calcination and electrode consumption.",
    },
    {
      label: "Electricity",
      value: Math.round(d.totals.indirectT),
      color: SERIES.indirect,
      detail: "Indirect emissions from purchased and contracted power.",
    },
    {
      label: "Precursors",
      value: Math.round(d.totals.precursorT),
      color: SERIES.precursor,
      detail: "Embedded emissions bought in with precursors (supplier values or defaults).",
    },
    {
      label: "Site total",
      value: Math.round(d.totals.totalEmbeddedT),
      color: NEUTRAL,
      total: true,
      detail: "Cradle-to-gate footprint of everything the site produced this period.",
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow={`${inst.operator} · ${[inst.city, inst.state].filter(Boolean).join(", ")}`}
        title={inst.name}
        description={
          <>
            CBAM for {d.period.start} to {d.period.end} (production year {d.period.year}). Every
            figure is recomputed from {fmt(records)} activity records on each page load, with the
            Commission&apos;s published benchmarks and default values.
          </>
        }
        actions={
          <Link
            href="/declaration"
            className="rounded-md bg-accent px-3 py-1.5 text-[12px] font-medium text-plane transition-opacity hover:opacity-90"
          >
            Open declaration
          </Link>
        }
      />

      <Page>
        <div className="mb-5 space-y-2">
          {blockers.length > 0 ? (
            <Note tone="critical">
              <span className="font-medium text-critical">
                {blockers.length} blocking finding{blockers.length > 1 ? "s" : ""} - not ready for
                verification.
              </span>{" "}
              {blockers[0]?.title}.{" "}
              <Link href="/review" className="text-accent underline underline-offset-2">
                Review findings
              </Link>
            </Note>
          ) : null}
          {drafts.length > 0 ? (
            <Note tone="warning">
              {drafts.length} uploaded file{drafts.length > 1 ? "s are" : " is"} still a draft and
              not counted: {drafts.map((x) => x.fileName).join(", ")}.{" "}
              <Link href="/ingest" className="text-accent underline underline-offset-2">
                Review and confirm
              </Link>
            </Note>
          ) : null}
        </div>

        <div className="grid grid-cols-4 gap-4">
          <Stat
            label="EU-bound embedded emissions"
            value={fmtCompact(d.totals.obligationT)}
            unit="tCO₂e"
            sub={`In ${fmt(d.totals.goodsEuT)} t shipped to the EU`}
          />
          <Stat
            label={`Certificates · ${d.period.year}`}
            value={fmt(d.exposure.netCertificates)}
            sub={`After a free allocation adjustment of ${fmt(d.exposure.freeAllocationAdjustmentT)} tCO₂e (CBAM factor ${(d.exposure.cbamFactor * 100).toFixed(1)}%)`}
          />
          <Stat
            label="Cost to your EU importers"
            value={fmtEur(d.exposure.netCostEur)}
            sub={`₹${fmtCompact(d.exposure.netCostInr)} · average €${d.exposure.effectivePriceEur.toFixed(2)}/certificate`}
            tone="accent"
          />
          <Stat
            label="Worth of your actual data"
            value={saving > 0 ? fmtEur(saving) : "-"}
            sub={
              d.exposure.defaultScenario.complete
                ? `On default values the same goods would cost ${fmtEur(d.exposure.defaultScenario.costEur)} - once your data is verified.`
                : "Some goods have no published default to compare against."
            }
            tone={saving > 0 ? "good" : undefined}
          />
        </div>

        <div className="mt-5 grid grid-cols-3 gap-5">
          <div className="col-span-2 space-y-5">
            <Card
              title="Where the emissions come from"
              subtitle="Contributions to the site's cradle-to-gate footprint. Hover a bar for the method behind it."
            >
              <Waterfall steps={waterfall} />
            </Card>

            <Card
              title="Your intensity against the Commission default"
              subtitle="Specific embedded emissions counted towards the obligation, against the default value for India including the year's mark-up - what your importer must use without your verified data."
            >
              <BenchmarkBars
                benchmarkLabel="Commission default incl. mark-up"
                rows={d.lines.map((l) => ({
                  label:
                    l.description.length > 46 ? `${l.description.slice(0, 45)}…` : l.description,
                  sublabel: `CN ${l.cnCode}`,
                  value: l.seeForObligation,
                  benchmark: l.defaultSee,
                }))}
              />
            </Card>

            <Card
              title="Cost across the phase-in"
              subtitle={`Same volumes and intensity each year, recomputed with that year's CBAM factor and default mark-up, at €${state.assumptions.etsPriceEur}/certificate after 2026.`}
            >
              <TrajectoryLine
                points={d.exposure.trajectory.map((t) => ({
                  year: t.year,
                  costEur: t.costEur,
                  factor: t.factor,
                  certificates: t.certificates,
                  defaultCostEur: t.defaultCostEur,
                }))}
              />
            </Card>
          </div>

          <div className="space-y-5">
            <Card title="Declaration readiness" subtitle="Weighted to what a verifier tests first.">
              <ReadinessMeter
                score={d.readiness.score}
                band={BAND_LABELS[d.readiness.band]}
                bandId={d.readiness.band}
              />
              <div className="mt-5 space-y-3">
                {d.readiness.components.map((c) => (
                  <div key={c.id}>
                    <div className="flex items-baseline justify-between text-[11.5px]">
                      <span className="text-ink-2">{c.label}</span>
                      <span className="tnum text-ink">{c.score.toFixed(0)}</span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${c.score}%`, background: scoreColor(c.score) }}
                      />
                    </div>
                    {c.nextAction ? (
                      <p className="mt-1 text-[10.5px] leading-[1.45] text-muted">{c.nextAction}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            </Card>

            <Card title="Emissions split" subtitle="Direct, indirect and bought-in precursors.">
              <StackBar
                segments={[
                  { label: "Direct", value: Math.round(d.totals.directT), color: SERIES.direct },
                  {
                    label: "Indirect",
                    value: Math.round(d.totals.indirectT),
                    color: SERIES.indirect,
                  },
                  {
                    label: "Precursors",
                    value: Math.round(d.totals.precursorT),
                    color: SERIES.precursor,
                  },
                ]}
              />
              <div className="mt-4 border-t border-line pt-3 text-[11px] leading-[1.6] text-ink-2">
                For iron & steel, aluminium and hydrogen only{" "}
                <span className="text-ink">direct</span> emissions count towards the obligation
                (Annex II). Indirect emissions are still reported.
              </div>
            </Card>

            <Card
              title="Top findings"
              subtitle="Ordered by severity."
              actions={
                <Link href="/review" className="text-[11px] text-accent hover:underline">
                  All {d.findings.length} →
                </Link>
              }
            >
              <ul className="space-y-3">
                {topFindings.map((f) => (
                  <li key={`${f.code}-${f.title}`} className="flex gap-2.5">
                    <SeverityBadge severity={f.severity} />
                    <div className="min-w-0">
                      <div className="text-[11.5px] font-medium leading-tight text-ink">
                        {f.title}
                      </div>
                      <div className="mt-0.5 text-[10.5px] text-muted">
                        {f.code}
                        {f.acknowledged ? " · acknowledged" : ""}
                      </div>
                    </div>
                  </li>
                ))}
                {topFindings.length === 0 ? (
                  <li className="text-[11.5px] text-muted">No findings open.</li>
                ) : null}
              </ul>
            </Card>
          </div>
        </div>

        <div className="mt-5">
          <Card
            title="Source data"
            subtitle={`${state.datasets.length} files · ${fmt(records)} activity records counted${rejected > 0 ? ` · ${rejected} rows not imported` : ""}`}
            padded={false}
            actions={
              <Link href="/ingest" className="text-[11px] text-accent hover:underline">
                Manage →
              </Link>
            }
          >
            {state.datasets.length === 0 ? (
              <div className="p-5">
                <Empty>No files yet.</Empty>
              </div>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>File</Th>
                    <Th>Detected as</Th>
                    <Th>Status</Th>
                    <Th align="right">Rows</Th>
                    <Th align="right">Records</Th>
                    <Th align="right">Not imported</Th>
                    <Th>Mapped by</Th>
                  </tr>
                </thead>
                <tbody>
                  {state.datasets.map((ds) => (
                    <tr key={ds.id} className="hover:bg-surface-2">
                      <Td className="font-mono text-[11.5px] text-ink">
                        <Link href={`/ingest/${ds.id}`} className="hover:text-accent">
                          {ds.fileName}
                        </Link>
                      </Td>
                      <Td>{ds.mapping.kind.replace(/_/g, " ")}</Td>
                      <Td>
                        <Badge tone={ds.status === "confirmed" ? "good" : "warning"}>
                          {ds.status === "confirmed" ? "Confirmed" : "Draft"}
                        </Badge>
                      </Td>
                      <Td align="right" numeric>
                        {fmt(ds.rowCount)}
                      </Td>
                      <Td align="right" numeric>
                        {fmt(ds.activities.length)}
                      </Td>
                      <Td align="right" numeric>
                        {ds.rejected.length > 0 ? (
                          <span className="text-warning">{ds.rejected.length}</span>
                        ) : (
                          <span className="text-muted">-</span>
                        )}
                      </Td>
                      <Td>
                        <Badge tone={ds.mapping.producedBy === "model" ? "accent" : "neutral"}>
                          {ds.mapping.producedBy === "model"
                            ? (ds.mapping.model ?? "AI model")
                            : "Deterministic"}
                        </Badge>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </div>
      </Page>
    </>
  );
}
