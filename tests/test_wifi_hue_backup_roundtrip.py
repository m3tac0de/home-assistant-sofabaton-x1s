"""Round-trip verification for the user-provided "Philips hue 2" backup.

The user captured a 20-command ``wifi_hue`` device backup off a real
hub (the "Philips hue 2 (192.168.2.162)" device). The commands form a
focused stress test: ten Hue groups, each with an on/off pair, so the
corpus covers the two body-block variants observed in the writer
(``Content-Length:16`` for the JSON ``{"on": true}`` body and
``Content-Length:17`` for ``{"on": false}``) plus path-length
variations as the group id digit count changes (1 → 2 → 3 digits).

If any one of these 20 fails to round-trip exactly, we cannot trust
the decoder on real-world wifi_hue rows, full stop. That is the whole
point of this file.
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
    DEVICE_CLASS_WIFI_HUE,
)


# Shared API path component — same Hue bridge API key across all rows.
_HUE_API_PREFIX = "api/Wrq3v0M7iDqAXHa-oXOeoXSgHH1LXFYwaNOl6jf1"


# (command_id, name, data_hex, group_id, on_or_off, trailer)
HUE_BACKUP: list[tuple[int, str, str, str, str, str]] = [
    (1, "Cleo kamer off", "3c 00 22 61 70 69 2f 57 72 71 33 76 30 4d 37 69 44 71 41 58 48 61 2d 6f 58 4f 65 6f 58 53 67 48 48 31 4c 58 46 59 77 61 4e 4f 6c 36 6a 66 31 2f 67 72 6f 75 70 73 2f 35 2f 61 63 74 69 6f 6e 43 6f 6e 74 65 6e 74 2d 4c 65 6e 67 74 68 3a 31 37 0a 0a 7b 0a 22 6f 6e 22 3a 20 66 61 6c 73 65 0a 7d 03 07 0e 1c", "5", "off", "03 07 0e 1c"),
    (2, "Cleo kamer on", "3c 00 21 61 70 69 2f 57 72 71 33 76 30 4d 37 69 44 71 41 58 48 61 2d 6f 58 4f 65 6f 58 53 67 48 48 31 4c 58 46 59 77 61 4e 4f 6c 36 6a 66 31 2f 67 72 6f 75 70 73 2f 35 2f 61 63 74 69 6f 6e 43 6f 6e 74 65 6e 74 2d 4c 65 6e 67 74 68 3a 31 36 0a 0a 7b 0a 22 6f 6e 22 3a 20 74 72 75 65 0a 7d 53 a8 50 a0", "5", "on", "53 a8 50 a0"),
    (3, "Garage off", "3c 00 22 61 70 69 2f 57 72 71 33 76 30 4d 37 69 44 71 41 58 48 61 2d 6f 58 4f 65 6f 58 53 67 48 48 31 4c 58 46 59 77 61 4e 4f 6c 36 6a 66 31 2f 67 72 6f 75 70 73 2f 34 2f 61 63 74 69 6f 6e 43 6f 6e 74 65 6e 74 2d 4c 65 6e 67 74 68 3a 31 37 0a 0a 7b 0a 22 6f 6e 22 3a 20 66 61 6c 73 65 0a 7d 96 2f 5e bc", "4", "off", "96 2f 5e bc"),
    (4, "Garage on", "3c 00 21 61 70 69 2f 57 72 71 33 76 30 4d 37 69 44 71 41 58 48 61 2d 6f 58 4f 65 6f 58 53 67 48 48 31 4c 58 46 59 77 61 4e 4f 6c 36 6a 66 31 2f 67 72 6f 75 70 73 2f 34 2f 61 63 74 69 6f 6e 43 6f 6e 74 65 6e 74 2d 4c 65 6e 67 74 68 3a 31 36 0a 0a 7b 0a 22 6f 6e 22 3a 20 74 72 75 65 0a 7d e6 d0 a0 40", "4", "on", "e6 d0 a0 40"),
    (5, "Hallway off", "3d 00 22 61 70 69 2f 57 72 71 33 76 30 4d 37 69 44 71 41 58 48 61 2d 6f 58 4f 65 6f 58 53 67 48 48 31 4c 58 46 59 77 61 4e 4f 6c 36 6a 66 31 2f 67 72 6f 75 70 73 2f 38 33 2f 61 63 74 69 6f 6e 43 6f 6e 74 65 6e 74 2d 4c 65 6e 67 74 68 3a 31 37 0a 0a 7b 0a 22 6f 6e 22 3a 20 66 61 6c 73 65 0a 7d 59 b7 6e dc", "83", "off", "59 b7 6e dc"),
    (6, "Hallway on", "3d 00 21 61 70 69 2f 57 72 71 33 76 30 4d 37 69 44 71 41 58 48 61 2d 6f 58 4f 65 6f 58 53 67 48 48 31 4c 58 46 59 77 61 4e 4f 6c 36 6a 66 31 2f 67 72 6f 75 70 73 2f 38 33 2f 61 63 74 69 6f 6e 43 6f 6e 74 65 6e 74 2d 4c 65 6e 67 74 68 3a 31 36 0a 0a 7b 0a 22 6f 6e 22 3a 20 74 72 75 65 0a 7d a9 58 b0 60", "83", "on", "a9 58 b0 60"),
    (7, "Huis area off", "3e 00 22 61 70 69 2f 57 72 71 33 76 30 4d 37 69 44 71 41 58 48 61 2d 6f 58 4f 65 6f 58 53 67 48 48 31 4c 58 46 59 77 61 4e 4f 6c 36 6a 66 31 2f 67 72 6f 75 70 73 2f 32 30 30 2f 61 63 74 69 6f 6e 43 6f 6e 74 65 6e 74 2d 4c 65 6e 67 74 68 3a 31 37 0a 0a 7b 0a 22 6f 6e 22 3a 20 66 61 6c 73 65 0a 7d 01 09 12 24", "200", "off", "01 09 12 24"),
    (8, "Huis area on", "3e 00 21 61 70 69 2f 57 72 71 33 76 30 4d 37 69 44 71 41 58 48 61 2d 6f 58 4f 65 6f 58 53 67 48 48 31 4c 58 46 59 77 61 4e 4f 6c 36 6a 66 31 2f 67 72 6f 75 70 73 2f 32 30 30 2f 61 63 74 69 6f 6e 43 6f 6e 74 65 6e 74 2d 4c 65 6e 67 74 68 3a 31 36 0a 0a 7b 0a 22 6f 6e 22 3a 20 74 72 75 65 0a 7d 51 aa 54 a8", "200", "on", "51 aa 54 a8"),
    (9, "Huis off", "3c 00 22 61 70 69 2f 57 72 71 33 76 30 4d 37 69 44 71 41 58 48 61 2d 6f 58 4f 65 6f 58 53 67 48 48 31 4c 58 46 59 77 61 4e 4f 6c 36 6a 66 31 2f 67 72 6f 75 70 73 2f 32 2f 61 63 74 69 6f 6e 43 6f 6e 74 65 6e 74 2d 4c 65 6e 67 74 68 3a 31 37 0a 0a 7b 0a 22 6f 6e 22 3a 20 66 61 6c 73 65 0a 7d e6 d5 aa 54", "2", "off", "e6 d5 aa 54"),
    (10, "Huis on", "3c 00 21 61 70 69 2f 57 72 71 33 76 30 4d 37 69 44 71 41 58 48 61 2d 6f 58 4f 65 6f 58 53 67 48 48 31 4c 58 46 59 77 61 4e 4f 6c 36 6a 66 31 2f 67 72 6f 75 70 73 2f 32 2f 61 63 74 69 6f 6e 43 6f 6e 74 65 6e 74 2d 4c 65 6e 67 74 68 3a 31 36 0a 0a 7b 0a 22 6f 6e 22 3a 20 74 72 75 65 0a 7d 36 76 ec d8", "2", "on", "36 76 ec d8"),
    (11, "Inne Kamer off", "3d 00 22 61 70 69 2f 57 72 71 33 76 30 4d 37 69 44 71 41 58 48 61 2d 6f 58 4f 65 6f 58 53 67 48 48 31 4c 58 46 59 77 61 4e 4f 6c 36 6a 66 31 2f 67 72 6f 75 70 73 2f 38 31 2f 61 63 74 69 6f 6e 43 6f 6e 74 65 6e 74 2d 4c 65 6e 67 74 68 3a 31 37 0a 0a 7b 0a 22 6f 6e 22 3a 20 66 61 6c 73 65 0a 7d 1f 49 92 24", "81", "off", "1f 49 92 24"),
    (12, "Inne Kamer on", "3d 00 21 61 70 69 2f 57 72 71 33 76 30 4d 37 69 44 71 41 58 48 61 2d 6f 58 4f 65 6f 58 53 67 48 48 31 4c 58 46 59 77 61 4e 4f 6c 36 6a 66 31 2f 67 72 6f 75 70 73 2f 38 31 2f 61 63 74 69 6f 6e 43 6f 6e 74 65 6e 74 2d 4c 65 6e 67 74 68 3a 31 36 0a 0a 7b 0a 22 6f 6e 22 3a 20 74 72 75 65 0a 7d 6f ea d4 a8", "81", "on", "6f ea d4 a8"),
    (13, "kantoor off", "3c 00 22 61 70 69 2f 57 72 71 33 76 30 4d 37 69 44 71 41 58 48 61 2d 6f 58 4f 65 6f 58 53 67 48 48 31 4c 58 46 59 77 61 4e 4f 6c 36 6a 66 31 2f 67 72 6f 75 70 73 2f 31 2f 61 63 74 69 6f 6e 43 6f 6e 74 65 6e 74 2d 4c 65 6e 67 74 68 3a 31 37 0a 0a 7b 0a 22 6f 6e 22 3a 20 66 61 6c 73 65 0a 7d 4a a1 42 84", "1", "off", "4a a1 42 84"),
    (14, "kantoor on", "3c 00 21 61 70 69 2f 57 72 71 33 76 30 4d 37 69 44 71 41 58 48 61 2d 6f 58 4f 65 6f 58 53 67 48 48 31 4c 58 46 59 77 61 4e 4f 6c 36 6a 66 31 2f 67 72 6f 75 70 73 2f 31 2f 61 63 74 69 6f 6e 43 6f 6e 74 65 6e 74 2d 4c 65 6e 67 74 68 3a 31 36 0a 0a 7b 0a 22 6f 6e 22 3a 20 74 72 75 65 0a 7d 9a 42 84 08", "1", "on", "9a 42 84 08"),
    (15, "Kerstverlichting off", "3c 00 22 61 70 69 2f 57 72 71 33 76 30 4d 37 69 44 71 41 58 48 61 2d 6f 58 4f 65 6f 58 53 67 48 48 31 4c 58 46 59 77 61 4e 4f 6c 36 6a 66 31 2f 67 72 6f 75 70 73 2f 33 2f 61 63 74 69 6f 6e 43 6f 6e 74 65 6e 74 2d 4c 65 6e 67 74 68 3a 31 37 0a 0a 7b 0a 22 6f 6e 22 3a 20 66 61 6c 73 65 0a 7d f6 fb f6 ec", "3", "off", "f6 fb f6 ec"),
    (16, "Kerstverlichting on", "3c 00 21 61 70 69 2f 57 72 71 33 76 30 4d 37 69 44 71 41 58 48 61 2d 6f 58 4f 65 6f 58 53 67 48 48 31 4c 58 46 59 77 61 4e 4f 6c 36 6a 66 31 2f 67 72 6f 75 70 73 2f 33 2f 61 63 74 69 6f 6e 43 6f 6e 74 65 6e 74 2d 4c 65 6e 67 74 68 3a 31 36 0a 0a 7b 0a 22 6f 6e 22 3a 20 74 72 75 65 0a 7d 46 9c 38 70", "3", "on", "46 9c 38 70"),
    (17, "Sousterrain off", "3d 00 22 61 70 69 2f 57 72 71 33 76 30 4d 37 69 44 71 41 58 48 61 2d 6f 58 4f 65 6f 58 53 67 48 48 31 4c 58 46 59 77 61 4e 4f 6c 36 6a 66 31 2f 67 72 6f 75 70 73 2f 38 32 2f 61 63 74 69 6f 6e 43 6f 6e 74 65 6e 74 2d 4c 65 6e 67 74 68 3a 31 37 0a 0a 7b 0a 22 6f 6e 22 3a 20 66 61 6c 73 65 0a 7d 25 5b b6 6c", "82", "off", "25 5b b6 6c"),
    (18, "Sousterrain on", "3d 00 21 61 70 69 2f 57 72 71 33 76 30 4d 37 69 44 71 41 58 48 61 2d 6f 58 4f 65 6f 58 53 67 48 48 31 4c 58 46 59 77 61 4e 4f 6c 36 6a 66 31 2f 67 72 6f 75 70 73 2f 38 32 2f 61 63 74 69 6f 6e 43 6f 6e 74 65 6e 74 2d 4c 65 6e 67 74 68 3a 31 36 0a 0a 7b 0a 22 6f 6e 22 3a 20 74 72 75 65 0a 7d 75 fc f8 f0", "82", "on", "75 fc f8 f0"),
    (19, "Tomo kamer off", "3d 00 22 61 70 69 2f 57 72 71 33 76 30 4d 37 69 44 71 41 58 48 61 2d 6f 58 4f 65 6f 58 53 67 48 48 31 4c 58 46 59 77 61 4e 4f 6c 36 6a 66 31 2f 67 72 6f 75 70 73 2f 38 35 2f 61 63 74 69 6f 6e 43 6f 6e 74 65 6e 74 2d 4c 65 6e 67 74 68 3a 31 37 0a 0a 7b 0a 22 6f 6e 22 3a 20 66 61 6c 73 65 0a 7d 58 c3 86 0c", "85", "off", "58 c3 86 0c"),
    (20, "Tomo kamer on", "3d 00 21 61 70 69 2f 57 72 71 33 76 30 4d 37 69 44 71 41 58 48 61 2d 6f 58 4f 65 6f 58 53 67 48 48 31 4c 58 46 59 77 61 4e 4f 6c 36 6a 66 31 2f 67 72 6f 75 70 73 2f 38 35 2f 61 63 74 69 6f 6e 43 6f 6e 74 65 6e 74 2d 4c 65 6e 67 74 68 3a 31 36 0a 0a 7b 0a 22 6f 6e 22 3a 20 74 72 75 65 0a 7d a8 64 c8 90", "85", "on", "a8 64 c8 90"),
]


@pytest.mark.parametrize(
    "command_id,name,data_hex,group_id,on_or_off,trailer", HUE_BACKUP
)
def test_hue_command_roundtrip(command_id, name, data_hex, group_id, on_or_off, trailer):
    raw = bytes.fromhex(data_hex.replace(" ", ""))
    decoded = try_decode_blob(DEVICE_CLASS_WIFI_HUE, raw)
    assert decoded is not None, f"command_id {command_id} ({name}) failed to decode"
    fields = decoded["fields"]
    assert fields["path"] == f"{_HUE_API_PREFIX}/groups/{group_id}/action"
    if on_or_off == "on":
        assert fields["body_block"] == 'Content-Length:16\n\n{\n"on": true\n}'
    else:
        assert fields["body_block"] == 'Content-Length:17\n\n{\n"on": false\n}'
    assert decoded["trailer_hex"] == trailer

    re_encoded = encode_decoded_blob(decoded)
    assert re_encoded == raw, f"command_id {command_id} ({name}) did not round-trip"


def test_hue_corpus_is_complete():
    assert len(HUE_BACKUP) == 20
    assert [row[0] for row in HUE_BACKUP] == list(range(1, 21))
    # Each group has both an "on" and "off" variant.
    groups_with_states: dict[str, set[str]] = {}
    for _, _, _, group_id, on_or_off, _ in HUE_BACKUP:
        groups_with_states.setdefault(group_id, set()).add(on_or_off)
    for group_id, states in groups_with_states.items():
        assert states == {"on", "off"}, f"group {group_id} has incomplete states"


def test_hue_corpus_covers_three_path_length_variants():
    """The decoder's 1-byte path length field must handle 1/2/3 digit group ids.

    The user's "Apps" backup only exercised constant-length paths, so
    this corpus is the regression guard for the path-length BE byte
    changing across rows (0x3c → 0x3d → 0x3e).
    """

    path_lens = set()
    for _, _, data_hex, *_ in HUE_BACKUP:
        # First byte of data_hex is the path length P.
        path_lens.add(int(data_hex.split()[0], 16))
    assert path_lens == {0x3C, 0x3D, 0x3E}
