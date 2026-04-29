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


def test_tools_card_keeps_action_hint_copy_visible() -> None:
    source = Path("custom_components/sofabaton_x1s/www/tools-card.js").read_text(
        encoding="utf-8",
    )

    assert 'node.querySelectorAll(".dropdown")' in source
    assert (
        'node.querySelectorAll("ha-selector-select, ha-control-select, ha-formfield")'
        not in source
    )
