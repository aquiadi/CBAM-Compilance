"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Field, FormError, Input, useRequest } from "@/components/forms";
import { Card } from "@/components/ui";

/** Export everything, or delete everything. Owners only. */
export function OrganisationData({ orgName }: { orgName: string }) {
  const router = useRouter();
  const { send, pending, error } = useRequest();
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");

  return (
    <Card
      title="Your organisation's data"
      subtitle="Take all of it with you, or delete all of it. Both are recorded, and deletion cannot be undone."
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="max-w-[60ch] text-[14px] leading-[1.65] text-ink-2">
            One zip: every workspace as a verifier pack (all source files and evidence, with
            checksums), the members, and the full activity log.
          </p>
          <a href="/api/organisation/export" className="btn-secondary">
            Export everything
          </a>
        </div>
        <div className="border-t border-line pt-6">
          {!confirming ? (
            <Button variant="danger" onClick={() => setConfirming(true)}>
              Delete this organisation…
            </Button>
          ) : (
            <form
              className="space-y-4"
              onSubmit={async (e) => {
                e.preventDefault();
                if (
                  await send("/api/organisation", { method: "DELETE", json: { confirm: typed } })
                ) {
                  router.push("/onboarding");
                  router.refresh();
                }
              }}
            >
              <p className="max-w-[68ch] text-[14px] leading-[1.65] text-ink-2">
                This deletes every workspace, uploaded file, piece of evidence, supplier request,
                invitation and the activity log of <b>{orgName}</b>, for everyone in it. Export
                first if you may need any of it. Members keep their own accounts.
              </p>
              <Field label={`Type "${orgName}" to confirm`}>
                <Input
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  className="max-w-[360px]"
                />
              </Field>
              <FormError>{error}</FormError>
              <div className="flex gap-3">
                <Button
                  type="submit"
                  variant="danger"
                  disabled={pending || typed.trim() !== orgName.trim()}
                >
                  {pending ? "Deleting…" : "Delete permanently"}
                </Button>
                <Button variant="ghost" onClick={() => setConfirming(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </Card>
  );
}
