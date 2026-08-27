"""Tests for the structured device-record builder and parser.

Covers the canonical family-0x07 body shape for both hub firmware
variants (X1 narrow slots, X1S/X2 wide slots), plus a round-trip
sanity check intended to underpin local backup/restore.
"""

from __future__ import annotations

import sys
import types
from pathlib import Path
from tests._stub_packages import ensure_stub_package

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


ensure_stub_package(
    "custom_components",
    ROOT / "custom_components",
)
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
        tail_flag=1,
        tail_marker=1,
    )
    payload = build_device_create_payload(original, hub_version=HUB_VERSION_X1)
    parsed = parse_device_record(payload[3:], hub_version=HUB_VERSION_X1)
    # The parser preserves every field the builder writes.
    for field in (
        "name", "brand", "device_id", "icon", "sort", "code_type",
        "device_type", "code_id", "hide", "input_flag", "channel",
        "power_state", "ip_address", "poll_time", "input_mode",
        "power_mode", "power_style", "share_mode", "tail_flag",
        "tail_marker",
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


def test_real_x1_capture_input_and_power_configuration_signals() -> None:
    """Lock in the empirical finding that tail[10] / tail[11] are the
    "inputs configured" and "power configured" signals on real X1 wire data.

    Captures: the same Denon AVR record at three configuration stages,
    differing only in tail[10..12].
    """

    # Fixed-tail suffix shared by all three frames (28 trailing bytes:
    # tail[2..29] + 1 checksum byte). Only tail[10..12] differ; we
    # interpolate them with format placeholders below.
    _PREFIX = (
        "a5 5a 7b 0b 07 00 01 0c 00 01 00 02 13 07 0d 07"
        " dc 5d 28 95 c1 92 4f 4c 9d 35 00 ed 33 45 7d 0e"
        " 00 00 00 00 44 65 6e 6f 6e 20 61 76 72 20 74 73"  # body bytes 29.. name "Denon avr tst"
        " 74 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00"
        " 00 00 44 65 6e 6f 6e 00 00 00 00 00 00 00 00 00"  # brand "Denon"
        " 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00"
        " 00 00 00 00 00 00 fc 00 00 fc"  # tail[0..9]: no IP, no poll, then 0xFC
    )
    _SUFFIX = (
        " 00 fc 01 fc 01 00 00 00 00 00"  # tail[13..22]
        " 00 00 00 00 00 00 00"           # tail[23..29]
        " 8c"                              # body[119] (internal body checksum, same across all 3 frames)
    )

    def _frame(in_mode: int, pwr_mode: int, pwr_style: int, checksum: int) -> bytes:
        modes = f" {in_mode:02x} {pwr_mode:02x} {pwr_style:02x}"  # tail[10..12]
        return bytes.fromhex(_PREFIX + modes + _SUFFIX + f" {checksum:02x}")

    none_raw = _frame(0x00, 0x00, 0x02, 0xBC)
    input_only_raw = _frame(0x01, 0x00, 0x02, 0xBD)
    full_raw = _frame(0x01, 0x01, 0x03, 0xBF)

    def _config(raw: bytes) -> DeviceConfig:
        body = raw[4:-1][3:]
        return parse_device_record(body, hub_version=HUB_VERSION_X1)

    none = _config(none_raw)
    input_only = _config(input_only_raw)
    full = _config(full_raw)

    # Inputs unconfigured -> tail[10] == 0; configured -> non-zero.
    assert none.input_mode == 0 and none.is_input_configured is False
    assert input_only.input_mode == 1 and input_only.is_input_configured is True
    assert full.input_mode == 1 and full.is_input_configured is True

    # Power unconfigured -> tail[11] == 0; configured -> non-zero.
    assert none.power_mode == 0 and none.is_power_configured is False
    assert input_only.power_mode == 0 and input_only.is_power_configured is False
    assert full.power_mode == 1 and full.is_power_configured is True

    # tail[12] (power_style) tracks power configuration: 2 unconfigured, 3 configured.
    assert none.power_style == 2
    assert input_only.power_style == 2
    assert full.power_style == 3

    # Every other field is identical across the three frames -- only the
    # three configuration bytes change.
    for fld in (
        "name", "brand", "device_id", "icon", "sort", "code_type",
        "device_type", "code_id", "hide", "input_flag", "channel",
        "power_state", "ip_address", "poll_time", "share_mode",
        "tail_flag", "tail_marker",
    ):
        assert getattr(none, fld) == getattr(input_only, fld) == getattr(full, fld), fld

    # The captured Denon frames carry the hub-set state flag at tail[15];
    # the parser must surface it (the builder used to zero it on rewrite).
    assert none.tail_flag == 1


def test_real_x2_capture_round_trips_to_write_form() -> None:
    """Round-trip a live-captured X2 record body (bench 2026-08-27).

    The hub-stored form differs from the write form in two hub-maintained
    spots: body[0] is restamped (0x09 stored vs the 0x01 every writer
    sends) and the trailing checksum byte is left at its write-time value
    when the hub later flips state bytes in storage (the captured record
    stores tail[15]=1 with a checksum that predates the flip). A faithful
    parse -> build cycle must therefore reproduce the stored record
    exactly, except body[0] normalized to 0x01 and the trailer recomputed
    over the actual content.
    """

    stored = bytes.fromhex(
        "0900010001080120100000000000000000000000000000000000000000004d00"
        "5100540054002000740065007300740020006400650076006900630065000000"
        "0000000000000000000000000000000000000000000000000000000000000000"
        "0000000000000000000000000000000000000000000000000000000000000000"
        "000000000000000000000000000000000000000000000000000000fc0000fc02"
        "010000fc01fc01fc000000000000000000000000000000000000000000000000"
        "0000000000000000000000000000000000e2"
    )
    assert len(stored) == 210

    parsed = parse_device_record(stored, hub_version=HUB_VERSION_X1S)
    assert parsed.name == "MQTT test device"
    assert parsed.device_id == 0x01
    assert parsed.tail_flag == 1
    assert parsed.tail_marker == 1

    rebuilt = build_device_create_payload(parsed, hub_version=HUB_VERSION_X1S)[3:]
    expected = bytearray(stored)
    expected[0] = 0x01
    expected[-1] = sum(expected[:-1]) & 0xFF
    assert rebuilt == bytes(expected)


def test_parser_rejects_body_with_wrong_length() -> None:
    short_body = b"\x01" * (DEVICE_BODY_LEN_X1 - 1)
    with pytest.raises(ValueError):
        parse_device_record(short_body, hub_version=HUB_VERSION_X1)
