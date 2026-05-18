"""Unit tests for the fixed-width command record iterator.

These tests exercise :func:`commands.iter_command_records_from_assembled`
directly. Equivalence-against-legacy-parser coverage lives in this module
plus the existing :mod:`tests.test_commands`.
"""

from __future__ import annotations

import pytest

from custom_components.sofabaton_x1s.const import (
    HUB_VERSION_X1,
    HUB_VERSION_X1S,
    HUB_VERSION_X2,
)
from custom_components.sofabaton_x1s.lib.commands import (
    COMMAND_RECORD_LABEL_LEN_X1,
    COMMAND_RECORD_LABEL_LEN_X1S_X2,
    COMMAND_RECORD_LABEL_OFFSET,
    COMMAND_RECORD_STRIDE_X1,
    COMMAND_RECORD_STRIDE_X1S_X2,
    iter_command_records_from_assembled,
)


# ---------------------------------------------------------------------------
# Record-construction helpers
# ---------------------------------------------------------------------------


def _x1_record(
    *,
    dev_id: int,
    command_id: int,
    code_type: int = 0x0A,
    fid_bytes: bytes = bytes(6),
    label: str,
) -> bytes:
    """Build a 40-byte X1 command record matching the documented layout."""

    assert len(fid_bytes) == 6
    label_bytes = label.encode("ascii").ljust(COMMAND_RECORD_LABEL_LEN_X1, b"\x00")
    return (
        bytes([dev_id, command_id, code_type])
        + fid_bytes
        + label_bytes
        + bytes([command_id])  # sort_id at offset 39
    )


def _x1s_record(
    *,
    dev_id: int,
    command_id: int,
    code_type: int = 0x1C,
    fid_bytes: bytes = bytes(6),
    label: str,
) -> bytes:
    """Build a 70-byte X1S/X2 command record matching the documented layout."""

    assert len(fid_bytes) == 6
    encoded = label.encode("utf-16-be")
    if len(encoded) > COMMAND_RECORD_LABEL_LEN_X1S_X2:
        raise ValueError("label too long for UTF-16BE 60-byte slot")
    label_bytes = encoded.ljust(COMMAND_RECORD_LABEL_LEN_X1S_X2, b"\x00")
    return (
        bytes([dev_id, command_id, code_type])
        + fid_bytes
        + label_bytes
        + bytes([command_id])  # sort_id at offset 69
    )


# ---------------------------------------------------------------------------
# X1 (ASCII) tests
# ---------------------------------------------------------------------------


def test_x1_walks_count_records_at_40_byte_stride() -> None:
    body = b"".join([
        _x1_record(dev_id=0x09, command_id=0x01, label="Dim the lights 1"),
        _x1_record(dev_id=0x09, command_id=0x02, label="Close the curtains"),
        _x1_record(dev_id=0x09, command_id=0x03, label="Light tester"),
    ])

    records = list(iter_command_records_from_assembled(
        body, count=3, dev_id=0x09, hub_version=HUB_VERSION_X1
    ))

    assert len(records) == 3
    assert [r.command_id for r in records] == [1, 2, 3]
    assert [r.label for r in records] == [
        "Dim the lights 1",
        "Close the curtains",
        "Light tester",
    ]
    assert all(r.dev_id == 0x09 for r in records)


def test_x1_label_trailing_nulls_and_whitespace_are_stripped() -> None:
    body = _x1_record(dev_id=0x05, command_id=0x07, label="  hello  ")
    [record] = list(iter_command_records_from_assembled(
        body, count=1, dev_id=0x05, hub_version=HUB_VERSION_X1
    ))

    assert record.label == "hello"  # outer whitespace and padding both stripped


def test_x1_label_with_internal_whitespace_preserved() -> None:
    body = _x1_record(dev_id=0x05, command_id=0x07, label="Volume Up")
    [record] = list(iter_command_records_from_assembled(
        body, count=1, dev_id=0x05, hub_version=HUB_VERSION_X1
    ))

    assert record.label == "Volume Up"


# ---------------------------------------------------------------------------
# X1S/X2 (UTF-16BE) tests
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("hub_version", [HUB_VERSION_X1S, HUB_VERSION_X2])
def test_x1s_x2_walks_count_records_at_70_byte_stride(hub_version: str) -> None:
    body = b"".join([
        _x1s_record(dev_id=0x04, command_id=0x01, label="Power"),
        _x1s_record(dev_id=0x04, command_id=0x02, label="Volume Up"),
    ])

    records = list(iter_command_records_from_assembled(
        body, count=2, dev_id=0x04, hub_version=hub_version
    ))

    assert len(records) == 2
    assert [r.command_id for r in records] == [1, 2]
    assert [r.label for r in records] == ["Power", "Volume Up"]
    assert all(r.dev_id == 0x04 for r in records)


def test_x1s_x2_utf16be_label_with_non_ascii_codepoints() -> None:
    body = _x1s_record(dev_id=0x04, command_id=0x01, label="évoquer")  # éVoquer style
    [record] = list(iter_command_records_from_assembled(
        body, count=1, dev_id=0x04, hub_version=HUB_VERSION_X1S
    ))

    assert record.label == "évoquer"


def test_x1s_x2_utf16be_label_with_0xff_byte_is_preserved() -> None:
    # U+00FF encodes to 0x00 0xFF in UTF-16BE. The app reads the full slot,
    # so this byte should be preserved, not treated as a delimiter.
    body = _x1s_record(dev_id=0x04, command_id=0x01, label="AÿB")
    [record] = list(iter_command_records_from_assembled(
        body, count=1, dev_id=0x04, hub_version=HUB_VERSION_X1S
    ))

    assert record.label == "AÿB"


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------


def test_count_zero_yields_no_records() -> None:
    body = _x1_record(dev_id=0x09, command_id=0x01, label="ignored")
    records = list(iter_command_records_from_assembled(
        body, count=0, dev_id=0x09, hub_version=HUB_VERSION_X1
    ))
    assert records == []


def test_truncated_body_stops_when_records_run_out() -> None:
    # Two complete records, one truncated.
    body = (
        _x1_record(dev_id=0x09, command_id=0x01, label="alpha")
        + _x1_record(dev_id=0x09, command_id=0x02, label="beta")
        + _x1_record(dev_id=0x09, command_id=0x03, label="gamma")[:20]
    )
    records = list(iter_command_records_from_assembled(
        body, count=5, dev_id=0x09, hub_version=HUB_VERSION_X1
    ))

    # Only the two complete records yield; truncated third is silently skipped.
    assert [r.command_id for r in records] == [1, 2]


def test_unknown_hub_version_raises_value_error() -> None:
    with pytest.raises(ValueError, match="unknown hub_version"):
        list(iter_command_records_from_assembled(
            b"\x00" * 40, count=1, dev_id=0x09, hub_version="unknown"
        ))


def test_dev_id_field_correctly_reports_record_byte_0() -> None:
    """The legacy iter_command_records has a fast-path that mis-reports
    dev_id as the format byte (chunk[2]). The new function reads it from
    record[0] correctly, even when record[0] != the requested dev_id (which
    shouldn't happen in well-formed bursts but exercises the field's source).
    """
    body = _x1_record(dev_id=0x42, command_id=0x07, label="x")
    [record] = list(iter_command_records_from_assembled(
        body, count=1, dev_id=0x42, hub_version=HUB_VERSION_X1
    ))

    assert record.dev_id == 0x42
    assert record.command_id == 0x07


# ---------------------------------------------------------------------------
# Fixture-based regression tests for representative real-shape bursts
# ---------------------------------------------------------------------------


def test_x1_6record_burst_full_roundtrip() -> None:
    """X1 single-page fixture matching the shape of real wire data:
    6 records with ASCII labels, matching the documented burst layout."""

    body = b"".join([
        _x1_record(
            dev_id=0x09,
            command_id=cmd_id,
            code_type=0x0A,
            fid_bytes=bytes([0x00, 0x00, 0x00, 0x00, 0x4E, control_lo]),
            label=label,
        )
        for cmd_id, control_lo, label in [
            (0x01, 0x21, "Dim the lights 1"),
            (0x02, 0x22, "Close the curtains"),
            (0x03, 0x23, "Light tester"),
            (0x04, 0x24, "Command 4"),
            (0x05, 0x25, "test fav"),
            (0x06, 0x26, "Command 6 hey ho"),
        ]
    ])

    records = list(iter_command_records_from_assembled(
        body, count=6, dev_id=0x09, hub_version=HUB_VERSION_X1
    ))
    pairs = [(r.command_id, r.label) for r in records]

    assert pairs == [
        (1, "Dim the lights 1"),
        (2, "Close the curtains"),
        (3, "Light tester"),
        (4, "Command 4"),
        (5, "test fav"),
        (6, "Command 6 hey ho"),
    ]


def test_x1s_2record_burst_utf16be_roundtrip() -> None:
    """X1S/X2 single-page fixture, two records with UTF-16BE labels."""

    body = b"".join([
        _x1s_record(dev_id=0x04, command_id=0x01, label="Power"),
        _x1s_record(dev_id=0x04, command_id=0x02, label="Volume Up"),
    ])

    records = list(iter_command_records_from_assembled(
        body, count=2, dev_id=0x04, hub_version=HUB_VERSION_X1S
    ))
    pairs = {(r.command_id, r.label) for r in records}

    assert pairs == {(1, "Power"), (2, "Volume Up")}
