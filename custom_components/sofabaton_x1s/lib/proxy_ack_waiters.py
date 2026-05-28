"""Ack-queue + burst-wait mixin for :class:`X1Proxy`.

Owns the synchronisation primitives the proxy uses to translate the
async hub-side opcode stream into blocking ``wait_for_*`` calls suitable
for driving multi-step orchestration sequences. Three distinct queues
live behind this surface:

* the generic ack queue (filled by :meth:`notify_ack`, consumed by
  :meth:`wait_for_ack` / :meth:`wait_for_ack_any`);
* the macro-record cache, keyed by ``(activity_id, key_id)``;
* the activity-inputs burst buffer, which also recognises a hub-side
  STATUS_ACK rejection of the in-flight ``REQ_ACTIVITY_INPUTS`` and
  surfaces it as :attr:`AckOutcome.rejected`.

The ``query_device_input_index`` / ``fetch_device_input_entries`` helpers
live here because they are pure consumers of the inputs burst.
"""

from __future__ import annotations

import time

from .ack import AckOutcome, InputsBurstResult
from .inputs import parse_inputs_burst
from .macros import MacroRecord
from .protocol_const import (
    FAMILY_KEY_SORT_REQ,
    OP_REQ_ACTIVITY_INPUTS,
    OP_STATUS_ACK,
    OPNAMES,
)


class AckWaitersMixin:
    """Mixin providing ack-queue management and burst waits."""

    def reset_ack_queues(self) -> None:
        with self._pending_assigned_device_lock:
            self._pending_assigned_device_event.clear()
            self._pending_assigned_device_id = None
        with self._ack_queue_lock:
            self._ack_queue.clear()
            self._ack_event.clear()
        with self._macro_payload_lock:
            self._macro_payload_events.clear()
            self._macro_payload_event.clear()
        with self._device_key_sort_lock:
            self._device_key_sort_pending = None
            self._device_key_sort_expected_pages = None
            self._device_key_sort_pages.clear()
        with self._activity_inputs_lock:
            self._activity_inputs_seen = 0
            self._activity_inputs_last_ts = 0.0
            self._activity_inputs_event.clear()

    def set_assigned_device_id(self, device_id: int) -> None:
        with self._pending_assigned_device_lock:
            self._pending_assigned_device_id = device_id & 0xFF
            self._pending_assigned_device_event.set()

    def wait_for_assigned_device_id(self, timeout: float = 5.0) -> int | None:
        self._pending_assigned_device_event.wait(timeout)
        with self._pending_assigned_device_lock:
            return self._pending_assigned_device_id

    def notify_ack(self, opcode: int, payload: bytes) -> None:
        with self._ack_queue_lock:
            self._ack_queue.append((opcode, payload, time.monotonic()))
            self._ack_event.set()
        name = OPNAMES.get(opcode, f"OP_{opcode:04X}")
        if opcode == OP_STATUS_ACK:
            status = payload[0] if payload else None
            if status == 0x00:
                detail = "accepted"
            elif status == 0x0C:
                detail = "rejected"
            elif status is None:
                detail = "empty-payload"
            else:
                detail = f"status=0x{status:02X}"
            self._log.info("[ACK] %s (0x%04X) payload=%s %s", name, opcode, payload.hex(" "), detail)
            # If we are waiting on REQ_ACTIVITY_INPUTS and no inputs frame has
            # arrived yet, a non-zero STATUS_ACK is the hub's rejection of
            # that request (commonly status=0x07 for "device not configured
            # for power/inputs yet"). Trip the event so the wait can exit
            # early instead of timing out after the full window.
            if status is not None and status != 0x00:
                with self._activity_inputs_lock:
                    if self._activity_inputs_pending and self._activity_inputs_seen == 0:
                        self._inputs_burst_reject_pending = True
                        self._activity_inputs_event.set()
            return
        self._log.info("[ACK] %s (0x%04X) payload=%s", name, opcode, payload.hex(" "))

    def clear_ack_queue(self) -> None:
        with self._ack_queue_lock:
            self._ack_queue.clear()
            self._ack_event.clear()

    def wait_for_ack(
        self,
        opcode: int,
        *,
        first_byte: int | None = None,
        timeout: float = 5.0,
        not_before: float | None = None,
    ) -> bool:
        deadline = time.monotonic() + timeout
        while True:
            with self._ack_queue_lock:
                for ack_opcode, ack_payload, ack_ts in self._ack_queue:
                    if ack_opcode != opcode:
                        continue
                    if not_before is not None and ack_ts < not_before:
                        continue
                    if first_byte is not None and (not ack_payload or ack_payload[0] != (first_byte & 0xFF)):
                        continue
                    self._ack_queue.remove((ack_opcode, ack_payload, ack_ts))
                    if not self._ack_queue:
                        self._ack_event.clear()
                    return True
                self._ack_event.clear()

            remaining = deadline - time.monotonic()
            if remaining <= 0:
                self._log.warning(
                    "[ACK] timeout waiting opcode=0x%04X first_byte=%s",
                    opcode,
                    f"0x{first_byte:02X}" if first_byte is not None else "*",
                )
                return False
            self._ack_event.wait(min(remaining, 0.2))

    def _wait_for_ack_any_impl(
        self,
        candidates: list[tuple[int, int | None]],
        *,
        timeout: float = 5.0,
        not_before: float | None = None,
        log_timeout: bool,
    ) -> tuple[int, bytes] | None:
        deadline = time.monotonic() + timeout
        while True:
            with self._ack_queue_lock:
                for ack_opcode, ack_payload, ack_ts in self._ack_queue:
                    for want_opcode, want_first_byte in candidates:
                        if ack_opcode != want_opcode:
                            continue
                        if not_before is not None and ack_ts < not_before:
                            continue
                        if want_first_byte is not None and (not ack_payload or ack_payload[0] != (want_first_byte & 0xFF)):
                            continue
                        self._ack_queue.remove((ack_opcode, ack_payload, ack_ts))
                        if not self._ack_queue:
                            self._ack_event.clear()
                        return ack_opcode, ack_payload
                self._ack_event.clear()

            remaining = deadline - time.monotonic()
            if remaining <= 0:
                wanted = ", ".join(
                    f"0x{op:04X}/{('*' if first is None else f'0x{first:02X}') }" for op, first in candidates
                )
                if log_timeout:
                    self._log.warning("[ACK] timeout waiting any in [%s]", wanted)
                return None
            self._ack_event.wait(min(remaining, 0.2))

    def wait_for_ack_any(
        self,
        candidates: list[tuple[int, int | None]],
        *,
        timeout: float = 5.0,
        not_before: float | None = None,
    ) -> tuple[int, bytes] | None:
        return self._wait_for_ack_any_impl(
            candidates,
            timeout=timeout,
            not_before=not_before,
            log_timeout=True,
        )

    def wait_for_ack_family_low(
        self,
        family_low: int,
        *,
        timeout: float = 5.0,
        not_before: float | None = None,
    ) -> tuple[int, bytes] | None:
        """Wait for the next queued frame whose opcode low byte matches.

        Some hub responses use a variable-length payload whose size is
        encoded in the opcode high byte, so callers cannot pin a single
        16-bit opcode value ahead of time.
        """

        deadline = time.monotonic() + timeout
        target_family = family_low & 0xFF
        while True:
            with self._ack_queue_lock:
                for ack_opcode, ack_payload, ack_ts in self._ack_queue:
                    if (ack_opcode & 0xFF) != target_family:
                        continue
                    if not_before is not None and ack_ts < not_before:
                        continue
                    self._ack_queue.remove((ack_opcode, ack_payload, ack_ts))
                    if not self._ack_queue:
                        self._ack_event.clear()
                    return ack_opcode, ack_payload
                self._ack_event.clear()

            remaining = deadline - time.monotonic()
            if remaining <= 0:
                self._log.warning(
                    "[ACK] timeout waiting family(low)=0x%02X",
                    target_family,
                )
                return None
            self._ack_event.wait(min(remaining, 0.2))

    def wait_for_any_response(
        self,
        *,
        timeout: float,
        not_before: float,
        poll_interval: float = 0.2,
        disconnect_check=None,
    ) -> tuple[int, bytes] | None:
        """Wait for the next frame *of any opcode* arriving after ``not_before``.

        Unlike :meth:`wait_for_ack_any` this does not filter by opcode --
        the first queued frame whose timestamp is ``>= not_before`` is
        consumed and returned. Intended for opcodes whose response
        family the integration deliberately does not pin down (e.g.
        the hub-erase opcode, which is treated as fire-and-forget once
        any reply comes back).

        ``disconnect_check`` is an optional zero-arg callable returning
        ``True`` when the underlying transport has dropped *before* a
        response arrived. When supplied and it returns ``True``, the
        wait exits immediately with ``None`` so the caller can
        distinguish "hub didn't answer" from "hub disconnected without
        answering". ``poll_interval`` bounds how quickly that check
        runs (defaults to 200 ms).
        """

        deadline = time.monotonic() + timeout
        while True:
            with self._ack_queue_lock:
                for ack_opcode, ack_payload, ack_ts in self._ack_queue:
                    if ack_ts < not_before:
                        continue
                    self._ack_queue.remove((ack_opcode, ack_payload, ack_ts))
                    if not self._ack_queue:
                        self._ack_event.clear()
                    return ack_opcode, ack_payload
                self._ack_event.clear()

            if disconnect_check is not None and disconnect_check():
                return None

            remaining = deadline - time.monotonic()
            if remaining <= 0:
                return None
            self._ack_event.wait(min(remaining, poll_interval))

    def cache_macro_record(self, record: MacroRecord) -> None:
        """Store a fully-assembled :class:`MacroRecord` keyed by ``(activity_id, key_id)``."""

        key = (record.activity_id & 0xFF, record.key_id & 0xFF)
        with self._macro_payload_lock:
            self._macro_payload_events[key] = record
            self._macro_payload_event.set()

    def wait_for_macro_record(
        self, activity_id: int, button_id: int, *, timeout: float = 5.0
    ) -> MacroRecord | None:
        """Wait until the macro for ``(activity_id, button_id)`` has been assembled."""

        key = (activity_id & 0xFF, button_id & 0xFF)
        deadline = time.monotonic() + timeout
        while True:
            with self._macro_payload_lock:
                cached = self._macro_payload_events.pop(key, None)
                if cached is not None:
                    if not self._macro_payload_events:
                        self._macro_payload_event.clear()
                    return cached
                self._macro_payload_event.clear()

            remaining = deadline - time.monotonic()
            if remaining <= 0:
                return None
            self._macro_payload_event.wait(min(remaining, 0.2))

    def get_cached_macro_records(self, activity_id: int) -> list[MacroRecord]:
        """Return cached assembled macro records for ``activity_id`` without consuming them."""

        act_lo = activity_id & 0xFF
        with self._macro_payload_lock:
            records = [
                record
                for (cached_act_id, _button_id), record in self._macro_payload_events.items()
                if (cached_act_id & 0xFF) == act_lo
            ]
        records.sort(key=lambda record: record.key_id & 0xFF)
        return records

    def notify_activity_inputs_frame(self, payload: bytes = b"") -> None:
        with self._activity_inputs_lock:
            self._activity_inputs_payloads.append(bytes(payload))
            self._activity_inputs_seen += 1
            self._activity_inputs_last_ts = time.monotonic()
            self._activity_inputs_event.set()

    def _try_handle_device_key_sort_payload(self, payload: bytes) -> bool:
        """Assemble the hub's family-0x63 device key-sort response."""

        with self._device_key_sort_lock:
            pending_device_id = self._device_key_sort_pending
            if pending_device_id is None:
                return False
            if len(payload) < 7:
                return False

            page_no = int.from_bytes(payload[1:3], "big")
            chunk = bytes(payload[3:])
            if page_no == 1:
                if len(chunk) < 4 or chunk[0] != 0x01:
                    return False
                expected_pages = int.from_bytes(chunk[1:3], "big")
                reported_device_id = chunk[3] & 0xFF
                if reported_device_id != pending_device_id:
                    self._log.warning(
                        "[KEY_SORT] pending dev=0x%02X but hub replied for dev=0x%02X",
                        pending_device_id,
                        reported_device_id,
                    )
                    self._device_key_sort_pending = None
                    self._device_key_sort_expected_pages = None
                    self._device_key_sort_pages.clear()
                    return False
                self._device_key_sort_expected_pages = max(1, expected_pages)
                self._device_key_sort_pages.clear()

            expected_pages = self._device_key_sort_expected_pages
            if not expected_pages:
                return False

            self._device_key_sort_pages[page_no] = chunk
            if any(
                page not in self._device_key_sort_pages
                for page in range(1, expected_pages + 1)
            ):
                return True

            assembled = b"".join(
                self._device_key_sort_pages[page]
                for page in range(1, expected_pages + 1)
            )
            device_id = assembled[3] & 0xFF if len(assembled) >= 4 else pending_device_id
            msg_bytes = assembled[4:-1] if len(assembled) >= 5 else b""
            self.state.device_key_sorts[device_id] = {
                "device_id": device_id,
                "msg_hex": msg_bytes.hex(" ").strip(),
            }
            self._device_key_sort_pending = None
            self._device_key_sort_expected_pages = None
            self._device_key_sort_pages.clear()

        self.notify_ack(0xFF62, bytes([device_id]))
        return True

    def wait_for_activity_inputs_burst(
        self,
        *,
        timeout: float = 5.0,
        idle_window: float = 0.35,
        min_frames: int = 1,
    ) -> InputsBurstResult:
        """Wait until at least one 0x47 frame arrives and the burst goes idle.

        Returns an :class:`InputsBurstResult` whose ``outcome``
        distinguishes:

        * :attr:`AckOutcome.acked` -- the burst arrived and went idle;
          ``payloads`` carries a snapshot of the assembled frames and
          the proxy's internal buffer is cleared.
        * :attr:`AckOutcome.rejected` -- the hub answered the in-flight
          ``REQ_ACTIVITY_INPUTS`` with a non-zero ``STATUS_ACK``.
        * :attr:`AckOutcome.timeout` -- nothing arrived before
          ``timeout``.
        """

        deadline = time.monotonic() + timeout
        while True:
            now = time.monotonic()
            with self._activity_inputs_lock:
                if self._inputs_burst_reject_pending:
                    self._inputs_burst_reject_pending = False
                    self._activity_inputs_seen = 0
                    self._activity_inputs_last_ts = 0.0
                    self._activity_inputs_payloads.clear()
                    self._activity_inputs_event.clear()
                    return InputsBurstResult(outcome=AckOutcome.rejected)
                seen = self._activity_inputs_seen
                last_ts = self._activity_inputs_last_ts
                if seen >= min_frames and last_ts > 0 and (now - last_ts) >= idle_window:
                    payloads = tuple(self._activity_inputs_payloads)
                    self._activity_inputs_payloads.clear()
                    self._activity_inputs_seen = 0
                    self._activity_inputs_last_ts = 0.0
                    self._activity_inputs_event.clear()
                    return InputsBurstResult(
                        outcome=AckOutcome.acked,
                        payloads=payloads,
                    )
                self._activity_inputs_event.clear()

            remaining = deadline - now
            if remaining <= 0:
                return InputsBurstResult(outcome=AckOutcome.timeout)
            self._activity_inputs_event.wait(min(remaining, 0.2))

    def query_device_input_index(self, device_id: int, cmd_id: int, *, timeout: float = 5.0) -> int | None:
        """Return the 1-based ordinal of cmd_id in the device's ACTIVITY_INPUTS list, or None if not found."""
        with self._activity_inputs_lock:
            self._activity_inputs_payloads.clear()
            self._activity_inputs_seen = 0
            self._activity_inputs_last_ts = 0.0
            self._activity_inputs_event.clear()

        self._send_cmd_frame(OP_REQ_ACTIVITY_INPUTS, bytes([device_id & 0xFF]))
        burst = self.wait_for_activity_inputs_burst(timeout=timeout)
        if burst.outcome is AckOutcome.rejected:
            self._log.info(
                "[INPUT_QUERY] hub rejected inputs request dev=0x%02X cmd=0x%02X",
                device_id & 0xFF,
                cmd_id & 0xFF,
            )
            return None
        if burst.outcome is AckOutcome.timeout:
            self._log.warning(
                "[INPUT_QUERY] timeout waiting for inputs dev=0x%02X cmd=0x%02X",
                device_id & 0xFF,
                cmd_id & 0xFF,
            )
            return None

        record = parse_inputs_burst(list(burst.payloads), hub_version=self.hub_version)
        for index, entry in enumerate(record.entries, start=1):
            if entry.key_id == (cmd_id & 0xFF):
                # X1S/X2 stores an explicit 1-based ordinal on each entry;
                # X1 has no ordinal byte and we report the positional
                # index of the entry in the list.
                return entry.ordinal or index

        self._log.warning(
            "[INPUT_QUERY] cmd_id=0x%02X not found in %d entries for dev=0x%02X",
            cmd_id & 0xFF,
            len(record.entries),
            device_id & 0xFF,
        )
        return None

    def fetch_device_input_entries(
        self,
        device_id: int,
        *,
        timeout: float = 5.0,
    ) -> list[dict[str, int]] | None:
        """Return fresh input ordering rows for ``device_id``.

        Each returned row has ``command_id`` and 1-based ``input_index``.

        Returns ``None`` only when the hub does not answer at all before
        ``timeout``. When the hub *does* answer but with a non-zero
        STATUS_ACK (e.g. ``0x07`` for a device that has not been
        configured for power/inputs), an empty list is returned --
        semantically "this device has no input entries", which is what a
        faithful backup needs.
        """

        with self._activity_inputs_lock:
            self._activity_inputs_payloads.clear()
            self._activity_inputs_seen = 0
            self._activity_inputs_last_ts = 0.0
            self._activity_inputs_event.clear()
            self._inputs_burst_reject_pending = False
            self._activity_inputs_pending = True

        try:
            self._send_cmd_frame(OP_REQ_ACTIVITY_INPUTS, bytes([device_id & 0xFF]))
            burst = self.wait_for_activity_inputs_burst(timeout=timeout)
        finally:
            with self._activity_inputs_lock:
                self._activity_inputs_pending = False

        if burst.outcome is AckOutcome.rejected:
            self._log.info(
                "[INPUT_QUERY] hub returned non-success status for dev=0x%02X; "
                "treating as no inputs configured",
                device_id & 0xFF,
            )
            return []
        if burst.outcome is AckOutcome.timeout:
            self._log.warning(
                "[INPUT_QUERY] timeout waiting for full inputs list dev=0x%02X",
                device_id & 0xFF,
            )
            return None

        record = parse_inputs_burst(list(burst.payloads), hub_version=self.hub_version)
        return [
            {
                "command_id": entry.key_id & 0xFF,
                "input_index": (entry.ordinal or index) & 0xFF,
            }
            for index, entry in enumerate(record.entries, start=1)
        ]

    def fetch_device_input_record(
        self,
        device_id: int,
        *,
        timeout: float = 5.0,
    ) -> dict[str, object] | None:
        """Return the full parsed family-0x46 record for ``device_id``.

        The backup flow uses this richer form on X1 so restore can
        preserve the trailing control-key/favorite rows, which are not
        represented in the simplified ``fetch_device_input_entries``
        surface.
        """

        with self._activity_inputs_lock:
            self._activity_inputs_payloads.clear()
            self._activity_inputs_seen = 0
            self._activity_inputs_last_ts = 0.0
            self._activity_inputs_event.clear()
            self._inputs_burst_reject_pending = False
            self._activity_inputs_pending = True

        try:
            self._send_cmd_frame(OP_REQ_ACTIVITY_INPUTS, bytes([device_id & 0xFF]))
            burst = self.wait_for_activity_inputs_burst(timeout=timeout)
        finally:
            with self._activity_inputs_lock:
                self._activity_inputs_pending = False

        if burst.outcome is AckOutcome.rejected:
            self._log.info(
                "[INPUT_QUERY] hub returned non-success status for dev=0x%02X; "
                "treating as no inputs configured",
                device_id & 0xFF,
            )
            return None
        if burst.outcome is AckOutcome.timeout:
            self._log.warning(
                "[INPUT_QUERY] timeout waiting for full input record dev=0x%02X",
                device_id & 0xFF,
            )
            return None

        record = parse_inputs_burst(list(burst.payloads), hub_version=self.hub_version)
        return {
            "device_id": record.device_id & 0xFF,
            "source_id_byte": record.source_id_byte & 0xFF,
            "flag_a": record.flag_a & 0xFF,
            "flag_b": record.flag_b & 0xFF,
            "state_byte": record.state_byte & 0xFF,
            "entries": [
                {
                    "command_id": entry.key_id & 0xFF,
                    "input_index": (entry.ordinal or index) & 0xFF,
                    "fid": entry.fid & 0xFFFFFFFFFFFF,
                    "name": entry.label,
                }
                for index, entry in enumerate(record.entries, start=1)
            ],
            "control_keys": {
                "input_list": record.control_keys.input_list.hex(" "),
                "input_up": record.control_keys.input_up.hex(" "),
                "input_down": record.control_keys.input_down.hex(" "),
                "input_confirm": record.control_keys.input_confirm.hex(" "),
            },
            "favorites": [
                slot.payload.hex(" ") for slot in record.favorites
            ],
        }

    def fetch_device_key_sort(
        self,
        device_id: int,
        *,
        timeout: float = 5.0,
    ) -> dict[str, int | str] | None:
        """Return the hub's raw key-sort blob for ``device_id``."""

        dev_lo = device_id & 0xFF
        with self._device_key_sort_lock:
            self.state.device_key_sorts.pop(dev_lo, None)
            self._device_key_sort_pending = dev_lo
            self._device_key_sort_expected_pages = None
            self._device_key_sort_pages.clear()

        send_ts = time.monotonic()
        self._send_family_frame(FAMILY_KEY_SORT_REQ, bytes([dev_lo]))
        # Accept either the family-0x63 paged reply (assembled into
        # state.device_key_sorts and notified as 0xFF62) OR a STATUS_ACK
        # from the hub. The hub replies with STATUS_ACK status=0x07 when
        # the requested device has no key-sort blob configured -- mirror
        # the inputs path and treat that as "device has no key-sort data"
        # (empty msg_hex) rather than waiting out the full timeout.
        result = self.wait_for_ack_any(
            [(0xFF62, dev_lo), (OP_STATUS_ACK, None)],
            timeout=timeout,
            not_before=send_ts,
        )
        if result is None:
            with self._device_key_sort_lock:
                self._device_key_sort_pending = None
                self._device_key_sort_expected_pages = None
                self._device_key_sort_pages.clear()
            self._log.warning(
                "[KEY_SORT] timeout waiting for device sort dev=0x%02X",
                dev_lo,
            )
            return None

        ack_opcode, ack_payload = result
        if ack_opcode == OP_STATUS_ACK:
            status = ack_payload[0] if ack_payload else None
            with self._device_key_sort_lock:
                self._device_key_sort_pending = None
                self._device_key_sort_expected_pages = None
                self._device_key_sort_pages.clear()
            self._log.info(
                "[KEY_SORT] hub returned STATUS_ACK status=%s for dev=0x%02X; "
                "treating as no key-sort data configured",
                f"0x{status:02X}" if status is not None else "(empty)",
                dev_lo,
            )
            return {"device_id": dev_lo, "msg_hex": ""}

        cached = self.state.device_key_sorts.get(dev_lo)
        if isinstance(cached, dict):
            return dict(cached)
        return {"device_id": dev_lo, "msg_hex": ""}


__all__ = ["AckWaitersMixin"]
