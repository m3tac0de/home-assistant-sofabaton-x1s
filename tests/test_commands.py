from pathlib import Path
import sys
import types

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def _ensure_stub_package(name: str, path: Path) -> None:
    if name in sys.modules:
        return
    module = types.ModuleType(name)
    module.__path__ = [str(path)]
    sys.modules[name] = module


_ensure_stub_package("custom_components", ROOT / "custom_components")
_ensure_stub_package("custom_components.sofabaton_x1s", ROOT / "custom_components" / "sofabaton_x1s")
_ensure_stub_package("custom_components.sofabaton_x1s.lib", ROOT / "custom_components" / "sofabaton_x1s" / "lib")

from custom_components.sofabaton_x1s.lib.commands import DeviceCommandAssembler
from custom_components.sofabaton_x1s.lib.protocol_const import (
    OP_DEVBTN_HEADER,
    OP_DEVBTN_TAIL,
    SYNC0,
    SYNC1,
)
from custom_components.sofabaton_x1s.lib.x1_proxy import X1Proxy


def _build_frame(opcode: int, frame_no: int, total_frames: int, dev_id: int, data: bytes) -> bytes:
    prefix = bytes([SYNC0, SYNC1, opcode >> 8, opcode & 0xFF])
    payload = b"\x00\x00" + bytes([frame_no, dev_id]) + total_frames.to_bytes(2, "big") + data
    frame_wo_checksum = prefix + payload
    checksum = sum(frame_wo_checksum) & 0xFF
    return frame_wo_checksum + bytes([checksum])


def test_device_command_assembly_tracks_frames() -> None:
    dev_id = 0x2A
    payload = b"legacy_payload_chunk" + b"hue_payload_chunk"
    data_part1 = payload[: len(payload) // 2]
    data_part2 = payload[len(payload) // 2 :]

    assembler = DeviceCommandAssembler()

    header_frame = _build_frame(OP_DEVBTN_HEADER, 1, 2, dev_id, data_part1)
    tail_frame = _build_frame(OP_DEVBTN_TAIL, 2, 2, dev_id, data_part2)

    assert assembler.feed(OP_DEVBTN_HEADER, header_frame) == []

    completed = assembler.feed(OP_DEVBTN_TAIL, tail_frame)
    assert len(completed) == 1

    assembled_dev_id, assembled_payload = completed[0]
    assert assembled_dev_id == dev_id
    assert assembled_payload == payload


def test_parse_device_commands_handles_legacy_and_hue_formats() -> None:
    dev_id = 0x42

    legacy_record = (
        bytes([dev_id, 0x01])
        + b"\x03\x00\x00\x00\x00\x00\x01"
        + b"\x00\x00\x00\x00"
        + "Power".encode("utf-16-be")
    )

    hue_record = (
        bytes([dev_id, 0x02])
        + b"\x1a\x00\x00\x00\x00\x17\x02"
        + b"\x00\x00\x00\x00"
        + "Hue On".encode("utf-16-be")
    )

    assembled_payload = b"\xff".join([legacy_record, hue_record])

    proxy = X1Proxy("127.0.0.1")
    parsed = proxy.parse_device_commands(assembled_payload, dev_id)

    assert parsed == {1: "Power", 2: "Hue On"}
