# Lunar Ice Mapper: core logic as a terminal game

The whole single-mission loop (steps 1 to 9 of the board) as a Python program you can play in a terminal. It has no graphics. Its job is to prove the game logic works end to end, and to be the reference when the same logic is written in TypeScript for `src/sim`.

Needs Python 3.9 or newer. Nothing to install.

## Play

From the repository root:

```bash
python3 prototype/play.py
```

You start with a design that a team used to low Earth orbit would build. It fails the Go / No-Go check. Fix it step by step, launch, and read the report. Type `q` at any prompt to quit.

| Command | What it does |
|---|---|
| `python3 prototype/play.py` | Play the game |
| `python3 prototype/play.py --preset flashlight` | Start from a ready-made design |
| `python3 prototype/play.py --preset lunah-map --auto --seed 11` | No questions: check, fly and report one design |
| `python3 prototype/play.py presets` | List the 22 ready-made designs |
| `python3 prototype/play.py check --sweep` | Re-run the model checks (about 15 seconds) |
| `python3 prototype/play.py --help` | All options |

`--seed N` flies the same luck again. `--no-events` flies with no random events. `--no-color` prints plain text.

## Tests

```bash
cd prototype
python3 -m unittest
```

43 tests, about 5 seconds. `tests/test_parity.py` runs this package and `reference/logic_check.py` on the same designs and the same dice and compares every number: 4,000 random designs and about 17,000 flights.

## Where things are

Letters refer to the component map (A shared core, B design screens, C flight, D evaluation, E numbers).

| File | Component | What is in it |
|---|---|---|
| `lunar_ice_mapper/data/brief_lunar_ice_mapper.json` | A2, E1, E9 | The brief: requirements, limits, ride turn, score weights |
| `lunar_ice_mapper/data/catalogue.json` | A3, E2 to E7 | Every part, instrument, orbit, ground station, event and constant |
| `lunar_ice_mapper/state.py` | A1 | `Design` (the 15 choices), `Derived` (every value worked out from them), `Science` |
| `lunar_ice_mapper/calculator.py` | A4 | `evaluate(design)`: steps 1 to 7 in one pass. `science_turn()`: one turn of observing and downlink |
| `lunar_ice_mapper/gonogo.py` | B7, E8 | The nine bars, each with its reason and the step that fixes it |
| `lunar_ice_mapper/simulation.py` | C1 to C4, C6 | `Flight`: the turn engine, events, decisions on event cards, outcome rules |
| `lunar_ice_mapper/evaluation.py` | D1 to D4 | `assess(flight)`: requirements, causes, score, comparison with real missions |
| `lunar_ice_mapper/game.py` | A5, A6, B1 to B6, C5, D5 | The screens and the step flow. No game logic |
| `lunar_ice_mapper/terminal.py` | | Colours, tables, prompts |
| `lunar_ice_mapper/presets.py` | | The starting design and the archetypes of the logic map |
| `lunar_ice_mapper/verify.py` | | The `check` command |
| `reference/` | | The logic map and `logic_check.py`, the model this was built from |

The logic can be used without the terminal:

```python
from lunar_ice_mapper import Design, evaluate, Flight, assess

design = Design(instruments=("laser",), orbit="halo")
derived = evaluate(design)          # meters and Go / No-Go bars
flight = Flight(design).run()       # or flight.step() to advance one turn
report = assess(flight)             # level, score, requirements with causes
```

## Tuning the numbers

No number of the model is in the code. Change a value in `data/catalogue.json` or `data/brief_lunar_ice_mapper.json`, then run `python3 prototype/play.py check --sweep` to see what it does to the ready-made designs and to the design space. The parity tests fail after any change to a number, because they compare against the reference model with the old numbers. That is expected.

Where each number comes from (sourced, derived or game value) is in `reference/core-loop-logic-map.md`, section 4.

## Decisions taken where the board was open

These follow the picks in the logic map. Each is easy to change.

| Question | In this program |
|---|---|
| Step 8 pacing | The mission flies itself, one line per turn, and stops on an event card when it needs a decision |
| Missed ride | Wait 6 turns for the next one; the team keeps costing money |
| Propulsion chosen twice | The engine is chosen in step 3. Step 5 chooses only the transfer and shows what the engine makes of it |
| Fuel in the Go / No-Go | There is a Propulsion bar, so nine bars instead of six |
| Low circular orbit | Kept as a lesson: no design reaches it within budget |

## Differences from `reference/logic_check.py`

1. **Decisions.** The reference always tries a fix when the reserve can pay. Here the player decides on the event card. In `--auto` mode and in tests, standing orders make the reference's choice, so results are identical.
2. **Cutting a test turn.** The logic map lists "cut a test turn or wait for the next ride" as the player's answer to a build delay; the reference only waits. Here the player is asked when a delay would cost the ride and testing is still ahead. Cutting returns the test cost and raises the failure odds.
3. **Contact lost on a direct transfer.** The reference counts the craft as captured. Here it is not.

One point where the reference and the text of the logic map disagree: the map says the Propulsion bar is red only when delta-v is below the insertion burn. The reference also makes it red when delta-v covers insertion but not 12 turns of holding the orbit. This program follows the reference.

## Porting to TypeScript

`catalogue.json` and the brief can be imported as they are. `calculator.py`, `gonogo.py`, `simulation.py` and `evaluation.py` use only arithmetic, dictionaries and one random number source, so they translate function by function. To check a port, run a preset with a fixed seed here and compare. Python's random numbers will not match JavaScript's, so compare flights with `--no-events`, or feed both sides the same list of rolls.
