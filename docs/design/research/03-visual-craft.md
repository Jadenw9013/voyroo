# 03 · Visual design craft for mobile product UI (2024–2026)

*Research brief for the Voyroo redesign. Compiled 31 Oct 2026, primary sources preferred.*

## Summary

Professional-looking UI comes from constraint applied everywhere, not from decoration:

- a hand-tuned type scale of 6–8 roles in one family;
- a 4px-based spacing scale where related things sit closer than unrelated ones;
- a neutral-first palette built in a perceptual colour space, so step distance predicts contrast;
- one accent and one loud element per screen;
- whitespace and hairlines instead of boxes; shadows only on things that float;
- one labelled icon family; short, purposeful motion.

The 2024–2026 work from Linear, Stripe, Radix, Geist, Atlassian, Primer and Apple converges on two ideas: **hierarchy by subtraction** (dimmer navigation, fewer icons, softer separators) and **tokens named by role** (`fgColor-muted`, not `gray-500`). For a phone in bright sun, add: text contrast above WCAG AA (7:1 or APCA Lc 90), heavier type, no meaning carried by mid-tone tints, and big tabular numerals for times.

**Tags.** [Evidence] = measured research. [Standard] = published spec or platform guideline (WCAG, Apple HIG, Material 3, GOV.UK). [Convention] = widespread professional practice. "Living doc" = continuously updated guideline, read Oct 2026.

---

## 1. Typography

**Size**
- **Do** set body at 16–17px. iOS Body is 17pt/22, minimum 11pt [Standard · HIG Typography, living doc]. M3 Body Large is 16/24, +0.5 tracking [Standard · M3 tokens]. GOV.UK keeps body at 19/25 on phones and shrinks only headings [Standard · GOV.UK Frontend v6]. Butterick's web range is 15–25px [Convention · Practical Typography].
- **Do** keep inputs at ≥16px; iOS Safari zooms the page when a smaller field is focused [Convention].
- **Don't** go below 13px for anything a traveller must read; Apple's 11pt floor assumes indoor use.

**Scale: hand-tuned, not a ratio**
- Apple (11, 12, 13, 15, 16, 17, 20, 22, 28, 34), M3 (11–57) and Radix (12, 14, 16, 18, 20, 24, 28, 35, 60) are all hand-tuned. Refactoring UI argues modular ratios produce fractional sizes and too few small steps [Convention · Wathan & Schoger, 2018].
- **Do** define 6–8 named roles. **Don't** set ad-hoc pixel sizes in components.

**Line height and tracking scale inversely with size**
- Leading: 120–145% for text (Butterick); M3 runs 1.5 at 16px down to ~1.12 at 57px [Standard]. **Do** snap line heights to a 4px grid, as M3 does (GOV.UK uses 5px "for vertical rhythm") [Standard].
- Tracking: slightly positive when small, ~0 at body, negative when large. Radix goes from +0.0025em at 12px to −0.025em at 60px [Standard · Radix Themes]. **Don't** copy SF Pro's table (+0.06pt at 11pt, −0.43pt at 17pt) to other fonts; it is tuned to SF's optical sizes.
- All-caps: +5–12% letterspacing (Butterick), or at least 0.05em (Refactoring UI) [Convention].

**Line length.** 45–90 characters (Butterick) or 45–75 (Refactoring UI) [Convention]. A 375px phone with 16px gutters at 17px gives ~40–45, so only tablet and desktop need a cap (~34–42rem).

**Numbers**
- **Do** use `font-variant-numeric: tabular-nums` for times, prices, countdowns and columns; use proportional figures in prose [Convention · Butterick, "Alternate figures"].
- **Do** use en dashes for ranges (09:30–11:00), and group long codes in 3–4-character chunks in a mono or disambiguated face. Inter ships `ss02`, `cv05`/`cv08` and slashed `zero` for this [Standard · rsms.me/inter].

**Weight and family**
- **Do** use 2–3 weights: regular, semibold, and bold for display [Convention · Refactoring UI]. **Don't** use Light or Thin [Standard · HIG]; Airbnb's Cereal team found light weights nearly vanish at small UI sizes [Convention · Saarinen, Dezeen 2018].
- **Do** use one family. Apple says minimise typefaces [Standard]. Linear uses Inter plus Inter Display, the same family at a display optical size [Convention · Linear, Mar 2024]. Stripe uses one sans plus one mono.

**Choosing a typeface**
- **System fonts** (`system-ui` → SF, Roboto, Segoe) are the professional default for utility UI: free to load, native-looking, and used by GitHub Primer. Airbnb tried them first and built Cereal only to get one face across 191+ countries [Convention · airbnb.design "Working Type", 2018]. On iOS Safari, `font: -apple-system-body` follows Dynamic Type. Butterick's "avoid system fonts" targets documents and brand work, not app chrome.
- **Atkinson Hyperlegible Next** (Braille Institute, 10 Feb 2025) is a defensible legibility pick: distinct Il1/0O, 7 weights, 150+ languages, a Mono companion, and tabular numerals in its specimen [Standard · Braille Institute/Fontsource]. **Inter v4** adds an optical-size axis.

**Fluid type.** **Don't** size text in `vw`: zooming narrows the viewport, so text barely grows. That fails WCAG 1.4.4 (resize to 200%) and matches Failure F94 [Standard · W3C]. Roselli (2019, updated Oct 2025) also advises against capping maximum size [Convention]. Phones span only ~320–430px, so use `rem` steps and at most one heading breakpoint.

## 2. Spacing and layout

- **Base unit.** **Do** use a 4px base with an 8px rhythm [Standard]:
  - Polaris names steps by multiplier (`space-100` = 4px, `space-400` = 16px) and limits them to padding, margin and gap.
  - Radix: 4, 8, 12, 16, 24, 32, 40, 48, 64.
  - GOV.UK's 5px base shows consistency matters more than the number 8.
  - Keep adjacent steps ≥~25% apart [Convention · Refactoring UI].
- **Gutters.** **Do** use 16px side margins on phones (M3 compact margin 16dp; iOS layout margins 16–20pt) [Standard], and share that edge across titles, row text and dividers.
- **Proximity.** Nearby elements read as a group, and proximity overrides colour or shape similarity [Evidence/Standard · NN/g, Harley 2020].
  - **Do** keep within-group space at most half the between-group space.
  - **Do** put more space above a heading than below it [Convention].
  - **Do** start with too much whitespace and remove it [Convention · Refactoring UI].
- **Touch.** Minimum targets are 44pt (HIG), 48dp (M3), and 24×24 CSS px under WCAG 2.2 SC 2.5.8 (AA, Oct 2023), or 44×44 under 2.5.5 (AAA) [Standard]. Radix's global `--scaling` (90–110%) tunes density in one place.
- **Avoid "everything in a box."** **Do** group first with space, alignment and type, then a tint, and only last a border or shadow [Convention · Refactoring UI "Use fewer borders"].
  - Linear (Mar 2026) removed dividers "that appeared without clear reason" and softened the rest.
  - Atlassian gives flat cards a border, not a shadow [Standard].
- **Alignment.** **Do** keep one strong left edge and align text to text, with icons hanging in a fixed column. Linear's 2024 redesign aligned labels, icons and buttons on both axes as an explicit goal [Convention].

## 3. Hierarchy

- **Cheap tools first.** Reach for position, weight and colour before size; they rank without reflowing layout [Convention · Refactoring UI, "Hierarchy is everything"].
- **Emphasise by de-emphasising.** **Do** dim secondary information rather than shouting the primary. Linear's 2026 principle: navigation recedes, task content stays forward. In their words, "Don't compete for attention you haven't earned" [Convention · Aufmann & Heckel, 12 Mar 2026].
- **Labels versus values.** Refactoring UI calls labels "a last resort": "3 nights" beats "Nights: 3". When a label stays, make it muted and smaller, and the value primary [Convention].
- **One loud thing per screen.** Google's Material 3 Expressive research (46 studies, 18,000+ participants, May 2025) found a larger, coloured Send button up to 4× faster than a toolbar icon, and older users matched younger ones [Evidence · vendor research].
- **Button emphasis ladder.** Solid for primary, tonal or outline for secondary, text for tertiary [Convention]. Colour the primary button's *background* [Standard · HIG Color].
- **Text on colour.** **Don't** put grey text on coloured backgrounds; use a shade of the background hue [Convention · Refactoring UI].
- **Show what matters now.** Flighty modelled Live Activities on airport boards, quoting "one line per flight", and changes the data with each phase of travel [Convention · Apple "Behind the Design", Jun 2023].

## 4. Colour systems

**Perceptual space**
- OKLCH lightness tracks perception; HSL's does not, which is why HSL yellows look lighter than blues at the same value.
- **Do** build scales by fixing L steps per hue.
- **Do** derive states with relative colour syntax: `oklch(from var(--accent) calc(l + .1) c h)`.
- **Do** gamut-map; browsers currently clip out-of-gamut colours in a way that can shift hue [Convention · Evil Martians, Sitnik & Turner, 17 Sep 2025]. Their Harmonizer pairs OKLCH with APCA to equalise contrast across hues.

**How Linear and Stripe did it**
- Linear (Mar 2024) moved its theme generator from HSL to LCH, replacing 98 hand-set variables with three inputs: base, accent, contrast. The contrast input yields high-contrast themes for free. The 2026 refresh moved from cool blue-grey to a warmer, less saturated grey [Convention].
- Stripe (Oct 2019) rebuilt its palette in CIELAB so every hue shares one lightness curve. Colours ≥5 steps apart pass 4.5:1; ≥4 steps apart pass 3:1. They hand-tuned yellows for vibrancy, because "Accessible doesn't mean vibrant" [Evidence/Convention · Koopersmith & Miner].

**Step semantics (Radix 12-step)**

| Steps | Job |
|---|---|
| 1–2 | Backgrounds |
| 3–5 | Component fill: rest, hover, pressed |
| 6–8 | Borders: subtle, interactive, strong/focus |
| 9–10 | Solid fill and its hover (Yellow, Amber, Sky, Mint, Lime take dark text) |
| 11 | Low-contrast text, guaranteed Lc 60 on step 2 |
| 12 | High-contrast text, guaranteed Lc 90 on step 2 |

[Standard · Radix Colors]. Geist uses the same idea on 10 steps: 100–300 fills, 400–600 borders, 700–800 strong fills, 900–1000 text [Standard].

**Semantic tokens and palette discipline**
- Components consume roles. Primer uses `--fgColor-muted`, `--bgColor-accent-emphasis` and `--fgColor-onEmphasis`; Atlassian uses foundation.property.modifier (`color.background.danger.bold`) [Standard]. Apple warns against reusing a role elsewhere, such as separator colour as text [Standard].
- **Neutral first.** Use 8–10 slightly tinted greys, never pure black text [Convention · Refactoring UI], plus one accent. Reserve colour for status and primary actions, and never let one colour mark both tappable and plain text [Standard · HIG].
- **Status colours.** Success, warning, danger and info, each with text, subtle and solid variants, always paired with an icon and a word [Standard · WCAG 1.4.1].

**Dark mode**
- **Don't** invert. Use dimmer bases and brighter foregrounds, with elevated layers lighter than the base [Standard · HIG Dark Mode]. Atlassian: "the higher the elevation, the lighter the surface looks" [Standard]. M3 dark surface containers step through tones 4, 10, 12, 17, 22 [Standard · M3 via MDC docs].
- **Do** lower accent chroma and raise L, and dim white-background images slightly [Standard · HIG]. Material 2's dark baseline was `#121212`, not `#000` [Standard · 2018].

**Contrast**
- **WCAG 2.2 AA:** 4.5:1 for text; 3:1 for large text (18pt, or 14pt bold) and for UI boundaries (SC 1.4.11). The 4.5 figure is ISO's 3:1 × 1.5 to allow for 20/40 vision [Standard · Understanding 1.4.3]. Apple asks for 7:1 for small custom text.
- **APCA** levels [Standard-candidate · APCA docs]. APCA says WCAG 2 overstates contrast for dark colours.

| Lc | Use |
|---|---|
| 90 | Preferred for body text |
| 75 | Minimum for body text |
| 60 | Other content text |
| 45 | Headlines |
| 30 | Placeholder and disabled text |
| 15 | Dividers |

- **WCAG 3:** the 10 Sep 2026 Working Draft still states "The contrast algorithm used in WCAG 3 is yet to be determined" [Standard · W3C]. **Practice:** pass WCAG 2.2 for compliance and use APCA as the design check, especially in dark mode.

**Sunlight**
- **Evidence.** Direct sun is ~80,000–200,000 lux, against ~1,000–4,000 overcast; one phone measurement fell below 1.75:1 contrast in sun [Evidence · display studies]. A glance-reading study (Dobres et al., *Applied Ergonomics*) found that bright ambient light shrinks the usual dark-on-light advantage, so size and contrast magnitude matter more than polarity [Evidence]. Apple notes colours look darker and more muted in bright sun [Standard · HIG Color].
- **Do, in a sunlight mode:** all text ≥7:1 (Lc 90), weight one step up, outlined chips, no meaning carried by tint. Hook it to `prefers-contrast: more` [Standard · MDN]. Apple asks for an increased-contrast variant of every custom colour.

## 5. Iconography

- **One family, one stroke.** Lucide's rules [Standard · Lucide guide]: 24px grid, 2px stroke, round caps and joins, ≥1px padding, 2px corner radius, ≥2px between elements.
  - **Do** keep visual stroke constant when resizing. A 2px icon scaled to 16px renders at ~1.33px, so use size-specific strokes or `vector-effect: non-scaling-stroke`.
  - **Don't** scale 24px icons up to 48px; put them in a tinted shape [Convention · Refactoring UI].
- **Optical sizing.** SF Symbols match adjacent text weight and scale relative to cap height [Standard · HIG SF Symbols]. **Do** centre icons on the first line's x-height.
- **Labels** [Evidence · NN/g, Harley 2014]:
  - only home, search and print are near-universal;
  - keep labels always visible, since hover-only labels fail on touch;
  - if an icon takes more than 5 seconds to think of, use a word. In NN/g's words, "Obscure icon = wasted feature."
  - Bottom tabs always get icon plus label.
- **When not to use icons.** Not as decoration on every row or heading, and not icon-only for uncommon verbs. Linear (2026) cut icon count, shrank icons and removed coloured icon backgrounds [Convention].

## 6. Borders, shadows, radii

- **Radius scale.** Use 3–4 steps plus "full"; Polaris uses 4, 6, 8px and up [Standard]. Small radii read formal and large read friendly, so pick one personality [Convention · Refactoring UI].
- **Nested rule.** Inner radius = outer − padding (− border), so both curves share a centre [Convention · CSS-Tricks/DEV]. Apple's WWDC25 system formalises this with fixed, capsule (height ÷ 2) and concentric (parent − padding) shapes, and uses capsules near the iPhone screen edge [Standard · WWDC25 session 356].
- **Hairlines over shadows.** Use 1px dividers inset to the text start in a subtle border token (Radix step 6, ~Lc 15–30). Input outlines and other meaningful boundaries need 3:1 [Standard · WCAG 1.4.11].
- **Elevation semantics.** A shadow means "this floats."
  - Atlassian always pairs `surface.raised` with `shadow.raised`, and overlay with overlay, never mixing levels [Standard].
  - **Do** light from above (positive y, x = 0), use two layers (tight contact plus soft ambient), tint toward your grey, and keep 3–5 named levels at most [Convention · Refactoring UI].
  - In dark mode, express elevation through surface lightness.

## 7. Imagery

- **Information, not decoration.** Users ignore decorative and stock images but study informational ones, such as products and real people [Evidence · NN/g, Nielsen 2010, reviewed Aug 2026]. A photo of the actual hotel entrance is information; a generic beach hero is not.
- **Fixed aspect ratios per slot:** 1:1 thumbnails and avatars, 3:2 or 4:3 places, 16:9 video, 4:5 or 9:16 social posts. **Do** reserve space with `width`/`height` or `aspect-ratio`, since unsized images are a leading cause of layout shift (target CLS ≤0.1) [Standard · web.dev].
- **Placeholders.** Use a dominant-colour background or a tiny blurred preview, then fade in over 200–300ms; **don't** show one spinner per image [Convention].
- **Text on images.** Use a scrim, keep the area behind text uncluttered, and never bake text into images [Standard · HIG Wallet].

## 8. Motion

**Durations**
- NN/g (Laubheimer, Feb 2020) [Evidence/Convention]:
  - ~100ms for simple feedback;
  - 200–300ms for large screen changes;
  - ≥500ms starts to feel cumbersome;
  - entering slightly slower than exiting (~300ms in, 200–250ms out).
- M3 tokens: short 50–200ms, medium 250–400ms, long 450–600ms [Standard · androidx MotionTokens].

**Easing (M3)**

| Curve | cubic-bezier | Use |
|---|---|---|
| Standard / emphasized | (0.2, 0, 0, 1) | Default |
| Emphasized decelerate | (0.05, 0.7, 0.1, 1) | Entering |
| Emphasized accelerate | (0.3, 0, 0.8, 0.15) | Exiting |

[Standard]

**Principles**
- Apple: "Add motion purposefully, supporting the experience without overshadowing it." Keep it brief, interruptible, gesture-consistent and optional, and don't animate frequently used controls [Standard · HIG Motion].
- **Reduced motion.** Under `prefers-reduced-motion: reduce`, swap slides, zooms and parallax for opacity fades or instant changes, but keep state feedback [Standard · WCAG 2.3.3].
- **Don't animate:** layout properties (use `transform`/`opacity`), staggered first-load reveals, anything that blocks input, looping ambient motion, or a change signalled by motion alone.

## 9. Design tokens and systems

**How mature systems structure tokens**
- **Three tiers:** *primitive* (`gray-1…12`, `space-100…`), *semantic* (`fgColor-muted`, `elevation.surface.raised`) and *component* (`button-primary-bgColor-rest`). Primer calls the last two foundational and pattern tokens, with state suffixes (rest, hover, active, disabled) [Standard · Primer].
- **Names encode the logic:**
  - Polaris names by multiplier.
  - Atlassian uses foundation.property.modifier.
  - Geist names type by job and size: `text-label-14` (single line), `text-copy-14` (multi-line, taller leading), `text-heading-24`, `text-button-14`, plus Mono variants [Standard · Geist].
  - Apple names text styles and colours by role (Body, Footnote, `secondaryLabel`, `separator`) [Standard · HIG].
  - GOV.UK publishes responsive values and says its scale was "tested and iterated for readability" [Standard].
- **Theming.** Radix adds global `scaling` and `radius` factors on top of its 12-step scales; Linear derives whole themes from three inputs.

**What a small team should standardise first, in order** [Convention]
1. Colour roles: ~15–20 tokens, in both themes, every text/background pair contrast-checked.
2. Type roles: 6–8.
3. Spacing: ≤10 steps.
4. Radius: 3 steps plus full.
5. Elevation: flat, raised, overlay.
6. Motion: 3 durations and 3 easings.
7. Components from tokens only: list row, button (3 emphasis levels), sheet, chip, input, toast, empty state.

Then lint out raw values (e.g. stylelint `declaration-strict-value`) and document one do/don't per token.

## 10. Exemplars: what makes them feel crafted

- **Linear** (2024 and 2026 posts): perceptual theme generation, chrome colour drained toward neutral, navigation dimmed, fewer and smaller icons, softer rounded separators, warmer greys. Density is kept and *visual weight* redistributed.
- **Stripe:** a scale where step distance guarantees contrast, hues tuned for vibrancy, one sans plus one mono, tabular amounts (observed).
- **Things 3** (two Apple Design Awards, per its App Store listing): whitespace-dominated lists, colour only in "splashes", bold for structure. A to-do expands in place into a card while the rest fades, with haptics on lift-to-drag [Convention · MacStories 2017].
- **Flighty** (ADA Interaction, 2023): airport-board hierarchy, data that changes by phase (gate countdown before departure, progress ring in the air), offline-first, and ~20 sketched concepts per feature [Convention · Apple Behind the Design].
- **Apple Wallet:** a strict field order (header, which survives collapse, then primary, secondary, auxiliary and back). The front holds what you need often. A relevant date and location surface the pass on the Lock Screen [Standard · HIG Wallet].
- **Citymapper:** first-party write-ups are scarce. Observed: journey time as the biggest number in a route list, real-world line colours so colour carries outside meaning, and a focused full-screen "Go" mode [Convention · observed/third-party].
- **Airbnb:** Cereal (May 2018, Dalton Maag). Design Language System components reference named type styles, never raw fonts [Convention · airbnb.design].

---

## Starter token spec (small mobile app)

**Type roles** (rem at a 16px root; one family; `tabular-nums` on time, price and display)

| Role | Size / line height | Weight | Tracking | Use |
|---|---|---|---|---|
| caption | 13 / 18 | 500 | +0.01em | Metadata, timestamps |
| secondary | 15 / 20 | 400 | 0 | Second line of a row |
| body | 17 / 24 | 400 | 0 | Default text and inputs |
| row-title | 17 / 24 | 600 | 0 | List titles, buttons |
| title-3 | 20 / 28 | 600 | −0.005em | Section heads |
| title-2 | 24 / 32 | 700 | −0.01em | Sheet titles |
| title-1 | 28 / 36 | 700 | −0.015em | Screen titles |
| display | 40 / 44 | 700 | −0.02em | The one big number |

**Spacing** (4px base): `0, 2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64`.
- Gutter: 16.
- Row: 12 vertical padding, 48 minimum height.
- Label to value: 4.
- Within a group: 8–12.
- Between sections: 32.

**Radius**
- `sm` 6: chips.
- `md` 10: buttons, inputs.
- `lg` 16: sheet tops, image tiles.
- `full`: pills, avatars.
- Nested: inner = outer − padding.

**Elevation**
- `flat`: canvas and lists.
- `raised`: border or a one-layer soft shadow.
- `overlay`: sheets and toasts; two-layer shadow in light mode, lighter surface in dark.

**Colour roles** (each written with `light-dark()`, from 12-step OKLCH scales)

| Role | Step | Target |
|---|---|---|
| `bg.canvas` / `bg.surface` / `bg.overlay` | neutral 1 / 0 / 2 | Overlay lighter in dark mode |
| `fill.subtle` / `.hover` / `.pressed` | 3 / 4 / 5 | Component states |
| `border.subtle` / `.strong` | 6 / 8 | ~Lc 15–30 / ≥3:1 |
| `fg.default` | 12 | ≥7:1 (Lc 90) |
| `fg.muted` | 11 | ≥4.5:1 (Lc 60–75) |
| `accent.solid` / `.text` / `.subtle` | 9 / 11 / 3 | One accent |
| `fg.onAccent` | white or dark | Per hue |
| `status.{success,warning,danger,info}.{text,subtle,solid}` | 11 / 3 / 9 | Always with icon and word |
| `focus.ring` | accent 8 | ≥3:1 against neighbours |
| `highlight` | one loud hue | One element per screen |

**Motion**

| Token | Value |
|---|---|
| `fast` | 100ms (press, toggle) |
| `base` | 200ms (fade, exit) |
| `slow` | 300ms (sheet enter) |
| `ease.standard` | (.2,0,0,1) |
| `ease.enter` | (.05,.7,.1,1) |
| `ease.exit` | (.3,0,.8,.15) |

Under reduced motion, everything becomes an opacity fade of ≤150ms.

---

## Implications for an on-the-go trip app

1. **Keep Atkinson Hyperlegible Next as the only family**, at 400, 600 and 700 only. Confirm the self-hosted subset keeps `tnum`; if not, set times and confirmation codes in Atkinson Hyperlegible Mono.
2. **Body 17px, inputs ≥16px, nothing under 13px.** Size is the cheapest fix for contrast lost to sunlight.
3. **Times are the hero data:** tabular, large, en-dash ranges, local time-zone label alongside. Reserve `display` for the next thing only.
4. **One loud element per screen.** The Next ticket keeps the marigold; everything else stays neutral, which matches the M3 Expressive 4× finding.
5. **Rebuild the palette as OKLCH 12-step scales with Radix step jobs.** Equalise L across the six kind hues so none shouts, and use kind colours as small icon tints, never large fills.
6. **Sunlight mode:** text ≥7:1 (Lc 90), weight +1 step, outlined chips, dividers ≥Lc 30, no tint-only meaning. Auto-enable via `prefers-contrast: more` and keep a manual toggle; ambient-light sensing isn't reliably available on the web.
7. **Dark mode is night mode, not inversion:** dim bases, lighter sheets, lower chroma on accent and kind colours, slightly dimmed photos.
8. **Lists, not cards:** hairlines inset to the text start, sticky day headers with more space above than below. Tinted or elevated containers only for the ticket and sheets.
9. **Values over labels:** "2 nights", "Gate B12". Where a label remains, set it as caption/muted and the value as row-title.
10. **One icon set at a consistent stroke.** Bottom tabs always labelled; icon-only buttons only for close, search and share; no decorative icons on row titles.
11. **Photos only to find or recognise a place:** fixed ratios per slot, dominant-colour placeholders, offline caching, no per-image spinners on patchy signal.
12. **Bigger targets while moving:** primary actions ≥48px tall with ≥8px between them, and Directions, Call and Copy within thumb reach [Convention].
13. **Restrained motion:** sheets 300ms in and 200ms out, presses 100ms, no animation on Today's frequently used controls, fades only under reduced motion.
14. **Enforce the tokens:** no raw hex, px or ms in component CSS, and contrast-pair checks for both themes in CI.
15. **Small craft signals:**
    - a single left edge;
    - icons centred on the x-height;
    - nested radii that agree;
    - right-aligned prices;
    - sentence case;
    - `Intl.DateTimeFormat` everywhere.

---

## Sources

- Apple HIG (living docs, read Oct 2026): [Typography](https://developer.apple.com/design/human-interface-guidelines/typography), [Color](https://developer.apple.com/design/human-interface-guidelines/color), [Dark Mode](https://developer.apple.com/design/human-interface-guidelines/dark-mode), [Motion](https://developer.apple.com/design/human-interface-guidelines/motion), [SF Symbols](https://developer.apple.com/design/human-interface-guidelines/sf-symbols), [Wallet](https://developer.apple.com/design/human-interface-guidelines/wallet)
- Apple, [WWDC25 "Get to know the new design system"](https://developer.apple.com/videos/play/wwdc2025/356/) (Jun 2025); [Behind the Design: Flighty](https://developer.apple.com/news/?id=970ncww4) (5 Jun 2023); [ADA 2023 winners](https://apple.com/newsroom/2023/06/apple-announces-winners-of-the-2023-apple-design-awards)
- Material 3: [type-scale tokens](https://raw.githubusercontent.com/androidx/androidx/androidx-main/compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/TypeScaleTokens.kt) and [motion tokens](https://raw.githubusercontent.com/androidx/androidx/androidx-main/compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/MotionTokens.kt) (androidx); [tone-based surfaces](https://material.io/blog/tone-based-surface-color-m3) (Mar 2023); [M3 Expressive research](https://design.google/library/expressive-material-design-google-research) (May 2025)
- M. Butterick, Practical Typography: [Key rules](https://practicaltypography.com/summary-of-key-rules.html), [Alternate figures](https://practicaltypography.com/alternate-figures.html), [Websites](https://practicaltypography.com/websites.html)
- A. Wathan & S. Schoger, [Refactoring UI](https://www.refactoringui.com/) (Dec 2018); chapter notes via [rjseymour66](https://rjseymour66.github.io/webdev/refactoring-ui/)
- Linear: [How we redesigned the Linear UI (part II)](https://linear.app/now/how-we-redesigned-the-linear-ui) (28 Mar 2024); [A calmer interface for a product in motion](https://linear.app/now/behind-the-latest-design-refresh) (12 Mar 2026)
- Stripe, [Designing accessible color systems](https://stripe.com/blog/accessible-color-systems) (15 Oct 2019)
- Evil Martians: [OKLCH in CSS](https://evilmartians.com/chronicles/oklch-in-css-why-quit-rgb-hsl) (17 Sep 2025); [OKLCH ecosystem/Harmonizer](https://evilmartians.com/chronicles/exploring-the-oklch-ecosystem-and-its-tools)
- Radix: [Colors scale](https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale); Themes [spacing](https://www.radix-ui.com/themes/docs/theme/spacing), [typography](https://www.radix-ui.com/themes/docs/theme/typography)
- Vercel Geist: [Colors](https://vercel.com/geist/colors), [Typography](https://vercel.com/geist/typography) · Primer: [Color](https://primer.style/product/primitives/color/) · Atlassian: [Tokens](https://atlassian.design/foundations/tokens/design-tokens), [Elevation](https://atlassian.design/foundations/elevation) · Polaris: [Layout tokens](https://polaris.shopify.com/design/layout/layout-tokens), [Border](https://polaris.shopify.com/tokens/border) · GOV.UK: [Spacing](https://design-system.service.gov.uk/styles/spacing/), [Type scale](https://design-system.service.gov.uk/styles/type-scale/)
- W3C: [WCAG 3.0 WD](https://www.w3.org/TR/wcag-3.0/) (10 Sep 2026); [Understanding 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) · [APCA in a Nutshell](https://git.apcacontrast.com/documentation/APCA_in_a_Nutshell.html)
- NN/g: [Icon Usability](https://www.nngroup.com/articles/icon-usability/) (2014); [Proximity](https://www.nngroup.com/articles/gestalt-proximity/) (2020); [Animation duration](https://www.nngroup.com/articles/animation-duration/) (2020); [Photos as content](https://www.nngroup.com/articles/photos-as-web-content/) (2010/2026)
- A. Roselli, [Responsive Type and Zoom](https://adrianroselli.com/2019/12/responsive-type-and-zoom.html) (2019–2025); M. Barvian, [Smashing](https://smashingmagazine.com/2023/11/addressing-accessibility-concerns-fluid-type) (Nov 2023)
- [Atkinson Hyperlegible Next](https://fontsource.org/fonts/atkinson-hyperlegible-next/about) (Feb 2025); [Inter](https://rsms.me/inter/); [Lucide icon guide](https://lucide.dev/contribute/icon-design-guide)
- Concentric radii: [DEV](https://dev.to/sgbp/the-concentric-border-radius-rule-why-nested-rounded-corners-look-slightly-wrong-3hog), [CSS-Tricks](https://css-tricks.com/?p=15151)
- Sunlight: [Dobres et al.](https://www.sciencedirect.com/science/article/abs/pii/S0003687016302459); [Daylight display contrast](https://www.researchgate.net/publication/245413707_Display_daylight_ambient_contrast_measurement_methods_and_daylight_readability); [MDN prefers-contrast](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-contrast)
- [web.dev Optimize CLS](https://web.dev/articles/optimize-cls); Airbnb [Working Type](https://airbnb.design/working-type) (2018); MacStories [Things 3](https://www.macstories.net/reviews/things-3-beauty-and-delight-in-a-task-manager/) (May 2017)
