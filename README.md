# Moonshot - Space Mission Design Game

NASA Space Apps 2026 entry for the **Space Mission Design Game** challenge. Design, build, and fly a CubeSat mission to map lunar ice.

## Quick Start

Requires **Node 22+** and **pnpm** (`corepack enable` installs it).

```bash
pnpm install
pnpm dev        # http://localhost:5173
```

| Script | What it does |
|---|---|
| `pnpm dev` | Dev server with hot reload |
| `pnpm test` | Unit tests (Vitest) |
| `pnpm lint` | Lint (oxlint) |
| `pnpm typecheck` | TypeScript check |
| `pnpm build` | Production build into `dist/` |

## How to Play

### The Mission
You are designing the **Lunar Ice Mapper** - a 6U CubeSat mission to detect and map water ice in permanently shadowed craters at the Moon's south pole.

### The Diagram and Replay
Each design step shows a live CubeSat cutaway that updates as you choose, a mission strip tracking where the choice sits in the mission, and a "what this choice changed" line summarising its effect on your resources. After a run, the turn replay gives you a scrubber over every turn with the events and numbers for each one, and you can reopen replays of past runs from Run History.

### The Challenge
Balance six interconnected resources (mass, power, budget, delta-v, data, time) to:
- Capture into lunar polar orbit with your own propulsion
- Map 70%+ of the south polar region with an instrument that sees into shadow (coverage counts once its data is home)
- Return 300 MB of science data
- Operate for 12 months
- Never overdraw your reserve

The game starts from a Lunar IceCube-like design. It can fly, but its IR spectrometer cannot see into the shadowed craters: finding out why, and fixing it, is the first lesson.

### The Process
1. **Planning** - Testing and budget reserve; build time follows from the parts you choose
2. **Instruments** - One or two of: IR spectrometer, laser reflectometer, camera, neutron spectrometer
3. **Spacecraft** - Solar array, battery, computer, attitude control, propulsion
4. **Orbit** - Halo loop, elliptical polar or low circular polar orbit
5. **Ride & Transfer** - Rideshare launch and transfer trajectory
6. **Communications** - Radio, ground station and contact hours
7. **Go/No-Go** - Nine bars; every red one says why and which step fixes it
8. **Flight** - The mission flies itself and stops on event cards that need a decision (lost signal, weak thruster, build delay)
9. **Report** - Each requirement met or missed, with the chain of decisions and events behind every miss

Every choice affects other systems - more instruments need more power, which needs bigger solar panels, which adds mass, which needs more fuel!

### The Model
All numbers and formulas follow the Lunar Ice Mapper logic map (`prototype/reference/core-loop-logic-map.md` on branch `python-core-logic`), where each value is tagged as sourced from a real mission or NASA document, derived, or a game value. The catalogue is in `src/data`, the maths in `src/sim` (`budgets.ts` is the one calculator behind every meter, check and flight turn). `src/sim/model.test.ts` checks the real-mission anchors, for example 858 m/s to enter a 100 km orbit directly (LRO: 854) and an 84% full-success rate for a Lunar Flashlight-like design.

### Difficulty Levels
- **Cadet**: $28M budget, half the bad luck, full explanations
- **Engineer**: $25M budget (about what Lunar IceCube cost), normal events
- **Flight Director**: $22M budget, 1.5x the bad luck
All three require 300 MB of science data.

### Team Mode (Optional)
Up to 4 players take roles (Ground, Science, Space, Launch). Each step shows whose turn it is, and Go/No-Go requires sign-off from all roles.

## Stack

Vite · React 19 · TypeScript · Tailwind CSS 4 · react-three-fiber · Zustand · Zod · Vitest

## Project Layout

```
docs/       Challenge brief, resources, design notes
public/     Static assets
src/
  data/     Game data: parts, orbits, events, balance tables (Zod-validated)
  sim/      Simulation engine: pure TypeScript, no React, unit-tested
  state/    Zustand store with persistence
  scene/    3D views (react-three-fiber)
  ui/       React components
```

## NASA Resources Used

Data and mechanics are grounded in real NASA mission data:

| Resource | How We Used It |
|---|---|
| **CubeSat 101** | Parts catalog (sizes, masses, costs), power systems, communications, typical mission costs |
| **Lunar IceCube mission** | IR spectrometer specs, CubeSat lunar trajectory, comm loss event |
| **Lunar Flashlight mission** | Laser reflectometer specs, thruster clog event, green propellant data |
| **LRO mission** | Polar orbit parameters, resolution vs altitude trade-offs |
| **GMAT** | Delta-v requirements for lunar transfer and capture |
| **NASA Design & Develop Science Missions** | Four-segment mission structure (Ground, Users, Space, Launch) |

## Checklist Coverage

| Feature | Status |
|---|---|
| Define mission objective | Covered - Lunar Ice Mapper brief |
| Design spacecraft | Covered - 7 subsystem categories |
| Select instruments | Covered - 4 instruments with trade-offs |
| Choose launch vehicle | Covered - 3 rideshare options |
| Choose orbit | Covered - 4 lunar polar orbits |
| Manage budget, mass, power | Covered - Live dashboard |
| Manage comms, data, time | Covered - Downlink vs generation balance |
| Mission simulation | Covered - Turn-by-turn with events |
| Evaluation system | Covered - Score breakdown + hints |
| Single and team play | Covered - Solo + 4-role pass-and-play |
| Multiple difficulty levels | Covered - Cadet/Engineer/Flight Director |
| Random events | Covered - 6 event types from real missions |
| Design consequences | Covered - Every choice moves resource bars |
| Interactive visualization | Covered - 3D spacecraft and mission views |
| Mission reports | Covered - Requirements, score, comparison to real missions |
| Save/share designs | Covered - Export code, run history |

## Out of Scope (v1.0)

- Campaign layer (multiple missions, agency progression)
- Networked multiplayer
- Online leaderboard
- Sandbox mode
- NASA imagery mini-tasks

## Credits

Built for NASA Space Apps Challenge 2026.
