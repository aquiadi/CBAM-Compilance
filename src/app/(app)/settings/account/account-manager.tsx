"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Field, FormError, Input, useRequest } from "@/components/forms";
import { Badge, Card, Note } from "@/components/ui";
import type { SessionInfo } from "@/lib/auth/account";
import type { TwoFactorStatus } from "@/lib/auth/two-factor";

export function AccountManager({
  twoFactor,
  sessions,
  secretsSealed,
}: {
  twoFactor: TwoFactorStatus;
  sessions: SessionInfo[];
  secretsSealed: boolean;
}) {
  return (
    <div className="space-y-8">
      <TwoFactorCard status={twoFactor} secretsSealed={secretsSealed} />
      <PasswordCard />
      <SessionsCard sessions={sessions} />
    </div>
  );
}

function RecoveryCodes({ codes }: { codes: string[] }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-3">
      <Note tone="warning">
        <b>Save these recovery codes now.</b> Each signs you in once if you lose your phone. They
        will not be shown again. Keep them somewhere other than your phone - a password manager or
        on paper.
      </Note>
      <ul className="grid grid-cols-2 gap-2 rounded-xl border border-line bg-surface-2 p-4 font-mono text-[14px] sm:grid-cols-5">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <Button
        onClick={async () => {
          await navigator.clipboard.writeText(codes.join("\n"));
          setCopied(true);
        }}
      >
        {copied ? "Copied" : "Copy all"}
      </Button>
    </div>
  );
}

function TwoFactorCard({
  status,
  secretsSealed,
}: {
  status: TwoFactorStatus;
  secretsSealed: boolean;
}) {
  const router = useRouter();
  const { send, pending, error, setError } = useRequest();
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [mode, setMode] = useState<"idle" | "disable" | "renew">("idle");

  async function act(action: string, extra: Record<string, string> = {}) {
    return send<{ secret?: string; qr?: string; recoveryCodes?: string[] }>(
      "/api/account/two-factor",
      { json: { action, ...extra } },
    );
  }

  return (
    <Card
      title="Two-factor sign-in"
      subtitle="After your password, a six-digit code from an authenticator app on your phone - Google Authenticator, Microsoft Authenticator, 1Password or similar."
      actions={
        <Badge tone={status.enabled ? "good" : "neutral"}>{status.enabled ? "On" : "Off"}</Badge>
      }
    >
      {codes ? (
        <div className="space-y-4">
          <RecoveryCodes codes={codes} />
          <Button
            variant="primary"
            onClick={() => {
              setCodes(null);
              setSetup(null);
              setMode("idle");
              router.refresh();
            }}
          >
            I have saved them
          </Button>
        </div>
      ) : setup ? (
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await act("confirm", { code });
            if (r?.recoveryCodes) setCodes(r.recoveryCodes);
          }}
        >
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={setup.qr}
              alt="QR code to add CarbonPass to your authenticator app"
              width={184}
              height={184}
              className="rounded-xl border border-line bg-white p-2"
            />
            <div className="space-y-3 text-[14px] leading-[1.65] text-ink-2">
              <p>1. In your authenticator app, add an account and scan this code.</p>
              <p>
                Cannot scan? Enter this key instead:
                <br />
                <code className="break-all text-[13px] text-ink">
                  {setup.secret.replace(/(.{4})/g, "$1 ").trim()}
                </code>
              </p>
              <p>2. Type the six-digit code the app shows.</p>
            </div>
          </div>
          <Field label="Code from the app">
            <Input
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="max-w-[200px]"
            />
          </Field>
          <FormError>{error}</FormError>
          <div className="flex gap-3">
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? "Checking…" : "Turn on"}
            </Button>
            <Button variant="ghost" onClick={() => setSetup(null)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : status.enabled ? (
        <div className="space-y-4">
          <p className="text-[14px] text-ink-2">
            On since {status.enabledAt?.slice(0, 10)}. {status.recoveryCodesLeft} recovery code
            {status.recoveryCodesLeft === 1 ? "" : "s"} left.
          </p>
          {status.recoveryCodesLeft <= 3 ? (
            <Note tone="warning">You are running out of recovery codes. Make a new set below.</Note>
          ) : null}
          {mode === "idle" ? (
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => setMode("renew")}>New recovery codes</Button>
              <Button variant="danger" onClick={() => setMode("disable")}>
                Turn off
              </Button>
            </div>
          ) : (
            <form
              className="space-y-3"
              onSubmit={async (e) => {
                e.preventDefault();
                if (mode === "disable") {
                  if (await act("disable", { code })) router.refresh();
                } else {
                  const r = await act("recovery-codes", { code });
                  if (r?.recoveryCodes) setCodes(r.recoveryCodes);
                }
                setCode("");
              }}
            >
              <Field
                label={
                  mode === "disable" ? "Code from the app, or a recovery code" : "Code from the app"
                }
              >
                <Input
                  required
                  autoComplete="one-time-code"
                  maxLength={20}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="max-w-[240px]"
                />
              </Field>
              <FormError>{error}</FormError>
              <div className="flex gap-3">
                <Button
                  type="submit"
                  variant={mode === "disable" ? "danger" : "primary"}
                  disabled={pending}
                >
                  {mode === "disable" ? "Turn off two-factor" : "Make new codes"}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setMode("idle");
                    setError(null);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-[14px] leading-[1.65] text-ink-2">
            Recommended for every account, and especially for owners: a declaration&apos;s data is
            only as safe as the weakest password that can change it.
          </p>
          {!secretsSealed ? (
            <p className="text-[12.5px] text-muted">
              This installation stores two-factor secrets without an encryption key
              (CARBONPASS_ENCRYPTION_KEY). Ask whoever runs it to set one.
            </p>
          ) : null}
          <FormError>{error}</FormError>
          <Button
            variant="primary"
            disabled={pending}
            onClick={async () => {
              const r = await act("begin");
              if (r?.secret && r.qr) {
                setSetup({ secret: r.secret, qr: r.qr });
                setCode("");
              }
            }}
          >
            {pending ? "Preparing…" : "Set up two-factor sign-in"}
          </Button>
        </div>
      )}
    </Card>
  );
}

function PasswordCard() {
  const { send, pending, error, setError } = useRequest();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [done, setDone] = useState(false);
  return (
    <Card title="Password" subtitle="Changing it signs you out on every other device.">
      <form
        className="grid max-w-[520px] gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setDone(false);
          if (next !== again) return setError("The two new passwords are different.");
          if (await send("/api/account/password", { json: { current, next } })) {
            setDone(true);
            setCurrent("");
            setNext("");
            setAgain("");
          }
        }}
      >
        <Field label="Current password">
          <Input
            type="password"
            autoComplete="current-password"
            required
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </Field>
        <Field label="New password" hint="At least 10 characters.">
          <Input
            type="password"
            autoComplete="new-password"
            required
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
        </Field>
        <Field label="New password, again">
          <Input
            type="password"
            autoComplete="new-password"
            required
            value={again}
            onChange={(e) => setAgain(e.target.value)}
          />
        </Field>
        <FormError>{error}</FormError>
        {done ? (
          <Note tone="good">Password changed. Other devices have been signed out.</Note>
        ) : null}
        <div>
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Saving…" : "Change password"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function describeAgent(ua: string | null): string {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Chrome\//.test(ua)
      ? "Chrome"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Safari\//.test(ua)
          ? "Safari"
          : "Browser";
  const os = /iPhone|iPad/.test(ua)
    ? "iPhone or iPad"
    : /Android/.test(ua)
      ? "Android"
      : /Windows/.test(ua)
        ? "Windows"
        : /Mac OS X/.test(ua)
          ? "Mac"
          : /Linux/.test(ua)
            ? "Linux"
            : "unknown system";
  return `${browser} on ${os}`;
}

function SessionsCard({ sessions }: { sessions: SessionInfo[] }) {
  const router = useRouter();
  const { send, pending, error } = useRequest();
  const others = sessions.filter((s) => !s.current).length;
  return (
    <Card title="Where you are signed in" subtitle="Sessions last 30 days unless you sign out.">
      <ul className="divide-y divide-line">
        {sessions.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div>
              <div className="text-[14px] font-medium text-ink">{describeAgent(s.userAgent)}</div>
              <div className="text-[12.5px] text-muted">
                Signed in {s.createdAt.slice(0, 10)} · until {s.expiresAt.slice(0, 10)}
              </div>
            </div>
            {s.current ? <Badge tone="accent">This device</Badge> : null}
          </li>
        ))}
      </ul>
      <FormError>{error}</FormError>
      {others > 0 ? (
        <div className="mt-4">
          <Button
            disabled={pending}
            onClick={async () => {
              if (await send("/api/account/sessions", { method: "DELETE" })) router.refresh();
            }}
          >
            {pending
              ? "Signing out…"
              : `Sign out the other ${others === 1 ? "device" : `${others} devices`}`}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
