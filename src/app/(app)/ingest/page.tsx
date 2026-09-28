import Link from "next/link";
import { env } from "@/config/env";
import { isAiAvailable, MODEL } from "@/lib/ai/client";
import { workspaceContext } from "@/lib/auth/context";
import { DATASET_SCHEMAS } from "@/lib/ingest/schema";
import { Badge, Card, Empty, fmt, Note, Page, PageHeader, Table, Td, Th } from "@/components/ui";
import { UploadForm } from "./upload-form";

/**
 * Data: every file behind the declaration, and where new ones come in. An
 * upload becomes a draft with a proposed mapping; it counts only once someone
 * has reviewed and confirmed it.
 */
export default async function IngestPage() {
  const ctx = await workspaceContext();
  const state = ctx.workspace.state;
  const noProcesses = state.installation.processes.length === 0;

  return (
    <>
      <PageHeader
        eyebrow="Step 1"
        title="Data"
        description={
          <>
            Files straight out of the plant&apos;s systems - SAP or Tally consumption extracts,
            DISCOM bills, despatch registers, precursor receipts. Each column is mapped onto the
            engine&apos;s schema and every free-text value resolved against the engine&apos;s own
            tables; you review the mapping before a file counts.
          </>
        }
        actions={
          <Badge tone={isAiAvailable() ? "accent" : "neutral"}>
            {isAiAvailable() ? `${MODEL} available` : "Deterministic mapper"}
          </Badge>
        }
      />
      <Page>
        {noProcesses ? (
          <div className="mb-8">
            <Note tone="warning">
              Define the installation&apos;s production processes first -{" "}
              <Link href="/settings" className="text-accent underline underline-offset-2">
                Settings
              </Link>
              . Every row is attributed to a process, so without them nothing can be mapped.
            </Note>
          </div>
        ) : null}

        {ctx.canWrite ? (
          <Card
            tour="upload"
            title="Upload a file"
            subtitle="One dataset per file. Workbooks: the sheet and header row are detected and can be changed on review."
          >
            <UploadForm aiAvailable={isAiAvailable()} maxMb={env.CARBONPASS_MAX_UPLOAD_MB} />
          </Card>
        ) : null}

        <div className="mt-8">
          <Card
            tour="datasets"
            title="Files"
            subtitle={`${state.datasets.length} uploaded`}
            padded={false}
          >
            {state.datasets.length === 0 ? (
              <div className="p-5">
                <Empty>No files yet.</Empty>
              </div>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>File</Th>
                    <Th>Contains</Th>
                    <Th>Status</Th>
                    <Th align="right">Rows</Th>
                    <Th align="right">Records</Th>
                    <Th align="right">Not imported</Th>
                    <Th align="right">Out of scope</Th>
                    <Th>Mapped by</Th>
                    <Th>Uploaded</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {state.datasets.map((ds) => (
                    <tr key={ds.id} className="hover:bg-surface-2">
                      <Td className="font-mono text-[13px] text-ink">
                        {ds.fileName}
                        {ds.sheetName ? (
                          <span className="text-muted"> [{ds.sheetName}]</span>
                        ) : null}
                      </Td>
                      <Td>{DATASET_SCHEMAS[ds.mapping.kind].label}</Td>
                      <Td>
                        <Badge tone={ds.status === "confirmed" ? "good" : "warning"}>
                          {ds.status === "confirmed" ? "Confirmed" : "Draft - not counted"}
                        </Badge>
                      </Td>
                      <Td align="right" numeric>
                        {fmt(ds.rowCount)}
                      </Td>
                      <Td align="right" numeric>
                        {fmt(ds.activities.length)}
                      </Td>
                      <Td align="right" numeric>
                        {ds.rejected.length > 0 ? (
                          <span className="text-critical">{ds.rejected.length}</span>
                        ) : (
                          <span className="text-muted">-</span>
                        )}
                      </Td>
                      <Td align="right" numeric>
                        {ds.skipped.length > 0 ? (
                          ds.skipped.length
                        ) : (
                          <span className="text-muted">-</span>
                        )}
                      </Td>
                      <Td>
                        <Badge tone={ds.mapping.producedBy === "model" ? "accent" : "neutral"}>
                          {ds.mapping.producedBy === "model"
                            ? (ds.mapping.model ?? "AI model")
                            : "Rule-based"}
                        </Badge>
                      </Td>
                      <Td className="text-[12.5px]">
                        {ds.uploadedAt.slice(0, 10)}
                        <div className="text-[12px] text-muted">{ds.uploadedBy}</div>
                      </Td>
                      <Td align="right">
                        <Link
                          href={`/ingest/${ds.id}`}
                          className="text-[13px] text-accent hover:underline"
                        >
                          {ds.status === "draft" && ctx.canWrite ? "Review →" : "Open →"}
                        </Link>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </div>
      </Page>
    </>
  );
}
