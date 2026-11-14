# Plan: put the catalogue art into the mission-planning screens

Branch: `art/assets-v2` (not pushed). Written 14 Nov 2026 for an AI coding agent to implement.

## Why

Picking parts, orbits, rides and ground stations "feels like a website, not a game": parts are coloured
boxes, choices are text lists. New art was made for exactly this and is committed on this branch, but no
game screen uses it yet. The job is to put it into every mission-planning screen, so each pick is
hardware you see and a card you choose, with a sound.

## Read first

1. `docs/art/asset-catalogue.md`: what the art is and how to use it.
2. `docs/DESIGN-DIRECTION.md`: the rules every screen follows (section 3) and the visual language (section 4).
3. Open `/catalogue-lab.html` on the dev server: every choice already dealt as cards.

The tools you will use:

| Tool | Where | What it gives |
|---|---|---|
| `choiceArt(id)` | `src/assets/catalogueArt.ts` | For any catalogue id (part, orbit, ride, transfer, ground station, difficulty): `model`, `portrait`, `card`, `accent`, `pick` sound |
| `<ChoiceCard>` | `src/ui/kit/ChoiceCard.tsx` | A choice as a game card. Sizes `xs` (fills its grid cell), `sm`, `md`, `lg`; `look` `portrait` or `scene`; `selected`, `disabled` + `reason`; radio mode for trays: `radio`, `tabIndex`, `buttonRef`, `onKeyDown`, `onFocus`, `onHover`, `ariaLabel`; `sounds={false}` to mute it |
| `useModel(modelId)` | `src/assets/models.ts` | A private copy of a 3D part (real metres, +Y up, +Z forward, resting on y = 0). Moving parts sit under `pivot_<name>` nodes with `userData.stowed` |
| Pose and reflections | `src/scene/space/CubeSat.tsx` | How to fold and unfold pivots, and how to add studio reflections so metal does not render black |
| `audio.play(id)` | `src/assets/audio.ts` | Sounds: `sfx.pick-*`, `sfx.hover`, `sfx.card-flip`, `sfx.fit-error`, `sfx.snap` |

Do not change `ChoiceCard.tsx`, `catalogueArt.ts`, the models or the manifest unless a task below says so.

## Current state: unfinished work in the tree

An earlier attempt stopped part-way when the usage limit was hit. These changes are uncommitted and
unreviewed. They typecheck, but nothing else has been checked:

| Area | Changed | New |
|---|---|---|
| Factory bay | `src/scene/factory/AssemblyBay.tsx` | `src/scene/factory/PartSlot.tsx` |
| Factory tray | `src/ui/steps/spacecraft/PartsTray.tsx`, `src/ui/steps/SpacecraftScreen.tsx` | `src/ui/steps/spacecraft/TrayCard.tsx` |
| Research Lab | `src/scene/instrumentStage/InstrumentBar.tsx`, `Scene.tsx` | `InstrumentModel.tsx`, `instrumentCards.ts` (same folder) |
| Launch Site | `src/ui/steps/RideScreen.tsx`, `RideOverlay.tsx` | `src/ui/steps/launch/` |
| Comms Center | `src/ui/steps/CommsScreen.tsx` | `src/ui/steps/comms/` (ContactSlider, Inspector, LinkConsole, RadioTray, StationTray, hours, useCardRadioGroup) |
| Orbit | not started | — |

Start with `git diff` and a run of the checks. For each area, keep the partial work if it is sound and
finish it; otherwise revert that area (`git checkout -- <files>`, delete its new files) and redo it.

## Rules (from the design direction)

- **Numbers:** only from `computeBudgets`, `goNoGo` or the store. Never recompute mission numbers.
- **Writing:** a step writes only its own design fields, through `updateDesign`.
- **Other buildings' parts:** shown read-only, labelled with the building that chose them.
- **Go / No-Go bars:** the ones a step can turn red stay visible.
- **3D fallback:** every 3D view keeps its plain path (`canUseWebGL`, `lazy`, `Suspense`, error boundary).
- **Accessibility:** keyboard and screen readers keep working: radio groups with arrow keys, labels.
- **Wording:** player-facing time is "month", never "turn".
- **Colours:** cyan is for ice only. Orbit colours are violet, lime and sky blue.
- **Nothing lost:** every name, number, description and "why it is red" stays reachable. It is just shown as a game.
- **Motion:** respect `prefers-reduced-motion`.
- **Sound:** no pick plays two sounds. The cue director (`src/assets/cues.ts`) already plays `sfx.snap` or
  `sfx.select` when the design changes. Either pass `sounds={false}` to the cards, or change `cues.ts`
  (and its test) so it no longer plays a sound for a design change that a card already sounded. Pick one way
  and apply it everywhere.

## Tasks, one per screen (independent; can run in parallel, each touching only its own files)

### 1. Factory bay, step 3 (`src/scene/factory/`)

Inside the open 6U box, replace the coloured stack blocks with the real part models (`choiceArt(partId).model`).
- **Keep the stacking:** slots stay sized by volume (`src/viz/spacecraft/bayView.ts`). Fit each model uniformly
  into its slot, centred, so a box that is too full still visibly overflows and matches the Volume check.
- **Keep the readouts:** name tags and the red / over states stay readable.
- **Snap in:** a newly picked part drops into its slot with a short eased animation (instant under reduced motion).
- **Outside parts:** wings, antenna and engine stay from `CraftModel.tsx` / `cubesat-6u`.
- **Lighting:** add studio reflections so the metal reads well.

### 2. Factory parts tray, step 3 (`src/ui/steps/spacecraft/`, `SpacecraftScreen.tsx`)

Turn every bin option into a compact portrait card (`ChoiceCard size="xs" look="portrait" radio`), showing its
short name and key numbers from `src/viz/spacecraft/trayOptions.ts`.
- **Keep the behaviour:** the five radio groups, arrow keys, the hover and focus `onActive` (it drives the fact
  strip and the bay highlight), and the category colours and headers.
- **Fit the screen:** the tray must not push the bay off screen at 1440×900 or 1280×720.
- **Fallback:** give the plain (no-WebGL) Spacecraft path the same cards.

### 3. Research Lab, step 2 (`src/scene/instrumentStage/`, `src/ui/steps/InstrumentsScreen.tsx`)

Make the instrument bar a row of instrument cards: portrait, instrument colour, and chips for mass, power, cost
and the key lesson (sees into shadow or not; altitude limit).
- **Keep the behaviour:** the toggle rule (up to two, `stageModel.ts`), keyboard use and the stage readouts.
- **Fallback:** do the same for the flat fallback list.
- **Optional:** in `Scene.tsx`, the box instruments under the satellite become the real instrument models,
  placed so the beams still come out of them.

### 4. Launch Site, steps 4 and 5 (`OrbitScreen.tsx`, `RideScreen.tsx`, `RideOverlay.tsx`, `src/ui/steps/launch/`)

Make the orbit, ride and transfer choices painted cards (`look="scene"`), showing today's numbers as chips.
- **Disabled options:** an incompatible option is disabled and shows its reason, e.g. a transfer that needs a
  chemical engine.
- **Ride cards:** may show the launch-vehicle portrait as an inset.
- **Layout:** the full-bleed 3D scenes stay visible; the cards sit in a tidy row over the scene.
- **Keep:** keyboard use and the Go / No-Go bars these steps can turn red.

### 5. Comms Center, step 6 (`CommsScreen.tsx`, `src/ui/steps/comms/`)

Turn the step into a mission-control comms console, in the dark room style. Title line:
"COMMS CENTER · LUNAR ICE MAPPER · COMMUNICATIONS"; building colour blue.
- **Radios:** portrait cards with chips for rate, mass, power, cost, and whether it reaches the Moon. Warnings
  and disabled reasons come from the data.
- **Ground stations:** painted cards, with the dish portrait as an inset.
- **Link budget:** data made per month against the downlink, from `computeBudgets`, as a gauge.
- **Contact hours:** keep the slider, properly labelled and accessible.
- **Keep:** the text that `src/ui/screens.smoke.test.tsx` pins for Comms.

### 6. Integration (after 1 to 5)

1. **Sound:** apply the one rule for double sounds (see Rules).
2. **Consistency:** make card sizes, styles and colours consistent across screens.
3. **Docs:** add one line to `docs/art/asset-catalogue.md` saying where each screen now uses the art.

## Verification

- `pnpm typecheck && pnpm test && pnpm lint && pnpm build` all pass. Change a pinned test text only on purpose,
  and say so.
- **Play it in a browser.** On `pnpm dev`, click "Begin", then from the agency map use the top-bar status button
  and the left step rail. Walk Brief → Planning → Instruments → Spacecraft → Orbit → Ride & Transfer →
  Communications → Go/No-Go, picking a different option on each. Then launch, fly to the end (answer event cards)
  and open the report.
  - **Window sizes:** check 1440×900 and 1280×720: nothing overlaps or is clipped.
  - **Keyboard:** do one pass with the keyboard only.
  - **Plain path:** do one pass without WebGL. Headless Chromium with `--disable-webgl --disable-3d-apis` shows
    the plain fallbacks.
  - **Screenshots:** headless Chromium with SwiftShader works for these. The executable is at
    `~/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`, `playwright-core` is a dev dependency, and the
    args are `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`.
- **Commit:** one commit per screen on `art/assets-v2`. Do not push or merge without the user's go.

## Out of scope

- New art.
- Changes to the sim or data.
- The difficulty picker in the base's top bar. Its cards exist (`card.difficulty-*`); using them is a later step.
