# 04: The "AI slop" UI aesthetic, and how professional design teams work

Research date: 31 Oct 2026. Scope: Voyroo, a phone-first group-trip PWA (Next.js, Tailwind). No project files were changed.

## Summary

- **The look has a cause.** Anthropic calls it *distributional convergence*. With no direction, a model drifts to the statistical middle of the web, which means Inter, purple-on-white gradients, identical rounded cards and safe layouts [A1]. Adam Wathan joked that Tailwind UI's `bg-indigo-500` buttons are why "every AI generated UI" is indigo [W]. Adrian Krebs scored 1,590 Show HN landing pages against 16+ deterministic CSS/DOM checks. 22% hit four or more patterns and 32% hit two or three [K].
- **Strong consensus** (many independent critics plus tool makers' own guidance) covers these tells: purple/indigo gradients, default fonts, a card for everything with one radius and one shadow, a centered hero with a badge and icon-topped feature cards, glassmorphism, glows on dark backgrounds, emoji used as icons, all-caps eyebrow labels, decorative stat rows, fade-up motion on every section, low-contrast grey text, and screens that only cover the happy path.
- **The defaults have moved.** By 2026 Anthropic's own frontend-design skill also lists the *"tasteful"* look as a cliché: cream background, serif display and terracotta accent, or near-black with an acid-green accent [A2]. Replacing one preset with another doesn't fix anything. The fix is making each choice from the subject, the user and the context.
- **Pros copy the process, not the look.** Vercel says agents copy what shipped without knowing why. Its fix is to write decisions down, enforce the clear rules with linters, and review everything else against written guidance [V2]. Professional teams start from what the user needs [GOV]. They constrain work with tokens, critique against stated goals [NN-C], friction-log real journeys [ST], and test on real devices.
- A single pattern proves nothing [K]. Each item below is fine *when chosen on purpose for a reason*.

---

## Part A: Tell-tale patterns of AI-generated UI

Consensus: **S** = strong (3+ independent sources, including a tool maker or a measurement); **M** = moderate (2–3 sources); **W** = weak or folk wisdom.

| # | Pattern | Why it reads as AI / low quality | Principle violated | What pros do instead | Sources |
|---|---|---|---|---|---|
| 1 | Purple/indigo/violet accents; purple-to-blue gradients | It's the most-cited tell. The Tailwind indigo default got copied into training data and then came back out of the models | Colour should carry brand and function | Derive the palette from the subject (for a trip: photos, maps, tickets). One accent per view. Name tokens by role | **S** [W][A1][K][P][O][B][KC] |
| 2 | Gradient text, gradient washes behind sections | Harder to read. It's the "AI startup" signature | Emphasis should come from size and weight, not effects | Solid text colours. Use gradients only as functional scrims over photos | **S** [P][I][A2] |
| 3 | Dark navy/near-black with neon accents, glows, and dark mode always on | Krebs found low-contrast grey body text in these dark themes. When everything glows, nothing stands out | Theme should follow the user's setting and context. A glow is not an affordance | Respect `prefers-color-scheme`. No glow as the primary affordance. Use dark only on purpose | **S** [K][P][O][B][HN] |
| 4 | Low-contrast grey text | This predates AI (Marks, 2016) but AI amplifies it. It fails outdoors | WCAG 1.4.3 (4.5:1) | Body text ≥4.5:1, aiming for 7:1 for sunlight use. Grey only for truly optional text | **S** [KM][P][K] |
| 5 | Hard-coded hex values / arbitrary Tailwind values that bypass tokens | A code-level tell. One-off colours drift from the theme and break dark and high-contrast modes | The design system is the single source of truth | Tokens-only colours. Lint arbitrary values and `className` colour overrides | **M** [V2][O2][B][KC] |
| 6 | Second-generation "tasteful" defaults: cream + serif + terracotta, near-black + acid green, broadsheet hairlines | New convergence points that models (and anti-slop skills) settled on in 2025–26 | Distinctiveness should come from the subject | Don't pick an aesthetic preset. Let the content and context decide | **M** [A2][HN][I] |
| 7 | Inter/Roboto/system font with no type scale; recurring "alt" fonts (Space Grotesk, Instrument Serif, Geist) | It shows that no choice was made | Type carries voice and hierarchy | For a phone utility, a system font *can* be correct, but choose it on purpose and define 4–6 roles | **S** [A1][K][KC][O] |
| 8 | Tracked all-caps eyebrow labels above headings; a badge/chip above the H1 | Repeats the heading. Template chrome | Every label must carry information | Delete it, or fold real data (date, category) into the heading | **S** [A2][P][K][I] |
| 9 | One headline word set in italic, serif or colour | Adds a second voice to the line, often on the wrong word | Emphasis only where the message needs it | At most once per page, and only for meaning | **M** [K][A2][P][HN] |
| 10 | Weight inflation (bold/extrabold everywhere), heavy tracking, arbitrary 10–11px sizes | Hierarchy flattens | Emphasise by de-emphasising [RUI] | 2–3 weights and a fixed scale. Leave tracking alone | **M** [B][KC][RUI] |
| 11 | Monospace micro-labels, middle-dot meta strings, arrows (→ ↗) appended to links, 01/02/03 markers | Technical cosplay. Decoration pretending to be information | Typographic devices must mean something | Mono only for codes and IDs. Numbers only for real sequences. Use a labelled icon for external links | **M** [A2][P][K] |
| 12 | Every block in a rounded card with border and soft shadow, one radius everywhere ("SaaS card kit") | Hierarchy flattens and you can't tell what's tappable | Cards are for collections people browse. Shape should signal role | Group with spacing and headings. Vary radius by component. Use cards only as containers for interaction [O] | **S** [A2][P][O][I][KC] |
| 13 | Cards nested in cards; borders around every block | Noise. Grouping stops meaning anything | Proximity and common region (Gestalt) | One level of containment. Use whitespace and dividers | **M** [I][P][O] |
| 14 | Coloured left/top stripe on cards | A designer told Krebs it's as reliable a tell as em-dashes are in AI text | A coloured edge should mean status | Reserve it for warnings, errors and items that need action | **M** [K][P][I] |
| 15 | Centred hero + badge + 3–6 identical icon-topped feature cards; bento grids | The median landing page. Lists facts instead of making a case | Narrative and one primary message | Lead with the subject's most characteristic element. Bento only as a supporting section | **S** [K][A2][O][CB] (bento contested) |
| 16 | Decorative stat tiles, big-number-plus-small-label heroes, round-number metrics | Vanity numbers that lead to no decision. They read as fake | Nielsen #8: minimalist design. Information should support a decision | Show a number only where it changes what the user does, and put it in context | **S** [K][A2][P] |
| 17 | Over-stuffed "dashboard" screens with everything visible at once | Competing actions. No primary task | Progressive disclosure. "Do less" [GOV] | One primary job per screen. Put the rest one tap away | **M** [KC][P][V2] |
| 18 | Pills, badges and chips everywhere ("status-chip soup"); NEW/BETA/LIVE pulsing dots | Markers that mean nothing | Consistent semantic colour | Badges only for real status, with one meaning per colour | **M** [P][I] |
| 19 | Emoji as icons or bullets | Renders differently on every device, can't be styled, reads like chat | One coherent icon system | One icon set (on iOS, SF Symbols-like), or no icons at all | **S** [K][P][agent rule sets] |
| 20 | An icon on every line; icon-in-tinted-tile before each heading; unlabelled icon buttons | Icons are ambiguous without labels | Recognition over recall; accessible names | Use icons only where they speed recognition. Label them | **M** [I][NN-I][V1] |
| 21 | ✨ sparkles meaning "AI" | NN/g (n=107): **no** participant linked sparkles to AI. Most read them as favourite/save or effects | Clear signifiers | Label the action ("Find places to stay"). The icon is secondary | **M** [NN-S] |
| 22 | Glassmorphism/backdrop-blur everywhere | Lowers contrast over changing backgrounds. Costs performance | Use the material only where it has a job | Blur only on overlays above content (sheets, nav bars), and verify contrast | **S** [K][P][NN-G][B] |
| 23 | Fade-and-slide-up on every section; hover lift/scale on every card; bounces | Slows people down. Decoration becomes noise | Animate with purpose. The more often an action happens, the less it should animate | No motion on frequent actions. ≤200–300ms. Honour reduced motion | **S** [A2][P][EK][RF][B][V1] |
| 24 | Generic copy: vague headlines, generic CTAs ("Get started", "Continue"), "seamlessly/elevate/unlock" | Could describe any product | Specific, user-centred language: Verb + Noun | Write from the user's situation. Button labels name the exact action | **M** [KC][I][V1][V2]. *The specific word list is **W**: it comes from AI-writing discourse and isn't a measured UI tell* |
| 25 | Happy path only: missing empty, loading, error, offline and permission states; polite errors that don't say what went wrong | Demo-ware | Design every reachable state | Each empty state gets one clear next action. Errors state the fix | **S** [V2][KC][TD][V1][B] |
| 26 | Placeholder content: lorem ipsum, initials boxes, placeholder-only labels | Hides layout problems | Content first | Design with real, messy data (long names, zero items, 40 items) | **M** [L][P][I][O] |
| 27 | Unmodified default kit (shadcn/Tailwind defaults) | Everyone's AI output starts from the same kit | Own your system | Customise tokens and components deliberately | **M** [K][W] |

**What the critics themselves caution:** Krebs reports 5–10% false positives and says the slop is uninspired rather than bad [K]. HN commenters disagree on whether "slop" is a meaningful category [HN]. Kosta Canatselis sums the problem up as "design with no author" [KC]. Several blogs selling anti-slop kits repeat each other, so the counts above are weighted toward tool makers, measurements and named designers.

---

## Part B: How professional design teams work (a process an AI design agent can follow)

### Step-by-step process

1. **Classify the request.** Vercel's agent sorts each request into Shape, Implement, Review, Copy or Harden, so an audit doesn't turn into a redesign [V2].
2. **Start from the user's job and context, not pixels** [GOV: "Start with user needs", "Understand context"]. Write a 5-line brief: who the user is, where they are (on a phone, one-handed [SH], in sunlight, on roaming data, in a hurry, in a group), the job, the *one* primary action, and what success looks like.
3. **Inventory content and states with real data.** Cover the longest place name, zero items, 40 items, an unbooked night, offline, and a different timezone [V1 content handling][V2][L].
4. **Gather 3–6 references from shipped products** (Mobbin, Page Flows, screenshots of apps that do the *job* well, e.g. a wallet boarding pass for "what's next", a transit app for "get me there"). Write one line per reference on *why* it works [EK] [O: give references/mood boards]. Reference behaviour and hierarchy, not a look.
5. **Do a plan pass inside the design system.** Name the tokens by role, the type roles, and existing components to reuse, and sketch the layout as an ASCII wireframe at low fidelity [A2]. Any new token needs a written reason [V2][DTCG].
6. **Do a review pass against the brief.** Strike every Part A default you find and remove one element [A2]. Write the rationale as *decision → reason → evidence*, using observable statements rather than adjectives like "clean" or "intuitive" [V2].
7. **Build, then look.** Render at 375×812 and 390×844 in light, dark and high-contrast modes, take screenshots and self-review them [O]. Run deterministic checks (contrast, target size, token lint). Linters can't be argued with; models can [I].
8. **Critique as a separate role.** Use an adversarial reviewer sub-agent [I]. Each comment must tie to a brief goal: *goal → observation → impact → suggestion* [NN-C]. Match the critique format to the need, e.g. a standard critique for specific questions or a silent written one for volume [FG]. Spar early, not just before shipping [AT].
9. **Run a heuristic evaluation** against Nielsen's 10 heuristics and rate severity 0–4 [NN-H].
10. **Friction-log one critical journey as a specific persona on a real phone** [ST]. For example: "Maya at the airport kerb, 5% battery, needs the hotel address for the taxi." Mark each step smooth, rough or broken.
11. **Ask for a human test.** Five users find most problems [NN-5]. The agent can't do this itself, so it should ask the owner to hand the phone to two or three trip-mates for five minutes.
12. **Run the pre-ship QA checklist** below.
13. **Close the loop.** Commit the rationale to the repo. Turn repeated review comments into lint rules or guideline entries, with a human approving each one [V2]. Make things open [GOV].

### How respected teams write down their design principles

- **GOV.UK** (2012, updated Apr 2025): 11 principles written as instructions with reasons, e.g. "Do the hard work to make it simple" and "Be consistent, not uniform" [GOV].
- **Airbnb DLS** (Karri Saarinen, 2016): four principles (Unified, Universal, Iconic, Conversational) backed by a shared component library [AB].
- **Stripe:** a quality rubric for about 15 essential journeys. Cross-functional teams friction-log and score each journey quarterly against a company-wide scoreboard (Katie Dill, Lenny's Podcast, 15 Oct 2023) [ST].
- **Linear:** the Linear Method favours opinionated software with strong defaults. Its "Quality Wednesdays" and feature roasts are reported secondhand [LM].
- **Vercel:** decisions live in the repo with stable rule IDs. Clear rules are linted, judgment calls get agent guidance, and evals check whether the guidance generalises [V2]. Its public **Web Interface Guidelines** are 100+ checks across accessibility, focus, forms, animation, typography, content, touch, safe areas, theming, i18n and copy [V1]. The roots are in Rauno Freiberg's 2023 guidelines [RF].

### Taste, as a practice

Study great work and say *why* it works. Make things often. Get critique from people better than you. Expect your taste to be ahead of your skill for a while [EK]. For an agent, that means keeping a log of what it tried and rejected, and stating its reasons. "Looks modern" is not a reason.

### Pre-ship design QA checklist (44 checks)

**Purpose and hierarchy**
1. The screen's one primary job is written down, and the primary action is the most prominent element.
2. Nothing on the screen is there without a user need: every element has a job.
3. Every number shown changes a decision (no vanity stats).
4. Labels don't repeat headings; there are no eyebrows or badges above titles.
5. Navigation isn't duplicated (e.g. a quick-action hub that repeats the tab bar).

**System and tokens**
6. No raw hex or arbitrary colour values in components; tokens only.
7. Spacing sits on the 4px/8px scale. No arbitrary `px` sizes.
8. Radius varies by component role (input, button, sheet), not one value everywhere.
9. Shadows only where something is actually elevated.
10. Existing components are reused; any new one is justified in the rationale.

**Type**
11. A defined scale of 4–6 roles; no ad-hoc `text-[11px]`.
12. At most 2–3 weights in use; bold is the exception.
13. Body text ≥16px on mobile, and no text under 12px.
14. Tabular numerals for times, prices and dates [V1].
15. Headings balanced and long text clamped or truncated safely (`min-w-0`) [V1].

**Colour and contrast**
16. Body text ≥4.5:1; aim for 7:1 for outdoor use.
17. UI components and focus rings ≥3:1.
18. One accent per view, and colour encodes meaning consistently.
19. No gradient text and no glow used as an affordance.
20. Light, dark and high-contrast themes all checked.

**Layout and containers**
21. No cards inside cards; grouping done with spacing and headings.
22. Coloured borders and stripes reserved for status.
23. Works at 320, 375 and 430px wide with no horizontal scroll [V1].
24. Safe-area insets respected for fixed bars [V1][B].

**Icons and imagery**
25. One icon set, no emoji used as icons.
26. Every icon-only control has an accessible name and, where meaning is ambiguous, a visible label [NN-I].
27. No ✨ standing in for a label.
28. Real photos with set dimensions (no layout shift) and lazy-loading below the fold [V1].

**Motion**
29. Each animation has a stated purpose.
30. Frequent actions have no animation; feedback runs ≤200ms [B][EK].
31. `prefers-reduced-motion` honoured; only transform and opacity are animated; no `transition: all` [V1].

**Copy**
32. Buttons say Verb + Noun ("Copy confirmation", "Get directions").
33. Errors say what happened and how to fix it [V1][NN-H].
34. No filler marketing words; the copy is written in the voice of the people on the trip.

**States**
35. Empty, loading (skeletons), error, offline, permission and very-long-content states all designed [V2].
36. Each empty state has one clear next action [B].
37. Destructive actions offer undo or confirmation proportional to the impact [V2].

**Mobile and touch**
38. Touch targets ≥44×44pt (Apple HIG) and never under WCAG's 24px minimum [WCAG].
39. Primary actions reachable by thumb [SH].
40. Inputs use the right `type`/`inputmode`, paste is never blocked, and zoom is never disabled [V1].

**Accessibility and robustness**
41. Visible `:focus-visible` on every control; semantic buttons and links [V1].
42. Async updates announced in a live region [V1].
43. Dates and numbers formatted with `Intl` in the trip's timezone [V1].

**Final gate**
44. Screenshots reviewed on a real phone outdoors, with a friction log of one critical journey attached.

---

## Slop patterns observed in Voyroo (read-only)

Paths are relative to `C:\Dev\Vacations\vacation-calendar\src\`.

- **Hard-coded Tailwind violet/indigo.** `features/plan/Plan.tsx`:106, 114, 149, 175, 453 and 843 use `#a78bfa` (Tailwind violet-400). Lines 406, 415, 738, 749 and 789 use `#5b21b6` (violet-800). Line 793 uses `#8b5cf6`. `features/today/Today.tsx`:303 uses `#c4b5fd`. There are 63 hex literals in Plan.tsx and 16 in Today.tsx. The `--accent` token itself is Tailwind violet (`app/globals.css`:26), and `--k-stay` is indigo (:40).
- **Duplicated dark-navy glass hero that is always dark.** It appears at Today.tsx:54–105 and Plan.tsx:88–181. Both use `bg-[#0f1322]`, double gradient scrims (Today 65–66, Plan 99–100) and `backdrop-blur` pills (Plan 105, 112, 132, 147, 173; Today 85, 98, 303).
- **Google Maps forced dark with a CSS invert filter.** Plan.tsx:436 and 774; Today.tsx:202 and 289. The map colours become wrong, which hurts legibility outdoors.
- **Decorative stat tiles.** Plan.tsx:336–389 shows Days / Planned Stops / Bookings / Saved Places as icon tiles with a big number. The "Saved Places" count adds posts (:383), so the number is mislabelled.
- **Rainbow 5-circle quick-action hub that duplicates navigation.** Plan.tsx:183–291 and Today.tsx:42–48 and 108–122. It adds 10px count badges (Plan 201, 221, 235, 259, 284) and truncated 11px labels.
- **A card around everything.** `rounded-3xl` + border + `shadow-lift` appear on almost every section (Today 160, 210, 247, 445, 486; Plan 515, 657, 724, 872, 922). Cards are also nested inside cards (Plan 567, 631, 811, 943).
- **Icon tiles before headings.** Today 164 and 251; Plan 665.
- **✨ standing in for AI, plus a gradient wash.** Sparkles at Plan 167 and 666 and Today 430. Gradient wash at Plan 661. The suggestion chips are generic (Plan 697–701: "Budget tips", "Local tips").
- **Template typography.** Arrows are appended to links ("Maps ↗" at Plan 833, "Open full map →" at 865) and there's a middle-dot meta string at 950. Weights are inflated: Plan uses `font-extrabold` 16 times and `font-bold` 24 times. Plan also has 14 arbitrary `text-[10/11px]` sizes.
- **Redundant date badge next to a heading that shows the same date.** Plan 984–989.
- **A label that misrepresents its contents.** "Top Saved Places" also includes unsaved stays and flights (Plan 51–58, 466). It also has hover-zoom images (491, 903).
- **Undersized targets.** `min-h-8` (32px) at Plan 424 and 538, and `min-h-9` (36px) in many places, all below the 44pt guideline.
- **Comments show a mock-up was imitated, not a job designed.** "matching reference image/mockup" at Today 52 and 107 and Plan 183, 462 and 654. Plan's header comment at 20–22 describes a "dashboard with … stat cards … widgets".
- **Worth keeping.** The Ticket component (Today 354–401) is product-specific and good: one loud element with real actions (Directions, Call, WhatsApp, copy confirmation). Other keepers are the actionable no-stay empty state (Today 421–439), the high-contrast theme (`globals.css`:67–93), and the aria labels on the day strip.

---

## Sources

- **[A1]** Rajasekaran, Wei, Bricken et al. (Anthropic), "Improving frontend design through Skills", 12 Nov 2025. https://claude.com/resources/articles/improving-frontend-design-through-skills
- **[A2]** Anthropic, `frontend-design` SKILL.md (2026 revision). https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md
- **[W]** Adam Wathan on X, 7 Aug 2025. https://x.com/adamwathan/status/1953510802159219096
- **[K]** Adrian Krebs, "Scoring Show HN submissions for AI design patterns", 20 Apr 2026. https://www.adriankrebs.ch/blog/design-slop/
- **[HN]** Hacker News, "Slightly reducing the sloppiness of AI generated front end", 2026. https://news.ycombinator.com/item?id=48504912
- **[P]** Paralect, "Signs of AI slop in design: 21 patterns", 2026. https://www.paralect.com/blog/signs-of-ai-slop-in-design
- **[KC]** Kosta Canatselis, "Spot the Slop", 23 Jul 2026. https://www.mania.design/blog/spot-the-slop-a-ui-designers-guide-to-fixing-ai-defaults/
- **[TD]** Tanya Donska, "The New Skeuomorphism", Built In, 11 Jun 2026. https://builtin.com/articles/ai-design-slop-era
- **[I]** Paul Bakaus, Impeccable (skill and anti-pattern detector, 2025–26). https://impeccable.style
- **[B]** ibelick, `baseline-ui` SKILL.md. https://github.com/ibelick/ui-skills/blob/main/skills/baseline-ui/SKILL.md
- **[O]** OpenAI, "Designing delightful frontends with GPT-5.4", Mar 2026 (via The Decoder, 22 Mar 2026). https://developers.openai.com/blog/designing-delightful-frontends-with-gpt-5-4
- **[O2]** OpenAI Cookbook, GPT-5.1/5.2 prompting guides ("tokens-only colors"). https://cookbook.openai.com/examples/gpt-5/gpt-5-2_prompting_guide
- **[L]** Lovable docs, "Prompting best practices". https://docs.lovable.dev/prompting/prompting-one
- **[V1]** Vercel, Web Interface Guidelines. https://github.com/vercel-labs/web-interface-guidelines
- **[V2]** John Phamous (Vercel), "Teaching agents product design at Vercel", 25 Jun 2026. https://vercel.com/blog/teaching-agents-product-design-at-vercel
- **[RF]** Rauno Freiberg, "Invisible Details of Interaction Design", Jul 2023. https://rauno.me/craft/interaction-design
- **[EK]** Emil Kowalski, "You don't need animations" and "Developing taste". https://emilkowal.ski/ui/you-dont-need-animations and https://emilkowal.ski/ui/developing-taste
- **[NN-S]** Kate Kaplan (NN/g), "The Proliferation and Problem of the ✨ Sparkles ✨ Icon", 20 Sep 2024. https://www.nngroup.com/articles/ai-sparkles-icon-problem/
- **[NN-G]** NN/g, "Glassmorphism: Definition and Best Practices". https://www.nngroup.com/articles/glassmorphism/
- **[NN-I]** Aurora Harley (NN/g), "Icon Usability", 2014. https://www.nngroup.com/articles/icon-usability/
- **[NN-H]** Jakob Nielsen, "10 Usability Heuristics", 1994, updated 2020/2024. https://www.nngroup.com/articles/ten-usability-heuristics/
- **[NN-C]** Sarah Gibbons (NN/g), "Design Critiques", 23 Oct 2016. https://www.nngroup.com/articles/design-critiques/
- **[NN-5]** Jakob Nielsen, "Why You Only Need to Test with 5 Users", 2000. https://www.nngroup.com/articles/why-you-only-need-to-test-with-5-users/
- **[KM]** Kevin Marks, "How the Web Became Unreadable", Wired Backchannel, Oct 2016. https://kevinmarks.com/unreadable-web
- **[CB]** Creative Boom, "10 trends creatives are so over in 2026". https://creativeboom.com/insight/10-trends-creatives-are-so-over-in-2026/
- **[RUI]** Adam Wathan and Steve Schoger, *Refactoring UI*, 2018. https://www.refactoringui.com/
- **[FG]** Noah Levin (Figma), "How to run a design critique", 4 Sep 2019. https://www.figma.com/blog/design-critiques-at-figma/
- **[AT]** Atlassian Team Playbook, "Sparring". https://www.atlassian.com/team-playbook/plays/sparring
- **[ST]** Stripe, "How we use friction logs" (Mike Bifulco), https://dev.to/stripe/how-we-use-friction-logs-to-improve-products-at-stripe-i6p ; Katie Dill on Lenny's Podcast, 15 Oct 2023, https://www.lennysnewsletter.com/p/building-beautiful-products-with
- **[GOV]** GDS, "Government Design Principles", 2012, updated 2 Apr 2025. https://www.gov.uk/guidance/government-design-principles
- **[AB]** Karri Saarinen, "Building a Visual Language" (Airbnb DLS), 2016. https://medium.com/airbnb-design (original essay)
- **[LM]** Linear, "The Linear Method". https://linear.app/method ; Figma blog interview, https://www.figma.com/blog/the-linear-method-opinionated-software/
- **[DTCG]** W3C Design Tokens CG, first stable spec 2025.10, 28 Oct 2025. https://www.w3.org/community/design-tokens/2025/10/28/design-tokens-specification-reaches-first-stable-version/
- **[WCAG]** W3C, Understanding SC 2.5.8 Target Size (Minimum). https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
- **[SH]** Steven Hoober, "How Do Users Really Hold Mobile Devices?", UXmatters, Feb 2013. https://www.uxmatters.com/mt/archives/2013/02/how-do-users-really-hold-mobile-devices.php
- Reference libraries: Mobbin (https://mobbin.com) and Page Flows (https://pageflows.com).

*Verification notes:* I couldn't load the Linear Method page or Airbnb's original essay, so those points rely on secondary sources. Stripe's friction-log post returned a 404 at fetch time, so the summary relies on search excerpts. Bakaus's reported 2026 percentages for cream backgrounds and contrast failures come from secondary summaries of an X post and are not used above.
