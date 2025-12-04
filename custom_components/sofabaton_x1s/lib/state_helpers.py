from __future__ import annotations

import time
from collections import defaultdict, deque
from typing import Any, Callable, Deque, Dict, Optional

from .commands import _matches_control_block, iter_command_records
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

        start_index = -1
        if n >= RECORD_SIZE:
            for j in range(min(n - RECORD_SIZE + 1, 20)):
                if payload[j] == act_lo:
                    start_index = j
                    break

        if start_index >= 0:
            i = start_index
            while i + 2 <= n:
                button_code = payload[i + 1]
                if payload[i] == act_lo and button_code in BUTTONNAME_BY_CODE:
                    self.buttons[act_lo].add(button_code)
                i += RECORD_SIZE
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

    def parse_device_commands(self, payload: bytes, dev_id: int) -> Dict[int, str]:
        commands_found: Dict[int, str] = {}
        for record in iter_command_records(payload, dev_id):
            if record.command_id not in commands_found and record.label:
                commands_found[record.command_id] = record.label

        # Some hubs omit the device ID prefix inside command bursts. If nothing was
        # parsed with the expected device ID, make a best-effort attempt to infer
        # the target by scanning for control blocks and treating the preceding
        # byte as the device ID.
        if not commands_found and len(payload) >= 9:
            inferred_dev_id: int | None = None
            for i in range(len(payload) - 8):
                if _matches_control_block(payload[i + 1 : i + 8]):
                    inferred_dev_id = payload[i]
                    break

            if inferred_dev_id is not None:
                for record in iter_command_records(payload, inferred_dev_id):
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

