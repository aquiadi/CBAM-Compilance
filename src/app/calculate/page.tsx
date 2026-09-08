import { getDeclaration } from "@/lib/store";
import { tryGetFactor } from "@/lib/cbam/factors";
import { Card, fmt, Note, Page, PageHeader, Table, Td, Th } from "@/components/ui";
import { StackBar } from "@/components/charts";
import { SERIES } from "@/lib/palette";

export const dynamic = "force-dynamic";

/**
 * Calculate.
 *
 * Shows the arithmetic. Every contribution carries the formula that produced
 * it, the factor it used and that factor's source, because "where did 1.93
 * come from" is the question this whole product exists to answer.
 */
export default function CalculatePage() {
  const d = getDeclaration();

  return (
    <>
      <PageHeader
        eyebrow="Step 3"
        title="How each number was derived"
        description={
          <>
            Attributed emissions per production process under Annex III, then specific embedded
            emissions under Annex IV. Processes are resolved in dependency order — sponge iron
            before steel, steel before rebar — so a downstream product carries what was actually
            spent upstream.
          </>
        }
      />

      <Page>
        {d.internalWarnings.length > 0 ? (
          <div className="mb-5 space-y-2">
            {d.internalWarnings.map((w, i) => (
              <Note key={i} tone="warning">
                {w}
              </Note>
            ))}
          </div>
        ) : null}

        <div className="space-y-6">
          {d.emissions.map((e) => {
            const groups = [
              {
                key: "fuel",
                label: "Fuel combustion",
                items: e.contributions.fuel,
                color: SERIES.direct,
              },
              {
                key: "processMaterial",
                label: "Process materials",
                items: e.contributions.processMaterial,
                color: SERIES.other,
              },
              {
                key: "electricity",
                label: "Electricity",
                items: e.contributions.electricity,
                color: SERIES.indirect,
              },
              {
                key: "heat",
                label: "Measurable heat",
                items: e.contributions.heat,
                color: SERIES.other,
              },
              {
                key: "precursor",
                label: "Bought-in precursors",
                items: e.contributions.precursor,
                color: SERIES.precursor,
              },
              {
                key: "internalPrecursor",
                label: "On-site precursors",
                items: e.contributions.internalPrecursor,
                color: SERIES.precursor,
              },
            ].filter((g) => g.items.length > 0);

            const seeDirect =
              e.activityLevelT > 0
                ? (e.directT + e.precursorDirectT + e.internalPrecursorDirectT) / e.activityLevelT
                : 0;
            const seeIndirect =
              e.activityLevelT > 0
                ? (e.indirectT + e.precursorIndirectT + e.internalPrecursorIndirectT) /
                  e.activityLevelT
                : 0;

            return (
              <Card
                key={e.processId}
                title={e.processName}
                subtitle={
                  <>
                    {e.route ? `${e.route} · ` : ""}
                    {fmt(e.activityLevelT)} t produced · lowest monitoring tier {e.lowestTier} ·
                    propagated uncertainty ±{(e.directUncertainty * 100).toFixed(1)}%
                  </>
                }
                padded={false}
              >
                <div className="grid grid-cols-4 gap-px bg-line">
                  {[
                    { label: "Direct", value: e.directT, unit: "tCO₂e" },
                    { label: "Indirect", value: e.indirectT, unit: "tCO₂e" },
                    {
                      label: "Precursors",
                      value:
                        e.precursorDirectT +
                        e.precursorIndirectT +
                        e.internalPrecursorDirectT +
                        e.internalPrecursorIndirectT,
                      unit: "tCO₂e",
                    },
                    { label: "SEE total", value: seeDirect + seeIndirect, unit: "tCO₂e/t", dp: 4 },
                  ].map((m) => (
                    <div key={m.label} className="bg-surface px-5 py-3">
                      <div className="text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted">
                        {m.label}
                      </div>
                      <div className="mt-1.5 flex items-baseline gap-1.5">
                        <span className="tnum text-[17px] font-semibold text-ink">
                          {fmt(m.value, m.dp ?? 0)}
                        </span>
                        <span className="text-[10.5px] text-muted">{m.unit}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="border-t border-line px-5 py-4">
                  <StackBar
                    segments={groups.map((g) => ({
                      label: g.label,
                      value: Math.round(g.items.reduce((s, c) => s + c.emissionsT, 0)),
                      color: g.color,
                    }))}
                  />
                </div>

                {groups.map((g) => (
                  <div key={g.key} className="border-t border-line">
                    <div className="flex items-center gap-2 px-5 py-2">
                      <span className="h-2 w-2 rounded-sm" style={{ background: g.color }} />
                      <span className="text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted">
                        {g.label}
                      </span>
                    </div>
                    <Table>
                      <thead>
                        <tr>
                          <Th>Stream</Th>
                          <Th align="right">Activity data</Th>
                          <Th align="right">Energy</Th>
                          <Th>Arithmetic</Th>
                          <Th>Factor source</Th>
                          <Th align="right">tCO₂e</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {aggregate(g.items).map((c) => {
                          const source = factorSourceLabel(c.factorId);
                          return (
                            <tr key={c.label} className="hover:bg-surface-2">
                              <Td className="text-ink">{c.label}</Td>
                              <Td align="right" numeric>
                                {fmt(c.quantity, 2)}{" "}
                                <span className="text-muted">{c.quantityUnit}</span>
                              </Td>
                              <Td align="right" numeric>
                                {c.energyTJ !== undefined ? (
                                  <>
                                    {fmt(c.energyTJ, 2)} <span className="text-muted">TJ</span>
                                  </>
                                ) : (
                                  <span className="text-muted">—</span>
                                )}
                              </Td>
                              <Td className="font-mono text-[10.5px] text-muted">{c.formula}</Td>
                              <Td className="text-[11px] text-muted">{source ?? "—"}</Td>
                              <Td align="right" numeric>
                                {fmt(c.emissionsT, 1)}
                              </Td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </Table>
                  </div>
                ))}

                {e.errors.length > 0 ? (
                  <div className="space-y-2 border-t border-line px-5 py-3.5">
                    {e.errors.map((err, i) => (
                      <Note key={i} tone="critical">
                        {err}
                      </Note>
                    ))}
                  </div>
                ) : null}

                <div className="border-t border-line bg-surface-2 px-5 py-3">
                  <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-[11.5px]">
                    <span className="text-muted">Annex IV:</span>
                    <span className="font-mono text-ink-2">
                      SEE<sub>direct</sub> = ({fmt(e.directT, 0)} +{" "}
                      {fmt(e.precursorDirectT + e.internalPrecursorDirectT, 0)}) ÷{" "}
                      {fmt(e.activityLevelT, 0)} t ={" "}
                      <span className="text-ink">{seeDirect.toFixed(4)}</span> tCO₂e/t
                    </span>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </Page>
    </>
  );
}

/**
 * Monthly rows for the same stream collapse into one line.
 *
 * Twelve identical coal deliveries are one fact about the plant, not twelve;
 * the per-row detail stays available on the audit trail screen.
 */
function aggregate<
  T extends {
    label: string;
    quantity: number;
    quantityUnit: string;
    energyTJ?: number;
    emissionsT: number;
    formula: string;
    factorId: string;
  },
>(items: T[]): T[] {
  const byLabel = new Map<string, T>();
  const counts = new Map<string, number>();

  for (const item of items) {
    const existing = byLabel.get(item.label);
    counts.set(item.label, (counts.get(item.label) ?? 0) + 1);
    if (!existing) {
      byLabel.set(item.label, { ...item });
      continue;
    }
    existing.quantity += item.quantity;
    existing.emissionsT += item.emissionsT;
    if (existing.energyTJ !== undefined && item.energyTJ !== undefined) {
      existing.energyTJ += item.energyTJ;
    }
  }

  return [...byLabel.values()]
    .map((item) => {
      const n = counts.get(item.label) ?? 1;
      return n > 1 ? { ...item, formula: `${n} records, summed · ${item.formula}` } : item;
    })
    .sort((a, b) => b.emissionsT - a.emissionsT);
}

/**
 * Human-readable provenance for a contribution's factor.
 *
 * Not every contribution comes from the factor library: on-site precursors are
 * calculated upstream in this installation and bought-in ones come from a
 * supplier declaration, so those ids resolve here rather than throwing.
 */
function factorSourceLabel(factorId: string): string | null {
  const factor = tryGetFactor(factorId);
  if (factor) return `${factor.source} (${factor.vintage})`;
  if (factorId.startsWith("internal:")) return "Calculated upstream in this installation";
  if (factorId.startsWith("precursor:")) return "Supplier declaration";
  return null;
}
