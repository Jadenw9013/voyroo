# Patterns, content design, the declutter pass, and a per-screen guide

Condensed from `docs/design/research/05-exemplar-apps.md` (Flighty, Transit, Citymapper, Google Maps, Apple Wallet, Airbnb, TripIt, Wanderlog, Things 3, Linear) and `docs/design/research/02-declutter-content-glanceable.md` (NN/g, GOV.UK, Polaris, Atlassian, Apple, Android for Cars, NHTSA). Sources and dates are in the reports.

The one idea all the good on-the-go apps share: **when you open the app, it already shows the answer**, in a form people already know (a departures board, a ticket, a station sign). Transit learned this the hard way: when it hid its nearby departures behind a map in 2014, about 20% of users stopped using the app.

## Pattern library

| Pattern | Problem it solves | How exemplars do it | Mobile-web notes for Voyroo |
|---|---|---|---|
| **Launch-to-answer** | A tap before any answer | Transit's nearby departures; Flighty's next flight; Airbnb Trips on arrival | Today's Next ticket is the first thing painted, server-rendered and cached by the service worker. No banner, tip or prompt above it. |
| **Departure-board row** | Lists you have to read instead of scan | Flighty's one line per flight; Transit's line rows | Fixed-width time column in tabular figures, then the title, then one status word. Same anatomy on every row. |
| **Ticket card / hero number** | The key fact buried among equals | Transit's ETA enlarged from 18pt to 60pt; Wallet primary fields | The next time is the largest type on the screen (`display`). Supporting facts are grouped *inside* the card, never as sibling cards. |
| **Time-anchored card ("smart states")** | A static page shows everything at once | Flighty changes fields by phase; Citymapper's walk / wait / ride / arrive; Airbnb surfaces door codes on arrival | A pure `stateFor(item, now)` picks 2–3 fields and the one primary action; re-run on `visibilitychange`. |
| **Single primary action + chip row** | Many equal buttons, no obvious next step | Google Maps place sheet chips; Wallet shortcuts; Apple Maps' floating Directions | One filled button chosen by state; the rest are quiet chips. `tel:`, `wa.me`, Maps universal links. |
| **Facts in, actions out** | People hand-build links and buttons | Wallet derives directions and weather from the venue; TripIt fills details from a flight number | Store structured fields (phone, WhatsApp, address, code, URL); derive the actions. Hide an action whose field is empty rather than disabling it; offer "Add phone". |
| **Detail sheet with peek height** | A new page loses the context | Google Maps' resizable sheets that always leave a strip of map | `<dialog>` or a drawer with snap points; keep a sliver of the page visible; `overscroll-behavior: contain`; safe-area insets; one sheet at a time. |
| **Lift-in-place expand** | A jarring jump from list to detail | Things 3 lifts a to-do into a card in place | View Transitions from the row to the sheet header, cross-fade fallback, off under reduced motion. |
| **Day timeline with a "now" line** | Losing track of what's done | Things greys out past events; TripIt and Airbnb go day by day | Dim past items (don't hide them), a thin "now" rule, scroll to it on open. |
| **Glance strip** | Status hidden in details | Google's "Open · Closes 10 PM"; Flighty's gate line | One line under the title: status mark + word + one fact. |
| **Context indicator** | Data that is silently wrong | Transit tints its search bar when the map leaves your location | An "Offline · saved 10:42" line; a tinted header when viewing a day that isn't today or a shared view. |
| **Failure-first states** | The design breaks when plans change | Flighty designs for delays first; Wallet was criticised for blank gate fields | Design cancelled, moved, delayed, no confirmation yet, and nowhere to sleep first. Never a blank label. |
| **Context-aware add** | Navigating to the right place before adding | Things' Magic Plus drops where you drag it; TripIt flight-number fill | The add sheet inherits the day or item it was opened from and shows the guess as an editable chip. |
| **Shared live view** | "What time / where are we?" in the group chat | Flighty share links; shared Wallet Live Activities | A read-only now/next link with private fields stripped (notes, codes, phone numbers). |
| **Map layers by day** | A pile of pins | Wanderlog's per-day pins with lines; Google's list markers | Day chips filter numbered pins that match the list order; hand directions off to the phone's maps app. |
| **Quiet chrome** | Navigation competes with content | Linear 2026 dimmed navigation and cut icons; Things uses color only as an accent | Muted tab bar; the accent appears only on the active tab and the one primary action. |
| **Human verbs** | System words add friction | Citymapper's "Get me somewhere", "Get me home" | "Get directions", "Call the hotel", "Show the booking", "Mark as booked". |

## Anti-patterns these apps avoid

- Hiding the answer behind a map or a search box (Transit 2014).
- Equal visual weight for everything (what Linear's 2026 refresh fixed).
- Related information split across pages (Transit 5.0 merged route, schedule and alerts).
- Stacked sheets or modal chains.
- Color-only status.
- Critical information behind an unlabelled tap (Airbnb check-in instructions behind the listing photo get missed).
- Upsells or promos on surfaces people need in a hurry.
- Glass or refraction over dense text (Linear rejected it).
- Blank fields.
- Reaching for existing components before thinking (Flighty sketches ~20 concepts per problem).
- A home screen that needs customizing before it's useful.
- Re-layouts that force people to relearn (Transit 6.0 changed scale and type, not layout).

## Native surfaces and their web equivalents

| Native | Web reality | Best web equivalent |
|---|---|---|
| Live Activities, Dynamic Island | Not available | Today *is* the live activity: refresh on focus; Screen Wake Lock while a code is shown |
| Lock Screen pass | Not from a web page | A signed `.pkpass` (needs an Apple Pass Type ID) and a Google Wallet link, with relevant date and location |
| Widgets | Not available | A webcal/ICS subscription so the phone's calendar widget shows "next" |
| Push | iOS only for Home Screen apps (16.4+) | Web Push and `setAppBadge()`, permission asked after install and real use |
| Haptics | No Vibration API on iOS | Pressed states, toasts; `navigator.vibrate` on Android as an extra |
| Sheets with detents | Must be built | Snap points, `svh`/`dvh`, `visualViewport` for the keyboard, `<dialog>` focus handling |

These are options for later, not a to-do list. The owner decides what's worth adding.

## List-row anatomy

[Convention; Standard, Material lists; Evidence, NN/g cards]

- **Leading:** the kind icon or the time in tabular figures, in a fixed column.
- **Headline:** front-loaded (people scanning see the first two words).
- **Supporting line:** at most one.
- **Trailing:** one status *or* one action, never both.
- **Height:** at most three lines; the whole row is the tap target.
- Same element positions on every row; don't mix row types in one list.
- Lists for homogeneous items you scan; cards only for browsing mixed content; a photo grid only for images (saved posts). Tables on phones only for 2–3 short columns.
- Group with space first. Removing a divider usually means adding space.

## Content design rules

- **Most important first** (inverted pyramid). Headings specific and front-loaded, readable as an outline. [Standard, GOV.UK]
- **Plain language:** short familiar words, sentences under ~25 words, active voice, no buzzwords. Experts prefer plain English too. [Standard + Evidence, GOV.UK]
- **Sentence case everywhere**, titles included. No all caps. [Standard]
- **Buttons are verbs that name the result** ("Mark as booked", "Copy confirmation"), never "Submit", "OK", "Get started". The toast repeats the verb ("Marked Zip lining booked", with Undo). [Standard, GOV.UK/Polaris]
- **A status is never worded like a button, and a button never like a status** (from Voyroo's own DESIGN.md: the To-do row shows "To book" as a pill and "Mark as booked" as the action).
- **Specific labels with strong scent:** no "More", "Learn more", "Details" without a noun. [Evidence, NN/g]
- **Errors:** what happened + how to fix it, the user's input kept. No "sorry", "please", "invalid", "oops", blame or jokes. A search with no results is an empty state, not an error. Red only for genuinely critical messages. [Standard, GOV.UK/Polaris]
- **Empty states:** status + a cue that teaches + one action ("No plans for Tuesday yet. Add a place or idea." with one Add button). Short title, one or two sentences, a one- or two-word action. The more often a screen appears, the less playful it should be. Never show "nothing here" while loading. [Standard, NN/g/Atlassian]
- **No marketing voice.** Clarity over entertainment; humor only when it comes naturally. [Convention, Mailchimp]
- **Times and dates:**
  - One time format per locale; tabular figures.
  - Relative + absolute together: "in 25 min · 5:30 PM".
  - "to" or an en dash in ranges, consistently.
  - Label the time zone on days that cross zones.
  - Dates like "Tue 26 Nov", no ordinals.
  - Chunk confirmation codes ("K7Q 4ZD") with a Copy button.
  - Format with `Intl.DateTimeFormat` in the trip's time zone.
- **Change notes name the change:** "Sam moved Dinner to 8 PM", never "Plan updated". [Standard, GOV.UK change notes]

## Declutter pass

Clutter is a priority problem, not a styling problem. Hiding things backfires: weak signifiers made links 22% slower to find, and hidden-only menus were used in 44–56% of tasks against 89% for visible ones. Cutting too far also breaks tasks (NN/g's study of 112 minimalist sites). So the order is fixed: count, rank, subtract, then style. [Evidence, NN/g; Nature 2021]

1. **Scope:** one device class (phone) and one context (in-trip). Write down the situations: moving, sun, weak signal, one hand.
2. **Inventory** every element on every screen: element, screen, purpose, how often it's used (or best guess), duplicates elsewhere.
3. **Rank tasks.** Ideally a top-tasks vote: each trip-mate picks their top 5 from a long list; a few tasks (the "long neck") take most votes. For a small group, a 10-minute poll. Until then, use the top tasks in SKILL.md as the hypothesis.
4. **Model the objects (ORCA lite):** Trip, Day, Item, Booking, Person, Post, To-do. Each object gets exactly **one canonical page**. Rank its attributes: the top 2–3 appear in rows, the rest on its page.
5. **Subtraction pass, explicitly:** for each element ask "does it serve a long-neck task?", "is it duplicated?", "would anyone miss it?". Ask "what can we remove?" before "what should we add?"; people overlook removals unless prompted (Adams et al., *Nature* 2021).
6. **Assign a fate:** keep on level 1; move to level 2 behind a clearly labelled control; merge into its canonical path; or remove. Never deeper than level 2.
7. **One primary action per screen.** Demote the rest to secondary buttons or a specifically labelled overflow.
8. **Rewrite every label and message:** front-loaded, verbs on buttons, sentence case, specific link text, error/empty/toast patterns.
9. **Glance budget on Today:** the key fact readable in ~2 s at 390×844 in Sunlight, one-handed; common tasks in ≤3 taps; flows ≤5 steps. (Adapted from NHTSA's 2 s per glance / 12 s per task and Android for Cars' 3 taps.)
10. **Status and notification audit:** status shows a mark and a word; badges count only unread items; push only for time-critical changes; everything else is shown inline ("3 changes since you last looked") or in a digest. Never notify while the app is open.
11. **Evaluate:** a heuristic review (Nielsen's 10, severity 0–4, ideally 3 reviewers), a cognitive walkthrough of the top 5 tasks, a first-click test (correct first clicks succeed ~87% of the time vs ~46% after a wrong one), then 5 people in context with timed tasks.
12. **Ship and re-measure** after each release and each trip.

**Deliverable:** inventory table → top-tasks ranking → fate table (keep / move / merge / remove, with reason and severity) → duplicate paths with the canonical one named → before/after wireframes → baseline and after measures (first-click success, task time, glance comprehension) → open questions for the owner.

## Per-screen guide for Voyroo

These come from the Voyroo implications in reports 02 and 05. Treat them as the starting hypothesis for a declutter pass, not as orders; check each against the current screen and the owner's priorities.

**Today: now / next / later only**
- The Next ticket first: what, when, where readable in a 2 s glance; the time in `display` with a countdown ("in 25 min · 5:30 PM").
- Ticket fields and its one filled button follow the time to the event (smart states): the day before, the confirmation and "Check in"; two hours out, "Leave by 18:40" and Directions; on arrival, door code and Wi-Fi; if cancelled or late, Call. Other actions as quiet chips; at most 3 visible.
- "Later today" as departure-board rows (3–5), past items dimmed, a "now" rule. Tomorrow's first item. No cards below the ticket.
- "Sleep tonight" as a glance strip: place, check-in time, one action.
- Planning tools, ideas, stats, saved posts and quick-action hubs don't belong on Today.

**Plan: one scrolling list with sticky day headers**
- Prefer one list over tabs or segmented controls that hide days or kinds (27% of users miss content in horizontal tabs vs 8% in collapsed sections, Baymard).
- The map, when present, filters by day with numbered pins that match the list.
- Ideas: one tap away. Votes and reactions are approved by the owner for ideas; keep them quiet (a small tally with avatars), only on ideas, no feed or read receipts.

**Item page: rich, ordered by task**
- Actions first (derived from fields; hide missing ones, offer "Add phone"), then key facts (time, address, code to copy), then links, contacts and socials, then saved posts, then notes and history.
- Group each topic inside one container (reservation: code, link, who booked, price; contacts), Transit-style, never a grid of identical cards.
- Who added what lives here, quietly, not on rows.
- Design failure states first: cancelled, moved, no confirmation yet.

**To-do: Things-style quiet**
- Bold section headings, status pills with mark + word, a quick-add row at the end of each section.
- "Mark as booked" is one tap with an Undo toast; the confirmation can be added later.

**Add (+): context-aware and fast**
- The sheet inherits the day or item it was opened from, shown as an editable chip. A pasted link, screenshot or flight number fills what it can.
- Only this sheet autofocuses its field.

## Open tensions (owner decides)

- **"+" in the tab bar.** Apple says tab bars are for navigation, not actions, and Hoober caps bars at 4–5 items. Options: keep "+" but make it visibly different from the tabs, or move to a contextual add on Plan and To-do. Test with a first-click test before deciding.
- **Reactions and votes.** Report 02 recommends no reactions, read receipts or activity feed; the owner approved votes and reactions on ideas. Keep them small, ideas-only, and out of Today.
- **Push, Wallet passes, calendar feed.** They're the web's stand-ins for Live Activities and widgets, but the owner has said no new features for now. List them as later options only.
