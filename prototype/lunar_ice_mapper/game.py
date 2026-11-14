"""The game in the terminal.

A5  step flow: steps 1 to 9, stepping back, No-Go back to redesign, try again
A6  shell: step trail in the four role colours, resource meters on every screen
B1 to B7  the design screens and the Go / No-Go check
C5  flight view: one line per turn, event cards
D5  report screen and retry

No game logic lives here: every number comes from calculator.evaluate(),
simulation.Flight and evaluation.assess().
"""
from __future__ import annotations

import random
import textwrap
import time
from typing import List, Optional, Tuple

from .calculator import evaluate
from .catalogue import (BRIEF, CATALOGUE, MAX_INSTRUMENTS, OPTION_TABLES, PROPELLANT_STEP, RESERVE_OPTIONS,
                        TEST_TURN_OPTIONS, propellant_options)
from .evaluation import Report, assess, count_of, comparison
from .presets import PRESETS, STARTER
from .simulation import Decision, Flight, auto_decide
from .state import Derived, Design
from .terminal import Terminal, visible_len

# step: (short name, title, role colour, segment)
STEPS = {
    1: ("Plan", "Mission planning", "ground", "Ground"),
    2: ("Instruments", "Instrument selection", "science", "Science"),
    3: ("Spacecraft", "Spacecraft configuration", "space", "Space"),
    4: ("Orbit", "Orbit selection", "launch", "Launch"),
    5: ("Transfer", "Ride and transfer", "launch", "Launch"),
    6: ("Comms", "Comms plan", "ground", "Ground"),
    7: ("Check", "Resource check: Go / No-Go", "ground", "Everyone"),
    8: ("Fly", "Mission simulation", "shared", "Everyone"),
    9: ("Report", "Evaluation", "shared", "Everyone"),
}

TEACH = {
    1: "Split the turns before the ride into build and test, and hold money back. Less testing frees time "
       "and money but raises the odds of failure in flight.",
    2: "The science question decides the instrument. The ice sits in craters that never see the Sun.",
    3: "Everything must fit a 6U box and 14 kg. Each part costs mass, volume, power, money and build effort.",
    4: "Only a polar orbit passes over the south pole. More and lower passes map faster, but the orbit "
       "costs more to reach and to hold.",
    5: "A fast transfer needs a strong engine and a lot of propellant. A slow one saves propellant and "
       "costs months of running the team.",
    6: "Only data that reaches the ground counts. The Moon is a thousand times farther than low Earth orbit.",
    7: "Any red bar blocks the launch and names the step that fixes it. Yellow may fly, at a risk.",
}

STEP_FIELDS = {
    1: ["test_turns", "reserve_share"],
    2: ["instruments"],
    3: ["solar_array", "battery", "propulsion", "propellant_kg", "radio", "antenna", "computer", "pointing"],
    4: ["orbit"],
    5: ["transfer"],
    6: ["ground_station", "contact_hours"],
}

LABELS = {
    "test_turns": "Test turns", "reserve_share": "Reserve", "instruments": "Instruments",
    "solar_array": "Solar array", "battery": "Battery", "propulsion": "Propulsion",
    "propellant_kg": "Propellant", "radio": "Radio", "antenna": "Antenna", "computer": "Computer",
    "pointing": "Pointing", "orbit": "Orbit", "transfer": "Transfer", "ground_station": "Ground station",
    "contact_hours": "Contact time",
}

# Catalogue columns shown when choosing a part: (header, key, unit)
COLUMNS = {
    "solar_array": [("Generates", "power_generated", "W"), ("Mass", "mass", "kg"), ("Cost", "cost", "M"),
                    ("Effort", "effort", "")],
    "battery": [("Capacity", "capacity_wh", "Wh"), ("Mass", "mass", "kg"), ("Volume", "volume", "U"),
                ("Cost", "cost", "M")],
    "propulsion": [("Isp", "isp", "s"), ("Dry mass", "dry_mass", "kg"), ("Max propellant", "max_propellant", "kg"),
                   ("Cost", "cost", "M"), ("Effort", "effort", "")],
    "radio": [("Reaches the Moon", "reaches_moon", ""), ("Listening", "listen_power", "W"),
              ("Transmitting", "transmit_power", "W"), ("Mass", "mass", "kg"), ("Volume", "volume", "U"),
              ("Cost", "cost", "M")],
    "antenna": [("Gain", "gain", "x"), ("Mass", "mass", "kg"), ("Volume", "volume", "U"), ("Cost", "cost", "M")],
    "computer": [("Storage", "storage_mb", "MB"), ("Reset odds", "reset_factor", "x"), ("Power", "power", "W"),
                 ("Mass", "mass", "kg"), ("Volume", "volume", "U"), ("Cost", "cost", "M")],
    "pointing": [("Power", "power", "W"), ("Mass", "mass", "kg"), ("Volume", "volume", "U"), ("Cost", "cost", "M")],
    "orbit": [("Over the pole", "altitude_km", "km"), ("Passes a turn", "passes_per_turn", ""),
              ("Sunlit", "sunlit_share", "%"), ("Eclipse", "eclipse_hours", "h"),
              ("Earth in view", "earth_visible", "%"), ("Upkeep a turn", "upkeep_dv", "m/s")],
    "transfer": [],
    "ground_station": [("Rate", "rate_kbps", "kbps"), ("Max a day", "max_hours", "h"),
                       ("Price per hour a day", "price", "M"), ("Outage odds", "outage_chance", "%")],
}

BUILD_TEXT = {"design": "designing", "build": "building", "test": "testing", "integration": "fitting to the ride"}
VERDICTS = {"full": ("FULL SUCCESS", "green"), "partial": ("PARTIAL SUCCESS", "yellow"),
            "fail": ("MISSION FAILED", "red"), "no-go": ("NO-GO: NEVER LAUNCHED", "red")}


def normalise(design: Design, cat: dict = CATALOGUE) -> Design:
    """Keep dependent choices legal: tank size within the engine's range, contact time within the station's."""
    top = cat["propulsion"][design.propulsion]["max_propellant"]
    kg = 0.0 if top == 0 else min(max(design.propellant_kg, PROPELLANT_STEP), top)
    hours = min(design.contact_hours, cat["ground_stations"][design.ground_station]["max_hours"])
    return design.with_(propellant_kg=kg, contact_hours=hours)


def _cell(value, unit: str) -> str:
    if isinstance(value, bool):
        return "yes" if value else "no"
    if unit == "%":
        return f"{value:.0%}"
    return f"{value:g} {unit}".strip()


class Game:
    def __init__(self, term: Terminal, design: Design = STARTER, *, seed: Optional[int] = None,
                 events: bool = True, auto: bool = False, delay: float = 0.0,
                 brief: dict = BRIEF, cat: dict = CATALOGUE):
        self.t, self.brief, self.cat = term, brief, cat
        self.design = normalise(design, cat)
        self.seed, self.events, self.auto, self.delay = seed, events, auto, delay
        self.flights = 0

    @property
    def derived(self) -> Derived:
        return evaluate(self.design, self.brief, self.cat)

    # ------------------------------------------------------------------ A5: step flow
    def play(self) -> Optional[Report]:
        """Steps 1 to 9, as often as the player wants. Leaves by raising terminal.Quit."""
        self.title()
        if self.auto:
            return self.play_auto()
        step, checked, flight = 1, False, None
        while True:
            if step <= 6:
                action = self.design_step(step, checked)
                if action == "back":
                    step = max(1, step - 1)
                elif action == "check":
                    step = 7
                else:
                    step = 7 if checked else step + 1
            elif step == 7:
                checked = True
                action = self.check_step()
                step = 8 if action == "go" else action
            elif step == 8:
                flight = self.fly()
                step = 9
            else:
                self.report_step(flight)
                self.t.ask("  Enter = try again with changes, q = quit:")
                step, checked = 1, False

    def play_auto(self) -> Report:
        """No questions: check the design, fly it on standing orders, print the report."""
        d = self.derived
        self.header(7)
        self.design_card()
        self.show_bars(d)
        flight = self.fly() if d.go else Flight(self.design, brief=self.brief, cat=self.cat, derived=d)
        return self.report_step(flight)

    # ------------------------------------------------------------------ A6: shell
    def title(self) -> None:
        t, b = self.t, self.brief
        t.say()
        t.say(t.paint(f"  MOONSHOT · {b['name'].upper()}", "bold"))
        t.say(f"  {b['objective']}")
        t.say()
        self.wrap(f"The ride leaves on turn {b['ride_turn']}; miss it and the next one comes {b['ride_period']} turns "
                  f"later. You must reach lunar orbit with your own propulsion, map {b['coverage_required']:g}% of the "
                  f"south polar region with an instrument that sees into shadow, get {b['data_required']:g} MB of "
                  f"science data home and work {b['science_turns_required']} turns in orbit.")
        self.wrap(f"Limits: {b['volume_cap']:g} U, {b['mass_cap']:g} kg, {b['budget']:g} million. One turn is one month. "
                  "Coverage only counts once its data is on the ground.")
        if not self.auto:
            t.say()
            self.wrap("You start with what a team used to low Earth orbit would build. It will not get to the Moon. "
                      "Type q at any prompt to quit.", style="dim")

    def header(self, step: int) -> None:
        t = self.t
        t.say()
        t.rule()
        trail = []
        for n, (short, _, role, _) in STEPS.items():
            trail.append(t.paint(f"[{n} {short}]", role, "bold") if n == step else t.paint(f"{n} {short}", role))
        t.say(" " + "  ".join(trail))
        _, title, role, segment = STEPS[step]
        t.say()
        t.say(" " + t.paint(f"Step {step}: {title}", "bold") + "  " + t.paint(segment, role))
        if step in TEACH:
            self.wrap(TEACH[step], indent=1, style="dim")
        t.say()

    def meters(self, d: Derived) -> None:
        """The resource bars shown on every design screen."""
        t, b, colour = self.t, self.brief, d.checks
        t.say(f"  Volume {t.meter(d.volume / b['volume_cap'], colour['volume'])} {d.volume:.2f}/{b['volume_cap']:g} U"
              f"    Mass {t.meter(d.wet_mass / b['mass_cap'], colour['mass'])} {d.wet_mass:.1f}/{b['mass_cap']:g} kg"
              f"    Cost {t.meter(d.total_cost / b['budget'], colour['budget'])} {d.total_cost:.1f}/{b['budget']:g} M")
        power = f"Power   array {d.array_power} W, bus {d.bus_power} W, instruments {d.instrument_power} W"
        ready = f"Time  ready turn {d.ready_turn}, ride turn {b['ride_turn']}"
        if d.dv_insert is None:
            dv = "Delta-v no way to capture"
        else:
            dv = f"Delta-v {d.dv_available:.0f} m/s on board, {d.dv_insert:.0f} to capture"
        data = f"Data  makes {d.data_per_turn:.0f} MB a turn, link carries {d.downlink_per_turn:.0f}"
        worst = "red" if "red" in (colour["comms"], colour["data"]) else colour["data"]
        t.say(f"  {self.tint(f'{power:<50}', colour['power'])}{self.tint(ready, colour['time'])}")
        t.say(f"  {self.tint(f'{dv:<50}', colour['propulsion'])}{self.tint(data, worst)}")
        t.say()

    def tint(self, text: str, colour: str) -> str:
        return text if colour == "green" else self.t.paint(text, colour)

    def wrap(self, text: str, indent: int = 2, style: Optional[str] = None, first: str = "",
             rest: Optional[str] = None) -> None:
        """Print text wrapped to the screen. first starts line one; rest starts the lines after it."""
        pad = " " * indent
        rest = " " * len(first) if rest is None else rest
        for line in textwrap.wrap(text, 96, initial_indent=pad + first, subsequent_indent=pad + rest,
                                  break_on_hyphens=False):
            self.t.say(self.t.paint(line, style) if style else line)

    # ------------------------------------------------------------------ B1 to B6: design screens
    def design_step(self, step: int, checked: bool) -> str:
        """One design screen. Returns 'next', 'back' or 'check'."""
        fields = STEP_FIELDS[step]
        onward = "back to the check" if checked else ("the check" if step == 6 else f"step {step + 1}")
        nav = (f"Enter = {onward}" + (", b = back" if step > 1 else "")
               + ("" if onward.endswith("check") else ", c = check"))
        while True:
            d = self.derived
            self.header(step)
            self.meters(d)
            if len(fields) == 1:
                values = self.show_options(fields[0])
                self.step_info(step, d)
                if fields[0] == "instruments":
                    answer = self.t.numbers(f"  Pick one or two, e.g. 1 or 1 4 ({nav}):", len(values),
                                            MAX_INSTRUMENTS, keys="bc")
                    if answer is None:
                        return "next"
                    picked = tuple(values[i - 1] for i in answer) if isinstance(answer, list) else None
                else:
                    answer = self.t.pick(f"  Choose 1 to {len(values)} ({nav}):", len(values), default="next", keys="bc")
                    if answer == "next":
                        return "next"
                    picked = values[answer - 1] if isinstance(answer, int) else None
                if picked is None:
                    return "back" if answer == "b" else "check"
                self.design = normalise(self.design.with_(**{fields[0]: picked}), self.cat)
            else:
                for i, name in enumerate(fields, 1):
                    self.t.say(f"  {i}) {LABELS[name]:<15} {self.current(name, d)}")
                self.step_info(step, d)
                answer = self.t.pick(f"  Change 1 to {len(fields)} ({nav}):", len(fields), default="next", keys="bc")
                if answer == "next":
                    return "next"
                if answer in ("b", "c"):
                    return "back" if answer == "b" else "check"
                self.edit(fields[answer - 1])

    def current(self, name: str, d: Derived) -> str:
        """The current choice for a field, in words."""
        design, cat = self.design, self.cat
        if name == "test_turns":
            return f"{design.test_turns} (failure odds x{d.test_factor:g})"
        if name == "reserve_share":
            return f"{design.reserve_share:.0%} ({d.reserve:.1f} M held back)"
        if name == "instruments":
            return ", ".join(cat["instruments"][n]["label"] for n in design.instruments)
        if name == "propellant_kg":
            return "none" if d.propellant_kg == 0 else f"{d.propellant_kg:g} kg ({d.dv_available:.0f} m/s)"
        if name == "contact_hours":
            top = cat["ground_stations"][design.ground_station]["max_hours"]
            return f"{d.contact_hours:g} h a day (this station gives up to {top:g})"
        return cat[OPTION_TABLES[name]][getattr(design, name)]["label"]

    def edit(self, name: str) -> None:
        """Change one choice of a screen that has several."""
        t, cat = self.t, self.cat
        t.say()
        t.say(t.paint(f"  {LABELS[name]}", "bold"))
        if name == "contact_hours":
            top = cat["ground_stations"][self.design.ground_station]["max_hours"]
            hours = t.amount(f"  Contact hours a day, 0.25 to {top:g} (Enter keeps {self.design.contact_hours:g}):", 0.25, top)
            if hours is not None:
                self.design = self.design.with_(contact_hours=hours)
            return
        values = self.show_options(name)
        if not values:
            t.say("  No engine is fitted, so there is no tank to fill. Choose a propulsion system first.")
            return
        choice = t.pick(f"  Choose 1 to {len(values)} (Enter keeps the current one):", len(values), default=0)
        if choice:
            self.design = normalise(self.design.with_(**{name: values[choice - 1]}), self.cat)
            if name == "propulsion" and self.design.propulsion != "none":
                self.edit("propellant_kg")      # a new engine needs a tank size

    def show_options(self, name: str) -> list:
        """Print the options table for a field. Returns the option values in the order shown."""
        t, cat, c = self.t, self.cat, self.cat["constants"]
        if name == "instruments":
            rows, notes = [], []
            for i, (key, ins) in enumerate(cat["instruments"].items(), 1):
                mark = "*" if key in self.design.instruments else " "
                limit = "any" if ins["max_altitude_km"] is None else f"up to {ins['max_altitude_km']} km"
                rows.append([f"{mark}{i}", ins["label"], f"{ins['mass']:g} kg", f"{ins['volume']:g} U",
                             f"{ins['power']:g} W", f"{ins['cost']:g} M", f"{ins['data_per_turn']:g} MB",
                             "yes" if ins["sees_shadow"] else "no", limit, ins["kind"]])
                notes.append([t.paint(f"modelled on: {ins['model']}", "dim")])
            t.table(["", "Instrument", "Mass", "Volume", "Power", "Cost", "Data a turn", "Sees into shadow",
                     "Works", "Counts as"], rows, notes)
            t.say()
            return list(cat["instruments"])

        if name == "test_turns":
            headers, options = ["Test turns", "Failure odds", "Cost"], [
                (n, [str(n), f"x{cat['test_factor'][str(n)]:g}", f"{n * c['test_cost']:.1f} M"])
                for n in TEST_TURN_OPTIONS]
        elif name == "reserve_share":
            budget = self.brief["budget"]
            headers, options = ["Reserve", "Held back", "Spendable"], [
                (s, [f"{s:.0%}", f"{budget * s:.2f} M", f"{budget * (1 - s):.2f} M"]) for s in RESERVE_OPTIONS]
        elif name == "propellant_kg":
            headers, options = ["Propellant"], [(kg, [f"{kg:g} kg"]) for kg in propellant_options(self.design.propulsion, cat)]
        else:
            columns = COLUMNS[name]
            headers = [LABELS[name]] + [header for header, _, _ in columns]
            options = [(key, [item["label"]] + [_cell(item[k], unit) for _, k, unit in columns])
                       for key, item in cat[OPTION_TABLES[name]].items()]

        rows, notes = [], []
        for i, (value, cells) in enumerate(options, 1):
            trial = evaluate(normalise(self.design.with_(**{name: value}), cat), self.brief, cat)
            mark = "*" if value == getattr(self.design, name) else " "
            rows.append([f"{mark}{i}"] + cells)
            effects = "; ".join(f"{what} {value}" for what, value in self.consequences(name, trial))
            notes.append(([f"-> {effects}"] if effects else []) + [self.outcome(trial)])
        t.table([""] + headers, rows, notes)
        t.say()
        return [value for value, _ in options]

    def consequences(self, name: str, d: Derived) -> List[Tuple[str, str]]:
        """What this option does to the rest of the design, as (what, value) pairs."""
        capture = "not possible" if d.dv_insert is None else f"{d.dv_insert:.0f} m/s"
        transfer = "cannot fly it" if d.transfer_turns is None else (
            "about 5 days" if d.transfer_turns == 0 else f"{d.transfer_turns} turns")
        if name == "propulsion":
            return [("to capture:", capture), ("transfer:", transfer)]
        if name == "propellant_kg":
            return [("delta-v on board:", f"{d.dv_available:.0f} m/s"), ("to capture:", capture),
                    ("turns of orbit upkeep after that:", str(d.upkeep_turns))]
        if name == "orbit":
            ice = [rate for n, rate in d.coverage_rate.items() if self.cat["instruments"][n]["sees_shadow"]]
            return [("to capture:", capture), ("transfer:", transfer),
                    ("ice mapped a turn:", f"{max(ice):.1%} of what is left" if ice else "none")]
        if name == "transfer":
            left = "-" if d.dv_insert is None else f"{d.dv_after_insert:.0f} m/s"
            return [("to capture:", capture), ("takes:", transfer), ("left after capture:", left)]
        if name == "ground_station":
            return [("link:", f"{d.link_kbps:g} kbps"), ("carries", f"{d.downlink_per_turn:.0f} MB a turn")]
        return []

    def outcome(self, d: Derived) -> str:
        """One line under each option: the meters if this option were chosen."""
        text = f"   {d.wet_mass:.1f} kg, {d.volume:.2f} U, {d.total_cost:.1f} M, ready turn {d.ready_turn}"
        if d.red:
            return self.t.paint(text + "; red: " + ", ".join(d.red), "red")
        return self.t.paint(text + "; no red bars", "green")

    def step_info(self, step: int, d: Derived) -> None:
        """What this step feeds into the rest of the mission."""
        t, b, c, cat, design = self.t, self.brief, self.cat["constants"], self.cat, self.design
        lines = []
        if step == 1:
            lines.append(f"Build effort {d.build_effort:g} points at {c['effort_per_turn']} a turn: design "
                         f"{c['design_turns']} + build {d.build_turns} + test {design.test_turns} + fitting "
                         f"{c['integration_turns']} = ready on turn {d.ready_turn}. The ride leaves on turn {b['ride_turn']}.")
            lines.append(f"Spendable {d.spendable:.1f} M; the plan costs {d.total_cost:.1f} M. "
                         "CubeSat 101 advises a reserve of at least 10%.")
        elif step == 2:
            lines.append(f"Chosen: {self.current('instruments', d)}. Together {d.instrument_power:g} W, "
                         f"{d.data_per_turn:.0f} MB a turn at the current power.")
        elif step == 3:
            lines.append(f"Build effort {d.build_effort:g} points, parts {d.parts_cost:.2f} M, storage {d.storage_mb:g} MB.")
        elif step == 4:
            for name in design.instruments:
                ins = cat["instruments"][name]
                counts = "" if ins["sees_shadow"] else " (cannot see into shadow: does not count as ice coverage)"
                lines.append(f"{ins['label']}: works at {d.quality[name]:.0%} quality here, maps "
                             f"{d.coverage_rate[name]:.1%} of the remaining area a turn{counts}.")
            lines.append(f"Science duty {d.science_duty:.0%}. Eclipse needs {d.battery_need_wh:.0f} Wh; the battery "
                         f"gives {d.battery_usable_wh:.0f} Wh. Projected in {b['science_turns_required']} clean turns: "
                         f"{d.projected_coverage:.0f}% ice coverage.")
        elif step == 5:
            if d.dv_insert is None or d.transfer_turns is None:
                lines.append("This craft cannot reach the chosen orbit. See the red bars in the check.")
            else:
                lines.append(f"Arrives on turn {b['ride_turn'] + d.transfer_turns}. After the capture burn "
                             f"{d.dv_after_insert:.0f} m/s is left: {d.upkeep_turns} turns of holding the orbit "
                             f"at {d.upkeep_dv_per_turn:g} m/s a turn.")
        elif step == 6:
            lines.append(f"Link {d.link_kbps:g} kbps: carries {d.downlink_per_turn:.0f} MB a turn. The instruments make "
                         f"{d.data_per_turn:.0f} MB a turn. Storage {d.storage_mb:g} MB. Ground time costs "
                         f"{d.ground_cost_per_turn:.2f} M a turn.")
        for line in lines:
            self.wrap(line, style="dim")
        t.say()

    # ------------------------------------------------------------------ B7: Go / No-Go
    def design_card(self) -> None:
        d, cat, design = self.derived, self.cat, self.design
        part = lambda name: cat[OPTION_TABLES[name]][getattr(design, name)]["label"]
        tank = "" if d.propellant_kg == 0 else f" with {d.propellant_kg:g} kg propellant"
        lines = [
            ("1 Plan", f"{design.test_turns} test turns, {design.reserve_share:.0%} reserve"),
            ("2 Instruments", self.current("instruments", d)),
            ("3 Spacecraft", f"array: {part('solar_array')}; battery: {part('battery')}; propulsion: "
                             f"{part('propulsion')}{tank}; radio: {part('radio')}; antenna: {part('antenna')}; "
                             f"computer: {part('computer')}; pointing: {part('pointing')}"),
            ("4 Orbit", cat["orbits"][design.orbit]["label"]),
            ("5 Transfer", cat["transfers"][design.transfer]["label"]),
            ("6 Comms", f"{cat['ground_stations'][design.ground_station]['label']}, {d.contact_hours:g} h a day"),
        ]
        for label, text in lines:
            self.wrap(text, first=f"{label:<15}")
        self.t.say()

    def show_bars(self, d: Derived) -> None:
        t = self.t
        for bar in d.bars:
            t.say(f"  {bar.label:<11}{t.light(bar.colour)}  {bar.value}")
            if bar.reason:
                self.wrap(f"{bar.reason} (step {bar.fix_step})", indent=13, style=bar.colour)
        t.say()
        if d.go:
            t.say("  " + t.paint("GO is possible.", "green", "bold") + " Yellow bars may fly, at a risk.")
        else:
            t.say("  " + t.paint("NO-GO.", "red", "bold") + " A red bar blocks the launch.")

    def check_step(self):
        """Step 7. Returns 'go', or the number of the step to redesign."""
        while True:
            d = self.derived
            self.header(7)
            self.design_card()
            self.show_bars(d)
            if d.go:
                answer = self.t.pick("  g = GO for launch, 1 to 6 = change a step, p = load a ready-made design:",
                                     6, keys="gp")
            else:
                fix = next(bar.fix_step for bar in d.bars if bar.colour == "red")
                answer = self.t.pick(f"  Enter = redesign at step {fix}, 1 to 6 = another step, "
                                     "p = load a ready-made design:", 6, default=fix, keys="p")
            if answer == "g":
                return "go"
            if answer == "p":
                self.preset_menu()
            else:
                return answer

    def preset_menu(self) -> None:
        t = self.t
        featured = [(key, p) for key, p in PRESETS.items() if p.featured]
        t.say()
        rows = []
        for i, (key, preset) in enumerate(featured, 1):
            d = evaluate(preset.design, self.brief, self.cat)
            rows.append([str(i), preset.label, t.paint("may fly", "green") if d.go else t.paint("No-Go", "red")])
        t.table(["", "Ready-made design", "Check"], rows)
        choice = t.pick(f"  Load 1 to {len(featured)} (Enter keeps your design):", len(featured), default=0)
        if choice:
            self.design = normalise(featured[choice - 1][1].design, self.cat)

    # ------------------------------------------------------------------ C5: flight view
    def fly(self) -> Flight:
        """Step 8: the mission plays itself, one line per turn, and stops at event cards."""
        t = self.t
        seed = self.seed + self.flights if self.seed is not None else random.randrange(1_000_000)
        self.flights += 1
        self.flight_seed = seed
        flight = Flight(self.design, random.Random(seed), brief=self.brief, cat=self.cat, events=self.events,
                        decide=self.event_card)
        self.header(8)
        orders = ("Standing orders answer every event card." if self.auto
                  else "The mission flies itself and stops when it needs a decision.")
        t.say(t.paint(f"  Dice seed {seed}. {orders}", "dim"))
        t.say()
        self._flight = flight
        while not flight.finished:
            entries = flight.step()
            self.turn_line(flight)
            for entry in entries:
                style = {"event": "yellow", "end": "bold", "milestone": "green", "decision": "shared"}[entry.kind]
                self.wrap(entry.text, indent=8, style=style, first="- ")
            if self.delay:
                time.sleep(self.delay)
        return flight

    def turn_line(self, flight: Flight) -> None:
        t, b, d = self.t, self.brief, flight.derived
        money = f"{flight.main:.1f} M + {max(flight.reserve, 0):.1f} reserve"
        if flight.phase == "build":
            stage = flight.build_stage
            what = (f"ready, waiting for the ride on turn {flight.launch_turn}" if stage == "ready"
                    else f"{BUILD_TEXT[stage]}, {count_of(flight.build_left, 'turn')} of work left")
            text, role = f"build     {what}", "ground"
        elif flight.phase == "transfer":
            text, role = (f"transfer  {count_of(flight.transfer_left, 'turn')} to arrival, "
                          f"delta-v {flight.dv_left:.0f} m/s"), "launch"
        elif flight.science_turns == 0:
            text, role = f"arrival   capture burn done, delta-v {flight.dv_left:.0f} m/s left", "launch"
        else:
            waiting = f"  on board {flight.science.stored:.0f} MB" if flight.science.stored >= 0.5 else ""
            lost = f"  lost {flight.science.lost:.0f} MB" if flight.science.lost >= 0.5 else ""
            text, role = (f"science   {flight.science_turns:>2}/{b['science_turns_required']}  ice "
                          f"{t.meter(flight.coverage / 100, 'green')} {flight.coverage:5.1f}%  "
                          f"data home {flight.data:4.0f} MB{waiting}{lost}  "
                          f"delta-v {max(flight.dv_left, 0):.0f}"), "science"
        pad = " " * max(2, 72 - visible_len(text))
        t.say(f"  {t.paint(f'T{flight.turn:<3}', role, 'bold')} {text}{pad}{t.paint(money, 'dim')}")

    def event_card(self, decision: Decision) -> str:
        """An event that needs the player. In auto mode the standing orders answer."""
        t = self.t
        flight = self._flight
        t.say()
        like = f" (as on {decision.real_mission})" if decision.real_mission else ""
        t.say("  " + t.paint(f"┌─ EVENT, turn {flight.turn}: {decision.title}{like}", "yellow", "bold"))
        self.wrap(decision.text, first="│ ", rest="│ ")
        self.wrap(f"Money {flight.main:.1f} M, reserve {max(flight.reserve, 0):.1f} M.", first="│ ", style="dim")
        for i, (_, label) in enumerate(decision.options, 1):
            self.wrap(label, first=f"│ {i}) ", rest="│    ")
        if self.auto:
            choice = auto_decide(decision)
            t.say("  " + t.paint(f"└─ standing orders: option {[k for k, _ in decision.options].index(choice) + 1}", "dim"))
        else:
            number = t.pick(f"  └─ Choose 1 to {len(decision.options)}:", len(decision.options))
            choice = decision.options[number - 1][0]
        t.say()
        return choice

    # ------------------------------------------------------------------ D5: report
    def report_step(self, flight: Flight) -> Report:
        t, b = self.t, self.brief
        report = assess(flight)
        self.header(9)
        verdict, colour = VERDICTS[report.level]
        t.say("  " + t.paint(verdict, colour, "bold") + f"   score {report.score:.1f} of 100")
        if flight.launchable:
            t.say(f"  The mission ended on turn {report.turns}: {report.end}.")
        t.say()
        for r in report.requirements:
            mark = t.paint("✔", "green") if r.met else t.paint("✘", "red")
            t.say(f"  {mark} {r.label:<24}{r.actual:<24}needed: {r.target}")
            for cause in r.causes:
                self.wrap(cause, indent=6, first="why: ")
        t.say()
        if flight.launchable:
            w, p = b["score_weights"], report.score_parts
            names = {"coverage": "ice coverage", "data": "science data", "lifetime": "turns in orbit",
                     "context": "sunlit-ground coverage", "money": "money left"}
            self.wrap("Score: " + ", ".join(f"{names[k]} {p[k]:.1f}/{w[k]}" for k in names) + ".")
            if report.outreach:
                self.wrap(f"Outreach: {report.outreach:.0f} MB of pictures came home. They do not count as science data.")
            happened = [e for e in flight.log if e.kind in ("event", "decision")]
            if happened:
                t.say()
                t.say(t.paint("  What happened on the way", "bold"))
                for e in happened:
                    self.wrap(e.text, indent=4, first=f"T{e.turn:<3} ")
            else:
                self.wrap("Nothing went wrong on the way: no events.")
            t.say()
        t.say(t.paint("  Next to the real missions", "bold"))
        rows = [[m["name"], m["mass"], m["propulsion"], m["instrument"], m["orbit"]] for m in comparison(flight)]
        t.table(["", "Mass", "Propulsion", "Instrument", "Orbit"], rows,
                notes=[[m["outcome"]] for m in comparison(flight)], indent=4)
        t.say()
        if flight.launchable:
            t.say(t.paint(f"  Dice seed {self.flight_seed}: run with --seed {self.flight_seed} to fly the same luck again.", "dim"))
        return report
