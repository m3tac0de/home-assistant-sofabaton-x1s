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

from custom_components.sofabaton_x1s.lib.macros import MacroAssembler, decode_macro_records
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

    act, blob = completed[0]
    assert act == activity_id
    decoded = decode_macro_records(blob, activity_id)
    assert decoded == [(activity_id, 1, "TEST1")]


def test_x1s_multi_page_macroburst_out_of_order() -> None:
    assembler = MacroAssembler()
    activity_id = 0x69

    record1 = make_macro_record(1, "MAC1")
    record2 = make_macro_record(2, "MAC2", step_count=3, step_start=20)
    assembled = record1 + record2

    split1 = assembled[:40]
    split2 = assembled[40:90]
    split3 = assembled[90:]

    frames = [
        build_macro_frame(0x64, 1, 3, activity_id, body=split1),
        build_macro_frame(0x64, 2, 3, activity_id, body=split2),
        build_macro_frame(0x64, 3, 3, activity_id, body=split3),
    ]

    opcode = int.from_bytes(frames[0][2:4], "big")

    completed = []
    # Feed out of order
    for idx in (1, 0, 2):
        frame = frames[idx]
        payload = frame[4:-1]
        completed.extend(assembler.feed(opcode, payload, frame))

    assert len(completed) == 1
    act, blob = completed[0]
    assert act == activity_id

    decoded = decode_macro_records(blob, activity_id)
    labels = [label for _, _, label in decoded]
    assert labels == ["MAC1", "MAC2"]


def test_x1_continuation_macroburst() -> None:
    assembler = MacroAssembler()
    activity_id = 0x68

    record1 = make_macro_record(1, "PS5 Start", step_count=0x1B)
    record2 = make_macro_record(2, "PS5 Off", step_count=3, step_start=50)
    record3 = make_macro_record(3, "PS5 Other", step_count=3, step_start=90)

    assembled = record1 + record2 + record3

    first_chunk = assembled[:223]
    second_chunk = assembled[223:400]
    remaining = assembled[400:]

    frames = [
        build_macro_frame(0xFA, 1, 9, activity_id, header_y=0x02, body=first_chunk),
        build_macro_frame(0x3F, 1, 0x23, 0x00, header_x=0x02, header_y=0x00, body=second_chunk),
        build_macro_frame(0x78, 2, 9, activity_id, body=remaining[:50]),
        build_macro_frame(0x3C, 3, 9, activity_id, body=remaining[50:100]),
        build_macro_frame(0x32, 4, 9, activity_id, body=remaining[100:150]),
        build_macro_frame(0x32, 5, 9, activity_id, body=remaining[150:200]),
        build_macro_frame(0x32, 6, 9, activity_id, body=remaining[200:250]),
        build_macro_frame(0x46, 7, 9, activity_id, body=remaining[250:300]),
        build_macro_frame(0x64, 8, 9, activity_id, body=remaining[300:350]),
        build_macro_frame(0x46, 9, 9, activity_id, body=remaining[350:]),
    ]

    opcode = int.from_bytes(frames[0][2:4], "big")
    completed = []

    for idx in (0, 1, 2, 3, 4, 5, 6, 7, 8, 9):
        frame = frames[idx]
        payload = frame[4:-1]
        completed.extend(assembler.feed(opcode, payload, frame))

    assert len(completed) == 1
    act, blob = completed[0]
    assert act == activity_id

    decoded = decode_macro_records(blob, activity_id)
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

    assembled_a = rec_a1 + rec_a2
    assembled_b = rec_b1 + rec_b2

    a_split1 = assembled_a[:30]
    a_split2 = assembled_a[30:]

    b_split1 = assembled_b[:25]
    b_split2 = assembled_b[25:60]
    b_split3 = assembled_b[60:]

    frames = [
        build_macro_frame(0x64, 1, 2, act_a, body=a_split1),
        build_macro_frame(0x64, 1, 3, act_b, body=b_split1),
        build_macro_frame(0x64, 2, 2, act_a, body=a_split2),
        build_macro_frame(0x64, 2, 3, act_b, body=b_split2),
        build_macro_frame(0x64, 3, 3, act_b, body=b_split3),
    ]

    opcode = int.from_bytes(frames[0][2:4], "big")
    completed = []

    for frame in frames:
        payload = frame[4:-1]
        completed.extend(assembler.feed(opcode, payload, frame))

    assert len(completed) == 2

    decoded = {act: decode_macro_records(blob, act) for act, blob in completed}

    labels_a = [label for _, _, label in decoded[act_a]]
    labels_b = [label for _, _, label in decoded[act_b]]

    assert labels_a == ["A1", "A2"]
    assert labels_b == ["B1", "B2"]


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

    completed: list[tuple[int, bytes]] = []
    for frame in frames:
        opcode = int.from_bytes(frame[2:4], "big")
        frag_payload = frame[4:-1]
        completed.extend(assembler.feed(opcode, frag_payload, frame))

    assert len(completed) == 1

    activity_id, blob = completed[0]
    assert activity_id == 0x68

    decoded = decode_macro_records(blob, activity_id)

    assert decoded == [
        (0x68, 0x03, "PS5 Start"),
        (0x68, 0x02, "PS5 Off"),
        (0x68, 0x02, "Force Switch"),
        (0x68, 0x01, "Ktchn Power"),
        (0x68, 0x0E, "Ktchn Vol +"),
        (0x68, 0x0D, "Ktchn Vol -"),
        (0x68, 0x07, "PS5 Home"),
    ]

