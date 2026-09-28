"use client";

import { useSyncExternalStore } from "react";
import { THEME_KEY as KEY } from "@/lib/theme";

/**
 * Light / dark / automatic.
 *
 * "Auto" follows the device (prefers-color-scheme). A manual choice is stored
 * in localStorage and stamped on <html data-theme> - before first paint by the
 * inline script in the root layout, and here when it changes - so a page never
 * flashes the wrong theme.
 */

type Choice = "light" | "dark" | "system";

const EVENT = "cp:theme-change";

function read(): Choice {
  try {
    const v = window.localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

function apply(choice: Choice) {
  try {
    if (choice === "system") window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, choice);
  } catch {
    // Storage blocked: the choice still applies to this page.
  }
  const root = document.documentElement;
  if (choice === "system") delete root.dataset.theme;
  else root.dataset.theme = choice;
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

const OPTIONS: { id: Choice; label: string; icon: React.ReactNode }[] = [
  { id: "light", label: "Light", icon: <SunIcon /> },
  { id: "dark", label: "Dark", icon: <MoonIcon /> },
  { id: "system", label: "Auto", icon: <AutoIcon /> },
];

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const choice = useSyncExternalStore<Choice>(subscribe, read, () => "system");
  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className="inline-flex items-center gap-0.5 rounded-full border border-line bg-surface-2 p-0.5"
    >
      {OPTIONS.map((o) => {
        const active = choice === o.id;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={active}
            title={o.id === "system" ? "Follow this device" : `${o.label} theme`}
            onClick={() => apply(o.id)}
            className={
              "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-medium transition-colors " +
              (active
                ? "bg-surface text-ink shadow-[var(--shadow-card)]"
                : "text-muted hover:text-ink")
            }
          >
            {o.icon}
            {compact ? <span className="sr-only">{o.label}</span> : o.label}
          </button>
        );
      })}
    </div>
  );
}

function SunIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M12 2.5v2.2M12 19.3v2.2M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AutoIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="4.5" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M9 20h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
