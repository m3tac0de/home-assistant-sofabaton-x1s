# models.py: typed results returned by the asyncio facade.
#
# Plain stdlib dataclasses with a ``to_dict()`` so a consumer that speaks
# JSON (a REST/WebSocket server) can serialise them without knowing their
# shape, and a schema generator can derive components from the fields.
# The engine never sees these; aio.py builds them from engine state.
from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass, field
from typing import Any, Literal, Optional, Union

__all__ = [
    "HubMode",
    "HubStatus",
    "HubInfo",
    "RunningActivity",
    "Activity",
    "Device",
    "Command",
    "Button",
    "Macro",
    "Favorite",
    "SnapshotEntity",
    "HubSnapshot",
    "WriteProgress",
    "SyncResult",
    "DeviceRemoved",
    "RestoreResult",
    "EventKind",
    "ActivityChanged",
    "ConnectionState",
    "StatusChanged",
    "CatalogReady",
    "SnapshotChanged",
    "HubEvent",
]

# ``disconnected``: no hub session. ``observe``: hub connected but an app
# client holds it through the proxy (reads serve cache, sends refused).
# ``control``: the proxy owns the hub (reads fetch, sends work).
HubMode = Literal["disconnected", "observe", "control"]


@dataclass(frozen=True)
class RunningActivity:
    """The activity currently running on the hub."""

    activity_id: int
    name: Optional[str]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class HubStatus:
    """Live connection state of one proxied hub. Pure state read, no hub traffic."""

    hub_connected: bool
    app_connected: bool
    controllable: bool
    mode: HubMode
    hub_version: Optional[str]
    proxy_enabled: bool
    running_activity: Optional[RunningActivity]
    activities_cached: int
    devices_cached: int
    # True once the connect-time initial sync (banner, devices,
    # activities) has completed for the current hub session.
    catalog_ready: bool = False
    # The firmware floor verdicts, from the banner (hub_versions): "outdated"
    # only asks for an update, "unsupported" means the hub ACKs writes and
    # silently drops them, so a client blocks its write surfaces on it.
    # False until the banner is known; an unknown hub line never blocks.
    firmware_version: Optional[int] = None
    firmware_min_supported: Optional[int] = None
    firmware_unsupported: bool = False
    firmware_outdated: bool = False

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class HubInfo:
    """Identity of the physical hub, as read from its connect banner.

    ``known`` is False until the banner has been read at least once; the
    other fields are then None. The ``firmware_*`` verdicts are the
    library's floors (:mod:`hub_versions`) applied to the reported
    version, the same ones :class:`HubStatus` carries.
    """

    known: bool
    model: Optional[str]
    name: Optional[str]
    mac: Optional[str]
    firmware_version: Optional[int]
    production_batch: Optional[str]
    firmware_min_supported: Optional[int] = None
    firmware_min_recommended: Optional[int] = None
    firmware_unsupported: bool = False
    firmware_outdated: bool = False

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


# ---------------------------------------------------------------------------
# Catalog read results
# ---------------------------------------------------------------------------
#
# Everything is keyed on (entity_id, command_id): browse to get the ids,
# then ``send(entity_id, command_id)``. Each type carries its own id so a
# list is self-describing when serialised.


@dataclass(frozen=True)
class Activity:
    """One activity from the hub's catalog.

    ``sort`` is the hub's stored display position (the byte the app's and
    :meth:`AsyncXProxy.reorder_activities` writes set), ``0`` when the
    record carries none. ``activities()`` already lists in that order.
    """

    activity_id: int
    name: str
    active: bool
    needs_confirm: bool
    sort: int = 0

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class Device:
    """One device from the hub's catalog.

    ``power_state`` is the hub's live power byte for the device (0 off,
    1 on) as of the last devices fetch; None when the row carried no
    parseable record. The hub commits it with a macro-runtime lag after a
    power fire, so it is not an instantaneous read. ``idle_behavior`` is
    the device's power-behaviour mode when known. ``sort`` is the hub's
    stored display position (what :meth:`AsyncXProxy.reorder_devices`
    writes), ``0`` when the record carries none; ``devices()`` already
    lists in that order.
    """

    device_id: int
    name: str
    brand: Optional[str]
    device_class: Optional[str]
    device_class_code: Optional[int]
    power_state: Optional[int]
    idle_behavior: Optional[int]
    sort: int = 0

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class Command:
    """A device command; send with ``send(device_id, command_id)``."""

    command_id: int
    label: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class Button:
    """A remote button bound on an activity or device.

    ``button_code`` is what you send to that entity; ``device_id`` /
    ``command_id`` are the underlying target it maps to, None for an
    unbound slot. ``name`` is the ``ButtonName`` alias when the code has
    one. ``long_press_device_id`` / ``long_press_command_id`` are the
    hub's long-press binding for the same button, both None when the
    button has none; the remote hardware fires it on a hold, and a
    client that wants the same gesture sends the pair with ``send()``
    (there is no long-press send, the pair is an ordinary command).
    """

    button_code: int
    name: Optional[str]
    device_id: Optional[int]
    command_id: Optional[int]
    long_press_device_id: Optional[int] = None
    long_press_command_id: Optional[int] = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class Macro:
    """An activity macro; send with ``send(activity_id, command_id)``."""

    command_id: int
    label: Optional[str]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class Favorite:
    """An activity favorite: a device command; send with ``send(device_id, command_id)``."""

    device_id: int
    command_id: int
    label: Optional[str]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


# ---------------------------------------------------------------------------
# Snapshot (phase 3 plan, section 4)
# ---------------------------------------------------------------------------
#
# The snapshot is the structural ``hub_bundle`` (the hub configuration
# minus IR payload blobs) projected from the engine's cache with no hub
# I/O, plus a typed header. ``snapshot_id`` is a content hash: the same
# configuration hashes the same across restarts and across an
# ``export_state`` / ``import_state`` round trip, while provenance
# (capture times) is excluded so it never moves the id.

# Bundle-level keys that are capture bookkeeping, not configuration.
_SNAPSHOT_VOLATILE_BUNDLE_KEYS = frozenset({"captured_at", "_progress_total_steps"})
# Entity-level keys that are provenance, not configuration.
_SNAPSHOT_VOLATILE_ENTITY_KEYS = frozenset({"captured_at", "fetched_at", "editable"})


def snapshot_content_id(bundle: dict[str, Any]) -> str:
    """Content hash of a structural bundle with provenance stripped."""

    def _entity(payload: Any) -> Any:
        if not isinstance(payload, dict):
            return payload
        return {k: v for k, v in payload.items() if k not in _SNAPSHOT_VOLATILE_ENTITY_KEYS}

    canonical = {
        k: v for k, v in bundle.items() if k not in _SNAPSHOT_VOLATILE_BUNDLE_KEYS
    }
    canonical["devices"] = [_entity(p) for p in bundle.get("devices") or []]
    canonical["activities"] = [_entity(p) for p in bundle.get("activities") or []]
    encoded = json.dumps(canonical, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class BatchOutcome:
    """What closing :meth:`AsyncXProxy.batch_writes` did.

    ``remote_sync``: ``"sent"`` (one coalesced trigger went out),
    ``"not_needed"`` (no participating write asked for one) or
    ``"failed"`` (the trigger could not be enqueued; the configuration
    writes are unaffected and ``resync_remote`` can be retried alone).
    ``device_ids`` / ``activity_ids`` are every entity the batch's
    writes rebased, ``rebases`` how many rebases were folded into the
    single ``snapshot_changed`` event, ``snapshot_id`` the projection
    after the batch.
    """

    remote_sync: Literal["sent", "failed", "not_needed"]
    remote_sync_requests: int
    device_ids: tuple[int, ...]
    activity_ids: tuple[int, ...]
    rebases: int
    snapshot_id: str


@dataclass
class WriteBatch:
    """Handle yielded by :meth:`AsyncXProxy.batch_writes`; ``outcome`` is
    filled in when the context closes (also after an error or a cancel)."""

    outcome: Optional[BatchOutcome] = None


@dataclass(frozen=True)
class SnapshotEntity:
    """Provenance of one device or activity inside a :class:`HubSnapshot`.

    ``complete``: the last structural fetch captured every table.
    ``editable``: a sync may take this entity as its baseline (complete).
    ``fetched_at``: ISO time of the last structural fetch, None if never.

    These describe the library's copy, never the hub: the hub can be
    edited outside this library at any time and does not say so. The
    cache is a last-known copy whose age ``fetched_at`` gives; whether it
    is still current is for the consumer to decide, and only a refresh
    brings it up to date.
    """

    kind: Literal["device", "activity"]
    entity_id: int
    name: Optional[str]
    complete: bool
    editable: bool
    fetched_at: Optional[str]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class HubSnapshot:
    """The hub's structural configuration as the engine's cache holds it.

    ``bundle`` is the structural ``hub_bundle`` dict (what
    ``sync_activity`` / ``sync_device`` take as ``baseline``); the other
    fields are its header. ``to_dict()`` returns the bundle with the header
    fields merged in, so a JSON consumer gets one document.
    """

    snapshot_id: str
    captured_at: str
    engine_generation: int
    complete: bool
    hub: dict[str, Any]
    devices: list[SnapshotEntity]
    activities: list[SnapshotEntity]
    bundle: dict[str, Any] = field(repr=False, compare=False)

    def entity(self, kind: str, entity_id: int) -> Optional[SnapshotEntity]:
        rows = self.devices if kind == "device" else self.activities
        for row in rows:
            if row.entity_id == (int(entity_id) & 0xFF):
                return row
        return None

    def to_dict(self) -> dict[str, Any]:
        out = dict(self.bundle)
        out["snapshot_id"] = self.snapshot_id
        out["engine_generation"] = self.engine_generation
        return out


@dataclass(frozen=True)
class WriteProgress:
    """One progress report from a long-running operation (refresh, sync).

    ``phase`` is the operation's own phase word (``preparing``, ``device``,
    ``activity``, ``stale_check``, ``writing``, ``reading_back``,
    ``finalizing`` ...);
    ``entity_kind`` / ``entity_id`` name the entity being worked on when
    there is one; ``step_kind`` is the sync step kind while writing.
    """

    phase: str
    message: str
    completed_steps: int
    total_steps: int
    entity_kind: Optional[str] = None
    entity_id: Optional[int] = None
    step_kind: Optional[str] = None
    # Set by sync_hub: which item of how many this report belongs to.
    item_index: Optional[int] = None
    item_count: Optional[int] = None

    @classmethod
    def from_engine(cls, **payload: Any) -> "WriteProgress":
        """Build from the engine's keyword-only progress dict."""

        entity_kind: Optional[str] = None
        entity_id: Optional[int] = None
        if payload.get("current_device_id") is not None:
            entity_kind, entity_id = "device", int(payload["current_device_id"])
        elif payload.get("current_activity_id") is not None:
            entity_kind, entity_id = "activity", int(payload["current_activity_id"])
        return cls(
            phase=str(payload.get("phase") or ""),
            message=str(payload.get("message") or ""),
            completed_steps=int(payload.get("completed_steps") or 0),
            total_steps=int(payload.get("total_steps") or 0),
            entity_kind=entity_kind,
            entity_id=entity_id,
            step_kind=payload.get("step_kind"),
        )

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


# ---------------------------------------------------------------------------
# Write results (phase 3 plan, W3)
# ---------------------------------------------------------------------------

# ``failed_at`` values that mean nothing was written to the hub.
SYNC_PRE_WRITE_FAILURES = frozenset({"plan", "stale_check", "unavailable"})


@dataclass(frozen=True)
class SyncResult:
    """Outcome of :meth:`AsyncXProxy.sync_activity` / :meth:`sync_device`.

    A sync never raises for a hub-side outcome: ``status`` is ``"success"``
    or ``"failed"`` and ``failed_at`` names the step (``"plan"`` and
    ``"stale_check"`` mean nothing was written; anything else means the
    steps before ``completed_steps`` landed and the hub holds a partial
    edit, which the rebased snapshot shows). ``snapshot_id`` is the
    projection after the write.
    """

    status: Literal["success", "failed"]
    failed_at: Optional[str]
    message: Optional[str]
    completed_steps: int
    total_steps: int
    counters: dict[str, int]
    snapshot_id: Optional[str]
    # The strict preflight's verdict when it stopped the write
    # ("changed" | "unreadable" | "incomplete"), else None.
    preflight: Optional[str] = None

    @property
    def ok(self) -> bool:
        return self.status == "success"

    @property
    def wrote_nothing(self) -> bool:
        """True when the failure happened before the first hub write."""

        return self.status == "failed" and self.failed_at in SYNC_PRE_WRITE_FAILURES

    @classmethod
    def from_engine(cls, result: Any, *, snapshot_id: Optional[str]) -> "SyncResult":
        data = result if isinstance(result, dict) else {}
        status = "success" if data.get("status") == "success" else "failed"
        counters = data.get("counters") or {}
        return cls(
            status=status,
            failed_at=None if status == "success" else str(data.get("failed_at") or "unknown"),
            message=data.get("message"),
            completed_steps=int(data.get("completed_steps") or 0),
            total_steps=int(data.get("total_steps") or 0),
            counters={str(k): int(v) for k, v in counters.items()} if isinstance(counters, dict) else {},
            snapshot_id=snapshot_id,
            preflight=data.get("preflight") if status != "success" else None,
        )

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class DeviceRemoved:
    """Outcome of :meth:`AsyncXProxy.remove_device`.

    The hub cascades the removal into every activity that used the device;
    ``impacted_activity_ids`` are the ones still present afterwards whose
    detail is no longer cached (refresh them before editing), and
    ``confirmed_activity_ids`` the subset the hub asked to be re-confirmed.
    An activity left with no members is purged by the hub.
    """

    device_id: int
    confirmed_activity_ids: tuple[int, ...]
    impacted_activity_ids: tuple[int, ...]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class RestoreResult:
    """Outcome of :meth:`AsyncXProxy.restore`.

    ``failed_at`` is ``(kind, source_id)`` of the entity whose restore
    failed, or ``("proxy", None)`` when the hub could not be written at
    all; entities restored before it stay on the hub (no rollback).
    ``device_id_map`` maps the bundle's device ids to the ids the hub
    assigned. ``restored_devices`` / ``restored_activities`` are counts;
    the engine's per-entity records are ``restored`` (kept as the engine
    returned them). ``erased`` says the hub was wiped first
    (``restore(replace=True)``): a failure after that has changed the hub
    even when no entity was restored.
    """

    status: Literal["success", "failed"]
    failed_at: Optional[tuple[str, Optional[int]]]
    device_id_map: dict[int, int]
    restored_devices: int
    restored_activities: int
    snapshot_id: Optional[str]
    restored: dict[str, list[dict[str, Any]]] = field(default_factory=dict, compare=False)
    erased: bool = False

    @property
    def ok(self) -> bool:
        return self.status == "success"

    @property
    def wrote_nothing(self) -> bool:
        """True when the hub is as it was: no entity restored, and not erased first."""

        return not self.ok and not self.erased and self.restored_devices == 0 and self.restored_activities == 0

    @classmethod
    def from_engine(cls, result: Any, *, snapshot_id: Optional[str], erased: bool = False) -> "RestoreResult":
        # The engine reports ``restored_devices`` / ``restored_activities``
        # as LISTS of per-entity result records; older callers counted them.
        data = result if isinstance(result, dict) else {}
        failed_at = data.get("failed_at")
        parsed_failed: Optional[tuple[str, Optional[int]]] = None
        if isinstance(failed_at, (list, tuple)) and len(failed_at) == 2:
            entity = failed_at[1]
            parsed_failed = (str(failed_at[0]), None if entity is None else int(entity))
        id_map = data.get("device_id_map") or {}

        def _records(value: Any) -> list[dict[str, Any]]:
            if isinstance(value, list):
                return [r for r in value if isinstance(r, dict)]
            return []

        def _count(value: Any) -> int:
            if isinstance(value, list):
                return len(value)
            try:
                return int(value or 0)
            except (TypeError, ValueError):
                return 0

        return cls(
            status="success" if data.get("status") == "success" else "failed",
            failed_at=parsed_failed,
            device_id_map={int(k): int(v) for k, v in id_map.items()} if isinstance(id_map, dict) else {},
            restored_devices=_count(data.get("restored_devices")),
            restored_activities=_count(data.get("restored_activities")),
            snapshot_id=snapshot_id,
            restored={
                "devices": _records(data.get("restored_devices")),
                "activities": _records(data.get("restored_activities")),
            },
            erased=bool(erased),
        )

    def to_dict(self) -> dict[str, Any]:
        out = asdict(self)
        out["failed_at"] = list(self.failed_at) if self.failed_at else None
        return out


# ---------------------------------------------------------------------------
# Event stream
# ---------------------------------------------------------------------------
#
# One stream, one shape: every engine listener is folded into a
# ``HubEvent`` with a ``kind`` and a typed ``payload``, so a WebSocket
# relay (or any consumer) handles a single type. ``seq`` is a per-proxy
# monotonic counter: a gap means the consumer's queue overflowed and
# events were dropped (oldest first; see ``AsyncXProxy.events``).

EventKind = Literal[
    "activity_changed",
    "activity_list_updated",
    "hub_state",
    "app_state",
    "status_changed",
    "catalog_ready",
    "snapshot_changed",
    "ota",
]


@dataclass(frozen=True)
class ActivityChanged:
    """The running activity changed (None = powered off / idle)."""

    activity_id: Optional[int]
    previous_activity_id: Optional[int]
    name: Optional[str]


@dataclass(frozen=True)
class ConnectionState:
    """A hub-side (``hub_state``) or app-side (``app_state``) link came up or went down."""

    connected: bool


@dataclass(frozen=True)
class StatusChanged:
    """The proxy's mode flipped (derived from hub and app connection state)."""

    mode: HubMode
    previous_mode: HubMode


@dataclass(frozen=True)
class CatalogReady:
    """The connect-time initial sync completed (True) or the session dropped (False)."""

    ready: bool


@dataclass(frozen=True)
class SnapshotChanged:
    """The snapshot projection moved: a refresh landed, a write was rebased,
    or the cache was imported.

    ``device_ids`` / ``activity_ids`` name the entities the emitting
    operation touched (empty when the whole cache is meant, as after an
    import).
    """

    snapshot_id: str
    engine_generation: int
    device_ids: tuple[int, ...]
    activity_ids: tuple[int, ...]


EventPayload = Optional[
    Union[ActivityChanged, ConnectionState, StatusChanged, CatalogReady, SnapshotChanged]
]


@dataclass(frozen=True)
class HubEvent:
    """One event from :meth:`AsyncXProxy.events`."""

    seq: int
    kind: EventKind
    payload: EventPayload = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "seq": self.seq,
            "kind": self.kind,
            "payload": asdict(self.payload) if self.payload is not None else None,
        }
