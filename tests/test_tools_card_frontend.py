import subprocess
from pathlib import Path


def test_tools_card_frontend_behavior_suite() -> None:
    repo = Path(__file__).resolve().parents[1]
    result = subprocess.run(
        ["npm.cmd", "run", "test:frontend"],
        cwd=repo,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stdout + "\n" + result.stderr
