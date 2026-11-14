"""Start the game from anywhere: python3 prototype/play.py [options]"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from lunar_ice_mapper.__main__ import main  # noqa: E402

if __name__ == "__main__":
    sys.exit(main())
