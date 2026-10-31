---
name: mobile-ui-design
description: Professional mobile-web UI/UX rules and design process for Voyroo, a phone-first group-trip PWA used on the go (moving, bright sun, one hand, weak signal). Use when designing, building, reviewing, decluttering or restyling any screen, component, CSS, icon or piece of UI copy in this app; when asked for a UI/UX review, a declutter pass, a redesign, design QA, or to make the UI "look professional" or "less like AI"; and before shipping any visual change.
---

# Mobile UI design for Voyroo

Voyroo is read on a phone in a shuttle, on a boat, in direct sun, with patchy signal, by a few friends who want answers. The job of the UI is to show the answer, then get out of the way.

This skill replaces your default design instincts. Those instincts produce the generic "AI" look (purple gradients, a card around everything, glass, glows, eyebrow labels, emoji icons, stat tiles). Every rule here comes from the research in `docs/design/research/` (platform guidelines, NN/g and Baymard studies, design-system docs, and teardowns of Flighty, Transit, Citymapper, Google Maps, Wallet, Things and Linear). When you claim something, say whether it's evidence, a standard, or a convention, and cite the report.

The owner's standing direction: **don't add features or chrome; subtract.** Every element must earn its place.

## Context brief (start every task from this)

- **People:** a small group of friends on one trip. Not designers, not power users. Some open the app once a day.
- **Situations:** walking, riding a bus or boat, standing at a check-in desk, outdoors in sun, one-handed, on roaming data or offline, often in a hurry.
- **Top tasks (working hypothesis; confirm with the group when possible):**
  1. What's next and when (and where I sleep tonight).
  2. Show the booking: confirmation code, link, who booked it.
  3. Get directions to it.
  4. Call or WhatsApp the hotel, driver or tour.
  5. See a day's plan.
  6. Add something quickly (a place, a link, a screenshot).
  7. See what's still to book.
- **Glance budget:** the answer to "what's next?" must be readable in one ~2 s glance. Common tasks take three taps or fewer.

## Non-negotiables

1. **One job and one primary action per screen.** Everything else is visibly secondary or one level down. Never more than two levels.
2. **Launch to the answer.** Today opens on the next thing, painted from cache. Nothing (banners, prompts, tips) sits above it.
3. **Lists, not cards.** Group with space and headings. Use a contained surface only for the one loud element (the Next ticket) and for sheets. No cards inside cards.
4. **Tokens only.** No raw hex, `rgb()`, arbitrary Tailwind values (`bg-[#…]`, `text-[11px]`, `min-h-[…]`) or one-off shadows in components. If a token is missing, add it to `src/app/globals.css` with a written reason, in light, dark and Sunlight.
5. **Type:** one family (Atkinson Hyperlegible Next), weights 400/600/700 only, body 17px, inputs at least 16px, nothing under 13px. Times, prices and codes use tabular figures.
6. **Contrast:** body text at least 4.5:1 everywhere; times, codes, addresses and status at least 7:1. Never put critical facts in the muted color. Check light, dark and Sunlight.
7. **Touch:** 44px minimum for everything. Actions used while moving (Directions, Call, WhatsApp, Copy code, Mark as booked) are 56px or taller with at least 8px between them. Keep them in the middle band of the screen, away from destructive controls.
8. **Status never by color alone:** mark plus word (✓ Booked, ○ To book, ? Maybe). Icons need 3:1.
9. **Navigation:** a visible, labelled bar of 3–5 destinations. Tabs navigate; they don't perform actions. Never hide or disable a tab.
10. **Sheets:** one at a time, for short tasks only. Visible Close button, Back closes it, swipe-down closes it, confirm before discarding typed text. Long editing gets a full screen.
11. **Words do the decluttering:** sentence case, front-loaded labels, buttons are Verb + noun ("Copy confirmation", "Get directions"), errors say what happened and how to fix it, no marketing voice, no "Learn more", no "Oops".
12. **Undo over confirm.** Confirm only what's destructive and irreversible, with outcome labels ("Delete trip" / "Keep trip").
13. **Offline is a normal state:** show cached content with "Updated 10:42", one quiet "Offline · changes will sync" line, per-item "Waiting to sync", automatic retry. No blocking spinners, no red banners.
14. **Motion only with a purpose:** at most 100ms for presses and 300ms in / 200ms out for sheets. No animation on frequent actions. Honor `prefers-reduced-motion` with fades. Animate only `transform` and `opacity`.
15. **Real content, every state:** design with the longest place name, zero items, 40 items, a night with no stay, a cancelled booking, offline, and a different time zone. Never a blank field: hide the action or offer "Add phone".

## Banned defaults

Don't use these unless the brief gives a specific reason, written in your rationale. Details and replacements are in [references/anti-slop.md](references/anti-slop.md).

- Purple/indigo/violet accents or gradients; gradient text; neon glows; always-dark navy themes.
- Glassmorphism or `backdrop-blur` over content; CSS `invert()` hacks on maps or images.
- A rounded, bordered, shadowed card around every block; one radius everywhere; colored card stripes that aren't status.
- Eyebrow labels, badges above titles, decorative stat tiles, vanity counts, dashboards.
- Emoji as icons, ✨ for "AI", an icon on every row or heading, icon tiles before headings, unlabelled icon buttons.
- Arrows appended to link text, middle-dot meta strings, `font-extrabold` everywhere, 10–11px text.
- Fade-up-on-scroll, hover lifts, bounces, looping motion.
- Generic copy ("Get started", "Explore", "Seamless", "Unlock"), placeholder-as-label, lorem ipsum.
- A quick-action hub or shortcut row that repeats the tab bar.
- Swapping one preset look for another (cream + serif + terracotta is also a cliché). Choices come from the content and the context.

## Process

Copy the process, not a look. Steps 1–4 come before any code.

1. **Classify the request:** Review (no edits), Declutter (fate table, then edits if asked), Shape (new screen or component), Implement (a given design), Copy (words only), Harden (states, accessibility, offline). Don't let a review turn into a redesign.
2. **Write a five-line brief:** who, where (situation from the context brief), the job, the one primary action, and what success looks like (e.g. "next item readable in a 2 s glance, Directions in one tap").
3. **Inventory the screen.** List every element: purpose, which top task it serves, duplicates elsewhere. Then **subtract first**: ask "what can we remove?" before "what should we add?" (people overlook removals unless prompted). Give each element a fate: keep, move to level 2, merge into its canonical place, or remove. See [references/patterns.md](references/patterns.md#declutter-pass).
4. **Pick 2–4 references from shipped products that do the same job** (Flighty or Wallet for "what's next", Transit for a departures list, Google Maps for a place sheet, Things for quiet lists). Write one line each on why it works. Borrow behavior and hierarchy, not looks. See [references/patterns.md](references/patterns.md).
5. **Plan inside the system:** name the tokens, type roles and existing components you'll use (`src/ui/kit.tsx`, `src/ui/badges.tsx`, `src/ui/Sheet.tsx`, `src/ui/Icon.tsx`). Sketch the layout as an ASCII wireframe. See [references/visual-system.md](references/visual-system.md).
6. **Build.** Read `AGENTS.md` and `node_modules/next/dist/docs` before Next.js code. Reuse components; extend tokens only with a reason.
7. **Look at it.** Render on a real page at 375×812 and 390×844, plus 320 wide and 200% text, in light, dark and Sunlight. Use the browser pane or Playwright (`e2e/`); the dev server needs `CHAT_MOCK=1` and memory-store env as in `playwright.config.ts`. Take screenshots. Do the 2-second glance test on the key screen. Code review alone is not a design review.
8. **Critique as a separate role.** Hand the screenshots to the `ui-critic` agent, or critique yourself in this form: *goal → observation → impact → suggestion*, with Nielsen severity 0–4.
9. **Run the QA checklist:** [references/qa-checklist.md](references/qa-checklist.md). Run the deterministic checks too: `npm run lint`, `npm run typecheck`, `npm test`, `npm run e2e` (axe runs in light and dark), and a grep for raw colors in `src/features` and `src/ui`.
10. **Write the rationale:** decision → reason → evidence (cite `docs/design/research/0N-*.md`). Use observable statements, not "clean" or "modern". Note what you rejected and why.
11. **Ask for a human test** when a top-task screen changed: the owner hands a phone to two or three trip-mates for five minutes, one-handed, outdoors if possible.

## Output formats

**Review:** a findings table, most severe first.

| # | Screen / file:line | Goal | Observation | Impact | Suggestion | Severity 0–4 | Source |
|---|---|---|---|---|---|---|---|

**Declutter pass:**
1. Inventory table (element, screen, purpose, top task, duplicates).
2. Fate table (keep / move / merge / remove, with reason).
3. Duplicate paths with the canonical one named.
4. Before/after ASCII wireframes.
5. Open questions for the owner.

**Implementation:** what changed, screenshots (light, dark, Sunlight at 390×844), checklist results, and the rationale.

## References (read when needed)

- [references/anti-slop.md](references/anti-slop.md): the generic-AI patterns, why they read as low quality, what professionals do instead, and the instances found in Voyroo on 31 Oct 2026.
- [references/qa-checklist.md](references/qa-checklist.md): the pre-ship checklist. Run it on every visual change.
- [references/platform.md](references/platform.md): mobile web and PWA facts with numbers: targets, viewport units, safe areas, keyboard, sheets, Back, forms, performance budgets, offline, accessibility.
- [references/visual-system.md](references/visual-system.md): type roles, spacing, radius, elevation, color roles (OKLCH 12-step), Sunlight and dark mode, icons, imagery, motion tokens.
- [references/patterns.md](references/patterns.md): the pattern library from exemplar apps, list-row anatomy, content-design rules, the declutter pass, and a per-screen guide for Today, Plan, item page, To-do and add.
- `docs/design/README.md`: the synthesis, the decisions it implies for Voyroo, and the open questions.
- `docs/design/research/01–05`: the full research with sources and evidence tags.
- `docs/DESIGN.md`: the current design doc. It predates this research and has drifted from the code (it says the accent is forest green; `globals.css` now uses violet). The redesign should rewrite it.

## Project rules that still apply

- Don't push branches or open pull requests unless the owner says so. Vercel previews share production data.
- Don't add features while decluttering. If something new seems needed, list it as an open question instead.
- Keep the things that already work (see "Worth keeping" in [references/anti-slop.md](references/anti-slop.md)): the Next ticket, actionable empty states, the Sunlight theme, the labelled day strip.
