"""The Wifi Commands deploy (wifi_deploy.py)."""

import asyncio
import pytest
from types import SimpleNamespace

import custom_components.sofabaton_x1s.hub as hub_module
import custom_components.sofabaton_x1s.wifi_deploy as wifi_deploy_module
from custom_components.sofabaton_x1s.hub import SofabatonHub
from tests.hub_fakes import FakeHass


def test_sync_command_config_omits_favorite_slot_to_avoid_overwrite(monkeypatch):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )
    # The devices-snapshot read raises on timeout instead of falling
    # through with the cached view after 15 s; stub it with that view.
    async def _stub_devices_snapshot(timeout_seconds=15.0):
        return dict(hub._proxy.state.entities("device"))

    monkeypatch.setattr(hub, "_async_refresh_devices_snapshot", _stub_devices_snapshot)
    hub.roku_server_enabled = True

    requested_maps: list[int] = []
    requested_buttons: list[tuple[int, bool]] = []

    monkeypatch.setattr(
        hub._proxy,
        "request_activity_mapping",
        lambda _act: requested_maps.append(_act) or True,
    )

    def _get_buttons_for_entity(ent_id: int, *, fetch_if_missing: bool = True):
        requested_buttons.append((ent_id, fetch_if_missing))
        return ([], True)

    monkeypatch.setattr(hub._proxy, "get_buttons_for_entity", _get_buttons_for_entity)

    cache_refresh_calls: list[tuple[int, bool, bool, bool]] = []
    macro_refresh_calls: list[tuple[str, int]] = []

    def _clear_entity_cache(ent_id: int, clear_buttons: bool = False, clear_favorites: bool = False, clear_macros: bool = False):
        cache_refresh_calls.append((ent_id, clear_buttons, clear_favorites, clear_macros))
        if clear_macros:
            macro_refresh_calls.append(("clear", ent_id))

    def _get_macros_for_activity(act_id: int, *, fetch_if_missing: bool = True):
        macro_refresh_calls.append(("fetch", act_id))
        return ([], False)

    monkeypatch.setattr(hub._proxy, "clear_entity_cache", _clear_entity_cache)
    monkeypatch.setattr(hub._proxy, "get_macros_for_activity", _get_macros_for_activity)

    create_calls: list[dict[str, object]] = []

    async def _create(*_args, **_kwargs):
        create_calls.append(dict(_kwargs))
        return {"device_id": 9, "status": "success"}

    async def _add_activity(*_args, **_kwargs):
        return {"status": "success"}

    favorite_calls: list[tuple[int, int, int, dict]] = []

    async def _favorite(activity_id, device_id, command_id, **kwargs):
        favorite_calls.append((activity_id, device_id, command_id, dict(kwargs)))
        return {"status": "success"}

    async def _button(*_args, **_kwargs):
        return {"status": "success"}

    async def _delete(*_args, **_kwargs):
        return {"status": "success"}

    monkeypatch.setattr(hub, "async_create_wifi_device", _create)
    monkeypatch.setattr(hub, "async_add_device_to_activity", _add_activity)
    monkeypatch.setattr(hub, "async_command_to_favorite", _favorite)
    monkeypatch.setattr(hub, "async_command_to_button", _button)
    monkeypatch.setattr(hub, "async_delete_device", _delete)
    monkeypatch.setattr(
        hub,
        "async_fetch_device_commands",
        lambda *_args, **_kwargs: asyncio.sleep(0),
    )

    resync_calls: list[bool] = []

    async def _resync_remote():
        resync_calls.append(True)

    monkeypatch.setattr(hub, "async_resync_remote", _resync_remote)
    monkeypatch.setattr(
        hub,
        "async_request_favorites_order",
        lambda *_a, **_k: asyncio.sleep(0, result=[(1, 1)]),
    )
    monkeypatch.setattr(
        hub,
        "async_reorder_favorites",
        lambda *_a, **_k: asyncio.sleep(0, result={"status": "success"}),
    )

    payload = {
        "commands": [
            {
                "name": "Command 1",
                "add_as_favorite": True,
                "hard_button": "",
                "activities": ["101"],
                "action": {"action": "perform-action"},
            }
        ],
        "power_on_command_id": 1,
        "commands_hash": "abc",
    }

    loop.run_until_complete(hub.async_sync_command_config(command_payload=payload, request_port=8060))

    assert create_calls == [
        {
            "device_name": "Home Assistant",
            "commands": [
                {
                    "display_name": "Command 1",
                    "press_type": "short",
                    "command_index": 0,
                },
                {
                    "display_name": "Command 1 Long Press",
                    "press_type": "long",
                    "command_index": 0,
                },
            ],
            "request_port": 8060,
            "brand_name": "m3-default-abc",
            "power_on_command_id": 1,
            "power_off_command_id": None,
            "input_command_ids": None,
            # The deploy owns the batch; its single terminal resync
            # replaces the create pipeline's app-parity save-tail sync.
            "send_remote_sync": False,
        }
    ]
    # The deploy's closing reorder repairs each activity's order once
    # (X1), so the adds skip their own live read.
    assert favorite_calls == [(101, 9, 1, {"refresh_after_write": False, "repair_order": False})]
    assert requested_maps == [101]
    assert requested_buttons == [(101, True)]
    # The post-deploy warm now runs the full per-activity refresh, which
    # clears favorites too before refetching them from the keymap burst.
    assert cache_refresh_calls == [(101, True, True, True)]
    assert macro_refresh_calls == [("clear", 101), ("fetch", 101)]
    assert resync_calls == [True]

    loop.close()


def test_sync_command_config_primes_wifi_device_commands_before_refreshing_favorites(monkeypatch):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )
    hub.roku_server_enabled = True

    async def _refresh_devices(_timeout=15.0):
        return {}

    monkeypatch.setattr(hub, "_async_refresh_devices_snapshot", _refresh_devices)
    monkeypatch.setattr(
        hub,
        "async_create_wifi_device",
        lambda *_a, **_k: asyncio.sleep(0, result={"device_id": 9, "status": "success"}),
    )
    monkeypatch.setattr(
        hub,
        "async_add_device_to_activity",
        lambda *_a, **_k: asyncio.sleep(0, result={"status": "success"}),
    )
    monkeypatch.setattr(
        hub,
        "async_command_to_favorite",
        lambda *_a, **_k: asyncio.sleep(0, result={"status": "success", "fav_id": 1}),
    )
    monkeypatch.setattr(
        hub,
        "async_request_favorites_order",
        lambda *_a, **_k: asyncio.sleep(0, result=[(1, 1)]),
    )
    monkeypatch.setattr(
        hub,
        "async_reorder_favorites",
        lambda *_a, **_k: asyncio.sleep(0, result={"status": "success"}),
    )
    monkeypatch.setattr(hub, "async_resync_remote", lambda: asyncio.sleep(0))

    call_order: list[str] = []

    def _backup_device(dev_id, *, include_blobs=True, reuse_commands=False, **_kwargs):
        assert dev_id == 9
        call_order.append("req_commands")
        hub._proxy.state.commands[dev_id & 0xFF] = {1: "Scene Lights"}
        hub._proxy._commands_complete.add(dev_id & 0xFF)
        return {"kind": "device_backup"}

    def _request_map(act_id: int) -> bool:
        call_order.append("request_activity_mapping")
        hub._proxy._activity_map_complete.add(act_id & 0xFF)
        return True

    def _get_buttons_for_entity(act_id: int, *, fetch_if_missing: bool = True):
        call_order.append("get_buttons_for_entity")
        hub._proxy.state.activity_favorite_slots[act_id & 0xFF] = [
            {"button_id": 1, "device_id": 9, "command_id": 1, "source": "cache"}
        ]
        return ([], True)

    original_ensure_commands = hub._proxy.ensure_commands_for_activity

    def _ensure_commands_for_activity(act_id: int, *, fetch_if_missing: bool = True):
        call_order.append("ensure_commands_for_activity")
        return original_ensure_commands(act_id, fetch_if_missing=fetch_if_missing)

    monkeypatch.setattr(hub._proxy, "backup_device", _backup_device)
    monkeypatch.setattr(hub._proxy, "request_activity_mapping", _request_map)
    monkeypatch.setattr(hub._proxy, "get_buttons_for_entity", _get_buttons_for_entity)
    monkeypatch.setattr(hub._proxy, "clear_entity_cache", lambda *_a, **_k: None)
    monkeypatch.setattr(hub._proxy, "get_macros_for_activity", lambda *_a, **_k: ([], True))
    monkeypatch.setattr(hub._proxy, "ensure_commands_for_activity", _ensure_commands_for_activity)
    monkeypatch.setattr(
        hub._proxy,
        "get_single_command_for_entity",
        lambda *_a, **_k: pytest.fail(
            "favorite label resolution should reuse cached REQ_COMMANDS data"
        ),
    )

    payload = {
        "commands": [
            {
                "name": "Scene Lights",
                "add_as_favorite": True,
                "hard_button": "",
                "activities": ["101"],
                "action": {"action": "perform-action"},
            }
        ],
        "commands_hash": "abc",
    }

    loop.run_until_complete(
        hub.async_sync_command_config(command_payload=payload, request_port=8060)
    )

    assert call_order.index("req_commands") < call_order.index("request_activity_mapping")
    assert call_order.index("request_activity_mapping") < call_order.index(
        "ensure_commands_for_activity"
    )
    assert hub._proxy.state.get_activity_favorite_labels(101) == [
        {"name": "Scene Lights", "device_id": 9, "command_id": 1}
    ]

    loop.close()


def test_sync_command_config_rewarms_every_touched_activity(monkeypatch):
    """A deploy must leave every touched activity's structural cache warm.

    The write steps (managed-device delete, re-add, favorite/keymap writes,
    family-0x61 reorder) each invalidate parts of the per-activity cache, so
    step 7 has to run the full per-activity refresh for every activity the
    deploy touched -- and re-read the favorites display order for activities
    that had favorites reordered.
    """

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )
    hub.roku_server_enabled = True

    async def _refresh_devices(_timeout=15.0):
        return {}

    monkeypatch.setattr(hub, "_async_refresh_devices_snapshot", _refresh_devices)
    monkeypatch.setattr(
        hub,
        "async_create_wifi_device",
        lambda *_a, **_k: asyncio.sleep(0, result={"device_id": 9, "status": "success"}),
    )
    monkeypatch.setattr(
        hub,
        "async_add_device_to_activity",
        lambda *_a, **_k: asyncio.sleep(0, result={"status": "success"}),
    )
    monkeypatch.setattr(
        hub,
        "async_command_to_favorite",
        lambda *_a, **_k: asyncio.sleep(0, result={"status": "success", "fav_id": 1}),
    )
    monkeypatch.setattr(
        hub,
        "async_command_to_button",
        lambda *_a, **_k: asyncio.sleep(0, result={"status": "success"}),
    )
    monkeypatch.setattr(
        hub,
        "async_reorder_favorites",
        lambda *_a, **_k: asyncio.sleep(0, result={"status": "success"}),
    )
    monkeypatch.setattr(
        hub,
        "async_fetch_device_commands",
        lambda *_a, **_k: asyncio.sleep(0),
    )
    monkeypatch.setattr(hub, "async_resync_remote", lambda: asyncio.sleep(0))

    order_reads: list[int] = []

    def _order_read(act_id, *_a, **_k):
        order_reads.append(int(act_id))
        return asyncio.sleep(0, result=[(1, 1)])

    monkeypatch.setattr(hub, "async_request_favorites_order", _order_read)

    warmed: list[int] = []

    async def _fetch_activity_commands(act_id: int):
        warmed.append(int(act_id))

    monkeypatch.setattr(hub, "_async_fetch_activity_commands", _fetch_activity_commands)

    payload = {
        "commands": [
            {
                "name": "Fav Command",
                "add_as_favorite": True,
                "hard_button": "",
                "activities": ["101"],
                "action": {"action": "perform-action"},
            },
            {
                "name": "Button Command",
                "add_as_favorite": False,
                "hard_button": "menu",
                "activities": ["102"],
                "action": {"action": "perform-action"},
            },
        ],
        "commands_hash": "abc",
    }

    loop.run_until_complete(
        hub.async_sync_command_config(command_payload=payload, request_port=8060)
    )

    assert warmed == [101, 102]
    # Only activity 101 got a favorite (and thus a reorder); the display
    # order is re-read once by the reorder step and once by the warm.
    assert order_reads == [101, 101]

    loop.close()


def test_sync_command_config_with_zero_configured_slots_deletes_managed_only(monkeypatch):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )
    # The devices-snapshot read raises on timeout instead of falling
    # through with the cached view after 15 s; stub it with that view.
    async def _stub_devices_snapshot(timeout_seconds=15.0):
        return dict(hub._proxy.state.entities("device"))

    monkeypatch.setattr(hub, "_async_refresh_devices_snapshot", _stub_devices_snapshot)
    hub.roku_server_enabled = True

    hub.devices = {
        11: {"brand": "m3tac0de-oldhash", "name": "Managed Device"},
        12: {"brand": "Other", "name": "Other Device"},
    }

    deleted: list[int] = []
    enabled_calls: list[bool] = []

    async def _delete(dev_id, *_args, **_kwargs):
        deleted.append(dev_id)
        return {"status": "success"}

    async def _create(*_args, **_kwargs):
        raise AssertionError("create should not be called when no slots are configured")

    async def _set_enabled(enable: bool):
        enabled_calls.append(enable)
        hub.roku_server_enabled = enable

    monkeypatch.setattr(hub, "async_delete_device", _delete)
    monkeypatch.setattr(hub, "async_create_wifi_device", _create)
    monkeypatch.setattr(hub, "async_set_roku_server_enabled", _set_enabled)

    payload = {
        "commands": [],
        "commands_hash": "abc",
    }

    result = loop.run_until_complete(
        hub.async_sync_command_config(command_payload=payload, request_port=8060)
    )

    assert deleted == [11]
    assert result["status"] == "success"
    assert result["wifi_device_id"] is None
    assert result["deleted_managed_devices"] == 1
    assert enabled_calls == [False]

    progress = hub.get_command_sync_progress()
    assert progress["status"] == "success"
    assert progress["commands_hash"] == "abc"
    assert progress["current_step"] == 7


def test_sync_command_config_with_zero_slots_does_not_enable_wifi_device(monkeypatch):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )
    # The devices-snapshot read raises on timeout instead of falling
    # through with the cached view after 15 s; stub it with that view.
    async def _stub_devices_snapshot(timeout_seconds=15.0):
        return dict(hub._proxy.state.entities("device"))

    monkeypatch.setattr(hub, "_async_refresh_devices_snapshot", _stub_devices_snapshot)
    hub.roku_server_enabled = False

    calls: list[bool] = []

    async def _set_enabled(enable: bool):
        calls.append(enable)
        hub.roku_server_enabled = enable

    async def _delete(*_args, **_kwargs):
        return {"status": "success"}

    monkeypatch.setattr(hub, "async_set_roku_server_enabled", _set_enabled)
    monkeypatch.setattr(hub, "async_delete_device", _delete)

    resync_calls: list[bool] = []

    async def _resync_remote():
        resync_calls.append(True)

    monkeypatch.setattr(hub, "async_resync_remote", _resync_remote)

    payload = {
        "commands": [],
        "commands_hash": "abc",
    }

    result = loop.run_until_complete(
        hub.async_sync_command_config(command_payload=payload, request_port=8060)
    )

    assert result["status"] == "success"
    assert calls == []
    assert resync_calls == []

    loop.close()


def test_sync_command_config_refreshes_devices_before_managed_delete(monkeypatch):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )
    hub.roku_server_enabled = False

    # Local cache is stale and does not include the managed device.
    hub.devices = {12: {"brand": "Other", "name": "Other Device"}}

    # Fresh device burst includes a managed m3tac0de-* device that should be deleted.
    snapshot = {
        11: {"brand": "m3tac0de-newhash", "name": "Managed Device"},
        12: {"brand": "Other", "name": "Other Device"},
    }
    ready = {"value": False}

    monkeypatch.setattr(hub._proxy, "get_devices", lambda **_k: (snapshot, ready["value"]))

    request_calls = {"count": 0}

    def _request_devices():
        request_calls["count"] += 1
        loop.call_later(
            0.05,
            lambda: (
                ready.__setitem__("value", True),
                # A real commit bumps the proxy serial on the frame thread
                # before the hub's burst listener runs.
                setattr(hub._proxy, "_devices_commit_serial", hub._proxy._devices_commit_serial + 1),
                hub._on_devices_burst("devices"),
            ),
        )
        return True

    monkeypatch.setattr(hub._proxy, "request_devices", _request_devices)

    deleted: list[int] = []

    async def _delete(dev_id, *_args, **_kwargs):
        deleted.append(dev_id)
        return {"status": "success"}

    monkeypatch.setattr(hub, "async_delete_device", _delete)

    payload = {
        "commands": [],
        "commands_hash": "abc",
    }

    result = loop.run_until_complete(
        hub.async_sync_command_config(command_payload=payload, request_port=8060)
    )

    assert request_calls["count"] == 1
    assert deleted == [11]
    assert result["deleted_managed_devices"] == 1

    loop.close()


def _make_sync_order_hub(monkeypatch, loop, call_order, *, fail_delete_ids=(), snapshot=None):
    """Build a hub whose sync-relevant methods record into *call_order*.

    The default hub snapshot contains one managed device (id 11) so the
    deploy runs the full delete/create/add sequence; pass ``snapshot={}``
    for a first deploy.
    """
    hass = FakeHass(loop)
    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )
    hub.roku_server_enabled = True

    if snapshot is None:
        snapshot = {11: {"brand": "m3-default-oldhash", "name": "Managed Device"}}

    async def _snapshot(*_args, **_kwargs):
        return dict(snapshot)

    monkeypatch.setattr(hub, "_async_refresh_devices_snapshot", _snapshot)
    monkeypatch.setattr(hub._proxy, "request_activity_mapping", lambda _act: True)
    monkeypatch.setattr(hub._proxy, "get_buttons_for_entity", lambda *_args, **_kwargs: ([], True))
    monkeypatch.setattr(hub._proxy, "clear_entity_cache", lambda *_, **__: None)
    monkeypatch.setattr(hub._proxy, "get_macros_for_activity", lambda *_args, **_kwargs: ([], True))

    async def _create(*_args, **_kwargs):
        call_order.append("create")
        command_rows = {
            idx + 1: str(command["display_name"])
            for idx, command in enumerate(_kwargs.get("commands") or [])
        }
        hub._proxy.state.commands[9] = command_rows
        hub._proxy._commands_complete.add(9)
        return {"device_id": 9, "status": "success"}

    async def _add_activity(act_id, dev_id, **_kwargs):
        call_order.append(f"add:{act_id}:{dev_id}")
        return {"status": "success"}

    async def _delete(dev_id, *_args, **_kwargs):
        call_order.append(f"delete:{dev_id}")
        if dev_id in fail_delete_ids:
            return None
        return {"status": "success"}

    async def _button(*_args, **_kwargs):
        return {"status": "success"}

    monkeypatch.setattr(hub, "async_create_wifi_device", _create)
    monkeypatch.setattr(hub, "async_add_device_to_activity", _add_activity)
    monkeypatch.setattr(hub, "async_delete_device", _delete)
    monkeypatch.setattr(hub, "async_command_to_button", _button)
    monkeypatch.setattr(
        hub,
        "async_fetch_device_commands",
        lambda *_args, **_kwargs: asyncio.sleep(0),
    )

    async def _resync_remote():
        return None

    monkeypatch.setattr(hub, "async_resync_remote", _resync_remote)

    backup_calls: list[tuple[int, bool]] = []

    def _backup_device(dev_id, *, include_blobs=True, reuse_commands=False, **_kwargs):
        call_order.append(f"backup:{dev_id}")
        backup_calls.append((int(dev_id), bool(reuse_commands)))
        return {"kind": "device_backup"}

    monkeypatch.setattr(hub._proxy, "backup_device", _backup_device)
    hub._test_backup_calls = backup_calls
    return hub


_SYNC_ORDER_PAYLOAD = {
    "commands": [
        {
            "name": "Command 1",
            "add_as_favorite": False,
            "hard_button": "ok",
            "activities": ["101"],
            "action": {"action": "perform-action"},
        }
    ],
    "commands_hash": "abc",
}


def test_sync_command_config_deletes_managed_device_after_activity_add(monkeypatch):
    """The old managed device is deleted only after the replacement joined
    its activities: the hub purges activities left with zero member devices,
    so the previous delete-first order destroyed any activity whose sole
    member was the managed Wifi Device."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    call_order: list[str] = []
    hub = _make_sync_order_hub(monkeypatch, loop, call_order)

    result = loop.run_until_complete(
        hub.async_sync_command_config(
            command_payload=dict(_SYNC_ORDER_PAYLOAD), request_port=8060
        )
    )

    assert call_order == ["create", "add:101:9", "delete:11", "backup:9"]
    assert result["status"] == "success"
    assert result["wifi_device_id"] == 9

    loop.close()


def test_sync_command_config_rolls_back_created_device_when_managed_delete_fails(monkeypatch):
    """A failed delete of the old managed device removes the freshly created
    replacement again; the store still points at the old device id, so
    leaving the new one behind would orphan it on the next sync."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    call_order: list[str] = []
    hub = _make_sync_order_hub(monkeypatch, loop, call_order, fail_delete_ids=(11,))

    with pytest.raises(Exception, match="Failed deleting managed device 11"):
        loop.run_until_complete(
            hub.async_sync_command_config(
                command_payload=dict(_SYNC_ORDER_PAYLOAD), request_port=8060
            )
        )

    assert call_order == ["create", "add:101:9", "delete:11", "delete:9"]

    loop.close()


def test_sync_command_config_rolls_back_when_joining_an_activity_fails(monkeypatch):
    """CR-H1-7: a replacement device that cannot join every activity is
    deleted again before the old managed device is touched."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    call_order: list[str] = []
    hub = _make_sync_order_hub(monkeypatch, loop, call_order)

    async def _add_activity(act_id, dev_id, **_kwargs):
        call_order.append(f"add:{act_id}:{dev_id}")
        return None

    monkeypatch.setattr(hub, "async_add_device_to_activity", _add_activity)

    with pytest.raises(Exception, match="Failed adding Wifi Device to all activities"):
        loop.run_until_complete(
            hub.async_sync_command_config(
                command_payload=dict(_SYNC_ORDER_PAYLOAD), request_port=8060
            )
        )

    assert call_order == ["create", "add:101:9", "delete:9"]

    loop.close()


def test_sync_command_config_replace_path_fails_on_a_refused_binding(monkeypatch):
    """CR-H1-4: a binding write the hub refuses no longer ends in 'Sync
    complete'. The deploy finishes (the new device is recorded), but the
    record reads as out of date and the sync fails, so the user re-syncs."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    call_order: list[str] = []
    hub = _make_sync_order_hub(monkeypatch, loop, call_order)

    async def _refused(*_args, **_kwargs):
        return None

    monkeypatch.setattr(hub, "async_command_to_button", _refused)

    saved: list[dict] = []

    class _Store:
        async def async_list_hub_devices(self, *_args, **_kwargs):
            return None

        def get_deployed_wifi_commands(self, *_args, **_kwargs):
            return []

        async def async_save_deployed_wifi_commands(self, entry_id, device_key, commands, **kwargs):
            saved.append(kwargs)

        def __getattr__(self, name):
            async def _noop(*_args, **_kwargs):
                return None

            return _noop

    async def _fake_get_store(_hass):
        return _Store()

    monkeypatch.setattr(wifi_deploy_module, "async_get_command_config_store", _fake_get_store)

    with pytest.raises(Exception, match=r"Failed applying 2 hub write\(s\)"):
        loop.run_until_complete(
            hub.async_sync_command_config(
                command_payload=dict(_SYNC_ORDER_PAYLOAD), request_port=8060
            )
        )

    assert "backup:9" in call_order  # the tail still ran
    assert saved and saved[-1]["deployed_device_id"] == 9
    assert saved[-1]["commands_hash"] == ""
    progress = hub.get_command_sync_progress()
    assert progress["status"] == "failed"
    # The panel gets a code and one sentence; the detail stays in the log.
    assert progress["error_code"] == "writes_refused"
    assert "button ok" not in progress["message"]

    loop.close()


def test_sync_command_config_replace_warm_reuses_verified_readback(monkeypatch):
    """On the replace path the step-7 backup-grade warm reuses the readback
    guard's verified command fetch instead of clearing and refetching the
    same table a second time: the only REQ_COMMANDS fetch is the guard's,
    and backup_device is told to reuse it."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    call_order: list[str] = []
    hub = _make_sync_order_hub(monkeypatch, loop, call_order)

    fetches: list[int] = []

    async def _fetch(ent_id, **_kwargs):
        fetches.append(int(ent_id))

    monkeypatch.setattr(hub, "async_fetch_device_commands", _fetch)

    result = loop.run_until_complete(
        hub.async_sync_command_config(
            command_payload=dict(_SYNC_ORDER_PAYLOAD), request_port=8060
        )
    )

    assert result["status"] == "success"
    assert fetches == [9]
    assert hub._test_backup_calls == [(9, True)]

    loop.close()


def test_sync_command_config_first_deploy_still_warms_command_cache(monkeypatch):
    """First deploys skip the readback guard, and the create pipeline seeds
    the command cache with the names it wrote (an unverified echo), so the
    step-7 backup-grade warm must fetch a real table (reuse_commands=False)."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    call_order: list[str] = []
    hub = _make_sync_order_hub(monkeypatch, loop, call_order, snapshot={})

    fetches: list[int] = []

    async def _fetch(ent_id, **_kwargs):
        fetches.append(int(ent_id))

    monkeypatch.setattr(hub, "async_fetch_device_commands", _fetch)

    result = loop.run_until_complete(
        hub.async_sync_command_config(
            command_payload=dict(_SYNC_ORDER_PAYLOAD), request_port=8060
        )
    )

    assert result["status"] == "success"
    assert call_order == ["create", "add:101:9", "backup:9"]
    assert fetches == []
    assert hub._test_backup_calls == [(9, False)]

    loop.close()


def test_sync_command_config_warm_runs_after_device_bindings(monkeypatch):
    """The backup-grade device warm must run AFTER the device-page key-row
    writes: those writes clear the device's cached key rows, so a warm
    taken before them would be immediately invalidated."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    call_order: list[str] = []
    hub = _make_sync_order_hub(monkeypatch, loop, call_order)

    async def _button(*args, **_kwargs):
        call_order.append(f"button:{args[0]}")
        return {"status": "success"}

    monkeypatch.setattr(hub, "async_command_to_button", _button)

    result = loop.run_until_complete(
        hub.async_sync_command_config(
            command_payload=dict(_SYNC_ORDER_PAYLOAD), request_port=8060
        )
    )

    assert result["status"] == "success"
    # _SYNC_ORDER_PAYLOAD claims the "ok" hard button unambiguously, so the
    # pipeline writes the activity binding (101) and the device-page row (9),
    # then warms the device.
    assert call_order == [
        "create",
        "add:101:9",
        "delete:11",
        "button:101",
        "button:9",
        "backup:9",
    ]

    loop.close()


def test_sync_command_config_persists_cache_without_activity_refs(monkeypatch):
    """A deploy whose slots reference no activities still changed the device
    catalog (create + managed delete), so the epilogue must bump the cache
    generation and persist unconditionally — gating on activity references
    froze the frontend on the mid-deploy snapshot and skipped the disk
    persist entirely."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    call_order: list[str] = []
    hub = _make_sync_order_hub(monkeypatch, loop, call_order)

    persists: list[bool] = []

    async def _persist():
        persists.append(True)
        return True

    monkeypatch.setattr(hub, "_async_persist_cache_if_enabled", _persist)

    payload = {
        "commands": [
            {
                "name": "Command 1",
                "add_as_favorite": False,
                "hard_button": "",
                "activities": [],
                "action": {"action": "perform-action"},
            }
        ],
        "commands_hash": "abc",
    }
    generation_before = hub.cache_generation
    result = loop.run_until_complete(
        hub.async_sync_command_config(command_payload=payload, request_port=8060)
    )

    assert result["status"] == "success"
    assert result["activities"] == []
    assert persists == [True]
    assert hub.cache_generation > generation_before
    assert call_order == ["create", "delete:11", "backup:9"]

    loop.close()


def test_sync_command_config_enables_wifi_device_before_sync(monkeypatch):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )
    # The devices-snapshot read raises on timeout instead of falling
    # through with the cached view after 15 s; stub it with that view.
    async def _stub_devices_snapshot(timeout_seconds=15.0):
        return dict(hub._proxy.state.entities("device"))

    monkeypatch.setattr(hub, "_async_refresh_devices_snapshot", _stub_devices_snapshot)

    hub.roku_server_enabled = False

    enable_calls: list[bool] = []

    async def _enable(enabled: bool):
        enable_calls.append(enabled)
        hub.roku_server_enabled = enabled

    monkeypatch.setattr(hub, "async_set_roku_server_enabled", _enable)
    monkeypatch.setattr(
        "custom_components.sofabaton_x1s.roku_listener.async_get_roku_listener",
        lambda _hass: asyncio.sleep(0, result=SimpleNamespace(get_last_start_error=lambda: None)),
    )
    monkeypatch.setattr(hub._proxy, "request_activity_mapping", lambda _act: True)
    monkeypatch.setattr(hub._proxy, "get_buttons_for_entity", lambda *_args, **_kwargs: ([], True))
    monkeypatch.setattr(hub._proxy, "clear_entity_cache", lambda *_, **__: None)
    monkeypatch.setattr(hub._proxy, "get_macros_for_activity", lambda *_args, **_kwargs: ([], True))

    async def _create(*_args, **_kwargs):
        return {"device_id": 9, "status": "success"}

    async def _add_activity(*_args, **_kwargs):
        return {"status": "success"}

    async def _favorite(*_args, **_kwargs):
        return {"status": "success"}

    async def _button(*_args, **_kwargs):
        return {"status": "success"}

    async def _delete(*_args, **_kwargs):
        return {"status": "success"}

    monkeypatch.setattr(hub, "async_create_wifi_device", _create)
    monkeypatch.setattr(hub, "async_add_device_to_activity", _add_activity)
    monkeypatch.setattr(hub, "async_command_to_favorite", _favorite)
    monkeypatch.setattr(hub, "async_command_to_button", _button)
    monkeypatch.setattr(hub, "async_delete_device", _delete)
    monkeypatch.setattr(
        hub,
        "async_fetch_device_commands",
        lambda *_args, **_kwargs: asyncio.sleep(0),
    )

    resync_calls: list[bool] = []

    async def _resync_remote():
        resync_calls.append(True)

    monkeypatch.setattr(hub, "async_resync_remote", _resync_remote)

    payload = {
        "commands": [
            {
                "name": "Command 1",
                "add_as_favorite": True,
                "hard_button": "",
                "activities": ["101"],
                "action": {"action": "perform-action"},
            }
        ],
        "commands_hash": "abc",
    }

    loop.run_until_complete(hub.async_sync_command_config(command_payload=payload, request_port=8060))

    assert enable_calls == [True]
    progress = hub.get_command_sync_progress()
    assert progress["status"] == "success"
    assert progress["current_step"] == 8
    assert resync_calls == [True]

    loop.close()


def test_sync_command_config_reports_wifi_listener_enable_failure(monkeypatch):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )

    hub.roku_server_enabled = False

    async def _enable(enabled: bool):
        hub.roku_server_enabled = enabled

    monkeypatch.setattr(hub, "async_set_roku_server_enabled", _enable)
    monkeypatch.setattr(
        "custom_components.sofabaton_x1s.roku_listener.async_get_roku_listener",
        lambda _hass: asyncio.sleep(0, result=SimpleNamespace(get_last_start_error=lambda: "address already in use")),
    )

    payload = {
        "commands": [{"name": "Command 1", "activities": ["101"]}],
        "commands_hash": "abc",
    }

    with pytest.raises(Exception) as err:
        loop.run_until_complete(
            hub.async_sync_command_config(command_payload=payload, request_port=8060)
        )

    assert "Unable to enable Wifi Device" in str(err.value)
    progress = hub.get_command_sync_progress()
    assert progress["status"] == "failed"
    assert progress["error_code"] == "port_in_use"
    assert progress["message"] == "The Wifi Device could not be enabled: its port is in use."

    loop.close()


def test_sync_command_config_reports_failed_progress_for_unexpected_errors(monkeypatch):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )
    hub.roku_server_enabled = True

    async def _boom():
        raise RuntimeError("unexpected boom")

    monkeypatch.setattr(hub, "_async_refresh_devices_snapshot", _boom)

    payload = {
        "commands": [{"name": "Command 1", "activities": ["101"]}],
        "commands_hash": "abc",
    }

    with pytest.raises(RuntimeError, match="unexpected boom"):
        loop.run_until_complete(
            hub.async_sync_command_config(command_payload=payload, request_port=8060)
        )

    progress = hub.get_command_sync_progress()
    assert progress["status"] == "failed"
    assert progress["error_code"] == "sync_failed"
    assert progress["message"] == "The sync stopped. Sync again."

    loop.close()


def test_sync_command_config_post_hoc_reorder_uses_tracked_fav_ids(monkeypatch):
    """Post-hoc reorder uses fav_ids returned by command_to_favorite calls.

    Validates the fix for the X1 fav_id-recycling bug: when the hub reuses
    freed ids for newly-added favorites, a pre-existing-snapshot approach
    mis-classifies recycled ids as "existing to preserve" and perpetuates a
    scrambled order.  Tracking the actual fav_id from each add's return value
    lets the reorder correctly place macros first and new WiFi commands after.
    """
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )
    hub.roku_server_enabled = True

    # Short-circuit the device-snapshot refresh so the test doesn't wait 15 s.
    async def _refresh_devices(_timeout=15.0):
        return {}  # no managed wifi devices
    monkeypatch.setattr(hub, "_async_refresh_devices_snapshot", _refresh_devices)

    async def _create(*_args, **_kwargs):
        return {"device_id": 9, "status": "success"}

    async def _add_activity(*_args, **_kwargs):
        return {"status": "success"}

    # Simulate X1 hub recycling: after the prior managed device was deleted,
    # fav_ids 1-5 were freed and will be reused for the new adds in add order.
    # fav_id 6 is a pre-existing macro that must stay at the top.
    recycled_ids = iter([1, 2, 3, 4, 5])

    async def _favorite(activity_id, device_id, command_id, **kwargs):
        return {"status": "success", "fav_id": next(recycled_ids)}

    # Hub state after all five adds: macro at slot 6, new favs at slots 1-5
    # but in a scrambled order inherited from the old WiFi-command ordering.
    scrambled_order: list[tuple[int, int]] = [
        (5, 1), (1, 2), (3, 3), (2, 4), (4, 5), (6, 6),
    ]

    async def _request_favorites_order(_act_id):
        return list(scrambled_order)

    reorder_calls: list[tuple[int, list[int]]] = []

    async def _reorder(activity_id, fav_id_list, *, refresh_after_write=True):
        reorder_calls.append((activity_id, list(fav_id_list)))
        return {"status": "success"}

    monkeypatch.setattr(hub, "async_create_wifi_device", _create)
    monkeypatch.setattr(hub, "async_add_device_to_activity", _add_activity)
    monkeypatch.setattr(hub, "async_command_to_favorite", _favorite)
    monkeypatch.setattr(hub, "async_request_favorites_order", _request_favorites_order)
    monkeypatch.setattr(hub, "async_reorder_favorites", _reorder)
    monkeypatch.setattr(hub, "async_resync_remote", lambda: asyncio.sleep(0))
    monkeypatch.setattr(
        hub,
        "async_fetch_device_commands",
        lambda *_args, **_kwargs: asyncio.sleep(0),
    )
    monkeypatch.setattr(hub._proxy, "request_activity_mapping", lambda _act: True)
    monkeypatch.setattr(hub._proxy, "get_buttons_for_entity", lambda *_a, **_k: ([], True))
    monkeypatch.setattr(hub._proxy, "clear_entity_cache", lambda *_a, **_k: None)
    monkeypatch.setattr(hub._proxy, "get_macros_for_activity", lambda *_a, **_k: ([], True))

    payload = {
        "commands": [
            {
                "name": f"Command {i + 1}",
                "add_as_favorite": True,
                "hard_button": "",
                "activities": ["101"],
                "action": {},
            }
            for i in range(5)
        ],
        "commands_hash": "abc",
    }

    loop.run_until_complete(hub.async_sync_command_config(command_payload=payload, request_port=8060))

    # new_fav_id_list = [1, 2, 3, 4, 5]  (tracked in add order)
    # new_fav_id_set  = {1, 2, 3, 4, 5}
    # pre_existing    = fav_ids from scrambled_order NOT in new_fav_id_set,
    #                   sorted by their slot: [(5,1),(1,2),(3,3),(2,4),(4,5),(6,6)]
    #                   → only fav_id 6 (slot 6) survives the filter
    # final_order     = [6] + [1, 2, 3, 4, 5]
    assert reorder_calls == [(101, [6, 1, 2, 3, 4, 5])]

    loop.close()


def test_sync_command_config_with_zero_slots_keeps_listener_when_another_device_is_deployed(monkeypatch):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    hass = FakeHass(loop)

    class _Store:
        def __init__(self) -> None:
            self.devices = {
                "default": {
                    "device_key": "default",
                    "deployed_device_id": 11,
                    "deployed_commands_hash": "abc",
                },
                "other": {
                    "device_key": "other",
                    "deployed_device_id": 22,
                    "deployed_commands_hash": "otherhash",
                },
            }

        async def async_save_deployed_wifi_commands(
            self,
            entry_id,
            device_key,
            commands,
            *,
            deployed_device_id=None,
            commands_hash="",
            request_port=None,
            deployed_transport=None,
        ):
            self.devices[device_key] = {
                "device_key": device_key,
                "deployed_device_id": deployed_device_id,
                "deployed_commands_hash": commands_hash,
            }

        async def async_list_hub_devices(self, entry_id):
            return list(self.devices.values())

    hass.data = {"sofabaton_x1s": {"command_config_store": _Store()}}

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )
    # The devices-snapshot read raises on timeout instead of falling
    # through with the cached view after 15 s; stub it with that view.
    async def _stub_devices_snapshot(timeout_seconds=15.0):
        return dict(hub._proxy.state.entities("device"))

    monkeypatch.setattr(hub, "_async_refresh_devices_snapshot", _stub_devices_snapshot)
    hub.roku_server_enabled = True

    hub.devices = {
        11: {"brand": "m3tac0de-abc", "name": "Managed Device"},
        22: {"brand": "m3tac0de-otherhash", "name": "Other Managed Device"},
    }

    deleted: list[int] = []
    enabled_calls: list[bool] = []

    async def _delete(dev_id, *_args, **_kwargs):
        deleted.append(dev_id)
        return {"status": "success"}

    async def _set_enabled(enable: bool):
        enabled_calls.append(enable)
        hub.roku_server_enabled = enable

    monkeypatch.setattr(hub, "async_delete_device", _delete)
    monkeypatch.setattr(hub, "async_set_roku_server_enabled", _set_enabled)

    payload = {
        "commands": [],
        "commands_hash": "abc",
        "deployed_device_id": 11,
        "deployed_commands_hash": "abc",
    }

    result = loop.run_until_complete(
        hub.async_sync_command_config(command_payload=payload, request_port=8060)
    )

    assert deleted == [11]
    assert result["status"] == "success"
    assert enabled_calls == []
    assert hub.roku_server_enabled is True

    loop.close()


def test_sync_command_config_with_missing_metadata_matches_unique_hash_only_brand(monkeypatch):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    hass = FakeHass(loop)

    class _Store:
        async def async_list_hub_devices(self, entry_id):
            assert entry_id == "entry-id"
            return [
                {
                    "device_key": "default",
                    "commands_hash": "abc",
                    "deployed_device_id": None,
                    "deployed_commands_hash": "",
                },
                {
                    "device_key": "other",
                    "commands_hash": "otherhash",
                    "deployed_device_id": None,
                    "deployed_commands_hash": "",
                },
            ]

        async def async_save_deployed_wifi_commands(
            self,
            entry_id,
            device_key,
            commands,
            *,
            deployed_device_id=None,
            commands_hash="",
            request_port=None,
            deployed_transport=None,
        ):
            return None

    hass.data = {"sofabaton_x1s": {"command_config_store": _Store()}}
    monkeypatch.setattr(
        wifi_deploy_module,
        "async_get_command_config_store",
        lambda _hass: asyncio.sleep(0, result=hass.data["sofabaton_x1s"]["command_config_store"]),
    )

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )
    # The devices-snapshot read raises on timeout instead of falling
    # through with the cached view after 15 s; stub it with that view.
    async def _stub_devices_snapshot(timeout_seconds=15.0):
        return dict(hub._proxy.state.entities("device"))

    monkeypatch.setattr(hub, "_async_refresh_devices_snapshot", _stub_devices_snapshot)
    hub.roku_server_enabled = True

    hub.devices = {
        11: {"brand": "m3tac0de-abc", "name": "Managed Device"},
        22: {"brand": "m3tac0de-otherhash", "name": "Other Managed Device"},
    }

    deleted: list[int] = []
    enabled_calls: list[bool] = []

    async def _delete(dev_id, *_args, **_kwargs):
        deleted.append(dev_id)
        return {"status": "success"}

    async def _set_enabled(enable: bool):
        enabled_calls.append(enable)
        hub.roku_server_enabled = enable

    monkeypatch.setattr(hub, "async_delete_device", _delete)
    monkeypatch.setattr(hub, "async_set_roku_server_enabled", _set_enabled)

    payload = {
        "commands": [],
        "commands_hash": "abc",
    }

    result = loop.run_until_complete(
        hub.async_sync_command_config(command_payload=payload, request_port=8060)
    )

    assert deleted == [11]
    assert result["status"] == "success"
    assert enabled_calls == [False]
    assert hub.roku_server_enabled is False

    loop.close()


def test_sync_command_config_assigns_wifi_inputs_to_device_and_activity(monkeypatch):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hass = FakeHass(loop)

    class _Store:
        async def async_list_hub_devices(self, entry_id):
            assert entry_id == "entry-id"
            return []

        async def async_save_deployed_wifi_commands(
            self,
            entry_id,
            device_key,
            commands,
            *,
            deployed_device_id=None,
            commands_hash="",
            request_port=None,
            deployed_transport=None,
        ):
            return None

    monkeypatch.setattr(
        wifi_deploy_module,
        "async_get_command_config_store",
        lambda _hass: asyncio.sleep(0, result=_Store()),
    )

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )
    hub.roku_server_enabled = True

    async def _refresh_devices(_timeout=15.0):
        return {}

    monkeypatch.setattr(hub, "_async_refresh_devices_snapshot", _refresh_devices)

    create_calls: list[dict[str, object]] = []
    add_calls: list[tuple[int, int, int | None]] = []

    async def _create(*_args, **kwargs):
        create_calls.append(dict(kwargs))
        return {"device_id": 9, "status": "success"}

    async def _add_activity(activity_id, device_id, input_cmd_id=None, **_kwargs):
        add_calls.append((activity_id, device_id, input_cmd_id))
        return {"status": "success"}

    monkeypatch.setattr(hub, "async_create_wifi_device", _create)
    monkeypatch.setattr(hub, "async_add_device_to_activity", _add_activity)
    monkeypatch.setattr(hub, "async_command_to_favorite", lambda *_a, **_k: asyncio.sleep(0, result={"status": "success"}))
    monkeypatch.setattr(
        hub,
        "async_fetch_device_commands",
        lambda *_args, **_kwargs: asyncio.sleep(0),
    )
    monkeypatch.setattr(hub, "async_resync_remote", lambda: asyncio.sleep(0))
    monkeypatch.setattr(hub._proxy, "request_activity_mapping", lambda _act: True)
    monkeypatch.setattr(hub._proxy, "get_buttons_for_entity", lambda *_a, **_k: ([], True))
    monkeypatch.setattr(hub._proxy, "clear_entity_cache", lambda *_a, **_k: None)
    monkeypatch.setattr(hub._proxy, "get_macros_for_activity", lambda *_a, **_k: ([], True))
    monkeypatch.setattr(hub._proxy, "get_commands_for_entity", lambda *_a, **_k: ([], True))

    payload = {
        "commands": [
            {
                "name": "HDMI 1",
                "add_as_favorite": False,
                "hard_button": "",
                "input_activity_id": "101",
                "activities": [],
                "action": {"action": "perform-action"},
            },
            {
                "name": "Favorite Command",
                "add_as_favorite": True,
                "hard_button": "",
                "activities": ["102"],
                "action": {"action": "perform-action"},
            },
        ],
        "commands_hash": "abc",
    }

    loop.run_until_complete(hub.async_sync_command_config(command_payload=payload, request_port=8060))

    assert create_calls == [
        {
            "device_name": "Home Assistant",
            "commands": [
                {"display_name": "HDMI 1", "press_type": "short", "command_index": 0},
                {"display_name": "Favorite Command", "press_type": "short", "command_index": 1},
                {"display_name": "HDMI 1 Long Press", "press_type": "long", "command_index": 0},
                {"display_name": "Favorite Command Long Press", "press_type": "long", "command_index": 1},
            ],
            "request_port": 8060,
            "brand_name": "m3-default-abc",
            "power_on_command_id": None,
            "power_off_command_id": None,
            "input_command_ids": [1],
            # The deploy owns the batch; its single terminal resync
            # replaces the create pipeline's app-parity save-tail sync.
            "send_remote_sync": False,
        }
    ]
    assert add_calls == [
        (101, 9, 1),
        (102, 9, None),
    ]

    loop.close()


def test_on_devices_burst_reconciles_legacy_managed_wifi_device_id(monkeypatch) -> None:
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hass = FakeHass(loop)

    class _Store:
        def __init__(self) -> None:
            self.devices = [
                {
                    "device_key": "default",
                    "deployed_device_id": None,
                    "deployed_commands_hash": "",
                }
            ]
            self.set_calls: list[list[tuple[str, int | None, str]]] = []

        async def async_list_hub_devices(self, entry_id):
            assert entry_id == "entry-id"
            return list(self.devices)

        async def async_reconcile_deployed_wifi_devices(self, entry_id, assignments):
            assert entry_id == "entry-id"
            self.set_calls.append(list(assignments))
            for device in self.devices:
                if device["device_key"] == "default":
                    device["deployed_device_id"] = assignments[0][1] if assignments else None
                    device["deployed_commands_hash"] = assignments[0][2] if assignments else ""
            return True

    store = _Store()
    hass.data = {"sofabaton_x1s": {"command_config_store": store}}
    monkeypatch.setattr(
        wifi_deploy_module,
        "async_get_command_config_store",
        lambda _hass: asyncio.sleep(0, result=store),
    )

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
        version="X1",
    )

    hub._proxy.get_devices = lambda **_k: ({11: {"name": "Managed Device", "brand": "m3tac0de-abc"}}, True)

    hub._on_devices_burst("devices")
    loop.run_until_complete(asyncio.sleep(0))

    assert store.set_calls == [[("default", 11, "abc")]]
    assert store.devices[0]["deployed_device_id"] == 11

    loop.close()


def test_on_devices_burst_reconciles_hash_only_wifi_devices_by_unique_hash(monkeypatch) -> None:
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hass = FakeHass(loop)

    class _Store:
        def __init__(self) -> None:
            self.devices = [
                {
                    "device_key": "default",
                    "commands_hash": "abc",
                    "deployed_device_id": None,
                    "deployed_commands_hash": "",
                },
                {
                    "device_key": "other",
                    "commands_hash": "def",
                    "deployed_device_id": None,
                    "deployed_commands_hash": "",
                },
            ]
            self.set_calls: list[list[tuple[str, int | None, str]]] = []

        async def async_list_hub_devices(self, entry_id):
            assert entry_id == "entry-id"
            return list(self.devices)

        async def async_reconcile_deployed_wifi_devices(self, entry_id, assignments):
            assert entry_id == "entry-id"
            self.set_calls.append(list(assignments))
            assignment_map = {device_key: (deployed_device_id, commands_hash) for device_key, deployed_device_id, commands_hash in assignments}
            for device in self.devices:
                assignment = assignment_map.get(device["device_key"])
                device["deployed_device_id"] = assignment[0] if assignment else None
                device["deployed_commands_hash"] = assignment[1] if assignment else ""
            return True

    store = _Store()
    hass.data = {"sofabaton_x1s": {"command_config_store": store}}
    monkeypatch.setattr(
        wifi_deploy_module,
        "async_get_command_config_store",
        lambda _hass: asyncio.sleep(0, result=store),
    )
    monkeypatch.setattr(
        wifi_deploy_module,
        "async_get_command_config_store",
        lambda _hass: asyncio.sleep(0, result=store),
    )

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
        version="X1",
    )

    hub._proxy.get_devices = lambda **_k: (
        {
            11: {"name": "Managed Device", "brand": "m3tac0de-abc"},
            22: {"name": "Other Managed Device", "brand": "m3tac0de-def"},
        },
        True,
    )

    hub._on_devices_burst("devices")
    loop.run_until_complete(asyncio.sleep(0))

    assert store.set_calls == [[
        ("default", 11, "abc"),
        ("other", 22, "def"),
    ]]
    assert store.devices[0]["deployed_device_id"] == 11
    assert store.devices[1]["deployed_device_id"] == 22

    loop.close()


def test_on_devices_burst_repairs_duplicate_deployed_device_claims_by_unique_hash(monkeypatch) -> None:
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hass = FakeHass(loop)

    class _Store:
        def __init__(self) -> None:
            self.devices = [
                {
                    "device_key": "default",
                    "commands_hash": "homehash",
                    "deployed_device_id": 3,
                    "deployed_commands_hash": "homehash",
                },
                {
                    "device_key": "other",
                    "commands_hash": "lghash",
                    "deployed_device_id": 3,
                    "deployed_commands_hash": "lghash",
                },
            ]
            self.reconcile_calls: list[list[tuple[str, int | None, str]]] = []

        async def async_list_hub_devices(self, entry_id):
            assert entry_id == "entry-id"
            return list(self.devices)

        async def async_reconcile_deployed_wifi_devices(self, entry_id, assignments):
            assert entry_id == "entry-id"
            self.reconcile_calls.append(list(assignments))
            assignment_map = {device_key: (deployed_device_id, commands_hash) for device_key, deployed_device_id, commands_hash in assignments}
            for device in self.devices:
                assignment = assignment_map.get(device["device_key"])
                if assignment is None:
                    device["deployed_device_id"] = None
                    device["deployed_commands_hash"] = ""
                else:
                    device["deployed_device_id"] = assignment[0]
                    device["deployed_commands_hash"] = assignment[1]
            return True

    store = _Store()
    hass.data = {"sofabaton_x1s": {"command_config_store": store}}
    monkeypatch.setattr(
        wifi_deploy_module,
        "async_get_command_config_store",
        lambda _hass: asyncio.sleep(0, result=store),
    )

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
        version="X1",
    )

    hub._proxy.get_devices = lambda **_k: (
        {
            3: {"name": "Managed Device", "brand": "m3tac0de-lghash"},
        },
        True,
    )

    hub._on_devices_burst("devices")
    loop.run_until_complete(asyncio.sleep(0))

    assert store.reconcile_calls == [[("other", 3, "lghash")]]
    assert store.devices[0]["deployed_device_id"] is None
    assert store.devices[1]["deployed_device_id"] == 3

    loop.close()


def test_sync_command_config_aborts_on_activity_label_mismatch(monkeypatch):
    """Preflight refuses to deploy when a configured activity id now carries a
    different name on the hub (id reuse after app-side delete/recreate)."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )
    hub.roku_server_enabled = True
    monkeypatch.setattr(hub._proxy, "can_issue_commands", lambda: True)

    catalog_calls: list[str] = []

    async def _request_catalog(kind, timeout_seconds=30.0):
        catalog_calls.append(kind)
        hub._activities_generation += 1
        hub.activities = {101: {"name": "Movie Night", "active": False}}
        return dict(hub.activities)

    monkeypatch.setattr(hub, "async_request_catalog", _request_catalog)

    delete_calls: list[int] = []

    async def _delete(dev_id, *_args, **_kwargs):
        delete_calls.append(dev_id)
        return {"status": "success"}

    monkeypatch.setattr(hub, "async_delete_device", _delete)

    payload = {
        "commands": [{"name": "Command 1", "add_as_favorite": True, "activities": ["101"]}],
        "commands_hash": "abc",
        "activity_labels": {"101": "TV"},
    }

    from homeassistant.exceptions import HomeAssistantError

    with pytest.raises(HomeAssistantError, match="Failed Activity validation"):
        loop.run_until_complete(
            hub.async_sync_command_config(command_payload=payload, request_port=8060)
        )

    assert catalog_calls == ["activities"]
    # The preflight must abort before the destructive delete/recreate begins.
    assert delete_calls == []

    progress = hub.get_command_sync_progress()
    assert progress["status"] == "failed"
    assert progress["error_code"] == "activities_changed"
    assert "Re-select" in progress["message"]
    assert '"Movie Night"' not in progress["message"]  # the detail stays in the log

    loop.close()


def test_sync_command_config_aborts_when_activity_refresh_fails(monkeypatch):
    """If the fresh activity read never lands, abort instead of deploying
    against the stale cached catalog."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )
    hub.roku_server_enabled = True
    monkeypatch.setattr(hub._proxy, "can_issue_commands", lambda: True)

    async def _request_catalog(kind, timeout_seconds=30.0):
        raise TimeoutError("the burst never arrived")

    monkeypatch.setattr(hub, "async_request_catalog", _request_catalog)

    delete_calls: list[int] = []

    async def _delete(dev_id, *_args, **_kwargs):
        delete_calls.append(dev_id)
        return {"status": "success"}

    monkeypatch.setattr(hub, "async_delete_device", _delete)

    payload = {
        "commands": [{"name": "Command 1", "add_as_favorite": True, "activities": ["101"]}],
        "commands_hash": "abc",
        "activity_labels": {"101": "TV"},
    }

    from homeassistant.exceptions import HomeAssistantError

    with pytest.raises(HomeAssistantError, match="Failed to refresh the Activity list"):
        loop.run_until_complete(
            hub.async_sync_command_config(command_payload=payload, request_port=8060)
        )

    assert delete_calls == []

    loop.close()


def test_sync_command_config_proceeds_when_activity_labels_match(monkeypatch):
    """Matching labels (or absent snapshots) let the deploy continue after the
    fresh catalog read."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )
    # The devices-snapshot read raises on timeout instead of falling
    # through with the cached view after 15 s; stub it with that view.
    async def _stub_devices_snapshot(timeout_seconds=15.0):
        return dict(hub._proxy.state.entities("device"))

    monkeypatch.setattr(hub, "_async_refresh_devices_snapshot", _stub_devices_snapshot)
    hub.roku_server_enabled = True
    monkeypatch.setattr(hub._proxy, "can_issue_commands", lambda: True)

    catalog_calls: list[str] = []

    async def _request_catalog(kind, timeout_seconds=30.0):
        catalog_calls.append(kind)
        hub._activities_generation += 1
        hub.activities = {101: {"name": "TV", "active": False}}
        return dict(hub.activities)

    monkeypatch.setattr(hub, "async_request_catalog", _request_catalog)

    monkeypatch.setattr(hub._proxy, "request_activity_mapping", lambda _act: True)
    monkeypatch.setattr(
        hub._proxy,
        "get_buttons_for_entity",
        lambda ent_id, *, fetch_if_missing=True: ([], True),
    )
    monkeypatch.setattr(
        hub._proxy,
        "clear_entity_cache",
        lambda ent_id, clear_buttons=False, clear_favorites=False, clear_macros=False: None,
    )
    monkeypatch.setattr(
        hub._proxy,
        "get_macros_for_activity",
        lambda act_id, *, fetch_if_missing=True: ([], False),
    )

    create_calls: list[dict[str, object]] = []

    async def _create(*_args, **_kwargs):
        create_calls.append(dict(_kwargs))
        return {"device_id": 9, "status": "success"}

    add_calls: list[int] = []

    async def _add_activity(activity_id, *_args, **_kwargs):
        add_calls.append(activity_id)
        return {"status": "success"}

    async def _favorite(*_args, **_kwargs):
        return {"status": "success"}

    async def _button(*_args, **_kwargs):
        return {"status": "success"}

    async def _delete(*_args, **_kwargs):
        return {"status": "success"}

    async def _resync_remote():
        return None

    monkeypatch.setattr(hub, "async_create_wifi_device", _create)
    monkeypatch.setattr(hub, "async_add_device_to_activity", _add_activity)
    monkeypatch.setattr(hub, "async_command_to_favorite", _favorite)
    monkeypatch.setattr(hub, "async_command_to_button", _button)
    monkeypatch.setattr(hub, "async_delete_device", _delete)
    monkeypatch.setattr(hub, "async_resync_remote", _resync_remote)
    monkeypatch.setattr(
        hub,
        "async_fetch_device_commands",
        lambda *_args, **_kwargs: asyncio.sleep(0),
    )

    payload = {
        "commands": [
            {
                "name": "Command 1",
                "add_as_favorite": True,
                "activities": ["101"],
                "action": {"action": "perform-action"},
            }
        ],
        "power_on_command_id": 1,
        "commands_hash": "abc",
        "activity_labels": {"101": "TV"},
    }

    result = loop.run_until_complete(
        hub.async_sync_command_config(command_payload=payload, request_port=8060)
    )

    assert result["status"] == "success"
    assert catalog_calls == ["activities"]
    assert len(create_calls) == 1
    assert add_calls == [101]

    loop.close()


def test_sync_command_config_ignores_orphaned_activities(monkeypatch):
    """A slot with an activities list but neither add_as_favorite nor a hard
    button must not pull the wifi device into those activities (issue #258:
    the editor auto-selects a default activity and hides — without clearing —
    the selection when both toggles are off)."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )
    # The devices-snapshot read raises on timeout instead of falling
    # through with the cached view after 15 s; stub it with that view.
    async def _stub_devices_snapshot(timeout_seconds=15.0):
        return dict(hub._proxy.state.entities("device"))

    monkeypatch.setattr(hub, "_async_refresh_devices_snapshot", _stub_devices_snapshot)
    hub.roku_server_enabled = True
    monkeypatch.setattr(hub._proxy, "can_issue_commands", lambda: True)

    catalog_calls: list[str] = []

    async def _request_catalog(kind, timeout_seconds=30.0):
        catalog_calls.append(kind)
        hub._activities_generation += 1
        return dict(hub.activities)

    monkeypatch.setattr(hub, "async_request_catalog", _request_catalog)

    create_calls: list[dict[str, object]] = []

    async def _create(*_args, **_kwargs):
        create_calls.append(dict(_kwargs))
        return {"device_id": 9, "status": "success"}

    add_calls: list[int] = []

    async def _add_activity(activity_id, *_args, **_kwargs):
        add_calls.append(activity_id)
        return {"status": "success"}

    async def _delete(*_args, **_kwargs):
        return {"status": "success"}

    async def _resync_remote():
        return None

    monkeypatch.setattr(hub, "async_create_wifi_device", _create)
    monkeypatch.setattr(hub, "async_add_device_to_activity", _add_activity)
    monkeypatch.setattr(hub, "async_delete_device", _delete)
    monkeypatch.setattr(hub, "async_resync_remote", _resync_remote)
    monkeypatch.setattr(
        hub,
        "async_fetch_device_commands",
        lambda *_args, **_kwargs: asyncio.sleep(0),
    )

    payload = {
        "commands": [
            {
                "name": "Command 1",
                "add_as_favorite": False,
                "hard_button": "",
                "activities": ["101", "102"],
                "action": {"action": "perform-action"},
            }
        ],
        "commands_hash": "abc",
    }

    result = loop.run_until_complete(
        hub.async_sync_command_config(command_payload=payload, request_port=8060)
    )

    assert result["status"] == "success"
    assert len(create_calls) == 1
    # No honored activity references: no preflight catalog read, no adds.
    assert catalog_calls == []
    assert add_calls == []

    loop.close()


def test_wifi_events_device_rebinds_by_brand_after_restore():
    """Plan §6.5: a restored Wifi Events device comes back with a fresh hub
    device id but the same ``m3-haevents-<hash>`` brand. The managed-brand
    reconcile must re-attach store ownership by that brand — parsing the
    reserved ``haevents`` key + deployed hash out of the brand and matching
    the store record whose stale ``deployed_device_id`` no longer resolves.
    """

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hass = FakeHass(loop)
    hub = SofabatonHub(
        hass, "entry-id", "hub-name", "127.0.0.1", 1234, {}, 9999, 10000, True, False,
    )
    try:
        events_hash = "abc123def4567"
        new_device_id = 0x2A  # the hub minted a new id on restore
        # A restored events device on the live hub carries the reserved brand.
        hub.devices[new_device_id] = {
            "name": "Wifi Events",
            "brand": f"m3-haevents-{events_hash}",
        }
        # Plus an unrelated managed user device, to prove key/hash scoping.
        hub.devices[0x0B] = {"name": "Wifi Lights", "brand": "m3-abcd1234-otherhash0000"}

        managed = hub._managed_wifi_devices()
        events_rows = [row for row in managed if row[1] == "haevents"]
        # The brand parsed into (id, reserved key, hash, brand).
        assert events_rows == [(new_device_id, "haevents", events_hash, f"m3-haevents-{events_hash}")]

        # The store record lost its deployed_device_id (a restore drops it)
        # but still knows the deployed hash — the reconcile matches by it.
        matches, ambiguous = hub._match_managed_wifi_devices(
            managed_devices=managed,
            device_key="haevents",
            deployed_device_id=None,
            deployed_commands_hash=events_hash,
        )
        assert ambiguous is False
        assert matches == [(new_device_id, "haevents", events_hash, f"m3-haevents-{events_hash}")]

        # Even with the hash unknown (e.g. a hash-version bump), the reserved
        # key alone still re-binds it — the key carries identity.
        by_key, ambiguous_by_key = hub._match_managed_wifi_devices(
            managed_devices=managed,
            device_key="haevents",
            deployed_device_id=None,
            deployed_commands_hash="",
        )
        assert ambiguous_by_key is False
        assert by_key == [(new_device_id, "haevents", events_hash, f"m3-haevents-{events_hash}")]
    finally:
        loop.close()


def test_wifi_sync_repairs_x1_quick_access_order_per_known_activity():
    """The Wifi Commands sync ends with the X1 quick-access check for every
    activity it touched (the heal for tables an older restore left short)."""

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hass = FakeHass(loop)
    hub = SofabatonHub(hass, "entry-id", "hub-name", "127.0.0.1", 1234, {}, 9999, 10000, True, False)
    hub.activities = {0x65: {"name": "Watch Apple TV"}, 0x67: {"name": "play xbox"}}
    calls: list[int] = []

    def _repair(act_id):
        calls.append(act_id)
        return act_id == 0x67

    hub._proxy.repair_x1_quick_access_order = _repair
    try:
        hub.version = hub_module.HUB_VERSION_X1
        # 0x69 is not an activity on the hub (purged): skipped.
        assert loop.run_until_complete(hub._async_repair_x1_quick_access([0x67, 0x65, 0x69, 0x65])) is True
        assert calls == [0x65, 0x67]

        calls.clear()
        hub.version = "X1S"
        assert loop.run_until_complete(hub._async_repair_x1_quick_access([0x65])) is False
        assert calls == []
    finally:
        loop.close()
