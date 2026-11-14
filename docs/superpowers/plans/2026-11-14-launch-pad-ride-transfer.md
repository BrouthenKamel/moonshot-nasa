# Launch Pad Ride & Transfer Step Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the card lists of design step 5 (Ride & Transfer) with a night launch pad scene: the chosen rocket on the pad, a departures board for the ride, two sky signs for the transfer, the path to the Moon across the sky, a propellant tank and a timeline.

**Architecture:** Pure modules under `src/viz/ride/` turn the game's own `Budgets` and Go / No-Go checks into one `RideView` and into path geometry in a fixed 1600 × 900 "sky" coordinate space; three canvas painters draw the sky, the board and the tank from that view. A react-three-fiber scene (`src/scene/launch/LaunchPad.tsx`) puts a 3D pad, rocket, board and tank in front of the painted sky plane. `RideScreen` keeps today's cards as the plain controls (keyboard, tests, fallback), mounts the scene behind an error boundary and lays title, bars, reasons and timeline over it as HTML.

**Tech Stack:** React 19, TypeScript, three 0.187, @react-three/fiber 9, Zustand, Tailwind 4, Vitest (node environment).

**Spec:** `docs/superpowers/specs/2026-11-14-launch-pad-ride-transfer-design.md` (visual reference: `docs/superpowers/specs/assets/2026-11-14-launch-pad-mockup.html`; its `bez`, `ridePath`, `craftPath`, `rocket` and `draw` functions hold the curves, positions and drawing order to carry over).

**Pattern to copy:** `src/ui/steps/PlanningScreen.tsx`, `src/scene/ControlRoom.tsx`, `src/viz/planning/*` (view model, painters, fake-context painter test, `SeatCamera`, `makeCanvasTexture`, `prefersReducedMotion`).

## Global Constraints

- Branch `claude/ride-transfer-visual`; rebase onto the newest `origin/main` before starting (c04a7db or later). Never commit to `main`, never merge; send the PR link to the `Integration` session.
- No new dependencies; no external models, textures or fonts.
- No change to `src/sim/*`, `src/data/*`, `src/state/*`. The step writes only `updateDesign({ ride })` and `updateDesign({ transfer })`.
- Every number comes from `computeBudgets` / `goNoGo`; what-if previews call `computeBudgets` on a copy of the design. Reason text is `CheckResult.reason`, unchanged.
- WebGL check only through `canUseWebGL()` from `src/scene/webgl.ts`; never call `getContext` for a check.
- Title line: `LAUNCH SITE · LUNAR ICE MAPPER · RIDE & TRANSFER`. Background `#03050a`. Selection accent orange `#f97316`. Red `#f87171`, amber `#fbbf24`, green `#4ade80`, path white-blue `#dbeafe`. Cyan is not used.
- Orbit colours: `orbit-halo` `#a78bfa`, `orbit-elliptical` `#a3e635`, `orbit-100km` `#38bdf8`.
- Units: m/s, kg, `$1.5M`, turns (never "months").
- No painted text smaller than 12 CSS px in a 1280 × 720 window.
- `prefers-reduced-motion`: no camera sway, no pulsing, no travelling dot, values change at once.
- Shared one-liners, as lists: `Shell.tsx` gets `const FULL_BLEED_STEPS: DesignStep[] = ['planning', 'ride']`; `DesignScreen.tsx` gets `'ride'` added to `STEPS_WITHOUT_DIAGRAM`. Keep whatever other entries main has by then.
- Existing suite passes, including `src/ui/screens.smoke.test.tsx` ("the ride and comms screens show real numbers" expects `m/s` in the plain path).
- Before the PR: `pnpm typecheck && pnpm test && pnpm lint && pnpm build`.

## Review Focus

- A design whose `ride` or `transfer` id matches nothing: no row or sign selected, no `NaN`, no throw (Task 1 test).
- No propellant or `deltaVAvailable` 0: `reach` is `noWay`, tank grey, `scaleMax` at least 1 so nothing divides by zero (Task 1 test).
- `transferTurns` above 24 (slow ion spiral): 24 dots drawn, timeline `turns` grows to `arrivalTurn + 13` (Task 1 test).
- A stored transfer the engine cannot fly: its sign is selected but not selectable, path broken (Task 1 test).
- The scene throws or WebGL is missing: plain cards appear and the step stays usable (Task 5, by hand).

---

### Task 1: `rideView` and orbit colours (pure)

**Files:**
- Create: `src/viz/ride/orbitColours.ts`, `src/viz/ride/rideView.ts`
- Test: `src/viz/ride/rideView.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // orbitColours.ts
  export function orbitColour(orbitId: string): string            // unknown id → '#dbeafe'
  export function orbitShortName(orbitId: string): string         // 'HALO LOOP' | 'ELLIPTICAL ORBIT' | 'LOW CIRCULAR ORBIT' | 'ORBIT'

  // rideView.ts
  export type Reach = 'ok' | 'noWay' | 'noPower' | 'flyPast'
  export type RowStatus = 'onTime' | 'tooEarly' | 'tooHeavy' | 'wrongEngine' | 'overBudget'
  export type DropKind = 'gto' | 'trans-lunar' | 'lunar-vicinity'
  export interface BoardRow { id: string; name: string; dropWords: string; turn: number; fee: number; limitKg: number; burn: number | null; planCost: number; overBudget: boolean; arrivalTurn: number | null; status: RowStatus; statusLabel: string; selected: boolean }
  export interface TransferSign { id: string; type: 'direct' | 'low_energy'; title: string; sub: string; selectable: boolean; selected: boolean }
  export interface TankLayer { key: 'climb' | 'capture' | 'hold' | 'spare'; label: string; value: number; colour: string }
  export interface BarView { resource: 'Delta-v' | 'Mass' | 'Time' | 'Budget'; status: BarStatus; reason: string }
  export interface RideView {
    reach: Reach
    status: 'go' | 'caution' | 'nogo'
    statusLabel: 'GO FOR LAUNCH' | 'CAUTION' | 'NO GO'
    rows: BoardRow[]                       // sorted by turn
    signs: TransferSign[]                  // low_energy first, then direct
    rideName: string                       // upper case, '' when no ride
    path: { drop: DropKind; dropLabel: string; transferType: 'direct' | 'low_energy'; spiral: boolean; spiralLabel: string; dots: number; captureLabel: string; blockedLabel: string | null }
    orbit: { colour: string; shortName: string }
    tank: { available: number; propellantKg: number; layers: TankLayer[]; shortBy: number; greyLabel: string | null; scaleMax: number }
    timeline: { turns: number; readyTurn: number; rideTurn: number; transferTurns: number | null; arrivalTurn: number | null; late: boolean; direct: boolean; showMapping: boolean; flyPast: boolean }
    bars: BarView[]                        // always the four, in the order Delta-v, Mass, Time, Budget
    reasons: BarView[]                     // red first, then yellow, at most 3
    payload: { mass: number; limit: number; over: boolean }
    costLine: string                       // 'PLAN COST $24.9M OF $25M'
  }
  export function buildRideView(design: Design, difficulty: Difficulty, budgets: Budgets, checks: CheckResult[]): RideView
  ```

Rules (spec sections "Can the craft get there?", "The departures board", "The transfer signs", "The propellant tank", "The timeline", "Bars, reasons and mood"):

- `reach`: `captureDeltaV === null` → `noWay`; else `transferTurns === null` → `noPower`; else `deltaVAvailable < captureDeltaV` → `flyPast`; else `ok`.
- Row values come from `computeBudgets({ ...design, ride: ride.id }, difficulty)`: `limitKg = massLimit`, `burn = captureDeltaV`, `planCost = totalCost`, `overBudget = totalCost > budgetCap`, `arrivalTurn`. Status order: `wrongEngine` (engine is electric and `!ride.electricCompatible`, or not electric and `!ride.chemicalCompatible`), `tooHeavy` (`massMargin < 0`), `tooEarly` (`readyTurn > departureTurn`), `overBudget`, else `onTime`. Labels `WRONG ENGINE`, `TOO HEAVY`, `TOO EARLY`, `OVER BUDGET`, `ON TIME`. `dropWords`: `to Earth orbit (GTO)`, `to a path to the Moon`, `close to the Moon`.
- Signs: titles `LOW-ENERGY TRANSFER`, `DIRECT TRANSFER`; subs `turns of coasting · small burn`, `about 5 days · one big braking burn`; when `!isTransferCompatible(transfer, engineType)`: `selectable: false`, sub `needs a chemical engine · chosen at the Factory`. With no propulsion part, treat the engine type as `'chemical'` (as `RideScreen` does today).
- Path: `dropLabel` `DROP-OFF: EARTH ORBIT (GTO)` / `DROP-OFF: PATH TO THE MOON` / `DROP-OFF: CLOSE TO THE MOON`; `spiral` = drop is `gto`; `spiralLabel` = `ION SPIRAL OUT · +1,500 m/s` from `deltaVTransfer`; `dots` = `min(transferTurns, 24)` for `ok` and `flyPast`, else 0; `captureLabel` = `` `${deltaVCapture.toFixed(0)} m/s → ${shortName}` ``; `blockedLabel`: `NO WAY THROUGH` (`noWay`), `ENGINE HAS NO POWER` (`noPower`), `CANNOT BRAKE · FLIES PAST THE MOON` (`flyPast`), `null` (`ok`).
- Tank: `layers` empty and `greyLabel` `CANNOT GET THERE` / `ENGINE HAS NO POWER` for `noWay` / `noPower`. Otherwise layers bottom to top: `climb` (`CLIMB OUT`, `deltaVTransfer`, `#fbbf24`, only when > 0), `capture` (`CAPTURE`, `deltaVCapture`, orbit colour), `hold` (`HOLD ORBIT, 12 TURNS`, `deltaVStationKeeping × lunarIceMapperBrief.missionDurationTurns`, `#818cf8`), `spare` (`SPARE`, `deltaVMargin`, `#4ade80`, only when ≥ 0). `shortBy = max(0, −deltaVMargin)`. `scaleMax = max(deltaVAvailable, deltaVTotal, 1)`.
- Timeline: `turns = max(28, (arrivalTurn ?? rideTurn) + 13)`; `late = readyTurn > rideTurn`; `direct = transferTurns === 0`; `showMapping = reach === 'ok'`; `flyPast = reach === 'flyPast'`; for `noWay` / `noPower` set `transferTurns` and `arrivalTurn` to `null`.
- Bars: pick the four checks by `resource`; a missing check counts as green with an empty reason. `status`: any red → `nogo`, else any yellow → `caution`, else `go`.

- [ ] **Step 1: Write the failing tests** in `rideView.test.ts`. Helper `view(design)` runs `computeBudgets(design, 'engineer')`, `goNoGo`, `buildRideView`. Designs: `iceCubeDesign`, `flashlightDesign`, `lunahMapDesign` from `src/sim/fixtures`. Tests and assertions:
  - `default craft on the lunar ride with low-energy transfer`: `reach === 'ok'`; `tank.available` ≈ 2628 (`toBeCloseTo(…, 0)`); layers keys `['capture','hold','spare']` with values 1000, 60, ≈1568; `path.dots === 11`; `timeline` `{ readyTurn: 7, rideTurn: 8, transferTurns: 11, arrivalTurn: 19 }`; `status === 'caution'` (Budget yellow); `orbit.colour === '#a3e635'`.
  - `layers match the budget fields in every state`: for each fixture × 3 rides × 2 transfers with `reach` `ok` or `flyPast`: sum of `climb + capture + hold` equals `budgets.deltaVTotal` (`toBeCloseTo`), and `spare` or `shortBy` equals `|deltaVMargin|`.
  - `ion engine on a direct transfer has no way through`: `iceCubeDesign` with `transfer-direct` → `reach === 'noWay'`, `path.blockedLabel === 'NO WAY THROUGH'`, `tank.greyLabel === 'CANNOT GET THERE'`, `path.dots === 0`, `timeline.arrivalTurn === null`, direct sign `{ selected: true, selectable: false }`.
  - `ion engine with the body-mounted array has no power`: `{ ...iceCubeDesign, solar: 'solar-body' }` → `reach === 'noPower'`, `tank.greyLabel === 'ENGINE HAS NO POWER'`.
  - `chemical craft on lunar + direct flies past`: `flashlightDesign` with `transfer-direct` → `reach === 'flyPast'`, `tank.shortBy` ≈ 215, `timeline.direct === true`, `timeline.showMapping === false`, `status === 'nogo'`.
  - `board statuses`: `flashlightDesign` → rows by id: gto `wrongEngine`, lunar `onTime`, commercial `tooHeavy`; `iceCubeDesign` → gto `tooEarly` with `limitKg === 14`, `burn === 2500`, `planCost` ≈ 27.5, `overBudget === true`, `arrivalTurn === 27`; lunar `planCost` ≈ 24.9 and `arrivalTurn === 19`; commercial `burn === 400`; `{ ...iceCubeDesign, planning: { ...iceCubeDesign.planning, testTurns: 0 } }` → gto `overBudget` status (ready on turn 6, still above the cap); rows sorted by turn 6, 8, 10; exactly one `selected`.
  - `GTO ride adds the spiral`: `{ ...iceCubeDesign, ride: 'ride-gto' }` → `path.spiral`, layers start with `climb` 1500, `path.dots === 21`, `timeline.turns === 40`.
  - `dots are capped at 24`: build the view from budgets patched with `transferTurns: 30, arrivalTurn: 38` → `path.dots === 24`, `timeline.turns === 51`.
  - `unknown ride and transfer ids`: `{ ...iceCubeDesign, ride: 'x', transfer: 'y' }` → no row and no sign selected, `rideName === ''`, `JSON.stringify(view)` contains neither `NaN` nor `null` inside `tank.scaleMax`; `tank.scaleMax >= 1`.
  - `overall status follows the four bars only`: checks patched so only `Science` is red → `status === 'go'`.
- [ ] **Step 2: Run** `pnpm vitest run src/viz/ride/rideView.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** `orbitColours.ts` and `buildRideView` with the rules above.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(ride): pure view model for the launch pad`.

---

### Task 2: `skyPath` (pure geometry and layout)

**Files:**
- Create: `src/viz/ride/skyPath.ts`
- Test: `src/viz/ride/skyPath.test.ts`

**Interfaces:**
- Consumes: `DropKind` from Task 1.
- Produces:
  ```ts
  export interface Pt { x: number; y: number }
  export interface Rect { x: number; y: number; w: number; h: number }
  export const SKY_W = 1600, SKY_H = 900            // sky coordinate space = the mockup's canvas
  export const GROUND_Y = 735
  export const MOON = { x: 1290, y: 175, r: 60 }
  export const CAPTURE: Pt = { x: 1232, y: 226 }
  export const ROCKET_X = 440
  export const NOSE: Record<DropKind, Pt>           // gto {440,470}, trans-lunar {440,395}, lunar-vicinity {440,440}
  export const DROP: Record<DropKind, Pt>           // gto {730,470}, trans-lunar {760,340}, lunar-vicinity {1100,275}
  export const SIGN_RECT: Record<'low_energy' | 'direct', Rect>   // {720,22,320,62} and {720,92,320,62}
  export function rideLeg(drop: DropKind): Pt[]
  export function craftLeg(drop: DropKind, transfer: 'direct' | 'low_energy'): Pt[]
  export function pathLength(pts: Pt[]): number
  export function pointAlong(pts: Pt[], t: number): Pt       // t clamped to 0..1, by arc length
  export function slice(pts: Pt[], from: number, to: number): Pt[]   // by arc-length fraction
  export function turnDots(pts: Pt[], n: number): Pt[]       // n points at i / (n + 0.3) × 0.97, i = 1..n (as the mockup)
  export function overshoot(pts: Pt[], length: number): Pt[] // straight continuation past the last point along its last direction
  ```
  Curves: port `bez`, `ridePath` and `craftPath` from the mockup unchanged (same control points and spiral formula), keyed by `DropKind` instead of the mockup's `gto` / `lunar` / `comm`.

- [ ] **Step 1: Write the failing tests**:
  - `every path stays in the sky`: for 3 drops × 2 transfers, every point of `rideLeg` and `craftLeg` is finite with `0 <= x <= SKY_W` and `0 <= y <= GROUND_Y`.
  - `legs join`: `rideLeg(d)[0]` equals `NOSE[d]`; its last point equals `DROP[d]`; `craftLeg(d, t)` ends at `CAPTURE` (within 0.5); for `trans-lunar` and `lunar-vicinity` it starts at `DROP[d]`.
  - `the GTO path is the longest`: `pathLength(craftLeg('gto','low_energy')) > pathLength(craftLeg('trans-lunar','low_energy')) > pathLength(craftLeg('trans-lunar','direct'))`.
  - `pointAlong`: `t = 0` → first point, `t = 1` → last, `t = 2` → last, `t = -1` → first.
  - `turnDots`: `turnDots(p, 0)` is `[]`; `turnDots(p, 11)` has 11 points, all on the path's bounding box.
  - `overshoot`: result has 2 points, starts at the path's last point, length ≈ the given length.
  - `signs do not cover the Moon`: neither `SIGN_RECT` overlaps the square around `MOON` of side `2 × (r + 40)`.
- [ ] **Step 2: Run** `pnpm vitest run src/viz/ride/skyPath.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(ride): sky path geometry`.

---

### Task 3: painters (sky, board, tank)

**Files:**
- Create: `src/viz/ride/skyPainter.ts`, `src/viz/ride/boardPainter.ts`, `src/viz/ride/tankPainter.ts`
- Test: `src/viz/ride/painters.test.ts`

**Interfaces:**
- Consumes: `RideView` (Task 1); everything from `skyPath.ts` (Task 2).
- Produces:
  ```ts
  // skyPainter.ts — paints in SKY_W × SKY_H units; the caller scales the context
  export const SKY_CANVAS_SCALE = 1.5                       // canvas is 2400 × 1350
  export type Hover = { kind: 'ride' | 'transfer'; id: string } | null
  export function paintSky(ctx: CanvasRenderingContext2D, view: RideView, hover: Hover): void

  // boardPainter.ts
  export const BOARD_W = 1200, BOARD_H = 500
  export function rowRect(index: number): Rect              // in board canvas units
  export function paintBoard(ctx: CanvasRenderingContext2D, view: RideView, hover: Hover): void

  // tankPainter.ts
  export const TANK_W = 640, TANK_H = 900
  export function tankTargets(view: RideView): number[]     // layer heights as 0..1 of the tank, bottom to top; [] when grey
  export function paintTank(ctx: CanvasRenderingContext2D, view: RideView, levels: number[]): void
  ```
  What each paints (spec sections of the same names; drawing order and styling as the mockup's `draw`):
  - **Sky:** gradient `#03050a` → `#071022` → `#16233f` down to `GROUND_Y`; about 260 stars from a fixed seed; Moon with glow, four craters, label `THE MOON`; thin ring in `view.orbit.colour`; the unchosen transfer as a faint dotted ghost; ride leg dashed white; craft leg by `reach`: `ok` white-blue with the last 14% in the orbit colour, capture labels `CAPTURE BURN` + `captureLabel` + small `orbit decided in the Orbit step`, right-aligned left of `CAPTURE`; `flyPast` the same but the last 14% plus `overshoot(…, 160)` red and dashed with `blockedLabel` and no capture labels; `noWay` / `noPower` red and dashed for the first 55%, a red cross, `blockedLabel`; `turnDots` as hollow circles; drop-off dot and `dropLabel`; `spiralLabel` in amber when `path.spiral` and not blocked; the two signs in `SIGN_RECT` (selected: orange fill `rgba(124,45,18,.9)` and `#f97316` outline; not selectable: 45% opacity; hovered and selectable: brighter outline). Not painted here: the travelling craft dot and the pulsing capture marker (sprites in Task 4), anything below `GROUND_Y`.
  - **Board:** header `DEPARTURES` in amber and column heads `LEAVES`, `PLAN COST`, `TAKES`, `YOU BURN`, `ARRIVES`; one row per `view.rows` in `rowRect(i)`: name, `dropWords`, turn (red when `tooEarly`), plan cost as `$27.5M` (red when `overBudget`) with `fee $0.8M` small beneath it, `14 kg` (red when `tooHeavy`), burn as `2,500 m/s` or `—`, arrival as `TURN 27` or `—`, `statusLabel` (green for `onTime`, else red); selected row orange as above; hovered row lighter.
  - **Tank:** title `PROPELLANT`, `2,628 m/s on board`, `1.5 kg · chosen at the Factory`; glass outline; layers drawn from `levels` in each layer's colour (`spare` at 35% opacity); legend top to bottom (reverse of `layers`), each a colour square, label, value in m/s; when `shortBy > 0` a dashed white line at the tank's level, red tint above it and a first legend line `SHORT BY 215 m/s` in red; when `greyLabel` a grey fill and the label in red, two lines.

- [ ] **Step 1: Write the failing tests** using the Proxy `fakeContext()` from `src/viz/planning/screenPainter.test.ts` (copy it into the test file; add `createLinearGradient` and `createRadialGradient` returning `{ addColorStop() {} }`). For each fixture design × 3 rides × 2 transfers, plus `{ ...iceCubeDesign, solar: 'solar-body' }`:
  - `painters never draw a non-finite number`: run `paintSky`, `paintBoard`, `paintTank(…, tankTargets(view))`; every numeric argument of every recorded call is finite.
  - `the sky names the state`: the recorded `fillText` strings include `view.path.dropLabel`, and `view.path.blockedLabel` when it is not `null`, and `CAPTURE BURN` exactly when `reach === 'ok'`.
  - `the board lists three rides and their status`: `fillText` strings include every row's `statusLabel` and `DEPARTURES`.
  - `tank targets`: `tankTargets` is `[]` when `greyLabel`; otherwise every value is in `0..1` and their sum is ≤ 1.0001; for the default design the sum is ≈ 1.
  - `row rects are inside the board and do not overlap`.
- [ ] **Step 2: Run** `pnpm vitest run src/viz/ride/painters.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the three painters. No DOM access; all sizes in the units above.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(ride): sky, board and tank painters`.

---

### Task 4: the launch pad scene

**Files:**
- Create: `src/viz/ride/useRideView.ts`, `src/scene/launch/LaunchPad.tsx`

**Interfaces:**
- Consumes: `buildRideView`, `RideView` (Task 1); `skyPath.ts` (Task 2); painters and `Hover` (Task 3).
- Produces:
  ```ts
  // useRideView.ts
  export function useRideView(): RideView                   // design, difficulty, getBudgets(), getGoNoGo().checks through useMemo, as usePlanningView does
  export function chooseRide(id: string): void              // updateDesign({ ride: id }) unless already chosen
  export function chooseTransfer(id: string): void          // no-op when that sign is not selectable or already chosen

  // LaunchPad.tsx
  export type RideFocus = { kind: 'ride' | 'transfer'; id: string } | null
  export function LaunchPad({ focus }: { focus: RideFocus }): JSX.Element   // the r3f <Canvas>, className "!absolute inset-0", aria-hidden
  ```

Decisions the scene must follow (spec sections "Layout", "The rocket", "Camera", "Bars, reasons and mood", "Performance"):

- **Sky plane:** one plane far behind the pad carrying the sky canvas texture, sized and placed so that at the neutral camera and a 16:9 canvas it exactly fills the view. Sky coordinates then map 1:1 to the screen: a sky point `(x, y)` is at plane-local `((x / SKY_W − 0.5) × planeW, (0.5 − y / SKY_H) × planeH)`. Use this one mapping for the hit meshes and sprites.
- **Pad objects in 3D, placed to match the mockup at the neutral camera:** ground plane from `GROUND_Y` down; pad slab; rocket centred on `ROCKET_X` with its nose at `NOSE[drop]`; gantry to the rocket's right with a red beacon on top; two floodlight cones; drifting vapour at the base; the tank (a plane with the tank canvas texture, upright, far left); the departures board (a plane with the board canvas texture on two posts, ground right). They sit nearer the camera than the sky plane so the sway gives parallax.
- **Rockets:** three procedural variants by `DropKind` as in the mockup's `rocket()`: `gto` slim white; `trans-lunar` orange core, two white boosters, white upper stage; `lunar-vicinity` white and black with a wide fairing. A small glowing box in the nose. On a ride change the rocket swaps with a short vapour puff; instant under reduced motion.
- **Hit meshes:** invisible planes over the three board rows (`rowRect`) and the two signs (`SIGN_RECT`); `onClick` → `chooseRide` / `chooseTransfer`; `onPointerOver` / `Out` set the hover (and `document.body.style.cursor`); a non-selectable sign gets no pointer cursor. `focus` from the screen counts as hover.
- **Sprites on the sky:** the craft dot travelling `rideLeg` then `craftLeg` in about 8 s, looping, hidden unless `reach === 'ok'` and motion is allowed; the capture marker ring pulsing at `CAPTURE` in the orbit colour when `reach === 'ok'`.
- **Repainting:** sky and board repaint only when the view or hover changes; the tank eases its levels toward `tankTargets(view)` over about 0.5 s and repaints only while moving. Set `texture.needsUpdate` only on a repaint.
- **Mood:** floodlights white for `go`, amber-tinted for `caution`; for `nogo` the beacon and a red light pulse (steady under reduced motion).
- **Camera:** fixed, with the `SeatCamera` approach from `ControlRoom.tsx`: wider fov on narrower canvases so the board and tank stay in frame, small pointer sway, off under reduced motion. `dpr={[1, 2]}`, background and fog `#03050a`.

- [ ] **Step 1: Implement `useRideView.ts`.**
- [ ] **Step 2: Implement `LaunchPad.tsx`.**
- [ ] **Step 3: Run** `pnpm typecheck && pnpm lint`. Expected: no errors (warnings only as on main).
- [ ] **Step 4: Commit** `feat(ride): launch pad scene`.

(The scene has no node test: Vitest has no WebGL. It is checked by hand in Task 5.)

---

### Task 5: `RideScreen`, overlays and shell wiring

**Files:**
- Modify: `src/ui/steps/RideScreen.tsx` (rewrite), `src/ui/Shell.tsx:17`, `src/ui/screens/DesignScreen.tsx:39`
- Test: `src/ui/screens.smoke.test.tsx` (existing, unchanged)

**Interfaces:**
- Consumes: `useRideView`, `chooseRide`, `chooseTransfer` (Task 4); `LaunchPad`, `RideFocus` (Task 4); `canUseWebGL` (`src/scene/webgl.ts`).
- Produces: `export function RideScreen()` as today.

Structure, mirroring `PlanningScreen.tsx`:

- `RideControls({ hidden, onFocus })`: today's header, delta-v box, ride cards and transfer cards, kept as they are (same text, so the smoke test still finds `m/s`), with `aria-pressed` on each card, `onFocus` / `onBlur` reporting a `RideFocus`, and the incompatible transfer still `disabled`. Wrapper class `sr-only` when `hidden`, else `mx-auto max-w-3xl space-y-6`.
- `RideOverlay({ view })`, absolutely placed top left, `pointer-events-none`, max width 44rem: the title line; the status chip (`statusLabel`; green, amber or red background); four bar chips (dot + name, coloured by `status`); `view.reasons` as lines `` `${resource.toUpperCase()}: ${reason}` `` in red or amber, in a region with `aria-live="polite"`; then `view.costLine`.
- `RideTimeline({ view })`, absolutely placed along the bottom, `pointer-events-none`: a strip of `view.timeline.turns` equal columns with the blocks and flags of the spec's "The timeline" section; labels `DESIGN · BUILD · TEST`, `{n} TURNS IN TRANSIT`, `12 TURNS OF MAPPING`, `READY · TURN n`, `LAUNCH · TURN n`, `ARRIVE · TURN n`, `LAUNCH · TURN n · AT THE MOON 5 DAYS LATER`, `FLIES PAST · TURN n`. Above the strip, centred under the rocket: `view.rideName` and `` `PAYLOAD ${mass.toFixed(1)} kg · LIMIT ${limit} kg` `` (red when `over`).
- `StepButtons({ overlay })`: Back → `setDesignStep('orbit')` (`← Back`), Next → `setDesignStep('comms')` (`Setup Communications →`); as an overlay Back sits top left above the title block and Next top right.
- `RideScreen`: `useState(canUseWebGL)`; without the room: plain controls and buttons in a scrolling column; with it: a `relative h-full min-h-[480px] w-full overflow-hidden bg-[#03050a]` box holding the error boundary + `Suspense` + lazy `LaunchPad`, the hidden `RideControls`, `RideOverlay`, `RideTimeline` and the overlay buttons.

- [ ] **Step 1: Rewrite `RideScreen.tsx`** as above.
- [ ] **Step 2: Edit `Shell.tsx`**: replace the `fullBleed` line with `const FULL_BLEED_STEPS: DesignStep[] = ['planning', 'ride']` (module level, importing `DesignStep` from `../sim/types`) and `const fullBleed = showDesignUI && FULL_BLEED_STEPS.includes(designStep)`. **Edit `DesignScreen.tsx`**: add `'ride'` to `STEPS_WITHOUT_DIAGRAM`.
- [ ] **Step 3: Run** `pnpm typecheck && pnpm test && pnpm lint && pnpm build`. Expected: all pass; the smoke test's `design step ride` and `the ride and comms screens show real numbers` pass on the plain path.
- [ ] **Step 4: Check by hand** with the dev server at 1280 × 720 (`.claude/launch.json` has `moonshot-dev` on port 5193): open the Launch Site, go to Ride & Transfer and confirm:
  - each board row selects its ride: rocket, drop-off, path, tank and launch flag change; before any click the GTO row already reads plan cost $27.5M in red and `ARRIVES TURN 27`;
  - each sign selects its transfer; with the default (ion) craft the direct sign is dimmed and does nothing;
  - default craft: `CAUTION`, tank capture 1,000 / hold 60 / spare 1,568, 11 dots, arrive turn 19;
  - GTO: spiral, `CLIMB OUT 1,500`, `TOO EARLY`, `NO GO`, 21 turns in transit;
  - a chemical craft (set `prop-chemical` in the Factory, halo orbit) on Lunar + direct: `FLIES PAST`, `SHORT BY`, red beacon;
  - no labels overlap in any of these states; the overlay numbers equal the Go / No-Go step's bars;
  - Tab reaches the hidden cards and focus highlights the row or sign; Back and Next work; "← Agency base" works;
  - with reduced motion: no sway, no pulsing, no travelling dot;
  - with WebGL disabled (browser flag or temporarily `return false` in a local copy of the check, not committed): the plain cards appear.
- [ ] **Step 5: Save two screenshots** to `docs/superpowers/specs/assets/2026-11-14-launch-pad-built.jpg` and `-built-nogo.jpg`, and set the spec's status line to implemented.
- [ ] **Step 6: Commit** `feat(ride): launch pad screen for the Ride & Transfer step`.

---

### Task 6: pull request

- [ ] **Step 1:** `git fetch origin && git rebase origin/main`; if `Shell.tsx` or `DesignScreen.tsx` conflict, keep every entry of both lists. Re-run `pnpm typecheck && pnpm test && pnpm lint && pnpm build`.
- [ ] **Step 2:** `git push -u origin claude/ride-transfer-visual`, then open the PR against `main` with `GH_TOKEN=$(gh auth token --user jakobnunnendorf) gh pr create …` (the default gh account cannot see the repo). The body lists what the scene shows, the three shared-line edits, the border with the Orbit step and the hand checks done.
- [ ] **Step 3:** Send the PR link to the `Integration` session. Do not merge.
