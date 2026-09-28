import Link from "next/link";
import { redirect } from "next/navigation";
import { SignupForm } from "@/components/auth-forms";
import { Card, Note } from "@/components/ui";
import { env } from "@/config/env";
import { optionalUser } from "@/lib/auth/context";

export default async function SignupPage() {
  const session = await optionalUser();
  if (!session) redirect("/setup");
  if (session.user) redirect("/overview");
  if (env.CARBONPASS_SIGNUP !== "open") {
    return (
      <Card title="Sign-up is by invitation">
        <Note>
          Ask an owner of your organisation for an invitation link.{" "}
          <Link href="/login" className="text-accent hover:underline">
            Sign in
          </Link>{" "}
          if you already have an account.
        </Note>
      </Card>
    );
  }
  return (
    <Card
      title="Create your account"
      subtitle="One account per person; your organisation holds the data."
    >
      <SignupForm />
      <p className="mt-4 text-center text-[12.5px] leading-[1.6] text-muted">
        By creating an account you accept the{" "}
        <Link href="/terms" className="text-accent hover:underline">
          terms
        </Link>{" "}
        and the{" "}
        <Link href="/privacy" className="text-accent hover:underline">
          privacy notice
        </Link>
        .
      </p>
    </Card>
  );
}
