import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth-forms";
import { Card } from "@/components/ui";
import { env } from "@/config/env";
import { optionalUser } from "@/lib/auth/context";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reset?: string }>;
}) {
  const session = await optionalUser();
  if (!session) redirect("/setup");
  if (session.user) redirect("/overview");
  const { next, reset } = await searchParams;
  return (
    <Card title="Sign in">
      {reset ? (
        <p className="mb-4 rounded-xl border border-good/20 bg-good/[0.05] px-4 py-3 text-[13.5px] text-ink-2">
          Your password has been changed. Sign in with it and your two-factor code.
        </p>
      ) : null}
      <LoginForm next={next} />
      {env.CARBONPASS_SIGNUP === "open" ? (
        <p className="mt-4 text-center text-[13.5px] text-muted">
          New here?{" "}
          <Link href="/signup" className="text-accent hover:underline">
            Create an account
          </Link>{" "}
          - you can explore a fully worked demo plant straight away.
        </p>
      ) : null}
    </Card>
  );
}
