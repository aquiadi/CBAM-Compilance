"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Field, FormError, Input, useRequest } from "./forms";

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const { send, pending, error, setError } = useRequest();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [needsCode, setNeedsCode] = useState(false);
  const [code, setCode] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);

  function done() {
    router.push(next && next.startsWith("/") && next !== "/" ? next : "/overview");
    router.refresh();
  }

  if (needsCode) {
    return (
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await send("/api/auth/login/verify", { json: { code } });
          if (r) done();
          else setCode("");
        }}
      >
        <p className="text-[14px] leading-[1.6] text-ink-2">
          {useRecovery
            ? "Enter one of the recovery codes you saved when you turned on two-factor sign-in. Each works once."
            : "Enter the six-digit code from your authenticator app."}
        </p>
        <Field label={useRecovery ? "Recovery code" : "Code"}>
          <Input
            autoFocus
            required
            inputMode={useRecovery ? "text" : "numeric"}
            autoComplete="one-time-code"
            maxLength={useRecovery ? 20 : 6}
            placeholder={useRecovery ? "xxxxx-xxxxx" : "123456"}
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </Field>
        <FormError>{error}</FormError>
        <Button type="submit" variant="primary" disabled={pending} className="w-full py-2">
          {pending ? "Checking…" : "Sign in"}
        </Button>
        <div className="flex justify-between text-[13px]">
          <button
            type="button"
            className="text-accent hover:underline"
            onClick={() => {
              setUseRecovery((r) => !r);
              setCode("");
              setError(null);
            }}
          >
            {useRecovery ? "Use the authenticator app" : "Use a recovery code"}
          </button>
          <button
            type="button"
            className="text-muted hover:text-ink"
            onClick={() => {
              setNeedsCode(false);
              setPassword("");
              setError(null);
            }}
          >
            Start again
          </button>
        </div>
      </form>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await send<{ twoFactor?: boolean }>("/api/auth/login", {
          json: { email, password },
        });
        if (r?.twoFactor) setNeedsCode(true);
        else if (r) done();
      }}
    >
      <Field label="E-mail">
        <Input
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>
      <Field label="Password">
        <Input
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
      <div className="-mt-1 text-right">
        <Link href="/forgot" className="text-[13px] text-accent hover:underline">
          Forgot password?
        </Link>
      </div>
      <FormError>{error}</FormError>
      <Button type="submit" variant="primary" disabled={pending} className="w-full py-2">
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}

export function ForgotForm() {
  const { send, pending, error } = useRequest();
  const [email, setEmail] = useState("");
  const [result, setResult] = useState<{ mailConfigured: boolean } | null>(null);

  if (result) {
    return result.mailConfigured ? (
      <p className="text-[14.5px] leading-[1.65] text-ink-2">
        If <span className="text-ink">{email}</span> has an account, a reset link is on its way. It
        works once, within an hour. Check your spam folder if it does not arrive in a few minutes.
      </p>
    ) : (
      <p className="text-[14.5px] leading-[1.65] text-ink-2">
        This installation does not send e-mail. Ask an <span className="text-ink">owner</span> of
        your organisation to create a reset link for you under Settings → Team; it works once,
        within a day.
      </p>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await send<{ mailConfigured: boolean }>("/api/auth/forgot", { json: { email } });
        if (r) setResult({ mailConfigured: r.mailConfigured });
      }}
    >
      <Field label="E-mail">
        <Input
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>
      <FormError>{error}</FormError>
      <Button type="submit" variant="primary" disabled={pending} className="w-full py-2">
        {pending ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}

export function ResetForm({ token }: { token: string }) {
  const router = useRouter();
  const { send, pending, error, setError } = useRequest();
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (password !== again) return setError("The two passwords are different.");
        const r = await send<{ signIn?: boolean }>("/api/auth/reset", {
          json: { token, password },
        });
        if (r) {
          router.push(r.signIn ? "/login?reset=1" : "/overview");
          router.refresh();
        }
      }}
    >
      <Field label="New password" hint="At least 10 characters.">
        <Input
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
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
      <Button type="submit" variant="primary" disabled={pending} className="w-full py-2">
        {pending ? "Saving…" : "Set password and sign in"}
      </Button>
    </form>
  );
}

export function SignupForm({
  inviteToken,
  invitedEmail,
  orgName,
}: {
  inviteToken?: string;
  invitedEmail?: string;
  orgName?: string;
}) {
  const router = useRouter();
  const { send, pending, error } = useRequest();
  const [form, setForm] = useState({
    name: "",
    email: invitedEmail ?? "",
    password: "",
    organisation: "",
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await send<{ next: string }>("/api/auth/signup", {
          json: { ...form, organisation: inviteToken ? undefined : form.organisation, inviteToken },
        });
        if (r) {
          router.push(r.next);
          router.refresh();
        }
      }}
    >
      <Field label="Your name">
        <Input autoComplete="name" required value={form.name} onChange={set("name")} />
      </Field>
      <Field label="Work e-mail">
        <Input
          type="email"
          autoComplete="email"
          required
          value={form.email}
          onChange={set("email")}
          readOnly={Boolean(invitedEmail)}
        />
      </Field>
      <Field label="Password" hint="At least 10 characters.">
        <Input
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
          value={form.password}
          onChange={set("password")}
        />
      </Field>
      {inviteToken ? (
        <p className="text-[13.5px] text-ink-2">
          You will join <span className="text-ink">{orgName}</span>.
        </p>
      ) : (
        <Field
          label="Organisation"
          hint="Your company - the exporter. You can invite colleagues later."
        >
          <Input required value={form.organisation} onChange={set("organisation")} />
        </Field>
      )}
      <FormError>{error}</FormError>
      <Button type="submit" variant="primary" disabled={pending} className="w-full py-2">
        {pending ? "Creating account…" : "Create account"}
      </Button>
      {!inviteToken ? (
        <p className="text-center text-[13.5px] text-muted">
          Already have an account?{" "}
          <Link href="/login" className="text-accent hover:underline">
            Sign in
          </Link>
        </p>
      ) : null}
    </form>
  );
}

export function AcceptInvitation({ token, orgName }: { token: string; orgName: string }) {
  const router = useRouter();
  const { send, pending, error } = useRequest();
  return (
    <div className="space-y-3">
      <FormError>{error}</FormError>
      <Button
        variant="primary"
        className="w-full py-2"
        disabled={pending}
        onClick={async () => {
          if (await send("/api/invitations/accept", { json: { token } })) {
            router.push("/overview");
            router.refresh();
          }
        }}
      >
        {pending ? "Joining…" : `Join ${orgName}`}
      </Button>
    </div>
  );
}
