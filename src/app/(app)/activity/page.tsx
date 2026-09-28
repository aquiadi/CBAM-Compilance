import { listAudit } from "@/lib/audit";
import { pageContext } from "@/lib/auth/context";
import { Card, Empty, Page, PageHeader, Table, Td, Th } from "@/components/ui";

function describe(detail: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(detail)) {
    if (v === undefined || v === null || k === "edits" || k === "before") continue;
    const text = Array.isArray(v)
      ? v.length > 4
        ? `${v.length} items`
        : v.join(", ")
      : typeof v === "object"
        ? JSON.stringify(v)
        : String(v);
    parts.push(`${k}: ${text}`);
  }
  return parts.join(" · ").slice(0, 400);
}

/** Every change, who made it and when - the answer to "who changed this, and why". */
export default async function ActivityPage() {
  const ctx = await pageContext();
  const events = await listAudit(ctx.db, {
    orgId: ctx.org.id,
    workspaceId: ctx.workspace?.id,
    limit: 500,
  });
  return (
    <>
      <PageHeader
        eyebrow="Supporting"
        title="Activity log"
        description="Append-only record of every change to this workspace and the team. It is exported with the verifier pack."
      />
      <Page>
        <Card padded={false}>
          {events.length === 0 ? (
            <div className="p-5">
              <Empty>Nothing recorded yet.</Empty>
            </div>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>When (UTC)</Th>
                  <Th>Who</Th>
                  <Th>Action</Th>
                  <Th>Detail</Th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id} className="align-top hover:bg-surface-2">
                    <Td className="tnum whitespace-nowrap text-[11px]">
                      {e.createdAt.replace("T", " ").slice(0, 19)}
                    </Td>
                    <Td className="text-[11.5px]">{e.actorLabel}</Td>
                    <Td className="font-mono text-[11px] text-ink">{e.action}</Td>
                    <Td className="text-[11px] text-muted">{describe(e.detail)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </Page>
    </>
  );
}
