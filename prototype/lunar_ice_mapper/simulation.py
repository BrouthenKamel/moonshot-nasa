"""C1 to C4 and C6: the flight simulation (step 8). One turn = one month.

Flight.step() advances one turn, so a screen can draw each turn as it
happens. Player decisions on event cards go through a `decide` callback:
the terminal asks the player, tests and batch runs use auto_decide.

Every change writes a log line, so the report can explain what happened.
"""
from __future__ import annotations

import random
from dataclasses import dataclass
from typing import Callable, List, Optional, Tuple

from .calculator import evaluate, science_totals, science_turn
from .catalogue import BRIEF, CATALOGUE
from .state import Derived, Design, Science


@dataclass
class LogEntry:
    turn: int
    phase: str
    kind: str       # 'milestone', 'event', 'decision' or 'end'
    text: str


@dataclass
class Decision:
    """An event card that asks the player to choose."""
    key: str
    title: str
    text: str
    options: List[Tuple[str, str]]     # (id, label); the first one is what auto_decide picks
    real_mission: Optional[str] = None


def auto_decide(decision: Decision) -> str:
    """Standing orders: try every fix the reserve can pay for, never cut testing."""
    return decision.options[0][0]


BUILD_STAGES = ("design", "build", "test", "integration")


class Flight:
    def __init__(self, design: Design, rng: Optional[random.Random] = None, *, brief: dict = BRIEF,
                 cat: dict = CATALOGUE, events: bool = True, decide: Callable[[Decision], str] = auto_decide,
                 derived: Optional[Derived] = None):
        self.design, self.brief, self.cat = design, brief, cat
        self.derived = derived or evaluate(design, brief, cat)
        self.rng = rng or random.Random()
        self.events_on = events
        self.decide = decide
        self.log: List[LogEntry] = []
        self.science = Science.new(design.instruments)

        d, c = self.derived, cat["constants"]
        self.turn = 0
        self.phase = "build"
        self.alive = True
        self.done = False
        self.end = "horizon"
        self.captured = False
        self.launched_turn: Optional[int] = None
        self.capture_turn: Optional[int] = None
        self.missed_rides = 0
        self.science_turns = 0
        self.science_factor = 1.0
        self.thruster_ok = True
        self.coverage = self.data = self.context = self.outreach = 0.0
        self.counts = {"build_delay": 0, "radiation_reset": 0, "station_outage": 0, "long_eclipse": 0,
                       "instrument_degrades": 0, "thruster": 0, "tests_cut": 0}

        self.launchable = d.go
        if not d.go:
            self.done, self.end, self.phase = True, "no-go", "no-go"
            self.main = self.reserve = self.dv_left = 0.0
            self.transfer_left, self.stages = None, {}
            self.test_turns, self.test_factor = design.test_turns, d.test_factor
            self.launch_turn = brief["ride_turn"]
            self._note("end", "No-Go: " + ", ".join(d.red))
            return

        self.main = d.spendable - d.parts_cost
        self.reserve = d.reserve
        self.dv_left = d.dv_available
        self.transfer_left = d.transfer_turns
        self.launch_turn = brief["ride_turn"]
        self.test_turns = design.test_turns        # drops when the player cuts a test turn
        self.test_factor = d.test_factor
        self.stages = {"design": c["design_turns"], "build": d.build_turns,
                       "test": design.test_turns, "integration": c["integration_turns"]}
        self._pay(c["test_cost"] * design.test_turns)

    # ------------------------------------------------------------------ helpers
    @property
    def finished(self) -> bool:
        return self.done or not self.alive or self.turn >= self.brief["horizon"]

    @property
    def build_left(self) -> int:
        return sum(self.stages.values())

    @property
    def build_stage(self) -> str:
        return next((s for s in BUILD_STAGES if self.stages.get(s, 0) > 0), "ready")

    @property
    def money_left(self) -> float:
        return self.main + max(self.reserve, 0)

    def _note(self, kind: str, text: str) -> None:
        self.log.append(LogEntry(self.turn, self.phase, kind, text))

    def _pay(self, amount: float) -> bool:
        """Costs come from the main budget, then from the reserve. False once the reserve is overdrawn."""
        self.main -= amount
        if self.main < 0:
            self.reserve += self.main
            self.main = 0.0
        return self.reserve >= 0

    def _fail(self, reason: str) -> None:
        self.alive, self.end = False, reason
        self._note("end", reason[0].upper() + reason[1:])

    def _capture(self, how: str) -> None:
        self.dv_left -= self.derived.dv_insert
        self.captured, self.phase, self.capture_turn = True, "science", self.turn
        self._note("milestone", f"{how}: now in the science orbit ({self.cat['orbits'][self.design.orbit]['label']})")

    # ------------------------------------------------------------------ turn engine (C1)
    def run(self) -> "Flight":
        while not self.finished:
            self.step()
        return self

    def step(self) -> List[LogEntry]:
        """Advance one turn. Returns the log lines written this turn."""
        if self.finished:
            return []
        mark = len(self.log)
        self.turn += 1
        if self.phase == "build":
            self._build_turn()
        elif self.phase == "transfer":
            self._transfer_turn()
        else:
            self._science_turn()
        if not self.done and self.alive and self.turn >= self.brief["horizon"]:
            self._note("end", "The programme is closed: time ran out")
        return self.log[mark:]

    def _build_turn(self) -> None:
        c, ev = self.cat["constants"], self.cat["events"]
        paid = self._pay(c["team_cost_prelaunch"])
        delay = ev["build_delay"]
        if (self.events_on and self.build_left > 0
                and self.rng.random() < delay["chance"] * (self.derived.build_effort / delay["effort_reference"])):
            self._build_delay()
        stage = self.build_stage
        if stage != "ready":
            self.stages[stage] -= 1
        if self.turn == self.launch_turn:
            if self.build_left <= 0:
                self._launch()
            else:
                self.launch_turn += self.brief["ride_period"]
                self.missed_rides += 1
                self._note("event", f"Missed the ride: the craft is not ready. Next ride on turn {self.launch_turn}")
        if not paid:
            self._fail("budget ran out before launch")

    def _build_delay(self) -> None:
        c = self.cat["constants"]
        stage = self.build_stage
        self.stages[stage] += 1
        self.counts["build_delay"] += 1
        self._note("event", f"Build delay during {stage}: one more turn of work")
        # The player is only asked when the delay costs the ride and there is still testing to cut.
        ready_turn = self.turn + self.build_left - 1
        if ready_turn <= self.launch_turn or self.stages["test"] <= 0:
            return
        worse = self.cat["test_factor"][str(self.test_turns - 1)]
        next_ride = self.launch_turn + self.brief["ride_period"]
        choice = self.decide(Decision(
            "build_delay", "Build delay", self.cat["events"]["build_delay"]["text"]
            + f" The craft would be ready on turn {ready_turn}; the ride leaves on turn {self.launch_turn}.",
            [("wait", f"Accept the delay and miss the ride. The next one leaves on turn {next_ride}, "
                      f"and the team costs {c['team_cost_prelaunch']:g} M a turn until then"),
             ("cut_test", f"Cut one test turn and make the ride. Failure odds in flight go from "
                          f"x{self.test_factor:g} to x{worse:g}; {c['test_cost']:g} M comes back")]))
        if choice == "cut_test":
            self.stages["test"] -= 1
            self.test_turns -= 1
            self.test_factor = worse
            self.main += c["test_cost"]
            self.counts["tests_cut"] += 1
            self._note("decision", f"Cut one test turn to hold the schedule (failure odds now x{worse:g})")

    def _launch(self) -> None:
        c, ev = self.cat["constants"], self.cat["events"]["no_signal"]
        self._pay(c["ride_fee"])
        self.phase, self.launched_turn = "transfer", self.turn
        self._note("milestone", "Launched on the ride")
        reset = self.cat["computers"][self.design.computer]["reset_factor"]
        if self.events_on and self.rng.random() < ev["chance"] * self.test_factor * reset:
            self._note("event", "No signal after deployment")
            recovered = False
            if self.reserve >= ev["recovery_cost"]:
                choice = self.decide(Decision(
                    "no_signal", ev["title"], ev["text"],
                    [("recover", f"Book emergency tracking on the big dishes: {ev['recovery_chance']:.0%} chance "
                                 f"to find the craft; {ev['recovery_cost']:g} M from the reserve if it works"),
                     ("give_up", "Give up the search. The mission is lost")], ev["real_mission"]))
                if choice == "recover" and self.rng.random() < ev["recovery_chance"]:
                    self.reserve -= ev["recovery_cost"]
                    recovered = True
                    self._note("decision", f"Emergency tracking found the craft (reserve -{ev['recovery_cost']:g} M)")
            if not recovered:
                self._fail("lost contact after deployment")
        if self.alive and self.transfer_left == 0:
            self._capture("Capture burn done after the direct transfer")

    def _transfer_turn(self) -> None:
        d, ev = self.derived, self.cat["events"]["thruster"]
        if not self._pay(d.transfer_cost_per_turn):
            self.done = True
            return self._fail("budget ran out during transfer")
        if self.events_on and self.thruster_ok and self.rng.random() < ev["chance"] * self.test_factor:
            self.counts["thruster"] += 1
            self._note("event", "Thruster underperforms")
            impulsive = self.cat["propulsion"][self.design.propulsion]["impulsive"]
            effect = ("the delta-v on board is halved" if impulsive
                      else "the rest of the transfer takes twice as long")
            fixed = False
            if self.reserve >= ev["fix_cost"]:
                choice = self.decide(Decision(
                    "thruster", ev["title"], ev["text"] + f" If nothing is done, {effect}.",
                    [("fix", f"Have the team work on a fix: {ev['fix_chance']:.0%} chance; if it works it costs "
                             f"{ev['fix_cost']:g} M from the reserve and {ev['fix_delay_turns']} extra turn"),
                     ("accept", f"Fly on as it is: {effect}")], ev["real_mission"]))
                if choice == "fix" and self.rng.random() < ev["fix_chance"]:
                    self.reserve -= ev["fix_cost"]
                    self.transfer_left += ev["fix_delay_turns"]
                    fixed = True
                    self._note("decision", f"Thruster fixed (reserve -{ev['fix_cost']:g} M, "
                                           f"+{ev['fix_delay_turns']} turn)")
            if not fixed:
                self.thruster_ok = False
                if impulsive:
                    self.dv_left *= ev["chemical_dv_factor"]
                    self._note("event", f"Thruster stays weak: delta-v on board halved to {self.dv_left:.0f} m/s")
                else:
                    self.transfer_left *= ev["electric_transfer_factor"]
                    self._note("event", f"Thruster stays weak: {self.transfer_left - 1} more turns to arrival")
        self.transfer_left -= 1
        if self.transfer_left <= 0:
            if self.dv_left >= d.dv_insert:
                self._capture("Capture burn done")
            else:
                self._fail("not enough delta-v left to capture")

    def _science_turn(self) -> None:
        d, c, ev, brief = self.derived, self.cat["constants"], self.cat["events"], self.brief
        if not self._pay(d.ops_cost_per_turn):
            self.done = True
            return self._fail("budget ran out in orbit")
        duty, link = 1.0, 1.0
        if self.events_on:
            reset = self.cat["computers"][self.design.computer]["reset_factor"]
            if self.rng.random() < ev["radiation_reset"]["chance"] * reset:
                duty = 0.0
                self.counts["radiation_reset"] += 1
                self._note("event", "Radiation reset: safe mode, no science this turn")
            if self.rng.random() < self.cat["ground_stations"][self.design.ground_station]["outage_chance"]:
                link = ev["station_outage"]["downlink_factor"]
                self.counts["station_outage"] += 1
                self._note("event", "Ground station outage: half the contact time")
            if self.rng.random() < ev["long_eclipse"]["chance"] and not d.battery_long_ok:
                duty = 0.0
                self.counts["long_eclipse"] += 1
                self._note("event", "Long eclipse drained the battery: safe mode, no science this turn")
            if self.rng.random() < ev["instrument_degrades"]["chance"] * self.test_factor:
                self.science_factor *= ev["instrument_degrades"]["science_factor"]
                self.counts["instrument_degrades"] += 1
                self._note("event", "Instrument degraded: 20% less science per turn from now on")
        science_turn(self.design, d, self.science, self.cat, duty, link, self.science_factor)
        self.science_turns += 1
        self.dv_left -= d.upkeep_dv_per_turn
        if self.dv_left < 0:
            self._fail("out of propellant, orbit lost")

        # End test (C6)
        before_coverage, before_data = self.coverage, self.data
        self.coverage, self.data, self.context, self.outreach = science_totals(self.design, self.science, self.cat)
        if self.science_turns >= brief["science_turns_required"]:
            if self.coverage >= brief["coverage_required"] and self.data >= brief["data_required"]:
                self.done, self.end = True, "all requirements met"
                return self._note("end", "All requirements met: mission complete")
            growing = (
                (self.coverage < brief["coverage_required"]
                 and self.coverage - before_coverage > c["progress_min_coverage"])
                or (self.data < brief["data_required"] and self.data - before_data > c["progress_min_data"]))
            limit = brief["science_turns_required"] + c["extension_max_turns"]
            if not growing or self.science_turns >= limit:
                self.done, self.end = True, "primary mission over"
                return self._note("end", "Mission over: " + ("the extended mission has run its full length"
                                                             if growing else "the science has stopped growing"))
            if self.alive and self.science_turns == brief["science_turns_required"]:
                self._note("milestone", "Primary mission done but targets not yet met: extended mission begins")
