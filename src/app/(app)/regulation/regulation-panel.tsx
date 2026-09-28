"use client";

import { useState } from "react";
import { Button, FormError, Textarea, useRequest } from "@/components/forms";
import { Badge, Card, Note } from "@/components/ui";
import type { RegulationAnswer } from "@/lib/regulation";
import { answerSegments } from "@/lib/regulation-format";

const EXAMPLES = [
  "Who has to surrender CBAM certificates?",
  "What must a verification report contain?",
  "When is the annual CBAM declaration due?",
];

export function RegulationPanel({
  corpus,
  corpusHash,
  model,
  chunks,
}: {
  corpus: string;
  corpusHash: string;
  model: string;
  chunks: number;
}) {
  const { send, pending, error } = useRequest();
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<(RegulationAnswer & { question: string }) | null>(null);

  async function ask(q = question) {
    const text = q.trim();
    if (text.length < 3) return;
    setQuestion(text);
    const r = await send<RegulationAnswer>("/api/regulation", { json: { question: text } });
    if (r) setResult({ ...r, question: text });
  }

  // Citations numbered in order of first appearance, so [1] is the first source cited.
  const order = new Map<string, number>();
  for (const s of result ? answerSegments(result.answer) : []) {
    if ("cite" in s && !order.has(s.cite)) order.set(s.cite, order.size + 1);
  }
  const cited = result?.passages.filter((p) => p.cited) ?? [];
  const others = result?.passages.filter((p) => !p.cited) ?? [];
  cited.sort((a, b) => (order.get(a.chunkId) ?? 99) - (order.get(b.chunkId) ?? 99));

  return (
    <div className="space-y-6">
      <Card
        title="Your question"
        subtitle={`Answered from ${corpus} (${chunks} passages indexed).`}
      >
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void ask();
          }}
        >
          <Textarea
            value={question}
            maxLength={2000}
            placeholder="e.g. Who has to surrender CBAM certificates?"
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void ask();
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="submit"
              variant="primary"
              disabled={pending || question.trim().length < 3}
            >
              {pending ? "Looking it up…" : "Ask"}
            </Button>
            {EXAMPLES.map((q) => (
              <Button key={q} variant="ghost" disabled={pending} onClick={() => void ask(q)}>
                {q}
              </Button>
            ))}
          </div>
          <FormError>{error}</FormError>
        </form>
      </Card>

      {result ? (
        <Card title="Answer" subtitle={result.question}>
          {result.unsupported.length > 0 ? (
            <div className="mb-4">
              <Note tone="warning">
                {result.unsupported.length === 1
                  ? "One citation"
                  : `${result.unsupported.length} citations`}{" "}
                in this answer could not be matched to a passage the service retrieved. Treat the
                sentence{result.unsupported.length === 1 ? "" : "s"} it supports as unverified.
              </Note>
            </div>
          ) : null}
          <p className="whitespace-pre-line text-[15px] leading-[1.75] text-ink">
            {answerSegments(result.answer).map((s, i) =>
              "text" in s ? (
                <span key={i}>{s.text}</span>
              ) : (
                <a
                  key={i}
                  href={`#passage-${s.cite}`}
                  className="mx-0.5 inline-block rounded-md border border-accent/30 bg-accent/[0.06] px-1.5 align-baseline text-[12px] font-medium text-accent no-underline hover:bg-accent/[0.12]"
                  title={s.cite}
                >
                  {order.get(s.cite)}
                </a>
              ),
            )}
          </p>
          <p className="mt-4 text-[12.5px] text-muted">
            Answered by {result.model} over {result.corpus} ({result.corpusHash.slice(0, 12)}),{" "}
            {result.retriever}, in {result.seconds.toFixed(1)} s.
          </p>
        </Card>
      ) : null}

      {result && cited.length > 0 ? (
        <Card
          title="Sources cited"
          subtitle="The passages the answer rests on. Read them before relying on it."
        >
          <ul className="space-y-4">
            {cited.map((p) => (
              <li
                key={p.chunkId}
                id={`passage-${p.chunkId}`}
                className="scroll-mt-24 rounded-xl border border-line bg-surface-2 p-4"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="rounded-md border border-accent/30 bg-accent/[0.06] px-1.5 text-[12px] font-medium text-accent">
                    {order.get(p.chunkId)}
                  </span>
                  <span className="text-[13.5px] font-medium text-ink">{p.docTitle}</span>
                  {p.section ? <span className="text-[13px] text-muted">{p.section}</span> : null}
                  <Badge tone={p.cited === "verified" ? "good" : "critical"}>
                    {p.cited === "verified" ? "Citation checked" : "Citation not supported"}
                  </Badge>
                </div>
                <p className="whitespace-pre-line text-[13.5px] leading-[1.7] text-ink-2">
                  {p.text}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {result && others.length > 0 ? (
        <details className="rounded-2xl border border-line bg-surface px-6 py-4">
          <summary className="cursor-pointer text-[14px] font-medium text-ink">
            Other passages retrieved but not cited ({others.length})
          </summary>
          <ul className="mt-4 space-y-3">
            {others.map((p) => (
              <li
                key={p.chunkId}
                id={`passage-${p.chunkId}`}
                className="text-[13px] leading-[1.65] text-ink-2"
              >
                <span className="font-medium text-ink">{p.docTitle}</span>
                {p.section ? <span className="text-muted"> · {p.section}</span> : null}
                <p className="mt-1 line-clamp-4 whitespace-pre-line">{p.text}</p>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {!result ? (
        <p className="text-[12.5px] text-muted">
          Served by evalgate: {model}, corpus {corpus} ({corpusHash}).
        </p>
      ) : null}
    </div>
  );
}
