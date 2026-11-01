# 05: Teardown of exemplary on-the-go, travel and utility apps

Research date: 31 Oct 2026. The strongest sources are in the designers' own words: Apple's *Behind the Design* on Flighty, Transit's own blog, Linear's own posts, Airbnb's VP of Design in It's Nice That, and the portfolio of Citymapper's Live Activity designer. Everything else comes from reviews and press, and is labeled that way. Quotes are under 15 words, with at most one per source.

## Summary

The best apps people use on the move share one idea: **when you open the app, it should already be showing the answer**, set out in a format people already know (a departures board, a ticket, a station sign). Their visual styles differ, but they agree on structure:

1. **The home screen answers "what now?" without a tap.** When Transit hid its Nearby list behind a map in 2014, about 20% of users stopped using the app.
2. **One loud object per screen.** It is a card where the key figure comes first (time, gate, ETA) and the supporting facts are grouped beneath it.
3. **The card changes with the clock.** Flighty, Citymapper's GO mode and Airbnb's Trips tab show different fields as the event gets closer.
4. **Details come up in a sheet over the context**, not on a new page.
5. **Quiet chrome, loud content.**
6. **The app plans for failure and for being offline.**
7. **Plain human words** ("Get me somewhere").

On the mobile web, Live Activities and widgets aren't available. The closest substitutes are:

- a Today screen that opens straight onto the answer
- web push to the installed app
- Wallet passes and calendar subscriptions, which borrow native Lock Screen surfaces
- well-built sheets
- deep links to Maps, the phone dialer and WhatsApp
- a visible offline timestamp

## Per-app teardowns

### Flighty: Apple Design Award 2023, Interaction
- **Philosophy** (Apple, 5 Jun 2023). Founder Ryan Jones wants the app to feel "almost boringly obvious". His model is the airport departures board: one line per flight, refined over decades to show what matters. His starting pain point was forgetting his seat number right after putting the boarding pass away.
- **Now/next.** The flight card's content depends on time to departure. A third-party analysis counts about 15 "smart states":
  - confirmation details a day out
  - gate, boarding time and when to leave a few hours out
  - "your plane is here" at the gate
- **Off-app.** The Live Activity and Dynamic Island borrow airport signage. Before takeoff they collapse to a minimal progress counter, because the app assumes no connection until landing.
- **Failure-first.** Jones says the app must perform best when things go wrong. Flighty tracks the inbound aircraft about 25 hours ahead and predicts delays before airlines announce them.
- **Sharing and process.** Live share links work for people without the app, which helps airport pickups. The team sketches about 20 concepts per problem so they don't fall back on their existing asset library.
- **Leaves out.** Raw data and settings: the data is "pilot-grade" (flighty.com) but shown in plain terms.

### Transit: blog posts 28 Aug 2018 and 25 Aug 2025; MacStories, 2024
- **Launch to answer.** The app opens on nearby lines with live departures, not on a search box. After the 2014 drop-off, the team's rule became "Homescreens are sacred."
- **5.0 (2018).**
  - Search moved toward the middle of the screen, within thumb reach.
  - Swiping down goes back.
  - Route map, schedule and alerts were merged into one screen.
  - The search bar turns purple when the map is panned away from your location, so departure times are never silently wrong.
- **6.0 (2025).**
  - The ETA leads each card, enlarged from 18pt to 60pt.
  - Alerts, crowding, accessibility status and cancellations are grouped inside the card beneath it. The stated aim: "No skimming, no scanning, no thinking required."
  - A custom typeface, Puffin, picked for skimming.
  - Brighter colors and a midnight dark mode. Dark mode is used by about 75% of users after sunset.
  - The cards scale with the phone's text size.
- **Detail on demand.** Platform, exit and which end of the train to board appear only when relevant (MacStories).
- **Live Activity.** Shows stops remaining. The Dynamic Island expands by itself two stops out.

### Citymapper
- **Language first** (2014 talk write-up; It's Nice That interview with Gilbert Wedam, May 2015). The team designs from the questions people actually ask, in their own words: "Get me somewhere", "Get me home". Wedam calls Get Me Home the product's attitude: an escape route that's always there.
- **Structure.**
  - The home screen has search, Home and Work shortcuts, and transport modes.
  - Route results compare time, cost and ease.
  - Line colors match station signs.
- **GO and the Live Activity** (designer Jason Hibbs, Sept 2022). GO was reduced to the essential guidance for four states: walk, wait, ride, arrive. The aim was "glanceable directions, suiting the way we use our phones while on the move." It includes alerts to get off and advice on which carriage to board.
- **Criticism** (Pratt critiques, 2019 and 2026).
  - The home screen is busy.
  - The highlighted stage sometimes lags reality.
  - Station pins ignore which entrances are actually open.

### Google Maps
- **Navigation.** In 2024 the bottom bar went from five tabs to three: Explore, You, Contribute.
- **Sheets.**
  - Since July 2024 on Android and March 2025 on iPhone, resizable sheets replace almost every full-screen view.
  - Even a fully expanded sheet leaves a strip of map visible.
  - Close moved to the top right, and the travel-mode switcher moved to the bottom, within thumb reach.
- **Place sheet.**
  - The collapsed state shows name, rating and open/closing status, then a row of chips: Directions, Call, Save, Share.
  - In the 2025 Material 3 Expressive beta, hairline-divided rows became tinted rounded containers with pill buttons.
- **Lists.** Each list's emoji marks its places on the map. Collaborative lists let a group add places and vote with emoji reactions (Nov 2023), which Google pitched as moving planning out of the group chat.
- **Glanceable directions** (Feb 2024). Progress and a live ETA show without pressing Start.
- **Offline.** You download areas in advance. Driving directions work offline; walking and transit directions don't. Downloaded areas expire and update automatically on Wi-Fi.

### Apple Wallet and Apple Maps Guides
- **Pass anatomy** (Apple's guidelines).
  - Header fields stay visible when the pass is collapsed in the stack.
  - Primary fields hold what you need to use the pass. A boarding pass gets two: origin and destination.
  - Secondary fields hold gate, seat and group. Everything else goes on the back.
  - A relevant date or location puts the pass on the Lock Screen at the right moment.
- **iOS 18 poster event tickets.** From the venue name and location alone, Wallet builds directions, the forecast for event time and a venue guide. Developers supply facts, not buttons.
- **iOS 26 boarding passes** (Sept 2025).
  - A Live Activity, airport maps and Find My for bags.
  - The Live Activity can be shared without exposing seat or boarding group.
  - Reviewers' main complaint: gate and time fields should never be blank.
- **Maps Guides.** Saved, shareable lists of places, where people receiving a guide can get directions to any place in it. iOS 26 adds an always-present floating Directions button.

### Airbnb: 2025 Summer Release, 13 May 2025; It's Nice That, 14 May 2025; 2026 release
- **Trips.** VP of Design Teo Connor describes Trips moving from a static list of reservations to a "living itinerary":
  - day by day
  - details surfaced when they matter, such as door codes or directions
  - in 2026, a map of reservations and nearby places, plus saving places and sharing with the group
- **Check-in.** Hosts write step-by-step photo instructions, which guests get 2 to 3 days before arrival. Hosts report guests miss them because they're reached by tapping the listing photo. **Critical information behind an unlabeled tap gets missed.**
- **Look.** Softer curves, subtle motion, and a playful, detailed icon set meant as a universal language. Plenty of white space and bold type.

### TripIt and Wanderlog
- **TripIt** (Going review, Jan 2026).
  - Forwarded confirmation emails build a day-by-day timeline.
  - Adding by hand auto-fills from a flight number, or a venue's address, phone and website from its name.
  - A floating + is always there.
  - Read-only sharing needs no account, and offline works on the free tier.
  - Emails it can't parse go to "Unfiled".
  - Weaknesses: it's plain, the bottom bar has a Pro tab, and the leave-by alert is paywalled.
- **Wanderlog.**
  - Itinerary and map in one view.
  - The map can show one day's pins at a time.
  - Lines connect pins visited in order.
  - Directions hand off to your map app.
  - Live collaborative editing.

### Things 3, Apple Reminders, Linear mobile
- **Things 3** (Apple Design Award 2017; MacStories, May 2017).
  - Today holds a *This Evening* section on the same screen.
  - Calendar events sit at the top and grey out once they've passed.
  - Tapping a to-do lifts it into a card in place while the list recedes.
  - The Magic Plus button can be dragged to where the new item should go.
  - Capture is fast and detail comes later. Color is used only as an accent.
- **Apple Reminders.** The same restraint: a "New Reminder" row at the end of each list.
- **Linear mobile.**
  - Launched Sept 2024 for work away from the keyboard, with create, archive and snooze on the inbox toolbar.
  - Oct 2025: Linear built its own glass-like navigation but left out refraction, which hurts legibility in dense interfaces.
  - Mar 2026: not every element deserves equal weight. Navigation is dimmed, separators softened, icons cut back, and "Structure should be felt not seen."

### Apple Design Award winners 2024–2026 and Material Design
- **2024, Interaction: Crouton** (recipes). Praised for keeping your focus on the kitchen counter, not the screen.
- **2025, Social Impact: Watch Duty.** Up-to-the-minute evacuation information.
- **2026, Visuals and Graphics: Tide Guide.** Cited for "crisp presentation of weather data that anyone can easily understand".
- **2026, Interaction: Moonlitt.**
- **Material Design Awards.** Trip.com won Universality in 2019.
- **Material 3 Expressive research** (2025: 46 studies, 18,000+ participants). Google reports that when key elements are emphasized, people find them up to 4x faster, and the gap between older and younger users closes.

## Pattern library

| Pattern | Problem it solves | How the exemplars do it | Mobile-web implementation notes |
|---|---|---|---|
| **Launch-to-answer** | A tap before any answer | Transit's Nearby; Flighty's next flight; Airbnb Trips on arrival | Server-render Today's Next card; cache it in the service worker for instant cold opens; no skeleton-to-layout jump. |
| **Departure-board row** | Lists you have to read, not scan | Flighty's one line per flight; Transit's line rows | Fixed-width time column with tabular figures, then title and one status word. |
| **Ticket card / hero number** | The key fact buried among peers | Transit's 60pt ETA; Wallet primary fields | Largest type on the screen for the key number; supporting facts grouped *inside* the card, never as sibling cards. |
| **Time-anchored card ("smart states")** | Static pages show everything at once | Flighty's states; Citymapper's walk/wait/ride/arrive; Airbnb's door code | A pure `stateFor(item, now)` picks 2–3 fields and the primary action; re-run on `visibilitychange`. |
| **Single primary action + chip row** | Many equal buttons, so no obvious next step | Google Maps chips; Wallet shortcuts; Apple Maps' floating Directions | One filled button chosen by state; the rest quiet. `tel:`, `wa.me`, Maps universal links. |
| **Facts in, actions out** | People hand-build their own links | Wallet derives directions and weather from venue tags; TripIt auto-fill | Store structured fields; derive the actions; hide an action whose field is empty rather than disabling it. |
| **Detail sheet with peek height** | A new page loses the context | Google Maps' compact and full sheets with a map sliver | Drawer with snap points (e.g. Vaul) or `<dialog>`; keep a sliver of the page visible; `overscroll-behavior: contain`; safe-area insets; one sheet at a time. |
| **Lift-in-place expand** | Disorienting jumps from list to detail | Things 3 | View Transitions API from the row to the sheet header; cross-fade fallback. |
| **Day timeline with a "now" line** | Losing track of what's done and what's next | Things' greyed past events; TripIt and Airbnb day-by-day | Dim past items (don't hide them); a thin "now" rule; auto-scroll to it. |
| **Glance strip** | Status hidden in the details | Google's "Open · Closes 10 PM"; Flighty's gate line | One line under the title: status mark + word + one fact. |
| **Context indicator** | Data that is silently wrong | Transit's purple bar | An "Offline · saved 10:42" chip; tint the header when viewing a non-current day. |
| **Failure-first states** | The design breaks when plans change | Flighty's delay focus; Wallet's blank-field criticism | Design the cancelled, delayed and no-confirmation versions first; never a blank label. |
| **Context-aware add** | Navigating to the right place before you can add | Things' Magic Plus; TripIt flight-number fill | The + sheet inherits the day or item it was opened from; its guess shows as an editable chip. |
| **Shared live view** | "What time / where are we?" in the group chat | Flighty share links; shared Wallet Live Activity | A read-only now/next link with private fields stripped. |
| **Map layers by day** | A pile of pins | Wanderlog's day filters; Google's emoji markers | Day chips filter numbered pins that match the list order. |
| **Quiet chrome** | Navigation competes with content | Linear's dimmed nav; Things' accent-only color | Muted tab bar; accent only for the active tab and the one primary action. |
| **Human verbs** | System words add friction | Citymapper | "Get directions", "Call the hotel", "Show the booking". |

## Anti-patterns these apps avoid

- **Hiding the answer behind a map or a search box.** Transit's 2014 drop-off.
- **Equal visual weight for everything.** Linear's 2026 refresh exists to fix this.
- **Related information split across pages.** Transit 5.0 merged them into one screen.
- **Stacked sheets or modal chains.**
- **Color-only status.**
- **Critical information behind an unlabeled tap.** Airbnb check-in instructions.
- **Upsells on surfaces you need in a hurry.** TripIt's Pro tab is the counterexample.
- **Glass or refraction over dense text.** Linear rejected it.
- **Blank fields.** Wallet boarding passes were criticized for this.
- **Reaching for the existing components first.** Flighty sketches about 20 concepts instead.
- **Home screens that need customizing before they're useful.** Citymapper's critics.
- **Re-layouts that force users to relearn.** Transit 6.0 changed scale and type, not layout.

## Native versus mobile web

| Native surface | Web constraint | Best web equivalent |
|---|---|---|
| Live Activities / Dynamic Island | Not available | Today *is* the Live Activity. Refresh on focus, and use the Screen Wake Lock API while a code is shown. |
| Lock Screen pass | Not available from a web page | A server-signed **`.pkpass`** (needs an Apple Pass Type ID) and a Google Wallet save link, with `relevantDate` and location set. |
| Widgets | Not available | A **webcal/ICS subscription** with alerts, so the phone's own calendar widget shows "next". |
| Push | iOS 16.4+ only for Home Screen web apps | Web Push plus `navigator.setAppBadge()`; ask permission only after the app is installed and used. |
| Haptics | No Vibration API on iOS; the `<input switch>` trick is reportedly closed in iOS 26.5 | `navigator.vibrate` on Android only; elsewhere, pressed states, motion and toasts. |
| Sheets with detents | Must be built | Snap points, `dvh` units, the `visualViewport` API for the keyboard, focus trapped in `<dialog>`. |
| Dynamic Type | Partial | rem sizing, and `font: -apple-system-body` on iOS; test the hero time at 200%. |
| Offline | Service worker | Cache codes, addresses and phone numbers; show a "saved" timestamp; keep copy, call and directions working offline. |

## Implications for Voyroo

1. **Today: launch-to-answer.** The Next ticket stays the first thing painted, rendered on the server and cached for offline. Nothing goes above it, banners included.
2. **Today: a time-anchored ticket.** Choose its fields and its one filled button from the time left before the event, with the other actions as quiet chips:
   - the day before: confirmation and "Check in"
   - two hours out: "Leave by 18:40" and Directions
   - on arrival: door code and Wi-Fi
   - when it's late or cancelled: Call
3. **Today: a departure-board list for the rest of the day.** One line per item with tabular times. Past items dim, and a "now" rule separates done from next. No cards below the ticket.
4. **Today: "Sleep tonight" as a glance strip.** Place name, check-in time and one action, like a Wallet header field.
5. **Plan > Days: map layers by day.** Numbered pins match the list order. Keep the hand-off to Google Maps rather than building routing.
6. **Plan > Ideas: Google-style emoji voting**, so the group can rank ideas without the group chat. An idea's sheet leads with "Add to a day" and "Directions".
7. **Item page: facts in, actions out.** Store phone, WhatsApp, Instagram, website, address and confirmation as fields, and derive the action row from them. Hide actions whose field is empty, and show "Add phone" instead of a blank.
8. **Item page: a peek-height sheet.** It opens at about 55% and shows the title, a glance strip, the primary action and the confirmation to copy. Dragging it up reveals contacts, links, posts, notes and people. One sheet at a time, with a View Transition lift from the row.
9. **Item page: group each topic inside one card**, Transit-style: reservation (code, link, who booked, price) and contacts. No grid of identical cards.
10. **Item page and To-do: design the failure states first.** Cancelled, moved, no confirmation yet, a night with nowhere to stay. Each gets wording and one action to fix it.
11. **To-do: Things-style quiet.** Bold section headings, status pills that carry a mark and a word, and a quick-add row at the end of each section. "Mark as booked" is one tap with an Undo toast, and the confirmation can be added later.
12. **+ add: context-aware.** The sheet inherits the day or item it was opened from and shows that guess as an editable chip. A typed flight number or a pasted booking link auto-fills, as in TripIt.
13. **Off-app glance surfaces.** "Add to Wallet" for bookings with a confirmation number, and a calendar subscription per traveler, so the phone's own Lock Screen and widgets do what Live Activities would. Web Push only for changes ("Dinner moved to 8:00").
14. **Trust signals.** An "Offline · saved 10:42" chip, and a tinted header when someone is viewing a non-current day or a shared view.
15. **Chrome and type.** Mute the tab bar. Keep the accent for the active tab and the one primary action. Make the ticket's time far larger than anything else on screen, and check that it scales with Large text.

## Sources

- Apple Developer, "Behind the Design: Flighty" (5 Jun 2023): https://developer.apple.com/news/?id=970ncww4
- Apple Design Awards 2023: https://developer.apple.com/design/awards/2023/
- Flighty: https://flighty.com/ ; Mercury case study (15 May 2026): https://mercury.com/blog/flighty-app-case-study
- B. Crosley, Flighty design study (third-party, undated): https://blakecrosley.com/guides/design/flighty
- Transit, "The Big 5.0" (28 Aug 2018): https://blog.transitapp.com/the-big-5-0-transit-gets-a-makeover-eb169ecee240/
- Transit, "Transit 6.0" (25 Aug 2025): https://blog.transitapp.com/six-o/
- MacStories, Transit review (2024): https://www.macstories.net/reviews/transit-is-still-the-best-designed-transit-app-on-the-iphone-in-2024/
- J. Hibbs, "Citymapper: Live Activity" (Sept 2022): https://jasonhibbs.co.uk/work/citymapper-live-activity/
- Citymapper, Lock Screen Navigation: https://citymapper.com/news/2553/citymapper-introduces-ios-lock-screen-navigation
- It's Nice That, Gilbert Wedam (11 May 2015): https://www.itsnicethat.com/articles/citymapper-gilbert-wedam-1
- McGarvey, Citymapper talk (20 Jul 2014): http://www.mcgarvey.co.uk/2014/07/20/according-to-citymapper-design-begins-with-words/
- Pratt IxD Citymapper critiques (2019; 9 Sep 2026): https://ixd.prattsi.org/2019/02/design-critique-citymapper-iphone-app/ , https://ixd.prattsi.org/2026/09/design-critique-citymapper/
- 9to5Google, Maps iPhone sheets (7 Mar 2025): https://9to5google.com/2025/03/07/google-maps-iphone-sheet-redesign/
- 9to5Google, Maps bottom bar (31 Jul 2024): https://9to5google.com/2024/07/31/google-maps-bottom-bar-redesign-rolling-out/
- PhoneArena, Maps M3 Expressive (2025): https://www.phonearena.com/news/google-maps-small-touch-ups-material-3-expressive-makeover_id174179
- TechCrunch, collaborative lists (15 Nov 2023): https://techcrunch.com/2023/11/15/google-maps-gets-more-social-feature-help-you-collaborate-with-friends
- MacRumors, glanceable directions (28 Feb 2024): https://www.macrumors.com/2024/02/28/google-maps-rolls-out-glanceable-directions/
- Google Maps Help, offline maps: https://support.google.com/maps/answer/6291838
- Wallet guidelines (mirror of Apple's guidance): https://app.unpkg.com/apple-dev-mcp@2.1.9/files/content/universal/wallet.md
- MacRumors, Wallet in iOS 18 (14 Jun 2024): https://macrumors.com/2024/06/14/whats-new-in-apple-wallet-on-ios-18 ; WWDC25 "What's new in Wallet": https://developer.apple.com/videos/play/wwdc2025/202/
- 9to5Mac, iOS 26 boarding passes (2 Sep 2025): https://9to5mac.com/2025/09/02/ios-26-gives-boarding-passes-three-new-features-for-your-next-flight/
- AppleInsider, Maps Guides (28 Sep 2020): https://appleinsider.com/articles/20/09/28/how-to-use-apple-maps-guides-in-ios-14 ; MacRumors iOS 26 Maps: https://www.macrumors.com/guide/ios-26-maps
- Airbnb, 2025 Summer Release (13 May 2025): https://news.airbnb.com/airbnb-2025-summer-release
- It's Nice That, Airbnb with Teo Connor (14 May 2025): https://www.itsnicethat.com/articles/airbnb-app-redesign-140525
- Lodgify, Airbnb 2026 release (26 May 2026): https://www.lodgify.com/blog/airbnb-summer-release-2026/
- Airbnb Community, check-in guide: https://community.withairbnb.com/t5/Airbnb-updates/Tips-for-better-check-ins-Make-the-most-of-Airbnb-s-check-in/m-p/941993
- Going, TripIt review (13 Jan 2026): https://www.going.com/guides/tripit-review ; ScreensDesign: https://screensdesign.com/showcase/tripit-travel-planner
- Wanderlog: https://wanderlog.com/
- MacStories, Things 3 (May 2017): https://www.macstories.net/reviews/things-3-beauty-and-delight-in-a-task-manager/
- Linear, "Introducing Linear Mobile" (19 Sep 2024): https://linear.app/changelog/2024-09-19-introducing-linear-mobile
- Linear, "A Linear spin on Liquid Glass" (21 Oct 2025): https://linear.app/now/linear-liquid-glass
- Linear, "A calmer interface…" (12 Mar 2026): https://linear.app/now/behind-the-latest-design-refresh
- Apple Newsroom, ADA 2024: https://www.apple.com/newsroom/2024/06/apple-announces-winners-of-the-2024-apple-design-awards/ ; 2025: https://www.apple.com/newsroom/2025/06/apple-unveils-winners-and-finalists-of-the-2025-apple-design-awards/ ; 2026 (2 Jun 2026): https://www.apple.com/newsroom/2026/06/apple-reveals-winners-of-the-2026-apple-design-awards/
- 9to5Google, 2019 Material Design Awards: https://9to5google.com/2019/10/10/2019-material-design-awards-winners/
- Android Authority, M3 Expressive research (May 2025): https://www.androidauthority.com/google-material-3-expressive-details-3554486/
- Web platform notes: https://unpkg.com/ios-haptics@3.1.1/README.md ; https://pushpad.xyz/blog/ios-special-requirements-for-web-push-notifications ; https://www.pushwoosh.com/blog/add-to-apple-wallet-button/
