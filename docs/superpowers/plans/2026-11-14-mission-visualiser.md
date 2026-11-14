# Mission Visualiser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show players what each design step did to the spacecraft (live SVG diagram plus a before/after line) and let them replay every simulation turn in the 3D Earth-Moon scene with a scrubber.

**Architecture:** Pure, unit-tested derivations in `src/viz/*.ts` (design delta, CubeSat slot layout, replay pose) feed React/SVG components (design steps) and a controlled version of the existing three.js `MissionView` (replay). The store gains replay state, a previous-budgets snapshot and optional stored run data in history; sim rules do not change.

**Tech Stack:** Vite, React 19, TypeScript, Tailwind 4, react-three-fiber/drei/three, Zustand (persist), Vitest (node env, `src/**/*.test.ts` only), oxlint.

**Spec:** `docs/superpowers/specs/2026-11-14-mission-visualiser-design.md` (read the "Calls settled after the builder review" section too).

## Global Constraints

- No new dependencies; SVG is hand-written; three.js/drei already installed.
- No change to anything in `src/sim/simulate.ts`, `budgets.ts`, `checks.ts`, `evaluate.ts`, `src/data/*` (game rules and balance).
- Pure helpers have no React imports and live next to a `*.test.ts`; Vitest only picks up `src/**/*.test.ts`, so there are no component tests; components are checked in the browser (Task 7).
- `pnpm test`, `pnpm lint`, `pnpm typecheck` must pass after every task.
- Dark slate theme (Tailwind slate-900/950; blue, green, orange, purple accents); laptop width; no mobile target.
- Every visual element is backed by a number the player can read; the diagram must never disagree with `computeBudgets` / `TurnLog`.
- History keeps the last 20 runs; old entries without `run` must keep working and simply hide Replay.

## Review Focus

- A run with zero turn logs, or `turnIndex` out of range: clamp, never crash (Task 3).
- A failed-capture run: ship stays at its last pose with a failure marker, no NaN (Task 3).
- Unknown or missing ids in a design (bad imported code, `transfer.durationTurns` of 1): no NaN, no throw in the helpers (Tasks 1, 2, 3).
- Identical before/after budgets (re-selecting the same part): empty change list, no "+0" lines (Task 1).
- localStorage quota failure while saving history with run data: the game keeps working and the newest runs keep their data (Task 4).
- A bad imported design code crashing the diagram: the panel renders nothing instead of blanking the screen (Task 5).

---

### Task 1: `computeDesignDelta` (what this choice changed)

**Files:**
- Create: `src/viz/designDelta.ts`, `src/viz/designDelta.test.ts`, `src/viz/index.ts`
- Also commit: `docs/superpowers/specs/2026-11-14-mission-visualiser-design.md`, `docs/superpowers/plans/2026-11-14-mission-visualiser.md`, `.gitignore`

**Interfaces:**
- Consumes: `Budgets` from `src/sim/types.ts`; `computeBudgets`, `createDefaultDesign` from `src/sim/budgets.ts`.
- Produces:
  ```ts
  export interface DeltaLine { key: keyof Budgets; label: string; unit: string; before: number; after: number; diff: number; betterWhenHigher: boolean }
  export function computeDesignDelta(before: Budgets, after: Budgets): DeltaLine[]
  export function formatDelta(line: DeltaLine): string   // e.g. "Mass +1.2 kg"
  ```
  Tracked keys, in this order: `totalMass` (Mass, kg, lower is better), `totalVolume` (Volume, U, lower), `powerMargin` (Power margin, W, higher), `batteryMarginMinutes` (Eclipse margin, min, higher), `totalCost` (Cost, $M, lower), `deltaVMargin` (Delta-v margin, m/s, higher), `dataMarginPerTurn` (Data margin, GB/turn, higher), `timeMarginTurns` (Time margin, turns, higher). A key is included only when `Math.abs(after - before) > 1e-9`.

- [ ] **Step 1: Write failing tests** in `designDelta.test.ts`: (a) identical budgets (`computeBudgets(createDefaultDesign(), 'engineer')` twice) return `[]`; (b) a design with `solar: 'solar-body'` versus the default (`'solar-2wing'`) returns lines including `powerMargin` with `diff < 0` and none for keys that did not change (e.g. `totalCost` only if cost really differs; assert via comparing the two budgets' numbers, not hard-coded values); (c) `formatDelta` returns `"<label> <+|-><abs(diff) to 1 decimal> <unit>"` for every unit: `{label:'Mass',unit:'kg',diff:1.234}` gives `"Mass +1.2 kg"` and `{label:'Cost',unit:'$M',diff:-0.5}` gives `"Cost -0.5 $M"`.
- [ ] **Step 2: Run** `pnpm test src/viz/designDelta.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `computeDesignDelta` and `formatDelta` as specified; `src/viz/index.ts` re-exports.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** the files above (`feat(viz): design delta helper`).

### Task 2: `buildSlots` (CubeSat cutaway layout)

**Files:** Create `src/viz/cubesatSlots.ts`, `src/viz/cubesatSlots.test.ts`; modify `src/viz/index.ts`.

**Interfaces:**
- Consumes: `Design` from `src/sim/types.ts`; `getPartById`, `PartCategory` from `src/data/parts.ts`; `lunarIceMapperBrief` or the 6U limit as used by `computeBudgets` (read `volumeLimit` in `budgets.ts`; use that constant, do not hard-code 6).
- Produces:
  ```ts
  export interface Slot { category: PartCategory; partId: string; name: string; volume: number }
  export interface SlotLayout { slots: Slot[]; usedU: number; limitU: number; overLimit: boolean; solar: 'body' | 'deployable' | 'none' }
  export function buildSlots(design: Design): SlotLayout
  ```
  `slots` contains every selected part with `volume > 0` (instruments, battery, radio, computer, attitude, propulsion, plus solar when its volume > 0), in that category order; unknown ids are skipped. `solar` is `'body'` for `solar-body`, `'deployable'` for `solar-1wing`/`solar-2wing`, `'none'` for an unknown id. `usedU` is the sum of slot volumes; `overLimit` is `usedU > limitU`.

- [ ] **Step 1: Write failing tests:** default design gives `solar === 'deployable'`, `usedU` equal to `computeBudgets(...).totalVolume` (consistency with the dashboard), `overLimit === false`; `solar: 'solar-body'` gives `'body'`; `instruments: []` gives no `instrument` slots; a design with `propulsion: 'does-not-exist'` does not throw and omits that slot; a design filled with all four instruments plus large parts sets `overLimit` true only if `usedU > limitU` (compute expectation from the returned numbers).
- [ ] **Step 2: Run** `pnpm test src/viz/cubesatSlots.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `buildSlots`; barrel export.
- [ ] **Step 4: Run** the test. Expected: PASS.
- [ ] **Step 5: Commit** (`feat(viz): cubesat slot layout`).

### Task 3: `replayPose` (ship position per turn)

**Files:** Create `src/viz/replayPose.ts`, `src/viz/replayPose.test.ts`; modify `src/viz/index.ts`.

**Interfaces:**
- Consumes: `Design`, `TurnLog` from `src/sim/types.ts`; `getTransferById`, `getOrbitById`; `runSimulation`, `createDefaultDesign` for tests.
- Produces:
  ```ts
  export interface Pose {
    where: 'earth' | 'transfer' | 'orbit'
    transferProgress: number   // 0..1 along the Earth-Moon arc
    orbitAngle: number         // radians around the Moon, orbitTurns * (Math.PI / 6)
    orbitAltitudeKm: number    // from the design's orbit, 100 if unknown
    captured: boolean
    coveragePercent: number    // from logs[turnIndex].coveragePercent
    phase: TurnLog['phase']    // log.phase at that turn (phase at the START of that turn)
    terminal?: 'complete' | 'failed'  // only on the last log, when the run ended that way
  }
  export function replayPose(design: Design, logs: TurnLog[], turnIndex: number, terminal?: 'complete' | 'failed'): Pose
  ```
  Rules (from the spec): `turnIndex` is clamped to `[0, logs.length - 1]`; with no logs return the Earth pose with zeros. State is the end of turn `turnIndex` using `logs[0..turnIndex]`. `transferProgress = min(1, count(phase === 'transfer') / transfer.durationTurns)` (duration falls back to 1 when the transfer id is unknown). `captured` is true when any log in range has a note starting `Capture burn successful`, or has phase `orbit`. `where`: `'orbit'` if captured; else `'transfer'` if any transfer log in range; else `'earth'`. `orbitAngle` uses the count of `orbit`-phase logs in range. `terminal` is passed through only when `turnIndex` is the last log.

- [ ] **Step 1: Write failing tests** using `runSimulation(createDefaultDesign(), 'engineer', 1).turnLogs` (and a design that fails capture: `propulsion: 'prop-coldgas'`, `transfer: 'transfer-direct'`, `ride: 'ride-gto'`; if that combination does not fail, search seeds/parts until `runSimulation(...).phase === 'failed'` and use that, recording the chosen design in the test): index 0 is `where: 'earth'`; the first `transfer` log yields `where: 'transfer'` and `transferProgress` equal to `1 / durationTurns` capped at 1; a log at or after a successful capture gives `where: 'orbit'`, `captured: true`; orbit angle at the k-th orbit log equals `k * Math.PI / 6`; failed run last index with `terminal: 'failed'` has `captured: false` and finite numbers everywhere (`Number.isFinite`); `turnIndex` of `-5` and `9999` clamp without throwing; `logs: []` returns the Earth pose; unknown transfer id gives `transferProgress` in `[0, 1]`.
- [ ] **Step 2: Run** `pnpm test src/viz/replayPose.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `replayPose` per the rules.
- [ ] **Step 4: Run** the test. Expected: PASS.
- [ ] **Step 5: Commit** (`feat(viz): replay pose derivation`).

### Task 4: Store, history and flow changes

**Files:**
- Modify: `src/sim/types.ts` (add `RunRecord`, optional `run` on `RunHistoryEntry`), `src/state/gameStore.ts`
- Create: `src/state/safeStorage.ts`, `src/state/safeStorage.test.ts`, `src/state/gameStore.test.ts`

**Interfaces:**
- Consumes: `computeBudgets`, `buildReport`, `initSim`, `stepTurn`, existing store.
- Produces:
  ```ts
  // types.ts
  export interface RunRecord { seed: number; turnLogs: TurnLog[]; allEvents: TurnEvent[] }
  export interface RunHistoryEntry { id: string; report: Report; run?: RunRecord }
  // gameStore.ts: Screen gains 'replay'
  previousBudgets: Budgets | null          // budgets of the design before the last updateDesign; null when cleared
  replayTurn: number                       // selected turn index (0-based)
  replayEntryId: string | null             // null = replay the current simState
  setReplayTurn: (n: number) => void
  openReplay: (entryId?: string) => void   // sets replayEntryId, replayTurn = last turn index, screen = 'replay'
  showReport: () => void                   // setScreen('report')
  saveToHistory: (report: Report, run?: RunRecord) => void
  // safeStorage.ts
  export function createSafeStorage(base: Pick<Storage,'getItem'|'setItem'|'removeItem'>): StateStorage  // zustand StateStorage
  ```
  Behaviour: `updateDesign` sets `previousBudgets = computeBudgets(oldDesign, difficulty)`. `previousBudgets` and `replayTurn` reset (null / 0) on `setDesignStep`, `resetDesign`, `importDesignCode` (on success), `loadDesignFromHistory`, `newGame`. `advanceTurn`: when the new state is complete, build the report, call `saveToHistory(report, { seed, turnLogs, allEvents })`, set `currentReport`, set `replayTurn` to the last log index, and stay on `screen: 'simulation'` (do NOT switch to `'report'`). Each normal advance also sets `replayTurn` to the new last index. The persist config uses `storage: createJSONStorage(() => createSafeStorage(localStorage))` guarded so Node/test environments without `localStorage` fall back to an in-memory object. `createSafeStorage.setItem`: try the write; on throw, parse the value, delete `run` from the oldest entry in `state.runHistory` that still has one, re-stringify and retry until it succeeds or no `run` remains; if it still fails, swallow the error.

- [ ] **Step 1: Write failing tests.** `safeStorage.test.ts`: a fake storage whose `setItem` throws while the string is longer than a limit; assert that the oldest entry's `run` is dropped first, the newest keeps its `run`, and no exception escapes even when nothing can be dropped. `gameStore.test.ts` (use `useGameStore.getState()`; reset with `setState` between tests): (a) `updateDesign({solar:'solar-body'})` sets `previousBudgets` whose `powerMargin` equals the default design's; `setDesignStep('orbit')` clears it; (b) running `startSimulation()` then `advanceTurn()` until `isSimComplete` leaves `screen === 'simulation'`, sets `currentReport`, and `runHistory[0].run?.turnLogs.length === simState.turnLogs.length` and `run.seed === simState.seed`; (c) `showReport()` then `screen === 'report'`; (d) `openReplay(entryId)` with an entry lacking `run` leaves `screen` unchanged (guard) and `openReplay()` with a finished sim sets `screen === 'replay'` and `replayTurn === lastIndex`; (e) history cap stays 20 after 25 saves.
- [ ] **Step 2: Run** `pnpm test src/state`. Expected: FAIL.
- [ ] **Step 3: Implement** types, `safeStorage.ts`, and store changes as specified. Persisted `partialize` stays unchanged.
- [ ] **Step 4: Run** `pnpm test && pnpm typecheck && pnpm lint`. Expected: all pass (fix any consumers of `Screen` or `saveToHistory` the compiler flags).
- [ ] **Step 5: Commit** (`feat(state): replay state, run history, stay on simulation after final turn`).

### Task 5: Design-step diagram (A)

**Files:**
- Create: `src/viz/CubeSatDiagram.tsx`, `src/viz/MissionStrip.tsx`, `src/viz/DesignDiagramPanel.tsx`
- Modify: `src/ui/screens/DesignScreen.tsx` (mount the panel above the step screen), `src/ui/Dashboard.tsx` (flash changed bars)

**Interfaces:**
- Consumes: `buildSlots`, `computeDesignDelta`, `formatDelta`, `useGameStore` (`design`, `previousBudgets`, `designStep`, `getBudgets`, `getGoNoGo`), `CheckResult.fixStep`.
- Produces:
  ```ts
  CubeSatDiagram(props: { design: Design; failing?: boolean })      // 6U cutaway from buildSlots; solar folded vs unfolded; over-limit in red
  MissionStrip(props: { step: DesignStep; design: Design; failingSteps: DesignStep[] })  // Earth -> arc -> Moon + orbit ring; highlights per step
  DesignDiagramPanel(props: { step: DesignStep })                   // wraps both, shows delta lines, catches render errors
  ```
  Per-step highlighting: `planning` build/test/ride timeline label; `instruments`, `spacecraft` the craft; `orbit` the orbit ring drawn at a radius scaled from `orbit.altitude`; `ride` the transfer arc labelled with `transfer.durationTurns`; `comms` the downlink line to Earth; `brief` only the mission strip; `go-nogo` the whole craft and strip with each failing check's `fixStep` group marked red. Delta line list comes from `computeDesignDelta(previousBudgets, getBudgets())`, hidden when `previousBudgets` is null or the list is empty. `Dashboard` `ResourceBar` gains a transient highlight (Tailwind ring plus transition for about 800 ms) when its value differs from the matching key in `previousBudgets`. `DesignDiagramPanel` wraps its content in a small class error boundary that renders `null` on error.

- [ ] **Step 1: Implement** the three components and mount the panel in `DesignScreen` (panel above the step screen, compact height so the form stays visible at laptop width).
- [ ] **Step 2: Verify in the browser** (`pnpm dev`, http://localhost:5173): on each of the 8 steps the panel renders; on Spacecraft choosing `solar-body` then `solar-2wing` folds and unfolds the panel and shows a delta line with Power margin; choosing the same part again shows no delta; Go/No-Go with a deliberately failing design (all four instruments plus `battery-large`) marks the failing group red. Then call `useGameStore.getState().updateDesign({propulsion:'nope'} as never)` in the browser console (this is the same shape a hand-edited import code produces): the screen must not blank.
- [ ] **Step 3: Run** `pnpm test && pnpm typecheck && pnpm lint`. Expected: pass.
- [ ] **Step 4: Commit** (`feat(viz): design step diagram and change line`).

### Task 6: Replay UI (B) and screen flow

**Files:**
- Modify: `src/scene/MissionView.tsx` (controlled mode), `src/App.tsx` (simulation screen, report screen, history, `replay` screen)
- Create: `src/viz/ReplayPanel.tsx`, `src/viz/ReplayTimeline.tsx`, `src/viz/TurnDetail.tsx`

**Interfaces:**
- Consumes: `replayPose`, `Pose`, store (`simState`, `runHistory`, `replayTurn`, `replayEntryId`, `setReplayTurn`, `openReplay`, `showReport`, `currentReport`), `TurnLog`, `TurnEvent`, `events` from `src/data/events.ts` (names of events).
- Produces:
  ```ts
  MissionView(props: { design: Design; logs: TurnLog[]; turnIndex: number; terminal?: 'complete' | 'failed'; className?: string })  // controlled; no clock logic; tweens ship to the pose over ~0.6 s
  ReplayTimeline(props: { logs: TurnLog[]; turnIndex: number; onSelect: (i: number) => void; playing: boolean; onTogglePlay: () => void })
  TurnDetail(props: { log: TurnLog; design: Design })
  ReplayPanel(props: { design: Design; logs: TurnLog[]; terminal?: 'complete' | 'failed'; compact?: boolean })  // scene + timeline + detail; reads/writes replayTurn
  ```
  Timeline groups turns into phase segments (build, test, wait, transfer, capture, orbit) and shows event markers per turn. Play steps one turn per ~1 s and stops at the last turn. `TurnDetail` shows the turn's notes, each event (event name, the choice made, succeeded or failed, impact: delta-v, power, data, turns, reserve), and the numbers: coverage, data generated/sent/lost, total returned, fuel, reserve. `MissionView` ship position: earth pose at the Earth sphere; `transfer` along the existing arc by `transferProgress`; `orbit` around the Moon at the existing radius formula using `orbitAltitudeKm` and `orbitAngle`; coverage arc from `pose.coveragePercent`; a red marker at the ship when `pose.terminal === 'failed'`.
  Screen flow (spec call 1): `SimulationPlaceholder` keeps its readouts and "Advance Turn", embeds `ReplayPanel compact`, and, once `isSimComplete`, shows a prominent "See report" button (`showReport`). The report screen gets a "Watch replay" button (`openReplay()`), and each history row gets a "Replay" button only when `entry.run` exists (`openReplay(entry.id)`). The `replay` screen renders `ReplayPanel` full width for the current sim or the chosen history entry (design from `entry.report.design`, logs from `entry.run.turnLogs`, terminal from `entry.report.outcome === 'failed' ? 'failed' : 'complete'`) plus a "Back to report" button.

- [ ] **Step 1: Implement** `MissionView` controlled mode and the three viz components; wire `App.tsx` (add `case 'replay'`).
- [ ] **Step 2: Verify in the browser:** start a mission and advance through build, test, transfer, capture and orbit: the compact scene's ship moves, the scrubber lets you go back, the final turn stays on screen with "See report"; open the report, click "Watch replay", scrub and press play to the end; open Run History and replay a past run; check a failed run (e.g. a design that fails capture) shows the red marker and stops; confirm a history entry saved before this change (clear `run` in the console via `useGameStore.setState`) shows no Replay button. Check the canvas has a non-zero size in both layouts.
- [ ] **Step 3: Run** `pnpm test && pnpm typecheck && pnpm lint`. Expected: pass.
- [ ] **Step 4: Commit** (`feat(viz): turn replay and screen flow`).

### Task 7: Final verification

**Files:** none new.

- [ ] **Step 1: Run** `pnpm test && pnpm typecheck && pnpm lint && pnpm build`. Expected: all pass, build succeeds.
- [ ] **Step 2: Browser walkthrough** of the whole path at laptop width (1440x900): title, all 8 design steps (diagram and delta line), start mission, advance to the end, see report, watch replay, replay from History. Record in the final message exactly what was checked and anything that looked wrong.
- [ ] **Step 3: Update README** "How to Play" with one short paragraph about the diagram and the replay (no screenshots), then commit (`docs: mention visualiser`).
