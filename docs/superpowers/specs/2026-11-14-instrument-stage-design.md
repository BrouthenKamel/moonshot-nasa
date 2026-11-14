# Instrument stage (Research Lab simulator): design

Status: draft for Jakob's approval, after one builder review. Date: 2026-11-14. Branch: `claude/pensive-archimedes-732967`, on `origin/main` at `9c6d745`.

## Intent and why

Step 2 of Moonshot, Instrument Selection, is a list of cards. The player picks instruments by reading numbers and never sees what an instrument does.

Jakob asked for "some really cool 3D visualisation of the instrument selection where you can see the instrument on the satellite, you can see visually how it measures and covers the lunar surface". The standard he set for the game's steps: "every dial in this step should change something visually and it should look cool, making you excited to continue."

The stage is for players. It should make the central lesson of the mission visible instead of written: the ice sits in craters that never see the Sun, and only an instrument that brings its own signal can read it. It is also one of the most visible screens for the NASA Space Apps judges (pitch Sunday 15 Nov 17:30, submission closes 23:59).

## What Jakob decided

1. **Picture and rules, not picture only.** The instruments must behave differently in the game, not only look different. The logic core now on `main` already does this (see "What exists today"), so this work changes no rules.
2. **The starter design may fall short.** A player who changes nothing does not meet the coverage target and has to fix it. The core already behaves this way: the IR spectrometer alone maps 0% of the ice.
3. **Look: the chase camera** (option C of three browser mockups; see Approaches).
4. **Prototype first.** A throwaway prototype was built and Jakob approved its direction ("I love it").
5. **It lives in the Research Lab.** The agency map is the menu for all mission decisions. The player reaches this screen by entering the Research Lab, the Science building, "where the team decides what the mission can see and measure". The stage is framed as that lab's mission simulator. Jakob approved this framing together with the prototype.

## Goals

1. On the Instruments step, a live 3D chase view replaces the flat diagram: the satellite flies low over cratered ground, and each chosen instrument is mounted on it and visibly measures the ground.
2. Every instrument trait the core uses is visible in the picture: whether it sees into shadow, how wide its footprint is, what its data counts as, its altitude limit, its need for precise pointing, and whether there is power to run it.
3. The forecast on the stage (ice coverage against the 70% target, sunlit-ground coverage, science data) is the same number the dashboard and Go / No-Go show.
4. Two what-if dials, orbit and pointing, let the player see what the other buildings' decisions do to the science, without changing the design.
5. Instruments are chosen on the stage itself, at most two, and the picture answers within a moment.

## Non-goals

- No change to `src/sim` or `src/data`. No rule, number or balance changes.
- No change to other steps, the replay, the agency map, or how the map opens this step (the Integration session owns that wiring).
- No real lunar terrain data. The ground is generated in code.
- No new dependencies, no sound, no mobile layout.
- No jump links from the stage to other buildings. The dials name the building; they do not navigate.

## Anti-goals (a failure even if it works technically)

- The picture contradicts the numbers. A beam shown reading the ground while the core says the instrument maps nothing, or the reverse.
- An effect that no label or number explains. Every visual state must be named in words on the stage.
- Choosing an instrument feels slower than it does today.
- The step stops working where WebGL is unavailable, or the screen render test breaks.
- The stage hides or "fixes" a disagreement inside the core (see Known issue).

## Constraints

- Stack is fixed: Vite, React 19, TypeScript, Tailwind 4, react-three-fiber 9, drei 10, three 0.187, Zustand, Zod, Vitest. `pnpm typecheck`, `pnpm lint` and `pnpm test` must pass.
- The sim stays pure in `src/sim`. New pure helpers for the stage get unit tests; React and three.js components are verified in the browser.
- All numbers come from the logic core: the catalogue in `src/data/parts.ts` and `src/data/orbits.ts`, and `computeBudgets()` in `src/sim/budgets.ts`. No second copy of mission maths.
- The screen reads `design.instruments` and `difficulty` from `useGameStore` and writes only through `updateDesign({ instruments })`, so the map labels and Go / No-Go stay in sync.
- `src/ui/screens.smoke.test.tsx` renders every design step with `renderToString` in a Node environment. The Instruments step must keep rendering there without throwing.
- Shared files that go through the Integration session first, and that this work does not edit: `src/sim/*`, `src/data/*`, `gameStore.ts`, `agencyStore.ts`, `App.tsx`, `BaseScreen.tsx`, `BaseMap.tsx`, `Shell.tsx`. The one exception, already cleared, is the list entry in `DesignScreen.tsx` below.
- `src/ui/screens/DesignScreen.tsx` is shared. The Interfaces session is adding a list `STEPS_WITHOUT_DIAGRAM: DesignStep[]` there. Once that is on `main`, this work adds `'instruments'` to the list and makes no other change in that file. On 14 Nov at 17:25 the list was not yet on `main` or any local branch. If that is still so when this work starts, add the same list with `['instruments']` so the two changes merge cleanly.
- Desktop browsers at laptop width (1440 wide is the reference). The step stays inside the Shell: step rail left, resource dashboard right, about 960 px for the stage.

## Approaches considered

**The look** (shown to Jakob as three browser mockups):

- **A. Polar pass.** The south pole fills the stage and the satellite paints coverage on it. Strong: the painted area is the coverage number. Weak: the instrument on the satellite is tiny.
- **B. Workbench and map.** Satellite close-up on the left, pole map on the right. Strong: clearest to read. Weak: a diagram, nothing flies.
- **C. Chase camera (chosen by Jakob).** The camera rides behind the satellite low over the craters; the beam hits the ground ahead. Strong: most cinematic, shows how each instrument measures. Weak: overall coverage is only a number and a ring, and it needs the most 3D work.

**How it is built** (Claude's call; Jakob left the how open):

- **Real 3D scene in react-three-fiber (chosen).** Already installed and used for the replay and the agency map. The beam can follow the ground over a crater rim, and the camera can be nudged.
- **Layered flat picture.** Cheaper, but Jakob asked for 3D, and a flat picture cannot show the beam tracking the terrain.
- **Pre-rendered clip.** Cannot react to the player's choices, which is the point.

## What exists today (verified by reading the code on `main`)

- `InstrumentPart` in `src/data/parts.ts` has, per instrument: `seesShadow`, `maxAltitudeKm` (null = any), `footprint` (share of the polar region seen per pass), `kind` (`ice`, `context`, `outreach`), `qualityWithoutPrecisePointing`, `dataPerTurn` (MB), `power`, `mass`, `volume`, `cost`, `flownOn`.
  - Laser: sees shadow, below 20 km, footprint 0.025, ice, half quality without precise pointing.
  - Neutron spectrometer: sees shadow, below 25 km, footprint 0.01, ice.
  - IR spectrometer: needs sunlight, any altitude, footprint 0.02, context.
  - Camera: needs sunlight, any altitude, footprint 0.05, outreach.
- `computeBudgets(design, difficulty)` returns, among others: `quality[id]` (0 to 1: altitude limit times pointing), `coverageRate[id]`, `scienceDuty` (0 to 1: share of the time there is power for the instruments), `projectedCoverage` (% ice after 12 clean turns), `projectedContext` (% sunlit ground), `projectedData` (MB), `projectedOutreach`.
- `LunarOrbit` in `src/data/orbits.ts` has `altitude` (km over the pole: 15, 15, 100), `passesPerTurn` (4.5, 141, 366) and `sunlitShare`. Attitude parts have `precise: boolean` (`attitude-basic`, `attitude-precision`).
- `InstrumentsScreen.tsx` toggles instruments with `[...current, id].slice(-2)`: at most two, the oldest makes room.
- `DesignScreen.tsx` renders `DesignDiagramPanel` (flat cutaway, mission strip and the "What this choice changed" line) above every step.
- The Go / No-Go "Science" check is never red: a design that cannot meet the brief may still fly.

## The prototype and what it taught

`src/scene/InstrumentStageSpike.tsx` is a throwaway prototype, uncommitted, mounted on the Instruments step. It has no tests and lint warnings. **It is a reference for look and behaviour, not code to keep.** The production stage is written fresh, in testable pieces.

What it showed:

1. **The instrument bar must sit under the picture.** Inside the picture it covered the beam's landing point.
2. **Shadows should come from the ground's shape.** The prototype works out once which ground a Sun 9° above the horizon reaches. The same map darkens the ground and decides "is the instrument over shadow right now", so the read-out always matches the picture.
3. **Moving the ground, not the satellite,** keeps the beam's landing point still on screen, where the eye can follow it.
4. **Camera and controls must be created once.** Passing an altitude-dependent camera position as a prop makes react-three-fiber re-apply it on every change, on top of the animated move.
5. **The camera instrument reads poorly** as a thin frame on the ground. It needs a stronger idea.
6. **Passes per turn are not shown,** although they drive coverage as much as altitude does.

## Decided design

### The screen

```
┌ step rail ┬───────────────────────────────────────────────┬ dashboard ┐
│           │ [forecast ring]   [over: sunlit / dark]  [lab  │           │
│           │                                         simu-  │           │
│           │        sky, low Sun, Earth              lator  │           │
│           │   ────────── horizon ──────────         dials] │           │
│           │      satellite with instruments                │           │
│           │            \ beam                [per-instru-  │           │
│           │   cratered ground, dark crater    ment read-   │           │
│           │                                    outs]       │           │
│           ├───────────────────────────────────────────────┤           │
│           │ [IR spectr.] [Laser] [Camera] [Neutron spectr.]│           │
│           ├───────────────────────────────────────────────┤           │
│           │ What this choice changed: …                    │           │
│           │ existing heading, summary and instrument cards │           │
└───────────┴───────────────────────────────────────────────┴───────────┘
```

- The stage is about two thirds of the viewport height, full width of the main column.
- The instrument bar is docked directly under the picture: four buttons, each with colour, short name, mass, power, cost, and "sees into shadow" or "needs sunlight". Selected ones glow in their colour.
- The existing cards stay below as the detailed catalogue. Bar and cards change the same store value.
- The flat cutaway and mission strip are not shown on this step. The "What this choice changed" line must stay visible on this step, under the instrument bar.

### The scene

- **View.** The camera sits behind, above and to the right of the satellite, looking forward and down. At the lowest orbit the horizon is about 30% from the top, with a low Sun ahead and Earth in the sky. The player can drag to look around within limits; no zoom, no pan.
- **Ground.** Generated in code from a fixed seed, so it is the same on every load: gently rolling regolith, about ten large craters and about seventy small ones, on a tile that repeats seamlessly along the flight direction. One deep crater lies on the ground track; its floor is in shadow.
- **Light.** A Sun 9° above the horizon, ahead and slightly left. Shadows are worked out once from the ground's shape and baked into the ground's colour. No real-time shadow maps and no post-processing.
- **Motion.** The ground slides under the satellite at constant speed; one loop takes about 19 seconds, of which about 6 are over the dark crater. So every loop shows each instrument over sunlit ground and over shadow.
- **Satellite.** A 6U-like bus with two solar wings, a dish and a thruster, larger than life. Chosen instruments hang under the bus as coloured modules with an aperture: one centred, two side by side.
- **Colours.** Laser green `#22c55e`, IR spectrometer amber `#f59e0b`, neutron spectrometer purple `#a855f7`, camera blue `#3b82f6`. These match the instrument bar and read-outs.

### What each instrument shows

| Instrument | Over sunlit ground | Over shadow | Driven by |
|---|---|---|---|
| Laser | Four thin beams to a faint spot | The spot and a wide green glow light the crater floor; small white sparkles mark an ice signal | `seesShadow`, `footprint` |
| IR spectrometer | A translucent amber cone and a bright footprint | Cone and footprint fade to almost nothing | `seesShadow`, `footprint` |
| Neutron spectrometer | Purple rings rise from the ground to the satellite | The same: it works in light and dark | `seesShadow`, `footprint` |
| Camera | A frame on the ground and a shutter flash every 1.5 s | The frame dims and no flash fires | `seesShadow`, `footprint` |

The footprint on the ground is the catalogue `footprint` times one constant for all instruments, so the camera's is the widest and the neutron spectrometer's the narrowest, as in the core.

**The camera needs a stronger picture than the prototype's.** Requirement: at the reference width it must be as easy to see as the other three, and it must be obvious that it takes pictures and maps no ice. How is left to the builder.

### What each dial changes

| Dial | Where it is set | Number from the core | What changes in the picture | Words on the stage |
|---|---|---|---|---|
| Instrument on or off | Instrument bar or cards | `design.instruments` | Module appears under the bus; its beam appears | Read-out card appears |
| Second instrument | Same | Same | Second module and beam beside the first | Second read-out card |
| Orbit altitude | What-if dial (design value by default) | `orbit.altitude`, `quality[id]` | Satellite and camera climb; the ground falls away. Above an instrument's limit its beam thins and fades towards the ground in step with its strength | "too high at 100 km: works below 20 km" |
| Passes per turn | What-if dial, same control | `orbit.passesPerTurn` | Nothing in the 3D picture (see Claude's calls) | "141 passes over the pole per turn" in the forecast panel |
| Pointing | What-if dial (design value by default) | `attitude.precise`, `qualityWithoutPrecisePointing` | The beam's landing point shakes for an instrument that needs precise pointing | "shaky aim: needs precise pointing" |
| Power available | Not a dial here; follows the design | `scienceDuty` | Beams switch off for part of the time when below 1 | "power for only 60% of the time" |

**Strength.** Each read-out shows `quality[id]` as "N% strength", and the beam's brightness follows it. The stage has no cut-off of its own: a weak beam fades, it is not declared dead, because the core still counts it. Below 0.2 the read-out says "Very weak at this height" (or "Very weak" when pointing is the cause). At exactly 0 the beam is off and the read-out says "Out of range at this height".

### Overlays on the stage

- **Forecast** (top left): a ring with `projectedCoverage` and a mark at 70%, green at or above target and amber below. Beside it: "after 12 clean turns · target 70%", `projectedContext` as "sunlit ground N%", `projectedData` as "science data N MB", and the orbit's passes per turn.
- **Where the pass is** (top centre): "Over sunlit ground" or "Over a crater that never sees the Sun", switching as the ground slides by.
- **Research Lab simulator** (top right): title, one line "Try the other buildings' choices here. Your design stays as it is.", the three orbits under "Orbit · decided at the Launch Site", and Basic or Precise under "Pointing · built at the Factory". Both start at the design's current values.
- **Read-outs** (bottom right), one card per chosen instrument: name, strength, what it is doing right now ("Reading the dark crater floor", "Reading sunlit ground", "Blind right now: no sunlight down there", "Very weak at this height"), what it counts as (ice with its coverage rate per turn, "maps sunlit ground only: adds no ice coverage", or "pictures only: adds no ice coverage"), and any problems.
- **Why the forecast is what it is** (under the forecast ring): see the next section.
- **Empty bay:** with no instrument chosen the satellite flies with nothing under it and a card says "The instrument bay is empty. Pick one or two below."

### When the forecast and the picture differ

The picture shows one pass as the instrument would see it. The ring shows what the whole mission is forecast to bring home. The core's forecast also depends on things the picture does not show: whether the craft can reach and hold the orbit, and whether the data gets home. Whenever one of these cuts the forecast, the stage names it in a line under the ring, with the building where it is decided. Each line comes from a number the core returns:

| Condition in the core | Line on the stage |
|---|---|
| `captureDeltaV === null`, or `upkeepTurns` is 0 | "This craft cannot reach and hold this orbit, so nothing is mapped. Engine: Factory. Orbit and ride: Launch Site." |
| `upkeepTurns` between 1 and 11 | "Propellant holds this orbit for N of 12 turns." |
| `projectedLost` above 0 | "The link is full: N MB never gets home, and its coverage is lost with it. Link: Comms Center." |
| No chosen instrument has `kind` `ice` | "Nothing aboard sees into shadow: no ice is mapped." |

With a camera aboard, the forecast panel also shows `projectedOutreach` as "pictures N MB", so its work is counted somewhere.

The orbit options in the what-if dial stay selectable even when the craft cannot reach them: seeing what a better engine would buy is the point of a simulator. The line above says why the forecast is zero.

### What-if dials and the store

The dials are local to the stage. The stage calls `computeBudgets` on a copy of the design with the dial values swapped in and shows that result everywhere on the stage. It never writes orbit or attitude to the store. When the dials equal the design's values, the stage's numbers equal the dashboard's.

When a dial differs from the design, the stage must say so plainly, so a player does not take a what-if forecast for their real one (see Claude's calls).

### Robustness

- The stage is loaded lazily, so the game's first paint does not wait for it and the server-side render test never executes WebGL code.
- If WebGL is unavailable or the stage throws, the step shows the flat `DesignDiagramPanel` as today and stays fully usable.
- With "reduce motion" set in the system, the ground does not slide; the picture holds a frame over the dark crater.
- The ground and its shadows are worked out once per page load and reused.

### Where code goes

- `src/scene/instrumentStage/` (new): the stage component, the scene pieces (ground, satellite, one piece per instrument effect, sky, camera rig) and the overlays.
- Pure, unit-tested modules beside them:
  - **ground:** height at a point, the baked shadow map, shadow at a point. No three.js imports.
  - **stage model:** from a design, the dial values and budgets, the per-instrument view state (strength, very weak or not, shaky, powered share, what it counts as, problem texts), the forecast values and the forecast reason lines.
- `src/ui/steps/InstrumentsScreen.tsx`: mount the stage and the instrument bar above the existing content.
- `src/ui/screens/DesignScreen.tsx`: add `'instruments'` to `STEPS_WITHOUT_DIAGRAM` (see Constraints).
- `src/viz/`: make the "What this choice changed" line usable on its own, so this step can show it without the cutaway.
- Remove `src/scene/InstrumentStageSpike.tsx` and its mount.

### Testing

Unit tests (Vitest, next to the code):

- **Ground:** the same on every call; heights at the start and end of the tile match; the centre of the on-track crater is in shadow; open ground on the track before it is sunlit.
- **Stage model**, using the core's real catalogue and `computeBudgets`:
  - IR spectrometer alone: counts as sunlit ground, "adds no ice coverage", forecast ice 0%.
  - Laser on the 15 km elliptical orbit with precise pointing: strength 1, reaches the ground, not shaky.
  - The same with basic pointing: strength 0.5, shaky, problem text names pointing.
  - Laser at 100 km: flagged very weak, strength equals the core's `quality`, problem text names the 20 km limit.
  - Neutron spectrometer at 100 km: strength equals the core's `quality` (the test must not hard-code the formula, which is about to change), problem text names the 25 km limit.
  - A design with `scienceDuty` below 1: powered share equals it, problem text names power.
  - Dials equal to the design: the stage's forecast equals `computeBudgets(design)`.
  - `flashlightDesign` from `src/sim/fixtures.ts` with the camera added: `projectedLost` is above 0 and the link line appears with that number.
  - `flashlightDesign` with the orbit dial on the elliptical orbit: the forecast is 0% and the "cannot reach and hold this orbit" line appears.
  - Camera alone: the "nothing aboard sees into shadow" line appears and the panel shows the outreach MB.
  - A design with nothing cutting the forecast: no reason lines.
- `screens.smoke.test.tsx` keeps passing for the Instruments step.

Browser check at 1440 × 900, reported with what was seen: each instrument alone over sunlit ground and over the crater; two instruments; none; all three orbits; basic and precise pointing; dragging the view; the fallback with WebGL off; picking instruments quickly several times.

## Known issue, not part of this work

At the 100 km orbit the laser has strength 0.02, yet `projectedCoverage` is 89%, because 366 passes a turn outweigh the altitude penalty. The orbit's own text says 100 km is too high for the ice instruments. The Integration session owns the logic core, has confirmed this, and is taking it to Jakob as a model decision. The stage shows what the core returns and does not adjust it: at 100 km it shows a very weak, fading beam, "2% strength", and a green 89% ring. That looks odd because the model is odd there. If the formula changes, the stage follows with no change.

Update, 14 Nov 17:28: the Integration session reports a fix on its own branch, not yet on `main`: an ice instrument above its `maxAltitudeKm` gets quality 0 and maps nothing. The stage then shows the beam off, "Out of range at this height" and a 0% ring at 100 km.

Separately, `src/state/gameStore.test.ts` has one failing test on `main` at `9c6d745` ("stays on simulation after the last turn and stores run data"). It imports only the store and is unrelated to this work; the Integration session owns that file.

## Delivery

The pitch is on Sunday 15 Nov at 17:30. The stage should be on `main` before it. Work is ordered so that it can stop after any slice and still ship:

1. **Parity, done properly.** The two pure modules with their tests; the stage rebuilt on them to do what the prototype does; lazy loading, the WebGL fallback and the render test. The prototype stays mounted until this slice matches it, and is deleted in the same change.
2. **Honest forecast.** The reason lines under the ring, the outreach figure, the what-if warning, and the "What this choice changed" line on this step.
3. **Polish.** The stronger camera picture, reduced motion, overlay tuning below 1440 wide.

If time runs out, slice 3 is cut first, then the what-if warning and the delta line from slice 2. The reason lines are not cut: without them the stage breaks its own first anti-goal.

The work lands as one pull request into `main` from this branch, rebased on the latest `main` first. Before the pull request: `pnpm typecheck && pnpm test && pnpm lint && pnpm build`. This session does not merge it. The Integration session says Jakob has made it the coordinator for all game sessions and that it merges with his go; this session follows that and reports the pull request to it.

## Claude's calls (Jakob can overrule)

1. **The step stays inside the Shell,** with step rail and dashboard, as today. Jakob was told this and did not ask for full width.
2. **No rules changed.** The four rules Claude first proposed were dropped once the logic core turned out to have better ones.
3. **Ground generated in code,** not real lunar elevation data. It can be swapped later behind the ground module.
4. **The instrument bar and the cards both stay.** The bar is the quick picker; the cards carry the description, volume, data rate and "flown on".
5. **Passes per turn are shown as words,** not as a change in flight speed, because a speed 80 times higher between orbits would be unwatchable.
6. **A what-if warning.** When a dial differs from the design, the forecast panel carries a line such as "What-if: not your design" and the ring is drawn dashed.
7. **Dials name buildings but do not navigate.** Navigation belongs to the map.
8. **The "What this choice changed" line stays on this step,** which needs a small change in `src/viz/`.
9. **The beam points forward and down,** not straight down, so its landing point is in view. Real instruments point at the ground below; this is a picture choice.
10. **Satellite and instruments are drawn larger than life.**

Settled after the builder review:

11. **The stage ships before the pitch, in three slices with a cut line** (see Delivery). Jakob gave no deadline; this is Claude's reading of the hackathon schedule.
12. **Forecast cuts are named on the stage,** not left silent and not handled by disabling orbit options (see "When the forecast and the picture differ").
13. **No strength cut-off in the stage.** The prototype let a weak beam die before the ground and said "Too weak to read the ground". The core has no such threshold, so the production stage fades the beam and says "Very weak at this height".

## Left to the builder

- The stronger picture for the camera instrument.
- Exact art: crater count and sizes, light strength, glow sizes, satellite detail, how a module appears when chosen.
- How the scene pieces are split into files inside `src/scene/instrumentStage/`.
- How the "What this choice changed" line is made reusable.
- Camera framing at each altitude, within "satellite, landing point and, at the low orbits, the horizon are all in view and not covered by an overlay".
- Overlay sizes and wrapping at widths between 1280 and 1440.
