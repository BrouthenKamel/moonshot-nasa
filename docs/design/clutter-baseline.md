# Clutter baseline

Measured by `pnpm audit:clutter` (scripts/e2e/clutter-audit.mjs) on `fix/audit-scene-and-launch-game` @ `b1cf3ee`, 2026-11-15, at 1440×900.

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
| 1 | Step 6: Comms | **124.1** | 32 | 22 | 11 | 202 | 0 | 1 | +29 |
| 2 | Step 3: Craft | **105.6** | 23 | 29 | 9 | 145 | 7 | 1 | +20 |
| 3 | Step 0: Brief | **90.1** | 17 | 15 | 12 | 202 | 0 | 1 | +14 |
| 4 | Step 5b: Trip (Ride's second view) | **81.2** | 18 | 21 | 7 | 129 | 0 | 1 | +15 |
| 5 | Step 4: Orbit | **72.9** | 16 | 20 | 6 | 115 | 0 | 1 | +13 |
| 6 | Step 7: Launch | **47.4** | 5 | 17 | 6 | 95 | 0 | 1 | +2 |
| 7 | Liftoff (countdown on the island) | **45.1** | 9 | 19 | 2 | 82 | 5 | 1 | +6 |
| 8 | Flight with an event card | **43.6** | 11 | 10 | 3 | 102 | 0 | 1 | +8 |
| 9 | Step 2: Science | **43.3** | 5 | 19 | 4 | 90 | 0 | 1 | +2 |
| 10 | Step 5: Ride | **40.3** | 7 | 18 | 2 | 91 | 0 | 1 | +4 |
| 11 | Step 1: Plan | **36.6** | 6 | 17 | 2 | 65 | 0 | 1 | +3 |
| 12 | Report | **33.7** | 2 | 9 | 6 | 107 | 0 | 1 | ok |
| 13 | Agency panel: Popularity | **32.7** | 8 | 10 | 2 | 27 | 5 | 1 | +5 |
| 14 | Flight: build months on the base | **32.6** | 7 | 11 | 2 | 65 | 5 | 1 | +4 |
| 15 | Mission result pop-up | **31.8** | 6 | 3 | 5 | 73 | 0 | 1 | +3 |
| 16 | Flight HUD (space view) | **31.1** | 5 | 14 | 2 | 44 | 0 | 1 | +2 |
| 17 | Base map (mission chosen) | **29.2** | 6 | 10 | 2 | 46 | 5 | 1 | +3 |
| 18 | Agency panel: Funds | **29.1** | 6 | 10 | 2 | 44 | 5 | 1 | +3 |
| 19 | Agency panel: Sound & graphics settings | **27.5** | 3 | 15 | 2 | 20 | 5 | 1 | ok |
| 20 | Base map (no mission) | **18.3** | 3 | 9 | 1 | 10 | 5 | 1 | ok |
| 21 | Agency panel: Headquarters (campaign) | **11.6** | 0 | 7 | 1 | 64 | 0 | 1 | ok |
| 22 | Launch Day: flying | **11.5** | 2 | 1 | 2 | 18 | 0 | 1 | ok |
| 23 | Launch Day: briefing | **5.9** | 0 | 1 | 1 | 74 | 0 | 1 | ok |
| 24 | Title (opening curtain) | **4.6** | 1 | 1 | 0 | 64 | 0 | 1 | ok |

Screenshots: `shots/clutter-audit/<id>.png` (git-ignored; re-run the audit to make them).
