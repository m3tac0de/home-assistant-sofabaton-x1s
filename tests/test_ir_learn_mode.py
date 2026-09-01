"""Tests for IR learn mode: the toggle, the full learn flow, and naming.

Covers the proxy wire format (``set_ir_learn_mode``, ``ir_learn_command``),
the frame-name registry entries that keep learn traffic out of the
"unknown op" log path, and the service handlers.

Wire facts under test come from a captured app learn session plus a
two-hub live bench (X1S, 2026-08/09): ``a5 5a 00 04 03`` arms learn
mode, ``a5 5a 00 05 04`` exits it, both ACKed with STATUS_ACK 0x00.
Arming must always send EXIT before ENTER (the hub can believe it is
armed while its receiver is not listening; a bare ENTER is then inert).
The hub never signals leaving learn mode: it exits silently after ~60 s
or on any wire traffic, and a captured code streams back as paged
family-0x06 frames. The LEARN_* fixtures below are the real capture.
"""

from __future__ import annotations

import asyncio
import importlib
import re
import threading

import pytest

from homeassistant.exceptions import HomeAssistantError

from custom_components.sofabaton_x1s.lib.commands import extract_learned_ir_blob
from custom_components.sofabaton_x1s.lib.protocol_const import (
    OP_ACK_READY,
    OP_IR_LEARN_ENTER,
    OP_IR_LEARN_EXIT,
    OP_STATUS_ACK,
    OPNAMES,
    opcode_family_name,
)
from custom_components.sofabaton_x1s.lib.x1_proxy import X1Proxy

integration = importlib.import_module("custom_components.sofabaton_x1s.__init__")


def _hx(s: str) -> bytes:
    return bytes.fromhex(re.sub(r"\s", "", s))


# ---------------------------------------------------------------------------
# Captured learn-result frames (full wire bytes; X1S hub, 2026-08-31).
# Samsung TV press: 3 pages, 38 407 Hz carrier, 136 durations, two IR
# frames separated by a 46.8 ms gap, 200 ms trailing gap.
# ---------------------------------------------------------------------------

LEARN_CAPTURE_WIRE: list[bytes] = [
    _hx("""
        a5 5a fa 06 01 00 01 01 00 03 00 00 00 00 00 00 00 00 00 00 00 00 00 00
        00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
        00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
        00 00 00 00 00 00 00 02 20 00 00 00 00 96 07 00 00 11 b4 00 00 11
        71 00 00 02 64 00 00 06 66 00 00 02 64 00 00 06 61 00 00 02 4a 00 00 06
        7b 00 00 02 4a 00 00 02 3b 00 00 02 2f 00 00 02 21 00 00 02 2f 00 00 02
        26 00 00 02 2f 00 00 02 26 00 00 02 4a 00 00 02 2b 00 00 02 2f 00 00 06
        81 00 00 02 4a 00 00 06 80 00 00 02 4a 00 00 06 7b 00 00 02 4a 00 00 02
        30 00 00 02 1f 00 00 02 26 00 00 02 34 00 00 02 21 00 00 02 4a 00 00 02
        20 00 00 02 2f 00 00 02 21 00 00 02 2f 00 00 06 81 00 00 02 4a 00 00 06
        96 00 00 02 2f 00 00 06 81 00 00 02 4a 00 00 02 5e
    """),
    _hx("""
        a5 5a fa 06 01 00 02 20 00 00 02 2f 00 00 02 3b 00 00 02 2f 00 00 02 21
        00 00 02 2f 00 00 02 26 00 00 02 2f 00 00 02 26 00 00 02 4a 00 00 02 2b
        00 00 02 2f 00 00 02 26 00 00 02 2f 00 00 02 31 00 00 02 24 00 00 06 7c
        00 00 02 4a 00 00 06 80 00 00 02 4a 00 00 06 7b 00 00 02 4a 00 00 06 7b
        00 00 02 4a 00 00 06 7b 00 00 02 4a 00 00 b6 b6 00 00 11 8f 00 00 11 7b
        00 00 02 4a 00 00 06 80 00 00 02 4a 00 00 06 7b 00 00 02 4a 00 00 06 80
        00 00 02 4a 00 00 02 20 00 00 02 2f 00 00 02 3b 00 00 02 2f 00 00 02 21
        00 00 02 2f 00 00 02 26 00 00 02 2f 00 00 02 51 00 00 02 1f 00 00 06 66
        00 00 02 64 00 00 06 61 00 00 02 64 00 00 06 61 00 00 02 64 00 00 02 26
        00 00 02 2f 00 00 02 26 00 00 02 2f 00 00 02 26 00 00 02 2f 00 00 02 3b
        00 00 02 2f 00 00 02 26 00 00 02 2f 00 00 6e
    """),
    _hx("""
        a5 5a 8a 06 01 00 03 06 7b 00 00 02 4a 00 00 06 7b 00 00 02 4a 00 00 06
        7b 00 00 02 4a 00 00 02 30 00 00 02 24 00 00 02 21 00 00 02 2f 00 00 02
        3b 00 00 02 2f 00 00 02 26 00 00 02 2f 00 00 02 26 00 00 02 2f 00 00 02
        41 00 00 02 34 00 00 02 21 00 00 02 2f 00 00 02 21 00 00 02 2f 00 00 06
        7b 00 00 02 4a 00 00 06 7b 00 00 02 4a 00 00 06 7b 00 00 02 4a 00 00 06
        80 00 00 02 4a 00 00 06 96 00 00 02 3a 00 03 0d 40 00 00 00 00 7e c6
    """),
]


def _capture_frame_tuples() -> list[tuple[int, bytes, bytes, int, int]]:
    """Return the capture as ``(opcode, raw, payload, scid, ecid)`` tuples."""

    tuples = []
    for index, wire in enumerate(LEARN_CAPTURE_WIRE):
        opcode = (wire[2] << 8) | wire[3]
        payload = wire[4:-1]
        tuples.append((opcode, wire, payload, index, index))
    return tuples


# ---------------------------------------------------------------------------
# Proxy wire format: set_ir_learn_mode
# ---------------------------------------------------------------------------


def _new_proxy() -> X1Proxy:
    return X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)


def _arm_proxy(
    proxy: X1Proxy,
    monkeypatch,
    *,
    acks: list[tuple[int, bytes] | None],
) -> list[tuple[int, bytes]]:
    """Stub sends and acks; ``acks`` is consumed one entry per toggle send."""

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


_ACK_OK = (OP_STATUS_ACK, b"\x00")


def test_arm_always_exits_first(monkeypatch) -> None:
    proxy = _new_proxy()
    sent = _arm_proxy(proxy, monkeypatch, acks=[_ACK_OK, _ACK_OK])

    assert proxy.set_ir_learn_mode(True) is True
    assert sent == [(OP_IR_LEARN_EXIT, b""), (OP_IR_LEARN_ENTER, b"")]


def test_arm_tolerates_unacked_pre_exit(monkeypatch) -> None:
    proxy = _new_proxy()
    sent = _arm_proxy(proxy, monkeypatch, acks=[None, _ACK_OK])

    assert proxy.set_ir_learn_mode(True) is True
    assert sent == [(OP_IR_LEARN_EXIT, b""), (OP_IR_LEARN_ENTER, b"")]


def test_arm_fails_when_enter_unacked(monkeypatch) -> None:
    proxy = _new_proxy()
    _arm_proxy(proxy, monkeypatch, acks=[_ACK_OK, None])

    assert proxy.set_ir_learn_mode(True) is False


def test_arm_fails_when_enter_rejected(monkeypatch) -> None:
    proxy = _new_proxy()
    _arm_proxy(proxy, monkeypatch, acks=[_ACK_OK, (OP_STATUS_ACK, b"\x0c")])

    assert proxy.set_ir_learn_mode(True) is False


def test_disarm_sends_single_exit(monkeypatch) -> None:
    proxy = _new_proxy()
    sent = _arm_proxy(proxy, monkeypatch, acks=[_ACK_OK])

    assert proxy.set_ir_learn_mode(False) is True
    assert sent == [(OP_IR_LEARN_EXIT, b"")]


def test_ignored_while_app_owns_the_session(monkeypatch) -> None:
    proxy = _new_proxy()
    sent: list[tuple[int, bytes]] = []
    monkeypatch.setattr(
        proxy, "_send_cmd_frame", lambda opcode, payload: sent.append((opcode, payload))
    )
    monkeypatch.setattr(proxy, "can_issue_commands", lambda: False)

    assert proxy.set_ir_learn_mode(True) is False
    assert proxy.ir_learn_command(timeout=0.1) is None
    assert sent == []


# ---------------------------------------------------------------------------
# Proxy: ir_learn_command
# ---------------------------------------------------------------------------


def _feed_later(proxy: X1Proxy, frames, delay: float = 0.15) -> threading.Timer:
    timer = threading.Timer(delay, lambda: proxy._handle_hub_frames(frames))
    timer.start()
    return timer


def test_ir_learn_command_learns_from_capture(monkeypatch) -> None:
    proxy = _new_proxy()
    sent = _arm_proxy(proxy, monkeypatch, acks=[_ACK_OK, _ACK_OK])
    timer = _feed_later(proxy, _capture_frame_tuples())
    try:
        result = proxy.ir_learn_command(timeout=5.0)
    finally:
        timer.cancel()

    assert result is not None
    assert result["state"] == "learned"
    assert sent == [(OP_IR_LEARN_EXIT, b""), (OP_IR_LEARN_ENTER, b"")]

    payload = bytes.fromhex(result["payload_hex"].replace(" ", ""))
    assert payload.startswith(bytes.fromhex("02200000000096 07".replace(" ", "")))
    assert payload.endswith(bytes.fromhex("00030d4000000000"))
    assert len(payload) == 8 + 0x0220 + 4
    assert result["carrier_hz"] == 0x9607
    assert result["duration_count"] == 136


def test_ir_learn_command_interrupted_by_hub_push(monkeypatch) -> None:
    proxy = _new_proxy()
    sent = _arm_proxy(proxy, monkeypatch, acks=[_ACK_OK, _ACK_OK])
    push = [(OP_ACK_READY, b"", b"\x01", 0, 0)]
    timer = _feed_later(proxy, push)
    try:
        result = proxy.ir_learn_command(timeout=5.0)
    finally:
        timer.cancel()

    assert result == {"state": "interrupted", "interrupted_by": "ACK_READY (0x0160)"}
    # The interrupting traffic already ended the hub's learn window; no
    # trailing EXIT is sent.
    assert sent == [(OP_IR_LEARN_EXIT, b""), (OP_IR_LEARN_ENTER, b"")]


def test_ir_learn_command_timeout_disarms(monkeypatch) -> None:
    proxy = _new_proxy()
    sent = _arm_proxy(proxy, monkeypatch, acks=[_ACK_OK, _ACK_OK, _ACK_OK])

    result = proxy.ir_learn_command(timeout=0.2)

    assert result == {"state": "timed_out", "timeout_s": 0.2}
    assert sent == [
        (OP_IR_LEARN_EXIT, b""),
        (OP_IR_LEARN_ENTER, b""),
        (OP_IR_LEARN_EXIT, b""),
    ]


def test_ir_learn_command_ignores_status_acks_while_waiting(monkeypatch) -> None:
    proxy = _new_proxy()
    _arm_proxy(proxy, monkeypatch, acks=[_ACK_OK, _ACK_OK, _ACK_OK])
    ack_frame = [(OP_STATUS_ACK, b"", b"\x00", 0, 0)]
    timer = _feed_later(proxy, ack_frame, delay=0.05)
    try:
        result = proxy.ir_learn_command(timeout=0.3)
    finally:
        timer.cancel()

    assert result is not None
    assert result["state"] == "timed_out"


def test_ir_learn_command_arm_failure_returns_none(monkeypatch) -> None:
    proxy = _new_proxy()
    _arm_proxy(proxy, monkeypatch, acks=[_ACK_OK, None])

    assert proxy.ir_learn_command(timeout=0.2) is None
    assert proxy._ir_learn_pending is None


# ---------------------------------------------------------------------------
# Blob extraction from the reassembled record
# ---------------------------------------------------------------------------


def test_extract_learned_ir_blob_from_capture_record() -> None:
    record = b"".join(payload[3:] for _op, _raw, payload, _s, _e in _capture_frame_tuples())

    blob = extract_learned_ir_blob(record, hub_version="X1S")
    assert blob is not None
    assert blob[0:2] == b"\x02\x20"
    assert blob[2:6] == b"\x00\x00\x00\x00"
    assert blob[6:8] == b"\x96\x07"
    assert len(blob) == 8 + 0x0220 + 4
    # The persist tail byte (0x7e on this capture) must be stripped.
    assert record[-1] == 0x7E
    assert not blob.endswith(b"\x7e")


def test_extract_learned_ir_blob_x1_layout_via_validation() -> None:
    # X1 record: 30-byte label slot, blob at record offset 42. The label
    # slot is all zeros so only the self-describing length check can pick
    # the layout.
    blob = (
        b"\x00\x08"  # 8 timing bytes
        + b"\x00\x00\x00\x00"
        + b"\x9c\x40"  # 40 000 Hz
        + b"\x00\x00\x11\xb4\x00\x00\x11\x71"
        + b"\x00\x00\x00\x00"
    )
    record = b"\x01\x00\x01" + b"\x00" * 39 + blob + b"\x42"

    assert extract_learned_ir_blob(record, hub_version="X1") == blob
    # Validation finds the layout even without the hub_version hint.
    assert extract_learned_ir_blob(record) == blob


# ---------------------------------------------------------------------------
# Frame naming: learn traffic must not log as "unknown op"
# ---------------------------------------------------------------------------


def test_learn_opcodes_have_names() -> None:
    assert OPNAMES[OP_IR_LEARN_ENTER] == "IR_LEARN_ENTER"
    assert OPNAMES[OP_IR_LEARN_EXIT] == "IR_LEARN_EXIT"


def test_learn_and_write_pages_resolve_to_family_names() -> None:
    # Paged frames encode the payload length in opcode-hi, so any length
    # must resolve through the family (low byte) name.
    assert opcode_family_name(0xFA06) == "IR_LEARN_DATA"
    assert opcode_family_name(0x8A06) == "IR_LEARN_DATA"
    assert opcode_family_name(0xFA0E) == "COMMAND_WRITE"
    assert opcode_family_name(0x8A0E) == "COMMAND_WRITE"


# ---------------------------------------------------------------------------
# Service handlers
# ---------------------------------------------------------------------------


class _FakeHub:
    def __init__(self, *, result=True, learn_result=None) -> None:
        self.entry_id = "entry-1"
        self.calls: list = []
        self._result = result
        self._learn_result = learn_result

    async def async_set_ir_learn_mode(self, enabled: bool) -> bool:
        self.calls.append(enabled)
        return self._result

    async def async_ir_learn_command(self, *, timeout: float = 60.0):
        self.calls.append(("learn", timeout))
        return self._learn_result


class _FakeCall:
    def __init__(self, data: dict) -> None:
        self.data = data
        self.hass = object()


def _patch_resolve(monkeypatch, hub) -> None:
    async def _resolve(hass, call):
        return hub

    monkeypatch.setattr(integration, "_async_resolve_hub_from_call", _resolve)


def test_service_toggles_both_ways(monkeypatch) -> None:
    hub = _FakeHub()
    _patch_resolve(monkeypatch, hub)

    asyncio.run(
        integration._async_handle_set_ir_learn_mode(_FakeCall({"enabled": True}))
    )
    asyncio.run(
        integration._async_handle_set_ir_learn_mode(_FakeCall({"enabled": False}))
    )

    assert hub.calls == [True, False]


def test_service_requires_boolean_enabled(monkeypatch) -> None:
    hub = _FakeHub()
    _patch_resolve(monkeypatch, hub)

    with pytest.raises(ValueError, match="enabled must be a boolean"):
        asyncio.run(
            integration._async_handle_set_ir_learn_mode(_FakeCall({"enabled": "yes"}))
        )
    with pytest.raises(ValueError, match="enabled must be a boolean"):
        asyncio.run(integration._async_handle_set_ir_learn_mode(_FakeCall({})))
    assert hub.calls == []


def test_service_raises_when_hub_refuses(monkeypatch) -> None:
    hub = _FakeHub(result=False)
    _patch_resolve(monkeypatch, hub)

    with pytest.raises(HomeAssistantError, match="IR learn-mode toggle"):
        asyncio.run(
            integration._async_handle_set_ir_learn_mode(_FakeCall({"enabled": True}))
        )


def test_learn_service_returns_result(monkeypatch) -> None:
    expected = {"state": "learned", "payload_hex": "02 20"}
    hub = _FakeHub(learn_result=expected)
    _patch_resolve(monkeypatch, hub)

    result = asyncio.run(
        integration._async_handle_ir_learn_command(_FakeCall({"timeout": 30}))
    )

    assert result is expected
    assert hub.calls == [("learn", 30.0)]


def test_learn_service_defaults_timeout(monkeypatch) -> None:
    hub = _FakeHub(learn_result={"state": "timed_out", "timeout_s": 60.0})
    _patch_resolve(monkeypatch, hub)

    asyncio.run(integration._async_handle_ir_learn_command(_FakeCall({})))

    assert hub.calls == [("learn", 60.0)]


def test_learn_service_validates_timeout(monkeypatch) -> None:
    hub = _FakeHub()
    _patch_resolve(monkeypatch, hub)

    with pytest.raises(ValueError, match="between 5 and 120"):
        asyncio.run(integration._async_handle_ir_learn_command(_FakeCall({"timeout": 2})))
    with pytest.raises(ValueError, match="between 5 and 120"):
        asyncio.run(
            integration._async_handle_ir_learn_command(_FakeCall({"timeout": 500}))
        )
    with pytest.raises(ValueError, match="must be a number"):
        asyncio.run(
            integration._async_handle_ir_learn_command(_FakeCall({"timeout": "soon"}))
        )
    assert hub.calls == []


def test_learn_service_raises_when_arm_refused(monkeypatch) -> None:
    hub = _FakeHub(learn_result=None)
    _patch_resolve(monkeypatch, hub)

    with pytest.raises(HomeAssistantError, match="learn-mode arm"):
        asyncio.run(integration._async_handle_ir_learn_command(_FakeCall({})))
