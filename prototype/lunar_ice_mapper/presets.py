"""Ready-made designs: the starting point of a new game, and the archetypes of
reference/logic_check.py, used for demos, tests and the `check` command.
"""
from __future__ import annotations

from typing import Dict, NamedTuple

from .state import Design


class Preset(NamedTuple):
    label: str
    design: Design
    featured: bool = False      # offered in the game's preset menu


BASE = Design()     # Flashlight-like: chemical, halo loop, laser


def _mk(**changes) -> Design:
    return BASE.with_(**changes)


# What a team used to low Earth orbit would build first. It fails the Go / No-Go
# check in several ways; fixing it is the first lesson of the game.
STARTER = Design(
    test_turns=2, reserve_share=0.10, instruments=("camera",), solar_array="small", battery="small",
    propulsion="none", propellant_kg=0.0, radio="uhf", antenna="patch", computer="basic", pointing="basic",
    orbit="circular", transfer="direct", ground_station="own", contact_hours=6.0)

PRESETS: Dict[str, Preset] = {
    "starter": Preset("Low-Earth-orbit habits (the starting design)", STARTER, True),
    "flashlight": Preset("Flashlight-like: chemical, halo loop, laser", _mk(), True),
    "lunah-map": Preset("LunaH-Map-like: electric, elliptical, neutron", _mk(
        instruments=("neutron",), solar_array="large", propulsion="electric", propellant_kg=1.5,
        orbit="elliptical", pointing="basic"), True),
    "icecube": Preset("IceCube-like: electric, elliptical, IR only", _mk(
        instruments=("ir",), solar_array="large", propulsion="electric", propellant_kg=1.5,
        orbit="elliptical", pointing="basic", test_turns=1), True),
    "greedy": Preset("Greedy: laser + IR + camera + dish", _mk(
        instruments=("laser", "ir", "camera"), antenna="dish")),
    "leo-habits": Preset("LEO habits: UHF radio, own dish", _mk(
        radio="uhf", ground_station="own", contact_hours=6)),
    "impatient": Preset("Impatient: chemical, direct, low circular", _mk(
        orbit="circular", transfer="direct", propellant_kg=3.0)),
    "electric-circular": Preset("Electric to low circular, neutron + camera", _mk(
        instruments=("neutron", "camera"), solar_array="large", propulsion="electric", propellant_kg=1.5,
        orbit="circular", computer="radhard", test_turns=1)),
    "electric-medium-array": Preset("Electric but medium panels", _mk(
        instruments=("neutron",), solar_array="medium", propulsion="electric", propellant_kg=1.5, orbit="elliptical")),
    "small-battery": Preset("Laser + small battery on the elliptical orbit", _mk(
        battery="small", orbit="elliptical", propulsion="electric", solar_array="large", propellant_kg=1.5,
        test_turns=1)),
    "light-chemical": Preset("Light chemical to elliptical: neutron, 3 kg tank", _mk(
        instruments=("neutron",), propellant_kg=3.0, orbit="elliptical", solar_array="small", battery="small",
        computer="basic", pointing="basic")),
    "no-safety-net": Preset("Flashlight-like with no testing and no reserve", _mk(
        test_turns=0, reserve_share=0.0), True),
    "camera-tourist": Preset("Camera tourist", _mk(
        instruments=("camera",), ground_station="own", contact_hours=6)),
    "no-propulsion": Preset("No propulsion, DSN", _mk(
        propulsion="none", propellant_kg=0.5, ground_station="dsn34", contact_hours=1)),
    "own-dish": Preset("Laser on the team's own dish (tight link)", _mk(
        ground_station="own", contact_hours=6, computer="basic")),
    "three-tests": Preset("Three test turns, camera only", _mk(
        instruments=("camera",), test_turns=3, battery="small", pointing="basic")),
    "dish-basic-pointing": Preset("Dish with basic pointing", _mk(
        instruments=("camera",), antenna="dish", pointing="basic", battery="small")),
    "radhard": Preset("Radiation-hard computer", _mk(computer="radhard", battery="small")),
    "neutron-halo": Preset("Neutron on the halo loop (too few passes)", _mk(
        instruments=("neutron",), propulsion="electric", solar_array="large", propellant_kg=1.0, pointing="basic",
        test_turns=0, ground_station="own", contact_hours=1), True),
    "tight-link": Preset("Laser + camera on the partner dish (tight link)", _mk(
        instruments=("laser", "camera"), battery="small", pointing="basic", contact_hours=6), True),
    "dsn-half-hour": Preset("Laser + camera, DSN half an hour a day", _mk(
        instruments=("laser", "camera"), battery="small", pointing="basic", ground_station="dsn34",
        contact_hours=0.5)),
    "electric-halo": Preset("Electric to the halo loop, laser + camera, DSN", _mk(
        instruments=("laser", "camera"), solar_array="large", propulsion="electric", propellant_kg=1.0,
        ground_station="dsn34", contact_hours=1)),
}
