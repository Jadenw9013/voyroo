import type { GoogleProviderMetadata } from "@ai-sdk/google";
import type { UIMessageChunk } from "ai";

export type GroundingSource = { kind: "web" | "maps"; title: string; url: string };
export type Grounding = { sources: GroundingSource[]; searchEntryPoint?: string };

/** Only the fields a traveler needs to see. Queries, retrieval context and location stay off the wire. */
export function googleAttribution(metadata: GoogleProviderMetadata["groundingMetadata"] | undefined): Grounding | undefined {
  if (!metadata) return;
  const sources: GroundingSource[] = [];
  for (const chunk of metadata.groundingChunks ?? []) {
    const source = chunk.maps ?? chunk.web ?? chunk.retrievedContext;
    const url = source?.uri ?? chunk.image?.sourceUri;
    if (!url || !URL.canParse(url)) continue;
    const parsed = new URL(url);
    if (!["https:", "http:"].includes(parsed.protocol) || parsed.username || parsed.password) continue;
    const title = source?.title || chunk.image?.title || parsed.hostname;
    const kind = chunk.maps ? "maps" : "web";
    if (!sources.some((s) => s.kind === kind && s.url === url && s.title === title)) sources.push({ kind, title, url });
  }
  const searchEntryPoint = metadata.searchEntryPoint?.renderedContent;
  if (sources.length || searchEntryPoint) return { sources, ...(searchEntryPoint ? { searchEntryPoint } : {}) };
}

/** Keep each step's attribution alongside that step when the SDK continues a multi-step answer. */
export function groundingDataParts() {
  return new TransformStream<UIMessageChunk, UIMessageChunk>({
    transform(chunk, controller) {
      if (chunk.type === "message-metadata") {
        controller.enqueue({ type: "data-grounding", data: chunk.messageMetadata });
      } else {
        controller.enqueue(chunk);
      }
    },
  });
}
