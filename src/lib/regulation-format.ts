/**
 * Reading evalgate's answer format, shared by the server and the browser (so
 * it imports nothing server-side). Answers cite passages inline as
 * [chunk#id] markers, e.g. [reg_2023_956#0042].
 */

export const MARKER = /\[([^\]\s]+#[^\]\s]+)\]/g;

/** The answer split into text and citation markers, for rendering. */
export function answerSegments(answer: string): ({ text: string } | { cite: string })[] {
  const out: ({ text: string } | { cite: string })[] = [];
  let last = 0;
  for (const m of answer.matchAll(MARKER)) {
    if (m.index > last) out.push({ text: answer.slice(last, m.index) });
    out.push({ cite: m[1]! });
    last = m.index + m[0].length;
  }
  if (last < answer.length) out.push({ text: answer.slice(last) });
  return out;
}
