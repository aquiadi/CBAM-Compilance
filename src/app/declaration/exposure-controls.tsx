"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { fmt, fmtCompact, fmtEur } from "@/components/ui";

interface Summary {
  obligationT: number;
  grossCertificates: number;
  carbonPriceCredit: number;
  netCertificates: number;
  netCostEur: number;
  netCostInr: number;
  cbamFactor: number;
  nonEuEmissionsT: number;
}

/**
 * Assumption controls.
 *
 * The certificate price is the single biggest uncertainty in the whole number
 * and it is not the operator's to control, so it belongs on a slider rather
 * than buried in config. Changes round-trip to the server so every figure on
 * the page recomputes from the same engine, not a client-side approximation.
 */
export function ExposureControls({
  initial,
  summary,
}: {
  initial: { etsPriceEur: number; inrPerEur: number; year: number };
  summary: Summary;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [price, setPrice] = useState(initial.etsPriceEur);
  const [year, setYear] = useState(initial.year);
  const [saving, setSaving] = useState(false);

  async function commit(next: { etsPriceEur?: number; year?: number }) {
    setSaving(true);
    try {
      await fetch("/api/assumptions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(next),
      });
      startTransition(() => router.refresh());
    } finally {
      setSaving(false);
    }
  }

  const rows: [string, string, string?][] = [
    ["Chargeable embedded emissions", `${fmt(summary.obligationT)} tCO₂e`, "EU-bound goods only"],
    [
      `Certificates before credits (${(summary.cbamFactor * 100).toFixed(1)}% CBAM factor)`,
      fmt(summary.grossCertificates),
    ],
    [
      "Less carbon price paid at origin",
      summary.carbonPriceCredit > 0 ? `−${fmt(summary.carbonPriceCredit)}` : "0",
      summary.carbonPriceCredit > 0 ? undefined : "No documented scheme applies in India today",
    ],
    ["Certificates to surrender", fmt(summary.netCertificates)],
  ];

  return (
    <div>
      <div className="grid grid-cols-2 gap-5">
        <label className="block">
          <div className="flex items-baseline justify-between">
            <span className="text-[11.5px] font-medium text-ink-2">Certificate price</span>
            <span className="tnum text-[12.5px] text-ink">€{price}</span>
          </div>
          <input
            type="range"
            min={30}
            max={200}
            step={1}
            value={price}
            onChange={(e) => setPrice(Number(e.target.value))}
            onMouseUp={() => commit({ etsPriceEur: price })}
            onTouchEnd={() => commit({ etsPriceEur: price })}
            onKeyUp={() => commit({ etsPriceEur: price })}
            className="mt-2 w-full accent-[#3987e5]"
          />
          <p className="mt-1 text-[10.5px] text-muted">
            Tracks the EU ETS auction average. Not yours to control, which is why it is a range.
          </p>
        </label>

        <label className="block">
          <div className="flex items-baseline justify-between">
            <span className="text-[11.5px] font-medium text-ink-2">Compliance year</span>
            <span className="tnum text-[12.5px] text-ink">{year}</span>
          </div>
          <input
            type="range"
            min={2026}
            max={2034}
            step={1}
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            onMouseUp={() => commit({ year })}
            onTouchEnd={() => commit({ year })}
            onKeyUp={() => commit({ year })}
            className="mt-2 w-full accent-[#3987e5]"
          />
          <p className="mt-1 text-[10.5px] text-muted">
            Free allocation is withdrawn on a fixed schedule; the CBAM factor follows it.
          </p>
        </label>
      </div>

      <div className="mt-5 border-t border-line pt-4">
        <dl className="space-y-2">
          {rows.map(([label, value, hint]) => (
            <div key={label} className="flex items-baseline justify-between gap-4">
              <dt className="text-[11.5px] text-ink-2">
                {label}
                {hint ? <span className="ml-1.5 text-[10.5px] text-muted">({hint})</span> : null}
              </dt>
              <dd className="tnum shrink-0 text-[12.5px] text-ink">{value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-4 flex items-baseline justify-between border-t border-line pt-4">
          <span className="text-[12px] font-medium text-ink">Cost for this period</span>
          <div className="text-right">
            <div
              className={`text-[26px] font-semibold leading-none tracking-[-0.02em] text-accent ${saving || pending ? "opacity-50" : ""}`}
            >
              {fmtEur(summary.netCostEur)}
            </div>
            <div className="mt-1 text-[11px] text-muted">
              ₹{fmtCompact(summary.netCostInr)} at ₹{initial.inrPerEur}/€
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
