"""Unit tests for the pure-function keymap record iterator.

These tests exercise :func:`commands.iter_keymap_records` and
:class:`commands.KeymapRecord` directly. End-to-end behavior continues to be
covered by :mod:`tests.test_commands` and :mod:`tests.test_x1_proxy`, which
go through :meth:`state_helpers.StateHelpers.replace_keymap_rows` and
therefore exercise this iterator as a consumer.
"""

from __future__ import annotations

from custom_components.sofabaton_x1s.lib.commands import (
    KEYMAP_RECORD_SIZE,
    KeymapRecord,
    iter_keymap_records,
)


# ---------------------------------------------------------------------------
# Record-construction helpers
# ---------------------------------------------------------------------------


def _record(
    *,
    activity_id: int,
    button_id: int,
    device_id: int,
    command_id: int,
    long_press_device_id: int | None = None,
    long_press_command_id: int | None = None,
) -> bytes:
    """Build a single 18-byte keymap record matching the documented schema."""

    raw = bytearray(KEYMAP_RECORD_SIZE)
    raw[0] = activity_id
    raw[1] = button_id
    raw[2] = device_id
    raw[9] = command_id

    if long_press_device_id is not None or long_press_command_id is not None:
        # Long-press shape: raw[10]!=0, raw[11:15]==0, raw[15]==0x4E, raw[17]=cmd
        assert long_press_device_id is not None and long_press_device_id != 0
        assert long_press_command_id is not None
        raw[10] = long_press_device_id
        # raw[11..14] are already zero
        raw[15] = 0x4E
        raw[17] = long_press_command_id

    return bytes(raw)


# ---------------------------------------------------------------------------
# Field accessor tests
# ---------------------------------------------------------------------------


def test_keymap_record_exposes_documented_fields() -> None:
    record = KeymapRecord(
        raw=_record(activity_id=0x42, button_id=0xAE, device_id=0x03, command_id=0x07)
    )

    assert record.activity_id == 0x42
    assert record.button_id == 0xAE
    assert record.device_id == 0x03
    assert record.command_id == 0x07
    assert record.has_long_press is False
    assert record.long_press_device_id is None
    assert record.long_press_command_id is None


def test_keymap_record_detects_long_press_shape() -> None:
    raw = _record(
        activity_id=0x42,
        button_id=0xAE,
        device_id=0x03,
        command_id=0x07,
        long_press_device_id=0x04,
        long_press_command_id=0x09,
    )
    record = KeymapRecord(raw=raw)

    assert record.has_long_press is True
    assert record.long_press_device_id == 0x04
    assert record.long_press_command_id == 0x09


def test_keymap_record_long_press_requires_marker_byte() -> None:
    raw = bytearray(_record(activity_id=0x42, button_id=0xAE, device_id=0x03, command_id=0x07))
    raw[10] = 0x04         # long-press device id candidate
    raw[15] = 0x00         # but no 0x4E marker
    raw[17] = 0x09         # candidate cmd
    record = KeymapRecord(raw=bytes(raw))

    assert record.has_long_press is False
    assert record.long_press_device_id is None
    assert record.long_press_command_id is None


def test_keymap_record_long_press_requires_zero_block() -> None:
    raw = bytearray(_record(activity_id=0x42, button_id=0xAE, device_id=0x03, command_id=0x07))
    raw[10] = 0x04
    raw[11] = 0x55  # contaminates the zero block at [11..15]
    raw[15] = 0x4E
    raw[17] = 0x09
    record = KeymapRecord(raw=bytes(raw))

    assert record.has_long_press is False


# ---------------------------------------------------------------------------
# Iterator tests
# ---------------------------------------------------------------------------


def test_iter_keymap_records_walks_exact_strides() -> None:
    a = _record(activity_id=0x42, button_id=0xAE, device_id=0x03, command_id=0x07)
    b = _record(activity_id=0x42, button_id=0xB6, device_id=0x03, command_id=0x08)
    c = _record(activity_id=0x42, button_id=0xB9, device_id=0x03, command_id=0x09)

    records = list(iter_keymap_records(a + b + c))

    assert len(records) == 3
    assert [r.button_id for r in records] == [0xAE, 0xB6, 0xB9]
    assert [r.command_id for r in records] == [0x07, 0x08, 0x09]


def test_iter_keymap_records_filters_by_expected_activity_id() -> None:
    matching = _record(activity_id=0x42, button_id=0xAE, device_id=0x03, command_id=0x07)
    other = _record(activity_id=0x55, button_id=0xB6, device_id=0x03, command_id=0x08)

    records = list(iter_keymap_records(matching + other, expected_activity_id=0x42))

    assert len(records) == 1
    assert records[0].activity_id == 0x42
    assert records[0].button_id == 0xAE


def test_iter_keymap_records_emits_all_without_filter() -> None:
    matching = _record(activity_id=0x42, button_id=0xAE, device_id=0x03, command_id=0x07)
    other = _record(activity_id=0x55, button_id=0xB6, device_id=0x03, command_id=0x08)

    records = list(iter_keymap_records(matching + other))

    assert [r.activity_id for r in records] == [0x42, 0x55]


def test_iter_keymap_records_ignores_short_trailing_remainder() -> None:
    a = _record(activity_id=0x42, button_id=0xAE, device_id=0x03, command_id=0x07)
    short_tail = b"\x42\xB6\x03"  # 3 bytes — looks like a record start but incomplete

    records = list(iter_keymap_records(a + short_tail))

    assert len(records) == 1
    assert records[0].button_id == 0xAE


def test_iter_keymap_records_on_empty_buffer_yields_nothing() -> None:
    assert list(iter_keymap_records(b"")) == []


def test_iter_keymap_records_on_buffer_smaller_than_one_record() -> None:
    assert list(iter_keymap_records(b"\x42\xAE\x03")) == []


def test_iter_keymap_records_preserves_long_press_metadata() -> None:
    raw = _record(
        activity_id=0x42,
        button_id=0xAE,
        device_id=0x03,
        command_id=0x07,
        long_press_device_id=0x04,
        long_press_command_id=0x09,
    )

    [record] = list(iter_keymap_records(raw))

    assert record.has_long_press is True
    assert record.long_press_device_id == 0x04
    assert record.long_press_command_id == 0x09
