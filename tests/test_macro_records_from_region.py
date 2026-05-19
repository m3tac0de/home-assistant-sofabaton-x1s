"""Unit tests for the pure-function macro record parser.

These tests exercise :func:`macros.parse_macro_record_from_region` and
:func:`macros.parse_macro_records_from_burst` directly, against synthetic
regions built to the documented layout. Real-capture validation is layered on
top by :mod:`tests.test_phase3_real_capture` when captures are available.
"""

from __future__ import annotations

import pytest

from custom_components.sofabaton_x1s.const import (
    HUB_VERSION_X1,
    HUB_VERSION_X1S,
    HUB_VERSION_X2,
)
from custom_components.sofabaton_x1s.lib.macros import (
    MACRO_KEY_BEAN_SIZE,
    MACRO_KEY_BEAN_START,
    MACRO_LABEL_LEN_X1,
    MACRO_LABEL_LEN_X1S_X2,
    MACRO_WRITE_PAGE_BODY_CHUNK,
    MacroKeyEntry,
    MacroRecord,
    build_macro_save_payload,
    parse_macro_record_from_region,
    parse_macro_records_from_burst,
)


# ---------------------------------------------------------------------------
# Region-construction helpers
# ---------------------------------------------------------------------------


def _key_bean(
    *,
    device_id: int = 0x05,
    key_id: int = 0xC6,
    fid: int = 0x0001020304,
    duration: int = 0,
    delay: int = 100,
) -> bytes:
    return (
        bytes([device_id, key_id])
        + fid.to_bytes(6, "big")
        + bytes([duration, delay])
    )


def _delay_only_bean(delay_ms: int) -> bytes:
    """A delay-only entry uses ``key_id=0xFF``."""

    return bytes([0x00, 0xFF, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, delay_ms])


#: The label slot starts at ``length - (label_len + 1)``; the
#: final byte of each macro region is a record terminator (consistently
#: 0xFF on real captures, but the parser doesn't depend on the value).
_MACRO_REGION_TERMINATOR = 0xFF


def _x1_region(
    *,
    key_id: int,
    label: str,
    key_beans: list[bytes],
) -> bytes:
    """Build a macro region matching the X1 ASCII schema."""

    if len(key_beans) > 255:
        raise ValueError("max 255 key entries (1-byte count)")
    if len(label.encode("ascii")) > MACRO_LABEL_LEN_X1:
        raise ValueError(f"label too long for {MACRO_LABEL_LEN_X1}-byte ASCII slot")

    label_bytes = label.encode("ascii").ljust(MACRO_LABEL_LEN_X1, b"\x00")
    return (
        bytes([key_id, len(key_beans)])
        + b"".join(key_beans)
        + label_bytes
        + bytes([_MACRO_REGION_TERMINATOR])
    )


def _x1s_x2_region(
    *,
    key_id: int,
    label: str,
    key_beans: list[bytes],
) -> bytes:
    """Build a macro region matching the X1S/X2 UTF-16BE schema."""

    if len(key_beans) > 255:
        raise ValueError("max 255 key entries (1-byte count)")
    encoded = label.encode("utf-16-be")
    if len(encoded) > MACRO_LABEL_LEN_X1S_X2:
        raise ValueError(
            f"label too long for {MACRO_LABEL_LEN_X1S_X2}-byte UTF-16BE slot"
        )

    label_bytes = encoded.ljust(MACRO_LABEL_LEN_X1S_X2, b"\x00")
    return (
        bytes([key_id, len(key_beans)])
        + b"".join(key_beans)
        + label_bytes
        + bytes([_MACRO_REGION_TERMINATOR])
    )


# ---------------------------------------------------------------------------
# X1 (ASCII) tests
# ---------------------------------------------------------------------------


def test_x1_parses_key_id_label_and_inner_sequence() -> None:
    region = _x1_region(
        key_id=0xC6,
        label="WATCH_TV",
        key_beans=[
            _key_bean(device_id=0x03, key_id=0xC6, duration=0, delay=200),
            _delay_only_bean(delay_ms=150),
            _key_bean(device_id=0x05, key_id=0xAE, duration=0, delay=50),
        ],
    )

    record = parse_macro_record_from_region(
        region, activity_id=0x65, hub_version=HUB_VERSION_X1
    )

    assert isinstance(record, MacroRecord)
    assert record.activity_id == 0x65
    assert record.key_id == 0xC6
    assert record.label == "WATCH_TV"
    assert len(record.key_sequence) == 3
    assert record.key_sequence[0].device_id == 0x03
    assert record.key_sequence[0].key_id == 0xC6
    assert record.key_sequence[0].delay == 200
    assert record.key_sequence[0].is_delay_only is False
    assert record.key_sequence[0].entry_type == 1

    assert record.key_sequence[1].is_delay_only is True
    assert record.key_sequence[1].entry_type == 0
    assert record.key_sequence[1].delay == 150

    assert record.key_sequence[2].device_id == 0x05
    assert record.key_sequence[2].key_id == 0xAE


def test_x1_empty_sequence_still_yields_label() -> None:
    region = _x1_region(key_id=0xC7, label="PowerOff", key_beans=[])

    record = parse_macro_record_from_region(
        region, activity_id=0x65, hub_version=HUB_VERSION_X1
    )

    assert record is not None
    assert record.key_id == 0xC7
    assert record.label == "PowerOff"
    assert record.key_sequence == ()


def test_x1_label_trailing_nulls_and_whitespace_stripped() -> None:
    region = _x1_region(key_id=0xAE, label="  hello world  ", key_beans=[])

    record = parse_macro_record_from_region(
        region, activity_id=0x65, hub_version=HUB_VERSION_X1
    )

    assert record is not None
    assert record.label == "hello world"


# ---------------------------------------------------------------------------
# X1S/X2 (UTF-16BE) tests
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("hub_version", [HUB_VERSION_X1S, HUB_VERSION_X2])
def test_x1s_x2_parses_utf16be_label_and_sequence(hub_version: str) -> None:
    region = _x1s_x2_region(
        key_id=0xC6,
        label="Watch a movie",
        key_beans=[
            _key_bean(device_id=0x03, key_id=0xC6, duration=0, delay=250),
            _key_bean(device_id=0x05, key_id=0xAE, duration=0, delay=100),
        ],
    )

    record = parse_macro_record_from_region(
        region, activity_id=0x65, hub_version=hub_version
    )

    assert record is not None
    assert record.label == "Watch a movie"
    assert len(record.key_sequence) == 2
    assert record.key_sequence[0].device_id == 0x03


def test_x1s_x2_utf16be_label_with_non_ascii_codepoints() -> None:
    region = _x1s_x2_region(key_id=0xC6, label="évoquer", key_beans=[])

    record = parse_macro_record_from_region(
        region, activity_id=0x65, hub_version=HUB_VERSION_X1S
    )

    assert record is not None
    assert record.label == "évoquer"


def test_x1s_x2_utf16be_label_with_0xff_in_codepoint() -> None:
    # U+00FF encodes to 0x00 0xFF in UTF-16BE. The schema parser reads the
    # full slot, so this byte should be preserved in the decoded label.
    region = _x1s_x2_region(key_id=0xC6, label="AÿB", key_beans=[])

    record = parse_macro_record_from_region(
        region, activity_id=0x65, hub_version=HUB_VERSION_X1S
    )

    assert record is not None
    assert record.label == "AÿB"


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------


def test_too_short_region_returns_none() -> None:
    # Smaller than 2 (header) + 30 (X1 label slot) + 1 (terminator) = 33 bytes
    assert parse_macro_record_from_region(
        b"\x00" * 32, activity_id=0x65, hub_version=HUB_VERSION_X1
    ) is None


def test_unknown_hub_version_raises() -> None:
    region = _x1_region(key_id=0xC6, label="x", key_beans=[])
    with pytest.raises(ValueError, match="unknown hub_version"):
        parse_macro_record_from_region(
            region, activity_id=0x65, hub_version="unknown"
        )


def test_count_clamped_when_it_would_overlap_label_slot() -> None:
    # Build a region where the declared count would overlap the label slot.
    # Sequence is honest about its size (1 bean), but we'll lie in the
    # count byte to claim 50 beans (which would extend into the label).
    region = bytearray(
        _x1_region(
            key_id=0xC6,
            label="real label",
            key_beans=[_key_bean(device_id=0x03, key_id=0xC6)],
        )
    )
    # Lie: claim 50 beans in the header even though only 1 fits.
    region[1] = 50

    record = parse_macro_record_from_region(
        bytes(region), activity_id=0x65, hub_version=HUB_VERSION_X1
    )

    assert record is not None
    # Defensive: only beans that fit between the header and label slot
    # should be returned. Region layout: 2 (header) + 10 (one bean)
    # + 30 (label) + 1 (terminator) = 43 bytes; label_start = 43 - 31 = 12;
    # usable bean bytes = 12 - 2 = 10, so 1 bean fits.
    assert len(record.key_sequence) == 1
    assert record.label == "real label"


# ---------------------------------------------------------------------------
# parse_macro_records_from_burst
# ---------------------------------------------------------------------------


def test_parse_macro_records_from_burst_walks_boundaries() -> None:
    r1 = _x1_region(
        key_id=0xC6, label="WATCH_TV", key_beans=[_key_bean()]
    )
    r2 = _x1_region(
        key_id=0xC7, label="POWER_OFF", key_beans=[_delay_only_bean(100)]
    )
    payload = r1 + r2
    boundaries = [0, len(r1)]

    records = parse_macro_records_from_burst(
        payload,
        activity_id=0x65,
        record_boundaries=boundaries,
        hub_version=HUB_VERSION_X1,
    )

    assert len(records) == 2
    assert records[0].key_id == 0xC6
    assert records[0].label == "WATCH_TV"
    assert records[1].key_id == 0xC7
    assert records[1].label == "POWER_OFF"


def test_parse_macro_records_from_burst_skips_out_of_range_boundary() -> None:
    region = _x1_region(key_id=0xC6, label="x", key_beans=[])
    boundaries = [0, len(region) + 100]  # second boundary past EOF

    records = parse_macro_records_from_burst(
        region,
        activity_id=0x65,
        record_boundaries=boundaries,
        hub_version=HUB_VERSION_X1,
    )

    assert len(records) == 1
    assert records[0].key_id == 0xC6


def test_macro_key_entry_fid_round_trips_through_6_byte_be() -> None:
    fid = 0x0102030405
    bean = _key_bean(fid=fid)
    region = _x1_region(key_id=0xC6, label="x", key_beans=[bean])

    record = parse_macro_record_from_region(
        region, activity_id=0x65, hub_version=HUB_VERSION_X1
    )

    assert record is not None
    assert len(record.key_sequence) == 1
    assert record.key_sequence[0].fid == fid


# ---------------------------------------------------------------------------
# build_macro_save_payload — body invariants the hub enforces
# ---------------------------------------------------------------------------


def test_build_payload_multi_page_inner_body_checksum_is_consistent() -> None:
    """Phase 3.6 regression: total_pages and the inner-body checksum must
    agree with the final body bytes.

    The earlier bug computed the checksum with ``total_pages=1`` baked in,
    then the paged splitter overwrote ``body[1:3]`` to ``00 02`` without
    recomputing — producing a one-off checksum the hub rejected with
    ``STATUS_ACK payload=0c``.
    """

    # 20 rows on X1S → inner_body = 20*10 + 67 = 267 bytes → 2 pages.
    key_sequence = [
        MacroKeyEntry(device_id=d, key_id=0xC6, fid=0, duration=0, delay=0xFF)
        for d in range(1, 21)
    ]
    payload = build_macro_save_payload(
        activity_id=0x65,
        key_id=0xC6,
        key_sequence=key_sequence,
        label="POWER_ON",
        hub_version=HUB_VERSION_X1S,
    )
    inner_body = payload[3:]  # strip [0x01][outer_seq_be]

    assert len(inner_body) == 20 * 10 + 67 == 267
    # total_pages must reflect the actual chunk count.
    expected_pages = (len(inner_body) + MACRO_WRITE_PAGE_BODY_CHUNK - 1) // MACRO_WRITE_PAGE_BODY_CHUNK
    assert expected_pages == 2
    assert inner_body[1:3] == expected_pages.to_bytes(2, "big")
    # Checksum is sum of the body bytes excluding the checksum slot itself.
    assert inner_body[-1] == sum(inner_body[:-1]) & 0xFF


def test_build_payload_single_page_inner_body_checksum_is_consistent() -> None:
    """Single-page macros must also have a self-consistent checksum.

    Cross-checks that the same builder invariant holds in the common case
    that doesn't hit the paging path.
    """

    key_sequence = [
        MacroKeyEntry(device_id=d, key_id=0xC7, fid=0, duration=0, delay=0xFF)
        for d in range(1, 6)
    ]
    payload = build_macro_save_payload(
        activity_id=0x65,
        key_id=0xC7,
        key_sequence=key_sequence,
        label="POWER_OFF",
        hub_version=HUB_VERSION_X1S,
    )
    inner_body = payload[3:]

    assert inner_body[1:3] == b"\x00\x01"
    assert inner_body[-1] == sum(inner_body[:-1]) & 0xFF


def test_label_slot_bytes_round_trip_through_parse_build_parse() -> None:
    """Phase 3.5 regression: the raw label-slot bytes must survive
    parse → build → parse byte-for-byte.

    Real X1S/X2 hubs put non-zero metadata in the trailing portion of the
    label slot (e.g. ``37 37 00 00 35 35`` after ``POWER_ON``). The old
    builder re-encoded the slot from the decoded label string, wiping
    those bytes and triggering a hub rejection on the next save.
    """

    label_slot = bytearray(MACRO_LABEL_LEN_X1S_X2)
    encoded_label = "POWER_ON".encode("utf-16-be")
    label_slot[: len(encoded_label)] = encoded_label
    label_slot[-6:] = bytes.fromhex("37 37 00 00 35 35")

    key_beans = [_key_bean(device_id=0x01, key_id=0xC6, fid=0, duration=0, delay=0xFF)]
    region = (
        bytes([0xC6, len(key_beans)])
        + b"".join(key_beans)
        + bytes(label_slot)
        + bytes([_MACRO_REGION_TERMINATOR])
    )

    record = parse_macro_record_from_region(
        region, activity_id=0x65, hub_version=HUB_VERSION_X1S
    )
    assert record is not None
    assert record.raw_label_slot == bytes(label_slot)

    rebuilt_payload = build_macro_save_payload(
        activity_id=record.activity_id,
        key_id=record.key_id,
        key_sequence=record.key_sequence,
        label=record.label,
        hub_version=HUB_VERSION_X1S,
        label_slot=record.raw_label_slot,
    )

    # The rebuilt inner body's last 61 bytes are [label_slot(60)][checksum(1)].
    rebuilt_body = rebuilt_payload[3:]
    assert rebuilt_body[-(MACRO_LABEL_LEN_X1S_X2 + 1) : -1] == bytes(label_slot)
