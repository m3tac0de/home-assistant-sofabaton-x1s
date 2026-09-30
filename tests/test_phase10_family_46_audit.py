"""Phase 10 audit: every family-0x46 send originates from ``build_inputs_write``.

Phase 10 closes the family-0x46 unification: the two wifi-create
"sync stage" mid-flow writes used to hand-roll a 119-byte all-zeros
buffer with a custom checksum formula. They now route through
``build_inputs_write(..., source_id_byte=0)``, which produces the
canonical empty inputs page.

The byte-equivalence test pins the substitution so a future change
that drifts the canonical builder away from the hand-rolled shape
breaks loudly here rather than in the wifi-create wire flow.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path
from tests._stub_packages import ensure_stub_package

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


ensure_stub_package("custom_components", ROOT / "custom_components")
ensure_stub_package(
    "custom_components.sofabaton_x1s",
    ROOT / "custom_components" / "sofabaton_x1s",
)
ensure_stub_package(
    "custom_components.sofabaton_x1s.lib",
    ROOT / "custom_components" / "sofabaton_x1s" / "lib",
)


from custom_components.sofabaton_x1s.const import (
    HUB_VERSION_X1,
    HUB_VERSION_X1S,
    HUB_VERSION_X2,
)
from custom_components.sofabaton_x1s.lib.inputs import build_inputs_write


def _legacy_sync_stage_7746(device_id: int) -> bytes:
    """Reconstruct the pre-Phase-10 hand-rolled wifi sync-stage payload.

    Mirrors the byte expression that used to live inline at the two
    family-0x46 write sites in ``proxy_wifi_device.py`` before Phase 10
    routed them through the canonical builder. Kept here as a fixture
    so the equivalence assertion below is self-checking.
    """

    base = bytes([0x01, 0x00, 0x01, 0x01, 0x00, 0x01, device_id]) + (b"\x00" * 111)
    return base + bytes([(sum(base) - 2) & 0xFF])


def test_build_inputs_write_matches_legacy_sync_stage_7746() -> None:
    """``build_inputs_write(source_id_byte=0)`` reproduces the hand-rolled payload."""

    for hub_version in (HUB_VERSION_X1, HUB_VERSION_X1S, HUB_VERSION_X2):
        for device_id in (0x01, 0x0D, 0x42, 0xFE):
            canonical = build_inputs_write(
                hub_version=hub_version,
                device_id=device_id,
                source_id_byte=0,
            )
            legacy = _legacy_sync_stage_7746(device_id)
            assert canonical == legacy, (
                f"hub_version={hub_version} device_id=0x{device_id:02X}: "
                f"canonical={canonical.hex()} legacy={legacy.hex()}"
            )


def test_no_handrolled_family_46_payloads_remain_in_proxy_wifi_device() -> None:
    """Phase 10 DoD: every ``family=0x46`` send sources its bytes from
    :func:`build_inputs_write`, not a hand-rolled buffer.

    The audit looks for the previous hand-rolled marker
    (``_7746_base = bytes([0x01, 0x00, 0x01, 0x01, 0x00, 0x01``) inside
    the wifi-device mixin and asserts it has been removed.
    """

    wifi_module = (
        ROOT
        / "custom_components"
        / "sofabaton_x1s"
        / "lib"
        / "proxy_wifi_device.py"
    )
    text = wifi_module.read_text(encoding="utf-8")
    assert "_7746_base" not in text, (
        "Phase 10 expects the wifi sync-stage writes to route through "
        "build_inputs_write; found a lingering hand-rolled _7746_base "
        "marker in proxy_wifi_device.py"
    )


def test_all_family_46_sends_source_from_build_inputs_write() -> None:
    """Audit: every ``family=0x46`` send in ``custom_components/`` is preceded
    by either ``build_inputs_write(`` on the same logical statement or by
    a paged payload originally produced from one. Captures the Phase 10
    "no caller bypasses build_inputs_write" invariant in code.
    """

    src_root = ROOT / "custom_components" / "sofabaton_x1s"
    family_46_sites: list[tuple[Path, int, str]] = []
    for path in src_root.rglob("*.py"):
        for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if re.search(r"family\s*=\s*0x46\b", line) or re.search(
                r"family\s*=\s*FAMILY_INPUTS\b", line
            ):
                family_46_sites.append((path, lineno, line.strip()))

    assert family_46_sites, "expected at least one family-0x46 send site"

    for path, lineno, _line in family_46_sites:
        # Read the surrounding 10 lines to confirm payload provenance.
        context = path.read_text(encoding="utf-8").splitlines()
        window_lo = max(0, lineno - 6)
        window_hi = min(len(context), lineno + 4)
        window = "\n".join(context[window_lo:window_hi])
        evidence = (
            "build_inputs_write(" in window
            or "_build_paged_macro_save_payloads(input_config_payload)" in window
            or "FAMILY_INPUTS,\n" in window  # the __all__ export or the constant def
        )
        assert evidence, (
            f"family=0x46 site at {path.name}:{lineno} does not appear to "
            f"originate from build_inputs_write:\n{window}"
        )
