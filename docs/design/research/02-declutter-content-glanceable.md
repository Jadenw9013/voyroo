# Decluttering, content design and glanceable on-the-go UX

Research brief for the Voyroo redesign. Compiled 31 October 2026 from primary sources: NN/g, GOV.UK, Apple HIG, Android for Cars, NHTSA, Baymard, Polaris, Atlassian, Mailchimp, calmtech.com and peer-reviewed papers.

**Tags.** [Evidence] means a study or measured data. [Standard] means a published guideline from a platform or design system. [Convention] means common professional practice with no hard data behind it. Each source date is given in brackets.

## Summary

Professional decluttering has a fixed order. First count what exists. Then rank it against what users actually do. Only then subtract. Visual styling is the last step, not the first. The research gives four messages:

1. **Clutter is a priority problem, not a styling problem.** Simply hiding things backfires. Hidden navigation and weak signifiers measurably slow people down.
2. **On-the-go use has hard budgets that other fields have already measured.** In-car work sets roughly 2 s per glance, 12 s per task and 3 taps. Watch and Live Activity guidance points the same way: one idea, heavy type, a defined start and end.
3. **Words do most of the decluttering.** Front-loaded, specific and plain labels let you remove helper text, tooltips and onboarding.
4. **Interruptions have a measured cost, so restraint is the default.** Batch updates, update the screen in place, and never let colour carry status on its own.

---

## 1. Decluttering methods

**1.1 Do: inventory before you redesign.** For every screen, list every element: controls, chips, badges, links, helper text and empty states. Record its purpose, how often it is used and where it is duplicated. Then give each one a fate: keep, update or remove. [Standard. NN/g, Kaley, 2020]

**1.2 Do: run subtraction as its own step.** Across eight experiments, people overlooked helpful subtractive changes unless the task prompted them to consider removing something. In every review, ask "what can we remove?" before "what should we add?". [Evidence. Adams, Converse, Hales & Klotz, *Nature*, 2021]

**1.3 Do: rank tasks with users, not stakeholders.**
- **Method:** Top Tasks voting. Show people a deliberately long list of candidate tasks, and have each person pick their top 5.
- **Result:** votes always skew. A few tasks, the "long neck", take most of the votes, and a long tail takes the rest.
- **How to use it:** design the first screen around the long neck. Push the tail one level down.
- **Re-measure** every 6 to 12 months.

[Evidence and Convention. McGovern, Top Tasks, 2010 to 2018]

**1.4 Do: model objects before screens (OOUX, ORCA).**
- List the nouns: Trip, Day, Item, Booking, Person, Post.
- Map their **R**elationships, the **C**alls to action each object needs, and its **A**ttributes.
- Then *prioritize attributes per object*. A list row shows only the top two or three. The full set lives on the object's single canonical page.
- This removes duplicate paths by design.

The method runs in rounds: Discovery, Requirements, Prioritization, Representation. [Convention. Sophia Prater, ooux.com]

**1.5 Do: use progressive disclosure, with the right split.** Put frequently used features on the first level and defer rare ones. Nielsen puts it this way: "Progressive disclosure defers advanced or rarely used features to a secondary screen." Three rules:
- Stop at **two levels**.
- Make the control that reveals more obvious, and give it strong scent, meaning a label that predicts what is behind it.
- **Avoid several routes to the same secondary content.**

Decide the split from usage frequency data, not from taste. [Standard. NN/g, Nielsen, 2006]

**1.6 Do: give each screen one primary action.** GOV.UK says to avoid more than one default button per page. If a page has many calls to action, simplify it or split it. Polaris empty states likewise allow one primary button. [Standard. GOV.UK Design System; Polaris]

**1.7 Don't: subtract until tasks break.** NN/g's study of 112 minimalist sites found that cutting elements often removed content people needed for their main tasks. Wide negative space also pushed key content off-screen. Moran's verdict: "minimalism for minimalism's sake alone doesn't help users". [Evidence. NN/g, Moran, 2015]

**1.8 Don't: hide or disable controls silently.** Apple advises against disabling or hiding tab bar items when their content is unavailable; explain why instead. GOV.UK avoids disabled buttons because of their poor contrast and the confusion they cause. [Standard. Apple HIG; GOV.UK]

**1.9 Do: use undo instead of confirmation dialogs.** When confirmations are frequent, people learn to click through them. Keep confirmations for actions that are destructive, expensive or irreversible. Label their buttons with the outcome ("Delete file" / "Keep file"), not Yes/No. [Evidence and Standard. NN/g, Nielsen, 2018, reviewed 2026]

**1.10 Do: choose Today-screen content by time relevance.** Use these sources to decide what goes on the home screen:
- **Apple Live Activities:** for things with a defined start and end. Show only what matters now, and end the activity promptly.
- **Apple widgets:** favour information that changes through the day, and focus on one idea.
- **Android for Cars:** offer shortcuts first (favourites, recents) and pre-selected defaults.

So Today should hold the current or next event, its actions, and a short "later" list. Planning tools do not belong there. [Standard. Apple HIG; Android for Cars]

---

## 2. Cognitive load and attention

**2.1 Don't: flatten affordances.**
- **The cost:** links and buttons with weak signifiers took 22% longer to find and drew 25% more fixations. Users often looked straight at the target without recognizing it.
- **When flat works:** only with low density, a conventional layout and high-contrast, well-spaced targets.

[Evidence. NN/g, Moran, 2017, n=71, eyetracking]

**2.2 Don't: hide primary navigation.** On mobile, sites with combined visible and hidden navigation got navigation used in 89% of tasks. Hidden-only menus got 44 to 56%. If there are 4 or 5 top-level destinations, show them all. [Evidence. NN/g, Pernice & Budiu, 2016, n=179]

**2.3 Do: apply Hick's law with its caveats.**
- **Where it applies:** decision time grows with the number of choices, but mainly when the choices are unfamiliar and equally likely.
- **Long lists can still work:** an ordered, grouped list where the options stay visible relies on recognition, not memory, so it stays usable.
- **The "7±2" rule is a myth for menus**, because the items stay on screen. Working memory matters only when users have to *hold* things in mind, and even then plan for 3 to 6 items.

So order options by likelihood and group them. Don't cut useful options just to hit a number. [Evidence. NN/g, Moran, chunking, 2016; NN/g, Sherwin, Hick's law video, 2018]

**2.4 Do: design for recognition, not recall.**
- Show recent items.
- Keep options visible.
- Put text labels on icons. Almost no icon is universally understood except home, print and search.
- Use tips in context rather than tutorials up front.

[Evidence. NN/g, Budiu, 2024; NN/g, "Icons need text labels"]

**2.5 Do: give every label strong information scent.** Be specific and use the user's words. Avoid "More" and "Learn more". On small screens the surrounding context is easy to miss, so the label must carry the meaning on its own. [Evidence. NN/g, Budiu, 2020]

**2.6 Do: front-load for scanning.**
- **First words:** people scanning lists often see only the first two words of each item. For 35% of the links tested, users who saw only the first 11 characters could not predict where the link went. [Evidence. NN/g, Nielsen, 2009]
- **Reading share:** people read only about 20 to 28% of the text on a page. [Evidence. NN/g, cited by GOV.UK]
- **Screen position:** attention concentrates at the top of the first screen. [Evidence. NN/g, 2018]

**2.7 Do: chunk strings and groups.** Break confirmation codes, phone numbers and dates into their conventional groups. Group related items using space. [Evidence. NN/g, Moran, 2016]

**2.8 Know what tabs and segmented controls cost.**
- **Overlooked content:** content in non-default tabs gets less attention. Baymard found 27% of users overlooked content in horizontal tabs, against 8% for collapsed vertical sections. [Evidence. Baymard]
- **When not to use tabs:** when users must compare across them, or when the hidden content is critical. [Standard. NN/g, Sunwall, 2024]
- **If you do use them:**
  - keep them few;
  - use labels of one or two words;
  - mark the selected tab in two ways;
  - don't fade unselected tabs;
  - no all caps.

**2.9 Do: keep mobile text brief.** Comprehension on phones roughly matches desktop for easy text, but reading slows as content gets harder. [Evidence. NN/g, Moran, 2016, n=276]

---

## 3. Glanceability and use in motion

**3.1 Do: set a glance budget.** NHTSA's in-vehicle guidelines target single glances of 2 s or less, and 12 s or less in total per task. They are voluntary, and the Phase 2 extension to portable devices was only proposed. Adopt the budget anyway: the answer to "what's next?" must be readable in one glance of about 2 s. [Standard, adapted. NHTSA, 2013]

**3.2 Do: borrow the Android for Cars limits.**
- **Text:** 1 to 3 lines, at most 120 characters.
- **Taps:** "Drivers can complete common tasks in three taps or less."
- **Steps:** flows of 5 steps or fewer, ideally 3 or fewer.
- **Interruption:** tasks must pause and resume without losing progress.
- **Updates:** refresh content in place rather than adding steps.

[Standard. Android for Cars design guidelines]

**3.3 Do: follow Live Activity and widget rules for "now" surfaces.**
- **Live Activities:**
  - Use medium weight or heavier text.
  - Allow at most one essential control.
  - Update only when something meaningful changes.
  - No promotions.
  - Show an innocuous summary of private details.
  - In Apple's words: "Offer Live Activities for tasks and events that have a defined beginning and end."
- **Widgets:**
  - Keep density balanced: too sparse looks pointless, too dense won't scan.
  - Show when data was last updated if it can go stale.
  - Deep-link to the exact item.
  - Don't rely on colour.

[Standard. Apple HIG]

**3.4 Do: design for interactions that last seconds.** watchOS guidance assumes focused interactions under a minute, completed with a gesture or two. Complications and notifications get used more than the app itself. [Standard. Apple watchOS HIG]

**3.5 Design for situational impairment.**
- **Context changes performance:** walking, lighting and task type interact, so a design that works sitting indoors can fail on the move. [Evidence. Barnard, Yi, Jacko & Sears, 2007]
- **One-handed use:** Microsoft's persona spectrum treats a parent holding a child as situationally one-armed. [Convention. Microsoft Inclusive Design]

**3.6 Do: design for one hand.**
- **How people hold phones:** of people observed touching their phones, 49% held them one-handed, 36% cradled them and 15% used two hands. Thumbs drove about 75% of interactions. [Evidence. Hoober, 2013, n=1,333]
- **Touch accuracy:** about 7 mm at the screen centre, about 12 mm at the corners. People prefer to touch the centre. [Evidence. Hoober, 2017]
- **Target sizes:** 44 pt (Apple), 48 dp (Material), 24 CSS px minimum (WCAG 2.2, criterion 2.5.8). Space edge targets further apart. [Standard]

**3.7 Do: engineer for sunlight.**
- **Glare destroys contrast:** a panel's contrast can fall below 2:1 in direct sun. Glare and reflection matter more than the light-versus-dark choice. [Evidence. Display-measurement literature]
- **Light or dark mode:** dark text on light was better for small text and at night. Under daytime, glance-like conditions, polarity made no difference. [Evidence. Dobres et al., *Applied Ergonomics*, 2017; NN/g, Budiu, 2020]
- **Typeface:** a humanist typeface cut total glance time by about 10.6% for men. The study was Monotype-funded and ran in a simulator. [Evidence. MIT AgeLab, 2012]
- **What to do:** use heavier weights. Aim for 7:1 contrast (WCAG AAA) on critical text such as times, codes and addresses. Never put critical data in the muted colour.

**3.8 Do: use the transit "now/next" pattern.**
- Put the next departure first, in big text, with a countdown.
- Mark live data apart from scheduled data. Transit uses a "waves" icon for this.
- Send proximity prompts, such as "two stops away".

[Convention. Transit app help, 2018 to 2024]

**3.9 Do: degrade gracefully when signal drops.** Calm technology says to "work even when it fails". Show the last-synced time, keep the current day cached, and queue actions until the connection returns. [Convention. calmtech.com]

---

## 4. Content design

**4.1 Do: put the most important information first.** Use the inverted pyramid. Headings should be specific, front-loaded and readable as a standalone outline. [Standard. GOV.UK, "Clear structure"]

**4.2 Do: use plain language.**
- Choose short, familiar words ("buy", not "purchase").
- Split sentences longer than about 25 words.
- Prefer the active voice.
- No buzzwords; explain any specialist term the first time it appears.
- Plain English is preferred *more* strongly by experts, not less.

[Standard and Evidence. GOV.UK, "Clear language"]

**4.3 Do: use sentence case everywhere**, titles included. No all caps. [Standard. GOV.UK A to Z; NN/g tabs]

**4.4 Do: make button labels verbs that describe the result.**
- GOV.UK examples: "Start now", "Save and continue", "Add another address".
- Polaris: lead with strong, actionable verbs, and avoid "you can".
- A toast confirmation should repeat the verb, as Voyroo already does.

[Standard. GOV.UK Design System; Polaris]

**4.5 Do: write error messages as what happened plus how to fix it.**
- **GOV.UK:** be specific. Avoid "sorry", "please", "invalid", blame, humour and jargon, and keep the user's input in the field.
- **Polaris:** a search with no results is an empty state, not an error. Keep red for genuinely critical messages.

[Standard. GOV.UK Design System; Polaris]

**4.6 Do: give empty states three parts:** what the status is, a cue that teaches, and a direct action.
- **NN/g:** don't show "nothing here" while content is still loading.
- **Atlassian:**
  - Keep the title short.
  - Write a body of one or two sentences.
  - Use a call to action of one or two words.
  - The more often a message appears, the less playful it should be.

[Standard. NN/g, Kaplan, 2021; Atlassian Design]

**4.7 Don't: use a marketing voice.** Mailchimp strips out hype and over-promising. Clarity beats entertainment, and humour is used only when it comes naturally. [Convention. Mailchimp style guide]

**4.8 Do: format numbers, times and dates for scanning.**
- **GOV.UK times:** 5:30pm, "midday" and "midnight" rather than 12pm, and "to" in ranges (10am to 11am).
- **GOV.UK dates:** 2 June, with no ordinals.
- **GOV.UK numbers:** numerals for numbers of 2 and above, and commas above 999.
- **GOV.UK time zones:** label the zone when readers may be in another one.
- **For a trip app:**
  - Pick one time format per locale.
  - Use tabular figures.
  - Pair relative time with absolute time ("in 25 min · 5:30pm").
  - Chunk confirmation codes.

[Standard. GOV.UK A to Z; Convention]

---

## 5. Notifications, badges and status

**5.1 Start from restraint.** Case's calm technology principles:
- "Technology should require the smallest possible amount of attention".
- Use the periphery.
- Inform without overwhelming.
- Use the minimum technology the problem needs.
- Respect social norms.

[Convention. calmtech.com; Case, *Calm Technology*, O'Reilly, 2015; after Weiser & Brown, 1995]

**5.2 Every notification has a cost.** Simply *receiving* a notification, without responding, harmed attention-task performance about as much as active phone use. [Evidence. Stothart et al., 2015, n=166]

**5.3 Batch updates, but don't go silent.**
- **Three batches a day:** better attention and mood, and less stress, than the control group. [Evidence. Fitz et al., *Computers in Human Behavior*, 2019, n=237]
- **Hourly batches:** made little difference.
- **No notifications at all:** raised anxiety and fear of missing out.

**5.4 Follow the platform rules for notifications and badges.**
- Don't send several notifications about the same thing.
- Don't notify while the app is open; update the screen quietly instead.
- Badge only the count of unread notifications.
- Never rely on a badge alone.
- Badge tabs only for critical information.

[Standard. Apple HIG notifications and tab bars]

**5.5 Treat indicators as clutter until proven otherwise.**
- Before adding one, weigh how important the information is, how often it changes, and whether people would miss it.
- Place it next to the thing it describes.
- Match how intrusive it is to how urgent the information is.

[Standard. NN/g, Flaherty, 2024]

**5.6 Never let colour carry status alone.**
- Pair an icon with a word (WCAG 1.4.1, Level A).
- Meaningful icons need 3:1 contrast (WCAG 1.4.11).
- Widgets may render monochrome.

[Standard. W3C; Apple HIG]

---

## 6. Lists, cards and tables on mobile

**6.1 Cards are for browsing mixed content.** Avoid them when users scan for a specific item, compare options, work through ranked content, or look at homogeneous items. Cards are less scannable than lists because each card positions its elements differently. [Evidence and Standard. NN/g, Laubheimer, 2016]

**6.2 Use lists for homogeneous items.**
- Keep elements in the same position on every row.
- Anchor the leading visual on the left.
- Make the whole row the tap target.
- Don't mix row types in one list.

[Standard. Material Design lists; Zurich DS]

**6.3 Give list rows a fixed anatomy.** [Convention]
- **Leading:** a kind icon or the time, in tabular figures.
- **Headline:** front-loaded.
- **Supporting line:** at most one.
- **Trailing:** either one status or one action, not both.
- **Height:** no more than 3 lines.

**6.4 Group with space first.** Proximity overpowers colour and shape as a grouping cue. Use dividers sparingly, and boundaries (cards) only when a region needs to read as one unit. Removing a divider usually means adding space in its place. [Evidence. NN/g, Gestalt proximity; Visa DS]

**6.5 Use tables on phones only for comparing values in 2 to 3 short columns.** Otherwise stack the data into rows. Use photo grids for homogeneous images. [Convention; NN/g cards]

---

## 7. Collaboration UI for small groups

**7.1 Provide peripheral awareness, not a feed.** Workspace-awareness research frames the need as "who, what, where". Showing others' presence and activity in the periphery improved task time and communication in shared workspaces. [Evidence. Gutwin & Greenberg, 1996 to 2002]

**7.2 Keep attribution quiet.** Put "Added by Sam · 2h" in the detail metadata, plus initials avatars. No reaction counts, streaks or "seen by" receipts. [Convention]

**7.3 Write specific change notes.** GOV.UK: "Do not say the page has been updated without saying what has changed." Skip trivial edits. [Standard. GOV.UK change notes]

**7.4 Show changes since the last visit inline, not by push.** Use an in-app marker such as "3 changes since you last looked", and fold the rest into a daily digest. Apple advises updating the screen in place while the app is open. [Standard and Convention]

**7.5 Allow private drafts.** Ink & Switch's Upwelling and Patchwork prototypes give authors "drafts" for creative privacy before changes reach the group. [Evidence, research prototype. Ink & Switch, 2023 to 2026]

---

## 8. Evaluating clutter

**8.1 Heuristic evaluation.**
- Use 3 to 5 evaluators, each working independently for 1 to 2 hours.
- Scope the review to a task or a device.
- Consolidate findings afterwards, for example with affinity mapping.
- Rate each issue's severity.

Heuristic 8 ("Aesthetic and minimalist design") is the declutter lens, but heuristics never replace testing. [Standard. NN/g, Moran & Gordon, 2023; Nielsen, 1994, reviewed 2024]

**8.2 Cognitive walkthrough.** At every step, ask four questions:
1. Will users try to achieve the right result?
2. Will they notice the correct action?
3. Will they associate it with their goal?
4. Will they see progress?

A "no" to any question fails the step. [Standard. NN/g, Flaherty, 2022]

**8.3 Five-second test.** It checks first impressions and clarity on single-purpose screens only. It does not measure usability, and most problems appear after the five seconds. [Evidence, limited. Gronier, 2016]

**8.4 First-click test.**
- **Original study:** users whose first click was correct succeeded 87% of the time, against 46% after a wrong first click. [Evidence. Bailey & Wolfson, 2009]
- **Replication:** a tree-test replication found 81% against 14%. [Evidence. MeasuringU]

**8.5 Small, repeated usability rounds.**
- **Small rounds:** 5 users find about 85% of problems.
- **Distinct user groups:** use 3 to 4 per group.
- **Metrics:** need about 20 users.

[Evidence. NN/g, Nielsen, 2000]

**8.6 Time the top tasks.** McGovern's Task Performance Indicator (TPI) combines success rate with time against a target time. About 13 to 18 participants give stable success rates. On phones, test in context: standing, walking, one-handed, outdoors, on a throttled network. [Convention. McGovern TPI]

**8.7 What a professional declutter deliverable contains:**
1. An inventory spreadsheet.
2. A top-tasks ranking.
3. A screen-by-screen fate table: keep, move, merge or remove, with rationale and severity.
4. A list of duplicate paths, with the canonical path for each.
5. Before/after wireframes.
6. Baseline and after metrics: first-click success, task time and glance comprehension.

---

## The declutter pass: step by step

1. **Set the scope:** one device class (phone) and one context (in-trip). Write down the contexts too: on the move, in sun, on a weak signal, one-handed.
2. **Inventory** every element on every screen into a spreadsheet: element, screen, purpose, frequency (from analytics), duplicates and owner.
3. **Rank tasks.** Run a top-tasks vote, or for a tiny group a 10-minute poll. Mark the long neck: about 5 tasks.
4. **Model the objects (ORCA lite).**
   - List the objects.
   - Give each object exactly one canonical page.
   - Rank each object's attributes: the top 2 or 3 appear in rows, the rest on its page.
5. **Subtraction pass** with the explicit prompt "remove first". For each element ask:
   - Does it serve a long-neck task?
   - Is it duplicated?
   - Would anyone miss it?
6. **Assign each element a fate:**
   - Keep it on level 1.
   - Move it to level 2, behind a clearly labelled control.
   - Merge it into its canonical path.
   - Remove it.
   - Never go below level 2.
7. **One primary action per screen.** Demote the rest to secondary buttons or overflow, with specific labels.
8. **Rewrite every label and message:**
   - front-loaded;
   - verbs on buttons;
   - sentence case;
   - specific link text;
   - error, empty and toast patterns.
9. **Run the glance budget** on the Today/Next surface. The key fact must be readable in about 2 s, in sunlight mode, one-handed. Common tasks take at most 3 taps.
10. **Audit status and notifications:**
    - Status shows an icon and a word.
    - Badges count only unread items.
    - Pushes are reserved for time-critical events.
    - Everything else goes into a digest.
11. **Evaluate:**
    - Heuristic review with 3 evaluators.
    - Cognitive walkthrough of the top 5 tasks.
    - First-click test.
    - 5 users in context, with timed tasks.
12. **Ship and re-measure.** Repeat the top-tasks timing after each release and every trip.

---

## Implications for an on-the-go trip app (Voyroo)

1. **Today is "now / next / later" only.** Show the Next ticket, a "Later today" list of no more than 3 to 5 rows, and tomorrow's first item. Planning, ideas and saved posts are one tap away, never on Today.
2. **The ticket passes a 2-second glance test.**
   - What, when and where must read in one glance.
   - Show the time large, in heavy tabular figures, with a countdown beside it ("in 25 min · 5:30pm").
   - Use 1 to 3 lines of text.
3. **Ticket actions depend on the kind of item, at most 3 visible.** For example: a flight shows Copy code; a stay shows Directions and Call; an activity shows WhatsApp. Everything else goes behind a specific label such as "More for this booking", not "More".
4. **Reconsider the "+" in the bottom bar.** Apple says tab bars are for navigation, not actions. Test a contextual add button on Plan and To-do against the tab-bar "+" with a first-click test.
5. **Give every item exactly one canonical page.** "Mark as booked" can live on the To-do row and on the item page, but nowhere else. Audit for third and fourth routes.
6. **Rows are minimal; item pages are rich.** This matches the owner's stated wish for a simple guide plus rich item pages.
   - **Rows:** kind icon, a front-loaded title, one meta line, one status or action.
   - **Item page, ordered by task:** actions first, then key facts (time, address, code), then links, contacts and socials, then notes and history.
7. **Avoid segmented controls that hide critical content.** If Plan splits days or kinds into tabs, prefer one scrolling list with sticky day headers. Baymard and NN/g show that people miss non-default tabs.
8. **Push only time-critical changes.** That means things like a changed meeting point or time within the next few hours, or a cancellation. Batch everything else into one daily digest. Never push while the app is open; show "3 changes since you last looked" inline instead.
9. **Make offline visible and calm.**
   - Show "Updated 10:42am" when data may be stale.
   - Cache today's and tomorrow's data and the confirmation codes.
   - Queue edits made offline and say so in one line.
10. **Make Sunlight mode the stress test.** Target 7:1 contrast on critical text (times, codes, addresses). Never put critical facts in the muted colour. Keep the heavier weight.
11. **Format times consistently.**
    - Use one locale format.
    - Use "to" in ranges.
    - Add a time-zone label on travel days that cross zones.
    - Split codes into chunks ("K7Q 4ZD") and give them a Copy button.
12. **Keep collaboration quiet.**
    - Show who added an item on the item page, not on list rows.
    - Write change notes that name the change ("Sam moved Dinner to 8pm").
    - No reactions, read receipts or activity feed.
13. **Use undo, not confirmation.** Keep confirmations only for deleting a trip or a person. Label them with the outcome, for example "Delete trip".
14. **Empty states teach and offer an action.** For example: "No plans for Tuesday yet. Add a place or idea." with a single "Add" button. No humour on screens people see often.
15. **Test with the actual friends, in context.** Five people on a real bus or walk, timing the top 5 tasks one-handed. Add a 3-person heuristic review before each redesign milestone.

---

## Sources

- NN/g, Nielsen, *Progressive Disclosure* (2006): https://www.nngroup.com/articles/progressive-disclosure/
- NN/g, Kaley, *Content Inventory and Auditing 101* (2020): https://www.nngroup.com/articles/content-audits/
- Adams et al., *People systematically overlook subtractive changes*, Nature 592 (2021): https://doi.org/10.1038/s41586-021-03380-y
- McGovern, Top Tasks: https://gerrymcgovern.com/ ; https://medium.com/@gerrymcgovern/identifying-customer-top-tasks-ee228206b6ed ; TPI: https://medium.com/@gerrymcgovern/continuously-improving-top-tasks-edcd62cb2667
- OOUX, ORCA (Prater): https://www.ooux.com/what-is-ooux
- NN/g, Moran, *Characteristics of Minimalism* (2015): https://www.nngroup.com/articles/characteristics-minimalism/
- NN/g, Moran, *Flat UI Elements Attract Less Attention* (2017): https://www.nngroup.com/articles/flat-ui-less-attention-cause-uncertainty/
- NN/g, *10 Usability Heuristics* (1994, reviewed 2024): https://www.nngroup.com/articles/ten-usability-heuristics/
- NN/g, Budiu, *Recognition and Recall* (2024): https://www.nngroup.com/articles/recognition-and-recall/
- NN/g, Budiu, *Information Scent* (2020): https://www.nngroup.com/articles/information-scent/
- NN/g, Nielsen, *First 2 Words* (2009): https://www.nngroup.com/articles/first-2-words-a-signal-for-scanning/
- NN/g, Moran, *Chunking* (2016): https://www.nngroup.com/articles/chunking/
- NN/g, Sherwin, *Hick's Law* (2018): https://www.nngroup.com/videos/hicks-law-long-menus/
- NN/g, Sunwall, *Tabs, Used Right* (2024): https://www.nngroup.com/articles/tabs-used-right/
- NN/g, Pernice & Budiu, *Hamburger on mobile* (2016): https://www.nngroup.com/articles/find-navigation-mobile-even-hamburger/
- NN/g, *Scrolling and Attention* (2018): https://www.nngroup.com/articles/scrolling-and-attention/
- NN/g, Moran, *Mobile content* (2016): https://www.nngroup.com/articles/mobile-content/
- NN/g, Laubheimer, *Cards* (2016): https://www.nngroup.com/articles/cards-component/
- NN/g, *Gestalt proximity*: https://www.nngroup.com/articles/gestalt-proximity/
- NN/g, Flaherty, *Indicators, Validations, Notifications* (2024): https://www.nngroup.com/articles/indicators-validations-notifications/
- NN/g, Nielsen, *Confirmation Dialogs* (2018): https://www.nngroup.com/articles/confirmation-dialog/
- NN/g, Kaplan, *Empty States* (2021): https://www.nngroup.com/articles/empty-state-interface-design/
- NN/g, Budiu, *Dark Mode vs Light Mode* (2020): https://www.nngroup.com/articles/dark-mode/
- NN/g, Moran & Gordon, *Heuristic Evaluation* (2023): https://www.nngroup.com/articles/how-to-conduct-a-heuristic-evaluation/
- NN/g, Flaherty, *Cognitive Walkthroughs* (2022): https://www.nngroup.com/articles/cognitive-walkthroughs/
- NN/g, Nielsen, *Test with 5 Users* (2000): https://www.nngroup.com/articles/why-you-only-need-to-test-with-5-users/
- Baymard, *Avoid Horizontal Tabs*: https://baymard.com/blog/avoid-horizontal-tabs
- GOV.UK, Clear structure: https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/writing-guidelines/clear-structure/
- GOV.UK, Clear language: https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/writing-guidelines/clear-language/
- GOV.UK, A to Z style guide: https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/style-guides/a-to-z-style-guide/
- GOV.UK, Change notes: https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/writing-guidelines/change-notes/
- GOV.UK Design System, Button: https://design-system.service.gov.uk/components/button/ ; Error message: https://design-system.service.gov.uk/components/error-message/
- Shopify Polaris, Error messages / content: https://polaris.shopify.com/content/error-messages (now redirects to shopify.dev); Empty state: https://polaris-react.shopify.com/components/layout-and-structure/empty-state
- Atlassian Design, Empty state: https://atlassian.design/foundations/content/designing-messages/empty-state
- Mailchimp, Voice and tone: https://styleguide.mailchimp.com/voice-and-tone/
- Apple HIG: Live Activities https://developer.apple.com/design/human-interface-guidelines/live-activities ; Widgets https://developer.apple.com/design/human-interface-guidelines/widgets ; Notifications https://developer.apple.com/design/human-interface-guidelines/notifications ; Tab bars https://developer.apple.com/design/human-interface-guidelines/tab-bars ; watchOS https://developer.apple.com/design/human-interface-guidelines/designing-for-watchos
- Android for Cars: Design principles https://developer.android.com/design/ui/cars/guides/foundations/design-principles ; Define user tasks https://developer.android.com/design/ui/cars/guides/foundations/define-user-tasks ; Plan task flows https://developer.android.com/design/ui/cars/guides/ux-requirements/plan-task-flows
- NHTSA, Visual-Manual Driver Distraction Guidelines, Phase 1 (2013); summary: https://www.automotive-fleet.com/111248/dot-releases-voluntary-guidelines-for-automakers-to-limit-driver-distraction
- MIT AgeLab, Glance-based legibility: https://agelab.mit.edu/transportation-and-livable-communities/projects/glance-based-legibility
- Dobres et al., *Effects of ambient illumination, contrast polarity, and letter size…*, Applied Ergonomics (2017): https://www.sciencedirect.com/science/article/abs/pii/S0003687016302459
- Barnard, Yi, Jacko & Sears, *Capturing the effects of context…*, Personal and Ubiquitous Computing (2007): https://pure.psu.edu/en/publications/capturing-the-effects-of-context-on-human-performance-in-mobile-c/
- Hoober, *How Do Users Really Hold Mobile Devices?* (2013): https://www.uxmatters.com/mt/archives/2013/02/how-do-users-really-hold-mobile-devices.php ; *Design for Fingers, Touch, and People, Part 3* (2017): https://www.uxmatters.com/mt/archives/2017/07/design-for-fingers-touch-and-people-part-3.php
- Microsoft Inclusive Design (persona spectrum): https://inclusive.microsoft.design/
- Transit app, 6.0 quick start: https://help.transitapp.com/article/546-transit-6-0-quick-start-guide ; FAQ: https://transitapp.com/faqs-en
- Calm Technology: https://calmtech.com/ ; Case, *Calm Technology* (O'Reilly, 2015)
- Stothart, Mitchum & Yehnert, *The Attentional Cost of Receiving a Cell Phone Notification*, JEP:HPP 41(4) (2015): https://www.sciencedaily.com/releases/2015/07/150709133044.htm
- Fitz et al., *Batching smartphone notifications can improve well-being*, Computers in Human Behavior 101 (2019): https://doi.org/10.1016/j.chb.2019.07.016
- W3C, Understanding 1.4.11 Non-text Contrast: https://www.w3.org/WAI/WCAG21/Understanding/non-text-contrast ; 1.4.1 Use of Color: https://www.w3.org/WAI/WCAG21/Understanding/use-of-color
- Gutwin & Greenberg, *A Descriptive Framework of Workspace Awareness*: https://collablab.northwestern.edu/CollabolabDistro/nucmc/GutwinGreenberg_FrameworkWorkspaceAwareness.pdf
- Ink & Switch, Patchwork notebook (2024 to 2026): https://www.inkandswitch.com/patchwork/notebook/
- Bailey & Wolfson, first-click (2009), and the MeasuringU replication: https://measuringu.com/first-choice/
- Gronier, five-second test validation (2016), via Smashing Magazine: https://www.smashingmagazine.com/2023/12/five-second-testing-case-study/

**Verification notes.** Several numbers come from summaries, not the full papers:
- **Stothart:** only the "more than 3×" error figure was checked.
- **Barnard:** no effect sizes were retrieved.
- **NHTSA:** the guidelines' figures are taken from press summaries.
- **Sunlight contrast:** the figure for direct sun comes from vendor and measurement literature.
- **Hoober:** the 2017 per-zone values were not all visible.
- **Apple HIG:** the pages were read through Apple's JSON data endpoints.
