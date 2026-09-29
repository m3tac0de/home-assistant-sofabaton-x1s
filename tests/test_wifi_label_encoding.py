"""CR-L2-1: Wifi command and device labels are UTF-16BE slots on X1S/X2.

bench_270 (2026-09-29, X1S) showed the hub stores label bytes verbatim and
both the remote and our readers decode them big-endian. The old writer
(``b"\\x00" + text.encode("utf-16le")``) only matched for Latin-1 text.
"""

from __future__ import annotations

import pytest

from custom_components.sofabaton_x1s.lib.commands import _decode_schema_label, hub_command_label
from custom_components.sofabaton_x1s.lib.proxy_wifi_device import utf16be_label_slot


def _old_slot(text: str) -> bytes:
    return (b"\x00" + text.encode("utf-16le")[:59]).ljust(60, b"\x00")


@pytest.mark.parametrize("name", ["Bench One", "Küche", "Lights ÿ", "", "x" * 40])
def test_latin1_labels_are_byte_identical_to_the_old_writer(name):
    """Existing Latin-1 deployments must not change a single byte."""
    assert utf16be_label_slot(name, 60) == _old_slot(name)
    # The 0x?E0E command record: 7 zeros + a 59-byte field before, 6 zeros
    # + a 60-byte slot now; the same bytes on the wire.
    assert b"\x00" * 6 + utf16be_label_slot(name, 60) == b"\x00" * 7 + name.encode("utf-16le")[:59].ljust(59, b"\x00")


@pytest.mark.parametrize("name", ["Лампа", "灯光", "€ On", "Bench Энк"])
def test_non_latin_labels_read_back_as_written(name):
    slot = utf16be_label_slot(name, 60)
    assert len(slot) == 60
    readback = _decode_schema_label(slot, "utf-16-be")
    assert readback == name
    # The drift check compares hub_command_label projections: they now agree.
    assert hub_command_label(readback, "X1S") == hub_command_label(name, "X1S")
    assert slot != _old_slot(name), "the old writer garbled exactly these names"


def test_slot_never_ends_in_half_a_surrogate_pair():
    name = "a" * 29 + "\U0001F600"  # the emoji needs 4 bytes; only 2 are left
    slot = utf16be_label_slot(name, 60)
    assert len(slot) == 60
    assert _decode_schema_label(slot, "utf-16-be") == "a" * 29
