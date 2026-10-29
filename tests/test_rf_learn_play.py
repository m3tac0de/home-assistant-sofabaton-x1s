"""Tests for RF learn mode and RF one-shot play on the proxy.

Wire shapes under test (not bench-validated yet): ``OP_RF_LEARN``
carries ``[flag, band]`` (flag 01 arms, 00 exits; band 00 = 433 MHz,
01 = 315 MHz); a capture streams back as paged family-0x06 frames with
the IR capture's record layout; the hub pushes ``0x05`` when its own
window expires (answered by arming again) and ``0x68`` when a capture
fails. A one-shot RF play is the IR family-0x0F body with the RF code
type at body[5] and the stored RF signal as library data.
"""

from __future__ import annotations

import threading

import pytest

from custom_components.sofabaton_x1s.lib.commands import extract_learned_rf_blob
from custom_components.sofabaton_x1s.lib.protocol_const import (
    OP_ACK_READY,
    OP_IR_LEARN_FAILED,
    OP_LEARN_EXPIRED,
    OP_RF_LEARN,
    OP_STATUS_ACK,
)
from custom_components.sofabaton_x1s.lib.x1_proxy import X1Proxy

# A short signal in the RF record shape: BE16 byte count of the rest,
# duration count, LE16 gap, LE16 durations.
RF_SIGNAL = bytes.fromhex("0009 03 e01e 5c01 e403 5c01".replace(" ", ""))

_ACK_OK = (OP_STATUS_ACK, b"\x00")
_ARM_433 = (OP_RF_LEARN, b"\x01\x00")
_EXIT_433 = (OP_RF_LEARN, b"\x00\x00")


def _new_proxy(hub_version: str = "X2") -> X1Proxy:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)
    proxy.hub_version = hub_version
    return proxy


def _stub_wire(
    proxy: X1Proxy, monkeypatch, *, acks: list[tuple[int, bytes] | None]
) -> list[tuple[int, bytes]]:
    """Record sends; ``acks`` is consumed one entry per toggle send."""

    sent: list[tuple[int, bytes]] = []
    remaining = list(acks)
    monkeypatch.setattr(
        proxy, "_send_cmd_frame", lambda opcode, payload: sent.append((opcode, payload))
    )
    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(
        proxy,
        "wait_for_ack_any",
        lambda candidates, *, timeout=5.0, not_before=None: (
            remaining.pop(0) if remaining else None
        ),
    )
    return sent


def _capture_frames(signal: bytes = RF_SIGNAL, *, type_byte: int = 0x00):
    """One-page family-0x06 capture of ``signal`` as ``_handle_hub_frames`` tuples."""

    record = (
        bytes([0x01, 0x00, 0x01, 0x00, 0x00, type_byte])
        + b"\x00" * 6
        + b"\x00" * 60
        + signal
    )
    record += bytes([sum(record) & 0xFF])
    payload = bytes([0x01, 0x00, 0x01]) + record
    opcode = (len(payload) << 8) | 0x06
    return [(opcode, b"", payload, 0, 0)]


def _push(opcode: int):
    return [(opcode, b"", b"", 0, 0)]


def _feed_later(proxy: X1Proxy, frames, delay: float = 0.15) -> threading.Timer:
    timer = threading.Timer(delay, lambda: proxy._handle_hub_frames(frames))
    timer.start()
    return timer


# ---------------------------------------------------------------------------
# Hub gate
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("hub_version", "expected"), [("X1", False), ("X1S", True), ("X2", True)]
)
def test_rf_codes_supported_by_hub_line(hub_version, expected) -> None:
    assert _new_proxy(hub_version).rf_codes_supported() is expected


def test_rf_calls_refuse_the_x1_and_unknown_bands(monkeypatch) -> None:
    proxy = _new_proxy("X1")
    sent = _stub_wire(proxy, monkeypatch, acks=[])
    with pytest.raises(ValueError):
        proxy.play_rf_blob(RF_SIGNAL, band=433)
    with pytest.raises(ValueError):
        proxy.rf_learn_command(band=433, timeout=0.1)

    proxy = _new_proxy("X2")
    with pytest.raises(ValueError):
        proxy.play_rf_blob(RF_SIGNAL, band=868)
    with pytest.raises(ValueError):
        proxy.rf_learn_command(band=868, timeout=0.1)
    assert sent == []


# ---------------------------------------------------------------------------
# One-shot play
# ---------------------------------------------------------------------------


def _stub_play(proxy: X1Proxy, monkeypatch) -> list[tuple[int, bytes]]:
    sent: list[tuple[int, bytes]] = []
    monkeypatch.setattr(
        proxy, "_send_cmd_frame", lambda opcode, payload: sent.append((opcode, payload))
    )
    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(
        proxy,
        "wait_for_ack_any",
        lambda candidates, *, timeout=5.0, not_before=None: (0x0103, b"\x00"),
    )
    monkeypatch.setattr(proxy, "_wait_for_ack_any_impl", lambda *args, **kwargs: None)
    return sent


@pytest.mark.parametrize(("band", "code_type"), [(433, 0x1D), (315, 0x1E)])
def test_play_rf_blob_puts_the_code_type_at_body_byte_5(monkeypatch, band, code_type) -> None:
    proxy = _new_proxy("X2")
    sent = _stub_play(proxy, monkeypatch)

    assert proxy.play_rf_blob(RF_SIGNAL, band=band) is True

    assert len(sent) == 1
    opcode, payload = sent[0]
    assert opcode & 0xFF == 0x0F
    assert payload[:3] == b"\x01\x00\x01"
    body = payload[3:]
    assert body[:12] == bytes([0x01, 0x00, 0x01, 0x00, 0x00, code_type]) + b"\x00" * 6
    assert body[12:-1] == RF_SIGNAL
    assert body[-1] == sum(body[:-1]) & 0xFF


def test_play_ir_blob_keeps_body_byte_5_zero(monkeypatch) -> None:
    proxy = _new_proxy("X1S")
    sent = _stub_play(proxy, monkeypatch)
    ir_blob = bytes.fromhex("0008 0000 0000 9c40 000011b4 00001171 00000000".replace(" ", ""))

    assert proxy.play_ir_blob(ir_blob) is True
    assert sent[0][1][3:15] == bytes([0x01, 0x00, 0x01]) + b"\x00" * 9


def test_play_rf_blob_refuses_a_too_short_signal(monkeypatch) -> None:
    proxy = _new_proxy("X2")
    sent = _stub_play(proxy, monkeypatch)

    assert proxy.play_rf_blob(b"\x00\x02\x01", band=433) is False
    assert sent == []


# ---------------------------------------------------------------------------
# Learn window
# ---------------------------------------------------------------------------


def test_rf_learn_exits_then_arms_and_learns(monkeypatch) -> None:
    proxy = _new_proxy("X2")
    sent = _stub_wire(proxy, monkeypatch, acks=[_ACK_OK, _ACK_OK])
    timer = _feed_later(proxy, _capture_frames(type_byte=0x0D))
    try:
        result = proxy.rf_learn_command(band=433, timeout=5.0)
    finally:
        timer.cancel()

    assert result == {
        "state": "learned",
        "payload_hex": RF_SIGNAL.hex(" "),
        "band": 433,
        "code_type": 0x1D,
    }
    # A capture ends the window by itself: no trailing EXIT.
    assert sent == [_EXIT_433, _ARM_433]
    assert proxy._ir_learn_pending is None


def test_rf_learn_uses_the_315_band_byte(monkeypatch) -> None:
    proxy = _new_proxy("X1S")
    sent = _stub_wire(proxy, monkeypatch, acks=[_ACK_OK, _ACK_OK])
    timer = _feed_later(proxy, _capture_frames())
    try:
        result = proxy.rf_learn_command(band=315, timeout=5.0)
    finally:
        timer.cancel()

    assert result is not None and result["code_type"] == 0x1E
    assert sent == [(OP_RF_LEARN, b"\x00\x01"), (OP_RF_LEARN, b"\x01\x01")]


def test_rf_learn_arms_again_when_the_hub_window_expires(monkeypatch) -> None:
    proxy = _new_proxy("X2")
    sent = _stub_wire(proxy, monkeypatch, acks=[_ACK_OK, _ACK_OK, _ACK_OK])
    expired = _feed_later(proxy, _push(OP_LEARN_EXPIRED), delay=0.1)
    capture = _feed_later(proxy, _capture_frames(), delay=0.4)
    try:
        result = proxy.rf_learn_command(band=433, timeout=5.0)
    finally:
        expired.cancel()
        capture.cancel()

    assert result is not None and result["state"] == "learned"
    assert sent == [_EXIT_433, _ARM_433, _ARM_433]


def test_rf_learn_reports_a_failed_capture_and_exits(monkeypatch) -> None:
    proxy = _new_proxy("X2")
    sent = _stub_wire(proxy, monkeypatch, acks=[_ACK_OK, _ACK_OK, _ACK_OK])
    timer = _feed_later(proxy, _push(OP_IR_LEARN_FAILED))
    try:
        result = proxy.rf_learn_command(band=433, timeout=5.0)
    finally:
        timer.cancel()

    assert result == {"state": "failed"}
    assert sent == [_EXIT_433, _ARM_433, _EXIT_433]


def test_rf_learn_timeout_exits(monkeypatch) -> None:
    proxy = _new_proxy("X2")
    sent = _stub_wire(proxy, monkeypatch, acks=[_ACK_OK, _ACK_OK, _ACK_OK])

    assert proxy.rf_learn_command(band=433, timeout=0.2) == {
        "state": "timed_out",
        "timeout_s": 0.2,
    }
    assert sent == [_EXIT_433, _ARM_433, _EXIT_433]


def test_rf_learn_interrupted_by_hub_traffic_still_exits(monkeypatch) -> None:
    proxy = _new_proxy("X2")
    sent = _stub_wire(proxy, monkeypatch, acks=[_ACK_OK, _ACK_OK, _ACK_OK])
    timer = _feed_later(proxy, [(OP_ACK_READY, b"", b"\x01", 0, 0)])
    try:
        result = proxy.rf_learn_command(band=433, timeout=5.0)
    finally:
        timer.cancel()

    assert result == {"state": "interrupted", "interrupted_by": "ACK_READY (0x0160)"}
    assert sent == [_EXIT_433, _ARM_433, _EXIT_433]


def test_rf_learn_cancel_exits(monkeypatch) -> None:
    proxy = _new_proxy("X2")
    sent = _stub_wire(proxy, monkeypatch, acks=[_ACK_OK, _ACK_OK, _ACK_OK])
    timer = threading.Timer(0.15, proxy.cancel_ir_learn)
    timer.start()
    try:
        result = proxy.rf_learn_command(band=433, timeout=5.0)
    finally:
        timer.cancel()

    assert result == {"state": "cancelled"}
    assert sent == [_EXIT_433, _ARM_433, _EXIT_433]


def test_rf_learn_refused_arm_returns_none(monkeypatch) -> None:
    proxy = _new_proxy("X2")
    _stub_wire(proxy, monkeypatch, acks=[_ACK_OK, (OP_STATUS_ACK, b"\x11")])

    assert proxy.rf_learn_command(band=433, timeout=0.2) is None
    assert proxy._ir_learn_pending is None


def test_rf_learn_ignored_while_app_owns_the_session(monkeypatch) -> None:
    proxy = _new_proxy("X2")
    sent: list[tuple[int, bytes]] = []
    monkeypatch.setattr(
        proxy, "_send_cmd_frame", lambda opcode, payload: sent.append((opcode, payload))
    )
    monkeypatch.setattr(proxy, "can_issue_commands", lambda: False)

    assert proxy.rf_learn_command(band=433, timeout=0.1) is None
    assert sent == []


def test_ir_learn_still_treats_the_expired_push_as_interruption(monkeypatch) -> None:
    # The IR receiver was never seen to push 0x05; the RF handling must
    # not leak into the IR window.
    proxy = _new_proxy("X1S")
    _stub_wire(proxy, monkeypatch, acks=[_ACK_OK, _ACK_OK])
    timer = _feed_later(proxy, _push(OP_LEARN_EXPIRED))
    try:
        result = proxy.ir_learn_command(timeout=5.0)
    finally:
        timer.cancel()

    assert result is not None and result["state"] == "interrupted"


# ---------------------------------------------------------------------------
# Record extraction
# ---------------------------------------------------------------------------


def test_extract_learned_rf_blob_cuts_after_the_label_slot() -> None:
    _opcode, _raw, payload, _s, _e = _capture_frames()[0]
    record = payload[3:]

    assert extract_learned_rf_blob(record) == RF_SIGNAL
    assert extract_learned_rf_blob(record[:73]) is None
    assert extract_learned_rf_blob(b"") is None
