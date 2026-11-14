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

### The Challenge
Balance six interconnected resources (mass, power, budget, delta-v, data, time) to:
- Capture into lunar polar orbit
- Cover 70%+ of the south polar region
- Return 10+ GB of science data
- Operate for 12 months
- Stay within budget

### The Process
1. **Planning** - Set your build/test timeline and budget reserve
2. **Instruments** - Choose science instruments (IR spectrometer, laser reflectometer, camera, neutron detector)
3. **Spacecraft** - Configure solar panels, battery, computer, attitude control, propulsion
4. **Orbit** - Select lunar orbit altitude (trade resolution vs fuel cost)
5. **Ride & Transfer** - Pick rideshare launch and transfer trajectory
6. **Communications** - Set up radio and ground station for data downlink
7. **Go/No-Go** - Review all systems before launch

Every choice affects other systems - more instruments need more power, which needs bigger solar panels, which adds mass, which needs more fuel!

### Difficulty Levels
- **Cadet**: $20M budget, 8 GB target, fewer events, full explanations
- **Engineer**: $16M budget, 10 GB target, normal events
- **Flight Director**: $13M budget, 12 GB target, frequent events

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
