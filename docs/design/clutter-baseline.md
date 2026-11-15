# Clutter baseline

Measured by `pnpm audit:clutter` (scripts/e2e/clutter-audit.mjs) on `chore/clutter-audit` @ `7cd7435`, 2026-11-15, at 1440×900.

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
| 2 | Step 08: Go/No-Go | **171.3** | 35 | 19 | 24 | 410 | 0 | 2 | +32 |
| 3 | Step 04: Spacecraft | **135.3** | 39 | 27 | 9 | 132 | 10 | 1 | +36 |
| 4 | Step 07: Comms | **121.5** | 30 | 25 | 9 | 379 | 0 | 2.3 | +27 |
| 5 | Step 03: Rocket | **105.3** | 19 | 36 | 9 | 170 | 8 | 1 | +16 |
| 6 | Step 05: Orbit | **94.7** | 23 | 17 | 9 | 188 | 0 | 1 | +20 |
| 7 | Step 00: Brief | **91.1** | 17 | 15 | 12 | 244 | 0 | 1.7 | +14 |
| 8 | Step 06b: Ride, transfer stage | **85.1** | 19 | 17 | 9 | 122 | 0 | 1 | +16 |
| 9 | Step 01: Planning | **79.6** | 17 | 25 | 6 | 104 | 0 | 1 | +14 |
| 10 | Flight: build months on the base | **67.6** | 21 | 9 | 4 | 183 | 7 | 1 | +18 |
| 11 | Base map (mission chosen) | **66.3** | 20 | 10 | 4 | 171 | 6 | 1 | +17 |
| 12 | Step 02: Instruments | **64.5** | 6 | 24 | 8 | 178 | 2 | 1.5 | +3 |
| 13 | Flight with an event card | **49.1** | 13 | 11 | 3 | 123 | 0 | 1.1 | +10 |
| 14 | Step 06: Ride | **48.4** | 9 | 19 | 3 | 94 | 0 | 1 | +6 |
| 15 | Flight HUD (space view) | **40.3** | 8 | 17 | 2 | 52 | 0 | 1 | +5 |
| 16 | Agency panel: Popularity | **36** | 9 | 11 | 2 | 41 | 6 | 1 | +6 |
| 17 | Agency panel: Funds | **32.5** | 7 | 11 | 2 | 58 | 6 | 1 | +4 |
| 18 | Mission result pop-up | **30** | 5 | 3 | 5 | 81 | 0 | 1.1 | +2 |
| 19 | Agency panel: Sound & graphics settings | **29.7** | 4 | 15 | 2 | 26 | 6 | 1 | +1 |
| 20 | Agency panel: Headquarters (campaign) | **22.4** | 4 | 1 | 4 | 54 | 0 | 1 | +1 |
| 21 | Base map (no mission) | **21.6** | 4 | 10 | 1 | 24 | 6 | 1 | +1 |
| 22 | Agency panel: New mission | **14.3** | 4 | 2 | 1 | 52 | 0 | 1 | +1 |
| 23 | Title (opening curtain) | **4.6** | 1 | 1 | 0 | 64 | 0 | 1 | ok |
| 24 | Launch (ride inside the fairing) | **3.3** | 1 | 1 | 0 | 11 | 0 | 1.1 | ok |

Screenshots: `shots/clutter-audit/<id>.png` (git-ignored; re-run the audit to make them).
