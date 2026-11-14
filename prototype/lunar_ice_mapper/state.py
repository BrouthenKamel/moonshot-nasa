"""A1: mission state. The contract between the four segments.

Design    the 15 decisions the player makes in steps 1 to 6
Derived   every value the budget calculator works out from a design
Science   coverage and data bookkeeping while in the science orbit

The flight itself (turn, phase, money, log) lives on simulation.Flight,
which holds a Design and its Derived values.
"""
from __future__ import annotations

from dataclasses import dataclass, field, replace
from typing import Dict, List, Optional, Tuple


@dataclass(frozen=True)
class Design:
    # Step 1: mission planning
    test_turns: int = 2
    reserve_share: float = 0.10
    # Step 2: instruments
    instruments: Tuple[str, ...] = ("laser",)
    # Step 3: spacecraft
    solar_array: str = "medium"
    battery: str = "large"
    propulsion: str = "chemical"
    propellant_kg: float = 2.0
    radio: str = "xband"
    antenna: str = "patch"
    computer: str = "basic"
    pointing: str = "precise"
    # Step 4: orbit
    orbit: str = "halo"
    # Step 5: ride and transfer
    transfer: str = "low_energy"
    # Step 6: comms
    ground_station: str = "partner21"
    contact_hours: float = 1.0

    def with_(self, **changes) -> "Design":
        if "instruments" in changes:
            changes["instruments"] = tuple(changes["instruments"])
        return replace(self, **changes)


@dataclass
class Bar:
    """One Go / No-Go bar (step 7)."""
    key: str
    label: str
    colour: str               # 'green', 'yellow' or 'red'
    value: str                # the numbers behind the colour
    reason: str = ""          # plain words, filled for yellow and red
    fix_step: Optional[int] = None


@dataclass
class Derived:
    # Step 3 roll-ups
    propellant_kg: float
    dry_mass: float
    wet_mass: float
    volume: float
    parts_cost: float
    build_effort: float
    array_power: float
    bus_power: float
    instrument_power: float
    transmit_extra_power: float
    storage_mb: float
    # Step 1: schedule and money pots
    build_turns: int
    ready_turn: int
    slack: int
    test_factor: float
    reserve: float
    spendable: float
    # Step 5: delta-v and transfer
    dv_available: float
    dv_insert: Optional[float]
    thrust_power: float
    thrust_level: float
    transfer_turns: Optional[int]
    upkeep_dv_per_turn: float
    dv_after_insert: float
    upkeep_turns: int
    # Step 6: link
    link_kbps: float
    contact_hours: float
    ground_cost_per_turn: float
    transmit_share: float
    downlink_per_turn: float
    # Steps 2 + 4: science
    science_duty: float
    power_margin: float
    battery_usable_wh: float
    battery_need_wh: float
    battery_ok: bool
    battery_long_ok: bool
    quality: Dict[str, float]
    coverage_rate: Dict[str, float]
    data_per_turn: float
    # Step 7: money and the clean 12-turn projection
    launch_turn: Optional[int]
    ops_cost_per_turn: float
    transfer_cost_per_turn: float
    cost_prelaunch: float
    total_cost: float
    projected_coverage: float = 0.0
    projected_data: float = 0.0
    projected_context: float = 0.0
    projected_outreach: float = 0.0
    projected_lost: float = 0.0
    bars: List[Bar] = field(default_factory=list)

    @property
    def go(self) -> bool:
        return all(b.colour != "red" for b in self.bars)

    @property
    def checks(self) -> Dict[str, str]:
        return {b.key: b.colour for b in self.bars}

    def bar(self, key: str) -> Bar:
        return next(b for b in self.bars if b.key == key)

    @property
    def red(self) -> List[str]:
        return [b.key for b in self.bars if b.colour == "red"]


@dataclass
class Science:
    """Per instrument: ground observed, observed but still waiting on board, and mapped (data home)."""
    observed: Dict[str, float]
    waiting: Dict[str, float]
    mapped: Dict[str, float]
    stored_by: Dict[str, float]
    returned: Dict[str, float]
    stored: float = 0.0
    lost: float = 0.0

    @classmethod
    def new(cls, instruments) -> "Science":
        def zero():
            return {name: 0.0 for name in instruments}
        return cls(observed=zero(), waiting=zero(), mapped=zero(), stored_by=zero(), returned=zero())
