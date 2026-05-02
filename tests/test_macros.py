import sys
import types
from pathlib import Path

import pytest

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

from custom_components.sofabaton_x1s.lib.macros import (
    MacroAssembler,
    decode_macro_records,
    parse_macro_burst_frame,
)
from custom_components.sofabaton_x1s.lib.protocol_const import FAMILY_MACROS, SYNC0, SYNC1


def build_macro_frame(
    opcode_hi: int,
    page_no: int,
    total_pages: int,
    activity_id: int,
    *,
    header_x: int = 0x01,
    header_y: int = 0x01,
    body: bytes = b"",
) -> bytes:
    """Construct a macro frame with checksum."""

    hdr = bytes([page_no, 0x00, header_x, total_pages, 0x00, header_y, activity_id])
    payload = hdr + body

    opcode_lo = FAMILY_MACROS
    opcode = bytes([opcode_hi, opcode_lo])

    frame_wo_checksum = bytes([SYNC0, SYNC1]) + opcode + payload
    checksum = bytes([(-sum(frame_wo_checksum) & 0xFF)])
    return frame_wo_checksum + checksum


def make_macro_record(macro_id: int, label: str, step_count: int = 3, step_start: int = 0) -> bytes:
    steps = bytes((step_start + i) % 256 for i in range(10 * step_count))
    label_bytes = label.encode("utf-16le") + b"\x00\x00"
    return bytes([macro_id, step_count]) + steps + label_bytes


def test_single_page_macroburst() -> None:
    assembler = MacroAssembler()
    activity_id = 0x69
    record = make_macro_record(1, "TEST1")

    frame = build_macro_frame(0x64, 1, 1, activity_id, body=record)
    opcode = int.from_bytes(frame[2:4], "big")
    payload = frame[4:-1]

    completed = assembler.feed(opcode, payload, frame)
    assert len(completed) == 1

    act, blob, boundaries = completed[0]
    assert act == activity_id
    decoded = decode_macro_records(blob, activity_id, boundaries)
    assert decoded == [(activity_id, 1, "TEST1")]


def test_parse_macro_burst_frame_x1_ascii_record_start() -> None:
    raw = bytes.fromhex(
        "a5 5a 46 13 01 00 01 04 00 01 65 07 03 01 22 00 00 00 00 41 c7 00 ff 01 2d"
        " 00 00 00 00 42 3f 00 ff 01 4e 00 00 00 00 2f 55 00 ff 74 65 73 74 20 6d 61"
        " 63 72 6f 20 31 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 54 15"
    )
    parsed = parse_macro_burst_frame(int.from_bytes(raw[2:4], "big"), raw)

    assert parsed is not None
    assert parsed.role == "record_start"
    assert parsed.fragment_index == 1
    assert parsed.total_fragments == 4
    assert parsed.activity_id == 0x65
    assert parsed.start_command_id == 0x07
    assert parsed.payload_length_matches_hi is True


def test_parse_macro_burst_frame_x1s_utf16_record_start() -> None:
    raw = bytes.fromhex(
        "a5 5a 50 13 01 00 01 04 00 01 65 0d 01 04 05 00 00 00 00 00 4c 00 ff 00 74"
        " 00 65 00 73 00 74 00 20 00 6d 00 61 00 63 00 72 00 6f 00 20 00 31 00 00 00"
        " 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00"
        " 00 00 00 00 00 00 00 00 00 00 09 7c"
    )
    parsed = parse_macro_burst_frame(int.from_bytes(raw[2:4], "big"), raw)

    assert parsed is not None
    assert parsed.role == "record_start"
    assert parsed.fragment_index == 1
    assert parsed.total_fragments == 4
    assert parsed.activity_id == 0x65
    assert parsed.start_command_id == 0x0D


def test_x1s_multi_page_macroburst_out_of_order() -> None:
    assembler = MacroAssembler()
    activity_id = 0x69

    record1 = make_macro_record(1, "MAC1")
    record2 = make_macro_record(2, "MAC2", step_count=3, step_start=20)

    # Each proper frame carries exactly one complete record (realistic protocol behaviour).
    frames = [
        build_macro_frame(0x64, 1, 2, activity_id, body=record1),
        build_macro_frame(0x64, 2, 2, activity_id, body=record2),
    ]

    opcode = int.from_bytes(frames[0][2:4], "big")

    completed = []
    # Feed out of order
    for idx in (1, 0):
        frame = frames[idx]
        payload = frame[4:-1]
        completed.extend(assembler.feed(opcode, payload, frame))

    assert len(completed) == 1
    act, blob, boundaries = completed[0]
    assert act == activity_id

    decoded = decode_macro_records(blob, activity_id, boundaries)
    assert [(cmd, label) for _, cmd, label in decoded] == [(1, "MAC1"), (2, "MAC2")]


def test_x1_continuation_macroburst() -> None:
    assembler = MacroAssembler()
    activity_id = 0x68

    record1 = make_macro_record(1, "PS5 Start", step_count=0x1B)   # 292 bytes, needs continuation
    record2 = make_macro_record(2, "PS5 Off", step_count=3, step_start=50)
    record3 = make_macro_record(3, "PS5 Other", step_count=3, step_start=90)

    # Record1 is large: split across a proper frame and a continuation frame.
    # Records 2 and 3 each start their own proper frame (realistic protocol layout).
    r1_chunk1 = record1[:223]
    r1_chunk2 = record1[223:]

    # total_frames=4: the assembler counts 4 stored fragments before declaring done
    # (proper frame 1 + continuation + proper frame 2 + proper frame 3 = 4 slots).
    frames = [
        build_macro_frame(0xFA, 1, 4, activity_id, header_y=0x02, body=r1_chunk1),
        build_macro_frame(0x3F, 1, 0x23, 0x00, header_x=0x02, header_y=0x00, body=r1_chunk2),
        build_macro_frame(0x78, 2, 4, activity_id, body=record2),
        build_macro_frame(0x3C, 3, 4, activity_id, body=record3),
    ]

    opcode = int.from_bytes(frames[0][2:4], "big")
    completed = []

    for frame in frames:
        payload = frame[4:-1]
        completed.extend(assembler.feed(opcode, payload, frame))

    assert len(completed) == 1
    act, blob, boundaries = completed[0]
    assert act == activity_id

    decoded = decode_macro_records(blob, activity_id, boundaries)
    labels = [label for _, _, label in decoded]
    assert "PS5 Start" in labels
    assert "PS5 Off" in labels
    assert "PS5 Other" in labels


def test_macrobursts_for_multiple_activities_interleaved() -> None:
    assembler = MacroAssembler()

    act_a = 0x68
    act_b = 0x69

    rec_a1 = make_macro_record(1, "A1")
    rec_a2 = make_macro_record(2, "A2", step_count=3)
    rec_b1 = make_macro_record(3, "B1")
    rec_b2 = make_macro_record(4, "B2")

    # Each proper frame carries exactly one complete record; interleave activities.
    frames = [
        build_macro_frame(0x64, 1, 2, act_a, body=rec_a1),
        build_macro_frame(0x64, 1, 2, act_b, body=rec_b1),
        build_macro_frame(0x64, 2, 2, act_a, body=rec_a2),
        build_macro_frame(0x64, 2, 2, act_b, body=rec_b2),
    ]

    opcode = int.from_bytes(frames[0][2:4], "big")
    completed = []

    for frame in frames:
        payload = frame[4:-1]
        completed.extend(assembler.feed(opcode, payload, frame))

    assert len(completed) == 2

    decoded = {act: decode_macro_records(blob, act, boundaries) for act, blob, boundaries in completed}

    labels_a = [label for _, _, label in decoded[act_a]]
    labels_b = [label for _, _, label in decoded[act_b]]

    assert labels_a == ["A1", "A2"]
    assert labels_b == ["B1", "B2"]


def test_utf16_separator_byte_stripped_from_label() -> None:
    """Labels preceded by an 0xFF 0x00 field-separator in UTF-16LE must not include the byte before it."""
    # Frames 19-22 from a real capture.  Before the fix:
    #   macro 13 → "Ltest macro 1"  (0x4C = 'L' was the byte before 0xFF 0x00)
    #   macro 14 → "(test macro 2"  (0x28 = '(' was the byte before 0xFF 0x00)
    assembler = MacroAssembler()

    raw_hex = """
    a5 5a 50 13 01 00 01 04 00 01 65 0d 01 04 05 00 00 00 00 00 4c 00 ff 00 74 00 65 00 73 00
    74 00 20 00 6d 00 61 00 63 00 72 00 6f 00 20 00 31 00 00 00 00 00 00 00 00 00 00 00 00 00
    00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 09 7c
    a5 5a 50 13 02 00 01 04 00 01 65 0e 01 04 10 00 00 00 00 03 28 00 ff 00 74 00 65 00 73 00
    74 00 20 00 6d 00 61 00 63 00 72 00 6f 00 20 00 32 00 00 00 00 00 00 00 00 00 00 00 00 00
    00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 03 63
    a5 5a 96 13 03 00 01 04 00 01 65 c6 08 01 c6 00 00 00 00 00 00 01 ff 03 c5 00 00 00 00 00
    00 0a ff 04 c6 00 00 00 00 00 00 01 ff 01 c5 00 00 00 00 00 00 00 ff 04 c5 00 00 00 00 00
    00 00 ff 03 c6 00 00 00 00 00 00 01 ff 02 c6 00 00 00 00 00 00 00 ff 02 c5 00 00 00 00 00
    00 00 ff 00 50 00 4f 00 57 00 45 00 52 00 5f 00 4f 00 4e 00 00 00 00 00 00 00 00 00 00 00
    00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 2c 6d 00 00 9c e7
    a5 5a 6e 13 04 00 01 04 00 01 65 c7 04 01 c7 00 00 00 00 00 00 01 ff 03 c7 00 00 00 00 00
    00 01 ff 04 c7 00 00 00 00 00 00 01 ff 02 c7 00 00 00 00 00 00 00 ff 00 50 00 4f 00 57 00
    45 00 52 00 5f 00 4f 00 46 00 46 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
    00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 01 03 c6 00 00 00 00 e7 56
    """

    payload = bytes(int(v, 16) for v in raw_hex.split())

    frames: list[bytes] = []
    idx = 0
    while idx < len(payload):
        next_idx = payload.find(b"\xA5\x5A", idx + 2)
        if next_idx == -1:
            frames.append(payload[idx:])
            break
        frames.append(payload[idx:next_idx])
        idx = next_idx

    completed: list[tuple[int, bytes, list[int]]] = []
    for frame in frames:
        opcode = int.from_bytes(frame[2:4], "big")
        frag_payload = frame[4:-1]
        completed.extend(assembler.feed(opcode, frag_payload, frame))

    assert len(completed) == 1
    activity_id, blob, boundaries = completed[0]
    assert activity_id == 0x65

    decoded = decode_macro_records(blob, activity_id, boundaries)
    assert decoded == [
        (0x65, 0x0D, "test macro 1"),
        (0x65, 0x0E, "test macro 2"),
    ]


def test_utf16_separator_byte_stripped_single_macro() -> None:
    """Same separator fix for a single-macro activity (0x66, macro 7 → 'test macro 3')."""
    # Frames 40-42 from the same capture.  Before the fix: "Gtest macro 3" (0x47 = 'G').
    assembler = MacroAssembler()

    raw_hex = """
    a5 5a 5a 13 01 00 01 03 00 01 66 07 02 01 05 00 00 00 00 00 a6 00 ff 07 06 00 00 00 00 00
    47 00 ff 00 74 00 65 00 73 00 74 00 20 00 6d 00 61 00 63 00 72 00 6f 00 20 00 33 00 00 00
    00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
    00 00 00 ba de
    a5 5a 96 13 02 00 01 03 00 01 66 c6 08 01 c6 00 00 00 00 00 00 01 ff 03 c6 00 00 00 00 00
    00 01 ff 07 c6 00 00 00 00 00 00 01 ff 01 c5 00 00 00 00 00 00 00 ff 03 c5 00 00 00 00 00
    00 07 ff 07 c5 00 00 00 00 00 00 00 ff 08 c6 00 00 00 00 00 00 00 ff 08 c5 00 00 00 00 00
    00 00 ff 00 50 00 4f 00 57 00 45 00 52 00 5f 00 4f 00 4e 00 00 00 00 00 00 00 00 00 00 00
    00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 27 78 35 00 00 e7 7b
    a5 5a 6e 13 03 00 01 03 00 01 66 c7 04 01 c7 00 00 00 00 00 00 01 ff 03 c7 00 00 00 00 00
    00 01 ff 07 c7 00 00 00 00 00 00 01 ff 08 c7 00 00 00 00 00 00 00 ff 00 50 00 4f 00 57 00
    45 00 52 00 5f 00 4f 00 46 00 46 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
    00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff ff ff ff ff ff ff 01 22 ca
    """

    payload = bytes(int(v, 16) for v in raw_hex.split())

    frames: list[bytes] = []
    idx = 0
    while idx < len(payload):
        next_idx = payload.find(b"\xA5\x5A", idx + 2)
        if next_idx == -1:
            frames.append(payload[idx:])
            break
        frames.append(payload[idx:next_idx])
        idx = next_idx

    completed: list[tuple[int, bytes, list[int]]] = []
    for frame in frames:
        opcode = int.from_bytes(frame[2:4], "big")
        frag_payload = frame[4:-1]
        completed.extend(assembler.feed(opcode, frag_payload, frame))

    assert len(completed) == 1
    activity_id, blob, boundaries = completed[0]
    assert activity_id == 0x66

    decoded = decode_macro_records(blob, activity_id, boundaries)
    assert decoded == [(0x66, 0x07, "test macro 3")]


def test_ascii_labeled_macroburst_decodes() -> None:
    assembler = MacroAssembler()

    raw_hex = """
    a5 5a fa 13 01 00 01 09 00 02 68 01 1b 03 1d 00 00 00 00 27 e4 00 ff 03 26 00 00 00 00 01 13
    00 ff 03 30 00 00 00 00 00 2a 00 ff 03 23 00 00 00 00 01 15 00 ff 03 23 00 00 00 00 01 15 00 ff
    03 23 00 00 00 00 01 15 00 ff 03 23 00 00 00 00 01 15 00 ff 03 23 00 00 00 00 01 15 00 ff 03 25
    00 00 00 00 03 29 00 ff 03 23 00 00 00 00 01 15 00 ff 03 23 00 00 00 00 01 15 00 ff 03 23 00 00
    00 00 01 15 00 ff 03 23 00 00 00 00 01 15 00 ff 03 23 00 00 00 00 01 15 00 ff 03 23 00 00 00 00
    01 15 00 ff 03 23 00 00 00 00 01 15 00 ff 03 25 00 00 00 00 03 29 00 ff 03 23 00 00 00 00 01 15
    00 ff 03 23 00 00 00 00 01 15 00 ff 03 23 00 00 00 00 01 15 00 ff 03 23 00 00 00 00 01 15 00 ff
    03 23 00 00 00 00 01 15 00 ff 03 25 00 00 00 00 03 29 00 ff 03 30 00 00 00 00 00 2a 00 ff 03 a2
    a5 5a 3f 13 01 00 02 23 00 00 00 00 01 15 00 ff 03 30 00 00 00 00 00 2a 00 ff 03 0d 00 00 00 00
    00 79 00 ff 50 53 35 20 53 74 61 72 74 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
    00 00 00 ae 24 a5 5a 78 13 02 00 01 09 00 01 68 02 08 02 95 00 00 00 00 00 2d 00 ff ff ff ff ff
    ff ff ff ff ff 01 02 97 00 00 00 00 00 2f 00 ff ff ff ff ff ff ff ff ff ff 01 02 98 00 00 00 00
    00 30 00 ff 02 4d 00 00 00 00 01 88 00 ff 02 97 00 00 00 00 00 2f 00 ff 02 9b 00 00 00 00 00 2a
    00 ff 50 53 35 20 4f 66 66 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
    2e f1 a5 5a 3c 13 03 00 01 09 00 01 68 03 02 03 14 00 00 00 00 2f 24 00 ff 02 3d 00 00 00 00 32
    04 00 ff 46 6f 72 63 65 20 53 77 69 74 63 68 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
    00 ca f1 a5 5a 32 13 04 00 01 09 00 01 68 04 01 06 01 00 00 00 00 00 01 00 ff 4b 74 63 68 6e 20
    50 6f 77 65 72 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 97 83 a5 5a 32 13 05 00
    01 09 00 01 68 05 01 06 0e 00 00 00 00 2e 77 00 ff 4b 74 63 68 6e 20 56 6f 6c 20 2b 00 00 00 00
    00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 b7 c5 a5 5a 32 13 06 00 01 09 00 01 68 06 01 06 0d
    00 00 00 00 00 33 00 ff 4b 74 63 68 6e 20 56 6f 6c 20 2d 00 00 00 00 00 00 00 00 00 00 00 00 00
    00 00 00 00 00 00 46 e5 a5 5a 46 13 07 00 01 09 00 01 68 07 03 02 95 00 00 00 00 00 2d 00 ff 02
    97 00 00 00 00 00 2f 00 ff 02 9b 00 00 00 00 00 2a 00 ff 50 53 35 20 48 6f 6d 65 00 00 00 00 00
    00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 3e eb a5 5a 64 13 08 00 01 09 00 01 68 c6
    06 03 c6 00 00 00 00 00 00 00 ff 02 c6 00 00 00 00 00 00 00 ff 03 c5 00 00 00 00 00 00 02 ff 02
    c5 00 00 00 00 00 00 08 ff 06 c6 00 00 00 00 00 00 00 ff 06 c5 00 00 00 00 00 00 00 ff 50 4f 57
    45 52 5f 4f 4e 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 7a 7b a5 5a 46
    13 09 00 01 09 00 01 68 c7 03 03 c7 00 00 00 00 00 00 00 ff 02 c7 00 00 00 00 00 00 00 ff 06 c7
    00 00 00 00 00 00 00 ff 50 4f 57 45 52 5f 4f 46 46 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
    00 00 00 00 00 00 58 1a
    """

    payload = bytes(int(value, 16) for value in raw_hex.split())

    frames: list[bytes] = []
    idx = 0
    while idx < len(payload):
        next_idx = payload.find(b"\xA5\x5A", idx + 2)
        if next_idx == -1:
            frames.append(payload[idx:])
            break
        frames.append(payload[idx:next_idx])
        idx = next_idx

    completed: list[tuple[int, bytes, list[int]]] = []
    for frame in frames:
        opcode = int.from_bytes(frame[2:4], "big")
        frag_payload = frame[4:-1]
        completed.extend(assembler.feed(opcode, frag_payload, frame))

    assert len(completed) == 1

    activity_id, blob, boundaries = completed[0]
    assert activity_id == 0x68

    decoded = decode_macro_records(blob, activity_id, boundaries)

    assert decoded == [
        (0x68, 0x01, "PS5 Start"),
        (0x68, 0x02, "PS5 Off"),
        (0x68, 0x03, "Force Switch"),
        (0x68, 0x04, "Ktchn Power"),
        (0x68, 0x05, "Ktchn Vol +"),
        (0x68, 0x06, "Ktchn Vol -"),
        (0x68, 0x07, "PS5 Home"),
    ]

