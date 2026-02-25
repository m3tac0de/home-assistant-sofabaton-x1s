from __future__ import annotations

import time
from collections import defaultdict, deque
from typing import Any, Callable, Deque, Dict, Optional

from .commands import iter_command_records
from .protocol_const import BUTTONNAME_BY_CODE


class ActivityCache:
    def __init__(self) -> None:
        self.current_activity: Optional[int] = None
        self.current_activity_hint: Optional[int] = None
        self.activities: Dict[int, Dict[str, Any]] = {}
        self.devices: Dict[int, Dict[str, Any]] = {}
        self.buttons: Dict[int, set[int]] = {}
        self.commands: dict[int, dict[int, str]] = defaultdict(dict)
        self.ip_devices: Dict[int, Dict[str, Any]] = {}
        self.ip_buttons: Dict[int, Dict[int, Dict[str, Any]]] = defaultdict(dict)
        self.activity_command_refs: dict[int, set[tuple[int, int]]] = defaultdict(set)
        self.activity_favorite_slots: dict[int, list[dict[str, int]]] = defaultdict(list)
        self.activity_members: dict[int, set[int]] = defaultdict(set)
        self.activity_favorite_labels: dict[int, dict[tuple[int, int], str]] = defaultdict(dict)
        self.activity_macros: dict[int, list[dict[str, int | str]]] = defaultdict(list)
        self.keymap_remainders: dict[int, bytes] = {}
        # Only track the most recent activation to avoid unbounded growth
        self.app_activations: Deque[dict[str, Any]] = deque(maxlen=1)

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

    def accumulate_keymap(self, act_lo: int, payload: bytes) -> None:
        if act_lo not in self.buttons:
            self.buttons[act_lo] = set()

        i, n = 0, len(payload)

        RECORD_SIZE = 18

        remainder = self.keymap_remainders.pop(act_lo, b"")
        if remainder:
            needed = RECORD_SIZE - len(remainder)
            if len(payload) < needed:
                self.keymap_remainders[act_lo] = remainder + payload
                return
            record = remainder + payload[:needed]
            favorites_allowed = not bool(self.buttons[act_lo])
            favorites_allowed, parsed = self._parse_keymap_record(
                act_lo, record, favorites_allowed=favorites_allowed
            )
            payload = payload[needed:]
            if not parsed:
                return
            i, n = 0, len(payload)

        start_index = -1
        if n >= RECORD_SIZE:
            for j in range(min(n - RECORD_SIZE + 1, 20)):
                if payload[j] == act_lo:
                    start_index = j
                    break

        if start_index >= 0:
            favorites_allowed = not bool(self.buttons[act_lo])
            i = start_index
            while i + RECORD_SIZE <= n:
                favorites_allowed, parsed = self._parse_keymap_record(
                    act_lo, payload[i : i + RECORD_SIZE], favorites_allowed=favorites_allowed
                )
                if not parsed:
                    break

                i += RECORD_SIZE
            if i < n and i + RECORD_SIZE > n and payload[i] == act_lo:
                remainder = payload[i:]
                if len(remainder) >= 2 and remainder[1] in BUTTONNAME_BY_CODE:
                    padded = remainder + b"\x00" * (RECORD_SIZE - len(remainder))
                    self._parse_keymap_record(act_lo, padded, favorites_allowed=favorites_allowed)
                    return
                self.keymap_remainders[act_lo] = remainder
                return
            if self.activity_favorite_slots.get(act_lo):
                return

        i = 0
        while i + 1 < n:
            if payload[i] == act_lo:
                button_code = payload[i + 1]
                if button_code in BUTTONNAME_BY_CODE:
                    if i + 7 < n and payload[i + 3 : i + 7] == b"\x00\x00\x00\x00":
                        stride = 16
                    else:
                        stride = 20
                    self.buttons[act_lo].add(button_code)
                    i += stride
                    continue
            i += 1

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
            if self._looks_like_favorite_record(record, device_id=device_id, command_id=command_id):
                self._upsert_activity_favorite_slot(
                    act_lo,
                    button_id=button_id,
                    device_id=device_id,
                    command_id=command_id,
                    source="keymap",
                )
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


    def _looks_like_favorite_record(self, record: bytes, *, device_id: int, command_id: int) -> bool:
        if len(record) < 18:
            return False
        if device_id == 0 or command_id in (0x00, 0xFC):
            return False
        # In button-coded rows, favorites use the observed 0x4E marker before
        # the command tuple. Regular hard-button mappings use other values
        # (e.g. 0x00/0x07/0x2E) and must not be treated as favorites.
        if record[7] != 0x4E:
            return False
        return record[3:7] == b"\x00" * 4 and record[12:18] == b"\x00" * 6

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
            if existing_source != "activity_map" and source == "activity_map":
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
    def clear_keymap_remainders(self, act_lo: int | None = None) -> None:
        if act_lo is None:
            self.keymap_remainders.clear()
        else:
            self.keymap_remainders.pop(act_lo, None)

    def get_activity_command_refs(self, act_lo: int) -> set[tuple[int, int]]:
        """Return the set of (device_id, command_id) pairs for the activity."""

        return set(self.activity_command_refs.get(act_lo, set()))

    def get_activity_favorite_slots(self, act_lo: int) -> list[dict[str, int]]:
        """Return metadata for favorite slots in this activity."""

        return list(self.activity_favorite_slots.get(act_lo, []))


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
        """Record an activity favorite mapping entry."""

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

    def get_favorite_label(
        self, act_lo: int, device_id: int, command_id: int
    ) -> str | None:
        """Return the known label for a favorite command, if any."""

        return self.activity_favorite_labels.get(act_lo, {}).get((device_id, command_id))

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

    def parse_device_commands(self, payload: bytes, dev_id: int) -> Dict[int, str]:
        commands_found: Dict[int, str] = {}
        for record in iter_command_records(payload, dev_id):
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
        self.devices[device_id & 0xFF] = {"brand": brand, "name": name}
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
