# Mobile UI design research

Research done on 31 Oct 2026 to guide Voyroo's declutter and redesign. Voyroo is used mostly on phones during a trip: on buses and boats, in bright sun, with weak signal, often one-handed. The aim is to design the way professional product designers do, and to stop producing the generic "AI-generated" look.

Nothing in the app changed as part of this research. These files are the evidence and the working rules for the redesign.

## What's here

**The working rulebook** (what Claude and other agents follow when touching the UI):

- [`.claude/skills/mobile-ui-design/SKILL.md`](../../.claude/skills/mobile-ui-design/SKILL.md): the skill. It covers the context brief, non-negotiables, banned defaults, the design process, and output formats.
  - [`references/anti-slop.md`](../../.claude/skills/mobile-ui-design/references/anti-slop.md): generic AI patterns, what to do instead, and the instances found in Voyroo.
  - [`references/qa-checklist.md`](../../.claude/skills/mobile-ui-design/references/qa-checklist.md): the pre-ship checklist.
  - [`references/platform.md`](../../.claude/skills/mobile-ui-design/references/platform.md): mobile web and PWA facts with numbers.
  - [`references/visual-system.md`](../../.claude/skills/mobile-ui-design/references/visual-system.md): type, spacing, color, icons, motion and tokens.
  - [`references/patterns.md`](../../.claude/skills/mobile-ui-design/references/patterns.md): the pattern library, content rules, the declutter pass, and a per-screen guide.
- [`.claude/agents/ui-designer.md`](../../.claude/agents/ui-designer.md): an agent that does design work (reviews, declutter passes, redesigns, copy) by following the skill.
- [`.claude/agents/ui-critic.md`](../../.claude/agents/ui-critic.md): a read-only agent that reviews rendered screens against the skill and the checklist.

**The research** (sources, dates and evidence tags for every claim):

| Report | Covers |
|---|---|
| [01 Platform and ergonomics](research/01-platform-ergonomics.md) | Apple HIG, Material 3, WCAG 2.2, Hoober's touch research, NN/g on navigation and sheets, iOS Safari and Android Chrome realities, forms, performance budgets, offline UX, mobile accessibility |
| [02 Declutter, content and glanceability](research/02-declutter-content-glanceable.md) | How professionals declutter (inventory, top tasks, OOUX, subtraction), cognitive load, glance budgets from in-car and watch design, content design (GOV.UK, Polaris, Atlassian), notification restraint, lists vs cards, evaluation methods |
| [03 Visual craft](research/03-visual-craft.md) | Typography, spacing, hierarchy, OKLCH color systems, contrast (WCAG 2.2 and APCA), sunlight, dark mode, icons, imagery, motion, design tokens, and what Linear, Stripe, Things, Flighty and Wallet do |
| [04 AI slop and professional process](research/04-ai-slop-and-pro-process.md) | 27 tell-tale patterns of AI-generated UI with consensus levels, how professional teams work (critique, friction logs, heuristics, QA), a 44-point checklist, and the patterns found in Voyroo |
| [05 Exemplar apps](research/05-exemplar-apps.md) | Teardowns of Flighty, Transit, Citymapper, Google Maps, Apple Wallet, Airbnb, TripIt, Wanderlog, Things 3 and Linear, a named pattern library, and the web equivalents of native features |

## How to use it

Ask Claude to use the agents, for example:

- "Use the ui-designer agent to run a declutter pass on Today." It produces an inventory, a fate table and before/after wireframes, without editing code unless you ask.
- "Use the ui-critic agent to review the item page." It produces findings with severity, based on screenshots.
- Any UI change in this repo should load the `mobile-ui-design` skill and pass its QA checklist.

## What the research means for Voyroo

1. **Today shows the answer on open:** the next thing, readable in a two-second glance, painted from cache. Only now, next and later belong there. Planning tools, stats and shortcut hubs don't.
2. **One loud thing per screen.** On Today that's the marigold ticket; everything else is quiet. Its fields and its one main button change with the time to the event.
3. **Lists, not cards.** Group with space and headings. Contain only the ticket and sheets. No cards inside cards.
4. **Rich item pages, minimal rows.** A row shows a kind icon or time, a front-loaded title, one meta line, and one status or action. The item page holds actions first, then facts, links, contacts, posts, then notes.
5. **Facts in, actions out.** Store phone, address and code as fields and derive the buttons from them. Hide what's missing and offer "Add phone" instead of blank fields.
6. **Bigger targets while moving.** 44px is the floor. Directions, Call, WhatsApp, Copy code and Mark as booked get 56–64px, in the middle of the screen.
7. **Sunlight is the stress test.** Times, codes, addresses and status need at least 7:1 contrast in every theme, with heavier type, and no meaning carried by tint alone. Sunlight mode turns on automatically under `prefers-contrast: more`.
8. **Color comes from the subject, through tokens.** Drop the Tailwind violet. Rebuild the palette as OKLCH scales with roles, one accent, kind colors only as small icon tints, and no raw hex in components.
9. **Type is one family** (Atkinson Hyperlegible Next) at 400/600/700. Body is 17px, nothing is under 13px, and times and codes use tabular figures.
10. **Dark mode is a night mode,** following the phone's setting, not the default brand look.
11. **Offline is normal:** "Updated 10:42", one quiet sync line, and automatic retry. No banners and no blocking spinners.
12. **Words do the decluttering:** sentence case, buttons named by their result, specific labels, errors that say how to fix the problem, and change notes that name the change.
13. **Copy the process, not a look:** a brief, an inventory, subtraction, references from real apps, building within tokens, screenshots in three themes, critique, the checklist, and a written rationale.

## Open questions for the owner

- **The "+" in the tab bar.** Apple says tab bars are for navigation, not actions. Keep "+" but make it look different from the tabs, or move adding into Plan and To-do? A quick first-click test with the group would settle it.
- **Target size.** Moving the main on-the-move actions to 56–64px makes rows taller, so fewer fit on screen. The research says it's worth it on buses and boats.
- **Accent color.** `docs/DESIGN.md` says forest green, but `src/app/globals.css` now uses Tailwind violet, which `--maybe` also uses. Which direction do you want? The research only says to choose from the subject (maps, tickets, local signage), not from a default.
- **Dark by default.** The app currently defaults to dark. The research recommends following the phone's setting.
- **Votes and reactions on ideas.** They're approved and being built. The research says to keep them small and on ideas only, with no feed or read receipts.
- **Later, not now:** push notifications, Wallet passes and a calendar feed are the web's stand-ins for Live Activities and widgets. They're new features, so they're parked unless you want them.

## Caveats on the evidence

- Several AI-slop sources are blogs selling anti-slop kits, so report 04 weights tool makers, measurements and named designers more heavily. It notes consensus as strong, moderate or weak.
- Some figures come from summaries rather than full papers: Barnard, the NHTSA guideline numbers, Hoober's 2017 per-zone values, and the sunlight contrast figures. Flighty's "about 15 states" comes from a third-party analysis. The reports say which.
- Material 3 Expressive's "4× faster" finding is Google's own research.
- The Voyroo file and line references describe `main` at 8922517 on 31 Oct 2026 and will drift.

## Relation to `docs/DESIGN.md`

`docs/DESIGN.md` is the earlier design doc. It predates this research and no longer matches the code (accent color, dark default). The redesign should rewrite it from the rules here, as the short, Voyroo-specific statement of the system: tokens with values, type roles, components and words.
