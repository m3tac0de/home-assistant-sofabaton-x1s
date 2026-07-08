"""Executor orchestration tests (Phase L4).

The wire builders are gated by the live-hub checklist; these tests verify
the orchestration — plan dispatch, ordering, ack-failure stop, stale
pre-flight, and the progress contract — against a fake proxy that records
every driver call and can simulate a rejection.
"""

from __future__ import annotations

import copy
import logging

from custom_components.sofabaton_x1s.lib.proxy_activity_sync import ActivitySyncMixin
from tests.test_activity_sync_plan import base_bundle, _activity, _device, ACTIVITY_ID


class FakeProxy(ActivitySyncMixin):
    def __init__(self, *, fresh_activity: dict, fail_kind: str | None = None) -> None:
        self._log = logging.getLogger("test.activity_sync")
        self._fresh_activity = fresh_activity
        self._fail_kind = fail_kind
        self.calls: list[tuple] = []
        self.can_issue = True

    # Environment
    def can_issue_commands(self) -> bool:
        return self.can_issue

    def backup_activity(self, activity_id, **_kw):
        return self._fresh_activity

    # Drivers — record and honour the simulated rejection.
    def _record(self, kind, *args, **kwargs):
        self.calls.append((kind, args, kwargs))
        return None if self._fail_kind == kind else {"status": "success"}

    def command_to_button(self, *a, **k):
        return self._record("binding_write", *a, **k)

    def command_to_favorite(self, *a, **k):
        return self._record("favorite_add", *a, **k)

    def delete_favorite(self, *a, **k):
        return self._record("favorite_delete", *a, **k)

    def reorder_favorites(self, *a, **k):
        return self._record("favorite_order", *a, **k)

    def add_device_to_activity(self, *a, **k):
        return self._record("member_replay", *a, **k)

    def set_idle_behavior(self, *a, **k):
        return {"status": "success"} if self._record("idle_behavior", *a, **k) else False

    def request_activity_mapping(self, act):
        self.calls.append(("remote_sync", (act,), {}))
        return True

    # Low-level primitives (stubbed so wire bytes aren't exercised here).
    def _activity_sync_delete_key(self, activity_id, button_id):
        return bool(self._record("delete_key", activity_id, button_id))

    def _send_paged_macro_save(self, *, payload, macro_button, **_kw):
        return self._record("macro_write", macro_button)

    def _macro_key_sequence_from_steps(self, steps):
        return list(steps)


def _kinds(calls):
    return [call[0] for call in calls]


def test_noop_returns_success_without_writes():
    base = base_bundle()
    proxy = FakeProxy(fresh_activity=_activity(base))
    result = proxy.sync_activity(baseline=base, edited=copy.deepcopy(base), activity_id=ACTIVITY_ID)
    assert result["status"] == "success"
    assert result["total_steps"] == 0
    assert proxy.calls == []


def test_full_edit_dispatches_in_plan_order_and_reports_counters():
    base = base_bundle()
    edited = copy.deepcopy(base)
    _activity(edited)["favorite_slots"].append(
        {"button_id": 9, "device_id": 3, "command_id": 31, "name": "Netflix"}
    )
    _device(edited, 2)["device"]["idle_behavior"] = 1
    proxy = FakeProxy(fresh_activity=_activity(base))

    result = proxy.sync_activity(baseline=base, edited=edited, activity_id=ACTIVITY_ID)

    assert result["status"] == "success"
    kinds = _kinds(proxy.calls)
    # member_replay (device 3 became a member) precedes favorite_add,
    # idle_behavior is ordered late, remote_sync is the tail, plus the final
    # request_activity_mapping refresh.
    assert kinds.index("member_replay") < kinds.index("favorite_add")
    assert kinds.index("favorite_add") < kinds.index("idle_behavior")
    assert kinds[-1] == "remote_sync"
    assert result["counters"]["favorite_add"] == 1


def test_step_rejection_stops_and_reports_failed_at():
    base = base_bundle()
    edited = copy.deepcopy(base)
    _activity(edited)["favorite_slots"].append(
        {"button_id": 9, "device_id": 3, "command_id": 31, "name": "Netflix"}
    )
    proxy = FakeProxy(fresh_activity=_activity(base), fail_kind="favorite_add")

    result = proxy.sync_activity(baseline=base, edited=edited, activity_id=ACTIVITY_ID)

    assert result["status"] == "failed"
    assert result["failed_at"].startswith("favorite_add")
    # No idle/remote steps ran after the rejected favorite_add.
    assert "remote_sync" not in _kinds(proxy.calls)


def test_stale_preflight_blocks_before_any_write():
    base = base_bundle()
    edited = copy.deepcopy(base)
    _activity(edited)["favorite_slots"].append(
        {"button_id": 9, "device_id": 3, "command_id": 31, "name": "Netflix"}
    )
    # Hub now reports a different activity block than the captured baseline.
    stale = copy.deepcopy(_activity(base))
    stale["favorite_slots"].append({"button_id": 5, "device_id": 1, "command_id": 11, "name": "Sneaky"})
    proxy = FakeProxy(fresh_activity=stale)

    result = proxy.sync_activity(baseline=base, edited=edited, activity_id=ACTIVITY_ID)

    assert result["status"] == "failed"
    assert result["failed_at"] == "stale_check"
    assert proxy.calls == []


def test_out_of_scope_plan_fails_before_writes():
    base = base_bundle()
    edited = copy.deepcopy(base)
    _device(edited, 3)["button_bindings"] = [{"button_id": 0xAE, "command_id": 30}]
    proxy = FakeProxy(fresh_activity=_activity(base))

    result = proxy.sync_activity(baseline=base, edited=edited, activity_id=ACTIVITY_ID)

    assert result["status"] == "failed"
    assert result["failed_at"] == "plan"
    assert proxy.calls == []


def test_unavailable_when_cannot_issue_commands():
    base = base_bundle()
    proxy = FakeProxy(fresh_activity=_activity(base))
    proxy.can_issue = False
    result = proxy.sync_activity(baseline=base, edited=copy.deepcopy(base), activity_id=ACTIVITY_ID)
    assert result["status"] == "failed"
    assert result["failed_at"] == "unavailable"


def test_progress_contract_matches_restore_shape():
    base = base_bundle()
    edited = copy.deepcopy(base)
    _activity(edited)["favorite_slots"].append(
        {"button_id": 9, "device_id": 3, "command_id": 31, "name": "Netflix"}
    )
    proxy = FakeProxy(fresh_activity=_activity(base))
    events: list[dict] = []
    proxy.sync_activity(
        baseline=base, edited=edited, activity_id=ACTIVITY_ID,
        progress_callback=lambda **payload: events.append(payload),
    )
    phases = [e.get("phase") for e in events]
    assert "stale_check" in phases
    assert "writing" in phases
    assert phases[-1] == "completed"
    last = events[-1]
    assert last["completed_steps"] == last["total_steps"]
    assert "current_activity_id" in last
