import { AppShell } from "@/components/app-shell";
import { isAiAvailable, MODEL } from "@/lib/ai/client";
import { pageContext } from "@/lib/auth/context";
import { ROLES } from "@/lib/auth/accounts";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await pageContext();
  return (
    <AppShell
      user={{ name: ctx.user.name, email: ctx.user.email }}
      org={ctx.org}
      role={ROLES[ctx.role].label}
      canWrite={ctx.canWrite}
      workspaces={ctx.workspaces.map((w) => ({ id: w.id, name: w.name }))}
      currentWorkspaceId={ctx.workspace?.id ?? null}
      model={isAiAvailable() ? MODEL : null}
      database={ctx.db.kind}
    >
      {children}
    </AppShell>
  );
}
