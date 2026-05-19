"""Tests for the structured device-record builder and parser.

Covers the canonical family-0x07 body shape for both hub firmware
variants (X1 narrow slots, X1S/X2 wide slots), plus a round-trip
sanity check intended to underpin local backup/restore.
"""

from __future__ import annotations

import sys
import types
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def _ensure_stub_package(name: str, path: Path) -> None:
    if name in sys.modules:
        return
    module = types.ModuleType(name)
    module.__path__ = [str(path)]  # type: ignore[attr-defined]
    sys.modules[name] = module


_ensure_stub_package(
    "custom_components",
    ROOT / "custom_components",
)
_ensure_stub_package(
    "custom_components.sofabaton_x1s",
    ROOT / "custom_components" / "sofabaton_x1s",
)
_ensure_stub_package(
    "custom_components.sofabaton_x1s.lib",
    ROOT / "custom_components" / "sofabaton_x1s" / "lib",
)


from custom_components.sofabaton_x1s.const import (
    HUB_VERSION_X1,
    HUB_VERSION_X1S,
    HUB_VERSION_X2,
)
from custom_components.sofabaton_x1s.lib.devices import (
    DEVICE_BODY_LEN_X1,
    DEVICE_BODY_LEN_X1S_X2,
    DeviceConfig,
    build_device_create_payload,
    parse_device_record,
)


# ---------------------------------------------------------------------------
# X1 (narrow slot) builder behaviour
# ---------------------------------------------------------------------------


def test_x1_payload_has_canonical_body_length_and_self_consistent_checksum() -> None:
    config = DeviceConfig(
        name="Living Room TV",
        brand="Samsung",
        device_id=0x0C,
        icon=2,
        code_type=0x0D,
        device_type=0x10,
        ip_address=None,
        poll_time=-1,
        input_mode=2,
        power_mode=1,
        power_style=2,
        share_mode=0,
        tail_marker=1,
    )
    payload = build_device_create_payload(config, hub_version=HUB_VERSION_X1)

    body = payload[3:]
    assert len(body) == DEVICE_BODY_LEN_X1 == 120
    assert body[0] == 0x01
    assert body[1:3] == b"\x00\x01"  # single-page record
    assert body[4] == 0x0C  # device_id
    assert body[5] == 0x02  # icon
    assert body[7] == 0x0D  # code_type
    assert body[8] == 0x10  # device_type
    assert body[28] == 0x00  # power_state default
    # ASCII name slot
    assert body[29:29 + 14] == b"Living Room TV"
    assert body[29 + 14 : 29 + 30] == b"\x00" * 16
    # ASCII brand slot
    assert body[59:59 + 7] == b"Samsung"
    assert body[59 + 7 : 59 + 30] == b"\x00" * 23
    # Self-consistent inner-body checksum
    assert body[-1] == sum(body[:-1]) & 0xFF


def test_x1_payload_writes_ip_marker_when_address_supplied() -> None:
    config = DeviceConfig(
        name="Roku",
        brand="Roku",
        device_id=0x05,
        ip_address="192.168.2.77",
        poll_time=0,
    )
    payload = build_device_create_payload(config, hub_version=HUB_VERSION_X1)
    body = payload[3:]
    tail = body[89 : 89 + 30]
    # tail[0..5] = [0xFC, 0x55, ip bytes]
    assert tail[0] == 0xFC
    assert tail[1] == 0x55
    assert tail[2:6] == bytes([192, 168, 2, 77])
    # tail[6..8] = [0xFC, time_hi, time_lo] when poll_time >= 0
    assert tail[6] == 0xFC
    assert tail[7:9] == b"\x00\x00"


def test_x1_payload_omits_ip_marker_when_address_missing() -> None:
    config = DeviceConfig(name="IR TV", brand="Samsung", device_id=0x03)
    payload = build_device_create_payload(config, hub_version=HUB_VERSION_X1)
    body = payload[3:]
    tail = body[89 : 89 + 30]
    assert tail[0] == 0x00  # no IP marker
    assert tail[2:6] == b"\x00\x00\x00\x00"  # no IP bytes


# ---------------------------------------------------------------------------
# X1S / X2 (wide slot) builder behaviour
# ---------------------------------------------------------------------------


import pytest


@pytest.mark.parametrize("hub_version", [HUB_VERSION_X1S, HUB_VERSION_X2])
def test_x1s_x2_payload_uses_utf16be_name_and_brand(hub_version: str) -> None:
    config = DeviceConfig(
        name="Living Room TV",
        brand="Samsung",
        device_id=0x0C,
        ip_address="10.0.0.7",
        poll_time=0,
        input_mode=2,
        power_style=2,
        tail_marker=0,
    )
    payload = build_device_create_payload(config, hub_version=hub_version)

    body = payload[3:]
    assert len(body) == DEVICE_BODY_LEN_X1S_X2 == 210
    # 60-byte name slot starts at body[29]; "Living Room TV" UTF-16BE
    assert body[29:29 + 28] == "Living Room TV".encode("utf-16-be")
    assert body[29 + 28 : 29 + 60] == b"\x00" * 32
    # 60-byte brand slot starts at body[89]
    assert body[89:89 + 14] == "Samsung".encode("utf-16-be")
    # Self-consistent checksum
    assert body[-1] == sum(body[:-1]) & 0xFF


def test_x1s_x2_payload_tail_carries_mode_bytes() -> None:
    config = DeviceConfig(
        name="x",
        brand="y",
        device_id=0x09,
        ip_address=None,
        poll_time=-1,
        input_mode=2,
        power_mode=3,
        power_style=4,
        share_mode=5,
        tail_marker=6,
    )
    payload = build_device_create_payload(config, hub_version=HUB_VERSION_X1S)
    body = payload[3:]
    tail = body[149 : 149 + 60]
    assert tail[9] == 0xFC
    assert tail[10] == 2  # input_mode
    assert tail[11] == 3  # power_mode
    assert tail[12] == 4  # power_style
    assert tail[13] == 5  # share_mode
    assert tail[14] == 0xFC
    assert tail[16] == 0xFC
    assert tail[17] == 6  # tail_marker


def test_unknown_hub_version_raises() -> None:
    with pytest.raises(ValueError):
        build_device_create_payload(DeviceConfig(name="x", brand="y"), hub_version="bogus")


# ---------------------------------------------------------------------------
# Parser
# ---------------------------------------------------------------------------


def test_parse_recovers_basic_fields_from_x1_body() -> None:
    config = DeviceConfig(
        name="Test Device",
        brand="Brand",
        device_id=0x07,
        icon=3,
        code_type=0x0D,
        device_type=0x10,
        ip_address="192.168.1.100",
        poll_time=5,
        input_mode=2,
        power_mode=1,
        power_style=2,
        share_mode=0,
        tail_marker=1,
    )
    payload = build_device_create_payload(config, hub_version=HUB_VERSION_X1)
    parsed = parse_device_record(payload[3:], hub_version=HUB_VERSION_X1)

    assert parsed.name == "Test Device"
    assert parsed.brand == "Brand"
    assert parsed.device_id == 0x07
    assert parsed.icon == 3
    assert parsed.code_type == 0x0D
    assert parsed.ip_address == "192.168.1.100"
    assert parsed.poll_time == 5
    assert parsed.input_mode == 2
    assert parsed.power_mode == 1
    assert parsed.power_style == 2
    assert parsed.tail_marker == 1


def test_parse_omits_ip_when_address_missing_in_body() -> None:
    config = DeviceConfig(name="x", brand="y", device_id=0x05, ip_address=None)
    payload = build_device_create_payload(config, hub_version=HUB_VERSION_X1)
    parsed = parse_device_record(payload[3:], hub_version=HUB_VERSION_X1)
    assert parsed.ip_address is None


def test_build_parse_round_trip_x1() -> None:
    """Round-trip a fully-populated X1 record to lock in faithfulness."""

    original = DeviceConfig(
        name="LR Sony",
        brand="Sony",
        device_id=0x12,
        icon=5,
        sort=2,
        code_type=0x0D,
        device_type=0x10,
        code_id=bytes.fromhex("0102030405060708090a0b0c0d0e0f10"),
        hide=0,
        input_flag=1,
        channel=3,
        power_state=1,
        ip_address="10.0.0.42",
        poll_time=123,
        input_mode=2,
        power_mode=1,
        power_style=2,
        share_mode=0,
        tail_marker=1,
    )
    payload = build_device_create_payload(original, hub_version=HUB_VERSION_X1)
    parsed = parse_device_record(payload[3:], hub_version=HUB_VERSION_X1)
    # The parser preserves every field the builder writes.
    for field in (
        "name", "brand", "device_id", "icon", "sort", "code_type",
        "device_type", "code_id", "hide", "input_flag", "channel",
        "power_state", "ip_address", "poll_time", "input_mode",
        "power_mode", "power_style", "share_mode", "tail_marker",
    ):
        assert getattr(parsed, field) == getattr(original, field), field


def test_build_parse_round_trip_x1s_with_extras() -> None:
    """X1S round-trip including the optional extras_present marker."""

    original = DeviceConfig(
        name="Audio TV",
        brand="Vendor",
        device_id=0x0E,
        icon=4,
        code_type=0x1C,
        ip_address="10.0.0.99",
        poll_time=512,
        input_mode=2,
        power_mode=0,
        power_style=2,
        tail_marker=1,
        extras_present=True,
        extra_a=0x11,
        extra_b=0x22,
        extra_c=0x33,
    )
    payload = build_device_create_payload(original, hub_version=HUB_VERSION_X1S)
    parsed = parse_device_record(payload[3:], hub_version=HUB_VERSION_X1S)
    assert parsed.extras_present is True
    assert (parsed.extra_a, parsed.extra_b, parsed.extra_c) == (0x11, 0x22, 0x33)
    # Rebuilding from the parsed config produces the same bytes
    rebuilt = build_device_create_payload(parsed, hub_version=HUB_VERSION_X1S)
    assert rebuilt == payload


def test_parser_rejects_body_with_wrong_length() -> None:
    short_body = b"\x01" * (DEVICE_BODY_LEN_X1 - 1)
    with pytest.raises(ValueError):
        parse_device_record(short_body, hub_version=HUB_VERSION_X1)
