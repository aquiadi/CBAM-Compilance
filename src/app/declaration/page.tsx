import { getDeclaration, getState } from "@/lib/store";
import { isAiAvailable } from "@/lib/ai/client";
import {
  Card,
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

export const dynamic = "force-dynamic";

/**
 * Declaration.
 *
 * The deliverable: what goes to the EU importer, what it costs, and the memo
 * that defends it. Deliberately separates what is produced from what is
 * shipped - only the EU-bound share creates an obligation, and conflating the
 * two is the most expensive mistake an exporter can make here.
 */
export default function DeclarationPage() {
  const state = getState();
  const d = getDeclaration(state);

  return (
    <>
      <PageHeader
        eyebrow="Step 4"
        title="Declaration"
        description={
          <>
            Specific embedded emissions per CN code for {d.period.start} to {d.period.end}, the
            certificate exposure they create, and the exports an EU importer needs.
          </>
        }
        actions={
          <>
            <a
              href="/api/export?format=communication"
              className="rounded-md border border-line-strong bg-surface-3 px-2.5 py-1.5 text-[11.5px] font-medium text-ink-2 transition-colors hover:border-accent hover:text-ink"
            >
              Communication JSON
            </a>
            <a
              href="/api/export?format=csv"
              className="rounded-md border border-line-strong bg-surface-3 px-2.5 py-1.5 text-[11.5px] font-medium text-ink-2 transition-colors hover:border-accent hover:text-ink"
            >
              CSV
            </a>
            <a
              href="/api/export?format=xml"
              className="rounded-md border border-line-strong bg-surface-3 px-2.5 py-1.5 text-[11.5px] font-medium text-ink-2 transition-colors hover:border-accent hover:text-ink"
            >
              Registry XML
            </a>
          </>
        }
      />

      <Page>
        {d.readiness.blockers > 0 ? (
          <div className="mb-5">
            <Note tone="critical">
              <span className="font-medium text-critical">
                {d.readiness.blockers} blocking finding{d.readiness.blockers > 1 ? "s" : ""} remain
                open.
              </span>{" "}
              The exports below are still generated so you can see what is coming, but filing this
              as-is would be a misdeclaration.
            </Note>
          </div>
        ) : null}

        <Card
          title="Goods and specific embedded emissions"
          subtitle="Produced is the denominator for intensity; only the EU column creates an obligation."
          padded={false}
        >
          <Table>
            <thead>
              <tr>
                <Th>CN code</Th>
                <Th>Goods</Th>
                <Th>Route</Th>
                <Th align="right">Produced t</Th>
                <Th align="right">To EU t</Th>
                <Th align="right">SEE direct</Th>
                <Th align="right">SEE indirect</Th>
                <Th align="right">Counted</Th>
                <Th align="right">vs benchmark</Th>
                <Th align="right">Chargeable tCO₂e</Th>
              </tr>
            </thead>
            <tbody>
              {d.lines.map((l) => (
                <tr key={`${l.cnCode}-${l.processId}`} className="hover:bg-surface-2">
                  <Td className="font-mono text-[11.5px] text-ink">{l.cnCode}</Td>
                  <Td>
                    <span className="text-ink">{l.description}</span>
                    <div className="mt-0.5 text-[10.5px] text-muted">
                      {l.directOnly ? "Annex II — direct only" : "Direct + indirect"}
                    </div>
                  </Td>
                  <Td className="text-[11px]">{l.route ?? "—"}</Td>
                  <Td align="right" numeric>
                    {fmt(l.quantityT)}
                  </Td>
                  <Td align="right" numeric>
                    {l.quantityEuT > 0 ? fmt(l.quantityEuT) : <span className="text-muted">—</span>}
                  </Td>
                  <Td align="right" numeric>
                    {l.seeDirect.toFixed(4)}
                  </Td>
                  <Td align="right" numeric>
                    <span className={l.directOnly ? "text-muted" : undefined}>
                      {l.seeIndirect.toFixed(4)}
                    </span>
                  </Td>
                  <Td align="right" numeric>
                    {l.seeForObligation.toFixed(4)}
                  </Td>
                  <Td align="right" numeric>
                    {l.vsDefault !== undefined ? (
                      <span className={l.vsDefault <= 0 ? "text-good" : "text-serious"}>
                        {signedPct(l.vsDefault)}
                      </span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </Td>
                  <Td align="right" numeric>
                    {l.embeddedEuT > 0 ? fmt(l.embeddedEuT) : <span className="text-muted">0</span>}
                  </Td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-surface-2">
                <Td className="font-medium text-ink" align="left">
                  Total
                </Td>
                <Td>—</Td>
                <Td>—</Td>
                <Td align="right" numeric>
                  {fmt(d.totals.goodsT)}
                </Td>
                <Td align="right" numeric>
                  {fmt(d.totals.goodsEuT)}
                </Td>
                <Td align="right">—</Td>
                <Td align="right">—</Td>
                <Td align="right">—</Td>
                <Td align="right">—</Td>
                <Td align="right" numeric className="font-medium text-ink">
                  {fmt(d.totals.obligationT)}
                </Td>
              </tr>
            </tfoot>
          </Table>
          <div className="border-t border-line px-5 py-3">
            <p className="text-[10.5px] leading-[1.55] text-muted">{d.disclaimer}</p>
          </div>
        </Card>

        <div className="mt-5 grid grid-cols-3 gap-5">
          <div className="col-span-2 space-y-5">
            <Card
              title="Certificate exposure"
              subtitle="Adjust the assumptions to see the range. Nothing here is stored against the declaration itself."
            >
              <ExposureControls
                initial={state.assumptions}
                summary={{
                  obligationT: d.totals.obligationT,
                  grossCertificates: d.exposure.grossCertificates,
                  carbonPriceCredit: d.exposure.carbonPriceCredit,
                  netCertificates: d.exposure.netCertificates,
                  netCostEur: d.exposure.netCostEur,
                  netCostInr: d.exposure.netCostInr,
                  cbamFactor: d.exposure.cbamFactor,
                  nonEuEmissionsT: d.exposure.nonEuEmissionsT,
                }}
              />
            </Card>

            <Card
              title="Exposure across the phase-in"
              subtitle={`At €${d.assumptions.etsPriceEur}/certificate, holding this period's volumes constant.`}
            >
              <TrajectoryLine points={d.exposure.trajectory} />
              <Table>
                <thead>
                  <tr>
                    <Th align="right">Year</Th>
                    <Th align="right">CBAM factor</Th>
                    <Th align="right">Certificates</Th>
                    <Th align="right">Cost</Th>
                  </tr>
                </thead>
                <tbody>
                  {d.exposure.trajectory.map((t) => (
                    <tr key={t.year} className={t.year === d.exposure.year ? "bg-surface-2" : ""}>
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
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>

            <MemoPanel aiAvailable={isAiAvailable()} />
          </div>

          <div className="space-y-5">
            <Card title="Engine notes" subtitle="Everything the model of the regime had to say.">
              {d.exposure.notes.length === 0 ? (
                <p className="text-[11.5px] text-muted">No notes.</p>
              ) : (
                <ul className="space-y-2.5">
                  {d.exposure.notes.map((n, i) => (
                    <li key={i} className="text-[11.5px] leading-[1.6] text-ink-2">
                      {n}
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title="Declarant details" subtitle="As they appear on the communication.">
              <dl className="space-y-2.5 text-[11.5px]">
                {[
                  ["Installation", d.installation.name],
                  ["Operator", d.installation.operator],
                  ["Address", `${d.installation.street}, ${d.installation.city}`],
                  ["State", `${d.installation.state} ${d.installation.postcode}`],
                  ["Country", d.installation.country],
                  ["UN/LOCODE", d.installation.unlocode ?? "—"],
                  ["Contact", `${d.installation.contactName} · ${d.installation.contactEmail}`],
                  ["Period", `${d.period.start} → ${d.period.end}`],
                  ["Regime", d.period.regime],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3">
                    <dt className="shrink-0 text-muted">{k}</dt>
                    <dd className="text-right text-ink-2">{v}</dd>
                  </div>
                ))}
              </dl>
            </Card>

            <Card title="What ships where">
              <div className="space-y-3 text-[11.5px] leading-[1.6] text-ink-2">
                <p>
                  <span className="text-ink">{fmtCompact(d.totals.goodsT)} t</span> produced, of
                  which <span className="text-ink">{fmtCompact(d.totals.goodsEuT)} t</span> goes to
                  the EU.
                </p>
                <p>
                  {fmt(d.exposure.nonEuEmissionsT)} tCO₂e is embedded in output that stayed in India
                  or moved on site. It is reported but never charged — charging it would count the
                  same tonne of coal twice.
                </p>
              </div>
            </Card>
          </div>
        </div>
      </Page>
    </>
  );
}
