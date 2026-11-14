# Mission Visualiser: design

Status: draft for approval. Date: 2026-11-14. Branch: `claude/lunar-ice-mapper-visualizer-a299f5`.

## Intent and why

Moonshot is a game where a player designs a 6U CubeSat to map lunar ice, then flies it turn by turn (one turn = one month). Today the design steps are plain forms with resource bars, and the simulation screen is a text readout (`SimulationPlaceholder` in `src/App.tsx`) that jumps to a report when the run ends. Players see numbers but not cause and effect.

The visualiser is **for players**: it shows what each design choice did to the spacecraft and the mission, and what happened in each simulated turn, so players understand their results and can improve their next design. It is also the most visible part of the game for the NASA Space Apps judges, but the design target is the player, not a demo script.

## Goals

1. **Per design step (A):** in each of the 7 design steps (Planning, Instruments, Spacecraft, Orbit, Ride & Transfer, Communications, Go/No-Go), a live diagram next to the form shows the effect of the current choices, including "what this choice changed" (before/after of the numbers it affects).
2. **Per simulation turn (B):** a replay with a timeline grouped by phase (build, test, wait, transfer, capture, orbit) and a scrubber to any turn. For the selected turn it shows the ship's position in the Earth-Moon scene, south-pole coverage, the events with the player's choice and outcome, and the turn's numbers (coverage, data generated/sent/lost, fuel, reserve).
3. Replay is available for the run just flown and for past runs in Run History.
4. Everything is derived from what the game already computes; no game rules change.

## Non-goals

- No change to balance, events, scoring or the data tables.
- No new in-turn decisions. Turns are still advanced with "Advance Turn"; the scrubber is for looking back (and forward, once turns exist).
- No networked or multi-user features; team mode is untouched.
- No new dependencies (SVG is hand-written; three.js/drei are already installed).
- Brief screen has no diagram of its own beyond the mission strip (see Design steps).

## Anti-goals (a failure even if it works technically)

- A diagram that contradicts the numbers on the dashboard or the report. There must be one source of truth (`computeBudgets`, `TurnLog`).
- Animation that is pretty but hides the numbers. Every visual element must be backed by a number a player can read.
- Slowing the form interactions: diagram updates must feel instant while the player clicks parts.

## Constraints

- Stack is fixed: Vite, React 19, TypeScript, Tailwind 4, react-three-fiber/drei/three, Zustand, Zod, Vitest. oxlint and `tsc -b` must pass; `pnpm test` must pass.
- The sim stays pure and in `src/sim` with no React. New pure helpers (derivations for the visualiser) also go in `src/sim` or a sibling pure module and get unit tests; React and three.js components are verified in the browser.
- Dark slate UI already used by the game (Tailwind slate-900/950, blue/green/orange/purple accents). Match it.
- Runs in current evergreen desktop browsers; layout must work at laptop widths. Mobile is not a target.

## Approaches considered

1. **All 2D (SVG).** Cheapest, crisp, testable. Flatter replay scene than the existing 3D view.
2. **All 3D (extend react-three-fiber).** Most impressive, most work; existing `MissionView` is clock-animated and would need reworking; harder to test; hard to fit into small panels.
3. **Hybrid (chosen by Jakob).** SVG for the design-step diagram, existing three.js scene reused for the replay. Each view uses the format that suits it and reuses code already in the repo.

## Decided design

### What exists today (verified by reading the code)

- `computeBudgets(design, difficulty)` returns mass, volume, power (sun and eclipse), cost, time, delta-v, data and reliability numbers for any (even partial) design. `goNoGo` turns them into checks.
- `stepTurn` / `initSim` / `runSimulation` in `src/sim/simulate.ts` are pure and seeded (`SeededRNG(seed + turn * 1000)`). Each turn appends a `TurnLog` (phase, coveragePercent, dataGenerated/Sent/Lost, totalDataReturned, fuelRemaining, reserveRemaining, events with player choice and impact, notes). `SimState.turnLogs` holds them all.
- `src/scene/MissionView.tsx` (Earth, Moon, transfer arc, lunar orbit, ship, south-pole coverage arc) and `src/scene/SpacecraftView.tsx` (3D CubeSat) exist and are exported but **are not used anywhere**. `MissionView` animates by clock and reads `simState` from the store directly.
- Layout: `Shell` shows `StepRail | main | Dashboard` during design; the simulation and report screens show only `main`.
- `advanceTurn` moves to the `report` screen as soon as the sim is complete, and `saveToHistory` stores only the `Report` (which has the `design` and difficulty but **not the seed or turn logs**).

### Part A: design-step diagram

- A new SVG component shown at the top of each design step's main area (above or beside the form depending on width; builder decides), fed only by `design` and `computeBudgets`.
- **CubeSat cutaway:** a 6U bus outline with slots. Selected instruments, battery, computer, radio, attitude and propulsion fill their slots; the solar panel is drawn folded (body-mounted) or unfolded (deployable) per the selected part; slot fill reflects `volume` against the 6U limit (over-limit shown in red). Unselected slots show as empty.
- **Mission strip:** Earth, transfer arc, Moon, lunar orbit, with the segments the current step affects highlighted (Planning: build/test/ride timeline; Instruments and Spacecraft: the craft; Orbit: the orbit ring at the chosen altitude; Ride & Transfer: the transfer arc and duration; Comms: the downlink to Earth).
- **"What this choice changed":** a small before/after line computed by comparing `computeBudgets` for the design before and after the latest `updateDesign` (for example "Mass +1.2 kg, Power +60 W, Cost +$0.4M, eclipse margin 12 to 31 min"). Only changed values are listed. Changed resource bars in the existing Dashboard flash briefly.
- Go/No-Go step: diagram shows the whole craft and mission strip with failing checks marked on the part or segment that causes them (use `CheckResult.fixStep`).
- No new state beyond "previous budgets" for the delta, kept in the store (not persisted) or in the component; builder decides.

### Part B: turn replay

- A new `Replay` screen/view combining: the three.js mission scene, a phase-grouped timeline with a scrubber and play/pause (steps one turn per tick), and a turn detail panel (events with chosen response, success or failure, impact; coverage; data generated/sent/lost; fuel; reserve; the turn's notes).
- The scene is driven by a `turnIndex` prop instead of the clock: ship position derived from phase and turn (build/test/wait at Earth; transfer along the arc by turns-into-transfer over transfer duration; capture at the Moon; orbit around the Moon at the chosen altitude by turn), south-pole coverage arc from that turn's `coveragePercent`. Pure derivation of "ship position and phase progress from TurnLog + design" lives in a testable function.
- Entry points: (1) the report screen gets a "Watch replay" action; (2) each Run History entry gets "Replay"; (3) the simulation screen gets the same scrubber so a player can look back while flying (the "Advance Turn" button stays the only way to create new turns).
- Past-run replay requires saving the run: add `seed` and the `turnLogs` (or just `seed`, re-simulating with default actions only works if the player used default actions, so store `turnLogs` and `allEvents`) to the history entry. History is capped at the last 20 runs today; keep that cap. History is persisted via Zustand `persist` (`runHistory` is in `partialize`), so size per entry must stay small (turn logs are small: tens of turns).
- If a stored run has no turn logs (runs saved before this change), the Replay button is hidden for that entry.

### Where code goes

- `src/viz/` (new) for the visualiser: `CubeSatDiagram.tsx`, `MissionStrip.tsx`, `DesignDelta.ts` (pure, tested), `Replay.tsx`, `ReplayTimeline.tsx`, `TurnDetail.tsx`, `replayPose.ts` (pure, tested).
- Reuse and adapt `src/scene/MissionView.tsx` (add a `turnIndex`/controlled mode; keep unused clock mode or remove it if the builder finds nothing needs it).
- Small edits: `src/ui/steps/*` or `DesignScreen.tsx` to mount the diagram, `src/App.tsx` (new `replay` screen or sub-view) and `src/state/gameStore.ts` (store replay turn index, store previous budgets for the delta, extend history entries).

### Testing

- Unit tests (Vitest, next to the code) for `DesignDelta` (before/after budget differences, only changed fields) and `replayPose` (position for each phase boundary, transfer midpoint, capture, orbit angle, failed run stops where it failed).
- Browser check of every design step and a full replay (success run, a failed run, a run with events) at desktop width; report what was checked.
- Existing tests must keep passing.

## Decisions I made (Jakob can overrule)

- Diagram placement per step is left to the builder, within "visible without scrolling at laptop width".
- History entries gain turn logs (and events) so past runs can be replayed; older entries simply have no replay.
- Brief screen uses only the mission strip.
- No new dependencies; no sound; no export of the replay as video or GIF (possible later).

## Calls settled after the builder review (my calls, Jakob can overrule)

1. **Final turn and screen flow.** `advanceTurn` currently flips to `report` the moment the sim ends. Change the flow only, not the rules: when the run ends, stay on the `simulation` screen so the player sees the last turn (the capture failure, the contact loss, or the last orbit turn) in the scrubber and scene, with a prominent "See report" button. The report is built and saved to history at that moment as today. The report screen gets "Watch replay", which opens the Replay screen on the last turn. Replay is its own `Screen` value (`replay`) used from the report and from History; the simulation screen embeds a compact version (scene, scrubber, turn detail).
2. **Motion.** One pose per turn, computed by a pure `replayPose(design, turnLog, turnIndex)`. The scene tweens between the previous and the new pose over about 0.6 s on scrub or play; tests cover the pure poses only (plus a small `lerp` for the tween).
3. **No sim change needed.** `replayPose` uses only `TurnLog` (log.phase is the phase at the start of that turn, so a failed capture turn is logged as `capture`) plus the design: transfer progress = count of `transfer` logs so far divided by the transfer part's `durationTurns`; "captured" = any later log has phase `orbit`; orbit altitude and angle come from the orbit part and the number of orbit logs so far. The terminal state (`complete` or `failed`) is not a log entry, so the replay shows it as a final marker on the last pose using the `Report` outcome and failure reason. A failed run keeps the ship at its last pose with a red marker.
4. **History storage.** Each entry stays `{ id, report }` and gains optional `run?: { seed, turnLogs, allEvents }` (the design and difficulty are already in the report). No persist version bump; old entries without `run` hide Replay. Keep the 20-run cap; wrap the persist write so a storage-quota failure drops the oldest `run` data instead of breaking the game.
5. **"What this choice changed"** is the change from the last single edit (last `updateDesign` call), and clears when the player changes step or loads, imports or resets a design. The previous-budgets snapshot lives in the store (not persisted).
6. **Go/No-Go marking** is by design step and mission segment, not by individual part: each failing `CheckResult` highlights the step's slot group (Spacecraft: the bus slots; Instruments: the payload slots) or mission segment (Ride & Transfer: the transfer arc; Comms: the downlink; Orbit: the orbit ring) named by its `fixStep`. No per-part mapping.
7. **Scene sizes.** The 3D scene appears full width on the Replay screen and as a compact (about 16rem high, as `MissionView` is today) scene on the simulation screen. Design steps use only the SVG diagram, not three.js. `MissionView` is controlled by props (`turnIndex`, `design`, `logs`) and keeps no clock logic.
8. **Risk to note:** `MissionView` and `SpacecraftView` are not mounted anywhere today, so wiring them in may need Canvas sizing and store-coupling fixes; the plan should do this early.

## Left to the builder

Exact SVG art style within the existing dark slate theme, animation timing, whether the replay is its own `Screen` value or a mode of `simulation`/`report`, play speed, and the exact format of the before/after line.
