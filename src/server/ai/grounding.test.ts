import { expect, it } from "vitest";
import { googleAttribution } from "./grounding";

it("keeps Maps place names, Search links and Search suggestions while dropping private retrieval metadata", () => {
  const maps = { uri: "https://www.google.com/opaque-place-link", title: "Museo del Oro", placeId: "internal", text: "private snippet" };
  const web = { uri: "https://example.org/hours", title: "Opening hours" };
  const searchEntryPoint = '<div><a href="https://www.google.com/search?q=museum">museum</a></div>';
  expect(googleAttribution({
    webSearchQueries: ["private query"],
    retrievalQueries: ["user coordinates"],
    groundingChunks: [{ maps }, { maps }, { web }, { retrievedContext: { uri: "gs://trip/private" } }],
    searchEntryPoint: { renderedContent: searchEntryPoint },
  })).toEqual({ sources: [
    { kind: "maps", url: maps.uri, title: maps.title },
    { kind: "web", url: web.uri, title: web.title },
  ], searchEntryPoint });
});

it("includes every attributed place and uses the containing page for image sources", () => {
  const places = Array.from({ length: 10 }, (_, i) => ({ maps: { title: `Place ${i}`, uri: `https://maps.google.com/?cid=${i}` } }));
  const grounding = googleAttribution({ groundingChunks: [...places, { image: { sourceUri: "https://example.org/museum", imageUri: "https://example.org/pic.jpg" } }] });
  expect(grounding?.sources).toHaveLength(11);
  expect(grounding?.sources.at(-1)).toEqual({ kind: "web", url: "https://example.org/museum", title: "example.org" });
});

it("ignores missing attribution and links that cannot be displayed", () => {
  expect(googleAttribution(null)).toBeUndefined();
  expect(googleAttribution({ groundingChunks: ["", "/private", "ftp://example.org/bookings", "https://name:password@example.org"].map((uri) => ({ web: { uri } })) })).toBeUndefined();
});
