# Hands on Hardware: the immersive interaction design

*Experience spec for v+2. Branch base: `feat/flight-plan`, which holds the Flight Plan design system, Story/Engineer view, quest log and stamps. Written for the implementing engineer or model. Read this whole file before writing code.*

## 1. The problem
Every decision in Moonshot is still **a click on a card**. The cards are now honest and calm, but the player never *handles* the mission. A space mission is physical: hardware gets bolted into a box, a rocket gets stacked, a dish gets aimed, a craft rides a fairing into the dark.

The goal of v+2 is that the player does things **with their hands, in a place**, and sees the consequence **in the scene before any number**.

## 2. Design pillars
1. **Verbs, not forms.** Each step has one physical verb: **FIT** (bolt hardware into a box), **AIM** (point a dish), **DRAW** (shape an orbit), **STACK** (build a rocket), **BOARD** (dock with a ride), **LOOK THROUGH** (see with an instrument), **TURN THE KEY** (launch). Cards stay as the accessible fallback (§6). The verb is the main way to play.
2. **Drag is a question; drop is the answer.** While a part is held over a slot, the game *previews* it:
   - the quest log ghosts, the MarginTick ghost needles and the scene reaction all show what would happen;
   - dropping commits the choice; letting go anywhere else cancels it.

   This reuses `uiStore.previewPatch` exactly as hover does today, so "see the impact of each component" becomes tactile.
3. **The scene tells the truth first.**
   - Too heavy: the scale needle swings past the red line and the part sags.
   - Too little power: the bus lights brown out.
   - Data overflow: packets spill off the storage tray.

   Numbers stay in Engineer view (key **E**).
4. **Inside views are the reward.** Each building has a "look inside" moment you earn by completing its step:
   - look through the instrument;
   - ride inside the fairing;
   - stand at the dish.

   These views are short (5–15 s), skippable, and make the pitch demo.
5. **Science integrity.** Every number still comes only from `computeBudgets` / `goNoGo` / `simulate` (DESIGN-DIRECTION §3.1). Mechanics only *choose* catalogue options; they never invent continuous values the model doesn't have. For example, the orbit handle snaps to the 3 catalogue orbits, and the dish aim is pass/fail pointing, not a new gain formula.

## 3. Shared interaction system (build first, about 0.5 day)
A small set of pieces that every step reuses.

| Piece | Where | What it does |
|---|---|---|
| `useDragPart()` | `src/ui/interaction/drag.ts` (new) | Pointer-capture drag. It starts from a tray card (DOM) or a 3D part (R3F `onPointerDown`). It carries `{ field: keyof Design, value }`. While dragging it renders a DOM "ghost tag" that follows the cursor: an `fp-tag` with the part name. |
| `DropSlot` | `src/scene/interaction/DropSlot.tsx` (new) | An R3F component at a 3D anchor. It shows a dashed hairline outline in paper when idle and in kapton when a compatible part is held. On hover it calls `setPreviewPatch({[field]: value})`. On drop it calls `updateDesign` and plays `sfx.snap`. Wrong category: no highlight, and the part bounces back with `sfx.fit-error`. |
| Snap juice | `src/scene/interaction/snap.ts` | A 120 ms ease-in to the anchor, a 2% camera dolly nudge, a small dust/particle puff, and the Stamp on the matching tray card. |
| Reaction hooks | per scene | Pure functions `(budgets, previewBudgets) → visual state`, e.g. `scaleNeedleAngle(mass, limit)`, `brownout(powerMargin)`. They are unit-tested like `src/viz/*` view models. |
| Inside-view director | `src/scene/interaction/InsideCam.tsx` | Takes over the camera from a preset path, letterboxes (16:9 → 2.39:1 ink bars), and fades the HUD to just the caption. Esc or click skips. It respects `prefersReducedMotion()` by offering a still shot plus a caption instead. |

Rules:
- Drag must work with mouse, touch and pen (pointer events).
- The DOM ghost must be `pointer-events: none`.
- Everything in R3F must avoid drei `<Html>` (it caused the removeChild crash); project DOM tags with the existing `TagProjector` pattern (`src/scene/spacecraft/`, `src/scene/rocket/RocketBay.tsx`).

## 4. Step by step

### 04 Factory: FIT (the heart, do first)
- **Place:** the clean room already exists (`src/scene/spacecraft/SpacecraftStage.tsx`), with the assembly stand, ESD bench, deployers and fairing half.
- **Verb:** drag parts from the tray, or straight off the **ESD workbench** where the options lie as 3D models, into the open 6U frame. The frame shows **slot volumes** as hairline boxes for solar, battery, computer, attitude and propulsion. Instruments arrive pre-mounted from the Lab, tagged "from Research Lab".
- **Consequences in the scene:**
  - **Mass:** the craft sits on a **weighing scale** built into the assembly stand, with a physical needle dial whose red line is the 14 kg / ride limit. The needle swings with spring damping as parts go in. Over the limit, the stand creaks (sfx) and the needle shakes.
  - **Volume:** if a part doesn't fit the remaining U, its ghost turns into a nogo outline, sticks out of the frame, and refuses to drop.
  - **Power:** a **"sun lamp" toggle** on the bench lights the panels. A small glow runs along the harness to the bus, and the bus LEDs are steady when power is positive and flicker when power is short (`brownout()`).
  - **Propellant:** the tank model fills visibly. A heavier tank lowers the needle's margin, which teaches "propellant counts in the 14 kg" without text.
- **Look-inside reward:** "Close the panels" animates the side panels shut and folds the wings (pivot nodes already exist). The craft slides into the **6U deployer** (`model.sc-deployer_6u_*`), and the door shuts with a stamp: "INTEGRATED".

### 02 Research Lab: LOOK THROUGH
- **Place:** an optics bench in the lab. Mount it in front of the existing chase stage in `src/scene/instrumentStage/*`.
- **Verb:** drag up to two instruments from the shelf onto the **test cradle** under the CubeSat (the third swaps out the oldest, as today).
- **Look through:** a big **"Look through"** button, or double-clicking the mounted instrument, cuts to the instrument's point of view over the scrolling crater tiles:
  - **IR spectrometer:** the sunlit ground glows warm and the shadowed craters are pitch black. Caption: "I can't see into the dark."
  - **Laser reflectometer / neutron spectrometer:** inside the shadowed craters, ice sparkles in **cyan**, the only cyan.
  - **Camera:** a beautiful image with no ice.
- **Altitude lever:** a physical lever on the bench sets the pass height using the catalogue orbit heights (15 km / 100 km). Above the instrument's limit the beam visibly thins and the ice sparkle fades to nothing. This makes the "below 20 km" lesson visible.
- **Integrity:** the scene state comes from the existing stage model (`stageModel.ts`) and `projectedCoverage`. Nothing new is computed.

### 03 Launch Site hangar: STACK, then RIDE INSIDE
- **Place:** RocketBay (crane drops already exist).
- **Verb:** drag stages off the racks onto the crane hook. The crane carries the stage over and lowers it; it snaps with a thunk and a camera shake. The order is enforced by the slot list in `src/data/rocket.ts`. This step is cosmetic and changes no mission numbers (say so in Engineer view).
- **Ride inside (the big wow):** "Board" puts the camera **inside the fairing**, next to your integrated CubeSat in its deployer on the separation ring (`model.sc-fairing_half`, `sc-separation_ring`, `sc-deployer_6u_closed`).
  - Countdown with the existing voice lines.
  - Ignition: low rumble, camera vibration scaled by stage, and dust.
  - Max-Q: the shake peaks.
  - Staging: a thunk and a brief silence.
  - **Fairing separation:** the two halves peel away and **Earth floods the frame**; sunlight sweeps across the craft.
  - The deployer door opens and the spring pushes the CubeSat out, tumbling gently; the panels deploy.
  - End: a hard cut to the step's result.
- **Reuse:** the same sequence plays for real when the player launches after Go/No-Go, before the flight view takes over. Hook it in where the island launch plays: `uiStore.startLaunch` → `LAUNCH` timing in `src/state/uiStore.ts`.

### 05 Orbit: DRAW
- **Place:** OrbitView.
- **Verb:** drag a **periapsis handle** on the Moon. While dragging, a chalk-like hairline orbit follows the cursor and **snaps magnetically** to the nearest catalogue orbit (halo, elliptical, low circular), with a detent click.
- The release shows a fast time-lapse: the ground track paints ice **cyan** wherever the instrument can see, using `projectedCoverage`. The verdict stamp lands.
- **Integrity:** only the 3 orbits exist; the handle is a fancier picker.

### 06 Ride and Transfer: BOARD
- **Place:** the night launch pad with the split-flap departures board (already painted).
- **Verb:** drag your CubeSat's **boarding pass**, a tag showing its mass, onto a departure row. If the row's limit is lower than your mass, the pass bounces back and the flap reads "OVERWEIGHT". On a valid drop the flaps roll to "BOARDING" and the tank gauge fills to the transfer's fuel need.
- Choosing the transfer: drag the route ribbon (fast arc vs low-energy spiral) onto the Earth→Moon chart.

### 07 Comms: AIM
- **Place:** a ground station at dusk: the DSN 34 m dish and tall dish models are shipped (`model.env-*`).
- **Verb:** pick the station by dragging the antenna card onto a pad on a small rotating globe. Then **aim the dish**: drag it toward the Moon in the sky. The pointing is pass/fail (precise attitude control needed for the X-band dish, as the model already says).
- **Visible data:** data packets are small paper squares flowing Moon → dish. The onboard **storage tray** fills; overflow packets **fall off and fade**, so lost data is visible. The contact-hours slider becomes a **booking strip** on a 24 h dial: drag to widen the window.

### 01 Planning: SCHEDULE
- The console knob and fader already exist (`src/scene/ControlRoom.tsx`).
- Add a **magnetic schedule wall**: drag build, test and integration blocks onto a month strip that ends at the ride's departure flag. Test blocks lengthen the strip; if it passes the flag, the flag turns no-go and the train "leaves without you" (a small animation on the wall screen).
- Reserve: drag coins from the budget tray into a sealed **reserve box**.

### 08 Go / No-Go: TURN THE KEY
- After the stamp ceremony, a **launch key**: drag in a circle to turn it, then **hold** the button for 1.5 s while a ring fills. Releasing early aborts with a clunk.
- This feeds straight into the ride-inside sequence from step 03.

### Flight: STAY ON CONSOLE
- Event cards get a **decision clock** (30 s, drawn as a ruled bar; it pauses in Cadet/reduced motion). Running out picks the standing order, which matches the sim's default choice; no new rules.
- Camera buttons become **monitor tabs** on a CAPCOM console frame around the space view.
- At capture burn, slow motion with a held breath (music duck, then the burn rumble).

## 5. Priority and effort (wow per hour)
| # | Item | Effort | Why first |
|---|---|---|---|
| 1 | Shared drag/drop system + quest-log preview on drag | 0.5 d | Unlocks everything |
| 2 | Factory FIT with weighing scale and brownout | 1 d | Heart of the game; teaches mass and power without text |
| 3 | Ride-inside fairing sequence (rocket + launch reuse) | 1 d | The demo moment the user asked for |
| 4 | Lab LOOK THROUGH + altitude lever | 0.75 d | Makes the core science lesson visible |
| 5 | Launch key (hold to launch) | 0.25 d | Cheap, very tactile |
| 6 | Orbit DRAW with snapping | 0.5 d | |
| 7 | Comms AIM + packet flow / overflow | 0.75 d | |
| 8 | Ride BOARD (boarding pass) | 0.5 d | |
| 9 | Planning schedule wall | 0.5 d | |
| 10 | Flight decision clock + console frame | 0.5 d | |

Cut from the bottom up.

## 6. Constraints the implementer must keep
- **Accessibility and fallback:** the existing ChoiceCard trays stay usable by keyboard and screen reader. Drag is an enhancement. Every step still works with `canUseWebGL() === false` via the existing plain paths.
- **Model integrity:** drops call `updateDesign` with catalogue ids only. No new physics, and no displayed number computed outside `src/sim`.
- **Design system:** tokens and `src/ui/kit/*` only. Cyan only for ice. Hairline outlines, stamps and tags; no glow halos on drop targets. The kapton outline is the "valid" state.
- **Engineer view:** each scene reaction gets an `<Eng>` readout of the real number behind it (e.g. the scale shows "12.4 / 14.0 kg").
- **Performance:** the inside views reuse already-loaded models; preload the fairing and deployer when step 03 opens. Quality 'low' turns off shake and particles.
- **Tests:** keep `src/ui/screens.smoke.test.tsx` green, and unit-test every reaction hook (pure). Each verb gets a Playwright check: drag a part, then assert the quest log changed (the pattern is in the scratch `walk.mjs` used during v+1: SwiftShader Chromium, DOM clicks, `page.mouse` for drags).
- **Audio:** only existing ids from `src/assets/manifest.ts` (`sfx.snap`, `sfx.select`, `sfx.fit-error`, `sfx.hover`, ignition, countdown voice). New sounds go through `pnpm assets:audio` (ElevenLabs) and must be added to the manifest. Candidates: crane motor, scale creak, fairing separation pyro, key turn, dish servo.

## 7. Done means
A first-time player can, without reading a number:
1. see that the IR spectrometer is blind in the dark craters;
2. feel the craft get too heavy;
3. see data spill when the link is too thin;
4. turn the key and ride inside the fairing until it opens on Earth.

And pressing **E** at any moment shows the exact figures behind each of those.
