"""Wire-byte tests for the unified family-0x46 builder + parser.

These tests pin the canonical layout described in
:mod:`custom_components.sofabaton_x1s.lib.inputs` -- the trailing
region in particular (4 control-key rows + 10 favorite rows + state
byte) is the field that earlier builders got wrong by treating it as
a single opaque 108-byte block.
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
from custom_components.sofabaton_x1s.lib.inputs import (
    INPUTS_BODY_HEADER_LEN,
    INPUTS_OUTER_WRAPPER_LEN,
    ControlKeyBlock,
    FavoriteSlot,
    InputEntry,
    build_inputs_write,
    parse_inputs_burst,
)


# Constants from the layout docstring; duplicated here so the test
# acts as a contract check against the module's stated invariants.
_TRAILING_REGION_LEN = 4 * 9 + 10 * 7 + 1   # 107


# ---------------------------------------------------------------------------
# Builder structural checks
# ---------------------------------------------------------------------------


def test_build_x1_empty_page_has_canonical_length_and_checksum() -> None:
    """X1 page with no entries: 3 outer + 8 body header + 0 entries +
    107 trailing + 1 checksum = 119 bytes total."""

    payload = build_inputs_write(hub_version=HUB_VERSION_X1, device_id=0x0B)

    assert len(payload) == INPUTS_OUTER_WRAPPER_LEN + INPUTS_BODY_HEADER_LEN + 0 + _TRAILING_REGION_LEN + 1
    assert len(payload) == 119

    # Outer wrapper: [page-marker=0x01][outer_seq_be=0x0001].
    assert payload[0:3] == b"\x01\x00\x01"

    body = payload[INPUTS_OUTER_WRAPPER_LEN:]

    # Body marker + total_pages_be = 1 (whole body fits in one chunk).
    assert body[0] == 0x01
    assert body[1:3] == b"\x00\x01"
    # device_id at body[3]; source_id default 0x01; count 0; flags 0.
    assert body[3] == 0x0B
    assert body[4] == 0x01
    assert body[5] == 0x00
    assert body[6:8] == b"\x00\x00"

    # Trailing region is all zeros for an empty page; checksum is sum of
    # everything before the final byte.
    assert body[-1] == sum(body[:-1]) & 0xFF
    assert all(b == 0 for b in body[INPUTS_BODY_HEADER_LEN : -1])


def test_build_x1s_two_entries_uses_48_byte_stride_with_explicit_ordinal() -> None:
    entries = [
        InputEntry(key_id=0x12, fid=0x000042AABBCC, ordinal=1, label="HDMI 1"),
        InputEntry(key_id=0x13, fid=0x000042AABBCD, ordinal=2, label="Roku"),
    ]
    payload = build_inputs_write(
        hub_version=HUB_VERSION_X1S,
        device_id=0x0B,
        entries=entries,
    )

    body = payload[INPUTS_OUTER_WRAPPER_LEN:]
    entry_region_start = INPUTS_BODY_HEADER_LEN
    stride = 48

    # entry[0]: key_id 0x12, fid 6-byte BE, ordinal 1, then 40-byte UTF-16BE label.
    row0 = body[entry_region_start : entry_region_start + stride]
    assert row0[0] == 0x12
    assert row0[1:7] == (0x000042AABBCC).to_bytes(6, "big")
    assert row0[7] == 1
    assert row0[8:48] == "HDMI 1".encode("utf-16-be").ljust(40, b"\x00")

    # entry[1]: same structure, ordinal 2.
    row1 = body[entry_region_start + stride : entry_region_start + 2 * stride]
    assert row1[0] == 0x13
    assert row1[7] == 2
    assert row1[8:48] == "Roku".encode("utf-16-be").ljust(40, b"\x00")

    # Trailing region starts right after the entries.
    trailing_start = entry_region_start + 2 * stride
    assert len(body) - trailing_start - 1 == _TRAILING_REGION_LEN
    # body checksum stays self-consistent.
    assert body[-1] == sum(body[:-1]) & 0xFF


def test_build_x1_entry_uses_27_byte_stride_with_ascii_label() -> None:
    entries = [InputEntry(key_id=0x05, fid=0x0000_0000_1234, ordinal=1, label="HDMI 1")]
    payload = build_inputs_write(
        hub_version=HUB_VERSION_X1,
        device_id=0x01,
        entries=entries,
    )

    body = payload[INPUTS_OUTER_WRAPPER_LEN:]
    row = body[INPUTS_BODY_HEADER_LEN : INPUTS_BODY_HEADER_LEN + 27]

    assert len(row) == 27
    assert row[0] == 0x05
    assert row[1:7] == (0x0000_0000_1234).to_bytes(6, "big")
    # X1 stride has no ordinal byte: label slot starts at offset 7.
    assert row[7:27] == b"HDMI 1".ljust(20, b"\x00")


def test_favorites_land_in_trailing_region_at_canonical_offset() -> None:
    """Favorites live at offset = body_header + entries + 4*9 from the
    body start. This is the slot the old "108 bytes of zeros" trailing
    region was clobbering."""

    favorites = [
        FavoriteSlot(payload=b"\xAA\xBB\xCC\xDD\xEE\xFF\x01"),  # slot 0
        FavoriteSlot(),  # slot 1: empty (zero-fill)
        FavoriteSlot(payload=b"\x11\x22\x33\x44\x55\x66\x77"),  # slot 2
    ]
    payload = build_inputs_write(
        hub_version=HUB_VERSION_X1,
        device_id=0x0B,
        favorites=favorites,
    )

    body = payload[INPUTS_OUTER_WRAPPER_LEN:]
    entry_region_len = 0  # no entries
    favorites_offset = (
        INPUTS_BODY_HEADER_LEN + entry_region_len + 4 * 9  # past control-key rows
    )

    # Slot 0 carries our 7 bytes verbatim.
    assert body[favorites_offset : favorites_offset + 7] == b"\xAA\xBB\xCC\xDD\xEE\xFF\x01"
    # Slot 1 is the zero-filled default.
    assert body[favorites_offset + 7 : favorites_offset + 14] == b"\x00" * 7
    # Slot 2 carries its 7 bytes.
    assert body[favorites_offset + 14 : favorites_offset + 21] == b"\x11\x22\x33\x44\x55\x66\x77"
    # Slots 3..9 stay zero.
    assert body[favorites_offset + 21 : favorites_offset + 70] == b"\x00" * 49


def test_control_keys_land_at_start_of_trailing_region() -> None:
    keys = ControlKeyBlock(
        input_list=b"\x01\x02\x03\x04\x05\x06\x07\x08\x09",
        input_confirm=b"\x10\x11\x12\x13\x14\x15\x16\x17\x18",
    )
    payload = build_inputs_write(
        hub_version=HUB_VERSION_X1,
        device_id=0x0B,
        control_keys=keys,
    )

    body = payload[INPUTS_OUTER_WRAPPER_LEN:]
    trailing_start = INPUTS_BODY_HEADER_LEN  # no entries

    # input_list slot: first 9 trailing bytes.
    assert body[trailing_start : trailing_start + 9] == keys.input_list
    # input_up / input_down slots default to zero (we didn't pass any).
    assert body[trailing_start + 9 : trailing_start + 18] == b"\x00" * 9
    assert body[trailing_start + 18 : trailing_start + 27] == b"\x00" * 9
    # input_confirm slot: bytes 27..36 of the trailing region.
    assert body[trailing_start + 27 : trailing_start + 36] == keys.input_confirm


# ---------------------------------------------------------------------------
# Parser & round-trip
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("hub_version", [HUB_VERSION_X1, HUB_VERSION_X1S, HUB_VERSION_X2])
def test_round_trip_preserves_entries_and_trailing_region(hub_version: str) -> None:
    entries = [
        InputEntry(key_id=0x12, fid=0x0000_0000_4242, ordinal=1, label="HDMI"),
        InputEntry(key_id=0x13, fid=0x0000_0000_4243, ordinal=2, label="Roku"),
    ]
    keys = ControlKeyBlock(input_list=b"\xAA" * 9)
    favorites = [
        FavoriteSlot(payload=b"\x01\x02\x03\x04\x05\x06\x07"),
        FavoriteSlot(),
        FavoriteSlot(payload=b"\x10\x20\x30\x40\x50\x60\x70"),
    ]

    payload = build_inputs_write(
        hub_version=hub_version,
        device_id=0x0B,
        source_id_byte=0x01,
        entries=entries,
        control_keys=keys,
        favorites=favorites,
        state_byte=0x42,
    )

    record = parse_inputs_burst([payload], hub_version=hub_version)

    assert record.device_id == 0x0B
    assert record.source_id_byte == 0x01
    assert record.state_byte == 0x42
    assert len(record.entries) == 2
    assert record.entries[0].key_id == 0x12
    assert record.entries[0].label == "HDMI"
    assert record.entries[1].key_id == 0x13
    assert record.entries[1].label == "Roku"
    assert record.control_keys.input_list == b"\xAA" * 9
    assert record.favorites[0].payload == b"\x01\x02\x03\x04\x05\x06\x07"
    assert record.favorites[2].payload == b"\x10\x20\x30\x40\x50\x60\x70"


def test_parse_unknown_hub_version_raises() -> None:
    with pytest.raises(ValueError, match="unknown hub_version"):
        parse_inputs_burst([b"\x01\x00\x01" + b"\x01\x00\x01\x00\x01\x00\x00\x00" + b"\x00" * 110], hub_version="X3")


def test_x1_entry_fid_round_trip_at_48_bit_range() -> None:
    """A1 regression: the old X1 builder allocated 2 bytes for fid and
    zero-padded the rest; any fid >= 65536 wrote into the label slot.
    The new builder uses the full 6-byte / 48-bit slot.
    """

    big_fid = 0x0000_1234_5678_9ABC  # well past the 16-bit range
    entry = InputEntry(key_id=0x42, fid=big_fid, ordinal=1, label="x")
    payload = build_inputs_write(
        hub_version=HUB_VERSION_X1,
        device_id=0x01,
        entries=[entry],
    )

    body = payload[INPUTS_OUTER_WRAPPER_LEN:]
    row = body[INPUTS_BODY_HEADER_LEN : INPUTS_BODY_HEADER_LEN + 27]
    assert row[1:7] == big_fid.to_bytes(6, "big")
    # Label slot is intact -- 'x' followed by 19 null bytes, not
    # corrupted by spillover from the fid encoding.
    assert row[7:27] == b"x".ljust(20, b"\x00")


def test_input_entry_rejects_out_of_range_values() -> None:
    with pytest.raises(ValueError, match="key_id"):
        InputEntry(key_id=0x100, fid=0, ordinal=1, label="x")
    with pytest.raises(ValueError, match="fid"):
        InputEntry(key_id=0x01, fid=1 << 48, ordinal=1, label="x")


def test_build_rejects_overcapacity_favorites() -> None:
    with pytest.raises(ValueError, match="10-slot capacity"):
        build_inputs_write(
            hub_version=HUB_VERSION_X1,
            device_id=0x01,
            favorites=[FavoriteSlot()] * 11,
        )


def test_restore_inputs_mode_two_writes_zero_at_body_field_four() -> None:
    """Regression for the ``input_mode==2`` conflation.

    The device record's ``input_mode==2`` means "no input switching"
    on this device (e.g. a soundbar with a fixed input). The
    family-0x46 page that disables inputs on the hub must carry
    ``source_id_byte == 0`` at the body header's offset four with an
    empty entry list -- non-zero values there cause the hub to reject
    the write with STATUS_ACK=0x09. Earlier revisions copied the
    device record's ``input_mode`` byte into this slot, which worked
    for ``input_mode==0`` and ``input_mode==1`` and silently broke
    for ``input_mode==2``.
    """

    payload = build_inputs_write(
        hub_version=HUB_VERSION_X1,
        device_id=0x0D,
        source_id_byte=0,  # the canonical "disable inputs" value
    )

    body = payload[INPUTS_OUTER_WRAPPER_LEN:]
    # body[0] marker, body[1..2] total_pages_be, body[3] device_id,
    # body[4] source_id_byte (the field this regression guards),
    # body[5] entry_count, body[6..7] flag_a/flag_b.
    assert body[3] == 0x0D
    assert body[4] == 0x00, (
        "source_id_byte must be zero on the disable-inputs page; "
        "writing the device record's input_mode here triggers a "
        "STATUS_ACK=0x09 rejection."
    )
    assert body[5] == 0, "entry_count must be zero on the disable page"
