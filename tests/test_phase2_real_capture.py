"""Verify the fixed-width command layout against a real X1 multi-page capture.

A user captured this 4-page REQ_COMMANDS response from a real X1 hub for
device 0x07, expecting 22 commands. This test reconstructs the assembly
by the documented assembly rules and walks records with the strict 40-byte stride to
see whether real hub data matches the documented layout or diverges.
"""

from __future__ import annotations


RAW_FRAMES_HEX = (
    # Frame 1 — header, page 1/4, dev=0x07, total_commands=22
    "a5 5a f7 5d 01 00 01 01 00 04 16 07 01 1a 00 00 00 00 17 13 6b 61 6e 74 6f 6f 72 20 6f 6e 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 07 02 1a 00 00 00 00 17 18 6b 61 6e 74 6f 6f 72 20 6f 66 66 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 07 03 1a 00 00 00 00 17 13 48 75 69 73 20 6f 6e 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 07 04 1a 00 00 00 00 17 18 48 75 69 73 20 6f 66 66 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 07 05 1a 00 00 00 00 17 13 4b 65 72 73 74 76 65 72 6c 69 63 68 74 69 6e 67 20 6f 6e 00 00 00 00 00 00 00 00 00 00 00 ff 07 06 1a 00 00 00 00 17 18 4b 65 72 73 74 76 65 72 6c 69 63 68 74 69 6e 67 20 6f 66 66 00 00 00 00 00 00 00 00 00 00 ff d6",
    # Frame 2 — page 2/4
    "a5 5a f3 5d 01 00 02 07 07 1a 00 00 00 00 17 13 47 61 72 61 67 65 20 6f 6e 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 07 08 1a 00 00 00 00 17 18 47 61 72 61 67 65 20 6f 66 66 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 07 09 1a 00 00 00 00 17 13 43 6c 65 6f 20 6b 61 6d 65 72 20 6f 6e 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 07 0a 1a 00 00 00 00 17 18 43 6c 65 6f 20 6b 61 6d 65 72 20 6f 66 66 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 07 0b 1a 00 00 00 00 17 13 49 6e 6e 65 20 4b 61 6d 65 72 20 6f 6e 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 07 0c 1a 00 00 00 00 17 18 49 6e 6e 65 20 4b 61 6d 65 72 20 6f 66 66 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 86",
    # Frame 3 — page 3/4
    "a5 5a f3 5d 01 00 03 07 0d 1a 00 00 00 00 17 13 53 6f 75 73 74 65 72 72 61 69 6e 20 6f 6e 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 07 0e 1a 00 00 00 00 17 18 53 6f 75 73 74 65 72 72 61 69 6e 20 6f 66 66 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 07 0f 1a 00 00 00 00 17 13 48 61 6c 6c 77 61 79 20 6f 6e 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 07 10 1a 00 00 00 00 17 18 48 61 6c 6c 77 61 79 20 6f 66 66 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 07 11 1a 00 00 00 00 17 13 54 6f 6d 6f 20 6b 61 6d 65 72 20 6f 6e 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 07 12 1a 00 00 00 00 17 18 54 6f 6d 6f 20 6b 61 6d 65 72 20 6f 66 66 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 03",
    # Frame 4 — final page 4/4
    "a5 5a a3 5d 01 00 04 07 13 1a 00 00 00 00 17 13 48 75 69 73 20 61 72 65 61 20 6f 6e 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 07 14 1a 00 00 00 00 17 18 48 75 69 73 20 61 72 65 61 20 6f 66 66 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 07 15 1a 00 00 00 00 17 13 47 61 6d 69 6e 67 20 64 65 73 6b 20 6f 6e 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 07 16 1a 00 00 00 00 17 18 47 61 6d 69 6e 67 20 64 65 73 6b 20 6f 66 66 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 10",
)

EXPECTED_LABELS = [
    "kantoor on", "kantoor off",
    "Huis on", "Huis off",
    "Kerstverlichting on", "Kerstverlichting off",
    "Garage on", "Garage off",
    "Cleo kamer on", "Cleo kamer off",
    "Inne Kamer on", "Inne Kamer off",
    "Sousterrain on", "Sousterrain off",
    "Hallway on", "Hallway off",
    "Tomo kamer on", "Tomo kamer off",
    "Huis area on", "Huis area off",
    "Gaming desk on", "Gaming desk off",
]


def _assemble_reference(frames: list[bytes]) -> bytes:
    """Assemble by taking raw[7 : 7 + (raw[2] - 3)] from each frame
    and concatenate in order. NO per-frame preamble strip.
    """
    bodies = []
    for raw in frames:
        body_len = (raw[2] & 0xFF) - 3
        bodies.append(raw[7 : 7 + body_len])
    return b"".join(bodies)


def test_real_x1_capture_against_apk_schema() -> None:
    frames = [bytes.fromhex(s.replace(" ", "")) for s in RAW_FRAMES_HEX]

    # Verify frame-format invariant on each frame
    for i, raw in enumerate(frames):
        op_hi = raw[2] & 0xFF
        payload_len = len(raw) - 5
        print(f"Frame {i}: opcode_hi={op_hi}, payload_len={payload_len}, "
              f"invariant_holds={op_hi == payload_len}")
        assert op_hi == payload_len, (
            f"Frame {i} violates frame invariant: opcode_hi={op_hi} != "
            f"payload_len={payload_len}"
        )

    # Reference assembly
    concat = _assemble_reference(frames)
    print(f"\nassembled concat length: {len(concat)} bytes")
    print(f"concat[0..10]: {concat[:10].hex()}")
    print(f"concat[3] (count?): {concat[3]} = 0x{concat[3]:02x}")
    print(f"Expected count: 22")

    # Walk records at strict 40-byte stride (X1 layout)
    print(f"\n--- strict 40-byte stride walk ---")
    count = concat[3] & 0xFF
    print(f"count from concat[3] = {count}")
    apk_records = []
    for i in range(count):
        start = 4 + i * 40
        end = start + 40
        if end > len(concat):
            print(f"  rec[{i}]: OUT OF BOUNDS at offset {start}")
            break
        record = concat[start:end]
        dev_id = record[0]
        cmd_id = record[1]
        label_bytes = record[9:39]
        label = label_bytes.decode("ascii", errors="replace").rstrip("\x00").strip()
        sort_id = record[39]
        # ASCII-safe print for Windows
        safe_label = ascii(label)
        marker = " " if (dev_id == 0x07 and cmd_id == i + 1) else " <<< MISALIGNED"
        print(f"  rec[{i}]: offset={start:4d} dev=0x{dev_id:02X} cmd=0x{cmd_id:02X} "
              f"sort=0x{sort_id:02X} label={safe_label}{marker}")
        apk_records.append((dev_id, cmd_id, label))

    # Now try an alternative interpretation: stride = 42 (40 record + 1 ff + ???)
    # Actually first let's measure stride empirically by finding `ff 07` separators.
    print(f"\n--- Empirical: positions where `ff 07` (separator + dev_id) appears ---")
    positions = []
    for i in range(len(concat) - 1):
        if concat[i] == 0xFF and i + 1 < len(concat) and concat[i + 1] == 0x07:
            positions.append(i)
    print(f"ff-positions: {positions}")
    if len(positions) >= 2:
        deltas = [positions[i+1] - positions[i] for i in range(len(positions) - 1)]
        print(f"deltas between ff-positions: {deltas}")
        print(f"average stride: {sum(deltas)/len(deltas):.1f}")


def test_new_parser_matches_real_x1_capture() -> None:
    """Run iter_command_records_from_assembled on the real capture and
    assert it produces all 22 expected commands."""

    from custom_components.sofabaton_x1s.const import HUB_VERSION_X1
    from custom_components.sofabaton_x1s.lib.commands import (
        iter_command_records_from_assembled,
    )

    frames = [bytes.fromhex(s.replace(" ", "")) for s in RAW_FRAMES_HEX]
    concat = _assemble_reference(frames)
    count = concat[3] & 0xFF
    assert count == 22

    # Integration's view = concat[4:] (the assembler strips the 4-byte
    # preamble: page-1 leading byte, total_pages BE, count)
    body = concat[4:]

    records = list(
        iter_command_records_from_assembled(
            body, count=count, dev_id=0x07, hub_version=HUB_VERSION_X1
        )
    )

    assert len(records) == 22
    assert all(r.dev_id == 0x07 for r in records)
    assert [r.command_id for r in records] == list(range(1, 23))
    assert [r.label for r in records] == EXPECTED_LABELS
