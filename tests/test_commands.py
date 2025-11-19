from __future__ import annotations

import sys
import types
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

custom_components = types.ModuleType("custom_components")
custom_components.__path__ = [str(ROOT / "custom_components")]
sys.modules.setdefault("custom_components", custom_components)

sofabaton_pkg = types.ModuleType("custom_components.sofabaton_x1s")
sofabaton_pkg.__path__ = [str(ROOT / "custom_components" / "sofabaton_x1s")]
sys.modules.setdefault("custom_components.sofabaton_x1s", sofabaton_pkg)

lib_pkg = types.ModuleType("custom_components.sofabaton_x1s.lib")
lib_pkg.__path__ = [str(ROOT / "custom_components" / "sofabaton_x1s" / "lib")]
sys.modules.setdefault("custom_components.sofabaton_x1s.lib", lib_pkg)

if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from custom_components.sofabaton_x1s.lib.commands import (  # noqa: E402
    DeviceCommandAssembler,
    parse_device_commands,
)
from custom_components.sofabaton_x1s.lib.x1_proxy import (  # noqa: E402
    COMMAND_FRAME_OPCODES,
    OP_DEVBTN_HEADER,
    OP_DEVBTN_TAIL,
)

SYNC0, SYNC1 = 0xA5, 0x5A


def _build_record(dev_id: int, command_id: int, control: bytes, label: str) -> bytes:
    label_bytes = label.encode("utf-16be")
    return (
        bytes([dev_id, command_id])
        + control
        + b"\x00\x00\x00\x00"
        + label_bytes
        + b"\x00\x00"
    )


def _build_frame(opcode: int, frame_index: int, dev_id: int, total_frames: int, payload: bytes) -> bytes:
    header = bytes([SYNC0, SYNC1, (opcode >> 8) & 0xFF, opcode & 0xFF])
    frame_payload = (
        b"\x00\x00"
        + bytes([frame_index & 0xFF, dev_id & 0xFF])
        + total_frames.to_bytes(2, "big")
        + b"\x00"
        + payload
    )
    return header + frame_payload + b"\x00"


def test_parse_device_commands_handles_legacy_record():
    dev_id = 0x10
    control = b"\x03\x01\x02\x03\x04\x05\x06"
    record = _build_record(dev_id, 0x01, control, "Power Toggle")
    raw = b"\x12\x34" + b"\xFF" + record + b"\xFF"

    parsed = parse_device_commands(raw, dev_id)

    assert parsed == {0x01: "Power Toggle"}


def test_parse_device_commands_handles_hue_record():
    dev_id = 0x10
    control = b"\x1a\x00\x00\x00\x00\x17\x04"
    record = _build_record(dev_id, 0x02, control, "Hue Scene")
    raw = b"noise" + b"\xFF" + record + b"\xFF"

    parsed = parse_device_commands(raw, dev_id)

    assert parsed == {0x02: "Hue Scene"}


def test_device_command_assembler_emits_payload_once_all_frames_arrive():
    dev_id = 0x22
    control_ir = b"\x03\x01\x00\x00\x00\x00\x01"
    control_hue = b"\x1a\x00\x00\x00\x00\x17\x08"
    record_ir = _build_record(dev_id, 0x01, control_ir, "Input 1")
    record_hue = _build_record(dev_id, 0x02, control_hue, "Hue Toggle")
    assembler = DeviceCommandAssembler({OP_DEVBTN_HEADER}, set(COMMAND_FRAME_OPCODES))

    header_frame = _build_frame(OP_DEVBTN_HEADER, 1, dev_id, 2, b"\xFF" + record_ir + b"\xFF")
    tail_frame = _build_frame(OP_DEVBTN_TAIL, 2, dev_id, 2, b"\xFF" + record_hue + b"\xFF")

    assert assembler.feed(OP_DEVBTN_HEADER, header_frame) == []

    completed = assembler.feed(OP_DEVBTN_TAIL, tail_frame)
    assert completed and completed[0][0] == dev_id

    combined_payload = completed[0][1]
    commands = parse_device_commands(combined_payload, dev_id)

    assert commands == {0x01: "Input 1", 0x02: "Hue Toggle"}

    # A new header for the same device should start a new burst cleanly.
    second_header = _build_frame(OP_DEVBTN_HEADER, 1, dev_id, 1, b"\xFF" + record_ir + b"\xFF")
    next_completed = assembler.feed(OP_DEVBTN_HEADER, second_header)
    assert next_completed and next_completed[0][0] == dev_id

    next_commands = parse_device_commands(next_completed[0][1], dev_id)
    assert next_commands == {0x01: "Input 1"}


def test_iter_command_records_skips_malformed_chunks():
    dev_id = 0x33
    control = b"\x03\x01\x00\x00\x00\x00\x01"
    valid_record = _build_record(dev_id, 0x01, control, "Input 1")

    # include malformed slices before/after the valid record to ensure we still parse it
    malformed_prefix = b"\x00\x01\x02\x03"
    malformed_suffix = bytes([dev_id]) + b"\x02\x03"
    raw = malformed_prefix + b"\xFF" + valid_record + b"\xFF" + malformed_suffix

    parsed = parse_device_commands(raw, dev_id)

    assert parsed == {0x01: "Input 1"}
