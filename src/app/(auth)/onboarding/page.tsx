import { redirect } from "next/navigation";
import { NewWorkspace } from "@/components/new-workspace";
import { Card } from "@/components/ui";
import { membershipsFor } from "@/lib/auth/accounts";
import { optionalUser } from "@/lib/auth/context";
import { listWorkspaces } from "@/lib/workspace/store";

export default async function OnboardingPage() {
  const session = await optionalUser();
  if (!session) redirect("/setup");
  if (!session.user) redirect("/login");
  const memberships = await membershipsFor(session.db, session.user.id);
  const first = memberships[0];
  if (first && (await listWorkspaces(session.db, first.orgId)).length > 0) redirect("/overview");
  if (first && first.role !== "owner" && first.role !== "editor") {
    return (
      <Card title="Nothing here yet">
        <p className="text-[14px] leading-[1.6] text-ink-2">
          {first.orgName} has no workspaces yet, and your role can view but not create them. Ask an
          owner or editor to set one up.
        </p>
      </Card>
    );
  }
  return (
    <Card
      title={`Welcome, ${session.user.name.split(" ")[0]}`}
      subtitle="Start with the demo, or set up your own installation."
    >
      <NewWorkspace needsOrganisation={memberships.length === 0} />
    </Card>
  );
}
