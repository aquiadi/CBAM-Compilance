import { listSessions } from "@/lib/auth/account";
import { pageContext } from "@/lib/auth/context";
import { currentSessionId } from "@/lib/auth/session";
import { twoFactorStatus } from "@/lib/auth/two-factor";
import { env } from "@/config/env";
import { Page, PageHeader } from "@/components/ui";
import { AccountManager } from "./account-manager";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const ctx = await pageContext();
  const [status, sessions] = await Promise.all([
    twoFactorStatus(ctx.db, ctx.user.id),
    listSessions(ctx.db, ctx.user.id, await currentSessionId()),
  ]);
  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Your account"
        description={
          <>
            Signed in as <b>{ctx.user.email}</b>. Two-factor sign-in means a stolen password alone
            cannot open {ctx.org.name}&apos;s declaration data.
          </>
        }
      />
      <Page>
        <AccountManager
          twoFactor={status}
          sessions={sessions}
          secretsSealed={Boolean(env.CARBONPASS_ENCRYPTION_KEY)}
        />
      </Page>
    </>
  );
}
