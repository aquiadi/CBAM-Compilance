"use client";

import { useRouter } from "next/navigation";
import { Button, FormError, useRequest } from "@/components/forms";
import { Badge, Card, Table, Td, Th } from "@/components/ui";

export function WorkspaceList({
  workspaces,
  currentId,
  canWrite,
  isOwner,
}: {
  workspaces: { id: string; name: string; updatedAt: string; installation: string; year: number }[];
  currentId: string | null;
  canWrite: boolean;
  isOwner: boolean;
}) {
  const router = useRouter();
  const { send, pending, error } = useRequest();

  return (
    <Card title="Your workspaces" padded={false}>
      <Table>
        <thead>
          <tr>
            <Th>Name</Th>
            <Th>Installation</Th>
            <Th align="right">Year</Th>
            <Th>Last change</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {workspaces.map((w) => (
            <tr key={w.id} className="hover:bg-surface-2">
              <Td className="text-ink">
                {w.name} {w.id === currentId ? <Badge tone="accent">current</Badge> : null}
              </Td>
              <Td>{w.installation}</Td>
              <Td align="right" numeric>
                {w.year}
              </Td>
              <Td className="text-[11px]">{w.updatedAt.replace("T", " ").slice(0, 16)}</Td>
              <Td align="right">
                <div className="flex justify-end gap-1">
                  {w.id !== currentId ? (
                    <Button
                      variant="ghost"
                      disabled={pending}
                      onClick={async () => {
                        if (await send("/api/workspaces/select", { json: { workspaceId: w.id } })) {
                          router.push("/");
                          router.refresh();
                        }
                      }}
                    >
                      Open
                    </Button>
                  ) : null}
                  {canWrite ? (
                    <Button
                      variant="ghost"
                      disabled={pending}
                      onClick={async () => {
                        const name = prompt("New name", w.name);
                        if (
                          name &&
                          (await send(`/api/workspaces/${w.id}`, {
                            method: "PATCH",
                            json: { name },
                          }))
                        )
                          router.refresh();
                      }}
                    >
                      Rename
                    </Button>
                  ) : null}
                  {isOwner ? (
                    <Button
                      variant="ghost"
                      disabled={pending}
                      onClick={async () => {
                        if (
                          !confirm(
                            `Delete "${w.name}" with all its data, files and evidence? This cannot be undone.`,
                          )
                        )
                          return;
                        if (await send(`/api/workspaces/${w.id}`, { method: "DELETE" }))
                          router.refresh();
                      }}
                    >
                      Delete
                    </Button>
                  ) : null}
                </div>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
      {error ? (
        <div className="p-3">
          <FormError>{error}</FormError>
        </div>
      ) : null}
    </Card>
  );
}
