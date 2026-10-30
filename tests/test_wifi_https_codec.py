"""Reader/writer tests for the X2 ``wifi_https`` (code type 0x21) record body.

The layout was bench-validated on an X2 on 2026-10-24
(docs/internal/wifi-webhook-transport-plan.md, W2-W4). The expected bytes
here are built by hand from that layout, independently of the writer.
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
    WIFI_HTTPS_METHODS,
    parse_wifi_https_blob_body,
    render_wifi_https_blob_body,
)

WEBHOOK_URL = "https://ha.example:8123/api/webhook/abc123?slot=1&press=short"


def _hand_built(url: str, method_code: int, headers: list, body: bytes) -> bytes:
    region = bytearray()
    url_bytes = url.encode("utf-8")
    region += len(url_bytes).to_bytes(2, "big") + url_bytes
    region += bytes([method_code, len(headers)])
    for key, value in headers:
        region += bytes([len(key)]) + key + len(value).to_bytes(2, "big") + value
    region += body
    return (len(region) + 2).to_bytes(2, "big") + bytes(region)


def test_render_matches_the_hand_built_layout():
    expected = _hand_built(
        WEBHOOK_URL,
        2,
        [(b"Content-Type", b"application/json"), (b"X-Key", b"k1")],
        b'{"on":true}',
    )

    rendered = render_wifi_https_blob_body(
        url=WEBHOOK_URL,
        method="PUT",
        headers=[("Content-Type", "application/json"), ("X-Key", "k1")],
        body='{"on":true}',
    )

    assert rendered == expected


def test_declared_length_counts_its_own_two_bytes():
    rendered = render_wifi_https_blob_body(url="http://10.0.0.2/x", method="GET")

    assert int.from_bytes(rendered[0:2], "big") == len(rendered)


def test_bare_get_is_url_method_and_zero_headers():
    rendered = render_wifi_https_blob_body(url="http://10.0.0.2/x", method="get")

    assert rendered == _hand_built("http://10.0.0.2/x", 0, [], b"")


@pytest.mark.parametrize("method", WIFI_HTTPS_METHODS)
def test_every_method_round_trips(method):
    rendered = render_wifi_https_blob_body(url=WEBHOOK_URL, method=method, body="x")

    assert parse_wifi_https_blob_body(rendered)["method"] == method


def test_parse_returns_fields_and_trailer_and_re_renders_exactly():
    region = render_wifi_https_blob_body(
        url=WEBHOOK_URL,
        method="POST",
        headers=[("Authorization", "Bearer t0ken"), ("X-Dup", "1"), ("X-Dup", "2")],
        body='{"slot": 1}',
    )
    blob = region + bytes([0xA7, 0x00])

    fields = parse_wifi_https_blob_body(blob)

    assert fields == {
        "url": WEBHOOK_URL,
        "method": "POST",
        "headers": [["Authorization", "Bearer t0ken"], ["X-Dup", "1"], ["X-Dup", "2"]],
        "body": '{"slot": 1}',
        "trailer_hex": "a7 00",
    }
    again = render_wifi_https_blob_body(
        url=fields["url"], method=fields["method"], headers=fields["headers"], body=fields["body"]
    )
    assert again + bytes.fromhex(fields["trailer_hex"]) == blob


def test_parse_accepts_the_hex_string_form():
    region = render_wifi_https_blob_body(url=WEBHOOK_URL, method="POST")

    assert parse_wifi_https_blob_body(region.hex(" "))["url"] == WEBHOOK_URL


def test_non_ascii_text_round_trips_as_utf8():
    region = render_wifi_https_blob_body(
        url="https://ha.example/api/webhook/café",
        method="POST",
        headers=[("X-Name", "Woonkamer éè")],
        body='{"name": "客厅"}',
    )

    fields = parse_wifi_https_blob_body(region)

    assert fields["url"].endswith("café")
    assert fields["headers"] == [["X-Name", "Woonkamer éè"]]
    assert fields["body"] == '{"name": "客厅"}'


@pytest.mark.parametrize(
    "kwargs, message",
    [
        ({"url": WEBHOOK_URL, "method": "DELETE"}, "method"),
        ({"url": "", "method": "GET"}, "scheme"),
        ({"url": "ftp://ha.example/x", "method": "GET"}, "scheme"),
        ({"url": WEBHOOK_URL, "method": "GET", "headers": [("", "v")]}, "key"),
        ({"url": WEBHOOK_URL, "method": "GET", "headers": [("k" * 256, "v")]}, "key"),
        ({"url": WEBHOOK_URL, "method": "GET", "headers": [("a", "b", "c")]}, "pair"),
        ({"url": WEBHOOK_URL, "method": "GET", "headers": [("k", "v")] * 256}, "255"),
        ({"url": WEBHOOK_URL, "method": "POST", "body": "x" * 0xFFFF}, "65535"),
    ],
)
def test_render_rejects(kwargs, message):
    with pytest.raises(ValueError, match=message):
        render_wifi_https_blob_body(**kwargs)


def _good() -> bytes:
    return render_wifi_https_blob_body(
        url=WEBHOOK_URL, method="POST", headers=[("Content-Type", "application/json")], body="{}"
    )


@pytest.mark.parametrize(
    "blob, message",
    [
        (b"\x00\x06\x00", "too short"),
        ((0xFFFF).to_bytes(2, "big") + _good()[2:], "does not fit"),
        ((5).to_bytes(2, "big") + _good()[2:], "does not fit"),
        (_good()[0:2] + (0x7FFF).to_bytes(2, "big") + _good()[4:], "url runs past"),
        (_hand_built("http://h/x", 3, [], b""), "method byte 3"),
        (_hand_built("http://h/x", 1, [(b"Content-Type", b"x" * 40)], b"")[:-10], "does not fit"),
    ],
)
def test_parse_rejects(blob, message):
    with pytest.raises(ValueError, match=message):
        parse_wifi_https_blob_body(blob)


def test_parse_rejects_a_header_count_past_the_declared_length():
    region = bytearray(render_wifi_https_blob_body(url="http://h/x", method="GET"))
    region[2 + 2 + len(b"http://h/x") + 1] = 1  # one header announced, none present

    with pytest.raises(ValueError, match="header runs past"):
        parse_wifi_https_blob_body(bytes(region))


def test_parse_rejects_invalid_utf8_in_the_body():
    region = render_wifi_https_blob_body(url="http://h/x", method="POST", body="ab")
    broken = region[:-2] + b"\xff\xfe"

    with pytest.raises(ValueError):
        parse_wifi_https_blob_body(broken)
