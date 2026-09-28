"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, CopyLink, Field, FormError, Input, Select, useRequest } from "@/components/forms";
import { Card, Table, Td, Th } from "@/components/ui";

export function TeamManager({
  isOwner,
  currentUserId,
  members,
  invitations,
  roles,
}: {
  isOwner: boolean;
  currentUserId: string;
  members: { userId: string; email: string; name: string; role: string; since: string }[];
  invitations: { id: string; email: string; role: string; expiresAt: string }[];
  roles: { id: string; label: string; description: string }[];
}) {
  const router = useRouter();
  const { send, pending, error } = useRequest();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("editor");
  const [link, setLink] = useState<string | null>(null);

  async function invite() {
    const r = await send<{ link: string }>("/api/team/invitations", { json: { email, role } });
    if (r) {
      setLink(r.link);
      setEmail("");
      router.refresh();
    }
  }

  return (
    <div className="space-y-8">
      <Card title="Members" padded={false}>
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>E-mail</Th>
              <Th>Role</Th>
              <Th>Since</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.userId} className="hover:bg-surface-2">
                <Td className="text-ink">{m.name}</Td>
                <Td>{m.email}</Td>
                <Td>
                  {isOwner ? (
                    <Select
                      value={m.role}
                      disabled={pending}
                      onChange={async (e) => {
                        if (
                          await send(`/api/team/members/${m.userId}`, {
                            method: "PATCH",
                            json: { role: e.target.value },
                          })
                        )
                          router.refresh();
                      }}
                      className="w-36 py-1 text-[13px]"
                    >
                      {roles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.label}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    roles.find((r) => r.id === m.role)?.label
                  )}
                </Td>
                <Td className="text-[12.5px]">{m.since.slice(0, 10)}</Td>
                <Td align="right">
                  {isOwner || m.userId === currentUserId ? (
                    <Button
                      variant="ghost"
                      disabled={pending}
                      onClick={async () => {
                        const leaving = m.userId === currentUserId;
                        if (!confirm(leaving ? "Leave this organisation?" : `Remove ${m.email}?`))
                          return;
                        if (await send(`/api/team/members/${m.userId}`, { method: "DELETE" })) {
                          router.push(leaving ? "/onboarding" : "/settings/team");
                          router.refresh();
                        }
                      }}
                    >
                      {m.userId === currentUserId ? "Leave" : "Remove"}
                    </Button>
                  ) : null}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      {isOwner ? (
        <Card
          title="Invite someone"
          subtitle="An invitation link is created for you to send; it is valid for 14 days and only for that e-mail address."
        >
          <div className="grid grid-cols-3 items-end gap-3">
            <Field label="E-mail">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Role" hint={roles.find((r) => r.id === role)?.description}>
              <Select value={role} onChange={(e) => setRole(e.target.value)}>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="pb-5">
              <Button variant="primary" onClick={invite} disabled={pending || !email}>
                Create invitation
              </Button>
            </div>
          </div>
          {link ? (
            <div className="mt-3">
              <CopyLink
                link={link}
                note="Send this link to the person you invited. It is shown only once."
              />
            </div>
          ) : null}
          {invitations.length > 0 ? (
            <div className="mt-4">
              <div className="mb-1.5 text-[12px] font-medium uppercase tracking-[0.12em] text-muted">
                Pending
              </div>
              <ul className="space-y-1.5">
                {invitations.map((inv) => (
                  <li
                    key={inv.id}
                    className="flex items-center justify-between text-[13.5px] text-ink-2"
                  >
                    <span>
                      {inv.email} · {roles.find((r) => r.id === inv.role)?.label} · expires{" "}
                      {inv.expiresAt.slice(0, 10)}
                    </span>
                    <Button
                      variant="ghost"
                      onClick={async () => {
                        if (await send(`/api/team/invitations/${inv.id}`, { method: "DELETE" }))
                          router.refresh();
                      }}
                    >
                      Revoke
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Card>
      ) : null}
      <FormError>{error}</FormError>
    </div>
  );
}
