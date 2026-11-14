"""B7: the Go / No-Go bars (step 7).

Nine bars, each green, yellow or red. Any red blocks the launch. Every
yellow and red bar says why in plain words and names the step that fixes it.
"""
from __future__ import annotations

from typing import List

from .state import Bar, Derived, Design


def bars(design: Design, d: Derived, brief: dict, cat: dict) -> List[Bar]:
    c = cat["constants"]
    green = c["green_margin"]
    spare_pct = int(green * 100)
    turns = brief["science_turns_required"]

    def band(margin: float) -> str:     # margin as a share of the limit
        return "green" if margin >= green else ("yellow" if margin >= 0 else "red")

    out = []

    # Volume
    colour = band((brief["volume_cap"] - d.volume) / brief["volume_cap"])
    reason = {
        "red": f"The parts need {d.volume:.2f} U but the box holds {brief['volume_cap']:g} U. "
               "Drop an instrument or the dish, or carry less propellant.",
        "yellow": f"Less than {spare_pct}% of the box is spare.",
    }.get(colour, "")
    out.append(Bar("volume", "Volume", colour, f"{d.volume:.2f} of {brief['volume_cap']:g} U", reason, 3))

    # Mass
    colour = band((brief["mass_cap"] - d.wet_mass) / brief["mass_cap"])
    reason = {
        "red": f"The fuelled craft weighs {d.wet_mass:.1f} kg; the ride accepts {brief['mass_cap']:g} kg. "
               "Choose lighter parts or less propellant.",
        "yellow": f"Less than {spare_pct}% mass to spare.",
    }.get(colour, "")
    out.append(Bar("mass", "Mass", colour, f"{d.wet_mass:.1f} of {brief['mass_cap']:g} kg", reason, 3))

    # Time
    colour = "red" if d.slack < 0 else ("yellow" if d.slack == 0 else "green")
    reason = {
        "red": f"The craft is ready on turn {d.ready_turn}, but the ride leaves on turn {brief['ride_turn']}. "
               "Plan fewer test turns, or choose parts that take less effort to build.",
        "yellow": "Ready exactly on the ride turn. One build delay and you miss the ride.",
    }.get(colour, "")
    out.append(Bar("time", "Time", colour, f"ready turn {d.ready_turn}, ride turn {brief['ride_turn']}", reason, 1))

    # Propulsion
    fix = 3
    if design.propulsion == "none":
        colour, value = "red", "no engine"
        reason = "Without propulsion the craft cannot brake into lunar orbit; it flies past the Moon."
    elif d.dv_insert is None:
        colour, value, fix = "red", "no way to capture", 5
        reason = ("An ion engine is too weak to brake on a fast fly-by. "
                  "Choose the low-energy transfer, or a chemical engine.")
    elif d.thrust_level == 0:
        colour, value = "red", f"{d.thrust_power:.0f} W for the engine"
        reason = (f"The ion engine needs {cat['propulsion'][design.propulsion]['min_power']} W. While thrusting, "
                  f"the array gives the engine only {d.thrust_power:.0f} W after the bus. Fit a larger solar array.")
    else:
        need = d.dv_insert + d.upkeep_dv_per_turn * turns
        value = f"{d.dv_available:.0f} m/s on board, {d.dv_insert:.0f} to capture + {need - d.dv_insert:.0f} to hold orbit"
        if d.dv_available < d.dv_insert:
            colour = "red"
            reason = (f"The tank gives {d.dv_available:.0f} m/s; capturing into this orbit needs {d.dv_insert:.0f}. "
                      "Carry more propellant, save mass, or change the orbit or the transfer.")
        else:
            colour = band((d.dv_available - need) / need)
            reason = {
                "red": f"Enough to capture, but not to hold the orbit for {turns} turns "
                       f"({d.upkeep_turns} turns of upkeep on board).",
                "yellow": f"Less than {spare_pct}% delta-v to spare. A thruster problem would end the mission.",
            }.get(colour, "")
    out.append(Bar("propulsion", "Propulsion", colour, value, reason, fix))

    # Power
    value = f"science duty {d.science_duty:.0%}, battery {d.battery_usable_wh:.0f} Wh for {d.battery_need_wh:.0f} Wh of eclipse"
    if d.science_duty <= 0:
        colour = "red"
        reason = (f"The array makes {d.array_power} W and the bus alone takes {d.bus_power} W: "
                  "nothing is left for the instruments. Fit a larger solar array.")
    elif not d.battery_ok:
        colour = "red"
        reason = (f"Each orbit has an eclipse that needs {d.battery_need_wh:.0f} Wh; the battery gives "
                  f"{d.battery_usable_wh:.0f} Wh. Fit the large battery or choose an orbit with less shadow.")
    elif d.science_duty < 1:
        colour = "yellow"
        reason = f"Power only lets the instruments run {d.science_duty:.0%} of the time they could."
    elif not d.battery_long_ok:
        colour = "yellow"
        reason = "The battery cannot carry the bus through a long eclipse: science stops on those turns."
    elif d.power_margin < green * d.array_power:
        colour = "yellow"
        reason = f"Less than {spare_pct}% average power to spare."
    else:
        colour, reason = "green", ""
    out.append(Bar("power", "Power", colour, value, reason, 3))

    # Comms
    value = f"{d.link_kbps:g} kbps, {d.contact_hours:g} h a day"
    if d.downlink_per_turn <= 0:
        colour = "red"
        if not cat["radios"][design.radio]["reaches_moon"]:
            reason = ("The UHF radio works in low Earth orbit; it does not reach Earth from the Moon. "
                      "Fit the deep-space X-band radio.")
        elif d.contact_hours <= 0:
            reason, value = "No contact time is booked with the ground station.", "no contact time"
        else:
            reason = "No power is left to transmit. Fit a larger solar array."
        fix = 6 if d.contact_hours <= 0 else 3
        comms_fix = fix
    elif d.transmit_share < 1:
        colour, fix = "yellow", 3
        reason = f"Power only lets the radio transmit {d.transmit_share:.0%} of the contact time."
    else:
        colour, reason, fix = "green", "", 6
    out.append(Bar("comms", "Comms", colour, value, reason, fix))

    # Data
    value = f"makes {d.data_per_turn:.0f} MB a turn, link carries {d.downlink_per_turn:.0f}"
    if d.downlink_per_turn <= 0 or d.data_per_turn <= 0:
        colour = "red"
        reason = ("Nothing can be sent home: see Comms." if d.downlink_per_turn <= 0
                  else "The instruments make no data: they have no power.")
        fix = comms_fix if d.downlink_per_turn <= 0 else 3
    elif d.downlink_per_turn >= d.data_per_turn * (1 + green):
        colour, reason, fix = "green", "", 6
    else:
        colour, fix = "yellow", 6
        reason = (f"The link has less than {spare_pct}% to spare. What cannot be sent waits in storage "
                  f"({d.storage_mb:g} MB); overflow is lost, and its coverage with it.")
    out.append(Bar("data", "Data", colour, value, reason, fix))

    # Budget
    value = f"{d.total_cost:.1f} of {brief['budget']:g} M (reserve {d.reserve:.1f})"
    if d.total_cost <= d.spendable:
        colour, reason = "green", ""
    elif d.total_cost <= brief["budget"]:
        colour = "yellow"
        reason = (f"The plan costs {d.total_cost:.1f} M but only {d.spendable:.1f} M is spendable: "
                  f"it eats {d.total_cost - d.spendable:.1f} M of the reserve before anything goes wrong.")
    else:
        colour = "red"
        reason = (f"The plan costs {d.total_cost:.1f} M; the budget is {brief['budget']:g} M. "
                  "Cheaper parts, a shorter transfer or less ground time bring it down.")
    out.append(Bar("budget", "Budget", colour, value, reason, 3))

    # Science (never red: a mission that cannot meet the brief may still fly)
    value = (f"projected {d.projected_coverage:.0f}% ice coverage, {d.projected_data:.0f} MB "
             f"in {turns} clean turns")
    enough = d.projected_coverage >= brief["coverage_required"] and d.projected_data >= brief["data_required"]
    reason = "" if enough else (
        f"Even with no bad luck this falls short of {brief['coverage_required']:g}% and "
        f"{brief['data_required']:g} MB. It may fly, but it cannot fully succeed.")
    out.append(Bar("science", "Science", "green" if enough else "yellow", value, reason, 2))

    return out
