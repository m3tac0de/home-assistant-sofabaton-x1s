"""Tests for ``lib/macros.py``.

This file covers:

- :func:`parse_macro_burst_frame` per-frame metadata extraction (still used
  by the assembler to drive page-cycle resets)
- The :class:`MacroAssembler` + assembled parser pipeline on a real X1
  ASCII multi-macro capture

Schema-based unit-test coverage of the new parser lives in
``tests/test_macro_records_from_region.py``; real-capture end-to-end
coverage on X1S lives in ``tests/test_phase3_real_capture.py``; the
opcode-handler integration is exercised in ``tests/test_opcode_handlers.py``.
"""

from __future__ import annotations

import sys
from pathlib import Path
from tests._stub_packages import ensure_stub_package

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


ensure_stub_package("custom_components", ROOT / "custom_components")
ensure_stub_package(
    "custom_components.sofabaton_x1s", ROOT / "custom_components" / "sofabaton_x1s"
)
ensure_stub_package(
    "custom_components.sofabaton_x1s.lib",
    ROOT / "custom_components" / "sofabaton_x1s" / "lib",
)

from custom_components.sofabaton_x1s.const import HUB_VERSION_X1
from custom_components.sofabaton_x1s.lib.macros import (
    MacroAssembler,
    parse_macro_burst_frame,
    parse_macro_records_from_burst,
)


# ---------------------------------------------------------------------------
# parse_macro_burst_frame — per-frame metadata extraction
# ---------------------------------------------------------------------------


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


# ---------------------------------------------------------------------------
# Assembler + schema parser end-to-end on a real X1 ASCII multi-macro burst
# ---------------------------------------------------------------------------


_X1_MULTI_MACRO_BURST_HEX = """
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


def _x1_burst_frames() -> list[bytes]:
    """The captured X1 burst (activity 0x68, nine macros), split on SYNC0/SYNC1."""
    stream = bytes(int(value, 16) for value in _X1_MULTI_MACRO_BURST_HEX.split())
    frames: list[bytes] = []
    idx = 0
    while idx < len(stream):
        next_idx = stream.find(b"\xA5\x5A", idx + 2)
        if next_idx == -1:
            frames.append(stream[idx:])
            break
        frames.append(stream[idx:next_idx])
        idx = next_idx
    return frames


def test_x1_ascii_multi_macro_burst_assembles_and_parses() -> None:
    """Real captured X1 burst with 7 user macros plus POWER_ON / POWER_OFF.
    Exercises ``MacroAssembler`` page-cycle handling plus the schema-based
    :func:`parse_macro_records_from_burst` for X1 ASCII labels."""

    frames = _x1_burst_frames()

    assembler = MacroAssembler()
    completed: list[tuple[int, bytes, list[int]]] = []
    for frame in frames:
        opcode = int.from_bytes(frame[2:4], "big")
        payload = frame[4:-1]
        completed.extend(assembler.feed(opcode, payload, frame))

    assert len(completed) == 1
    activity_id, blob, boundaries = completed[0]
    assert activity_id == 0x68

    records = parse_macro_records_from_burst(
        blob,
        activity_id=activity_id,
        record_boundaries=boundaries,
        hub_version=HUB_VERSION_X1,
    )

    pairs = [(r.activity_id, r.key_id, r.label) for r in records]
    # The hub sends all 9 macros (7 user macros + auto POWER_ON/POWER_OFF).
    # POWER_* filtering is the production handler's responsibility (see
    # opcode_handlers.MacroHandler); the parser returns everything.
    assert pairs == [
        (0x68, 0x01, "PS5 Start"),
        (0x68, 0x02, "PS5 Off"),
        (0x68, 0x03, "Force Switch"),
        (0x68, 0x04, "Ktchn Power"),
        (0x68, 0x05, "Ktchn Vol +"),
        (0x68, 0x06, "Ktchn Vol -"),
        (0x68, 0x07, "PS5 Home"),
        (0x68, 0xC6, "POWER_ON"),
        (0x68, 0xC7, "POWER_OFF"),
    ]


def test_macro_assembler_reset_drops_an_interrupted_burst() -> None:
    """CR-L2-3: an interrupted REQ_MACROS burst left a partial buffer that the
    next fetch for the same activity appended to (stale record, duplicate
    key, a record missing). A new request resets the activity's buffer."""

    frames = _x1_burst_frames()

    def feed(assembler: MacroAssembler, batch: list[bytes]) -> list:
        done = []
        for frame in batch:
            done.extend(assembler.feed(int.from_bytes(frame[2:4], "big"), frame[4:-1], frame))
        return done

    assembler = MacroAssembler()
    assert feed(assembler, frames[:3]) == []          # the connection dropped mid-burst
    assembler.reset(0x68)                              # the next REQ_MACROS for the activity
    completed = feed(assembler, frames)
    assert len(completed) == 1
    activity_id, blob, boundaries = completed[0]
    records = parse_macro_records_from_burst(
        blob, activity_id=activity_id, record_boundaries=boundaries, hub_version=HUB_VERSION_X1,
    )
    assert [r.key_id for r in records] == [0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0xC6, 0xC7]
    assert [r.label for r in records][:2] == ["PS5 Start", "PS5 Off"]



def test_frame_parser_and_assembler_agree_on_continuation_offsets() -> None:
    """CR-L2-12: parse_macro_burst_frame reported data_start 7 for a
    continuation while the assembler strips 3; both now use one rule."""
    from custom_components.sofabaton_x1s.lib.macros import parse_macro_burst_frame

    frames = _x1_burst_frames()
    continuation = frames[1]  # the second frame of the capture continues record 1
    opcode = int.from_bytes(continuation[2:4], "big")
    parsed = parse_macro_burst_frame(opcode, continuation)
    assert parsed is not None and parsed.role == "continuation"
    assert parsed.data_start == 3
    head = parse_macro_burst_frame(int.from_bytes(frames[0][2:4], "big"), frames[0])
    assert head is not None and head.role == "record_start" and head.data_start == 7
    assert head.activity_id == 0x68
