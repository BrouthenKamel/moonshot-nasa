# Instrument Stage (Research Lab simulator) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat diagram on the Instruments step with a live 3D chase-camera stage, framed as the Research Lab's simulator, whose every visual state is driven by and explained with the logic core's numbers.

**Architecture:** Two pure, unit-tested modules carry all decisions: `ground.ts` (terrain height and baked Sun shadows) and `stageModel.ts` (what each instrument is doing and why the forecast is what it is, from `computeBudgets`). The react-three-fiber scene and the DOM overlays only draw what those two return. The stage is lazy-loaded behind an error boundary that falls back to today's `DesignDiagramPanel`.

**Tech Stack:** React 19, TypeScript, react-three-fiber 9, drei 10, three 0.187, Zustand, Tailwind 4, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-14-instrument-stage-design.md` (approved 14 Nov 17:28). Reference prototype for look and behaviour, not code to keep: `src/scene/InstrumentStageSpike.tsx` (uncommitted).

## Global Constraints

- No edits to `src/sim/*`, `src/data/*`, `src/state/*`, `src/App.tsx`, `src/ui/Shell.tsx`, `BaseScreen.tsx`, `BaseMap.tsx`. In `src/ui/screens/DesignScreen.tsx` the only change is `'instruments'` in `STEPS_WITHOUT_DIAGRAM`.
- All numbers from `computeBudgets(design, difficulty)` and the catalogues in `src/data/parts.ts` / `src/data/orbits.ts`. No second copy of mission maths.
- Reads `design.instruments`, `design.orbit`, `design.attitude`, `difficulty` from `useGameStore`; writes only `updateDesign({ instruments })`. What-if dials never write to the store.
- At most two instruments; adding a third drops the oldest (same rule as `InstrumentsScreen` today: `[...current, id].slice(-2)`).
- No new dependencies. No real-time shadow maps, no post-processing.
- Colours: laser `#22c55e`, IR spectrometer `#f59e0b`, neutron spectrometer `#a855f7`, camera `#3b82f6`.
- Coverage target 70; forecast covers 12 clean turns (`lunarIceMapperBrief.missionDurationTurns`).
- Reference viewport 1440 × 900, inside the Shell (step rail and dashboard stay).
- `src/ui/screens.smoke.test.tsx` must keep passing (server render in Node, no WebGL).
- Before the PR: `pnpm typecheck && pnpm test && pnpm lint && pnpm build`. One known failure on `main` (`gameStore.test.ts` "stays on simulation after the last turn…") is not ours; report it, do not fix it.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never merge into `main`; open the PR and report it to the Integration session.

## Review Focus

1. **Picking a third instrument quickly from the bar** → the oldest drops, never three aboard, cards and bar agree. Pinned in Task 2 (`toggleInstrument`).
2. **No instruments aboard** → empty bay card, no beams, ring 0%, no `NaN` anywhere. Pinned in Task 2 (empty design test) and Task 3 browser check.
3. **What-if dial left changed, then the player leaves and comes back, or their design's orbit changes** → dials start from the design's current values each time the stage mounts. Pinned in Task 2 (`whatIfFromDesign`).
4. **WebGL missing or the scene throws** → the step still works with the flat diagram. Pinned in Task 3 (error boundary + `canUseWebGL`) and the browser check with WebGL off.
5. **Unknown or empty orbit / attitude id in a design** (imported design codes) → model does not throw, altitude falls back to 15 km. Pinned in Task 2.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/scene/instrumentStage/ground.ts` | Pure terrain: crater list, height, baked shadow grid, shadow lookup. No three.js. |
| `src/scene/instrumentStage/ground.test.ts` | Ground tests |
| `src/scene/instrumentStage/stageModel.ts` | Pure: instrument colours and names, `toggleInstrument`, `whatIfFromDesign`, `stageModel`, `activityText`. |
| `src/scene/instrumentStage/stageModel.test.ts` | Model tests against the real core |
| `src/scene/instrumentStage/Scene.tsx` | Canvas contents: sky, terrain, satellite, camera rig, driver |
| `src/scene/instrumentStage/beams.tsx` | One component per instrument effect |
| `src/scene/instrumentStage/Overlays.tsx` | Forecast panel, pass chip, lab simulator dials, read-outs, empty bay |
| `src/scene/instrumentStage/InstrumentBar.tsx` | Four instrument buttons docked under the stage |
| `src/scene/instrumentStage/InstrumentStage.tsx` | Default export: state, lazy target, composes the above |
| `src/scene/instrumentStage/StageBoundary.tsx` | Error boundary + `canUseWebGL()`; fallback `DesignDiagramPanel` |
| `src/viz/DesignDeltaLine.tsx` | "What this choice changed" line, extracted from `DesignDiagramPanel` |
| Modify `src/viz/DesignDiagramPanel.tsx` | Use `DesignDeltaLine` |
| Modify `src/ui/steps/InstrumentsScreen.tsx` | Mount stage, bar and delta line; cards use `toggleInstrument` |
| Modify `src/ui/screens/DesignScreen.tsx` | `'instruments'` in `STEPS_WITHOUT_DIAGRAM` |
| Delete `src/scene/InstrumentStageSpike.tsx` | Prototype |

---

### Task 1: Ground module

**Files:**
- Create: `src/scene/instrumentStage/ground.ts`, `src/scene/instrumentStage/ground.test.ts`

**Interfaces:**
- Produces:
  - `TILE_LENGTH = 80`, `TILE_WIDTH = 170` (scene units; `u` runs 0..TILE_LENGTH along the flight direction, `x` across, 0 = ground track)
  - `interface Crater { x: number; u: number; r: number; d: number }`
  - `TRACK_CRATER: Crater` = `{ x: 2, u: 50, r: 15, d: 3.4 }` (the deep crater on the track)
  - `CRATERS: readonly Crater[]` (about 10 large from the prototype list plus about 70 small from a fixed-seed generator, none within `3.5 + r` of the track except `TRACK_CRATER`)
  - `groundHeight(x: number, u: number): number`
  - `interface BakedGround { nx: number; nu: number; height: Float32Array; shadow: Float32Array }`
  - `bakeGround(): BakedGround` (memoised; grid 341 × 161 as in the prototype)
  - `shadowAt(x: number, u: number): number` (0 sunlit … 1 shadow; `u` taken modulo `TILE_LENGTH`; 0 outside the tile's width)
  - `SUN_DIRECTION: { x: number; up: number; u: number }` (unit vector towards the Sun: 9° elevation, ahead and slightly left; the prototype's `SUN_X = -0.342`, `SUN_U = 0.94` before elevation)

- [ ] **Step 1: Write the failing tests**

```ts
describe('ground', () => {
  it('is the same on every call', () => {
    expect(groundHeight(12.3, 40.1)).toBe(groundHeight(12.3, 40.1))
    expect(CRATERS).toEqual(CRATERS.map((c) => ({ ...c })))
  })
  it('joins seamlessly where the tile repeats', () => {
    for (const x of [-60, -10, 0, 25, 70]) expect(groundHeight(x, 0)).toBeCloseTo(groundHeight(x, TILE_LENGTH), 2)
  })
  it('keeps the floor of the track crater in shadow', () => {
    expect(shadowAt(TRACK_CRATER.x, TRACK_CRATER.u)).toBeGreaterThan(0.9)
  })
  it('lights open ground on the track before the crater', () => {
    expect(shadowAt(0, 30)).toBeLessThan(0.1)
  })
  it('wraps u around the tile', () => {
    expect(shadowAt(TRACK_CRATER.x, TRACK_CRATER.u + TILE_LENGTH)).toBeCloseTo(shadowAt(TRACK_CRATER.x, TRACK_CRATER.u), 5)
  })
})
```

- [ ] **Step 2: Run** `pnpm exec vitest run src/scene/instrumentStage/ground.test.ts` → FAIL (module missing)
- [ ] **Step 3: Implement** by porting the prototype's ground section (fixed-seed `mulberry32(7)`, craters, `groundHeight`, shadow ray-march towards the Sun with 70 steps of 0.55 units and a 0.22 soft edge, bilinear `sampleGrid`). Seam: make the height terms periodic in `u` with period `TILE_LENGTH` (the prototype's are) and keep craters fully inside the tile. If `shadowAt(0, 30)` is not sunlit, move the lookup point in the test only after checking the picture: the requirement is "open ground on the track before the crater is lit".
- [ ] **Step 4: Run** the same command → PASS
- [ ] **Step 5: Commit** `feat(stage): ground module with baked Sun shadows`

---

### Task 2: Stage model

**Files:**
- Create: `src/scene/instrumentStage/stageModel.ts`, `src/scene/instrumentStage/stageModel.test.ts`

**Interfaces:**
- Consumes: `computeBudgets` (`src/sim/budgets`), `instruments`, `getPartById` (`src/data/parts`), `getOrbitById` (`src/data/orbits`), `lunarIceMapperBrief` (`src/data/brief`), fixtures `flashlightDesign`, `lunahMapDesign`, `iceCubeDesign` (`src/sim/fixtures`).
- Produces:
  - `INSTRUMENT_COLORS: Record<string, string>`, `INSTRUMENT_SHORT_NAMES: Record<string, string>` (`'Laser'`, `'IR spectrometer'`, `'Neutron spectrometer'`, `'Camera'`)
  - `COVERAGE_TARGET = 70`
  - `toggleInstrument(current: string[], id: string): string[]`
  - `interface WhatIf { orbit: string; precise: boolean }`
  - `whatIfFromDesign(design: Design): WhatIf` (`precise` = attitude part's `precise`, false if unknown)
  - `interface InstrumentView { id: string; name: string; color: string; strength: number; outOfRange: boolean; veryWeak: boolean; shaky: boolean; poweredShare: number; seesShadow: boolean; countsAs: 'ice' | 'context' | 'outreach'; footprint: number; iceRatePerTurn: number; problems: string[]; heightIsCause: boolean }`
  - `interface StageForecast { coverage: number; context: number; dataMB: number; outreachMB: number; passesPerTurn: number; meetsTarget: boolean; isWhatIf: boolean; reasons: string[] }`
  - `interface StageModel { altitudeKm: number; instruments: InstrumentView[]; forecast: StageForecast }`
  - `stageModel(design: Design, difficulty: Difficulty, whatIf: WhatIf): StageModel` — runs `computeBudgets` on `{ ...design, orbit: whatIf.orbit, attitude: whatIf.precise ? 'attitude-precision' : 'attitude-basic' }`; `isWhatIf` is true when `whatIf` differs from `whatIfFromDesign(design)`.
  - `activityText(view: InstrumentView, overShadow: boolean): string`

Rules the implementer must follow (from the spec):

- `strength` = `budgets.quality[id]`; `outOfRange` = strength 0; `veryWeak` = `0 < strength < 0.2`; `shaky` = not precise and `qualityWithoutPrecisePointing < 1`; `poweredShare` = `budgets.scienceDuty`; `iceRatePerTurn` = `coverageRate[id]` for `kind === 'ice'`, else 0; `heightIsCause` = `maxAltitudeKm !== null && altitude > maxAltitudeKm`.
- `problems` (in this order, exact copy): `` `too high at ${alt} km: works below ${max} km` `` when `heightIsCause`; `'shaky aim: needs precise pointing'` when `shaky`; `` `power for only ${Math.round(duty * 100)}% of the time` `` when `duty < 0.999`.
- `activityText` precedence: out of range → `'Out of range at this height'`; very weak → `'Very weak at this height'` if `heightIsCause` else `'Very weak'`; over shadow and not `seesShadow` → `'Blind right now: no sunlight down there'`; over shadow → `'Reading the dark crater floor'`; else `'Reading sunlit ground'`.
- `reasons` (in this order, exact copy, numbers rounded to whole numbers):
  1. `captureDeltaV === null || upkeepTurns === 0` → `'This craft cannot reach and hold this orbit, so nothing is mapped. Engine: Factory. Orbit and ride: Launch Site.'`
  2. else `1 <= upkeepTurns <= 11` → `` `Propellant holds this orbit for ${n} of 12 turns.` ``
  3. `projectedLost > 0` (use `> 0.5` to skip rounding noise) → `` `The link is full: ${n} MB never gets home, and its coverage is lost with it. Link: Comms Center.` ``
  4. no chosen instrument with `kind === 'ice'` → `'Nothing aboard sees into shadow: no ice is mapped.'`
- Unknown orbit id: `altitudeKm` falls back to 15, `passesPerTurn` to 0.

- [ ] **Step 1: Write the failing tests**

```ts
const base = (d: Design) => stageModel(d, 'engineer', whatIfFromDesign(d))
const view = (m: StageModel, id: string) => m.instruments.find((i) => i.id === id)!

it('toggleInstrument keeps at most two, oldest drops', () => {
  expect(toggleInstrument(['a', 'b'], 'c')).toEqual(['b', 'c'])
  expect(toggleInstrument(['a', 'b'], 'a')).toEqual(['b'])
  expect(toggleInstrument([], 'a')).toEqual(['a'])
})
it('whatIfFromDesign reads orbit and pointing', () => {
  expect(whatIfFromDesign(flashlightDesign)).toEqual({ orbit: 'orbit-halo', precise: true })
  expect(whatIfFromDesign({ ...flashlightDesign, attitude: 'nope' }).precise).toBe(false)
})
it('IR spectrometer alone maps no ice and says why', () => {
  const m = base(iceCubeDesign)
  expect(view(m, 'inst-ir-spec').countsAs).toBe('context')
  expect(m.forecast.coverage).toBe(0)
  expect(m.forecast.reasons).toContain('Nothing aboard sees into shadow: no ice is mapped.')
})
it('laser low with precise pointing is at full strength', () => {
  const m = stageModel(flashlightDesign, 'engineer', { orbit: 'orbit-elliptical', precise: true })
  const v = view(m, 'inst-laser')
  expect(v.strength).toBe(1); expect(v.shaky).toBe(false); expect(v.problems).toEqual([])
})
it('laser with basic pointing is shaky at half strength', () => {
  const v = view(stageModel(flashlightDesign, 'engineer', { orbit: 'orbit-halo', precise: false }), 'inst-laser')
  expect(v.strength).toBe(0.5); expect(v.shaky).toBe(true)
  expect(v.problems).toContain('shaky aim: needs precise pointing')
})
it('laser at 100 km follows the core and names the height', () => {
  const what = { orbit: 'orbit-100km', precise: true }
  const v = view(stageModel(flashlightDesign, 'engineer', what), 'inst-laser')
  const b = computeBudgets({ ...flashlightDesign, orbit: 'orbit-100km' }, 'engineer')
  expect(v.strength).toBe(b.quality['inst-laser'])
  expect(v.outOfRange || v.veryWeak).toBe(true)
  expect(v.problems).toContain('too high at 100 km: works below 20 km')
  expect(activityText(v, true)).toMatch(/^(Out of range|Very weak) at this height$/)
})
it('neutron spectrometer at 100 km names the 25 km limit', () => {
  const v = view(stageModel(lunahMapDesign, 'engineer', { orbit: 'orbit-100km', precise: false }), 'inst-neutron')
  expect(v.problems[0]).toBe('too high at 100 km: works below 25 km')
})
it('dials equal to the design reproduce the dashboard forecast', () => {
  const m = base(lunahMapDesign); const b = computeBudgets(lunahMapDesign, 'engineer')
  expect(m.forecast.coverage).toBe(b.projectedCoverage); expect(m.forecast.isWhatIf).toBe(false)
})
it('a camera next to the laser fills the link and says so', () => {
  const m = base({ ...flashlightDesign, instruments: ['inst-laser', 'inst-camera'] })
  expect(m.forecast.reasons.some((r) => r.startsWith('The link is full: '))).toBe(true)
  expect(m.forecast.outreachMB).toBeGreaterThan(0)
})
it('an orbit the craft cannot reach maps nothing and says so', () => {
  const m = stageModel(flashlightDesign, 'engineer', { orbit: 'orbit-elliptical', precise: true })
  expect(m.forecast.coverage).toBe(0); expect(m.forecast.isWhatIf).toBe(true)
  expect(m.forecast.reasons[0]).toMatch(/^This craft cannot reach and hold this orbit/)
})
it('a design that meets the brief has no reason lines', () => {
  expect(base(flashlightDesign).forecast.reasons).toEqual([])
})
it('reports power when the instruments cannot always run', () => {
  // find any design in the fixtures or a variant with scienceDuty < 1; assert the problem text
})
it('empty bay and unknown orbit do not throw or produce NaN', () => {
  const m = stageModel({ ...flashlightDesign, instruments: [], orbit: '' }, 'engineer', { orbit: '', precise: true })
  expect(m.instruments).toEqual([]); expect(m.altitudeKm).toBe(15)
  expect(JSON.stringify(m)).not.toContain('NaN')
})
```

The power test: build the variant by trying `{ ...flashlightDesign, solar: 'solar-1wing', instruments: ['inst-laser', 'inst-ir-spec'] }` and similar; pick one where `computeBudgets(...).scienceDuty < 0.999` and assert `` `power for only ${Math.round(duty*100)}% of the time` `` is in the laser's problems. If no catalogue combination gives duty below 1, delete the test and note it in the PR.

If `flashlightDesign` has reason lines (step "no reason lines" fails), check which one against `computeBudgets` before changing anything; report it, do not change the core.

- [ ] **Step 2: Run** `pnpm exec vitest run src/scene/instrumentStage/stageModel.test.ts` → FAIL
- [ ] **Step 3: Implement** `stageModel.ts` per the Interfaces and rules above.
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: Commit** `feat(stage): stage model from the logic core`

---

### Task 3: Stage at prototype parity, mounted (slice 1)

**Files:**
- Create: `Scene.tsx`, `beams.tsx`, `Overlays.tsx`, `InstrumentBar.tsx`, `InstrumentStage.tsx`, `StageBoundary.tsx` in `src/scene/instrumentStage/`
- Modify: `src/ui/steps/InstrumentsScreen.tsx`, `src/ui/screens/DesignScreen.tsx`
- Delete: `src/scene/InstrumentStageSpike.tsx`

**Interfaces:**
- Consumes: Task 1 and Task 2 exports.
- Produces:
  - `InstrumentStage` (default export of `InstrumentStage.tsx`), no props; reads the store itself.
  - `StageBoundary({ children, fallback }: { children: ReactNode; fallback: ReactNode })` and `canUseWebGL(): boolean` (false in Node / when `document` is undefined).

Behaviour (port from the prototype, with these fixes):

- Camera created once (`useState` initialiser), `OrbitControls` target created once; a rig nudges camera and target when altitude changes. Drag limits as in the prototype; no zoom, no pan.
- Ground mesh coloured from `bakeGround()`; tiles repeat along `u`; side and far planes only outside the tile.
- Beam landing point forward of the satellite (`targetZ = -7 - h * 0.6`), ground slides at 4.2 units/s, so one loop ≈ 19 s.
- Beam brightness follows `strength`; at `outOfRange` no beam; laser sparkles only over shadow; IR cone and footprint fade with `1 - shadow`; camera frame dims over shadow; neutron rings in light and dark; `shaky` makes the landing point wobble; `poweredShare < 1` switches beams off for that share of a 2.2 s cycle.
- Overlays: forecast ring (green when `meetsTarget`, else amber, mark at 70) with "after 12 clean turns · target 70%", sunlit ground %, science data MB, `${passesPerTurn} passes over the pole per turn`; pass chip "Over sunlit ground" / "Over a crater that never sees the Sun"; dials panel titled "Research Lab simulator", line "Try the other buildings' choices here. Your design stays as it is.", "Orbit · decided at the Launch Site" (three orbits by name), "Pointing · built at the Factory" (Basic / Precise); read-out cards bottom right (name, "N% strength", `activityText`, what it counts as, problems); empty bay card "The instrument bay is empty. Pick one or two below."
- Instrument bar docked under the stage, four buttons in catalogue order, using `toggleInstrument`.
- `InstrumentsScreen`: `lazy(() => import('../../scene/instrumentStage/InstrumentStage'))` inside `Suspense` and `StageBoundary`, fallback `<DesignDiagramPanel step="instruments" />`; render the fallback directly when `!canUseWebGL()`. Cards use `toggleInstrument`.
- `DesignScreen`: if `main` has `STEPS_WITHOUT_DIAGRAM`, add `'instruments'`; else add `const STEPS_WITHOUT_DIAGRAM: DesignStep[] = ['instruments']` and render the panel only when the step is not in it. Remove the prototype's ad-hoc condition.

- [ ] **Step 1: Run** `pnpm exec vitest run src/ui/screens.smoke.test.tsx` → PASS before changes (baseline).
- [ ] **Step 2: Build the components and wire them in;** delete the prototype and its mount.
- [ ] **Step 3: Run** `pnpm typecheck && pnpm exec vitest run src/ui/screens.smoke.test.tsx src/scene` → PASS
- [ ] **Step 4: Browser check** at 1440 × 900 (`.claude/launch.json` config `moonshot-spike`, port 5273; Start Mission → 2. Instruments). Capture frames by copying the canvas to an image (the pane may be hidden). Confirm and write down: each instrument alone over sunlit ground and over the crater; two instruments; none; all three orbits; Basic and Precise; dragging; selecting quickly five times; no console errors. Then disable WebGL (`HTMLCanvasElement.prototype.getContext = () => null` before load) and confirm the flat diagram shows.
- [ ] **Step 5: Commit** `feat(stage): Research Lab simulator on the Instruments step`

---

### Task 4: Honest forecast (slice 2)

**Files:**
- Create: `src/viz/DesignDeltaLine.tsx`
- Modify: `src/viz/DesignDiagramPanel.tsx`, `src/scene/instrumentStage/Overlays.tsx`, `src/ui/steps/InstrumentsScreen.tsx`

**Interfaces:**
- Consumes: `StageForecast.reasons`, `.outreachMB`, `.isWhatIf`; `computeDesignDelta`, `formatDelta` from `src/viz/designDelta`.
- Produces: `DesignDeltaLine()` — no props, reads `previousBudgets` and `getBudgets` from the store, renders nothing when there are no deltas; same markup and classes as the block in `DesignDiagramPanel` today.

- [ ] **Step 1:** Extract the "What this choice changed" block from `DesignDiagramPanel` into `DesignDeltaLine`; `DesignDiagramPanel` renders it. Run `pnpm exec vitest run src/ui/screens.smoke.test.tsx` → PASS.
- [ ] **Step 2:** Render `DesignDeltaLine` under the instrument bar on the Instruments step.
- [ ] **Step 3:** Overlays: reason lines under the ring (amber text, one per line); "pictures N MB" when `outreachMB > 0`; when `isWhatIf`, the ring stroke dashed and a line "What-if: not your design".
- [ ] **Step 4: Browser check:** flashlight-like design (laser, halo, precise) then add the camera → link line appears, ring drops; set the orbit dial to Elliptical on it → "cannot reach and hold" line and the what-if marking; IR alone → "Nothing aboard sees into shadow" line; toggling an instrument shows the delta line.
- [ ] **Step 5: Commit** `feat(stage): name what cuts the forecast`

---

### Task 5: Polish (slice 3, cut first if time runs out)

**Files:**
- Modify: `src/scene/instrumentStage/beams.tsx`, `Scene.tsx`, `Overlays.tsx`

- [ ] **Step 1: Camera picture.** Requirement: at 1440 wide the camera's effect is as easy to see as the other three, and it reads as "takes pictures, maps no ice". Builder's choice of how (for example a bright frustum from the aperture with a snapshot plate that flies up to the satellite on each shutter).
- [ ] **Step 2: Reduced motion.** With `matchMedia('(prefers-reduced-motion: reduce)')` true, the ground holds still with the landing point on `TRACK_CRATER` and beams do not pulse.
- [ ] **Step 3: Overlays at 1280 wide:** nothing overlaps the satellite or the landing point.
- [ ] **Step 4: Browser check** of the three items above.
- [ ] **Step 5: Commit** `feat(stage): camera picture, reduced motion, narrow widths`

---

### Task 6: Checks and pull request

- [ ] **Step 1:** `git fetch origin` and rebase on `origin/main` (pick up PR #7's `STEPS_WITHOUT_DIAGRAM` and the 100 km fix if merged; resolve `DesignScreen.tsx` to their list plus `'instruments'`).
- [ ] **Step 2:** `pnpm typecheck && pnpm test && pnpm lint && pnpm build`. Expected: only the known `gameStore.test.ts` failure, if `main` still has it. Lint: no new warnings in our files.
- [ ] **Step 3:** If the 100 km fix is now on `main`, re-run the stage model tests and the 100 km browser view: beam off, "Out of range at this height", ring 0%.
- [ ] **Step 4:** Push the branch, open the PR into `main` with what was checked in the browser and what was not, ending with the attribution line. Do not merge.
- [ ] **Step 5:** Tell the Integration session: what, files, PR link.
