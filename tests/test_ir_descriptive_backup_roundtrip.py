"""Round-trip verification for the user-provided "AWOLVision IR" backup.

The user captured a 28-command IR device backup off a real X2 hub.
The corpus exercises both branches of the IR decoder's content sniff:

* 26 commands carry descriptive ``P:NEC ...`` payloads — the decoder
  matches the magic prefix at bytes 2..8, returns a structured
  ``decoded`` block, and the encoder round-trips exactly.
* 2 commands carry raw IR captures (commands 1 "Power" and 26
  "powertoggle_recorded") — the content sniff fails, the decoder
  returns ``None``, and the row keeps the raw-only behavior the
  ``ir`` class had before this decoder existed.

If any of the descriptive rows fails to round-trip exactly, or any
non-descriptive row leaks through the decoder, we cannot trust the
IR decoder on real-world rows.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

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

from custom_components.sofabaton_x1s.lib.blob_decoders import (  # noqa: E402
    encode_decoded_blob,
    try_decode_blob,
)
from custom_components.sofabaton_x1s.lib.protocol_const import (  # noqa: E402
    DEVICE_CLASS_IR,
)


# Descriptive rows: (command_id, name, data_hex, expected_descriptor)
IR_DESCRIPTIVE_BACKUP: list[tuple[int, str, str, str]] = [
    (2, "Brightness", "00 1d 00 00 11 00 94 70 50 3a 4e 45 43 20 52 3a 33 38 34 30 30 20 44 3a 30 20 53 3a 32 30 36 20 46 3a 31 32 35 00 00 00 00", "P:NEC R:38400 D:0 S:206 F:125"),
    (3, "Exit", "00 1c 00 00 11 00 94 70 50 3a 4e 45 43 20 52 3a 33 38 34 30 30 20 44 3a 30 20 53 3a 32 30 36 20 46 3a 39 32 00 00 00 00", "P:NEC R:38400 D:0 S:206 F:92"),
    (4, "Guide", "00 1c 00 00 11 00 94 70 50 3a 4e 45 43 20 52 3a 33 38 34 30 30 20 44 3a 30 20 53 3a 32 30 36 20 46 3a 34 30 00 00 00 00", "P:NEC R:38400 D:0 S:206 F:40"),
    (5, "Info", "00 1c 00 00 11 00 94 70 50 3a 4e 45 43 20 52 3a 33 38 34 30 30 20 44 3a 30 20 53 3a 32 30 36 20 46 3a 33 39 00 00 00 00", "P:NEC R:38400 D:0 S:206 F:39"),
    (6, "Play", "00 1c 00 00 11 00 94 70 50 3a 4e 45 43 20 52 3a 33 38 34 30 30 20 44 3a 30 20 53 3a 32 30 36 20 46 3a 34 30 00 00 00 00", "P:NEC R:38400 D:0 S:206 F:40"),
    (7, "Power toggle", "00 1c 00 00 11 00 94 70 50 3a 4e 45 43 20 52 3a 33 38 34 30 30 20 44 3a 30 20 53 3a 32 30 36 20 46 3a 32 36 00 00 00 00", "P:NEC R:38400 D:0 S:206 F:26"),
    (8, "Setting", "00 1c 00 00 11 00 94 70 50 3a 4e 45 43 20 52 3a 33 38 34 30 30 20 44 3a 30 20 53 3a 32 30 36 20 46 3a 31 35 00 00 00 00", "P:NEC R:38400 D:0 S:206 F:15"),
    (9, "Sound", "00 1d 00 00 11 00 94 70 50 3a 4e 45 43 20 52 3a 33 38 34 30 30 20 44 3a 30 20 53 3a 32 30 36 20 46 3a 31 35 38 00 00 00 00", "P:NEC R:38400 D:0 S:206 F:158"),
    (10, "Source", "00 1c 00 00 11 00 94 70 50 3a 4e 45 43 20 52 3a 33 38 34 30 30 20 44 3a 30 20 53 3a 32 30 36 20 46 3a 31 38 00 00 00 00", "P:NEC R:38400 D:0 S:206 F:18"),
    (11, "Stop", "00 1c 00 00 11 00 94 70 50 3a 4e 45 43 20 52 3a 33 38 34 30 30 20 44 3a 30 20 53 3a 32 30 36 20 46 3a 39 32 00 00 00 00", "P:NEC R:38400 D:0 S:206 F:92"),
    (12, "Back", "00 1c 00 00 11 00 94 70 50 3a 4e 45 43 20 52 3a 33 38 34 30 30 20 44 3a 30 20 53 3a 32 30 36 20 46 3a 39 32 00 00 00 00", "P:NEC R:38400 D:0 S:206 F:92"),
    (13, "Channel_down", "00 1c 00 00 11 00 94 70 50 3a 4e 45 43 20 52 3a 33 38 34 30 30 20 44 3a 30 20 53 3a 32 30 36 20 46 3a 33 39 00 00 00 00", "P:NEC R:38400 D:0 S:206 F:39"),
    (14, "Channel_up", "00 1c 00 00 11 00 94 70 50 3a 4e 45 43 20 52 3a 33 38 34 30 30 20 44 3a 30 20 53 3a 32 30 36 20 46 3a 33 38 00 00 00 00", "P:NEC R:38400 D:0 S:206 F:38"),
    (15, "Home", "00 1c 00 00 11 00 94 70 50 3a 4e 45 43 20 52 3a 33 38 34 30 30 20 44 3a 30 20 53 3a 32 30 36 20 46 3a 39 31 00 00 00 00", "P:NEC R:38400 D:0 S:206 F:91"),
    (16, "Menu", "00 1c 00 00 11 00 94 70 50 3a 4e 45 43 20 52 3a 33 38 34 30 30 20 44 3a 30 20 53 3a 32 30 36 20 46 3a 38 30 00 00 00 00", "P:NEC R:38400 D:0 S:206 F:80"),
    (17, "Mute", "00 1c 00 00 11 00 94 70 50 3a 4e 45 43 20 52 3a 33 38 34 30 30 20 44 3a 30 20 53 3a 32 30 36 20 46 3a 32 37 00 00 00 00", "P:NEC R:38400 D:0 S:206 F:27"),
    (18, "Navigate_down", "00 1c 00 00 11 00 94 70 50 3a 4e 45 43 20 52 3a 33 38 34 30 30 20 44 3a 30 20 53 3a 32 30 36 20 46 3a 33 39 00 00 00 00", "P:NEC R:38400 D:0 S:206 F:39"),
    (19, "Navigate_left", "00 1c 00 00 11 00 94 70 50 3a 4e 45 43 20 52 3a 33 38 34 30 30 20 44 3a 30 20 53 3a 32 30 36 20 46 3a 33 36 00 00 00 00", "P:NEC R:38400 D:0 S:206 F:36"),
    (20, "Navigate_right", "00 1c 00 00 11 00 94 70 50 3a 4e 45 43 20 52 3a 33 38 34 30 30 20 44 3a 30 20 53 3a 32 30 36 20 46 3a 33 37 00 00 00 00", "P:NEC R:38400 D:0 S:206 F:37"),
    (21, "Navigate_up", "00 1c 00 00 11 00 94 70 50 3a 4e 45 43 20 52 3a 33 38 34 30 30 20 44 3a 30 20 53 3a 32 30 36 20 46 3a 33 38 00 00 00 00", "P:NEC R:38400 D:0 S:206 F:38"),
    (22, "Ok/select", "00 1c 00 00 11 00 94 70 50 3a 4e 45 43 20 52 3a 33 38 34 30 30 20 44 3a 30 20 53 3a 32 30 36 20 46 3a 34 30 00 00 00 00", "P:NEC R:38400 D:0 S:206 F:40"),
    (23, "Pause", "00 1c 00 00 11 00 94 70 50 3a 4e 45 43 20 52 3a 33 38 34 30 30 20 44 3a 30 20 53 3a 32 30 36 20 46 3a 34 30 00 00 00 00", "P:NEC R:38400 D:0 S:206 F:40"),
    (24, "Volume_down", "00 1c 00 00 11 00 94 70 50 3a 4e 45 43 20 52 3a 33 38 34 30 30 20 44 3a 30 20 53 3a 32 30 36 20 46 3a 31 31 00 00 00 00", "P:NEC R:38400 D:0 S:206 F:11"),
    (25, "Volume_up", "00 1c 00 00 11 00 94 70 50 3a 4e 45 43 20 52 3a 33 38 34 30 30 20 44 3a 30 20 53 3a 32 30 36 20 46 3a 31 30 00 00 00 00", "P:NEC R:38400 D:0 S:206 F:10"),
    (27, "discrete_on", "00 1c 00 00 11 00 94 70 50 3a 4e 45 43 20 52 3a 33 38 34 30 30 20 44 3a 30 20 53 3a 32 30 35 20 46 3a 32 39 00 00 00 00", "P:NEC R:38400 D:0 S:205 F:29"),
    (28, "discrete_off", "00 1c 00 00 11 00 94 70 50 3a 4e 45 43 20 52 3a 33 38 34 30 30 20 44 3a 30 20 53 3a 32 30 35 20 46 3a 32 38 00 00 00 00", "P:NEC R:38400 D:0 S:205 F:28"),
]


# Non-descriptive raw IR captures: (command_id, name, data_hex_prefix)
# Only the leading bytes matter for the content-sniff assertion; full
# blobs are stored on the disk fixture and would only bloat the
# parametrize source. The full bytes are in the original backup file.
IR_RAW_BACKUP: list[tuple[int, str, str]] = [
    (1, "Power", "02 48 00 00 00 00 96 df"),
    (26, "powertoggle_recorded", "01 20 00 00 00 00 95 29"),
]


@pytest.mark.parametrize(
    "command_id,name,data_hex,expected_descriptor", IR_DESCRIPTIVE_BACKUP
)
def test_ir_descriptive_command_roundtrip(command_id, name, data_hex, expected_descriptor):
    raw = bytes.fromhex(data_hex.replace(" ", ""))
    decoded = try_decode_blob(DEVICE_CLASS_IR, raw)
    assert decoded is not None, f"command_id {command_id} ({name}) failed to decode"
    assert decoded["class"] == "ir"
    assert decoded["fields"] == {"descriptor": expected_descriptor}
    # The hub's writer always emits 4 trailing nulls after the
    # declared region; the decoder captures them in trailer_hex so
    # round-trip stays byte-exact without any "emit 4 nulls" rule
    # on the encoder side.
    assert decoded["trailer_hex"] == "00 00 00 00"

    re_encoded = encode_decoded_blob(decoded)
    assert re_encoded == raw, f"command_id {command_id} ({name}) did not round-trip"


@pytest.mark.parametrize("command_id,name,data_hex_prefix", IR_RAW_BACKUP)
def test_ir_non_descriptive_command_returns_none(command_id, name, data_hex_prefix):
    """Raw IR captures must fall through the content sniff.

    The decoder content-sniffs the descriptive magic at bytes 2..8.
    Real raw captures have a different family header (declared length
    in 0..2, then a different metadata block — e.g. ``95 29`` or
    ``96 df`` instead of the descriptive ``94 70``). The decoder
    MUST return ``None`` for these so the row keeps its raw-only
    behavior and the backup carries no ``decoded`` block.
    """

    prefix = bytes.fromhex(data_hex_prefix.replace(" ", ""))
    # Pad to a reasonable length — the prefix alone is enough to fail
    # the sniff, but a real readback would be much longer; this proves
    # the magic check happens before any length-dependent path runs.
    blob = prefix + b"\x00" * 200
    assert try_decode_blob(DEVICE_CLASS_IR, blob) is None, (
        f"command_id {command_id} ({name}) leaked through the content sniff"
    )


def test_ir_corpus_covers_descriptive_and_raw_branches():
    """The 28-row backup covers both decoder branches.

    Locking the corpus split in a single assertion catches future
    edits that accidentally drop a row from one of the lists.
    """

    descriptive_ids = {row[0] for row in IR_DESCRIPTIVE_BACKUP}
    raw_ids = {row[0] for row in IR_RAW_BACKUP}
    # 28 commands, split 26 descriptive / 2 raw.
    assert len(descriptive_ids) == 26
    assert len(raw_ids) == 2
    assert descriptive_ids.isdisjoint(raw_ids)
    assert descriptive_ids | raw_ids == set(range(1, 29))


def test_synthesis_writer_and_backup_decoder_agree_on_body_bytes():
    """Test/Save Blob writer and backup decoder share one byte layout.

    Both paths now route through
    :func:`render_ir_descriptive_blob_body` for the
    ``len + magic + descriptor`` structural body. The synthesis
    writer adds four trailing 0x00 bytes (the writer's convention);
    the round-trip decoder captures those nulls in ``trailer_hex``
    and re-emits them verbatim.

    For every descriptive row in the user's backup, the canonical
    helper must reproduce the captured ``data_hex`` bytes up to the
    trailer. Regression guard against any future divergence.
    """

    from custom_components.sofabaton_x1s.lib.blob_decoders import (
        render_ir_descriptive_blob_body,
    )

    for command_id, name, data_hex, expected_descriptor in IR_DESCRIPTIVE_BACKUP:
        raw = bytes.fromhex(data_hex.replace(" ", ""))
        # The decoder captures trailer_hex = "00 00 00 00" for every
        # row in this corpus; the body bytes precede it.
        expected_body = raw[:-4]

        via_canonical = render_ir_descriptive_blob_body(expected_descriptor)

        assert via_canonical == expected_body, (
            f"command_id {command_id} ({name}): canonical writer does "
            f"not reproduce body bytes"
        )


def test_ir_descriptive_corpus_covers_two_path_length_variants():
    """Descriptor lengths in this corpus span 0x1c (28) and 0x1d (29).

    The 2-byte BE declared-length field is the IR decoder's only
    numeric structural field besides the descriptor bytes. Exercising
    both values is the regression guard against the length being
    miscomputed on edit.
    """

    declared_lens = set()
    for _, _, data_hex, _ in IR_DESCRIPTIVE_BACKUP:
        words = data_hex.split()
        declared_lens.add(int(words[0], 16) << 8 | int(words[1], 16))
    assert declared_lens == {0x001C, 0x001D}
