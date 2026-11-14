"""D1 to D4: evaluation (step 9).

D1  check each requirement of the brief and set the success level
D2  for each miss, walk its chain backwards and name the weak links
D3  score
D4  the player's CubeSat next to the real missions
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Dict, List

from .simulation import Flight


@dataclass
class Requirement:
    key: str
    label: str
    met: bool
    actual: str
    target: str
    causes: List[str] = field(default_factory=list)     # filled when missed


@dataclass
class Report:
    level: str                      # 'full', 'partial', 'fail' or 'no-go'
    score: float
    score_parts: Dict[str, float]
    requirements: List[Requirement]
    coverage: float
    data: float
    context: float
    outreach: float
    science_turns: int
    turns: int
    money_left: float
    end: str
    captured: bool

    @property
    def met(self) -> Dict[str, bool]:
        return {r.key: r.met for r in self.requirements}


def assess(flight: Flight) -> Report:
    brief, d = flight.brief, flight.derived
    if not flight.launchable:
        causes = [f"{b.label}: {b.reason}" for b in d.bars if b.colour == "red"]
        return Report("no-go", 0.0, {}, [Requirement("go", "Cleared for launch", False, "No-Go", "no red bar", causes)],
                      0.0, 0.0, 0.0, 0.0, 0, 0, 0.0, "no-go", False)

    coverage, data, turns = flight.coverage, flight.data, flight.science_turns
    need_cov, need_data, need_turns = brief["coverage_required"], brief["data_required"], brief["science_turns_required"]
    requirements = [
        Requirement("capture", "Reach lunar orbit", flight.captured,
                    f"captured on turn {flight.capture_turn}" if flight.captured else "never captured", "captured"),
        Requirement("coverage", "Map the ice", coverage >= need_cov, f"{coverage:.1f}%", f"{need_cov:g}%"),
        Requirement("data", "Science data home", data >= need_data, f"{data:.0f} MB", f"{need_data:g} MB"),
        Requirement("lifetime", "Turns in science orbit", turns >= need_turns, f"{turns}", f"{need_turns}"),
        Requirement("budget", "Stay within budget", flight.reserve >= 0,
                    f"{flight.money_left:.1f} M left" if flight.reserve >= 0 else f"overdrawn by {-flight.reserve:.1f} M",
                    "reserve not overdrawn"),
    ]

    # D1: success level
    share = brief["partial_share"]
    if all(r.met for r in requirements):
        level = "full"
    elif flight.captured and (coverage >= need_cov * share or data >= need_data * share):
        level = "partial"
    else:
        level = "fail"

    # D3: score
    w = brief["score_weights"]
    parts = {
        "coverage": w["coverage"] * min(1, coverage / need_cov),
        "data": w["data"] * min(1, data / need_data),
        "lifetime": w["lifetime"] * min(1, turns / need_turns),
        "context": w["context"] * min(1, flight.context / need_cov),
        "money": w["money"] * max(0, flight.money_left) / brief["budget"],
    }
    if not flight.captured:
        parts = {k: 0.0 for k in parts}
    score = round(sum(parts.values()), 1)

    # D2: causes
    tracers = {"capture": _why_no_capture, "coverage": _why_coverage_short, "data": _why_data_short,
               "lifetime": _why_short_life, "budget": _money_drains}
    for r in requirements:
        if not r.met:
            r.causes = tracers[r.key](flight)

    return Report(level, score, parts, requirements, coverage, data, flight.context, flight.outreach,
                  turns, flight.turn, flight.money_left, flight.end, flight.captured)


# ---------------------------------------------------------------------- D2: cause tracing
NEVER_ARRIVED = "The craft never reached its science orbit."
BAD_LUCK = "Bad luck stacked up over the mission; the margins were too thin to absorb it."


def count_of(n: int, word: str) -> str:
    return f"{n} {word}" if n == 1 else f"{n} {word}s"


def _nouns(flight: Flight, names) -> str:
    return " and ".join(flight.cat["instruments"][n]["noun"] for n in names)


def _events_that_cost_science(flight: Flight) -> List[str]:
    n, out = flight.counts, []
    if n["radiation_reset"]:
        fix = "" if flight.design.computer == "radhard" else " A radiation-hard computer resets far less often."
        out.append(f"Radiation resets cost {count_of(n['radiation_reset'], 'science turn')}.{fix}")
    if n["long_eclipse"]:
        out.append(f"Long eclipses drained the battery on {count_of(n['long_eclipse'], 'turn')}. "
                   "The large battery rides them out.")
    if n["instrument_degrades"]:
        out.append(f"The instrument degraded {count_of(n['instrument_degrades'], 'time')}, leaving "
                   f"{flight.science_factor:.0%} of its science per turn. More test turns lower the odds.")
    if n["station_outage"]:
        out.append(f"Ground station outages halved the downlink on {count_of(n['station_outage'], 'turn')}.")
    return out


def _why_no_capture(flight: Flight) -> List[str]:
    d, out = flight.derived, []
    end = flight.end
    if end == "lost contact after deployment":
        out.append("Contact was lost right after deployment, as happened to Lunar IceCube.")
        if flight.test_turns < 2:
            out.append(f"Only {count_of(flight.test_turns, 'test turn')} had been flown: that made this "
                       f"x{flight.test_factor:g} as likely. More testing lowers the odds.")
        if d.reserve < flight.cat["events"]["no_signal"]["recovery_cost"]:
            out.append("There was no reserve to pay for emergency tracking.")
        else:
            out.append("Emergency tracking did not find the craft.")
    elif end == "not enough delta-v left to capture":
        out.append(f"After the thruster problem only {flight.dv_left:.0f} m/s was left; capture needed "
                   f"{d.dv_insert:.0f}. The design carried {d.dv_available:.0f}.")
        out.append("More delta-v margin, more testing or a reserve for the fix would have saved it.")
    elif end.startswith("budget ran out"):
        out.append(f"The money ran out on turn {flight.turn}, before the craft reached orbit.")
        out.extend(_money_drains(flight))
    else:
        out.append(f"The programme was closed on turn {flight.turn} with the craft still on its way.")
        if flight.missed_rides:
            out.append(f"It missed {count_of(flight.missed_rides, 'ride')} and waited "
                       f"{flight.brief['ride_period']} turns for each next one.")
        if flight.counts["thruster"] and not flight.thruster_ok:
            out.append("The weak thruster doubled what was left of the transfer.")
    return out


def _money_drains(flight: Flight) -> List[str]:
    d, c, brief, out = flight.derived, flight.cat["constants"], flight.brief, []
    if flight.missed_rides:
        wait = flight.missed_rides * brief["ride_period"]
        out.append(f"Missing the ride meant {wait} more turns of team cost ({wait * c['team_cost_prelaunch']:.1f} M). "
                   "Slack in the schedule protects against build delays.")
    if d.total_cost > d.spendable:
        out.append(f"The plan already cost {d.total_cost:.1f} M against {d.spendable:.1f} M spendable.")
    if d.transfer_turns and d.transfer_turns > c["cruise_turns"]:
        out.append(f"The {d.transfer_turns}-turn electric transfer cost {d.transfer_turns * d.transfer_cost_per_turn:.1f} M "
                   "in team and ground time before any science.")
    if flight.counts["thruster"] and not flight.thruster_ok and not flight.cat["propulsion"][flight.design.propulsion]["impulsive"]:
        out.append("The weak thruster stretched the transfer, and every extra turn costs money.")
    extra = flight.science_turns - brief["science_turns_required"]
    if extra > 0:
        out.append(f"The extended mission ran {count_of(extra, 'turn')} past the planned "
                   f"{brief['science_turns_required']}, at {d.ops_cost_per_turn:.2f} M a turn.")
    if d.reserve == 0:
        out.append("No reserve was held back for surprises (CubeSat 101 advises at least 10%).")
    return out or ["Running costs and fixes ate the budget before the mission was over."]


def _why_short_life(flight: Flight) -> List[str]:
    d = flight.derived
    if not flight.captured:
        return [NEVER_ARRIVED]
    if flight.end == "out of propellant, orbit lost" or flight.dv_left < 0:
        return [f"The propellant ran out after {count_of(flight.science_turns, 'turn')}: holding this orbit costs "
                f"{d.upkeep_dv_per_turn:g} m/s a turn and {d.dv_after_insert:.0f} m/s was left after capture."]
    if flight.end.startswith("budget ran out"):
        return [f"The money ran out after {count_of(flight.science_turns, 'science turn')}."] + _money_drains(flight)
    return [f"The programme was closed on turn {flight.turn}: the craft reached orbit too late "
            f"(captured on turn {flight.capture_turn})."]


def _link_cause(flight: Flight) -> str:
    design, d, cat = flight.design, flight.derived, flight.cat
    text = (f"{flight.science.lost:.0f} MB of data never got home: the instruments made {d.data_per_turn:.0f} MB "
            f"a turn, the link carried {d.downlink_per_turn:.0f} and storage holds {d.storage_mb:g} MB. "
            "The coverage in the lost data was lost with it.")
    crowd = [n for n in design.instruments if cat["instruments"][n]["kind"] == "outreach"]
    if crowd and len(design.instruments) > 1:
        text += f" The {_nouns(flight, crowd)} data crowded out the ice data."
    return text + " More contact time, a bigger dish on the ground or a dish antenna on board would carry it."


def _why_coverage_short(flight: Flight) -> List[str]:
    """Chain: sees shadow -> passes -> altitude and pointing -> power -> data home -> science turns -> events."""
    design, d, cat, brief = flight.design, flight.derived, flight.cat, flight.brief
    need, turns = brief["coverage_required"], brief["science_turns_required"]
    if not flight.captured:
        return [NEVER_ARRIVED]
    ice = [n for n in design.instruments if cat["instruments"][n]["sees_shadow"]]
    if not ice:
        return [f"The {_nouns(flight, design.instruments)} cannot see into the shadowed craters where the ice is: "
                "it needs sunlight. Only the laser reflectometer and the neutron spectrometer can."]
    orbit = cat["orbits"][design.orbit]
    best = max(ice, key=lambda n: d.coverage_rate[n])
    instrument, noun = cat["instruments"][best], cat["instruments"][best]["noun"]
    out = []

    # What a perfect craft would map in the required turns: every pass at full quality, all data home.
    ideal = 100 * (1 - math.exp(-orbit["passes_per_turn"] * instrument["footprint"] * turns))
    if ideal < need:
        out.append(f"Too few passes: this orbit ({orbit['label']}) crosses the pole {orbit['passes_per_turn']:g} times "
                   f"a turn and the {noun} sees a narrow strip each time. Even a perfect craft maps only "
                   f"{ideal:.0f}% in {turns} turns. It takes an orbit with more passes or an instrument with a wider view.")
    limit = instrument["max_altitude_km"]
    if limit is not None and orbit["altitude_km"] > limit:
        share = (limit / orbit["altitude_km"]) ** 2
        out.append(f"Too high: the {noun} works up to {limit} km and this orbit passes the pole at "
                   f"{orbit['altitude_km']} km, so it sees only {share:.0%} of what it could.")
    if not cat["pointing"][design.pointing]["precise"] and instrument["quality_without_precise_pointing"] < 1:
        out.append(f"Without precise pointing the {noun} works at "
                   f"{instrument['quality_without_precise_pointing']:.0%} of its quality.")
    if d.science_duty < 1:
        out.append(f"Too little power: the instruments ran only {d.science_duty:.0%} of the time they could.")
    if flight.science.lost > 1:
        out.append(_link_cause(flight))
    if d.projected_coverage >= need:
        out.extend(_events_that_cost_science(flight))      # good enough on paper: the flight cost it
    if flight.science_turns < turns:
        out.extend(_why_short_life(flight))
    return out or [BAD_LUCK]


def _why_data_short(flight: Flight) -> List[str]:
    design, d, cat, brief = flight.design, flight.derived, flight.cat, flight.brief
    need, turns = brief["data_required"], brief["science_turns_required"]
    if not flight.captured:
        return [NEVER_ARRIVED]
    science = [n for n in design.instruments if cat["instruments"][n]["kind"] != "outreach"]
    if not science:
        return [f"The {_nouns(flight, design.instruments)} returns outreach pictures ({flight.outreach:.0f} MB came "
                "home), which do not count as science data."]
    made = sum(cat["instruments"][n]["data_per_turn"] for n in science) * d.science_duty
    out = []
    if made * turns < need:
        out.append(f"The science instruments make {made:.0f} MB a turn: {made * turns:.0f} MB in {turns} turns, "
                   f"short of {need:g} MB before anything goes wrong.")
        if d.science_duty < 1:
            out.append(f"Power held them to {d.science_duty:.0%} of the time they could run.")
    if flight.science.lost > 1:
        out.append(_link_cause(flight))
    if d.projected_data >= need:
        out.extend(_events_that_cost_science(flight))
    if flight.science_turns < turns:
        out.extend(_why_short_life(flight))
    return out or [BAD_LUCK]


# ---------------------------------------------------------------------- D4: comparison
def comparison(flight: Flight) -> List[Dict[str, str]]:
    """The player's CubeSat as the first row, then the real missions."""
    design, d, cat = flight.design, flight.derived, flight.cat
    report = assess(flight)
    outcome = {"full": "Full success", "partial": "Partial success", "fail": "Failed", "no-go": "Never launched"}[report.level]
    if flight.launchable:
        outcome += f": {flight.end}"
    you = {
        "name": "Your CubeSat",
        "mass": f"{d.wet_mass:.1f} kg (6U)",
        "propulsion": cat["propulsion"][design.propulsion]["label"],
        "instrument": ", ".join(cat["instruments"][n]["label"] for n in design.instruments),
        "orbit": cat["orbits"][design.orbit]["label"],
        "outcome": outcome,
    }
    return [you] + list(cat["reference_missions"])
