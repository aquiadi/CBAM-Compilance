"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

/**
 * The application shell.
 *
 * Navigation follows the actual workflow rather than a feature list: data comes
 * in, gets reviewed, gets calculated, becomes a declaration, and leaves an audit
 * trail. Someone who has never seen the product should be able to read the
 * sidebar and understand what the product does.
 */

const WORKFLOW = [
  { href: "/", label: "Overview", hint: "Where the declaration stands", step: null },
  { href: "/ingest", label: "Data", hint: "Upload files, review mappings", step: 1 },
  { href: "/review", label: "Review", hint: "Findings and data quality", step: 2 },
  { href: "/calculate", label: "Calculate", hint: "How each number was derived", step: 3 },
  { href: "/declaration", label: "Declaration", hint: "Goods, cost, exports", step: 4 },
  { href: "/audit", label: "Audit trail", hint: "Every figure to its source row", step: 5 },
];

const SUPPORT = [
  { href: "/suppliers", label: "Suppliers", hint: "Request precursor data" },
  { href: "/evidence", label: "Evidence", hint: "Reports, bills, certificates" },
  { href: "/activity", label: "Activity log", hint: "Who changed what" },
  { href: "/methodology", label: "Methodology", hint: "Official tables and rules" },
];

const SETTINGS = [
  { href: "/settings", label: "Installation", hint: "Processes, routes, period" },
  { href: "/settings/team", label: "Team", hint: "Members and roles" },
  { href: "/settings/workspaces", label: "Workspaces", hint: "Installations and years" },
];

interface Props {
  children: React.ReactNode;
  user: { name: string; email: string };
  org: { id: string; name: string };
  role: string;
  canWrite: boolean;
  workspaces: { id: string; name: string }[];
  currentWorkspaceId: string | null;
  model: string | null;
  database: "postgres" | "embedded";
}

export function AppShell({
  children,
  user,
  org,
  role,
  canWrite,
  workspaces,
  currentWorkspaceId,
  model,
  database,
}: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [switching, setSwitching] = useState(false);

  async function selectWorkspace(id: string) {
    if (id === "__new") {
      router.push("/settings/workspaces#new");
      return;
    }
    setSwitching(true);
    await fetch("/api/workspaces/select", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspaceId: id }),
    });
    setSwitching(false);
    router.refresh();
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const isActive = (href: string) =>
    href === "/"
      ? pathname === "/"
      : href === "/settings"
        ? pathname === "/settings"
        : pathname.startsWith(href);

  return (
    <div className="flex min-h-screen">
      <aside className="fixed inset-y-0 left-0 flex w-60 flex-col border-r border-line bg-surface">
        <div className="border-b border-line px-5 py-4">
          <Link href="/" className="group block">
            <div className="flex items-center gap-2.5">
              <Mark />
              <div>
                <div className="text-[13px] font-semibold leading-none tracking-tight text-ink">
                  CarbonPass
                </div>
                <div className="mt-1 text-[10.5px] leading-none text-muted">
                  CBAM declaration engine
                </div>
              </div>
            </div>
          </Link>
        </div>

        <div className="border-b border-line px-3 py-3">
          <div className="mb-1 px-1 text-[10px] font-medium uppercase tracking-[0.13em] text-muted">
            {org.name}
          </div>
          <select
            aria-label="Workspace"
            value={currentWorkspaceId ?? ""}
            disabled={switching}
            onChange={(e) => selectWorkspace(e.target.value)}
            className="w-full rounded-md border border-line-strong bg-surface-2 px-2 py-1.5 text-[12px] text-ink outline-none focus:border-accent"
          >
            {currentWorkspaceId === null ? <option value="">No workspace yet</option> : null}
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
            {canWrite ? <option value="__new">+ New workspace…</option> : null}
          </select>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-3">
          <NavGroup title="Workflow">
            {WORKFLOW.map((item) => (
              <NavItem
                key={item.href}
                href={item.href}
                label={item.label}
                hint={item.hint}
                marker={item.step ?? "·"}
                active={isActive(item.href)}
              />
            ))}
          </NavGroup>
          <NavGroup title="Supporting">
            {SUPPORT.map((item) => (
              <NavItem key={item.href} {...item} marker="·" active={isActive(item.href)} />
            ))}
          </NavGroup>
          <NavGroup title="Settings">
            {SETTINGS.map((item) => (
              <NavItem key={item.href} {...item} marker="·" active={isActive(item.href)} />
            ))}
          </NavGroup>
        </nav>

        <div className="border-t border-line px-4 py-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-[11.5px] font-medium text-ink">{user.name}</div>
              <div className="truncate text-[10.5px] text-muted">{user.email}</div>
              <div className="mt-0.5 text-[10px] text-muted">{role}</div>
            </div>
            <button
              type="button"
              onClick={signOut}
              className="shrink-0 rounded border border-line-strong px-2 py-0.5 text-[10.5px] text-ink-2 hover:border-accent hover:text-ink"
            >
              Sign out
            </button>
          </div>
          <p className="mt-2.5 text-[10px] leading-[1.5] text-muted">
            {model ? `Model: ${model}` : "Deterministic mapping (no model key)"} ·{" "}
            {database === "postgres" ? "Postgres" : "Embedded database"}
          </p>
        </div>
      </aside>

      <main className="ml-60 min-w-0 flex-1 bg-plane">{children}</main>
    </div>
  );
}

function NavGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <div className="mb-1.5 px-2 text-[10px] font-medium uppercase tracking-[0.13em] text-muted">
        {title}
      </div>
      <ul className="space-y-0.5">{children}</ul>
    </div>
  );
}

function NavItem({
  href,
  label,
  hint,
  marker,
  active,
}: {
  href: string;
  label: string;
  hint: string;
  marker: number | string;
  active: boolean;
}) {
  return (
    <li>
      <Link
        href={href}
        className={[
          "group flex items-start gap-2.5 rounded-md px-2 py-1.5 transition-colors",
          active ? "bg-surface-3 text-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
        ].join(" ")}
      >
        <span
          className={[
            "mt-[3px] flex h-4 w-4 shrink-0 items-center justify-center rounded text-[9px] font-semibold tnum",
            active
              ? "bg-accent text-plane"
              : "border border-line text-muted group-hover:border-line-strong",
          ].join(" ")}
          aria-hidden
        >
          {marker}
        </span>
        <span className="min-w-0">
          <span className="block text-[12.5px] font-medium leading-tight">{label}</span>
          <span className="mt-0.5 block truncate text-[10.5px] leading-tight text-muted">
            {hint}
          </span>
        </span>
      </Link>
    </li>
  );
}

/** A mark that reads as a border crossing: goods on the left, a levy at the line. */
export function Mark() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden>
      <rect x="0.5" y="0.5" width="25" height="25" rx="6" fill="#181b20" stroke="#2f333b" />
      <path d="M13 4.5v17" stroke="#3987e5" strokeWidth="1.5" strokeDasharray="2.5 2.5" />
      <rect x="5" y="11" width="5.5" height="7.5" rx="1" fill="#d95926" />
      <rect x="15.5" y="8" width="5.5" height="10.5" rx="1" fill="#199e70" />
    </svg>
  );
}
