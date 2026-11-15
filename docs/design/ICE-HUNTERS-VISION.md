# MOONSHOT: Ice Hunters — Game Vision & Build Plan

> Status: proposal v1 (2026-11-15). Supersedes the "step screens" design.
> Audience: the team + Sonnet subagents who will implement each work package (WP).
> Rule for every agent: read §1–§4 fully before touching your WP.

---

## 1. Diagnosis — why it feels like a form

From first principles, the current build has the *right simulation* and the *wrong verbs*.

| Symptom | Root cause |
|---|---|
| "Feels like a tool" | The only verb is **choose** (click a card). Choosing is not playing. |
| "Crowded" | Information is *presented* (cards, AI art, stat tables, HUD clusters) instead of *discovered*. Every number is on screen at once. |
| "Choose and watch" | Decisions and consequences are separated by a screen change. The player never *feels* why a part is good — they read it. |
| Launch is generic | It is a cutscene with no role for the player and no shot grammar (camera has no "why"). |
| No identity | No protagonist, no place, no recurring physical object to care about. |

**The fix is not more UI. It is changing the verb from *choose* to *test*.**

## 2. Identity — the one-sentence pitch

> **You are a rookie astronaut-engineer at a small lunar agency. You walk the campus, build one tiny CubeSat with your own hands, test every part in a hands-on experiment, launch it yourself, and fly it to find water ice in the Moon's darkest craters.**

Tone: warm, tactile, "toy-like but honest" — a miniature diorama campus (tilt-shift, soft light), a real NASA-sized problem. Think *a science museum you can play*, not a dashboard.

### Design pillars (every WP must satisfy all five)

1. **Hands, not forms.** No radio buttons, no card grids. Every decision is made by doing something to an object: drag, plug, aim, rotate, hold, time.
2. **Earn the number.** A stat is only shown *after* an experiment reveals it. The experiment *is* the tutorial. ("Why X-band? Because you watched the UHF tape fill up too slowly during the pass.")
3. **One spacecraft, carried everywhere.** The CubeSat is a physical object on a cart that follows the astronaut room to room, visibly growing. It is the save file and the emotional anchor.
4. **Consequences come home.** In flight, every event replays an experiment you already did (eclipse → your battery test; lost signal → your dish test). Debrief says: "In the Power Lab you predicted 41 min of margin. In orbit you had 38."
5. **Quiet screen.** At most 3 HUD elements at once. No AI-generated images. Numbers live *on objects* (a scale under the craft, a tape reel, a battery glow), not in panels.

## 3. The experience, beat by beat

### 3.0 Opening (60 s)
Black → radio crackle → ElevenLabs voice of **Flight Director Reyes** (mentor, CAPCOM) → the Moon's south pole in raking light, camera pushes into a crater that stays black. "Sunlight hasn't touched the floor of this crater in two billion years. We think there's ice there. Rookie — we need you to prove it." Cut to the astronaut (existing `astronaut.glb`) waking in the campus dorm. Player names the astronaut, picks a suit-stripe color. Done. No menus.

### 3.1 The Campus (hub)
A compact walkable diorama, 3/4 top-down camera (orthographic-ish, 35° pitch) that follows the astronaut.
- **Movement:** click-to-move (primary, accessible) + WASD. Doors glow when the next room is "ready". Locked rooms show *why* ("The Clean Room needs a payload first").
- **The cart:** CubeSat on a little cart follows the player; it physically gains parts.
- **Mission clock & budget** are diegetic: a big flip-board on the HQ façade (`$ left`, `months to launch window`). That's the whole persistent HUD + one small objective line.
- Rooms (in suggested order, but the hub allows revisiting any unlocked room to redesign):

| # | Room | Replaces step | Core minigame | Decision produced |
|---|---|---|---|---|
| 1 | **Briefing Room** | brief, planning | *Shadow Hunt* | objective, difficulty, reserve % |
| 2 | **Science Lab** | instruments | *Dark Crater Bench* | `instruments[]` |
| 3 | **Clean Room** | spacecraft | *Pack the 6U* + *Wire the Bus* | structure/solar/battery/computer/attitude/radio/propulsion |
| 4 | **Thermal-Vac Chamber** (NEW) | (part of spacecraft + testTurns) | *Eclipse Survival* | battery/solar validation, `testTurns` |
| 5 | **Flight Dynamics** | orbit, transfer | *Orbit Sling* | `orbit`, `transfer` |
| 6 | **Ground Station** | comms | *Catch the Pass* | `groundStation`, `contactHours`, radio validation |
| 7 | **Launch Hangar** | rocket, ride | *Rideshare Manifest* | `ride`, `rocket` |
| 8 | **Mission Control** | go-nogo, flight | *Launch Director* → *Flight* | launch + ops decisions |

### 3.2 Minigames (the heart — each grounded in the real trade-off)

Each minigame: **≤ 90 s first play, skippable on replay**, produces a `Design` patch + an **Insight** (a sentence + a measured number the debrief will quote back). Numbers come from `src/sim` — minigames never invent physics.

**1. Shadow Hunt (Briefing Room)** — A holographic Moon on a table. Player drags the Sun around it; craters near the pole that *never* light up get tagged. Find 3 permanently shadowed regions → unlocks the mission objective ("map ice in PSRs to 70% coverage"). Teaches: why poles, why ice survives, why this is hard (it's dark → instrument choice). Then Reyes slides three envelopes across the table = difficulty (Cadet/Engineer/Flight Director budget) and a jar the player fills with coins = reserve % (visual: money you *can't* spend on parts).

**2. Dark Crater Bench (Science Lab)** — A tabletop crater model under a movable lamp, with hidden ice patches. Player picks up each of the 4 instruments and *aims* it over the crater:
- Camera: great image when lit, pure black in shadow. 
- IR spectrometer: detects ice only where lit/reflected.
- Laser reflectometer: works in total darkness (own light) but narrow footprint — must sweep slowly.
- Neutron spectrometer: sees ice *through* regolith and dark, but blurry/coarse.
Each scan fills a **data tape reel** (data rate made physical) and a **power meter** on the bench. Player then drags chosen instruments into a payload tray with a mass scale under it. Insight: "Laser found ice in the dark at 2 W; camera found none."

**3. Pack the 6U + Wire the Bus (Clean Room)** — The 6U frame is a 3D grid of 6 units (each 1U = 10 cm cube). Parts are physical blocks with real volume (`partModels`, existing GLBs). Drag to slot (reuse `scene/interaction/DropSlot`, `snap`). Too big → doesn't fit; scale under the frame shows mass vs. ride limit. Then the **wiring view**: solar → battery → loads; power flows as glowing particles; if load > generation the bus flickers. Propulsion choice shown as a fuel tank whose "Δv gauge" is literally a ruler from Earth to Moon drawn on the wall. Inside-view camera (`InsideCam`) for the educational close look: hover a part → camera dollies in, one-line plain-English explanation + one number.

**4. Eclipse Survival (Thermal-Vac Chamber, NEW)** — The craft goes into a chamber. Lights simulate an orbit: sun on → solar charges; sun off (eclipse length from the selected/tentative orbit) → battery drains. Player toggles loads (heater, instruments, radio) in real time to keep the battery above 20% through 3 orbits. If it dies, they *see* why and go back to the Clean Room for a bigger battery/wing. Number of test cycles run = `testTurns` (more testing costs months, reduces failure odds — the player feels the schedule cost on the flip-board). Insight: "Survived eclipse with 31% minimum charge."

**5. Orbit Sling (Flight Dynamics)** — A 3D Moon on a big table. Player drags the periapsis/apoapsis handles (constrained to the 3 real orbit families — snaps to halo / elliptical / 100 km circular). Time-lapse paints the **ground track coverage** over the pole in seconds, while a **fuel gauge** (Δv from transfer + capture) and **comm line-of-sight to Earth** (line turns red when the Moon blocks it) update. Then transfer: *Direct* (fast, costs fuel) vs *Low-energy* (slow loopy path, cheap) — drag a comet-trail line from Earth to Moon; it snaps to one of two. Insight: "100 km orbit: 92% coverage, but 47 min eclipses and 30% comm blackout."

**6. Catch the Pass (Ground Station)** — Player controls the dish (mouse/arrow keys) and must keep the crosshair on the moving craft blip during a sky pass; the downlink **tape reel** fills at the radio's data rate × pointing accuracy. Bigger dish = wider beam (easier), costlier. Then a 24-hour ring where the player *paints* booked contact hours (cost per hour shown as coins dropping). Insight: "X-band + 34 m: 312 MB/day."

**7. Rideshare Manifest (Launch Hangar)** — A departure board (3 rides: dates, destinations, prices). Player physically loads the CubeSat into a dispenser on the chosen rocket among other payloads; the scale + "launch date vs your build schedule" check is the game (miss the date = wait months). Optional fun: the rocket stacking (existing `scene/rocket` parts) remains, flagged "cosmetic, your pride".

**8. Launch Director (Mission Control)** — see §3.3.

### 3.3 Launch — complete redesign

Principle: **the player is the Launch Director, the camera is a broadcast director.** Two halves:

**A. The poll (interactive, 60–90 s).** Mission Control room, 4 consoles (Science, Spacecraft, Ground, Launch — reuse existing voice lines `poll-*.mp3`). Each console's status comes from `sim/checks`. Red consoles can't say GO; walking to one shows the fix and offers "go back to <room>". Weather & range: a random hold (wind gust) — player chooses **hold** (costs a day) or **proceed** (risk). Countdown: the player presses and *holds* the LAUNCH key from T-10; releasing aborts (scrub). That hold is tension.

**B. The ascent — fixed shot list** (replaces the current camera; each shot has an explicit rig, no free orbiting during launch):

| # | t (s) | Shot | Camera |
|---|---|---|---|
| 1 | -10→-3 | Wide establishing, pad at dusk | static, 600 m away, 1.5 m height, 50 mm-equiv FOV 28°, rocket at 1/3 frame |
| 2 | -3→+2 | Engine bell close-up, ignition | low, 12 m from base, looking up 20°, subtle shake ramping |
| 3 | +2→+8 | Tower clearance | 80 m, tilt up following nose, FOV 35° |
| 4 | +8→+20 | Long-lens tracking from ground | 3 km, FOV 4°→2°, lagged follow (spring), heat shimmer |
| 5 | +20→+26 | Onboard down-cam, staging | mounted on stage 2 looking aft; stage 1 falls away |
| 6 | +26→+34 | Inside the fairing (existing `FairingRide`) | fairing halves open → Earth limb, **your** CubeSat (with the exact parts you packed) springs out |
| 7 | +34→ | Deploy: solar wings unfold, first "hello" beep | slow orbit around craft, then cut to flight view |

Skip available after first viewing. Cuts, not drifts. Each cut has a sound accent.

### 3.4 Flight — from "watch" to "fly"
The month-by-month sim stays the engine, but the player acts at **key moments** (each is a 15–30 s minigame, all reusing earlier mechanics):
- **Trans-lunar / capture burn:** hold-to-burn, release inside a shrinking window. Window width depends on attitude part (precision = wider). Miss → extra fuel used (from the sim's own capture rules).
- **Events become hands-on** (no event art images):
  - *No signal* → Catch the Pass replay with weak signal.
  - *Long eclipse* → Eclipse Survival replay in orbit.
  - *Thruster stuck* → counter-torque balance minigame.
  - *Radiation reset* → reboot sequence (press in order; redundant computer = forgiving).
  - *Instrument degrades* → choose which instrument keeps power (Dark Crater Bench insight resurfaces).
- **Ice map** fills on the pole in the main view — the *score* is a picture you painted.
- Speed controls stay; decisions pause time.

### 3.5 Debrief
A "mission patch" is generated (SVG, procedural, from your parts/orbit/name — not AI art). The debrief compares **predicted (your experiments) vs. actual (flight)** per subsystem, grade, medals (existing), and "Fly again" sends you back to campus with your craft intact to redesign one room.

### 3.6 Audio identity (ElevenLabs)
- **Reyes** (mentor voice) — ~40 new lines: room intros, minigame hints, insight read-backs. Captions always on (existing `Captions`).
- **Adaptive music:** one theme, layered stems per location (campus: soft synth + marimba; lab: pizzicato; clean room: ambient hum; control room: pulse; launch: full orchestra swell; flight: sparse pads). Crossfade on room enter.
- **Foley**: footsteps on different floors, door whoosh, part snap, tape reel whir, dish servo, chamber vacuum pump.

### 3.7 What is removed
- All AI-generated images: `public/assets/img/cards`, `portraits`, `event-*.webp`, `patch.webp`, `src/assets/catalogueArt.ts`, `src/assets/lab/portrait.tsx`. Replace with 3D objects or nothing.
- Step screens & card trays (`src/ui/steps/**`, `StepRail`, `Dashboard` drawer, `MissionVitalityCluster` HUD modal) — kept behind a dev flag `?classic=1` until Phase 6, then deleted.

### 3.8 Future-proofing (your ambition)
- **Mission cartridges:** a `MissionDefinition` (objective, target body, required rooms, allowed parts, minigame config, events). Lunar Ice Mapper is cartridge #1. Mars relay, asteroid sample (we already have `asteroid-bennu.glb`) become data, not code.
- **Campus grows:** rooms are a registry; new rooms plug in.
- **Co-op (hackathon asks for ≤4 players):** each room is owned by a role (Science / Spacecraft / Ground / Launch — matches the existing 4 consoles). Hot-seat first: the astronaut's suit stripe = role color; the GO poll requires each role's player to press their console. Networked later.

---

## 4. Engineering architecture

**Golden rule: `src/sim/**` and `src/data/**` are the single source of truth and stay untouched except where a WP explicitly says so.** Minigames read numbers from sim functions (`computeBudgets`, `checks`, `odds`, orbit/part data) and write only a `Partial<Design>` through `gameStore`.

```
src/world/                 NEW – the campus
  WorldRoot.tsx            canvas, lighting, camera rig, room portals
  campus/                  Campus layout, buildings, paths, flipboard
  player/Astronaut.tsx     astronaut.glb + animation state machine
  player/controller.ts     pure: click-to-move pathing on a nav grid, WASD (tested)
  player/CartFollower.tsx  cart + live CubeSat (reuses scene/space/CubeSat or factory/CraftModel)
  rooms/registry.ts        RoomId → {title, step(s), unlock rule, entry cam, Component}
  rooms/<Room>.tsx         one per room; hosts its minigame
  camera/rig.ts            follow-cam + shot sequencer (used by launch too)
src/minigames/             NEW – one folder per minigame
  <name>/logic.ts          PURE, deterministic, unit tested (no React/three)
  <name>/View.tsx          R3F scene + interactions
  <name>/index.ts          exports Minigame contract
  contract.ts              shared types (below)
src/state/worldStore.ts    EXISTS – extend: playerPos, currentRoom, insights, unlocks, roomsVisited
src/launch/                NEW – Launch Director poll + shot list sequencer
```

Shared contract (WP-0 owns it, all others import it):
```ts
export interface Insight { id: string; room: RoomId; text: string; metric: { label: string; value: number; unit: string } }
export interface MinigameResult { patch: Partial<Design>; insights: Insight[]; durationS: number }
export interface MinigameProps { design: Design; difficulty: Difficulty; onComplete(r: MinigameResult): void; onExit(): void; replay?: boolean }
export interface MinigameDef { id: string; room: RoomId; title: string; component: React.FC<MinigameProps> }
```

Conventions: TypeScript strict, Tailwind for 2D overlay only, R3F/drei for 3D, zustand stores, vitest for `logic.ts` (≥ 80% branch coverage), Playwright helpers already exist (`devHook.ts`) — each room exposes a dev hook `window.__game.completeRoom(id, patch)` for e2e.

Performance budget: campus ≤ 150 draw calls, ≥ 50 fps on integrated GPU; rooms mount lazily (`React.lazy`), one Canvas, scenes swapped.

---

## 5. Build plan — work packages for Sonnet subagents

Legend: **Deps** = must be merged first. Each WP lands as its own branch `feat/ih-<wp>` + PR. Each WP ends with `npm run typecheck && npm test && npm run lint` green.

### Phase 0 — Foundation (sequential, 1 agent; Opus recommended — it defines the contracts)
**WP-0 Contracts & skeleton**
- Create `src/minigames/contract.ts`, `src/world/rooms/registry.ts` (all 8 rooms, placeholder components that render a box + "Complete" button calling `onComplete` with the current design defaults), extend `worldStore` (currentRoom, insights[], unlocked rooms derived from design completeness), `?classic=1` flag routing in `App.tsx`.
- Accept: app boots into an empty campus placeholder; clicking room placeholders in order reaches the existing go-nogo/flight with a valid design. Tests for unlock rules.

### Phase 1 — The world (2 agents in parallel)
**WP-1A Campus & camera** (Deps WP-0) — diorama layout with 8 buildings (procedural + existing NASA GLBs: `vab`, `dsn-34m`, `jsc-mission-control`, `cleanroom-oru`, `launch-gantry`), paths, tilt-shift DOF, day lighting, HQ flip-board (budget + months, reuse `ui/kit/Flap`), door portals with glow/lock reason. Follow cam in `camera/rig.ts`.
**WP-1B Astronaut & cart** (Deps WP-0) — `astronaut.glb` with idle/walk (procedural bob if no clips), click-to-move on nav grid (pure `controller.ts`, tested), WASD, suit stripe color, name entry in opening; cart follows with spring lag and renders current CubeSat from design.
- Accept (both): walk from dorm to every door; entering a door mounts its room; Esc returns to campus at the door.

### Phase 2 — Minigames (up to 7 agents in parallel; each one self-contained)
Every brief = the matching §3.2 paragraph + contract + "use these sim functions: …". Each agent must: pure `logic.ts` with tests; View; produce ≥1 Insight with a real sim number; first play ≤ 90 s; skip button on replay; no 2D panels larger than 30% of screen.

| WP | Minigame | Key reuse | Sim inputs |
|---|---|---|---|
| 2A | Shadow Hunt + difficulty/reserve | `scene/space/Moon`, textures `moon-ice.webp` | `data/brief` |
| 2B | Dark Crater Bench | `models/parts/inst-*.glb`, `lunar-crater-terrain.glb`, `scene/interaction/*` | `data/parts` (instruments: mass, power, data rate, science) |
| 2C | Pack the 6U + Wire the Bus | `scene/factory/*`, `models/spacecraft/*`, `DropSlot`, `snap`, `InsideCam` | `data/parts`, `sim/budgets` |
| 2D | Eclipse Survival | CubeSat model, chamber built procedurally | `data/orbits` (eclipse), `sim/budgets` (power) |
| 2E | Orbit Sling + transfer | `viz/orbit/*`, `scene/space/*` | `data/orbits`, `data/transfers`, `sim/budgets` (Δv) |
| 2F | Catch the Pass | `dsn-34m.glb`, `tall-dish.glb`, `steps/comms/hours.ts` | `data/ground`, radio parts |
| 2G | Rideshare Manifest | `scene/rocket/*`, `models/rocket/*`, `ride-*.glb` | `data/rides`, `sim/checks` (mass/date) |

### Phase 3 — Launch (2 agents, parallel)
**WP-3A Launch Director poll** (Deps WP-0) — Mission Control room, 4 consoles from `sim/checks`, fix-routing to rooms, weather hold choice, hold-to-launch countdown, existing voice lines.
**WP-3B Ascent shot list** (Deps WP-0) — implement `camera/rig.ts` shot sequencer and the 7-shot table in §3.3 exactly (positions/FOVs as given; tune by ≤ 20%). Replace current `LaunchPad` camera logic; reuse `FairingRide`. Deploy shows the player's actual parts. Skippable.

### Phase 4 — Flight & debrief (2 agents)
**WP-4A Interactive flight moments** (Deps 2D, 2F, 3B) — burn-window minigame, event → minigame mapping (§3.4), remove event images, ice-map painting on pole as main score view, ≤ 3 HUD elements.
**WP-4B Debrief** (Deps WP-0) — predicted-vs-actual from `insights`, procedural SVG patch, "redesign one room" loop.

### Phase 5 — Audio & polish (2 agents, can start after WP-0)
**WP-5A Voice** — write Reyes script (≈40 lines, plain English, ≤ 2 sentences each) in `docs/design/voice-script.md`, generate with ElevenLabs (choose voice via `creative_list_voices`; extend `scripts/assets/gen-audio.ts`), register in `assets/cues.ts`.
**WP-5B Music & foley** — layered stems per location + listed foley; crossfade in `assets/director.ts` keyed on `worldStore.currentRoom`.

### Phase 6 — Cleanup & proof (1 agent)
**WP-6** Delete classic step UI + AI images (§3.7) once rooms reach parity; update e2e suite to play campus → flight via dev hooks; hackathon checklist self-review (`docs/hackathon/checklist.md`) written to `docs/design/checklist-review.md`.

### Orchestration notes
- Max parallelism: Phase 1 (2) → Phase 2 (7) + 3 + 5 alongside → 4 → 6. Under ~10 agents total at any time.
- Each subagent prompt = "Read `docs/design/ICE-HUNTERS-VISION.md` §1–4, then implement WP-xx exactly. Do not modify `src/sim` or `src/data` or other WPs' folders. Report: files changed, tests, screenshots via the `run` skill."
- Integration owner (Opus) reviews each PR against the five pillars; rejects anything that reintroduces a card grid or a panel > 30% screen.

## 6. Open decisions for the team
1. Camera style for the campus: 3/4 top-down diorama (recommended: readable, cheap, charming) vs. third-person over-shoulder.
2. Is Thermal-Vac (new room) worth the extra scope for the hackathon deadline? (Recommended yes — it's the most direct "why" for power/battery and test time.)
3. Co-op hot-seat in this pass, or after?
