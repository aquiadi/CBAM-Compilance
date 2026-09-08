"use client";

import { useId, useState } from "react";
import { bandColor, CHROME, scoreColor, SERIES } from "@/lib/palette";
import { cn, fmt, fmtEur } from "./ui";

/**
 * Charts, hand-rolled in SVG.
 *
 * No chart library: every form here is simple enough that a dependency would
 * cost more in bundle size and styling fights than it saves. The specs are
 * fixed - bars capped at 24px with a 4px rounded data end, 2px lines, >=8px
 * markers, hairline solid gridlines, a 2px surface gap between touching marks,
 * and a hover layer on everything that plots.
 *
 * Colours come from the validated categorical order in globals.css and are
 * assigned by entity, never by rank, so filtering never repaints a series.
 */

const { surface: SURFACE, grid: GRID, axis: AXIS, muted: MUTED, ink2: INK2 } = CHROME;

export { SERIES };

// ------------------------------------------------------------------ tooltip

/** `left` is a CSS length so the tooltip tracks a responsive SVG's geometry. */
function Tooltip({ left, top, children }: { left: string; top: number; children: React.ReactNode }) {
  return (
    <div
      className="pointer-events-none absolute z-20 -translate-x-1/2 rounded-md border border-line-strong bg-surface-3 px-2.5 py-1.5 text-[11px] leading-[1.5] text-ink shadow-lg"
      style={{ left, top }}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------- waterfall

export interface WaterfallStep {
  label: string;
  /** Signed contribution. */
  value: number;
  color: string;
  /** Rendered as a running total rather than a step. */
  total?: boolean;
  detail?: string;
}

/**
 * Waterfall of emissions contributions.
 *
 * The right form here because the question is "where does the number come
 * from", which is composition plus sequence - a pie would lose the sequence and
 * a stacked bar would lose the arithmetic.
 */
export function Waterfall({ steps, unit = "tCO₂e" }: { steps: WaterfallStep[]; unit?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const width = 720;
  const height = 260;
  const padding = { top: 16, right: 16, bottom: 44, left: 68 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  // Running positions.
  let running = 0;
  const bars = steps.map((s) => {
    const start = s.total ? 0 : running;
    const end = s.total ? s.value : running + s.value;
    if (!s.total) running += s.value;
    return { ...s, start, end };
  });

  const max = Math.max(...bars.map((b) => Math.max(b.start, b.end)), 0);
  const min = Math.min(...bars.map((b) => Math.min(b.start, b.end)), 0);
  const span = max - min || 1;
  const y = (v: number) => padding.top + plotH - ((v - min) / span) * plotH;

  const band = plotW / bars.length;
  const barW = Math.min(24, band - 14);

  const ticks = 4;
  const tickValues = Array.from({ length: ticks + 1 }, (_, i) => min + (span * i) / ticks);

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img">
        {tickValues.map((t, i) => (
          <g key={i}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={y(t)}
              y2={y(t)}
              stroke={t === 0 ? AXIS : GRID}
              strokeWidth="1"
            />
            <text
              x={padding.left - 8}
              y={y(t) + 3.5}
              textAnchor="end"
              fill={MUTED}
              fontSize="10"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {fmt(Math.round(t))}
            </text>
          </g>
        ))}

        {bars.map((b, i) => {
          const cx = padding.left + band * i + band / 2;
          const top = Math.min(y(b.start), y(b.end));
          const h = Math.max(2, Math.abs(y(b.end) - y(b.start)));
          const isHover = hover === i;
          return (
            <g key={b.label}>
              {/* Connector to the next step, so the arithmetic is visible. */}
              {i < bars.length - 1 && !bars[i + 1]?.total ? (
                <line
                  x1={cx + barW / 2}
                  x2={padding.left + band * (i + 1) + band / 2 - barW / 2}
                  y1={y(b.end)}
                  y2={y(b.end)}
                  stroke={AXIS}
                  strokeWidth="1"
                  strokeDasharray="2 2"
                />
              ) : null}
              <rect
                x={cx - barW / 2}
                y={top}
                width={barW}
                height={h}
                rx="3"
                fill={b.color}
                opacity={hover === null || isHover ? 1 : 0.45}
              />
              {/* Hit target is wider than the mark. */}
              <rect
                x={cx - band / 2}
                y={padding.top}
                width={band}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
              <text
                x={cx}
                y={height - padding.bottom + 15}
                textAnchor="middle"
                fill={INK2}
                fontSize="10.5"
              >
                {b.label.length > 16 ? `${b.label.slice(0, 15)}…` : b.label}
              </text>
              <text
                x={cx}
                y={height - padding.bottom + 29}
                textAnchor="middle"
                fill={MUTED}
                fontSize="10"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {b.total ? fmt(b.value) : `${b.value >= 0 ? "+" : ""}${fmt(b.value)}`}
              </text>
            </g>
          );
        })}
      </svg>

      {hover !== null && bars[hover] ? (
        <Tooltip
          left={`${((padding.left + band * hover + band / 2) / width) * 100}%`}
          top={4}
        >
          <div className="font-medium">{bars[hover]!.label}</div>
          <div className="tnum mt-0.5">
            {fmt(bars[hover]!.value)} {unit}
          </div>
          {bars[hover]!.detail ? (
            <div className="mt-1 max-w-[220px] text-[10.5px] text-ink-2">{bars[hover]!.detail}</div>
          ) : null}
        </Tooltip>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------- benchmark bars

export interface BenchmarkRow {
  label: string;
  sublabel?: string;
  value: number;
  benchmark?: number;
}

/**
 * Plant intensity against a sector benchmark.
 *
 * Two series, so a legend is mandatory. The benchmark is a rule rather than a
 * second bar - overlaying a reference line on the measured bar keeps the
 * comparison on one axis and stops the eye reading it as two independent
 * quantities.
 */
export function BenchmarkBars({
  rows,
  unit = "tCO₂e/t",
}: {
  rows: BenchmarkRow[];
  unit?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...rows.flatMap((r) => [r.value, r.benchmark ?? 0]), 0.001) * 1.15;

  return (
    <div>
      <div className="mb-3 flex items-center gap-4 text-[11px] text-ink-2">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: SERIES.direct }} />
          This installation
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-[2px]" style={{ background: INK2 }} />
          Sector benchmark
        </span>
      </div>

      <div className="space-y-3">
        {rows.map((r, i) => {
          const valuePct = (r.value / max) * 100;
          const benchPct = r.benchmark ? (r.benchmark / max) * 100 : null;
          const delta = r.benchmark ? (r.value - r.benchmark) / r.benchmark : null;
          return (
            <div
              key={r.label}
              className="group"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              <div className="mb-1 flex items-baseline justify-between gap-3">
                <div className="min-w-0">
                  <span className="text-[12px] font-medium text-ink">{r.label}</span>
                  {r.sublabel ? (
                    <span className="ml-2 text-[10.5px] text-muted">{r.sublabel}</span>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-baseline gap-2">
                  <span className="tnum text-[12px] text-ink">{r.value.toFixed(3)}</span>
                  {delta !== null ? (
                    <span
                      className={cn(
                        "tnum text-[10.5px]",
                        delta <= 0 ? "text-good" : "text-serious",
                      )}
                    >
                      {delta <= 0 ? "▼" : "▲"} {Math.abs(delta * 100).toFixed(0)}%
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="relative h-5 rounded bg-surface-2">
                <div
                  className="absolute inset-y-0 left-0 rounded-r-[3px] rounded-l-sm transition-opacity"
                  style={{
                    width: `${Math.max(0.5, valuePct)}%`,
                    background: SERIES.direct,
                    opacity: hover === null || hover === i ? 1 : 0.5,
                  }}
                />
                {benchPct !== null ? (
                  <div
                    className="absolute inset-y-[-2px] w-[2px]"
                    style={{ left: `${benchPct}%`, background: INK2 }}
                    title={`Benchmark ${r.benchmark}`}
                  />
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-[10.5px] text-muted">Values in {unit}.</p>
    </div>
  );
}

// ------------------------------------------------------------- trajectory line

export interface TrajectoryPoint {
  year: number;
  costEur: number;
  factor: number;
  certificates: number;
}

/**
 * Cost across the CBAM phase-in.
 *
 * A single series, so no legend box - the title says what is plotted. The
 * endpoint carries a direct label; the rest is left to the axis and the
 * crosshair, because a number on every point goes unread.
 */
/** Round a scale maximum up so `steps` even divisions land on clean numbers. */
function niceCeiling(value: number, steps: number): number {
  if (value <= 0) return 1;
  const rough = value / steps;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalised = rough / magnitude;
  const stepped = normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 5 ? 5 : 10;
  return stepped * magnitude * steps;
}

export function TrajectoryLine({ points }: { points: TrajectoryPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const id = useId();
  const width = 720;
  const height = 240;
  const padding = { top: 20, right: 74, bottom: 36, left: 66 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  if (points.length === 0) return null;

  // Axis ticks must land on round numbers - "EUR 2867.61M" is noise where
  // "EUR 3M" is a scale. Snap the top of the axis to a 1/2/5 x 10^n step.
  const rawMax = Math.max(...points.map((p) => p.costEur)) * 1.05 || 1;
  const max = niceCeiling(rawMax, 4);
  const x = (i: number) => padding.left + (i / Math.max(1, points.length - 1)) * plotW;
  const y = (v: number) => padding.top + plotH - (v / max) * plotH;

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(p.costEur)}`).join(" ");
  const area = `${path} L ${x(points.length - 1)} ${padding.top + plotH} L ${x(0)} ${padding.top + plotH} Z`;
  const last = points[points.length - 1]!;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img">
        <defs>
          <linearGradient id={`grad-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SERIES.indirect} stopOpacity="0.18" />
            <stop offset="100%" stopColor={SERIES.indirect} stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={padding.top + plotH * (1 - f)}
              y2={padding.top + plotH * (1 - f)}
              stroke={f === 0 ? AXIS : GRID}
            />
            <text
              x={padding.left - 8}
              y={padding.top + plotH * (1 - f) + 3.5}
              textAnchor="end"
              fill={MUTED}
              fontSize="10"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {fmtEur(max * f)}
            </text>
          </g>
        ))}

        <path d={area} fill={`url(#grad-${id})`} />
        <path d={path} fill="none" stroke={SERIES.indirect} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

        {points.map((p, i) => (
          <g key={p.year}>
            <text
              x={x(i)}
              y={height - padding.bottom + 16}
              textAnchor="middle"
              fill={hover === i ? INK2 : MUTED}
              fontSize="10"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {p.year}
            </text>
            {hover === i ? (
              <line
                x1={x(i)}
                x2={x(i)}
                y1={padding.top}
                y2={padding.top + plotH}
                stroke={AXIS}
                strokeWidth="1"
              />
            ) : null}
            <circle
              cx={x(i)}
              cy={y(p.costEur)}
              r={hover === i ? 5 : 3.5}
              fill={SERIES.indirect}
              stroke={SURFACE}
              strokeWidth="2"
            />
            {/* Hit target far larger than the mark. */}
            <rect
              x={x(i) - plotW / (points.length * 2)}
              y={padding.top}
              width={plotW / points.length}
              height={plotH}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            />
          </g>
        ))}

        {/* Only the endpoint is directly labelled. */}
        <text
          x={x(points.length - 1) + 10}
          y={y(last.costEur) + 4}
          fill={INK2}
          fontSize="11"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {fmtEur(last.costEur)}
        </text>
      </svg>

      {hover !== null && points[hover] ? (
        <div
          className="pointer-events-none absolute z-20 -translate-x-1/2 rounded-md border border-line-strong bg-surface-3 px-2.5 py-1.5 text-[11px] text-ink shadow-lg"
          style={{ left: `${(x(hover) / width) * 100}%`, top: 4 }}
        >
          <div className="font-medium tnum">{points[hover]!.year}</div>
          <div className="tnum mt-0.5">{fmtEur(points[hover]!.costEur)}</div>
          <div className="mt-0.5 text-[10.5px] text-ink-2">
            CBAM factor {(points[hover]!.factor * 100).toFixed(1)}% ·{" "}
            {fmt(points[hover]!.certificates)} certs
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ----------------------------------------------------------------- meter

/** Readiness meter. Fill carries severity; the track is a lighter step of the same idea. */
export function ReadinessMeter({
  score,
  band,
  bandId,
}: {
  score: number;
  band: string;
  bandId: string;
}) {
  const color = bandColor(bandId);
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[38px] font-semibold leading-none tracking-[-0.02em]" style={{ color }}>
          {score}
        </span>
        <span className="text-[11.5px] font-medium" style={{ color }}>
          {band}
        </span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-3">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${score}%`, background: color }}
        />
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] text-muted">
        <span>0</span>
        <span>Verification ready · 85</span>
        <span>100</span>
      </div>
    </div>
  );
}

/** Small horizontal bar used inside tables for component scores. */
export function MiniBar({ value, max = 100 }: { value: number; max?: number }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const color = scoreColor(pct);
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

/** Stacked composition bar - 2px surface gaps do the separating, not strokes. */
export function StackBar({
  segments,
}: {
  segments: { label: string; value: number; color: string }[];
}) {
  const total = segments.reduce((s, x) => s + Math.abs(x.value), 0) || 1;
  return (
    <div>
      <div className="flex h-6 gap-[2px] overflow-hidden rounded">
        {segments
          .filter((s) => Math.abs(s.value) > 0)
          .map((s) => (
            <div
              key={s.label}
              title={`${s.label}: ${fmt(s.value)}`}
              style={{ width: `${(Math.abs(s.value) / total) * 100}%`, background: s.color }}
            />
          ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {segments
          .filter((s) => Math.abs(s.value) > 0)
          .map((s) => (
            <span key={s.label} className="flex items-center gap-1.5 text-[10.5px] text-ink-2">
              <span className="h-2 w-2 rounded-sm" style={{ background: s.color }} />
              {s.label}
              <span className="tnum text-muted">{fmt(s.value)}</span>
            </span>
          ))}
      </div>
    </div>
  );
}
