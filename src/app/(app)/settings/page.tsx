import { workspaceContext } from "@/lib/auth/context";
import { CATEGORY_LABELS } from "@/lib/cbam/goods";
import { defaultValueCountries, ROUTE_INDICATORS } from "@/lib/cbam/regulatory";
import { Page, PageHeader } from "@/components/ui";
import { InstallationEditor } from "./installation-editor";

export default async function SettingsPage() {
  const ctx = await workspaceContext();
  const { installation, period } = ctx.workspace.state;
  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Installation"
        description={
          <>
            The installation the calculation runs on: its details for the communication, the
            reporting period, the production processes with the route that selects each CBAM
            benchmark, and which processes feed which. Saving rebuilds every dataset.
          </>
        }
      />
      <Page>
        <InstallationEditor
          canWrite={ctx.canWrite}
          initial={{ installation, period }}
          categories={Object.entries(CATEGORY_LABELS).map(([id, label]) => ({ id, label }))}
          routes={Object.entries(ROUTE_INDICATORS).map(([id, label]) => ({ id, label }))}
          countries={defaultValueCountries()}
        />
      </Page>
    </>
  );
}
