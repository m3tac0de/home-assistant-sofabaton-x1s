"""Hub-branch tests for the in-place Wifi Command re-sync path.

Covers the decision gates in ``_async_try_inplace_command_sync`` and the
branch in ``async_sync_command_config``: when the gates pass the managed
device is edited in place (no create/delete), each decline falls through to
the replace path, and a rejected write raises instead of double-applying.
"""

from __future__ import annotations

import asyncio

import pytest

import custom_components.sofabaton_x1s.wifi_deploy as wifi_deploy_module
from custom_components.sofabaton_x1s.const import HUB_VERSION_X1
from custom_components.sofabaton_x1s.hub import SofabatonHub
from custom_components.sofabaton_x1s.lib.commands import hub_command_label
from tests.hub_fakes import FakeHass

OLD_HASH = "oldhash"
NEW_HASH = "newhash"
DEV_ID = 11
PORT = 8060


class _Store:
    def __init__(self, *, deployed_slots=None):
        self.deployed_slots = deployed_slots if deployed_slots is not None else [
            {"name": "Command 1"}
        ]
        self.saved: list[dict] = []

    def get_deployed_wifi_commands(self, entry_id, *, hub_device_id=None, device_key=None):
        return list(self.deployed_slots)

    async def async_list_hub_devices(self, entry_id):
        return [
            {
                "device_key": "default",
                "deployed_device_id": DEV_ID,
                "deployed_commands_hash": OLD_HASH,
            }
        ]

    async def async_save_deployed_wifi_commands(
        self, entry_id, device_key, commands, *,
        deployed_device_id=None, commands_hash="", request_port=None,
        deployed_transport=None,
    ):
        self.saved.append(
            {
                "device_key": device_key,
                "commands": commands,
                "deployed_device_id": deployed_device_id,
                "commands_hash": commands_hash,
                "request_port": request_port,
            }
        )


def _device_entry(*, label="Command 1", long_label=None):
    return {
        "device": {"device_id": DEV_ID, "name": "Home Assistant", "brand": f"m3-default-{OLD_HASH}"},
        "commands": [
            {"command_id": 1, "command_label": label},
            {"command_id": 11, "command_label": long_label if long_label is not None else f"{label} Long Press"},
        ],
        "input_record": {"entries": []},
        "macros": [
            {"button_id": 198, "steps": []},
            {"button_id": 199, "steps": []},
        ],
        "button_bindings": [],
    }


def _payload(*, deployed_port=PORT, name="Command 1"):
    return {
        "commands": [
            {
                "name": name,
                "add_as_favorite": False,
                "hard_button": "",
                "long_press_enabled": False,
                "input_activity_id": "",
                "activities": [],
                "action": {},
            }
        ],
        "commands_hash": NEW_HASH,
        "deployed_commands_hash": OLD_HASH,
        "deployed_device_id": DEV_ID,
        "deployed_request_port": deployed_port,
    }


def _make_hub(
    monkeypatch,
    loop,
    *,
    store,
    device_entry,
    run_result=None,
    call_order=None,
    replacement_commands_persist=True,
    replacement_label_hub_version=None,
):
    calls = call_order if call_order is not None else []
    hass = FakeHass(loop)
    hub = SofabatonHub(
        hass, "entry-id", "hub-name", "127.0.0.1", 1234, {}, 9999, 10000, True, False,
    )
    hub.roku_server_enabled = True
    hub.activities = {}

    snapshot = {DEV_ID: {"brand": f"m3-default-{OLD_HASH}", "name": "Home Assistant"}}

    async def _snapshot(*_args, **_kwargs):
        return dict(snapshot)

    monkeypatch.setattr(hub, "_async_refresh_devices_snapshot", _snapshot)
    monkeypatch.setattr(wifi_deploy_module, "async_get_command_config_store", _async_return(store))

    # in-place plumbing on the proxy
    monkeypatch.setattr(hub._proxy, "backup_device", lambda *_a, **_k: device_entry)
    monkeypatch.setattr(hub._proxy, "backup_activity", lambda *_a, **_k: {})
    plans: list = []

    def _run(plan, progress_callback=None):
        plans.append(plan)
        calls.append("inplace_run")
        if run_result is not None:
            return run_result
        return {
            "status": "success",
            "completed_steps": len(plan.steps),
            "total_steps": len(plan.steps),
            "counters": {},
        }

    monkeypatch.setattr(hub._proxy, "run_wifi_inplace_plan", _run)

    # replace-path fakes (only reached on fall-through)
    async def _create(*_args, **_kwargs):
        calls.append("create")
        if replacement_commands_persist:
            # A real hub returns labels cut to its fixed-width slot.
            command_rows = {
                idx + 1: (
                    hub_command_label(str(command["display_name"]), replacement_label_hub_version)
                    if replacement_label_hub_version
                    else str(command["display_name"])
                )
                for idx, command in enumerate(_kwargs.get("commands") or [])
            }
            hub._proxy.state.commands[9] = command_rows
            hub._proxy._commands_complete.add(9)
        return {"device_id": 9, "status": "success"}

    async def _delete(dev_id, *_args, **_kwargs):
        calls.append(f"delete:{dev_id}")
        return {"status": "success"}

    async def _noop(*_args, **_kwargs):
        return None

    button_calls: list[tuple] = []

    async def _button(activity_id, button_id, device_id, command_id, **kwargs):
        button_calls.append((activity_id, button_id, device_id, command_id, kwargs))
        return {"status": "success"}

    monkeypatch.setattr(hub, "async_create_wifi_device", _create)
    monkeypatch.setattr(hub, "async_delete_device", _delete)
    monkeypatch.setattr(hub, "async_command_to_button", _button)
    monkeypatch.setattr(hub, "async_fetch_device_commands", _noop)
    monkeypatch.setattr(hub, "async_resync_remote", _noop)
    monkeypatch.setattr(hub, "_async_persist_cache_if_enabled", _noop)
    hub._inplace_plans = plans
    hub._button_calls = button_calls
    return hub


def _async_return(value):
    async def _inner(*_args, **_kwargs):
        return value

    return _inner


def _run_sync(loop, hub, payload):
    return loop.run_until_complete(
        hub.async_sync_command_config(command_payload=payload, request_port=PORT)
    )


def test_inplace_path_runs_and_skips_replace(monkeypatch):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    store = _Store()
    calls: list[str] = []
    hub = _make_hub(monkeypatch, loop, store=store, device_entry=_device_entry(), call_order=calls)

    result = _run_sync(loop, hub, _payload())

    assert result["status"] == "success"
    assert result["inplace"] is True
    assert result["wifi_device_id"] == DEV_ID
    # the hash changed, so the plan is exactly the brand head commit
    assert [s.kind for s in hub._inplace_plans[0].steps] == ["wifi_head_commit"]
    assert calls == ["inplace_run"]  # no create, no delete
    assert store.saved and store.saved[0]["request_port"] == PORT
    assert store.saved[0]["deployed_device_id"] == DEV_ID
    loop.close()


def test_port_change_falls_back_to_replace(monkeypatch):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    store = _Store()
    calls: list[str] = []
    hub = _make_hub(monkeypatch, loop, store=store, device_entry=_device_entry(), call_order=calls)

    result = _run_sync(loop, hub, _payload(deployed_port=9999))

    assert result["status"] == "success"
    assert "inplace" not in result
    assert "create" in calls and f"delete:{DEV_ID}" in calls
    assert "inplace_run" not in calls
    loop.close()


def test_missing_deployed_snapshot_falls_back(monkeypatch):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    store = _Store(deployed_slots=[])
    calls: list[str] = []
    hub = _make_hub(monkeypatch, loop, store=store, device_entry=_device_entry(), call_order=calls)

    result = _run_sync(loop, hub, _payload())

    assert result["status"] == "success"
    assert "create" in calls
    assert "inplace_run" not in calls
    loop.close()


def test_drifted_records_fall_back(monkeypatch):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    store = _Store()
    calls: list[str] = []
    hub = _make_hub(
        monkeypatch, loop, store=store,
        device_entry=_device_entry(label="Renamed In App"),
        call_order=calls,
    )

    result = _run_sync(loop, hub, _payload())

    assert result["status"] == "success"
    assert "create" in calls
    assert "inplace_run" not in calls
    loop.close()


def test_failed_replacement_command_readback_keeps_existing_device(monkeypatch):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    store = _Store()
    calls: list[str] = []
    hub = _make_hub(
        monkeypatch,
        loop,
        store=store,
        device_entry=_device_entry(),
        call_order=calls,
        replacement_commands_persist=False,
    )

    with pytest.raises(
        Exception,
        match="replacement Wifi Device did not pass command readback",
    ):
        _run_sync(loop, hub, _payload(deployed_port=9999))

    assert calls == ["create", "delete:9"]
    assert f"delete:{DEV_ID}" not in calls
    loop.close()


def test_interrupted_apply_resumes_in_place(monkeypatch):
    """Live records that already match the DESIRED config (not the deployed
    snapshot) are a half-applied earlier run — resume in place, not replace."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    # deployed snapshot says the slot used to be called "Old Name"...
    store = _Store(deployed_slots=[{"name": "Old Name"}])
    calls: list[str] = []
    # ...but the live record already carries the desired name ("Command 1"):
    # an interrupted run applied the rename before the brand commit.
    hub = _make_hub(monkeypatch, loop, store=store, device_entry=_device_entry(), call_order=calls)

    result = _run_sync(loop, hub, _payload())

    assert result["status"] == "success"
    assert result["inplace"] is True
    assert calls == ["inplace_run"]
    assert "create" not in calls
    loop.close()


def test_foreign_drift_still_declines_when_matching_neither_side(monkeypatch):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    store = _Store(deployed_slots=[{"name": "Old Name"}])
    calls: list[str] = []
    hub = _make_hub(
        monkeypatch, loop, store=store,
        device_entry=_device_entry(label="Renamed In App"),  # neither Old Name nor Command 1
        call_order=calls,
    )

    result = _run_sync(loop, hub, _payload())

    assert result["status"] == "success"
    assert "create" in calls
    assert "inplace_run" not in calls
    loop.close()


def test_rejected_inplace_write_raises_without_replace(monkeypatch):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    store = _Store()
    calls: list[str] = []
    hub = _make_hub(
        monkeypatch, loop, store=store, device_entry=_device_entry(),
        run_result={"status": "failed", "failed_at": "wifi_head_commit",
                    "message": "The hub rejected: Saving the device…"},
        call_order=calls,
    )

    with pytest.raises(wifi_deploy_module.HomeAssistantError):
        _run_sync(loop, hub, _payload())

    assert "inplace_run" in calls
    assert "create" not in calls  # never replace on top of a half-applied edit
    assert not store.saved  # deployed snapshot not advanced
    loop.close()


def test_command_record_steps_rewarm_referencing_activities(monkeypatch):
    """A plan that only rewrites command records (renames) carries no
    activity-scoped steps, but activities referencing the managed device
    hold resolved label copies — the epilogue must re-warm them anyway."""

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    store = _Store(deployed_slots=[{"name": "Old Name"}])
    calls: list[str] = []
    # Live records still carry the deployed name (no drift), desired renames.
    hub = _make_hub(
        monkeypatch, loop, store=store,
        device_entry=_device_entry(label="Old Name"),
        call_order=calls,
    )
    payload = _payload()
    payload["commands"][0]["name"] = "New Name"

    # An activity that references the managed device only through its
    # cached favorites — never named by any plan step.
    hub._proxy.state.activities[0x65] = {"name": "Watch TV", "active": False}
    hub._proxy.state.activity_favorite_slots[0x65] = [
        {"device_id": DEV_ID, "command_id": 1, "button_id": 3, "source": "cache"}
    ]

    rewarmed: list[int] = []

    async def _fetch_acts(act_id):
        rewarmed.append(int(act_id))

    monkeypatch.setattr(hub, "_async_fetch_activity_commands", _fetch_acts)

    result = _run_sync(loop, hub, payload)

    assert result["status"] == "success"
    assert result["inplace"] is True
    kinds = [s.kind for s in hub._inplace_plans[0].steps]
    assert "command_rename" in kinds
    assert all(s.payload.get("activity_id") is None for s in hub._inplace_plans[0].steps)
    assert rewarmed == [0x65]
    loop.close()


def test_replace_deploy_writes_derived_device_page_bindings(monkeypatch):
    """A hard-button claim also lands as a device-page key row on the new
    device (role-group capability), addressed with the device's own id."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    store = _Store()
    calls: list[str] = []
    hub = _make_hub(monkeypatch, loop, store=store, device_entry=_device_entry(), call_order=calls)

    payload = _payload(deployed_port=9999)  # port gate → replace path
    payload["commands"][0].update({"hard_button": "red", "long_press_enabled": True})

    result = _run_sync(loop, hub, payload)

    assert result["status"] == "success"
    assert "create" in calls
    # exactly one device-scoped binding call: entity id == new device id (9),
    # RED (0xBE) → cmd 1 with the long pair (11)
    device_scoped = [c for c in hub._button_calls if c[0] == 9]
    assert device_scoped == [
        (9, 0xBE, 9, 1, {
            "long_press_device_id": 9,
            "long_press_command_id": 11,
            "refresh_after_write": False,
        }),
    ]
    loop.close()


# ── label slot truncation (X1 diagnostics 2026-09-07) ───────────────────────

LONG_NAME = "PC Show Audio Device"  # 20 chars; "+ Long Press" = 31 > 30-char slot
TRUNCATED_LONG = "PC Show Audio Device Long Pres"


def test_truncated_long_press_label_is_not_drift(monkeypatch):
    """The hub stores "<20-char name> Long Press" cut to 30 characters. That
    live label must compare equal to the deployed expansion, so the sync
    stays in place and the planner emits no rename for it."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    store = _Store(deployed_slots=[{"name": LONG_NAME}])
    calls: list[str] = []
    hub = _make_hub(
        monkeypatch, loop, store=store,
        device_entry=_device_entry(label=LONG_NAME, long_label=TRUNCATED_LONG),
        call_order=calls,
    )
    hub._proxy.hub_version = HUB_VERSION_X1

    result = _run_sync(loop, hub, _payload(name=LONG_NAME))

    assert result["status"] == "success"
    assert result["inplace"] is True
    assert "create" not in calls
    assert [s.kind for s in hub._inplace_plans[0].steps] == ["wifi_head_commit"]
    loop.close()


def test_replacement_readback_accepts_hub_truncated_labels(monkeypatch):
    """On the replace path the readback compares labels as the hub stores
    them: the truncated long-press row is the row we wrote, so the sync
    completes and the old device is deleted."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    store = _Store(deployed_slots=[{"name": LONG_NAME}])
    calls: list[str] = []
    hub = _make_hub(
        monkeypatch, loop, store=store,
        device_entry=_device_entry(label=LONG_NAME, long_label=TRUNCATED_LONG),
        call_order=calls,
        replacement_label_hub_version=HUB_VERSION_X1,
    )
    hub._proxy.hub_version = HUB_VERSION_X1

    # port change forces the replace path
    result = _run_sync(loop, hub, _payload(name=LONG_NAME, deployed_port=9999))

    assert result["status"] == "success"
    assert "inplace" not in result
    assert "create" in calls and f"delete:{DEV_ID}" in calls
    assert "delete:9" not in calls
    loop.close()


def test_replacement_readback_still_rejects_a_genuinely_different_label(monkeypatch):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    store = _Store()
    calls: list[str] = []
    hub = _make_hub(
        monkeypatch, loop, store=store, device_entry=_device_entry(), call_order=calls,
    )
    hub._proxy.hub_version = HUB_VERSION_X1

    async def _create(*_args, **_kwargs):
        calls.append("create")
        hub._proxy.state.commands[9] = {1: "Command 1", 2: "Something Else"}
        hub._proxy._commands_complete.add(9)
        return {"device_id": 9, "status": "success"}

    monkeypatch.setattr(hub, "async_create_wifi_device", _create)

    with pytest.raises(Exception, match="did not pass command readback"):
        _run_sync(loop, hub, _payload(deployed_port=9999))

    assert calls == ["create", "delete:9"]
    loop.close()


def test_baseline_read_refreshes_the_activity_catalog_once(monkeypatch):
    """CR-L6-10 (HA mirror): one activity catalog read for the whole
    baseline, not one per activity."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    store = _Store()
    hub = _make_hub(monkeypatch, loop, store=store, device_entry=_device_entry())
    hub.activities = {101: {"name": "A"}, 102: {"name": "B"}, 103: {"name": "C"}}
    refreshes: list[str] = []
    activity_reads: list[dict] = []

    def _backup_activity(act_id, **kwargs):
        activity_reads.append(dict(kwargs))
        return {}

    monkeypatch.setattr(hub._proxy, "_refresh_catalog", lambda kind, **_k: refreshes.append(kind))
    monkeypatch.setattr(hub._proxy, "backup_activity", _backup_activity)

    _run_sync(loop, hub, _payload())

    assert refreshes == ["activities"]
    assert activity_reads == [{"refresh_catalog": False}] * 3
    loop.close()
