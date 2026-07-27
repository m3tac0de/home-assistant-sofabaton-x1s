"""Orchestration tests for the in-place wifi re-sync walker.

The four new wire drivers (``command_delete``, ``wifi_power_config``,
``membership_remove``, ``wifi_head_commit``) are gated by the live-hub
bench program (chunks 1–4). These tests verify the walker orchestration —
dispatch, ordering, ack-failure stop, the progress contract, and that each
new step kind resolves to a real driver method — against a fake proxy.
"""

from __future__ import annotations

import logging

from custom_components.sofabaton_x1s.lib.proxy_activity_sync import ActivitySyncMixin
from custom_components.sofabaton_x1s.lib.wifi_inplace_plan import (
    ManagedWifiSnapshot,
    WifiActivityRefs,
    WifiCommandSlot,
    build_wifi_inplace_plan,
)

DEV = 8


class FakeProxy(ActivitySyncMixin):
    def __init__(self, *, fail_kind: str | None = None) -> None:
        self._log = logging.getLogger("test.wifi_inplace_exec")
        self._fail_kind = fail_kind
        self.dispatched: list[str] = []
        self.can_issue = True

    def can_issue_commands(self) -> bool:
        return self.can_issue

    def _dispatch_activity_sync_step(self, step) -> bool:
        self.dispatched.append(step.kind)
        return step.kind != self._fail_kind


def _slot(cid: int, label: str) -> WifiCommandSlot:
    return WifiCommandSlot(command_id=cid, label=label, payload_key=f"slot:{cid}")


def _snap(**over) -> ManagedWifiSnapshot:
    base = dict(
        device_id=DEV,
        device_name="Wifi",
        brand="m3-key-a",
        power_on_command_id=1,
        power_off_command_id=2,
        slots={1: _slot(1, "One"), 2: _slot(2, "Two")},
        activities={0x65: WifiActivityRefs(0x65, member_count=3)},
    )
    base.update(over)
    return ManagedWifiSnapshot(**base)


def _multi_kind_plan():
    baseline = _snap(
        slots={1: _slot(1, "One"), 2: _slot(2, "Two"), 6: _slot(6, "Del")},
        activities={0x65: WifiActivityRefs(0x65, member_count=3), 0x66: WifiActivityRefs(0x66, member_count=4)},
    )
    desired = _snap(
        brand="m3-key-b",
        power_on_command_id=7,
        slots={1: _slot(1, "One"), 2: _slot(2, "Two"), 5: _slot(5, "Add")},
        activities={0x65: WifiActivityRefs(0x65, member_count=3)},
    )
    return build_wifi_inplace_plan(baseline, desired)


def test_walker_runs_all_steps_in_order():
    plan = _multi_kind_plan()
    proxy = FakeProxy()
    result = proxy.run_wifi_inplace_plan(plan)
    assert result["status"] == "success"
    assert result["completed_steps"] == len(plan.steps)
    assert proxy.dispatched == [s.kind for s in plan.steps]
    assert proxy.dispatched == [
        "command_add", "command_delete", "wifi_power_config",
        "membership_remove", "wifi_head_commit",
    ]
    assert result["counters"]["command_add"] == 1


def test_walker_stops_on_first_rejection_after_one_retry():
    plan = _multi_kind_plan()
    proxy = FakeProxy(fail_kind="wifi_power_config")
    result = proxy.run_wifi_inplace_plan(plan)
    assert result["status"] == "failed"
    assert result["failed_at"] == "wifi_power_config"
    # the failing step is retried once (idempotent rewrites); nothing after
    assert proxy.dispatched == [
        "command_add", "command_delete", "wifi_power_config", "wifi_power_config",
    ]
    assert "wifi_head_commit" not in proxy.dispatched


def test_walker_reports_progress():
    plan = _multi_kind_plan()
    proxy = FakeProxy()
    events: list[dict] = []
    proxy.run_wifi_inplace_plan(plan, progress_callback=lambda **d: events.append(d))
    assert events[0]["phase"] == "writing"
    assert events[-1]["phase"] == "completed"
    assert events[-1]["completed_steps"] == len(plan.steps)


def test_walker_refuses_when_hub_unavailable():
    proxy = FakeProxy()
    proxy.can_issue = False
    result = proxy.run_wifi_inplace_plan(_multi_kind_plan())
    assert result["status"] == "failed"
    assert result["failed_at"] == "unavailable"
    assert proxy.dispatched == []


def test_empty_plan_is_success_noop():
    proxy = FakeProxy()
    result = proxy.run_wifi_inplace_plan(build_wifi_inplace_plan(_snap(), _snap()))
    assert result["status"] == "success"
    assert result["completed_steps"] == 0
    assert proxy.dispatched == []


def test_new_step_kinds_resolve_to_drivers():
    for kind in (
        "command_delete",
        "wifi_power_config",
        "wifi_input_config",
        "membership_remove",
        "wifi_head_commit",
    ):
        assert callable(getattr(ActivitySyncMixin, f"_sync_step_{kind}", None)), kind
