import Link from "next/link";
import { redirect } from "next/navigation";
import { ForgotForm } from "@/components/auth-forms";
import { Card } from "@/components/ui";
import { optionalUser } from "@/lib/auth/context";
import { mailConfigured } from "@/lib/mail";

export default async function ForgotPage() {
  const session = await optionalUser();
  if (!session) redirect("/setup");
  if (session.user) redirect("/overview");
  if (!mailConfigured()) {
    return (
      <Card title="Reset your password">
        <p className="text-[14.5px] leading-[1.65] text-ink-2">
          This installation does not send e-mail. Ask an <span className="text-ink">owner</span> of
          your organisation to create a reset link for you under Settings → Team. The link works
          once, within a day.
        </p>
        <p className="mt-5 text-center text-[13.5px] text-muted">
          Remembered it?{" "}
          <Link href="/login" className="text-accent hover:underline">
            Sign in
          </Link>
        </p>
      </Card>
    );
  }
  return (
    <Card title="Reset your password" subtitle="We will send a link to choose a new one.">
      <ForgotForm />
      <p className="mt-5 text-center text-[13.5px] text-muted">
        Remembered it?{" "}
        <Link href="/login" className="text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </Card>
  );
}
