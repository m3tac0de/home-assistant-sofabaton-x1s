"""Value types for a managed Wifi Device deployed by a library consumer.

A *managed* Wifi Device is one the consumer created and keeps a record
of: N command slots (each a short and a long press record), optional
power and activity-start hooks, and one callback target every record
points at. The Home Assistant integration expresses the same thing
through its command-config store; this module is the store-free form a
server or a script uses with :meth:`AsyncXProxy.deploy_wifi_device` and
:meth:`AsyncXProxy.update_wifi_device`.

Four rules keep deploy and update in step (callbacks plan, C0a; server
panel wifi commands plan, section 6):

* :func:`snapshot_from_spec` is the ONE normalization. Deploy builds the
  create profile from it, update builds the desired and the deployed
  expansions from it. An unchanged spec therefore plans nothing.
* Every slot is always written, defaults included: shorts at ``1..N``
  and longs at ``N+1..2N`` with ``N`` fixed at :data:`WIFI_SLOT_COUNT`
  (the long-record id law the in-place planner and the remote rely on).
* A slot may say where its command goes: a favorite, a hard button
  (with or without its long press) in a list of activities, and the
  activity whose start performs it. :func:`snapshot_from_spec` derives
  the per-activity references from that exactly as the Home Assistant
  adapter does, so the in-place planner writes them and, by its
  ownership rule, later removes only what an earlier spec put there.
* Everything a slot does not name stays the consumer's: favorites,
  buttons and memberships made with the generic edit intents against
  the device's command ids are never planned away.

Nothing here talks to a hub.
"""

from __future__ import annotations

import ipaddress
from dataclasses import dataclass, field
from typing import Any, Mapping, Optional, Sequence

from .hub_versions import HUB_VERSION_X1
from .protocol_const import BUTTONNAME_BY_CODE, ButtonName
from .wifi_inplace_plan import (
    WIFI_COMMAND_LONG_PRESS_OFFSET,
    WIFI_COMMAND_SLOT_COUNT,
    ManagedWifiSnapshot,
    WifiActivityRefs,
    WifiCommandSlot,
)

__all__ = [
    "DEFAULT_WIFI_BRAND",
    "WIFI_TRANSPORT_HTTP",
    "WIFI_TRANSPORT_MQTT",
    "WIFI_TRANSPORTS",
    "WIFI_SLOT_COUNT",
    "X1_CALLBACK_PORT",
    "WifiSlotSpec",
    "WifiDeviceSpec",
    "WifiTarget",
    "WifiDeployment",
    "snapshot_from_spec",
    "labels_from_spec",
    "command_defs_from_spec",
    "input_slots_from_spec",
    "BINDABLE_BUTTON_CODES",
]

#: Slots per managed device; longs live at ``slot + WIFI_SLOT_COUNT``.
WIFI_SLOT_COUNT = WIFI_COMMAND_SLOT_COUNT
#: Brand written on the device head; consumers may override per spec.
DEFAULT_WIFI_BRAND = "m3tac0de"
#: The X1 Roku replay always calls port 8060 (the head carries no port).
X1_CALLBACK_PORT = 8060
#: How a press leaves the hub. ``http``: every record calls the consumer's
#: listener. ``mqtt`` (X2 only): the records are inert and the hub publishes
#: ``{"device_id", "key_id"}`` to ``<MAC>/up`` on the broker set in the
#: Sofabaton app; the consumer subscribes there. Fixed at deploy.
WIFI_TRANSPORT_HTTP = "http"
WIFI_TRANSPORT_MQTT = "mqtt"
WIFI_TRANSPORTS = (WIFI_TRANSPORT_HTTP, WIFI_TRANSPORT_MQTT)
#: Label width the hub keeps (30 ASCII on X1, 60 UTF-16 bytes elsewhere);
#: the spec caps at the shorter so labels round-trip on every hub.
MAX_SLOT_LABEL_LEN = 30
MAX_DEVICE_NAME_LEN = 30

_LONG_PRESS_OFFSET = WIFI_COMMAND_LONG_PRESS_OFFSET

#: Hard buttons a slot can claim: every named key but the two power macros.
BINDABLE_BUTTON_CODES = frozenset(
    int(code) for code in BUTTONNAME_BY_CODE if int(code) not in (ButtonName.POWER_ON, ButtonName.POWER_OFF)
)


def _clean(text: Any, *, what: str, limit: int) -> str:
    clean = " ".join(str(text or "").split())
    if not clean:
        raise ValueError(f"{what} needs a name")
    if len(clean) > limit:
        raise ValueError(f"{what} {clean!r} is longer than {limit} characters")
    return clean


def _slot_index(value: Any, *, what: str) -> int:
    try:
        index = int(value)
    except (TypeError, ValueError) as err:
        raise ValueError(f"{what} must be a slot number 1..{WIFI_SLOT_COUNT}") from err
    if index < 1 or index > WIFI_SLOT_COUNT:
        raise ValueError(f"{what} {index} is outside 1..{WIFI_SLOT_COUNT}")
    return index


def _entity_id(value: Any, *, what: str) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError) as err:
        raise ValueError(f"{what} must be an activity id") from err
    if number < 1 or number > 0xFF:
        raise ValueError(f"{what} {number} is not an activity id")
    return number


@dataclass(frozen=True)
class WifiSlotSpec:
    """One command slot: its labels and where its command goes.

    ``long_label`` ``None`` means ``"<label> Long"``; the long record always
    exists, a consumer that does not want long presses ignores them.

    ``favorite`` and ``button`` (a hub button code) apply in every activity
    of ``activities``; ``long_press`` also binds the slot's long record to
    that button's long press and means nothing without a button. The
    activity list is only kept while the slot is a favorite or has a
    button, so a list left over from an earlier choice never pulls the
    device into an activity. ``input_activity_id`` makes the command that
    activity's input, performed while the activity starts (X1S/X2 only).
    """

    label: str
    long_label: Optional[str] = None
    favorite: bool = False
    button: Optional[int] = None
    long_press: bool = False
    activities: tuple[int, ...] = ()
    input_activity_id: Optional[int] = None

    def normalized(self, index: int) -> "WifiSlotSpec":
        label = _clean(self.label or f"Button {index}", what=f"slot {index}", limit=MAX_SLOT_LABEL_LEN)
        long_label = self.long_label
        if long_label is None or not str(long_label).strip():
            long_label = f"{label} Long"
        long_label = _clean(long_label, what=f"slot {index} long press", limit=MAX_SLOT_LABEL_LEN)
        button: Optional[int] = None
        if self.button is not None and str(self.button).strip() != "":
            try:
                button = int(self.button)
            except (TypeError, ValueError) as err:
                raise ValueError(f"slot {index}: the button must be a hub button code") from err
            if button not in BINDABLE_BUTTON_CODES:
                raise ValueError(f"slot {index}: {button} is not a bindable button code")
        favorite = bool(self.favorite)
        activities: tuple[int, ...] = ()
        if favorite or button is not None:
            activities = tuple(sorted({_entity_id(a, what=f"slot {index}: an activity") for a in self.activities or ()}))
        input_activity = None
        if self.input_activity_id is not None and str(self.input_activity_id).strip() != "":
            input_activity = _entity_id(self.input_activity_id, what=f"slot {index}: the input activity")
        return WifiSlotSpec(
            label=label,
            long_label=long_label,
            favorite=favorite,
            button=button,
            long_press=bool(self.long_press) and button is not None,
            activities=activities,
            input_activity_id=input_activity,
        )

    @property
    def has_references(self) -> bool:
        return bool(self.favorite or self.button is not None or self.input_activity_id is not None)

    def to_dict(self) -> dict[str, Any]:
        return {
            "label": self.label,
            "long_label": self.long_label,
            "favorite": self.favorite,
            "button": self.button,
            "long_press": self.long_press,
            "activities": list(self.activities),
            "input_activity_id": self.input_activity_id,
        }

    @classmethod
    def from_dict(cls, data: Any) -> "WifiSlotSpec":
        if isinstance(data, str):
            return cls(label=data)
        if not isinstance(data, Mapping):
            raise ValueError("a slot is a label or a {label, long_label, ...} mapping")
        return cls(
            label=str(data.get("label") or ""),
            long_label=data.get("long_label"),
            favorite=bool(data.get("favorite", False)),
            button=data.get("button"),
            long_press=bool(data.get("long_press", False)),
            activities=tuple(data.get("activities") or ()),
            input_activity_id=data.get("input_activity_id"),
        )


@dataclass(frozen=True)
class WifiDeviceSpec:
    """What a consumer asks for. Persist the :meth:`normalized` form.

    ``slots`` may be shorter than :data:`WIFI_SLOT_COUNT`; the rest are
    ``Button n``. ``power_on_slot`` / ``power_off_slot`` are the slots the
    hub fires on an activity's power transitions, ``input_slots`` the
    slots offered as activity-start inputs (both 1-based; X1S/X2 only,
    the X1 firmware fires one power and one input callback per
    transition regardless and these are ignored there). A slot cannot be
    both a power hook and an input, as in the Home Assistant editor.
    """

    name: str
    slots: tuple[WifiSlotSpec, ...] = ()
    power_on_slot: Optional[int] = None
    power_off_slot: Optional[int] = None
    input_slots: tuple[int, ...] = ()
    brand: str = DEFAULT_WIFI_BRAND

    def normalized(self) -> "WifiDeviceSpec":
        """The canonical form: names cleaned, every slot present, hooks checked.

        Idempotent; ``spec.normalized() == spec.normalized().normalized()``.
        Raises ``ValueError`` for anything a hub would refuse or a later
        update could not reproduce.
        """

        name = _clean(self.name, what="a wifi device", limit=MAX_DEVICE_NAME_LEN)
        brand = _clean(self.brand or DEFAULT_WIFI_BRAND, what="the brand", limit=MAX_DEVICE_NAME_LEN)
        raw_slots = list(self.slots or ())
        if len(raw_slots) > WIFI_SLOT_COUNT:
            raise ValueError(f"a wifi device has at most {WIFI_SLOT_COUNT} slots, got {len(raw_slots)}")
        slots: list[WifiSlotSpec] = []
        for index in range(1, WIFI_SLOT_COUNT + 1):
            raw = raw_slots[index - 1] if index - 1 < len(raw_slots) else WifiSlotSpec(label=f"Button {index}")
            if not isinstance(raw, WifiSlotSpec):
                raw = WifiSlotSpec.from_dict(raw)
            slots.append(raw.normalized(index))

        power_on = None if self.power_on_slot is None else _slot_index(self.power_on_slot, what="power_on_slot")
        power_off = None if self.power_off_slot is None else _slot_index(self.power_off_slot, what="power_off_slot")
        inputs: list[int] = []
        for raw_input in self.input_slots or ():
            index = _slot_index(raw_input, what="an input slot")
            if index in inputs:
                raise ValueError(f"input slot {index} is listed twice")
            inputs.append(index)
        claimed_buttons: dict[int, int] = {}
        claimed_inputs: dict[int, int] = {}
        for index, slot in enumerate(slots, start=1):
            if slot.button is not None:
                if slot.button in claimed_buttons:
                    raise ValueError(
                        f"slots {claimed_buttons[slot.button]} and {index} both claim button {slot.button}"
                    )
                claimed_buttons[slot.button] = index
            if slot.input_activity_id is not None:
                if slot.input_activity_id in claimed_inputs:
                    raise ValueError(
                        f"slots {claimed_inputs[slot.input_activity_id]} and {index} are both the input "
                        f"of activity {slot.input_activity_id}"
                    )
                claimed_inputs[slot.input_activity_id] = index
        input_like = set(inputs) | {i for i, slot in enumerate(slots, start=1) if slot.input_activity_id is not None}
        for hook in (power_on, power_off):
            if hook is not None and hook in input_like:
                raise ValueError(f"slot {hook} cannot be both a power hook and an input")
        return WifiDeviceSpec(
            name=name,
            slots=tuple(slots),
            power_on_slot=power_on,
            power_off_slot=power_off,
            input_slots=tuple(inputs),
            brand=brand,
        )

    @property
    def has_references(self) -> bool:
        """True when any slot names a favorite, a button or an input activity."""

        return any(isinstance(slot, WifiSlotSpec) and slot.has_references for slot in self.slots)

    def without_references(self) -> "WifiDeviceSpec":
        """The same device with no slot saying where its command goes: what
        a create writes, before the first update applies the references.
        The input list keeps the slots an input activity put on it."""

        normalized = self.normalized()
        return WifiDeviceSpec(
            name=normalized.name,
            slots=tuple(WifiSlotSpec(label=slot.label, long_label=slot.long_label) for slot in normalized.slots),
            power_on_slot=normalized.power_on_slot,
            power_off_slot=normalized.power_off_slot,
            input_slots=input_slots_from_spec(normalized),
            brand=normalized.brand,
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "slots": [slot.to_dict() for slot in self.slots],
            "power_on_slot": self.power_on_slot,
            "power_off_slot": self.power_off_slot,
            "input_slots": list(self.input_slots),
            "brand": self.brand,
        }

    @classmethod
    def from_dict(cls, data: Mapping[str, Any]) -> "WifiDeviceSpec":
        if not isinstance(data, Mapping):
            raise ValueError("a wifi device spec is a mapping")
        return cls(
            name=str(data.get("name") or ""),
            slots=tuple(WifiSlotSpec.from_dict(row) for row in (data.get("slots") or ())),
            power_on_slot=data.get("power_on_slot"),
            power_off_slot=data.get("power_off_slot"),
            input_slots=tuple(data.get("input_slots") or ()),
            brand=str(data.get("brand") or DEFAULT_WIFI_BRAND),
        )


@dataclass(frozen=True)
class WifiTarget:
    """Where the hub calls back: an IPv4 host, a port, and the hub's action id.

    The records store a packed IPv4 address, so ``host`` must be dotted
    decimal. ``action_id`` is the hub's stable identifier (its MAC) that the
    library puts into every callback path; the facade fills it in from
    the engine, consumers read it back from the deployment.
    """

    host: str
    port: int
    action_id: str = ""

    def __post_init__(self) -> None:
        host = str(self.host or "").strip()
        try:
            ipaddress.IPv4Address(host)
        except (ipaddress.AddressValueError, ValueError) as err:
            raise ValueError(f"callback host {self.host!r} is not a dotted-decimal IPv4 address") from err
        object.__setattr__(self, "host", host)
        port = self.port
        if isinstance(port, bool) or not isinstance(port, int) or not (0 < port < 65536):
            raise ValueError(f"callback port must be 1..65535, got {self.port!r}")
        object.__setattr__(self, "action_id", str(self.action_id or "").strip())

    def to_dict(self) -> dict[str, Any]:
        return {"host": self.host, "port": self.port, "action_id": self.action_id}

    @classmethod
    def from_dict(cls, data: Mapping[str, Any]) -> "WifiTarget":
        if not isinstance(data, Mapping):
            raise ValueError("a wifi target is a mapping")
        return cls(host=str(data.get("host") or ""), port=int(data.get("port") or 0),
                   action_id=str(data.get("action_id") or ""))


@dataclass(frozen=True)
class WifiDeployment:
    """What :meth:`AsyncXProxy.deploy_wifi_device` returns and
    :meth:`AsyncXProxy.update_wifi_device` takes: everything a consumer must
    keep to edit the device later.

    ``labels`` is the ``command_id -> label`` map exactly as written (all
    ``2 * WIFI_SLOT_COUNT`` records); the update's drift gate compares the
    live device against it. ``spec`` is the normalized spec that produced
    them; the planner's ownership rule is scoped by its expansion.

    ``transport`` is how its presses leave the hub. An ``mqtt`` deployment
    has no callback ``target`` (``None``): nothing on the device names an
    address, the hub publishes to its own broker.
    """

    device_id: int
    spec: WifiDeviceSpec
    target: Optional[WifiTarget]
    labels: Mapping[int, str] = field(default_factory=dict)
    hub_version: str = ""
    transport: str = WIFI_TRANSPORT_HTTP

    def __post_init__(self) -> None:
        transport = str(self.transport or WIFI_TRANSPORT_HTTP)
        if transport not in WIFI_TRANSPORTS:
            raise ValueError(f"transport must be one of {WIFI_TRANSPORTS}, got {self.transport!r}")
        object.__setattr__(self, "transport", transport)
        if transport == WIFI_TRANSPORT_HTTP and self.target is None:
            raise ValueError("an http deployment needs its callback target")

    def to_dict(self) -> dict[str, Any]:
        return {
            "device_id": int(self.device_id),
            "spec": self.spec.to_dict(),
            "target": self.target.to_dict() if self.target is not None else None,
            "labels": {str(int(cid)): str(label) for cid, label in sorted(self.labels.items())},
            "hub_version": self.hub_version,
            "transport": self.transport,
        }

    @classmethod
    def from_dict(cls, data: Mapping[str, Any]) -> "WifiDeployment":
        if not isinstance(data, Mapping):
            raise ValueError("a wifi deployment is a mapping")
        labels_raw = data.get("labels") or {}
        if not isinstance(labels_raw, Mapping):
            raise ValueError("deployment labels must be a mapping of command id to label")
        transport = str(data.get("transport") or WIFI_TRANSPORT_HTTP)
        target_raw = data.get("target")
        return cls(
            device_id=int(data.get("device_id") or 0),
            spec=WifiDeviceSpec.from_dict(data.get("spec") or {}).normalized(),
            target=WifiTarget.from_dict(target_raw or {}) if (target_raw or transport == WIFI_TRANSPORT_HTTP) else None,
            labels={int(cid): str(label) for cid, label in labels_raw.items()},
            hub_version=str(data.get("hub_version") or ""),
            transport=transport,
        )


def input_slots_from_spec(spec: WifiDeviceSpec) -> tuple[int, ...]:
    """The device's ordered input list: ``input_slots`` as given, then the
    slots an input activity names that are not on it yet, in slot order.
    An activity selects its input by position in this list, so the order
    is part of what was deployed."""

    inputs = [int(slot) for slot in spec.input_slots or ()]
    for index, slot in enumerate(spec.slots, start=1):
        if isinstance(slot, WifiSlotSpec) and slot.input_activity_id is not None and index not in inputs:
            inputs.append(index)
    return tuple(inputs)


def _hooks(spec: WifiDeviceSpec, hub_version: Optional[str]) -> tuple[Optional[int], Optional[int], tuple[int, ...]]:
    """Power and input hooks as command ids, or none on the X1."""

    if str(hub_version or "") == HUB_VERSION_X1:
        return None, None, ()
    return spec.power_on_slot, spec.power_off_slot, input_slots_from_spec(spec)


def labels_from_spec(spec: WifiDeviceSpec) -> dict[int, str]:
    """The ``command_id -> label`` map a deploy writes (shorts then longs)."""

    normalized = spec.normalized()
    labels: dict[int, str] = {}
    for index, slot in enumerate(normalized.slots, start=1):
        labels[index] = slot.label
        labels[index + _LONG_PRESS_OFFSET] = str(slot.long_label)
    return labels


def snapshot_from_spec(
    spec: WifiDeviceSpec,
    *,
    device_id: int,
    hub_version: Optional[str] = None,
    target_host: Optional[str] = None,
) -> ManagedWifiSnapshot:
    """The planner-side view of ``spec``: desired for an update, deployed
    for the ownership scope, and the source of the create profile.

    The per-activity references come from the slots, derived as the Home
    Assistant adapter derives them (``desired_snapshot_from_config``): a
    favorite and a button binding in each of the slot's activities, the
    input ordinal of an input activity, membership of every activity so
    referenced, and one device-page binding per claimed button (what makes
    the device selectable as a role-group controller). Whatever a slot
    does not name is absent here, so the planner never touches it.
    """

    normalized = spec.normalized()
    power_on, power_off, inputs = _hooks(normalized, hub_version)
    slots: dict[int, WifiCommandSlot] = {}
    for cid, label in labels_from_spec(normalized).items():
        slots[cid] = WifiCommandSlot(
            command_id=cid,
            label=label,
            press_type="long" if cid > _LONG_PRESS_OFFSET else "short",
        )
    favorites: dict[int, dict[int, int]] = {}
    bindings: dict[int, list[tuple[int, int, Optional[int]]]] = {}
    input_ordinal: dict[int, int] = {}
    device_bindings: list[tuple[int, int, Optional[int]]] = []
    for index, slot in enumerate(normalized.slots, start=1):
        if slot.input_activity_id is not None and index in inputs:
            input_ordinal[slot.input_activity_id] = inputs.index(index) + 1
        long_id = index + _LONG_PRESS_OFFSET if slot.long_press else None
        if slot.button is not None:
            device_bindings.append((slot.button, index, long_id))
        for activity_id in slot.activities:
            if slot.favorite:
                favorites.setdefault(activity_id, {})[index] = 0
            if slot.button is not None:
                bindings.setdefault(activity_id, []).append((slot.button, index, long_id))
    referenced = set(favorites) | set(bindings) | set(input_ordinal)
    activities = {
        activity_id: WifiActivityRefs(
            activity_id=activity_id,
            input_ordinal=input_ordinal.get(activity_id, 0),
            favorites=favorites.get(activity_id, {}),
            bindings=tuple(bindings.get(activity_id, ())),
        )
        for activity_id in sorted(referenced)
    }
    return ManagedWifiSnapshot(
        device_id=int(device_id) & 0xFF,
        device_name=normalized.name,
        brand=normalized.brand,
        power_on_command_id=power_on,
        power_off_command_id=power_off,
        input_command_ids=inputs,
        slots=slots,
        activities=activities,
        device_bindings=tuple(sorted(device_bindings)),
        target_host=str(target_host or "") or None,
    )


def command_defs_from_spec(spec: WifiDeviceSpec) -> list[dict[str, Any]]:
    """The ``slots`` rows of the wifi create profile: shorts then longs,
    in the shape the Home Assistant deploy path hands the engine."""

    normalized = spec.normalized()
    defs: list[dict[str, Any]] = []
    for index, slot in enumerate(normalized.slots):
        defs.append({
            "display_name": slot.label,
            "trigger_name": slot.label,
            "press_type": "short",
            "command_index": index,
        })
    for index, slot in enumerate(normalized.slots):
        defs.append({
            "display_name": str(slot.long_label),
            "trigger_name": slot.label,
            "press_type": "long",
            "command_index": index,
        })
    return defs
