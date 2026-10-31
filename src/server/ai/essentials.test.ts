import { describe, expect, it } from "vitest";
import { cleanSources, parseDraft } from "./essentials";

describe("reading an essentials draft", () => {
  it("finds the JSON in a fenced or chatty reply and keeps only known, non-empty fields", () => {
    const text = 'Here you go:\n```json\n{"emergency":"Police: 110","water":"  Bottled only ","embassy":"","visa":"no","plugs":42}\n```';
    expect(parseDraft(text)).toEqual({ emergency: "Police: 110", water: "Bottled only" });
  });

  it("gives up on replies with nothing usable", () => {
    expect(parseDraft("Sorry, I couldn't search.")).toBeNull();
    expect(parseDraft("{not json}")).toBeNull();
    expect(parseDraft('{"embassy":""}')).toBeNull();
  });

  it("keeps web sources once each, with titles, and drops anything else", () => {
    expect(
      cleanSources([
        { sourceType: "url", url: "https://travel.state.gov/x", title: "travel.state.gov" },
        { sourceType: "url", url: "https://travel.state.gov/x", title: "dupe" },
        { sourceType: "document", url: "https://example.com/doc" },
        { sourceType: "url", url: "javascript:alert(1)" },
        { sourceType: "url", url: "https://gt.usembassy.gov/" },
      ]),
    ).toEqual([{ url: "https://travel.state.gov/x", title: "travel.state.gov" }, { url: "https://gt.usembassy.gov/" }]);
  });
});
