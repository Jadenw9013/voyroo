import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { Answer } from "./Answer";

function markup(text: string, streaming = false) {
  return renderToStaticMarkup(createElement(Answer, { text, streaming }));
}

it("renders adjacent itinerary headings, paragraphs and bullet labels without blank lines", () => {
  const html = markup([
    "### 1. The Target Terminal Arrival: 9:00 AM – 9:15 AM",
    "Leave the hotel by **8:00 AM**.",
    "### 2. Factoring Tuesday Morning Traffic",
    "* **Rush hour:** Allow extra time.",
    "* **Drive time estimate:** Check before leaving.",
  ].join("\n"));
  expect(html).toContain("data-spoken-answer");
  expect(html).toContain("<h2>1. The Target Terminal Arrival: 9:00 AM – 9:15 AM</h2><p>Leave the hotel by <strong>8:00 AM</strong>.</p>");
  expect(html).toContain("<h2>2. Factoring Tuesday Morning Traffic</h2><ul><li><strong>Rush hour:</strong>");
  expect(html).not.toContain("###");
});

it("preserves ordered, nested and legacy bullet lists and the answer's heading hierarchy", () => {
  const html = markup("# Airport\n### Check-in\n3. Show ID\n   - Keep your *passport* ready.\n4. Pass security\n\n• Find the gate");
  expect(html).toContain("<h2>Airport</h2><h3>Check-in</h3>");
  expect(html).toMatch(/<ol start="3"><li>Show ID\s*<ul><li>Keep your <em>passport<\/em> ready\.<\/li><\/ul><\/li><li>Pass security<\/li><\/ol>/);
  expect(html).toContain("<ul><li>Find the gate</li></ul>");
  expect(markup("~~~\n• example\n~~~")).toContain("• example");
});

it("keeps wide tables in their own focusable scrolling region", () => {
  const html = markup("| Route | Time |\n| --- | --- |\n| Airport | 45 min |");
  expect(html).toContain('role="region" aria-label="Scrollable table" tabindex="0"><table>');
  expect(html).toContain("<th>Time</th>");
  expect(html).toContain("<td>45 min</td>");
});

it("renders only public web links, leaves raw markup inert and avoids loading model-supplied images", () => {
  const html = markup("[Map](https://example.org/park_(north)) · [Other](data:text/plain,hello) · [Relative](/local)\n\n<b>plain</b> ![map photo](https://example.org/map.png)");
  expect(html).toContain('<a href="https://example.org/park_(north)" target="_blank" rel="noopener noreferrer">Map</a>');
  expect(html.match(/<a /g)).toHaveLength(1);
  expect(html).toContain("&lt;b&gt;plain&lt;/b&gt; map photo");
  expect(html).not.toContain("<img");
  expect(markup("See https://example.org/directions.")).toContain('href="https://example.org/directions"');
});

it("keeps an unfinished link readable while streaming and activates the completed link", () => {
  expect(markup("See [directions](https://ex", true)).toContain("<p>See directions</p>");
  expect(markup("See [directions](https://example.org/map)")).toContain('href="https://example.org/map"');
});
