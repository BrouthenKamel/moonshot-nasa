# Clutter baseline

Measured by `pnpm audit:clutter` (scripts/e2e/clutter-audit.mjs) on `chore/clutter-audit` @ `89de90e`, 2026-11-15, at 1440×900.

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
| 1 | Report | **188.3** | 47 | 12 | 24 | 413 | 0 | 2.9 | +44 |
| 2 | Step 9: Go/No-Go | **168.2** | 33 | 20 | 24 | 409 | 0 | 2 | +30 |
| 3 | Step 4: Spacecraft | **136.3** | 39 | 28 | 9 | 133 | 10 | 1 | +36 |
| 4 | Step 8: Comms | **122.5** | 30 | 26 | 9 | 380 | 0 | 2.3 | +27 |
| 5 | Step 7: Rocket | **106.3** | 19 | 37 | 9 | 171 | 8 | 1 | +16 |
| 6 | Step 6: Ride | **98.8** | 25 | 22 | 7 | 230 | 0 | 1 | +22 |
| 7 | Step 3: Instruments | **97.8** | 12 | 32 | 12 | 232 | 2 | 1.6 | +9 |
| 8 | Step 1: Brief | **92.1** | 17 | 16 | 12 | 244 | 0 | 1.7 | +14 |
| 9 | Step 2: Planning | **79.6** | 17 | 25 | 6 | 104 | 0 | 1 | +14 |
| 10 | Agency panel: Popularity | **74.3** | 22 | 11 | 5 | 170 | 6 | 1 | +19 |
| 11 | Step 5: Orbit | **71.5** | 16 | 21 | 5 | 141 | 0 | 1 | +13 |
| 12 | Agency panel: Funds | **70.6** | 20 | 11 | 5 | 182 | 6 | 1 | +17 |
| 13 | Flight: build months on the base | **67.6** | 21 | 9 | 4 | 183 | 7 | 1 | +18 |
| 14 | Agency panel: Sound & graphics settings | **66.7** | 17 | 14 | 5 | 148 | 6 | 1 | +14 |
| 15 | Base map (mission chosen) | **66.3** | 20 | 10 | 4 | 171 | 6 | 1 | +17 |
| 16 | Base map (no mission) | **59.8** | 17 | 10 | 4 | 153 | 6 | 1 | +14 |
| 17 | Flight with an event card | **46.8** | 12 | 11 | 3 | 113 | 0 | 1 | +9 |
| 18 | Flight HUD (space view) | **38.4** | 7 | 17 | 2 | 56 | 0 | 1 | +4 |
| 19 | Mission result pop-up | **30.1** | 5 | 3 | 5 | 83 | 0 | 1.1 | +2 |
| 20 | Agency panel: Headquarters (campaign) | **22.4** | 4 | 1 | 4 | 54 | 0 | 1 | +1 |
| 21 | Agency panel: New mission | **14.3** | 4 | 2 | 1 | 52 | 0 | 1 | +1 |
| 22 | Title (opening curtain) | **4.6** | 1 | 1 | 0 | 64 | 0 | 1 | ok |
| 23 | Launch (ride inside the fairing) | **3.3** | 1 | 1 | 0 | 11 | 0 | 1.1 | ok |

Screenshots: `shots/clutter-audit/<id>.png` (git-ignored; re-run the audit to make them).
