"""A2 + A3: the brief and the catalogue, loaded from the JSON files in data/.

No number of the model lives in code. To tune the game, or to add another
brief, edit or add a JSON file.
"""
from __future__ import annotations

import json
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent / "data"


def load(name: str) -> dict:
    with open(DATA_DIR / name, encoding="utf-8") as f:
        return json.load(f)


BRIEF = load("brief_lunar_ice_mapper.json")
CATALOGUE = load("catalogue.json")

# Design field -> catalogue table that lists its options.
OPTION_TABLES = {
    "solar_array": "solar_arrays",
    "battery": "batteries",
    "propulsion": "propulsion",
    "radio": "radios",
    "antenna": "antennas",
    "computer": "computers",
    "pointing": "pointing",
    "orbit": "orbits",
    "transfer": "transfers",
    "ground_station": "ground_stations",
}

TEST_TURN_OPTIONS = (0, 1, 2, 3)
RESERVE_OPTIONS = (0.0, 0.05, 0.10, 0.15, 0.20)
MAX_INSTRUMENTS = 2
PROPELLANT_STEP = 0.5


def propellant_options(engine_id: str, cat: dict = CATALOGUE) -> list:
    """Tank sizes on offer for an engine: 0.5 kg steps up to its maximum."""
    top = cat["propulsion"][engine_id]["max_propellant"]
    steps = int(round(top / PROPELLANT_STEP))
    return [PROPELLANT_STEP * i for i in range(1, steps + 1)]
