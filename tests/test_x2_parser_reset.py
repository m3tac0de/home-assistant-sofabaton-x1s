"""X2 descriptor-parser reset: a raw reset play precedes every P: play on the X2.

Live finding (loopback bench, 2026-09-03): the X2's family-0x0F one-shot
play path keeps descriptor-parser state between plays, and any raw play
with >= 8 timing words re-initialises it. ``play_ir_blob`` therefore
plays the reset blips first whenever the hub is an X2 and the payload is
a ``P:`` descriptor. Raw payloads and other hub generations are untouched.
"""

from __future__ import annotations

import pytest

from custom_components.sofabaton_x1s.lib.blob_decoders import (
    X2_PARSER_RESET_CARRIER_HZ,
    X2_PARSER_RESET_TIMINGS_US,
    build_raw_ir_blob_body,
    parse_raw_ir_blob_body,
)
from custom_components.sofabaton_x1s.lib.commands import build_descriptive_ir_blob_body
from custom_components.sofabaton_x1s.lib.hub_versions import (
    HUB_VERSION_X1,
    HUB_VERSION_X1S,
    HUB_VERSION_X2,
)
from custom_components.sofabaton_x1s.lib.proxy_ir_blob import x2_parser_reset_blob
from custom_components.sofabaton_x1s.lib.x1_proxy import X1Proxy

DESCRIPTOR = build_descriptive_ir_blob_body(
    "P:SharpDVD R:38000 C0:170 C1:90 C2:15 D:8 S:116 F:16 E:1 CHECKSUM:11"
)
RAW = build_raw_ir_blob_body([9000, 4500, 560, 560, 560, 1690, 560, 40000], 38000)


def _proxy(hub_version: str) -> X1Proxy:
    return X1Proxy(
        "127.0.0.1",
        hub_version=hub_version,
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
    )


def _capture_bodies(proxy: X1Proxy, monkeypatch) -> list[bytes]:
    """Record every library_data body handed to the play path, in order."""

    bodies: list[bytes] = []
    original = proxy._build_play_blob_body_buffer

    def _build(library_data: bytes) -> bytes:
        bodies.append(bytes(library_data))
        return original(library_data)

    monkeypatch.setattr(proxy, "_build_play_blob_body_buffer", _build)
    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: None)
    monkeypatch.setattr(
        proxy, "wait_for_ack_any", lambda candidates, *, timeout=5.0, not_before=None: (0x0103, b"\x00")
    )
    monkeypatch.setattr(
        proxy,
        "_wait_for_ack_any_impl",
        lambda candidates, *, timeout=5.0, not_before=None, log_timeout=True: None,
    )
    return bodies


def test_reset_blob_is_the_documented_eight_word_body() -> None:
    blob = x2_parser_reset_blob()
    timings, carrier = parse_raw_ir_blob_body(blob)
    assert timings == list(X2_PARSER_RESET_TIMINGS_US)
    assert len(timings) == 8  # the live-established minimum that re-inits the parser
    assert carrier == X2_PARSER_RESET_CARRIER_HZ == 65000
    assert min(timings[0::2]) >= 20  # never 1 us marks: they corrupt the next emission
    assert blob == bytes.fromhex(
        "0020 0000 0000 fde8 00000014 00001388 00000014 00001388"
        "00000014 00001388 00000014 00001388 00000000".replace(" ", "")
    )


def test_x2_descriptor_play_is_preceded_by_the_reset(monkeypatch) -> None:
    proxy = _proxy(HUB_VERSION_X2)
    bodies = _capture_bodies(proxy, monkeypatch)
    assert proxy.play_ir_blob(DESCRIPTOR) is True
    assert bodies == [x2_parser_reset_blob(), DESCRIPTOR]


def test_x2_raw_play_has_no_reset(monkeypatch) -> None:
    proxy = _proxy(HUB_VERSION_X2)
    bodies = _capture_bodies(proxy, monkeypatch)
    assert proxy.play_ir_blob(RAW) is True
    assert bodies == [RAW]


@pytest.mark.parametrize("hub_version", [HUB_VERSION_X1, HUB_VERSION_X1S])
def test_other_hubs_play_descriptors_without_reset(hub_version, monkeypatch) -> None:
    proxy = _proxy(hub_version)
    bodies = _capture_bodies(proxy, monkeypatch)
    assert proxy.play_ir_blob(DESCRIPTOR) is True
    assert bodies == [DESCRIPTOR]


def test_x2_descriptor_still_plays_when_reset_is_refused(monkeypatch, caplog) -> None:
    proxy = _proxy(HUB_VERSION_X2)
    bodies = _capture_bodies(proxy, monkeypatch)
    original = proxy._play_ir_blob_body
    calls = {"n": 0}

    def _play(body_buffer, **kwargs):
        calls["n"] += 1
        if calls["n"] == 1:
            return False, True  # the reset is rejected
        return original(body_buffer, **kwargs)

    monkeypatch.setattr(proxy, "_play_ir_blob_body", _play)
    assert proxy.play_ir_blob(DESCRIPTOR) is True
    assert bodies == [x2_parser_reset_blob(), DESCRIPTOR]
    assert "parser reset play not acked" in caplog.text
