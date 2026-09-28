import Link from "next/link";
import { BAND_LABELS } from "@/lib/cbam/readiness";
import { workspaceContext } from "@/lib/auth/context";
import { computeDeclaration } from "@/lib/workspace/declaration";
import {
  Badge,
  Card,
  Disclosure,
  fmt,
  fmtCompact,
  fmtEur,
  Page,
  PageHeader,
  Stat,
  Table,
  Td,
  Th,
} from "@/components/ui";
import { BenchmarkBars, StackBar, TrajectoryLine, Waterfall } from "@/components/charts";
import { bandColor, NEUTRAL, scoreColor, SERIES } from "@/lib/palette";

/**
 * The overview answers two questions and nothing else first: where does this
 * declaration stand, and what is the one thing to do next. Everything that
 * explains the figures is folded under "More detail" for whoever wants it.
 */
export default async function OverviewPage() {
  const ctx = await workspaceContext();
  const state = ctx.workspace.state;
  const inst = state.installation;

  if (inst.processes.length === 0 || state.datasets.length === 0) {
    return (
      <GettingStarted
        name={inst.name || ctx.workspace.name}
        hasProcesses={inst.processes.length > 0}
      />
    );
  }

  const d = await computeDeclaration(ctx.db, ctx.workspace);
  const confirmed = state.datasets.filter((x) => x.status === "confirmed");
  const drafts = state.datasets.filter((x) => x.status === "draft");
  const records = confirmed.reduce((s, x) => s + x.activities.length, 0);
  const rejected = confirmed.reduce((s, x) => s + x.rejected.length, 0);
  const blockers = d.findings.filter((f) => f.severity === "blocker");
  const openWarnings = d.findings.filter((f) => f.severity === "warning" && !f.acknowledged);
  const saving = d.exposure.defaultScenario.costEur - d.exposure.netCostEur;

  const next =
    drafts.length > 0
      ? {
          title: `Confirm ${drafts.length} uploaded file${drafts.length > 1 ? "s" : ""}`,
          body: `${drafts.map((x) => x.fileName).join(", ")} ${drafts.length > 1 ? "are" : "is"} not counted until you check how ${drafts.length > 1 ? "they were" : "it was"} read and confirm.`,
          href: "/ingest",
          cta: "Review uploads",
        }
      : blockers.length > 0
        ? {
            title: `Fix ${blockers.length} blocking problem${blockers.length > 1 ? "s" : ""}`,
            body: `${blockers[0]?.title}. Until this is fixed the figures below are not usable for a declaration.`,
            href: "/review",
            cta: "Go to Review",
          }
        : openWarnings.length > 0
          ? {
              title: `Check ${openWarnings.length} warning${openWarnings.length > 1 ? "s" : ""}`,
              body: `${openWarnings[0]?.title}. Warnings do not stop a filing, but a verifier will ask about each one.`,
              href: "/review",
              cta: "Go to Review",
            }
          : {
              title: "Send it to your verifier",
              body: "No open findings. Download the verifier pack and the emissions report for your EU importers.",
              href: "/declaration",
              cta: "Open downloads",
            };

  const path = [
    {
      label: "Data",
      href: "/ingest",
      state: drafts.length > 0 ? "attention" : "done",
      note: drafts.length > 0 ? `${drafts.length} to confirm` : `${confirmed.length} files`,
    },
    {
      label: "Review",
      href: "/review",
      state: blockers.length > 0 ? "blocked" : openWarnings.length > 0 ? "attention" : "done",
      note:
        blockers.length > 0
          ? `${blockers.length} to fix`
          : openWarnings.length > 0
            ? `${openWarnings.length} to check`
            : "All clear",
    },
    {
      label: "Calculate",
      href: "/calculate",
      state: "done",
      note: `${d.emissions.length} processes`,
    },
    {
      label: "Declaration",
      href: "/declaration",
      state: blockers.length > 0 ? "waiting" : "done",
      note: blockers.length > 0 ? "Waiting on review" : "Ready to download",
    },
    { label: "Audit trail", href: "/audit", state: "done", note: `${fmt(records)} records` },
  ] as const;

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

  const color = bandColor(d.readiness.band);

  return (
    <>
      <PageHeader
        eyebrow={[inst.operator, [inst.city, inst.state].filter(Boolean).join(", ")]
          .filter(Boolean)
          .join(" · ")}
        title={inst.name}
        description={
          <>
            CBAM emissions for {d.period.start} to {d.period.end}. Every figure recalculates from
            your data whenever it changes.
          </>
        }
      />

      <Page>
        <section
          data-tour="status"
          className="grid animate-rise grid-cols-[260px_1fr] overflow-hidden rounded-3xl border border-line bg-surface shadow-[var(--shadow-card)]"
        >
          <div className="border-r border-line bg-surface-2 px-8 py-8">
            <div className="text-[13px] font-medium text-muted">Readiness</div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="font-display text-[72px] leading-none" style={{ color }}>
                {d.readiness.score}
              </span>
              <span className="text-[14px] text-muted">/ 100</span>
            </div>
            <div className="mt-3 text-[15px] font-medium" style={{ color }}>
              {BAND_LABELS[d.readiness.band]}
            </div>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-surface-3">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${d.readiness.score}%`,
                  background: color,
                }}
              />
            </div>
          </div>
          <div className="flex flex-col justify-between gap-8 px-9 py-8">
            <div>
              <div className="text-[13px] font-medium text-muted">Your next step</div>
              <h2 className="mt-2 font-display text-[30px] leading-tight text-ink">{next.title}</h2>
              <p className="mt-2 max-w-[62ch] text-[15px] leading-[1.6] text-ink-2">{next.body}</p>
              <Link href={next.href} className="btn-primary mt-5">
                {next.cta} <span aria-hidden>→</span>
              </Link>
            </div>
            <ol className="grid grid-cols-5 gap-3 border-t border-line pt-6">
              {path.map((p, i) => (
                <li key={p.label}>
                  <Link href={p.href} className="group block">
                    <div className="flex items-center gap-2">
                      <PathDot state={p.state} n={i + 1} />
                      <span className="text-[14px] font-medium text-ink group-hover:underline">
                        {p.label}
                      </span>
                    </div>
                    <div
                      className={
                        "mt-1.5 pl-8 text-[12.5px] " +
                        (p.state === "blocked"
                          ? "text-critical"
                          : p.state === "attention"
                            ? "text-warning"
                            : "text-muted")
                      }
                    >
                      {p.note}
                    </div>
                  </Link>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <div className="mt-8 grid grid-cols-3 gap-6" data-tour="key-figures">
          <Stat
            label={`CBAM certificates, ${d.period.year}`}
            value={fmt(d.exposure.netCertificates)}
            sub={`For ${fmt(d.totals.goodsEuT)} t of goods shipped to the EU`}
          />
          <Stat
            label="Cost to your EU importers"
            value={fmtEur(d.exposure.netCostEur)}
            sub={`About ₹${fmtCompact(d.exposure.netCostInr)} at €${d.exposure.effectivePriceEur.toFixed(2)} per certificate`}
          />
          <Stat
            label="Saved by using your own data"
            value={saving > 0 ? fmtEur(saving) : "—"}
            tone={saving > 0 ? "good" : undefined}
            sub={
              d.exposure.defaultScenario.complete
                ? `The EU's default values would cost ${fmtEur(d.exposure.defaultScenario.costEur)} for the same goods, once your data is verified.`
                : "Some goods have no published default to compare against."
            }
          />
        </div>

        <div className="mt-8">
          <Card
            title="Your emissions per tonne, against the EU default"
            subtitle="The default is what your importer must use if you cannot supply verified data. Lower is better for your buyers."
          >
            <BenchmarkBars
              benchmarkLabel="EU default value (incl. mark-up)"
              rows={d.lines.map((l) => ({
                label: l.description.length > 60 ? `${l.description.slice(0, 59)}…` : l.description,
                sublabel: `CN ${l.cnCode}`,
                value: l.seeForObligation,
                benchmark: l.defaultSee,
              }))}
            />
          </Card>
        </div>

        <div className="mt-8">
          <Disclosure
            summary="More detail"
            hint="Where the emissions come from, the cost to 2034, readiness in detail and the source files"
          >
            <div className="grid grid-cols-2 gap-8">
              <div>
                <h3 className="text-[15px] font-semibold text-ink">
                  Where the emissions come from
                </h3>
                <p className="mb-4 mt-1 text-[13px] text-muted">
                  The whole site&apos;s footprint for the period. Hover a bar for the method.
                </p>
                <Waterfall steps={waterfall} />
              </div>
              <div>
                <h3 className="text-[15px] font-semibold text-ink">Readiness in detail</h3>
                <p className="mb-4 mt-1 text-[13px] text-muted">
                  Weighted to what a verifier tests first.
                </p>
                <div className="space-y-4">
                  {d.readiness.components.map((c) => (
                    <div key={c.id}>
                      <div className="flex items-baseline justify-between text-[13.5px]">
                        <span className="text-ink-2">{c.label}</span>
                        <span className="tnum text-ink">{c.score.toFixed(0)}</span>
                      </div>
                      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${c.score}%`, background: scoreColor(c.score) }}
                        />
                      </div>
                      {c.nextAction ? (
                        <p className="mt-1.5 text-[12.5px] leading-[1.5] text-muted">
                          {c.nextAction}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
                <div className="mt-6">
                  <StackBar
                    segments={[
                      {
                        label: "Direct",
                        value: Math.round(d.totals.directT),
                        color: SERIES.direct,
                      },
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
                  <p className="mt-3 text-[12.5px] leading-[1.6] text-muted">
                    For iron &amp; steel, aluminium and hydrogen only direct emissions count towards
                    the cost. Indirect emissions are still reported.
                  </p>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-[15px] font-semibold text-ink">Cost across the phase-in</h3>
              <p className="mb-4 mt-1 text-[13px] text-muted">
                Same volumes each year, recomputed as the EU&apos;s free allocation falls to zero in
                2034, at €{state.assumptions.etsPriceEur} per certificate after 2026.
              </p>
              <TrajectoryLine
                points={d.exposure.trajectory.map((t) => ({
                  year: t.year,
                  costEur: t.costEur,
                  factor: t.factor,
                  certificates: t.certificates,
                  defaultCostEur: t.defaultCostEur,
                }))}
              />
            </div>

            <div className="-mx-7">
              <div className="flex items-baseline justify-between px-7">
                <h3 className="text-[15px] font-semibold text-ink">Source files</h3>
                <span className="text-[13px] text-muted">
                  {fmt(records)} records counted
                  {rejected > 0 ? ` · ${rejected} rows not imported` : ""} ·{" "}
                  <Link href="/ingest" className="text-accent hover:underline">
                    Manage
                  </Link>
                </span>
              </div>
              <div className="mt-3">
                <Table>
                  <thead>
                    <tr>
                      <Th>File</Th>
                      <Th>Read as</Th>
                      <Th>Status</Th>
                      <Th align="right">Records</Th>
                      <Th align="right">Not imported</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.datasets.map((ds) => (
                      <tr key={ds.id} className="hover:bg-surface-2">
                        <Td className="text-ink">
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
                          {fmt(ds.activities.length)}
                        </Td>
                        <Td align="right" numeric>
                          {ds.rejected.length > 0 ? (
                            <span className="text-warning">{ds.rejected.length}</span>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            </div>
          </Disclosure>
        </div>
      </Page>
    </>
  );
}

function PathDot({ state, n }: { state: string; n: number }) {
  if (state === "done") {
    return (
      <span
        className="flex h-6 w-6 items-center justify-center rounded-full bg-good/[0.1] text-[12px] text-good"
        aria-label="Done"
      >
        ✓
      </span>
    );
  }
  const tone =
    state === "blocked"
      ? "border-critical/40 text-critical"
      : state === "attention"
        ? "border-warning/40 text-warning"
        : "border-line-strong text-muted";
  return (
    <span
      className={`flex h-6 w-6 items-center justify-center rounded-full border text-[12px] font-semibold ${tone}`}
    >
      {n}
    </span>
  );
}

function GettingStarted({ name, hasProcesses }: { name: string; hasProcesses: boolean }) {
  const steps = [
    {
      title: "Describe your plant",
      body: "Its production processes, the route each one uses, and which feed which. Takes about ten minutes.",
      href: "/settings",
      done: hasProcesses,
    },
    {
      title: "Upload your data",
      body: "Fuel, electricity, raw materials, production and despatch - CSV or Excel, straight from SAP, Tally or your electricity board.",
      href: "/ingest",
      done: false,
    },
    {
      title: "Review, then download",
      body: "Fix what the checks find, then download the emissions report for your EU buyers and the pack for your verifier.",
      href: "/review",
      done: false,
    },
  ];
  return (
    <>
      <PageHeader
        eyebrow="Getting started"
        title={name}
        description="Three steps from spreadsheets to a verifiable CBAM report. Want to see a finished example first? Create the demo workspace from the workspace menu."
      />
      <Page>
        <ol className="grid grid-cols-3 gap-6" data-tour="status">
          {steps.map((s, i) => (
            <li key={s.title}>
              <Link
                href={s.href}
                className="block h-full rounded-2xl border border-line bg-surface p-7 shadow-[var(--shadow-card)] transition-colors hover:border-line-strong"
              >
                <span className="font-display text-[40px] leading-none text-muted">
                  {s.done ? "✓" : i + 1}
                </span>
                <h2
                  className={
                    "mt-5 text-[17px] font-semibold " +
                    (s.done ? "text-muted line-through" : "text-ink")
                  }
                >
                  {s.title}
                </h2>
                <p className="mt-2 text-[14px] leading-[1.6] text-ink-2">{s.body}</p>
              </Link>
            </li>
          ))}
        </ol>
      </Page>
    </>
  );
}
