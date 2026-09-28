"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, CopyLink, Field, FormError, Input, Select, useRequest } from "@/components/forms";
import { Badge, Card, Table, Td, Th } from "@/components/ui";

export function TeamManager({
  isOwner,
  currentUserId,
  members,
  invitations,
  roles,
}: {
  isOwner: boolean;
  currentUserId: string;
  members: {
    userId: string;
    email: string;
    name: string;
    role: string;
    since: string;
    twoFactor: boolean;
  }[];
  invitations: { id: string; email: string; role: string; expiresAt: string }[];
  roles: { id: string; label: string; description: string }[];
}) {
  const router = useRouter();
  const { send, pending, error } = useRequest();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("editor");
  const [link, setLink] = useState<{ url: string; emailedTo: string | null } | null>(null);
  const [resetLink, setResetLink] = useState<{
    email: string;
    url: string;
    emailed: boolean;
  } | null>(null);

  async function invite() {
    const r = await send<{ link: string; emailed: boolean }>("/api/team/invitations", {
      json: { email, role },
    });
    if (r) {
      setLink({ url: r.link, emailedTo: r.emailed ? email : null });
      setEmail("");
      router.refresh();
    }
  }

  async function issueReset(member: { userId: string; email: string }) {
    const r = await send<{ link: string; emailed: boolean }>(
      `/api/team/members/${member.userId}/reset`,
      { method: "POST" },
    );
    if (r) setResetLink({ email: member.email, url: r.link, emailed: r.emailed });
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
              <Th>Sign-in</Th>
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
                <Td>
                  <Badge tone={m.twoFactor ? "good" : "neutral"}>
                    {m.twoFactor ? "Two-factor on" : "Password only"}
                  </Badge>
                </Td>
                <Td align="right">
                  {isOwner && m.userId !== currentUserId && m.twoFactor ? (
                    <Button
                      variant="ghost"
                      disabled={pending}
                      title="For someone who has lost their phone and recovery codes"
                      onClick={async () => {
                        if (
                          !confirm(
                            `Turn off two-factor sign-in for ${m.email}? They will be signed out and can set it up again. This is recorded in the activity log.`,
                          )
                        )
                          return;
                        if (
                          await send(`/api/team/members/${m.userId}/two-factor`, {
                            method: "DELETE",
                          })
                        )
                          router.refresh();
                      }}
                    >
                      Reset two-factor
                    </Button>
                  ) : null}
                  {isOwner && m.userId !== currentUserId ? (
                    <Button
                      variant="ghost"
                      disabled={pending}
                      title="Create a one-time link for this person to choose a new password"
                      onClick={() => issueReset(m)}
                    >
                      Reset link
                    </Button>
                  ) : null}
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
        {resetLink ? (
          <div className="px-5 pb-6 pt-4 md:px-7">
            <CopyLink
              link={resetLink.url}
              note={
                resetLink.emailed
                  ? `Also e-mailed to ${resetLink.email}. It works once, within 24 hours.`
                  : `Send this to ${resetLink.email} yourself. It works once, within 24 hours, and signs them out everywhere else.`
              }
            />
          </div>
        ) : null}
      </Card>

      {isOwner ? (
        <Card
          title="Invite someone"
          subtitle="The invitation is valid for 14 days and only for that e-mail address. It is e-mailed when this installation has mail set up; you also get the link to send yourself."
        >
          <div className="grid grid-cols-1 md:grid-cols-3 items-end gap-3">
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
                link={link.url}
                note={
                  link.emailedTo
                    ? `Invitation e-mailed to ${link.emailedTo}. The link is also here if you want to send it another way; it is shown only once.`
                    : "Send this link to the person you invited. It is shown only once."
                }
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
