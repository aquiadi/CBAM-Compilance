import Link from "next/link";
import { redirect } from "next/navigation";
import { ResetForm } from "@/components/auth-forms";
import { Card, Note } from "@/components/ui";
import { optionalUser } from "@/lib/auth/context";
import { findReset } from "@/lib/auth/reset";

export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const session = await optionalUser();
  if (!session) redirect("/setup");
  const reset = await findReset(session.db, token);
  if (!reset) {
    return (
      <Card title="This link no longer works">
        <Note tone="warning">
          Reset links work once and expire. Ask for a new one from{" "}
          <Link href="/forgot" className="text-accent underline underline-offset-2">
            Forgot password
          </Link>
          , or ask an owner of your organisation.
        </Note>
      </Card>
    );
  }
  return (
    <Card
      title="Choose a new password"
      subtitle={`For ${reset.email}. You will be signed out on every other device.`}
    >
      <ResetForm token={token} />
    </Card>
  );
}
