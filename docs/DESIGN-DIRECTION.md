# Moonshot: design direction for every session

*Kept by the Integration session (the coordinator). Approved direction from Jakob, 14 Nov 2026. Read this before designing or building any part of the game; message `Integration` before you write code.*

## 1. The game in one line
The player runs a small space agency and flies **one mission, the Lunar Ice Mapper**: a 6U CubeSat that maps water ice in the shadowed craters at the Moon's south pole. Every decision has a real consequence computed by the logic core, and the report explains why the mission worked or failed.

## 2. The whole: the agency map is the menu
The game lives on the agency base (`BaseScreen`). Every decision is made **inside a building**; the player walks in by clicking it and comes back with "← Agency base".

| Building | Role on the board | Steps inside | Owner of the visual |
|---|---|---|---|
| Comms Center | Ground, mission control | brief, 1 planning, 6 comms, 7 Go / No-Go | Interfaces (planning control room, shipped) |
| Research Lab | Science | 2 instruments | Instrument Selection |
| Factory | Space | 3 spacecraft | SpaceCraft Design |
| Launch Site | Launch | 4 orbit, 5 ride and transfer | Trajectory (orbit, the Moon end), Ride & Transfer (ride, the Earth end and the path) |

After Go / No-Go, **"Launch Mission" returns to the base and the flight plays on the map**: event cards over the island, turn buttons, the activity feed. One clock: from launch, one turn = 30 days on the base calendar. The report and replay keep their own screens.

Placeholders for later, not to be built now: agency economy, publicity, building levels and unlocks, other missions.

## 3. Rules every screen follows
1. **Numbers only from the logic core.** Read `computeBudgets(design, difficulty)`, `goNoGo(design, budgets)` and the flight state from `useGameStore`; catalogue facts from `src/data/*`. Never re-compute or approximate mission numbers in a screen or a scene. A what-if preview calls `computeBudgets` on a copy of the design.
2. **Write only your own decisions** through `updateDesign({ ... })`: planning → `planning`; instruments → `instruments`; spacecraft → `solar`, `battery`, `computer`, `attitude`, `propulsion`; orbit → `orbit`; ride → `ride`, `transfer`; comms → `radio`, `groundStation`, `contactHours`.
3. **Parts chosen elsewhere are shown read-only and labelled with their building**, e.g. "Radio · chosen at the Communications Center", "Orbit · decided at the Launch Site". No controls for another building's decision.
4. **The Go / No-Go bars stay visible.** On a normal step the Shell's Dashboard shows them. If your step goes full-bleed (no Dashboard), show the bars your step can turn red, with their `reason` text from `goNoGo`, inside your scene.
5. **The key lessons stay visible** wherever they apply: only the laser reflectometer and the neutron spectrometer see into the shadowed craters, and only below their altitude limit (20 km and 25 km; above it they map nothing); propellant counts in the 14 kg; a dish antenna needs precise pointing; coverage counts only once its data is home.
6. **Every 3D step has a plain fallback**, like `PlanningScreen`: start the scene only when `canUseWebGL()` (from `src/scene/webgl.ts`) is true, load it with `lazy()` and `Suspense`, wrap it in an error boundary that falls back to the plain controls, and keep those controls usable by keyboard (labels, `aria-*`). Tests and server rendering take the plain path.
7. **Navigation stays as it is:** the step ids (`planning`, `instruments`, `spacecraft`, `orbit`, `ride`, `comms`, `go-nogo`) and `openBuilding()` are the entry; keep the "← Agency base" header button reachable and the step's Back / Next buttons working.

## 4. One visual language
- **Base map look (outside):** navy `#14213d`, warm panels `#fbf7ef`, orange accents `#f97316`, display font `font-display` (Fredoka). Building labels stay as they are.
- **Inside a building:** a dark room or scene, like the mission control room (`#03050a` background), with the building's role colour from the board as the accent: Ground / Comms Center blue, Science / Research Lab green, Space / Factory purple, Launch / Launch Site orange.
- **Title line inside every building**, in the control room's format: `BUILDING · LUNAR ICE MAPPER · STEP`, e.g. `COMMS CENTER · LUNAR ICE MAPPER · MISSION PLANNING`, `RESEARCH LAB · LUNAR ICE MAPPER · INSTRUMENTS`, `FACTORY · LUNAR ICE MAPPER · SPACECRAFT`, `LAUNCH SITE · LUNAR ICE MAPPER · ORBIT` / `· RIDE & TRANSFER`.
- **Units, written the same everywhere:** kg, U, W, Wh, $M (or "M"), MB and MB/turn, kbps, m/s, km. Time: a turn is one month, so in-scene wording may say months ("2 MONTHS SPARE", "RIDE · END OF MONTH 8", matching the base's "Month" counter); buttons, the dashboard and plain controls say turns. Go / No-Go colours: green, yellow, red.
- **Words:** plain English, short sentences; say what a number means for the mission ("cannot map ice at this height"), not just the number. Name the real mission a choice comes from where there is one (Lunar Flashlight, Lunar IceCube, LunaH-Map, LRO).
- **Two sessions in one building** (Launch Site) agree one look together and bring it to Jakob as one. Agreed between Ride & Transfer and Trajectory: the ride scene draws the launch and the Earth-Moon path, ending in a capture-burn marker on the Moon; the orbit scene starts with the craft arriving there; neither draws the other's half.
- **One colour per orbit, everywhere an orbit is drawn:** halo loop violet `#a78bfa`, elliptical polar lime `#a3e635`, low circular polar sky blue `#38bdf8`. **Cyan is reserved for ice** (mapped ice, ice signal); don't use it for anything else.

## 5. Files
- **Your own:** new files under `src/scene/<your area>/` and `src/viz/<your area>/`, plus your step's screen in `src/ui/steps/`.
- **Shared, through Integration first:** `src/sim/*`, `src/data/*`, `src/state/*`, `src/App.tsx`, `src/ui/screens/BaseScreen.tsx`, `src/scene/BaseMap.tsx`, `src/viz/missionMap.ts`, `src/ui/flight/*`.
- **Shared one-liners you may edit in your PR, as lists:** `STEPS_WITHOUT_DIAGRAM` in `src/ui/screens/DesignScreen.tsx`; `FULL_BLEED_STEPS` in `src/ui/Shell.tsx` (turn the current `designStep === 'planning'` into a list if you need it). The later PR rebases; Integration resolves merges.
- **Read-only for everyone:** `src/viz/CubeSatDiagram.tsx`, `src/viz/cubesatSlots.ts`, `src/viz/MissionStrip.tsx` (the visualiser on the other steps; `DesignDiagramPanel.tsx` is being edited by Instrument Selection).

## 6. Workflow
1. Tell Integration your aspect, branch and files before writing code.
2. Work out your design with Jakob; Integration only says how it fits this direction.
3. Branch from the latest `origin/main`; never commit to `main` or merge yourself.
4. Before a PR: `pnpm typecheck && pnpm test && pnpm lint && pnpm build`.
5. Send Integration the PR link; Integration merges with Jakob's go and tells you when it is in.
