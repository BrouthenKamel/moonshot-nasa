"""The package must give the same answers as reference/logic_check.py.

logic_check.py is the model that was checked against real missions. These
tests run both on the same designs and the same dice and compare everything.
"""
import importlib.util
import itertools
import math
import random
import unittest
from pathlib import Path

from lunar_ice_mapper import PRESETS, Design, Flight, assess, evaluate

_path = Path(__file__).resolve().parents[1] / "reference" / "logic_check.py"
_spec = importlib.util.spec_from_file_location("logic_check", _path)
ref = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ref)

TO_REF = {"xband": "iris", "radhard": "rad", "halo": "nrho", "elliptical": "ell", "circular": "circ",
          "low_energy": "low"}

# Derived field -> key in the reference's result dict.
FIELDS = {
    "dry_mass": "m_dry", "wet_mass": "m_wet", "volume": "volume", "parts_cost": "parts_cost",
    "build_effort": "effort", "array_power": "p_gen", "bus_power": "p_bus", "instrument_power": "p_instr",
    "transmit_extra_power": "p_txnet", "storage_mb": "storage", "build_turns": "build_turns",
    "ready_turn": "ready_turn", "slack": "slack", "test_factor": "test_factor", "reserve": "reserve",
    "spendable": "spendable", "dv_available": "dv_avail", "dv_insert": "dv_insert",
    "thrust_level": "thrust_level", "transfer_turns": "transfer_turns", "upkeep_dv_per_turn": "dv_sk_turn",
    "dv_after_insert": "dv_after_insert", "upkeep_turns": "sk_turns", "link_kbps": "link_kbps",
    "contact_hours": "contact_h", "ground_cost_per_turn": "ground_cost_turn", "transmit_share": "c_power",
    "downlink_per_turn": "downlink_cap", "science_duty": "sci_duty", "power_margin": "power_margin",
    "battery_need_wh": "batt_need", "battery_ok": "batt_ok", "battery_long_ok": "batt_long_ok",
    "coverage_rate": "rate", "data_per_turn": "data_turn", "launch_turn": "launch_turn",
    "ops_cost_per_turn": "ops_cost_turn", "cost_prelaunch": "cost_prelaunch",
    "transfer_cost_per_turn": "transfer_cost_turn", "total_cost": "cost_total",
    "projected_coverage": "proj_cov", "projected_data": "proj_data", "projected_context": "proj_context",
    "projected_outreach": "proj_outreach", "projected_lost": "proj_lost", "checks": "checks", "go": "go",
}


def to_ref(design: Design) -> dict:
    t = lambda v: TO_REF.get(v, v)
    return dict(test_turns=design.test_turns, reserve_frac=design.reserve_share,
                instruments=list(design.instruments), array=design.solar_array, battery=design.battery,
                prop=design.propulsion, prop_kg=design.propellant_kg, radio=t(design.radio),
                antenna=design.antenna, computer=t(design.computer), adcs=design.pointing, orbit=t(design.orbit),
                transfer=t(design.transfer), ground=design.ground_station, contact_h=design.contact_hours)


CHOICES = dict(
    test_turns=[0, 1, 2, 3], reserve_share=[0, 0.05, 0.10, 0.15, 0.20],
    instruments=[("laser",), ("neutron",), ("ir",), ("camera",), ("laser", "camera"), ("neutron", "ir"),
                 ("laser", "neutron"), ("ir", "camera")],
    solar_array=["small", "medium", "large"], battery=["small", "large"],
    propulsion=["none", "chemical", "electric"], propellant_kg=[0.5, 1.0, 1.5, 2.0, 3.0],
    radio=["uhf", "xband"], antenna=["patch", "dish"], computer=["basic", "radhard"],
    pointing=["basic", "precise"], orbit=["halo", "elliptical", "circular"], transfer=["direct", "low_energy"],
    ground_station=["own", "partner21", "dsn34"], contact_hours=[0.5, 1, 2, 6])


def random_designs(n: int, seed: int):
    rng = random.Random(seed)
    for _ in range(n):
        yield Design(**{key: rng.choice(options) for key, options in CHOICES.items()})


def same(a, b) -> bool:
    if isinstance(a, dict):
        return a.keys() == b.keys() and all(same(a[k], b[k]) for k in a)
    if isinstance(a, bool) or isinstance(b, bool) or a is None or b is None or isinstance(a, str):
        return a == b
    return math.isclose(a, b, rel_tol=1e-9, abs_tol=1e-9)


class DesignParity(unittest.TestCase):
    def check(self, design: Design):
        mine, theirs = evaluate(design), ref.evaluate(to_ref(design))
        for field, key in FIELDS.items():
            self.assertTrue(same(getattr(mine, field), theirs[key]),
                            f"{field}: {getattr(mine, field)!r} != reference {theirs[key]!r} for {design}")

    def test_presets(self):
        for preset in PRESETS.values():
            self.check(preset.design)

    def test_random_designs(self):
        for design in random_designs(4000, seed=20261114):
            self.check(design)

    def test_delta_v_table(self):
        from lunar_ice_mapper import insertion_delta_v
        for engine, transfer, orbit in itertools.product(("chemical", "electric"), ("direct", "low_energy"),
                                                         ("halo", "elliptical", "circular")):
            expected = ref.dv_insert(TO_REF.get(transfer, transfer), TO_REF[orbit], engine == "chemical")
            self.assertEqual(insertion_delta_v(engine, transfer, orbit), expected, (engine, transfer, orbit))


class FlightParity(unittest.TestCase):
    def compare(self, design: Design, seed: int, events: bool = True):
        flight = Flight(design, random.Random(seed), events=events).run()
        mine = assess(flight)
        theirs = ref.simulate(to_ref(design), random.Random(seed), events=events)
        if theirs["level"] == "no-go":
            self.assertEqual(mine.level, "no-go")
            return False
        # Deliberate difference: the reference counts a craft as captured when contact is lost on a
        # direct transfer. The package does not.
        if theirs["end"] == "lost contact after deployment" and design.transfer == "direct":
            self.assertFalse(mine.captured)
            return True
        where = f"seed {seed}, {design}"
        self.assertEqual(mine.level, theirs["level"], where)
        self.assertEqual(mine.end, theirs["end"], where)
        self.assertEqual(mine.turns, theirs["turns"], where)
        self.assertEqual(mine.science_turns, theirs["sci_turns"], where)
        self.assertEqual(mine.met, theirs["req"], where)
        self.assertAlmostEqual(mine.score, theirs["score"], places=6, msg=where)
        self.assertAlmostEqual(mine.coverage, theirs["cov"], delta=0.051, msg=where)
        self.assertAlmostEqual(mine.data, theirs["data"], delta=0.51, msg=where)
        self.assertAlmostEqual(mine.money_left, theirs["money_left"], delta=0.0051, msg=where)
        return True

    def test_presets_with_events(self):
        flown = 0
        for preset in PRESETS.values():
            for seed in range(300):
                flown += bool(self.compare(preset.design, seed))
        self.assertGreater(flown, 2000)

    def test_presets_without_events(self):
        for preset in PRESETS.values():
            self.compare(preset.design, 1, events=False)

    def test_random_designs_that_may_fly(self):
        flown = 0
        for design in random_designs(40000, seed=7):
            if evaluate(design).go:
                for seed in range(25):
                    flown += bool(self.compare(design, seed))
        self.assertGreater(flown, 2000)


if __name__ == "__main__":
    unittest.main()
