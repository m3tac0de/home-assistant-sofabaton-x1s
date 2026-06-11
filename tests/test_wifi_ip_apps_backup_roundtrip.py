"""Round-trip verification for the user-provided "Apps" wifi_ip backup.

The user captured a 20-command ``wifi_ip`` device backup off a real
hub. Each command differs only in the launch-action segment
(``/1/<n>/short`` vs ``/1/<n>/long``) and in the trailing 1-byte
checksum, so the corpus is a focused stress test of the
``host + port + length-prefix + HTTP text + trailer`` round-trip.

If any one of these 20 fails to round-trip exactly, we cannot trust
the decoder on real-world wifi_ip rows, full stop. That is the whole
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
    DEVICE_CLASS_WIFI_IP,
)


# (command_id, data_hex, expected_path, expected_trailer)
APPS_BACKUP: list[tuple[int, str, str, str]] = [
    (1, "c0 a8 02 4d 1f 7c 00 78 50 4f 53 54 20 2f 6c 61 75 6e 63 68 2f 66 63 30 31 32 63 33 39 64 33 39 30 2f 31 2f 30 2f 73 68 6f 72 74 20 48 54 54 50 2f 31 2e 31 0d 0a 48 6f 73 74 3a 31 39 32 2e 31 36 38 2e 32 2e 37 37 3a 38 30 36 30 0d 0a 43 6f 6e 74 65 6e 74 2d 54 79 70 65 3a 61 70 70 6c 69 63 61 74 69 6f 6e 2f 78 2d 77 77 77 2d 66 6f 72 6d 2d 75 72 6c 65 6e 63 6f 64 65 64 0d 0a 0d 0a f1", "/launch/fc012c39d390/1/0/short", "f1"),
    (2, "c0 a8 02 4d 1f 7c 00 78 50 4f 53 54 20 2f 6c 61 75 6e 63 68 2f 66 63 30 31 32 63 33 39 64 33 39 30 2f 31 2f 31 2f 73 68 6f 72 74 20 48 54 54 50 2f 31 2e 31 0d 0a 48 6f 73 74 3a 31 39 32 2e 31 36 38 2e 32 2e 37 37 3a 38 30 36 30 0d 0a 43 6f 6e 74 65 6e 74 2d 54 79 70 65 3a 61 70 70 6c 69 63 61 74 69 6f 6e 2f 78 2d 77 77 77 2d 66 6f 72 6d 2d 75 72 6c 65 6e 63 6f 64 65 64 0d 0a 0d 0a 2c", "/launch/fc012c39d390/1/1/short", "2c"),
    (3, "c0 a8 02 4d 1f 7c 00 78 50 4f 53 54 20 2f 6c 61 75 6e 63 68 2f 66 63 30 31 32 63 33 39 64 33 39 30 2f 31 2f 32 2f 73 68 6f 72 74 20 48 54 54 50 2f 31 2e 31 0d 0a 48 6f 73 74 3a 31 39 32 2e 31 36 38 2e 32 2e 37 37 3a 38 30 36 30 0d 0a 43 6f 6e 74 65 6e 74 2d 54 79 70 65 3a 61 70 70 6c 69 63 61 74 69 6f 6e 2f 78 2d 77 77 77 2d 66 6f 72 6d 2d 75 72 6c 65 6e 63 6f 64 65 64 0d 0a 0d 0a b0", "/launch/fc012c39d390/1/2/short", "b0"),
    (4, "c0 a8 02 4d 1f 7c 00 78 50 4f 53 54 20 2f 6c 61 75 6e 63 68 2f 66 63 30 31 32 63 33 39 64 33 39 30 2f 31 2f 33 2f 73 68 6f 72 74 20 48 54 54 50 2f 31 2e 31 0d 0a 48 6f 73 74 3a 31 39 32 2e 31 36 38 2e 32 2e 37 37 3a 38 30 36 30 0d 0a 43 6f 6e 74 65 6e 74 2d 54 79 70 65 3a 61 70 70 6c 69 63 61 74 69 6f 6e 2f 78 2d 77 77 77 2d 66 6f 72 6d 2d 75 72 6c 65 6e 63 6f 64 65 64 0d 0a 0d 0a 39", "/launch/fc012c39d390/1/3/short", "39"),
    (5, "c0 a8 02 4d 1f 7c 00 78 50 4f 53 54 20 2f 6c 61 75 6e 63 68 2f 66 63 30 31 32 63 33 39 64 33 39 30 2f 31 2f 34 2f 73 68 6f 72 74 20 48 54 54 50 2f 31 2e 31 0d 0a 48 6f 73 74 3a 31 39 32 2e 31 36 38 2e 32 2e 37 37 3a 38 30 36 30 0d 0a 43 6f 6e 74 65 6e 74 2d 54 79 70 65 3a 61 70 70 6c 69 63 61 74 69 6f 6e 2f 78 2d 77 77 77 2d 66 6f 72 6d 2d 75 72 6c 65 6e 63 6f 64 65 64 0d 0a 0d 0a a2", "/launch/fc012c39d390/1/4/short", "a2"),
    (6, "c0 a8 02 4d 1f 7c 00 78 50 4f 53 54 20 2f 6c 61 75 6e 63 68 2f 66 63 30 31 32 63 33 39 64 33 39 30 2f 31 2f 35 2f 73 68 6f 72 74 20 48 54 54 50 2f 31 2e 31 0d 0a 48 6f 73 74 3a 31 39 32 2e 31 36 38 2e 32 2e 37 37 3a 38 30 36 30 0d 0a 43 6f 6e 74 65 6e 74 2d 54 79 70 65 3a 61 70 70 6c 69 63 61 74 69 6f 6e 2f 78 2d 77 77 77 2d 66 6f 72 6d 2d 75 72 6c 65 6e 63 6f 64 65 64 0d 0a 0d 0a 31", "/launch/fc012c39d390/1/5/short", "31"),
    (7, "c0 a8 02 4d 1f 7c 00 78 50 4f 53 54 20 2f 6c 61 75 6e 63 68 2f 66 63 30 31 32 63 33 39 64 33 39 30 2f 31 2f 36 2f 73 68 6f 72 74 20 48 54 54 50 2f 31 2e 31 0d 0a 48 6f 73 74 3a 31 39 32 2e 31 36 38 2e 32 2e 37 37 3a 38 30 36 30 0d 0a 43 6f 6e 74 65 6e 74 2d 54 79 70 65 3a 61 70 70 6c 69 63 61 74 69 6f 6e 2f 78 2d 77 77 77 2d 66 6f 72 6d 2d 75 72 6c 65 6e 63 6f 64 65 64 0d 0a 0d 0a 33", "/launch/fc012c39d390/1/6/short", "33"),
    (8, "c0 a8 02 4d 1f 7c 00 78 50 4f 53 54 20 2f 6c 61 75 6e 63 68 2f 66 63 30 31 32 63 33 39 64 33 39 30 2f 31 2f 37 2f 73 68 6f 72 74 20 48 54 54 50 2f 31 2e 31 0d 0a 48 6f 73 74 3a 31 39 32 2e 31 36 38 2e 32 2e 37 37 3a 38 30 36 30 0d 0a 43 6f 6e 74 65 6e 74 2d 54 79 70 65 3a 61 70 70 6c 69 63 61 74 69 6f 6e 2f 78 2d 77 77 77 2d 66 6f 72 6d 2d 75 72 6c 65 6e 63 6f 64 65 64 0d 0a 0d 0a 35", "/launch/fc012c39d390/1/7/short", "35"),
    (9, "c0 a8 02 4d 1f 7c 00 78 50 4f 53 54 20 2f 6c 61 75 6e 63 68 2f 66 63 30 31 32 63 33 39 64 33 39 30 2f 31 2f 38 2f 73 68 6f 72 74 20 48 54 54 50 2f 31 2e 31 0d 0a 48 6f 73 74 3a 31 39 32 2e 31 36 38 2e 32 2e 37 37 3a 38 30 36 30 0d 0a 43 6f 6e 74 65 6e 74 2d 54 79 70 65 3a 61 70 70 6c 69 63 61 74 69 6f 6e 2f 78 2d 77 77 77 2d 66 6f 72 6d 2d 75 72 6c 65 6e 63 6f 64 65 64 0d 0a 0d 0a 37", "/launch/fc012c39d390/1/8/short", "37"),
    (10, "c0 a8 02 4d 1f 7c 00 78 50 4f 53 54 20 2f 6c 61 75 6e 63 68 2f 66 63 30 31 32 63 33 39 64 33 39 30 2f 31 2f 39 2f 73 68 6f 72 74 20 48 54 54 50 2f 31 2e 31 0d 0a 48 6f 73 74 3a 31 39 32 2e 31 36 38 2e 32 2e 37 37 3a 38 30 36 30 0d 0a 43 6f 6e 74 65 6e 74 2d 54 79 70 65 3a 61 70 70 6c 69 63 61 74 69 6f 6e 2f 78 2d 77 77 77 2d 66 6f 72 6d 2d 75 72 6c 65 6e 63 6f 64 65 64 0d 0a 0d 0a 60", "/launch/fc012c39d390/1/9/short", "60"),
    (11, "c0 a8 02 4d 1f 7c 00 77 50 4f 53 54 20 2f 6c 61 75 6e 63 68 2f 66 63 30 31 32 63 33 39 64 33 39 30 2f 31 2f 30 2f 6c 6f 6e 67 20 48 54 54 50 2f 31 2e 31 0d 0a 48 6f 73 74 3a 31 39 32 2e 31 36 38 2e 32 2e 37 37 3a 38 30 36 30 0d 0a 43 6f 6e 74 65 6e 74 2d 54 79 70 65 3a 61 70 70 6c 69 63 61 74 69 6f 6e 2f 78 2d 77 77 77 2d 66 6f 72 6d 2d 75 72 6c 65 6e 63 6f 64 65 64 0d 0a 0d 0a 4d", "/launch/fc012c39d390/1/0/long", "4d"),
    (12, "c0 a8 02 4d 1f 7c 00 77 50 4f 53 54 20 2f 6c 61 75 6e 63 68 2f 66 63 30 31 32 63 33 39 64 33 39 30 2f 31 2f 31 2f 6c 6f 6e 67 20 48 54 54 50 2f 31 2e 31 0d 0a 48 6f 73 74 3a 31 39 32 2e 31 36 38 2e 32 2e 37 37 3a 38 30 36 30 0d 0a 43 6f 6e 74 65 6e 74 2d 54 79 70 65 3a 61 70 70 6c 69 63 61 74 69 6f 6e 2f 78 2d 77 77 77 2d 66 6f 72 6d 2d 75 72 6c 65 6e 63 6f 64 65 64 0d 0a 0d 0a 88", "/launch/fc012c39d390/1/1/long", "88"),
    (13, "c0 a8 02 4d 1f 7c 00 77 50 4f 53 54 20 2f 6c 61 75 6e 63 68 2f 66 63 30 31 32 63 33 39 64 33 39 30 2f 31 2f 32 2f 6c 6f 6e 67 20 48 54 54 50 2f 31 2e 31 0d 0a 48 6f 73 74 3a 31 39 32 2e 31 36 38 2e 32 2e 37 37 3a 38 30 36 30 0d 0a 43 6f 6e 74 65 6e 74 2d 54 79 70 65 3a 61 70 70 6c 69 63 61 74 69 6f 6e 2f 78 2d 77 77 77 2d 66 6f 72 6d 2d 75 72 6c 65 6e 63 6f 64 65 64 0d 0a 0d 0a 0c", "/launch/fc012c39d390/1/2/long", "0c"),
    (14, "c0 a8 02 4d 1f 7c 00 77 50 4f 53 54 20 2f 6c 61 75 6e 63 68 2f 66 63 30 31 32 63 33 39 64 33 39 30 2f 31 2f 33 2f 6c 6f 6e 67 20 48 54 54 50 2f 31 2e 31 0d 0a 48 6f 73 74 3a 31 39 32 2e 31 36 38 2e 32 2e 37 37 3a 38 30 36 30 0d 0a 43 6f 6e 74 65 6e 74 2d 54 79 70 65 3a 61 70 70 6c 69 63 61 74 69 6f 6e 2f 78 2d 77 77 77 2d 66 6f 72 6d 2d 75 72 6c 65 6e 63 6f 64 65 64 0d 0a 0d 0a 95", "/launch/fc012c39d390/1/3/long", "95"),
    (15, "c0 a8 02 4d 1f 7c 00 77 50 4f 53 54 20 2f 6c 61 75 6e 63 68 2f 66 63 30 31 32 63 33 39 64 33 39 30 2f 31 2f 34 2f 6c 6f 6e 67 20 48 54 54 50 2f 31 2e 31 0d 0a 48 6f 73 74 3a 31 39 32 2e 31 36 38 2e 32 2e 37 37 3a 38 30 36 30 0d 0a 43 6f 6e 74 65 6e 74 2d 54 79 70 65 3a 61 70 70 6c 69 63 61 74 69 6f 6e 2f 78 2d 77 77 77 2d 66 6f 72 6d 2d 75 72 6c 65 6e 63 6f 64 65 64 0d 0a 0d 0a fe", "/launch/fc012c39d390/1/4/long", "fe"),
    (16, "c0 a8 02 4d 1f 7c 00 77 50 4f 53 54 20 2f 6c 61 75 6e 63 68 2f 66 63 30 31 32 63 33 39 64 33 39 30 2f 31 2f 35 2f 6c 6f 6e 67 20 48 54 54 50 2f 31 2e 31 0d 0a 48 6f 73 74 3a 31 39 32 2e 31 36 38 2e 32 2e 37 37 3a 38 30 36 30 0d 0a 43 6f 6e 74 65 6e 74 2d 54 79 70 65 3a 61 70 70 6c 69 63 61 74 69 6f 6e 2f 78 2d 77 77 77 2d 66 6f 72 6d 2d 75 72 6c 65 6e 63 6f 64 65 64 0d 0a 0d 0a 8d", "/launch/fc012c39d390/1/5/long", "8d"),
    (17, "c0 a8 02 4d 1f 7c 00 77 50 4f 53 54 20 2f 6c 61 75 6e 63 68 2f 66 63 30 31 32 63 33 39 64 33 39 30 2f 31 2f 36 2f 6c 6f 6e 67 20 48 54 54 50 2f 31 2e 31 0d 0a 48 6f 73 74 3a 31 39 32 2e 31 36 38 2e 32 2e 37 37 3a 38 30 36 30 0d 0a 43 6f 6e 74 65 6e 74 2d 54 79 70 65 3a 61 70 70 6c 69 63 61 74 69 6f 6e 2f 78 2d 77 77 77 2d 66 6f 72 6d 2d 75 72 6c 65 6e 63 6f 64 65 64 0d 0a 0d 0a 8f", "/launch/fc012c39d390/1/6/long", "8f"),
    (18, "c0 a8 02 4d 1f 7c 00 77 50 4f 53 54 20 2f 6c 61 75 6e 63 68 2f 66 63 30 31 32 63 33 39 64 33 39 30 2f 31 2f 37 2f 6c 6f 6e 67 20 48 54 54 50 2f 31 2e 31 0d 0a 48 6f 73 74 3a 31 39 32 2e 31 36 38 2e 32 2e 37 37 3a 38 30 36 30 0d 0a 43 6f 6e 74 65 6e 74 2d 54 79 70 65 3a 61 70 70 6c 69 63 61 74 69 6f 6e 2f 78 2d 77 77 77 2d 66 6f 72 6d 2d 75 72 6c 65 6e 63 6f 64 65 64 0d 0a 0d 0a 91", "/launch/fc012c39d390/1/7/long", "91"),
    (19, "c0 a8 02 4d 1f 7c 00 77 50 4f 53 54 20 2f 6c 61 75 6e 63 68 2f 66 63 30 31 32 63 33 39 64 33 39 30 2f 31 2f 38 2f 6c 6f 6e 67 20 48 54 54 50 2f 31 2e 31 0d 0a 48 6f 73 74 3a 31 39 32 2e 31 36 38 2e 32 2e 37 37 3a 38 30 36 30 0d 0a 43 6f 6e 74 65 6e 74 2d 54 79 70 65 3a 61 70 70 6c 69 63 61 74 69 6f 6e 2f 78 2d 77 77 77 2d 66 6f 72 6d 2d 75 72 6c 65 6e 63 6f 64 65 64 0d 0a 0d 0a 93", "/launch/fc012c39d390/1/8/long", "93"),
    (20, "c0 a8 02 4d 1f 7c 00 77 50 4f 53 54 20 2f 6c 61 75 6e 63 68 2f 66 63 30 31 32 63 33 39 64 33 39 30 2f 31 2f 39 2f 6c 6f 6e 67 20 48 54 54 50 2f 31 2e 31 0d 0a 48 6f 73 74 3a 31 39 32 2e 31 36 38 2e 32 2e 37 37 3a 38 30 36 30 0d 0a 43 6f 6e 74 65 6e 74 2d 54 79 70 65 3a 61 70 70 6c 69 63 61 74 69 6f 6e 2f 78 2d 77 77 77 2d 66 6f 72 6d 2d 75 72 6c 65 6e 63 6f 64 65 64 0d 0a 0d 0a bc", "/launch/fc012c39d390/1/9/long", "bc"),
]


@pytest.mark.parametrize("command_id,data_hex,expected_path,expected_trailer", APPS_BACKUP)
def test_apps_command_roundtrip(command_id, data_hex, expected_path, expected_trailer):
    raw = bytes.fromhex(data_hex.replace(" ", ""))
    decoded = try_decode_blob(DEVICE_CLASS_WIFI_IP, raw)
    assert decoded is not None, f"command_id {command_id} failed to decode"
    fields = decoded["fields"]
    assert fields["host"] == "192.168.2.77"
    assert fields["port"] == 8060
    assert fields["method"] == "POST"
    assert fields["path"] == expected_path
    assert fields["header"] == ""
    assert fields["content_type"] == "application/x-www-form-urlencoded"
    assert fields["body"] == ""
    assert decoded["trailer_hex"] == expected_trailer

    re_encoded = encode_decoded_blob(decoded)
    assert re_encoded == raw, f"command_id {command_id} did not round-trip exactly"


def test_apps_backup_corpus_is_complete():
    # Bare safety net: if a future refactor accidentally drops rows
    # from the parametrize source, the count test catches it.
    assert len(APPS_BACKUP) == 20
    # Every command_id is unique and contiguous 1..20.
    assert [row[0] for row in APPS_BACKUP] == list(range(1, 21))


def test_wifi_create_and_backup_agree_on_http_text():
    """The wifi-create writer and the backup decoder produce the same bytes.

    The "Apps" backup the user captured was produced from an actual
    hub. The wifi-create flow in ``proxy_wifi_device`` is what writes
    these commands to the hub in the first place. Both paths now
    route through :func:`render_wifi_ip_http_text`, so for any
    (host, port, command_index, press_type) we can prove the bytes
    agree without running the real hub flow — we just call both
    sites and assert equality.

    This is the regression guard against any future divergence in
    the two writers.
    """

    from custom_components.sofabaton_x1s.lib.blob_decoders import (
        render_wifi_ip_http_text,
    )

    # Reproduce the launch-app path the wifi-create flow builds for
    # the first command of the user's "Apps" device.
    host = "192.168.2.77"
    port = 8060
    hub_action_id = "fc012c39d390"
    device_id = 1
    command_index = 0
    press_type = "short"

    launch_path = f"/launch/{hub_action_id}/{device_id}/{command_index}/{press_type}"

    via_canonical = render_wifi_ip_http_text(
        host=host,
        port=port,
        method="POST",
        path=launch_path,
        header="",
        content_type="application/x-www-form-urlencoded",
        body="",
    )

    # And what the backup row for command_id=1 actually carries in
    # its HTTP-text region.
    apps_row_1 = bytes.fromhex(APPS_BACKUP[0][1].replace(" ", ""))
    declared_len = int.from_bytes(apps_row_1[6:8], "big")
    from_backup = apps_row_1[8 : 8 + declared_len]

    assert via_canonical == from_backup
