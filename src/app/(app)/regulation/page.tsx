import { pageContext } from "@/lib/auth/context";
import { isSyntheticCorpus, regulationConfigured, regulationHealth } from "@/lib/regulation";
import { Note, Page, PageHeader } from "@/components/ui";
import { aiLabel } from "@/lib/ai/client";
import { rulebook } from "@/lib/rulebook";
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
        <div className="space-y-6">
          {configured && health && isSyntheticCorpus(health.corpus) ? (
            <Note tone="critical">
              <b>
                The connected evalgate service is serving its synthetic test corpus, which is not
                law.
              </b>{" "}
              Its answers only show that the connection works. Start it with{" "}
              <code>EVALGATE_OVERRIDES=+experiment=real</code> to answer from the real documents.
            </Note>
          ) : null}
          {configured && !health ? (
            <Note tone="warning">
              The evalgate service at <code>EVALGATE_URL</code> is not answering, so questions are
              answered from the built-in rulebook for now.
            </Note>
          ) : null}
          {!health ? (
            <Note tone="accent">
              Answers come from the <b>built-in rulebook</b>: the acts, CBAM factors, mark-ups,
              prices and methods this calculator applies, each passage naming its source. For
              answers from the full text of the regulation, connect an{" "}
              <a
                href="https://github.com/aquiadi/CI-harness"
                className="text-accent underline underline-offset-2"
              >
                evalgate
              </a>{" "}
              service with <code>EVALGATE_URL</code> - see the README.
            </Note>
          ) : null}
          <RegulationPanel
            corpus={health ? health.corpus : "the CarbonPass rulebook"}
            corpusHash={health ? health.corpus_hash.slice(0, 12) : ""}
            model={health ? health.generator_model : (aiLabel() ?? "none")}
            chunks={health ? health.chunks : rulebook().length}
            initialQuestion={typeof q === "string" ? q.slice(0, 2000) : ""}
          />
        </div>
      </Page>
    </>
  );
}
