# Screen budget

What every screen of the step game may show, measured against main and turned into a keep / hide / delete
list per screen. Numbers come from `pnpm audit:clutter` (see [clutter-baseline.md](clutter-baseline.md) and
`scripts/e2e/clutter-audit.mjs`). Baseline: main 3a78f09 (PR 121's run, 22 screens), 2026-11-15, 1440×900,
engineer view off. Each heading shows the score in the first baseline (main 1273c49) where it changed.

Input from other sessions is marked **(PT)** Ideas playtester, **(SL)** simplification loop, **(J)** Jakob.

## The budget (agreed with Jakob, 15 Nov 2026)

1. **One decision per screen**: the choice the step exists for.
2. **At most 3 numbers visible by default**; everything else behind one shared **Details** control.
3. **One main action button**; secondary actions go into a menu or disappear.
4. **Explanations show when needed** (on hover or on pick), not as standing paragraphs.
5. **Exception**: one compact line with the six resources (mass, power, budget, data, comms, time), because
   [docs/hackathon/checklist.md](../hackathon/checklist.md) asks the game to "clearly display the main
   resources". It does not count against the 3 numbers.

Score: **numbers×2 + buttons + panels×3 + words/40** (definitions in clutter-baseline.md). A step screen that
meets the budget scores about **35**.

## The shared Details control

Main now has it (`> DETAILS` on Plan, Orbit, Launch and the report). The rule for every remaining screen:

- One **Details** control per screen, directly under the screen's decision, never in a corner.
- Inside, in this order: why this matters · every number the screen dropped · the checks this step's building
  fixes · real missions · what engineer view adds.
- Choice cards carry one number; the rest shows on hover or pick.
- Closed by default; it opens by itself only the first time a check turns red.

## Shared step chrome

| Element | Verdict | Reason |
|---|---|---|
| Dock "1 Plan · 2 Science · 3 Craft · 4 Orbit · 5 Ride · 6 Comms · 7 Launch" | keep | the decided naming (`src/ui/kit/stepNumbers.ts`), now on main |
| Resource pill `M · P · Δv · $$` | **keep, change** | becomes the six-resource line; today 4 of 6, Δv instead of data, comms, time: **checklist gap** |
| `1 RISK` chip | keep | one chip; links to the Details checks |
| `← Agency base`, engineer view, mute, settings | one ☰ menu | not decisions |
| Capcom tip | on pick / on red | main now folds it to the avatar on several steps ("Don't show tips") |
| Next button "Next: X →" | keep | the one main action, already the decided naming |

Done on main since the first baseline: the HUD button and modal, the Sequence rail, the Dashboard and the
← Back buttons are gone; Rocket is folded into Craft; Go/No-Go and the report are redesigned.

**Cross-cutting (SL)**: `SynergyStrip` and `DesignDeltaLine` put two commentary strips under several
decisions. Keep one, shown only on a conflict or warning.

## Per screen, worst first

Flight screens fly fixed seeds, so they repeat run to run like the rest. "Checklist" marks information the
hackathon checklist requires: hide it, never delete it.

### 1. Step 6: Comms — score **122** (was 121.5) · 32 numbers · 20 buttons · 11 panels · 198 words

- **Decision**: which radio and which dish on Earth get the data home.
- **3 numbers**: MB a month that gets home (713), share of the data made that gets home (100 %), dish hours a day.
- **Main action**: **Next: Launch →**.

| Element | Verdict | Reason |
|---|---|---|
| Top link diagram (radio, 64 kbps, "1 h a day on the dish", dish) | keep | the picture of the decision |
| Right panel: 713 MB/month + "all 400 MB gets home" + 100 % bar | keep | the answer; one number |
| Six-cell grid (link, instruments make, dish cost, stored on board, radio power, radio) | hide behind Details | 9 numbers; the drawer |
| Dish time booked slider (0.25–2 h) | keep | the third choice; is it a real decision? flag if the sim never punishes the maximum |
| Comms / data link chips + mission success 0 % | keep non-green only; success to Launch |  |
| Radio cards (3) with MB/month and a warning line | keep | the decision; the red "Does not reach Earth from the Moon" is the lesson, keep it |
| Dish cards (3) with photos, MB/month, outages | keep | the second decision; the large AI photos are the bulk of the screen, smaller art would help |
| "Each card: data it would bring home" + dish summary line | hide behind Details | standing text |

### 2. Step 3: Craft — score **97.6** (was 135.3) · 23 numbers · 25 buttons · 8 panels · 104 words · 10 scene items

- **Decision**: which parts make the craft fit and fly (power and propulsion are the trade).
- **3 numbers**: mass vs limit, power vs need, Δv to the Moon.
- **Main action**: **Next: Orbit →**.

The rocket now stands beside the craft as a scale model ("Your ride · the craft goes in the top"): Rocket is folded into Craft (PR 72).

| Element | Verdict | Reason |
|---|---|---|
| 3D cleanroom + scale-model rocket | keep | the place |
| "Does it fly?" (6 margin bars, all "ok") | show only red/yellow bars | collapse the rest to "all OK"; full set behind Details |
| Power split bar + legend, "Ion power ready (72 W)" chip | hide behind Details | power is a kept number |
| Instruction paragraph "Pick a card from each bin…" | delete | the bins say it |
| 5 part bins, 15 cards with one number each | keep | the decision; already one number per card. Checklist: components have mass, power, cost (on hover) |
| Part markers in the scene | keep | they jump to a bin |

### 3. Step 4: Orbit — score **80.3** (was 94.7) · 20 numbers · 18 buttons · 6 panels · 173 words

- **Decision**: how high over the pole.
- **3 numbers**: height (15 km), ice mapped in 12 months, Δv to brake into it.
- **Main action**: **Next: Ride →**.

Main already moved the grid behind a Details control (two cells left: brake, hold).

| Element | Verdict | Reason |
|---|---|---|
| 3D Moon + height slider with real-mission marks (Lunar Prospector, LunaH-Map) | keep | the decision |
| Height + far-side line + warning line | keep height and warning |  |
| Ice mapped bar | keep | consequence; checklist: orbit affects coverage |
| Brake / hold cells | keep brake | hold behind Details |
| Fuel / power / science chips + conflict sentence | keep the non-green one |  |
| Mission success 0 % | hide behind Details | belongs to Launch |

### 4. Step 5b: Ride, transfer stage — score **79.1** (was 85.1) · 18 numbers · 19 buttons · 7 panels · 125 words

- **Decision**: how long the trip to the Moon takes (days-of-flight slider).
- **3 numbers**: days of flight, arrival month, fuel left.
- **Main action**: **Next: Comms →**.

| Element | Verdict | Reason |
|---|---|---|
| Days slider + "120 days of flight" + one sentence | keep | the decision |
| Ion-engine warning line | keep | the constraint |
| Six-cell grid (leaves, reaches, arrives at km/s, brake, fuel left, ride) | keep fuel left + arrival, hide 4 | as Orbit did: behind Details |
| Fuel / budget chips, mission success 0 % | non-green only; success to Launch |  |

### 5. Step 0: Brief — score **71.7** (was 91.1) · 17 numbers · 14 buttons · 6 panels · 226 words · 1.4 screens tall

- **Decision**: none: accept the mission and learn what counts as success.
- **3 numbers**: ice 70 %, data 300 MB, 12 months.
- **Main action**: **Next: Plan →**.

| Element | Verdict | Reason |
|---|---|---|
| Directive (one sentence) + "Your first stop: Plan" | keep | checklist: define the objective first |
| Requirements (5, each with a target and a sentence) | keep 3 targets, sentences behind Details | checklist: clear objectives |
| Limits and schedule lines | hide behind Details | 6 numbers repeated in Plan and the resource pill |
| Earth–Moon strip at the top (build, test, ride month, transfer) | hide behind Details | repeats Plan and Ride |
| "Comms Center" kicker, "0.1 Requirements" numbering | delete | the dock says where you are |

### 6. Step 2: Science — score **58** (was 64.5) · 6 numbers · 21 buttons · 7 panels · 158 words · 2 scene items · 1.5 screens tall

- **Decision**: which instruments (up to two) can see into the dark craters.
- **3 numbers**: ice coverage forecast, slots used (1 of 2), the picked instrument's mass and power on hover.
- **Main action**: **Next: Craft →**.

| Element | Verdict | Reason |
|---|---|---|
| Ice coverage forecast dial | keep | the consequence |
| 4 instrument cards + "Sees into shadow / Sunlit only" tags | keep | the decision |
| Payload bay "Pick up to two" with 2 slots | keep | the rule of the choice |
| Tab strip "IR spectrometer · Laser · Camera · Neutron" under the cards | delete | a second picker for the same choice |
| Detail card 2.2 (paragraph + tag) | hide behind Details | the explanation |
| "Blind in crater shadows" conflict card | keep as one line | reason |
| Scene labels "Over sunlit ground" + "IR spectrometer · reading sunlit ground" | keep one | same fact twice |
| "Research Lab · Lunar Ice Mapper · Instruments" strip | delete | the dock says where you are |

### 7. Step 7: Launch — score **46.6** (was 171.3) · 5 numbers · 16 buttons · 6 panels · 103 words

- **Decision**: launch now, or go back and fix.
- **3 numbers**: chance of full success (and the one blocker it names).
- **Main action**: **Turn the key / Launch now** (one control and its keyboard twin).

Redesigned by PR 83: four poll slips, a "Needs attention" line with its Fix link, "Details: every check in full", and the flight director's call. Near budget.

| Element | Verdict | Reason |
|---|---|---|
| Four poll slips | keep | the ritual |
| "Needs attention" line + Fix link | keep | the fix |
| Details: every check in full | keep | the shared control; checklist: launch-vehicle and resource checks stay reachable |
| Chance of full success + bar | keep | the risk being decided on |
| Turn the key + Launch now | keep | Launch now is the keyboard-accessible twin |

### 8. Flight with an event card — score **43.6** (was 49.1) · 11 numbers · 10 buttons · 3 panels · 102 words

- **Decision**: how to answer the event.
- **3 numbers**: odds per option, main money, reserve.
- **Main action**: the standing-order option, pre-selected.

| Element | Verdict | Reason |
|---|---|---|
| Title + one-sentence situation, options with odds, decision clock | keep | checklist: random events |
| Event picture (AI art), Critical/Major tag | delete | (SL) |
| "Real mission" line | hide behind Details |  |

### 9. Step 5: Ride — score **38.2** (was 48.4) · 7 numbers · 16 buttons · 2 panels · 88 words

- **Decision**: which launch (when it leaves, when it arrives).
- **3 numbers**: leaves, arrives, kg max (per card).
- **Main action**: **Plan the transfer →**.

| Element | Verdict | Reason |
|---|---|---|
| 3 launch cards, 3D pad, drop-off arc | keep | within reach of the budget |

### 10. Step 1: Plan — score **37.9** (was 79.6) · 6 numbers · 15 buttons · 3 panels · 77 words

- **Decision**: test months and reserve.
- **3 numbers**: $ free, months spare before the ride, flight risk ×.
- **Main action**: **Next: Science →**.

Already close to budget after the Plan clean-up: the wall shows three headlines and the desk holds the two dials; a Details control is there.

| Element | Verdict | Reason |
|---|---|---|
| Wall: budget band, road to launch, flight risk gauge | keep | one headline each |
| Desk dials (test time, build time, budget reserve) with their readouts | keep test and reserve | build time is set at the Factory; show it, do not offer it as a dial |
| "10 % recommended (CubeSat 101)" mark on the reserve | balance call for Jakob | a starred right answer removes the decision |
| Desk step strip "1 Plan … 7 Go/No-Go" | delete | another step list, with the old names |
| "Comms Center" wall label | keep |  |

### 11. Flight HUD (space view) — score **37.1** (was 40.3) · 7 numbers · 16 buttons · 2 panels · 44 words

- **Decision**: when to move time forward.
- **3 numbers**: progress %, days to go.
- **Main action**: **Advance one month**.

| Element | Verdict | Reason |
|---|---|---|
| Cam 1/2/3 | auto-direct by phase, or one toggle | design call (SL) |
| Transfer caption with days to go | keep |  |
| Advance / Fly until / 1× / 2× | one action + menu |  |

### 12. Report — score **33.7** (was 188.3) · 2 numbers · 9 buttons · 6 panels · 107 words

- **Decision**: what to change before flying again.
- **3 numbers**: rating /1000 + grade, ice mapped, science data.
- **Main action**: **Relaunch with changes**.

Redesigned since the first baseline (188.3 → 33.7): medals are one line, four bars, one "what cost you points" box, four end actions and a Details control. Must stay compatible with the grade cap for failed missions.

| Element | Verdict | Reason |
|---|---|---|
| Stamp + one sentence, rating + grade | keep | checklist: scoring |
| Mission patch | keep | swap the AI art for an SVG patch (SL) |
| Medals line | keep |  |
| Four score bars | keep 2, hide 2 | ice and data are the brief |
| What cost you points | keep | checklist: why it succeeded or failed |
| Relaunch / Watch replay / New mission / Details | Relaunch + one menu | at most 2 end actions (SL) |

### 13. Agency panel: Popularity — score **32.7** (was 36) · 8 numbers · 10 buttons · 2 panels · 27 words · 5 scene items

- **Decision**: none (information).
- **3 numbers**: popularity, trend.
- **Main action**: Close.

| Element | Verdict | Reason |
|---|---|---|
| Popularity pop-over | keep | the details view of its number |

### 14. Mission result pop-up — score **31.8** (was 30) · 6 numbers · 3 buttons · 5 panels · 73 words

- **Decision**: read the report.
- **3 numbers**: ice mapped, data home, science months.
- **Main action**: **See the report**.

| Element | Verdict | Reason |
|---|---|---|
| Stamp, three numbers | keep |  |
| Money and popularity cards, papers published | hide behind Details | agency flavour |
| See the report / New mission / × | See the report + × | New mission into a menu |

### 15. Base map (mission chosen) — score **29.2** (was 66.3) · 6 numbers · 10 buttons · 2 panels · 46 words · 5 scene items

- **Decision**: which building to walk into next.
- **3 numbers**: day, funds, popularity.
- **Main action**: **Continue**.

| Element | Verdict | Reason |
|---|---|---|
| Mission panel: budget / gov pays / you pay | keep you pay | 3 money numbers for one fact |

### 16. Agency panel: Funds — score **29.1** (was 32.5) · 6 numbers · 10 buttons · 2 panels · 44 words · 5 scene items

- **Decision**: none (information).
- **3 numbers**: funds, income, committed.
- **Main action**: Close.

| Element | Verdict | Reason |
|---|---|---|
| Funds pop-over | keep | the details view of the funds number; checklist: budget |

### 17. Agency panel: Sound & graphics settings — score **27.5** (was 29.7) · 3 numbers · 15 buttons · 2 panels · 20 words · 5 scene items

- **Decision**: settings.
- **3 numbers**: none needed.
- **Main action**: Close.

| Element | Verdict | Reason |
|---|---|---|
| Volume sliders with values | keep, drop values |  |
| Mute and engineer view beside it | move in here | one settings menu |

### 18. Flight: build months on the base — score **26.1** (was 67.6) · 5 numbers · 9 buttons · 2 panels · 45 words · 6 scene items

- **Decision**: when to move time forward.
- **3 numbers**: mission month, ice mapped, data home.
- **Main action**: **Advance one month**.

**Undercounted.** The audit files the flight-plan sheet and the Advance bar, which sit over the 3D map, as scene labels (not scored). A fix is ready (scene labels must be placed by script); see the end of this doc.

| Element | Verdict | Reason |
|---|---|---|
| Agency day clock + mission month on the flight plan | one clock after launch | the two drift apart (PT) |
| Flight-plan sheet (phase, ice, data, health, "Point at a month…") | keep ice, data, health; drop the help row | (SL) |
| Mission card with empty "Mission log: Nothing yet" | hide the log until it has entries | (PT) |
| Advance one month / Fly until something happens / 1× / 2× | one action + menu |  |

### 19. Base map (no mission) — score **18.3** (was 21.6) · 3 numbers · 9 buttons · 1 panels · 10 words · 5 scene items

- **Decision**: **start a mission** (the no-mission state, J).
- **3 numbers**: day, funds, popularity.
- **Main action**: **New mission**.

Done on main: start cue, folded notifications (real events only, PR 75), no rings on a fresh base. Within budget.

| Element | Verdict | Reason |
|---|---|---|
| Clock controls | menu | time does not matter before a mission |

### 20. Agency panel: Headquarters (campaign) — score **11.6** (was 22.4) · 0 numbers · 7 buttons · 1 panels · 64 words

- **Decision**: which campaign mission to plan (only the first is open).
- **3 numbers**: none.
- **Main action**: **Plan the Lunar Ice Mapper →**.

HQ and "New mission" both open this full-screen ladder now; the new-mission dialog is gone.

| Element | Verdict | Reason |
|---|---|---|
| Ladder of 4 missions, one card with Plan + Details | keep | within budget |

### 21. Liftoff (ride inside the fairing) — score **7.1** (was 3.3) · 0 numbers · 1 buttons · 2 panels · 5 words

- **Decision**: none (watch or skip).
- **3 numbers**: none.
- **Main action**: Skip.

Measured as the fairing shot on main 3a78f09. **Main 7961bfa replaced it with a launch mini-game ("Fly the ride to orbit")**, which the audit does not reach yet.

| Element | Verdict | Reason |
|---|---|---|
| Letterbox, caption, Skip | keep | within budget |

### 22. Title (opening curtain) — score **4.6** · 1 numbers · 1 buttons · 0 panels · 64 words

- **Decision**: begin.
- **3 numbers**: none.
- **Main action**: **Begin**.

| Element | Verdict | Reason |
|---|---|---|
| Opening curtain | keep | within budget |

## Checklist conflicts

1. **Resource line incomplete (gap).** The step pill shows mass, power, Δv, budget; the six are mass, power,
   **budget, data, comms, time**.
2. **Part and instrument stats**: "instruments could have different characteristics". Hover, never drop.
3. **Every Go/No-Go check** and the ride's "14 kg max": "check that spacecraft mass and orbit are compatible
   with the launch vehicle". Behind Details, never drop.
4. **Report**: "why a mission succeeds or fails": keep "What cost you points".
5. **Run history and share code**: run history supports "simulate multiple times"; share code is an optional
   *Additional feature*.

## Audit gaps (fixed in the follow-up audit PR)

Both gaps noted here are fixed in the audit itself; its new baseline (main b1cf3ee, 24 screens) is in
clutter-baseline.md, and this doc's per-screen counts are still the 22-screen ones until the next re-baseline:

- HUDs laid over the 3D map (the flight-plan sheet, the Advance bar) now count as interface: a scene label
  must be placed by script. Flight build and Liftoff were undercounted before.
- Launch Day (the launch mini-game) is reached, measured at its briefing and in flight, and flown to the end,
  so the audit continues past liftoff. The Ride step's second view ("Trip") is reached through the dock's
  view state.

## Redesign first

1. **Step 6: Comms** (122): the most numbers left on any screen (32): a six-cell grid beside six large photo cards.
2. **Step 3: Craft** (97.6): 25 buttons and the full "Does it fly?" panel when everything is OK.
3. **Step 4: Orbit** (80.3): move the last cells and the success line behind Details, as Plan and Launch did.

Next: Step 5b: Ride, transfer stage (79.1): the same six-cell grid Orbit had before its clean-up; Step 0: Brief (71.7): requirements, limits and schedule all standing open.
