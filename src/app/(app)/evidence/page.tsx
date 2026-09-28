import { workspaceContext } from "@/lib/auth/context";
import { EVIDENCE_CATEGORIES, listFiles } from "@/lib/files";
import { Page, PageHeader } from "@/components/ui";
import { EvidenceManager } from "./evidence-manager";

export default async function EvidencePage() {
  const ctx = await workspaceContext();
  const [evidence, sources] = await Promise.all([
    listFiles(ctx.db, ctx.workspace.id, "evidence"),
    listFiles(ctx.db, ctx.workspace.id, "source"),
  ]);
  const suppliers = [
    ...new Set(
      ctx.workspace.state.datasets
        .flatMap((d) => d.activities)
        .flatMap((a) => (a.kind === "precursor" && a.supplierName ? [a.supplierName] : [])),
    ),
  ].sort();

  return (
    <>
      <PageHeader
        eyebrow="Supporting"
        title="Evidence"
        description={
          <>
            The documents behind the numbers: supplier communications and verification reports,
            DISCOM bills, fuel lab analyses, carbon-price receipts. Every file is checksummed and
            goes into the verifier pack.
          </>
        }
      />
      <Page>
        <EvidenceManager
          canWrite={ctx.canWrite}
          evidence={evidence}
          sources={sources}
          categories={Object.entries(EVIDENCE_CATEGORIES).map(([id, label]) => ({ id, label }))}
          suppliers={suppliers}
        />
      </Page>
    </>
  );
}
