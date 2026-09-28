"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Button,
  CopyLink,
  Field,
  FormError,
  Input,
  Textarea,
  useRequest,
} from "@/components/forms";
import { Badge, Card, Empty, fmt, Table, Td, Th } from "@/components/ui";
import type { SupplierRequest } from "@/lib/suppliers";
import type { SupplierData } from "@/lib/workspace/types";

const STATUS_TONE = {
  open: "neutral",
  submitted: "warning",
  accepted: "good",
  rejected: "critical",
  revoked: "neutral",
} as const;

export function SupplierManager({
  canWrite,
  seen,
  requests,
  accepted,
}: {
  canWrite: boolean;
  seen: {
    supplierName: string;
    cnCode: string;
    description: string;
    tonnes: number;
    basis: string[];
  }[];
  requests: SupplierRequest[];
  accepted: SupplierData[];
}) {
  const router = useRouter();
  const { send, pending, error } = useRequest();
  const [form, setForm] = useState({
    supplierName: "",
    supplierEmail: "",
    cnCode: "",
    message: "",
  });
  const [link, setLink] = useState<string | null>(null);
  const [emailedTo, setEmailedTo] = useState<string | null>(null);

  async function create() {
    const r = await send<{ link: string; emailed: boolean }>("/api/suppliers/requests", {
      json: form,
    });
    if (r) {
      setLink(r.link);
      setEmailedTo(r.emailed ? form.supplierEmail : null);
      router.refresh();
    }
  }

  async function decide(id: string, decision: "accept" | "reject" | "revoke") {
    if (await send(`/api/suppliers/requests/${id}`, { json: { decision } })) router.refresh();
  }

  return (
    <div className="space-y-8">
      <Card
        title="Suppliers in your data"
        subtitle="From confirmed precursor datasets."
        padded={false}
      >
        {seen.length === 0 ? (
          <div className="p-5">
            <Empty>No precursor receipts yet.</Empty>
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Supplier</Th>
                <Th>Good</Th>
                <Th align="right">Tonnes</Th>
                <Th>Values used</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {seen.map((s) => (
                <tr key={`${s.supplierName}|${s.cnCode}`} className="hover:bg-surface-2">
                  <Td className="text-ink">
                    {s.supplierName || <span className="text-muted">unnamed</span>}
                  </Td>
                  <Td className="text-[12.5px]">
                    <span className="font-mono">{s.cnCode}</span> {s.description.slice(0, 60)}
                  </Td>
                  <Td align="right" numeric>
                    {fmt(s.tonnes)}
                  </Td>
                  <Td>
                    {s.basis.map((b) => (
                      <Badge
                        key={b}
                        tone={
                          b.startsWith("verified")
                            ? "good"
                            : b.startsWith("unverified")
                              ? "warning"
                              : b === "Commission default"
                                ? "serious"
                                : "critical"
                        }
                      >
                        {b}
                      </Badge>
                    ))}
                  </Td>
                  <Td align="right">
                    {canWrite && s.supplierName ? (
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setForm({ ...form, supplierName: s.supplierName, cnCode: s.cnCode });
                          setLink(null);
                          document
                            .getElementById("request")
                            ?.scrollIntoView({ behavior: "smooth" });
                        }}
                      >
                        Request data
                      </Button>
                    ) : null}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {canWrite ? (
        <div id="request">
          <Card
            title="Request data from a supplier"
            subtitle="Creates a link to send to the supplier. Accepted values apply to every delivery of that good from that supplier in this workspace."
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Field label="Supplier name" hint="Exactly as it appears in your receipts file.">
                <Input
                  value={form.supplierName}
                  onChange={(e) => setForm({ ...form, supplierName: e.target.value })}
                />
              </Field>
              <Field label="Supplier e-mail (optional)">
                <Input
                  type="email"
                  value={form.supplierEmail}
                  onChange={(e) => setForm({ ...form, supplierEmail: e.target.value })}
                />
              </Field>
              <Field label="CN code">
                <Input
                  value={form.cnCode}
                  onChange={(e) => setForm({ ...form, cnCode: e.target.value })}
                  placeholder="e.g. 7203 10 00"
                />
              </Field>
              <Field label="Message to the supplier (optional)" className="md:col-span-3">
                <Textarea
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                />
              </Field>
            </div>
            <div className="mt-3">
              <Button
                variant="primary"
                onClick={create}
                disabled={pending || !form.supplierName || !form.cnCode}
              >
                Create request link
              </Button>
            </div>
            {link ? (
              <div className="mt-3">
                <CopyLink
                  link={link}
                  note={
                    emailedTo
                      ? `Request e-mailed to ${emailedTo}. The link is also here to send another way; it is shown only once and is valid for 60 days.`
                      : "Send this link to the supplier. It is shown only once and is valid for 60 days."
                  }
                />
              </div>
            ) : null}
          </Card>
        </div>
      ) : null}

      <Card title="Requests" subtitle={`${requests.length} sent`} padded={false}>
        {requests.length === 0 ? (
          <div className="p-5">
            <Empty>No requests yet.</Empty>
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Supplier</Th>
                <Th>CN</Th>
                <Th>Status</Th>
                <Th>Submission</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id} className="align-top hover:bg-surface-2">
                  <Td className="text-ink">
                    {r.supplierName}
                    <div className="text-[12px] text-muted">
                      sent {r.createdAt.slice(0, 10)}
                      {r.supplierEmail ? ` · ${r.supplierEmail}` : ""}
                    </div>
                  </Td>
                  <Td className="font-mono text-[12.5px]">{r.cnCode}</Td>
                  <Td>
                    <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge>
                  </Td>
                  <Td className="text-[12.5px]">
                    {r.submission ? (
                      <>
                        SEE {r.submission.seeDirect} direct / {r.submission.seeIndirect} indirect
                        {r.submission.sefa !== undefined
                          ? ` · SEFA ${r.submission.sefa}`
                          : ""} ·{" "}
                        {r.submission.verified
                          ? `verified by ${r.submission.verifierName}`
                          : "not verified"}
                        <div className="text-[12px] text-muted">
                          {r.submission.installationName}, {r.submission.country} ·{" "}
                          {r.submission.reportingYear} · {r.submission.contactName} &lt;
                          {r.submission.contactEmail}&gt;
                        </div>
                        {r.submission.notes ? (
                          <div className="text-[12px] text-muted">
                            &quot;{r.submission.notes}&quot;
                          </div>
                        ) : null}
                        {r.fileId ? (
                          <a
                            href={`/api/files/${r.fileId}`}
                            className="text-[12px] text-accent hover:underline"
                          >
                            Attached document
                          </a>
                        ) : null}
                      </>
                    ) : (
                      <span className="text-muted">-</span>
                    )}
                  </Td>
                  <Td align="right">
                    {canWrite ? (
                      <div className="flex justify-end gap-1">
                        {r.status === "submitted" ? (
                          <>
                            <Button
                              variant="primary"
                              disabled={pending}
                              onClick={() => decide(r.id, "accept")}
                            >
                              Accept
                            </Button>
                            <Button
                              variant="danger"
                              disabled={pending}
                              onClick={() => decide(r.id, "reject")}
                            >
                              Reject
                            </Button>
                          </>
                        ) : null}
                        {r.status === "open" ? (
                          <Button
                            variant="ghost"
                            disabled={pending}
                            onClick={() => decide(r.id, "revoke")}
                          >
                            Revoke
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card
        title="Accepted supplier values"
        subtitle="Applied to precursor rows from that supplier that carry no values of their own."
        padded={false}
      >
        {accepted.length === 0 ? (
          <div className="p-5">
            <Empty>None yet.</Empty>
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Supplier</Th>
                <Th>CN</Th>
                <Th align="right">SEE direct</Th>
                <Th align="right">SEE indirect</Th>
                <Th align="right">SEFA</Th>
                <Th>Verified</Th>
                <Th>Accepted</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {accepted.map((a) => (
                <tr key={a.id}>
                  <Td className="text-ink">{a.supplierName}</Td>
                  <Td className="font-mono text-[12.5px]">{a.cnCode}</Td>
                  <Td align="right" numeric>
                    {a.seeDirect}
                  </Td>
                  <Td align="right" numeric>
                    {a.seeIndirect}
                  </Td>
                  <Td align="right" numeric>
                    {a.sefa ?? "-"}
                  </Td>
                  <Td>
                    {a.verified ? (
                      <Badge tone="good">verified</Badge>
                    ) : (
                      <Badge tone="warning">not verified</Badge>
                    )}
                  </Td>
                  <Td className="text-[12.5px]">
                    {a.acceptedAt.slice(0, 10)} · {a.acceptedBy}
                  </Td>
                  <Td align="right">
                    {canWrite ? (
                      <Button
                        variant="ghost"
                        disabled={pending}
                        onClick={async () => {
                          if (
                            !confirm(
                              "Stop applying these values? Deliveries fall back to the default value.",
                            )
                          )
                            return;
                          if (await send(`/api/suppliers/data/${a.id}`, { method: "DELETE" }))
                            router.refresh();
                        }}
                      >
                        Remove
                      </Button>
                    ) : null}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <FormError>{error}</FormError>
    </div>
  );
}
