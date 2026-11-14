# Assembly bay (Factory): design for the Spacecraft Configuration step

Status: draft for Jakob's approval, after one builder review (its four points are settled below as Claude's calls 1 to 4). Date: 2026-11-14. Branch: `claude/spacecraft-factory-bay`, on `origin/main` at `bc9574c`.

## Intent and why

Step 3 of Moonshot, Spacecraft Configuration, is five lists of cards and three numbers. The player picks solar panels, battery, flight computer, attitude control and propulsion by reading, and never sees the craft change.

Jakob asked: "In the same way we made really nice visuals for the mission control and instrument selection, make one for the spacecraft configuration." The standard he set for the game's steps: "Every dial in this step should change something visually and it should look cool, making you excited to continue."

This is the step where most designs fail: too heavy, too full, or short of power. The picture should make those three limits something you see, not something you read. It is also a screen the NASA Space Apps judges will see (pitch Sunday 15 Nov 17:30).

## What Jakob decided

1. **Setting: an assembly bay in the Factory.** The satellite stands open on a stand and is put together there (chosen over a test chamber and a blueprint table).
2. **The mockup's direction** (`docs/superpowers/specs/assets/2026-11-14-assembly-bay-mockup.html`), approved with "Yes, write design". He was shown three calls and did not overrule them:
   - The step fills the screen like the control room; a wall board in the picture replaces the shared numbers panel.
   - Parts are picked from bins under the picture, not from shelves inside the room.
   - The inside of the box is blocks stacked by volume. The real build adds detail to each block.

## Goals

1. On the Spacecraft step, a live 3D assembly bay replaces the card lists. The 6U box stands open on a turntable; each of the five choices visibly changes the craft within a moment.
2. The three physical limits are visible in the picture: volume as blocks filling the box (and sticking out when it is too full), mass on a scale under the craft, power on the wall board and on the solar cells.
3. The wall board shows the same numbers and the same reasons as the dashboard and Go / No-Go, taken from `computeBudgets()` and `goNoGo()`.
4. Parts chosen in other buildings (instruments, radio) are on the craft, read-only, labelled with their building.
5. Everything a player could read on the old cards is still reachable: each option's name, mass, volume, cost, its key number, and its description.

## Non-goals

- No change to `src/sim/*`, `src/data/*`, the stores, `App.tsx`, `BaseScreen.tsx`, `BaseMap.tsx`. No rule or number changes.
- No controls for the radio or the instruments in the Factory.
- No change to `CubeSatDiagram.tsx`, `cubesatSlots.ts` or `DesignDiagramPanel.tsx` (they draw the cutaway on the other steps).
- No new dependencies, no sound, no mobile layout, no real CAD models.
- `src/scene/SpacecraftView.tsx` (unused on `main`) is left as it is.

## Anti-goals (a failure even if it works technically)

- The picture contradicts the numbers: a block shown fitting while the Volume check is red, or the reverse.
- A visual state that no words on the screen explain.
- Picking a part is slower than clicking a card today, or an option's facts are no longer reachable.
- The step stops working without WebGL, or `src/ui/screens.smoke.test.tsx` breaks.

## Constraints

- Stack as on `main`: React 19, TypeScript, Vite, Tailwind 4, three 0.187, react-three-fiber 9, drei 10, Zustand, Vitest (Node environment). `pnpm typecheck && pnpm test && pnpm lint && pnpm build` must pass before the PR.
- The step id `spacecraft` and its route stay: the Factory building opens it with `openBuilding('factory')`. The header's "← Agency base" button stays reachable.
- Writes go only through `updateDesign({ solar | battery | computer | attitude | propulsion })`.
- Propulsion parts' `mass` is dry; the fuelled mass is `budgets.totalMass` (`dryMass + propellantMass`).
- The Integration session merges. Shared files this work may edit, one line each, cleared by Integration:
  - `src/ui/screens/DesignScreen.tsx`: add `'spacecraft'` to `STEPS_WITHOUT_DIAGRAM`.
  - `src/ui/Shell.tsx`: turn the `fullBleed` test into `const FULL_BLEED_STEPS: DesignStep[] = ['planning', 'spacecraft']` and `.includes(designStep)`.
- Reference size is a laptop: 1280 × 720 and 1440 × 900.

## Approaches considered

**The setting** (put to Jakob in text):

- **A. Assembly bay (chosen by Jakob).** The craft is built in front of you. Covers all five choices and all three limits.
- **B. Test chamber.** Sun lamps and a shadow phase. Strong for power and battery, weak for mass and volume.
- **C. Blueprint table.** Clearest and cheapest, but nothing feels physical.

**How it is built** (Claude's call; Jakob left the how open):

- **A react-three-fiber scene with canvas-drawn boards, plus an HTML parts tray (chosen).** The same recipe as the control room: a pure view model, a canvas painter for the board, a scene that only draws. The tray is ordinary HTML buttons, so keyboard and screen readers work without a hidden second set of controls, and the same tray is the fallback when there is no WebGL.
- **Controls inside the 3D scene (as the control room's knob and fader).** Right for two dials, wrong for fifteen options that each carry four numbers: the text would be too small to read.
- **Reuse `SpacecraftView.tsx` or the 2D cutaway.** The first is a rough placeholder; the second is shared with other steps and not ours to change.

## What exists today (read on `main` at `bc9574c`)

- `SpacecraftScreen.tsx`: five `PartSelector` card lists and a strip with mass, power and volume. Next goes to `orbit`, Back to `instruments`.
- Options in `src/data/parts.ts`: `solarPanels` (3), `batteries` (3), `computers` (2), `attitudeControls` (2), `propulsionSystems` (5). Also on the craft: `structures` (one 6U bus: 2.2 kg, 0 U, 3 W heater), the radio (`design.radio`: UHF 0.2 U, patch 0.5 U, dish 2.0 U) and up to two instruments (`design.instruments`).
- Volume: solar panels and the bus take 0 U; every other part has `volume` in U. The box holds 6 U (`lunarIceMapperBrief.constraints.maxVolume`).
- `computeBudgets(design, difficulty)` gives `totalMass`, `massLimit` (14 kg, or the ride's limit if lower), `dryMass`, `propellantMass`, `totalVolume`, `volumeLimit`, `powerGenerated`, `powerConsumed`, `busPower`, `instrumentPower`, `thrustPower`, `thrustLevel`, `scienceDuty`, `batteryUsableWh`, `batteryNeedWh`, `eclipsePowerConsumed`, `eclipseDurationMinutes`, `partsCost`, `totalCost`, `budgetCap`, `spendable`, `buildEffort`, `buildTurns`, `deltaVAvailable`, `captureDeltaV`.
- `goNoGo(design, budgets).checks` has, by `resource` name: `Mass`, `Volume`, `Time`, `Delta-v`, `Power`, `Comms`, `Data Link`, `Budget`, `Science`. Each has `status` (`green`, `yellow`, `red`), `value`, `limit`, `unit`, `reason` and `fixStep`.
- `PlanningScreen.tsx` shows the pattern to follow: `useState(canUseWebGL)`, a lazy scene inside an error boundary, a plain fallback, Back and Next buttons laid over the picture. `canUseWebGL` is in `src/scene/webgl.ts` and returns false in tests.
- `src/ui/screens.smoke.test.tsx` renders every step with `renderToString` and fails on `NaN`.

## The design

### Screen layout

Full-bleed inside the Shell (step rail stays on the left, the dashboard is hidden on this step). From top to bottom:

```
[← Back]                                              [Select Orbit →]
 ┌──────────────────────────── 3D bay ────────────────────────────┐
 │   crane rail                                                    │
 │      │            ┌───────────── WALL BOARD ─────────────┐      │
 │  ▓▓┌────┐▓▓       │ MASS      12.8 / 14 kg  ███████░ |   │      │
 │  ▓▓│stack│▓▓      │ VOLUME     4.4 / 6 U    █████░░░ |   │      │
 │  ▓▓│     │▓▓      │ POWER     uses 30 of 120 W           │      │
 │    └─┬┬──┘        │ MONEY     $19.8M of $25M             │      │
 │   (turntable)     │ TO THE MOON  2400 of 800 m/s         │      │
 │    [12.8 kg]      │ [ status line with the reason ]      │      │
 └─────────────────────────────────────────────────────────────────┘
 one line: the hovered or chosen option's description
 [Solar panels] [Battery] [Flight computer] [Attitude] [Propulsion]
```

### The craft

- The frame is 2 wide × 3 high × 1 deep (one unit = 1 U), open at the front, on a turntable. Dragging the picture turns it; left alone it sways slowly.
- Inside, one block per part that has volume, stacked bottom to top: propulsion, instruments, radio, attitude control, flight computer, battery. A block's height is its volume ÷ 2, so 6 U fills the frame exactly.
- Blocks are drawn exactly to scale, so the picture always matches the Volume number. A block at least 0.5 U has its label on its front: name, and one line under it. A thinner block (battery, computer, small radio) gets a call-out instead: a tag beside the frame with a leader line to the block, carrying the name and the detail that tells the option apart (call 3). Chosen-elsewhere blocks are grey and say "chosen in the Research Lab" or "chosen in the Communications Center".
- Blocks above the 6 U line glow red and pulse, with a red ghost marking the overflow; the frame turns red.
- Each choice must be tellable from its siblings without reading the label:
  - **Solar:** cells on the box sides (body), one wing each side (84 W), two segments each side (120 W). Wings unfold.
  - **Battery:** 1, 2 or 4 cells drawn on its call-out tag.
  - **Flight computer:** one board, or two boards (redundant), drawn on its call-out tag.
  - **Attitude control:** wheels; precision adds a star tracker on the outside.
  - **Propulsion:** small nozzles (cold gas), four large nozzles (chemical), one glowing grid (ion). A fill gauge on the block shows the propellant.
  - **Radio (read-only):** whip (UHF), flat patch on top, or a dish on top.
- A changed part is lowered in from the crane hook, then the stack settles.

### The scale and the bay

- The turntable is a scale. A read-out in front shows the fuelled mass; the turntable's ring and the read-out take the Mass check's colour.
- Night-shift look as in the control room: dark room, cool key light on the craft, one warm accent. The accent light turns red and pulses while any shown check is red.
- Power short (`scienceDuty <= 0`): the solar cells dim and flicker. Ion engine without enough power (`thrustLevel === 0`): its glow sputters.

### The wall board

Drawn on a canvas, as the control room's big screen. Header: "FACTORY · ASSEMBLY BAY · LUNAR ICE MAPPER". Rows, each with the check's colour:

| Row | Text | From |
|---|---|---|
| MASS, FUELLED | `12.8 / 14 kg`, bar with the limit marked | `Mass` check, `totalMass`, `massLimit` |
| VOLUME IN THE BOX | `4.4 / 6 U`, bar with the limit marked | `Volume` check |
| POWER IN SUNLIGHT | `uses 30 of 120 W`, bar | `Power` check, `powerConsumed`, `powerGenerated` |
| MONEY | `$19.8M of $25M`, bar | `Budget` check, `totalCost`, `budgetCap` |
| TO THE MOON | `2400 of 800 m/s`, or `cannot get there` | `Delta-v` check, `deltaVAvailable`, check `value` |
| BUILD TIME | `4 months · ready month 7, ride leaves month 8` | `Time` check, `buildTurns`, `readyTurn`, `rideTurn` |

Below: `PARTS $10.3M` (from `partsCost`). The BUILD TIME row carries the Time check's colour, because the parts chosen here set the build time and can make the craft miss its ride (call 2).

Status box at the bottom: the `reason` text of the worst of the six checks (first red, else first yellow, in the row order above), prefixed with the row name and wrapped to at most three lines. All green: "FITS. READY FOR THE NEXT BUILDING." A red box blinks slowly.

### The parts tray

- Five groups under the picture, one per choice, each a labelled radio group of buttons. Each button: short name, then `mass · volume · cost` and one key number (W made, Wh, storage, pointing accuracy, fuelled mass and engine type).
- The chosen option is outlined in its group's colour, the same colour as its block.
- Above the tray, a two-line strip shows the option under the pointer or with keyboard focus; otherwise the last changed option. Line one is its description. Line two is every fact the old card showed that is not on the button (call 4): deployable; minutes the battery carries the craft and this orbit's eclipse; storage, radiation-reset factor, redundant; pointing accuracy, star tracker, "laser and dish work at full quality"; engine type, Isp, propellant and dry mass, and the watts an ion engine needs.
- Tab and arrow keys move through the options; Enter or Space chooses.

### Without WebGL, or if the scene throws

The picture is replaced by a plain block with the six board rows as text (value, limit, status, reason). The tray and the description line are unchanged. This is also what the smoke test renders.

### Motion

Values ease over about a third of a second. With `prefers-reduced-motion`, parts appear in place, nothing blinks or sways, and red states are steady.

## Code shape (Claude's calls)

| File | What it holds |
|---|---|
| `src/viz/spacecraft/bayView.ts` (+ test) | Pure. `buildBayView(design, budgets, checks)`: the stack (blocks with category, name, sub-line, volume, base height, read-only flag, over-limit flag), the six board rows, the parts line, the status box, and the outside flags (solar kind, star tracker, radio kind, engine kind, power short, engine starved). |
| `src/viz/spacecraft/trayOptions.ts` (+ test) | Pure. The five groups with each option's short name, stat line and description, from `src/data/parts.ts`. |
| `src/viz/spacecraft/boardPainter.ts` (+ test) | Canvas painters for the wall board and the scale read-out; text wrapping. Tested with a recording context, as `screenPainter.test.ts`. |
| `src/scene/factory/AssemblyBay.tsx` | The react-three-fiber scene: room, crane, turntable, craft, board, scale, camera. Draws only what the view says. |
| `src/ui/steps/spacecraft/PartsTray.tsx` | The HTML tray and description line. |
| `src/ui/steps/SpacecraftScreen.tsx` | Rewritten: scene or fallback, tray, Back and Next buttons. |
| `DesignScreen.tsx`, `Shell.tsx` | The two one-line edits above. |

Canvases repaint only while a value is moving or a red state blinks. Camera field of view widens on narrow panes, as in the control room.

## Build order (call 1)

The pitch is Sunday 15 Nov 17:30, so the work is cut as a thin slice first, then polish:

1. View model, tray options and their tests.
2. Screen with tray, fact strip and the plain fallback, plus the two shared one-line edits. The step is fully usable from here on.
3. Bay scene: room, turntable, frame, to-scale stack, wall board, scale read-out.
4. Outside parts (wings, star tracker, nozzles, radio) and call-out tags.
5. Polish, droppable in this order if time runs out: crane lowering, flicker and sputter states, slow sway.

Reduced motion and the red states of the frame, ring and board are not droppable.

## Verification

- Unit tests: the stack sums to `totalVolume`; over-limit blocks are flagged exactly when the Volume check is red; board rows carry the checks' statuses and numbers for the default design, `flashlightDesign`, a too-heavy design and a no-power design; the status box picks the first red; tray options match the catalogue; painters draw only finite numbers.
- Browser at 1280 × 720: each of the fifteen options changes the craft and the store; too heavy, too full, power short and ion-starved each show; keyboard works; WebGL off shows the fallback with the same numbers.
- `pnpm typecheck && pnpm test && pnpm lint && pnpm build`, then the PR link goes to the Integration session.

## Left to the builder

Exact geometry, colours and lighting; how each block's detail is drawn; label sizes; the crane's motion; how the board rows are spaced.
