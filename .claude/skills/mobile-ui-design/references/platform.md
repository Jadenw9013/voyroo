# Mobile web and PWA: the facts, with numbers

Condensed from `docs/design/research/01-platform-ergonomics.md`, which has the sources and dates. Tags: **[Evidence]** research or measured data; **[Standard]** official guideline or spec; **[Convention]** common professional practice or reported platform behavior. Platform behavior is as of Oct 2026 (Safari 26, Chrome 13x–14x).

## Touch targets and placement

| Rule | Number | Tag |
|---|---|---|
| WCAG 2.2 AA minimum (2.5.8) | 24×24 CSS px, or spacing so a 24px circle on each target touches no other | [Standard] |
| WCAG AAA (2.5.5), whose rationale names one-handed use and shaking transit | 44×44 CSS px | [Standard] |
| Apple default control size; Apple's absolute minimum | 44×44 pt; 28×28 pt | [Standard] |
| Material minimum, with spacing | 48×48 dp, 8 dp apart | [Standard] |
| Tap accuracy (Hoober) | ~7 mm at the screen center, ~12 mm at the corners; one hand while carrying a bag can exceed 30 mm at far corners | [Evidence] |
| The same in CSS px on current iPhones (~6 px/mm) | 7 mm ≈ 42px, 10 mm ≈ 60px, 12 mm ≈ 72px | derived |
| Buttons while walking (Schildbach & Rukzio) | 6.7 mm buttons: up to 23% errors; ~20 mm removed nearly all | [Evidence] |

**Voyroo rule:** 44px is the floor and fits only a center-screen tap by someone sitting still. Actions used on the move (Directions, Call, WhatsApp, Copy code, Mark as booked) get 56–64px with ≥8px gaps; edge controls 64px. Size about 20% bigger than you think, because pt/dp-to-mm varies ±30% across devices.

**Placement** [Evidence, Hoober 2013/2017; NN/g 2023]
- Grip changes every few seconds (49% one-handed, 36% cradled, 15% two hands; ~75% of taps are thumbs). Don't design for one fixed thumb zone; thumb-zone heatmaps are oversold.
- The middle half to two-thirds of the screen is easiest. Primary actions go there. Secondary items on the top and bottom edges, tertiary in corner menus.
- The bottom is not automatically reachable; bottom bars work because they're always visible.
- Keep irreversible actions away from frequently tapped controls, or make them undoable.
- Make whole list rows tappable. Pad the page bottom so the last item can scroll up to mid-screen.

## Navigation, sheets, gestures, Back

- **Tab bar:** 3–5 destinations, always visible on top-level screens, one-word labels with icons, `aria-current="page"` on the active one. Tabs are for navigation, **never actions**. Never hide or disable a tab; show an empty state. Badges only for critical items. Bars hold at most 4 items, 5 on the largest phones. [Standard, Apple HIG Tab bars; Evidence, Hoober]
- **Visible beats hidden:** hamburger-only navigation was used 57% of the time vs 86% for visible + hidden; discoverability fell >20%, tasks were 15% slower. [Evidence, NN/g 2016, n=179]
- **Sheets:** brief, self-contained tasks only, never navigation or complex content. One at a time, never stacked. A visible **Close** button (people overlook grabbers), Back closes, swipe-down closes, confirm before discarding unsaved input. Medium detent (~half height) for progressive disclosure. Pair Done with Cancel. Long editing gets a full screen. [Standard, HIG Sheets Mar 2026; Evidence, NN/g 2023]
- **Material sheet types:** a *standard* sheet coexists with the page (no scrim); a *modal* sheet has a scrim and closes on Back, outside tap or full drag. Drag handle needs a 48 dp touch area and must be operable by assistive tech. Max width 640 dp. [Standard]
- **Accidental dismissal** is a top mobile problem. Prefer partial overlays (full-page overlays are mistaken for pages); keep swipe-down but add an X; treat system Back as closing the overlay. [Evidence, NN/g 2022]
- **Back** must go where people perceive "back" to be, including closing an overlay. 37% of sites tested got it wrong. Use `<dialog>` or `CloseWatcher` so Android Back closes sheets; add a history entry for full-height ones. [Evidence, Baymard; Standard, Chrome 120]
- **Swipe actions** have no signifier, so people don't find them. Use swipe only for one destructive action with one meaning across the app, keep the item visible during the swipe, offer Undo, and always offer the same action as a visible button. [Evidence, NN/g 2017]
- **Every gesture needs a button**, including dragging (WCAG 2.5.7 AA: reorder with up/down buttons; a swipe doesn't count as the alternative) and path gestures (2.5.1 A). [Standard]
- **Liquid Glass caution:** translucent controls over content hurt legibility, collapsing tab bars fragment navigation. Keep navigation stable, contrast high, essential actions out of overflow menus. [Evidence/expert review, NN/g Oct 2025]

## Viewport, safe areas, browser chrome

- **Viewport units:** `100vh` is taller than the visible area on load. Use `svh` for anything that must fit, `lvh` for backgrounds, `dvh` only where resizing is acceptable (updates are throttled while toolbars move). The keyboard doesn't change them. [Standard, web.dev]
- **Safe areas on both platforms:** `viewport-fit=cover` + `env(safe-area-inset-*)`. Chrome on Android draws edge-to-edge since **Chrome 135 (2025)**, so bottom bars sit behind the gesture bar there too. Don't put `padding-bottom: env(safe-area-inset-bottom)` directly on bottom-anchored bars (it thrashes layout and stops Chrome's chin from sliding away); use Chrome's `safe-area-max-inset-bottom` pattern. [Standard, Chrome edge-to-edge]
- **Safari 26 ignores `theme-color`.** It tints its floating bars by sampling the body background and fixed/sticky elements near the edges, so a colored fixed bar (or the marigold ticket near the top) can retint the browser chrome. Set `html`/`body` backgrounds deliberately; test on a device. [Convention, Ben Frain 2025]
- **Keyboard:** iOS and Android Chrome 108+ resize only the *visual* viewport, so fixed bottom bars end up under the keyboard. `interactive-widget=resizes-content` works in Chrome and Firefox but **not in shipping Safari**. Use `visualViewport` events to keep a sheet's primary button visible, or hide the tab bar while a field has focus. [Standard + Convention]
- **Inputs at ≥16px** or iOS zooms the page on focus: `font-size: max(16px, 1em)`. **Never** `user-scalable=no` (fails WCAG; iOS ignores it). [Convention]
- **Overscroll:** `overscroll-behavior: contain` on sheets and panels. iOS Home Screen apps have no pull-to-refresh: refresh when the page becomes visible, or provide a refresh control. [Convention]
- **Reflow and resize:** no two-way scrolling at 320 CSS px (1.4.10), text works at 200% (1.4.4), don't lock orientation (1.3.4). Sticky bars must never fully hide the focused element (2.4.11): use `scroll-padding`. [Standard]
- **OS text size:** Chrome 146 (Mar 2026) adds `<meta name="text-scale" content="scale">` so rem follows Android's text-size setting (don't also set a root `font-size`). On iOS the only hook is `font: -apple-system-body`. [Standard + Convention]

## Install, push, haptics, transitions, preferences

- **Install:** on iOS 26 any site added to the Home Screen opens as a web app; there's **no install prompt on iOS** (Share › Add to Home Screen). Chrome fires `beforeinstallprompt` after a tap and 30 s of viewing. Promote install once, after a sign of real interest (joining a trip), never mid-task; dismissible, remembered. [Standard]
- **Push and app badges on iOS (16.4+) work only for Home Screen apps**, and permission must come from a user tap. Declarative Web Push (iOS 18.4) works without a service worker. [Standard, WebKit]
- **No `navigator.vibrate()` on iOS.** Haptics are an Android-only optional extra; never rely on them for feedback. [Convention]
- **View Transitions:** same-document transitions are Baseline (Oct 2025); cross-document in Chrome 126+ and Safari 18.2+, not Firefox. Progressive enhancement only; off under `prefers-reduced-motion`. [Standard]
- **Preference queries:** `prefers-color-scheme`, `prefers-reduced-motion`, `prefers-contrast` work everywhere; `prefers-reduced-transparency` is Chromium-only. [Standard]

## Forms

- `type=email/tel/url`; codes use `type=text inputmode=numeric`, **not** `type=number`. [Standard]
- `autocomplete` tokens (`name`, `email`, `tel`, `street-address`); WCAG 1.3.5 requires them for personal data. [Standard]
- `enterkeyhint`: `next`, `done`, `search`, `send`, `go`. [Standard]
- **Labels above fields, never placeholder-as-label** (it vanishes while typing, looks pre-filled, has low contrast, some screen readers skip it). [Evidence, NN/g]
- **Validate when the field is left or complete**, not on the first keystroke; clear errors as soon as they're fixed; don't disable Submit, say what's missing. Evidence is mixed on immediate on-blur errors, so keep messages calm and specific. [Evidence, Baymard 2024; UX Movement]
- **Dates:** native `type=date/time` for near-future dates (OS pickers and accessibility for free). Custom calendars only for ranges, with ≥44px cells. Three numeric fields for dates people already know. [Convention + Standard]
- Don't make people retype (WCAG 3.3.7); never block paste. [Standard]

## Performance as UX

- **Core Web Vitals (P75 field data):** LCP ≤2.5 s, **INP ≤200 ms**, CLS ≤0.1. Poor is >4 s, >500 ms, >0.25. [Standard]
- **Reference device and network (2026):** a Galaxy A24-class Android on 9/3 Mbps with 100 ms RTT, plus 5/1 Mbps for reach. To load in 3 s, a JS-heavy page has ~1.2 MiB total, ~0.62 MiB of it JS. Lab stand-in: Lighthouse mobile (150 ms RTT, ~1.6 Mbps, 4× CPU). For boats, also try 1–2 Mbps. [Evidence, Russell Nov 2025; Convention]
- **INP:** paint feedback in the next frame, then yield before heavy work; keep the DOM small; `content-visibility` on long lists. 0.1 s feels instant, 1 s keeps flow, >10 s needs progress and cancel. [Standard; Evidence, Nielsen]
- **Loaders:** none under 1 s; a content-shaped skeleton only for a full-page load of 2–10 s; a spinner for a single module; a progress bar beyond 10 s. Research on skeletons is mixed (Viget found them slowest-feeling); rendering cached data beats any loader. [Evidence, NN/g 2023; Viget 2017]
- **Optimistic UI:** apply locally at once, sync in the background, show "pending" only if sync is slow or fails, Undo over confirmation. [Convention, Linear]

## Offline and weak signal

- **Say what still works**, not just "offline" (many people misread it). Disable only controls that need the network. **Never** a blocking modal on a shaky connection. [Standard, web.dev]
- **Freshness:** "Updated 14:05" on data that can go stale. Refresh automatically, but don't move content while someone reads. [Standard]
- **Confirm local saves quietly:** one small indicator while offline or while writes are pending, per-item "Waiting to sync" marks, no red banners. Never grey alone (reads as disabled): add an icon and text. [Standard + Convention; Figma, Notion, Linear]
- **Precache what people will need** and say what's cached (Google Maps states what doesn't work offline). [Convention]
- **Retry** automatically with backoff, offer "Retry now", retry when the page becomes visible. Detect offline from failed requests, not `navigator.onLine`. [Convention]

## Accessibility beyond contrast

- The bottom nav is a `<nav>` of links with `aria-current="page"`, not ARIA `menu` or `tablist`. [Convention, Roselli]
- Sheets are `<dialog>` + `showModal()`: inert background, focus trap, Esc and Android Back close, focus restored on close. `autofocus` the most likely first control (quick-add only; the keyboard covers half the screen), the least destructive button in a confirmation. Name with `aria-labelledby`, visible Close, `closedby="closerequest"` on sheets with input so a stray tap doesn't discard typing. iOS raises the keyboard only for `focus()` called synchronously inside the tap. [Standard, APG/MDN]
- Toasts use `role="status"`; an Undo toast stays until a VoiceOver or Switch Control user can reach it (2.2.1) and doesn't steal focus. Snackbars with an action persist until acted on (Material). [Standard]
- Focus appearance: ≥2px perimeter at 3:1 (2.4.13 AAA). [Standard]
- Test at 200% text, at 320px wide, in landscape, and with the keyboard open: large text + landscape + keyboard can leave ~150px of usable height, so sticky bars must collapse. [Standard]
