"""Round-trip verification for the user-provided wifi_roku backup.

The user captured a 20-command ``wifi_roku`` device backup off a real
X1 hub. Each command is one launch-app slot on the same Roku target,
so the corpus exercises:

* path-length variants (30 bytes for ``short`` press, 29 bytes for
  ``long`` press), encoded as the 1-byte length prefix `0x1e` / `0x1d`
* contiguous command-index increment across all 20 slots
* a 3-byte opaque trailer per row, captured verbatim

If any of these 20 fails to round-trip exactly, we cannot trust the
decoder on real-world wifi_roku rows, full stop.
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
    DEVICE_CLASS_WIFI_ROKU,
)


# (command_id, name, data_hex, expected_path, expected_trailer)
ROKU_BACKUP: list[tuple[int, str, str, str, str]] = [
    (1, "Command 1", "1e 6c 61 75 6e 63 68 2f 63 62 33 38 33 35 33 39 36 38 34 62 2f 31 30 2f 30 2f 73 68 6f 72 74 d3 9a 34", "launch/cb383539684b/10/0/short", "d3 9a 34"),
    (2, "Command 2", "1e 6c 61 75 6e 63 68 2f 63 62 33 38 33 35 33 39 36 38 34 62 2f 31 30 2f 31 2f 73 68 6f 72 74 d6 a1 42", "launch/cb383539684b/10/1/short", "d6 a1 42"),
    (3, "Command 3", "1e 6c 61 75 6e 63 68 2f 63 62 33 38 33 35 33 39 36 38 34 62 2f 31 30 2f 32 2f 73 68 6f 72 74 d9 a8 50", "launch/cb383539684b/10/2/short", "d9 a8 50"),
    (4, "Command 4", "1e 6c 61 75 6e 63 68 2f 63 62 33 38 33 35 33 39 36 38 34 62 2f 31 30 2f 33 2f 73 68 6f 72 74 dc af 5e", "launch/cb383539684b/10/3/short", "dc af 5e"),
    (5, "Command 5", "1e 6c 61 75 6e 63 68 2f 63 62 33 38 33 35 33 39 36 38 34 62 2f 31 30 2f 34 2f 73 68 6f 72 74 df b6 6c", "launch/cb383539684b/10/4/short", "df b6 6c"),
    (6, "Command 6", "1e 6c 61 75 6e 63 68 2f 63 62 33 38 33 35 33 39 36 38 34 62 2f 31 30 2f 35 2f 73 68 6f 72 74 e2 bd 7a", "launch/cb383539684b/10/5/short", "e2 bd 7a"),
    (7, "Command 7", "1e 6c 61 75 6e 63 68 2f 63 62 33 38 33 35 33 39 36 38 34 62 2f 31 30 2f 36 2f 73 68 6f 72 74 e5 c4 88", "launch/cb383539684b/10/6/short", "e5 c4 88"),
    (8, "Command 8", "1e 6c 61 75 6e 63 68 2f 63 62 33 38 33 35 33 39 36 38 34 62 2f 31 30 2f 37 2f 73 68 6f 72 74 e8 cb 96", "launch/cb383539684b/10/7/short", "e8 cb 96"),
    (9, "Command 9", "1e 6c 61 75 6e 63 68 2f 63 62 33 38 33 35 33 39 36 38 34 62 2f 31 30 2f 38 2f 73 68 6f 72 74 eb d2 a4", "launch/cb383539684b/10/8/short", "eb d2 a4"),
    (10, "Command 10", "1e 6c 61 75 6e 63 68 2f 63 62 33 38 33 35 33 39 36 38 34 62 2f 31 30 2f 39 2f 73 68 6f 72 74 15 27 4e", "launch/cb383539684b/10/9/short", "15 27 4e"),
    (11, "Command 1 Long Press", "1d 6c 61 75 6e 63 68 2f 63 62 33 38 33 35 33 39 36 38 34 62 2f 31 30 2f 30 2f 6c 6f 6e 67 39 70 e0", "launch/cb383539684b/10/0/long", "39 70 e0"),
    (12, "Command 2 Long Press", "1d 6c 61 75 6e 63 68 2f 63 62 33 38 33 35 33 39 36 38 34 62 2f 31 30 2f 31 2f 6c 6f 6e 67 3c 77 ee", "launch/cb383539684b/10/1/long", "3c 77 ee"),
    (13, "Command 3 Long Press", "1d 6c 61 75 6e 63 68 2f 63 62 33 38 33 35 33 39 36 38 34 62 2f 31 30 2f 32 2f 6c 6f 6e 67 3f 7e fc", "launch/cb383539684b/10/2/long", "3f 7e fc"),
    (14, "Command 4 Long Press", "1d 6c 61 75 6e 63 68 2f 63 62 33 38 33 35 33 39 36 38 34 62 2f 31 30 2f 33 2f 6c 6f 6e 67 42 85 0a", "launch/cb383539684b/10/3/long", "42 85 0a"),
    (15, "Command 5 Long Press", "1d 6c 61 75 6e 63 68 2f 63 62 33 38 33 35 33 39 36 38 34 62 2f 31 30 2f 34 2f 6c 6f 6e 67 45 8c 18", "launch/cb383539684b/10/4/long", "45 8c 18"),
    (16, "Command 6 Long Press", "1d 6c 61 75 6e 63 68 2f 63 62 33 38 33 35 33 39 36 38 34 62 2f 31 30 2f 35 2f 6c 6f 6e 67 48 93 26", "launch/cb383539684b/10/5/long", "48 93 26"),
    (17, "Command 7 Long Press", "1d 6c 61 75 6e 63 68 2f 63 62 33 38 33 35 33 39 36 38 34 62 2f 31 30 2f 36 2f 6c 6f 6e 67 4b 9a 34", "launch/cb383539684b/10/6/long", "4b 9a 34"),
    (18, "Command 8 Long Press", "1d 6c 61 75 6e 63 68 2f 63 62 33 38 33 35 33 39 36 38 34 62 2f 31 30 2f 37 2f 6c 6f 6e 67 4e a1 42", "launch/cb383539684b/10/7/long", "4e a1 42"),
    (19, "Command 9 Long Press", "1d 6c 61 75 6e 63 68 2f 63 62 33 38 33 35 33 39 36 38 34 62 2f 31 30 2f 38 2f 6c 6f 6e 67 51 a8 50", "launch/cb383539684b/10/8/long", "51 a8 50"),
    (20, "Command 10 Long Press", "1d 6c 61 75 6e 63 68 2f 63 62 33 38 33 35 33 39 36 38 34 62 2f 31 30 2f 39 2f 6c 6f 6e 67 7b fd fa", "launch/cb383539684b/10/9/long", "7b fd fa"),
]


@pytest.mark.parametrize(
    "command_id,name,data_hex,expected_path,expected_trailer", ROKU_BACKUP
)
def test_roku_command_roundtrip(command_id, name, data_hex, expected_path, expected_trailer):
    raw = bytes.fromhex(data_hex.replace(" ", ""))
    decoded = try_decode_blob(DEVICE_CLASS_WIFI_ROKU, raw)
    assert decoded is not None, f"command_id {command_id} ({name}) failed to decode"
    assert decoded["fields"] == {"path": expected_path}
    assert decoded["trailer_hex"] == expected_trailer

    re_encoded = encode_decoded_blob(decoded)
    assert re_encoded == raw, f"command_id {command_id} ({name}) did not round-trip"


def test_roku_corpus_is_complete():
    assert len(ROKU_BACKUP) == 20
    assert [row[0] for row in ROKU_BACKUP] == list(range(1, 21))


def test_roku_corpus_covers_two_path_length_variants():
    """Short press paths are 30 bytes (0x1e), long press paths are 29 bytes (0x1d).

    The 1-byte length prefix is the wifi_roku decoder's only
    structural field besides path bytes. Exercising both values is
    the regression guard against the length byte being miscomputed.
    """

    path_len_bytes = set()
    for _, _, data_hex, *_ in ROKU_BACKUP:
        path_len_bytes.add(int(data_hex.split()[0], 16))
    assert path_len_bytes == {0x1E, 0x1D}


def test_roku_long_press_paths_are_one_byte_shorter():
    """``short`` is 5 ASCII bytes, ``long`` is 4 — the path bytes
    differ by exactly that, and so the length prefix differs by 1.
    """

    short = [path for _, _, _, path, _ in ROKU_BACKUP if path.endswith("/short")]
    long_ = [path for _, _, _, path, _ in ROKU_BACKUP if path.endswith("/long")]
    assert len(short) == 10
    assert len(long_) == 10
    for s in short:
        assert len(s) == 30
    for l in long_:
        assert len(l) == 29


def test_wifi_create_and_backup_agree_on_roku_blob_body():
    """The X1 Roku wifi-create writer and the backup decoder agree.

    Both paths now route through :func:`render_wifi_roku_blob_body`.
    For any captured row the canonical writer must reproduce the
    ``data_hex`` bytes that precede the trailer (i.e. the
    ``len + path`` region the hub persists). Regression guard
    against any future drift in the two writers.
    """

    from custom_components.sofabaton_x1s.lib.blob_decoders import (
        render_wifi_roku_blob_body,
    )

    for command_id, name, data_hex, expected_path, trailer in ROKU_BACKUP:
        raw = bytes.fromhex(data_hex.replace(" ", ""))
        trailer_bytes = bytes.fromhex(trailer.replace(" ", ""))
        expected_body = raw[: len(raw) - len(trailer_bytes)]

        via_canonical = render_wifi_roku_blob_body(path=expected_path)

        assert via_canonical == expected_body, (
            f"command_id {command_id} ({name}): canonical writer "
            f"does not reproduce body bytes"
        )
