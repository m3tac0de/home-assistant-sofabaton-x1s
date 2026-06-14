import os
import shutil
import subprocess
from pathlib import Path


def test_tools_card_frontend_behavior_suite() -> None:
    repo = Path(__file__).resolve().parents[1]
    npm = shutil.which("npm.cmd" if os.name == "nt" else "npm")
    assert npm is not None, "npm executable not found"
    result = subprocess.run(
        [npm, "run", "test:frontend"],
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


def test_tools_card_blobs_tab_uses_live_state_refresh() -> None:
    source = Path("custom_components/sofabaton_x1s/www/tools-card.js").read_text(
        encoding="utf-8",
    )

    assert ".refreshControlPanelState=" in source
    assert "this._store.loadControlPanelState()" in source


def test_tools_card_blobs_tab_omits_save_result_renderer() -> None:
    source = Path("custom_components/sofabaton_x1s/www/tools-card.js").read_text(
        encoding="utf-8",
    )

    assert "_renderSaveResult()" not in source
    assert "Save Result" not in source


def test_tools_card_empty_dock_branch_renders_no_placeholder_status_node() -> None:
    source = Path("custom_components/sofabaton_x1s/www/tools-card.js").read_text(
        encoding="utf-8",
    )

    assert 'class="card-bottom-dock-empty"' not in source
    assert ": A}" in source
