# Mission Control Planning Step Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the slider form of design step 1 (Mission Planning) with a 3D mission control room whose console knob and fader drive the planning choices and whose big screen shows budget, road to launch and flight risk.

**Architecture:** Three pure modules (`planningView`, `controlMath`, `screenPainter`) turn the game's own `Budgets` and Go/No-Go checks into everything drawn; a react-three-fiber scene renders the room and paints the big screen onto a canvas texture; `PlanningScreen` keeps a plain HTML block (keyboard, tests, fallback) and mounts the scene behind an error boundary.

**Tech Stack:** React 19, TypeScript, three 0.187, @react-three/fiber 9, Zustand, Vitest (node environment).

**Spec:** `docs/superpowers/specs/2026-11-14-mission-control-planning-design.md` (visual reference: `docs/superpowers/specs/assets/2026-11-14-mission-control-mockup.html`).

## Global Constraints

- No new dependencies; no external models, textures or fonts.
- No change to game rules, constants, scoring or store shape. Controls write `design.planning.testTurns` (0–3) and `design.planning.reservePercent` (0, 5, 10, 15, 20) through `updateDesign`.
- One source of truth: every number comes from `computeBudgets` / `goNoGo` via the store.
- Room wording says "months"; money is written `$2.5M`.
- No big-screen text smaller than 12 CSS px in a 1280 × 720 window.
- `prefers-reduced-motion`: no sway, no pulsing, values change at once.
- Existing suite (incl. `src/ui/screens.smoke.test.tsx`) passes unchanged.

## Review Focus

- A design with no ride, or `transferTurns` null: `rideTurn` falls back, `operationsCost` may be 0; view must not produce NaN or negative block heights (test in Task 1).
- Costs above the cap: tank must clip to its height and show the overflow, never draw outside the panel (Task 1 + Task 3 test).
- `buildTurns` larger than 6 or ready turn beyond 10: meter pins at 6, timeline extends its month count (Task 1 test).
- WebGL unavailable or the scene throws: plain block appears and the step stays usable (Task 5, checked by hand).
- Keyboard-only player: range inputs stay in tab order while the room runs (Task 5, checked by hand).

---

### Task 1: `planningView` (pure)

**Files:**
- Create: `src/viz/planning/planningView.ts`
- Test: `src/viz/planning/planningView.test.ts`

**Interfaces:**
- Produces:
  ```ts
  type StatusLevel = 'nominal' | 'caution' | 'alert'
  interface CostBlock { key: 'parts'|'team'|'ride'|'testing'|'flight'|'other'; label: string; amount: number }
  interface TimelineBlock { key: 'design'|'build'|'test'|'fit'; label: string; start: number; length: number } // months, start 0-based
  interface PlanningView {
    cap: number; reserve: number; spendable: number; totalCost: number
    costBlocks: CostBlock[]           // amounts sum to totalCost, none negative
    budgetState: 'free' | 'eating' | 'over'; budgetGap: number // free: spendable-total; eating: total-spendable; over: total-cap
    timeline: TimelineBlock[]; readyMonth: number; rideMonth: number; marginMonths: number
    monthCount: number                // max(10, rideMonth, readyMonth + 1)
    headline: string                  // '2 MONTHS SPARE' | 'NO SPARE TIME' | 'MISSED BY 1 MONTH'
    nextRideMonth: number             // rideMonth + missedRideWaitTurns
    testTurns: number; testCost: number; riskFactor: number; riskCaption: string
    buildTurns: number; meterValue: number // meterValue = min(buildTurns, 6), at least 1
    reservePercent: number
    status: { level: StatusLevel; chip: string }
    readouts: { test: string; build: string; reserve: string } // '2 MONTHS · $0.8M', '3 MO · SET BY YOUR PARTS', '10% · $2.5M LOCKED'
  }
  function buildPlanningView(design: Design, budgets: Budgets, checks: CheckResult[]): PlanningView
  ```

- [ ] **Step 1: Write failing tests** using `flashlightDesign` / `createDefaultDesign()` with `computeBudgets` and `goNoGo`:
  - `costBlocks` amounts sum to `budgets.totalCost` within 1e-9; no negative amount; an `other` block appears only when the named parts differ from `totalCost` by more than 0.005.
  - `spendable === budgets.spendable`, `reserve === budgets.reserveAmount`.
  - `timeline` ends at `budgets.readyTurn` (last block start+length); a `test` block is absent when `testTurns` is 0.
  - margin 2 → `'2 MONTHS SPARE'`; 1 → `'1 MONTH SPARE'`; 0 → `'NO SPARE TIME'`; −1 → `'MISSED BY 1 MONTH'` (drive via a faked budgets object with `readyTurn`/`rideTurn` overridden).
  - risk captions for testFactor 2.0, 1.4 → 'failures in flight more likely', 1.0 → 'normal odds of failure in flight', 0.7 → 'failures in flight less likely'.
  - status table: Time red → alert `RIDE MISSED`; Budget red (Time not red) → alert `OVER BUDGET`; testTurns 0 → caution `CAUTION: UNTESTED`; reserve 0 → `CAUTION: NO RESERVE`; Time yellow → `CAUTION: NO SPARE TIME`; Budget yellow → `CAUTION: EATING THE RESERVE`; else nominal `ALL NOMINAL`. Red checks with other resources (e.g. `Mass`) do not raise the level.
  - `buildTurns` 9 → `meterValue` 6, readout `'9 MO · SET BY YOUR PARTS'`; `readyTurn` 12 → `monthCount` 13.
  - nothing in the view is NaN when `operationsCost` is 0 and `transferTurns` is null.
- [ ] **Step 2:** `pnpm vitest run src/viz/planning/planningView.test.ts` → FAIL (module missing).
- [ ] **Step 3:** Implement. Block amounts: parts `partsCost`, team `modelConstants.teamCostPrelaunch * rideTurn`, ride `rideCost`, testing `modelConstants.testCost * testTurns`, flight `operationsCost`; `other` = `totalCost` − sum when |diff| > 0.005 (clamped at 0; if negative, scale nothing, just drop). Timeline: design `modelConstants.designTurns`, build `buildTurns`, test `testTurns`, fit `modelConstants.integrationTurns`.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(planning): pure view model for the control room`.

### Task 2: `controlMath` (pure)

**Files:**
- Create: `src/viz/planning/controlMath.ts`; Test: `src/viz/planning/controlMath.test.ts`

**Interfaces:**
- Produces:
  ```ts
  const KNOB_VALUES = [0, 1, 2, 3]; const FADER_VALUES = [0, 5, 10, 15, 20]
  function knobAngle(value: number): number          // radians about the knob's up axis; 0 → +60°, each step −40°
  function knobValueFromPoint(dx: number, dz: number): number | null // panel-local offset from knob centre; null within 0.06 of centre
  function faderX(value: number, x0: number, x1: number): number
  function faderValueFromX(x: number, x0: number, x1: number): number // snaps, clamps to 0..20
  function stepValue(values: readonly number[], current: number, dir: 1 | -1): number // clamps at ends
  ```
- [ ] **Step 1: Tests:** for each knob value v, the point at `knobAngle(v)` (dx = −sin a · 0.3, dz = −cos a · 0.3) maps back to v; points beyond the arc clamp to 0 and 3; centre returns null. `faderValueFromX` returns 0 at x0−1, 20 at x1+1, 10 at the middle, snaps 0.49 of a step down and 0.51 up. `stepValue` clamps.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement (formulas as in the mockup: `deg = atan2(-dx, -dz)`, value `round((60 − deg)/40)`). **Step 4:** run → PASS. **Step 5:** commit `feat(planning): control snapping math`.

### Task 3: `screenPainter` (pure canvas 2D)

**Files:**
- Create: `src/viz/planning/screenPainter.ts`; Test: `src/viz/planning/screenPainter.test.ts`

**Interfaces:**
- Consumes: `PlanningView` (Task 1).
- Produces:
  ```ts
  const SCREEN_W = 2400; const SCREEN_H = 700
  interface ScreenAnim { time: number; test: number; reserve: number; build: number; risk: number; launchT: number; reducedMotion: boolean } // eased values
  function paintScreen(ctx: CanvasRenderingContext2D, view: PlanningView, anim: ScreenAnim): void
  ```
- [ ] **Step 1: Test** with a recording fake context (a `Proxy` whose methods record numeric args and whose `measureText` returns `{ width: text.length * 12 }`, `createPattern` returns `{}`): painting nominal, caution, missed (ready 10, ride 8) and over-cap views never throws and never records a non-finite number; with costs over cap no `fillRect` y is below 0 or above 700.
- [ ] **Step 2:** run → FAIL. **Step 3:** port the mockup's `drawScreen` (header chip, tank, road to launch, risk gauge) reading only from `view` and `anim`; tank clamps total height to the cap and paints the over-cap part red at the top; eating-reserve overlap amber; month count from `view.monthCount`; minimum font 26 px on the 2400-wide canvas (≈13 CSS px at 1280 wide). Patterns created lazily from `document` only when `typeof document !== 'undefined'`, otherwise solid fills. **Step 4:** PASS. **Step 5:** commit `feat(planning): big screen painter`.

### Task 4: Control room scene

**Files:**
- Create: `src/scene/ControlRoom.tsx` (room, rows, screen, console, lights, camera), `src/scene/controlRoomConsole.ts` (console canvas painter for panel labels/readouts — pure, takes ctx + view)

**Interfaces:**
- Consumes: Tasks 1–3; store `design`, `updateDesign`, `getBudgets`, `getGoNoGo`.
- Produces: `export function ControlRoom({ focus }: { focus: 'test' | 'reserve' | null }): JSX.Element` — a full-size `<Canvas>`; throws nothing on its own; calls `onError` via boundary when WebGL fails.

- [ ] **Step 1:** Build the scene following the mockup geometry: tiers, strips, two desk rows (instanced/shared geometry and materials), beacons, big screen plane with `CanvasTexture` from `paintScreen`, console panel with `CanvasTexture` from the console painter, knob group, fader cap, LEDs, step lamps. Pointer: `onPointerDown` on knob/fader hit meshes sets drag and captures; `onPointerMove` on the panel plane maps local point via `controlMath`; wheel steps. Camera fixed at seat, sway from pointer (disabled while dragging and under reduced motion); fov fitted so the screen's full width shows (`fov = aspect < 1.5 ? 72 : 60`). Lighting reacts to `view.status.level`. Repaint the screen texture only while eased values differ from targets, the alarm blinks or the rocket animates. `frameloop="always"` with `dpr={[1, 2]}`, no shadows. Focus prop pulses an outline around the matching control.
- [ ] **Step 2:** `pnpm typecheck` → no errors. Commit `feat(planning): 3D mission control room`.

### Task 5: Wire into the step and shell

**Files:**
- Modify: `src/ui/steps/PlanningScreen.tsx`, `src/ui/Shell.tsx`, `src/ui/screens/DesignScreen.tsx`

- [ ] **Step 1:** `PlanningScreen`: render `PlanningControls` (plain block: title, labelled range inputs `aria-label="Test time in months"` / `"Budget reserve in percent"`, build time text, timeline summary sentence). When `canUse3D` (client-side, WebGL context obtainable, set in `useEffect`) and no error: a full-height relative container with `ControlRoom` behind an error boundary, the plain block wrapped in `sr-only` (still focusable; focus/blur set `focus`), and Back / Select Instruments buttons absolutely positioned bottom-left/right. Otherwise the plain block is shown normally with the buttons (today's layout). Server render (smoke test) takes the plain path.
- [ ] **Step 2:** `Shell`: when `screen === 'design' && designStep === 'planning'`, hide `Dashboard` and render `main` with `p-0 overflow-hidden`. `DesignScreen`: skip `DesignDiagramPanel` on `planning`.
- [ ] **Step 3:** `pnpm test && pnpm typecheck && pnpm lint` → all pass. Commit `feat(planning): mount control room in the Planning step`.

### Task 6: Verify in the browser

- [ ] `pnpm dev`, open the Planning step at 1440 × 810 and 1280 × 720: drag and click knob and fader, scroll over them, Tab to the range inputs and use arrow keys; compare the tank's total, reserve and spendable with the Go/No-Go step's Budget reason; force missed ride (3 test months with a slow build) and check red room + rocket; check `prefers-reduced-motion`; check the fallback by forcing `canUse3D` false. Screenshot for the PR.
