"""Phase 4 ("works for zeros" pass) -- non-zero fixture round-trip
tests for every wire builder.

The fixtures here populate *every* byte slot with a distinct,
non-zero value. The intent is to catch the same class of bug as A1
(``build_x1_input_entry`` allocating only 2 bytes for a 6-byte fid):
a builder that always wire-passes on the integration's existing
all-zero fixtures but silently corrupts a populated slot. Each test
asserts byte-by-byte that the slot the builder claimed to write does
land at the documented offset.

Where the layout is byte-symmetric -- i.e. a paired parser exists --
the test also round-trips through the parser and compares the field
values back. For unidirectional builders (button binding, macro,
inputs disable, set-idle-behavior) the test pins the canonical byte
layout instead.
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
)
from custom_components.sofabaton_x1s.lib.device_create import (
    ACK_OPCODE_BUTTON_BINDING,
    ACK_OPCODE_DEVICE_CREATE,
    ACK_OPCODE_MACRO,
    ACK_OPCODE_STATUS,
    FAMILY_BUTTON_BINDING,
    FAMILY_COMMAND_WRITE,
    FAMILY_DEVICE_CREATE,
    FAMILY_DEVICE_UPDATE,
    FAMILY_MACRO,
    FAMILY_REMOTE_SYNC,
    FAMILY_SET_IDLE_BEHAVIOR,
    MACRO_STEP_RECORD_SIZE,
    build_button_binding_step,
    build_command_write_steps,
    build_device_create_step,
    build_device_update_step,
    build_macro_step,
    build_macro_step_record,
    build_remote_sync_step,
    build_set_idle_behavior_step,
)
from custom_components.sofabaton_x1s.lib.devices import (
    DEVICE_CODE_ID_LEN,
    DeviceConfig,
    build_device_create_payload,
    parse_device_record,
)
from custom_components.sofabaton_x1s.lib.inputs import (
    INPUTS_OUTER_WRAPPER_LEN,
    ControlKeyBlock,
    FavoriteSlot,
    InputEntry,
    build_inputs_write,
    parse_inputs_burst,
)


# ---------------------------------------------------------------------------
# devices.py -- non-zero-everywhere DeviceConfig round-trip
# ---------------------------------------------------------------------------


def _nonzero_device_config() -> DeviceConfig:
    """Build a DeviceConfig with a distinct non-zero value in every slot."""

    return DeviceConfig(
        name="MyDevice",
        brand="MyBrand",
        device_id=0x42,
        record_kind=0x07,
        icon=0x11,
        sort=0x22,
        code_type=0x33,
        device_type=0x44,
        code_id=bytes(range(1, DEVICE_CODE_ID_LEN + 1)),
        hide=0x55,
        input_flag=0x66,
        channel=0x77,
        power_state=0x01,
        ip_address="192.168.4.99",
        poll_time=0x1234,
        input_mode=0x02,
        power_mode=0x03,
        power_style=0x04,
        share_mode=0x05,
        tail_marker=0x06,
        extras_present=True,
        extra_a=0xAA,
        extra_b=0xBB,
        extra_c=0xCC,
    )


@pytest.mark.parametrize(
    "hub_version",
    [HUB_VERSION_X1, HUB_VERSION_X1S, HUB_VERSION_X2],
)
def test_device_record_non_zero_round_trip(hub_version: str) -> None:
    """Every field round-trips through build_device_create_payload →
    parse_device_record on every variant. Catches off-by-one slot
    boundary errors and accidental zero-fill of structured tail bytes.
    """

    config = _nonzero_device_config()
    payload = build_device_create_payload(config, hub_version=hub_version)
    body = payload[3:]
    parsed = parse_device_record(body, hub_version=hub_version)

    # Round-trip the structured fields the parser surfaces.
    assert parsed.name == config.name
    assert parsed.brand == config.brand
    assert parsed.device_id == config.device_id
    assert parsed.record_kind == config.record_kind
    assert parsed.icon == config.icon
    assert parsed.sort == config.sort
    assert parsed.code_type == config.code_type
    assert parsed.device_type == config.device_type
    assert parsed.code_id == config.code_id
    assert parsed.hide == config.hide
    assert parsed.input_flag == config.input_flag
    assert parsed.channel == config.channel
    assert parsed.power_state == config.power_state
    assert parsed.ip_address == config.ip_address
    assert parsed.poll_time == config.poll_time
    assert parsed.input_mode == config.input_mode
    assert parsed.power_mode == config.power_mode
    assert parsed.power_style == config.power_style
    assert parsed.share_mode == config.share_mode
    assert parsed.tail_marker == config.tail_marker
    assert parsed.extras_present == config.extras_present
    assert parsed.extra_a == config.extra_a
    assert parsed.extra_b == config.extra_b
    assert parsed.extra_c == config.extra_c

    # Body checksum is self-consistent (sum of body[:-1] mod 256).
    assert body[-1] == sum(body[:-1]) & 0xFF


def test_device_record_tail_slot_fields_land_at_canonical_offsets() -> None:
    """Pin the tail-slot byte offsets the structured markers occupy on
    an X1 30-byte tail. A wrong offset would be invisible on an
    all-zero fixture and only fail on a populated record like this.
    """

    config = _nonzero_device_config()
    body = build_device_create_payload(config, hub_version=HUB_VERSION_X1)[3:]
    tail = body[89 : 89 + 30]

    assert tail[0] == 0xFC and tail[1] == 0x55  # IP marker
    assert tail[2:6] == bytes([192, 168, 4, 99])
    assert tail[6] == 0xFC
    assert tail[7:9] == (0x1234).to_bytes(2, "big")
    assert tail[9] == 0xFC
    assert tail[10] == 0x02  # input_mode
    assert tail[11] == 0x03  # power_mode
    assert tail[12] == 0x04  # power_style
    assert tail[13] == 0x05  # share_mode
    assert tail[14] == 0xFC
    assert tail[15] == 0x00
    assert tail[16] == 0xFC
    assert tail[17] == 0x06  # tail_marker
    # Extras block: marker + 3 vendor bytes at offsets 18..21.
    assert tail[18] == 0xFC
    assert tail[19:22] == bytes([0xAA, 0xBB, 0xCC])


# ---------------------------------------------------------------------------
# device_create.py -- one non-zero fixture per builder
# ---------------------------------------------------------------------------


def test_button_binding_non_zero_round_trip() -> None:
    step = build_button_binding_step(
        device_id=0x42,
        button_id=0xBD,
        short_press_device_id=0x05,
        short_press_button_code=0x0123_4567_89AB,
        short_press_button_id=0x07,
        long_press_device_id=0x06,
        long_press_button_code=0xFEDC_BA98_7654,
        long_press_button_id=0x08,
    )

    assert step.family == FAMILY_BUTTON_BINDING
    assert step.ack_opcode == ACK_OPCODE_BUTTON_BINDING
    assert step.ack_first_byte == 0xBD

    payload = step.payload
    assert len(payload) == 25
    # Outer wrapper + body marker.
    assert payload[0:3] == b"\x01\x00\x01"
    body = payload[3:]
    assert body[0:3] == b"\x01\x00\x01"
    # Header fields land at the documented offsets.
    assert body[3] == 0x42
    assert body[4] == 0xBD
    assert body[5] == 0x05
    assert body[6:12] == (0x0123_4567_89AB).to_bytes(6, "big")
    assert body[12] == 0x07
    assert body[13] == 0x06
    assert body[14:20] == (0xFEDC_BA98_7654).to_bytes(6, "big")
    assert body[20] == 0x08
    # Body checksum self-consistent.
    assert body[21] == sum(body[:-1]) & 0xFF


@pytest.mark.parametrize(
    ("hub_version", "label_slot_len", "label_encoding"),
    [
        (HUB_VERSION_X1, 30, "ascii"),
        (HUB_VERSION_X1S, 60, "utf-16-be"),
        (HUB_VERSION_X2, 60, "utf-16-be"),
    ],
)
def test_command_write_non_zero_round_trip(
    hub_version: str, label_slot_len: int, label_encoding: str
) -> None:
    """C1 regression: the label slot widens from 30 ASCII to 60
    UTF-16BE on X1S/X2. A populated label must land in the slot the
    schema declares, not a hardcoded 30-byte ASCII slot.
    """

    library_data = bytes(range(1, 17))  # 16 distinct non-zero bytes
    label = "Power on"
    steps = build_command_write_steps(
        hub_version=hub_version,
        command_seq=0x11,
        command_burst_size=0x22,
        device_id=0x33,
        button_id=0x44,
        library_type=0x55,
        button_code=0x0123_4567_89AB,
        label=label,
        library_data=library_data,
    )

    assert len(steps) == 1
    step = steps[0]
    assert step.family == FAMILY_COMMAND_WRITE
    assert step.ack_opcode == ACK_OPCODE_STATUS

    payload = step.payload
    # Per-page header: [command_seq, page_no_be].
    assert payload[0] == 0x11
    assert payload[1:3] == (1).to_bytes(2, "big")

    body = payload[3:]
    assert body[0] == 0x22                       # burst size
    assert body[1:3] == (1).to_bytes(2, "big")   # total_pages_be
    assert body[3] == 0x33                       # device_id
    assert body[4] == 0x44                       # button_id
    assert body[5] == 0x55                       # library_type
    assert body[6:12] == (0x0123_4567_89AB).to_bytes(6, "big")

    # Label slot has the variant's documented width and encoding.
    label_start = 12
    label_end = label_start + label_slot_len
    label_slot = body[label_start:label_end]
    expected_label = label.encode(label_encoding)
    assert label_slot[: len(expected_label)] == expected_label
    assert label_slot[len(expected_label) :] == b"\x00" * (
        label_slot_len - len(expected_label)
    )

    # library_data follows immediately after the label slot.
    assert body[label_end : label_end + len(library_data)] == library_data
    # Body checksum self-consistent.
    assert body[-1] == sum(body[:-1]) & 0xFF


@pytest.mark.parametrize(
    ("hub_version", "label_slot_len", "label_encoding"),
    [
        (HUB_VERSION_X1, 30, "ascii"),
        (HUB_VERSION_X1S, 60, "utf-16-be"),
        (HUB_VERSION_X2, 60, "utf-16-be"),
    ],
)
def test_macro_step_non_zero_round_trip(
    hub_version: str, label_slot_len: int, label_encoding: str
) -> None:
    """E1 regression: the macro label slot widens from 30 ASCII to 60
    UTF-16BE on X1S/X2. The auto-generated POWER_ON / POWER_OFF
    writes hit this path on every variant.
    """

    step_records = (
        build_macro_step_record(
            device_id=0x42,
            command_id=0x12,
            fid=0x4E32,
            duration=0x01,
            delay=0xFF,
        )
        + build_macro_step_record(
            device_id=0x43,
            command_id=0x13,
            fid=0x4E33,
            duration=0x02,
            delay=0xFE,
        )
    )
    step = build_macro_step(
        hub_version=hub_version,
        device_id=0x42,
        key_id=0xC6,
        label="POWER",
        step_records=step_records,
    )

    assert step.family == FAMILY_MACRO
    assert step.ack_opcode == ACK_OPCODE_MACRO
    assert step.ack_first_byte == 0xC6

    body = step.payload[3:]
    assert body[0:3] == b"\x01\x00\x01"
    assert body[3] == 0x42
    assert body[4] == 0xC6
    assert body[5] == 2  # step_count
    # Step records concatenated immediately after the 6-byte header.
    assert body[6 : 6 + 2 * MACRO_STEP_RECORD_SIZE] == step_records

    # Label slot has the variant's documented width and encoding.
    label_start = 6 + 2 * MACRO_STEP_RECORD_SIZE
    label_end = label_start + label_slot_len
    label_slot = body[label_start:label_end]
    expected = "POWER".encode(label_encoding)
    assert label_slot[: len(expected)] == expected
    assert label_slot[len(expected) :] == b"\x00" * (label_slot_len - len(expected))

    # Body checksum self-consistent.
    assert body[-1] == sum(body[:-1]) & 0xFF


def test_macro_step_record_non_zero_round_trip() -> None:
    record = build_macro_step_record(
        device_id=0x42,
        command_id=0x12,
        fid=0x0000_0000_4E32,
        duration=0xAB,
        delay=0xCD,
    )

    assert len(record) == MACRO_STEP_RECORD_SIZE
    assert record[0] == 0x42
    assert record[1] == 0x12
    assert record[2:8] == (0x0000_0000_4E32).to_bytes(6, "big")
    assert record[8] == 0xAB
    assert record[9] == 0xCD


def test_set_idle_behavior_non_zero_fixture() -> None:
    step = build_set_idle_behavior_step(device_id=0x42, mode=0x07)

    assert step.family == FAMILY_SET_IDLE_BEHAVIOR
    assert step.ack_opcode == ACK_OPCODE_STATUS
    assert step.payload == bytes([0x42, 0x07])


def test_remote_sync_payload_is_empty() -> None:
    step = build_remote_sync_step()
    assert step.family == FAMILY_REMOTE_SYNC
    assert step.payload == b""


def test_device_create_step_capture_device_id_flag_set() -> None:
    """The device-create step must request the assigned-device-id
    capture; the update step must not.
    """

    config = _nonzero_device_config()
    create = build_device_create_step(config, hub_version=HUB_VERSION_X1)
    update = build_device_update_step(config, hub_version=HUB_VERSION_X1)

    assert create.family == FAMILY_DEVICE_CREATE
    assert create.ack_opcode == ACK_OPCODE_DEVICE_CREATE
    assert create.capture_device_id is True

    assert update.family == FAMILY_DEVICE_UPDATE
    assert update.ack_opcode == ACK_OPCODE_STATUS
    assert update.capture_device_id is False


# ---------------------------------------------------------------------------
# inputs.py -- non-zero fixture (complements tests/lib/test_inputs.py)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "hub_version",
    [HUB_VERSION_X1, HUB_VERSION_X1S, HUB_VERSION_X2],
)
def test_inputs_non_zero_round_trip(hub_version: str) -> None:
    """Every field round-trips through build_inputs_write →
    parse_inputs_burst on every variant with distinct non-zero values
    for the header, an entry, all four control-key slots, three
    favorite slots, and the state byte.
    """

    entries = [
        InputEntry(key_id=0x42, fid=0x0123_4567_89AB, ordinal=1, label="HDMI"),
        InputEntry(key_id=0x43, fid=0x0123_4567_89AC, ordinal=2, label="Roku"),
    ]
    keys = ControlKeyBlock(
        input_list=b"\x01\x02\x03\x04\x05\x06\x07\x08\x09",
        input_up=b"\x11\x12\x13\x14\x15\x16\x17\x18\x19",
        input_down=b"\x21\x22\x23\x24\x25\x26\x27\x28\x29",
        input_confirm=b"\x31\x32\x33\x34\x35\x36\x37\x38\x39",
    )
    favorites = [
        FavoriteSlot(payload=b"\xA1\xA2\xA3\xA4\xA5\xA6\xA7"),
        FavoriteSlot(payload=b"\xB1\xB2\xB3\xB4\xB5\xB6\xB7"),
        FavoriteSlot(payload=b"\xC1\xC2\xC3\xC4\xC5\xC6\xC7"),
    ]
    payload = build_inputs_write(
        hub_version=hub_version,
        device_id=0x11,
        source_id_byte=0x22,
        flag_a=0x33,
        flag_b=0x44,
        entries=entries,
        control_keys=keys,
        favorites=favorites,
        state_byte=0x55,
    )

    # Outer wrapper + body header offsets are byte-positioned.
    body = payload[INPUTS_OUTER_WRAPPER_LEN:]
    assert body[3] == 0x11
    assert body[4] == 0x22
    assert body[5] == len(entries)
    assert body[6] == 0x33
    assert body[7] == 0x44
    assert body[-1] == sum(body[:-1]) & 0xFF

    record = parse_inputs_burst([payload], hub_version=hub_version)

    assert record.device_id == 0x11
    assert record.source_id_byte == 0x22
    assert record.flag_a == 0x33
    assert record.flag_b == 0x44
    assert record.state_byte == 0x55
    assert len(record.entries) == 2
    assert record.entries[0].key_id == 0x42
    assert record.entries[0].fid == 0x0123_4567_89AB
    assert record.entries[0].label == "HDMI"
    assert record.entries[1].label == "Roku"
    assert record.control_keys.input_list == keys.input_list
    assert record.control_keys.input_up == keys.input_up
    assert record.control_keys.input_down == keys.input_down
    assert record.control_keys.input_confirm == keys.input_confirm
    assert record.favorites[0].payload == favorites[0].payload
    assert record.favorites[1].payload == favorites[1].payload
    assert record.favorites[2].payload == favorites[2].payload
