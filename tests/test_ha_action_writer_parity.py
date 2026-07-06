"""Cross-writer parity for editor-synthesized HA-action callbacks.

The backup editor (TypeScript, ``renderHaActionDataHex`` in
``www/src/tabs/backup-state.ts``) synthesizes ``wifi_ip`` command blobs
for Home Assistant actions entirely in the browser. Restore replays
``data_hex`` byte-for-byte, so the TS writer MUST render exactly the
bytes ``lib/blob_decoders.py`` would — this file is the guard.

``HA_ACTION_EXPECTED_DATA_HEX`` below is the same constant asserted in
``tests/frontend/backup-state.test.ts`` (host 192.168.1.10:8060, device
id 4, name "Dim the lights"). If either writer changes rendering rules,
one of the two suites breaks.
"""

from __future__ import annotations

import sys
from pathlib import Path

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
    render_wifi_ip_http_text,
    try_decode_blob,
)
from custom_components.sofabaton_x1s.lib.protocol_const import (  # noqa: E402
    DEVICE_CLASS_WIFI_IP,
)

HOST = "192.168.1.10"
PORT = 8060
PATH = "/launch/ha/4/Dim%20the%20lights/short"

# Mirrors tests/frontend/backup-state.test.ts HA_ACTION_EXPECTED_DATA_HEX.
HA_ACTION_EXPECTED_DATA_HEX = (
    "c0 a8 01 0a 1f 7c 00 7f 50 4f 53 54 20 2f 6c 61 75 6e 63 68 2f 68 61 2f 34 2f 44 69 6d 25 32 30 74"
    " 68 65 25 32 30 6c 69 67 68 74 73 2f 73 68 6f 72 74 20 48 54 54 50 2f 31 2e 31 0d 0a 48 6f 73 74"
    " 3a 31 39 32 2e 31 36 38 2e 31 2e 31 30 3a 38 30 36 30 0d 0a 43 6f 6e 74 65 6e 74 2d 54 79 70 65"
    " 3a 61 70 70 6c 69 63 61 74 69 6f 6e 2f 78 2d 77 77 77 2d 66 6f 72 6d 2d 75 72 6c 65 6e 63 6f 64"
    " 65 64 0d 0a 0d 0a"
)


def _python_rendered_blob() -> bytes:
    text = render_wifi_ip_http_text(
        host=HOST,
        port=PORT,
        method="POST",
        path=PATH,
        header="",
        content_type="application/x-www-form-urlencoded",
        body="",
    )
    ip = bytes(int(part) for part in HOST.split("."))
    return ip + PORT.to_bytes(2, "big") + len(text).to_bytes(2, "big") + text


def test_ts_writer_matches_python_writer():
    assert _python_rendered_blob().hex(" ") == HA_ACTION_EXPECTED_DATA_HEX


def test_ha_action_blob_decodes_with_expected_fields():
    raw = bytes.fromhex(HA_ACTION_EXPECTED_DATA_HEX.replace(" ", ""))
    decoded = try_decode_blob(DEVICE_CLASS_WIFI_IP, raw)
    assert decoded is not None
    fields = decoded["fields"]
    assert fields["host"] == HOST
    assert fields["port"] == PORT
    assert fields["method"] == "POST"
    assert fields["path"] == PATH
    assert fields["header"] == ""
    assert fields["content_type"] == "application/x-www-form-urlencoded"
    assert fields["body"] == ""
    # The editor deliberately omits the 1-byte inner-record trailer;
    # replay is length-prefixed so the trailer is inert for sending.
    assert decoded["trailer_hex"] == ""


def test_editor_decoded_block_round_trips_through_encoder():
    # The exact `decoded` block shape the editor embeds in restore_data.
    # If a user ever flips `edited` on one of these, the restore path
    # re-encodes from this block — prove that yields the same bytes.
    decoded = {
        "class": "wifi_ip",
        "fields": {
            "host": HOST,
            "port": PORT,
            "method": "POST",
            "path": PATH,
            "header": "",
            "content_type": "application/x-www-form-urlencoded",
            "body": "",
        },
        "trailer_hex": "",
        "edited": False,
    }
    encoded = encode_decoded_blob(decoded)
    assert encoded.hex(" ") == HA_ACTION_EXPECTED_DATA_HEX
