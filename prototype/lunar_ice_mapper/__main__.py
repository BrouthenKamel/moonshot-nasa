"""Command line: python3 -m lunar_ice_mapper [play | presets | check] [options]"""
from __future__ import annotations

import argparse
import sys

from . import verify
from .calculator import evaluate
from .game import Game
from .presets import PRESETS
from .terminal import Quit, Terminal


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(
        prog="lunar_ice_mapper",
        description="Lunar Ice Mapper: design a 6U CubeSat, fly it to the Moon, see why it worked or failed.")
    parser.add_argument("command", nargs="?", default="play", choices=["play", "presets", "check"],
                        help="play the game (default), list the ready-made designs, or check the model")
    parser.add_argument("--preset", metavar="NAME", help="start from a ready-made design (see: presets)")
    parser.add_argument("--auto", action="store_true",
                        help="no questions: check the design, fly it on standing orders, print the report")
    parser.add_argument("--seed", type=int, help="dice seed, to fly the same luck again")
    parser.add_argument("--no-events", action="store_true", help="fly with no random events")
    parser.add_argument("--no-color", action="store_true", help="plain text, no colours")
    parser.add_argument("--delay", type=float, default=None, metavar="SECONDS",
                        help="pause after each turn of the flight (default 0.15 when played by hand)")
    parser.add_argument("--runs", type=int, default=1000, help="check: simulated missions per design (default 1000)")
    parser.add_argument("--sweep", action="store_true", help="check: also test every design in the design space")
    args = parser.parse_args(argv)

    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except (AttributeError, ValueError):
            pass

    if args.command == "check":
        return 0 if verify.run(runs=args.runs, with_sweep=args.sweep) else 1

    if args.command == "presets":
        for key, preset in PRESETS.items():
            verdict = "may fly" if evaluate(preset.design).go else "No-Go"
            print(f"  {key:24s}{verdict:9s}{preset.label}")
        return 0

    if args.preset and args.preset not in PRESETS:
        parser.error(f"unknown preset '{args.preset}'. Run: python3 -m lunar_ice_mapper presets")
    design = PRESETS[args.preset or "starter"].design
    interactive = sys.stdin.isatty() and sys.stdout.isatty()
    delay = args.delay if args.delay is not None else (0.15 if interactive and not args.auto else 0.0)
    term = Terminal(colour=False if args.no_color else None, interactive=interactive)
    game = Game(term, design, seed=args.seed, events=not args.no_events, auto=args.auto, delay=delay)
    try:
        game.play()
    except Quit:
        term.say()
        term.say("  Mission control signing off.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
