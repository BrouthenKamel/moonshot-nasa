# Lunar Ice Mapper: core-loop logic map

*14 Nov 2026. Pure program logic for the single-mission core loop: no interface, no graphics. Every formula below is implemented in `logic_check.py`, which was run to check that the logic works end to end (section 9).*

**Tags on numbers:** **[S]** sourced from a real mission or NASA document · **[D]** derived from sourced numbers or physics · **[G]** game value, ours to tune.

**Units:** one turn = one month · mass kg · volume U (1 U = 10 × 10 × 10 cm) · power W · money in millions (M) · data MB · delta-v m/s.

---

## 1. How the stages interact

| From | To | What is passed |
|---|---|---|
| Brief | 7, 8, 9 | Volume cap, mass cap, budget, ride turn, the requirements |
| 2 Instruments | 3 Spacecraft | Mass, volume, power, cost, build effort |
| 2 Instruments | 4 Orbit | Footprint per pass, maximum useful altitude, "sees into shadow" |
| 2 Instruments | 6 Comms | Data per turn |
| 3 Spacecraft | 1 Planning | Build effort (sets build turns) |
| 3 Spacecraft | 5 Transfer | Dry mass, wet mass, engine type, Isp, thrust, array power, bus power |
| 3 Spacecraft | 6 Comms | Radio, antenna gain, pointing, transmit power, storage |
| 4 Orbit | 3 Spacecraft | Sunlit share, eclipse length, observing share (power and battery checks) |
| 4 Orbit | 5 Transfer | Insertion delta-v, upkeep delta-v per turn |
| 4 Orbit | 6 Comms | Earth visibility |
| 1 Planning | 7 Check, 8 Simulation | Slack, reserve, spendable budget, failure-odds factor |
| 3, 4, 5, 6 | 7 Check | All margins: volume, mass, power, delta-v, link, data, cost, projected science |
| 7 Check | 8 Simulation (Go) or 3 Spacecraft (No-Go) | The full design |
| 8 Simulation | 9 Evaluation | Captured, mapped coverage, data home, science turns, money left, event log |
| 9 Evaluation | 1 Planning | "Try again with changes" |

Steps 3 to 6 depend on each other in a loop (orbit sets power and delta-v needs, the spacecraft sets what orbit is reachable). The player may do them in any order; step 7 evaluates everything at once.

## 2. The brief (fixed inputs)

| Parameter | Value | Tag |
|---|---|---|
| Ride leaves on turn | 8 | G |
| If you miss it, next ride after | 6 turns | G |
| Budget | 25 M | G (Lunar IceCube cost about 24 million dollars over 7 years [S]) |
| Volume cap | 6 U | S |
| Mass cap | 14 kg | S (Lunar IceCube, Lunar Flashlight, LunaH-Map were all about 14 kg) |
| Coverage required | 70% of the south polar region, by an instrument that sees into shadow | G |
| Science data required | 300 MB on the ground | G |
| Turns in science orbit required | 12 | G (LRO's primary mission was one year [S]) |
| Extended mission | up to 12 more turns while coverage or data is still growing | G |

## 3. Player choices (15)

| Step | Choice | Options |
|---|---|---|
| 1 | Test turns | 0, 1, 2, 3 |
| 1 | Reserve | 0, 5, 10, 15, 20% of budget |
| 2 | Instruments | any 1 or 2 of: laser reflectometer, neutron spectrometer, IR spectrometer, camera |
| 3 | Solar array | small, medium, large |
| 3 | Battery | small, large |
| 3 | Propulsion | none, chemical, electric |
| 3 | Propellant mass | 0.5 to 3 kg chemical, 0.5 to 1.5 kg electric |
| 3 | Radio | UHF, deep-space X-band |
| 3 | Antenna | patch, deployable dish |
| 3 | Computer | basic, radiation-hard |
| 3 | Pointing | basic, precise |
| 4 | Orbit | halo loop, elliptical polar, low circular polar |
| 5 | Transfer | direct, low-energy |
| 6 | Ground station | own dish, partner 21 m dish, DSN 34 m dish |
| 6 | Contact hours per day | up to the station's limit |

## 4. Catalogue

### Instruments
| | Mass | Volume | Power | Cost | Effort | Data/turn | Sees into shadow | Max useful altitude | Footprint per pass | Counts as |
|---|---|---|---|---|---|---|---|---|---|---|
| Laser reflectometer | 2.0 | 2.0 [S] | 25 | 2.5 | 8 | 100 | yes [S] | 20 km [S: flies at 15 km] | 0.025 | ice |
| Neutron spectrometer | 2.5 | 2.0 [S: under 2.5] | 5 [S: low] | 2.0 | 6 | 30 [S: low] | yes [S] | 25 km [S: 5 to 25 km] | 0.010 | ice |
| IR spectrometer | 3.2 [S] | 1.5 [S] | 12 [S: 10 to 15] | 3.0 | 9 | 400 | no (needs sunlight) | none | 0.020 | context |
| Camera | 0.5 | 0.3 | 3 | 0.2 | 2 | 1500 | no | none | 0.050 | outreach |

Unmarked values are [G]. Real models: laser = Lunar Flashlight, neutron = LunaH-Map Mini-NS, IR = Lunar IceCube BIRCHES.

### Spacecraft parts
| Part | Option | Mass | Volume | Power | Cost | Effort | Special |
|---|---|---|---|---|---|---|---|
| Structure and harness | fixed | 2.2 | 0 | 0 | 1.0 | 4 | [G] |
| Heater | fixed | 0 | 0 | 3 | 0 | 0 | [G] |
| Solar array | small | 0.8 | 0 | | 0.3 | 2 | generates 40 W [G] |
| Solar array | medium | 1.3 | 0 | | 0.6 | 3 | generates 84 W [S] |
| Solar array | large | 2.0 | 0 | | 1.0 | 4 | generates 120 W [S] |
| Battery | small | 0.3 | 0.15 | | 0.1 | 1 | 40 Wh [G] |
| Battery | large | 0.6 | 0.30 | | 0.2 | 1 | 80 Wh [G] |
| Propulsion | chemical | 3.6 dry | 1.4 + 0.5 per kg propellant | | 2.5 | 9 | Isp 150 s effective [D], instant burns, up to 3 kg propellant |
| Propulsion | electric | 1.4 dry [S] | 1.3 + 0.2 per kg propellant [D] | 56 minimum, 65 nominal [S] | 3.0 | 10 | Isp 2150 s, thrust 1.1 mN [S], up to 1.5 kg [S] |
| Radio | UHF | 0.2 | 0.2 | listen 1, transmit 5 | 0.1 | 1 | does not reach Earth from the Moon [G] |
| Radio | deep-space X-band | 1.1 [S] | 0.5 [S] | listen 10, transmit 35 [S] | 1.5 | 4 | [S: JPL Iris] |
| Antenna | patch | 0.1 | 0 | | 0.05 | 1 | gain ×1 |
| Antenna | dish | 1.0 | 1.5 [S] | | 0.8 | 3 | gain ×8 [G]; ×0.25 without precise pointing |
| Computer | basic | 0.2 | 0.2 | 3 | 0.3 | 2 | storage 512 MB, reset factor 1.0 |
| Computer | radiation-hard | 0.4 | 0.3 | 5 | 0.9 | 4 | storage 4096 MB, reset factor 0.3 |
| Pointing | basic | 0.5 | 0.3 | 2 | 0.3 | 2 | |
| Pointing | precise | 0.9 | 0.5 | 3 | 0.8 | 4 | needed for dish and for full laser quality |

Solar arrays fold against the outside of the box, so they take no internal volume.

### Orbits (all polar)
| | Altitude over the pole | Passes per turn | Sunlit share | Eclipse | Earth visible | Upkeep delta-v per turn | Observing share of orbit |
|---|---|---|---|---|---|---|---|
| Halo loop (Lunar Flashlight's plan) | 15 km [S] | 4.5 [D] | 1.00 | 0 h | 0.95 | 1 [G: "low" S] | 0.01 |
| Elliptical polar, 15 × 3,150 km (LunaH-Map's plan) | 15 km [S] | 141 [S] | 0.85 | 0.6 h | 0.80 | 5 [G] | 0.08 |
| Low circular polar, 100 km (Lunar Prospector, KPLO) | 100 km [S] | 366 [D] | 0.60 [D] | 0.8 h [S: LRO up to 48 min] | 0.60 | 6.25 [S: KPLO 75 per year] | 0.10 |

### Delta-v to get from the ride's drop-off into the science orbit (m/s)
| Engine | Transfer | Halo loop | Elliptical | Low circular |
|---|---|---|---|---|
| Chemical | direct, about 5 days | 430 [G: "hundreds" S] | 514 [D] | 858 [D; LRO 854, Lunar Prospector 898 S] |
| Chemical | low-energy, 4 turns | 60 [S: 50 to 71] | 386 [D] | 727 [D] |
| Electric | low-energy | 250 [G] | 1000 [G; Lunar IceCube had 1,200 available S] | 1700 [D] |
| Electric | direct | not possible: too little thrust to brake on a fast fly-by | | |

[D] rows use the vis-viva equation: arrival speed at the low point minus orbit speed there, plus 30 (direct) or 50 (low-energy) for course corrections. Direct arrival uses 0.85 km/s excess speed; low-energy arrival is near escape speed.

### Ground stations
| | Rate with patch antenna | Max hours/day | Price per (hour/day) per turn | Outage chance per turn |
|---|---|---|---|---|
| Own university dish (about 4 m) | 2 kbps [D: 21 m rate scaled by dish area] | 6 | 0.01 | 10% |
| Partner 21 m dish | 64 kbps [S] | 2 | 0.03 | 6% |
| DSN 34 m dish | 128 kbps [S] | 1 [G; DSN is oversubscribed S] | 0.15 | 2% |

### Other constants
| Constant | Value | Tag |
|---|---|---|
| Design phase / integration phase | 1 turn each | G (CubeSat 101: delivery 4 weeks to 6 months before launch) |
| Build effort handled per turn | 10 points | G |
| Team cost per turn before launch / in flight | 0.5 / 0.3 | G |
| Cost per test turn | 0.4 | G |
| Ride fee | 1.5 | G |
| Extra navigation cost per turn of electric transfer | 0.1 | G |
| Failure-odds factor by test turns 0 / 1 / 2 / 3 | 2.0 / 1.4 / 1.0 / 0.7 | G |
| Usable battery share | 0.8 | G |
| Array power usable while thrusting | 0.75 | G (reproduces Lunar IceCube needing 120 W) |
| Thrusting share of a transfer turn | 0.6 | G (reproduces Lunar IceCube's 9-month plan) |
| Cruise before electric spiral / low-energy transfer | 4 turns | S (CAPSTONE: 12 to 20 weeks) |
| Long eclipse length | 3 h | G |
| Green margin | 15% | G (CubeSat 101: at least 10% budget reserve) |

## 5. Stage by stage

### Step 1: Mission planning
- **Choices:** test turns, reserve share.
- `build_turns = ceil(build_effort / 10)`
- `ready_turn = 1 + build_turns + test_turns + 1`
- `slack = ride_turn − ready_turn` (negative = you miss the ride)
- `reserve = budget × reserve_share` · `spendable = budget − reserve`
- `test_factor` from the table above
- **Out:** slack, reserve, spendable, test_factor.

### Step 2: Instrument selection
- **Choices:** 1 or 2 instruments.
- **Out:** sums of mass, volume, power, cost, effort (to step 3); data per turn (to step 6); footprint, altitude limit, sees-into-shadow (to coverage, with step 4).

### Step 3: Spacecraft configuration
- **Choices:** array, battery, propulsion, propellant mass, radio, antenna, computer, pointing.
- `dry_mass = 2.2 + engine dry mass + all part masses + instrument masses`
- `wet_mass = dry_mass + propellant`
- `volume = engine base volume + volume per kg × propellant + all part volumes + instrument volumes`
- `parts_cost`, `build_effort` = sums
- `bus_power = computer + pointing + radio listening + heater`
- `instrument_power` = sum of chosen instruments
- `delta_v_available = Isp × 9.81 × ln(wet_mass / dry_mass)`
- **Out:** everything above, plus storage and reset factor from the computer.

### Step 4: Orbit selection
- **Choice:** orbit.
- For each instrument: `quality = 1` if orbit altitude ≤ its maximum useful altitude, else `(max altitude / orbit altitude)²`; halved for the laser without precise pointing.
- `coverage_rate = 1 − exp(−passes × footprint × quality × science_duty)` = share of the still-unmapped area observed per turn.
- Science duty (power): `duty = min( (array − bus) / instrument_power , (array × sunlit − bus − transmit_extra × contact_hours/24) / (instrument_power × observing_share) )`, clamped 0 to 1.
- Battery: `battery_Wh × 0.8 ≥ (bus + instrument_power) × eclipse_hours`. Long-eclipse check: `battery_Wh × 0.8 ≥ bus × 3 h`.
- **Out:** coverage rates, science duty, battery flags, upkeep delta-v, visibility.

### Step 5: Ride and transfer
- **Choice:** direct or low-energy.
- `delta_v_insert` from the table (engine, transfer, orbit).
- Electric thrust level: `usable = array × 0.75 − bus`; no thrust below 56 W, else `min(1, usable / 65)`.
- Transfer turns: chemical direct 0, chemical low-energy 4; electric `4 + ceil( (delta_v_insert − 100) × average mass / (thrust × level × 0.6 × seconds per turn) )`.
- `delta_v_left = delta_v_available − delta_v_insert` · `upkeep_turns = floor(delta_v_left / upkeep per turn)`
- **Out:** transfer turns, delta-v margin, upkeep turns.

### Step 6: Comms plan
- **Choices:** ground station, contact hours per day.
- `link_kbps = station rate × antenna gain × (0.25 if dish without precise pointing)`; 0 with the UHF radio.
- `transmit_share = clamp( (array − bus) / (transmit − listening power) )`
- `downlink_per_turn (MB) = link_kbps × hours_per_day × 13.5 × earth_visible × transmit_share` (13.5 = 30 days × 3600 s ÷ 8 ÷ 1000)
- `data_per_turn = sum of instrument data × science_duty`
- `ground_cost_per_turn = hours_per_day × station price`
- **Out:** downlink per turn, data per turn, ground cost.

### Step 7: Resource check (Go / No-Go)
`total_cost = parts + 0.5 × 8 + 0.4 × test_turns + 1.5 + transfer_turns × (0.3 + ground_cost + 0.1 if electric) + 12 × (0.3 + ground_cost)`

| Bar | Red (No-Go) | Yellow | Green |
|---|---|---|---|
| Volume | over 6 U | under 15% spare | 15% spare or more |
| Mass | over 14 kg | under 15% spare | 15% spare or more |
| Time | slack below 0 | slack 0 | slack 1 or more |
| Propulsion | cannot thrust, or delta-v below insertion | under 15% above insertion + 12 turns of upkeep | 15% or more |
| Power | science duty 0, or battery cannot cover eclipse | duty below 1, or tight average, or fails long-eclipse check | otherwise |
| Comms | link rate 0 | transmit share below 1 | otherwise |
| Data | no link or no data | downlink below data per turn × 1.15 | otherwise |
| Budget | total cost over budget | total cost over spendable (eats reserve) | within spendable |
| Science | (never red) | projected coverage below 70% or data below 300 MB | both met |

Projected science = 12 clean turns of the step-8 science rule with no events. Any red blocks launch and names the step to fix. Yellow may fly.

### Step 8: Mission simulation (one turn = one month)
State: turn, phase, main budget, reserve, delta-v left, transfer turns left, coverage observed / waiting / mapped per instrument, data stored, data home, science turns, science-rate factor.

Each turn, in order:
1. **Pay.** Build phase: team 0.5. Transfer: 0.3 + ground (+0.1 electric). Science: 0.3 + ground. When the main budget is empty, costs come from the reserve; when the reserve is empty, the mission ends.
2. **Phase.**
   - *Build:* count down design, build, test, integration. On the ride turn: if ready, pay the ride fee and launch; if not, the next ride is 6 turns later.
   - *Transfer:* count down transfer turns. At arrival: if delta-v left ≥ insertion, capture and subtract it; else the craft flies past and the mission ends.
   - *Science:* observe and downlink (rules below), then subtract upkeep delta-v. If it goes below 0 the orbit is lost.
3. **Events** (table below).
4. **End test.** After 12 science turns: stop if coverage ≥ 70% and data ≥ 300 MB. Otherwise continue only while coverage or data is still growing, for at most 12 more turns.

Science rule for one turn:
- For each instrument: `new = (100 − observed) × coverage_rate`; add to *observed* and to *waiting*.
- `available = stored + data_per_turn` · `sent = min(available, downlink_per_turn)` · `kept = min(available − sent, storage)` · `lost = the rest`.
- *Mapped* coverage grows by `waiting × sent/available`. The lost share of *waiting* is removed from *observed* too, so that ground has to be observed again. **Coverage only counts once its data is on the ground.**

Events:
| Event | When | Chance | Effect | Player decision in the game |
|---|---|---|---|---|
| Build delay | each build turn | 8% × effort/35 | +1 turn; can cost the ride | cut a test turn or wait for the next ride |
| No signal after deployment (Lunar IceCube) | at launch | 8% × test factor × computer reset factor | mission lost unless recovered | spend 0.5 from reserve for a 60% recovery chance |
| Thruster underperforms (Lunar Flashlight) | each transfer turn, once | 3% × test factor | chemical: delta-v halved; electric: remaining transfer doubles | spend 1.0 from reserve for a 50% fix and +1 turn |
| Radiation reset | each science turn | 6% × computer reset factor | no science this turn | none |
| Ground station outage | each science turn | station's outage chance | half the downlink this turn | none |
| Long eclipse | each science turn | 5% | no science this turn if the battery fails the long-eclipse check | none |
| Instrument degrades | each science turn | 3% × test factor | science per turn −20% from now on | none |

All chances are [G]. In `logic_check.py` the decisions are automatic (spend the reserve when it is there).

### Step 9: Evaluation
- Ice coverage = best *mapped* value among instruments that see into shadow.
- Science data = data home from ice and context instruments. Camera data is reported separately as outreach (the hook for publicity in the campaign layer).
- Requirements: captured · ice coverage ≥ 70% · science data ≥ 300 MB · science turns ≥ 12 · reserve not overdrawn.
- **Full** = all five. **Partial** = captured and (coverage ≥ 35% or data ≥ 150 MB). **Fail** otherwise.
- `score = 40 × min(1, coverage/70) + 25 × min(1, data/300) + 15 × min(1, science_turns/12) + 10 × min(1, context_coverage/70) + 10 × money_left/budget`; 0 if never captured.
- Report: for each missed requirement, walk its chain backwards and name the weakest link. Coverage chain: instrument sees shadow → altitude quality → passes → science duty (power) → data home (link, storage) → science turns (transfer time, upkeep delta-v, money).

## 6. Where each of the six challenge resources lives
| Resource | Set by | Limits |
|---|---|---|
| Mass | steps 2, 3 | 14 kg cap; delta-v through the rocket equation |
| Power | step 3 array and battery; step 4 sunlight | electric thrust, science duty, transmit share, eclipse survival |
| Budget | all steps | parts, team, tests, ride, ground time; reserve for events |
| Data | step 2 instruments | must fit through the link or wait in storage; overflow is lost |
| Communications | steps 3, 6 | link rate, contact hours, visibility |
| Time | steps 1, 5 | build before the ride; transfer turns; 12 science turns; money per turn |

## 7. Proposed changes to the brief
1. **Budget 25 M** and **data target 300 MB** (was "X GB"). A lunar CubeSat link is 64 to 128 kbps; LRO's 572 gigabits per day is another league.
2. **Coverage counts only from instruments that can see into shadow** (laser, neutron), and **only once the data is home**.
3. **Missed ride:** wait 6 turns for the next one and keep paying the team.
4. **Extended mission:** up to 12 extra turns while still making progress.
5. **Test turns 0 to 3:** four never fits before the ride with any propulsion on board.

## 8. Data sources
| What | Used for | Source |
|---|---|---|
| Ion engine: 56 to 75 W, 1.1 mN, Isp 2150 s, 1.4 kg dry, 1.5 kg iodine, 2.39 km/s on a 14 kg CubeSat | electric propulsion | [Busek BIT-3 datasheet](https://www.busek.com/s/BIT3_v10.pdf) |
| Ion system 1.6 U, 2.9 kg wet | electric propulsion volume | [NASA SOMA industry day slides](https://soma.larc.nasa.gov/stp/tdmo/pdf_files/Plasma_and_Ion_Propulsion_and_Electrospray_RCS_BCI_0525p.pdf) |
| Lunar IceCube: 14 kg, 120 W array, IR spectrometer 1.5 U / 3.2 kg / 10 to 15 W, 6 months cruise + 3 months to orbit, over 2 MB science data per day | IR instrument, power, transfer time | [GSFC SmallSat symposium 2019](https://science.gsfc.nasa.gov/attic/cubesats.gsfc.nasa.gov/symposiums/2019/presentations/Day1/FOLTA.pdf) |
| 128 kbps with DSN 34 m, 64 kbps with Morehead 21 m; ion drive gives 1.2 km/s | link rates, delta-v | [eoPortal: Lunar IceCube](https://eoportal.org/satellite-missions/lunar-icecube) |
| Radio: 0.5 U, 1.1 kg, 35 W transmitting, 10 W listening | radio | [JPL Iris V2.2 brochure](https://scienceandtechnology.jpl.nasa.gov/sites/default/files/documents/Brochure_Iris_Transponder_V2.2_SEP_2022.pdf) |
| Deployable 0.5 m dish needs 1.5 U | antenna | [NASA S3VI webinar](https://www.nasa.gov/wp-content/uploads/2022/05/jbaker_s3vi_july_webinar.pdf) |
| Lunar Flashlight: halo orbit 15 km over the south pole, 4-month trip, laser into shadowed craters, thrusters underperformed | orbit, laser, event | [JPL news](https://www.jpl.nasa.gov/news/nasas-lunar-flashlight-team-assessing-spacecrafts-propulsion-system) |
| Chemical module: over 3000 N s, 2.5 U, under 6 kg wet; 2 kg propellant; instrument 2 U | chemical propulsion, laser volume | [Georgia Tech](https://space.gatech.edu/node/288), [Wikipedia: Lunar Flashlight](https://en.wikipedia.org/wiki/Lunar_Flashlight) |
| LunaH-Map: neutron detector under 2.5 U, low power and data; 5 to 25 km passes; 282 orbits in two lunar days; 15 × 3,150 km | neutron instrument, elliptical orbit | [LunaH-Map overview](https://core.ac.uk/download/77521856.pdf), [IAC 2018 abstract](https://iafastro.directory/iac/archive/browse/IAC-18/B4/8/44017/), [Scientia](https://scientia.global/?p=8068) |
| Low-energy transfer: 12 to 20 weeks, 50 to 71 m/s; direct needs hundreds of m/s | transfer table | [Advanced Space slides](https://2.advancedspace.com/wp-content/uploads/2025/08/blt-consider-pres.pdf), [The Space Review](https://thespacereview.com/article/4395/1) |
| LRO: 854 m/s insertion, 11.64 m/s upkeep per month at 50 km; Lunar Prospector 898.5 m/s to 100 km | delta-v check | [LRO delta-v budget](https://corpora.tika.apache.org/base/docs/govdocs1/459/459291.pdf) |
| LRO eclipses up to 48 minutes per orbit | eclipse length | [LRO mission design](https://ntrs.nasa.gov/api/citations/20070021535/downloads/20070021535.pdf) |
| 100 km polar orbit: 75 m/s upkeep per year | circular orbit upkeep | [KPLO stationkeeping paper](https://ntrs.nasa.gov/api/citations/20180006802/downloads/20180006802.pdf) |
| CubeSat phases, 10% reserve, development 9 to 24 months | schedule, reserve | [NASA CubeSat 101](https://www.nasa.gov/wp-content/uploads/2017/03/nasa_csli_cubesat_101_508.pdf) |
| Lunar IceCube: 7-year, 24 million dollar mission | budget anchor | [WMKY](https://www.wmky.org/post/cubesat-built-morehead-state-passes-testing-mission-moon) |

Costs, event chances, data volumes, footprints and the battery sizes are game values. I did not find public prices for the parts.

## 9. Check: does the logic work end to end?
Ran `logic_check.py` (same formulas as above).

**Formulas reproduce real missions**
| Check | Model | Real |
|---|---|---|
| Ion engine delta-v, 14 kg craft, 1.5 kg iodine | 2389 m/s | up to 2390 |
| Chemical module total impulse, 2 kg propellant | 2942 N s | over 3000 |
| Insertion into 100 km circular orbit, direct | 858 m/s | LRO 854, Lunar Prospector 898 |
| Electric transfer to the elliptical orbit | 10 months | Lunar IceCube plan 9, LunaH-Map plan about 15 |
| IceCube-like build | 12.8 kg, cost 24.9 | 14 kg, about 24 million dollars |
| Flashlight-like build | 14.0 kg | about 14 kg |

**Every parameter is connected.** All 197 numbers in the model were nudged one at a time; each one changed at least one result. All 15 player choices change the outcome.

**The design space has several answers and no free lunch.** 456,192 designs checked (2 test turns, 10% reserve): 1.8% pass Go/No-Go, 0.12% are projected to meet every requirement. Those fall into seven families:

| Propulsion | Orbit | Instruments | Cheapest total cost |
|---|---|---|---|
| Chemical | Halo loop | Laser | 20.7 |
| Chemical | Halo loop | Laser + camera | 21.6 |
| Electric | Halo loop | Laser | 22.4 |
| Electric | Halo loop | Laser + camera | 23.4 |
| Electric | Elliptical | Neutron | 23.5 |
| Electric | Elliptical | Laser | 24.0 |
| Electric | Elliptical | Laser + camera | 24.5 |

**Simulated missions (3,000 runs each, with events)**
| Design | Full | Partial | Fail | Why |
|---|---|---|---|---|
| Flashlight-like: chemical, halo loop, laser, 2 test turns, 10% reserve | 84% | 13% | 2% | |
| Same with no testing and no reserve | 74% | 8% | 16% | failures hit harder, nothing to pay for fixes |
| LunaH-Map-like: electric, elliptical, neutron | 37% | 53% | 9% | 10-month transfer, budget almost used up |
| IceCube-like: electric, elliptical, IR only | 0% | 84% | 15% | flies well, but IR cannot see into shadow |
| Neutron on the halo loop | 0% | 94% | 5% | too few passes: 37% coverage in 12 turns |
| Laser + camera on a tight link | 1% | 94% | 3% | camera data crowds out the ice data |

**What the model teaches without being told to**
- A chemical 6U can only reach the halo loop (about 230 m/s on board; the elliptical orbit needs 386). This is why Lunar Flashlight chose that orbit.
- Electric propulsion only works with the 120 W array, as on Lunar IceCube.
- The low circular orbit is out of reach: 16 turns of transfer break the budget.
- The UHF radio from CubeSat 101 is a No-Go: it does not reach from the Moon.
- Taking everything (laser, IR, camera and a dish on a chemical craft) needs 9.2 U and 18.6 kg, in a 6 U, 14 kg box.

## 10. Open questions for the team
1. The low circular orbit never wins with these numbers. Keep it as a lesson ("LRO's orbit is out of reach for a CubeSat") or make it affordable?
2. The LunaH-Map-like design fully succeeds 37% of the time. Realistic (of the two real ion-engine lunar CubeSats, Lunar IceCube lost contact and LunaH-Map had propulsion problems), but is it too harsh for a game?
3. The IR spectrometer can never meet the brief alone. Intended lesson, or should the brief also accept water mapped on sunlit ground?
4. Step 8 pacing: does it play itself and pause on event cards (my pick), or does the player act every turn?
5. Do the turn phases follow the four segments (ground, science, space, launch)?
