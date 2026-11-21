const svgNamespace = "http://www.w3.org/2000/svg";
const htmlTags = new Set(["div", "span", "a"]);
const svgTags = new Set(["svg", "g", "path", "circle", "rect"]);
const svgAttributes = new Set(["viewBox", "width", "height", "d", "fill-rule", "clip-rule", "cx", "cy", "r", "x", "y", "rx", "ry"]);
const styleProperties = new Set((
  "align-items background background-color border border-color border-radius box-shadow color display fill " +
  "font-family font-size font-weight gap height justify-content line-height margin margin-left margin-right " +
  "min-width max-width overflow overflow-x padding position scrollbar-width text-align text-decoration " +
  "transform user-select white-space width -webkit-tap-highlight-color"
).split(" "));

/** Keep the provider's chip styling, including light/dark variants, scoped to its shadow root. */
function safeRules(rules: CSSRuleList): string {
  const result: string[] = [];
  for (const rule of rules) {
    if (rule instanceof CSSMediaRule && /^\(prefers-color-scheme:\s*(dark|light)\)$/.test(rule.conditionText)) {
      result.push(`@media ${rule.conditionText} { ${safeRules(rule.cssRules)} }`);
    }
    if (!(rule instanceof CSSStyleRule) || !/^\.[\w-]+(?::(?:hover|active|focus|focus-visible))?$/.test(rule.selectorText)) continue;
    const declarations: string[] = [];
    for (const property of rule.style) {
      if (!styleProperties.has(property)) continue;
      const value = rule.style.getPropertyValue(property);
      if (!/^[\w#.% (),"'\-]+$/.test(value)) continue;
      if ([...value.matchAll(/([\w-]+)\(/g)].some((fn) => !["rgb", "rgba", "linear-gradient", "translate"].includes(fn[1]))) continue;
      declarations.push(`${property}: ${value}`);
    }
    result.push(`${rule.selectorText} { ${declarations.join("; ")} }`);
  }
  return result.join("\n");
}

function suggestionUrl(raw: string | null): string | undefined {
  if (!raw || !URL.canParse(raw)) return;
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.username || url.password) return;
  return raw;
}

/** Parse Google's HTML in an inert template. Build fresh elements containing only display data. */
export function renderSearchSuggestions(host: HTMLElement, html: string, limit: number): number {
  const root = host.shadowRoot ?? host.attachShadow({ mode: "open" });
  const template = document.createElement("template");
  template.innerHTML = html;
  const fragment = document.createDocumentFragment();
  let count = 0;

  function copy(node: Node, parent: Node, depth: number) {
    if (depth > 20) return;
    if (node.nodeType === Node.TEXT_NODE) {
      parent.appendChild(document.createTextNode(node.textContent ?? ""));
      return;
    }
    if (!(node instanceof Element)) return;
    const tag = node.localName;
    if (tag === "style") {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(node.textContent ?? "");
      const style = document.createElement("style");
      style.textContent = safeRules(sheet.cssRules);
      fragment.appendChild(style);
      return;
    }
    let child: Element;
    if (node.namespaceURI === svgNamespace && svgTags.has(tag)) {
      child = document.createElementNS(svgNamespace, tag);
      for (const attr of node.attributes) {
        if (svgAttributes.has(attr.name) || (attr.name === "fill" && /^(none|currentColor|#[\da-f]{3,8})$/i.test(attr.value))) child.setAttribute(attr.name, attr.value);
      }
    } else if (htmlTags.has(tag)) {
      child = document.createElement(tag);
      if (tag === "a") {
        const href = suggestionUrl(node.getAttribute("href"));
        if (!href || count >= limit) return;
        child.setAttribute("href", href);
        child.setAttribute("target", "_blank");
        child.setAttribute("rel", "noopener noreferrer");
        count++;
      }
    } else {
      return;
    }
    if (node.hasAttribute("class")) child.setAttribute("class", node.getAttribute("class")!);
    for (const nested of node.childNodes) copy(nested, child, depth + 1);
    parent.appendChild(child);
  }
  for (const node of template.content.childNodes) copy(node, fragment, 0);
  root.replaceChildren(...(count ? [fragment] : []));
  return count;
}
