"""Round-trip tests for the virtual-device command-blob decoders.

The three real-hub samples used here are the test vectors documented
in ``docs/protocol/command-blob-decoders.md`` (the "Worked examples"
section). Any change to the decoder/encoder pair MUST keep these
round-tripping byte-for-byte.
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
    DECODABLE_CLASSES,
    encode_decoded_blob,
    format_decoded_for_display,
    is_decodable_class,
    render_ir_descriptive_blob_body,
    render_wifi_ip_blob_body,
    render_wifi_ip_http_text,
    render_wifi_roku_blob_body,
    try_decode_blob,
)
from custom_components.sofabaton_x1s.lib.commands import (  # noqa: E402
    build_descriptive_ir_blob_body,
)
from custom_components.sofabaton_x1s.lib.protocol_const import (  # noqa: E402
    DEVICE_CLASS_BLUETOOTH,
    DEVICE_CLASS_IR,
    DEVICE_CLASS_WIFI_HUE,
    DEVICE_CLASS_WIFI_IP,
    DEVICE_CLASS_WIFI_MQTT,
    DEVICE_CLASS_WIFI_ROKU,
    DEVICE_CLASS_WIFI_SONOS,
)


# ---------------------------------------------------------------------------
# Captured-from-real-hub test vectors
# ---------------------------------------------------------------------------


WIFI_IP_BODYLESS_HEX = (
    "c0 a8 02 4d 1f 7c 00 78 50 4f 53 54 20 2f 6c 61 "
    "75 6e 63 68 2f 66 63 30 31 32 63 33 39 64 33 39 "
    "30 2f 31 2f 30 2f 73 68 6f 72 74 20 48 54 54 50 "
    "2f 31 2e 31 0d 0a 48 6f 73 74 3a 31 39 32 2e 31 "
    "36 38 2e 32 2e 37 37 3a 38 30 36 30 0d 0a 43 6f "
    "6e 74 65 6e 74 2d 54 79 70 65 3a 61 70 70 6c 69 "
    "63 61 74 69 6f 6e 2f 78 2d 77 77 77 2d 66 6f 72 "
    "6d 2d 75 72 6c 65 6e 63 6f 64 65 64 0d 0a 0d 0a "
    "f1"
)

WIFI_ROKU_HEX = (
    "1e 6c 61 75 6e 63 68 2f 63 62 33 38 33 35 33 39 "
    "36 38 34 62 2f 31 30 2f 30 2f 73 68 6f 72 74 d3"
)

WIFI_HUE_HEX = (
    "3c 00 22 61 70 69 2f 57 72 71 33 76 30 4d 37 69 "
    "44 71 41 58 48 61 2d 6f 58 4f 65 6f 58 53 67 48 "
    "48 31 4c 58 46 59 77 61 4e 4f 6c 36 6a 66 31 2f "
    "67 72 6f 75 70 73 2f 35 2f 61 63 74 69 6f 6e 43 "
    "6f 6e 74 65 6e 74 2d 4c 65 6e 67 74 68 3a 31 37 "
    "0a 0a 7b 0a 22 6f 6e 22 3a 20 66 61 6c 73 65 0a "
    "7d 03 07 0e"
)


def _to_bytes(hex_string: str) -> bytes:
    return bytes.fromhex(hex_string.replace(" ", ""))


# ---------------------------------------------------------------------------
# Public registry / discovery surface
# ---------------------------------------------------------------------------


def test_decodable_classes_covers_all_in_scope_classes():
    # Four virtual-device classes plus IR (content-sniffed via the
    # descriptive-protocol magic prefix).
    assert set(DECODABLE_CLASSES) == {
        DEVICE_CLASS_WIFI_IP,
        DEVICE_CLASS_WIFI_ROKU,
        DEVICE_CLASS_WIFI_HUE,
        DEVICE_CLASS_WIFI_SONOS,
        DEVICE_CLASS_IR,
    }


@pytest.mark.parametrize(
    "device_class",
    [
        DEVICE_CLASS_WIFI_IP,
        DEVICE_CLASS_WIFI_ROKU,
        DEVICE_CLASS_WIFI_HUE,
        DEVICE_CLASS_WIFI_SONOS,
        DEVICE_CLASS_IR,
        # Aliases should also classify correctly.
        "sonos",
        "hue",
        "roku",
        "ip",
        "virtual_http",
        # Case-insensitive
        "WIFI_IP",
        "IR",
    ],
)
def test_is_decodable_class_for_in_scope_aliases(device_class):
    assert is_decodable_class(device_class) is True


@pytest.mark.parametrize(
    "device_class",
    [
        DEVICE_CLASS_BLUETOOTH,
        DEVICE_CLASS_WIFI_MQTT,
        "rf",
        "rf_433mhz",
        "",
        None,
        "unknown_class",
    ],
)
def test_is_decodable_class_rejects_out_of_scope(device_class):
    assert is_decodable_class(device_class) is False


# ---------------------------------------------------------------------------
# wifi_ip
# ---------------------------------------------------------------------------


def test_wifi_ip_bodyless_roundtrip_exact():
    raw = _to_bytes(WIFI_IP_BODYLESS_HEX)
    decoded = try_decode_blob(DEVICE_CLASS_WIFI_IP, raw)
    assert decoded is not None
    assert decoded["class"] == DEVICE_CLASS_WIFI_IP
    assert decoded["trailer_hex"] == "f1"
    fields = decoded["fields"]
    assert fields["host"] == "192.168.2.77"
    assert fields["port"] == 8060
    assert fields["method"] == "POST"
    assert fields["path"] == "/launch/fc012c39d390/1/0/short"
    assert fields["header"] == ""
    assert fields["content_type"] == "application/x-www-form-urlencoded"
    assert fields["body"] == ""

    assert encode_decoded_blob(decoded) == raw


def test_wifi_ip_with_body_roundtrip_and_content_length_recomputed():
    # Synthesize a with-body blob using the same writer rule the hub
    # uses so we exercise the body branch end-to-end. The decoder
    # cannot trust this is "real" — it just runs the same encode rule.
    host = "10.0.0.5"
    port = 80
    body = '{"value":1}'  # 11 chars → Content-Length:11
    http_text = (
        "PUT /api/state HTTP/1.1\r\n"
        f"Host:{host}:{port}\r\n"
        "X-Test:trace\r\n"
        "Content-Type:application/json\r\n"
        f"Content-Length:{len(body)}\r\n\r\n{body}\r\n"
    )
    text_bytes = http_text.encode("ascii")
    blob = bytearray()
    blob += bytes(int(o) for o in host.split("."))
    blob += port.to_bytes(2, "big")
    blob += len(text_bytes).to_bytes(2, "big")
    blob += text_bytes
    blob += bytes([0xAB])  # synthetic 1-byte trailer

    decoded = try_decode_blob(DEVICE_CLASS_WIFI_IP, bytes(blob))
    assert decoded is not None
    fields = decoded["fields"]
    assert fields["host"] == host
    assert fields["port"] == port
    assert fields["method"] == "PUT"
    assert fields["path"] == "/api/state"
    assert fields["header"] == "X-Test:trace"
    assert fields["content_type"] == "application/json"
    assert fields["body"] == body
    assert decoded["trailer_hex"] == "ab"

    # Mutating only the body and re-encoding MUST recompute
    # Content-Length and still round-trip cleanly.
    decoded["fields"]["body"] = '{"value":222}'  # 13 chars now
    re_encoded = encode_decoded_blob(decoded)
    re_decoded = try_decode_blob(DEVICE_CLASS_WIFI_IP, re_encoded)
    assert re_decoded is not None
    assert re_decoded["fields"]["body"] == '{"value":222}'
    assert re_decoded["trailer_hex"] == "ab"


def test_wifi_ip_short_blob_returns_none():
    assert try_decode_blob(DEVICE_CLASS_WIFI_IP, b"\x01\x02\x03") is None


def test_wifi_ip_truncated_http_returns_none():
    # IP/port/length header is intact but the declared HTTP text runs
    # past end of input → decoder must reject.
    blob = bytes([0xC0, 0xA8, 0x02, 0x4D, 0x1F, 0x7C, 0x00, 0xFF]) + b"GET / HTTP/1.1\r\n"
    assert try_decode_blob(DEVICE_CLASS_WIFI_IP, blob) is None


# ---------------------------------------------------------------------------
# wifi_roku
# ---------------------------------------------------------------------------


def test_wifi_roku_roundtrip_exact():
    raw = _to_bytes(WIFI_ROKU_HEX)
    decoded = try_decode_blob(DEVICE_CLASS_WIFI_ROKU, raw)
    assert decoded is not None
    assert decoded["class"] == DEVICE_CLASS_WIFI_ROKU
    assert decoded["trailer_hex"] == "d3"
    assert decoded["fields"] == {"path": "launch/cb383539684b/10/0/short"}

    assert encode_decoded_blob(decoded) == raw


def test_wifi_roku_edit_path_roundtrip():
    raw = _to_bytes(WIFI_ROKU_HEX)
    decoded = try_decode_blob(DEVICE_CLASS_WIFI_ROKU, raw)
    assert decoded is not None
    decoded["fields"]["path"] = "keypress/Home"
    re_encoded = encode_decoded_blob(decoded)
    re_decoded = try_decode_blob(DEVICE_CLASS_WIFI_ROKU, re_encoded)
    assert re_decoded is not None
    assert re_decoded["fields"]["path"] == "keypress/Home"
    assert re_decoded["trailer_hex"] == "d3"


def test_render_wifi_roku_blob_body_matches_data_hex_minus_trailer():
    """The blob-body builder produces ``data_hex`` minus the trailer."""

    raw = _to_bytes(WIFI_ROKU_HEX)
    # The fixture's trailer is 1 byte.
    expected_body = raw[:-1]
    assert render_wifi_roku_blob_body(
        path="launch/cb383539684b/10/0/short",
    ) == expected_body


def test_render_wifi_roku_blob_body_rejects_overlength_path():
    with pytest.raises(ValueError):
        render_wifi_roku_blob_body(path="x" * 256)


def test_render_wifi_roku_blob_body_accepts_max_length_path():
    body = render_wifi_roku_blob_body(path="x" * 255)
    assert body[0] == 0xFF
    assert body[1:] == b"x" * 255


def test_wifi_roku_short_blob_returns_none():
    # 1-byte length prefix says 5 bytes follow but only 2 are present.
    assert try_decode_blob(DEVICE_CLASS_WIFI_ROKU, b"\x05ab") is None


# ---------------------------------------------------------------------------
# wifi_hue / wifi_sonos (shared layout)
# ---------------------------------------------------------------------------


def test_wifi_hue_roundtrip_exact():
    raw = _to_bytes(WIFI_HUE_HEX)
    decoded = try_decode_blob(DEVICE_CLASS_WIFI_HUE, raw)
    assert decoded is not None
    assert decoded["class"] == DEVICE_CLASS_WIFI_HUE
    assert decoded["trailer_hex"] == "03 07 0e"
    fields = decoded["fields"]
    assert (
        fields["path"]
        == "api/Wrq3v0M7iDqAXHa-oXOeoXSgHH1LXFYwaNOl6jf1/groups/5/action"
    )
    assert fields["body_block"] == 'Content-Length:17\n\n{\n"on": false\n}'

    assert encode_decoded_blob(decoded) == raw


def test_wifi_sonos_shares_decoder_with_hue():
    # Synthesize a Sonos-shaped blob and verify it round-trips through
    # the wifi_sonos class entry point exactly like Hue does.
    path = "MediaRenderer/VolumeUp/Control"
    body_block = (
        '<?xml version="1.0"?><s:Envelope/>'  # truncated for brevity
    )
    blob = bytearray()
    blob.append(len(path))
    blob += len(body_block).to_bytes(2, "big")
    blob += path.encode("ascii")
    blob += body_block.encode("ascii")
    blob += bytes([0xCC])

    decoded = try_decode_blob(DEVICE_CLASS_WIFI_SONOS, bytes(blob))
    assert decoded is not None
    assert decoded["class"] == DEVICE_CLASS_WIFI_SONOS
    assert decoded["fields"]["path"] == path
    assert decoded["fields"]["body_block"] == body_block
    assert decoded["trailer_hex"] == "cc"

    assert encode_decoded_blob(decoded) == bytes(blob)


def test_wifi_hue_edit_body_block_roundtrip():
    raw = _to_bytes(WIFI_HUE_HEX)
    decoded = try_decode_blob(DEVICE_CLASS_WIFI_HUE, raw)
    assert decoded is not None
    new_body = 'Content-Length:18\n\n{\n"on": true\n}'
    decoded["fields"]["body_block"] = new_body
    re_encoded = encode_decoded_blob(decoded)
    re_decoded = try_decode_blob(DEVICE_CLASS_WIFI_HUE, re_encoded)
    assert re_decoded is not None
    assert re_decoded["fields"]["body_block"] == new_body
    assert re_decoded["trailer_hex"] == "03 07 0e"


def test_wifi_hue_short_blob_returns_none():
    assert try_decode_blob(DEVICE_CLASS_WIFI_HUE, b"\x05") is None


# ---------------------------------------------------------------------------
# Cross-cutting safety checks
# ---------------------------------------------------------------------------


def test_decoder_accepts_hex_string_form():
    # Both hex-string and bytes inputs should produce the same result.
    raw = _to_bytes(WIFI_ROKU_HEX)
    via_bytes = try_decode_blob(DEVICE_CLASS_WIFI_ROKU, raw)
    via_string = try_decode_blob(DEVICE_CLASS_WIFI_ROKU, WIFI_ROKU_HEX)
    assert via_bytes == via_string


def test_decoder_rejects_garbage_hex_string():
    # Malformed hex returns None — we don't want a SyntaxError leaking
    # out of the backup path.
    assert try_decode_blob(DEVICE_CLASS_WIFI_ROKU, "ZZ ZZ ZZ") is None


def test_decoder_rejects_unknown_class():
    assert try_decode_blob(DEVICE_CLASS_BLUETOOTH, b"\x01\x02") is None
    assert try_decode_blob(DEVICE_CLASS_WIFI_MQTT, b"\x02\x01\x1a") is None


def test_decoder_returns_none_for_non_descriptive_ir():
    # Non-descriptive IR blobs (raw learned-IR / database captures)
    # do not carry the magic prefix at bytes [2..8], so the decoder's
    # content sniff fails and the row falls back to raw hex.
    raw = bytes([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x9c, 0x40]) + bytes(16)
    assert try_decode_blob(DEVICE_CLASS_IR, raw) is None


def test_decoder_rejects_empty_blob():
    assert try_decode_blob(DEVICE_CLASS_WIFI_ROKU, b"") is None
    assert try_decode_blob(DEVICE_CLASS_WIFI_IP, b"") is None
    assert try_decode_blob(DEVICE_CLASS_WIFI_HUE, b"") is None
    assert try_decode_blob(DEVICE_CLASS_IR, b"") is None


# ---------------------------------------------------------------------------
# ir (descriptive replay payloads)
# ---------------------------------------------------------------------------


def test_ir_descriptive_roundtrip_sony12():
    # build_descriptive_ir_blob_body produces canonical descriptive
    # blobs (the same shape the hub writes), so it gives us a faithful
    # round-trip fixture without a hand-rolled hex string.
    raw = build_descriptive_ir_blob_body("P:Sony12 R:40000 D:1 F:18 MUL:2")
    decoded = try_decode_blob(DEVICE_CLASS_IR, raw)
    assert decoded is not None
    assert decoded["class"] == DEVICE_CLASS_IR
    assert decoded["fields"]["descriptor"] == "P:Sony12 R:40000 D:1 F:18 MUL:2"
    # The four trailing nulls after the descriptor region are part of
    # the writer's output but not part of the declared length, so the
    # decoder captures them verbatim in trailer_hex. This keeps the
    # encoder round-trip independent of any per-protocol footer rules.
    assert decoded["trailer_hex"] == "00 00 00 00"

    assert encode_decoded_blob(decoded) == raw


def test_ir_descriptive_roundtrip_with_extra_trailer():
    # Some captured blobs include a few framing bytes after the
    # standard four trailing nulls. The decoder captures everything
    # past the declared region as trailer_hex so round-trip stays
    # byte-exact regardless of how the readback was paged.
    raw = (
        build_descriptive_ir_blob_body("P:NEC R:38400 D:0 S:206 F:11")
        + bytes([0x99, 0xAA])
    )
    decoded = try_decode_blob(DEVICE_CLASS_IR, raw)
    assert decoded is not None
    assert decoded["fields"]["descriptor"] == "P:NEC R:38400 D:0 S:206 F:11"
    assert decoded["trailer_hex"] == "00 00 00 00 99 aa"
    assert encode_decoded_blob(decoded) == raw


def test_ir_descriptive_edit_descriptor_roundtrip():
    raw = build_descriptive_ir_blob_body("P:Sony12 R:40000 D:1 F:18 MUL:2")
    decoded = try_decode_blob(DEVICE_CLASS_IR, raw)
    assert decoded is not None
    decoded["fields"]["descriptor"] = "P:Sony12 R:40000 D:1 F:25 MUL:2"
    re_encoded = encode_decoded_blob(decoded)
    re_decoded = try_decode_blob(DEVICE_CLASS_IR, re_encoded)
    assert re_decoded is not None
    assert re_decoded["fields"]["descriptor"] == "P:Sony12 R:40000 D:1 F:25 MUL:2"
    assert re_decoded["trailer_hex"] == "00 00 00 00"
    # Declared length on the wire is updated to match the new
    # descriptor length — proves the encoder isn't using the original
    # length verbatim.
    expected_len = len("P:Sony12 R:40000 D:1 F:25 MUL:2").to_bytes(2, "big")
    assert re_encoded[:2] == expected_len


def test_ir_descriptive_preserves_denonk_with_existing_checksum():
    # build_descriptive_ir_blob_body canonicalizes DenonK descriptors
    # by appending a CHECKSUM: field when missing. Once that field is
    # present the input is already canonical, so a decode → encode
    # round-trip is byte-exact. We pre-canonicalize so the fixture
    # itself starts canonical.
    raw = build_descriptive_ir_blob_body(
        "P:DenonK R:37000 C0:84 C1:50 C2:0 D:4 S:1 F:5"
    )
    decoded = try_decode_blob(DEVICE_CLASS_IR, raw)
    assert decoded is not None
    assert decoded["fields"]["descriptor"].startswith("P:DenonK")
    assert "CHECKSUM:" in decoded["fields"]["descriptor"]
    assert encode_decoded_blob(decoded) == raw


def test_render_ir_descriptive_blob_body_matches_writer_minus_trailing_nulls():
    """The canonical byte-layout helper reproduces the synthesis writer's
    output minus the four trailing 0x00 bytes the synthesis path appends.

    The synthesis writer (``commands.build_descriptive_ir_blob_body``)
    composes ``render_ir_descriptive_blob_body`` + four 0x00 bytes.
    Pinning that relationship explicitly catches any future drift in
    either side.
    """

    descriptor = "P:Sony12 R:40000 D:1 F:18 MUL:2"
    synthesized = build_descriptive_ir_blob_body(descriptor)
    via_render = render_ir_descriptive_blob_body(descriptor)
    assert synthesized == via_render + b"\x00\x00\x00\x00"


def test_render_ir_descriptive_blob_body_does_not_canonicalize():
    """The canonical helper preserves the descriptor verbatim.

    Canonicalization only happens in the synthesis path
    (``commands.build_descriptive_ir_blob_body``); the byte-layout
    helper MUST emit the descriptor it was given so the round-trip
    encoder can reproduce captured bytes exactly. A DenonK descriptor
    without ``CHECKSUM:`` would be a different byte sequence on
    output if the canonical helper canonicalized.
    """

    descriptor_no_checksum = "P:DenonK R:37000 C0:84 C1:50 C2:0 D:4 S:1 F:5"
    body = render_ir_descriptive_blob_body(descriptor_no_checksum)
    # The declared length bytes match the input length, with no
    # CHECKSUM: field appended.
    declared_len = int.from_bytes(body[:2], "big")
    assert declared_len == len(descriptor_no_checksum)
    assert body[8 : 8 + declared_len].decode("ascii") == descriptor_no_checksum
    assert b"CHECKSUM:" not in body


def test_render_ir_descriptive_blob_body_rejects_overlength_descriptor():
    with pytest.raises(ValueError):
        render_ir_descriptive_blob_body("P:" + "x" * 0x10000)


def test_ir_descriptive_short_blob_returns_none():
    # Too short to contain even the 8-byte header.
    assert try_decode_blob(DEVICE_CLASS_IR, b"\x00\x05") is None


def test_ir_descriptive_truncated_declared_length_returns_none():
    # Magic prefix is correct but declared length runs past EOF.
    blob = bytes([0x00, 0xFF]) + bytes([0x00, 0x00, 0x11, 0x00, 0x94, 0x70]) + b"P:Sony"
    assert try_decode_blob(DEVICE_CLASS_IR, blob) is None


def test_format_decoded_ir_returns_verbatim_descriptor():
    raw = build_descriptive_ir_blob_body("P:Sony12 R:40000 D:1 F:18 MUL:2")
    decoded = try_decode_blob(DEVICE_CLASS_IR, raw)
    text = format_decoded_for_display(decoded)
    # The IR descriptor view keeps the historical raw-text rendering
    # (no "descriptor:" prefix). Existing tools-card UI depends on
    # this; renaming it would be a visible UI change.
    assert text == "P:Sony12 R:40000 D:1 F:18 MUL:2"


def test_encode_decoded_blob_rejects_unknown_class():
    with pytest.raises(ValueError):
        encode_decoded_blob({"class": "not_a_thing", "fields": {}})


def test_encode_decoded_blob_rejects_missing_fields():
    with pytest.raises(ValueError):
        encode_decoded_blob({"class": DEVICE_CLASS_WIFI_ROKU})


# ---------------------------------------------------------------------------
# Display rendering — used by the Fetch Blob tools card
# ---------------------------------------------------------------------------


def test_render_wifi_ip_http_text_matches_real_blob_bytes():
    """The canonical writer reproduces the HTTP-text bytes in a real backup row.

    Pins the contract on the public ``render_wifi_ip_http_text``
    helper: feeding it the structured fields from a captured row
    yields exactly the bytes that appear at offset 8 of the row's
    ``data_hex`` (length declared in bytes 6..8). This is what
    enables both the backup encoder and the wifi-create protocol
    flow to agree on rendering rules.
    """

    raw = _to_bytes(WIFI_IP_BODYLESS_HEX)
    declared_len = int.from_bytes(raw[6:8], "big")
    expected_http_text = raw[8 : 8 + declared_len]

    assert render_wifi_ip_http_text(
        host="192.168.2.77",
        port=8060,
        method="POST",
        path="/launch/fc012c39d390/1/0/short",
        header="",
        content_type="application/x-www-form-urlencoded",
        body="",
    ) == expected_http_text


def test_render_wifi_ip_blob_body_matches_data_hex_minus_trailer():
    """The blob-body builder produces ``data_hex`` minus the trailer byte."""

    raw = _to_bytes(WIFI_IP_BODYLESS_HEX)
    expected_body = raw[:-1]  # strip the 1-byte trailer

    assert render_wifi_ip_blob_body(
        host="192.168.2.77",
        port=8060,
        method="POST",
        path="/launch/fc012c39d390/1/0/short",
        content_type="application/x-www-form-urlencoded",
    ) == expected_body


def test_render_wifi_ip_http_text_recomputes_content_length():
    """Editing the body changes Content-Length deterministically."""

    text_short = render_wifi_ip_http_text(
        host="10.0.0.1",
        port=80,
        method="POST",
        path="/api",
        content_type="application/json",
        body='{"a":1}',  # 7 bytes
    )
    text_long = render_wifi_ip_http_text(
        host="10.0.0.1",
        port=80,
        method="POST",
        path="/api",
        content_type="application/json",
        body='{"a":1,"b":2}',  # 13 bytes
    )
    assert b"Content-Length:7\r\n\r\n" in text_short
    assert b"Content-Length:13\r\n\r\n" in text_long


def test_render_wifi_ip_blob_body_rejects_invalid_host():
    with pytest.raises(ValueError):
        render_wifi_ip_blob_body(
            host="not.a.valid.address.too.many.octets",
            port=80,
            method="GET",
            path="/",
        )


def test_render_wifi_ip_blob_body_rejects_invalid_port():
    with pytest.raises(ValueError):
        render_wifi_ip_blob_body(
            host="1.2.3.4",
            port=70000,
            method="GET",
            path="/",
        )


def test_format_decoded_wifi_ip_bodyless():
    raw = _to_bytes(WIFI_IP_BODYLESS_HEX)
    decoded = try_decode_blob(DEVICE_CLASS_WIFI_IP, raw)
    text = format_decoded_for_display(decoded)
    assert "host: 192.168.2.77" in text
    assert "port: 8060" in text
    assert "method: POST" in text
    assert "path: /launch/fc012c39d390/1/0/short" in text
    assert "content_type: application/x-www-form-urlencoded" in text
    # Empty body / header are omitted (cleaner display).
    assert "body:" not in text
    assert "header:" not in text


def test_format_decoded_wifi_roku():
    raw = _to_bytes(WIFI_ROKU_HEX)
    decoded = try_decode_blob(DEVICE_CLASS_WIFI_ROKU, raw)
    text = format_decoded_for_display(decoded)
    assert text == "path: launch/cb383539684b/10/0/short"


def test_format_decoded_wifi_hue():
    raw = _to_bytes(WIFI_HUE_HEX)
    decoded = try_decode_blob(DEVICE_CLASS_WIFI_HUE, raw)
    text = format_decoded_for_display(decoded)
    assert "path: api/Wrq3v0M7iDqAXHa-oXOeoXSgHH1LXFYwaNOl6jf1/groups/5/action" in text
    assert "body_block:" in text
    assert '  "on": false' in text  # body block indented for readability
