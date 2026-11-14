# Moonshot · Space Mission Design Game

NASA Space Apps 2026 entry for the **Space Mission Design Game** challenge. The challenge brief and resources are in [docs/hackathon](docs/hackathon).

## Quick start

Requires **Node 22+** and **pnpm** (`corepack enable` installs it). Works on Windows, macOS and Linux.

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

## Stack

Vite · React · TypeScript · Tailwind CSS · react-three-fiber (Three.js) · Zustand · Zod · Vitest

## Project layout

```
docs/       Challenge brief, resources, design notes
public/     Static assets served as-is
src/
  sim/      Simulation and game logic: pure TypeScript, no React, unit-tested
  data/     Game data and balance tables
  state/    Shared app state (Zustand)
  scene/    3D views (react-three-fiber)
  ui/       React UI components
```
