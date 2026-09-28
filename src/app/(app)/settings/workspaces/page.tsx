import { pageContext } from "@/lib/auth/context";
import { NewWorkspace } from "@/components/new-workspace";
import { Card, Page, PageHeader } from "@/components/ui";
import { WorkspaceList } from "./workspace-list";

export default async function WorkspacesPage() {
  const ctx = await pageContext();
  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Workspaces"
        description="One workspace per installation and reporting year. Each has its own data, findings, evidence and exports."
      />
      <Page>
        <WorkspaceList
          workspaces={ctx.workspaces}
          currentId={ctx.workspace?.id ?? null}
          canWrite={ctx.canWrite}
          isOwner={ctx.role === "owner"}
        />
        {ctx.canWrite ? (
          <div className="mt-8" id="new">
            <Card title="New workspace">
              <NewWorkspace needsOrganisation={false} />
            </Card>
          </div>
        ) : null}
      </Page>
    </>
  );
}
