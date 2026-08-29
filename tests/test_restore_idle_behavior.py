"""Tests for restore-side idle / automatic-power mode resolution.

The "Power On/Off Setup" + "Idle Behavior" choice lives in its own hub
query (OP_IDLE_BEHAVIOR, 0x0242), not the device record. Backups capture
it as ``idle_behavior``; restore replays it verbatim via
``SET_IDLE_BEHAVIOR``. ``_idle_behavior_mode`` is the resolver: only the
dedicated field counts, and ``None`` means "unknown, write nothing". The
bundle's ``power_mode`` field is the record-tail byte, a different value
that reads 1 on every real hub device, so the old fallback to it wrote
mode 1 over devices whose real idle byte was 0, 2, 3, or 4.
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


def test_reads_the_dedicated_idle_behavior_field() -> None:
    block = {"idle_behavior": 4, "power_mode": 1}
    assert _idle_behavior_mode(block) == 4


def test_power_mode_is_never_a_fallback() -> None:
    # The record-tail byte is not an idle spelling; a bundle without
    # idle_behavior has no usable value at all.
    assert _idle_behavior_mode({"power_mode": 1}) is None
    assert _idle_behavior_mode({"power_mode": 3}) is None


def test_missing_everything_is_unknown() -> None:
    assert _idle_behavior_mode({}) is None


def test_non_numeric_values_are_unknown() -> None:
    assert _idle_behavior_mode({"idle_behavior": "nope"}) is None


def test_zero_is_a_real_value_not_unknown() -> None:
    # Hubs report 0 on never-configured devices (observed on Wifi
    # devices); replaying it verbatim is hub truth, not a default.
    assert _idle_behavior_mode({"idle_behavior": 0}) == 0


def test_masks_to_byte() -> None:
    assert _idle_behavior_mode({"idle_behavior": 0x104}) == 0x04
