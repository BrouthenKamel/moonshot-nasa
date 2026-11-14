# Orbit View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the card list of step 4 (Orbit Selection) with a 3D view of the Moon in which the player picks one of three orbits and sees what it does.

**Architecture:** Three pure, tested modules in `src/viz/orbit/` hold everything that can be wrong in a countable way: the view model (numbers, verdict, checks from the game's own rules), the orbit geometry, and the ice-cap painter. One react-three-fiber scene (`src/scene/OrbitView.tsx`) draws from them. `OrbitScreen.tsx` owns the store wiring, the time-lapse clock, the HTML panels over the canvas and the plain fallback.

**Tech Stack:** React 19, TypeScript, Tailwind 4, three 0.187, @react-three/fiber 9, @react-three/drei 10, Zustand, Vitest (node environment), oxlint, pnpm.

**Spec:** `docs/superpowers/specs/2026-11-14-orbit-view-design.md`. Read it first. The mockup `docs/superpowers/specs/assets/2026-11-14-orbit-view-mockup.html` is the visual reference and contains working three.js for every scene part; port from it, do not copy its pretend numbers. Pattern to follow for scene, boundary and fallback: `src/scene/ControlRoom.tsx` and `src/ui/steps/PlanningScreen.tsx`.

## Global Constraints

- No new dependencies. No external models, textures or fonts.
- No change to `src/sim/*`, `src/data/*`, the stores, `RideScreen.tsx` or `MissionStrip`. The only write is `updateDesign({ orbit: id })`.
- Shared files: only the two edits in Task 5 (`DesignScreen.tsx`, `Shell.tsx`).
- Never show a number that differs from `computeBudgets` / `goNoGo`. A red verdict needs a red Go / No-Go check.
- Colours: background `#03050a`; Launch Site accent orange `#f97316` (title line, panel headings, focus rings); halo `#a78bfa`, elliptical `#a3e635`, low circular `#38bdf8`; ice and beam cyan `#22d3ee` / `#67e8f9` / `#e0fbff`; good `#4ade80`, caution `#fbbf24`, blocked `#f87171`. Red only where a Go / No-Go check is red.
- Title line: `LAUNCH SITE · LUNAR ICE MAPPER · ORBIT`. Units: km, m/s, Wh; panels say months, plain controls say turns.
- Panel text is at least 12 px.
- Reduced motion (`prefers-reduced-motion: reduce`): no time-lapse, no camera drift, no flicker; show month 12.
- Never commit to `main`, never merge. Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (or the model that runs the task).
- `gh` needs `GH_TOKEN=$(gh auth token --user jakobnunnendorf)` for this repo.

## Review Focus

1. The starting design has no ice instrument (IR spectrometer only): the scene must still look alive (grey strips, no beam) and say "NO ICE INSTRUMENT ON BOARD". Test in Task 2. A design with no instrument at all gives a red Power check and the verdict "NO POWER FOR THE INSTRUMENTS"; also tested in Task 2.
2. A saved design whose `orbit` id is unknown: the view picks the first orbit and does not throw. Test in Task 2.
3. An orbit the craft cannot reach (`captureDeltaV` null, `thrustLevel` 0, or less fuel than the capture needs): no craft, coverage 0 at every month, red verdict. Test in Task 2.
4. Coverage of exactly 100%: `stripCount` must not take `ln(0)`. Test in Task 2.
5. The 3D scene throws or WebGL is missing: the plain cards appear and the step can be completed. Covered by the smoke test (Task 5) and the browser check (Task 6).

## File Structure

| File | Responsibility |
|---|---|
| `src/viz/orbit/orbitGeometry.ts` (+ `.test.ts`) | Orbit shapes, Kepler motion, "is the Moon in the way". Plain numbers. |
| `src/viz/orbit/orbitView.ts` (+ `.test.ts`) | View model from design and difficulty: per-orbit figures, verdict, checks, time-lapse maths. |
| `src/viz/orbit/icePainter.ts` (+ `.test.ts`) | Paints the south-pole cap on a 2D canvas context. |
| `src/scene/OrbitView.tsx` | The r3f scene. |
| `src/ui/steps/OrbitScreen.tsx` | Store wiring, clock, panels, cards, buttons, boundary, fallback. |
| `src/ui/screens/DesignScreen.tsx`, `src/ui/Shell.tsx` | One-line edits: orbit is full bleed and has no diagram panel. |

---

### Task 1: Orbit geometry

**Files:**
- Create: `src/viz/orbit/orbitGeometry.ts`
- Test: `src/viz/orbit/orbitGeometry.test.ts`

**Interfaces (produces):**

```ts
export type Vec3 = [number, number, number]
export interface OrbitShape { rp: number; ra: number; planeDeg: number; period: number; camDist: number }
export const CAP_ANGLE_DEG = 30
export const SUN_DIR: Vec3      // unit vector: azimuth 160°, raised 0.05, normalised
export const EARTH_DIR: Vec3    // unit vector: azimuth 14°, raised 0.42, normalised
export function azimuth(deg: number): Vec3                    // [cos, 0, sin]
export function shapeFor(orbitId: string): OrbitShape         // unknown id -> the circular shape
export function orbitPoint(s: OrbitShape, trueAnomaly: number): Vec3
export function trueAnomaly(s: OrbitShape, meanAnomaly: number): number
export function hiddenBy(p: Vec3, dir: Vec3): boolean         // the unit Moon blocks the view from p towards dir
export interface Stretch { centre: number; half: number }     // in mean anomaly, radians
export function hiddenStretch(s: OrbitShape, dir: Vec3, hiddenShare: number): Stretch | null // null when share <= 0
export function inStretch(st: Stretch | null, meanAnomaly: number): boolean                  // wraps around 2π
export function meanAnomalyOf(s: OrbitShape, trueAnomaly: number): number                    // inverse of trueAnomaly, 0..2π
export function overCap(p: Vec3): boolean                     // within CAP_ANGLE_DEG of the south pole (−y)
```

Shape table (spec, "Shapes"): `orbit-halo` {1.035, 9, 0, 15, 8.6}; `orbit-elliptical` {1.035, 2.81, 65, 9, 6.4}; `orbit-100km` {1.18, 1.18, 65, 6, 5.2}.

`orbitPoint`: with `a = (rp+ra)/2`, `e = (ra−rp)/(ra+rp)`, `r = a(1−e²)/(1+e·cos ν)`, `u = azimuth(planeDeg + 90)`: point = `−cos ν · r · ŷ + sin ν · r · u`. `trueAnomaly`: Newton's method on Kepler's equation, 8 steps from `E = M`, then `ν = 2·atan2(√(1+e)·sin(E/2), √(1−e)·cos(E/2))`. `hiddenBy`: `d = p·dir`; hidden when `d < 0` and `|p − d·dir| < 1`. `hiddenStretch` (spec, "Shadow and Earth stretches"): sample 720 mean anomalies; `centre` is the sample with the smallest `p·dir` among those where `hiddenBy` is true (among all samples if none is); `half = π × hiddenShare`. The ring's dim vertices and the craft's grey state use `inStretch(stretch, meanAnomalyOf(shape, ν))`, never `hiddenBy` directly.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { shapeFor, orbitPoint, trueAnomaly, meanAnomalyOf, hiddenBy, hiddenStretch, inStretch, overCap, SUN_DIR, EARTH_DIR } from './orbitGeometry'

const len = (v: number[]) => Math.hypot(v[0], v[1], v[2])

describe('orbitGeometry', () => {
  it('has the low point over the south pole and the far point over the north', () => {
    const s = shapeFor('orbit-elliptical')
    const low = orbitPoint(s, 0), far = orbitPoint(s, Math.PI)
    expect(low[1]).toBeCloseTo(-1.035, 6); expect(len(low)).toBeCloseTo(1.035, 6)
    expect(far[1]).toBeCloseTo(2.81, 6)
  })
  it('never goes below the low point, for every shape', () => {
    for (const id of ['orbit-halo', 'orbit-elliptical', 'orbit-100km']) {
      const s = shapeFor(id)
      for (let i = 0; i < 360; i++) expect(len(orbitPoint(s, (i / 360) * 2 * Math.PI))).toBeGreaterThanOrEqual(s.rp - 1e-9)
    }
  })
  it('keeps every orbit polar: the plane contains the y axis', () => {
    const s = shapeFor('orbit-halo'), a = orbitPoint(s, 1), b = orbitPoint(s, 2.5)
    expect(a[0] * b[2] - a[2] * b[0]).toBeCloseTo(0, 9) // horizontal parts are parallel
  })
  it('solves Kepler: fixed points, monotonic, and equal to the mean anomaly on a circle', () => {
    const e = shapeFor('orbit-elliptical'), c = shapeFor('orbit-100km')
    expect(trueAnomaly(e, 0)).toBeCloseTo(0, 9)
    expect(Math.abs(trueAnomaly(e, Math.PI))).toBeCloseTo(Math.PI, 6)
    expect(trueAnomaly(c, 1.3)).toBeCloseTo(1.3, 9)
    expect(trueAnomaly(e, 0.5)).toBeGreaterThan(0.5) // faster near the low point
  })
  it('gives an unknown orbit the circular shape', () => {
    expect(shapeFor('nope')).toEqual(shapeFor('orbit-100km'))
  })
  it('knows when the Moon is in the way', () => {
    expect(hiddenBy([-2, 0, 0], [1, 0, 0])).toBe(true)
    expect(hiddenBy([2, 0, 0], [1, 0, 0])).toBe(false)
    expect(hiddenBy([-2, 1.5, 0], [1, 0, 0])).toBe(false)
  })
  it('knows when a point is over the polar cap', () => {
    expect(overCap([0, -1.04, 0])).toBe(true)
    expect(overCap([1.04, 0, 0])).toBe(false)
  })
  it('sizes the hidden stretch from the data, in time, and has none for a share of 0', () => {
    const s = shapeFor('orbit-100km')
    expect(hiddenStretch(shapeFor('orbit-halo'), SUN_DIR, 0)).toBeNull()
    expect(inStretch(null, 1)).toBe(false)
    const st = hiddenStretch(s, SUN_DIR, 0.4)!
    expect(st.half).toBeCloseTo(Math.PI * 0.4, 9)
    let inside = 0
    for (let i = 0; i < 1000; i++) if (inStretch(st, (i / 1000) * 2 * Math.PI)) inside++
    expect(inside / 1000).toBeCloseTo(0.4, 2)
    expect(hiddenBy(orbitPoint(s, trueAnomaly(s, st.centre)), SUN_DIR)).toBe(true) // centred behind the Moon
    expect(inStretch({ centre: 0.1, half: 0.3 }, 2 * Math.PI - 0.1)).toBe(true)     // wraps
  })
  it('inverts the Kepler solver', () => {
    const e = shapeFor('orbit-elliptical')
    for (const m of [0.2, 1.7, 3.3, 5.9]) expect(meanAnomalyOf(e, trueAnomaly(e, m))).toBeCloseTo(m, 6)
  })
  it('exports unit directions', () => {
    expect(len(SUN_DIR)).toBeCloseTo(1, 9); expect(len(EARTH_DIR)).toBeCloseTo(1, 9)
  })
})
```

- [ ] **Step 2:** Run `pnpm vitest run src/viz/orbit/orbitGeometry.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3:** Implement `orbitGeometry.ts` to the interface above.
- [ ] **Step 4:** Run the same command. Expected: 10 tests pass.
- [ ] **Step 5:** Commit: `git add src/viz/orbit && git commit -m "feat(orbit): orbit geometry for the orbit view"`.

---

### Task 2: View model

**Files:**
- Create: `src/viz/orbit/orbitView.ts`
- Test: `src/viz/orbit/orbitView.test.ts`

**Interfaces:**
- Consumes: `computeBudgets(design, difficulty)` and `createDefaultDesign()` from `src/sim/budgets`; `goNoGo(design, budgets)` from `src/sim/checks`; `lunarOrbits` from `src/data/orbits`; `getPartById`, `InstrumentPart` from `src/data/parts`; `Difficulty` from `src/data/brief`; `Design`, `BarStatus` from `src/sim/types`.
- Produces:

```ts
export type Tone = 'good' | 'warn' | 'bad'
export type StripTone = 'ice' | 'blind' | 'none' // lighting ice | too high (amber) | no ice instrument (grey)
export interface OrbitCheck { resource: string; status: BarStatus; reason: string }
export interface IceInstrument { id: string; name: string; maxAltitudeKm: number | null; inRange: boolean }
export interface OrbitOption {
  id: string; shortName: string; color: string; description: string
  altitudeKm: number; passesPerTurn: number; passesLine: string
  sunlitPct: number; eclipseHours: number; earthPct: number
  holdDeltaV: number; captureDeltaV: number | null; deltaVAvailable: number; upkeepTurns: number
  reachable: boolean              // captureDeltaV !== null && thrustLevel > 0 && deltaVAvailable >= captureDeltaV
  batteryNeedWh: number; batteryUsableWh: number; batteryOk: boolean
  projectedCoverage: number       // budgets.projectedCoverage, untouched
  bestIceRate: number             // max coverageRate over ice instruments; 0 if none
  iceInstruments: IceInstrument[] // parts with seesShadow === true
  iceInRange: boolean             // at least one ice instrument in range
  stripTone: StripTone
  verdict: { tone: Tone; text: string }
  checks: OrbitCheck[]            // Delta-v, Power, Science always, in this order; then Budget and Data Link when not green
}
export interface OrbitView { options: OrbitOption[]; selectedId: string; selected: OrbitOption }
export const COVERAGE_GOAL = 70
export const ORBIT_LOOK: Record<string, { shortName: string; color: string }>
export function buildOrbitView(design: Design, difficulty: Difficulty): OrbitView
export function coverageAt(o: OrbitOption, months: number): number // 0..12 -> %
export function stripCount(o: OrbitOption, months: number): number
```

Rules (all from the spec):
- `ORBIT_LOOK`: `orbit-halo` → "Halo Loop" `#a78bfa`; `orbit-elliptical` → "Elliptical Polar" `#a3e635`; `orbit-100km` → "Low Circular" `#38bdf8`. Unknown id → the orbit's `name` and `#e2e8f0`.
- Each option comes from `computeBudgets({ ...design, orbit: id }, difficulty)` and `goNoGo` on that trial design.
- `IceInstrument.inRange` = `maxAltitudeKm === null || altitude <= maxAltitudeKm`.
- `stripTone`: no ice instruments → `'none'`; none in range → `'blind'`; else `'ice'`.
- `passesLine`: under 10 "About one pass a week."; under 200 "About five passes a day."; else "One pass every two hours."
- `verdict`: the table in the spec, "Readout panel", item 1, first match wins. The tone is red exactly when one of the shown checks is red. It reads the trial's Delta-v, Power, Science, Budget and Data Link checks, plus `captureDeltaV`, `thrustLevel`, `deltaVAvailable`, `scienceDuty`.
- `selectedId`: `design.orbit` if it is one of the options, else the first option's id.
- `coverageAt`: 0 when `!reachable` or `bestIceRate <= 0`; when `bestIceRate >= 1` it is `projectedCoverage` for any `months > 0`; else `projectedCoverage × (1 − (1 − r)^m) / (1 − (1 − r)^12)` with `m` clamped to 0..12.
- `stripCount`: 0 when `!reachable`. Tone `'ice'`: `min(600, round(−ln(1 − min(coverageAt, 99.5)/100) / 0.02))`. Other tones: `min(300, round(passesPerTurn × m))`.

Real numbers these tests rely on (difficulty `'engineer'`, measured on `main` at bc9574c):

| Design | Orbit | capture | available | projectedCoverage | checks (Delta-v, Power, Science) |
|---|---|---|---|---|---|
| `flashlightDesign` (laser, chemical) | halo | 60 | 227 | 74.1 | green, green, green |
| | elliptical | 386 | 227 | 0 | red, green, yellow |
| | 100 km | 727 | 227 | 0 | red, green, yellow |
| `lunahMapDesign` (neutron, ion) | halo | 250 | 2791 | 41.7 | green, green, yellow |
| | elliptical | 1000 | 2791 | 100.0 | green, green, green |
| | 100 km | 1700 | 2791 | 0 | green, green, yellow |
| `createDefaultDesign()` (IR spectrometer, ion) | all three | reachable | | 0 | green, green, yellow |

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { buildOrbitView, coverageAt, stripCount, COVERAGE_GOAL } from './orbitView'
import { computeBudgets, createDefaultDesign } from '../../sim/budgets'
import { goNoGo } from '../../sim/checks'
import { flashlightDesign, lunahMapDesign } from '../../sim/fixtures'

const opt = (v: ReturnType<typeof buildOrbitView>, id: string) => v.options.find((o) => o.id === id)!

describe('buildOrbitView', () => {
  it('lists the three orbits and marks the picked one', () => {
    const v = buildOrbitView(lunahMapDesign, 'engineer')
    expect(v.options.map((o) => o.id)).toEqual(['orbit-halo', 'orbit-elliptical', 'orbit-100km'])
    expect(v.selectedId).toBe('orbit-elliptical'); expect(v.selected).toBe(opt(v, 'orbit-elliptical'))
  })
  it('shows the same numbers and checks as the game rules, for every design and orbit', () => {
    for (const d of [flashlightDesign, lunahMapDesign, createDefaultDesign()]) {
      const v = buildOrbitView(d, 'engineer')
      for (const o of v.options) {
        const trial = { ...d, orbit: o.id }, b = computeBudgets(trial, 'engineer'), checks = goNoGo(trial, b).checks
        expect(o.projectedCoverage).toBe(b.projectedCoverage); expect(o.captureDeltaV).toBe(b.captureDeltaV)
        expect(o.checks.slice(0, 3).map((c) => c.resource)).toEqual(['Delta-v', 'Power', 'Science'])
        for (const extra of o.checks.slice(3)) { expect(['Budget', 'Data Link']).toContain(extra.resource); expect(extra.status).not.toBe('green') }
        for (const name of ['Budget', 'Data Link']) {
          const real = checks.find((x) => x.resource === name)!
          expect(o.checks.some((c) => c.resource === name)).toBe(real.status !== 'green')
        }
        for (const c of o.checks) {
          const real = checks.find((x) => x.resource === c.resource)!
          expect(c.status).toBe(real.status); expect(c.reason).toBe(real.reason)
        }
        expect(coverageAt(o, 12)).toBeCloseTo(o.reachable && o.bestIceRate > 0 ? b.projectedCoverage : 0, 6)
        expect(o.verdict.tone === 'bad').toBe(o.checks.some((c) => c.status === 'red'))
        if (o.verdict.tone === 'good') expect(o.checks.every((c) => c.status === 'green')).toBe(true)
      }
    }
  })
  it('gives the verdicts of the LunaH-Map-like design', () => {
    const v = buildOrbitView(lunahMapDesign, 'engineer')
    expect(opt(v, 'orbit-halo').verdict).toEqual({ tone: 'warn', text: 'MAPS TOO SLOWLY' })
    expect(opt(v, 'orbit-elliptical').verdict).toEqual({ tone: 'good', text: 'GOOD MAPPING ORBIT' })
    expect(opt(v, 'orbit-100km').verdict).toEqual({ tone: 'warn', text: 'TOO HIGH FOR THE ICE INSTRUMENTS' })
    expect(opt(v, 'orbit-100km').stripTone).toBe('blind'); expect(opt(v, 'orbit-100km').iceInRange).toBe(false)
    expect(opt(v, 'orbit-elliptical').stripTone).toBe('ice')
  })
  it('blocks orbits the tank cannot reach', () => {
    const o = opt(buildOrbitView(flashlightDesign, 'engineer'), 'orbit-elliptical')
    expect(o.reachable).toBe(false); expect(o.verdict).toEqual({ tone: 'bad', text: 'NOT ENOUGH FUEL TO GET IN' })
    expect(o.checks[0]).toMatchObject({ resource: 'Delta-v', status: 'red' })
    expect(coverageAt(o, 6)).toBe(0); expect(stripCount(o, 12)).toBe(0)
  })
  it('says so when no ice instrument is on board, and still draws grey passes', () => {
    const v = buildOrbitView(createDefaultDesign(), 'engineer')
    for (const o of v.options) {
      expect(o.iceInstruments).toEqual([]); expect(o.stripTone).toBe('none')
      expect(o.verdict).toEqual({ tone: 'warn', text: 'NO ICE INSTRUMENT ON BOARD' })
      expect(coverageAt(o, 12)).toBe(0); expect(stripCount(o, 12)).toBeGreaterThan(0)
    }
  })
  it('names the cause the Power check names when no instrument is on board', () => {
    const o = buildOrbitView({ ...lunahMapDesign, instruments: [] }, 'engineer').selected
    expect(o.checks.find((c) => c.resource === 'Power')!.status).toBe('red')
    expect(o.verdict).toEqual({ tone: 'bad', text: 'NO POWER FOR THE INSTRUMENTS' })
  })
  it('falls back to the first orbit for an unknown id', () => {
    const v = buildOrbitView({ ...lunahMapDesign, orbit: 'orbit-gone' }, 'engineer')
    expect(v.selectedId).toBe('orbit-halo')
  })
  it('runs the time-lapse from 0 to the projected value without NaN, also at 100%', () => {
    const full = opt(buildOrbitView(lunahMapDesign, 'engineer'), 'orbit-elliptical')
    const slow = opt(buildOrbitView(lunahMapDesign, 'engineer'), 'orbit-halo')
    for (const o of [full, slow]) {
      expect(coverageAt(o, 0)).toBe(0)
      let last = -1
      for (let m = 0; m <= 12; m += 0.5) {
        const c = coverageAt(o, m), n = stripCount(o, m)
        expect(Number.isFinite(c)).toBe(true); expect(Number.isFinite(n)).toBe(true)
        expect(c).toBeGreaterThanOrEqual(last); last = c
        expect(n).toBeLessThanOrEqual(600)
      }
    }
    expect(coverageAt(slow, 12)).toBeLessThan(COVERAGE_GOAL)
    expect(stripCount(full, 12)).toBeGreaterThan(stripCount(slow, 12))
  })
})
```

- [ ] **Step 2:** Run `pnpm vitest run src/viz/orbit/orbitView.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3:** Implement `orbitView.ts` to the interface and rules above.
- [ ] **Step 4:** Run the same command. Expected: 8 tests pass. If a verdict test fails because the rules give a different first match, re-read the spec's table order before changing a test. Note: the Budget check may be red or yellow for a fixture on some orbit (the table above did not measure it); the tests are written so that this is allowed.
- [ ] **Step 5:** Commit: `git commit -m "feat(orbit): view model for the orbit view"`.

---

### Task 3: Ice-cap painter

**Files:**
- Create: `src/viz/orbit/icePainter.ts`
- Test: `src/viz/orbit/icePainter.test.ts`

**Interfaces:**
- Consumes: `StripTone` from Task 2.
- Produces:

```ts
export const ICE_SIZE = 512
export const ICE_GLOW = '#e0fbff'
export interface IcePaint { strips: number; tone: StripTone; angle0: number }
export function paintIce(ctx: CanvasRenderingContext2D, p: IcePaint): void
```

What it draws on an `ICE_SIZE` square (port from the mockup's `drawIce`, with these differences): no `Path2D` (it does not exist in the test environment): build all strips as one path with `beginPath` / `moveTo` / `lineTo` / `closePath`, `fill()` it, and for tone `'ice'` rebuild the same path and `clip()` before filling the bright patches. 26 crater patches from a seeded generator (seed 42), always the same. Strip i runs through the centre at `angle0 + i × 2.39996`. Strip width 8 px for `'ice'`, 2 px otherwise. Strip fill: `'ice'` `rgba(103,232,249,.13)`, `'blind'` `rgba(251,191,36,.18)` (amber), `'none'` `rgba(148,163,184,.14)`. Bright patches use `ICE_GLOW` and only for tone `'ice'`. Finish with the dashed cyan outline.

- [ ] **Step 1: Write the failing tests.** Use a recording fake context, as `src/viz/planning/screenPainter.test.ts` does: an object whose methods push `[name, ...args]` to a log and whose property sets (`fillStyle`, `strokeStyle`, …) are recorded through a `Proxy`.

```ts
it('lights ice only when the instruments are in range', () => {
  expect(fillStylesOf({ strips: 40, tone: 'ice', angle0: 0 })).toContain(ICE_GLOW)
  expect(fillStylesOf({ strips: 40, tone: 'blind', angle0: 0 })).not.toContain(ICE_GLOW)
  expect(fillStylesOf({ strips: 40, tone: 'none', angle0: 0 })).not.toContain(ICE_GLOW)
  expect(fillStylesOf({ strips: 0, tone: 'ice', angle0: 0 })).not.toContain(ICE_GLOW)
})
it('draws one four-cornered strip per pass', () => {
  const closes = (n: number) => callsOf({ strips: n, tone: 'blind', angle0: 0 }).filter((c) => c[0] === 'closePath').length
  expect(closes(30) - closes(0)).toBe(30)
})
it('is deterministic and balanced', () => {
  const a = callsOf({ strips: 25, tone: 'ice', angle0: 1 }), b = callsOf({ strips: 25, tone: 'ice', angle0: 1 })
  expect(a).toEqual(b)
  expect(a.filter((c) => c[0] === 'save').length).toBe(a.filter((c) => c[0] === 'restore').length)
  expect(a.flat().every((x) => typeof x !== 'number' || Number.isFinite(x))).toBe(true)
})
```

- [ ] **Step 2:** Run `pnpm vitest run src/viz/orbit/icePainter.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement `icePainter.ts`.
- [ ] **Step 4:** Run again. Expected: 3 tests pass.
- [ ] **Step 5:** Commit: `git commit -m "feat(orbit): ice-cap painter"`.

---

### Task 4: The 3D scene

**Files:**
- Create: `src/scene/OrbitView.tsx`

**Interfaces:**
- Consumes: everything from Tasks 1 to 3.
- Produces:

```ts
export interface LapseClock { months: number } // 0..12, written by OrbitScreen every frame
export function OrbitScene(props: {
  view: OrbitView
  lapse: React.RefObject<LapseClock>
  reduced: boolean
  onPick: (orbitId: string) => void
}): JSX.Element
```

Named `OrbitScene` because `OrbitView` is the model type. The component returns the r3f `<Canvas>` filling its parent (`dpr={[1, 2]}`, background `#03050a`).

Parts, each a small component in this file, ported from the mockup (spec, "The 3D scene"):
- `Stars`, `Moon` (procedural crater canvas as `map` and `bumpMap`), sun and ambient lights, `Earth`.
- `IceCap`: cap geometry of `CAP_ANGLE_DEG`, `MeshBasicMaterial` with a `CanvasTexture` of `ICE_SIZE`. In `useFrame` it repaints only when `stripCount(view.selected, lapse.current.months)` or the picked orbit changed since the last paint. `angle0 = (shape.planeDeg + 90)°` in radians.
- `Ring` × 3: `TubeGeometry` (radius 0.011) over 400 `orbitPoint` samples with per-vertex colour (30% inside `hiddenStretch(shape, SUN_DIR, 1 − sunlitPct/100)`, distance fade beyond 4.5), opacity 1 when picked, 0.22 otherwise, 0.5 on hover; plus an invisible pick tube (radius 0.09) with `onClick` → `onPick(id)` and pointer-cursor on hover. A click must not fire after a camera drag (ignore when the pointer moved more than 6 px).
- `Craft`: dot, glow, 60-point trail, sensor beam, line home; all hidden when `!view.selected.reachable`. Mean anomaly = `(elapsed / shape.period) × 2π`; under `reduced` the craft stands at true anomaly 0. Beam by `view.selected.stripTone`: `'ice'` cyan cone, `'blind'` thin amber flickering cone, `'none'` no beam. The craft is grey inside the sun stretch; the line home is visible outside `hiddenStretch(shape, EARTH_DIR, 1 − earthPct/100)`.
- `CameraRig`: start azimuth 212°, pitch −0.42 rad, looks at (0, −0.15, 0); drag rotates (pitch clamped −1.35..0.9), wheel zooms 3..14, idle drift 0.00035 rad per frame unless `reduced`; distance eases to `shapeFor(selectedId).camDist` on pick. drei's `OrbitControls` or a hand-written rig are both fine.
- Dispose geometries, materials and textures created in `useMemo` on unmount.

No unit tests (no WebGL in the test environment); this task is checked by typecheck, lint, build and Task 6.

- [ ] **Step 1:** Implement `src/scene/OrbitView.tsx`.
- [ ] **Step 2:** Run `pnpm typecheck && pnpm lint`. Expected: no errors (the known react-three-fiber lint warnings about unknown JSX props are acceptable; no new kinds of warning).
- [ ] **Step 3:** Commit: `git commit -m "feat(orbit): 3D orbit scene"`.

---

### Task 5: The screen, panels, fallback and shell

**Files:**
- Modify: `src/ui/steps/OrbitScreen.tsx` (rewrite)
- Modify: `src/ui/screens/DesignScreen.tsx` (the `STEPS_WITHOUT_DIAGRAM` line)
- Modify: `src/ui/Shell.tsx:17`
- Test: `src/ui/screens.smoke.test.tsx` (existing, unchanged)

**Interfaces:**
- Consumes: `OrbitScene`, `LapseClock` (Task 4); `buildOrbitView`, `coverageAt`, `COVERAGE_GOAL`, `OrbitOption` (Task 2); `canUseWebGL` from `src/scene/webgl`; from the store: `design`, `difficulty`, `updateDesign`, `setDesignStep`.

Structure of `OrbitScreen.tsx`:
- `CheckRows({ checks })`: the compact check rows (status dot, name, and the reason when not green), used by both the readout panel and the fallback.
- `PlainOrbit`: today's screen content (summary box, three cards, Back and "Choose Ride →" buttons) in a `h-full overflow-auto p-4` wrapper, plus `CheckRows` for the picked orbit under the summary box (the Dashboard is hidden on this step in the fallback too).
- `OrbitScreen`: `const [scene, setScene] = useState(canUseWebGL)`; render `PlainOrbit` when `!scene` or the column is narrower than 900 px (measure the wrapper with a `ResizeObserver`; before the first measurement assume wide). Otherwise a `relative h-full min-h-[520px] w-full overflow-hidden bg-[#03050a]` wrapper holding: the lazy `OrbitScene` inside an error boundary (`onError` → `setScene(false)`) and `Suspense`; then the HTML overlays.
- Time-lapse clock: a `useLapse(resetKey: string, reduced: boolean)` hook in this file returning `{ clock: RefObject<LapseClock>, shownMonths: number }`. A `requestAnimationFrame` loop: 14 s for 0 → 12, hold 3.5 s, restart; restart when `resetKey` (the picked orbit id plus `design` identity) changes; `shownMonths` is state, updated only when `Math.floor(months × 10)` changes. Under `reduced`: both fixed at 12, no loop.
- Overlays (spec: "Layout", "Readout panel", "Side-view panel", "Orbit cards"): `TopChip`, `ReadoutPanel`, `SidePanel` (hidden below 1000 px column width), `OrbitCards`, and Back / forward buttons in the top corners with `PlanningScreen`'s `StepButtons` overlay styles (Back → `'spacecraft'`, "Choose Ride →" → `'ride'`). Overlay containers are `pointer-events-none` with `pointer-events-auto` on panels and buttons, so the Moon can be dragged between them.
- `ReadoutPanel`: the verdict chip has `aria-live="polite"`; the coverage number shows `coverageAt(selected, shownMonths)` rounded, the sub-line the month-12 value.
- `OrbitCards`: `<button aria-pressed>` per option; ArrowLeft / ArrowRight on a focused card pick the neighbour and move focus.
- Picking calls `updateDesign({ orbit: id })`.

Shell edits:
- `DesignScreen.tsx`: `const STEPS_WITHOUT_DIAGRAM: DesignStep[] = ['planning', 'orbit']`.
- `Shell.tsx`: add at module level `const FULL_BLEED_STEPS: DesignStep[] = ['planning', 'orbit']` (import `DesignStep` from `../sim/types`) and change line 17 to `const fullBleed = showDesignUI && FULL_BLEED_STEPS.includes(designStep)`. If `main` has changed these lines by then, add `'orbit'` to what is there.

- [ ] **Step 1:** Rewrite `OrbitScreen.tsx` and make the two shell edits.
- [ ] **Step 2:** Run `pnpm test`. Expected: all tests pass, including `screens.smoke.test.tsx` (it renders the orbit step through `PlainOrbit`, because `canUseWebGL()` is false without a document).
- [ ] **Step 3:** Run `pnpm typecheck && pnpm lint && pnpm build`. Expected: clean, build succeeds.
- [ ] **Step 4:** Commit: `git commit -m "feat(orbit): orbit view replaces the card list in step 4"`.

---

### Task 6: Check in the browser, then the PR

**Files:**
- Create: `docs/superpowers/specs/assets/2026-11-14-orbit-view-built.jpg` (and one more for the "too high" state)
- Modify: `docs/superpowers/specs/2026-11-14-orbit-view-design.md` (status line; any build-time calls)

- [ ] **Step 1:** Start the dev server (`.claude/launch.json` has `moonshot-dev` on port 5193; the file is untracked, do not commit it) and open the orbit step at 1280 × 720. The game opens on the agency map: the Launch Site building opens this step.
- [ ] **Step 2:** Verify, and fix what fails:
  - each orbit can be picked by ring and by card, and `design.orbit` in the persisted store (localStorage) follows;
  - for each orbit, the month-12 coverage equals the Science value on the Go / No-Go step;
  - the starting design (IR spectrometer) shows "NO ICE INSTRUMENT ON BOARD" with grey strips; after adding the neutron spectrometer in step 2, the 100 km orbit shows the amber beam and 0%, and the halo loop's ring has no dim stretch;
  - a design with the chemical engine shows an unreachable orbit with no craft and a red verdict;
  - arrow keys move the pick between cards; Tab reaches Back and "Choose Ride →"; the "← Agency base" header button works;
  - with WebGL disabled (or `setScene(false)` forced) the plain cards appear;
  - with reduced motion emulated, nothing moves and month 12 is shown;
  - no text overlaps at 1280 × 720 (side view visible) and at a 1000 px column; the scene runs smoothly.
- [ ] **Step 3:** Save two screenshots to `docs/superpowers/specs/assets/`, update the design's status line, list any calls made while building.
- [ ] **Step 4:** Run `pnpm typecheck && pnpm test && pnpm lint && pnpm build`. Expected: clean.
- [ ] **Step 5:** Commit, rebase on the latest `origin/main` (re-apply Task 5's shell edits by hand if they conflict), push, and open the PR with `GH_TOKEN=$(gh auth token --user jakobnunnendorf) gh pr create --repo BrouthenKamel/moonshot-nasa --base main`. Title: "Orbit view for the Orbit Selection step". The body says what was verified and what was not, and ends with "🤖 Generated with [Claude Code](https://claude.com/claude-code)".
- [ ] **Step 6:** Send the PR link to the Integration session (SendMessage to "Integration"). Do not merge.
