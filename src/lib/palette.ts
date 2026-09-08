/**
 * Chart palette.
 *
 * Lives outside any "use client" module on purpose: every export of a client
 * module becomes a client reference when a server component imports it, so
 * reading `SERIES.direct` in a server-rendered page would yield undefined and
 * silently paint the mark black. Plain data belongs in a plain module.
 *
 * These are the validated dark categorical steps, checked against the app
 * surface (#131519) for the lightness band, chroma floor, adjacent-pair CVD
 * separation, normal-vision separation and 3:1 contrast. Assign by entity in
 * this fixed order; never cycle, never reassign by rank.
 */
export const SERIES = {
  direct: "#d95926", // slot 2 - combustion
  indirect: "#3987e5", // slot 1 - electricity
  precursor: "#199e70", // slot 3 - precursors
  other: "#c98500", // slot 4 - process chemistry
} as const;

/** Reserved status steps. Never reused as a series colour. */
export const STATUS = {
  good: "#0ca30c",
  warning: "#fab219",
  serious: "#ec835a",
  critical: "#d03b3b",
} as const;

export const NEUTRAL = "#4b5563";

export const CHROME = {
  surface: "#131519",
  grid: "#23262c",
  axis: "#2f333b",
  muted: "#6e7682",
  ink2: "#a7aeb9",
} as const;

/** Score-to-colour, shared by the meter, the mini bars and the readiness table. */
export function scoreColor(score: number): string {
  if (score >= 85) return STATUS.good;
  if (score >= 70) return SERIES.indirect;
  if (score >= 50) return STATUS.warning;
  return STATUS.critical;
}

/**
 * Colour for the headline readiness figure.
 *
 * Follows the band, not the raw score. A declaration with an open blocker is
 * not filable however well it scores on everything else, and painting an 80
 * blue next to the words "Not filable" tells the operator two different things
 * at once.
 */
export function bandColor(band: string): string {
  if (band === "not_filable") return STATUS.critical;
  if (band === "verification_ready") return STATUS.good;
  if (band === "defensible") return SERIES.indirect;
  return STATUS.warning;
}
