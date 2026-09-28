"use client";

import { useState, type ReactNode } from "react";
import { cn } from "./ui";

/** Form primitives shared by every screen that changes something. */

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="text-[13.5px] font-medium text-ink">{label}</span>
      <div className="mt-2">{children}</div>
      {hint ? (
        <span className="mt-1.5 block text-[12.5px] leading-[1.5] text-muted">{hint}</span>
      ) : null}
    </label>
  );
}

const INPUT =
  "w-full rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-[14.5px] text-ink outline-none transition-shadow placeholder:text-muted/70 focus:border-accent focus:shadow-[0_0_0_4px_rgb(31_91_216/0.12)] disabled:bg-surface-2 disabled:opacity-70";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(INPUT, props.className)} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(INPUT, "min-h-[72px]", props.className)} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(INPUT, "pr-7", props.className)} />;
}

export function Button({
  variant = "secondary",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
}) {
  const styles = {
    primary: "border border-inverse bg-inverse text-on-inverse hover:opacity-90",
    secondary: "border border-line-strong bg-surface text-ink hover:border-ink",
    danger: "border border-critical/30 bg-critical/[0.06] text-critical hover:bg-critical/[0.12]",
    ghost: "border border-transparent text-ink-2 hover:bg-surface-2 hover:text-ink",
  }[variant];
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "rounded-full px-4 py-2 text-[13.5px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        styles,
        className,
      )}
    />
  );
}

export function FormError({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <div className="rounded-xl border border-critical/25 bg-critical/[0.06] px-4 py-3 text-[13.5px] text-critical">
      {children}
    </div>
  );
}

export function FormSuccess({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <div className="rounded-xl border border-good/25 bg-good/[0.06] px-4 py-3 text-[13.5px] text-good">
      {children}
    </div>
  );
}

/** Sends JSON (or FormData) and surfaces the API's own error message. */
export function useRequest() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send<T = Record<string, unknown>>(
    url: string,
    init: { method?: string; json?: unknown; form?: FormData } = {},
  ): Promise<(T & { ok: true }) | null> {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(url, {
        method: init.method ?? "POST",
        headers: init.json !== undefined ? { "content-type": "application/json" } : undefined,
        body: init.form ?? (init.json !== undefined ? JSON.stringify(init.json) : undefined),
      });
      const body = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!response.ok || !body.ok) {
        setError(body.error ?? `Request failed (${response.status}).`);
        return null;
      }
      return body as T & { ok: true };
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
      return null;
    } finally {
      setPending(false);
    }
  }

  return { send, pending, error, setError };
}

/** A read-only link with a copy button, for invitation and supplier links. */
export function CopyLink({ link, note }: { link: string; note?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-xl border border-accent/25 bg-accent/[0.05] p-4">
      {note ? <p className="mb-2 text-[13px] text-ink-2">{note}</p> : null}
      <div className="flex gap-2">
        <input
          readOnly
          value={link}
          className={cn(INPUT, "font-mono text-[12.5px]")}
          onFocus={(e) => e.target.select()}
        />
        <Button
          onClick={async () => {
            await navigator.clipboard.writeText(link);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}
