import { pageContext } from "@/lib/auth/context";
import { isSyntheticCorpus, regulationConfigured, regulationHealth } from "@/lib/regulation";
import { Card, Note, Page, PageHeader } from "@/components/ui";
import { RegulationPanel } from "./regulation-panel";

export const dynamic = "force-dynamic";

/**
 * Ask the regulation.
 *
 * Answers come from an evalgate service (github.com/aquiadi/CI-harness): every
 * claim cites a passage of the texts it indexes, every citation is checked,
 * and its answer quality is gated in its own CI. This page relays and renders;
 * it never answers from anything else.
 */
export default async function RegulationPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  await pageContext();
  const configured = regulationConfigured();
  const health = configured ? await regulationHealth() : null;

  return (
    <>
      <PageHeader
        eyebrow="Supporting"
        title="Ask the regulation"
        description={
          <>
            Questions answered from the CBAM texts, with every claim cited to the passage it came
            from and every citation checked against it. Read the passage before relying on an
            answer: this explains the rules, it does not replace them.
          </>
        }
      />
      <Page>
        {!configured ? (
          <Card
            title="Not connected"
            subtitle="Answers come from evalgate, a separate service that retrieves and cites the regulation."
          >
            <ol className="list-decimal space-y-2 pl-5 text-[14.5px] leading-[1.65] text-ink-2">
              <li>
                Build evalgate (<code>github.com/aquiadi/CI-harness</code>) with the real documents:
                on a machine that can reach the EU sites, run{" "}
                <code>make corpus PROFILE=&quot;+experiment=real&quot;</code> then{" "}
                <code>make docker</code>. The documents are not in its repository, so an image built
                straight from GitHub can only serve its synthetic test corpus.
              </li>
              <li>
                Run that image as its own service (on Railway: New → Docker image) with{" "}
                <code>EVALGATE_OVERRIDES=+experiment=real</code> and <code>EVALGATE_API_KEY</code>{" "}
                set to a long random value.
              </li>
              <li>
                On CarbonPass, set <code>EVALGATE_URL</code> to that service&apos;s address and{" "}
                <code>EVALGATE_API_KEY</code> to the same value, then redeploy.
              </li>
            </ol>
          </Card>
        ) : !health ? (
          <Note tone="warning">
            The regulation service at the configured address is not answering. Check that it is
            running and that <code>EVALGATE_URL</code> is right.
          </Note>
        ) : (
          <div className="space-y-6">
            {isSyntheticCorpus(health.corpus) ? (
              <Note tone="critical">
                <b>This service is serving its synthetic test corpus, which is not law.</b> Its
                answers only show that the connection works. Start it with{" "}
                <code>EVALGATE_OVERRIDES=+experiment=real</code> to answer from the real documents.
              </Note>
            ) : null}
            <RegulationPanel
              corpus={health.corpus}
              corpusHash={health.corpus_hash.slice(0, 12)}
              model={health.generator_model}
              chunks={health.chunks}
              initialQuestion={typeof q === "string" ? q.slice(0, 2000) : ""}
            />
          </div>
        )}
      </Page>
    </>
  );
}
