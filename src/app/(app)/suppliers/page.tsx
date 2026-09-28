import { workspaceContext } from "@/lib/auth/context";
import { lookupGoods } from "@/lib/cbam/goods";
import { listSupplierRequests } from "@/lib/suppliers";
import { computeDeclaration } from "@/lib/workspace/declaration";
import { Page, PageHeader } from "@/components/ui";
import { SupplierManager } from "./supplier-manager";

export default async function SuppliersPage() {
  const ctx = await workspaceContext();
  const state = ctx.workspace.state;
  const [requests, d] = await Promise.all([
    listSupplierRequests(ctx.db, ctx.workspace.id),
    computeDeclaration(ctx.db, ctx.workspace),
  ]);
  const resolutions = Object.assign(
    {},
    ...d.emissions.map((e) => e.precursorResolutions),
  ) as Record<string, (typeof d.emissions)[number]["precursorResolutions"][string]>;

  // Suppliers as they appear in the confirmed data, with how their values resolve.
  const seen = new Map<
    string,
    {
      supplierName: string;
      cnCode: string;
      description: string;
      tonnes: number;
      basis: Set<string>;
    }
  >();
  for (const ds of state.datasets.filter((x) => x.status === "confirmed")) {
    for (const a of ds.activities) {
      if (a.kind !== "precursor") continue;
      const key = `${a.supplierName ?? ""}|${a.cnCode}`;
      const entry = seen.get(key) ?? {
        supplierName: a.supplierName ?? "",
        cnCode: a.cnCode,
        description: lookupGoods(a.cnCode)?.description ?? "",
        tonnes: 0,
        basis: new Set<string>(),
      };
      entry.tonnes += a.quantityT;
      const r = resolutions[a.id];
      if (r)
        entry.basis.add(
          r.status === "supplier"
            ? r.reference.includes("(verified)")
              ? "verified supplier values"
              : "unverified supplier values"
            : r.status === "default"
              ? "Commission default"
              : "no value",
        );
      seen.set(key, entry);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Supporting"
        title="Suppliers"
        description={
          <>
            Precursors without verified supplier data carry the Commission&apos;s default value plus
            a mark-up. Ask suppliers for their values through a link - no account needed - and
            review each submission before it is applied.
          </>
        }
      />
      <Page>
        <SupplierManager
          canWrite={ctx.canWrite}
          seen={[...seen.values()].map((s) => ({ ...s, basis: [...s.basis] }))}
          requests={requests}
          accepted={state.supplierData}
        />
      </Page>
    </>
  );
}
