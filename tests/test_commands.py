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


def test_parse_device_commands_handles_ascii_labels() -> None:
    proxy = X1Proxy("127.0.0.1")
    dev_id = 0x07

    ascii_payload = bytes.fromhex(
        "a5 5a f7 5d 01 00 01 01 00 02 0a 07 01 0d 00 00 00 00 00 ba 45 6a 65 63 74 00 00 00 00 "
        "00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 07 02 0d 00 00 00 00 1d "
        "c1 47 72 65 61 74 65 72 31 30 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff "
        "07 03 0d 00 00 00 00 14 0c 4e 65 78 74 20 74 72 61 63 6b 00 00 00 00 00 00 00 00 00 00 00 00 00 00 "
        "00 00 00 00 00 00 ff 07 04 0d 00 00 00 00 00 a6 50 61 75 73 65 00 00 00 00 00 00 00 00 00 00 00 00 00 "
        "00 00 00 00 00 00 00 00 00 00 00 ff 07 05 0d 00 00 00 00 00 92 50 6c 61 79 00 00 00 00 00 00 00 00 00 "
        "00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 07 06 0d 00 00 00 00 33 72 50 72 65 76 69 6f 75 73 20 74 "
        "72 61 63 6b 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 8e"
    )

    payload = ascii_payload[4:-1]
    opcode = int.from_bytes(ascii_payload[2:4], "big")
    data_offset = proxy._command_assembler._data_offset(opcode)  # type: ignore[attr-defined]
    assembled_payload = payload[data_offset:]

    parsed = proxy.parse_device_commands(assembled_payload, dev_id)

    assert parsed == {
        1: "Eject",
        2: "Greater10",
        3: "Next track",
        4: "Pause",
        5: "Play",
        6: "Previous track",
    }


def test_parse_device_commands_handles_early_data_offset() -> None:
    proxy = X1Proxy("127.0.0.1")
    dev_id = 0x07

    early_offset_payload = bytes.fromhex(
        "a5 5a a3 5d 01 00 02 07 07 0d 00 00 00 00 00 a1 53 74 6f 70 00 00 00 00 00 00 00 00 00 00 00 00 00 "
        "00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 07 08 0d 00 00 00 00 34 40 54 69 6d 65 20 6d 6f 64 65 00 00 00 00 00 00 00 00 00 "
        "00 00 00 00 00 00 00 00 00 00 00 00 00 ff 07 09 0d 00 00 00 00 00 97 46 61 73 74 5f 66 6f 72 77 61 72 64 00 00 00 00 00 00 00 "
        "00 00 00 00 00 00 00 00 00 00 ff 07 0a 0d 00 00 00 00 01 88 4f 6b 2f 73 65 6c 65 63 74 00 00 00 00 00 00 00 00 00 00 00 00 00 "
        "00 00 00 00 00 00 00 00 00 ff ea"
    )

    payload = early_offset_payload[4:-1]
    opcode = int.from_bytes(early_offset_payload[2:4], "big")
    data_offset = proxy._command_assembler._data_offset(opcode)  # type: ignore[attr-defined]
    assembled_payload = payload[data_offset:]

    parsed = proxy.parse_device_commands(assembled_payload, dev_id)

    assert parsed == {
        13: "Stop",
        8: "Time mode",
        9: "Fast_forward",
        10: "Ok/select",
    }


def test_parse_device_commands_handles_alt_command_pages() -> None:
    frames_hex = (
        "a5 5a f7 5d 01 00 01 01 00 06 21 09 01 0a 00 00 00 00 17 13 50 6f 77 65 72 4f 6e 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 09 02 0a 00 00 00 00 4e 21 45 6d 75 6c 61 74 65 64 20 41 70 70 20 31 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 09 03 0a 00 00 00 00 4e 2a 45 6d 75 6c 61 74 65 64 20 41 70 70 20 31 30 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 09 04 0a 00 00 00 00 4e 22 45 6d 75 6c 61 74 65 64 20 41 70 70 20 32 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 09 05 0a 00 00 00 00 4e 23 45 6d 75 6c 61 74 65 64 20 41 70 70 20 33 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 09 06 0a 00 00 00 00 4e 24 45 6d 75 6c 61 74 65 64 20 41 70 70 20 34 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 31",
        "a5 5a f3 5d 01 00 02 09 07 0a 00 00 00 00 4e 25 45 6d 75 6c 61 74 65 64 20 41 70 70 20 35 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 09 08 0a 00 00 00 00 4e 26 45 6d 75 6c 61 74 65 64 20 41 70 70 20 36 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 09 09 0a 00 00 00 00 4e 27 45 6d 75 6c 61 74 65 64 20 41 70 70 20 37 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 09 0a 0a 00 00 00 00 4e 28 45 6d 75 6c 61 74 65 64 20 41 70 70 20 38 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 09 0b 0a 00 00 00 00 4e 29 45 6d 75 6c 61 74 65 64 20 41 70 70 20 39 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 09 0c 0a 00 00 00 00 00 d3 49 6e 66 6f 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 8c",
        "a5 5a f3 5d 01 00 03 09 0d 0a 00 00 00 00 32 62 49 6e 70 75 74 41 56 31 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 09 0e 0a 00 00 00 00 32 02 49 6e 70 75 74 48 44 4d 49 31 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 09 0f 0a 00 00 00 00 32 03 49 6e 70 75 74 48 44 4d 49 32 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 09 10 0a 00 00 00 00 32 04 49 6e 70 75 74 48 44 4d 49 33 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 09 11 0a 00 00 00 00 32 05 49 6e 70 75 74 48 44 4d 49 34 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 09 12 0a 00 00 00 00 07 5a 49 6e 70 75 74 54 75 6e 65 72 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 6f",
        "a5 5a f3 5d 01 00 04 09 13 0a 00 00 00 00 02 56 49 6e 73 74 61 6e 74 52 65 70 6c 61 79 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 09 14 0a 00 00 00 00 17 18 50 6f 77 65 72 4f 66 66 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 09 15 0a 00 00 00 00 00 74 42 61 63 6b 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 09 16 0a 00 00 00 00 00 2f 44 6f 77 6e 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 09 17 0a 00 00 00 00 00 97 46 77 64 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 09 18 0a 00 00 00 00 07 c7 48 6f 6d 65 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff f9",
        "a5 5a f3 5d 01 00 05 09 19 0a 00 00 00 00 00 30 4c 65 66 74 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 09 1a 0a 00 00 00 00 00 2a 4f 6b 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 09 1b 0a 00 00 00 00 00 92 50 6c 61 79 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 09 1c 0a 00 00 00 00 00 8d 52 65 76 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 09 1d 0a 00 00 00 00 00 31 52 69 67 68 74 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 09 1e 0a 00 00 00 00 00 2e 55 70 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 09",
        "a5 5a 7b 5d 01 00 06 09 1f 0a 00 00 00 00 00 33 56 6f 6c 75 6d 65 44 6f 77 6e 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 09 20 0a 00 00 00 00 00 6a 56 6f 6c 75 6d 65 4d 75 74 65 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 09 21 0a 00 00 00 00 2e 77 56 6f 6c 75 6d 65 55 70 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 16",
    )

    frames = [bytes.fromhex(block) for block in frames_hex]

    assembler = DeviceCommandAssembler()
    completed: list[tuple[int, bytes]] = []
    dev_id = frames[0][11]

    for raw in frames:
        opcode = int.from_bytes(raw[2:4], "big")
        completed.extend(assembler.feed(opcode, raw, dev_id_override=dev_id))

    assert len(completed) == 1
    assembled_dev_id, assembled_payload = completed[0]

    proxy = X1Proxy("127.0.0.1")
    parsed = proxy.parse_device_commands(assembled_payload, assembled_dev_id)

    assert parsed == {
        1: "PowerOn",
        2: "Emulated App 1",
        3: "Emulated App 10",
        4: "Emulated App 2",
        5: "Emulated App 3",
        6: "Emulated App 4",
        7: "Emulated App 5",
        8: "Emulated App 6",
        9: "Emulated App 7",
        10: "Emulated App 8",
        11: "Emulated App 9",
        12: "Info",
        13: "InputAV1",
        14: "InputHDMI1",
        15: "InputHDMI2",
        16: "InputHDMI3",
        17: "InputHDMI4",
        18: "InputTuner",
        19: "InstantReplay",
        20: "PowerOff",
        21: "Back",
        22: "Down",
        23: "Fwd",
        24: "Home",
        25: "Left",
        26: "Ok",
        27: "Play",
        28: "Rev",
        29: "Right",
        30: "Up",
        31: "VolumeDown",
        32: "VolumeMute",
        33: "VolumeUp",
    }
