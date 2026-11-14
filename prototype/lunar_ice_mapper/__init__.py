"""Lunar Ice Mapper: the single-mission core loop as a terminal game.

    from lunar_ice_mapper import Design, evaluate, Flight, assess

    design = Design(instruments=("laser",), orbit="halo")
    derived = evaluate(design)              # steps 1 to 7: meters and Go / No-Go bars
    flight = Flight(design).run()           # step 8: the flight, turn by turn
    report = assess(flight)                 # step 9: requirements, causes, score
"""
from .calculator import evaluate, insertion_delta_v
from .catalogue import BRIEF, CATALOGUE
from .evaluation import Report, assess, comparison
from .presets import PRESETS, STARTER
from .simulation import Decision, Flight, auto_decide
from .state import Bar, Derived, Design, Science

__all__ = ["BRIEF", "CATALOGUE", "PRESETS", "STARTER", "Bar", "Decision", "Derived", "Design", "Flight",
           "Report", "Science", "assess", "auto_decide", "comparison", "evaluate", "insertion_delta_v"]
