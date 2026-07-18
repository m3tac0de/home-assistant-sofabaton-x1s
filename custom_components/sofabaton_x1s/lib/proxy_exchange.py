"""Wire-access sequencing mixin for :class:`X1Proxy`.

The hub services one request at a time and silently drops any A->H frame
that arrives while it is streaming a response burst (devices, activities,
commands, buttons, macros, activity-map, inputs, key-sort pages, ...).
A dropped frame produces no error -- the caller just times out later
(live-bench finding: an X1 device-create sent 1 ms after REQ_DEVICES was
dropped; a favorites-order read fired 4 ms after a macro-labels fetch was
dropped mid-burst).

This mixin owns the two primitives that keep every send on a quiet wire:

* :meth:`exchange` -- an exclusive, quiesced scope for one blocking
  request/response cycle; and
* :meth:`execute_exchange` -- the common send-one-frame-and-classify
  step, run inside an exchange scope (:meth:`_send_step` is its
  backwards-compatible alias).

Fire-and-forget catalog reads take the other path
(:meth:`X1Proxy.enqueue_cmd` -> ``BurstScheduler``); between the two,
every A->H frame is serialized. ``tests/lib/test_sequencer_boundary.py``
enforces that no raw send exists outside these paths.
"""

from __future__ import annotations

import contextlib
import threading
import time

from .ack import AckOutcome, SendStepResult
from .device_create import ACK_OPCODE_STATUS, ACK_STATUS_BYTE_OK
from .hub_logging import LogTag


class ExchangeMixin:
    """Mixin providing the exchange guard and the one-step executor."""

    def wait_for_read_burst_quiesce(self, timeout: float = 8.0) -> bool:
        """Block until no read burst is streaming, up to ``timeout``.

        The hub serializes requests and silently drops a frame that
        arrives while it is answering a read burst (devices, activities,
        commands, ...). Write steps call this before hitting the wire so
        that e.g. a scheduled catalog refresh that fired between two
        steps finishes first (live-bench finding: an X1 device-create
        sent 1 ms after REQ_DEVICES was dropped and timed out).

        Returns ``False`` when a burst is still active at timeout; the
        caller proceeds anyway and the per-step ack timeout governs.
        """

        deadline = time.monotonic() + timeout
        while self._burst.active and time.monotonic() < deadline:
            time.sleep(0.05)
        still_active = self._burst.active
        if still_active:
            self._log.warning(
                "[WIFI] read burst (%s) still active after %.1fs quiesce wait",
                self._burst.kind,
                timeout,
            )
        return not still_active

    @contextlib.contextmanager
    def exchange(self, name: str):
        """Exclusive, quiesced wire access for one request/response cycle.

        Every blocking send-and-wait-for-answer helper wraps its wire
        traffic in this scope; fire-and-forget catalog reads go through
        :meth:`X1Proxy.enqueue_cmd`. Between the two, every A->H frame
        starts on a quiet wire (the hub silently drops frames that
        arrive while it is streaming a response burst).

        - Serializes against other exchanges via an RLock (reentrant: a
          helper that already holds an exchange may call helpers that
          open their own — only the outermost level quiesces and marks
          the wire).
        - Waits for any in-flight catalog read burst to finish before
          yielding.
        - Marks the wire busy for the duration by starting an
          ``exchange:<name>`` pseudo-burst on the BurstScheduler, so
          fire-and-forget reads enqueued meanwhile are deferred and
          auto-drained when the exchange ends. The idle tick never
          drains a pseudo-burst; this ``finally`` is its sole
          terminator.
        """

        if threading.get_ident() == self._frame_thread_ident:
            # The frame-processing thread parses hub frames and fires
            # notify_ack; blocking it inside an exchange would starve the
            # very ack the exchange waits on.
            raise RuntimeError("exchange() must not run on the frame-processing thread")
        with self._exchange_lock:
            self._exchange_depth += 1
            try:
                if self._exchange_depth == 1:
                    self.wait_for_read_burst_quiesce()
                    self._burst.start(f"exchange:{name}")
                yield
            finally:
                self._exchange_depth -= 1
                if self._exchange_depth == 0:
                    # The active kind is the pseudo-burst this exchange
                    # started (nothing else can start a burst while the
                    # wire is held); the fallback only tolerates a
                    # handler-driven finish that should not happen.
                    self._burst.finish(
                        self._burst.kind or f"exchange:{name}",
                        can_issue=self.can_issue_commands,
                        sender=self._send_cmd_frame,
                    )

    def execute_exchange(
        self,
        *,
        step_name: str,
        family: int,
        payload: bytes,
        ack_opcode: int,
        ack_first_byte: int | None = None,
        ack_fallback_opcodes: tuple[int, ...] = (),
        timeout: float = 5.0,
        retries: int = 0,
        retry_delay: float = 0.0,
    ) -> SendStepResult:
        """Send one frame inside an :meth:`exchange` scope and classify the reply.

        The whole attempt loop runs inside ONE exchange scope: a retry of
        the same step must not let another exchange interleave between
        attempts.

        Returns a :class:`SendStepResult` whose ``outcome`` is one of
        :class:`AckOutcome`. A ``STATUS_ACK`` (``0x0103``) reply whose
        first payload byte is non-zero is classified as
        :attr:`AckOutcome.rejected` even when the step asked for the
        success byte; this matches the behaviour already present in
        :func:`run_create_sequence` and lets multi-step orchestrations
        fail fast on the first hub-side refusal instead of spinning out
        the per-step timeout.
        """

        candidates: list[tuple[int, int | None]] = [(ack_opcode, ack_first_byte)]
        candidates.extend((fallback_opcode, None) for fallback_opcode in ack_fallback_opcodes)

        # STATUS_ACK reply slot. When the caller is waiting for the OK
        # byte specifically, also wake on any other first byte so a
        # rejection surfaces immediately rather than waiting out the
        # timeout. The classifier below turns a non-zero answer into a
        # ``rejected`` outcome.
        wildcard_status_reject = (
            ack_opcode == ACK_OPCODE_STATUS
            and ack_first_byte == ACK_STATUS_BYTE_OK
        )
        if wildcard_status_reject:
            candidates.append((ack_opcode, None))

        total_attempts = max(1, int(retries) + 1)
        with self.exchange(step_name):
            for attempt in range(1, total_attempts + 1):
                matched = self._execute_exchange_attempt(
                    step_name=step_name,
                    family=family,
                    payload=payload,
                    ack_opcode=ack_opcode,
                    ack_first_byte=ack_first_byte,
                    candidates=candidates,
                    timeout=timeout,
                    attempt=attempt,
                    total_attempts=total_attempts,
                )
                if matched is not None:
                    return matched

                if attempt < total_attempts:
                    self._log.warning(
                        "%s[STEP] %s retrying after ack timeout (attempt %d/%d)",
                        LogTag.WIFI,
                        step_name,
                        attempt,
                        total_attempts,
                    )
                    if retry_delay > 0:
                        time.sleep(retry_delay)

        self._log.warning(
            "%s[STEP] %s timeout waiting ack=0x%04X first_byte=%s",
            LogTag.WIFI,
            step_name,
            ack_opcode,
            f"0x{ack_first_byte:02X}" if ack_first_byte is not None else "*",
        )
        return SendStepResult(outcome=AckOutcome.timeout)

    def _execute_exchange_attempt(
        self,
        *,
        step_name: str,
        family: int,
        payload: bytes,
        ack_opcode: int,
        ack_first_byte: int | None,
        candidates: list[tuple[int, int | None]],
        timeout: float,
        attempt: int,
        total_attempts: int,
    ) -> SendStepResult | None:
        """Run one send+classify attempt; ``None`` means ack timeout (retry)."""

        self._log.debug(
            "%s[STEP] %s tx family=0x%02X expect_ack=0x%04X first_byte=%s attempt=%d/%d",
            LogTag.WIFI,
            step_name,
            family,
            ack_opcode,
            f"0x{ack_first_byte:02X}" if ack_first_byte is not None else "*",
            attempt,
            total_attempts,
        )
        send_ts = time.monotonic()
        self._send_family_frame(family, payload)

        matched = self.wait_for_ack_any(
            candidates,
            timeout=timeout,
            not_before=send_ts,
        )
        if matched is None:
            return None

        matched_opcode, matched_payload = matched
        first_byte = matched_payload[0] if matched_payload else None
        is_status_reject = (
            matched_opcode == ACK_OPCODE_STATUS
            and first_byte is not None
            and first_byte != ACK_STATUS_BYTE_OK
        )
        if is_status_reject:
            self._log.warning(
                "%s[STEP] %s hub rejected status=0x%02X",
                LogTag.WIFI,
                step_name,
                first_byte,
            )
            return SendStepResult(
                outcome=AckOutcome.rejected,
                ack_opcode=matched_opcode,
                ack_payload=bytes(matched_payload),
            )
        if matched_opcode != ack_opcode:
            self._log.warning(
                "%s[STEP] %s matched fallback ack=0x%04X (expected=0x%04X)",
                LogTag.WIFI,
                step_name,
                matched_opcode,
                ack_opcode,
            )
        self._log.debug("%s[STEP] %s acked via 0x%04X", LogTag.WIFI, step_name, matched_opcode)
        return SendStepResult(
            outcome=AckOutcome.acked,
            ack_opcode=matched_opcode,
            ack_payload=bytes(matched_payload),
        )

    def _send_step(
        self,
        *,
        step_name: str,
        family: int,
        payload: bytes,
        ack_opcode: int,
        ack_first_byte: int | None = None,
        ack_fallback_opcodes: tuple[int, ...] = (),
        timeout: float = 5.0,
        retries: int = 0,
        retry_delay: float = 0.0,
    ) -> SendStepResult:
        """Thin delegating wrapper over :meth:`execute_exchange`.

        Kept so the ~15 existing call sites (wifi create flow and
        friends) stay untouched; new code should call
        :meth:`execute_exchange` directly.
        """

        return self.execute_exchange(
            step_name=step_name,
            family=family,
            payload=payload,
            ack_opcode=ack_opcode,
            ack_first_byte=ack_first_byte,
            ack_fallback_opcodes=ack_fallback_opcodes,
            timeout=timeout,
            retries=retries,
            retry_delay=retry_delay,
        )


__all__ = ["ExchangeMixin"]
