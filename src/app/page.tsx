import Link from "next/link";
import { getDeclaration, getState, rejectedRowCount } from "@/lib/store";
import { BAND_LABELS } from "@/lib/cbam/readiness";
import { isAiAvailable, MODEL } from "@/lib/ai/client";
import {
  Badge,
  Card,
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

export const dynamic = "force-dynamic";

export default function OverviewPage() {
  const state = getState();
  const d = getDeclaration(state);
  const rejected = rejectedRowCount(state);

  const blockers = d.findings.filter((f) => f.severity === "blocker");
  const topFindings = d.findings.slice(0, 5);

  const waterfall = [
    {
      label: "Combustion",
      value: Math.round(d.emissions.reduce((s, e) => s + e.contributions.fuel.reduce((a, c) => a + c.emissionsT, 0), 0)),
      color: SERIES.direct,
      detail: "Fuels burned on site, converted through net calorific value.",
    },
    {
      label: "Process",
      value: Math.round(d.emissions.reduce((s, e) => s + e.contributions.processMaterial.reduce((a, c) => a + c.emissionsT, 0), 0)),
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
      detail: "Embedded emissions bought in with sponge iron and alloys.",
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
        eyebrow={`${state.installation.operator} · ${state.installation.city}, ${state.installation.state}`}
        title={state.installation.name}
        description={
          <>
            CBAM declaration for {state.period.start} to {state.period.end} under the{" "}
            {state.period.regime} regime. Every figure below is recomputed from{" "}
            {fmt(state.datasets.reduce((s, x) => s + x.activities.length, 0))} activity records on
            each page load — nothing is cached, so nothing can go stale.
          </>
        }
        actions={
          <>
            <Badge tone={isAiAvailable() ? "accent" : "neutral"}>
              {isAiAvailable() ? `Model: ${MODEL}` : "Running deterministic"}
            </Badge>
            <Link
              href="/declaration"
              className="rounded-md bg-accent px-3 py-1.5 text-[12px] font-medium text-plane transition-opacity hover:opacity-90"
            >
              Open declaration
            </Link>
          </>
        }
      />

      <Page>
        {blockers.length > 0 ? (
          <div className="mb-5">
            <Note tone="critical">
              <span className="font-medium text-critical">
                {blockers.length} blocking finding{blockers.length > 1 ? "s" : ""} —
                this declaration cannot be filed.
              </span>{" "}
              {blockers[0]?.title}.{" "}
              <Link href="/review" className="text-accent underline underline-offset-2">
                Review findings
              </Link>
            </Note>
          </div>
        ) : null}

        <div className="grid grid-cols-4 gap-4">
          <Stat
            label="Chargeable emissions"
            value={fmtCompact(d.totals.obligationT)}
            unit="tCO₂e"
            sub={`Embedded in ${fmt(d.totals.goodsEuT)} t shipped to the EU`}
          />
          <Stat
            label={`Certificates · ${d.exposure.year}`}
            value={fmt(d.exposure.netCertificates)}
            sub={`CBAM factor ${(d.exposure.cbamFactor * 100).toFixed(1)}% of the obligation`}
          />
          <Stat
            label="Exposure this period"
            value={fmtEur(d.exposure.netCostEur)}
            sub={`₹${fmtCompact(d.exposure.netCostInr)} at €${d.assumptions.etsPriceEur}/certificate`}
            tone="accent"
          />
          <Stat
            label="Open findings"
            value={fmt(d.findings.length)}
            sub={
              <span className="flex flex-wrap gap-x-2.5 gap-y-1">
                <span className="text-critical">{d.readiness.blockers} blocking</span>
                <span className="text-warning">{d.readiness.warnings} warning</span>
                <span className="text-muted">
                  {d.findings.length - d.readiness.blockers - d.readiness.warnings} info
                </span>
              </span>
            }
            tone={d.readiness.blockers > 0 ? "critical" : "good"}
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
              title="Intensity against sector benchmarks"
              subtitle="Specific embedded emissions per tonne, compared with an indicative benchmark for the route."
            >
              <BenchmarkBars
                rows={d.lines.map((l) => ({
                  label: l.description.length > 46 ? `${l.description.slice(0, 45)}…` : l.description,
                  sublabel: `CN ${l.cnCode}`,
                  value: l.seeForObligation,
                  benchmark: l.defaultSee,
                }))}
              />
              <p className="mt-3 text-[10.5px] leading-[1.55] text-muted">{d.disclaimer}</p>
            </Card>

            <Card
              title={`Exposure across the phase-in, at €${d.assumptions.etsPriceEur}/certificate`}
              subtitle="Holding this period's volumes and intensity constant. Free allocation in the EU ETS is withdrawn on a fixed schedule, so the same tonne costs forty times more in 2034 than in 2026."
            >
              <TrajectoryLine points={d.exposure.trajectory} />
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
                        style={{
                          width: `${c.score}%`,
                          background: scoreColor(c.score),
                        }}
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
                  { label: "Indirect", value: Math.round(d.totals.indirectT), color: SERIES.indirect },
                  { label: "Precursors", value: Math.round(d.totals.precursorT), color: SERIES.precursor },
                ]}
              />
              <div className="mt-4 border-t border-line pt-3 text-[11px] leading-[1.6] text-ink-2">
                For iron & steel, aluminium and hydrogen, Annex II counts only{" "}
                <span className="text-ink">direct</span> emissions towards the obligation. Indirect
                emissions are still reported in full — operators routinely read “not counted” as
                “not reported”, and it is not.
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
                      <div className="mt-0.5 text-[10.5px] text-muted">{f.code}</div>
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
            subtitle={`${state.datasets.length} files · ${fmt(state.datasets.reduce((s, x) => s + x.activities.length, 0))} activity records${rejected > 0 ? ` · ${rejected} rows not imported` : ""}`}
            padded={false}
            actions={
              <Link href="/ingest" className="text-[11px] text-accent hover:underline">
                Manage →
              </Link>
            }
          >
            <Table>
              <thead>
                <tr>
                  <Th>File</Th>
                  <Th>Detected as</Th>
                  <Th align="right">Rows</Th>
                  <Th align="right">Records</Th>
                  <Th align="right">Not imported</Th>
                  <Th>Mapped by</Th>
                </tr>
              </thead>
              <tbody>
                {state.datasets.map((ds) => (
                  <tr key={ds.id} className="hover:bg-surface-2">
                    <Td className="font-mono text-[11.5px] text-ink">{ds.fileName}</Td>
                    <Td>{ds.mapping.kind.replace(/_/g, " ")}</Td>
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
                        <span className="text-muted">—</span>
                      )}
                    </Td>
                    <Td>
                      <Badge tone={ds.mapping.producedBy === "model" ? "accent" : "neutral"}>
                        {ds.mapping.producedBy === "model"
                          ? ds.mapping.model ?? "AI model"
                          : "Deterministic"}
                      </Badge>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        </div>
      </Page>
    </>
  );
}
