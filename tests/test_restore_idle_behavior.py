"""Tests for restore-side idle / automatic-power mode resolution.

The "Power On/Off Setup" + "Idle Behavior" choice lives in its own hub
query (OP_IDLE_BEHAVIOR, 0x0242), not the device record. Backups capture
it as ``idle_behavior``; restore replays it verbatim via
``SET_IDLE_BEHAVIOR``. ``_idle_behavior_mode`` is the resolver: it prefers
the dedicated field and falls back to ``power_mode`` for older backups.
"""

from __future__ import annotations

import sys
from pathlib import Path

from tests._stub_packages import ensure_stub_package

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

ensure_stub_package("custom_components", ROOT / "custom_components")
ensure_stub_package(
    "custom_components.sofabaton_x1s", ROOT / "custom_components" / "sofabaton_x1s"
)
ensure_stub_package(
    "custom_components.sofabaton_x1s.lib",
    ROOT / "custom_components" / "sofabaton_x1s" / "lib",
)

import conftest  # noqa: F401,E402

from custom_components.sofabaton_x1s.lib.proxy_restore import (  # noqa: E402
    _idle_behavior_mode,
)


def test_prefers_idle_behavior_field_over_power_mode() -> None:
    # idle_behavior=4 (disabled) must win over the unrelated power_mode tail
    # byte, which is a constant 1 on real captures regardless of state.
    block = {"idle_behavior": 4, "power_mode": 1}
    assert _idle_behavior_mode(block) == 4


def test_falls_back_to_power_mode_for_legacy_backups() -> None:
    # Older backups predate idle_behavior capture; preserve their behavior.
    assert _idle_behavior_mode({"power_mode": 1}) == 1
    assert _idle_behavior_mode({"power_mode": 3}) == 3


def test_missing_everything_defaults_to_zero() -> None:
    assert _idle_behavior_mode({}) == 0


def test_non_numeric_values_default_to_zero() -> None:
    assert _idle_behavior_mode({"idle_behavior": "nope"}) == 0


def test_masks_to_byte() -> None:
    assert _idle_behavior_mode({"idle_behavior": 0x104}) == 0x04
