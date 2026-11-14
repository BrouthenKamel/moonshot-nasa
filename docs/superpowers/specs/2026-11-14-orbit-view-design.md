# Orbit view for step 4 (Orbit Selection): design

Status: direction approved by Jakob on 2026-11-14 (he chose "A: space view", then said "Yes, write design" after the mockup). Reviewed once by a builder check; aligned with `docs/DESIGN-DIRECTION.md`. Implemented on 2026-11-14 (screenshots: `assets/2026-11-14-orbit-view-built.jpg`, `assets/2026-11-14-orbit-view-built-too-high.jpg`). Branch: `claude/orbit-selection-visual`, cut from `main` at bc9574c.

Reference, approved as the direction:

- Clickable mockup: `docs/superpowers/specs/assets/2026-11-14-orbit-view-mockup.html` (plain three.js, throwaway; serve the folder and open it with an internet connection).
- Screenshots: `assets/2026-11-14-orbit-view-elliptical.jpg` (a good orbit) and `assets/2026-11-14-orbit-view-too-high.jpg` (the 100 km orbit).

The mockup is the reference for look, layout and behaviour. Where this document and the mockup differ, this document wins. The mockup's numbers and its "Pretend your engine is" buttons are stand-ins and are not part of the design.

## Intent and why

Moonshot is a game where a player designs a 6U CubeSat to map lunar ice and then flies it turn by turn (one turn = one month). Step 4, Orbit Selection, is a three-way pick between a halo loop, an elliptical polar orbit and a low circular orbit. Today it is a text column with three cards (`src/ui/steps/OrbitScreen.tsx`).

Jakob wants this step to get a visual of the same quality as the mission control room (Planning step, merged in PR #7) and the instrument selection: every choice changes something the player can see, and the screen makes the player want to continue. Presentation is one of five judging criteria at the hackathon pitch on Sunday 15 November 2026 at 17:30.

The step has one lesson that must stay visible: the ice instruments only work close to the surface (laser below 20 km, neutron spectrometer below 25 km). At 100 km they map nothing, however many passes the orbit makes.

## Goals

1. The Orbit step shows the Moon in space, filling the main column, seen from below so the south pole faces the camera.
2. The three orbits are glowing rings around the Moon, each in its own colour. The player picks one by clicking its ring or its card at the bottom. The picked ring is bright, the others dim.
3. The craft flies the picked orbit while a 12-month time-lapse runs. Each pass paints a strip across a marked south-pole cap; ice lights up in the dark craters only where a strip has passed. The lit share follows the game's own coverage number.
4. Each number the orbit changes has a picture:
   - **passes over the pole**: the strips on the cap;
   - **height over the pole**: a side view of the pole pass with the instruments' range band, and a sensor beam under the craft (cyan when in range, red and broken when too high);
   - **sunlight and shadow**: the ring has a dim stretch behind the Moon whose length is the orbit's share of time in shadow, and the craft dims there;
   - **Earth in view**: a thin line from the craft to a far blue Earth, which is cut for the orbit's share of time without Earth in view;
   - **fuel to get in and to hold**: a bar against the fuel on board;
   - **ice mapped in 12 months**: a large number and a bar with the 70% goal marked.
5. A verdict in plain words sits above the numbers (for example "GOOD MAPPING ORBIT", "TOO HIGH FOR THE ICE INSTRUMENTS").
6. Because the step hides the Resource Dashboard, the Go / No-Go checks an orbit pick can move are shown inside the step with their reason text: Delta-v, Power and Science always, Budget and Data Link when they are not green.
7. The step works with the keyboard, with reduced motion, and when 3D is unavailable; the existing test suite still passes.

## Non-goals

- No change to game rules, data, constants, scoring or the stores. The step only writes `updateDesign({ orbit })`.
- No rocket, launch or Earth-Moon transfer path: that is the Ride & Transfer session's step (border below).
- No change to `RideScreen.tsx`, `MissionStrip`, or any other step.
- No sound, no phone layout, no external models, textures or fonts. Everything is procedural.
- No true-scale geometry: heights are exaggerated and the halo loop is shortened (see "Shapes").

## Anti-goals (a failure even if it works technically)

- The scene shows a number or a status that differs from `computeBudgets` or `goNoGo`. In particular: red means blocked and is used only when a Go / No-Go check is red; the verdict is never green while a shown check is not green.
- The 100 km orbit looks fine. A player must see at a glance that it maps no ice with ice instruments.
- Text too small to read on a laptop or a projector (minimum 12 px in the panels).
- The scene stutters on a normal laptop during the pitch.
- A player without working 3D, or using only the keyboard, cannot complete the step.

## Constraints

- Stack already in the repo: React 19, TypeScript, Tailwind 4, three 0.187, `@react-three/fiber` 9, `@react-three/drei` 10, Zustand. No new dependencies.
- Tests run in Vitest with `environment: 'node'`. `src/ui/screens.smoke.test.tsx` renders every design step with `renderToString` and expects more than 500 characters of HTML and no `NaN`. There is no DOM, canvas or WebGL in tests.
- Coordinator rules (Integration session): never commit to `main` or merge; open a PR and tell Integration. Before the PR run `pnpm typecheck && pnpm test && pnpm lint && pnpm build`. The only shared files this work may touch are the two lines named under "Shell integration".
- Facts this step shows:
  - Orbit facts from `src/data/orbits.ts`: `altitude`, `farPointKm`, `passesPerTurn`, `sunlitShare`, `eclipseHours`, `earthVisible`, `stationKeepingDeltaV`.
  - Per orbit, from `computeBudgets({ ...design, orbit: id }, difficulty)`: `captureDeltaV` (null = no way in), `deltaVAvailable`, `deltaVAfterCapture`, `upkeepTurns`, `deltaVStationKeeping`, `batteryNeedWh`, `batteryUsableWh`, `batteryOk`, `scienceDuty`, `quality[instrumentId]`, `coverageRate[instrumentId]`, `projectedCoverage`.
  - Per orbit, from `goNoGo(trialDesign, trialBudgets)`: the checks named `Delta-v`, `Power`, `Science`, `Budget` and `Data Link` (status and reason). The orbit moves Budget through the transfer time of an ion engine, and Data Link through `earthVisible`.
  - An ice instrument is an instrument part with `seesShadow: true`. Its `maxAltitudeKm` is 20 (laser) or 25 (neutron); it works at that height and below (`altitude <= limit`). Above it `quality` is 0.
  - `budgets.projectedCoverage` is the game's projection: it counts only ice instruments, only coverage that was sent home, and runs for `min(12, upkeepTurns)` turns. The scene never recomputes it.

## Border with the Ride & Transfer session (agreed 2026-11-14)

Both steps live in the Launch Site building. `openBuilding('launch-site')` opens orbit first, then ride.

- This step draws the Moon end: the three science orbits. Ride & Transfer draws the rocket, the launch and the Earth-Moon path. The capture burn is the seam.
- Earth appears here only as a far blue dot labelled "Earth", with the line home. No journey is drawn.
- Shared look: background `#03050a`; amber = caution, red = blocked; slow camera motion that is off under reduced motion; plain cards as fallback. From the shared design direction: the Launch Site's role colour, orange `#f97316`, is the accent of both steps' interface (title line, panel headings, focus rings), and the title line reads `LAUNCH SITE · LUNAR ICE MAPPER · ORBIT`.
- Orbit colours, used by both sessions (their transfer path ends in the picked orbit's colour): halo loop violet `#a78bfa`, elliptical lime `#a3e635`, low circular sky blue `#38bdf8`. Cyan (`#22d3ee`, `#67e8f9`) is reserved for ice and the sensor beam. A picked orbit is shown by brightness, not by a colour change.
- File names: this step uses `src/scene/OrbitView.tsx` and `src/viz/orbit/*`. It does not use `LaunchSite*` or `LaunchPad*`.
- Buttons: Back goes to `spacecraft`, forward ("Choose Ride →") to `ride`.

## Approaches

1. **Space view (chosen by Jakob).** The Moon fills the screen; rings, craft and ice cap in 3D; numbers in panels laid over the scene. The Moon is as large as it can be and the pick is direct.
2. **Trajectory room.** The same Moon on the big screen of a Launch Site room, with three orbit buttons on a console. It would match the control room, but the Moon would be about half the size and the room adds little to a three-way pick. Rejected by Jakob.
3. **Flat diagram.** A 2D side view with three ellipses. Cheapest, but it cannot show the passes fanning over the pole, which is the heart of the step. Not offered.

Within approach 1 the panels are ordinary HTML over the canvas, not canvas-painted textures as in the control room. Reason: here the text does not sit on a 3D surface, and HTML gives real buttons, crisp text and screen-reader support for free. (My call.)

## The design

### Layout (main column, full bleed)

- Whole column: the 3D canvas on `#03050a`.
- Top left: "← Back" button. Top right: "Choose Ride →" button. Same styles as `PlanningScreen`'s overlay buttons.
- Top centre: the title line `LAUNCH SITE · LUNAR ICE MAPPER · ORBIT` in orange `#f97316`, and under it the time-lapse label `TIME-LAPSE · MONTH n OF 12`.
- Right, below the button: the readout panel, about 290 px wide.
- Left, above the cards: the side-view panel, about 270 px wide.
- Bottom: three orbit cards in a row.
- Panels: `rgba(2, 6, 23, .72)` with a thin slate border, 12 px radius and backdrop blur.
- Below 1000 px of column width the side-view panel is hidden; below 900 px the step uses the plain fallback. (My call. At a 1280 px window the column is 1088 px, so everything shows.)

### The 3D scene

- **Stars**: about 2,000 points on a far shell.
- **Moon**: sphere of radius 1 with a procedural crater texture (also used as bump map), lit by one sun light plus a weak ambient light so the night side is not black. The polar axis is the scene's y axis; the south pole is at −y.
- **Camera**: starts below the equator (pitch about −24°), so the south pole faces the viewer. Drag rotates, scroll zooms between fixed limits, no panning. It drifts slowly around the Moon when idle. Its distance eases to a per-orbit value on pick (the halo loop needs a wider view).
- **Ice cap**: a spherical cap of 30° around the south pole, just above the surface, carrying a canvas texture painted by `icePainter`: a dashed outline, dark crater patches with a thin cyan rim ("ice may be here"), the pass strips, and bright ice inside the patches where strips have passed. The cap is unlit (always readable).
- **Rings**: one tube per orbit with per-vertex brightness: 30% inside the orbit's shadow stretch (see "Shadow and Earth stretches"), and fading with distance beyond 4.5 Moon radii (the halo loop fades out instead of ending). Picked ring opacity 1, others 0.22. Each ring has a wider invisible tube for clicking; hovering one brightens it and shows a pointer cursor.
- **Craft**: a small bright dot with a soft glow and a short trail in the orbit's colour, moving by Kepler's law (fast at the low point). It is grey while inside the shadow stretch.
- **Sensor beam**: while the craft is over the cap, a cone from the craft to the surface. Cyan when at least one ice instrument is in range; amber, thin and flickering when ice instruments are on board but out of range ("no signal"); absent when no ice instrument is on board.
- **Earth**: a small blue sphere far away with a faint glow, plus a thin blue line from the craft while it is outside the Earth-hidden stretch.
- An orbit is **reachable** when `captureDeltaV !== null` and `deltaVAvailable >= captureDeltaV` (the cases in which the game's projection maps nothing). An engine too weak to thrust (`thrustLevel === 0`) still flies in the scene, because `computeBudgets` still projects coverage for it; the red verdict "NO POWER TO FLY THERE" carries the problem. When the picked orbit is not reachable, no craft, trail, beam or strips are drawn, coverage is 0, and the top label reads `THE CRAFT NEVER ARRIVES IN THIS ORBIT`.

### Shapes (stylised, fixed per orbit id)

Moon radius = 1. All three orbits are polar (their plane contains the y axis). The low point is over the south pole.

| Orbit | Low point radius | Far point radius | Plane angle | Seconds per lap | Camera distance |
|---|---|---|---|---|---|
| `orbit-halo` | 1.035 | 9 (true: about 40) | 0° | 15 | 8.6 |
| `orbit-elliptical` | 1.035 | 2.81 (true) | 65° | 9 | 6.4 |
| `orbit-100km` | 1.18 | 1.18 | 65° | 6 | 5.2 |

Low heights are exaggerated about four times (15 km would be 1.009, 100 km 1.058). Earth direction: azimuth 14°, raised 0.42. Sun direction: azimuth 160°, raised 0.05. Camera start azimuth 212°. These values are from the mockup and may be tuned by eye. An orbit id not in this table gets the circular shape. A hint line says "Heights are exaggerated".

### Shadow and Earth stretches

The stylised shapes do not give the real shadow times, so the dim stretch of a ring and the cut in the line home are sized from the data, not from the drawn geometry (the mockup uses geometry; this replaces it). For a direction d (the sun or Earth) and a hidden share h (`1 − sunlitShare`, or `1 − earthVisible`): the stretch is centred on the point of the orbit that lies deepest behind the Moon as seen from d, and covers the share h of the lap **in time** (mean anomaly). With h = 0 there is no stretch: the halo loop is never dim, matching "Never in the Moon's shadow".

### Time-lapse

- A loop: 14 s for the 12 months, a 3.5 s hold at the end, then restart. It also restarts on every pick.
- Coverage at month t (0 to 12) for the picked orbit: `projectedCoverage × (1 − (1 − r)^t) / (1 − (1 − r)^12)`, where r is the best `coverageRate` among the ice instruments on board. If r is 0 or the orbit is not reachable, coverage is 0. So month 12 always equals `budgets.projectedCoverage`, the number the rest of the game shows. The curve between is an illustration scaled to that projection, not a second simulation.
- Strips drawn on the cap: when ice instruments are in range, `n = min(600, round(−ln(1 − min(coverage, 99.5) / 100) / 0.02))`, so the lit share of the cap tracks the coverage number. When they are out of range: thin amber strips, `min(300, passesPerTurn × t)`, lighting nothing. With no ice instrument on board: the same count of thin grey strips, lighting nothing, so the scene still shows the passes. Strip i lies through the pole at angle `i × 2.39996` rad (golden angle).
- Reduced motion: no time-lapse, no camera drift, no flicker; the scene shows the month-12 state and the craft stands at the low point.

### Readout panel (right)

Top to bottom, all for the picked orbit:

1. **Verdict chip.** First match wins:

   | Condition | Tone | Text |
   |---|---|---|
   | Delta-v check red and `captureDeltaV === null` | red | `CANNOT REACH THIS ORBIT` |
   | Delta-v check red and `thrustLevel === 0` | red | `NO POWER TO FLY THERE` |
   | Delta-v check red and `deltaVAvailable < captureDeltaV` | red | `NOT ENOUGH FUEL TO GET IN` |
   | Delta-v check red (otherwise) | red | `CANNOT HOLD THE ORBIT` |
   | Power check red and `scienceDuty <= 0` | red | `NO POWER FOR THE INSTRUMENTS` |
   | Power check red (otherwise: battery) | red | `BATTERY TOO SMALL FOR THE SHADOW` |
   | Budget check red | red | `OVER BUDGET WITH THIS ORBIT` |
   | Data Link check red | red | `NOTHING CAN BE SENT HOME` |
   | no ice instrument on board | amber | `NO ICE INSTRUMENT ON BOARD` |
   | ice instruments on board, none in range | amber | `TOO HIGH FOR THE ICE INSTRUMENTS` |
   | `projectedCoverage < 70` | amber | `MAPS TOO SLOWLY` |
   | Science check yellow (otherwise: too little data) | amber | `TOO LITTLE DATA SENT HOME` |
   | Delta-v check yellow | amber | `LITTLE FUEL TO SPARE` |
   | Power check yellow | amber | `POWER LIMITS THE SCIENCE` |
   | Budget check yellow | amber | `EATS INTO THE RESERVE` |
   | Data Link check not green | amber | `DATA LINK NEARLY FULL` |
   | otherwise | green | `GOOD MAPPING ORBIT` |

   The order of the red rows follows `goNoGo`'s own order of tests, so the verdict and the check's reason text never name different causes. "Too high" is amber, not red, because Science never blocks the launch in the rules; its beam, strips and 0% number are amber too. (My call; the mockup shows them red.)
2. **Ice mapped**: the time-lapse coverage as a large number, "of the polar ice mapped", "N% after 12 months" (the final value), and a bar with a tick at 70% labelled "goal 70%". The number is green at 70 or more, amber when the final value is 0, else white.
3. **Passes over the pole**: `passesPerTurn` "a month", with a plain line: under 10 "About one pass a week.", under 200 "About five passes a day.", else "One pass every two hours."
4. **In sunlight**: `sunlitShare` as % with an amber bar; below it either "Never in the Moon's shadow." or "Longest shadow H h per orbit: needs X Wh, battery gives Y Wh." (red when `!batteryOk`).
5. **Earth in view**: `earthVisible` as % with a blue bar.
6. **Fuel to get in**: "C of A m/s" with a bar (green when it fits, red when not, full red and "not possible" when null); below it "Holding the orbit then costs S m/s a month; fuel for U months." or "Short by D m/s."
7. **Checks**: compact rows, each with a status dot (green, yellow, red) and, when not green, the check's `reason` text from `goNoGo`: Delta-v, Power and Science always; Budget and Data Link only when not green.

### Side-view panel (left)

Title `THE POLE PASS, SEEN FROM THE SIDE`. An SVG: grey ground with one dark crater marked "ice?"; a cyan band from the ground up to the range of the ice instruments on board (labelled with their real limits, for example "ice instruments work up to 20 km"; when both are on board, "up to 20 to 25 km"); a horizontal line and craft marker at the orbit's `altitude` in the orbit's colour with "N km"; a vertical beam, cyan and solid when in range, amber and dashed when not. Scale 0 to 110 km. One sentence below: "Close enough. At 15 km the ice instruments read the crater floor." or "Too high. At 100 km the ice signal is lost: this orbit maps no ice." With no ice instrument on board the band is drawn at 20 to 25 km in grey and the sentence reads "No ice instrument on board: nothing here can see into the dark craters."

### Orbit cards (bottom)

Three real `<button>` elements with `aria-pressed`. Each shows a colour dot, a short name ("Halo Loop", "Elliptical Polar", "Low Circular"), the orbit's `description`, three figures ("15 km over the pole", "141 passes a month", "N% ice in 12 months" from that orbit's trial budgets), and, when its verdict is not green, the verdict text in its tone. The picked card has a 2 px border in the orbit's colour. Arrow keys left and right move the pick between cards. (My call.)

### Fallback and accessibility

- `OrbitScreen` starts the scene only when `canUseWebGL()` is true (existing helper in `src/scene/webgl.ts`), the column is wide enough, and the scene has not thrown; an error boundary switches to the fallback, as `PlanningScreen` does. The scene is lazy-loaded.
- The fallback is today's screen (summary box and three cards) in a scrolling column, plus the same check rows as the readout panel, because the Dashboard is hidden on this step in the fallback too. Server rendering and the smoke test take this path.
- The orbit cards are the keyboard path in the scene; no hidden duplicate controls are needed, because the pick is made with real buttons.
- The readout panel is a live region (`aria-live="polite"`) for the verdict only, not for the ticking coverage number.

### Shell integration (the only shared-file edits)

- `src/ui/screens/DesignScreen.tsx`: `STEPS_WITHOUT_DIAGRAM` becomes `['planning', 'orbit']`.
- `src/ui/Shell.tsx`: line 17 becomes `const FULL_BLEED_STEPS: DesignStep[] = ['planning', 'orbit']` (module level) and `const fullBleed = showDesignUI && FULL_BLEED_STEPS.includes(designStep)`, as Integration asked. If another session's PR has already changed these lines, add `'orbit'` to what is there.

### Code structure

Pure and tested, no React or three imports:

- `src/viz/orbit/orbitView.ts`: `buildOrbitView(design, difficulty): OrbitView` runs the trial budgets and checks for all three orbits and returns, per orbit, everything the panels and the scene need (figures, verdict, checks, ice instruments and whether they are in range, best ice rate), plus `selectedId`. `coverageAt(option, months)` and `stripCount(option, months)` live here too.
- `src/viz/orbit/orbitGeometry.ts`: the shape table, `orbitPoint(shape, trueAnomaly)`, `trueAnomaly(shape, meanAnomaly)` (Kepler solver), `hiddenBy(point, direction)` (is the Moon in the way), the sun and Earth directions. Plain number tuples, no three.
- `src/viz/orbit/icePainter.ts`: `paintIce(ctx, { size, strips, inRange, angle0 })` on a 2D canvas context.

React:

- `src/scene/OrbitView.tsx`: the r3f canvas and its parts (stars, Moon, ice cap, rings, craft, Earth, camera). Props: the `OrbitView` model, `onPick(id)`, and a ref or callback giving the current time-lapse month.
- `src/ui/steps/OrbitScreen.tsx`: the store wiring, the time-lapse clock, the HTML panels and cards, the buttons, the boundary and the fallback.

## Left to the builder

- Exact crater texture, glow strengths, easing speeds, and tuning of the angles in "Shapes" by eye.
- How the time-lapse clock is shared between the canvas and the panels (a ref read in `useFrame` plus a throttled state for the panel number is the suggested way; the panel number need not update more than about ten times a second).
- Whether to use drei's `OrbitControls` or a small hand-written drag and zoom.
- Optional, only if time allows: a brief flash at the low point when a reachable orbit is picked ("capture burn"), to meet the Ride & Transfer step's capture marker.
- Optional, only if Integration has merged the `assets-pipeline` branch by then: use its `cubesat-6u.glb` model for the craft. At this scale a bright dot reads better, so the dot is the default.

## Checks before the PR

- `pnpm typecheck && pnpm test && pnpm lint && pnpm build`.
- In the browser at 1280 × 720: pick each orbit by ring and by card and confirm `design.orbit` in the persisted store; confirm the month-12 number equals the Go / No-Go Science value for each orbit; check a design with no ice instrument, one with an engine that cannot capture, and the fallback with WebGL disabled; check reduced motion.

## Calls made while building (2026-11-14)

- The orbit also moves the Budget check (an ion engine's longer transfer), so on the Engineer budget the LunaH-Map-like design reads "EATS INTO THE RESERVE" on the elliptical orbit and "OVER BUDGET WITH THIS ORBIT" on the 100 km orbit. The table order stays as written: a red check always wins.
- Upkeep is said against the 12-month mission (Integration's playtest finding): "fuel for far beyond the 12-month mission", "fuel for N months, enough for the mission", or "Only N months of fuel to hold the orbit: the mission will end early". Used in the scene and in the fallback.
- The Go / No-Go rows sit directly under the ice number in the readout panel (they were below the fold at 1280 x 720); sunlight and Earth in view share one row.
- The idle camera sways ±0.25 rad around where the player left it instead of circling the Moon, because circling reached the night side, where the Moon is black.
- Earth sits at azimuth 40°, raised 0.9, so it is in open sky above the side-view panel.
- The fallback adds the title line and a verdict with the check rows above today's cards, because the Dashboard is hidden on this step in the fallback too.
- A saved design whose orbit id is not one of the three is shown as the halo loop, and the screen stores that pick once, so later steps do not carry a stale orbit.
