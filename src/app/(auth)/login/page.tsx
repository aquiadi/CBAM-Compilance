import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth-forms";
import { Card } from "@/components/ui";
import { env } from "@/config/env";
import { optionalUser } from "@/lib/auth/context";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const session = await optionalUser();
  if (!session) redirect("/setup");
  if (session.user) redirect("/");
  const { next } = await searchParams;
  return (
    <Card title="Sign in">
      <LoginForm next={next} />
      {env.CARBONPASS_SIGNUP === "open" ? (
        <p className="mt-4 text-center text-[12px] text-muted">
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
