import type { ReactNode } from "react";

/** Shared primitives. Deliberately small - the data is what should be loud. */

export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="border-b border-line bg-surface px-8 py-6">
      <div className="flex items-start justify-between gap-8">
        <div className="min-w-0">
          {eyebrow ? (
            <div className="mb-1.5 text-[10.5px] font-medium uppercase tracking-[0.14em] text-muted">
              {eyebrow}
            </div>
          ) : null}
          <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.01em] text-ink">
            {title}
          </h1>
          {description ? (
            <div className="mt-2 max-w-3xl text-[13px] leading-[1.6] text-ink-2">{description}</div>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}

export function Page({ children }: { children: ReactNode }) {
  return <div className="px-8 py-6">{children}</div>;
}

export function Card({
  title,
  subtitle,
  actions,
  children,
  className,
  padded = true,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section className={cn("rounded-lg border border-line bg-surface", className)}>
      {title ? (
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-3.5">
          <div className="min-w-0">
            <h2 className="text-[13px] font-semibold leading-tight text-ink">{title}</h2>
            {subtitle ? (
              <p className="mt-1 text-[11.5px] leading-[1.5] text-muted">{subtitle}</p>
            ) : null}
          </div>
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </div>
      ) : null}
      <div className={padded ? "p-5" : undefined}>{children}</div>
    </section>
  );
}

type Tone = "neutral" | "good" | "warning" | "serious" | "critical" | "accent";

const TONE_CLASS: Record<Tone, string> = {
  neutral: "border-line-strong bg-surface-3 text-ink-2",
  good: "border-good/35 bg-good/10 text-good",
  warning: "border-warning/35 bg-warning/10 text-warning",
  serious: "border-serious/35 bg-serious/10 text-serious",
  critical: "border-critical/40 bg-critical/12 text-critical",
  accent: "border-accent/35 bg-accent/10 text-accent",
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
        "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10.5px] font-medium leading-[1.4]",
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
    <Badge tone={map.tone} icon={<span aria-hidden>{map.glyph}</span>}>
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
    <Badge tone="neutral" icon={<span aria-hidden>⌘</span>}>
      Deterministic
    </Badge>
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
    <div className="rounded-lg border border-line bg-surface px-4 py-3.5">
      <div className="text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted">
        {label}
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        {/* Proportional figures on display values; tabular is for columns. */}
        <span
          className={cn(
            "font-semibold leading-none tracking-[-0.02em]",
            hero ? "text-[38px]" : "text-[22px]",
            toneClass,
          )}
        >
          {value}
        </span>
        {unit ? <span className="text-[11.5px] font-medium text-muted">{unit}</span> : null}
      </div>
      {sub ? <div className="mt-2 text-[11px] leading-[1.5] text-ink-2">{sub}</div> : null}
    </div>
  );
}

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-full border-collapse text-[12.5px]">{children}</table>
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
        "whitespace-nowrap border-b border-line px-3 py-2 text-[10.5px] font-medium uppercase tracking-[0.1em] text-muted",
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
        "border-b border-line/60 px-3 py-2 align-top text-ink-2",
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
    <div className="rounded-lg border border-dashed border-line px-5 py-8 text-center text-[12.5px] text-muted">
      {children}
    </div>
  );
}

export function Note({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  const border = {
    neutral: "border-l-line-strong",
    good: "border-l-good",
    warning: "border-l-warning",
    serious: "border-l-serious",
    critical: "border-l-critical",
    accent: "border-l-accent",
  }[tone];
  return (
    <div
      className={cn(
        "rounded-r border-l-2 bg-surface-2 px-3.5 py-2.5 text-[11.5px] leading-[1.6] text-ink-2",
        border,
      )}
    >
      {children}
    </div>
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
