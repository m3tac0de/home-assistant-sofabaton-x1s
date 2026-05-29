"""Phase 5 ack-handling tests.

The refactor plan's Phase 5 calls for three new behavioural assertions on
:meth:`X1Proxy._send_step` and the activity-inputs burst wait:

* a ``STATUS_ACK`` (``0x0103``) carrying a non-zero first byte must be
  classified as :class:`AckOutcome.rejected`, not silently accepted;
* a missing reply must be classified as :class:`AckOutcome.timeout`;
* a multi-step orchestration must stop at the first rejection rather than
  spinning out subsequent per-step timeouts.

These tests pin the new outcome contract so future refactors cannot
regress the fail-fast plumbing without tripping a red test.
"""

from __future__ import annotations

from custom_components.sofabaton_x1s.lib.ack import (
    AckOutcome,
    InputsBurstResult,
    SendStepResult,
)
from custom_components.sofabaton_x1s.lib.frame_handlers import (
    FrameContext,
    frame_handler_registry,
)
from custom_components.sofabaton_x1s.lib.protocol_const import OP_ACTIVITY_CREATE_ACK
from custom_components.sofabaton_x1s.lib.x1_proxy import X1Proxy


def _make_proxy() -> X1Proxy:
    return X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)


def test_send_step_returns_rejected_on_status_ack_nonzero(monkeypatch) -> None:
    """A ``STATUS_ACK 0x0C`` reply trips the rejection classifier."""

    proxy = _make_proxy()
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: None)

    def _wait_any(candidates, *, timeout=5.0, not_before=None):
        # The send_step call below explicitly waits for STATUS_ACK success;
        # the proxy expands the candidate set to also wake on any other
        # first byte so a rejection surfaces immediately.
        assert (0x0103, 0x00) in candidates
        assert (0x0103, None) in candidates
        return 0x0103, b"\x0C"

    monkeypatch.setattr(proxy, "wait_for_ack_any", _wait_any)

    result = proxy._send_step(
        step_name="probe",
        family=0x07,
        payload=b"\x00",
        ack_opcode=0x0103,
        ack_first_byte=0x00,
    )

    assert isinstance(result, SendStepResult)
    assert result.outcome is AckOutcome.rejected
    assert result.rejected is True
    assert result.ack_payload == b"\x0C"


def test_send_step_returns_timeout_when_silent(monkeypatch) -> None:
    """When the hub never answers, the outcome is :attr:`AckOutcome.timeout`."""

    proxy = _make_proxy()
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: None)

    def _wait_any(candidates, *, timeout=5.0, not_before=None):
        return None

    monkeypatch.setattr(proxy, "wait_for_ack_any", _wait_any)

    result = proxy._send_step(
        step_name="probe",
        family=0x07,
        payload=b"\x00",
        ack_opcode=0x0107,
        timeout=0.01,
    )

    assert result.outcome is AckOutcome.timeout
    assert result.timed_out is True
    assert result.ok is False


def test_send_step_classifies_non_status_opcode_as_acked(monkeypatch) -> None:
    """A non-STATUS_ACK opcode with arbitrary payload is acked, not rejected.

    Only ``0x0103`` carries a binary verdict in ``payload[0]``; other ack
    opcodes (e.g. ``0x013E`` keymap acks) use the byte as data.
    """

    proxy = _make_proxy()
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: None)

    def _wait_any(candidates, *, timeout=5.0, not_before=None):
        return 0x013E, b"\x0C"

    monkeypatch.setattr(proxy, "wait_for_ack_any", _wait_any)

    result = proxy._send_step(
        step_name="map",
        family=0x3E,
        payload=b"\x00",
        ack_opcode=0x013E,
        ack_first_byte=None,
    )

    assert result.outcome is AckOutcome.acked
    assert result.ack_payload == b"\x0C"


def test_multi_step_sequence_aborts_on_first_reject(monkeypatch) -> None:
    """A reject mid-sequence stops subsequent ``_send_step`` calls.

    Models the post-Phase-5 orchestration pattern: each step is wrapped in
    ``if not result.ok: return None`` so a rejection short-circuits the
    rest of the sequence instead of letting later steps time out.
    """

    proxy = _make_proxy()
    sent: list[int] = []
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: None)

    step_payloads = [b"\x00", b"\x0C", b"\x00"]
    cursor = iter(step_payloads)

    def _wait_any(candidates, *, timeout=5.0, not_before=None):
        sent.append(candidates[0][0])
        return 0x0103, next(cursor)

    monkeypatch.setattr(proxy, "wait_for_ack_any", _wait_any)

    outcomes: list[SendStepResult] = []
    for label in ("first", "second", "third"):
        result = proxy._send_step(
            step_name=label,
            family=0x07,
            payload=b"\x00",
            ack_opcode=0x0103,
            ack_first_byte=0x00,
        )
        outcomes.append(result)
        if not result.ok:
            break

    assert [r.outcome for r in outcomes] == [
        AckOutcome.acked,
        AckOutcome.rejected,
    ]
    # The third step was never sent because the orchestration broke out
    # on the second's rejection.
    assert len(sent) == 2


def test_wait_for_activity_inputs_burst_returns_timeout_when_idle(monkeypatch) -> None:
    """No frames arriving within the window yields :attr:`AckOutcome.timeout`."""

    proxy = _make_proxy()
    result = proxy.wait_for_activity_inputs_burst(timeout=0.05)
    assert isinstance(result, InputsBurstResult)
    assert result.outcome is AckOutcome.timeout
    assert result.payloads == ()


def test_wait_for_activity_inputs_burst_returns_rejected_on_status_ack(monkeypatch) -> None:
    """A non-zero ``STATUS_ACK`` while a burst is pending shortcuts the wait."""

    proxy = _make_proxy()
    # Mark a request as in flight so the STATUS_ACK handler can latch the
    # rejection (the handler ignores unrelated 0x0103 acks otherwise).
    with proxy._activity_inputs_lock:
        proxy._activity_inputs_pending = True

    # Feed a synthetic non-success STATUS_ACK; the handler should latch
    # the rejection and trip the wait's event.
    proxy.notify_ack(0x0103, b"\x07")

    result = proxy.wait_for_activity_inputs_burst(timeout=1.0)

    assert result.outcome is AckOutcome.rejected
    assert result.payloads == ()
    # The internal latch is consumed so a subsequent wait does not see a
    # stale rejection.
    assert proxy._inputs_burst_reject_pending is False


def test_wait_for_activity_inputs_burst_returns_payloads_on_idle(monkeypatch) -> None:
    """When frames arrive and the burst goes idle, payloads are returned."""

    proxy = _make_proxy()
    proxy.notify_activity_inputs_frame(b"page-1")
    proxy.notify_activity_inputs_frame(b"page-2")

    # ``idle_window`` of 0.0 means the wait returns as soon as the
    # frame-arrival timestamp lies in the past.
    result = proxy.wait_for_activity_inputs_burst(
        timeout=1.0,
        idle_window=0.0,
        min_frames=2,
    )

    assert result.outcome is AckOutcome.acked
    assert result.payloads == (b"page-1", b"page-2")


def test_activity_create_ack_handler_queues_0137_and_captures_id() -> None:
    """Family-0x37 create replies behave like create acks, not unknown noise."""

    proxy = _make_proxy()
    frame = FrameContext(
        proxy=proxy,
        opcode=OP_ACTIVITY_CREATE_ACK,
        direction="H→A",
        payload=b"\x66",
        raw=bytes.fromhex("A5 5A 01 37 66 9D"),
        name="ACTIVITY_CREATE_ACK",
    )

    handlers = list(frame_handler_registry.iter_for(frame.opcode, frame.direction))
    assert handlers, "Expected a registered handler for 0x0137"

    for handler in handlers:
        handler.handle(frame)

    assert proxy.wait_for_assigned_device_id(timeout=0.01) == 0x66
    assert proxy.wait_for_ack_any([(OP_ACTIVITY_CREATE_ACK, None)], timeout=0.01) == (
        OP_ACTIVITY_CREATE_ACK,
        b"\x66",
    )
