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
      <span className="text-[11.5px] font-medium text-ink-2">{label}</span>
      <div className="mt-1">{children}</div>
      {hint ? (
        <span className="mt-1 block text-[10.5px] leading-[1.45] text-muted">{hint}</span>
      ) : null}
    </label>
  );
}

const INPUT =
  "w-full rounded-md border border-line-strong bg-surface-2 px-2.5 py-1.5 text-[12.5px] text-ink outline-none placeholder:text-muted focus:border-accent disabled:opacity-60";

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
    primary: "bg-accent text-plane hover:opacity-90 border border-accent",
    secondary:
      "border border-line-strong bg-surface-3 text-ink-2 hover:border-accent hover:text-ink",
    danger: "border border-critical/40 bg-critical/10 text-critical hover:bg-critical/20",
    ghost: "border border-transparent text-ink-2 hover:text-ink",
  }[variant];
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        styles,
        className,
      )}
    />
  );
}

export function FormError({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <div className="rounded-md border border-critical/35 bg-critical/10 px-3 py-2 text-[12px] text-critical">
      {children}
    </div>
  );
}

export function FormSuccess({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <div className="rounded-md border border-good/35 bg-good/10 px-3 py-2 text-[12px] text-good">
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
    <div className="rounded-md border border-accent/30 bg-accent/[0.06] p-3">
      {note ? <p className="mb-2 text-[11.5px] text-ink-2">{note}</p> : null}
      <div className="flex gap-2">
        <input
          readOnly
          value={link}
          className={cn(INPUT, "font-mono text-[11px]")}
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
