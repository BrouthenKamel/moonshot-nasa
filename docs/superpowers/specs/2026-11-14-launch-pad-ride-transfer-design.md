# Launch pad for step 5 (Ride & Transfer): design

Status: look approved by Jakob on 2026-11-14 ("A: pad + night sky", then "Yes, write design" on the mockup). Not implemented. Branch: `claude/ride-transfer-visual`, cut from `main` (bc9574c).

Reference, approved as the direction:

- Clickable mockup: `docs/superpowers/specs/assets/2026-11-14-launch-pad-mockup.html` (one flat canvas, throwaway; its numbers are real, taken from `computeBudgets` and `goNoGo` on main for two reference craft).
- Screenshots: `assets/2026-11-14-launch-pad-mockup-nominal.jpg`, `-short-tank.jpg`, `-gto-spiral.jpg`.

The mockup is the reference for look, layout and behaviour. Where this document and the mockup differ, this document wins.

## Intent and why

Moonshot is a game where a player designs a 6U CubeSat to map lunar ice and flies it turn by turn (one turn = one month). Step 5, Ride & Transfer, is where the player picks the rocket that carries the craft (three rideshares) and the path from the drop-off to the Moon (two transfers). Today it is two lists of cards and a box of delta-v numbers (`src/ui/steps/RideScreen.tsx`).

Jakob wants this step to get a full scene "in the same way we made really nice visuals for the mission control and instrument selection". His standing wish for these screens: every choice changes something the player can see, and the screen makes the player want to continue. He chose a launch pad at night with the path to the Moon drawn across the sky, over an Earth–Moon map table and over a pad with rockets only.

The step teaches one thing above all: where the ride drops you decides how much of your own propellant the journey costs, and your engine decides which paths exist at all. The scene must make that visible without reading a table.

Presentation is one of five judging criteria at the hackathon; the pitch is on Sunday 15 November 2026 at 17:30.

## Goals

1. The Ride step shows a night launch pad: the chosen rocket on the pad with a gantry and floodlights, a departures board, a propellant tank, and above them the night sky with a small Moon.
2. **Ride** is chosen on the departures board (three rows). Choosing a ride changes the rocket on the pad, moves the drop-off point in the sky, and moves the launch flag on the timeline.
3. **Transfer** is chosen on two signs in the sky. The direct path is a short arc; the low-energy path is a long loop past the Moon with one dot per turn of coasting. From the GTO ride the path first spirals out of Earth orbit.
4. The **propellant tank** shows, in stacked layers, what the journey uses of the delta-v on board: climb out, capture burn, 12 turns of holding the orbit, and what is spare; or by how much the tank is short.
5. A **timeline** shows ready, launch, turns in transit, arrival and the 12 turns of mapping.
6. The four Go / No-Go bars this step can turn red (**Delta-v, Mass, Time, Budget**) are visible in the scene with their reason text.
7. A path the craft cannot fly is shown as impossible, not hidden: it breaks off in red with "NO WAY THROUGH", and the tank says "CANNOT GET THERE".
8. The scene's mood follows the plan: calm when all four bars are green, amber when one is yellow, a red pulsing beacon when one is red.
9. The step works with the keyboard and without 3D, and the existing tests pass.

## Non-goals

- No change to game rules, data, constants or the store's shape. The step writes only `design.ride` and `design.transfer`.
- No orbit choice here and no drawing of the science orbits: that is the Orbit step (the Trajectory session). This scene shows only a thin ring at the Moon in the chosen orbit's colour.
- No lift-off animation: the flight plays on the agency map after Go / No-Go.
- No sound, no phone layout, no external models or textures (Kamel's `cubesat-6u.glb` on `assets-pipeline` is not used in this version). Everything is procedural, as the rest of `src/scene` is.
- No physically scaled trajectory. The paths are diagrams.

## Anti-goals (a failure even if it works technically)

- A number in the scene differs from the Dashboard or Go / No-Go. One source of truth: `computeBudgets` and `goNoGo`.
- The player cannot tell which ride and which transfer are selected at a glance.
- The player picks something that cannot fly and the scene looks fine.
- Labels too small to read on a laptop or projector, or labels that overlap in any of the six ride × transfer states.
- The scene stutters on a normal laptop during the pitch.
- Ride and Orbit look like two different buildings.

## Constraints

- Stack in the repo: React 19, TypeScript, Tailwind 4, three 0.187, `@react-three/fiber` 9, `@react-three/drei` 10, Zustand. No new dependencies.
- Tests run in Vitest with `environment: 'node'`: no DOM, canvas or WebGL. `src/ui/screens.smoke.test.tsx` renders every step with `renderToString` and expects more than 500 characters and no `NaN`.
- Shared design direction (`docs/DESIGN-DIRECTION.md`, branch `docs/design-direction`, PR #10): numbers only from the logic core; write only your own fields; parts chosen elsewhere are read-only and labelled with their building; title line `LAUNCH SITE · LUNAR ICE MAPPER · RIDE & TRANSFER`; dark scene (`#03050a`) with the Launch Site's orange (`#f97316`) as accent; units m/s, kg, $M, turns; 3D steps need the `PlanningScreen` fallback pattern; "← Agency base" stays reachable.
- Agreed with the Trajectory session (Orbit step, same building):
  - Border: this step draws the ride, the launch and the Earth-to-Moon path; Trajectory draws the three orbits around the Moon. The capture burn is the seam.
  - The path's last stretch, the capture marker and the thin ring at the Moon use the chosen orbit's colour: halo `#a78bfa`, elliptical `#a3e635`, low circular `#38bdf8`. Cyan is reserved for Trajectory's ice. The rest of the path is white-blue `#dbeafe`.
  - The capture marker sits on the Moon's lower left (Earth-facing side); Trajectory's scene starts with the craft arriving from there.
  - Back goes to `orbit`, Next goes to `comms`.
- Rules this step shows (all from `src/sim/budgets.ts`, `src/sim/checks.ts`, `src/data/rides.ts`, `src/data/transfers.ts`):
  - Rides: GTO (turn 6, $0.8M, 16 kg, +1500 m/s climb, ion engine only), Lunar (turn 8, $1.5M, 14 kg), Commercial Lunar Express (turn 10, $3.5M, 12 kg, capture × 0.4).
  - Transfers: direct (chemical or cold-gas engine only, 0 turns, "about 5 days") and low-energy (any engine; turns from `budgets.transferTurns`).
  - `budgets.captureDeltaV` is `null` when the craft cannot get there (no propellant, ride or transfer does not suit the engine, orbit not reachable). Otherwise it already includes the ride's climb (`deltaVTransfer`); the capture burn alone is `budgets.deltaVCapture`.
  - `budgets.massLimit` = the smaller of the brief's 14 kg and the ride's limit.
  - Go / No-Go: `Delta-v`, `Mass`, `Time`, `Budget` checks with `status` and `reason`.

## Approaches

1. **3D pad in front of a painted sky (chosen).** The pad, rocket, gantry, lights, board and tank are 3D objects. The sky (stars, Moon, paths, signs, labels) is one large painted canvas on a plane far behind them, the same technique as the control room's big screen. Small moving things on the sky (the craft dot, the pulsing capture marker) are separate sprites. Trade-off: the sky is flat, but the camera's sway gives real depth between pad and sky, the layout is a pure function that can be tested without WebGL, and the mockup's drawing code carries over almost directly.
2. **Everything in true 3D.** Moon as a sphere, paths as tubes in space, labels as billboards. Looks deepest, but label placement in six states becomes a camera problem, nothing is testable in node, and it is the slowest to build before the pitch.
3. **Flat canvas with parallax layers.** Fastest, but it would not sit with the control room and the other buildings, which are real 3D rooms.

Jakob handed the how to Claude; approach 1 is Claude's pick because it matches the control room's technique and is safe to finish in the time left.

## The design

### Where it sits in the app

- `Shell.tsx`: the ride step is full-bleed like planning (no Dashboard, no padding). Turn the current test into a list: `const FULL_BLEED_STEPS: DesignStep[] = ['planning', 'ride']`.
- `DesignScreen.tsx`: add `'ride'` to `STEPS_WITHOUT_DIAGRAM`.
- `RideScreen.tsx` follows `PlanningScreen.tsx` exactly: `useState(canUseWebGL)`, `lazy()` scene inside `Suspense` and an error boundary, plain controls always rendered (visible as the fallback, `sr-only` while the scene runs).

### Layout (as in the mockup, 16:9)

- **Left third, ground:** propellant tank at the far left, then the rocket on its pad with the gantry to its right. Under the rocket: the ride's name and `PAYLOAD 12.8 kg · LIMIT 14 kg` (red when over).
- **Right, ground:** the departures board on two posts.
- **Sky:** the Moon upper right; the two transfer signs upper middle; the path from the rocket's nose to the drop-off (dashed white, "the rocket carries you") and from the drop-off to the capture marker (solid, "your own engine").
- **Overlays (HTML over the canvas):** top left the title line, the overall chip (`GO FOR LAUNCH` / `CAUTION` / `NO GO`), the four bar chips and up to three reason lines; bottom the timeline strip; Back and Next in the top corners (Back above the title, Next top right).

### The departures board (ride)

Three rows, one per ride, in turn order. Each row: name, drop-off in plain words ("to Earth orbit (GTO)", "to a path to the Moon", "close to the Moon"), departure turn, fee, the mass limit that applies, the burn this ride leaves to the craft, and a status word. Limit, burn and status come from a what-if `computeBudgets` on a copy of the design with that ride:

- Column `TAKES`: the what-if `massLimit` (the smaller of the ride's limit and the brief's 14 kg, so GTO reads 14 kg), the same number the Mass bar uses.
- Column `YOU BURN`: the what-if `captureDeltaV` in m/s (climb and capture together), or `—` when it is `null`. This is where the player sees that the commercial ride more than halves the burn and GTO adds 1,500 m/s, before selecting.
- Column `PLAN COST`: the what-if `totalCost` as `$27.5M`, red when it is above `budgetCap`. The fee stays beside it in small type. (Playtest, 14 Nov: the GTO ride's $0.8M fee read as the cheap choice, but choosing it added $2.6M of transit cost, 20 turns and a Time no-go. The row must show the consequence, not only the fee.)
- Column `ARRIVES`: the what-if `arrivalTurn` as `TURN 27`, or `—` when it is `null`.
- `TOO EARLY` (red) when `readyTurn > departureTurn`; the turn number turns red.
- `OVER BUDGET` (red) when the what-if `totalCost > budgetCap`; it comes last in the order below.
- `TOO HEAVY` (red) when the what-if `massMargin < 0`; the limit turns red.
- `WRONG ENGINE` (red) when the ride does not suit the engine (GTO with a chemical or cold-gas engine).
- otherwise `ON TIME` (green). When several apply, show the first in this order: wrong engine, too heavy, too early, over budget.

Every row can be selected (as today). The selected row has the orange fill and outline. Click selects; hover brightens the row and shows a pointer cursor.

### The transfer signs

Two signs: `LOW-ENERGY TRANSFER · turns of coasting · small burn` and `DIRECT TRANSFER · about 5 days · one big braking burn`. The selected one is orange. A transfer the engine cannot fly (`isTransferCompatible` false) is dimmed, reads `needs a chemical engine · chosen at the Factory`, and cannot be selected, as today. If the stored design already holds such a transfer, it stays shown as selected and the path is drawn broken.

### Can the craft get there? (one answer, used by path, tank and timeline)

`RideView.reach` is one of four values, checked in this order. The Orbit step treats the same three failures as "not reachable", so the two steps agree.

| `reach` | When | Path | Tank | Timeline |
|---|---|---|---|---|
| `noWay` | `captureDeltaV === null` | red, dashed, stops past half way at a cross: `NO WAY THROUGH` | grey: `CANNOT GET THERE` | ready and launch only |
| `noPower` | `captureDeltaV !== null` and `transferTurns === null` (ion engine with too little solar power) | as `noWay`, cross reads `ENGINE HAS NO POWER` | grey: `ENGINE HAS NO POWER` | ready and launch only |
| `flyPast` | `deltaVAvailable < captureDeltaV` | drawn with its turn dots up to the capture point, last stretch red and dashed, overshooting past the Moon: `CANNOT BRAKE · FLIES PAST THE MOON` | layers with `SHORT BY` | ready, launch, transit, a red `FLIES PAST · TURN n`; no mapping block |
| `ok` | otherwise | whole | layers (still `SHORT BY` if there is not enough to hold the orbit 12 turns) | whole |

The sections below describe `ok` and call the first two rows "blocked".

### The path

A pure function gives the path for (ride, transfer type) as two polylines in sky-canvas coordinates, taken from the mockup's curves:

- **Ride leg:** from the rocket's nose to the drop-off. Drop-off positions: GTO low and near the pad, Lunar a third of the way, Commercial close to the Moon. Label: `DROP-OFF: EARTH ORBIT (GTO)` / `PATH TO THE MOON` / `CLOSE TO THE MOON`.
- **Craft leg:** from the drop-off to the capture marker. Direct: one arc. Low-energy: a loop out past the Moon and back in from below. From GTO, a widening spiral first, labelled `ION SPIRAL OUT · +1,500 m/s` (`budgets.deltaVTransfer`).
- **Turn dots:** `budgets.transferTurns` hollow dots spaced evenly along the craft leg, at most 24 drawn. With 0 turns, no dots.
- **Capture:** the last ~15% of the craft leg and the marker are in the orbit's colour. Label: `CAPTURE BURN` and `{deltaVCapture} m/s → {orbit short name}` with a small `orbit decided in the Orbit step`.
- The transfer not chosen is drawn as a faint dotted ghost, so the player sees the alternative.
- **Blocked** (`reach` is `noWay` or `noPower`): the craft leg is red and dashed, stops a little past half way at a red cross with the table's words; no dots, no capture label.
- A white dot (the craft) travels along ride leg then craft leg in a loop, about 8 s per trip; it is not drawn when blocked or under reduced motion.

### The propellant tank

A tall glass tank. Title `PROPELLANT`, below it `{deltaVAvailable} m/s on board` and `{propellantMass} kg · chosen at the Factory`. Layers from the bottom, heights proportional to m/s, scaled to the larger of what is on board and what is needed:

| Layer | Value | Colour |
|---|---|---|
| Climb out | `deltaVTransfer` (only when > 0) | amber `#fbbf24` |
| Capture | `deltaVCapture` | the orbit's colour |
| Hold orbit, 12 turns | `deltaVStationKeeping × missionDurationTurns` | indigo `#818cf8` |
| Spare | `deltaVMargin` when ≥ 0 | soft green |

A legend beside the tank lists the layers top to bottom with their m/s. When `deltaVMargin < 0`: a dashed white line marks where the tank ends, the part above it is tinted red, and the legend's first line is `SHORT BY {−deltaVMargin} m/s` in red. When blocked: the tank is grey with `CANNOT GET THERE`. Level changes ease over about 0.5 s.

### The timeline (HTML strip at the bottom)

Turns 1 to `max(28, arrival + 13)`. Blocks: `DESIGN · BUILD · TEST` up to `readyTurn`; `{n} TURNS IN TRANSIT` from `rideTurn` for `transferTurns`; `12 TURNS OF MAPPING` from `arrivalTurn`. Flags: `READY · TURN n` (green, red when after the launch), `LAUNCH · TURN n`, `ARRIVE · TURN n` in the orbit's colour. With a direct transfer the launch flag reads `LAUNCH · TURN n · AT THE MOON 5 DAYS LATER` and there is no arrive flag. When blocked, only ready and launch are shown.

### Bars, reasons and mood

- The four chips show `goNoGo`'s status for `Delta-v`, `Mass`, `Time`, `Budget`. Below them, the `reason` of every red, then every yellow one, at most three lines, each prefixed with its bar's name, wrapped to the overlay's width. Then `PLAN COST ${totalCost}M OF ${budgetCap}M`.
- Overall: any of the four red → `NO GO`; else any yellow → `CAUTION`; else `GO FOR LAUNCH`. (Bars from other steps do not change this scene's chip; Go / No-Go itself is step 7.)
- Mood: floodlights white when green, amber tint for caution; for `NO GO` the gantry's beacon and a red wash pulse (steady, not pulsing, under reduced motion).

### The rocket

Three procedural rockets, clearly different in silhouette: GTO a slim white rocket; Lunar a tall orange core with two white boosters and a white upper stage; Commercial a medium white-and-black rocket with a wide fairing. A small glowing box in the nose is the CubeSat (the ride leg starts there). Changing the ride swaps the rocket with a short vapour puff (instant under reduced motion). Vapour drifts at the base.

### Camera

Fixed viewpoint on the ground in front of the pad, framed so the layout above holds at 16:9; the field of view widens on narrower canvases as `SeatCamera` does in the control room. A slow small sway gives parallax between pad and sky; off under reduced motion.

### Keyboard, fallback and tests

- The plain controls are today's ride and transfer cards plus the delta-v box, kept as real buttons (`aria-pressed`, the disabled transfer keeps `disabled`). While the scene runs they are `sr-only`; focusing one highlights its row or sign in the scene.
- Without WebGL or after a scene error the plain controls are shown as today, with Back and Next below.
- The smoke test takes the plain path and must keep passing.

### Structure

- `src/viz/ride/rideView.ts`: `buildRideView(design, difficulty, budgets, checks): RideView`, pure. Holds everything the painters and overlays show: board rows, signs, path description, tank layers, timeline, bars, overall status, payload line. Does the three what-if `computeBudgets` calls for the board.
- `src/viz/ride/skyPath.ts`: pure path geometry and `pointAlong(path, t)`.
- `src/viz/ride/skyPainter.ts`, `boardPainter.ts`, `tankPainter.ts`: canvas painters taking a context, a view and an animation state; no DOM access except optional patterns behind `typeof document`.
- `src/viz/ride/orbitColours.ts`: the three orbit colours and short names by orbit id.
- `src/scene/launch/LaunchPad.tsx`: the r3f scene (pad, rocket, gantry, lights, tank, board, sky plane, hit meshes, camera).
- `src/ui/steps/RideScreen.tsx`: screen, overlays, plain controls, boundary.

### Performance

Canvases repaint only while a value is easing or the selection changed, never every frame for static content. The travelling craft dot and the pulsing marker are sprites, so the sky canvas stays still. Device pixel ratio capped as in the control room.

## Testing

- `rideView.test.ts`: for the three fixture designs across all six ride × transfer states: tank layers sum to `deltaVTotal` and equal the budget fields; `reach` follows the table (include an ion craft with the body-mounted solar array for `noPower` and the chemical fixture on Lunar + direct for `flyPast`); board statuses match the rules above; overall status matches the four checks; timeline turns equal the budget fields; direct transfer has 0 dots.
- `skyPath.test.ts`: every path has finite points inside the sky canvas, starts at the rocket's nose, ends at the capture point; the GTO path is longer than the Lunar one.
- Painter tests with the Proxy fake context from `screenPainter.test.ts`: no non-finite numbers in any state.
- By hand in the browser at 1280×720: all six states for an ion and a chemical craft, hover and click on rows and signs, keyboard through the hidden buttons, reduced motion, WebGL off.
- Before the PR: `pnpm typecheck && pnpm test && pnpm lint && pnpm build`.

## Left to the builder

- Exact 3D positions, sizes, materials and light values, as long as the layout and readability hold.
- The rocket swap effect and vapour.
- Canvas sizes and font sizes (text must be at least as large on screen as in the control room).
- How hover and focus are highlighted.

## Calls Claude made (please check)

1. The sky is a painted plane behind a 3D pad (approach 1), not true 3D.
2. Title, bars, reasons, timeline and the Back / Next buttons are HTML overlays, not painted into the scene, for crisp text and screen readers.
3. The board shows the mass limit that applies (14, 14, 12 kg), not each ride's own (16, 14, 12 kg), so it never disagrees with the Mass bar. The mockup shows 16 kg for GTO; the document wins.
9. The board has a `YOU BURN` column the mockup does not have (the reviewer's point: the step's main lesson should be visible before selecting).
11. The board also has `PLAN COST` and `ARRIVES` columns and an `OVER BUDGET` status, from a playtest finding the coordinator sent after the mockup was approved.
10. Three ways of not getting there are told apart (`noWay`, `noPower`, `flyPast`); the mockup shows only the first.
4. An impossible transfer cannot be selected (as today), but an impossible ride can, and is marked on the board.
5. The scene's overall chip looks only at Delta-v, Mass, Time and Budget.
6. The orbit colours are copied into `src/viz/ride/orbitColours.ts` instead of imported from Trajectory's unmerged code.
7. Time is written in turns everywhere (shared design direction), not months.
8. No lift-off animation and no CubeSat model in this version.
