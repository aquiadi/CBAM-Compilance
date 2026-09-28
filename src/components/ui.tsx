import type { ReactNode } from "react";

/**
 * Shared primitives. Generous space, quiet chrome: the figures and the next
 * action should be the loudest things on any page.
 */

export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: ReactNode;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="px-5 pb-1 pt-8 md:px-10 md:pb-2 md:pt-12" data-tour="page-header">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-5 md:flex-row md:items-end md:justify-between md:gap-10">
        <div className="min-w-0 animate-rise">
          {eyebrow ? (
            <div className="mb-3 text-[12px] font-medium uppercase tracking-[0.16em] text-muted">
              {eyebrow}
            </div>
          ) : null}
          <h1 className="font-display text-[32px] font-normal leading-[1.08] text-ink md:text-[40px]">
            {title}
          </h1>
          {description ? (
            <div className="mt-3 max-w-[68ch] text-[15px] leading-[1.65] text-ink-2 md:mt-4 md:text-[15.5px]">
              {description}
            </div>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-3">{actions}</div>
        ) : null}
      </div>
    </header>
  );
}

export function Page({ children }: { children: ReactNode }) {
  return (
    <div className="px-5 pb-16 pt-6 md:px-10 md:pb-20 md:pt-8">
      <div className="mx-auto max-w-[1180px]">{children}</div>
    </div>
  );
}

export function Card({
  title,
  subtitle,
  actions,
  children,
  className,
  padded = true,
  tour,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  padded?: boolean;
  /** Anchor for the guided tour. */
  tour?: string;
}) {
  return (
    <section
      data-tour={tour}
      className={cn(
        "rounded-2xl border border-line bg-surface shadow-[var(--shadow-card)]",
        className,
      )}
    >
      {title ? (
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 px-5 pb-1 pt-5 md:px-7 md:pt-6">
          <div className="min-w-0">
            <h2 className="text-[16px] font-semibold leading-snug text-ink">{title}</h2>
            {subtitle ? (
              <p className="mt-1.5 max-w-[70ch] text-[13.5px] leading-[1.6] text-muted">
                {subtitle}
              </p>
            ) : null}
          </div>
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </div>
      ) : null}
      <div className={padded ? "px-5 pb-6 pt-4 md:px-7 md:pb-7 md:pt-5" : "pt-3"}>{children}</div>
    </section>
  );
}

type Tone = "neutral" | "good" | "warning" | "serious" | "critical" | "accent";

const TONE_CLASS: Record<Tone, string> = {
  neutral: "border-line-strong bg-surface-2 text-ink-2",
  good: "border-good/25 bg-good/[0.07] text-good",
  warning: "border-warning/25 bg-warning/[0.08] text-warning",
  serious: "border-serious/25 bg-serious/[0.07] text-serious",
  critical: "border-critical/25 bg-critical/[0.07] text-critical",
  accent: "border-accent/25 bg-accent/[0.07] text-accent",
};

/**
 * Status always ships with a label, never colour alone - the palette's
 * warning/serious steps are close enough in hue that a colourblind reader
 * cannot separate them, and a shape-only cue would fail in print.
 */
export function Badge({
  tone = "neutral",
  children,
  icon,
}: {
  tone?: Tone;
  children: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[12px] font-medium leading-[1.5]",
        TONE_CLASS[tone],
      )}
    >
      {icon}
      {children}
    </span>
  );
}

export function SeverityBadge({ severity }: { severity: "blocker" | "warning" | "info" }) {
  const map = {
    blocker: { tone: "critical" as Tone, label: "Blocker", glyph: "▲" },
    warning: { tone: "warning" as Tone, label: "Warning", glyph: "◆" },
    info: { tone: "accent" as Tone, label: "Info", glyph: "●" },
  }[severity];
  return (
    <Badge
      tone={map.tone}
      icon={
        <span aria-hidden className="text-[9px]">
          {map.glyph}
        </span>
      }
    >
      {map.label}
    </Badge>
  );
}

/** Marks whether a value came from the model or the deterministic path. */
export function ProvenanceBadge({
  producedBy,
  model,
}: {
  producedBy: "model" | "heuristic";
  model?: string;
}) {
  return producedBy === "model" ? (
    <Badge tone="accent" icon={<span aria-hidden>✦</span>}>
      {model ?? "AI model"}
    </Badge>
  ) : (
    <Badge tone="neutral">Rule-based</Badge>
  );
}

export function Stat({
  label,
  value,
  unit,
  sub,
  tone,
  hero = false,
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: ReactNode;
  tone?: "good" | "warning" | "critical" | "accent";
  hero?: boolean;
}) {
  const toneClass = tone
    ? {
        good: "text-good",
        warning: "text-warning",
        critical: "text-critical",
        accent: "text-accent",
      }[tone]
    : "text-ink";
  return (
    <div className="rounded-2xl border border-line bg-surface px-6 py-6 shadow-[var(--shadow-card)]">
      <div className="text-[13px] font-medium text-muted">{label}</div>
      <div className="mt-3 flex items-baseline gap-2">
        {/* Proportional figures on display values; tabular is for columns. */}
        <span
          className={cn(
            "font-display leading-none",
            hero ? "text-[52px]" : "text-[36px]",
            toneClass,
          )}
        >
          {value}
        </span>
        {unit ? <span className="text-[13px] font-medium text-muted">{unit}</span> : null}
      </div>
      {sub ? <div className="mt-3 text-[13px] leading-[1.55] text-ink-2">{sub}</div> : null}
    </div>
  );
}

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-full border-collapse text-[14px]">{children}</table>
    </div>
  );
}

export function Th({
  children,
  align = "left",
  className,
}: {
  /** Optional: a spacer column for row actions has no header text. */
  children?: ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
}) {
  return (
    <th
      className={cn(
        "whitespace-nowrap border-b border-line px-4 py-3 text-[12px] font-medium text-muted first:pl-5 last:pr-5 md:first:pl-7 md:last:pr-7",
        align === "right" && "text-right",
        align === "center" && "text-center",
        align === "left" && "text-left",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = "left",
  numeric = false,
  className,
}: {
  children: ReactNode;
  align?: "left" | "right" | "center";
  numeric?: boolean;
  className?: string;
}) {
  return (
    <td
      className={cn(
        "border-b border-line/70 px-4 py-3.5 align-top text-ink-2 first:pl-5 last:pr-5 md:first:pl-7 md:last:pr-7",
        align === "right" && "text-right",
        align === "center" && "text-center",
        numeric && "tnum text-ink",
        className,
      )}
    >
      {children}
    </td>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line-strong px-6 py-12 text-center text-[14px] text-muted">
      {children}
    </div>
  );
}

export function Note({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  const style = {
    neutral: "border-line bg-surface-2",
    good: "border-good/20 bg-good/[0.05]",
    warning: "border-warning/20 bg-warning/[0.06]",
    serious: "border-serious/20 bg-serious/[0.05]",
    critical: "border-critical/20 bg-critical/[0.05]",
    accent: "border-accent/20 bg-accent/[0.05]",
  }[tone];
  return (
    <div className={cn("rounded-xl border px-5 py-4 text-[14px] leading-[1.65] text-ink-2", style)}>
      {children}
    </div>
  );
}

/** Folds secondary detail away so a page leads with what matters. */
export function Disclosure({
  summary,
  hint,
  children,
  defaultOpen = false,
}: {
  summary: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details
      className="group rounded-2xl border border-line bg-surface shadow-[var(--shadow-card)]"
      open={defaultOpen}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-6 px-5 py-5 md:px-7 [&::-webkit-details-marker]:hidden">
        <span>
          <span className="block text-[15px] font-semibold text-ink">{summary}</span>
          {hint ? <span className="mt-1 block text-[13px] text-muted">{hint}</span> : null}
        </span>
        <span
          aria-hidden
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line text-ink-2 transition-transform group-open:rotate-45"
        >
          +
        </span>
      </summary>
      <div className="space-y-8 border-t border-line px-5 pb-6 pt-6 md:px-7 md:pb-7">
        {children}
      </div>
    </details>
  );
}

// ---------------------------------------------------------------- formatters

/** Indian digit grouping, because that is what the operator's finance team uses. */
export function fmt(n: number, dp = 0): string {
  return n.toLocaleString("en-IN", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

export function fmtCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e7) return `${(n / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `${(n / 1e5).toFixed(2)} L`;
  if (abs >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return fmt(n, abs < 10 ? 2 : 0);
}

/** Drops trailing zeros so an axis reads "€4B", not "€4000.00M". */
function trim(n: number, dp: number): string {
  return Number(n.toFixed(dp)).toString();
}

export function fmtEur(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) return `€${trim(n / 1e9, 2)}B`;
  if (abs >= 1e6) return `€${trim(n / 1e6, abs >= 1e8 ? 0 : 2)}M`;
  if (abs >= 1000) return `€${trim(n / 1000, 1)}k`;
  return `€${fmt(n, 0)}`;
}

export function pct(n: number, dp = 1): string {
  return `${(n * 100).toFixed(dp)}%`;
}

export function signedPct(n: number, dp = 0): string {
  return `${n >= 0 ? "+" : ""}${(n * 100).toFixed(dp)}%`;
}
