import Link from "next/link";
import { redirect } from "next/navigation";
import { AcceptInvitation, SignupForm } from "@/components/auth-forms";
import { Card, Note } from "@/components/ui";
import { hasExpired } from "@/lib/time";
import { findInvitation, findUserByEmail, ROLES } from "@/lib/auth/accounts";
import { optionalUser } from "@/lib/auth/context";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const session = await optionalUser();
  if (!session) redirect("/setup");
  const invitation = await findInvitation(session.db, token);

  if (!invitation || invitation.acceptedAt || hasExpired(invitation.expiresAt)) {
    return (
      <Card title="Invitation not valid">
        <Note tone="warning">
          This link has expired, has already been used, or was revoked. Ask the person who invited
          you for a new one.
        </Note>
      </Card>
    );
  }

  const role = ROLES[invitation.role];
  const header = (
    <p className="mb-4 text-[14px] leading-[1.6] text-ink-2">
      You have been invited to <span className="text-ink">{invitation.orgName}</span> as{" "}
      <span className="text-ink">{role.label}</span> - {role.description.toLowerCase()}
    </p>
  );

  if (session.user) {
    return (
      <Card title="Join organisation">
        {header}
        {session.user.email === invitation.email ? (
          <AcceptInvitation token={token} orgName={invitation.orgName} />
        ) : (
          <Note tone="warning">
            This invitation is for {invitation.email}, but you are signed in as {session.user.email}
            . Sign out and sign in with the invited address.
          </Note>
        )}
      </Card>
    );
  }

  const existing = await findUserByEmail(session.db, invitation.email);
  return (
    <Card title="Join organisation">
      {header}
      {existing ? (
        <Note>
          You already have an account.{" "}
          <Link href={`/login?next=/invite/${token}`} className="text-accent hover:underline">
            Sign in
          </Link>{" "}
          to accept.
        </Note>
      ) : (
        <SignupForm
          inviteToken={token}
          invitedEmail={invitation.email}
          orgName={invitation.orgName}
        />
      )}
    </Card>
  );
}
