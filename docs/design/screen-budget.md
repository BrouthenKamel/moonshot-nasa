# Screen budget

What every screen of the step game may show, measured against main and turned into a keep / hide / delete
list per screen. Numbers come from `pnpm audit:clutter` (see [clutter-baseline.md](clutter-baseline.md) and
`scripts/e2e/clutter-audit.mjs`); baseline is main @ `7cd7435` (includes PR 63 interface clean-up, PR 69
Science, PR 74 orbit/transfer drag), 2026-11-15, 1440×900, engineer view off.

Input from other sessions is folded in and marked: **(PT)** Ideas playtester, **(SL)** simplification loop
(read from code), **(J)** Jakob playing. Each was checked against this audit's screenshots, counts or the code
before it went in; where main has moved past a remark, the row says so.

## The budget (agreed with Jakob, 15 Nov 2026)

1. **One decision per screen**: the choice the step exists for.
2. **At most 3 numbers visible by default**; everything else behind one shared **Why? / details** control.
3. **One main action button**; secondary actions go into a menu or disappear.
4. **Explanations show when needed** (on hover or on pick), not as standing paragraphs.
5. **Exception**: one compact line with the six resources (mass, power, budget, data, comms, time), because
   [docs/hackathon/checklist.md](../hackathon/checklist.md) asks the game to "clearly display the main
   resources". It does not count against the 3 numbers.

Score used to rank screens: **numbers×2 + buttons + panels×3 + words/40** (definitions in clutter-baseline.md).
A step screen that meets the budget scores about **35**: (3 + 6 resource numbers)×2 + ~10 buttons (main action,
Why?, menu, the dock, its choices) + 2 panels×3 + 60 words/40.

## The shared "details" control (build this first)

Every screen hides things the same way, so a player learns it once.

- **What it is**: one button labelled **Why?** (keyboard `?`), always directly under the screen's decision,
  left-aligned with it, never in a corner. On base screens it sits under the current-mission panel's line.
- **What it opens**: a drawer from the right edge over the scene, not a modal (the decision stays visible and
  clickable), 400 px wide, one column, scrolling on its own. Closes with the same button, `Esc` or a click on
  the scene.
- **Inside, always in this order** (each section only if the screen has it):
  1. *Why this matters*: the one-paragraph explanation (moves here from standing paragraphs).
  2. *The numbers*: every figure the screen used to show, as a label / value / unit table.
  3. *Checks*: the Go/No-Go lines this step's building fixes, with their margins.
  4. *Real missions*: the "like Lunar IceCube / Flashlight" references.
  5. *Engineer view*: what `Eng`/`eng-only` shows today (the engineer switch moves in here).
- **On pick**: hovering or focusing a choice shows a one-line tooltip with what changes ("+0.5 kg, +5 W, sees
  into shadow"). No card carries a standing paragraph.
- **One component**: `DetailsDrawer` + `useDetails(screenId)` to register content. The playtests check that the
  drawer holds every number the screen dropped.
- **Closed by default**; it opens by itself only the first time a check turns red (on *Checks*, once).

## Shared step chrome

Every step screen carries this header (PR 63 already removed the Sequence rail, Dashboard and header label):

| Element | Verdict | Reason |
|---|---|---|
| Step dock "1. Plan 2. Science 3. Craft 4. Rocket 5. Orbit 6. Launch" | **keep, rename** | see *Naming* below |
| Resource pill `M: 12.0/14kg P: 30/120W Δv: … $$: …` | **keep, change** | becomes the six-resource line. Today 4 of 6, with Δv instead of data, comms, time: **checklist gap**. (PT) proposes folding the chips into one HUD popover; the budget's resource exception says the line stays visible, so: the line stays, the popover replaces the HUD modal |
| `1 RISK` chip | keep | one chip that says whether Go/No-Go would pass; it links to the drawer's *Checks* |
| `📊 HUD` button + Mission Vitality modal (`H`) | **delete** (→ popover) | a bigger copy of the pill; only `Header.tsx` and `Shell.tsx` use it |
| `← Agency base`, engineer view, mute, settings | one ☰ menu | not decisions |
| Brand "MOONSHOT · LUNAR ICE MAPPER" | keep | one line |
| Capcom Rosa Vega tip (bottom left) | on pick / on red | the explanation that stands open on every step; otherwise just the avatar |
| Step header "0N TITLE / question" | keep | the decision as a question; drop its numeral, see *Naming* |
| `← Back` on Instruments, Orbit, Ride, Comms, Go/No-Go | **delete** | the dock does it |

**Cross-cutting (SL)**: `SynergyStrip` (Comms, Go/No-Go, Spacecraft, Instruments) and `DesignDeltaLine`
(Spacecraft, Comms, Instruments, Ride, Go/No-Go, Planning) put two commentary strips under nearly every
decision (checked: those files import them). Keep one, shown only on a conflict or warning.

### Naming (one scheme)

Three schemes disagree today (checked in `StepDock.tsx`, the step headers and the next-buttons):

| Step (headers, play order) | Dock today | Next-button that leads here |
|---|---|---|
| 00 Brief | – | – |
| 01 Mission planning | 1. Plan | Commence mission planning |
| 02 Instruments | 2. Science | Select instruments |
| 03 Rocket | 4. Rocket | Choose the rocket |
| 04 Spacecraft | 3. Craft | Build the spacecraft |
| 05 Orbit | 5. Orbit | Select orbit |
| 06 Ride (+ transfer stage) | – | Choose ride |
| 07 Communications | – | Setup communications |
| 08 Go / No-Go | 6. Launch | Go/No-Go review |

The dock also puts Craft before Rocket while play goes Rocket → Spacecraft. **Proposal**: one word per step,
used by dock, header and button alike, in play order, no numerals: **Brief · Plan · Instruments · Rocket ·
Craft · Orbit · Ride · Comms · Launch** (next-buttons read "Instruments →", "Rocket →" …). The steps-rocket-craft
session is renaming Ride: align with whatever it lands.

## Per screen, worst first

Counts are `score · numbers · buttons · panels · words` from the baseline. Flight screens depend on the
flight's random events and move by about ±15 between runs; base and step screens repeat exactly. "Checklist"
marks information the hackathon checklist requires: it may be hidden, never deleted.

### 1. Report — score **188.3** · 47 numbers · 12 buttons · 24 panels · 413 words · 2.9 screens tall

- **Decision**: what to change before flying again.
- **3 numbers**: rating /1000 (with grade), ice mapped vs 70 %, science data vs 300 MB.
- **Main action**: **Relaunch with changes** (opens the building that cost most points). Watch replay, New mission go in a menu.

Must stay compatible with the session capping a failed mission's grade at C and burning its budget: the stamp, grade and rating stay; only their presentation is in scope here.

| Element | Verdict | Reason |
|---|---|---|
| Stamp MISSION SUCCESS / FAILED + one sentence | keep | the outcome. The verdict currently shows 4 ways (stamp, sentence, header tag, narrator line) (SL): keep stamp + grade |
| Rating 820/1000 + grade + "best so far" | keep (1 number) | the score; checklist: scoring |
| Mission patch (`patch.webp`) | keep | the reward; swap the AI art for an SVG patch (SL) |
| Medals row (8 chips) | fold into requirements | repeats the requirement cards (SL); show "6 of 8" only |
| Five score bars | keep 2, hide 3 | ice and data are the brief; the rest in the drawer |
| "What cost you points" | keep first item, hide rest | the one thing to fix; checklist: why a mission succeeds or fails |
| Artemis debrief (4 crater cards, 16 numbers) | hide behind details | flavour. Debrief, FixItPanel and the decision→physics→outcome chains explain one question three times (SL): keep ONE explanation, the requirement chain |
| Requirement cards 1.1–1.5 (decision → outcome) | hide behind details, one click | the explanation to keep; checklist: how decisions shaped the outcome |
| Your CubeSat vs 3 NASA CubeSats | one line | "Closest real mission: Lunar Flashlight" (SL); full cards in the drawer |
| End actions: Relaunch, Replay, New mission, share code, run history | max 2 visible | Relaunch + one menu (SL) |
| Share and compare designs (code, copy, paste, load) | hide behind details | checklist lists "save, share and compare mission designs" under *Additional features*: optional, so hiding is safe; deleting is a call for Jakob |
| Run history with Replay per row | hide behind details | checklist: "simulate multiple times" |

### 2. Step 08: Go/No-Go — score **171.3** · 35 numbers · 19 buttons · 24 panels · 410 words · 2 screens tall

- **Decision**: launch now, or go back and fix.
- **3 numbers**: chance of full success, ice coverage forecast, data home forecast.
- **Main action**: **Hold to launch** (the key turn is its arm step). "Launch mission" stays only as the keyboard-accessible twin of the same control (it exists for that: `data-testid="launch-accessible"`).

| Element | Verdict | Reason |
|---|---|---|
| Verdict stamp | keep | the answer. The same message shows 4 times (stamp, sentence under it, orange paragraph, Capcom) (PT): keep the stamp |
| Sentence under the stamp | delete | repeats the stamp word for word; nothing else reads it |
| Orange paragraph (0 % ice, 4800 MB …) | hide behind details | explanation; the first blocker becomes one line with its Fix link |
| Chance of full success + bar | keep (1 number) | the risk being decided on |
| Four poll slips | keep as 4 lamps | the ritual; the verdict shows three ways (stamp, slips, grouped list) (SL): keep stamp + slips |
| Run the poll | run on entry | checked in code: launch is gated on `canGo` only, not on the poll, so the poll can play when the screen opens |
| Back to design | delete | the dock does it |
| Blocker card + Fix link | keep as one line | the fix |
| Warnings group | keep the Fix link, hide text |  |
| Passed (8) green cards | hide behind details | eight panels of "go" (SL); checklist: launch-vehicle and resource checks stay reachable |
| Craft box + Earth–Moon strip at the top | hide behind details | see chrome |
| (idea, PT) at about 0 % chance, one confirm that names the fix | option for Jakob | cheap safety net; not a clutter item |

### 3. Step 04: Spacecraft — score **135.3** · 39 numbers · 27 buttons · 9 panels · 132 words · 10 scene items

- **Decision**: which parts make the craft fit and fly (power and propulsion are the trade).
- **3 numbers**: mass vs limit, power vs need, Δv to the Moon.
- **Main action**: **Select orbit →**.

| Element | Verdict | Reason |
|---|---|---|
| 3D cleanroom with the craft | keep | the place |
| 9 always-open camera controls | one "Look around" button | close-up, whole craft, avionics, engine, payload, fold wings, panels, sun lamp, exploded view (PT) |
| "Does it fly?" (6 margin bars) | show only red/yellow bars | the rest collapse to "all OK" (PT); full set in the drawer |
| Power split bar + legend, "Ion power ready" chip | hide behind details | power is a kept number |
| Instruction paragraph | delete | the bins say it |
| 5 part bins, 17 cards with 2–4 numbers each | keep cards, 1 number each | the decision; full stats on hover. Checklist: components have mass, power, cost |
| Part labels in the scene (7) | keep | they jump to a bin |
| SynergyStrip + DesignDeltaLine under the bins | keep one, only on conflict | cross-cutting, see below |

### 4. Step 07: Comms — score **121.5** · 30 numbers · 25 buttons · 9 panels · 379 words · 2.3 screens tall

- **Decision**: which radio and which ground station get the data home.
- **3 numbers**: data carried a month vs data made, contact hours a day.
- **Main action**: **Go/No-Go review →**.

| Element | Verdict | Reason |
|---|---|---|
| Intro paragraph | delete | (SL) standing text, the diagram says it |
| 7.1 data link diagram + "Data gets home" stamp + meters | keep, pinned at top | the feedback for the whole step (PT). The only step that scrolls (2.3 screens here) |
| 7.2 radio, 7.3 station, 7.4 contact time | accordion, one open | (PT) one decision visible at a time |
| Radio picked 2 ways, station 3 ways | keep one each | (SL) design call for Jakob: cards or console |
| Duplicates: "Stored" vs "Storage on board", "Transmit time %" vs the power sentence, "Overflow lost" as cell + bar + warning | keep one each | (SL) |
| LinkRibbon (sticky copy of the console) | delete once 7.1 is pinned | (SL) only the comms console uses it |
| Per-card paragraphs | hide behind details | except the red "Does not reach Earth from the Moon": it IS the lesson (PT) |
| Section numerals 7.1–7.4 (and "07" when the dock says 6) | drop | they do not match the dock |
| Contact-hours dial | keep, question open | is it a real decision? If the sim never punishes the maximum, flag it (SL) |

### 5. Step 03: Rocket — score **105.3** · 19 numbers · 36 buttons · 9 panels · 170 words · 8 scene items

- **Decision**: none that changes the mission: its own caption says nothing here changes mission numbers.
- **3 numbers**: rocket height only.
- **Main action**: **Build the spacecraft →**.

**Options for Jakob (not decided):** (a) make the step optional, a "Customise rocket" link from Ride (PT); (b) make it matter via the launch-vehicle capacity check the checklist names; (c) keep it as is but as the quietest screen. Until decided, the keep/hide below applies.

| Element | Verdict | Reason |
|---|---|---|
| 3D rocket with 5 part labels | keep | the fun part |
| Test fire, Exploded view, Board fairing | one "Try it" menu | three view toys |
| "Your rocket" panel | hide behind details | facts about a choice that changes nothing |
| Instruction paragraph | delete | the bins say it |
| 6 bins, 24 options with heights | keep bins, hide heights | heights are noise |

### 6. Step 05: Orbit — score **94.7** · 23 numbers · 17 buttons · 9 panels · 188 words

- **Decision**: how high over the pole (the orbit is now a height you drag).
- **3 numbers**: height (15 km), ice mapped in 12 months, Δv to brake into it.
- **Main action**: **Choose ride →**.

| Element | Verdict | Reason |
|---|---|---|
| 3D Moon with the orbit + height slider (10 km – 5,000 km) | keep | the decision. PR 74 replaced the card tray with this drag; the old "picked two ways" (SL) is gone |
| Height readout + far-side line | keep the height |  |
| Six-cell stats grid (once round, pole passes, longest shadow, brake, hold, far side) | keep brake, hide 5 | 6 numbers; the drawer |
| Ice mapped bar | keep | consequence; checklist: orbit affects coverage |
| Fuel / power / science chips + conflict sentence | keep the red one only | non-green reasons only |
| Mission success 0 % | hide behind details | belongs to Go/No-Go |
| ← Back | delete | the dock does it |

### 7. Step 00: Brief — score **91.1** · 17 numbers · 15 buttons · 12 panels · 244 words · 1.7 screens tall

- **Decision**: none to make: accept the mission and learn what counts as success.
- **3 numbers**: ice 70 %, data 300 MB, 12 months.
- **Main action**: **Commence mission planning →**.

| Element | Verdict | Reason |
|---|---|---|
| Directive (one sentence) | keep | checklist: define the objective first |
| "Your first stop: the Research Lab" | keep | the next move |
| Requirements 0.1.1–0.1.5 with explanations | keep 3 targets, hide the rest | checklist: clear objectives |
| "5 primary metrics" label | delete | counts the list |
| Earth–Moon strip | hide behind details | see chrome |

### 8. Step 06b: Ride, transfer stage — score **85.1** · 19 numbers · 17 buttons · 9 panels · 122 words

- **Decision**: how long the trip to the Moon takes (a days-of-flight slider, 4–120 days, since PR 74).
- **3 numbers**: days of flight, arrival month, fuel left (Δv).
- **Main action**: **Comms →** (already the one-word naming).

| Element | Verdict | Reason |
|---|---|---|
| Days slider + "120 days of flight" + one sentence | keep | the decision |
| Ion-engine warning line | keep | the constraint that shapes the choice |
| Six-cell grid (leaves, reaches, arrives at km/s, brake, fuel left, ride) | keep fuel left + arrival, hide 4 | the propellant breakdown (PT) is now this grid; "arrives at 0.00 km/s over escape speed" needs the drawer |
| Fuel / budget chips | keep only non-green | (SL) |
| Mission success 0 % | hide behind details | belongs to Go/No-Go |
| ← Launch | keep | goes back to the first Ride stage, which the dock cannot reach |

### 9. Step 01: Planning — score **79.6** · 17 numbers · 25 buttons · 6 panels · 104 words

- **Decision**: test months and reserve: two choices, one screen.
- **3 numbers**: $ free, months spare before the ride, flight risk ×.
- **Main action**: **Select instruments →**.

| Element | Verdict | Reason |
|---|---|---|
| Wall: Budget band + legend | keep "$3.7M free", hide legend | (PT) |
| Wall: Road to launch / schedule wall | hide behind details | (PT) keep only "2 months spare" |
| Wall: Flight risk gauge | keep | (PT) |
| Wall line "COMMS CENTER · … · MISSION PLANNING" under the title card | fix collision | text runs under the "01 MISSION PLANNING" card (PT, visible in the screenshot) |
| Centre title sheet | delete | the dock says where you are (SL) |
| Test blocks 0–3 mo, reserve coins 0–20 % | keep | the two choices |
| "10 %★" starred reserve | balance call for Jakob | a starred right answer removes the decision (SL) |
| Chance of full success line | delete here | each option already shows its effect; belongs to Go/No-Go (SL) |
| Desk labels incl. a 7-step strip | delete the strip | another step list |
| ← Back | delete |  |

### 10. Flight: build months on the base — score **67.6** · 21 numbers · 9 buttons · 4 panels · 183 words · 7 scene items

- **Decision**: when to move time forward.
- **3 numbers**: mission month, ice mapped, data home.
- **Main action**: **Advance one month**; "Fly until something happens" as its menu twin; drop 1×/2× (SL).

| Element | Verdict | Reason |
|---|---|---|
| Two clocks: agency Day (runs 1/s) and Mission month (moves on advance) | one clock after launch | they drift apart, e.g. "Day 249 / Month 4" (PT); or label the first "Agency day" |
| Flight-plan sheet (8 readouts) | keep ice, data, health | phase repeats the timeline label, the month shows twice (SL) |
| "Point at a month for its log entry" | delete | permanent help row (SL) |
| Mission card repeating the red caution + empty "Mission log: Nothing yet" | hide the log until it has entries | (PT) |
| Notifications | collapsed (already on main) | the timing-traps session collapsed it; funds/popularity changes need a one-line reason (PT) |
| "Fly until something happens" stops with no message | say why it stopped | (PT) |
| Start over, engineer view, mute, settings | menu |  |

### 11. Base map (mission chosen) — score **66.3** · 20 numbers · 10 buttons · 4 panels · 171 words · 6 scene items

- **Decision**: which building to walk into next.
- **3 numbers**: day, funds, popularity.
- **Main action**: **Continue** (opens the suggested building).

| Element | Verdict | Reason |
|---|---|---|
| Notifications column (10 items, open again once a mission is chosen) | collapsed, as on a fresh base | the 10-item panel is back here (screenshot); collapse it the same way |
| Mission panel: phase strip, "Next: Brief at the Communications Center", budget / gov pays / you pay | keep next + you pay | 3 money numbers for one fact |
| Continue + New mission | keep Continue, menu New mission | one main action |
| "Next: Brief" tag on the Comms Center + yellow ring | keep | the start cue; the green Research Lab ring competes (J) |

### 12. Step 02: Instruments — score **64.5** · 6 numbers · 24 buttons · 8 panels · 178 words · 2 scene items · 1.5 screens tall

- **Decision**: which instrument can see into the dark craters.
- **3 numbers**: ice coverage forecast, the picked instrument's mass and power.
- **Main action**: **Choose the rocket →**.

| Element | Verdict | Reason |
|---|---|---|
| Ice coverage forecast dial | keep | the consequence |
| 4 instrument cards + "Sees into shadow / Sunlit only" tags | keep | the decision. PR 69 removed what-if, altitude and Look through |
| Tab strip "IR spectrometer · Laser · Camera · Neutron" under the cards | delete | a second picker for the same choice (seen in the screenshot) |
| Detail card 2.2 (paragraph + tag) | hide behind details | the explanation |
| "Blind in crater shadows" conflict | keep as one line | reason |
| Payload bay panel (behind the Capcom tip) | delete | repeats the cards and is covered |
| Scene labels "Over sunlit ground" + "IR spectrometer · reading sunlit ground" | keep one | same fact twice |
| ← Back | delete |  |

### 13. Flight with an event card — score **49.1** · 13 numbers · 11 buttons · 3 panels · 123 words

- **Decision**: how to answer the event.
- **3 numbers**: odds per option, main money, reserve.
- **Main action**: the standing-order option, pre-selected.

| Element | Verdict | Reason |
|---|---|---|
| Title + one-sentence situation | keep | checklist: random events |
| Event picture (AI art) | delete | (SL) the 3 AI event images |
| Critical/Major tag | delete | (SL) |
| "Real mission" line | hide behind details |  |
| Options with odds bars, decision clock, standing order | keep | the game |

### 14. Step 06: Ride — score **48.4** · 9 numbers · 19 buttons · 3 panels · 94 words

- **Decision**: which launch (when it leaves, when it arrives).
- **3 numbers**: leaves, arrives, kg max (per card).
- **Main action**: **Plan the transfer →**.

| Element | Verdict | Reason |
|---|---|---|
| 3 launch cards (picture, leaves/arrives, 14 kg max, On time) | keep | the decision; checklist: launch vehicles have capacity. PR 74 split Ride in two stages: this one is already near budget |
| 3D pad + drop-off arc | keep |  |
| ← Back | delete |  |

### 15. Flight HUD (space view) — score **40.3** · 8 numbers · 17 buttons · 2 panels · 52 words

- **Decision**: when to move time forward.
- **3 numbers**: progress %, days to go.
- **Main action**: **Advance one month**.

| Element | Verdict | Reason |
|---|---|---|
| Cam 1/2/3 | auto-direct by phase, or one toggle | design call (SL) |
| Transfer caption with days to go | keep | (SL) |
| Space-bar caption repeating ice % | delete | (SL) |
| Advance / Fly until / 1× / 2× | one action + menu |  |

### 16. Agency panel: Popularity — score **36** · 9 numbers · 11 buttons · 2 panels · 41 words · 6 scene items

- **Decision**: none (information).
- **3 numbers**: popularity, trend.
- **Main action**: Close.

| Element | Verdict | Reason |
|---|---|---|
| Popularity pop-over | keep | details view of its number |

### 17. Agency panel: Funds — score **32.5** · 7 numbers · 11 buttons · 2 panels · 58 words · 6 scene items

- **Decision**: none (information).
- **3 numbers**: funds, income, committed.
- **Main action**: Close.

| Element | Verdict | Reason |
|---|---|---|
| Funds pop-over | keep | it is already the details view of the funds number; checklist: budget |

### 18. Mission result pop-up — score **30** · 5 numbers · 3 buttons · 5 panels · 81 words

- **Decision**: read the report.
- **3 numbers**: ice, data, score.
- **Main action**: **See the report**.

| Element | Verdict | Reason |
|---|---|---|
| Result pop-up | keep | near budget; New mission into a menu |

### 19. Agency panel: Sound & graphics settings — score **29.7** · 4 numbers · 15 buttons · 2 panels · 26 words · 6 scene items

- **Decision**: settings.
- **3 numbers**: none needed.
- **Main action**: Close.

| Element | Verdict | Reason |
|---|---|---|
| Volume sliders with values | keep, drop values |  |
| Mute and engineer view beside it | move in here | one settings menu |

### 20. Agency panel: Headquarters (campaign) — score **22.4** · 4 numbers · 1 buttons · 4 panels · 54 words

- **Decision**: none (progress).
- **3 numbers**: missions done, best score.
- **Main action**: Close.

| Element | Verdict | Reason |
|---|---|---|
| Campaign pop-up | keep | within budget |

### 21. Base map (no mission) — score **21.6** · 4 numbers · 10 buttons · 1 panels · 24 words · 6 scene items

- **Decision**: **start a mission** (its own screen: the no-mission state, J).
- **3 numbers**: day, funds, popularity.
- **Main action**: **New mission**.

Jakob on a fresh base "doesn't know where to start": two rings, New mission and a 10-item notifications panel competed. Main now has a single "Start here: pick your first mission" cue and collapsed notifications (timing-traps session; not duplicated here), which took this screen from 59.8 to its current score. What is left:

| Element | Verdict | Reason |
|---|---|---|
| "Start here" cue + New mission | keep | the one decision |
| Building rings (green Research Lab, yellow Comms Center) | done on main | no rings on a fresh base in this baseline; they competed with New mission (J) |
| Clock pause/play/fast | menu | time does not matter yet |
| Start over | menu | destructive, rare |

### 22. Agency panel: New mission — score **14.3** · 4 numbers · 2 buttons · 1 panels · 52 words

- **Decision**: take the mission.
- **3 numbers**: budget, deadline.
- **Main action**: **Start**.

| Element | Verdict | Reason |
|---|---|---|
| New-mission pop-up | keep | within budget |

### 23. Title (opening curtain) — score **4.6** · 1 numbers · 1 buttons · 0 panels · 64 words

- **Decision**: begin.
- **3 numbers**: none.
- **Main action**: **Begin**.

| Element | Verdict | Reason |
|---|---|---|
| Opening curtain | keep | within budget |

### 24. Launch (ride inside the fairing) — score **3.3** · 1 numbers · 1 buttons · 0 panels · 11 words

- **Decision**: none (watch or skip).
- **3 numbers**: none.
- **Main action**: Skip.

| Element | Verdict | Reason |
|---|---|---|
| Letterbox, caption, Skip | keep | measured mid-shot |

## Checklist conflicts

Checked against [docs/hackathon/checklist.md](../hackathon/checklist.md). Nothing marked delete above is
checklist information; these may only be hidden:

1. **Resource line incomplete (gap).** The step pill shows mass, power, Δv, budget; the six are mass, power,
   **budget, data, comms, time**. The base shows only funds and popularity.
2. **Part and instrument stats** (mass, power, cost, data, value): "instruments could have different
   characteristics". Hover, never drop.
3. **Passed Go/No-Go checks** and the ride's "14 kg max": "check that spacecraft mass and orbit are compatible
   with the launch vehicle". Drawer *Checks*, never drop.
4. **Report traces**: "understand why a mission succeeds or fails". First item visible, rest one click away.
5. **Run history**: "simulate it multiple times". Hidden, kept. **Share code** is under *Additional features*
   (optional): hiding is safe; deleting it is Jakob's call.
6. **Rocket** changes no mission number, so the launch-vehicle trade lives in Ride only (options above).

## What other sessions' work will move

- Header / dock / step header text: all nine steps share the chrome, so the HUD popover and one menu drop ~5
  buttons from every step at once.
- Base clock, decision card, BaseMap (timing-traps): base screens and the flight event card. Its start cue and
  collapsed notifications are already in this baseline.
- `src/sim/**`, agency panels, comms console (numbers session): Comms and Go/No-Go text; funds and popularity.
- Report grade cap for failed missions: Report.
- Re-run `pnpm audit:clutter` on each PR and compare its clutter-baseline.md table with this one.

## Redesign first

1. **Report** (188.3): mostly reference material that belongs in the drawer; 2.9 screens tall.
2. **Step 08: Go/No-Go** (171.3): 24 panels for a yes/no decision; the same verdict shown four ways.
3. **Step 04: Spacecraft** (135.3): most numbers of any step; the power/propulsion trade drowns in part stats.

Next after these: Step 07: Comms (121.5), Step 03: Rocket (105.3).
