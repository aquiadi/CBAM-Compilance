"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Field, FormError, Input, useRequest } from "./forms";

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const { send, pending, error } = useRequest();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await send("/api/auth/login", { json: { email, password } })) {
          router.push(next && next.startsWith("/") && next !== "/" ? next : "/overview");
          router.refresh();
        }
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
        if (await send("/api/auth/reset", { json: { token, password } })) {
          router.push("/overview");
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
