"""A4: the budget calculator. One set of functions for every screen.

The live meters, the Go / No-Go bars and the flight simulation all call
evaluate() and science_turn(), so they can never disagree.

Formulas follow reference/core-loop-logic-map.md, section 5, and are checked
against reference/logic_check.py by tests/test_parity.py.
"""
from __future__ import annotations

import math
from typing import Optional, Tuple

from . import gonogo
from .catalogue import BRIEF, CATALOGUE
from .state import Derived, Design, Science


def _clamp(x: float) -> float:
    return max(0.0, min(1.0, x))


def insertion_delta_v(engine_id: str, transfer: str, orbit_id: str, cat: dict = CATALOGUE) -> Optional[float]:
    """Delta-v (m/s) from the ride's drop-off into the science orbit. None = not possible."""
    if engine_id == "none":
        return None
    engine, orbit, c = cat["propulsion"][engine_id], cat["orbits"][orbit_id], cat["constants"]
    listed = orbit["insertion_dv"].get(f"{engine_id}_{transfer}")
    if listed is not None:
        return listed
    if not engine["impulsive"]:
        return None     # low thrust cannot brake on a fast fly-by
    # Vis-viva: arrival speed at the low point minus orbit speed there, plus course corrections.
    mu, radius = c["moon_mu_km3_s2"], c["moon_radius_km"]
    r = radius + orbit["altitude_km"]
    a = r if orbit["far_point_km"] == orbit["altitude_km"] else (2 * radius + orbit["altitude_km"] + orbit["far_point_km"]) / 2
    v_orbit = math.sqrt(mu * (2 / r - 1 / a))
    v_escape = math.sqrt(2 * mu / r)
    if transfer == "direct":
        v_arrival = math.sqrt(c["arrival_excess_speed_kms"] ** 2 + v_escape ** 2)
        return round((v_arrival - v_orbit) * 1000 + c["course_correction_direct"])
    return round((v_escape - v_orbit) * 1000 + c["course_correction_low_energy"])


def evaluate(design: Design, brief: dict = BRIEF, cat: dict = CATALOGUE) -> Derived:
    """Steps 1 to 7 in one pass: everything that follows from a design, before any dice."""
    c = cat["constants"]
    instruments = [cat["instruments"][name] for name in design.instruments]
    array = cat["solar_arrays"][design.solar_array]
    battery = cat["batteries"][design.battery]
    engine = cat["propulsion"][design.propulsion]
    radio = cat["radios"][design.radio]
    antenna = cat["antennas"][design.antenna]
    computer = cat["computers"][design.computer]
    pointing = cat["pointing"][design.pointing]
    orbit = cat["orbits"][design.orbit]
    station = cat["ground_stations"][design.ground_station]
    propellant = min(design.propellant_kg, engine["max_propellant"])

    # --- step 3: mass, volume, power, cost and effort roll-ups
    parts = [array, battery, radio, antenna, computer, pointing] + instruments
    dry_mass = c["structure_mass"] + engine["dry_mass"] + sum(p["mass"] for p in parts)
    wet_mass = dry_mass + propellant
    volume = engine["base_volume"] + engine["volume_per_kg"] * propellant + sum(p["volume"] for p in parts)
    parts_cost = c["structure_cost"] + engine["cost"] + sum(p["cost"] for p in parts)
    build_effort = c["structure_effort"] + engine["effort"] + sum(p["effort"] for p in parts)
    array_power = array["power_generated"]
    bus_power = computer["power"] + pointing["power"] + radio["listen_power"] + c["heater_power"]
    instrument_power = sum(i["power"] for i in instruments)
    transmit_extra = radio["transmit_power"] - radio["listen_power"]

    # --- step 1: schedule and money pots
    build_turns = math.ceil(build_effort / c["effort_per_turn"])
    ready_turn = c["design_turns"] + build_turns + design.test_turns + c["integration_turns"]
    slack = brief["ride_turn"] - ready_turn
    reserve = brief["budget"] * design.reserve_share
    spendable = brief["budget"] - reserve

    # --- step 5: delta-v and transfer
    dv_available = engine["isp"] * c["g0"] * math.log(wet_mass / dry_mass) if propellant > 0 else 0.0
    dv_insert = insertion_delta_v(design.propulsion, design.transfer, design.orbit, cat)
    thrust_power = array_power * c["thrust_power_share"] - bus_power
    if engine["impulsive"]:
        thrust_level = 1.0
    elif design.propulsion == "none" or thrust_power < engine["min_power"]:
        thrust_level = 0.0
    else:
        thrust_level = min(1.0, thrust_power / engine["nominal_power"])
    if dv_insert is None or thrust_level == 0:
        transfer_turns = None
    elif engine["impulsive"]:
        transfer_turns = 0 if design.transfer == "direct" else c["cruise_turns"]
    else:
        average_mass = wet_mass - propellant / 2
        spiral = (max(0, dv_insert - c["spiral_free_dv"]) * average_mass
                  / (engine["thrust_n"] * thrust_level * c["thrust_duty"] * c["turn_seconds"]))
        transfer_turns = c["cruise_turns"] + math.ceil(spiral)
    dv_after_insert = dv_available - (dv_insert or 0)
    upkeep_turns = math.floor(dv_after_insert / orbit["upkeep_dv"]) if dv_after_insert >= 0 else 0

    # --- step 6: link
    pointing_ok = pointing["precise"] or not antenna["needs_precise_pointing"]
    gain_factor = 1.0 if pointing_ok else antenna["gain_factor_without_precise"]
    link_kbps = station["rate_kbps"] * antenna["gain"] * gain_factor if radio["reaches_moon"] else 0.0
    contact_hours = min(design.contact_hours, station["max_hours"])
    ground_cost = contact_hours * station["price"]
    transmit_share = _clamp((array_power - bus_power) / transmit_extra) if transmit_extra > 0 else 1.0
    downlink = link_kbps * contact_hours * 30 * 3600 / 8 / 1000 * orbit["earth_visible"] * transmit_share   # MB per turn

    # --- steps 2 + 4: science rates
    duty_instant = _clamp((array_power - bus_power) / instrument_power) if instrument_power > 0 else 0.0
    average_left = array_power * orbit["sunlit_share"] - bus_power - transmit_extra * (contact_hours / 24) * transmit_share
    duty_average = _clamp(average_left / (instrument_power * orbit["observing_share"])) if instrument_power > 0 else 0.0
    science_duty = min(duty_instant, duty_average)
    power_margin = array_power * orbit["sunlit_share"] - (
        bus_power + instrument_power * orbit["observing_share"] + transmit_extra * contact_hours / 24)
    battery_usable = battery["capacity_wh"] * c["usable_battery_share"]
    battery_need = (bus_power + instrument_power) * orbit["eclipse_hours"]
    quality, coverage_rate, data_per_turn = {}, {}, 0.0
    for name in design.instruments:
        i = cat["instruments"][name]
        limit = i["max_altitude_km"]
        q = 1.0 if (limit is None or orbit["altitude_km"] <= limit) else (limit / orbit["altitude_km"]) ** 2
        if not pointing["precise"]:
            q *= i["quality_without_precise_pointing"]
        quality[name] = q
        # Share of the still-unmapped area observed per turn.
        coverage_rate[name] = 1 - math.exp(-orbit["passes_per_turn"] * i["footprint"] * q * science_duty)
        data_per_turn += i["data_per_turn"] * science_duty

    # --- step 7: total cost
    ops_cost = c["team_cost_flight"] + ground_cost
    cost_prelaunch = (parts_cost + c["team_cost_prelaunch"] * brief["ride_turn"]
                      + c["test_cost"] * design.test_turns + c["ride_fee"])
    transfer_cost = ops_cost + (0 if engine["impulsive"] else c["electric_nav_cost"])
    total_cost = cost_prelaunch + transfer_cost * (transfer_turns or 0) + ops_cost * brief["science_turns_required"]

    derived = Derived(
        propellant_kg=propellant, dry_mass=dry_mass, wet_mass=wet_mass, volume=volume, parts_cost=parts_cost,
        build_effort=build_effort, array_power=array_power, bus_power=bus_power, instrument_power=instrument_power,
        transmit_extra_power=transmit_extra, storage_mb=computer["storage_mb"],
        build_turns=build_turns, ready_turn=ready_turn, slack=slack,
        test_factor=cat["test_factor"][str(design.test_turns)], reserve=reserve, spendable=spendable,
        dv_available=dv_available, dv_insert=dv_insert, thrust_power=thrust_power, thrust_level=thrust_level,
        transfer_turns=transfer_turns, upkeep_dv_per_turn=orbit["upkeep_dv"], dv_after_insert=dv_after_insert,
        upkeep_turns=upkeep_turns,
        link_kbps=link_kbps, contact_hours=contact_hours, ground_cost_per_turn=ground_cost,
        transmit_share=transmit_share, downlink_per_turn=downlink,
        science_duty=science_duty, power_margin=power_margin, battery_usable_wh=battery_usable,
        battery_need_wh=battery_need, battery_ok=battery_usable >= battery_need,
        battery_long_ok=battery_usable >= bus_power * c["long_eclipse_hours"],
        quality=quality, coverage_rate=coverage_rate, data_per_turn=data_per_turn,
        launch_turn=brief["ride_turn"] if slack >= 0 else None,
        ops_cost_per_turn=ops_cost, transfer_cost_per_turn=transfer_cost,
        cost_prelaunch=cost_prelaunch, total_cost=total_cost,
    )

    # --- step 7: projection of a clean science phase, then the bars
    science = Science.new(design.instruments)
    clean_turns = min(brief["science_turns_required"], upkeep_turns) if dv_insert is not None else 0
    for _ in range(clean_turns):
        science_turn(design, derived, science, cat)
    (derived.projected_coverage, derived.projected_data,
     derived.projected_context, derived.projected_outreach) = science_totals(design, science, cat)
    derived.projected_lost = science.lost
    derived.bars = gonogo.bars(design, derived, brief, cat)
    return derived


def science_turn(design: Design, derived: Derived, science: Science, cat: dict = CATALOGUE,
                 duty_factor: float = 1.0, link_factor: float = 1.0, science_factor: float = 1.0) -> Science:
    """One turn of observing and downlink. Coverage only counts once its data is on the ground.

    duty_factor     0 in a safe-mode turn
    link_factor     0.5 in a ground station outage
    science_factor  drops by 20% each time an instrument degrades
    """
    available_by = {}
    for name in design.instruments:
        rate = derived.coverage_rate[name]
        if duty_factor != 1.0:
            rate = 1 - (1 - rate) ** duty_factor
        rate *= science_factor
        new = (100 - science.observed[name]) * rate
        science.observed[name] += new
        science.waiting[name] += new
        made = cat["instruments"][name]["data_per_turn"] * derived.science_duty * duty_factor * science_factor
        available_by[name] = science.stored_by[name] + made
    available = sum(available_by.values())
    sent = min(available, derived.downlink_per_turn * link_factor)
    kept = min(available - sent, derived.storage_mb)
    lost = available - sent - kept
    sent_share, kept_share = (sent / available, kept / available) if available > 0 else (0.0, 0.0)
    for name in design.instruments:
        science.returned[name] += available_by[name] * sent_share
        science.stored_by[name] = available_by[name] * kept_share
        credited = science.waiting[name] * sent_share
        dropped = science.waiting[name] * (1 - sent_share - kept_share)
        science.mapped[name] += credited
        science.waiting[name] -= credited + dropped
        science.observed[name] -= dropped       # lost data means that ground must be observed again
    science.stored = kept
    science.lost += lost
    return science


def science_totals(design: Design, science: Science, cat: dict = CATALOGUE) -> Tuple[float, float, float, float]:
    """(ice coverage %, science data MB, context coverage %, outreach data MB)."""
    kinds = {name: cat["instruments"][name] for name in design.instruments}
    ice = max((science.mapped[n] for n, i in kinds.items() if i["sees_shadow"]), default=0.0)
    data = sum(science.returned[n] for n, i in kinds.items() if i["kind"] != "outreach")
    context = max((science.mapped[n] for n, i in kinds.items() if i["kind"] == "context"), default=0.0)
    outreach = sum(science.returned[n] for n, i in kinds.items() if i["kind"] == "outreach")
    return ice, data, context, outreach
