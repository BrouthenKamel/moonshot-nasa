# Balance redesign

*14 Nov 2026. Jakob, 18:44: "We need to redesign this from the ground up so that a sensible amount of designs wins."*

## The problem (QC session, headless runs)

- 6000 random 1-4-change perturbations of the reference designs collapsed into about 8 winning combos: laser + halo + chemical + 1 wing, or neutron/laser + elliptical + ion + 2 wings, always S-band, basic computer, lunar rideshare, low-energy transfer.
- About 10 of ~35 options never won: UHF, X-band, cold gas, large chemical tank, 100 km orbit, GTO, direct transfer, body-mounted solar, a 20% reserve, any two instruments together.
- From a reference design, 18-19 of 25 single-part changes gave a No-Go.
- The dials barely mattered (82 → 88%): with no testing at all a craft did as well as with two turns of it.

Why, found with the harness (below):

1. **The budget was binding for every design.** Team cost 0.5 M a month before launch and 0.3 M a month in a long transfer left 0.5-1.5 M of 22.5 M spendable for the cheapest designs. Any upgrade (a second instrument, a dish, a redundant computer, a bigger reserve) was a No-Go.
2. **The 14 kg limit and the 6 U box shut out whole families.** The chemical module weighed 3.6 kg dry, the IR spectrometer 3.2 kg, the dish 2 U, the commercial lander took 12 kg. No chemical craft fitted the commercial ride; no second instrument fitted anything.
3. **Delta-v made options useless.** Cold gas had 15 m/s; the big chemical tank (Isp 150) could not reach any orbit the 2 kg tank could not.
4. **Testing cost a turn of schedule but bought almost nothing.** No-signal odds 8% x2.0 untested, instrument wear 3% a turn: the schedule slack of skipping tests was worth more than the lower odds.
5. **Two instruments could never beat one**: only the better ice instrument's coverage counted.

## Targets

- At least 6 distinct winning architectures (ice instruments / engine family / orbit / ride / transfer).
- Every non-trap option is in at least one design that wins (full success in at least 60% of flights).
- No option is in every winner of its slot; no design wins more than about 92% (bad luck stays real).
- The dials are real choices: from an untested craft to a well-tested one is worth 15+ points of win rate; no reserve costs about 10 points against the recommended 10%; a 20% reserve fits only a lean craft.
- Ambition is a trade: two instruments score higher but cost money, mass and margin.

## What each option is for

| Slot | Option | Its niche | Its price |
|---|---|---|---|
| Instruments | Laser reflectometer | Sees ice from few passes (halo loop) | 25 W, precise pointing, below 20 km |
| | Neutron spectrometer | Low power, any light; body panels suffice | Narrow strip: needs the many passes of the elliptical orbit |
| | Laser + neutron | Two strips from the few halo passes: robust coverage | Mass and volume: only fits with cold gas or ion |
| | Ice + IR spectrometer | The sunlit-ground map: top score | Cost, mass, data volume; thinner margins |
| | Ice + camera | Outreach pictures | Data that crowds the link: a dish or more contact time |
| Solar | Body-mounted (28 W) | Light, cheap, nothing to deploy: a neutron craft | No power for the laser or an ion engine |
| | 1 wing (84 W) | Laser craft on a chemical engine | Too little for an ion engine |
| | 2 wings (120 W) | Ion engine, two instruments | Mass, cost |
| Radio | S-band patch | The default deep-space link | 1x rate |
| | X-band dish | 8x rate: the camera or the IR spectrometer's data | Precise pointing, 1.2 U, cost |
| Propulsion | Cold gas (MarCO, ~50 m/s) | Cheapest, smallest: commercial lander to the halo | Only works dropped near the Moon; no margin |
| | Chemical 2 kg | The halo from the lunar ride; elliptical from the lander | Mass, volume |
| | Chemical 3 kg | Elliptical orbit from the lunar ride, or straight in off the lander (direct) | Heaviest, bulkiest |
| | Ion 1.0 / 1.5 kg | Elliptical orbit from the lunar ride; GTO | Big array, months of spiral |
| Orbit | Halo loop | Cheap to reach and hold | 4.5 passes a turn: the laser only, or two instruments |
| | Elliptical | 141 passes | Costly to reach |
| Ride | Lunar rideshare | The brief's ride, turn 8 | |
| | GTO | Cheapest (0.5 M), earliest (month 7) | Ion only; a 15-month climb: thruster and time risk (best ~70%) |
| | Commercial lander | Close drop-off (half the capture burn): cold gas or a direct transfer works; time to test | 4.5 M, month 10 |
| Transfer | Low-energy | Saves propellant | Months of cruise |
| | Direct | No cruise: no months of team cost or cruise faults | Big tank; in practice the commercial lander only |
| Ground | own dish / 21 m / DSN | Cheap all day with a dish / balanced / reliable | rate vs price vs outages |
| Planning | Test months 0-3 | Each lowers failure odds (x2.5 untested to x0.7) | 0.4 M and a month of schedule |
| | Reserve 0-20% | Pays for fixes and an extended mission | Less to spend on the craft |

## Traps that stay, and why

Each one shows a plain reason when picked.

- **IR spectrometer alone** (the starting design): it needs sunlight, so it cannot see into the shadowed craters. This is the first lesson (Lunar IceCube). The Science bar says so.
- **Camera alone, or camera + IR**: neither sees into shadow. Same Science message.
- **UHF radio**: it does not reach Earth from the Moon (CubeSat 101). Comms is red.
- **100 km circular orbit**: too high for both ice instruments (20 km / 25 km); they map nothing there. The orbit view and the instrument stage name the height. It stays a trap because the UI teaches it as the "too high" lesson; making it work would change the 20/25 km rule in DESIGN-DIRECTION §3.5.

## Method

- Harness: `src/sim/balance.ts` enumerates every hardware design (10 instrument sets x every part x every orbit, ride, transfer and station, at the station's default and largest booking), keeps the ones that fly with a green Science bar, and flies each over many seeds.
- Full run: `pnpm balance` (all 20 plans, 30-40 seeds each, a few minutes). Light guard in `src/sim/balance.test.ts`: the archetype designs (one per architecture, `src/sim/fixtures.ts`) each fly and win, together they cover every non-trap option, and the traps say why.
- Diagnostics: `tools/why.ts` (which check stops each option), `tools/show.ts` (the numbers behind each archetype), `tools/dials.ts` (win rate by test turns and reserve).

## What changed

Model (only where data could not fix it):
- `scienceTotals`: two ice instruments combine their coverage, 1 - (1 - a)(1 - b). Before, only the better one counted, so a second instrument was pure cost.
- `computeBudgets`: transfer months cost a smaller cruise team (`teamCostCruise` 0.15 M) instead of the full flight team.
- `evaluate`: the "perfect craft" line counts every ice instrument in range, so it never contradicts a two-instrument result.

Data (old → new; all marked in the source comments):
- Team before launch 0.5 → 0.45 M a month; electric navigation 0.1 → 0.05 M a month; build effort 10 → 13 points a month (a one-instrument craft builds in 3 months, two instruments in 4).
- Testing: failure factor untested x2.0 → x2.5, one test month x1.4 → x1.5; no-signal odds 8% → 10%; instrument wear 3% → 4% a month.
- Fixes in flight: emergency tracking 0.5 → 1.0 M, thruster fix 1.0 → 1.5 M (what the reserve is for).
- Chemical module 3.6 → 2.8 kg dry, Isp 150 → 190 (nominal ASCENT; the shortfall in flight stays the thruster event).
- Cold gas: MarCO-class, Isp 45, 1.2 kg, 0.4 M (was Isp 70, 0.3 kg: 15 m/s).
- Body panels 20 → 28 W. IR spectrometer 3.2 → 2.4 kg, 3.0 → 2.2 M. Neutron spectrometer 2.0 → 1.8 U. Dish radio 2.0 → 1.2 U, 2.1 → 1.8 kg.
- GTO: month 6 → 7, 0.8 → 0.5 M. Commercial lander: 12 → 14 kg, 3.5 → 4.5 M, capture factor 0.4 → 0.5, cruise 1 → 2 months. DSN 0.15 → 0.1 M per hour.

## Results (main b0c9390 vs this branch; all 20 plans, 30-40 flights per promising design)

| | Before | After |
|---|---|---|
| Viable designs (Go + green Science) | 1,357 | 13,689 |
| Winning designs (>= 60% full success) | 821 | 9,009 |
| Distinct winning architectures | 11 | 30 |
| Options that never win (traps excluded) | 11 | 0 |
| Flashlight: single changes that still fly | 6 of 28 | 11 of 28 |
| LunaH-Map: single changes that still fly | 5 of 28 | 17 of 28 |
| Flashlight, test months 0/1/2/3 | 82 / 87 / 88 / No-Go | 72 / 83 / 88 / 90 |
| Flashlight, reserve 0/5/10/15/20% | 85 / 87 / 88 / 88 / No-Go | 83 / 88 / 88 / 88 / No-Go |
| Best design | 95% (40 flights) | 100% over 40, 97% over 1000 flights |

Open points:
- The reserve dial still flattens above 5% on a cheap craft: spare main budget also pays for an extended mission, so a reserve only matters for the fixes that need it. Its real cost is the craft you cannot afford.
- A direct transfer never meets the thruster event (it only rolls in cruise months), which makes elliptical + direct + redundant computer very robust (~92% even untested). Adding a roll at the direct capture burn is a small change in `simulate.ts`, left out because event selection is being reworked on another branch.
- On the elliptical orbit's 141 passes the laser saturates even without precise pointing or full power, so its pointing and power lessons bite only on the halo loop.
