"""The model on its own terms: calculator, Go / No-Go bars, flight and evaluation."""
import random
import unittest

from lunar_ice_mapper import PRESETS, STARTER, Design, Flight, assess, evaluate, insertion_delta_v
from tests.test_parity import random_designs


def preset(name: str) -> Design:
    return PRESETS[name].design


class Dice:
    """Scripted dice: the listed rolls first, then rolls so high that nothing else happens."""
    def __init__(self, *rolls):
        self.rolls = list(rolls)

    def random(self) -> float:
        return self.rolls.pop(0) if self.rolls else 0.999


class Calculator(unittest.TestCase):
    def test_real_mission_anchors(self):
        """Section 9 of the logic map."""
        self.assertEqual(insertion_delta_v("chemical", "direct", "circular"), 858)
        self.assertEqual(insertion_delta_v("chemical", "low_energy", "elliptical"), 386)
        self.assertIsNone(insertion_delta_v("electric", "direct", "halo"))
        self.assertEqual(evaluate(preset("lunah-map")).transfer_turns, 10)
        icecube = evaluate(preset("icecube"))
        self.assertAlmostEqual(icecube.wet_mass, 12.8, places=1)
        self.assertAlmostEqual(icecube.total_cost, 24.9, places=1)
        self.assertAlmostEqual(evaluate(preset("flashlight")).wet_mass, 14.0, places=1)

    def test_what_the_model_teaches(self):
        greedy = evaluate(preset("greedy"))
        self.assertAlmostEqual(greedy.volume, 9.2, places=1)
        self.assertAlmostEqual(greedy.wet_mass, 18.6, places=1)
        self.assertEqual(evaluate(preset("leo-habits")).bar("comms").colour, "red")
        self.assertEqual(evaluate(preset("electric-medium-array")).thrust_level, 0)

    def test_starter_design_cannot_fly(self):
        d = evaluate(STARTER)
        self.assertFalse(d.go)
        self.assertEqual(d.red, ["propulsion", "comms", "data"])

    def test_every_yellow_and_red_bar_says_why_and_where_to_fix(self):
        for design in random_designs(3000, seed=3):
            for bar in evaluate(design).bars:
                if bar.colour == "green":
                    self.assertEqual(bar.reason, "", (bar, design))
                else:
                    self.assertTrue(bar.reason, (bar, design))
                    self.assertIn(bar.fix_step, range(1, 7), (bar, design))

    def test_red_reasons_name_the_real_problem(self):
        self.assertIn("UHF", evaluate(preset("leo-habits")).bar("comms").reason)
        self.assertIn("solar array", evaluate(preset("electric-medium-array")).bar("propulsion").reason)
        self.assertIn("low-energy", evaluate(preset("lunah-map").with_(transfer="direct")).bar("propulsion").reason)
        self.assertIn("cannot brake", evaluate(preset("no-propulsion")).bar("propulsion").reason)

    def test_design_is_immutable(self):
        design = preset("flashlight")
        changed = design.with_(instruments=["neutron"])
        self.assertEqual(design.instruments, ("laser",))
        self.assertEqual(changed.instruments, ("neutron",))


class FlightEngine(unittest.TestCase):
    def test_clean_flight_of_the_flashlight_design_succeeds(self):
        flight = Flight(preset("flashlight"), events=False).run()
        report = assess(flight)
        self.assertEqual(report.level, "full")
        self.assertEqual((flight.launched_turn, flight.capture_turn, flight.turn), (8, 12, 24))
        self.assertTrue(all(report.met.values()))

    def test_same_seed_same_flight(self):
        a = Flight(preset("lunah-map"), random.Random(42)).run()
        b = Flight(preset("lunah-map"), random.Random(42)).run()
        self.assertEqual([e.text for e in a.log], [e.text for e in b.log])
        self.assertEqual(assess(a).score, assess(b).score)

    def test_stepping_equals_running(self):
        stepped = Flight(preset("flashlight"), random.Random(5))
        turns = 0
        while not stepped.finished:
            stepped.step()
            turns += 1
        ran = Flight(preset("flashlight"), random.Random(5)).run()
        self.assertEqual(turns, ran.turn)
        self.assertEqual(assess(stepped).score, assess(ran).score)
        self.assertEqual(stepped.step(), [])

    def test_no_go_design_never_flies(self):
        flight = Flight(STARTER).run()
        report = assess(flight)
        self.assertEqual((flight.turn, report.level, report.score), (0, "no-go", 0.0))
        self.assertEqual(len(report.requirements[0].causes), 3)

    def test_monte_carlo_matches_the_logic_map(self):
        """Section 9: Flashlight-like 84 / 13 / 2, no testing and no reserve 74 / 8 / 16."""
        for name, expected in (("flashlight", (84, 13, 2)), ("no-safety-net", (74, 8, 16))):
            rng = random.Random(7)
            levels = [assess(Flight(preset(name), rng).run()).level for _ in range(3000)]
            share = tuple(levels.count(level) * 100 // 3000 for level in ("full", "partial", "fail"))
            self.assertEqual(share, expected, name)

    def test_every_flight_ends_and_reports(self):
        for design in random_designs(3000, seed=11):
            if evaluate(design).go:
                flight = Flight(design, random.Random(1)).run()
                report = assess(flight)
                self.assertTrue(flight.finished)
                self.assertLessEqual(flight.turn, flight.brief["horizon"])
                self.assertTrue(0 <= report.score <= 100)
                for r in report.requirements:
                    self.assertEqual(bool(r.causes), not r.met, (r, design))


class Decisions(unittest.TestCase):
    def fly(self, design, dice, answer):
        asked = []

        def decide(decision):
            asked.append(decision.key)
            return answer if isinstance(answer, str) else answer[decision.key]
        return Flight(design, dice, decide=decide).run(), asked

    def test_build_delay_accepted_misses_the_ride(self):
        flight, asked = self.fly(preset("flashlight"), Dice(0.0), "wait")     # no slack in this design
        self.assertEqual(asked, ["build_delay"])
        self.assertEqual((flight.missed_rides, flight.launched_turn), (1, 14))

    def test_cutting_a_test_turn_holds_the_schedule_at_a_price(self):
        flight, _ = self.fly(preset("flashlight"), Dice(0.0), "cut_test")
        self.assertEqual((flight.missed_rides, flight.launched_turn), (0, 8))
        self.assertEqual((flight.test_turns, flight.test_factor), (1, 1.4))
        waited, _ = self.fly(preset("flashlight"), Dice(0.0), "wait")
        self.assertGreater(flight.money_left, waited.money_left)

    def test_lost_contact_can_be_recovered_from_the_reserve(self):
        quiet = [0.999] * 8                       # eight build turns with no delay
        flight, asked = self.fly(preset("flashlight"), Dice(*quiet, 0.0, 0.0), "recover")
        self.assertEqual(asked, ["no_signal"])
        self.assertTrue(flight.captured)
        self.assertAlmostEqual(flight.reserve, 2.0)

        flight, _ = self.fly(preset("flashlight"), Dice(*quiet, 0.0, 0.9), "recover")
        self.assertEqual(flight.end, "lost contact after deployment")

        flight, _ = self.fly(preset("flashlight"), Dice(*quiet, 0.0), "give_up")
        self.assertEqual((flight.end, flight.captured, assess(flight).level),
                         ("lost contact after deployment", False, "fail"))

    def test_no_reserve_means_no_rescue_and_no_question(self):
        quiet = [0.999] * 6                       # no test turns: the build takes six turns
        flight, asked = self.fly(preset("no-safety-net"), Dice(*quiet, 0.0), "recover")
        self.assertEqual((asked, flight.end), ([], "lost contact after deployment"))
        self.assertIn("no reserve", " ".join(assess(flight).requirements[0].causes))

    def test_weak_thruster(self):
        quiet = [0.999] * 9                       # build turns, then the deployment roll
        fixed, _ = self.fly(preset("flashlight"), Dice(*quiet, 0.0, 0.0), "fix")
        self.assertEqual((fixed.capture_turn, fixed.thruster_ok), (13, True))     # one turn late
        self.assertAlmostEqual(fixed.reserve, 1.5)

        accepted, _ = self.fly(preset("flashlight"), Dice(*quiet, 0.0), "accept")
        self.assertFalse(accepted.thruster_ok)
        self.assertTrue(accepted.captured)                                       # half of 227 m/s still covers 60

        electric, _ = self.fly(preset("lunah-map"), Dice(*quiet, 0.0), "accept")
        self.assertGreater(electric.capture_turn or 99, 8 + 10)                  # the transfer got longer


class CauseTracing(unittest.TestCase):
    def causes(self, name: str, key: str, seed: int = 1, events: bool = False) -> str:
        report = assess(Flight(preset(name), random.Random(seed), events=events).run())
        requirement = next(r for r in report.requirements if r.key == key)
        self.assertFalse(requirement.met, name)
        return " ".join(requirement.causes)

    def test_instrument_that_needs_sunlight(self):
        self.assertIn("cannot see into the shadowed", self.causes("icecube", "coverage"))

    def test_too_few_passes(self):
        self.assertIn("Too few passes", self.causes("neutron-halo", "coverage"))

    def test_camera_crowds_out_the_ice_data(self):
        text = self.causes("dsn-half-hour", "coverage")
        self.assertIn("never got home", text)
        self.assertIn("camera data crowded out the ice data", text)
        self.assertIn("Without precise pointing", text)

    def test_running_out_of_money_in_an_extended_mission(self):
        self.assertIn("extended mission ran", self.causes("dsn-half-hour", "budget"))

    def test_events_are_blamed_only_when_the_design_was_good_enough(self):
        hopeless = self.causes("neutron-halo", "coverage", seed=3, events=True)
        self.assertNotIn("Radiation", hopeless)
        for seed in range(200):
            report = assess(Flight(preset("flashlight"), random.Random(seed)).run())
            missed = next(r for r in report.requirements if r.key == "coverage")
            if report.captured and not missed.met and report.science_turns >= 12:
                self.assertRegex(" ".join(missed.causes), "Radiation|degraded|outage|eclipse|never got home")
                return
        self.fail("no flight missed coverage through bad luck")

    def test_outreach_pictures_are_not_science_data(self):
        text = self.causes("camera-tourist", "data")
        self.assertIn("do not count as science data", text)

    def test_wrong_altitude_in_a_retuned_catalogue(self):
        """The numbers are data: make the low circular orbit affordable and the lesson changes."""
        import copy
        from lunar_ice_mapper import CATALOGUE
        cat = copy.deepcopy(CATALOGUE)
        cat["orbits"]["circular"]["insertion_dv"]["electric_low_energy"] = 300
        cat["orbits"]["circular"]["passes_per_turn"] = 20
        design = preset("lunah-map").with_(orbit="circular")
        self.assertFalse(evaluate(design).go)                   # out of reach with the real numbers
        self.assertTrue(evaluate(design, cat=cat).go)
        report = assess(Flight(design, cat=cat, events=False).run())
        coverage = next(r for r in report.requirements if r.key == "coverage")
        self.assertFalse(coverage.met)
        self.assertIn("Too high: the neutron spectrometer works up to 25 km", " ".join(coverage.causes))

    def test_a_delay_with_slack_does_not_stop_the_game(self):
        asked = []
        design = preset("flashlight").with_(test_turns=1)       # one turn of slack
        flight = Flight(design, Dice(0.0), decide=lambda decision: asked.append(decision.key) or "wait").run()
        self.assertEqual((asked, flight.counts["build_delay"], flight.launched_turn), ([], 1, 8))

    def test_score_adds_up(self):
        report = assess(Flight(preset("flashlight"), events=False).run())
        self.assertAlmostEqual(sum(report.score_parts.values()), report.score, places=1)
        self.assertEqual(report.score_parts["coverage"], 40)


if __name__ == "__main__":
    unittest.main()
