# Screen budget

What every screen of the step game may show, measured against main and turned into a keep / hide / delete
list per screen. Numbers come from `pnpm audit:clutter` (see [clutter-baseline.md](clutter-baseline.md) and
`scripts/e2e/clutter-audit.mjs`); baseline is main @ `89de90e`, 2026-11-15, 1440×900, engineer view off.

## The budget (agreed with Jakob, 15 Nov 2026)

Applies to every step and every base screen:

1. **One decision per screen**: the choice the step exists for.
2. **At most 3 numbers visible by default**; everything else behind one shared **Why? / details** control.
3. **One main action button**; secondary actions go into a menu or disappear.
4. **Explanations show when needed** (on hover or on pick), not as standing paragraphs.
5. **Exception**: one compact line with the six resources (mass, power, budget, data, comms, time),
   because [docs/hackathon/checklist.md](../hackathon/checklist.md) asks the game to "clearly display the
   main resources". It does not count against the 3 numbers.

Score used to rank screens: **numbers×2 + buttons + panels×3 + words/40** (definitions in clutter-baseline.md).
A step screen that meets the budget scores roughly (3 + 6 resource numbers)×2 + 10 buttons (main action,
Why?, menu, the step dock, its choices) + 2 panels×3 + 60/40 ≈ **35**; today the steps score 72–168.

## The shared "details" control (build this first)

Every screen hides things the same way, so a player learns it once.

- **What it is**: one button labelled **Why?** (keyboard `?`), always in the same place: directly under
  the screen's decision, left-aligned with it, never in a corner. On base screens with no step, it sits under
  the current-mission panel's single line.
- **What it opens**: a drawer that slides in from the right edge over the scene (not a modal: the decision
  stays visible and clickable), 400 px wide, one column, scrolls on its own. Closing: the same button,
  `Esc`, or a click on the scene.
- **What is inside**, always in this order, each section only if the screen has it:
  1. *Why this matters* — the one-paragraph explanation (moves here from standing paragraphs).
  2. *The numbers* — every figure the screen used to show, as a two-column table (label, value, unit).
  3. *Checks* — the Go/No-Go lines that this step's building fixes, with their margin.
  4. *Real missions* — the "like Lunar IceCube / Lunar Flashlight" references.
  5. *Engineer view* — the extra rows `Eng`/`eng-only` shows today (the engineer switch moves in here).
- **Pick-time explanations**: hovering or focusing a choice card shows a one-line tooltip (what changes if
  you pick it: "+0.5 kg, +5 W, sees into shadow"). Picking it updates the drawer if open. No card carries a
  standing paragraph.
- **One component**: `DetailsDrawer` (+ `useDetails(screenId)` to register content), so the audit can count
  it as one button and the playtests can check that nothing went missing (the drawer's content must hold
  every number the screen dropped).
- **Default closed.** It never opens by itself, except the first time a check turns red (then it opens on
  *Checks*, once).

## Shared chrome on every step screen

These sit on all nine step screens and account for about 15 of their buttons and 6 of their numbers before
the step shows anything. Decide them once:

| Element | Verdict | Reason |
|---|---|---|
| Step dock "1. Plan … 6. Launch" (6 tabs) | **keep** | progress and navigation; but its 6 names do not match the 9 steps (Science = Instruments, Launch = Ride/Comms/Go): rename to the 9 steps or to the 4 buildings |
| Resource pill `M: 12.0/14kg P: 30/120W Δv: … $$: …` | **keep, change** | becomes the six-resource line (the exception). Today it shows 4 of 6 and Δv instead of data, comms, time: **checklist gap** |
| `1 RISK` chip | hide behind details | duplicates the Go/No-Go checks; the drawer's *Checks* section says the same |
| `📊 HUD` button + Mission Vitality modal (`H`) | **delete** | a second, bigger copy of the resource pill; only Header and Shell use `MissionVitalityCluster`/`hudModalOpen`, nothing else depends on it |
| `☰ Sequence` rail (StepRail) | **delete** | a third step list next to the dock; only Shell renders `StepRail` |
| `← Agency base` | menu | secondary; goes in a ☰ menu with the next three |
| Engineer view switch, mute, sound & graphics settings | menu | settings, not decisions; engineer view moves into the details drawer |
| Brand "MOONSHOT · LUNAR ICE MAPPER" | keep | one line, no numbers |
| CAPCOM Rosa Vega tip (bottom left) | hide behind details | the explanation that today stands open on every step; show it on pick or when a check turns red, else just the avatar |
| Earth–Moon strip "Build 3 · Test 1 · Ride month 8 · Transfer 10 months" (Brief, Go/No-Go) | hide behind details | 4 numbers repeated from Planning and Ride; *time* moves into the resource line |
| Step header "0N TITLE / question" | keep | it *is* the decision, phrased as a question |

## Per screen, worst first

Counts are `score · numbers · buttons · panels · words` from the baseline. The flight screens depend on
the flight's random events (which card comes up, what the log says) and move by ±15 between runs; the
base and step screens repeat exactly. "Checklist" marks an element
whose information the hackathon checklist requires: it may only be hidden, never deleted.

### 1. Report — score **188.3** · 47 numbers · 12 buttons · 24 panels · 413 words

- **Decision**: what to change before flying again (or stop).
- **3 numbers**: rating (820 / 1000), ice mapped vs target, science data vs target.
- **Main action**: **Relaunch with changes** (opens the building that cost most points).

| Element | Verdict | Reason |
|---|---|---|
| Stamp MISSION SUCCESS / FAILED + one sentence | keep | the outcome, first thing seen |
| Mission rating 820/1000 + grade | keep (1 number) | the score; checklist: scoring |
| Mission patch | keep | no numbers, it is the reward |
| Medals (8 chips) | hide behind details | reward, not a decision; show earned count only ("6 of 8") |
| Five score bars (ice, data, months, sunlit map, money) | keep 2, hide 3 | ice and data are the brief; the rest go to the drawer. Checklist: feedback on why it succeeded |
| "What cost you points" list | keep, first item only | the one thing to fix; full list in drawer. Checklist: "why a mission succeeds or fails" |
| Artemis Lunar Ice Exploration Debrief (4 crater cards, coords, depth, temperature, 355M tons) | hide behind details | flavour; 16 numbers no decision uses |
| Mission requirements 1.1–1.5 (decision → outcome cards) | hide behind details | the full trace; checklist: how decisions shaped the outcome. Keep it reachable in one click |
| Historical flight reference (your CubeSat vs 3 NASA CubeSats) | hide behind details | educational, not a decision; checklist "realistic" flavour |
| Relaunch with changes | **main action** | the fix-it loop |
| Watch replay, New mission | menu | secondary |
| Share and compare designs (code, copy, paste, load) | hide behind details | team play/comparison: checklist "collaboration … compare"; never delete |
| Run history (one row per flight, each with Replay) | hide behind details | checklist "simulate multiple times"; show last two runs only in the drawer |
| Narrator caption "LOOP …" | keep | spoken line, transient |

### 2. Step 9: Go/No-Go — score **168.2** · 33 numbers · 20 buttons · 24 panels · 409 words

- **Decision**: launch now, or go back and fix.
- **3 numbers**: chance of full success, ice coverage forecast, data home forecast (vs 70 % and 300 MB).
- **Main action**: **Launch mission** (with the key turn as its confirm, not a second button).

| Element | Verdict | Reason |
|---|---|---|
| Verdict stamp "GO, BUT IT CANNOT MEET THE BRIEF" | keep | the answer to the decision |
| Sentence under the stamp (repeats the stamp) | delete | same words as the stamp; nothing else reads it |
| Yellow paragraph (instrument cannot see shadow, 0 %, 4800 MB …) | hide behind details | explanation; the first blocker becomes one line with its Fix link |
| Chance of full success + Full/Partial/Lost bar | keep (1 number) | the risk the player is deciding on |
| Four poll slips (Ground, Science, Spacecraft, Launch) | keep, as 4 lamps | the poll is the ritual; drop the per-slip text ("Nothing to check here") |
| Back to design | menu | secondary |
| Run the poll | **delete as a button** | the poll runs when the screen opens; nothing else calls it |
| Turn key + Arm key first + Launch mission | merge | one main action with a hold-to-arm, not three controls |
| Blind in crater shadows (conflict card) | keep as one line | the blocker, with its Fix link |
| Warnings (1) card with Fix at the Research Lab | keep the Fix link, hide text | the link is the useful part |
| Passed (8) cards: mass, volume, time, Δv, power, comms, data link, budget | hide behind details | eight panels of "go"; checklist: launch-vehicle / resource checks must stay reachable |
| Craft box + Earth–Moon strip at top | hide behind details | see chrome |

### 3. Step 4: Spacecraft — score **136.3** · 39 numbers · 28 buttons · 9 panels · 133 words · 10 scene items

- **Decision**: which parts make the craft fit and fly (power and propulsion are the real trade).
- **3 numbers**: mass vs limit, power vs need, Δv to the Moon.
- **Main action**: **Select orbit →**.

| Element | Verdict | Reason |
|---|---|---|
| 3D cleanroom with the craft | keep | the place; it shows the parts going in |
| Camera menu (close-up, whole craft, avionics, engine, payload, fold wings, close panels, sun lamp, exploded view) | menu | 9 view toggles; one "View" menu, default close-up |
| "Does it fly?" panel (6 margin bars: mass, volume, power, money, Δv to the Moon, build time) | keep 3, hide 3 | mass, power, Δv stay; volume, money, build time go to the drawer (money/time are on the resource line) |
| Power split bar + legend | hide behind details | power is already a kept number |
| "Ion power ready (72 W)" chip | hide behind details | follows from power |
| Instruction paragraph "Pick a card from each bin …" | delete | the bins say it; Rosa says it on first visit |
| Five part bins (panels, battery, computer, attitude, propulsion): 17 cards each with 2–4 numbers | keep cards, hide numbers | the decision; each card shows name + one number (its trade: W, Wh, kg); full stats on hover. Checklist: components have mass, power, cost |
| Part label buttons in the scene (7) | keep | they jump to a bin; they are the scene |

### Remaining screens

#### 4. Step 8: Comms — score **122.5** · 30 numbers · 26 buttons · 9 panels · 380 words

- **Decision**: which radio and which ground station get the data home.
- **3 numbers**: data the link carries a month vs data the instruments make; contact hours a day.
- **Main action**: **Go/No-Go review →**.

| Element | Verdict | Reason |
|---|---|---|
| Intro paragraph "Only data that reaches the ground counts …" | hide behind details | standing explanation |
| Data link diagram (radio, dotted link, dish, "1 h a day of contact") | keep | the picture of the decision |
| "Data gets home: YES" stamp | keep | the answer |
| Dish aim slider ("Aim dish") | hide behind details | a second control for the same booked hours |
| Three bars (instruments make / link carries / storage tray) | keep 2, hide storage | make vs carry is the trade; checklist: data and communications |
| Spacecraft radio cards (3, with reach/pointing/link/mass) | keep cards, hide stats | the decision; one number per card (kbps) |
| Booked station cards (3, hours/outages/rate) | keep cards, hide stats | the second half of the decision |
| Contact-time 24 h booking dial | keep | it sets hours; the only number left on it is hours |
| "Arrow keys to switch" hint | delete | keyboard hint; goes in the tooltip |
| ← Back | delete | the step dock does it |

#### 5. Step 7: Rocket — score **106.3** · 19 numbers · 37 buttons · 9 panels · 171 words · 8 scene items

- **Decision**: none that changes the mission — the screen says "nothing here changes the mission numbers".
- **3 numbers**: rocket height only.
- **Main action**: **Build the spacecraft →**.

**Proposal**: this step is a toy, not a decision. Either make it one (the ride's capacity check the checklist asks for: "spacecraft mass and orbit compatible with the launch vehicle") or fold it into Ride as an optional "look at your rocket" moment. Until then it should be the quietest screen, not the 5th loudest.

| Element | Verdict | Reason |
|---|---|---|
| 3D rocket on the pad with 5 part labels | keep | the fun part |
| Test fire, Exploded view, Board fairing | menu | three view toys; one "Try it" menu |
| "Your rocket" panel (height, stages, engines, boosters, 2 explanations) | hide behind details | facts about a choice that changes nothing |
| Instruction paragraph "Pick a part in each bin …" | delete | the bins say it |
| Six part bins, 24 options, each with a height in m | keep bins, hide heights | the playful build; heights are noise |

#### 6. Step 6: Ride & transfer — score **98.8** · 25 numbers · 22 buttons · 7 panels · 230 words

- **Decision**: which ride (when it leaves, where it drops you) and which transfer.
- **3 numbers**: ride leaves (month), arrival (month), Δv left after capture.
- **Main action**: **Setup communications →**.

| Element | Verdict | Reason |
|---|---|---|
| Departures board: 3 gate cards (leaves, arrives, kg max, on time) | keep cards, 2 numbers each | the decision; checklist: launch vehicles have capacity and cost |
| Transfer cards (low-energy / direct) with takes, left after | keep, 1 number each | second half of the decision |
| Transfer explanation paragraph under the cards | hide behind details | standing text |
| Ride explanation paragraph under the gates | hide behind details | standing text |
| "Go for launch · arrives month 18 · enough fuel" + 4 check chips | keep the line, hide chips | the verdict in one line |
| Boarding pass (drag to gate) + Δv tank | keep the pass, hide the tank | the drag is the interaction; the tank repeats propellant |
| Propellant column (spare / hold orbit / capture, 4 numbers) | hide behind details | Δv is one kept number |
| Timeline strip (ready, launch, transit, mapping) | keep | time is a checklist resource; it is the "time" line |
| 3D pad, Moon, orbit labels ("drop-off: path to the Moon") | keep | the scene |

#### 7. Step 3: Instruments — score **97.8** · 12 numbers · 32 buttons · 12 panels · 232 words · 2 scene items

- **Decision**: which instrument goes on board (can it see into the dark craters?).
- **3 numbers**: ice coverage forecast, the picked instrument's mass and power.
- **Main action**: **Choose the rocket →**.

| Element | Verdict | Reason |
|---|---|---|
| Ice coverage forecast dial + sentence | keep (1 number) | the consequence of the decision |
| Lab simulator what-if (3 orbits, 2 pointing modes) | hide behind details | it lets you try other buildings' choices here: a second decision |
| Altitude 15/100 km + Look through | keep Look through, hide altitude | the look-inside moment is the teaching; altitude belongs to Orbit |
| "IR spectrometer · reading sunlit ground" caption + "Over sunlit ground" tag | keep one | two labels say the same |
| Payload bay panel (behind the narrator) | delete | repeats the instrument cards and is covered by the Capcom tip |
| 4 instrument cards, each with mass, power, cost, data, science | keep cards, 1 line each | the decision; full stats on hover. Checklist: instruments have mass, power, cost, data and value |
| "Blind in crater shadows" warning | keep as one line | the reason for the decision |
| ← Back | delete | the step dock does it |

#### 8. Step 1: Brief — score **92.1** · 17 numbers · 16 buttons · 12 panels · 244 words

- **Decision**: none to make — accept the mission. It exists to say what counts as success.
- **3 numbers**: ice coverage target 70 %, data target 300 MB, 12 months in orbit.
- **Main action**: **Commence mission planning →**.

| Element | Verdict | Reason |
|---|---|---|
| Expedition directive (one sentence) | keep | the mission objective; checklist: define a mission objective first |
| "Your first stop: the Research Lab" box | keep | the next move, in one line |
| Requirements list 0.1.1–0.1.5 with targets and explanations | keep 3 targets, hide 2 + text | targets are the success criteria; checklist: clear objectives |
| "5 primary metrics" label | delete | counts the list under it |
| Earth–Moon strip at top | hide behind details | see chrome |

#### 9. Step 2: Planning — score **79.6** · 17 numbers · 25 buttons · 6 panels · 104 words

- **Decision**: how many months to test and how much money to hold back.
- **3 numbers**: months spare before the ride, money free / reserve, flight risk ×.
- **Main action**: **Select instruments →**.

| Element | Verdict | Reason |
|---|---|---|
| Big wall screen: Budget (bar + 5 lines), Road to launch (timeline), Flight risk gauge | keep the three headlines, hide the breakdowns | one number each; checklist: budget and time |
| Desk labels (test time, build time, budget reserve, the 7-step strip on the desk) | delete the step strip | a fourth step list |
| Schedule wall + sealed reserve box (1.2, 1.3) | keep | where the drag lands |
| Test blocks 0–3 mo, reserve coins 0–20 % | keep | the two choices |
| "Chance of full success: about 0 %" | hide behind details | it belongs to Go/No-Go; here it reads as a verdict on choices not made yet |
| Go · Time / Go · Budget lines | keep | the immediate result of the choice |
| "Caution: no reserve" banner | keep | the warning the reserve exists for |

#### 10. Agency panel: popularity — score **74.3** · 22 numbers · 11 buttons · 5 panels · 170 words · 6 scene items

- **Decision**: none (information).
- **3 numbers**: popularity %, its trend.
- **Main action**: Close.

| Element | Verdict | Reason |
|---|---|---|
| Popularity breakdown pop-over | hide behind details | reached from the popularity number; keep it as the details view of that number |

#### 11. Step 5: Orbit — score **71.5** · 16 numbers · 21 buttons · 5 panels · 141 words

- **Decision**: which orbit (how low over the pole, how much fuel to hold it).
- **3 numbers**: ice mapped forecast, periapsis height, Δv a month to hold it.
- **Main action**: **Choose ride →**.

| Element | Verdict | Reason |
|---|---|---|
| 3D Moon with three orbits + periapsis label | keep | the picture of the choice |
| Time-lapse pause + month scrubber | keep, smaller | shows coverage building up |
| "Pole pass, seen from the side" panel | hide behind details | second picture of height |
| Ice mapped 0 % / goal 70 % panel + Go/No-Go chips | keep the number, hide chips | consequence of the choice; checklist: orbit affects coverage |
| 3 orbit cards (ice mapped, height) | keep | the decision |
| "Blind in crater shadows" tag | keep | reason |

#### 12. Agency panel: funds — score **70.6** · 20 numbers · 11 buttons · 5 panels · 182 words · 6 scene items

- **Decision**: none (information).
- **3 numbers**: funds, income a day, committed budget.
- **Main action**: Close.

| Element | Verdict | Reason |
|---|---|---|
| Funds breakdown pop-over | hide behind details | it is already the details view of the funds number; checklist: budget |

#### 13. Flight on the base (build months) — score **67.6** · 21 numbers · 9 buttons · 4 panels · 183 words · 7 scene items

- **Decision**: when to move time forward.
- **3 numbers**: mission month, ice mapped, data home.
- **Main action**: **Advance one month** (Fly until something happens as its long-press or menu twin).

| Element | Verdict | Reason |
|---|---|---|
| Agency clock (day + pause/play/fast) and Mission month | keep month, menu the clock | two clocks on one bar; the flight follows the month |
| Funds, popularity | keep as the resource line | agency budget |
| Flight plan timeline (phases, months, "Point at a month…") | keep timeline, delete hint | shows where the mission is |
| Phase / ice / data / health readout | keep 2, hide 2 | ice and data are the brief |
| Notifications column (10 news items) | hide behind details | agency flavour; the latest alert surfaces on its own |
| Current mission panel (phase tabs, caution, ice, log, new mission) | keep caution, hide log | one warning, not a log |
| Advance one month / Fly until something happens / 1x / 2x | one main action + menu | four buttons for one move |
| Start over, engineer view, mute, settings | menu | settings |

#### 14. Agency panel: sound & graphics — score **66.7** · 17 numbers · 14 buttons · 5 panels · 148 words · 6 scene items

- **Decision**: settings.
- **3 numbers**: none needed (slider values can go).
- **Main action**: Close.

| Element | Verdict | Reason |
|---|---|---|
| Music / effects / voice sliders with values | keep, delete the values | the slider shows it |
| Graphics cinematic / fast | keep |  |
| Mute and engineer view next to it | move in here | one settings menu |

#### 15. Base map (mission chosen) — score **66.3** · 20 numbers · 10 buttons · 4 panels · 171 words · 6 scene items

- **Decision**: which building to walk into next.
- **3 numbers**: day, funds, popularity.
- **Main action**: **Continue** (opens the suggested building).

| Element | Verdict | Reason |
|---|---|---|
| Same as base map |  | plus the mission panel's 5-step strip: keep, it is progress |

#### 16. Base map (no mission yet) — score **59.8** · 17 numbers · 10 buttons · 4 panels · 153 words · 6 scene items

- **Decision**: start a mission.
- **3 numbers**: day, funds, popularity.
- **Main action**: **New mission**.

| Element | Verdict | Reason |
|---|---|---|
| Five building labels in the scene | keep | the map is the menu |
| Notifications column (10 news, each with a time) | hide behind details | 10+ numbers and 150 words before the first decision |
| Current mission panel + New mission | keep | the one action |
| Clock controls (pause/play/fast) | menu | time does not matter before a mission |
| Start over | menu | destructive, rare |
| Map hint "Click a building … drag … scroll" | keep until first click | then hide |

#### 17. Flight with an event card — score **46.8** · 12 numbers · 11 buttons · 3 panels · 113 words

- **Decision**: how to answer the event.
- **3 numbers**: full-success odds per option (one each), main money, reserve.
- **Main action**: the standing-order option (pre-selected), confirmed by click.

| Element | Verdict | Reason |
|---|---|---|
| Event title + one-sentence situation | keep | the decision |
| Picture | keep | mood; no numbers |
| "Real mission" line | hide behind details | reference |
| Options with odds bars | keep | the choice; checklist: random events |
| Decision clock + standing order | keep | the timer is the game |
| Main / reserve readout | keep | what the fix costs |

#### 18. Flight HUD (space view) — score **38.4** · 7 numbers · 17 buttons · 2 panels · 56 words

- **Decision**: when to move time forward.
- **3 numbers**: progress %, days to go.
- **Main action**: **Advance one month**.

| Element | Verdict | Reason |
|---|---|---|
| Cam 1/2/3 | menu | one view toggle |
| Progress line | keep |  |
| Advance / Fly until / 1x / 2x | one main action + menu | as on the base |
| Back to agency | keep | the way out |

#### 19. Mission result pop-up — score **30.1** · 5 numbers · 3 buttons · 5 panels · 83 words

- **Decision**: read the report or not.
- **3 numbers**: ice mapped, data home, score.
- **Main action**: **See the report**.

| Element | Verdict | Reason |
|---|---|---|
| Result pop-up | keep | already close to budget; New mission into menu |

#### 20. Agency panel: headquarters (campaign) — score **22.4** · 4 numbers · 1 buttons · 4 panels · 54 words

- **Decision**: none (progress).
- **3 numbers**: missions done, best score.
- **Main action**: Close.

| Element | Verdict | Reason |
|---|---|---|
| Campaign pop-up | keep | within budget |

#### 21. Agency panel: new mission — score **14.3** · 4 numbers · 2 buttons · 1 panels · 52 words

- **Decision**: take the Lunar Ice Mapper mission.
- **3 numbers**: budget, deadline.
- **Main action**: **Start**.

| Element | Verdict | Reason |
|---|---|---|
| New-mission pop-up | keep | within budget |

#### 22. Title (opening curtain) — score **4.6** · 1 numbers · 1 buttons · 0 panels · 64 words

- **Decision**: begin.
- **3 numbers**: none.
- **Main action**: **Begin**.

| Element | Verdict | Reason |
|---|---|---|
| Opening curtain | keep | within budget |

#### 23. Launch (fairing cinematic) — score **3.3** · 1 numbers · 1 buttons · 0 panels · 11 words

- **Decision**: none (watch, or skip).
- **3 numbers**: none.
- **Main action**: Skip.

| Element | Verdict | Reason |
|---|---|---|
| Letterbox, caption, Skip | keep | within budget; the counts are measured mid-shot |

## Checklist conflicts

Checked against [docs/hackathon/checklist.md](../hackathon/checklist.md). Nothing above is deleted that the
checklist needs; these items may only be hidden:

1. **Resource line is incomplete today (a gap, not a deletion).** The step screens' pill shows mass, power,
   Δv and budget; the checklist's six are mass, power, budget, **data, communications, time**. The new line
   swaps Δv for those three (Δv stays in the drawer and on the Ride/Orbit steps). The base screens show only
   funds and popularity.
2. **Part and instrument stats** (mass, power, cost, data, science value per card): checklist "instruments
   could have different characteristics". Hide on hover, never drop.
3. **Passed Go/No-Go checks** and the ride's "14 kg max": checklist "check that spacecraft mass and orbit
   are compatible with the launch vehicle". Hide in the drawer's *Checks*, never drop.
4. **Report traces** (requirements decision → outcome, what cost you points): checklist "understand why a
   mission succeeds or fails". First item stays visible, the rest one click away.
5. **Share code and run history**: checklist "simulate multiple times" and team comparison. Hidden, kept.
6. **Rocket step** changes no mission number, so the launch-vehicle trade the checklist asks for lives in
   Ride only. Not a clutter issue, but worth a decision: make Rocket matter or merge it into Ride.

## What other sessions' work will move

The baseline is main as of `89de90e`. Sessions working on main at the same time will change these counts:

- **Header, StepRail, StepDock, Shell, Dashboard, step header text** (interface clean-up session): every step
  screen shares the chrome above, so deleting HUD / Sequence or moving settings into a menu drops ~5 buttons
  from all nine steps at once.
- **Base clock, decision card, BaseMap** (timing and traps session): the base screens and the flight event card.
- **`src/sim/**`, agency panels, comms console** (numbers session): Comms and Go/No-Go text and numbers; the
  agency panels (funds, popularity).
- Re-run `pnpm audit:clutter` on each PR and compare its clutter-baseline.md table with this one.

## Redesign first

1. **Report** (188.3): highest score, 3+ screens tall, most of it is reference material that belongs in the drawer.
2. **Go/No-Go** (168.2): 24 panels for a yes/no decision; the moment of truth should be one stamp, one chance and one button.
3. **Spacecraft** (136.3): the most numbers and buttons of any step; the core trade-off drowns in part stats.

Next after these: Rocket and Comms (both above 120).
