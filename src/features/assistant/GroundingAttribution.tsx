"use client";

import { useEffect, useMemo, useRef } from "react";
import type { AssistantMessage } from "./chat";
import { renderSearchSuggestions } from "./searchSuggestions";

export function GroundingAttribution({ parts }: { parts: AssistantMessage["parts"] }) {
  const search = useRef<HTMLDivElement>(null);
  const steps = useMemo(() => parts.filter((p) => p.type === "data-grounding").map((p) => p.data), [parts]);
  // A tool call can refine a search before the final answer. Keep the final entry point
  // first and include earlier suggestions within Google's five-suggestion limit.
  const entries = useMemo(() => [...new Set(steps.map((step) => step.searchEntryPoint).filter((entry): entry is string => !!entry).reverse())], [steps]);
  const sources = steps.flatMap((step) => step.sources);
  useEffect(() => {
    const container = search.current;
    if (!container) return;
    const widgets: HTMLElement[] = [];
    let remaining = 5;
    for (const entry of entries) {
      if (remaining === 0) break;
      const widget = document.createElement("div");
      widget.style.contain = "content";
      const count = renderSearchSuggestions(widget, entry, remaining);
      if (count) widgets.push(widget);
      remaining -= count;
    }
    container.replaceChildren(...widgets);
  }, [entries]);

  return (
    <>
      {sources.length > 0 && (
        <ul aria-label="Sources" className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
          {sources.filter((s, i) => sources.findIndex((other) => other.kind === s.kind && other.url === s.url && other.title === s.title) === i).map((s) => (
            <li key={JSON.stringify([s.kind, s.url, s.title])}>
              <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-muted underline underline-offset-2 hover:text-ink">
                {s.title}{s.kind === "maps" && <> · <span translate="no" className="whitespace-nowrap">Google Maps</span></>}
              </a>
            </li>
          ))}
        </ul>
      )}
      {entries.length > 0 && <div ref={search} role="group" aria-label="Google Search suggestions" className="w-full min-w-0" />}
    </>
  );
}
