import { isAiAvailable } from "@/lib/ai/client";
import { workspaceContext } from "@/lib/auth/context";
import { PUBLISHED_CERTIFICATE_PRICES } from "@/lib/cbam/regulatory";
import { computeDeclaration } from "@/lib/workspace/declaration";
import {
  Card,
  Disclosure,
  fmt,
  fmtCompact,
  fmtEur,
  Note,
  Page,
  PageHeader,
  signedPct,
  Table,
  Td,
  Th,
} from "@/components/ui";
import { TrajectoryLine } from "@/components/charts";
import { ExposureControls } from "./exposure-controls";
import { MemoPanel } from "./memo-panel";

const EXPORTS = [
  {
    format: "xlsx",
    label: "Emissions report (.xlsx)",
    hint: "Structured after the Commission communication template",
  },
  {
    format: "communication",
    label: "Communication (.json)",
    hint: "What EU importers need, machine-readable",
  },
  { format: "csv", label: "Goods summary (.csv)", hint: "One line per CN code" },
  {
    format: "monitoring-plan",
    label: "Monitoring methodology (.html)",
    hint: "Boundary, methods, data sources, controls",
  },
  {
    format: "verifier-pack",
    label: "Verifier pack (.zip)",
    hint: "Everything above, every source file and evidence, with checksums",
  },
  { format: "json", label: "Full calculation (.json)", hint: "Every intermediate figure" },
];

/**
 * Declaration.
 *
 * The deliverable: what goes to the EU importer, what it costs them, and the
 * documents that defend it. Keeps produced and shipped apart - only the
 * EU-bound share creates an obligation - and shows the obligation as embedded
 * emissions minus the free allocation adjustment, per good.
 */
export default async function DeclarationPage() {
  const ctx = await workspaceContext();
  const state = ctx.workspace.state;
  const d = await computeDeclaration(ctx.db, ctx.workspace);
  const e = d.exposure;

  return (
    <>
      <PageHeader
        eyebrow="Step 4"
        title="Declaration"
        description={
          <>
            Specific embedded emissions and free allocation per CN code for {d.period.start} to{" "}
            {d.period.end}, the certificates they imply for your EU importers, and the documents a
            verifier and a declarant need.
          </>
        }
      />

      <Page>
        {d.readiness.blockers > 0 ? (
          <div className="mb-8">
            <Note tone="critical">
              <span className="font-medium text-critical">
                {d.readiness.blockers} blocking finding{d.readiness.blockers > 1 ? "s" : ""} remain
                open.
              </span>{" "}
              The exports are still generated so you can see what is coming, but these figures are
              not ready for verification.
            </Note>
          </div>
        ) : null}

        <Card
          tour="exports"
          title="Downloads"
          subtitle="Generated from the current data every time you download."
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {EXPORTS.map((x) => (
              <a
                key={x.format}
                href={`/api/export?format=${x.format}`}
                className="group rounded-xl border border-line bg-surface-2 px-5 py-4 transition-colors hover:border-ink hover:bg-surface"
              >
                <div className="flex items-center justify-between text-[14.5px] font-medium text-ink">
                  {x.label}
                  <span
                    aria-hidden
                    className="text-muted transition-transform group-hover:translate-y-0.5"
                  >
                    ↓
                  </span>
                </div>
                <div className="mt-1 text-[13px] leading-[1.5] text-muted">{x.hint}</div>
              </a>
            ))}
          </div>
        </Card>

        <div className="mt-8">
          <Card
            tour="goods-table"
            title="Goods, embedded emissions and free allocation"
            subtitle="Per product: emissions per tonne, the free allocation the EU still grants per tonne, and what is left to pay for on the tonnes shipped to the EU."
            padded={false}
          >
            <Table>
              <thead>
                <tr>
                  <Th>Product</Th>
                  <Th align="right">Made, t</Th>
                  <Th align="right">To EU, t</Th>
                  <Th align="right">Emissions /t</Th>
                  <Th align="right">Free allocation /t</Th>
                  <Th align="right">Charged /t</Th>
                  <Th align="right">vs EU default</Th>
                  <Th align="right">Certificates</Th>
                </tr>
              </thead>
              <tbody>
                {d.lines.map((l) => {
                  const ex = e.lines.find(
                    (x) => x.cnCode === l.cnCode && x.processId === l.processId,
                  );
                  return (
                    <tr key={`${l.cnCode}-${l.processId}`} className="hover:bg-surface-2">
                      <Td className="min-w-[300px] max-w-[380px]">
                        <span className="text-ink" title={l.description}>
                          {l.description.length > 64
                            ? `${l.description.slice(0, 63)}…`
                            : l.description}
                        </span>
                        <div className="mt-1 text-[12.5px] text-muted">
                          CN <span className="font-mono">{l.cnCode}</span> · {l.processName}
                          {l.directOnly ? " · direct emissions only" : ""}
                        </div>
                      </Td>
                      <Td align="right" numeric>
                        {fmt(l.quantityT)}
                      </Td>
                      <Td align="right" numeric>
                        {l.quantityEuT > 0 ? (
                          fmt(l.quantityEuT)
                        ) : (
                          <span className="text-muted">-</span>
                        )}
                      </Td>
                      <Td align="right" numeric>
                        {l.seeForObligation.toFixed(3)}
                      </Td>
                      <Td align="right" numeric>
                        {l.sefaIssues.length > 0 ? (
                          <span className="text-critical" title={l.sefaIssues.join(" ")}>
                            {l.sefa.toFixed(3)} !
                          </span>
                        ) : (
                          l.sefa.toFixed(3)
                        )}
                      </Td>
                      <Td align="right" numeric>
                        {Math.max(0, l.seeForObligation - l.sefa).toFixed(3)}
                      </Td>
                      <Td align="right" numeric>
                        {l.vsDefault !== undefined ? (
                          <span className={l.vsDefault <= 0 ? "text-good" : "text-serious"}>
                            {signedPct(l.vsDefault)}
                          </span>
                        ) : (
                          <span className="text-muted">-</span>
                        )}
                      </Td>
                      <Td align="right" numeric>
                        {ex ? fmt(ex.certificates) : <span className="text-muted">0</span>}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-surface-2">
                  <Td className="font-medium text-ink">Total</Td>
                  <Td align="right" numeric>
                    {fmt(d.totals.goodsT)}
                  </Td>
                  <Td align="right" numeric>
                    {fmt(d.totals.goodsEuT)}
                  </Td>
                  <Td align="right"> </Td>
                  <Td align="right"> </Td>
                  <Td align="right"> </Td>
                  <Td align="right"> </Td>
                  <Td align="right" numeric className="font-medium text-ink">
                    {fmt(e.grossCertificates)}
                  </Td>
                </tr>
              </tfoot>
            </Table>
            <div className="px-7 py-5">
              <p className="max-w-[110ch] text-[12.5px] leading-[1.6] text-muted">
                Emissions per tonne are the specific embedded emissions counted towards the
                obligation (SEE); free allocation is the benchmark-based adjustment (SEFA). &quot;vs
                EU default&quot; compares with the Commission&apos;s default value for{" "}
                {state.installation.country} including the {d.period.year} mark-up. {d.disclaimer}
              </p>
            </div>
          </Card>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-7 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Card
              title="Certificate cost"
              subtitle="Certificates are bought and surrendered by the EU importer; this is the cost your data implies for them."
            >
              <ExposureControls
                canWrite={ctx.canWrite}
                initial={state.assumptions}
                summary={{
                  embeddedEuT: e.obligationEmissionsT,
                  freeAllocationT: e.freeAllocationAdjustmentT,
                  grossCertificates: e.grossCertificates,
                  carbonPriceCredit: e.carbonPriceCredit,
                  netCertificates: e.netCertificates,
                  netCostEur: e.netCostEur,
                  netCostInr: e.netCostInr,
                  effectivePriceEur: e.effectivePriceEur,
                  cbamFactor: e.cbamFactor,
                  defaultCertificates: e.defaultScenario.certificates,
                  defaultCostEur: e.defaultScenario.costEur,
                }}
                pricing={e.pricing}
              />
            </Card>
          </div>
          <div className="space-y-8">
            <Card title="What ships where">
              <div className="space-y-3 text-[13px] leading-[1.6] text-ink-2">
                <p>
                  <span className="text-ink">{fmtCompact(d.totals.goodsT)} t</span> produced, of
                  which <span className="text-ink">{fmtCompact(d.totals.goodsEuT)} t</span> goes to
                  the EU.
                </p>
                <p>
                  {fmt(e.nonEuEmissionsT)} tCO₂e is embedded in output that stayed in India or moved
                  on site. It is reported but never charged.
                </p>
              </div>
            </Card>
            <Card
              title="Published certificate prices"
              subtitle="Commission, quarterly in 2026; weekly from 2027."
            >
              <dl className="space-y-1.5 text-[13px]">
                {PUBLISHED_CERTIFICATE_PRICES.map((p) => (
                  <div key={p.quarter} className="flex justify-between">
                    <dt className="text-muted">{p.quarter}</dt>
                    <dd className="tnum text-ink-2">
                      €{p.priceEur.toFixed(2)} <span className="text-muted">({p.published})</span>
                    </dd>
                  </div>
                ))}
              </dl>
            </Card>
          </div>
        </div>

        <div className="mt-8">
          <Disclosure
            summary="More detail"
            hint="The cost year by year to 2034, engine notes, installation details and the methodology memo"
          >
            <Card
              title="Across the phase-in"
              subtitle={`Same volumes and intensity each year, recomputed with that year's CBAM factor and default mark-up, at €${state.assumptions.etsPriceEur}/certificate after 2026.`}
            >
              <TrajectoryLine
                points={e.trajectory.map((t) => ({
                  year: t.year,
                  costEur: t.costEur,
                  factor: t.factor,
                  certificates: t.certificates,
                  defaultCostEur: t.defaultCostEur,
                }))}
              />
              <Table>
                <thead>
                  <tr>
                    <Th align="right">Year</Th>
                    <Th align="right">CBAM factor</Th>
                    <Th align="right">Certificates</Th>
                    <Th align="right">Cost</Th>
                    <Th align="right">On defaults</Th>
                  </tr>
                </thead>
                <tbody>
                  {e.trajectory.map((t) => (
                    <tr key={t.year} className={t.year === d.period.year ? "bg-surface-2" : ""}>
                      <Td align="right" numeric>
                        {t.year}
                      </Td>
                      <Td align="right" numeric>
                        {(t.factor * 100).toFixed(1)}%
                      </Td>
                      <Td align="right" numeric>
                        {fmt(t.certificates)}
                      </Td>
                      <Td align="right" numeric>
                        {fmtEur(t.costEur)}
                      </Td>
                      <Td align="right" numeric>
                        {fmtEur(t.defaultCostEur)}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>

            <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
              <Card title="Engine notes">
                {e.notes.length === 0 ? (
                  <p className="text-[13px] text-muted">No notes.</p>
                ) : (
                  <ul className="space-y-2.5">
                    {e.notes.map((n, i) => (
                      <li key={i} className="text-[13px] leading-[1.6] text-ink-2">
                        {n}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card title="Installation details" subtitle="As they appear on the communication.">
                <dl className="space-y-2.5 text-[13px]">
                  {[
                    ["Installation", d.installation.name],
                    ["Operator", d.installation.operator],
                    [
                      "Address",
                      [d.installation.street, d.installation.city].filter(Boolean).join(", "),
                    ],
                    ["State", `${d.installation.state} ${d.installation.postcode}`],
                    ["Country", d.installation.country],
                    ["UN/LOCODE", d.installation.unlocode ?? "-"],
                    [
                      "Emission source",
                      d.installation.latitude !== undefined
                        ? `${d.installation.latitude}, ${d.installation.longitude}`
                        : "-",
                    ],
                    ["Contact", `${d.installation.contactName} · ${d.installation.contactEmail}`],
                    ["Period", `${d.period.start} → ${d.period.end}`],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-3">
                      <dt className="shrink-0 text-muted">{k}</dt>
                      <dd className="text-right text-ink-2">{v}</dd>
                    </div>
                  ))}
                </dl>
              </Card>
            </div>
            <MemoPanel aiAvailable={isAiAvailable()} />
          </Disclosure>
        </div>
      </Page>
    </>
  );
}
