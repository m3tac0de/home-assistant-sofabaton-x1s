"""Tests for the per-variant wire schema dispatcher.

These tests pin the contract of :mod:`wire_schema` -- the single
source of truth for per-hub-version numeric constants and layout
tags. Drift between the schema and the per-module legacy literals
should be caught by the module-load asserts in ``devices.py``,
``commands.py`` and ``macros.py``; these tests catch contract drift
visible to callers.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest
from tests._stub_packages import ensure_stub_package

ROOT = Path(__file__).resolve().parents[2]
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
    classify_hub_version,
)
from custom_components.sofabaton_x1s.lib.devices import _slot_widths_for
from custom_components.sofabaton_x1s.lib.wire_schema import (
    InputEntryLayout,
    SCHEMAS,
    WireSchema,
    schema_for,
)


def test_schema_for_known_versions_returns_populated_record() -> None:
    for hub_version in (HUB_VERSION_X1, HUB_VERSION_X1S, HUB_VERSION_X2):
        schema = schema_for(hub_version)
        assert isinstance(schema, WireSchema)
        assert schema.device_slot_width > 0
        assert schema.device_body_len > 0
        assert schema.command_stride > 0
        assert schema.macro_label_slot_len > 0
        assert schema.input_entry_stride > 0


def test_schema_for_x1_carries_narrow_ascii_layout() -> None:
    schema = schema_for(HUB_VERSION_X1)
    assert schema.device_slot_width == 30
    assert schema.device_body_len == 120
    assert schema.device_label_encoding == "ascii"
    assert schema.command_stride == 40
    assert schema.command_label_slot_len == 30
    assert schema.command_label_encoding == "ascii"
    assert schema.macro_label_slot_len == 30
    assert schema.macro_label_encoding == "ascii"
    assert schema.input_entry_stride == 27
    assert schema.input_entry_layout is InputEntryLayout.NARROW_ASCII


@pytest.mark.parametrize("hub_version", [HUB_VERSION_X1S, HUB_VERSION_X2])
def test_schema_for_wide_lines_carry_utf16be_layout(hub_version: str) -> None:
    schema = schema_for(hub_version)
    assert schema.device_slot_width == 60
    assert schema.device_body_len == 210
    assert schema.device_label_encoding == "utf-16-be"
    assert schema.command_stride == 70
    assert schema.command_label_slot_len == 60
    assert schema.command_label_encoding == "utf-16-be"
    assert schema.macro_label_slot_len == 60
    assert schema.macro_label_encoding == "utf-16-be"
    assert schema.input_entry_stride == 48
    assert schema.input_entry_layout is InputEntryLayout.WIDE_UTF16BE


def test_schema_for_unknown_version_raises() -> None:
    with pytest.raises(ValueError, match="unknown hub_version"):
        schema_for("X3")


def test_schemas_table_only_contains_known_versions() -> None:
    assert set(SCHEMAS) == {HUB_VERSION_X1, HUB_VERSION_X1S, HUB_VERSION_X2}


def test_devices_slot_widths_for_routes_through_schema() -> None:
    # The legacy ``_slot_widths_for`` helper exists for call-site
    # stability but is now a thin wrapper over the shared schema --
    # the values it returns must agree exactly with ``schema_for``.
    for hub_version in (HUB_VERSION_X1, HUB_VERSION_X1S, HUB_VERSION_X2):
        slot_width, body_len, encoding = _slot_widths_for(hub_version)
        schema = schema_for(hub_version)
        assert slot_width == schema.device_slot_width
        assert body_len == schema.device_body_len
        assert encoding == schema.device_label_encoding


def test_devices_slot_widths_for_unknown_version_raises() -> None:
    with pytest.raises(ValueError, match="unknown hub_version"):
        _slot_widths_for("X3")


def test_payload_sniffer_and_heuristic_selector_are_removed() -> None:
    # Phase 1 deleted the content-sniffing fallback path that used to
    # decide the inputs parser when ``hub_version`` was unknown. These
    # names should no longer exist on the proxy module.
    from custom_components.sofabaton_x1s.lib import x1_proxy

    assert not hasattr(x1_proxy.X1Proxy, "_payloads_look_like_x1s_activity_inputs")
    assert not hasattr(x1_proxy.X1Proxy, "_select_x1s_inputs_parser")


def test_classify_hub_version_raises_on_unknown_hver() -> None:
    with pytest.raises(ValueError, match="unknown HVER"):
        classify_hub_version({"HVER": "9"})


def test_classify_hub_version_raises_when_hver_missing() -> None:
    with pytest.raises(ValueError, match="missing HVER"):
        classify_hub_version({"MAC": "AA:BB:CC:DD:EE:FF"})


@pytest.mark.parametrize(
    ("hver", "expected"),
    [
        ("1", HUB_VERSION_X1),
        ("2", HUB_VERSION_X1S),
        ("3", HUB_VERSION_X2),
    ],
)
def test_classify_hub_version_known_hver_round_trip(hver: str, expected: str) -> None:
    assert classify_hub_version({"HVER": hver}) == expected


def test_default_hub_version_constant_removed() -> None:
    # The implicit X1 fallback is gone; importing it should fail loudly
    # so call sites cannot quietly re-add a default.
    from custom_components.sofabaton_x1s import const

    assert not hasattr(const, "DEFAULT_HUB_VERSION")


def test_the_pager_produces_exactly_the_pages_a_body_declares() -> None:
    """CR-L2-7: builders write total_pages from paged_write_total_pages and
    both pagers split with page_family_body; one chunk size for all."""
    from custom_components.sofabaton_x1s.lib.wire_schema import (
        PAGED_WRITE_BODY_CHUNK,
        page_family_body,
        paged_write_total_pages,
    )

    for size in (0, 1, PAGED_WRITE_BODY_CHUNK - 1, PAGED_WRITE_BODY_CHUNK, PAGED_WRITE_BODY_CHUNK + 1, 3 * PAGED_WRITE_BODY_CHUNK + 5):
        body = bytes(range(256)) * (size // 256 + 1)
        body = body[:size]
        pages = page_family_body(body)
        assert len(pages) == paged_write_total_pages(size)
        assert [p[:3] for p in pages] == [bytes([0x01]) + n.to_bytes(2, "big") for n in range(1, len(pages) + 1)]
        assert b"".join(p[3:] for p in pages) == body
        assert all(len(p) - 3 <= PAGED_WRITE_BODY_CHUNK for p in pages)
