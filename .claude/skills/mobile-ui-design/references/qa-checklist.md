# Pre-ship design QA checklist

Run this on every visual change before calling it done. Report each section as pass, fail (with file:line) or not applicable. Built from report 04 (Vercel, GOV.UK, Stripe, NN/g), with mobile and on-the-go checks from reports 01, 02 and 05.

## 1. Purpose and hierarchy
- [ ] The screen's one job and its one primary action are written down, and the primary action is the most prominent element.
- [ ] Every element serves a top task. Nothing is there "to fill space" or to "feel premium".
- [ ] Every number shown changes a decision. No vanity counts or stat tiles.
- [ ] Labels don't repeat headings. No eyebrows, no badges above titles.
- [ ] No duplicate paths: each destination or action has one canonical place, plus at most the row it belongs to.
- [ ] At most two levels of disclosure, and every "more" control has a specific label.

## 2. Glance and on-the-go
- [ ] Two-second glance test: on Today, what, when and where of the next item read at a glance at 390×844, in Sunlight mode.
- [ ] Common tasks take three taps or fewer from launch.
- [ ] Today paints from cache with nothing above the Next ticket.
- [ ] Actions used while moving (Directions, Call, WhatsApp, Copy code, Mark as booked) are ≥56px tall with ≥8px gaps, in the middle band, away from destructive controls.
- [ ] Times pair relative and absolute ("in 25 min · 5:30 PM") and show the zone on travel days that cross zones.

## 3. System and tokens
- [ ] No raw hex, `rgb()`, `oklch()` literals or arbitrary Tailwind values in components (`grep -rnE "#[0-9a-fA-F]{3,8}\b|\[[0-9]+px\]" src/features src/ui`).
- [ ] Spacing on the scale (4, 8, 12, 16, 20, 24, 32, 40, 48, 64).
- [ ] Radius by role (chip, control, sheet/tile, full), and nested radii agree.
- [ ] Shadows only on things that float (sheets, toasts, the ticket if raised).
- [ ] Existing components reused; any new token or component has a written reason.

## 4. Type
- [ ] Only the defined roles; no ad-hoc sizes.
- [ ] Weights 400/600/700 only; bold is the exception.
- [ ] Body 17px, inputs ≥16px, nothing under 13px.
- [ ] Tabular figures for times, prices, countdowns and codes; codes chunked in 3–4 characters.
- [ ] Long text truncates or wraps safely (`min-w-0`), and nothing important truncates at 200% text.

## 5. Color and contrast
- [ ] Body text ≥4.5:1; times, codes, addresses and status ≥7:1. Checked in light, dark and Sunlight.
- [ ] UI boundaries, icons and focus rings ≥3:1.
- [ ] One accent per view; color means the same thing everywhere.
- [ ] Status shows a mark and a word, never color alone.
- [ ] No gradient text, glow, glass over content, or `invert()` filter.

## 6. Layout
- [ ] Lists, not cards. No cards inside cards. Grouping by space and headings.
- [ ] Colored edges and stripes only for status.
- [ ] Works at 320, 375, 390 and 430px with no horizontal scroll; the 16px gutter and one left edge are consistent.
- [ ] Safe-area insets respected for fixed bars (iOS and Android Chrome 135+); `svh` instead of `100vh`.
- [ ] The last item can scroll up past the bottom bar; `scroll-padding` keeps focused fields visible.

## 7. Icons and imagery
- [ ] One icon set (`src/ui/Icon.tsx`) at one stroke; no emoji as icons.
- [ ] Every icon-only control has an accessible name; ambiguous ones have a visible label. Tabs always have labels.
- [ ] No ✨ standing in for a label; no decorative icons on headings.
- [ ] Photos are information (the actual place), with fixed aspect ratios, reserved space and lazy loading; no per-image spinners.

## 8. Motion
- [ ] Each animation has a stated purpose.
- [ ] Frequent actions have no animation; presses ≤100ms; sheets ~300ms in, ~200ms out.
- [ ] `prefers-reduced-motion` gets fades or instant changes; only `transform` and `opacity` animate; no `transition: all`.

## 9. Copy
- [ ] Sentence case. Buttons are Verb + noun and say exactly what happens.
- [ ] The toast repeats the verb ("Marked Zip lining booked", with Undo).
- [ ] Errors say what happened and what to do; no "sorry", "oops", "invalid".
- [ ] No marketing voice, no "Learn more" or "More" without a noun.
- [ ] Empty states: status, a cue, and one action.

## 10. States
- [ ] Empty, loading (no loader under 1s; skeleton only on a first uncached load), error, offline, permission and very long content are designed.
- [ ] Failure states first for bookings: cancelled, moved, no confirmation yet, a night with nowhere to stay.
- [ ] No blank fields: hide the action or offer "Add phone".
- [ ] Destructive actions use Undo, or a confirmation with outcome labels when irreversible.

## 11. Sheets, navigation and Back
- [ ] One sheet at a time; visible Close; Back and swipe-down close it; typed input isn't lost on dismiss.
- [ ] Sheets are `<dialog>` with `showModal()`, named by `aria-labelledby`, focus returned on close; only quick-add sheets autofocus.
- [ ] The tab bar is navigation only, visible, labelled, 3–5 items; `aria-current="page"` on the active tab.
- [ ] Back goes where people perceive "back" to be, including closing an overlay.

## 12. Forms and input
- [ ] Persistent labels above fields; no placeholder-as-label.
- [ ] Correct `type`, `inputmode` (`numeric` for codes, not `type=number`), `autocomplete` and `enterkeyhint`.
- [ ] Validation on blur or completion, not on the first keystroke; errors clear when fixed.
- [ ] Native date and time pickers unless a range is needed.
- [ ] Paste is never blocked, zoom is never disabled.

## 13. Offline and sync
- [ ] Cached content shows with "Updated 10:42".
- [ ] One quiet offline line, per-item "Waiting to sync", automatic retry plus "Retry now". No red banners, no blocking modals.
- [ ] Copy code, Call and Directions work offline.

## 14. Accessibility
- [ ] Visible `:focus-visible` on every control (2px, 3:1).
- [ ] Toasts and async updates use a live region (`role="status"`); Undo stays until it can be reached.
- [ ] Every gesture has a button alternative.
- [ ] Works at 200% text, 320px wide, landscape, with the keyboard open.
- [ ] axe passes in light and dark (`npm run e2e`).

## 15. Final gate
- [ ] Screenshots at 390×844 in light, dark and Sunlight attached to the report.
- [ ] A friction log of one top task, written as a specific person in a specific situation (e.g. "at the airport kerb, one hand, 5% battery, needs the hotel address for the taxi"), each step marked smooth, rough or broken.
- [ ] The rationale is written: decision → reason → evidence.
