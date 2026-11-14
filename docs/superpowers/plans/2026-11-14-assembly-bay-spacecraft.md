# Assembly Bay (Spacecraft step) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Spacecraft step's card lists with a 3D assembly bay in the Factory, where each part choice visibly changes the craft and a wall board shows the same checks as Go / No-Go.

**Architecture:** Pure view model (`bayView.ts`) and option catalogue (`trayOptions.ts`) feed two views: an HTML parts tray with a fact strip (always shown, also the no-WebGL path) and a react-three-fiber scene (`AssemblyBay.tsx`) whose wall board and scale read-out are canvas textures drawn by `boardPainter.ts`. Same recipe as the control room (`src/viz/planning/*`, `src/scene/ControlRoom.tsx`).

**Tech Stack:** React 19, TypeScript, three 0.187, @react-three/fiber 9, Tailwind 4, Zustand, Vitest (node).

**Spec:** `docs/superpowers/specs/2026-11-14-assembly-bay-spacecraft-design.md`

## Global Constraints

- No edits to `src/sim/*`, `src/data/*`, stores, `App.tsx`, `BaseScreen.tsx`, `BaseMap.tsx`, `CubeSatDiagram.tsx`, `cubesatSlots.ts`, `DesignDiagramPanel.tsx`, `SpacecraftView.tsx`.
- Shared edits, one line each: `DesignScreen.tsx` adds `'spacecraft'` to `STEPS_WITHOUT_DIAGRAM`; `Shell.tsx` gets `const FULL_BLEED_STEPS: DesignStep[] = ['planning', 'spacecraft']` and `.includes(designStep)`.
- Writes only via `updateDesign({ solar | battery | computer | attitude | propulsion })`.
- Numbers only from `computeBudgets` / `goNoGo`; mass shown is `totalMass` (fuelled).
- Box: 6 U, frame 2 × 3 × 1 units, block height = volume ÷ 2.
- Before the PR: `pnpm typecheck && pnpm test && pnpm lint && pnpm build`.

## Review Focus

1. Ride with a lower mass limit than 14 kg: the board and scale must use `massLimit`, not 14. Test in Task 1.
2. Two instruments plus the dish: stack exceeds 6 U; blocks above the line flagged, Volume row red. Test in Task 1.
3. Design ids that are missing from the catalogue (old saves): no throw, no `NaN`. Test in Task 1.
4. `captureDeltaV === null`: the Delta-v row says "cannot get there", no `NaN`. Test in Task 1.
5. No WebGL (tests, server): the screen renders the six rows as text. Covered by the existing smoke test plus a `NaN` check.

---

### Task 1: View model and option catalogue

**Files:**
- Create: `src/viz/spacecraft/bayView.ts`, `src/viz/spacecraft/bayView.test.ts`
- Create: `src/viz/spacecraft/trayOptions.ts`, `src/viz/spacecraft/trayOptions.test.ts`

**Interfaces (Produces):**
- `type Tone = 'green' | 'yellow' | 'red'`
- `interface StackBlock { key: string; category: PartCategory; partId: string; name: string; sub: string; volume: number; base: number; height: number; readOnly: boolean; building?: string; overLimit: boolean; callout: boolean; detail: number }` (`detail`: battery cells 1/2/4, computer boards 1/2, else 0; `callout` when volume < 0.5)
- `interface BoardRow { key: 'mass'|'volume'|'power'|'money'|'deltav'|'time'; title: string; text: string; value: number; limit: number; tone: Tone; reason: string }`
- `interface BayView { stack: StackBlock[]; usedU: number; limitU: number; rows: BoardRow[]; partsCost: number; status: { tone: Tone; title: string; lines: string }; massText: string; massTone: Tone; outside: { solar: 'body'|'wings'|'array'; starTracker: boolean; radio: 'whip'|'patch'|'dish'; engine: 'cold'|'chemical'|'ion'|'none'; powerShort: boolean; engineStarved: boolean }; worst: Tone }`
- `buildBayView(design: Design, budgets: Budgets, checks: CheckResult[]): BayView`
- `interface TrayOption { id: string; short: string; stats: string; description: string; facts: string }`, `interface TrayGroup { key: 'solar'|'battery'|'computer'|'attitude'|'propulsion'; title: string; color: string; options: TrayOption[] }`
- `trayGroups(budgets: Budgets): TrayGroup[]` (battery facts use `eclipsePowerConsumed`, `eclipseDurationMinutes`)

Stack order bottom to top: propulsion, instruments (in design order), radio, attitude, computer, battery. Status: first red row in order mass, volume, power, money, deltav, time; else first yellow; else green "FITS. READY FOR THE NEXT BUILDING." Row tones come from the check with the same resource name (`Mass`, `Volume`, `Power`, `Budget`, `Delta-v`, `Time`).

- [ ] **Step 1: Write failing tests**
  - `stack heights sum to totalVolume / 2` for `createDefaultDesign()` and `flashlightDesign`.
  - `default design board`: mass text `12.8 / 14 kg`, volume `4.4 / 6 U`, power `uses 30 of 120 W`, all tones match their checks.
  - `two instruments and the dish overflow`: `{...flashlightDesign, instruments: ['inst-laser','inst-neutron'], radio: 'radio-xband'}` → some `overLimit` true, volume tone `red`, status tone `red`.
  - `too heavy`: `prop-chemical-large` + `inst-ir-spec` + `inst-neutron` → mass red, status title starts `MASS`.
  - `lower ride mass limit`: budgets patched with `massLimit: 12` → mass text ends `/ 12 kg`.
  - `missing parts`: design with `battery: 'nope', propulsion: 'nope'` → no throw, `JSON.stringify(view)` has no `NaN`.
  - `no route`: budgets patched `captureDeltaV: null` → deltav text `cannot get there`.
  - `body panels short of power`: `solar: 'solar-body'` → `outside.powerShort` true, power red.
  - `ion starved`: `solar: 'solar-1wing'` with `prop-ion-large` → `outside.engineStarved` true.
  - `readOnly blocks name their building`: instrument blocks `building === 'Research Lab'`, radio `'Communications Center'`.
  - trayOptions: group sizes `[3,3,2,2,5]`; ids equal the catalogue's; every `facts` non-empty; ion option facts contain `56`.
- [ ] **Step 2:** `pnpm vitest run src/viz/spacecraft` → FAIL (modules missing).
- [ ] **Step 3:** Implement both modules.
- [ ] **Step 4:** Same command → PASS.
- [ ] **Step 5:** Commit `feat(spacecraft): bay view model and parts catalogue`.

### Task 2: Screen, tray, fallback, shared edits

**Files:**
- Create: `src/ui/steps/spacecraft/PartsTray.tsx`, `src/ui/steps/spacecraft/BoardText.tsx`
- Modify: `src/ui/steps/SpacecraftScreen.tsx` (rewrite), `src/ui/screens/DesignScreen.tsx`, `src/ui/Shell.tsx`

**Interfaces:**
- Consumes: Task 1.
- Produces: `PartsTray({ groups, design, onPick })` with `onPick(key, id)`; `BoardText({ view })` (six rows as text, used without WebGL); `useBayView(): BayView` exported from `SpacecraftScreen.tsx` region or `src/viz/spacecraft/useBayView.ts`.

Tray: five `role="radiogroup"` groups, buttons `role="radio"` `aria-checked`, arrow keys move within a group. Fact strip above: description + facts of the hovered/focused/last-picked option. Back → `instruments`, Next → `orbit`, laid over the picture at top-left / top-right as in `PlanningScreen`.

- [ ] **Step 1:** `pnpm vitest run src/ui/screens.smoke.test.tsx` passes before the change (baseline).
- [ ] **Step 2:** Implement; scene slot is a placeholder `div` for now.
- [ ] **Step 3:** Smoke test PASS; `pnpm typecheck` clean.
- [ ] **Step 4:** Commit `feat(spacecraft): parts tray, fact strip and plain fallback`.

### Task 3: Bay scene

**Files:**
- Create: `src/viz/spacecraft/boardPainter.ts`, `src/viz/spacecraft/boardPainter.test.ts`, `src/scene/factory/AssemblyBay.tsx`
- Modify: `src/ui/steps/SpacecraftScreen.tsx` (lazy scene in an error boundary)

**Interfaces:**
- `BOARD_W = 1600`, `BOARD_H = 1200`; `paintBoard(ctx, view, anim: { t: number; reduced: boolean; shown: Record<BoardRow['key'], number> })`; `paintScale(ctx, view)`; `wrapText(ctx, text, maxWidth): string[]`.
- `AssemblyBay({ view, reduced })`.

- [ ] **Step 1:** Painter tests with the recording context from `screenPainter.test.ts`: every numeric arg finite for the Task 1 cases; `wrapText` never exceeds 3 lines for the longest `goNoGo` reason.
- [ ] **Step 2:** FAIL, implement, PASS.
- [ ] **Step 3:** Scene: room, turntable (drag to turn, slow sway unless reduced), frame turning red when volume red, to-scale blocks with front labels or call-out tags, wall board and scale textures repainted only while easing or blinking.
- [ ] **Step 4:** Browser check at 1280 × 720.
- [ ] **Step 5:** Commit `feat(spacecraft): assembly bay scene with wall board and scale`.

### Task 4: Outside parts and polish

**Files:** Modify `src/scene/factory/AssemblyBay.tsx`.

- [ ] **Step 1:** Wings (body / one / two segments, unfolding), star tracker, radio (whip / patch / dish), nozzles (cold / chemical / ion grid), battery cells and computer boards on call-out tags, propellant gauge on the propulsion block.
- [ ] **Step 2:** Red states: ring, frame, accent light; cells flicker when `powerShort`, ion glow sputters when `engineStarved` (steady under reduced motion).
- [ ] **Step 3 (droppable):** crane lowers a changed part.
- [ ] **Step 4:** Browser check of all 15 options and the four failure states; keyboard; WebGL off.
- [ ] **Step 5:** `pnpm typecheck && pnpm test && pnpm lint && pnpm build`; commit `feat(spacecraft): outside parts and alarm states`.

### Task 5: PR

- [ ] Screenshots into `docs/superpowers/specs/assets/`, push, open PR, send link to Integration.
