"""Terminal input and output: colours, meters, tables, prompts.

Reading and writing go through two callables, so tests can script a whole
game without a real terminal.
"""
from __future__ import annotations

import os
import re
import sys
from typing import Callable, Optional, Sequence

_ANSI = re.compile(r"\x1b\[[0-9;]*m")

STYLES = {
    "bold": "1", "dim": "2",
    "red": "31", "green": "32", "yellow": "33",
    # The four role colours of the board, plus shared.
    "ground": "94", "science": "92", "space": "95", "launch": "38;5;208", "shared": "93",
}


class Quit(Exception):
    """The player asked to leave, or the input ended."""


def visible_len(text: str) -> int:
    return len(_ANSI.sub("", text))


class Terminal:
    def __init__(self, read: Optional[Callable[[str], str]] = None, write: Optional[Callable[[str], None]] = None,
                 colour: Optional[bool] = None, interactive: bool = True):
        self.read = read or input
        self.write = write or print
        self.interactive = interactive
        if colour is None:
            colour = sys.stdout.isatty() and "NO_COLOR" not in os.environ and os.environ.get("TERM") != "dumb"
        self.colour = colour
        if colour and os.name == "nt":
            os.system("")       # switches on ANSI colours in the Windows console

    # ------------------------------------------------------------------ output
    def say(self, text: str = "") -> None:
        self.write(text)

    def paint(self, text: str, *styles: str) -> str:
        if not self.colour or not styles:
            return text
        return "".join(f"\x1b[{STYLES[s]}m" for s in styles) + text + "\x1b[0m"

    def rule(self, title: str = "") -> None:
        line = f"── {title} " if title else ""
        self.say(self.paint(line + "─" * max(0, 78 - len(line)), "dim"))

    def meter(self, share: float, colour: str = "green", width: int = 10) -> str:
        filled = max(0, min(width, round(share * width)))
        return self.paint("█" * filled, colour) + self.paint("░" * (width - filled), "dim")

    def light(self, colour: str) -> str:
        return self.paint(f"● {colour.upper():<6}", colour)

    def table(self, headers: Sequence[str], rows: Sequence[Sequence[str]],
              notes: Optional[Sequence[str]] = None, indent: int = 2) -> None:
        """Left-aligned columns. notes[i], when given, is a list of lines printed under row i."""
        widths = [max(visible_len(str(row[i])) for row in [headers, *rows]) for i in range(len(headers))]

        def line(cells) -> str:
            padded = [str(cell) + " " * (width - visible_len(str(cell))) for cell, width in zip(cells, widths)]
            return " " * indent + "  ".join(padded).rstrip()

        self.say(self.paint(line(headers), "dim"))
        for i, row in enumerate(rows):
            self.say(line(row))
            for note in (notes[i] if notes else []):
                self.say(" " * (indent + widths[0] + 2) + note)

    # ------------------------------------------------------------------ input
    def ask(self, prompt: str) -> str:
        """One line from the player, lower-cased. 'q' or the end of the input leaves the game."""
        try:
            answer = self.read(self.paint(prompt, "bold") + " ")
        except (EOFError, KeyboardInterrupt, StopIteration):
            raise Quit()
        answer = answer.strip().lower()
        if answer in ("q", "quit", "exit"):
            raise Quit()
        return answer

    def pick(self, prompt: str, count: int, default: Optional[int] = None, keys: str = "") -> object:
        """A number from 1 to count, or one of the letters in keys. Enter gives the default."""
        while True:
            answer = self.ask(prompt)
            if answer == "" and default is not None:
                return default
            if len(answer) == 1 and answer in keys:
                return answer
            if answer.isdigit() and 1 <= int(answer) <= count:
                return int(answer)
            self.say(self.paint(f"  Please type a number from 1 to {count}"
                                + (f", or one of: {', '.join(keys)}" if keys else "") + ".", "yellow"))

    def numbers(self, prompt: str, count: int, at_most: int, keys: str = "") -> object:
        """One to at_most different numbers from 1 to count, e.g. '1 4', or a letter in keys. Enter gives None."""
        while True:
            answer = self.ask(prompt)
            if answer == "":
                return None
            if len(answer) == 1 and answer in keys:
                return answer
            parts = answer.replace(",", " ").split()
            if (parts and all(p.isdigit() and 1 <= int(p) <= count for p in parts)
                    and len(set(parts)) == len(parts) <= at_most):
                return [int(p) for p in parts]
            self.say(self.paint(f"  Please type up to {at_most} different numbers from 1 to {count}, "
                                "for example: 1 4", "yellow"))

    def amount(self, prompt: str, low: float, high: float) -> Optional[float]:
        """A number between low and high. Enter gives None."""
        while True:
            answer = self.ask(prompt).replace(",", ".")
            if answer == "":
                return None
            try:
                value = float(answer)
            except ValueError:
                value = None
            if value is not None and low <= value <= high:
                return value
            self.say(self.paint(f"  Please type a number from {low:g} to {high:g}.", "yellow"))
