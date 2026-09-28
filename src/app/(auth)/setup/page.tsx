import { Card, Note } from "@/components/ui";

/** Shown when the app runs somewhere without a persistent disk and no DATABASE_URL. */
export default function SetupPage() {
  return (
    <Card title="Connect a database">
      <div className="space-y-3 text-[12.5px] leading-[1.65] text-ink-2">
        <p>
          This deployment has no database configured. On Vercel the filesystem is not persistent and
          functions do not share memory, so CarbonPass needs a Postgres database to keep your data.
        </p>
        <ol className="list-decimal space-y-1.5 pl-5">
          <li>
            In your Vercel project open <span className="text-ink">Storage</span> and add a{" "}
            <span className="text-ink">Neon Postgres</span> database (free tier is enough). It sets{" "}
            <span className="font-mono text-[11.5px]">DATABASE_URL</span> for you.
          </li>
          <li>Redeploy. Tables are created automatically on first request.</li>
        </ol>
        <Note>
          Any Postgres works: set <span className="font-mono">DATABASE_URL</span> to its connection
          string. On Railway, add the Postgres plugin and reference its URL, or attach a volume and
          run without one.
        </Note>
      </div>
    </Card>
  );
}
