# Visual system: type, space, color, icons, motion

Condensed from `docs/design/research/03-visual-craft.md` (sources, dates and the evidence behind each rule). Tags: **[Evidence]**, **[Standard]**, **[Convention]**.

Professional UI comes from constraint applied everywhere, not decoration. The 2024–2026 work from Linear, Stripe, Radix, Geist, Atlassian, Primer and Apple converges on **hierarchy by subtraction** (dimmer chrome, fewer icons, softer separators) and **tokens named by role** (`muted`, not `gray-500`).

## Where Voyroo stands today (31 Oct 2026)

Tokens live in `src/app/globals.css` as `light-dark()` pairs with a Sunlight override (`:root[data-sunlight]`): `canvas`, `surface`, `sunken`, `ink`, `muted`, `line`, `accent`(+`-soft`, `on-accent`), `ticket`/`on-ticket`, `ok`/`todo`/`maybe` (+`-soft`), `danger`, `k-*` kind colors (+`-soft`), `shadow`. That structure is right: keep it and fix the values.

Problems to fix in the redesign (the first two, and the raw hex in trip screens, were fixed in November 2026; see `docs/design/audit-2026-11.md`):
- `--accent` is Tailwind violet (`#5b21b6` / `#a78bfa`) and `--maybe` uses the same violet, so "primary action" and "maybe" share a color. `docs/DESIGN.md` still says forest green.
- `color-scheme: dark` is the default. Research says follow the phone's setting (`prefers-color-scheme`); dark is a night mode, not the brand.
- Components bypass the tokens with raw hex and arbitrary sizes (see [anti-slop.md](anti-slop.md)).
- No type, spacing, radius or motion tokens yet; sizes are ad hoc Tailwind classes.

## 1. Type

- **One family:** Atkinson Hyperlegible Next (Braille Institute, Feb 2025; distinct Il1/0O, 7 weights, a Mono companion). A legibility pick that fits the job. [Standard] System fonts are also a professional default for utility UI; the choice just has to be deliberate. [Convention]
- **Weights 400, 600, 700 only.** Never Light or Thin (they vanish at small sizes and in sun). [Standard, HIG; Convention, Airbnb Cereal]
- **Sizes:** body 17px (iOS Body 17/22; M3 Body Large 16/24); inputs ≥16px; nothing a traveller must read under 13px. [Standard]
- **Hand-tuned scale, not a ratio** (Apple, M3 and Radix are all hand-tuned; ratios give fractional sizes and too few small steps). [Convention, Refactoring UI]
- **Line height and tracking scale inversely with size;** snap line heights to the 4px grid. Don't copy SF Pro's tracking table to another font. [Standard]
- **Numbers:** `font-variant-numeric: tabular-nums` for times, prices, countdowns and columns; proportional in prose. En dash for ranges (09:30–11:00). Chunk long codes in 3–4 characters. **To verify:** whether the self-hosted Atkinson Hyperlegible Next subset keeps the `tnum` feature; if not, set times and codes in Atkinson Hyperlegible Mono. [Convention, Butterick]
- **Line length** 45–75 characters; a 375px phone at 17px gives ~40–45, so only tablet and desktop need a cap (~34–42rem). [Convention]
- **No fluid `vw` type:** zoom narrows the viewport so text barely grows (WCAG 1.4.4, failure F94). Use rem steps and at most one heading breakpoint. [Standard]

**Type roles** (rem at a 16px root; one family; tabular figures on time, price and display)

| Role | Size / line height | Weight | Tracking | Use |
|---|---|---|---|---|
| `caption` | 13 / 18 | 600* | +0.01em | Metadata, timestamps, "Updated 10:42" |
| `secondary` | 15 / 20 | 400 | 0 | Second line of a row |
| `body` | 17 / 24 | 400 | 0 | Default text and inputs |
| `row-title` | 17 / 24 | 600 | 0 | List titles, buttons |
| `title-3` | 20 / 28 | 600 | −0.005em | Section and day headings |
| `title-2` | 24 / 32 | 700 | −0.01em | Sheet titles |
| `title-1` | 28 / 36 | 700 | −0.015em | Screen titles |
| `display` | 40 / 44 | 700 | −0.02em | The one big number: the next time on the ticket |

\*Report 03 suggests 500 for captions; Voyroo limits itself to 400/600/700, so use 600 (or 400 if it looks heavy next to body text).

## 2. Spacing and layout

- **4px base, 8px rhythm:** `0, 2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64`. Adjacent steps ≥~25% apart. [Standard, Polaris/Radix; Convention]
- **Gutter 16px** on phones, shared by titles, row text and dividers: one strong left edge. Icons hang in a fixed column. [Standard, M3/iOS]
- **Rows:** 12px vertical padding, 48px minimum height (56–64px when the row's action is used on the move). Label to value 4px; within a group 8–12px; between sections 32px; more space above a heading than below it. [Convention]
- **Proximity groups** before color or shape: within-group space ≤ half the between-group space. [Evidence/Standard, NN/g]
- **Grouping ladder:** space and alignment first, then type, then a tint, and only last a border or shadow. Remove dividers that appear without reason. [Convention, Refactoring UI; Linear 2026]

## 3. Hierarchy

- **Position, weight and color before size;** emphasize by de-emphasizing secondary information. [Convention, Refactoring UI; Linear 2026]
- **Values over labels:** "2 nights", "Gate B12". If a label stays, it's `caption`/`muted` and the value is `row-title`. [Convention]
- **One loud thing per screen.** M3 Expressive research (46 studies, 18,000+ participants): an emphasized key action was found up to 4× faster, and older users caught up with younger ones. On Today the loud thing is the marigold ticket. [Evidence, vendor research]
- **Button ladder:** solid (primary, one per screen) → tonal or outline (secondary) → text (tertiary). [Convention]
- **Text on color** uses a shade of that hue, never grey. [Convention]

## 4. Color

**Build scales in a perceptual space.** OKLCH (or CIELAB) lightness tracks perception; HSL doesn't. Fix lightness steps per hue so step distance predicts contrast (Stripe: ≥5 steps apart passes 4.5:1, ≥4 passes 3:1). Gamut-map out-of-range colors. Derive states with relative color syntax: `oklch(from var(--accent) calc(l + .1) c h)`. [Evidence/Convention, Stripe 2019; Evil Martians 2025; Linear 2024]

**Radix 12-step jobs** (use as the mental model for every hue) [Standard]

| Steps | Job |
|---|---|
| 1–2 | Backgrounds |
| 3–5 | Component fill: rest, hover, pressed |
| 6–8 | Borders: subtle, interactive, strong/focus |
| 9–10 | Solid fill and its hover |
| 11 | Low-contrast text (Lc 60 on step 2) |
| 12 | High-contrast text (Lc 90 on step 2) |

**Roles for Voyroo** (map onto the existing token names; values to be rebuilt)

| Role | Existing token | Step / target |
|---|---|---|
| Page, raised, well | `canvas` / `surface` / `sunken` | neutral 1 / 0 / 2–3; in dark, raised is lighter |
| Text, secondary text | `ink` / `muted` | step 12 ≥7:1 / step 11 ≥4.5:1 |
| Rules | `line` | step 6, ~Lc 15–30; ≥3:1 where it's a control boundary |
| Primary action, links, active tab | `accent`, `accent-soft`, `on-accent` | step 9 / 3, one accent only |
| The one loud element | `ticket`, `on-ticket` | marigold, used once per screen |
| Status | `ok`, `todo`, `maybe`, `danger` (+`-soft`) | text 11, subtle 3; always mark + word; `maybe` must not share the accent hue |
| Kinds of item | `k-*` (+`-soft`) | small icon tints only, never large fills; equalize lightness so no kind shouts |
| Focus | (add `focus-ring`) | accent step 8, ≥3:1 against neighbors |

- **Neutral first:** 8–10 slightly tinted greys, never pure-black text in light mode, plus one accent. Color is for status and the primary action; never let one color mark both tappable and plain text. [Convention; Standard, HIG]
- **The accent comes from the subject**, not a default. A trip app has maps, tickets, signage and place photos to draw on. Don't swap violet for another preset; choose and write down why. [Convention, report 04]

**Contrast policy**
- Compliance: WCAG 2.2 AA (4.5:1 text, 3:1 large text and UI boundaries, SC 1.4.11). [Standard]
- Design check: APCA (Lc 90 preferred body, 75 minimum body, 60 other text, 45 headlines, 30 placeholder/disabled, 15 dividers). WCAG 3's contrast method is still undecided (W3C draft, 10 Sep 2026). [Standard-candidate]
- Voyroo: times, codes, addresses and status ≥7:1 (Lc 90) in every theme. Apple asks for 7:1 for small custom text. [Standard]

**Sunlight mode** (`:root[data-sunlight]`, already exists; keep and tighten)
- All text ≥7:1, weight one step up, outlined chips, dividers ≥Lc 30, no meaning carried by tint, no shadows or translucency.
- Also turn it on automatically under `@media (prefers-contrast: more)`, keeping the manual toggle; ambient-light sensing isn't reliable on the web.
- Evidence: direct sun is ~80,000–200,000 lux and phone contrast can fall below 2:1; bright light shrinks the dark-on-light advantage, so size and contrast magnitude matter more than polarity. [Evidence, Dobres et al.; display studies]

**Dark mode is a night mode**
- Never invert. Dimmer bases, brighter foregrounds, raised layers lighter than the base ("the higher the elevation, the lighter the surface"). Lower accent chroma and raise lightness. Dim white-background photos slightly. Base near `#121212`-class, not pure black. [Standard, HIG/Atlassian/M3]
- Follow `prefers-color-scheme` by default; keep the Display override in Trip settings.

## 5. Radius, borders, elevation

- **Radius by role:** `sm` 6 (chips), `md` 10 (buttons, inputs), `lg` 16 (sheet tops, image tiles), `full` (pills, avatars). Pick one personality. [Standard, Polaris; Convention]
- **Nested rule:** inner radius = outer − padding (− border). Near the screen edge, capsules or concentric shapes (Apple WWDC25). [Convention; Standard]
- **Hairlines over shadows:** 1px dividers inset to the text start in `line`. Input outlines need 3:1. [Standard, WCAG 1.4.11]
- **A shadow means "this floats."** Three levels at most: `flat` (canvas, lists), `raised` (border or one soft shadow), `overlay` (sheets, toasts: two-layer shadow in light, lighter surface in dark). Light from above, tint shadows toward the neutral. [Standard, Atlassian; Convention]

## 6. Icons

- **One family** (`src/ui/Icon.tsx`), one stroke. Lucide-style rules: 24px grid, 2px stroke, round caps and joins. Keep visual stroke constant across sizes (size-specific strokes or `vector-effect: non-scaling-stroke`). Don't scale 24px icons up to 48px; place them in a shape. [Standard, Lucide; Convention]
- **Center icons on the x-height** of the adjacent text and match its weight. [Standard, HIG SF Symbols]
- **Labels:** only home, search and print are near-universal. Tabs always have labels. If an icon takes more than 5 seconds to think of, use a word. [Evidence, NN/g 2014]
- **When not to use icons:** not as decoration on rows or headings; not icon-only for uncommon actions. Kind icons on rows are fine: they speed recognition. [Convention, Linear 2026]

## 7. Imagery

- **Information, not decoration:** a photo of the actual hotel entrance or the post's thumbnail is content; a generic beach hero is decoration that users skip. [Evidence, NN/g]
- **Fixed ratios per slot:** 1:1 thumbnails and avatars, 3:2 or 4:3 places, 16:9 video, 4:5 or 9:16 social posts. Reserve space (`width`/`height` or `aspect-ratio`) to keep CLS ≤0.1. [Standard, web.dev]
- **Placeholders:** a dominant-color background or tiny blurred preview, fading in over 200–300ms; never one spinner per image. Cache for offline. [Convention]
- **Text on photos:** a scrim, a calm area behind the text, never text baked into images. Sunlight mode hides photos behind text. [Standard, HIG Wallet]

## 8. Motion

| Token | Value | Use |
|---|---|---|
| `fast` | 100ms | Press, toggle feedback |
| `base` | 200ms | Fades, exits |
| `slow` | 300ms | Sheet enter |
| `ease.standard` | cubic-bezier(.2, 0, 0, 1) | Default |
| `ease.enter` | cubic-bezier(.05, .7, .1, 1) | Entering |
| `ease.exit` | cubic-bezier(.3, 0, .8, .15) | Exiting |

- Entering slightly slower than exiting; ≥500ms feels cumbersome. [Evidence/Convention, NN/g 2020; Standard, M3]
- Purposeful, brief, interruptible, optional; don't animate frequently used controls. [Standard, HIG Motion]
- Under `prefers-reduced-motion: reduce`, everything becomes an opacity fade ≤150ms or an instant change; keep state feedback. [Standard, WCAG 2.3.3]
- Never animate layout properties, staggered first-load reveals, anything that blocks input, looping ambient motion, or a change signalled by motion alone.

## 9. Tokens and enforcement

Standardize in this order [Convention]:
1. Color roles (~15–20), both themes plus Sunlight, every text/background pair contrast-checked.
2. Type roles (the table above).
3. Spacing (≤12 steps).
4. Radius (3 + full).
5. Elevation (flat, raised, overlay).
6. Motion (3 durations, 3 easings).
7. Components built from tokens only: list row, button (3 emphasis levels), sheet, chip, input, toast, empty state. They live in `src/ui/`.

Then enforce: no raw hex, px or ms in component code (lint or a CI grep), a contrast-pair check for both themes and Sunlight, and one do/don't line per token in `docs/DESIGN.md` once it's rewritten.
