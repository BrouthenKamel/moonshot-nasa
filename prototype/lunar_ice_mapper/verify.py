"""The `check` command: does the model still behave after the numbers were tuned?

Repeats section 9 of reference/core-loop-logic-map.md on the package: the
real-mission anchors, every ready-made design flown many times, and
(with --sweep) the whole design space.
"""
from __future__ import annotations

import itertools
import math
import random
from typing import Callable

from .calculator import evaluate, insertion_delta_v
from .catalogue import BRIEF, CATALOGUE, RESERVE_OPTIONS, TEST_TURN_OPTIONS
from .evaluation import assess
from .presets import PRESETS
from .simulation import Flight
from .state import Design


def anchors(say: Callable[[str], None]) -> None:
    cat, c = CATALOGUE, CATALOGUE["constants"]
    electric, chemical = cat["propulsion"]["electric"], cat["propulsion"]["chemical"]
    say("== Real-mission anchors reproduced by the formulas ==")
    say(f"  Ion engine, 14 kg craft, 1.5 kg iodine: {electric['isp'] * c['g0'] * math.log(14 / 12.5):.0f} m/s "
        "(maker: up to 2390)")
    say(f"  Chemical module, 2 kg propellant: {chemical['isp'] * c['g0'] * 2:.0f} N s total impulse "
        "(Lunar Flashlight: over 3000)")
    say(f"  Direct insertion into a 100 km circular orbit: {insertion_delta_v('chemical', 'direct', 'circular'):.0f} m/s "
        "(LRO 854, Lunar Prospector 898)")
    lunah, icecube, flashlight = (evaluate(PRESETS[k].design) for k in ("lunah-map", "icecube", "flashlight"))
    say(f"  Electric transfer to the elliptical orbit: {lunah.transfer_turns} months "
        "(Lunar IceCube plan about 9, LunaH-Map plan about 15)")
    say(f"  IceCube-like build: {icecube.wet_mass:.1f} kg, total cost {icecube.total_cost:.1f} "
        "(real: 14 kg, about 24 million dollars)")
    say(f"  Flashlight-like build: {flashlight.wet_mass:.1f} kg (real: about 14)")
    say("")
    say("== Delta-v into the science orbit (m/s) ==")
    for engine, transfer in itertools.product(("chemical", "electric"), ("direct", "low_energy")):
        row = {orbit: insertion_delta_v(engine, transfer, orbit) for orbit in cat["orbits"]}
        say(f"  {engine:9s} {transfer:11s} " + "  ".join(f"{o}: {'not possible' if v is None else v}" for o, v in row.items()))


def archetypes(say: Callable[[str], None], runs: int) -> None:
    say("")
    say(f"== Ready-made designs: the check, then {runs} simulated missions each ==")
    for key, preset in PRESETS.items():
        d = evaluate(preset.design)
        yellow = [b.key for b in d.bars if b.colour == "yellow"]
        say("")
        say(f"{key}: {preset.label}")
        say(f"  {d.wet_mass:.1f} kg, {d.volume:.2f} U, ready turn {d.ready_turn}, delta-v {d.dv_available:.0f} vs "
            f"{d.dv_insert}, transfer {d.transfer_turns}, cost {d.total_cost:.1f} of {d.spendable:.1f}")
        say(f"  projection: {d.projected_coverage:.0f}% coverage, {d.projected_data:.0f} MB | "
            f"{'GO' if d.go else 'NO-GO'}  red={d.red}  yellow={yellow}")
        if not d.go:
            continue
        rng = random.Random(7)
        reports = [assess(Flight(preset.design, rng, derived=d).run()) for _ in range(runs)]
        share = {level: sum(r.level == level for r in reports) * 100 // runs for level in ("full", "partial", "fail")}
        clean = assess(Flight(preset.design, random.Random(1), events=False, derived=d).run())
        say(f"  with no events: {clean.level}, score {clean.score}, {clean.turns} turns, {clean.end}")
        say(f"  with events:    {share}  mean score {sum(r.score for r in reports) / runs:.0f}")


def sweep(say: Callable[[str], None]) -> None:
    """Every combination of the choices of steps 2 to 6, at 2 test turns and 10% reserve."""
    cat = CATALOGUE
    say("")
    say("== Whole design space (2 test turns, 10% reserve). This takes about ten seconds. ==")
    instruments = [("laser",), ("neutron",), ("ir",), ("camera",), ("laser", "camera"), ("neutron", "ir")]
    choices = dict(
        instruments=instruments, solar_array=list(cat["solar_arrays"]), battery=list(cat["batteries"]),
        propulsion=list(cat["propulsion"]), propellant_kg=[0.5, 1.0, 1.5, 2.0, 3.0], radio=list(cat["radios"]),
        antenna=list(cat["antennas"]), computer=list(cat["computers"]), pointing=list(cat["pointing"]),
        orbit=list(cat["orbits"]), transfer=list(cat["transfers"]), ground_station=list(cat["ground_stations"]),
        contact_hours=[0.5, 1, 2, 6])
    total = go = full = 0
    families = {}
    for combo in itertools.product(*choices.values()):
        design = Design(test_turns=2, reserve_share=0.10, **dict(zip(choices, combo)))
        if design.propulsion == "none" and design.propellant_kg != 0.5:
            continue
        d = evaluate(design)
        total += 1
        if not d.go:
            continue
        go += 1
        family = families.setdefault((design.propulsion, design.orbit, " + ".join(design.instruments)), [0, 1e9])
        if (d.projected_coverage >= BRIEF["coverage_required"] and d.projected_data >= BRIEF["data_required"]
                and d.upkeep_turns >= BRIEF["science_turns_required"]):
            full += 1
            family[0] += 1
            family[1] = min(family[1], d.total_cost)
    say(f"  designs checked: {total}; pass Go / No-Go: {go} ({go * 100 / total:.1f}%); "
        f"projected to meet every requirement: {full} ({full * 100 / total:.2f}%)")
    say("  Families that can meet every requirement (winning designs, cheapest total cost):")
    for (engine, orbit, payload), (count, cost) in sorted(families.items(), key=lambda kv: kv[1][1]):
        if count:
            say(f"    {engine:9s} {orbit:10s} {payload:16s} {count:5d}  from {cost:.1f}")


def choices_matter(say: Callable[[str], None]) -> bool:
    """Every one of the 15 choices must change at least one result."""
    say("")
    say("== Every player choice changes at least one result ==")
    cat = CATALOGUE
    options = dict(
        test_turns=TEST_TURN_OPTIONS, reserve_share=RESERVE_OPTIONS,
        instruments=[("laser",), ("neutron",), ("ir",), ("camera",), ("laser", "camera")],
        solar_array=cat["solar_arrays"], battery=cat["batteries"], propulsion=cat["propulsion"],
        propellant_kg=[0.5, 1.0, 1.5], radio=cat["radios"], antenna=cat["antennas"], computer=cat["computers"],
        pointing=cat["pointing"], orbit=cat["orbits"], transfer=cat["transfers"],
        ground_station=cat["ground_stations"], contact_hours=[0.5, 1, 2])
    bases = [PRESETS[k].design for k in ("flashlight", "lunah-map", "electric-circular")]
    ok = True
    for name, values in options.items():
        seen = set()
        for base in bases:
            for value in values:
                d = evaluate(base.with_(**{name: value}))
                seen.add((tuple(d.checks.values()), round(d.projected_coverage, 6), round(d.projected_data, 6),
                          round(d.total_cost, 6), d.transfer_turns, d.slack, d.reserve, d.test_factor,
                          round(d.projected_outreach, 6), round(d.projected_lost, 6)))
        ok &= len(seen) > 1
        say(f"  {name:15s} {len(list(values))} options -> {len(seen)} distinct outcomes  {'OK' if len(seen) > 1 else 'NO EFFECT'}")
    return ok


def run(say: Callable[[str], None] = print, runs: int = 1000, with_sweep: bool = False) -> bool:
    anchors(say)
    archetypes(say, runs)
    ok = choices_matter(say)
    if with_sweep:
        sweep(say)
    return ok
