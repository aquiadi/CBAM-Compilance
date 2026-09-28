"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { fmt, fmtCompact, fmtEur } from "@/components/ui";

interface Summary {
  embeddedEuT: number;
  freeAllocationT: number;
  grossCertificates: number;
  carbonPriceCredit: number;
  netCertificates: number;
  netCostEur: number;
  netCostInr: number;
  effectivePriceEur: number;
  cbamFactor: number;
  defaultCertificates: number;
  defaultCostEur: number;
}

/**
 * The obligation, line by line, and the one assumption the operator controls:
 * the certificate price for quarters the Commission has not published yet.
 * Changes round-trip to the server so every figure recomputes from the same
 * engine, not a client-side approximation.
 */
export function ExposureControls({
  initial,
  summary,
  pricing,
  canWrite,
}: {
  initial: { etsPriceEur: number; inrPerEur: number };
  summary: Summary;
  pricing: {
    quarter: string;
    priceEur: number;
    basis: "published" | "assumption";
    euTonnes: number;
  }[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [price, setPrice] = useState(initial.etsPriceEur);
  const [inr, setInr] = useState(initial.inrPerEur);
  const [saving, setSaving] = useState(false);

  async function commit(next: { etsPriceEur?: number; inrPerEur?: number }) {
    setSaving(true);
    try {
      await fetch("/api/workspace/assumptions", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(next),
      });
      startTransition(() => router.refresh());
    } finally {
      setSaving(false);
    }
  }

  const rows: [string, string, string?][] = [
    ["EU-bound embedded emissions (counted)", `${fmt(summary.embeddedEuT)} tCO₂e`],
    [
      `Less free allocation adjustment (CBAM factor ${(summary.cbamFactor * 100).toFixed(1)}%)`,
      `−${fmt(summary.freeAllocationT)} tCO₂e`,
      "benchmark-based, per good",
    ],
    ["Certificates before carbon price paid", fmt(summary.grossCertificates)],
    [
      "Less carbon price paid at origin",
      summary.carbonPriceCredit > 0 ? `−${fmt(summary.carbonPriceCredit)}` : "0",
      summary.carbonPriceCredit > 0 ? undefined : "none claimed",
    ],
    ["Certificates to surrender", fmt(summary.netCertificates)],
  ];

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-7">
        <label className="block">
          <div className="flex items-baseline justify-between">
            <span className="text-[13px] font-medium text-ink-2">
              Price for unpublished quarters
            </span>
            <span className="tnum text-[14px] text-ink">€{price}</span>
          </div>
          <input
            type="range"
            min={30}
            max={200}
            step={1}
            value={price}
            disabled={!canWrite}
            onChange={(e) => setPrice(Number(e.target.value))}
            onMouseUp={() => commit({ etsPriceEur: price })}
            onTouchEnd={() => commit({ etsPriceEur: price })}
            onKeyUp={() => commit({ etsPriceEur: price })}
            className="mt-2 w-full accent-[#1f5bd8]"
          />
          <p className="mt-1 text-[12px] text-muted">
            Published quarters use the Commission&apos;s price; this applies to the rest and to
            later years.
          </p>
        </label>

        <label className="block">
          <div className="flex items-baseline justify-between">
            <span className="text-[13px] font-medium text-ink-2">INR per EUR</span>
            <span className="tnum text-[14px] text-ink">₹{inr}</span>
          </div>
          <input
            type="number"
            min={50}
            max={200}
            step={0.5}
            value={inr}
            disabled={!canWrite}
            onChange={(e) => setInr(Number(e.target.value))}
            onBlur={() => commit({ inrPerEur: inr })}
            className="mt-2 w-full rounded-lg border border-line-strong bg-surface-2 px-2.5 py-1.5 text-[14px] text-ink outline-none focus:border-accent"
          />
          <p className="mt-1 text-[12px] text-muted">For budgeting in rupees only.</p>
        </label>
      </div>

      {pricing.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {pricing.map((p) => (
            <span
              key={p.quarter}
              className="rounded border border-line bg-surface-2 px-2 py-1 text-[12px] text-ink-2"
            >
              {p.quarter}: {fmt(p.euTonnes)} t at €{p.priceEur.toFixed(2)}{" "}
              <span className="text-muted">({p.basis})</span>
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-8 border-t border-line pt-4">
        <dl className="space-y-2">
          {rows.map(([label, value, hint]) => (
            <div key={label} className="flex items-baseline justify-between gap-4">
              <dt className="text-[13px] text-ink-2">
                {label}
                {hint ? <span className="ml-1.5 text-[12px] text-muted">({hint})</span> : null}
              </dt>
              <dd className="tnum shrink-0 text-[14px] text-ink">{value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-4 flex items-baseline justify-between border-t border-line pt-4">
          <span className="text-[13.5px] font-medium text-ink">Cost for this period</span>
          <div className="text-right">
            <div
              className={`text-[26px] font-semibold leading-none tracking-[-0.02em] text-accent ${saving || pending ? "opacity-50" : ""}`}
            >
              {fmtEur(summary.netCostEur)}
            </div>
            <div className="mt-1 text-[12.5px] text-muted">
              ₹{fmtCompact(summary.netCostInr)} · average €{summary.effectivePriceEur.toFixed(2)}
              /certificate
            </div>
          </div>
        </div>
        <div className="mt-3 flex items-baseline justify-between text-[13px]">
          <span className="text-ink-2">The same goods on default values</span>
          <span className="tnum text-ink-2">
            {fmt(summary.defaultCertificates)} certificates · {fmtEur(summary.defaultCostEur)}
          </span>
        </div>
      </div>
    </div>
  );
}
