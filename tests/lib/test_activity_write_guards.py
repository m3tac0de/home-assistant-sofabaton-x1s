"""Activity writes refuse to act on a read that failed, and never send a
row layout the hub does not use (CR-L4b-2, -6, -7, -8)."""

from __future__ import annotations

import pytest

from custom_components.sofabaton_x1s.lib.hub_versions import HUB_VERSION_X1, HUB_VERSION_X1S
from custom_components.sofabaton_x1s.lib.x1_proxy import X1Proxy


def _proxy(hub_version: str) -> X1Proxy:
    proxy = X1Proxy(
        "127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False, hub_version=hub_version
    )
    proxy.can_issue_commands = lambda: True  # type: ignore[assignment]
    return proxy


def test_a_failed_keymap_re_read_is_not_an_empty_favorite_map() -> None:
    proxy = _proxy(HUB_VERSION_X1S)
    proxy._fetch_and_wait = lambda *a, **kw: False  # type: ignore[assignment]

    with pytest.raises(RuntimeError, match="could not be re-read"):
        proxy._activity_sync_current_favorite_fav_ids(0x65)
    proxy._activity_sync_reset_run_state()
    with pytest.raises(RuntimeError):
        proxy._activity_sync_live_favorite_fav_ids(0x65)
    assert proxy._activity_sync_live_fav_cache == {}  # a failed read is not cached


def test_the_favorite_order_step_never_writes_a_partial_table(monkeypatch) -> None:
    proxy = _proxy(HUB_VERSION_X1S)
    monkeypatch.setattr(proxy, "_activity_sync_current_favorite_fav_ids", lambda act: {(5, 1): 0x10})
    written = []
    monkeypatch.setattr(proxy, "reorder_favorites", lambda *a, **kw: written.append(a) or {})

    ok = proxy._sync_step_favorite_order({
        "activity_id": 0x65,
        "order": [
            {"kind": "favorite", "device_id": 5, "command_id": 1},
            {"kind": "favorite", "device_id": 5, "command_id": 2},  # not on the hub
        ],
    })

    assert ok is False and written == []


def test_a_wide_hub_never_gets_the_x1_activity_row() -> None:
    proxy = _proxy(HUB_VERSION_X1S)
    proxy.state.activities[0x65] = {"name": "Watch TV"}  # no cached row payload

    assert proxy._build_activity_confirm_payload(0x65, name="Movies") is None


def test_favoriting_a_high_command_id_is_refused_clearly_on_a_wide_hub() -> None:
    proxy = _proxy(HUB_VERSION_X1S)

    with pytest.raises(ValueError, match="not supported yet"):
        proxy._build_favorite_map_payload(activity_id=0x65, device_id=5, command_id=0xE0, slot_id=1)
    proxy._build_favorite_map_payload(activity_id=0x65, device_id=5, command_id=0xDF, slot_id=1)


def test_x1_favorite_add_refuses_when_the_order_cannot_be_read(monkeypatch) -> None:
    proxy = _proxy(HUB_VERSION_X1)
    monkeypatch.setattr(proxy, "request_favorites_order", lambda act: None)
    sent = []
    monkeypatch.setattr(proxy, "_send_family_frame", lambda *a: sent.append(a))
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda *a: sent.append(a))

    assert proxy.command_to_favorite(0x65, 5, 1) is None
    assert sent == []  # refused before the map step


def _reject_with(proxy, status: int) -> list:
    sent = []
    proxy._send_cmd_frame = lambda *a: sent.append(a)  # type: ignore[assignment]
    proxy._send_family_frame = lambda *a: sent.append(a)  # type: ignore[assignment]
    proxy.wait_for_ack_any = lambda candidates, **kw: (0x0103, bytes([status]))  # type: ignore[assignment]
    return sent


def test_a_rejected_activity_rename_fails_and_keeps_the_cached_name() -> None:
    proxy = _proxy(HUB_VERSION_X1)
    proxy.state.activities[0x65] = {"name": "Watch TV"}
    _reject_with(proxy, 0x0C)

    assert proxy._sync_step_activity_rename({"activity_id": 0x65, "name": "Movies"}) is False
    assert proxy.state.activities[0x65]["name"] == "Watch TV"


def test_an_accepted_activity_rename_updates_the_cached_name() -> None:
    proxy = _proxy(HUB_VERSION_X1)
    proxy.state.activities[0x65] = {"name": "Watch TV"}
    _reject_with(proxy, 0x00)

    assert proxy._sync_step_activity_rename({"activity_id": 0x65, "name": "Movies"}) is True
    assert proxy.state.activities[0x65]["name"] == "Movies"


def test_a_rejected_favorite_map_is_a_failure_not_a_stage(monkeypatch) -> None:
    proxy = _proxy(HUB_VERSION_X1S)
    sent = _reject_with(proxy, 0x04)

    assert proxy.command_to_favorite(0x65, 5, 1) is None
    assert len(sent) == 1  # the map only; no stage rewrote the order table


def test_a_catalog_wait_needs_the_list_committed_not_a_quiet_wire() -> None:
    proxy = _proxy(HUB_VERSION_X1S)

    def _request_answered() -> bool:
        proxy._activities_commit_serial += 1
        return True

    proxy.request_activities = _request_answered  # type: ignore[assignment]
    assert proxy._request_activities_and_wait(timeout=0.5) is True

    # A quiet wire (or another kind's burst) with no commit is not a refresh.
    proxy.request_activities = lambda: True  # type: ignore[assignment]
    assert proxy._request_activities_and_wait(timeout=0.05) is False


def test_a_stopped_walk_reports_the_plan_size_and_what_landed(monkeypatch) -> None:
    from types import SimpleNamespace

    from custom_components.sofabaton_x1s.lib.models import SyncResult

    proxy = _proxy(HUB_VERSION_X1S)
    outcomes = iter([True, True, False])
    monkeypatch.setattr(proxy, "_dispatch_activity_sync_step", lambda step: next(outcomes))
    steps = [
        SimpleNamespace(kind="favorite_add", label=f"step {i}", target_device_id=3, payload={})
        for i in range(5)
    ]

    failure, _counters = proxy._walk_sync_plan(steps, progress=lambda **kw: None)

    assert failure["completed_steps"] == 2 and failure["total_steps"] == 5
    assert failure["counters"] == {"favorite_add": 2}
    result = SyncResult.from_engine(failure, snapshot_id=None)
    assert (result.completed_steps, result.total_steps) == (2, 5)
    assert result.counters == {"favorite_add": 2}
