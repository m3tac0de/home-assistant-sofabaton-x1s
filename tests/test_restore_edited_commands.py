"""Tests for the ``edited: true`` honoring on the restore path.

Exercises :meth:`RestoreMixin._edited_command_data_hex` directly: it is a
``@staticmethod`` so no hub instance / event loop is needed. The decoder
helpers it calls (``encode_decoded_blob`` / ``try_decode_blob``) are the
same ones exercised by ``test_blob_decoders``; here we only pin the
restore-side gate behavior.
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

import conftest  # noqa: F401,E402

from custom_components.sofabaton_x1s.lib.blob_decoders import (  # noqa: E402
    try_decode_blob,
)
from custom_components.sofabaton_x1s.lib.protocol_const import (  # noqa: E402
    DEVICE_CLASS_WIFI_ROKU,
)
from custom_components.sofabaton_x1s.lib.proxy_restore import (  # noqa: E402
    RestoreMixin,
)


WIFI_ROKU_HEX = (
    "1e6c61756e63682f63623338333533393638346"
    "22f31302f302f73686f7274d3"
)


def _decoded_block():
    raw = bytes.fromhex(WIFI_ROKU_HEX)
    decoded = try_decode_blob(DEVICE_CLASS_WIFI_ROKU, raw)
    assert decoded is not None
    return decoded


def test_returns_none_when_no_decoded_block():
    restore_data = {"data_hex": WIFI_ROKU_HEX}
    assert (
        RestoreMixin._edited_command_data_hex(
            restore_data, 0x10
        )
        is None
    )


def test_returns_none_when_edited_flag_absent_or_false():
    decoded = _decoded_block()
    restore_data = {"data_hex": WIFI_ROKU_HEX, "decoded": decoded}
    assert RestoreMixin._edited_command_data_hex(restore_data, 0x10) is None
    decoded["edited"] = False
    assert RestoreMixin._edited_command_data_hex(restore_data, 0x10) is None


def test_returns_reencoded_hex_when_edited_true_and_round_trip_passes():
    decoded = _decoded_block()
    decoded["fields"]["path"] = "keypress/Home"
    decoded["edited"] = True
    restore_data = {"data_hex": WIFI_ROKU_HEX, "decoded": decoded}

    new_hex = RestoreMixin._edited_command_data_hex(restore_data, 0x10)
    assert isinstance(new_hex, str)
    assert new_hex != WIFI_ROKU_HEX

    # The returned bytes must themselves decode to the user's edits — i.e.
    # this is the value restore will push, not the captured stale bytes.
    re_decoded = try_decode_blob(DEVICE_CLASS_WIFI_ROKU, bytes.fromhex(new_hex))
    assert re_decoded is not None
    assert re_decoded["fields"]["path"] == "keypress/Home"
    assert re_decoded["trailer_hex"] == decoded["trailer_hex"]


def test_edited_true_pristine_fields_re_encodes_to_original_bytes():
    decoded = _decoded_block()
    decoded["edited"] = True
    restore_data = {"data_hex": "deadbeef", "decoded": decoded}

    new_hex = RestoreMixin._edited_command_data_hex(restore_data, 0x10)
    # Unedited fields with edited=true still re-encode; the result is the
    # captured bytes and replaces the stale data_hex sentinel above.
    assert new_hex == WIFI_ROKU_HEX


def test_raises_on_unknown_class():
    decoded = _decoded_block()
    decoded["class"] = "not_a_class"
    decoded["edited"] = True
    restore_data = {"data_hex": WIFI_ROKU_HEX, "decoded": decoded}
    with pytest.raises(ValueError, match="could not be re-encoded"):
        RestoreMixin._edited_command_data_hex(restore_data, 0x10)


def test_raises_when_fields_missing():
    decoded = _decoded_block()
    decoded.pop("fields")
    decoded["edited"] = True
    restore_data = {"data_hex": WIFI_ROKU_HEX, "decoded": decoded}
    with pytest.raises(ValueError, match="could not be re-encoded"):
        RestoreMixin._edited_command_data_hex(restore_data, 0x10)


def test_user_reported_wifi_ip_edit_round_trips():
    # Repro for the user-reported failure on a hand-edited wifi_ip row:
    # the helper used to key its round-trip verifier off the outer
    # device-block ``device_class`` (often absent / non-normalizable in
    # a hand-edited bundle), causing pristine encoder output to be
    # rejected. The decoded block is self-describing — its ``class``
    # field is what should drive verification.
    decoded = {
        "class": "wifi_ip",
        "trailer_hex": "4e",
        "edited": True,
        "fields": {
            "host": "192.168.2.88",
            "port": 6666,
            "method": "GET",
            "path": "/freddy/e26a44861b45/11/0/short",
            "header": "",
            "content_type": "application/x-www-form-urlencoded",
            "body": "",
        },
    }
    restore_data = {"data_hex": "00", "decoded": decoded}
    new_hex = RestoreMixin._edited_command_data_hex(restore_data, 1)
    assert isinstance(new_hex, str) and new_hex
    assert new_hex.startswith("c0a80258")  # 192.168.2.88
    assert "1a0a" in new_hex[:12]  # port 6666
    assert new_hex.endswith("4e")  # trailer preserved
