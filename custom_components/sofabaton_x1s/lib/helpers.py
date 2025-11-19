"""Shared helpers for burst management and activity/device caching."""
from __future__ import annotations

import time
from typing import Any, Callable, Dict, Optional, Tuple


class BurstScheduler:
    """Track burst lifecycles and defer queued commands until bursts finish."""

    def __init__(self, idle_seconds: float = 0.15, grace_period: float = 1.0) -> None:
        self._burst_active = False
        self._burst_kind: str | None = None
        self._burst_last_ts = 0.0
        self._burst_idle_s = idle_seconds
        self._response_grace_period = grace_period
        self._burst_queue: list[tuple[int, bytes, bool, Optional[str]]] = []
        self._burst_listeners: dict[str, list[Callable[[str], None]]] = {}

    # Listener registration -------------------------------------------------
    def on_burst_end(self, key: str, cb: Callable[[str], None]) -> None:
        self._burst_listeners.setdefault(key, []).append(cb)

    def _notify_burst_end(self, key: str) -> None:
        for cb in self._burst_listeners.get(key, []):
            cb(key)
        if ":" in key:
            prefix = key.split(":", 1)[0]
            for cb in self._burst_listeners.get(prefix, []):
                cb(key)

    # Burst state -----------------------------------------------------------
    @property
    def active(self) -> bool:
        return self._burst_active

    @property
    def current_kind(self) -> str | None:
        return self._burst_kind

    def start_burst(self, kind: str = "generic") -> None:
        self._burst_active = True
        self._burst_kind = kind
        self._burst_last_ts = time.monotonic() + self._response_grace_period

    def enqueue(
        self,
        opcode: int,
        payload: bytes,
        *,
        expects_burst: bool,
        burst_kind: str | None,
        can_issue: Callable[[], bool],
        queue_frame: Callable[[int, bytes], None],
    ) -> bool:
        if not can_issue():
            return False

        is_burst = expects_burst
        if self._burst_active:
            self._burst_queue.append((opcode, payload, is_burst, burst_kind))
            return True

        if is_burst:
            self.start_burst(burst_kind or "generic")
        queue_frame(opcode, payload)
        return True

    def drain_if_idle(self, *, can_issue: Callable[[], bool], queue_frame: Callable[[int, bytes], None]) -> None:
        if not self._burst_active:
            return
        now = time.monotonic()
        if now - self._burst_last_ts < self._burst_idle_s:
            return
        self._drain_post_burst(can_issue=can_issue, queue_frame=queue_frame)

    def _drain_post_burst(
        self,
        *,
        can_issue: Callable[[], bool],
        queue_frame: Callable[[int, bytes], None],
    ) -> None:
        finished_kind = self._burst_kind or "generic"
        self._burst_active = False
        self._burst_kind = None
        self._notify_burst_end(finished_kind)

        while self._burst_queue:
            op, payload, is_burst, next_kind = self._burst_queue.pop(0)
            if not can_issue():
                continue
            if is_burst:
                self.start_burst(next_kind or "generic")
            queue_frame(op, payload)
            if self._burst_active:
                break


class ActivityCache:
    """Track activities/devices and notify listeners on activity changes."""

    def __init__(self) -> None:
        self._current_activity: Optional[int] = None
        self._current_activity_hint: Optional[int] = None
        self._activities: Dict[int, Dict[str, Any]] = {}
        self._devices: Dict[int, Dict[str, Any]] = {}
        self._activity_listeners: list[Callable[[int | None, int | None, str | None], None]] = []

    def set_hint(self, act_id: Optional[int]) -> None:
        self._current_activity_hint = act_id

    def handle_active_state(self) -> None:
        if self._current_activity != self._current_activity_hint:
            old = self._current_activity
            self._current_activity = self._current_activity_hint
            self._notify_activity_change(self._current_activity, old)

    def on_activity_change(self, cb: Callable[[int | None, int | None, str | None], None]) -> None:
        self._activity_listeners.append(cb)

    def _notify_activity_change(self, new_id: int | None, old_id: int | None) -> None:
        name = None
        if new_id is not None:
            name = self._activities.get(new_id & 0xFF, {}).get("name")
        for cb in self._activity_listeners:
            cb(new_id, old_id, name)

    # Activity/device state -------------------------------------------------
    def update_activity(self, act_id: int, payload: Dict[str, Any]) -> None:
        self._activities[act_id & 0xFF] = payload.copy()

    def update_device(self, dev_id: int, payload: Dict[str, Any]) -> None:
        self._devices[dev_id & 0xFF] = payload.copy()

    def get_activities(self) -> tuple[dict[int, dict], bool]:
        if self._activities:
            return ({k: v.copy() for k, v in self._activities.items()}, True)
        return ({}, False)

    def get_devices(self) -> tuple[dict[int, dict], bool]:
        if self._devices:
            return ({k: v.copy() for k, v in self._devices.items()}, True)
        return ({}, False)

    def activity_name(self, act_id: int | None) -> Optional[str]:
        if act_id is None:
            return None
        return self._activities.get(act_id & 0xFF, {}).get("name")

    @property
    def current(self) -> Optional[int]:
        return self._current_activity

    @property
    def hint(self) -> Optional[int]:
        return self._current_activity_hint

    @property
    def activities(self) -> Dict[int, Dict[str, Any]]:
        return self._activities

    @property
    def devices(self) -> Dict[int, Dict[str, Any]]:
        return self._devices
