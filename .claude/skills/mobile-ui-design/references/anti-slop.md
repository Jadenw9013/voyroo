# Generic AI UI patterns, and what professionals do instead

Source: `docs/design/research/04-ai-slop-and-pro-process.md` (full table with sources and consensus levels). Supporting evidence from reports 02 and 03.

## Why the look happens

With no direction, a model drifts to the statistical middle of the web: Inter, purple-on-white gradients, identical rounded cards, safe layouts. Anthropic calls this *distributional convergence*. Swapping in another preset ("tasteful" cream + serif + terracotta, near-black + acid green) is the same failure one level up. The fix is a process: every choice comes from the subject, the people and the situation, and is written down with a reason.

One pattern alone proves nothing. Each item below is fine when chosen on purpose, for a stated reason. Without that reason, remove it.

## Patterns, why they fail, what to do instead

| Pattern | Why it reads as generic or low quality | Do instead |
|---|---|---|
| Purple/indigo/violet accent; purple-to-blue gradients | The most-cited tell. Tailwind's indigo default went into training data and came back out | Derive color from the subject (maps, tickets, paper, local signage). One accent per view. Tokens named by role |
| Gradient text, gradient washes behind sections | Harder to read; "AI startup" signature | Solid text. Gradients only as a functional scrim behind text on a photo |
| Always-dark navy with neon accents and glows | Low-contrast grey text; when everything glows nothing stands out | Follow `prefers-color-scheme`. Dark mode is a night mode with dim bases, not a brand |
| Low-contrast grey text | Fails WCAG and fails outdoors | ≥4.5:1 body; ≥7:1 for times, codes, addresses. Muted only for truly optional text |
| Hard-coded hex or arbitrary Tailwind values | Drifts from the theme; breaks dark and Sunlight | Tokens only; lint for raw values |
| `filter: invert()` on maps or images | Wrong colors, poor legibility; a hack, not a theme | Use a map style that matches the theme, or leave the map in its natural colors |
| Glassmorphism / `backdrop-blur` over content | Contrast changes with whatever is behind; costs performance; fails in sun | Solid bars and sheets. Blur only on an overlay above content, with contrast verified |
| A rounded, bordered, shadowed card around every block; one radius everywhere | Hierarchy flattens; can't tell what's tappable | Group with space, alignment and headings. Hairline dividers inset to the text. Radius by role |
| Cards nested in cards; a border around every block | Grouping stops meaning anything | One level of containment at most |
| Colored left or top stripe on cards | Decorative; reads as a status that isn't one | Reserve colored edges for warnings and items needing action |
| Eyebrow labels (small caps above a heading), badges above titles | Repeats the heading; template chrome | Delete, or fold the real fact (date, kind) into the heading |
| Decorative stat tiles; big-number heroes; counts nobody acts on | Vanity numbers; often mislabelled | Show a number only if it changes what someone does, in context ("2 nights with nowhere to stay") |
| Dashboard home: everything visible at once | No primary task; competing actions | One job per screen; the rest one tap away |
| Pills and badges everywhere; pulsing NEW/LIVE dots | Markers that mean nothing | Badges only for real status, one meaning per color, mark + word |
| Emoji as icons or bullets | Renders differently per device; can't be styled; reads like chat | One icon family (`src/ui/Icon.tsx`) at one stroke, or a word |
| An icon on every row or heading; icon tiles before headings; unlabelled icon buttons | Icons are ambiguous; only home, search and print are near-universal | Icons only where they speed recognition (kind of item, tab bar), always labelled |
| ✨ sparkles for AI | NN/g: no participant linked sparkles to AI | Label the action ("Ask about this place") |
| Arrows appended to links ("Maps ↗", "Open →"), middle-dot meta strings, mono micro-labels, 01/02/03 markers | Decoration pretending to be information | External links get a labelled external icon. Mono only for codes |
| `font-extrabold` everywhere; tracking; 10–11px text | Hierarchy flattens; unreadable outdoors | 400/600/700 only, a fixed scale, nothing under 13px |
| One word in a heading set in italic, serif or color | Second voice on the wrong word | At most once per page, and only when the meaning needs it |
| Fade-up on scroll, hover lifts, bounces, staggered reveals | Slows people down; noise | No motion on frequent actions; purposeful transitions ≤300ms |
| Generic copy: "Get started", "Explore", "Seamless", "Elevate", "Unlock", "Budget tips" chips | Could describe any product | The traveller's words: "Get directions", "Call the hotel", "Show the booking" |
| Happy path only | Demo-ware | Design empty, loading, error, offline, cancelled, delayed, long content first |
| Placeholder content and placeholder-as-label | Hides layout problems; vanishes while typing | Real, messy trip data; persistent labels above fields |
| Unmodified kit defaults | Everyone's output starts from the same kit | Own the tokens and components; change them deliberately |
| A quick-action hub that repeats the tab bar | Duplicate paths; more to scan | One canonical path per destination |
| "Matches the reference image" as the design goal | Imitates a look instead of serving a job | Start from the brief: who, where, job, one action |

## Found in Voyroo on 31 Oct 2026 (snapshot, `main` at 8922517)

Re-checked in November 2026 after the mobile pass: see `docs/design/audit-2026-11.md` ("Earlier generic-UI findings, re-checked") for what's fixed and what's left.

From report 04. Line numbers will drift; re-check before acting.

- **Violet everywhere.** `--accent` is `light-dark(#5b21b6, #a78bfa)` (Tailwind violet-800/400) in `src/app/globals.css:26`, and `--k-stay` is indigo (`:40`). That contradicts `docs/DESIGN.md`, which says forest green. About 60 lines in `src/features` hard-code hex, most of them in `plan/Plan.tsx` (`#a78bfa`, `#5b21b6`, `#8b5cf6`) and `today/Today.tsx`.
- **An always-dark navy "glass" hero**, duplicated on Today (~54–105) and Plan (~88–181), with `bg-[#0f1322]`, double gradient scrims and `backdrop-blur` pills.
- **Google Maps forced dark with a CSS invert filter** (Plan ~436 and ~774; Today ~202 and ~289).
- **Decorative stat tiles** on Plan (~336–389: Days / Planned Stops / Bookings / Saved Places). "Saved Places" also counts posts, so it's mislabelled.
- **A rainbow five-circle quick-action hub** that repeats the navigation (Plan ~183–291, Today ~42–48 and ~108–122), with 10px count badges and truncated 11px labels.
- **A card around everything** (`rounded-3xl` + border + `shadow-lift`), with cards nested in cards.
- **Icon tiles before headings; ✨ for AI with a gradient wash; generic suggestion chips** ("Budget tips", "Local tips").
- **Template typography:** "Maps ↗", "Open full map →", middle-dot meta strings, 16 uses of `font-extrabold`, and 14 arbitrary 10–11px sizes on Plan.
- **A redundant date badge** beside a heading that already shows the date; "Top Saved Places" that also lists stays and flights; hover-zoom images.
- **Undersized targets:** 32–36px buttons.
- **Code comments that say the goal was to match a mock-up** or a "dashboard with stat cards and widgets".

### Worth keeping

- The **Next ticket** on Today: product-specific, one loud element with real actions (Directions, Call, WhatsApp, copy confirmation).
- The **actionable empty state** for a night with no stay.
- The **Sunlight (high-contrast) theme** in `globals.css`.
- The **aria labels** on the day strip, and the Undo toasts.
