"""Unit tests for :meth:`X1Proxy.exchange` — the wire-access guard.

The hub services one request at a time and silently drops any A->H frame
that arrives while it is streaming a response burst. ``exchange()`` is
the primitive that guarantees every blocking request/response cycle
starts on a quiet wire and holds it until the answer lands:

* entry waits for any in-flight catalog read burst to finish;
* an ``exchange:<name>`` pseudo-burst marks the wire busy so
  fire-and-forget reads queue instead of sending;
* exchanges serialize against each other via an RLock (reentrant on the
  same thread);
* the frame-processing thread must never enter (it delivers the acks an
  exchange blocks on — entering would deadlock).
"""

from __future__ import annotations

import threading
import time

import pytest

from custom_components.sofabaton_x1s.lib.ack import AckOutcome
from custom_components.sofabaton_x1s.lib.x1_proxy import X1Proxy


def _make_proxy(monkeypatch) -> tuple[X1Proxy, list[tuple[int, bytes]]]:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)
    sent: list[tuple[int, bytes]] = []
    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(
        proxy, "_send_cmd_frame", lambda opcode, payload: sent.append((opcode, payload))
    )
    return proxy, sent


def _wait_until(predicate, timeout: float = 5.0) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return True
        time.sleep(0.01)
    return predicate()


def test_exchange_waits_for_active_catalog_burst(monkeypatch) -> None:
    """Entry blocks while a catalog read burst is streaming."""

    proxy, sent = _make_proxy(monkeypatch)
    proxy._burst.start("commands:5")

    entered = threading.Event()
    done = threading.Event()

    def _worker() -> None:
        with proxy.exchange("test"):
            entered.set()
        done.set()

    thread = threading.Thread(target=_worker, daemon=True)
    thread.start()

    time.sleep(0.3)
    assert not entered.is_set(), "exchange entered while a catalog burst was active"

    proxy._burst.finish(
        "commands:5",
        can_issue=proxy.can_issue_commands,
        sender=proxy._send_cmd_frame,
    )
    assert entered.wait(5.0)
    assert done.wait(5.0)
    thread.join(5.0)


def test_enqueue_cmd_during_exchange_queues_until_exit(monkeypatch) -> None:
    """A fire-and-forget read enqueued mid-exchange is deferred, then drained."""

    proxy, sent = _make_proxy(monkeypatch)

    with proxy.exchange("test"):
        assert proxy._burst.active
        assert proxy._burst.kind == "exchange:test"
        assert proxy.enqueue_cmd(0x0144) is True
        assert sent == [], "read fired into the middle of an exchange"

    assert sent == [(0x0144, b"")]
    assert proxy._burst.active is False


def test_nested_exchange_is_reentrant_single_drain(monkeypatch) -> None:
    """Only the outermost level quiesces/marks the wire; one drain at final exit."""

    proxy, sent = _make_proxy(monkeypatch)

    with proxy.exchange("outer"):
        assert proxy._burst.kind == "exchange:outer"
        with proxy.exchange("inner"):
            # The inner scope must not restart or finish the pseudo-burst.
            assert proxy._burst.kind == "exchange:outer"
            proxy.enqueue_cmd(0x0144)
        # Inner exit is not the final exit: still queued.
        assert sent == []
        assert proxy._burst.kind == "exchange:outer"

    assert sent == [(0x0144, b"")]
    assert proxy._burst.active is False


def test_exchanges_serialize_across_threads(monkeypatch) -> None:
    """A second thread's exchange waits until the first thread exits."""

    proxy, sent = _make_proxy(monkeypatch)

    first_inside = threading.Event()
    release_first = threading.Event()
    second_inside = threading.Event()

    def _first() -> None:
        with proxy.exchange("first"):
            first_inside.set()
            release_first.wait(5.0)

    def _second() -> None:
        with proxy.exchange("second"):
            second_inside.set()

    t1 = threading.Thread(target=_first, daemon=True)
    t1.start()
    assert first_inside.wait(5.0)

    t2 = threading.Thread(target=_second, daemon=True)
    t2.start()
    time.sleep(0.3)
    assert not second_inside.is_set(), "second exchange entered while first held the wire"

    release_first.set()
    assert second_inside.wait(5.0)
    t1.join(5.0)
    t2.join(5.0)


def test_idle_tick_never_drains_exchange_pseudo_burst(monkeypatch) -> None:
    """The idle tick must not force-drain the wire mid-exchange."""

    proxy, sent = _make_proxy(monkeypatch)
    # Pin the frame-thread ident to a value that is not this thread so the
    # direct _handle_idle call below neither latches nor trips the guard.
    proxy._frame_thread_ident = -1

    with proxy.exchange("test"):
        proxy.enqueue_cmd(0x0144)
        proxy._handle_idle(time.monotonic() + 1e9)
        assert proxy._burst.active
        assert proxy._burst.kind == "exchange:test"
        assert sent == []

    assert sent == [(0x0144, b"")]


def test_exception_inside_scope_still_finishes_and_drains(monkeypatch) -> None:
    """The pseudo-burst is finished (and queued reads drained) on exceptions."""

    proxy, sent = _make_proxy(monkeypatch)

    with pytest.raises(ValueError):
        with proxy.exchange("test"):
            proxy.enqueue_cmd(0x0144)
            raise ValueError("boom")

    assert sent == [(0x0144, b"")]
    assert proxy._burst.active is False
    assert proxy._exchange_depth == 0

    # The guard is reusable after the failure.
    with proxy.exchange("again"):
        assert proxy._burst.kind == "exchange:again"


def test_execute_exchange_preserves_send_step_semantics(monkeypatch) -> None:
    """acked / rejected / timeout / fallback classification is unchanged.

    ``_send_step`` is now a thin wrapper over ``execute_exchange``; these
    are the same expectations the pre-refactor ``_send_step`` tests pin
    (see tests/test_ack_handling.py), exercised through the new surface.
    """

    proxy, _sent = _make_proxy(monkeypatch)

    # Rejected: STATUS_ACK with a non-zero first byte.
    monkeypatch.setattr(
        proxy, "wait_for_ack_any", lambda candidates, **kwargs: (0x0103, b"\x0c")
    )
    result = proxy.execute_exchange(
        step_name="probe",
        family=0x07,
        payload=b"\x00",
        ack_opcode=0x0103,
        ack_first_byte=0x00,
        timeout=0.05,
    )
    assert result.outcome is AckOutcome.rejected
    assert result.ack_payload == b"\x0c"

    # Timeout: the hub never answers.
    monkeypatch.setattr(proxy, "wait_for_ack_any", lambda candidates, **kwargs: None)
    result = proxy.execute_exchange(
        step_name="probe",
        family=0x07,
        payload=b"\x00",
        ack_opcode=0x0103,
        ack_first_byte=0x00,
        timeout=0.05,
    )
    assert result.outcome is AckOutcome.timeout

    # Acked: a non-STATUS opcode with an arbitrary payload byte.
    monkeypatch.setattr(
        proxy, "wait_for_ack_any", lambda candidates, **kwargs: (0x013E, b"\xab")
    )
    result = proxy.execute_exchange(
        step_name="map",
        family=0x3E,
        payload=b"\x00",
        ack_opcode=0x013E,
        timeout=0.05,
    )
    assert result.outcome is AckOutcome.acked
    assert result.ack_opcode == 0x013E

    # Fallback opcode: matched, classified as acked, opcode reported.
    monkeypatch.setattr(
        proxy, "wait_for_ack_any", lambda candidates, **kwargs: (0x0112, b"\xc6")
    )
    result = proxy.execute_exchange(
        step_name="fallback",
        family=0x12,
        payload=b"\x00",
        ack_opcode=0x0112,
        ack_first_byte=0xC6,
        ack_fallback_opcodes=(0x0103,),
        timeout=0.05,
    )
    assert result.outcome is AckOutcome.acked
    assert result.ack_opcode == 0x0112


def test_execute_exchange_retries_inside_one_scope(monkeypatch) -> None:
    """The whole retry loop holds ONE exchange: no interleave between attempts."""

    proxy, _sent = _make_proxy(monkeypatch)
    kinds_seen: list[str | None] = []

    def _wait_any(candidates, **kwargs):
        kinds_seen.append(proxy._burst.kind)
        return None

    monkeypatch.setattr(proxy, "wait_for_ack_any", _wait_any)
    result = proxy.execute_exchange(
        step_name="retry-step",
        family=0x07,
        payload=b"\x00",
        ack_opcode=0x0103,
        ack_first_byte=0x00,
        timeout=0.01,
        retries=2,
    )
    assert result.outcome is AckOutcome.timeout
    assert kinds_seen == ["exchange:retry-step"] * 3
    assert proxy._burst.active is False


def test_inputs_fetch_ignores_stale_status_ack_from_finishing_burst(monkeypatch) -> None:
    """A catalog burst's terminal STATUS_ACK must not reject the inputs fetch.

    Observed live (X1 recon 2026-07-18, dev 0x04): the "macro table
    empty" STATUS_ACK 0x07 that ends a macros burst arrived while
    fetch_device_input_entries was quiescing behind that burst. With the
    pending flag armed before the quiesce, the stale ack was
    misattributed as a rejection of the not-yet-sent inputs request; the
    fetch bailed early, released the wire, and the next exchange's send
    was silently dropped inside the hub's orphaned inputs response. The
    flag must be armed only after the exchange has quiesced.
    """

    proxy, _sent = _make_proxy(monkeypatch)
    sent_event = threading.Event()

    def _record_send(opcode, payload):
        sent_event.set()

    monkeypatch.setattr(proxy, "_send_cmd_frame", _record_send)

    proxy._burst.start("macros:4")

    result: list = []

    def _worker() -> None:
        result.append(proxy.fetch_device_input_entries(4, timeout=1.0))

    thread = threading.Thread(target=_worker, daemon=True)
    thread.start()

    # The fetch is quiescing behind the macros burst; deliver the burst's
    # terminal empty-table ack while it waits.
    time.sleep(0.3)
    assert not sent_event.is_set(), "fetch sent before the burst finished"
    proxy.notify_ack(0x0103, b"\x07")
    proxy._burst.finish(
        "macros:4",
        can_issue=proxy.can_issue_commands,
        sender=proxy._send_cmd_frame,
    )

    assert sent_event.wait(5.0), "inputs request never sent"
    thread.join(10.0)

    # No inputs frames were delivered, so the correct outcome is a
    # timeout (None) — NOT the early-rejected empty list the stale ack
    # used to produce.
    assert result == [None]


def test_exchange_status_ack_never_claimed_as_empty_catalog(monkeypatch) -> None:
    """A 0x07 answering an exchange must not be read as an empty catalog.

    Observed live (X1 stress bench 2026-07-18): while a favorites-order
    exchange held the wire, the poller's REQ_ACTIVITIES sat queued (its
    in-flight bookkeeping armed). The exchange's "empty table" STATUS_ACK
    0x07 was then ALSO claimed by note_catalog_status_ack as an empty
    activities catalog: it committed a bogus rows=0 snapshot and finished
    the activities burst the drain had just started, releasing the wire
    while the hub streamed rows — the next exchange's send was dropped.
    Two guards close it: the status is classified before the ack becomes
    consumable, and an exchange-held wire disqualifies catalog claims.
    """

    proxy, sent = _make_proxy(monkeypatch)

    with proxy.exchange("fav_order"):
        # Poller fires while the exchange holds the wire: queued, and the
        # activities in-flight bookkeeping is armed by the eventual send.
        proxy.enqueue_cmd(0x003A, expects_burst=True, burst_kind="activities")
        # Arm the in-flight marker the way _send_cmd_frame would.
        proxy._activity_request_inflight = 7
        proxy._activity_pending_rows = {}

        # The exchange's own "empty table" answer arrives mid-scope.
        proxy.notify_ack(0x0103, b"\x07")

        # The catalog layer must NOT have claimed it: no snapshot commit,
        # burst still the exchange pseudo-burst, queued read still queued.
        assert proxy._burst.kind == "exchange:fav_order"
        assert sent == []

    # Exchange exit drains the queued catalog read and starts its burst.
    assert sent == [(0x003A, b"")]
    assert proxy._burst.active
    assert proxy._burst.kind == "activities"


def test_exchange_refuses_frame_processing_thread(monkeypatch) -> None:
    """Entering on the frame thread would deadlock the ack wait: fail fast."""

    proxy, _sent = _make_proxy(monkeypatch)
    proxy._frame_thread_ident = threading.get_ident()

    with pytest.raises(RuntimeError):
        with proxy.exchange("test"):
            pass

    # The failed entry must not leave the wire marked busy.
    assert proxy._burst.active is False
    assert proxy._exchange_depth == 0
