import { orgMembers, pendingInvitations, ROLES } from "@/lib/auth/accounts";
import { pageContext } from "@/lib/auth/context";
import { Page, PageHeader } from "@/components/ui";
import { TeamManager } from "./team-manager";

export default async function TeamPage() {
  const ctx = await pageContext();
  const [members, invitations] = await Promise.all([
    orgMembers(ctx.db, ctx.org.id),
    ctx.role === "owner" ? pendingInvitations(ctx.db, ctx.org.id) : Promise.resolve([]),
  ]);
  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Team"
        description={
          <>
            Who can see and change {ctx.org.name}&apos;s workspaces. Give your accredited verifier
            the Verifier role: read-only access to every figure, source file and the verifier pack.
          </>
        }
      />
      <Page>
        <TeamManager
          isOwner={ctx.role === "owner"}
          currentUserId={ctx.user.id}
          members={members}
          invitations={invitations}
          roles={Object.entries(ROLES).map(([id, r]) => ({ id, ...r }))}
        />
      </Page>
    </>
  );
}
