# Map–Game Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the agency map the menu for every Lunar Ice Mapper decision and the place where the flight plays out, with all numbers from the logic core, plus the approved core fix for ice instruments flown above their altitude limit.

**Architecture:** A pure module `src/viz/missionMap.ts` turns core output (`computeBudgets`, `goNoGo`, `SimState`) into what the base shows: building labels, the suggested next building, the mission card and feed entries. The game store gains building navigation and step tracking; the agency store gains a mission clock driven by turns. The base screen wires clicks, labels, an event card and turn controls; the existing step screens open full page, unchanged.

**Tech Stack:** Vite, React 19, TypeScript, Zustand, react-three-fiber, Vitest. Commands run from the repo root with pnpm.

**Spec:** `docs/superpowers/specs/2026-11-14-map-game-bridge-design.md`

## Global Constraints

- All mission numbers come from `src/sim` (`computeBudgets`, `goNoGo`, flight state). No mission maths in base or map code.
- Building → steps, exactly: `comms-center` → `planning`, `comms`, `go-nogo` (and `brief`); `research-lab` → `instruments`; `factory` → `spacecraft`; `launch-site` → `orbit`, `ride`.
- Free order: any building opens at any time; the building holding the suggested next step is highlighted.
- One clock after launch: base day = mission start day + turn × 30.
- Do not edit files owned by the parallel Interfaces sessions: `src/ui/steps/PlanningScreen.tsx`, `src/ui/steps/InstrumentsScreen.tsx`, `src/ui/screens/DesignScreen.tsx`, `src/ui/Shell.tsx`, `src/scene/ControlRoom.tsx`, `src/scene/InstrumentStageSpike.tsx`, `src/viz/planning/*`.
- Out of scope: agency economy, publicity, building levels or unlocks.
- Every task ends with `pnpm typecheck && pnpm test && pnpm lint` passing.

## Review Focus

1. A reload in the middle of a flight: the flight state is not saved, so the base must fall back to "planning" and the clock must run again, not freeze on a stale mission start. Test in Task 4.
2. "+ New mission" after a finished or abandoned mission: visited steps, the mission start day and the event card reset. Tests in Tasks 3 and 4.
3. A No-Go design (no way to capture): Launch Site label says so in words, never `NaN` or `null`. Test in Task 2.
4. An event card waiting while the player leaves the base and comes back: the same card is still shown and no turn passes. Test in Task 6.
5. Agency state saved by the previous version (persist version 1, without the new fields): loads without crashing, new fields default to `null`. Test in Task 4.

---

### Task 1: Core fix: no ice mapping above an instrument's altitude limit

**Files:**
- Modify: `src/sim/budgets.ts` (quality per instrument, in `computeBudgets`)
- Modify: `src/sim/evaluate.ts` (the "Too high" cause in `whyCoverageShort`)
- Test: `src/sim/model.test.ts`

**Interfaces:**
- Produces: `Budgets.quality[id] === 0` when the orbit's `altitude` is above the instrument's `maxAltitudeKm` (null = any altitude). Pointing still multiplies quality below the limit.

- [ ] **Step 1: Write the failing tests** in `model.test.ts`, `describe('instruments and orbits shape the science')`:

```ts
it('an ice instrument above its altitude limit maps nothing', () => {
  const laser100 = { ...flashlightDesign, orbit: 'orbit-100km' }
  const b = computeBudgets(laser100, 'engineer')
  expect(b.quality['inst-laser']).toBe(0)
  expect(b.coverageRate['inst-laser']).toBe(0)
  expect(b.projectedCoverage).toBe(0)
})

it('the IR spectrometer has no altitude limit', () => {
  const b = computeBudgets({ ...iceCubeDesign, orbit: 'orbit-100km' }, 'engineer')
  expect(b.quality['inst-ir-spec']).toBe(1)
})
```

- [ ] **Step 2: Run** `pnpm vitest run src/sim/model.test.ts`. Expected: the first test FAILS (quality ≈ 0.02, projectedCoverage ≈ 89).

- [ ] **Step 3: Implement.** In `computeBudgets`, quality = `0` when `limit !== null && altitude > limit`, else `1`, then times `qualityWithoutPrecisePointing` without precise pointing. In `whyCoverageShort`, the altitude cause reads: `Too high: the ${noun} only works below ${limit} km and this orbit passes the pole at ${altitude} km, so it maps nothing there.`

- [ ] **Step 4: Run** `pnpm test`. Expected: all pass (the reference designs fly at 15 km, so their numbers are unchanged).

- [ ] **Step 5: Commit** `fix(sim): ice instruments map nothing above their altitude limit`.

### Task 2: Mission map view (pure)

**Files:**
- Create: `src/viz/missionMap.ts`
- Test: `src/viz/missionMap.test.ts`

**Interfaces:**
- Consumes: `computeBudgets`, `goNoGo`, `Budgets`, `GoNoGoResult`, `SimState`, `Design`, `DesignStep` (src/sim); `BuildingId`, `MissionView`, `AgencyEvent` (src/data/agency.ts); `BuildingLabel` (src/scene/BaseMap.tsx).
- Produces:
  - `BUILDING_STEPS: Record<BuildingId, DesignStep[]>` (Global Constraints mapping; `comms-center` = `['brief', 'planning', 'comms', 'go-nogo']`).
  - `buildingForStep(step: DesignStep): BuildingId`
  - `buildingName(id: BuildingId): string` (from `buildings` in agency.ts).
  - `STEP_ORDER: DesignStep[]` = `['brief', 'planning', 'instruments', 'spacecraft', 'orbit', 'ride', 'comms', 'go-nogo']`.
  - `suggestedStep(visited: DesignStep[]): DesignStep`: first step in `STEP_ORDER` not in `visited`; `'go-nogo'` when all are visited.
  - `missionLabels(input: { design: Design; budgets: Budgets; checks: GoNoGoResult; visited: DesignStep[]; sim: SimState | null }): Record<BuildingId, BuildingLabel>`
  - `fixLocation(step: DesignStep): string`, e.g. `'the Factory (Spacecraft)'`.

Label rules (status text is free wording, but must contain these numbers):
- `factory`: `"{totalMass} / {massLimit} kg · {totalVolume} / {volumeLimit} U"` (one decimal).
- `research-lab`: instrument names, then `"ice {projectedCoverage}% projected"` (no decimals).
- `launch-site`: `"ride on turn {rideTurn} · arrive turn {arrivalTurn}"`, or `"no way into this orbit"` when `captureDeltaV === null`.
- `comms-center`: `"{downlinkPerTurn} MB/turn home · Go"`, `"· Go with N warnings"` or `"· No-Go"`.
- `alert: true` when a red check's `fixStep` is one of the building's steps; `highlight: true` when it holds `suggestedStep(visited)`. With a flight running (`sim` not null), labels describe the flight instead (`factory`: phase while building; `launch-site`: "launched turn N" or "transfer, N turns left"; `comms-center`: "{data} MB home"; `research-lab`: "ice {coverage}% mapped"), and nothing is highlighted.

- [ ] **Step 1: Write the failing tests:**

```ts
import { createDefaultDesign, computeBudgets } from '../sim/budgets'
import { goNoGo } from '../sim/checks'
import { flashlightDesign } from '../sim/fixtures'

const labelsFor = (design = flashlightDesign, visited: DesignStep[] = []) => {
  const budgets = computeBudgets(design, 'engineer')
  return missionLabels({ design, budgets, checks: goNoGo(design, budgets), visited, sim: null })
}

it('maps every design step to one building', () => {
  for (const step of STEP_ORDER) expect(BUILDING_STEPS[buildingForStep(step)]).toContain(step)
  expect(buildingForStep('spacecraft')).toBe('factory')
  expect(buildingForStep('ride')).toBe('launch-site')
})

it('suggests the next unvisited step in order', () => {
  expect(suggestedStep([])).toBe('brief')
  expect(suggestedStep(['brief', 'planning'])).toBe('instruments')
  expect(suggestedStep(STEP_ORDER)).toBe('go-nogo')
})

it('labels show core numbers', () => {
  const l = labelsFor()
  expect(l.factory.status).toContain('14.0 / 14 kg')
  expect(l['research-lab'].status).toContain('74%')
  expect(l['launch-site'].status).toContain('turn 8')
})

it('marks the building that fixes a red bar and highlights the suggested one', () => {
  const uhf = { ...flashlightDesign, radio: 'radio-uhf' }
  expect(labelsFor(uhf)['comms-center'].alert).toBe(true)
  expect(labelsFor(flashlightDesign, ['brief', 'planning'])['research-lab'].highlight).toBe(true)
})

it('says in words when there is no way into the orbit', () => {
  const noWay = { ...flashlightDesign, orbit: 'orbit-elliptical' } // chemical cannot capture there
  const status = labelsFor(noWay)['launch-site'].status
  expect(status).toContain('no way')
  expect(status).not.toMatch(/NaN|null|undefined/)
})
```

- [ ] **Step 2: Run** `pnpm vitest run src/viz/missionMap.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** `src/viz/missionMap.ts`. Extend `BuildingLabel` in `src/scene/BaseMap.tsx` with `alert?: boolean` (no rendering change yet; Task 5 renders it).
- [ ] **Step 4: Run** the tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat(viz): mission map view: building labels from the core`.

### Task 3: Building navigation in the game store

**Files:**
- Modify: `src/state/gameStore.ts`
- Test: `src/state/gameStore.test.ts`

**Interfaces:**
- Consumes: `BUILDING_STEPS`, `suggestedStep` (Task 2).
- Produces on `GameState`:
  - `visitedSteps: DesignStep[]`: `setDesignStep(step)` adds `step`; `startNewMission()` and `newGame()` reset it to `[]`.
  - `openBuilding(id: BuildingId): void`: sets `screen: 'design'` and `designStep` to the building's step that equals `suggestedStep(visitedSteps)` if it has it, else the building's first step not visited, else its first step; adds that step to `visitedSteps`.
  - `startSimulation()` now ends on `screen: 'base'` (was `'simulation'`), and calls `useAgencyStore.getState().startMissionClock()` (Task 4).
- `visitedSteps` is added to `partialize`, like `designStep`.

- [ ] **Step 1: Write the failing tests:**

```ts
it('opens the step of a building and remembers it', () => {
  const s = useGameStore.getState()
  s.startNewMission()
  s.openBuilding('factory')
  expect(useGameStore.getState().screen).toBe('design')
  expect(useGameStore.getState().designStep).toBe('spacecraft')
  expect(useGameStore.getState().visitedSteps).toContain('spacecraft')
})

it('opens the suggested step when the building holds it', () => {
  const s = useGameStore.getState()
  s.startNewMission()
  s.openBuilding('comms-center')
  expect(useGameStore.getState().designStep).toBe('brief')
  s.openBuilding('comms-center')
  expect(useGameStore.getState().designStep).toBe('planning')
})

it('a new mission forgets the visited steps', () => {
  useGameStore.getState().openBuilding('factory')
  useGameStore.getState().startNewMission()
  expect(useGameStore.getState().visitedSteps).toEqual([])
})

it('launching returns to the base', () => {
  useGameStore.getState().startSimulation()
  expect(useGameStore.getState().screen).toBe('base')
  expect(useGameStore.getState().simState).not.toBeNull()
})
```

- [ ] **Step 2: Run** `pnpm vitest run src/state/gameStore.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** in `gameStore.ts`. The step screens' own "Next →" buttons stay as they are.
- [ ] **Step 4: Run** the tests. Expected: PASS (the existing store tests too).
- [ ] **Step 5: Commit** `feat(state): open steps from buildings, launch back to the base`.

### Task 4: One clock: the base day follows the mission turns

**Files:**
- Modify: `src/state/agencyStore.ts`
- Modify: `src/data/agency.ts` (remove the hard-coded `lim-integration` and `lim-ride` events and the `LUNAR_RIDE_DAY` export)
- Test: `src/state/agencyStore.test.ts` (create)

**Interfaces:**
- Produces on `AgencyState`:
  - `missionStartDay: number | null`: day the flight started (set once by `startMissionClock()` to `Math.floor(day)`; cleared by `resetMissionClock()`).
  - `startMissionClock(): void`, `resetMissionClock(): void`.
  - `syncToMissionTurn(turn: number): void`: when `missionStartDay !== null`, advances (never rewinds) the clock with `advanceAgency(state, missionStartDay + turn * 30)`.
  - `tick(seconds)` does nothing while `missionStartDay !== null`.
  - Exported pure `missionDay(startDay: number, turn: number): number` = `startDay + turn * 30`.
- Persist: `version: 2` with a `migrate` that adds `missionStartDay: null` to version 1 state.
- `startNewMission` in the game store calls `resetMissionClock()`; when the base screen sees `missionStartDay !== null` but no `simState` (a reload), it calls `resetMissionClock()` (Task 6 wires this).

- [ ] **Step 1: Write the failing tests:**

```ts
it('maps turns to days', () => {
  expect(missionDay(112, 0)).toBe(112)
  expect(missionDay(112, 8)).toBe(352)
})

it('follows the turns once the mission clock runs, and stops ticking by itself', () => {
  const a = useAgencyStore.getState()
  a.resetAgency()
  a.startMissionClock()
  a.tick(5)
  expect(useAgencyStore.getState().day).toBe(112)
  a.syncToMissionTurn(3)
  expect(useAgencyStore.getState().day).toBe(202)
  a.syncToMissionTurn(2) // never rewinds
  expect(useAgencyStore.getState().day).toBe(202)
})

it('runs freely again after the mission clock is reset', () => {
  const a = useAgencyStore.getState()
  a.startMissionClock()
  a.resetMissionClock()
  a.setSpeed('normal')
  const before = useAgencyStore.getState().day
  a.tick(1)
  expect(useAgencyStore.getState().day).toBeGreaterThan(before)
})

it('loads state saved by version 1', () => {
  // call the persist options' migrate directly
  const migrated = useAgencyStore.persist.getOptions().migrate!({ day: 130, funds: 18, support: 70 }, 1) as AgencyState
  expect(migrated.missionStartDay).toBeNull()
})
```

- [ ] **Step 2: Run** `pnpm vitest run src/state/agencyStore.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement**; remove the two mission events and `LUNAR_RIDE_DAY` from `agency.ts` and fix their imports (BaseScreen gets its ride day from the core in Task 6).
- [ ] **Step 4: Run** `pnpm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(state): base clock follows mission turns once the flight starts`.

### Task 5: Clickable buildings

**Files:**
- Modify: `src/scene/BaseMap.tsx`

**Interfaces:**
- Produces: `BaseMapProps.onBuildingClick?: (id: BuildingId) => void`. Both the label and the building model are clickable (`pointer-events-auto cursor-pointer` on the label; `onClick` and pointer cursor on the model group). `label.alert` draws a red border (wins over `highlight`); `highlight` keeps the orange border and gets a soft pulse (`animate-pulse` on a ring, not on the text).

- [ ] **Step 1: Implement** (pure view, no logic; verified in Task 6's render test and by hand).
- [ ] **Step 2: Run** `pnpm typecheck && pnpm lint`. Expected: clean.
- [ ] **Step 3: Commit** `feat(scene): buildings and labels are clickable`.

### Task 6: The base screen drives the mission

**Files:**
- Create: `src/ui/flight/EventCard.tsx`, `src/ui/flight/FlightControls.tsx` (moved out of `src/App.tsx`, which then imports them)
- Modify: `src/ui/screens/BaseScreen.tsx`
- Modify: `src/viz/missionMap.ts` (add the two functions below)
- Test: `src/viz/missionMap.test.ts`, `src/ui/screens.smoke.test.tsx`

**Interfaces:**
- Consumes: Tasks 2 to 5.
- Produces in `missionMap.ts`:
  - `lunarMissionView(input: { design: Design; budgets: Budgets; visited: DesignStep[]; sim: SimState | null }): MissionView`. Progress from the core: planning = visited / 8; building = `currentTurn / readyTurn`; transfer = turns since launch / `transferTurns`; in orbit = `turnsInOrbit / 12`; detail names the building to visit or the flight phase.
  - `flightFeed(logs: TurnLog[], startDay: number): AgencyEvent[]`: one entry per turn that has events or a milestone note (launch, capture, mission end), `day = missionDay(startDay, log.turn)`, tone `bad` for a failed end, `warning` for events, `good` for capture and success, `info` otherwise.
- `EventCard` and `FlightControls` take no props; they read `simState`, `answerEvent`, `advanceTurn`, `flyOn`, `showReport` from the game store.

BaseScreen wiring:
- `BaseMap labels={missionLabels(...)} onBuildingClick={openBuilding}` once `lunarMissionStartedDay !== null`; before that the map shows today's mock labels and a click starts the mission (`markLunarMissionStarted` + `startNewMission`) and opens the building.
- While `simState` exists: `FlightControls` overlays the bottom of the map, `EventCard` overlays its centre when `pendingDecision` is set, the Activity list shows `flightFeed(...)` before the mock events, and an effect calls `syncToMissionTurn(simState.currentTurn)`.
- If `missionStartDay !== null && !simState`, call `resetMissionClock()` once.
- The mission card opens the report when finished, else nothing (the map is the menu).
- `GoNoGoScreen` is not edited; its "Launch Mission" lands on the base through Task 3.

- [ ] **Step 1: Write the failing tests:** in `missionMap.test.ts`:

```ts
it('builds the feed from the flight log on the base calendar', () => {
  const sim = runSimulation(flashlightDesign, 'engineer', 1)
  const feed = flightFeed(sim.turnLogs, 112)
  const launch = feed.find((e) => e.title.startsWith('Launched'))!
  expect(launch.day).toBe(112 + sim.flight.launchedTurn! * 30)
  expect(feed.every((e) => Number.isFinite(e.day))).toBe(true)
})

it('mission card progress comes from the flight', () => {
  const sim = runSimulation(flashlightDesign, 'engineer', 1)
  const view = lunarMissionView({ design: flashlightDesign, budgets: computeBudgets(flashlightDesign, 'engineer'), visited: [], sim })
  expect(view.status).toBe('complete')
  expect(view.progress).toBe(1)
})
```

In `screens.smoke.test.tsx` (mock `../scene/BaseMap` to a stub that renders the labels' `status` text, so no WebGL is needed):

```ts
it('base screen shows a waiting event card and keeps it after leaving and coming back', () => {
  // find a seed with a pending decision as the existing test does, then:
  useGameStore.setState({ screen: 'base', simState: s, design: flashlightDesign })
  useAgencyStore.getState().markLunarMissionStarted()
  const html = renderToString(<App />)
  expect(html).toContain(s.pendingDecision!.title)
  useGameStore.getState().setScreen('design')
  useGameStore.getState().setScreen('base')
  expect(useGameStore.getState().simState!.currentTurn).toBe(s.currentTurn)
  expect(renderToString(<App />)).toContain(s.pendingDecision!.title)
})

it('base screen labels show core numbers while designing', () => {
  useAgencyStore.getState().markLunarMissionStarted()
  useGameStore.setState({ screen: 'base', simState: null, design: flashlightDesign })
  expect(renderToString(<App />)).toContain('14.0 / 14 kg')
})
```

- [ ] **Step 2: Run** `pnpm vitest run src/viz src/ui`. Expected: FAIL.
- [ ] **Step 3: Implement** the two functions, move `EventCard` and the flight buttons out of `App.tsx` into `src/ui/flight/`, and wire `BaseScreen` as listed.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm test && pnpm lint && pnpm build`. Expected: all pass.
- [ ] **Step 5: Commit** `feat(base): the map is the mission menu and the flight plays on it`.

### Task 7: Go / No-Go hints name the building

**Files:**
- Modify: `src/ui/steps/GoNoGoScreen.tsx` (the `Fix in step` line only)
- Modify: `src/ui/Dashboard.tsx` (blocker lines)

**Interfaces:**
- Consumes: `fixLocation(step)` (Task 2).

- [ ] **Step 1: Implement:** `Fix at ${fixLocation(check.fixStep)}` in the check row; the dashboard's blocker line ends with `(fix at ${fixLocation(b.fixStep)})` when a fix step is set.
- [ ] **Step 2: Run** `pnpm typecheck && pnpm test && pnpm lint`. Expected: pass.
- [ ] **Step 3: Commit** `feat(ui): Go / No-Go fixes point to the building`.

### Task 8: Verify in the browser and hand over

- [ ] **Step 1:** `pnpm dev --port 5176 --host 127.0.0.1 --strictPort`; open `http://127.0.0.1:5176/`.
- [ ] **Step 2:** Walk it: title → base → click each building (right step opens, "← Agency base" returns, the clicked building's label updates) → Go / No-Go → Launch lands on the base → fly with the buttons until an event card, answer it → the day counter moves 30 days per turn → finish → mission card opens the report.
- [ ] **Step 3:** Push `map-game-bridge` and open a draft pull request into `main`, naming the parallel sessions' files as untouched.
