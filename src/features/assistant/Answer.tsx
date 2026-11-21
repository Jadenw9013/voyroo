import { createElement, Fragment, memo, type ReactNode } from "react";
import { astToJSX, parser, RuleType, type MarkdownToJSX } from "markdown-to-jsx/react";
import "./Answer.css";

function AnswerLink({ href, children }: { href?: string; children?: ReactNode }) {
  let url: URL;
  try {
    url = new URL(href ?? "");
  } catch {
    return <>{children}</>;
  }
  if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password) return <>{children}</>;
  return <a href={url.href} target="_blank" rel="noopener noreferrer">{children}</a>;
}

const options: MarkdownToJSX.Options = {
  disableParsingRawHTML: true,
  disableFrontmatter: true,
  forceBlock: true,
  wrapper: Fragment,
  overrides: {
    a: AnswerLink,
    img: ({ alt }: { alt?: string }) => <>{alt}</>,
    table: ({ children }: { children?: ReactNode }) => (
      <div className="assistant-answer-table" role="region" aria-label="Scrollable table" tabIndex={0}>
        <table>{children}</table>
      </div>
    ),
  },
};

/** Some saved answers used literal bullet characters. Keep code samples verbatim. */
function normalizeBullets(text: string) {
  if (!text.includes("•")) return text;
  let fence = "";
  return text.split("\n").map((line) => {
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (fence) {
      if (marker?.startsWith(fence) && line.trim() === marker) fence = "";
      return line;
    }
    if (marker) fence = marker;
    return line.replace(/^( {0,3})•[ \t]+/, "$1- ");
  }).join("\n");
}

export const Answer = memo(function Answer({ text, streaming = false }: { text: string; streaming?: boolean }) {
  const blocks = parser(normalizeBullets(text), { ...options, optimizeForStreaming: streaming });
  // The conversation already has a page title. Start each answer's outline at h2,
  // even when Gemini opens with ###, and preserve the order of its subheadings.
  const levels = [...new Set(blocks.flatMap((block) => block.type === RuleType.heading ? [block.level] : []))].sort();
  const content = astToJSX(blocks, {
    ...options,
    renderRule(next, node, renderChildren, state) {
      if (node.type !== RuleType.heading) return next();
      const level = Math.min(6, 2 + Math.max(0, levels.indexOf(node.level)));
      return createElement(`h${level}`, { key: state.key }, renderChildren(node.children, state));
    },
  });
  return <div className="assistant-answer" data-spoken-answer>{content}</div>;
});
