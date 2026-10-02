"""Whole-document sync planner (phase 4 plan, H0).

``build_hub_sync_plan(baseline, desired)`` turns the difference between
two snapshot documents (``HubSnapshot.bundle`` and an edited copy of it)
into an ordered list of **items**: the whole-entity intents (hub rename,
create, delete, reorder) and one per-entity sync for every device or
activity whose content changed. Nothing here talks to a hub; the runner
(``AsyncXProxy.sync_hub``, H3) executes the items and re-plans each one
against the working document when its turn comes.

The desired document is **symbolic**: a new device or activity carries a
negative ``device.device_id`` the client chose, and every reference to
it elsewhere in the document uses that same negative id. The per-entity
planners in :mod:`.activity_sync` only understand physical hub ids, so
this module never hands them the symbolic document. For the preview it
assigns **provisional** ids (the lowest free ones) and plans against
those; the runner substitutes the ids the hub assigns at create time.

Stage A validation (plan decision 5) runs here, before anything is
planned, and raises one :class:`DocumentError` subclass per failure
class so a consumer can map them to distinct problem codes:

* :class:`InvalidDocumentError`: shape, ids, names, classes, orders;
* :class:`DanglingReferenceError`: a reference to an entity the document
  removes or never had;
* :class:`EntityNotEditableError`: an edited entity the baseline never
  captured in full (refresh it first);
* :class:`SnapshotIncompleteError`: a device is deleted while some
  activity is incomplete, so "nothing references it" cannot be known;
* :class:`OutOfScopeError`: an entity's own diff is something its
  planner refuses (the per-entity scope guards are unchanged).

Item order (plan section 4): hub rename, device creates, device edits,
activity creates, activity edits, activity deletes, device deletes,
the two display orders. Edits before deletes so a rebinding lands
before anything could cascade; deletes before orders so an order names
exactly the surviving set; creates before edits so references resolve.
"""

from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass, field
import json
from typing import Any, Collection, Iterable, Mapping, Optional, Sequence

from .activity_sync import (
    ACTIVITY_ID_BASE,
    SyncStep,
    build_activity_sync_plan,
    build_device_sync_plan,
)
from .bundle_validation import _validate_name
from .device_class_profiles import supported_create_classes
from .entity_refs import is_entity_ref, iter_entity_references
from .errors import SnapshotIncompleteError

__all__ = [
    "DocumentError",
    "InvalidDocumentError",
    "DanglingReferenceError",
    "EntityNotEditableError",
    "OutOfScopeError",
    "DocumentIncompleteError",
    "EntityRef",
    "HubSyncItem",
    "HubSyncPlan",
    "build_hub_sync_plan",
    "replace_entity_ids",
    "iter_entity_references",
    "PlaceholderMap",
    "UnresolvedPlaceholderError",
]

# Physical id ranges of the hub's shared entity table. Devices 0x01-0x63,
# activities 0x65-0xFF (docs/protocol/data-structures.md); 0x64 is unused.
DEVICE_ID_MIN = 1
DEVICE_ID_MAX = 0x63
ACTIVITY_ID_MIN = ACTIVITY_ID_BASE
ACTIVITY_ID_MAX = 0xFF

# Delay steps in a macro carry this as their device byte; never an entity.

# Keys that are provenance or derived, not configuration. Stripped from
# both documents before anything is compared; the runner and the server
# restore them from the live snapshot.
_ENTITY_PROVENANCE_KEYS = frozenset(
    {"captured_at", "fetched_at", "editable", "complete", "payload_profile", "kind"}
)
_BUNDLE_PROVENANCE_KEYS = frozenset(
    {
        "captured_at",
        "fetched_at",
        "complete",
        "payload_profile",
        "kind",
        "schema_version",
        "snapshot_id",
        "engine_generation",
        "_progress_total_steps",
    }
)
# Fields a create cannot set and the hub decides; on a created entity the
# preview's synthetic baseline copies the rest of the block so the
# per-entity planner sees exactly the editable fields as changes.
_CREATE_EDITABLE_BLOCK_KEYS = ("brand", "ip_address", "idle_behavior")

_MAX_NAME_LENGTH = 64


# -- errors ----------------------------------------------------------------------


class DocumentError(ValueError):
    """Base of every stage A failure. ``code`` is stable; ``entity`` names
    the entity (``("device", id)`` / ``("activity", id)``) when one is."""

    code = "invalid_request"

    def __init__(self, message: str, *, entity: Optional[tuple[str, int]] = None) -> None:
        super().__init__(message)
        self.entity = entity


class InvalidDocumentError(DocumentError):
    code = "invalid_request"


class DanglingReferenceError(DocumentError):
    code = "dangling_reference"

    def __init__(self, message: str, *, entity: tuple[str, int], target: tuple[str, int]) -> None:
        super().__init__(message, entity=entity)
        self.target = target


class EntityNotEditableError(DocumentError, SnapshotIncompleteError):
    code = "entity_not_editable"


class OutOfScopeError(DocumentError):
    code = "out_of_scope"


class DocumentIncompleteError(DocumentError, SnapshotIncompleteError):
    """A device is deleted while activities are incomplete; ``entities``
    lists what to refresh first."""

    code = "snapshot_incomplete"

    def __init__(self, message: str, *, entities: Sequence[tuple[str, int]]) -> None:
        super().__init__(message)
        self.entities = tuple(entities)


# -- value types -------------------------------------------------------------------


@dataclass(frozen=True)
class EntityRef:
    kind: str  # "device" | "activity"
    entity_id: int

    def to_dict(self) -> dict[str, Any]:
        return {"kind": self.kind, "entity_id": self.entity_id}


@dataclass(frozen=True)
class HubSyncItem:
    """One unit of the run. ``entity_id`` is the physical id when the
    document names one, else None with ``placeholder_id`` set (a create,
    or an edit of the entity that create produces). ``steps`` is the
    per-entity plan for ``sync_*`` items; in a preview it was built with
    provisional ids (``provisional=True``) and the runner rebuilds it."""

    index: int
    kind: str  # hub_rename | add_device | sync_device | add_activity | sync_activity
    #            | remove_activity | remove_device | reorder_devices | reorder_activities
    label: str
    entity_kind: Optional[str] = None  # "hub" | "device" | "activity"
    entity_id: Optional[int] = None
    placeholder_id: Optional[int] = None
    steps: tuple[SyncStep, ...] = ()
    payload: Mapping[str, Any] = field(default_factory=dict)
    provisional: bool = False

    @property
    def step_count(self) -> int:
        return len(self.steps)

    def to_dict(self) -> dict[str, Any]:
        return {
            "index": self.index,
            "kind": self.kind,
            "label": self.label,
            "entity_kind": self.entity_kind,
            "entity_id": self.entity_id,
            "placeholder_id": self.placeholder_id,
            "step_count": self.step_count,
            "steps": [
                {"kind": s.kind, "label": s.label, "target_device_id": s.target_device_id}
                for s in self.steps
            ],
            "payload": dict(self.payload),
            "provisional": self.provisional,
        }


@dataclass(frozen=True)
class HubSyncPlan:
    """What a document write would do, in order, plus what stage B must
    re-read before the first write (``live_check``) and the notes a client
    may want to confirm. Nothing is written by building one."""

    items: tuple[HubSyncItem, ...]
    notes: tuple[str, ...]
    live_check: tuple[EntityRef, ...]
    provisional_ids: Mapping[int, int]

    @property
    def is_empty(self) -> bool:
        return not self.items

    @property
    def step_count(self) -> int:
        return sum(item.step_count for item in self.items)

    def to_dict(self) -> dict[str, Any]:
        return {
            "items": [item.to_dict() for item in self.items],
            "item_count": len(self.items),
            "step_count": self.step_count,
            "notes": list(self.notes),
            "live_check": [ref.to_dict() for ref in self.live_check],
            "live_check_count": len(self.live_check),
            "provisional_ids": {str(k): v for k, v in self.provisional_ids.items()},
        }


# -- document accessors ---------------------------------------------------------------


def _int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _canonical(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), default=str)


def _entity_id(row: Mapping[str, Any]) -> Optional[int]:
    block = row.get("device")
    if not isinstance(block, Mapping) or "device_id" not in block:
        return None
    raw = block.get("device_id")
    if isinstance(raw, bool) or not isinstance(raw, int):
        return None
    return raw


def _rows(document: Mapping[str, Any], kind: str) -> list[Any]:
    rows = document.get("devices" if kind == "device" else "activities")
    return list(rows) if isinstance(rows, list) else []


def _by_id(document: Mapping[str, Any], kind: str) -> dict[int, dict[str, Any]]:
    out: dict[int, dict[str, Any]] = {}
    for row in _rows(document, kind):
        if isinstance(row, Mapping):
            entity_id = _entity_id(row)
            if entity_id is not None:
                out[entity_id] = dict(row)
    return out


def _strip_entity(row: Mapping[str, Any]) -> dict[str, Any]:
    """The row without provenance and without the output-only ``sort``
    (array order is the display order; a stale ``sort`` must not read as
    a device-block change)."""

    out = {k: deepcopy(v) for k, v in row.items() if k not in _ENTITY_PROVENANCE_KEYS}
    block = out.get("device")
    if isinstance(block, Mapping):
        block = dict(block)
        block.pop("sort", None)
        out["device"] = block
    return out


def _normalize(document: Mapping[str, Any]) -> dict[str, Any]:
    out = {k: deepcopy(v) for k, v in document.items() if k not in _BUNDLE_PROVENANCE_KEYS}
    out["hub"] = dict(document.get("hub") or {})
    out["devices"] = [_strip_entity(r) for r in _rows(document, "device") if isinstance(r, Mapping)]
    out["activities"] = [_strip_entity(r) for r in _rows(document, "activity") if isinstance(r, Mapping)]
    return out


def _name_of(row: Mapping[str, Any]) -> str:
    block = row.get("device") or {}
    return str(block.get("name") or "").strip()


def _clean_name(
    value: Any,
    what: str,
    entity: Optional[tuple[str, int]],
    *,
    model: Optional[str] = None,
    grandfathered: Collection[str] = (),
) -> str:
    """The name, stripped; raises when the hub could not store it as given.

    Device and activity names follow the editor's rule (``bundle_validation``):
    the slot holds 30 UTF-16 code units, and the X1 only plain ASCII letters,
    digits and spaces. The hub would otherwise truncate or drop characters
    silently, and re-applying the document would plan the rename forever.
    A name the baseline already carries is hub truth and passes.
    """

    name = str(value or "").strip()
    if not name:
        raise InvalidDocumentError(f"{what} needs a name", entity=entity)
    if entity is None or model is None:
        if len(name) > _MAX_NAME_LENGTH:
            raise InvalidDocumentError(f"{what} name is longer than {_MAX_NAME_LENGTH} characters", entity=entity)
        return name
    try:
        _validate_name(name, f"{what} name", model, grandfathered=grandfathered)
    except ValueError as err:
        raise InvalidDocumentError(str(err), entity=entity) from err
    return name


# -- references (the shared walker, plan H1 lifts restore onto it) ------------------------


_is_ref = is_entity_ref


def replace_entity_ids(document: Mapping[str, Any], mapping: Mapping[int, int]) -> dict[str, Any]:
    """A copy of ``document`` with every entity id in ``mapping`` replaced:
    the rows' own ``device.device_id`` and every reference site
    :func:`iter_entity_references` walks. Ids not in ``mapping`` are left
    as they are. The order of the ``devices[]`` / ``activities[]`` arrays
    is kept."""

    if not mapping:
        return deepcopy(dict(document))

    def _map_key(obj: dict, key: str) -> None:
        # Only a present, mapped reference changes; a site the row does not
        # carry (a device-level binding has no device_id) is never added.
        # Adding ``device_id: None`` there made every untouched device look
        # edited (bench_230 X1S, 2026-09-12: fourteen binding writes planned
        # on a device the document had not changed).
        if key not in obj:
            return
        value = obj[key]
        if _is_ref(value) and int(value) in mapping:
            obj[key] = mapping[int(value)]

    out = deepcopy(dict(document))
    for key in ("devices", "activities"):
        rows = out.get(key)
        if not isinstance(rows, list):
            continue
        for row in rows:
            if not isinstance(row, dict):
                continue
            block = row.get("device")
            if isinstance(block, dict):
                _map_key(block, "device_id")
            for fav in row.get("favorite_slots") or []:
                if isinstance(fav, dict):
                    _map_key(fav, "device_id")
            for binding in row.get("button_bindings") or []:
                if isinstance(binding, dict):
                    _map_key(binding, "device_id")
                    _map_key(binding, "long_press_device_id")
            for macro in row.get("macros") or []:
                if not isinstance(macro, dict):
                    continue
                for step in macro.get("steps") or []:
                    if isinstance(step, dict):
                        _map_key(step, "device_id")
            refs = row.get("referenced_source_device_ids")
            if isinstance(refs, list):
                row["referenced_source_device_ids"] = [
                    mapping[int(v)] if _is_ref(v) and int(v) in mapping else v for v in refs
                ]
    return out


class UnresolvedPlaceholderError(LookupError):
    """A document still references placeholders the map has not assigned.
    ``placeholders`` lists them. Raised by :meth:`PlaceholderMap.resolve`;
    in a run it is a programming error (the item order guarantees every
    create precedes the references to it)."""

    def __init__(self, placeholders: Sequence[int]) -> None:
        self.placeholders = tuple(sorted(placeholders))
        listed = ", ".join(str(p) for p in self.placeholders)
        super().__init__(f"placeholder id(s) not yet created: {listed}")


class PlaceholderMap:
    """The symbolic-to-physical id map of one run (plan decision 4).

    Built from the desired document's negative ids; ``assign`` records
    the hub's id as each create returns; ``resolve`` physicalises a
    document (every own id and every reference site) and refuses when
    a placeholder it needs is still unassigned, unless ``partial=True``
    leaves those in place (the preview and a mid-run working copy).
    """

    def __init__(self, placeholders: Iterable[int] = ()) -> None:
        self._physical: dict[int, Optional[int]] = {}
        for placeholder in placeholders:
            self.add(placeholder)

    @classmethod
    def from_document(cls, document: Mapping[str, Any]) -> "PlaceholderMap":
        """Every negative own id in ``devices[]`` / ``activities[]``."""

        out = cls()
        for kind in ("device", "activity"):
            for row in _rows(document, kind):
                if isinstance(row, Mapping):
                    entity_id = _entity_id(row)
                    if entity_id is not None and entity_id < 0:
                        out.add(entity_id)
        return out

    def add(self, placeholder: int) -> None:
        if not isinstance(placeholder, int) or isinstance(placeholder, bool) or placeholder >= 0:
            raise ValueError(f"a placeholder id is a negative integer, not {placeholder!r}")
        if placeholder in self._physical:
            raise ValueError(f"placeholder {placeholder} is already in the map")
        self._physical[placeholder] = None

    def assign(self, placeholder: int, physical: int) -> None:
        if placeholder not in self._physical:
            raise KeyError(f"unknown placeholder {placeholder}")
        if self._physical[placeholder] is not None:
            raise ValueError(f"placeholder {placeholder} is already assigned to {self._physical[placeholder]}")
        physical = int(physical)
        if physical <= 0:
            raise ValueError(f"a physical id is positive, not {physical}")
        self._physical[placeholder] = physical

    def physical(self, placeholder: int) -> Optional[int]:
        return self._physical.get(placeholder)

    @property
    def placeholders(self) -> tuple[int, ...]:
        return tuple(self._physical)

    @property
    def assigned(self) -> dict[int, int]:
        return {p: v for p, v in self._physical.items() if v is not None}

    @property
    def unassigned(self) -> tuple[int, ...]:
        return tuple(p for p, v in self._physical.items() if v is None)

    def to_dict(self) -> dict[str, Optional[int]]:
        return {str(p): v for p, v in self._physical.items()}

    @classmethod
    def from_dict(cls, data: Mapping[str, Any]) -> "PlaceholderMap":
        out = cls()
        for key, value in data.items():
            out.add(int(key))
            if value is not None:
                out.assign(int(key), int(value))
        return out

    def needed_by(self, document: Mapping[str, Any]) -> tuple[int, ...]:
        """Placeholders ``document`` carries (own ids and references)."""

        needed: set[int] = set()
        for kind in ("device", "activity"):
            for row in _rows(document, kind):
                if isinstance(row, Mapping):
                    entity_id = _entity_id(row)
                    if entity_id is not None and entity_id < 0:
                        needed.add(entity_id)
        for _referrer, _site, target in iter_entity_references(document):
            if target < 0:
                needed.add(target)
        return tuple(sorted(needed))

    def resolve(self, document: Mapping[str, Any], *, partial: bool = False) -> dict[str, Any]:
        """``document`` with every assigned placeholder replaced."""

        if not partial:
            missing = [p for p in self.needed_by(document) if self._physical.get(p) is None]
            if missing:
                raise UnresolvedPlaceholderError(missing)
        return replace_entity_ids(document, self.assigned)


# -- classification ---------------------------------------------------------------------


@dataclass
class _Diff:
    baseline: dict[str, Any]
    desired: dict[str, Any]
    base_devices: dict[int, dict[str, Any]]
    base_activities: dict[int, dict[str, Any]]
    want_devices: dict[int, dict[str, Any]]
    want_activities: dict[int, dict[str, Any]]
    raw_devices: dict[int, dict[str, Any]]  # baseline rows with provenance, for editability
    raw_activities: dict[int, dict[str, Any]]
    created_devices: list[int] = field(default_factory=list)  # placeholders, document order
    created_activities: list[int] = field(default_factory=list)
    edited_devices: list[int] = field(default_factory=list)  # physical, document order
    edited_activities: list[int] = field(default_factory=list)
    removed_devices: list[int] = field(default_factory=list)  # physical, baseline order
    removed_activities: list[int] = field(default_factory=list)
    hub_rename: Optional[str] = None
    device_order: Optional[list[int]] = None  # symbolic, when it differs
    activity_order: Optional[list[int]] = None


def _classify(baseline: Mapping[str, Any], desired: Mapping[str, Any]) -> _Diff:
    base = _normalize(baseline)
    want = _normalize(desired)
    diff = _Diff(
        baseline=base,
        desired=want,
        base_devices=_by_id(base, "device"),
        base_activities=_by_id(base, "activity"),
        want_devices={},
        want_activities={},
        raw_devices=_by_id(baseline, "device"),
        raw_activities=_by_id(baseline, "activity"),
    )

    for kind in ("device", "activity"):
        lo, hi = (DEVICE_ID_MIN, DEVICE_ID_MAX) if kind == "device" else (ACTIVITY_ID_MIN, ACTIVITY_ID_MAX)
        existing = diff.base_devices if kind == "device" else diff.base_activities
        wanted = diff.want_devices if kind == "device" else diff.want_activities
        created = diff.created_devices if kind == "device" else diff.created_activities
        edited = diff.edited_devices if kind == "device" else diff.edited_activities
        seen: set[int] = set()
        for row in _rows(want, kind):
            entity_id = _entity_id(row)
            if entity_id is None:
                raise InvalidDocumentError(f"a {kind} row has no integer device.device_id")
            if entity_id in seen:
                raise InvalidDocumentError(f"{kind} id {entity_id} appears twice", entity=(kind, entity_id))
            seen.add(entity_id)
            wanted[entity_id] = row
            if entity_id < 0:
                created.append(entity_id)
                continue
            if entity_id not in existing:
                hint = "new entities use a negative placeholder id"
                if lo <= entity_id <= hi:
                    raise InvalidDocumentError(
                        f"{kind} {entity_id} is not in the baseline; {hint}", entity=(kind, entity_id)
                    )
                raise InvalidDocumentError(
                    f"{kind} id {entity_id} is outside the {kind} range {lo}..{hi}", entity=(kind, entity_id)
                )
            if _canonical(existing[entity_id]) != _canonical(row):
                edited.append(entity_id)
        removed = diff.removed_devices if kind == "device" else diff.removed_activities
        removed.extend(eid for eid in existing if eid not in seen)

    placeholders = diff.created_devices + diff.created_activities
    if len(set(placeholders)) != len(placeholders):
        dup = next(p for p in placeholders if placeholders.count(p) > 1)
        raise InvalidDocumentError(f"placeholder id {dup} is used by more than one new entity")

    base_name = str((base.get("hub") or {}).get("name") or "").strip()
    want_hub = want.get("hub") or {}
    if "name" in want_hub:
        want_name = _clean_name(want_hub.get("name"), "the hub", None)
        if want_name != base_name:
            diff.hub_rename = want_name

    for kind in ("device", "activity"):
        existing = diff.base_devices if kind == "device" else diff.base_activities
        wanted = diff.want_devices if kind == "device" else diff.want_activities
        surviving_base = [eid for eid in existing if eid in wanted]
        desired_order = list(wanted)  # symbolic: placeholders included
        # Where the hub places a created entity is the hub's business (the
        # X1S puts a new device first and a new activity last, bench_230
        # 2026-09-12), so with a create the order item is always emitted
        # and the runner writes it only when the live display order, read
        # back after the creates, differs from the desired one.
        if desired_order != surviving_base or any(eid < 0 for eid in desired_order):
            if kind == "device":
                diff.device_order = desired_order
            else:
                diff.activity_order = desired_order
    return diff


# -- stage A validation ---------------------------------------------------------------------


def _validate(diff: _Diff, hub_version: Optional[str]) -> None:
    allowed = supported_create_classes(hub_version) if hub_version else ()
    baseline_names = {
        _name_of(row)
        for key in ("devices", "activities")
        for row in (diff.baseline.get(key) or [])
        if isinstance(row, Mapping)
    }
    names = {"model": hub_version, "grandfathered": baseline_names}
    for placeholder in diff.created_devices:
        row = diff.want_devices[placeholder]
        entity = ("device", placeholder)
        _clean_name(_name_of(row), "a new device", entity, **names)
        device_class = str((row.get("device") or {}).get("device_class") or "").strip()
        if not device_class:
            raise InvalidDocumentError("a new device needs device.device_class", entity=entity)
        if allowed and device_class not in allowed:
            raise InvalidDocumentError(
                f"device class {device_class!r} cannot be created on a {hub_version}; one of: {', '.join(allowed)}",
                entity=entity,
            )
        for command in row.get("commands") or []:
            if not isinstance(command, Mapping):
                raise InvalidDocumentError("a command row must be an object", entity=entity)
            if _int(command.get("command_id"), 0) < 1:
                raise InvalidDocumentError("a command needs a command_id of 1 or more", entity=entity)
    for placeholder in diff.created_activities:
        _clean_name(_name_of(diff.want_activities[placeholder]), "a new activity", ("activity", placeholder), **names)

    for eid in diff.edited_devices:
        _clean_name(_name_of(diff.want_devices[eid]), "a device", ("device", eid), **names)
    for eid in diff.edited_activities:
        _clean_name(_name_of(diff.want_activities[eid]), "an activity", ("activity", eid), **names)

    # References: every target must be an entity the document keeps or creates.
    device_ids = set(diff.want_devices)
    activity_ids = set(diff.want_activities)
    written = {("activity", eid) for eid in (*diff.created_activities, *diff.edited_activities)}
    for referrer, site, target in iter_entity_references(diff.desired):
        if referrer[1] == target:
            continue  # an activity's own macro ids ride its own id
        if tuple(referrer) in written and (target >= ACTIVITY_ID_BASE or target in activity_ids):
            # One activity never starts or binds another (L-B25). Rows the
            # document leaves alone pass: they are not written.
            raise InvalidDocumentError(
                f"{referrer[0]} {referrer[1]} references activity {target} ({site}); "
                "an activity cannot reference another activity",
                entity=referrer,
            )
        if target in device_ids or target in activity_ids:
            continue
        if target < 0:
            # Every placeholder the document creates is in the sets above, so
            # this one names nothing. A reference targets a device (macro
            # steps into activities are not a product feature, L-B25).
            raise DanglingReferenceError(
                f"{referrer[0]} {referrer[1]} references placeholder {target} ({site}), which no new entity carries",
                entity=referrer, target=("device", target),
            )
        kind = "activity" if target >= ACTIVITY_ID_BASE else "device"
        removed = diff.removed_activities if kind == "activity" else diff.removed_devices
        if target in removed:
            raise DanglingReferenceError(
                f"{referrer[0]} {referrer[1]} still references {kind} {target} ({site}), which the document removes",
                entity=referrer, target=(kind, target),
            )
        raise DanglingReferenceError(
            f"{referrer[0]} {referrer[1]} references {kind} {target} ({site}), which is not in the document",
            entity=referrer, target=(kind, target),
        )

    # Editability: an edited entity must have been captured in full.
    for kind, edited in (
        ("device", diff.edited_devices),
        ("activity", diff.edited_activities),
    ):
        for eid in edited:
            raw = _original_row(diff, kind, eid)
            if not bool(raw.get("editable", raw.get("complete"))):
                raise EntityNotEditableError(
                    f"{kind} {eid} was never read in full; refresh it before editing", entity=(kind, eid)
                )

    # Deleting a device needs every activity complete: a reference could sit anywhere.
    if diff.removed_devices:
        incomplete = [
            ("activity", eid)
            for eid in diff.base_activities
            if not bool(_original_row(diff, "activity", eid).get("complete"))
        ]
        if incomplete:
            listed = ", ".join(str(eid) for _, eid in incomplete)
            raise DocumentIncompleteError(
                f"deleting a device needs every activity read in full; refresh activities {listed} first",
                entities=incomplete,
            )


def _original_row(diff: _Diff, kind: str, entity_id: int) -> Mapping[str, Any]:
    rows = diff.raw_devices if kind == "device" else diff.raw_activities
    return rows.get(entity_id, {})


# -- provisional ids and synthetic baselines ------------------------------------------------


def _provisional_ids(diff: _Diff) -> dict[int, int]:
    out: dict[int, int] = {}
    for kind, created, existing, lo, hi in (
        ("device", diff.created_devices, diff.base_devices, DEVICE_ID_MIN, DEVICE_ID_MAX),
        ("activity", diff.created_activities, diff.base_activities, ACTIVITY_ID_MIN, ACTIVITY_ID_MAX),
    ):
        used = set(existing)
        candidate = lo
        for placeholder in created:
            while candidate in used:
                candidate += 1
            if candidate > hi:
                raise InvalidDocumentError(f"no free {kind} id left on the hub", entity=(kind, placeholder))
            out[placeholder] = candidate
            used.add(candidate)
    return out


def synthetic_created_entity(kind: str, desired_row: Mapping[str, Any]) -> dict[str, Any]:
    """The baseline a freshly created entity presents to its planner: the
    desired ``device`` block minus the fields a create cannot set (they
    become steps), every table empty. What ``add_device`` / ``add_activity``
    then a rebase would yield, minus the hub's own derived fields."""

    block = dict(desired_row.get("device") or {})
    for key in _CREATE_EDITABLE_BLOCK_KEYS:
        block.pop(key, None)
    if kind == "device":
        return {
            "device": block,
            "commands": [],
            "key_sort": None,
            "input_record": None,
            "button_bindings": [],
            "macros": [],
        }
    return {
        "device": block,
        "button_bindings": [],
        "favorite_slots": [],
        "favorites_order": [],
        "macros": [],
        "referenced_source_device_ids": [],
    }


def _flag_new_commands(row: dict[str, Any]) -> dict[str, Any]:
    """Every command on a created device is an addition; carry the marker
    the device planner requires so the client need not know it."""

    commands = row.get("commands")
    if not isinstance(commands, list):
        return row
    for command in commands:
        if isinstance(command, dict):
            restore_data = command.get("restore_data")
            if not isinstance(restore_data, dict):
                restore_data = {}
                command["restore_data"] = restore_data
            restore_data["new"] = True
    return row


def _splice(document: dict[str, Any], kind: str, entity_id: int, row: Mapping[str, Any]) -> dict[str, Any]:
    out = deepcopy(document)
    key = "devices" if kind == "device" else "activities"
    rows = out.setdefault(key, [])
    for index, existing in enumerate(rows):
        if isinstance(existing, Mapping) and _entity_id(existing) == entity_id:
            rows[index] = deepcopy(dict(row))
            return out
    rows.append(deepcopy(dict(row)))
    return out


# -- the plan -------------------------------------------------------------------------------


def build_hub_sync_plan(
    baseline: Mapping[str, Any],
    desired: Mapping[str, Any],
    *,
    hub_version: Optional[str] = None,
) -> HubSyncPlan:
    """Stage A validation and the ordered item list for ``baseline`` ->
    ``desired``. Raises a :class:`DocumentError` subclass; never writes.
    Validates structure and supported diffs, not every command's stored
    wire encoding or whether the hub will accept a write.

    ``hub_version`` defaults to ``baseline["hub"]["version"]`` and gates
    the classes a new device may have; without one any class passes here
    and the runner's ``add_device`` checks it.
    """

    if not isinstance(baseline, Mapping) or not isinstance(desired, Mapping):
        raise InvalidDocumentError("both documents must be objects")
    if not isinstance(desired.get("devices", []), list) or not isinstance(desired.get("activities", []), list):
        raise InvalidDocumentError("devices and activities must be arrays")
    version = hub_version or str((baseline.get("hub") or {}).get("version") or "") or None

    diff = _classify(baseline, desired)
    _validate(diff, version)

    provisional = _provisional_ids(diff)
    physical_desired = replace_entity_ids(diff.desired, provisional)
    want_devices = _by_id(physical_desired, "device")
    want_activities = _by_id(physical_desired, "activity")

    # The working document of the preview: the baseline plus a synthetic
    # empty row per created entity, advanced after every planned item the
    # way the runner's working document is rebased after every write.
    working = deepcopy(diff.baseline)
    for placeholder in diff.created_devices:
        working = _splice(working, "device", provisional[placeholder],
                          synthetic_created_entity("device", want_devices[provisional[placeholder]]))
    for placeholder in diff.created_activities:
        working = _splice(working, "activity", provisional[placeholder],
                          synthetic_created_entity("activity", want_activities[provisional[placeholder]]))

    items: list[HubSyncItem] = []
    notes: list[str] = []

    def _add(**kwargs: Any) -> None:
        items.append(HubSyncItem(index=len(items), **kwargs))

    if diff.hub_rename is not None:
        _add(kind="hub_rename", label=f"Renaming the hub to {diff.hub_rename!r}…", entity_kind="hub",
             payload={"name": diff.hub_rename})

    for placeholder in diff.created_devices:
        row = want_devices[provisional[placeholder]]
        block = row.get("device") or {}
        _add(kind="add_device", label=f"Creating device {_name_of(row)!r}…", entity_kind="device",
             placeholder_id=placeholder, provisional=True,
             payload={"name": _name_of(row), "device_class": block.get("device_class")})

    def _sync(kind: str, physical_id: int, placeholder: Optional[int]) -> None:
        nonlocal working
        wanted = want_devices if kind == "device" else want_activities
        row = deepcopy(wanted[physical_id])
        if placeholder is not None and kind == "device":
            row = _flag_new_commands(row)
        edited = _splice(working, kind, physical_id, row)
        build = build_device_sync_plan if kind == "device" else build_activity_sync_plan
        try:
            # Every step the entity sync will run, the trailing "remote_sync"
            # included: that one is the favorites-mapping read that settles
            # the cache, not the physical remote trigger (the batch context
            # coalesces those; see write_batch.py).
            steps = list(build(working, edited, physical_id))
        except ValueError as err:
            entity = (kind, placeholder if placeholder is not None else physical_id)
            raise OutOfScopeError(f"{kind} {entity[1]}: {err}", entity=entity) from err
        _notes_for(kind, working, edited, physical_id, placeholder, notes)
        working = edited
        if not steps:
            return
        label = f"Writing {kind} {_name_of(row)!r}…"
        _add(kind=f"sync_{kind}", label=label, entity_kind=kind,
             entity_id=None if placeholder is not None else physical_id,
             placeholder_id=placeholder, steps=tuple(steps),
             provisional=bool(provisional),
             payload={"entity_id": physical_id})

    for eid in diff.edited_devices:
        _sync("device", eid, None)
    for placeholder in diff.created_devices:
        _sync("device", provisional[placeholder], placeholder)

    for placeholder in diff.created_activities:
        row = want_activities[provisional[placeholder]]
        _add(kind="add_activity", label=f"Creating activity {_name_of(row)!r}…", entity_kind="activity",
             placeholder_id=placeholder, provisional=True, payload={"name": _name_of(row)})

    for eid in diff.edited_activities:
        _sync("activity", eid, None)
    for placeholder in diff.created_activities:
        _sync("activity", provisional[placeholder], placeholder)

    for eid in diff.removed_activities:
        name = _name_of(diff.base_activities[eid])
        notes.append(f"activity {eid} ({name!r}) will be deleted")
        _add(kind="remove_activity", label=f"Deleting activity {name!r}…", entity_kind="activity",
             entity_id=eid, payload={"entity_id": eid})
    for eid in diff.removed_devices:
        name = _name_of(diff.base_devices[eid])
        notes.append(f"device {eid} ({name!r}) will be deleted")
        _add(kind="remove_device", label=f"Deleting device {name!r}…", entity_kind="device",
             entity_id=eid, payload={"entity_id": eid})

    if diff.device_order is not None:
        _add(kind="reorder_devices", label="Storing the device order…", entity_kind="device",
             provisional=any(eid < 0 for eid in diff.device_order),
             payload={"order": list(diff.device_order)})
    if diff.activity_order is not None:
        _add(kind="reorder_activities", label="Storing the activity order…", entity_kind="activity",
             provisional=any(eid < 0 for eid in diff.activity_order),
             payload={"order": list(diff.activity_order)})

    live_check: list[EntityRef] = [EntityRef("device", eid) for eid in diff.edited_devices]
    live_check += [EntityRef("activity", eid) for eid in diff.edited_activities]
    if diff.removed_devices:
        # Every surviving activity could still reference the device; the
        # ones the document deletes go first and take their references with them.
        seen = {ref.entity_id for ref in live_check if ref.kind == "activity"}
        live_check += [
            EntityRef("activity", eid)
            for eid in diff.base_activities
            if eid not in seen and eid not in diff.removed_activities
        ]

    return HubSyncPlan(
        items=tuple(items),
        notes=tuple(notes),
        live_check=tuple(live_check),
        provisional_ids=dict(provisional),
    )


def _notes_for(
    kind: str,
    before: Mapping[str, Any],
    after: Mapping[str, Any],
    physical_id: int,
    placeholder: Optional[int],
    notes: list[str],
) -> None:
    shown = placeholder if placeholder is not None else physical_id
    if kind == "device":
        old = {_int(c.get("command_id")): c for c in (_by_id(before, "device").get(physical_id) or {}).get("commands") or []
               if isinstance(c, Mapping)}
        for command in (_by_id(after, "device").get(physical_id) or {}).get("commands") or []:
            if not isinstance(command, Mapping):
                continue
            cid = _int(command.get("command_id"))
            restore_data = command.get("restore_data")
            if cid in old and isinstance(restore_data, Mapping) and (
                restore_data.get("edited") or (isinstance(restore_data.get("decoded"), Mapping)
                                               and restore_data["decoded"].get("edited"))
            ):
                notes.append(f"device {shown}: the payload of command {cid} will be overwritten")
        return
    old_row = _by_id(before, "activity").get(physical_id) or {}
    new_row = _by_id(after, "activity").get(physical_id) or {}
    if placeholder is None and _members(old_row) != _members(new_row):
        notes.append(f"activity {shown}: its member devices change")


def _members(activity: Mapping[str, Any]) -> set[int]:
    self_id = _entity_id(activity)
    out: set[int] = set()
    # The direct references only, as activity_sync counts members: the
    # derived referenced_source mirror alone never makes a member step.
    for referrer, _site, target in iter_entity_references(
        {"activities": [activity]}, exclude_sites=("referenced_source",)
    ):
        if referrer[1] == self_id and 0 < target < ACTIVITY_ID_BASE:
            out.add(target)
    return out
