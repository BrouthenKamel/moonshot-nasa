# Clutter baseline

Measured by `pnpm audit:clutter` (scripts/e2e/clutter-audit.mjs) on `fix/clutter-audit-screens` @ `7027bf3`, 2026-11-15, at 1440×900.

**Score** = numbers×2 + buttons + panels×3 + words/40. Higher is more cluttered. Numbers weigh most because the
screen budget allows three; panels weigh three because each one is a separate place the eye has to visit.

- **numbers**: visible numbers with a unit, %, $ or Day/Month word ("$18.8M", "68%", "120 kg", "Day 120").
- **buttons**: visible, enabled controls outside the 3D scene (buttons, links, inputs, tabs, radios…).
- **panels**: boxes ≥ 120×40 px with their own background or a full border (cards inside panels count too).
- **words**: visible words outside the 3D scene, including text further down a scrolling step screen.
- Everything counts only where it is on top: panels under a pop-up's backdrop or a cinematic do not count;
  content below the fold of a scrolling screen does (see screens tall).
- The flight screens fly the Lunar Flashlight reference design (src/sim/fixtures.ts): main's starting design
  often fails at launch, before an event card or the science orbit shows. The nine steps show the starting design.
- **scene**: labels and markers drawn inside the 3D scene (not scored; listed so a redesign does not just move clutter there).
- **screens tall**: how many 900 px screens the content needs (1 = fits; more means scrolling).
- **over budget**: numbers above the 3 the budget allows (the six-resource line is not separated out yet).

| # | Screen | Score | Numbers | Buttons | Panels | Words | Scene items | Screens tall | Numbers over budget |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Step 6: Comms | **122** | 32 | 20 | 11 | 198 | 0 | 1 | +29 |
| 2 | Step 3: Craft | **97.6** | 23 | 25 | 8 | 104 | 10 | 1 | +20 |
| 3 | Step 4: Orbit | **80.3** | 20 | 18 | 6 | 173 | 0 | 1 | +17 |
| 4 | Step 5b: Ride, transfer stage | **79.1** | 18 | 19 | 7 | 125 | 0 | 1 | +15 |
| 5 | Step 0: Brief | **71.7** | 17 | 14 | 6 | 226 | 0 | 1.4 | +14 |
| 6 | Step 2: Science | **58** | 6 | 21 | 7 | 158 | 2 | 1.5 | +3 |
| 7 | Step 7: Launch | **46.6** | 5 | 16 | 6 | 103 | 0 | 1 | +2 |
| 8 | Flight with an event card | **43.6** | 11 | 10 | 3 | 102 | 0 | 1 | +8 |
| 9 | Step 5: Ride | **38.2** | 7 | 16 | 2 | 88 | 0 | 1 | +4 |
| 10 | Step 1: Plan | **37.9** | 6 | 15 | 3 | 77 | 0 | 1 | +3 |
| 11 | Flight HUD (space view) | **37.1** | 7 | 16 | 2 | 44 | 0 | 1 | +4 |
| 12 | Report | **33.7** | 2 | 9 | 6 | 107 | 0 | 1 | ok |
| 13 | Agency panel: Popularity | **32.7** | 8 | 10 | 2 | 27 | 5 | 1 | +5 |
| 14 | Mission result pop-up | **31.8** | 6 | 3 | 5 | 73 | 0 | 1 | +3 |
| 15 | Base map (mission chosen) | **29.2** | 6 | 10 | 2 | 46 | 5 | 1 | +3 |
| 16 | Agency panel: Funds | **29.1** | 6 | 10 | 2 | 44 | 5 | 1 | +3 |
| 17 | Agency panel: Sound & graphics settings | **27.5** | 3 | 15 | 2 | 20 | 5 | 1 | ok |
| 18 | Flight: build months on the base | **26.1** | 5 | 9 | 2 | 45 | 6 | 1 | +2 |
| 19 | Base map (no mission) | **18.3** | 3 | 9 | 1 | 10 | 5 | 1 | ok |
| 20 | Agency panel: Headquarters (campaign) | **11.6** | 0 | 7 | 1 | 64 | 0 | 1 | ok |
| 21 | Liftoff (ride inside the fairing) | **7.1** | 0 | 1 | 2 | 5 | 0 | 1 | ok |
| 22 | Title (opening curtain) | **4.6** | 1 | 1 | 0 | 64 | 0 | 1 | ok |

Screenshots: `shots/clutter-audit/<id>.png` (git-ignored; re-run the audit to make them).
