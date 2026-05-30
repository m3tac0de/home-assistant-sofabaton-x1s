from __future__ import annotations

import time
from collections import defaultdict, deque
from typing import Any, Callable, Deque, Dict, Literal, Mapping, Optional

from ..const import HUB_VERSION_X1, HUB_VERSION_X1S, HUB_VERSION_X2
from .commands import (
    COMMAND_RECORD_STRIDE_X1,
    COMMAND_RECORD_STRIDE_X1S_X2,
    KEYMAP_RECORD_SIZE,
    iter_command_records_from_assembled,
    iter_keymap_records,
)
from .protocol_const import (
    BUTTONNAME_BY_CODE,
    DEVICE_CLASS_WIFI_IP,
    classify_device_class_code,
    normalize_device_class,
)


def normalize_device_entry(
    device: dict[str, Any] | None,
    *,
    default_class: str | None = None,
    default_class_code: int | None = None,
) -> dict[str, Any]:
    """Return a cache-safe device row with normalized type metadata."""

    source = dict(device) if isinstance(device, dict) else {}

    brand = str(source.get("brand") or source.get("brand_name") or "").strip()
    name = str(source.get("name") or source.get("device_name") or source.get("label") or "").strip()
    device_class = normalize_device_class(
        source.get("device_class", source.get("device_type"))
    )

    raw_class_code = source.get("device_class_code", source.get("device_type_code"))
    try:
        device_class_code = int(raw_class_code) & 0xFF
    except (TypeError, ValueError):
        device_class_code = None

    if device_class_code is None and default_class_code is not None:
        device_class_code = int(default_class_code) & 0xFF

    if device_class is None and default_class is not None:
        device_class = normalize_device_class(default_class)

    if device_class is None and device_class_code is not None:
        device_class = classify_device_class_code(device_class_code)

    if brand:
        source["brand"] = brand
    else:
        source.pop("brand", None)

    if name:
        source["name"] = name
    else:
        source.pop("name", None)

    if device_class is not None:
        source["device_class"] = device_class
    else:
        source.pop("device_class", None)

    if device_class_code is not None:
        source["device_class_code"] = device_class_code
    else:
        source.pop("device_class_code", None)

    # Strip the temporary field names so exported cache only emits the new schema.
    source.pop("device_type", None)
    source.pop("device_type_code", None)

    return source

class ActivityCache:
    def __init__(self) -> None:
        self.current_activity: Optional[int] = None
        self.current_activity_hint: Optional[int] = None
        self.activities: Dict[int, Dict[str, Any]] = {}
        self.devices: Dict[int, Dict[str, Any]] = {}
        self.buttons: Dict[int, set[int]] = {}
        # Per-button mapping details: act_lo → {button_id → {device_id, command_id, long_press_device_id?, long_press_command_id?}}
        self.button_details: Dict[int, Dict[int, Dict[str, int]]] = defaultdict(dict)
        self.commands: dict[int, dict[int, str]] = defaultdict(dict)
        # Per-command record metadata captured at REQ_COMMANDS parse
        # time. Keyed dev_id -> command_id -> {"library_type": int,
        # "button_code": int}. ``library_type`` is the codec selector
        # the hub stored alongside the command (0x0D for IR-DB, others
        # for BT/RF/learned). ``button_code`` is the 48-bit canonical
        # command identifier the hub uses when keymap entries or macro
        # steps reference this command. Both are needed for a faithful
        # restore. Backed by the bytes ``CommandRecord.control[0]`` and
        # ``CommandRecord.control[1:7]`` respectively.
        self.command_metadata: dict[int, dict[int, dict[str, int]]] = defaultdict(dict)
        self.ip_devices: Dict[int, Dict[str, Any]] = {}
        self.ip_buttons: Dict[int, Dict[int, Dict[str, Any]]] = defaultdict(dict)
        self.activity_command_refs: dict[int, set[tuple[int, int]]] = defaultdict(set)
        self.activity_favorite_slots: dict[int, list[dict[str, int]]] = defaultdict(list)
        self.activity_keybinding_slots: dict[int, list[dict[str, int]]] = defaultdict(list)
        self.activity_members: dict[int, set[int]] = defaultdict(set)
        # Favorites ordering: maps act_lo → list of (fav_id, slot) pairs in hub order
        # Populated by OP_FAV_ORDER_RESP (family 0x63) response to OP_FAV_ORDER_REQ (0x0162)
        self.activity_favorites_order: dict[int, list[tuple[int, int]]] = {}
        self.device_key_sorts: dict[int, dict[str, Any]] = {}
        self.activity_favorite_labels: dict[int, dict[tuple[int, int], str]] = defaultdict(dict)
        self.activity_keybinding_labels: dict[int, dict[tuple[int, int], str]] = defaultdict(dict)
        self.activity_macros: dict[int, list[dict[str, int | str]]] = defaultdict(list)
        # Only track the most recent activation to avoid unbounded growth
        self.app_activations: Deque[dict[str, Any]] = deque(maxlen=1)

    def entities(
        self, kind: Literal["device", "activity"]
    ) -> Mapping[int, Dict[str, Any]]:
        """Return the live id-keyed map for ``kind``.

        Read-side accessor that lets call sites name the entity kind
        instead of hard-coding the attribute. The returned mapping is
        the same dict the cache uses internally, so callers should
        treat it as read-only: mutations should still go through the
        dedicated mutator methods on the cache (or, where one does
        not yet exist, the direct attribute) so a future migration to
        a typed container has one place to land.

        ``ip_devices`` remains a separate namespace and is not
        unified by this accessor; callers that want the union still
        reach into both maps explicitly.
        """

        if kind == "device":
            return self.devices
        if kind == "activity":
            return self.activities
        raise ValueError(
            f"ActivityCache.entities: unknown kind={kind!r}; "
            "expected 'device' or 'activity'"
        )

    def set_hint(self, activity_id: Optional[int]) -> None:
        self.current_activity_hint = activity_id

    def update_activity_state(self) -> tuple[Optional[int], Optional[int]]:
        if self.current_activity != self.current_activity_hint:
            old = self.current_activity
            self.current_activity = self.current_activity_hint
            return self.current_activity, old
        return self.current_activity, self.current_activity

    def get_activity_name(self, act_id: Optional[int]) -> Optional[str]:
        if act_id is None:
            return None
        return self.activities.get(act_id & 0xFF, {}).get("name")

    def replace_keymap_rows(self, act_lo: int, row_stream: bytes) -> None:
        """Replace the physical-button view for ``act_lo`` from an assembled row stream.

        Record-walking uses :func:`commands.iter_keymap_records`, which
        encodes the documented 18-byte fixed-stride layout. The activity-id
        filter inside the iterator subsumes the previous explicit
        ``act != act_lo`` early-return in ``_parse_keymap_record``.

        A short trailing fragment shorter than 18 bytes that looks like a
        valid record start is right-padded with zeros and processed via the
        usual record classifier. That compatibility fallback is preserved
        because some hub firmwares have been observed to truncate the final
        record.
        """

        self.buttons[act_lo] = set()
        self.button_details.pop(act_lo, None)

        favorites_allowed = True

        for record in iter_keymap_records(row_stream, expected_activity_id=act_lo):
            favorites_allowed, _ = self._parse_keymap_record(
                act_lo,
                record.raw,
                favorites_allowed=favorites_allowed,
            )

        usable = len(row_stream) - (len(row_stream) % KEYMAP_RECORD_SIZE)
        remainder = row_stream[usable:]
        if (
            len(remainder) >= 2
            and remainder[0] == act_lo
            and remainder[1] in BUTTONNAME_BY_CODE
        ):
            padded = remainder + b"\x00" * (KEYMAP_RECORD_SIZE - len(remainder))
            self._parse_keymap_record(
                act_lo,
                padded,
                favorites_allowed=favorites_allowed,
            )

    def _parse_keymap_record(
        self, act_lo: int, record: bytes, *, favorites_allowed: bool
    ) -> tuple[bool, bool]:
        act = record[0] if record else None
        if act != act_lo:
            return favorites_allowed, False

        button_id = record[1]
        device_id = record[2]
        command_id = record[9] if len(record) > 9 else button_id

        if button_id in BUTTONNAME_BY_CODE:
            self.buttons[act_lo].add(button_id)
            details: Dict[str, int] = {"device_id": device_id, "command_id": command_id}
            # Per the official KeyToKeyGets parser, each 18-byte keymap
            # record's long-press triple lives at:
            #   [10]        long_press_device_id
            #   [11..16]    long_press_button_code (6B BE)
            #   [17]        long_press_button_id   (== long_press_command_id)
            # A row with no long press is simply ``long_press_device_id == 0``.
            # Earlier code additionally required ``record[11:15] == 0`` and
            # ``record[15] == 0x4E`` -- a signature that only matches the
            # *synthetic* button codes our own writer produces, so genuine
            # captured long-press codes (real IR, BT, etc.) were silently
            # dropped on backup.
            if len(record) >= 18 and record[10] != 0:
                details["long_press_device_id"] = record[10]
                details["long_press_command_id"] = record[17]
            self.button_details[act_lo][button_id] = details
            return False, True

        if favorites_allowed:
            self._upsert_activity_favorite_slot(
                act_lo,
                button_id=button_id,
                device_id=device_id,
                command_id=command_id,
                source="keymap",
            )
            return True, True
        return favorites_allowed, False

    def _upsert_activity_keybinding_slot(
        self,
        act_lo: int,
        *,
        button_id: int,
        device_id: int,
        command_id: int,
        source: str,
    ) -> None:
        pair = (device_id & 0xFF, command_id & 0xFF)
        if pair[0] == 0 or pair[1] in (0x00, 0xFC):
            return

        self.activity_command_refs[act_lo].add(pair)
        slots = self.activity_keybinding_slots[act_lo]

        for idx, slot in enumerate(slots):
            if slot["button_id"] != (button_id & 0xFF):
                continue
            existing_source = slot.get("source", "keymap")
            # Preserve legacy activity-map slots for compatibility, but treat
            # keymap-derived data as the authoritative source when both exist.
            if existing_source == "activity_map" and source != "activity_map":
                slots[idx] = {
                    "button_id": button_id & 0xFF,
                    "device_id": pair[0],
                    "command_id": pair[1],
                    "source": source,
                }
            else:
                slots[idx].update({
                    "device_id": pair[0],
                    "command_id": pair[1],
                    "source": source,
                })
            return

        slots.append(
            {
                "button_id": button_id & 0xFF,
                "device_id": pair[0],
                "command_id": pair[1],
                "source": source,
            }
        )

    def _upsert_activity_favorite_slot(
        self,
        act_lo: int,
        *,
        button_id: int,
        device_id: int,
        command_id: int,
        source: str,
    ) -> None:
        pair = (device_id & 0xFF, command_id & 0xFF)
        if pair[0] == 0 or pair[1] in (0x00, 0xFC):
            return

        self.activity_command_refs[act_lo].add(pair)
        slots = self.activity_favorite_slots[act_lo]

        for idx, slot in enumerate(slots):
            if (slot["device_id"], slot["command_id"]) != pair:
                continue
            existing_source = slot.get("source", "keymap")
            # Preserve legacy activity-map slots for compatibility, but prefer
            # keymap-derived favorite rows when both describe the same pair.
            if existing_source == "activity_map" and source != "activity_map":
                slots[idx] = {
                    "button_id": button_id,
                    "device_id": pair[0],
                    "command_id": pair[1],
                    "source": source,
                }
            return

        slots.append(
            {
                "button_id": button_id,
                "device_id": pair[0],
                "command_id": pair[1],
                "source": source,
            }
        )

    def get_activity_command_refs(self, act_lo: int) -> set[tuple[int, int]]:
        """Return the set of (device_id, command_id) pairs for the activity."""

        return set(self.activity_command_refs.get(act_lo, set()))

    def get_activity_favorite_slots(self, act_lo: int) -> list[dict[str, int]]:
        """Return metadata for favorite slots in this activity."""

        return list(self.activity_favorite_slots.get(act_lo, []))

    def get_activity_keybinding_slots(self, act_lo: int) -> list[dict[str, int]]:
        """Return metadata for keybinding slots in this activity."""

        return list(self.activity_keybinding_slots.get(act_lo, []))

    def record_activity_member(self, act_lo: int, device_id: int) -> None:
        """Record a device as being linked to the activity."""

        dev_lo = device_id & 0xFF
        if dev_lo:
            self.activity_members[act_lo & 0xFF].add(dev_lo)

    def get_activity_members(self, act_lo: int) -> list[int]:
        """Return linked device ids discovered for the activity."""

        return sorted(self.activity_members.get(act_lo & 0xFF, set()))

    def record_activity_mapping(
        self,
        act_lo: int,
        device_id: int,
        command_id: int,
        *,
        button_id: int | None = None,
    ) -> None:
        """Record a legacy activity-map favorite mapping entry.

        Current protocol findings suggest activity favorites primarily come
        from REQ_BUTTONS/keymap rows; REQ_ACTIVITY_MAP is now treated as a
        membership roster. This helper remains for compatibility with restored
        cache data and older tests.
        """

        dev_lo = device_id & 0xFF
        self.record_activity_member(act_lo, dev_lo)

        self._upsert_activity_favorite_slot(
            act_lo,
            button_id=button_id if button_id is not None else 0,
            device_id=device_id & 0xFF,
            command_id=command_id & 0xFF,
            source="activity_map",
        )

    def record_favorite_label(
        self, act_lo: int, device_id: int, command_id: int, label: str
    ) -> None:
        """Store the resolved label for a favorite command."""

        self.activity_favorite_labels[act_lo][(device_id, command_id)] = label

    def record_keybinding_label(
        self, act_lo: int, device_id: int, command_id: int, label: str
    ) -> None:
        """Store the resolved label for an activity keybinding command."""

        self.activity_keybinding_labels[act_lo][(device_id, command_id)] = label

    def get_favorite_label(
        self, act_lo: int, device_id: int, command_id: int
    ) -> str | None:
        """Return the known label for a favorite command, if any."""

        return self.activity_favorite_labels.get(act_lo, {}).get((device_id, command_id))

    def get_keybinding_label(
        self, act_lo: int, device_id: int, command_id: int
    ) -> str | None:
        """Return the known label for an activity keybinding command, if any."""

        return self.activity_keybinding_labels.get(act_lo, {}).get((device_id, command_id))

    def get_activity_favorite_labels(self, act_lo: int) -> list[dict[str, int | str]]:
        """Return favorite slots decorated with resolved labels."""

        slots = self.activity_favorite_slots.get(act_lo, [])
        labels = self.activity_favorite_labels.get(act_lo, {})

        favorites: list[dict[str, int | str]] = []
        seen: set[tuple[int, int]] = set()
        for slot in slots:
            pair = (slot["device_id"], slot["command_id"])
            if pair in seen:
                continue
            label = labels.get(pair)
            if not label:
                continue
            seen.add(pair)
            favorites.append(
                {
                    "name": label,
                    "device_id": slot["device_id"],
                    "command_id": slot["command_id"],
                }
            )

        return favorites

    def get_activity_keybinding_labels(self, act_lo: int) -> list[dict[str, int | str]]:
        """Return keybinding slots decorated with resolved labels."""

        slots = self.activity_keybinding_slots.get(act_lo, [])
        labels = self.activity_keybinding_labels.get(act_lo, {})

        keybindings: list[dict[str, int | str]] = []
        seen: set[int] = set()
        for slot in slots:
            button_id = slot["button_id"]
            if button_id in seen:
                continue
            pair = (slot["device_id"], slot["command_id"])
            label = labels.get(pair)
            if not label:
                continue
            seen.add(button_id)
            keybindings.append(
                {
                    "button_id": button_id,
                    "name": label,
                    "device_id": slot["device_id"],
                    "command_id": slot["command_id"],
                }
            )

        return keybindings

    def replace_activity_macros(
        self, act_lo: int, macros: list[dict[str, int | str]]
    ) -> None:
        """Replace the cached macro list for ``act_lo``."""

        self.activity_macros[act_lo & 0xFF] = list(macros)

    def append_activity_macro(self, act_lo: int, command_id: int, label: str) -> None:
        """Record a single macro entry for an activity."""

        target = self.activity_macros.setdefault(act_lo & 0xFF, [])
        for entry in target:
            if entry.get("command_id") == command_id:
                entry["label"] = label
                return

        target.append({"command_id": command_id, "label": label})

    def get_activity_macros(self, act_lo: int) -> list[dict[str, int | str]]:
        """Return the known macro definitions for ``act_lo``."""

        return list(self.activity_macros.get(act_lo & 0xFF, []))

    def parse_device_commands(
        self,
        payload: bytes,
        dev_id: int,
        *,
        hub_version: str,
        count: int | None = None,
    ) -> Dict[int, str]:
        """Parse an assembled REQ_COMMANDS body into a ``{command_id: label}``.

        Uses the assembled fixed-stride schema parser
         :func:`commands.iter_command_records_from_assembled`
        
        

        ``count`` may be supplied explicitly (e.g. from the page-1 header's
        ``total_commands`` field). If omitted, it is inferred from
        ``len(payload) // stride`` — correct for well-formed real wire data
        (always a clean multiple of the stride) and graceful for slightly
        malformed inputs because the parser silently stops at truncated
        records.
        """

        stride = (
            COMMAND_RECORD_STRIDE_X1
            if hub_version == HUB_VERSION_X1
            else COMMAND_RECORD_STRIDE_X1S_X2
        )
        effective_count = count if count is not None else len(payload) // stride

        commands_found: Dict[int, str] = {}
        for record in iter_command_records_from_assembled(
            payload,
            count=effective_count,
            dev_id=dev_id,
            hub_version=hub_version,
        ):
            # control[0] is the codec selector; control[1..7] is the
            # 6-byte canonical button code (BE). Surface both into the
            # per-command metadata cache so backup can capture them
            # without re-fetching the records.
            if len(record.control) >= 7:
                self.command_metadata[dev_id & 0xFF][record.command_id & 0xFF] = {
                    "library_type": record.control[0] & 0xFF,
                    "button_code": int.from_bytes(record.control[1:7], "big"),
                }
            if record.command_id not in commands_found and record.label:
                commands_found[record.command_id] = record.label
        return commands_found

    def record_virtual_device(
        self,
        device_id: int,
        *,
        name: str,
        button_id: int | None = None,
        method: str | None = None,
        url: str | None = None,
        headers: dict[str, str] | None = None,
        button_name: str | None = None,
    ) -> None:
        brand = "Virtual HTTP"
        self.devices[device_id & 0xFF] = normalize_device_entry(
            {
                **(self.devices.get(device_id & 0xFF, {})),
                "brand": brand,
                "name": name,
            },
            default_class=DEVICE_CLASS_WIFI_IP,
            default_class_code=0x1C,
        )
        if button_id is not None:
            self.buttons.setdefault(device_id & 0xFF, set()).add(button_id)
        meta: Dict[str, Any] = {
            "device_id": device_id & 0xFF,
            "name": name,
            "brand": brand,
        }
        if method is not None:
            meta["method"] = method
        if url is not None:
            meta["url"] = url
        if headers is not None:
            meta["headers"] = headers
        if button_name is not None:
            meta["button_name"] = button_name
        if button_id is not None:
            self.ip_buttons[device_id & 0xFF][button_id] = meta
        self.ip_devices[device_id & 0xFF] = meta

    def record_app_activation(
        self,
        *,
        ent_id: int,
        ent_kind: str,
        ent_name: str,
        command_id: int,
        command_label: str | None,
        button_label: str | None,
        direction: str,
        ts: Optional[float] = None,
    ) -> dict[str, Any]:
        timestamp = ts if ts is not None else time.time()
        record = {
            "timestamp": timestamp,
            "iso_time": time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime(timestamp)),
            "direction": direction,
            "entity_id": ent_id,
            "entity_kind": ent_kind,
            "entity_name": ent_name,
            "command_id": command_id,
            "command_label": command_label,
            "button_label": button_label,
        }
        self.app_activations.append(record)
        return record

    def get_app_activations(self) -> list[dict[str, Any]]:
        return list(self.app_activations)


class BurstScheduler:
    def __init__(self, *, idle_s: float = 0.15, response_grace: float = 1.0) -> None:
        self.idle_s = idle_s
        self.response_grace = response_grace
        self.active = False
        self.kind: str | None = None
        self.last_ts = 0.0
        self.queue: list[tuple[int, bytes, bool, Optional[str]]] = []
        self.listeners: dict[str, list[Callable[[str], None]]] = {}

    def on_burst_end(self, key: str, cb: Callable[[str], None]) -> None:
        self.listeners.setdefault(key, []).append(cb)

    def start(self, kind: str, *, now: Optional[float] = None) -> None:
        self.active = True
        self.kind = kind
        base = time.monotonic() if now is None else now
        self.last_ts = base + self.response_grace

    def queue_or_send(
        self,
        *,
        opcode: int,
        payload: bytes,
        expects_burst: bool,
        burst_kind: Optional[str],
        can_issue: Callable[[], bool],
        sender: Callable[[int, bytes], None],
        now: Optional[float] = None,
    ) -> bool:
        is_burst = expects_burst
        current_time = time.monotonic() if now is None else now

        if not can_issue():
            return False

        if self.active:
            self.queue.append((opcode, payload, is_burst, burst_kind))
            return True

        if is_burst:
            self.start(burst_kind or "generic", now=current_time)

        sender(opcode, payload)
        return True

    def tick(
        self,
        now: float,
        *,
        can_issue: Callable[[], bool],
        sender: Callable[[int, bytes], None],
    ) -> None:
        if not self.active:
            return
        if now - self.last_ts < self.idle_s:
            return
        self._drain(can_issue=can_issue, sender=sender, now=now)

    def finish(
        self,
        key: str,
        *,
        can_issue: Callable[[], bool],
        sender: Callable[[int, bytes], None],
        now: Optional[float] = None,
    ) -> bool:
        if not self.active or self.kind != key:
            return False
        self._drain(
            can_issue=can_issue,
            sender=sender,
            now=time.monotonic() if now is None else now,
        )
        return True

    def _drain(
        self,
        *,
        can_issue: Callable[[], bool],
        sender: Callable[[int, bytes], None],
        now: float,
    ) -> None:
        finished_kind = self.kind or "generic"
        self.active = False
        self.kind = None
        self._notify_burst_end(finished_kind)

        while self.queue:
            op, payload, is_burst, next_kind = self.queue.pop(0)
            if not can_issue():
                continue
            if is_burst:
                self.start(next_kind or "generic", now=now)
            sender(op, payload)
            if self.active:
                break

    def _notify_burst_end(self, key: str) -> None:
        for cb in self.listeners.get(key, []):
            cb(key)
        if ":" in key:
            prefix = key.split(":", 1)[0]
            for cb in self.listeners.get(prefix, []):
                cb(key)

