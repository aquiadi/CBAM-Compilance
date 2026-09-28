/**
 * Chart palette.
 *
 * Lives outside any "use client" module on purpose: every export of a client
 * module becomes a client reference when a server component imports it, so
 * reading `SERIES.direct` in a server-rendered page would yield undefined and
 * silently paint the mark black. Plain data belongs in a plain module.
 *
 * Series and chart chrome are CSS variables defined in globals.css, so the same
 * chart re-steps itself for light and dark mode: each mode's values are the
 * validated categorical steps for that mode's card surface. Charts apply them
 * through `style` (fill, stroke, background), never SVG presentation
 * attributes, which not every browser resolves variables in. Assign by entity
 * in this fixed order; never cycle, never reassign by rank.
 */
export const SERIES = {
  direct: "var(--color-series-1)", // orange - combustion
  indirect: "var(--color-series-2)", // blue - electricity
  precursor: "var(--color-series-3)", // aqua - precursors
  other: "var(--color-series-4)", // yellow - process chemistry
} as const;

/** Reserved status steps for marks (bars, fills). Never reused as a series colour. */
export const STATUS = {
  good: "#0ca30c",
  warning: "#fab219",
  serious: "#ec835a",
  critical: "#d03b3b",
} as const;

/** Status as text, legible on both modes' surfaces (see globals.css). */
export const STATUS_INK = {
  good: "var(--color-good)",
  warning: "var(--color-warning)",
  serious: "var(--color-serious)",
  critical: "var(--color-critical)",
} as const;

export const NEUTRAL = "var(--color-muted)";

export const CHROME = {
  surface: "var(--color-surface)",
  grid: "var(--color-chart-grid)",
  axis: "var(--color-chart-axis)",
  muted: "var(--color-muted)",
  ink2: "var(--color-ink-2)",
} as const;

/** Score-to-colour for bar fills, shared by the meter, the mini bars and the readiness table. */
export function scoreColor(score: number): string {
  if (score >= 85) return STATUS.good;
  if (score >= 70) return SERIES.indirect;
  if (score >= 50) return STATUS.warning;
  return STATUS.critical;
}

/**
 * Colour for the headline readiness figure and its label.
 *
 * Follows the band, not the raw score. A declaration with an open blocker is
 * not filable however well it scores on everything else, and painting an 80
 * blue next to the words "Not filable" tells the operator two different things
 * at once.
 */
export function bandColor(band: string): string {
  if (band === "not_filable") return STATUS_INK.critical;
  if (band === "verification_ready") return STATUS_INK.good;
  if (band === "defensible") return "var(--color-accent)";
  return STATUS_INK.warning;
}
