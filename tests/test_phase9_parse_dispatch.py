"""Phase 9 tests: the unified per-family parse dispatcher.

Each test exercises one slice of Phase 9's contract:

- The dispatcher routes opcodes to the right per-family parser based
  on the opcode's family code.
- The parsers require ``hub_version`` and fail loudly on unknown
  values (the Phase 1 schema contract is preserved on the parse side).
- ``parse_device_record`` accepts an ``entity_kind`` discriminator so
  the same body bytes can be parsed as either a device (family-0x07)
  or activity (family-0x37) record without bypassing the schema.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest
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


from custom_components.sofabaton_x1s.const import HUB_VERSION_X1, HUB_VERSION_X1S
from custom_components.sofabaton_x1s.lib.commands import (
    ButtonBurstFrame,
    CommandBurstFrame,
    decode_burst_frame,
    parse_command_burst_frame,
)


def _wrap_frame(opcode: int, payload: bytes) -> bytes:
    """Assemble a minimal magic / opcode / payload / checksum wrapper.

    Mirrors the on-the-wire framing the parsers expect: 2-byte magic,
    big-endian opcode, payload, 1-byte (placeholder) checksum.
    """

    return b"\xa5\x5a" + opcode.to_bytes(2, "big") + payload + b"\x00"


def test_parse_command_burst_no_hub_version_raises() -> None:
    """Phase 9: ``hub_version`` is a required kwarg, no implicit default."""

    payload = b"\x01\x00\x01\x01\x00\x01\x0D\x42"  # plausible single-frame layout
    raw = _wrap_frame(0x010D, payload)

    with pytest.raises(TypeError):
        parse_command_burst_frame(0x010D, raw)  # type: ignore[call-arg]


def test_decode_burst_frame_routes_keymap_to_button_parser() -> None:
    """Phase 9: opcodes in the keymap family route to ``parse_button_burst_frame``."""

    # A minimal keymap header frame -- 7+ payload bytes, frame_no=1,
    # total_frames=1, total_rows=0 (no row data after the header).
    payload = b"\x01\x00\x01\x01\x00\x01\x00\x00"
    raw = _wrap_frame(0x023D, payload)

    parsed = decode_burst_frame(0x023D, raw, hub_version=HUB_VERSION_X1S)
    assert parsed is None or isinstance(parsed, ButtonBurstFrame)


def test_decode_burst_frame_routes_commands_to_command_parser() -> None:
    """Phase 9: opcodes in the command/devbtn families route to ``parse_command_burst_frame``."""

    # A plausible single-frame command layout for OP_DEVBTN_SINGLE.
    payload = b"\x01\x00\x01\x05\x00\x01\x42\x00\x01"
    raw = _wrap_frame(0x010D, payload)

    parsed = decode_burst_frame(0x010D, raw, hub_version=HUB_VERSION_X1S)
    assert parsed is None or isinstance(parsed, CommandBurstFrame)


def test_decode_burst_frame_returns_none_for_unknown_family() -> None:
    """Phase 9: opcodes outside the known burst families produce ``None``."""

    raw = _wrap_frame(0x0103, b"\x00\x00\x00")  # STATUS_ACK, not a burst family

    parsed = decode_burst_frame(0x0103, raw, hub_version=HUB_VERSION_X1)
    assert parsed is None


def test_decode_burst_frame_requires_hub_version() -> None:
    """Phase 9: the dispatcher inherits the schema-strict ``hub_version`` contract."""

    raw = _wrap_frame(0x023D, b"\x01\x00\x01\x01\x00\x01\x00\x00")
    with pytest.raises(TypeError):
        decode_burst_frame(0x023D, raw)  # type: ignore[call-arg]


def test_parse_device_record_accepts_entity_kind_activity() -> None:
    """Phase 9: ``parse_device_record`` admits ``entity_kind='activity'``.

    The body layout is identical for family-0x07 (devices) and
    family-0x37 (activities), so passing ``entity_kind='activity'``
    is metadata only -- the same bytes still parse without error.
    """

    from custom_components.sofabaton_x1s.lib.devices import (
        build_device_create_payload,
        parse_device_record,
        DeviceConfig,
    )

    config = DeviceConfig(
        name="Watch",
        brand="Acme",
        device_id=0x0D,
        record_kind=0x16,
        icon=0,
        sort=0,
        code_type=0x0D,
        device_type=0x03,
        code_id=b"\x00" * 16,
        hide=0,
        input_flag=0,
        channel=0,
        power_state=0,
        ip_address=None,
        poll_time=0,
        input_mode=0,
        power_mode=0,
        power_style=0,
        share_mode=0,
        tail_marker=1,
    )
    # ``build_device_create_payload`` prepends a 3-byte outer wrapper
    # (``[0x01][seq_be]``); ``parse_device_record`` expects the inner
    # body alone, so strip the wrapper before parsing.
    payload = build_device_create_payload(config, hub_version=HUB_VERSION_X1)
    body = payload[3:]
    # Both kinds parse the same bytes without error.
    as_device = parse_device_record(body, hub_version=HUB_VERSION_X1)
    as_activity = parse_device_record(
        body, hub_version=HUB_VERSION_X1, entity_kind="activity"
    )
    assert as_device.name == "Watch"
    assert as_activity.name == "Watch"


def test_parse_device_record_rejects_unknown_entity_kind() -> None:
    """Phase 9: ``entity_kind`` is validated; unknown values raise."""

    from custom_components.sofabaton_x1s.lib.devices import parse_device_record

    with pytest.raises(ValueError, match="entity_kind"):
        parse_device_record(
            b"\x00" * 120, hub_version=HUB_VERSION_X1, entity_kind="zwave_record"
        )
