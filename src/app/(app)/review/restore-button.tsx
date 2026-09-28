"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Brings an excluded record back into the calculation. */
export function RestoreButton({ activityId }: { activityId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch("/api/workspace/exclusions", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            activityIds: [activityId],
            reason: "Restored on review",
            restore: true,
          }),
        });
        setBusy(false);
        router.refresh();
      }}
      className="text-[10.5px] text-accent hover:underline disabled:opacity-40"
    >
      {busy ? "…" : "Restore"}
    </button>
  );
}
