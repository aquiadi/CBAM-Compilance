/**
 * Chart palette.
 *
 * Lives outside any "use client" module on purpose: every export of a client
 * module becomes a client reference when a server component imports it, so
 * reading `SERIES.direct` in a server-rendered page would yield undefined and
 * silently paint the mark black. Plain data belongs in a plain module.
 *
 * These are the validated LIGHT categorical steps, checked against the card
 * surface (#ffffff): lightness band, chroma floor, adjacent-pair CVD and
 * normal-vision separation pass. Aqua and yellow are below 3:1 on white, so
 * charts using them carry visible labels. Assign by entity in this fixed
 * order; never cycle, never reassign by rank.
 */
export const SERIES = {
  direct: "#eb6834", // orange - combustion
  indirect: "#2a78d6", // blue - electricity
  precursor: "#1baf7a", // aqua - precursors
  other: "#eda100", // yellow - process chemistry
} as const;

/** Reserved status steps for marks (bars, fills). Never reused as a series colour. */
export const STATUS = {
  good: "#0ca30c",
  warning: "#fab219",
  serious: "#ec835a",
  critical: "#d03b3b",
} as const;

/**
 * Status as text on white. The mark steps above are too light to read as
 * type (warning is 1.8:1), so labels and headline figures use these darker
 * steps of the same hues.
 */
export const STATUS_INK = {
  good: "#117a2c",
  warning: "#95610a",
  serious: "#b04a1f",
  critical: "#c0312f",
} as const;

export const NEUTRAL = "#9a9aa0";

export const CHROME = {
  surface: "#ffffff",
  grid: "#ecebe5",
  axis: "#d6d2c7",
  muted: "#686c74",
  ink2: "#4a4e56",
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
  if (band === "defensible") return "#1f5bd8";
  return STATUS_INK.warning;
}
