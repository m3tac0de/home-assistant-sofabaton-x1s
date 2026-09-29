"""Engine-side write batch (phase 4 plan, H2 / decision 8).

A batch is the engine's "do not talk to the remotes yet" mode. While one
is open, every request for a physical remote sync (the ``0x64`` trigger
on the X1 and X1S, the ``0x0364`` broadcast on the X2) is recorded
instead of sent, whichever code path asks for it: ``resync_remote``
itself, the inline ``0x64`` step the reorder writes send, or a create
sequence's terminal step. Closing the batch sends **one** trigger when
at least one was requested, and none otherwise: an unchanged document
produces zero triggers. The batch does not add triggers, it coalesces
the ones the participating writes would have sent.

The per-entity syncs never ask for one (the hub pushes their writes to
the remotes on its own; the "remote_sync" plan step is the favorites
mapping read that settles the cache), so a batch of pure entity edits
ends with no trigger, exactly as the same edits do one by one.

:class:`WriteBatchMixin` carries the trigger itself (``resync_remote``)
and the batch methods; :class:`X1Proxy` mixes it in and the asyncio
facade wraps them in ``AsyncXProxy.batch_writes()``.
"""

from __future__ import annotations

from dataclasses import dataclass, field
import threading
from typing import Any

from .hub_logging import LogTag
from .hub_versions import HUB_VERSION_X2, classify_hub_version
from .protocol_const import OP_REMOTE_SYNC, OP_X2_REMOTE_SYNC_ALL

#: The family / opcode byte of the physical remote-sync trigger.
REMOTE_SYNC_FAMILY = 0x64


@dataclass
class EngineWriteBatch:
    """Bookkeeping of one open batch."""

    remote_sync_requests: int = 0
    origins: list[str] = field(default_factory=list)

    def defer(self, origin: str) -> None:
        self.remote_sync_requests += 1
        self.origins.append(origin)

    @property
    def remote_sync_pending(self) -> bool:
        return self.remote_sync_requests > 0


class WriteBatchMixin:
    """Physical remote-sync trigger and the write batch that coalesces it.

    Expects the host class to provide ``_log``, ``hub_version``, ``mdns_txt``
    and ``enqueue_cmd`` (:class:`X1Proxy` does).
    """

    _log: Any
    hub_version: Any
    mdns_txt: Any

    def _init_write_batch(self) -> None:
        # While set, physical remote-sync triggers are recorded instead of
        # sent; see begin_write_batch.
        self._write_batch: EngineWriteBatch | None = None
        self._write_batch_lock = threading.Lock()

    def resync_remote(self, hub_version: str | None = None) -> bool:
        """Force a physical remote sync with the hub.

        Inside a write batch (:meth:`begin_write_batch`) the trigger is
        recorded and sent once when the batch closes; the call reports
        success so the writes that ask for it proceed unchanged.
        """
        if self._defer_remote_sync("resync_remote"):
            return True
        version = hub_version or self.hub_version
        if not version:
            try:
                version = classify_hub_version(self.mdns_txt)
            except ValueError:
                self._log.warning(
                    "%s sync: hub_version unknown; cannot pick opcode.", LogTag.REMOTE
                )
                return False
        self.hub_version = version

        if version == HUB_VERSION_X2:
            # All-remotes broadcast, bench-validated live 2026-08-27: this
            # is the only form that actually starts a sync. The historical
            # remote-list + OP_X2_REMOTE_SYNC [id:3][0x01] flow is ACKed
            # 0x00 by the hub but starts nothing (accepted no-op). The hub
            # serializes triggers, so re-sending while a sync runs simply
            # queues one more pass.
            return self.enqueue_cmd(OP_X2_REMOTE_SYNC_ALL, b"\xff\xff\xff")

        return self.enqueue_cmd(OP_REMOTE_SYNC)

    # ------------------------------------------------------------------
    # Write batch (phase 4 plan, H2 / decision 8)
    # ------------------------------------------------------------------
    def begin_write_batch(self) -> None:
        """Open a write batch: defer every physical remote-sync trigger.

        While the batch is open, ``resync_remote``, the inline ``0x64``
        step of the reorder writes and a create sequence's terminal
        step all record a request instead of sending. Close it with
        :meth:`end_write_batch`, which sends one trigger when any was
        requested. One batch at a time; a second ``begin`` raises.
        """

        with self._write_batch_lock:
            if self._write_batch is not None:
                raise RuntimeError("a write batch is already open")
            self._write_batch = EngineWriteBatch()
        self._log.info("[BATCH] write batch opened; remote-sync triggers deferred")

    def end_write_batch(self, *, send_remote_sync: bool = True) -> dict[str, Any]:
        """Close the batch and send the one coalesced trigger.

        Returns ``{"remote_sync": "sent" | "failed" | "not_needed" |
        "skipped", "remote_sync_requests": n, "origins": [...]}``.
        ``not_needed`` means no participating write asked for a trigger
        (nothing that needs one was written). ``failed`` means the
        trigger could not be enqueued (the hub is not writable); the
        configuration writes themselves are unaffected and the caller may
        retry the trigger alone with ``resync_remote``. ``skipped`` means
        writes asked for one but ``send_remote_sync=False`` dropped it:
        the remotes are not up to date.
        """

        with self._write_batch_lock:
            batch = self._write_batch
            if batch is None:
                raise RuntimeError("no write batch is open")
            self._write_batch = None
        status = "not_needed"
        if batch.remote_sync_pending:
            if not send_remote_sync:
                status = "skipped"
            else:
                status = "sent" if self.resync_remote() else "failed"
        self._log.info(
            "[BATCH] write batch closed: %d remote-sync request(s) from %s -> %s",
            batch.remote_sync_requests, batch.origins or "nothing", status,
        )
        return {
            "remote_sync": status,
            "remote_sync_requests": batch.remote_sync_requests,
            "origins": list(batch.origins),
        }

    @property
    def write_batch_open(self) -> bool:
        return self._write_batch is not None

    def _defer_remote_sync(self, origin: str) -> bool:
        """True when a batch is open and the trigger was recorded instead."""

        batch = self._write_batch
        if batch is None:
            return False
        batch.defer(origin)
        self._log.debug("[BATCH] remote sync from %s deferred to the batch end", origin)
        return True
