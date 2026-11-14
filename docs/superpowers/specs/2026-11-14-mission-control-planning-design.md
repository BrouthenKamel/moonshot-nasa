# Mission control room for step 1 (Mission Planning): design

Status: approved by Jakob on 2026-11-14 ("Implement it") and implemented. Branch: `claude/mission-planning-game-interface-b31773`, on top of `main` (9c6d745), which holds the logic core (PR #5) and the agency base (PR #4).

Context from the Integration session (14 Nov): each design step now lives inside a building on the agency map. Mission Planning belongs to the **Comms Center** (Ground / mission control), so the room is that building's mission control; the big screen's header reads `COMMS CENTER · LUNAR ICE MAPPER · MISSION PLANNING`. Map wiring is the Integration session's work, not this one.

Reference, approved by Jakob on 2026-11-14 as the direction:

- Clickable mockup: `docs/superpowers/specs/assets/2026-11-14-mission-control-mockup.html` (plain three.js, throwaway; open it in a browser with an internet connection).
- Screenshots: `assets/2026-11-14-mission-control-nominal.jpg` and `assets/2026-11-14-mission-control-missed-ride.jpg`.

The mockup is the reference for look, layout and behaviour. Where this document and the mockup differ, this document wins. The mockup's cost numbers and its "Light / Medium / Heavy" buttons are stand-ins and are not part of the design.

## Intent and why

Moonshot is a game where a player designs a 6U CubeSat to map lunar ice and then flies it turn by turn (one turn = one month). Step 1, Mission Planning, is the first screen where the player decides anything. Today it is a text column with two range sliders (`src/ui/steps/PlanningScreen.tsx`).

Jakob wants this step to be the coolest screen he can imagine: every control changes something the player can see, and the screen makes the player want to continue. His direction, in his words: a mission control room "like you see in the movies" (the film he means is *Hidden Figures*), with rows of tables pointed at a big screen; the dials placed on one of the control tables "so that it looks like you're actually turning knobs"; the mission information on the screen in the middle; and "nicer visualizations for the timeline and the budget". He chose the dark "Night shift" look over a bright one.

It also matters for the hackathon: presentation is one of five judging criteria, and the pitch is on Sunday 15 November 2026 at 17:30.

## Goals

1. The Planning step shows a 3D mission control room: the player sits at the back console, rows of operator consoles step down in front, and a wall-sized screen fills the front wall. Dark look with glowing accents.
2. The player's two planning choices are physical controls on their console, operated by grabbing them with the pointer:
   - **Test time**: a rotary knob with four positions, 0 to 3.
   - **Budget reserve**: a fader with five positions, 0 to 20% in steps of 5.
3. **Build time** is shown on the console as a read-only needle meter, because the rules derive it from the parts (it is not a choice in this step).
4. The big screen shows three live visualisations, all computed from the game's own numbers: a **budget tank**, a **road to launch** timeline and a **flight risk** gauge.
5. The room itself reacts: calm blue when all is well, an amber tint for caution, and a red pulsing alarm when the plan fails (ride missed or budget blown).
6. A row of seven lamps on the console shows the seven design steps with the current one lit, so the player sees there is more console to come.
7. The step still works with the keyboard and when 3D is unavailable, and the existing test suite still passes.

## Non-goals

- No change to game rules, constants, scoring or the store's shape. The two controls write the same fields as today's sliders.
- No other design step is redesigned here. (The instrument step is being designed in a separate session.)
- No sound, no phone layout, no external 3D models, textures or fonts: everything is procedural, as the rest of `src/scene` is.
- No navigation from the step lamps; `StepRail` stays the way to move between steps.
- The earlier "clean-room hangar" concept is dropped.

## Anti-goals (a failure even if it works technically)

- The big screen shows a number that differs from the Resource Dashboard or the Go/No-Go check. There is one source of truth: `computeBudgets` and `goNoGo`.
- Controls that are fiddly: a player must be able to set any value with one click, and never land between positions.
- Text on the big screen too small to read on a laptop or a projector.
- The scene stutters on a normal laptop during the pitch.
- A player without working 3D, or using only the keyboard, cannot complete the step.

## Constraints

- Stack already in the repo: React 19, TypeScript, Tailwind 4, three 0.187, `@react-three/fiber` 9, `@react-three/drei` 10, Zustand. No new dependencies.
- Tests run in Vitest with `environment: 'node'`. `src/ui/screens.smoke.test.tsx` renders every design step with `renderToString` and expects more than 500 characters of HTML and no `NaN`. There is no DOM, canvas or WebGL in tests.
- The app shell (`src/ui/Shell.tsx`) puts a 192 px `StepRail` on the left and a 256 px `Dashboard` on the right of the main column, and `DesignScreen` renders a `DesignDiagramPanel` above every step.
- Rules this step shows (all from `src/sim/budgets.ts`, `src/sim/checks.ts`, `src/data/brief.ts`):
  - `design.planning.testTurns`: 0 to 3 (`turnConstants.minTestTurns`, `maxTestTurns`). Each test turn costs `modelConstants.testCost` (0.4 M) and one turn. `budgets.testFactor` is 2.0, 1.4, 1.0, 0.7 for 0 to 3 test turns and multiplies the odds of things going wrong in flight.
  - `design.planning.reservePercent`: 0 to 20 in steps of 5. `budgets.reserveAmount` = cap × percent; `budgets.spendable` = cap − reserve.
  - `budgets.buildTurns` = ceil(`buildEffort` / 10), from the parts.
  - `budgets.readyTurn` = design 1 + build + test + fitting 1; `budgets.rideTurn` comes from the chosen ride; `timeMarginTurns` = ride − ready.
  - Go/No-Go `Time` check: red when the margin is negative, yellow at zero. `Budget` check: yellow when `totalCost` exceeds `spendable`, red when it exceeds `budgetCap`.
- Deadline: usable for the pitch on Sunday 15 November 2026, 17:30.

## Approaches

Three ways of building it were considered. Jakob left the technical choice to Claude; approach A is Claude's call.

| | Approach | Trade-off |
|---|---|---|
| **A (chosen)** | Real 3D room in react-three-fiber. Room, console, knob and fader are meshes with pointer events. The big screen is a 2D canvas drawn by plain functions and used as a texture. Plain HTML range inputs stay in the page for keyboard, tests and fallback. | Matches the approved mockup exactly and uses the stack already installed. Most work; text on the big screen is a texture, so its size must be watched. |
| B | 3D room as a backdrop, with the big screen and the controls as normal HTML/SVG laid over it. | Sharper text and simpler accessibility, but the controls stop being objects on the desk, which is the core of the request, and the overlay only lines up with a frozen camera. |
| C | A drawn 2D room in SVG/CSS, no WebGL. | Cheapest and most robust, but loses depth, lighting and the room turning red: clearly less of the effect asked for. |

## The design

### Where it sits in the app

- On the Planning step the room fills the whole main column, edge to edge (no page padding, no scroll), from under the header to the bottom of the window.
- On the Planning step only, `DesignDiagramPanel` is not shown: the big screen replaces it. **(Claude's call.)**
- On the Planning step only, the right-hand `Dashboard` is hidden, so the room gets the width and the big-screen text stays readable; the numbers that matter in this step (budget, reserve, ready turn, ride turn) are on the big screen. `StepRail` stays. **(Claude's call; see "Calls Claude made".)**
- "← Back" (to the brief) and "Select Instruments →" stay as ordinary buttons, overlaid on the top corners of the room (the bottom corners would cover the console readouts).
- Supported window: 1280 × 720 and larger, landscape.

### The room

Follow the mockup's composition:

- Three floor tiers stepping down toward the front wall, with a thin blue light strip on each tier edge. The player's tier is the highest, at the back.
- Two rows of operator consoles (about 6 and 7 desks), each with two small glowing monitors showing abstract data, an operator silhouette seen from behind and a chair. They are scenery: not interactive, not animated beyond what is cheap.
- The front wall holds the big screen (aspect 24:7), with a dark bezel and a soft glow around it.
- Two round beacons high on the front wall, dark until the alarm.
- Camera: a fixed seat behind the player's console, looking slightly down so the big screen, the rows and the console are all in view. It follows the mouse a little (a small sideways shift) for depth, and stands still while a control is being dragged. No free orbit.
- The camera's field of view is fitted to the window so that the full width of the big screen and the three console instruments are always inside the frame.

### The player's console

A sloped panel in the foreground, tilted toward the player, lit by a warm desk light so the controls stand out from the dark room. Left to right:

**Test time knob** (left third)

- Four positions marked 0, 1, 2, 3 on an arc on the far side of the knob; a pointer mark on the knob; one small LED per position (current position bright, lower ones dim).
- Pointer: press on or near the knob, then drag around it, and it follows the pointer and snaps to the nearest position. A single click on or near a number sets that number. The scroll wheel over the knob steps it.
- The knob turns to its new position with a short ease.
- Readout under it: the test time and its cost, for example `2 MONTHS · $0.8M` (test turns × `modelConstants.testCost`).
- Writes `design.planning.testTurns` through `updateDesign`, exactly as today's slider does.

**Build time meter** (centre, read-only)

- A half-round needle meter with a scale of 1 to 6; the needle shows `budgets.buildTurns` (pinned at 6 if higher; the readout always shows the true number).
- Readout: `3 MO · SET BY YOUR PARTS`. It has no grab cursor and does not react to the pointer.

**Budget reserve fader** (right third)

- A horizontal slot with five marked positions, 0, 5, 10, 15, 20, a metal cap with a gold stripe, and one LED per position (gold up to the current value; all red at 0).
- Pointer: press on the cap or anywhere along the slot and it jumps there and follows the drag, snapping to positions. The scroll wheel steps it.
- Readout: `10% · $2.5M LOCKED` (`budgets.reserveAmount`).
- Writes `design.planning.reservePercent`.

**Step lamps** (along the far edge of the panel)

- Seven small lamps labelled `1 PLAN`, `2 INSTRUMENTS`, `3 SPACECRAFT`, `4 ORBIT`, `5 RIDE`, `6 COMMS`, `7 GO / NO-GO`. Lamp 1 is lit; the others are dark. Decoration only.

Section titles (`TEST TIME`, `BUILD TIME`, `BUDGET RESERVE`) and all labels are painted on the panel surface. The cursor shows a grab hand over the two controls.

### The big screen

One wide picture in three framed panels with a header strip. Values on it move smoothly to their new position when a control changes (about a fifth of a second), so the player sees the cause and the effect.

**Header strip.** Left: `LUNAR ICE MAPPER · MISSION PLANNING`. Right: the room status as a coloured chip (see "Room status").

**Left panel: BUDGET (the tank).** A tall tank whose full height is `budgets.budgetCap`.

- Costs fill it from the bottom as stacked coloured blocks, in this order: Parts (`partsCost`), Team until launch (`modelConstants.teamCostPrelaunch` × `rideTurn`), Ride (`rideCost`), Testing (`testCost` × `testTurns`), Flight (`operationsCost`). The blocks must add up to `budgets.totalCost` exactly; if the named blocks do not, the difference is shown as an "Other" block rather than hidden.
- The reserve hangs from the top as a gold hatched block of height `reserveAmount`. Its lower edge is a dashed gold line across the tank: the spendable limit (`budgets.spendable`).
- Labels beside the tank: `RESERVE $2.5M (locked)` above the line (or `NO RESERVE LOCKED`), `you can spend $22.5M` below it, the free amount in green in the gap (`$5.7M free`), and a legend listing each cost block with its amount.
- When costs rise above the dashed line, the overlap is drawn amber and the label reads how much of the reserve the plan already eats. When costs rise above the cap, the overflow is red and the label reads how much it is over.
- What the player learns by moving the controls: the fader pushes the dashed line down toward the costs; the knob adds a Testing block.

**Centre panel: ROAD TO LAUNCH (the timeline).** A horizontal track of month cells, numbered from 1, long enough to show the ride month and the ready month plus one (at least 10).

- Blocks in order: DESIGN (`modelConstants.designTurns`), BUILD (`budgets.buildTurns`), TEST (`testTurns`, absent at 0), FIT (`modelConstants.integrationTurns`). They end at `budgets.readyTurn`.
- A gold vertical marker at the end of month `budgets.rideTurn`, labelled `RIDE LEAVES · END OF MONTH 8`, with a rocket standing on it.
- If the craft is ready early, the gap up to the marker is a green hatched block labelled SPARE. If it is late, the part past the marker is overlaid red.
- A small satellite icon sits above the track at the ready point, labelled `READY` (no label when late: the red overlay and headline say it).
- A large headline under the panel title: `2 MONTHS SPARE` (green), `NO SPARE TIME` (amber) or `MISSED BY 1 MONTH` (red). When missed, a line under it says `Not ready when the ride leaves: launch is blocked.` (in the design phase a red Time check blocks launch; the six-turn wait only happens in flight).
- When the plan flips to "missed", the rocket lifts off the marker with a flame, climbs out of the panel and fades, leaving a faint outline; it plays once and resets when the plan is back in time.
- A legend line under the track names the block colours, including "Build (from your parts)" and "Test (your knob)".

**Right panel: FLIGHT RISK (the gauge).** A half-round gauge for `budgets.testFactor`.

- The scale runs from ×2.0 on the left to ×0.7 on the right, with the four possible values marked. Zones: red from 2.0 to 1.4, amber from 1.4 to 1.0, green from 1.0 to 0.7.
- A needle, the value in large type (`×1.4`), and a plain caption: "failures in flight more likely" above 1, "normal odds of failure in flight" at 1, "failures in flight less likely" below 1.
- Three lamps under it, `TEST 1`, `TEST 2`, `TEST 3`, lit up to the number of test turns.

**Readable text.** No text on the big screen may appear smaller than 12 CSS pixels in a 1280 × 720 window. (Built: the screen canvas is 2400 px wide and its smallest font is 34 px; at 1280 × 720 the screen shows about 970 CSS px wide, so the smallest text is about 13.7 px.) If something does not fit at that size, shorten or drop the legends first, never the headline numbers.

### Room status

One status for the room, shown as the header chip and as lighting:

| Level | When | Chip | Room |
|---|---|---|---|
| Alert | Go/No-Go `Time` check is red | `RIDE MISSED`, blinking red | Light turns red and pulses, the two wall beacons flash, the screen's glow turns red |
| Caution | Otherwise, the first that applies: `Budget` check is red; test time is 0; reserve is 0; `Time` check is yellow; `Budget` check is yellow | `OVER BUDGET`, `CAUTION: UNTESTED`, `CAUTION: NO RESERVE`, `CAUTION: NO SPARE TIME`, `CAUTION: EATING THE RESERVE` | A slight amber tint |
| Nominal | Otherwise | `ALL NOMINAL`, green | Calm blue |

Only these conditions drive the room in this step; red checks that belong to other steps (mass, power and so on) do not.

### Wording

The room says "months" where the rest of the game says "turns" (one turn is one month): `2 MONTHS SPARE`, `RIDE LEAVES · END OF MONTH 8`. **(Claude's call, as shown in the approved mockup.)** Money is written as in the mockup: `$2.5M`.

### Keyboard, fallback and tests

- The Planning step always renders a plain HTML block as well: the step title, one labelled range input for test time and one for the reserve, the build time, and one sentence with the ready turn, the ride turn and the margin (today's "Timeline Summary").
- While the 3D room is running, that block is visually hidden but stays in the tab order and for screen readers. Changing a range input moves the knob or fader in the room, because both read the same store. Focusing a range input highlights its control in the room.
- If the 3D room cannot start or throws (no WebGL, an error inside the scene), the plain block is shown instead, styled like the other steps, and the step remains fully usable. Use an error boundary, as `DesignDiagramPanel` does.
- The 3D room must not be needed to render the step on the server or in tests: the smoke test must keep passing by rendering the plain block.
- "Reduce motion" setting in the browser: no camera sway, no pulsing (the alarm is a steady red), values change at once.

### Structure

Suggested split; the builder may adjust it, but the three pure modules must stay free of three.js and React so they can be tested in Node.

| Unit | Purpose |
|---|---|
| `planningView` (pure) | Turns `Budgets`, the planning choices and the two Go/No-Go checks into everything the room shows: tank blocks and lines, timeline blocks, marker, headline, risk value and caption, status level and chip text, console readouts. |
| `controlMath` (pure) | Knob angle ↔ value, fader position ↔ value, snapping and clamping. |
| `screenPainter` (pure, canvas 2D only) | Draws the big screen from a view and an animation state onto a 2D context it is given. |
| Control room scene (react-three-fiber) | Room, rows, big screen mesh, console, knob, fader, meter, lamps, lights, camera. Reads the store, writes through `updateDesign`. |
| `PlanningScreen` | Hosts the scene, the plain block, the buttons and the fallback. |

### Performance

- Smooth on a recent laptop with integrated graphics at 1440 × 900. No shadows; pixel ratio capped at 2.
- The big-screen texture is repainted only while something on it is moving (a value easing, the alarm blink, the rocket), not on every frame when idle.

## Testing

- Unit tests (Node) for `planningView`: blocks add up to `totalCost`; spendable line; free / eating reserve / over cap; timeline blocks end at `readyTurn`; spare, zero and missed cases; risk value and caption for 0 to 3 test turns; every status row of the table above.
- Unit tests for `controlMath`: each knob angle and fader position maps to the right value and back; values clamp at both ends.
- `screenPainter` test with a recording stand-in for the 2D context: painting each state (nominal, caution, missed, over budget) does not throw and never passes a non-finite number.
- The existing suite, including `screens.smoke.test.tsx`, passes unchanged.
- By hand in the browser before calling it done: drag and click both controls; check that every number on the big screen equals the same number computed by the game (compare with the Dashboard on another step and with the Go/No-Go reasons); force a missed ride and an over-budget plan; use the step with the keyboard only; check the fallback by disabling WebGL.

## Left to the builder

- Exact geometry, materials, colours within the Night shift palette of the mockup, and how the scenery is batched.
- The big screen's canvas resolution and exact layout, within the readable-text rule.
- Easing curves and timings.
- How the focus highlight on a 3D control looks.
- File names and the exact component split.

## Calls Claude made (please check)

Made during the build, after the builder check:

7. **Over budget is amber, not the red alarm.** The builder check worked out that with the real numbers the default Engineer design costs about $24.9M against a $25M cap, so the room would open amber and the knob at 2 would sound the red alarm for a problem the parts cause (Go/No-Go sends it to the spacecraft step). Only a missed ride, which the knob causes, raises the alarm here; over budget shows `OVER BUDGET` in amber and a red overflow in the tank.
8. **Budget figures in the plain block.** With the Dashboard hidden, the no-3D fallback shows reserve, spendable, plan cost and cap in text, so the reserve is never set blind.
9. **The no-diagram rule is a list** (`STEPS_WITHOUT_DIAGRAM` in `DesignScreen.tsx`) so the instrument-step work can add its step without a merge conflict.

Made while writing the design:

1. **Dashboard hidden on this step.** With the dashboard visible, the room is about 960 px wide on a 1440 px laptop and the big-screen text gets too small. The cost: on this one step the player does not see mass, power and the other bars (none of which this step changes).
2. **`DesignDiagramPanel` hidden on this step.** The big screen does its job here.
3. **"Months" instead of "turns"** inside the room, as in the mockup.
4. **Flight block in the budget tank.** The mockup showed four cost blocks; the real total also contains flight operations, so the tank gets a fifth block ("Flight") to match the Dashboard's budget figure.
5. **Caution for "eating the reserve"** (Budget check yellow) was not in the mockup; added so the room agrees with Go/No-Go.
6. **Approach A** (real 3D with pointer-grabbed controls).
