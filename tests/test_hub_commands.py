import asyncio
import pytest
from types import SimpleNamespace

from custom_components.sofabaton_x1s.hub import SofabatonHub, get_hub_model
from custom_components.sofabaton_x1s.const import HUB_VERSION_X1S


class FakeHass:
    def __init__(self, loop: asyncio.AbstractEventLoop):
        self.loop = loop

    async def async_add_executor_job(self, func, *args, **kwargs):  # pragma: no cover - passthrough
        return func(*args, **kwargs)

    def async_create_task(self, coro):  # pragma: no cover - passthrough
        return self.loop.create_task(coro)


def test_activity_fetch_clears_inflight_after_favorite_labels(monkeypatch):
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

    hub.hub_connected = True
    hub.activities_ready = True
    hub.devices_ready = True

    act_id = 0x0101
    act_lo = act_id & 0xFF
    dev_id = 0x0202
    cmd_id = 0x002A

    hub._proxy.state.activities[act_lo] = {"name": "Test Activity"}
    hub._proxy.state.activity_favorite_slots[act_lo] = [
        {"button_id": 1, "device_id": dev_id, "command_id": cmd_id}
    ]

    monkeypatch.setattr(hub, "_reset_entity_cache", lambda *_, **__: None)
    async def _noop_wait(*_):
        return None

    monkeypatch.setattr(hub, "_async_wait_for_buttons_ready", _noop_wait)
    monkeypatch.setattr(hub._proxy, "clear_entity_cache", lambda *_, **__: None)
    monkeypatch.setattr(hub._proxy, "get_buttons_for_entity", lambda *_, **__: ([], True))

    loop.run_until_complete(hub.async_fetch_device_commands(act_id))

    assert act_id in hub._commands_in_flight
    hub.hub_connected = True
    assert hub.get_index_state() == "loading"

    hub._proxy.state.commands[dev_id & 0xFF] = {cmd_id: "Fav Label"}
    hub._proxy.state.record_favorite_label(act_lo, dev_id, cmd_id, "Fav Label")
    hub._proxy._favorite_label_requests.clear()

    hub._on_commands_burst(f"commands:{dev_id & 0xFF}")
    loop.run_until_complete(asyncio.sleep(0))

    # Activity fetch should stay in-flight until macro burst completion is observed.
    assert act_id in hub._commands_in_flight

    hub._proxy._macros_complete.add(act_lo)
    hub._on_macros_burst(f"macros:{act_lo}")
    loop.run_until_complete(asyncio.sleep(0))

    assert act_id not in hub._commands_in_flight
    assert hub._commands_in_flight == set()
    assert hub._pending_button_fetch == set()
    hub.hub_connected = True
    hub.activities_ready = True
    hub.devices_ready = True
    assert hub.get_index_state() == "ready"

    loop.close()


def test_describe_favorites_order_includes_favorites_and_macros() -> None:
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

    act_lo = 0x65
    hub._proxy.state.activity_favorite_slots[act_lo] = [
        {"button_id": 0x01, "device_id": 0x04, "command_id": 0x06, "source": "activity_map"},
    ]
    hub._proxy.state.record_favorite_label(act_lo, 0x04, 0x06, "Command 6")
    hub._proxy.state.replace_activity_macros(
        act_lo,
        [{"command_id": 0x09, "label": "Test Macro"}],
    )

    described = hub.describe_favorites_order(act_lo, [(0x09, 0x01), (0x01, 0x02)])

    assert described == [
        {
            "fav_id": 0x09,
            "button_id": 0x09,
            "slot": 0x01,
            "type": "macro",
            "name": "Test Macro",
            "command_id": 0x09,
        },
        {
            "fav_id": 0x01,
            "button_id": 0x01,
            "activity_map_button_id": 0x01,
            "slot": 0x02,
            "type": "favorite",
            "name": "Command 6",
            "device_id": 0x04,
            "command_id": 0x06,
        },
    ]

    loop.close()


def test_describe_favorites_order_appends_cached_entries_missing_from_hub_order() -> None:
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

    act_lo = 0x65
    hub._proxy.state.activity_favorite_slots[act_lo] = [
        {"button_id": 0x01, "device_id": 0x04, "command_id": 0x1A, "source": "keymap"},
        {"button_id": 0x02, "device_id": 0x04, "command_id": 0x20, "source": "keymap"},
        {"button_id": 0x03, "device_id": 0x08, "command_id": 0x01, "source": "keymap"},
    ]
    hub._proxy.state.record_favorite_label(act_lo, 0x04, 0x1A, "Ok")
    hub._proxy.state.record_favorite_label(act_lo, 0x04, 0x20, "Yellow")
    hub._proxy.state.record_favorite_label(act_lo, 0x08, 0x01, "Dim the lights")

    described = hub.describe_favorites_order(act_lo, [(0x01, 0x01), (0x02, 0x02)])

    assert described == [
        {
            "fav_id": 0x01,
            "button_id": 0x01,
            "activity_map_button_id": 0x01,
            "slot": 0x01,
            "type": "favorite",
            "name": "Ok",
            "device_id": 0x04,
            "command_id": 0x1A,
        },
        {
            "fav_id": 0x02,
            "button_id": 0x02,
            "activity_map_button_id": 0x02,
            "slot": 0x02,
            "type": "favorite",
            "name": "Yellow",
            "device_id": 0x04,
            "command_id": 0x20,
        },
        {
            "fav_id": 0x03,
            "button_id": 0x03,
            "activity_map_button_id": 0x03,
            "slot": 0x03,
            "type": "favorite",
            "name": "Dim the lights",
            "device_id": 0x08,
            "command_id": 0x01,
        },
    ]

    loop.close()


def test_describe_favorites_order_matches_x1s_macro_and_favorite_ui_order() -> None:
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

    act_lo = 0x65
    hub._proxy.state.activity_favorite_slots[act_lo] = [
        {"button_id": 0x01, "device_id": 0x04, "command_id": 0x1A, "source": "keymap"},
        {"button_id": 0x02, "device_id": 0x04, "command_id": 0x20, "source": "keymap"},
        {"button_id": 0x03, "device_id": 0x08, "command_id": 0x01, "source": "keymap"},
        {"button_id": 0x04, "device_id": 0x08, "command_id": 0x02, "source": "keymap"},
        {"button_id": 0x05, "device_id": 0x08, "command_id": 0x03, "source": "keymap"},
        {"button_id": 0x06, "device_id": 0x08, "command_id": 0x04, "source": "keymap"},
        {"button_id": 0x07, "device_id": 0x08, "command_id": 0x05, "source": "keymap"},
    ]
    hub._proxy.state.record_favorite_label(act_lo, 0x04, 0x1A, "Ok")
    hub._proxy.state.record_favorite_label(act_lo, 0x04, 0x20, "Yellow")
    hub._proxy.state.record_favorite_label(act_lo, 0x08, 0x01, "Dim the lights")
    hub._proxy.state.record_favorite_label(act_lo, 0x08, 0x02, "Close the curtains")
    hub._proxy.state.record_favorite_label(act_lo, 0x08, 0x03, "Switch off the alarm")
    hub._proxy.state.record_favorite_label(act_lo, 0x08, 0x04, "Eat bananas")
    hub._proxy.state.record_favorite_label(act_lo, 0x08, 0x05, "Spend money")

    described = hub.describe_favorites_order(
        act_lo,
        [(0x05, 0x01), (0x06, 0x02), (0x07, 0x03), (0x01, 0x04), (0x02, 0x05), (0x03, 0x06), (0x04, 0x07)],
    )

    assert [(entry["fav_id"], entry["name"], entry["slot"]) for entry in described] == [
        (0x05, "Switch off the alarm", 0x01),
        (0x06, "Eat bananas", 0x02),
        (0x07, "Spend money", 0x03),
        (0x01, "Ok", 0x04),
        (0x02, "Yellow", 0x05),
        (0x03, "Dim the lights", 0x06),
        (0x04, "Close the curtains", 0x07),
    ]

    loop.close()


def test_async_get_cache_contents_includes_activity_workspace_payload() -> None:
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

    act_id = 0x65
    dev_id = 0x04
    keybinding_button_id = 0xB7

    hub.activities[act_id] = {"name": "Movies", "active": True}
    hub.devices[dev_id] = {"name": "Denon"}
    hub._proxy.state.devices[dev_id] = {"name": "Denon"}
    hub._proxy.state.commands[dev_id] = {0x06: "Power", 0x07: "Volume Up"}
    hub._proxy.state.activity_favorite_slots[act_id] = [
        {"button_id": 0x01, "device_id": dev_id, "command_id": 0x06, "source": "activity_map"}
    ]
    hub._proxy.state.record_favorite_label(act_id, dev_id, 0x06, "Power")
    hub._proxy.state.activity_keybinding_slots[act_id] = [
        {"button_id": keybinding_button_id, "device_id": dev_id, "command_id": 0x07, "source": "keymap"}
    ]
    hub._proxy.state.record_keybinding_label(act_id, dev_id, 0x07, "Volume Up")
    hub._proxy.state.replace_activity_macros(act_id, [{"command_id": 0x09, "label": "Night Mode"}])

    payload = loop.run_until_complete(hub.async_get_cache_contents())

    assert payload["entry_id"] == "entry-id"
    assert payload["name"] == "hub-name"
    assert payload["activities"] == [
        {
            "id": act_id,
            "name": "Movies",
            "is_active": True,
            "favorite_count": 1,
            "keybinding_count": 1,
            "macro_count": 1,
        }
    ]
    assert payload["activity_favorites"] == {
        "101": [
            {
                "button_id": 0x01,
                "device_id": dev_id,
                "device_name": "Denon",
                "command_id": 0x06,
                "label": "Power",
                "source": "activity_map",
            }
        ]
    }
    assert payload["activity_keybindings"] == {
        "101": [
            {
                "button_id": keybinding_button_id,
                "button_name": "Ch Up",
                "device_id": dev_id,
                "device_name": "Denon",
                "command_id": 0x07,
                "label": "Volume Up",
                "source": "keymap",
            }
        ]
    }
    assert payload["devices_list"] == [
        {
            "id": dev_id,
            "name": "Denon",
            "command_count": 2,
            "has_commands": True,
        }
    ]

    loop.close()


def test_device_fetch_waits_until_command_burst_completes(monkeypatch):
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

    ent_id = 0x0202
    ready = {"value": False}

    monkeypatch.setattr(hub, "_reset_entity_cache", lambda *_, **__: None)
    monkeypatch.setattr(hub._proxy, "clear_entity_cache", lambda *_, **__: None)

    def _get_commands(_ent_id: int, *, fetch_if_missing: bool = True):
        if ready["value"]:
            return ({0x01: "Power"}, True)
        return ({}, False)

    monkeypatch.setattr(hub._proxy, "get_commands_for_entity", _get_commands)

    loop.call_later(0.1, lambda: ready.__setitem__("value", True))

    loop.run_until_complete(hub.async_fetch_device_commands(ent_id))

    assert ready["value"] is True
    assert ent_id not in hub._commands_in_flight

    loop.close()


def test_roku_http_post_updates_last_ip_command_state():
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

    loop.run_until_complete(
        hub.async_handle_roku_http_post(
            path="/launch/actionid/7/Lights_On/Living_Room_TV",
            headers={"content-type": "text/plain"},
            body=b"payload",
            source_ip="127.0.0.1",
        )
    )

    ip_command = hub.get_last_ip_command()
    assert ip_command
    assert ip_command["entity_id"] == 7
    assert ip_command["command_label"] == "Lights On"
    assert ip_command["entity_name"] == "Living Room TV"
    assert ip_command["press_type"] == "short"

    assert hub.get_app_activations() == []

    loop.close()


def test_roku_http_post_parses_long_press_suffix():
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

    loop.run_until_complete(
        hub.async_handle_roku_http_post(
            path="/launch/actionid/7/Lights_On/Living_Room_TV/long",
            headers={"content-type": "text/plain"},
            body=b"payload",
            source_ip="127.0.0.1",
        )
    )

    ip_command = hub.get_last_ip_command()
    assert ip_command
    assert ip_command["command_label"] == "Lights On"
    assert ip_command["entity_name"] == "Living Room TV"
    assert ip_command["press_type"] == "long"

    loop.close()


def test_command_to_favorite_executor_job_uses_partial_not_kwargs():
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    class StrictHass(FakeHass):
        async def async_add_executor_job(self, func, *args):  # no kwargs on purpose
            return func(*args)

    hass = StrictHass(loop)

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

    calls: list[tuple[int, int, int, int]] = []

    def _command_to_favorite(activity_id, device_id, command_id, *, slot_id=0):
        calls.append((activity_id, device_id, command_id, slot_id))
        return {"status": "success"}

    hub._proxy.command_to_favorite = _command_to_favorite  # type: ignore[method-assign]

    result = loop.run_until_complete(
        hub.async_command_to_favorite(
            activity_id=101,
            device_id=6,
            command_id=4,
            slot_id=3,
        )
    )

    assert result == {"status": "success"}
    assert calls == [(101, 6, 4, 3)]

    loop.close()


def test_command_to_button_executor_job_uses_partial_not_kwargs():
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    class StrictHass(FakeHass):
        async def async_add_executor_job(self, func, *args):  # no kwargs on purpose
            return func(*args)

    hass = StrictHass(loop)

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

    calls: list[tuple] = []

    def _command_to_button(activity_id, button_id, device_id, command_id, **kwargs):
        calls.append((activity_id, button_id, device_id, command_id, kwargs))
        return {"status": "success"}

    hub._proxy.command_to_button = _command_to_button  # type: ignore[method-assign]

    result = loop.run_until_complete(
        hub.async_command_to_button(
            activity_id=101,
            button_id=0xC1,
            device_id=5,
            command_id=2,
        )
    )

    assert result == {"status": "success"}
    assert calls[0][:4] == (101, 0xC1, 5, 2)

    loop.close()




def test_clear_cache_for_executor_job_uses_partial_not_kwargs(monkeypatch):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    class StrictHass(FakeHass):
        async def async_add_executor_job(self, func, *args):  # no kwargs on purpose
            return func(*args)

    hass = StrictHass(loop)

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

    cleared: list[tuple[int, str]] = []

    def _clear_persistent_cache_for(ent_id, *, kind):
        cleared.append((ent_id, kind))

    hub._proxy.clear_persistent_cache_for = _clear_persistent_cache_for  # type: ignore[method-assign]
    hub._proxy.get_devices = lambda: ({}, True)  # type: ignore[method-assign]

    sent_signals: list[tuple[str, str]] = []

    def _fake_dispatcher_send(_hass, signal):
        sent_signals.append(("signal", signal))

    monkeypatch.setattr("custom_components.sofabaton_x1s.hub.async_dispatcher_send", _fake_dispatcher_send)

    loop.run_until_complete(hub.async_clear_cache_for(kind="activity", ent_id=42))

    assert cleared == [(42, "activity")]
    assert sent_signals

    loop.close()

def test_on_activities_burst_syncs_current_activity_from_active_flag(monkeypatch):
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

    monkeypatch.setattr(
        hub._proxy,
        "get_activities",
        lambda: ({101: {"name": "Watch a movie", "active": True, "needs_confirm": False}}, True),
    )

    hub.current_activity = None
    hub._on_activities_burst("activities")
    loop.run_until_complete(asyncio.sleep(0))

    assert hub.current_activity == 101

    loop.close()


def test_on_activity_list_update_syncs_current_activity_from_active_flag(monkeypatch):
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

    monkeypatch.setattr(
        hub._proxy,
        "get_activities",
        lambda: ({102: {"name": "Play Steamdeck", "active": True, "needs_confirm": False}}, False),
    )

    hub.current_activity = None
    hub._on_activity_list_update()
    loop.run_until_complete(asyncio.sleep(0))

    assert hub.current_activity == 102

    loop.close()


def test_activity_list_update_does_not_clear_current_until_burst_complete(monkeypatch):
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

    hub.current_activity = 101

    monkeypatch.setattr(
        hub._proxy,
        "get_activities",
        lambda: ({101: {"name": "Watch a movie", "active": False}}, False),
    )

    hub._on_activity_list_update()
    loop.run_until_complete(asyncio.sleep(0))

    assert hub.current_activity == 101

    monkeypatch.setattr(
        hub._proxy,
        "get_activities",
        lambda: ({102: {"name": "Play Steamdeck", "active": True}}, False),
    )

    hub._on_activity_list_update()
    loop.run_until_complete(asyncio.sleep(0))

    assert hub.current_activity == 102

    loop.close()


def test_activities_burst_can_clear_current_when_no_activity_active(monkeypatch):
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

    hub.current_activity = 101

    monkeypatch.setattr(
        hub._proxy,
        "get_activities",
        lambda: ({101: {"name": "Watch a movie", "active": False}}, True),
    )

    hub._on_activities_burst("activities")
    loop.run_until_complete(asyncio.sleep(0))

    assert hub.current_activity is None

    loop.close()



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
    hub.roku_server_enabled = True

    monkeypatch.setattr(hub._proxy, "request_activity_mapping", lambda _act: True)
    monkeypatch.setattr(hub._proxy, "get_buttons_for_entity", lambda *_args, **_kwargs: ([], True))

    macro_refresh_calls: list[tuple[str, int]] = []

    def _clear_entity_cache(ent_id: int, clear_buttons: bool = False, clear_favorites: bool = False, clear_macros: bool = False):
        if clear_macros:
            macro_refresh_calls.append(("clear", ent_id))

    def _get_macros_for_activity(act_id: int, *, fetch_if_missing: bool = True):
        macro_refresh_calls.append(("fetch", act_id))
        return ([], False)

    monkeypatch.setattr(hub._proxy, "clear_entity_cache", _clear_entity_cache)
    monkeypatch.setattr(hub._proxy, "get_macros_for_activity", _get_macros_for_activity)

    async def _create(*_args, **_kwargs):
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

    assert favorite_calls == [(101, 9, 1, {"refresh_after_write": False})]
    assert macro_refresh_calls == [("clear", 101), ("fetch", 101)]
    assert resync_calls == [True]

    loop.close()


def test_commands_burst_with_targeted_suffix_updates_activity_fetch_state(monkeypatch):
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

    act_id = 0x0101
    act_lo = act_id & 0xFF
    dev_id = 0x0202
    cmd_id = 0x002A

    hub._commands_in_flight.add(act_id)
    hub._proxy.state.activities[act_lo] = {"name": "Test Activity"}
    hub._proxy.state.activity_favorite_slots[act_lo] = [
        {"button_id": 1, "device_id": dev_id, "command_id": cmd_id}
    ]
    hub._proxy.state.record_favorite_label(act_lo, dev_id, cmd_id, "Fav Label")

    hub._on_commands_burst(f"commands:{dev_id & 0xFF}:{cmd_id & 0xFF}")
    loop.run_until_complete(asyncio.sleep(0))

    assert act_id not in hub._commands_in_flight

    loop.close()


def test_activity_fetch_requests_activity_map_before_favorite_command_resolution(monkeypatch):
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

    act_id = 0x0101
    act_lo = act_id & 0xFF
    call_order: list[str] = []

    hub._proxy.state.activities[act_lo] = {"name": "Test Activity"}

    monkeypatch.setattr(hub, "_reset_entity_cache", lambda *_, **__: None)
    monkeypatch.setattr(hub._proxy, "clear_entity_cache", lambda *_, **__: None)
    monkeypatch.setattr(hub._proxy, "get_buttons_for_entity", lambda *_args, **_kwargs: ([], True))
    async def _noop_wait(*_):
        return None

    monkeypatch.setattr(hub, "_async_wait_for_buttons_ready", _noop_wait)

    def _request_map(_act_id: int) -> bool:
        call_order.append("request_activity_mapping")
        hub._proxy._activity_map_complete.add(_act_id & 0xFF)
        return True

    def _ensure_commands(_act_id: int, *, fetch_if_missing: bool = True):
        call_order.append("ensure_commands_for_activity")
        return ({}, True)

    def _get_macros(_act_id: int, *, fetch_if_missing: bool = True):
        call_order.append("get_macros_for_activity")
        return ([], True)

    monkeypatch.setattr(hub._proxy, "request_activity_mapping", _request_map)
    monkeypatch.setattr(hub._proxy, "ensure_commands_for_activity", _ensure_commands)
    monkeypatch.setattr(hub._proxy, "get_macros_for_activity", _get_macros)

    loop.run_until_complete(hub.async_fetch_device_commands(act_id))

    assert call_order.index("request_activity_mapping") < call_order.index("ensure_commands_for_activity")

    loop.close()


def test_prime_buttons_requests_activity_map_before_favorite_command_resolution(monkeypatch):
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

    act_id = 0x0101
    act_lo = act_id & 0xFF
    call_order: list[str] = []

    hub._proxy.state.activities[act_lo] = {"name": "Test Activity"}

    monkeypatch.setattr(hub._proxy, "get_buttons_for_entity", lambda *_args, **_kwargs: ([], True))

    def _request_map(_act_id: int) -> bool:
        call_order.append("request_activity_mapping")
        hub._proxy._activity_map_complete.add(_act_id & 0xFF)
        return True

    def _ensure_commands(_act_id: int, *, fetch_if_missing: bool = True):
        call_order.append("ensure_commands_for_activity")
        return ({}, True)

    def _get_macros(_act_id: int, *, fetch_if_missing: bool = True):
        call_order.append("get_macros_for_activity")
        return ([], True)

    monkeypatch.setattr(hub._proxy, "request_activity_mapping", _request_map)
    monkeypatch.setattr(hub._proxy, "ensure_commands_for_activity", _ensure_commands)
    monkeypatch.setattr(hub._proxy, "get_macros_for_activity", _get_macros)

    loop.run_until_complete(hub._async_prime_buttons_for(act_id))

    assert call_order.index("request_activity_mapping") < call_order.index("ensure_commands_for_activity")

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

    monkeypatch.setattr(hub._proxy, "get_devices", lambda: (snapshot, ready["value"]))

    request_calls = {"count": 0}

    def _request_devices():
        request_calls["count"] += 1
        loop.call_later(
            0.05,
            lambda: (
                ready.__setitem__("value", True),
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



def test_refresh_devices_snapshot_default_timeout_is_15_seconds():
    assert (
        SofabatonHub._async_refresh_devices_snapshot.__defaults__ == (15.0,)
    )

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
    assert "Port 8060 may already be in use" in progress["message"]
    assert "docs/wifi_commands.md" in progress["message"]

    loop.close()


def test_hub_create_proxy_uses_explicit_hub_version() -> None:
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
        version=HUB_VERSION_X1S,
    )

    assert hub._proxy.hub_version == HUB_VERSION_X1S

    loop.close()


def test_get_hub_model_prefers_mdns_hver_over_stale_version() -> None:
    entry = SimpleNamespace(
        data={"mdns_txt": {"HVER": "2"}, "mdns_version": "X1"},
        options={"mdns_version": "X1"},
    )

    assert get_hub_model(entry) == "X1S"


def test_on_devices_burst_does_not_override_mdns_hub_version() -> None:
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    hub = SofabatonHub(
        FakeHass(loop),
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

    hub._proxy.hub_version = "X1S"
    hub._proxy.get_devices = lambda: ({1: {"name": "TV", "brand": "Sony"}}, True)

    hub._on_devices_burst("devices")
    loop.run_until_complete(asyncio.sleep(0))

    assert hub.version == "X1"

    loop.close()


def test_async_set_hub_version_persists_hver_and_updates_proxy() -> None:
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    entry = SimpleNamespace(
        entry_id="entry-id",
        title="Old title",
        data={"host": "127.0.0.1", "mac": "aa:bb:cc", "mdns_txt": {}, "mdns_version": "X1"},
        options={"mdns_version": "X1"},
    )
    updates: list[dict] = []

    class HassWithEntries(FakeHass):
        def __init__(self, l):
            super().__init__(l)
            self.config_entries = SimpleNamespace(
                async_get_entry=lambda _entry_id: entry,
                async_update_entry=lambda _entry, **kwargs: updates.append(kwargs),
            )

    hass = HassWithEntries(loop)
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

    loop.run_until_complete(hub.async_set_hub_version("X1S"))

    assert hub.version == "X1S"
    assert hub._proxy.hub_version == "X1S"
    assert hub._proxy.mdns_txt["HVER"] == "2"
    assert updates
    update = updates[-1]
    assert update["data"]["mdns_txt"]["HVER"] == "2"
    assert update["data"]["mdns_version"] == "X1S"
    assert update["options"]["mdns_version"] == "X1S"

    loop.close()

def test_prime_buttons_skips_activity_map_when_cached(monkeypatch):
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

    act_id = 0x0105
    act_lo = act_id & 0xFF

    hub._proxy.state.activity_favorite_slots[act_lo] = [
        {"button_id": 1, "device_id": 2, "command_id": 3, "source": "cache"}
    ]

    monkeypatch.setattr(hub._proxy, "get_buttons_for_entity", lambda *_args, **_kwargs: ([1, 2], True))
    monkeypatch.setattr(hub._proxy, "ensure_commands_for_activity", lambda *_args, **_kwargs: ({}, True))
    monkeypatch.setattr(hub._proxy, "get_macros_for_activity", lambda *_args, **_kwargs: ([], True))

    called = {"request_map": 0}

    def _request_map(_act_id: int) -> bool:
        called["request_map"] += 1
        return True

    monkeypatch.setattr(hub._proxy, "request_activity_mapping", _request_map)

    loop.run_until_complete(hub._async_prime_buttons_for(act_id))

    assert called["request_map"] == 0

    loop.close()


def test_prime_buttons_fetches_activity_map_when_not_cached(monkeypatch):
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

    act_id = 0x0106

    monkeypatch.setattr(hub._proxy, "get_buttons_for_entity", lambda *_args, **_kwargs: ([1, 2], True))
    monkeypatch.setattr(hub._proxy, "ensure_commands_for_activity", lambda *_args, **_kwargs: ({}, True))
    monkeypatch.setattr(hub._proxy, "get_macros_for_activity", lambda *_args, **_kwargs: ([], True))

    called = {"request_map": 0}

    def _request_map(_act_id: int) -> bool:
        called["request_map"] += 1
        hub._proxy._activity_map_complete.add(_act_id & 0xFF)
        return True

    monkeypatch.setattr(hub._proxy, "request_activity_mapping", _request_map)

    loop.run_until_complete(hub._async_prime_buttons_for(act_id))

    assert called["request_map"] == 1

    loop.close()

def test_restore_persistent_cache_primes_hub_trackers():
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

    payload = {
        "devices": {"104": {"name": "Xbox", "brand": "Xbox"}},
        "buttons": {"104": [174, 176]},
        "commands": {"104": {"1": "Power"}},
        "activity_favorite_slots": {"104": [{"button_id": 1, "device_id": 2, "command_id": 3, "source": "cache"}]},
    }

    loop.run_until_complete(hub.async_restore_persistent_cache(payload))

    assert 104 in hub._buttons_ready_for
    assert 104 in hub._command_entities
    assert 104 in hub._proxy._activity_map_complete
    assert hub.devices.get(104, {}).get("name") == "Xbox"

    loop.close()


def test_clear_cache_for_device_requests_fresh_devices(monkeypatch):
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

    refreshed = {"called": False}

    async def _fake_refresh_devices_snapshot(timeout_seconds: float = 15.0):
        refreshed["called"] = True
        return {}

    monkeypatch.setattr(hub, "_async_refresh_devices_snapshot", _fake_refresh_devices_snapshot)

    hub._proxy.clear_persistent_cache_for = lambda ent_id, *, kind: None  # type: ignore[method-assign]
    hub._proxy.get_devices = lambda: ({}, True)  # type: ignore[method-assign]

    monkeypatch.setattr("custom_components.sofabaton_x1s.hub.async_dispatcher_send", lambda *_: None)

    loop.run_until_complete(hub.async_clear_cache_for(kind="device", ent_id=9))

    assert refreshed["called"] is True

    loop.close()


def test_commands_ready_for_activity_waits_for_macro_completion(monkeypatch):
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

    act_id = 0x22
    hub._proxy.state.activities[act_id] = {"name": "Watch TV"}

    monkeypatch.setattr(hub._proxy, "ensure_commands_for_activity", lambda *_args, **_kwargs: ({1: "Power"}, True))
    monkeypatch.setattr(hub._proxy, "get_macros_for_activity", lambda *_args, **_kwargs: ([], False))

    assert hub._commands_ready_for(act_id) is False

    loop.close()
