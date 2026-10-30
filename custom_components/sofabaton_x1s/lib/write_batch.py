"""Remote syncs after writes, and the engine-side write batch (phase 4
plan, H2 / decision 8).

Three syncs bring a write to the remotes (bench_333, all models):

- **per-item** (``0x0165 [id]``): the remotes re-read one device or
  activity, every pending change of it at once (a 1/1 sync, seconds);
- **order-only** (X2 ``0x0464 [00 00 FF][00]``, ~10 s): the device and
  activity lists, which also lists a new entity (empty: its contents need
  its per-item sync after);
- **full** (``0x0064`` on the X1/X1S, the ``0x0364`` broadcast on the X2):
  rebuilds everything (X1 ~30 s, X1S ~1 min, X2 ~4.5 min).

:meth:`WriteBatchMixin.sync_remotes_after_write` picks the cheapest that
covers a write: renames and deletes on the X2 reach the remotes alone; a
create needs the order-only sync on the X2 and the full sync on the X1/X1S
(which have no order-only form and do not list new or deleted entities
otherwise); every content change needs a per-item sync of the entity.

A batch is the engine's "do not talk to the remotes yet" mode. While one
is open every request is recorded instead of sent, whichever path asks:
``resync_remote``, ``_send_remote_sync_step`` (reorders, Wifi creates), a
create sequence's terminal step, or a per-item sync. Closing it sends the
cheapest covering set once: the full sync when any write asked for one
(it covers everything), else the order-only sync first and then one
per-item sync per entity (a per-item sync before the order-only one would
miss a new entity). An unchanged document sends nothing.

:class:`WriteBatchMixin` carries the syncs and the batch methods;
:class:`X1Proxy` mixes it in and the asyncio facade wraps the batch in
``AsyncXProxy.batch_writes()``.
"""

from __future__ import annotations

from dataclasses import dataclass, field
import threading
import time
from typing import Any, Iterable, TYPE_CHECKING

from .hub_logging import LogTag
from .hub_versions import HUB_VERSION_X1, HUB_VERSION_X2, classify_hub_version
from .protocol_const import OP_REMOTE_SYNC, OP_X2_REMOTE_SYNC_ALL
from .remote_sync_frames import FAMILY_ENTITY_SYNC, entities_touched_by, entity_sync_frame, order_sync_frame

if TYPE_CHECKING:
    from .proxy_host import _ProxyHost

#: The family / opcode byte of the physical remote-sync trigger.
REMOTE_SYNC_FAMILY = 0x64
#: How long after this engine's last remote-sync trigger a STATUS_ACK 0x04
#: refusal is read as "the hub is updating its remote": an X2 full sync
#: takes about 4.5 minutes, an X1S one about one.
REMOTE_SYNC_REFUSAL_WINDOW_S = 300.0
#: The STATUS_ACK byte the hub refuses a write with while it updates its
#: remote (bench_336); it also answers a request that landed mid-page with it.
ACK_STATUS_REFUSED = 0x04

#: ``entity_sync_form`` values: the frame a write sends after a favorites,
#: keymap or favorites-order change to the one entity it touched.
#: ``legacy`` is ``0x0165 [id]`` on every model (what has always been sent);
#: ``native`` sends the X2 its own ``0x0265 [id][0x01]`` (validated,
#: bench_333 C4) and the X1/X1S ``0x0165 [id]``; ``none`` sends nothing, for
#: benches that make the edit and send the sync themselves.
ENTITY_SYNC_LEGACY = "legacy"
ENTITY_SYNC_NATIVE = "native"
ENTITY_SYNC_NONE = "none"
ENTITY_SYNC_FORMS = (ENTITY_SYNC_LEGACY, ENTITY_SYNC_NATIVE, ENTITY_SYNC_NONE)

#: ``order_sync_form`` values: the trigger closing a device or activity
#: reorder. ``native`` (the default) sends the X2 its order-only sync
#: (~10 s instead of a ~4.5 min full sync, bench_333 C3) and the X1/X1S the
#: full trigger (they have no order-only form, C5); ``full`` sends the full
#: trigger on every model.
ORDER_SYNC_FULL = "full"
ORDER_SYNC_NATIVE = "native"
ORDER_SYNC_FORMS = (ORDER_SYNC_FULL, ORDER_SYNC_NATIVE)


@dataclass
class EngineWriteBatch:
    """Bookkeeping of one open batch."""

    remote_sync_requests: int = 0
    origins: list[str] = field(default_factory=list)
    full_requests: int = 0
    order_requests: int = 0
    entities: list[int] = field(default_factory=list)

    def defer(self, origin: str, kind: str = "full") -> None:
        self.remote_sync_requests += 1
        self.origins.append(origin)
        if kind == "order":
            self.order_requests += 1
        else:
            self.full_requests += 1

    deleted: set[int] = field(default_factory=set)

    def defer_entity(self, entity: int) -> None:
        # A create reusing an id deleted earlier in the batch revives it.
        self.deleted.discard(entity)
        if entity not in self.entities:
            self.entities.append(entity)

    def note_deleted(self, entities: Iterable[int]) -> None:
        """Entities a write in the batch deleted: their deferred per-item
        syncs are dropped at the batch end."""

        self.deleted.update(entities)

    @property
    def live_entities(self) -> list[int]:
        return [e for e in self.entities if e not in self.deleted]

    @property
    def remote_sync_pending(self) -> bool:
        return self.remote_sync_requests > 0 or bool(self.live_entities)


class WriteBatchMixin(_ProxyHost if TYPE_CHECKING else object):
    """Physical remote-sync trigger and the write batch that coalesces it.

    Uses the host's ``_log``, ``hub_version``, ``mdns_txt`` and
    ``enqueue_cmd`` (declared by ``_ProxyHost``).
    """

    def _init_write_batch(self) -> None:
        # While set, physical remote-sync triggers are recorded instead of
        # sent; see begin_write_batch.
        self._write_batch: EngineWriteBatch | None = None
        self._write_batch_lock = threading.Lock()
        # Which sync forms the write flows use (see the form constants).
        self.entity_sync_form: str = ENTITY_SYNC_LEGACY
        self.order_sync_form: str = ORDER_SYNC_NATIVE
        # Entities a per-item sync went to (or was deferred for) since the
        # last _begin_item_sync_tracking: an editor run skips its closing
        # sync for an entity a step already synced (favorite, keymap).
        self._entity_sync_marks: set[int] = set()
        # When this engine last sent a remote-sync trigger (any form) and
        # the last step the hub refused: (status byte, when).
        self._last_remote_sync_at: float | None = None
        self._last_step_refusal: tuple[int, float] | None = None

    def _note_remote_sync_sent(self) -> None:
        self._last_remote_sync_at = time.monotonic()

    def _note_step_refusal(self, status: int) -> None:
        self._last_step_refusal = (int(status) & 0xFF, time.monotonic())

    def refused_during_remote_sync(self, since: float) -> bool:
        """True when a step sent at or after ``since`` (``time.monotonic()``)
        was refused with STATUS_ACK 0x04 within
        :data:`REMOTE_SYNC_REFUSAL_WINDOW_S` of this engine's last remote-sync
        trigger: the hub was most likely still updating its remote. The
        engine cannot see a sync another controller started."""

        refusal, sync_at = self._last_step_refusal, self._last_remote_sync_at
        if refusal is None or sync_at is None:
            return False
        status, refused_at = refusal
        return (
            status == ACK_STATUS_REFUSED
            and refused_at >= since
            and 0.0 <= refused_at - sync_at <= REMOTE_SYNC_REFUSAL_WINDOW_S
        )

    def _remote_sync_frame(self, hub_version: str | None = None) -> tuple[int, bytes] | None:
        """``(opcode, payload)`` of the physical remote-sync trigger for
        this hub, or None when the hub version cannot be resolved."""

        version = hub_version or self.hub_version
        if not version:
            try:
                version = classify_hub_version(self.mdns_txt)
            except ValueError:
                self._log.warning(
                    "%s sync: hub_version unknown; cannot pick opcode.", LogTag.REMOTE
                )
                return None
        self.hub_version = version

        if version == HUB_VERSION_X2:
            # All-remotes broadcast, bench-validated live 2026-08-27: this
            # is the only form that actually starts a sync. The historical
            # remote-list + OP_X2_REMOTE_SYNC [id:3][0x01] flow is ACKed
            # 0x00 by the hub but starts nothing (accepted no-op), and a
            # bare 0x0064 was never seen to start one either. The hub
            # serializes triggers, so re-sending while a sync runs simply
            # queues one more pass.
            return OP_X2_REMOTE_SYNC_ALL, b"\xff\xff\xff"

        return OP_REMOTE_SYNC, b""

    def resync_remote(self, hub_version: str | None = None) -> bool:
        """Force a physical remote sync with the hub.

        Inside a write batch (:meth:`begin_write_batch`) the trigger is
        recorded and sent once when the batch closes; the call reports
        success so the writes that ask for it proceed unchanged.
        """
        if self._defer_remote_sync("resync_remote"):
            return True
        frame = self._remote_sync_frame(hub_version)
        if frame is None:
            return False
        sent = self.enqueue_cmd(*frame)
        if sent:
            self._note_remote_sync_sent()
        return sent

    def _send_remote_sync_step(
        self, step_name: str, *, ack_first_byte: int | None = None, purpose: str = "full"
    ) -> bool:
        """Send the remote-sync trigger as an acked step of a write sequence.

        The frame is the one :meth:`resync_remote` sends for this hub (the
        all-remotes broadcast on the X2, never a bare ``0x0064`` there),
        but sent through ``_send_step`` so its STATUS_ACK is consumed
        before the sequence's next step waits for its own. Inside a write
        batch the trigger is deferred like any other and the call reports
        success.

        ``purpose="order"`` marks a reorder's trigger: with
        ``order_sync_form`` set to ``native`` (the default) the X2 gets its
        order-only sync instead of the full broadcast, the X1 nothing (its
        remote takes a new device or activity order on its own, bench_333:
        three activity and two device swaps), the X1S the full sync.
        """

        order = purpose == "order" and self.order_sync_form == ORDER_SYNC_NATIVE
        if order and self.hub_version == HUB_VERSION_X1:
            self._log.info("%s %s: the X1 remote picks up the order alone; no remote sync",
                           LogTag.REMOTE, step_name)
            return True
        if self._defer_remote_sync(step_name, kind="order" if order else "full"):
            return True
        frame = self._remote_sync_frame()
        if frame is None:
            return False
        if order:
            frame = order_sync_frame(self.hub_version) or frame
        # The family frame derives its opcode from the payload length, so
        # the remote-sync family plus this payload is exactly the opcode
        # resync_remote sends (0x0064 empty, 0x0364 FF FF FF).
        _opcode, payload = frame
        return self._send_step(
            step_name=step_name,
            family=REMOTE_SYNC_FAMILY,
            payload=payload,
            ack_opcode=0x0103,
            ack_first_byte=ack_first_byte,
        ).ok

    def _send_entity_sync_step(self, entity_id: int, step_name: str) -> bool:
        """Send the per-entity (per-item) sync of one device or activity.

        The frame follows ``entity_sync_form``. Inside a write batch it is
        recorded and sent at the batch end, after any order-only sync.
        """

        entity = int(entity_id) & 0xFF
        form = self.entity_sync_form
        if form == ENTITY_SYNC_NONE:
            self._log.info("%s %s: per-entity sync skipped (entity_sync_form=none)", LogTag.REMOTE, step_name)
            return True
        self._entity_sync_marks.add(entity)
        batch = self._write_batch
        if batch is not None:
            batch.defer_entity(entity)
            self._log.debug("[BATCH] per-item sync of 0x%02X deferred to the batch end", entity)
            return True
        x2_form = form == ENTITY_SYNC_NATIVE and self.hub_version == HUB_VERSION_X2
        _opcode, payload = entity_sync_frame(entity, x2_form=x2_form)
        # The family frame derives the opcode from the payload length.
        return self._send_step(
            step_name=step_name,
            family=FAMILY_ENTITY_SYNC,
            payload=payload,
            ack_opcode=0x0103,
        ).ok

    def sync_remote_entity(self, entity_id: int) -> bool:
        """Per-item remote sync of one device or activity: the remotes
        re-read that one item (a 1/1 sync on the X2, seconds) instead of
        rebuilding everything. Covers every pending change of that item
        (bench_333 C4-C6, all models); it cannot list a new item or drop a
        deleted one (see :meth:`sync_remotes_after_write`). Deferred to the
        batch end inside a write batch.
        """

        entity = int(entity_id) & 0xFF
        return self._send_entity_sync_step(entity, f"entity-sync[0x{entity:02X}]")

    def sync_remotes_after_write(
        self,
        *,
        created: Iterable[int] = (),
        touched: Iterable[int] = (),
        deleted: Iterable[int] = (),
        origin: str = "write",
    ) -> bool:
        """Send the cheapest remote syncs that bring a write to the remotes.

        ``created`` / ``deleted`` are the devices and activities the write
        added or removed, ``touched`` those whose contents it changed
        (remote-neutral changes like renames left out by the caller, see
        ``remote_sync_frames.entities_touched_by``). The rule (bench_333,
        all models): on the X1/X1S a create or delete needs the full sync,
        which covers the rest; on the X2 a create needs the order-only sync
        and then a per-item sync of the new entity, a delete needs nothing;
        every touched entity gets a per-item sync. A per-item or order-only
        sync the hub does not acknowledge falls back to the full sync.
        Inside a write batch everything is deferred to the batch end.
        Returns False only when no sync could be sent at all.
        """

        created_ids = tuple(dict.fromkeys(int(e) & 0xFF for e in created))
        deleted_ids = {int(e) & 0xFF for e in deleted}
        batch = self._write_batch
        if batch is not None and deleted_ids:
            batch.note_deleted(deleted_ids)
        x2 = self.hub_version == HUB_VERSION_X2
        if (created_ids or deleted_ids) and not x2:
            return self.resync_remote()
        if created_ids and self.order_sync_form != ORDER_SYNC_NATIVE:
            # The order-only form is switched off: the full sync covers it all.
            return self.resync_remote()
        ok = True
        if created_ids:
            ok = self._send_remote_sync_step(f"{origin}-order-sync", purpose="order")
        items = [e for e in dict.fromkeys((*created_ids, *(int(t) & 0xFF for t in touched))) if e not in deleted_ids]
        for entity in items:
            if not ok:
                break
            ok = self._send_entity_sync_step(entity, f"{origin}-item-sync[0x{entity:02X}]")
        if ok:
            return True
        self._log.warning("%s %s: a partial remote sync was not acknowledged; sending the full sync",
                          LogTag.REMOTE, origin)
        return self.resync_remote()

    def _begin_item_sync_tracking(self) -> None:
        """Start a write run: forget which entities were already synced."""

        self._entity_sync_marks = set()

    def _sync_remotes_after_edit(self, entity_id: int, steps: Iterable[Any], origin: str) -> bool:
        """Close an editor run (sync_activity, sync_device): a per-item sync
        of each entity the plan changed for the remotes, except those a step
        already synced (favorites and keymaps send their own)."""

        touched = [
            e for e in entities_touched_by(steps, entity_id) if e not in self._entity_sync_marks
        ]
        if not touched:
            return True
        return self.sync_remotes_after_write(touched=touched, origin=origin)

    # ------------------------------------------------------------------
    # Write batch (phase 4 plan, H2 / decision 8)
    # ------------------------------------------------------------------
    def begin_write_batch(self) -> None:
        """Open a write batch: defer every physical remote-sync trigger.

        While the batch is open, ``resync_remote``,
        ``_send_remote_sync_step`` and a create sequence's terminal step
        all record a request instead of sending. Close it with
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
        status, kind = "not_needed", None
        if batch.remote_sync_pending:
            if not send_remote_sync:
                status = "skipped"
            elif batch.full_requests:
                status, kind = ("sent" if self.resync_remote() else "failed"), "full"
            else:
                status, kind = self._send_partial_syncs(batch)
        self._log.info(
            "[BATCH] write batch closed: %d remote-sync request(s) from %s, %d per-item -> %s (%s)",
            batch.remote_sync_requests, batch.origins or "nothing", len(batch.live_entities), status, kind,
        )
        return {
            "remote_sync": status,
            "remote_sync_kind": kind,
            "remote_sync_requests": batch.remote_sync_requests,
            "item_syncs": len(batch.live_entities) if kind in ("order", "item") else 0,
            "origins": list(batch.origins),
        }

    def _send_partial_syncs(self, batch: EngineWriteBatch) -> tuple[str, str]:
        """A closed batch's order-only and per-item syncs, in that order;
        the full sync when the hub has no order-only form or refuses one."""

        ok, kind = True, "item"
        if batch.order_requests:
            kind = "order" if self.hub_version == HUB_VERSION_X2 else "full"
            ok = self._send_remote_sync_step("batch-order-sync", purpose="order")
            if kind == "full":
                # The X1/X1S got the full trigger: it covers the entities.
                return ("sent" if ok else "failed"), kind
        for entity in batch.live_entities:
            if not ok:
                break
            ok = self._send_entity_sync_step(entity, f"batch-item-sync[0x{entity:02X}]")
        if ok:
            return "sent", kind
        self._log.warning("%s batch: a partial remote sync was not acknowledged; sending the full sync",
                          LogTag.REMOTE)
        return ("sent" if self.resync_remote() else "failed"), "full"

    @property
    def write_batch_open(self) -> bool:
        return self._write_batch is not None

    def _defer_remote_sync(self, origin: str, kind: str = "full") -> bool:
        """True when a batch is open and the trigger was recorded instead
        (``kind``: ``full`` or ``order``)."""

        batch = self._write_batch
        if batch is None:
            return False
        batch.defer(origin, kind)
        self._log.debug("[BATCH] %s remote sync from %s deferred to the batch end", kind, origin)
        return True
