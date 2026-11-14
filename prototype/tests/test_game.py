"""The terminal game, played by a script instead of a person."""
import unittest

from lunar_ice_mapper import PRESETS, STARTER
from lunar_ice_mapper.__main__ import main
from lunar_ice_mapper.game import Game
from lunar_ice_mapper.terminal import Quit, Terminal


class Player:
    """Types the scripted lines. After that: option 1 on event cards, and quits at any other prompt."""
    def __init__(self, *lines):
        self.lines = list(lines)
        self.prompts, self.screen = [], []

    def read(self, prompt: str) -> str:
        self.prompts.append(prompt)
        if self.lines:
            return self.lines.pop(0)
        if "└─" in prompt:
            return "1"
        raise EOFError

    def write(self, text: str = "") -> None:
        self.screen.append(text)

    @property
    def text(self) -> str:
        return "\n".join(self.screen)

    def play(self, design=STARTER, **options) -> Game:
        game = Game(Terminal(self.read, self.write, colour=False), design, **options)
        try:
            game.play()
        except Quit:
            pass
        return game


# From the starting design to the Flashlight-like one, through every screen.
BUILD_FLASHLIGHT = [
    "",                         # step 1: keep 2 test turns and 10% reserve
    "1", "",                    # step 2: laser
    "1", "2",                   # step 3: medium array
    "2", "2",                   #         large battery
    "3", "2", "4",              #         chemical propulsion, then 2 kg of propellant
    "5", "2",                   #         X-band radio
    "8", "2", "",               #         precise pointing
    "1", "",                    # step 4: halo loop
    "2", "",                    # step 5: low-energy transfer
    "1", "2", "2", "1", "",     # step 6: partner dish, 1 hour a day
]


class WholeGame(unittest.TestCase):
    def test_design_fly_report(self):
        player = Player(*BUILD_FLASHLIGHT, "g")
        game = player.play(seed=1, events=False)
        self.assertEqual(game.design, PRESETS["flashlight"].design)
        for expected in ("GO is possible", "Launched on the ride", "Capture burn done", "FULL SUCCESS",
                         "Next to the real missions", "Dice seed 1"):
            self.assertIn(expected, player.text)

    def test_with_events_the_game_always_reaches_a_report(self):
        for seed in range(40):
            player = Player(*BUILD_FLASHLIGHT, "g")
            player.play(seed=seed)
            self.assertIn("Step 9: Evaluation", player.text, f"seed {seed}")

    def test_no_go_sends_the_player_back_to_the_step_that_fixes_it(self):
        player = Player("c", "")        # jump to the check, then Enter
        player.play()
        self.assertIn("NO-GO", player.text)
        self.assertIn("Enter = redesign at step 3", player.prompts[1])
        self.assertIn("Step 3: Spacecraft configuration", player.screen[-30:].__str__())
        self.assertNotIn("g = GO", " ".join(player.prompts))

    def test_try_again_keeps_the_design(self):
        player = Player("c", "g", "")   # check, go, then Enter at the report
        game = player.play(PRESETS["flashlight"].design, seed=3, events=False)
        self.assertEqual(game.design, PRESETS["flashlight"].design)
        self.assertEqual(game.flights, 1)
        self.assertIn("Change 1 to 2", player.prompts[-1])     # back on step 1

    def test_stepping_back_and_bad_input(self):
        player = Player("", "b", "x", "9", "1", "4", "")
        game = player.play()
        self.assertEqual(game.design.test_turns, 3)
        self.assertEqual(player.text.count("Please type a number from 1 to 2"), 2)

    def test_two_instruments_at_most(self):
        player = Player("", "1 2 3", "1 1", "2, 4")
        game = player.play()
        self.assertEqual(game.design.instruments, ("neutron", "camera"))
        self.assertEqual(player.text.count("Please type up to 2 different numbers"), 2)

    def test_changing_engine_or_station_keeps_the_design_legal(self):
        player = Player("c", "3", "3", "3", "3")      # check, step 3, propulsion, electric, tank 3 of 3
        game = player.play(PRESETS["flashlight"].design)
        self.assertEqual((game.design.propulsion, game.design.propellant_kg), ("electric", 1.5))
        player = Player("c", "6", "1", "3")           # check, step 6, ground station, DSN (1 hour at most)
        game = player.play(PRESETS["tight-link"].design)
        self.assertEqual((game.design.ground_station, game.design.contact_hours), ("dsn34", 1.0))

    def test_ready_made_designs_can_be_loaded(self):
        player = Player("c", "p", "2")
        game = player.play()
        self.assertEqual(game.design, PRESETS["flashlight"].design)

    def test_event_cards_ask_the_player(self):
        for seed in range(60):
            player = Player("c", "g")
            player.play(PRESETS["flashlight"].design, seed=seed)
            if "EVENT, turn" in player.text:
                self.assertTrue(any("└─ Choose 1 to 2" in p for p in player.prompts))
                return
        self.fail("no event card in 60 flights")


class CommandLine(unittest.TestCase):
    def run_main(self, *argv) -> str:
        import contextlib
        import io
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            self.assertEqual(main(list(argv)), 0)
        return out.getvalue()

    def test_every_ready_made_design_runs_on_standing_orders(self):
        for name in PRESETS:
            text = self.run_main("--preset", name, "--auto", "--seed", "2", "--no-color")
            self.assertIn("Step 9: Evaluation", text, name)
            self.assertNotIn("\x1b[", text)

    def test_presets_listing(self):
        text = self.run_main("presets")
        self.assertIn("flashlight", text)
        self.assertIn("No-Go", text)


if __name__ == "__main__":
    unittest.main()
