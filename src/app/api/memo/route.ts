import { streamMemo } from "@/lib/ai/memo";
import { getDeclaration } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Streams the methodology memo as plain text. */
export async function POST() {
  const declaration = getDeclaration();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        for await (const chunk of streamMemo(declaration)) {
          controller.enqueue(encoder.encode(chunk));
        }
      } catch (error) {
        controller.enqueue(
          encoder.encode(
            `\n\n_Memo generation failed: ${error instanceof Error ? error.message : "unknown error"}_`,
          ),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
