"""Whole-document runner (phase 4 plan, H3): ``AsyncXProxy.sync_hub``.

Takes a baseline snapshot document and the client's edited copy, plans
the transition with :func:`.hub_sync.build_hub_sync_plan` (stage A,
pure), re-reads the affected entities before the first write (stage B,
strict), then runs the items in the plan's order inside one
``batch_writes()`` block: requested remote-sync triggers and snapshot
notifications are coalesced; no-op work need not emit either. Every item
is **planned when it runs**, against the
working document (the engine's projection, rebased after every write),
with the hub-assigned ids substituted for the client's placeholders.

The run's bookkeeping is an :class:`ApplyState`: the two documents, the
placeholder map, every item with its outcome, and what a resume must
re-read. The library never persists it; ``on_state`` hands it to the
consumer after every item for persistence. ``sync_hub(state=...)`` can
continue stopped/cancelled work, but is not duplicate-safe for uncertain
creates. A checkpoint can also omit an in-flight write before dispatch.
Inspect and reconcile hub state before recovery from those cases or an
abrupt interruption; see the public README's document-write limitations.

Outcome vocabulary per item (plan decision 7): ``done``, ``partial``
(some steps landed), ``uncertain`` (a write went out and no answer or a
transport error followed), ``failed`` (refused before its first write),
``not_attempted``, ``cancelled``. The first non-``done`` item stops the
run; nothing is rolled back.
"""

from __future__ import annotations

import asyncio
from copy import deepcopy
from dataclasses import dataclass, field, replace as dc_replace
from datetime import datetime, timezone
import inspect
import logging
from typing import Any, Callable, Mapping, Optional, Sequence
import uuid

from .errors import (
    FetchTimeoutError,
    HubBusyError,
    HubNotConnectedError,
    HubRejectedError,
    SnapshotOutdatedError,
)
from .hub_sync import (
    EntityRef,
    HubSyncItem,
    HubSyncPlan,
    PlaceholderMap,
    UnresolvedPlaceholderError,
    _CREATE_EDITABLE_BLOCK_KEYS,
    _ENTITY_PROVENANCE_KEYS,
    _by_id,
    _flag_new_commands,
    _splice,
    _strip_entity,
    build_hub_sync_plan,
)
from .models import SYNC_PRE_WRITE_FAILURES, WriteProgress
from .proxy_activity_sync import (
    _activity_block_signature,
    _device_block_signature,
    _role_page_reference,
)

__all__ = ["ApplyItem", "ApplyState", "HubSyncResult", "run_sync_hub"]

log = logging.getLogger(__name__)

ITEM_STATUSES = ("not_attempted", "running", "done", "partial", "uncertain", "failed", "cancelled")
RUN_STATUSES = ("queued", "running", "success", "stopped", "cancelled")

# The tables a client may fill on a created entity; everything else on the
# row is the hub's (read back after the create).
_CREATED_ENTITY_TABLES = {
    "device": ("commands", "button_bindings", "macros", "input_record"),
    "activity": ("button_bindings", "favorite_slots", "favorites_order", "macros", "referenced_source_device_ids"),
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


# -- state -----------------------------------------------------------------------------


@dataclass
class ApplyItem:
    """One plan item and what happened to it."""

    index: int
    kind: str
    label: str
    entity_kind: Optional[str] = None
    entity_id: Optional[int] = None
    placeholder_id: Optional[int] = None
    payload: dict[str, Any] = field(default_factory=dict)
    status: str = "not_attempted"
    completed_steps: int = 0
    total_steps: int = 0
    failed_at: Optional[str] = None
    preflight: Optional[str] = None
    message: Optional[str] = None

    @classmethod
    def from_plan(cls, item: HubSyncItem) -> "ApplyItem":
        return cls(
            index=item.index, kind=item.kind, label=item.label, entity_kind=item.entity_kind,
            entity_id=item.entity_id, placeholder_id=item.placeholder_id,
            payload=dict(item.payload), total_steps=item.step_count,
        )

    @property
    def is_sync(self) -> bool:
        return self.kind in ("sync_device", "sync_activity")

    @property
    def remaining(self) -> bool:
        return self.status in ("not_attempted", "partial", "uncertain", "cancelled", "running")

    def to_dict(self) -> dict[str, Any]:
        return {
            "index": self.index, "kind": self.kind, "label": self.label,
            "entity_kind": self.entity_kind, "entity_id": self.entity_id,
            "placeholder_id": self.placeholder_id, "payload": dict(self.payload),
            "status": self.status, "completed_steps": self.completed_steps,
            "total_steps": self.total_steps, "failed_at": self.failed_at,
            "preflight": self.preflight, "message": self.message,
        }

    @classmethod
    def from_dict(cls, data: Mapping[str, Any]) -> "ApplyItem":
        return cls(
            index=int(data["index"]), kind=str(data["kind"]), label=str(data.get("label") or ""),
            entity_kind=data.get("entity_kind"),
            entity_id=None if data.get("entity_id") is None else int(data["entity_id"]),
            placeholder_id=None if data.get("placeholder_id") is None else int(data["placeholder_id"]),
            payload=dict(data.get("payload") or {}), status=str(data.get("status") or "not_attempted"),
            completed_steps=int(data.get("completed_steps") or 0),
            total_steps=int(data.get("total_steps") or 0),
            failed_at=data.get("failed_at"), preflight=data.get("preflight"), message=data.get("message"),
        )


@dataclass
class ApplyState:
    """Everything a run needs to continue after a stop or a restart.

    ``placeholders`` is the :class:`PlaceholderMap` as a dict (keys are the
    placeholder ids as strings, values the hub ids or None). ``cursor`` is
    the index of the next item to run. ``needs_refresh`` lists entities
    whose hub state is unknown after an ``uncertain`` outcome or a lost
    connection; a resume re-reads them first.
    """

    apply_id: str
    baseline: dict[str, Any]
    desired: dict[str, Any]
    placeholders: dict[str, Optional[int]]
    items: list[ApplyItem]
    hub_version: Optional[str] = None
    cursor: int = 0
    status: str = "queued"
    failed_at: Optional[str] = None
    message: Optional[str] = None
    needs_refresh: list[dict[str, Any]] = field(default_factory=list)
    remote_sync: Optional[str] = None
    writes: int = 0
    rebased: bool = False
    snapshot_id: Optional[str] = None
    runs: int = 0
    created_at: str = field(default_factory=_now)
    updated_at: str = field(default_factory=_now)

    @classmethod
    def new(
        cls, baseline: Mapping[str, Any], desired: Mapping[str, Any], plan: HubSyncPlan,
        *, hub_version: Optional[str],
    ) -> "ApplyState":
        return cls(
            apply_id=uuid.uuid4().hex,
            baseline=deepcopy(dict(baseline)),
            desired=deepcopy(dict(desired)),
            placeholders=PlaceholderMap.from_document(desired).to_dict(),
            items=[ApplyItem.from_plan(item) for item in plan.items],
            hub_version=hub_version,
        )

    @property
    def resumable(self) -> bool:
        return self.status in ("stopped", "cancelled")

    @property
    def id_map(self) -> dict[int, int]:
        return {int(k): int(v) for k, v in self.placeholders.items() if v is not None}

    def remaining_items(self) -> list[ApplyItem]:
        return [item for item in self.items if item.remaining]

    def note_refresh(self, kind: str, entity_id: int) -> None:
        ref = {"kind": kind, "entity_id": int(entity_id)}
        if ref not in self.needs_refresh:
            self.needs_refresh.append(ref)

    def touch(self) -> None:
        self.updated_at = _now()

    def to_dict(self) -> dict[str, Any]:
        return {
            "kind": "sofabaton_apply",
            "schema": 1,
            "apply_id": self.apply_id,
            "baseline": deepcopy(self.baseline),
            "desired": deepcopy(self.desired),
            "placeholders": dict(self.placeholders),
            "items": [item.to_dict() for item in self.items],
            "hub_version": self.hub_version,
            "cursor": self.cursor,
            "status": self.status,
            "failed_at": self.failed_at,
            "message": self.message,
            "needs_refresh": [dict(r) for r in self.needs_refresh],
            "remote_sync": self.remote_sync,
            "writes": self.writes,
            "rebased": self.rebased,
            "snapshot_id": self.snapshot_id,
            "runs": self.runs,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }

    @classmethod
    def from_dict(cls, data: Mapping[str, Any]) -> "ApplyState":
        if not isinstance(data, Mapping) or data.get("kind") != "sofabaton_apply":
            raise ValueError("not a sofabaton_apply document")
        if int(data.get("schema") or 0) != 1:
            raise ValueError(f"unsupported apply document schema {data.get('schema')!r}")
        placeholders = {
            str(k): (None if v is None else int(v)) for k, v in (data.get("placeholders") or {}).items()
        }
        return cls(
            apply_id=str(data["apply_id"]),
            baseline=deepcopy(dict(data.get("baseline") or {})),
            desired=deepcopy(dict(data.get("desired") or {})),
            placeholders=placeholders,
            items=[ApplyItem.from_dict(i) for i in data.get("items") or []],
            hub_version=data.get("hub_version"),
            cursor=int(data.get("cursor") or 0),
            status=str(data.get("status") or "queued"),
            failed_at=data.get("failed_at"),
            message=data.get("message"),
            needs_refresh=[dict(r) for r in data.get("needs_refresh") or []],
            remote_sync=data.get("remote_sync"),
            writes=int(data.get("writes") or 0),
            rebased=bool(data.get("rebased")),
            snapshot_id=data.get("snapshot_id"),
            runs=int(data.get("runs") or 0),
            created_at=str(data.get("created_at") or _now()),
            updated_at=str(data.get("updated_at") or _now()),
        )


@dataclass(frozen=True)
class HubSyncResult:
    """Outcome of :meth:`AsyncXProxy.sync_hub` (plan section 5).

    ``snapshot_id`` is None and ``rebased`` False when the hub connection
    was lost, so the projection cannot be vouched for; ``needs_refresh``
    then names what a resume re-reads. ``state`` is the full
    :class:`ApplyState` for the consumer to persist.
    """

    status: str
    items: tuple[ApplyItem, ...]
    id_map: dict[int, int]
    writes: int
    remote_sync: str
    rebased: bool
    snapshot_id: Optional[str]
    needs_refresh: tuple[EntityRef, ...]
    apply_id: str
    resumable: bool
    failed_at: Optional[str]
    message: Optional[str]
    state: ApplyState = field(compare=False, repr=False)

    @property
    def ok(self) -> bool:
        return self.status == "success"

    @classmethod
    def from_state(cls, state: ApplyState) -> "HubSyncResult":
        return cls(
            status=state.status,
            items=tuple(dc_replace(item) for item in state.items),
            id_map=state.id_map,
            writes=state.writes,
            remote_sync=state.remote_sync or "not_needed",
            rebased=state.rebased,
            snapshot_id=state.snapshot_id,
            needs_refresh=tuple(EntityRef(str(r["kind"]), int(r["entity_id"])) for r in state.needs_refresh),
            apply_id=state.apply_id,
            resumable=state.resumable,
            failed_at=state.failed_at,
            message=state.message,
            state=state,
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "items": [item.to_dict() for item in self.items],
            "id_map": {str(k): v for k, v in self.id_map.items()},
            "writes": self.writes,
            "remote_sync": self.remote_sync,
            "rebased": self.rebased,
            "snapshot_id": self.snapshot_id,
            "needs_refresh": [ref.to_dict() for ref in self.needs_refresh],
            "apply_id": self.apply_id,
            "resumable": self.resumable,
            "failed_at": self.failed_at,
            "message": self.message,
        }


# -- the run -----------------------------------------------------------------------


class _Stop(Exception):
    """Internal: the run stops here (the state already says why)."""


async def run_sync_hub(
    proxy: Any,
    *,
    baseline: Optional[Mapping[str, Any]] = None,
    desired: Optional[Mapping[str, Any]] = None,
    state: Optional[ApplyState] = None,
    snapshot_id: Optional[str] = None,
    progress: Optional[Callable] = None,
    on_state: Optional[Callable] = None,
    hub_version: Optional[str] = None,
) -> HubSyncResult:
    """The body of :meth:`AsyncXProxy.sync_hub`; see there."""

    if state is None:
        if baseline is None or desired is None:
            raise ValueError("sync_hub needs baseline and desired, or a state to resume")
        version = hub_version or str((baseline.get("hub") or {}).get("version") or "") or None
        if version is None:
            status = await proxy.status()
            version = status.hub_version
        if snapshot_id is not None:
            current = await proxy.snapshot()
            if current.snapshot_id != snapshot_id:
                raise SnapshotOutdatedError(
                    f"the document was edited on snapshot {snapshot_id[:12]}..., the current "
                    f"snapshot is {current.snapshot_id[:12]}...; take a new snapshot and edit again"
                )
        plan = build_hub_sync_plan(baseline, desired, hub_version=version)
        state = ApplyState.new(baseline, desired, plan, hub_version=version)
        live_check = list(plan.live_check)
        first_run = True
    elif state.status == "queued":
        # A state a consumer built ahead of the run (so it could record the
        # apply id before anything happened): its first run. Stage A ran
        # when it was built; run it again for the stage B set and to refuse
        # a document that no longer validates.
        if snapshot_id is not None:
            current = await proxy.snapshot()
            if current.snapshot_id != snapshot_id:
                raise SnapshotOutdatedError(
                    f"the document was edited on snapshot {snapshot_id[:12]}..., the current "
                    f"snapshot is {current.snapshot_id[:12]}...; take a new snapshot and edit again"
                )
        plan = build_hub_sync_plan(state.baseline, state.desired, hub_version=state.hub_version)
        live_check = list(plan.live_check)
        first_run = True
    else:
        if not state.resumable:
            raise ValueError(f"an apply with status {state.status!r} cannot be resumed")
        live_check = []
        first_run = False

    run = _Run(proxy, state, progress=progress, on_state=on_state, first_run=first_run, live_check=live_check)
    return await run.run()


class _Run:
    def __init__(
        self, proxy: Any, state: ApplyState, *, progress: Optional[Callable], on_state: Optional[Callable],
        first_run: bool, live_check: Sequence[EntityRef],
    ) -> None:
        self.proxy = proxy
        self.state = state
        self.progress = progress
        self.on_state = on_state
        self.first_run = first_run
        self.live_check = list(live_check)
        self.pm = PlaceholderMap.from_dict(state.placeholders)
        self.loop = asyncio.get_running_loop()
        self.cancelled = False
        self._last_working: Optional[dict[str, Any]] = None

    # -- consumer callbacks --------------------------------------------------------------

    def _emit_state(self) -> None:
        self.state.touch()
        cb = self.on_state
        if cb is None:
            return
        if inspect.iscoroutinefunction(cb):
            self.loop.create_task(cb(self.state))
        else:
            cb(self.state)

    def _emit_progress(self, report: WriteProgress) -> None:
        cb = self.progress
        if cb is None:
            return
        if inspect.iscoroutinefunction(cb):
            self.loop.create_task(cb(report))
        else:
            cb(report)

    def _item_progress(self, item: ApplyItem) -> Callable[[WriteProgress], None]:
        count = len(self.state.items)

        def relay(report: WriteProgress) -> None:
            self._emit_progress(dc_replace(report, item_index=item.index, item_count=count))

        return relay

    def _say(self, item: Optional[ApplyItem], phase: str, message: str, *, kind: Optional[str] = None,
             entity_id: Optional[int] = None) -> None:
        self._emit_progress(WriteProgress(
            phase=phase, message=message,
            completed_steps=item.completed_steps if item else 0,
            total_steps=item.total_steps if item else 0,
            entity_kind=kind if kind is not None else (item.entity_kind if item else None),
            entity_id=entity_id if entity_id is not None else (item.entity_id if item else None),
            item_index=item.index if item else None,
            item_count=len(self.state.items),
        ))

    # -- the run ----------------------------------------------------------------------

    async def run(self) -> HubSyncResult:
        state = self.state
        state.runs += 1
        state.status = "running"
        state.failed_at = None
        state.message = None
        state.remote_sync = None
        self._emit_state()
        cancel_pending = False
        async with self.proxy.batch_writes() as batch:
            try:
                await self._stage_b()
                await self._run_items()
                state.status = "success"
            except _Stop:
                state.status = "stopped"
            except asyncio.CancelledError:
                cancel_pending = True
                self._mark_rest("not_attempted")
                state.status = "cancelled"
                state.message = "cancelled between items"
        outcome = batch.outcome
        state.remote_sync = outcome.remote_sync if outcome is not None else "not_needed"
        try:
            hub_up = bool((await self.proxy.status()).hub_connected)
        except Exception:  # pragma: no cover - a status read never raises
            hub_up = False
        if hub_up and outcome is not None:
            state.rebased = True
            state.snapshot_id = outcome.snapshot_id
        else:
            state.rebased = False
            state.snapshot_id = None
            for item in state.items:
                if item.status in ("partial", "uncertain", "running") and item.entity_kind in ("device", "activity") \
                        and item.entity_id is not None:
                    state.note_refresh(item.entity_kind, item.entity_id)
        self._emit_state()
        if cancel_pending:
            raise asyncio.CancelledError()
        return HubSyncResult.from_state(state)

    def _mark_rest(self, status: str) -> None:
        for item in self.state.items[self.state.cursor:]:
            if item.status in ("not_attempted", "cancelled"):
                item.status = status

    # -- stage B: strict rereads before the first write ---------------------------------------

    async def _stage_b(self) -> None:
        state = self.state
        refs: list[tuple[str, int, bool]] = []  # (kind, id, compare_with_baseline)
        seen: set[tuple[str, int]] = set()

        def _add(kind: str, entity_id: int, compare: bool) -> None:
            key = (kind, entity_id)
            if key not in seen:
                seen.add(key)
                refs.append((kind, entity_id, compare))

        if self.first_run:
            for ref in self.live_check:
                _add(ref.kind, ref.entity_id, True)
        else:
            for ref in list(state.needs_refresh):
                _add(str(ref["kind"]), int(ref["entity_id"]), False)
            for item in state.remaining_items():
                if not item.is_sync:
                    continue
                physical = self._physical_id(item)
                if physical is None:
                    continue
                # A not-attempted entity must still be what the baseline says;
                # a partial or uncertain one is re-planned from wherever it is.
                _add(item.entity_kind or "", physical, item.status == "not_attempted")

        for kind, entity_id, compare in refs:
            self._say(None, "live_check", f"Re-reading {kind} {entity_id} before writing…",
                      kind=kind, entity_id=entity_id)
            try:
                snap = await self.proxy.refresh(**{f"{kind}_id": entity_id})
            except (FetchTimeoutError, HubNotConnectedError, HubBusyError) as err:
                self._stop("live_check", f"{kind} {entity_id} could not be re-read before writing: {err}")
            entity = snap.entity(kind, entity_id)
            if entity is None:
                self._stop("live_check", f"{kind} {entity_id} is no longer on the hub")
            if not entity.complete:
                self._stop("live_check", f"{kind} {entity_id} re-read was incomplete; refresh it and resume")
            if compare and await self.proxy.run(self._moved, kind, entity_id, snap.bundle):
                self._stop("live_check" if self.first_run else "entity_diverged",
                           f"{kind} {entity_id} changed on the hub since the document was taken")
            state.needs_refresh = [r for r in state.needs_refresh
                                   if not (r["kind"] == kind and int(r["entity_id"]) == entity_id)]

    def _moved(self, kind: str, entity_id: int, working: Mapping[str, Any]) -> bool:
        """Executor thread: the engine's own preflight signatures decide."""

        base_row = _by_id(self.state.baseline, kind).get(entity_id)
        live_row = _by_id(working, kind).get(entity_id)
        if kind == "device":
            return _device_block_signature(base_row) != _device_block_signature(live_row)
        engine = getattr(self.proxy, "_proxy", None)
        details = getattr(getattr(engine, "state", None), "button_details", None)
        ref = _role_page_reference(self.state.baseline, details)
        return (_activity_block_signature(base_row, role_page_ref=ref)
                != _activity_block_signature(live_row, role_page_ref=ref))

    def _stop(self, failed_at: str, message: str) -> None:
        self.state.failed_at = failed_at
        self.state.message = message
        raise _Stop()

    # -- items ---------------------------------------------------------------------------

    async def _run_items(self) -> None:
        state = self.state
        if not self.first_run:
            self._last_working = (await self.proxy.snapshot()).bundle
        while state.cursor < len(state.items):
            # A cancel requested between items lands here, before the next
            # item's task exists, so that item stays not_attempted instead
            # of being drained.
            await asyncio.sleep(0)
            item = state.items[state.cursor]
            if item.status == "done":
                state.cursor += 1
                continue
            was_in_flight = item.status == "running"
            item.status = "running"
            item.failed_at = item.preflight = item.message = None
            self._say(item, "item", item.label)
            task = self.loop.create_task(self._run_item(item, was_in_flight))
            try:
                await asyncio.shield(task)
            except asyncio.CancelledError:
                # Finish the item in flight, then stop between items.
                await task
                if item.status == "running":
                    item.status = "cancelled"
                self._emit_state()
                raise
            self._emit_state()
            if item.status != "done":
                state.failed_at = "item"
                state.message = f"{item.kind} item {item.index} {item.status}: {item.message or ''}".rstrip(": ")
                self._mark_rest("not_attempted")
                raise _Stop()
            state.cursor += 1

    def _physical_id(self, item: ApplyItem) -> Optional[int]:
        if item.entity_id is not None:
            return item.entity_id
        if item.placeholder_id is not None:
            return self.pm.physical(item.placeholder_id)
        return None

    async def _run_item(self, item: ApplyItem, was_in_flight: bool = False) -> None:
        try:
            await self._dispatch(item, was_in_flight)
        except _Stop:
            raise
        except (HubNotConnectedError, HubBusyError) as err:
            # Refused before the wire.
            item.status, item.failed_at, item.message = "failed", "unavailable", str(err)
        except HubRejectedError as err:
            hub_up = bool((await self.proxy.status()).hub_connected)
            item.status = "failed" if hub_up else "uncertain"
            item.failed_at, item.message = "hub", str(err)
            if not hub_up:
                self._note_item_refresh(item)
        except UnresolvedPlaceholderError as err:
            item.status, item.failed_at, item.message = "failed", "plan", str(err)
        except asyncio.CancelledError:
            raise
        except Exception as err:  # transport or engine error mid-item: outcome unknown
            log.exception("sync_hub item %d (%s) raised", item.index, item.kind)
            item.status, item.failed_at, item.message = "uncertain", "transport", f"{type(err).__name__}: {err}"
            self._note_item_refresh(item)

    def _note_item_refresh(self, item: ApplyItem) -> None:
        if item.entity_kind in ("device", "activity") and item.entity_id is not None:
            self.state.note_refresh(item.entity_kind, item.entity_id)

    async def _dispatch(self, item: ApplyItem, was_in_flight: bool = False) -> None:
        proxy = self.proxy
        state = self.state
        kind = item.kind
        if kind == "hub_rename":
            await proxy.set_hub_name(str(item.payload["name"]))
            self._done(item, writes=1)
        elif kind in ("add_device", "add_activity"):
            name = str(item.payload["name"])
            entity_kind = "device" if kind == "add_device" else "activity"
            new_id = self._adopt_in_flight_create(item, entity_kind, name) if was_in_flight else None
            if new_id is None:
                if kind == "add_device":
                    new_id = await proxy.add_device(name, str(item.payload["device_class"]))
                else:
                    new_id = await proxy.add_activity(name)
                state.writes += 1
            item.entity_id = new_id
            if item.placeholder_id is not None and self.pm.physical(item.placeholder_id) is None:
                self.pm.assign(item.placeholder_id, new_id)
                state.placeholders = self.pm.to_dict()
                # The sync item of the same entity now has a physical id.
                for other in state.items:
                    if other.placeholder_id == item.placeholder_id and other.entity_id is None:
                        other.entity_id = new_id
                # Persist the id before anything else can go wrong: a
                # resume must never create this entity twice.
                self._emit_state()
            # Read the created entity so the working document holds the hub's
            # block and the entity is editable for its sync item.
            # The create reads its entity back itself; only an adopted
            # in-flight create, or a read-back that failed, is read here.
            entity_kind = "device" if kind == "add_device" else "activity"
            entity = (await proxy.snapshot()).entity(entity_kind, new_id)
            if entity is None or not entity.complete:
                try:
                    snap = await proxy.refresh(**{f"{entity_kind}_id": new_id})
                except (FetchTimeoutError, HubNotConnectedError, HubBusyError) as err:
                    state.note_refresh(entity_kind, new_id)
                    item.status, item.failed_at = "uncertain", "reread"
                    item.message = f"created as {new_id} but could not be read back: {err}"
                    return
                entity = snap.entity(entity_kind, new_id)
            if entity is None or not entity.complete:
                state.note_refresh(entity_kind, new_id)
                item.status, item.failed_at = "uncertain", "reread"
                item.message = f"created as {new_id} but the read-back was incomplete"
                return
            item.status, item.completed_steps, item.total_steps = "done", 1, 1
        elif kind in ("sync_device", "sync_activity"):
            await self._run_sync(item)
        elif kind == "remove_activity":
            await proxy.remove_activity(int(item.payload["entity_id"]))
            self._done(item, writes=1)
        elif kind == "remove_device":
            await proxy.remove_device(int(item.payload["entity_id"]))
            self._done(item, writes=1)
        elif kind in ("reorder_devices", "reorder_activities"):
            order = []
            for raw in item.payload.get("order") or []:
                value = int(raw)
                if value < 0:
                    physical = self.pm.physical(value)
                    if physical is None:
                        raise UnresolvedPlaceholderError([value])
                    value = physical
                order.append(value)
            # The live display order after the creates and deletes: the hub
            # decides where a created entity lands, so the write happens only
            # when the order the document asks for is not already the case.
            entity_kind = "device" if kind == "reorder_devices" else "activity"
            working = (await proxy.snapshot()).bundle
            live_order = [int(r["device"]["device_id"]) for r in working.get(
                "devices" if entity_kind == "device" else "activities") or []
                if isinstance(r, Mapping) and isinstance((r.get("device") or {}).get("device_id"), int)]
            if live_order == order:
                item.status, item.completed_steps, item.total_steps = "done", 0, 0
                item.message = "already in this order"
                return
            if kind == "reorder_devices":
                await proxy.reorder_devices(order)
            else:
                await proxy.reorder_activities(order)
            self._done(item, writes=1)
        else:
            item.status, item.failed_at, item.message = "failed", "plan", f"unknown item kind {kind!r}"

    def _adopt_in_flight_create(self, item: ApplyItem, entity_kind: str, name: str) -> Optional[int]:
        """A create that was in flight when the state was saved may have
        landed without its id being recorded. Before creating again, look
        for an entity of that name the baseline does not have and no other
        placeholder owns; adopt it as this item's result."""

        if item.placeholder_id is not None and self.pm.physical(item.placeholder_id) is not None:
            return self.pm.physical(item.placeholder_id)
        if item.entity_id is not None:
            return item.entity_id
        working = self._last_working
        if working is None:
            return None
        known = set(_by_id(self.state.baseline, entity_kind))
        taken = set(self.pm.assigned.values())
        wanted = name.strip()
        for entity_id, row in _by_id(working, entity_kind).items():
            if entity_id in known or entity_id in taken:
                continue
            if str((row.get("device") or {}).get("name") or "").strip() == wanted:
                log.info("sync_hub: adopting %s %d %r created by the interrupted run", entity_kind, entity_id, wanted)
                return entity_id
        return None

    def _done(self, item: ApplyItem, *, writes: int) -> None:
        item.status, item.completed_steps, item.total_steps = "done", 1, 1
        self.state.writes += writes

    async def _run_sync(self, item: ApplyItem) -> None:
        proxy = self.proxy
        state = self.state
        entity_kind = "device" if item.kind == "sync_device" else "activity"
        physical = self._physical_id(item)
        if physical is None:
            raise UnresolvedPlaceholderError([item.placeholder_id or 0])
        item.entity_id = physical

        working = (await proxy.snapshot()).bundle
        live_row = _by_id(working, entity_kind).get(physical)
        if live_row is None:
            item.status, item.failed_at = "failed", "plan"
            item.message = f"{entity_kind} {physical} is not in the working document"
            return
        desired_phys = self.pm.resolve(state.desired, partial=True)
        want_row = _by_id(desired_phys, entity_kind).get(physical)
        if want_row is None:
            item.status, item.failed_at = "failed", "plan"
            item.message = f"{entity_kind} {physical} is not in the desired document"
            return
        key = "devices" if entity_kind == "device" else "activities"
        missing = self.pm.needed_by({key: [want_row]})
        if missing:
            raise UnresolvedPlaceholderError(missing)

        if item.placeholder_id is not None:
            # A created entity: the hub decided the row's shape and block;
            # only the client's editable content rides on top (the block's
            # editable fields and the tables), so nothing the client's copy
            # carries or lacks reads as an out-of-scope change. Every command
            # row is an addition.
            row = deepcopy(dict(live_row))
            block = dict(row.get("device") or {})
            want_block = dict(want_row.get("device") or {})
            for field_name in ("name", *_CREATE_EDITABLE_BLOCK_KEYS):
                if field_name in want_block:
                    block[field_name] = want_block[field_name]
            row["device"] = block
            for key in _CREATED_ENTITY_TABLES[entity_kind]:
                if key in want_row and (want_row[key] or key in live_row):
                    row[key] = deepcopy(want_row[key])
            if entity_kind == "device":
                row = _flag_new_commands(row)
        else:
            row = _strip_entity(want_row)
            block = dict(row.get("device") or {})
            live_block = dict(live_row.get("device") or {})
            if "sort" in live_block:
                block["sort"] = live_block["sort"]  # output-only, never a diff
            row["device"] = block
            for field_name in _ENTITY_PROVENANCE_KEYS:
                if field_name in live_row:
                    row[field_name] = live_row[field_name]
        edited = _splice(working, entity_kind, physical, row)

        sync = proxy.sync_device if entity_kind == "device" else proxy.sync_activity
        id_kw = "device_id" if entity_kind == "device" else "activity_id"
        result = await sync(baseline=working, edited=edited, strict=True,
                            progress=self._item_progress(item), **{id_kw: physical})
        item.completed_steps = result.completed_steps
        item.total_steps = result.total_steps
        if result.ok:
            item.status = "done"
            state.writes += result.completed_steps
            return
        item.failed_at = result.failed_at
        item.message = result.message
        item.preflight = getattr(result, "preflight", None)
        if result.failed_at in SYNC_PRE_WRITE_FAILURES:
            item.status = "failed"
            return
        item.status = "partial"
        state.writes += result.completed_steps
        state.note_refresh(entity_kind, physical)
