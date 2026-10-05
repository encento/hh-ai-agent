from __future__ import annotations

import subprocess
import sys
import time
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent
RESTART_EXIT_CODE = 75


def main() -> int:
    while True:
        process = subprocess.Popen([sys.executable, "main.py"], cwd=BASE_DIR)
        code = process.wait()
        if code != RESTART_EXIT_CODE:
            return code
        print("Settings changed. Restarting HH Job Agent...")
        time.sleep(0.8)


if __name__ == "__main__":
    raise SystemExit(main())
