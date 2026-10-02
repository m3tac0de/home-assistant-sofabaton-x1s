"""Wifi Commands ingress over HTTP and MQTT (wifi_ingress.py)."""

import asyncio
import logging
from types import SimpleNamespace

import custom_components.sofabaton_x1s.wifi_ingress as wifi_ingress_module
from custom_components.sofabaton_x1s.hub import SofabatonHub
from tests.hub_fakes import FakeHass


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


def test_roku_http_post_runs_configured_short_press_action():
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    hass = FakeHass(loop)
    service_calls: list[tuple[str, str, dict, dict | None, bool]] = []
    async def _async_call(domain, service, data, target=None, blocking=False):
        service_calls.append((domain, service, data, target, blocking))
    async def _async_get_hub_config(_entry_id, **_kwargs):
        return {
            "commands": [
                {
                    "name": "Lights On",
                    "action": {
                        "action": "perform-action",
                        "perform_action": "light.turn_on",
                        "target": {"entity_id": "light.living_room"},
                    },
                }
            ]
        }
    hass.services = SimpleNamespace(
        async_call=_async_call
    )
    hass.data = {
        "sofabaton_x1s": {
            "command_config_store": SimpleNamespace(
                async_get_hub_config=_async_get_hub_config,
                is_wifi_events_hub_device=lambda *_args: False,
            )
        }
    }

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

    assert service_calls == [
        (
            "light",
            "turn_on",
            {},
            {"entity_id": "light.living_room"},
            False,
        )
    ]

    loop.close()


def test_roku_http_post_runs_configured_long_press_action():
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    hass = FakeHass(loop)
    service_calls: list[tuple[str, str, dict, dict | None, bool]] = []
    async def _async_call(domain, service, data, target=None, blocking=False):
        service_calls.append((domain, service, data, target, blocking))
    async def _async_get_hub_config(_entry_id, **_kwargs):
        return {
            "commands": [
                {
                    "name": "Lights On",
                    "long_press_enabled": True,
                    "action": {
                        "action": "perform-action",
                        "perform_action": "light.turn_off",
                        "target": {"entity_id": "light.short_press_only"},
                    },
                    "long_press_action": {
                        "action": "perform-action",
                        "perform_action": "light.turn_on",
                        "target": {"entity_id": "light.long_press_target"},
                    },
                }
            ]
        }
    hass.services = SimpleNamespace(
        async_call=_async_call
    )
    hass.data = {
        "sofabaton_x1s": {
            "command_config_store": SimpleNamespace(
                async_get_hub_config=_async_get_hub_config,
                is_wifi_events_hub_device=lambda *_args: False,
            )
        }
    }

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

    assert service_calls == [
        (
            "light",
            "turn_on",
            {},
            {"entity_id": "light.long_press_target"},
            False,
        )
    ]

    loop.close()


def test_wifi_events_long_callback_aliases_the_event_action():
    # wifi-events-single-record-plan §3.2: until the user's Sync retires
    # the long records, a /long callback on the Wifi Events device runs the
    # event's one action and reports a plain press (no /longpress suffix).
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    hass = FakeHass(loop)
    service_calls: list[tuple[str, str, dict, dict | None, bool]] = []

    async def _async_call(domain, service, data, target=None, blocking=False):
        service_calls.append((domain, service, data, target, blocking))

    event_slot = {
        "name": "Movie Night",
        "long_press_enabled": False,
        "action": {
            "action": "perform-action",
            "perform_action": "script.turn_on",
            "target": {"entity_id": "script.movie_night"},
        },
    }

    class _Store:
        def is_wifi_events_hub_device(self, entry_id, hub_device_id):
            return entry_id == "entry-id" and hub_device_id == 9

        def get_deployed_wifi_commands(self, entry_id, *, hub_device_id=None, device_key=None):
            return [event_slot] if hub_device_id == 9 else []

        def get_live_wifi_command_slot(self, entry_id, *, command_index, hub_device_id=None, device_key=None):
            return event_slot if hub_device_id == 9 and command_index == 0 else None

        async def async_get_hub_config(self, _entry_id, **_kwargs):
            return {"commands": []}

    hass.services = SimpleNamespace(async_call=_async_call)
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
    hub.roku_server_enabled = True

    loop.run_until_complete(
        hub.async_handle_roku_http_post(
            path="/launch/actionid/9/0/long",
            headers={"content-type": "text/plain"},
            body=b"payload",
            source_ip="127.0.0.1",
        )
    )

    assert service_calls == [
        ("script", "turn_on", {}, {"entity_id": "script.movie_night"}, False)
    ]
    ip_command = hub.get_last_ip_command()
    assert ip_command["command_label"] == "Movie Night"
    assert ip_command["press_type"] == "short"

    loop.close()


def test_roku_http_post_resolves_slot_callback_from_migrated_single_device_store():
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    hass = FakeHass(loop)
    service_calls: list[tuple[str, str, dict, dict | None, bool]] = []

    async def _async_call(domain, service, data, target=None, blocking=False):
        service_calls.append((domain, service, data, target, blocking))

    class _Store:
        def get_deployed_wifi_commands(self, entry_id, *, hub_device_id=None, device_key=None):
            if entry_id != "entry-id":
                return []
            if hub_device_id == 7:
                return [
                    {
                        "name": "Legacy Slot",
                        "action": {
                            "action": "perform-action",
                            "perform_action": "light.turn_on",
                            "target": {"entity_id": "light.deployed_target"},
                        },
                    }
                ]
            return []

        def get_live_wifi_command_slot(self, entry_id, *, command_index, hub_device_id=None, device_key=None):
            if entry_id != "entry-id" or hub_device_id != 7 or command_index != 0:
                return None
            return {
                "name": "Edited Slot",
                "action": {
                    "action": "perform-action",
                    "perform_action": "light.turn_on",
                    "target": {"entity_id": "light.live_target"},
                },
            }

        async def async_get_hub_config(self, _entry_id, **_kwargs):
            return {"commands": []}

    hass.services = SimpleNamespace(async_call=_async_call)
    hass.data = {
        "sofabaton_x1s": {
            "command_config_store": _Store()
        }
    }

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
            path="/launch/actionid/7/0/short",
            headers={"content-type": "text/plain"},
            body=b"payload",
            source_ip="127.0.0.1",
        )
    )

    ip_command = hub.get_last_ip_command()
    assert ip_command
    assert ip_command["command_label"] == "Legacy Slot"
    assert service_calls == [
        (
            "light",
            "turn_on",
            {},
            {"entity_id": "light.live_target"},
            False,
        )
    ]

    loop.close()


def test_roku_http_post_new_format_uses_cached_device_name_when_local_catalog_is_stale():
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    hass = FakeHass(loop)

    class _Store:
        def get_deployed_wifi_commands(self, entry_id, *, hub_device_id=None, device_key=None):
            if entry_id == "entry-id" and hub_device_id == 7:
                return [{"name": "Edited Slot"}]
            return []

        def get_live_wifi_command_slot(self, entry_id, *, command_index, hub_device_id=None, device_key=None):
            return None

        async def async_get_hub_config(self, _entry_id, **_kwargs):
            return {"commands": []}

    hass.data = {
        "sofabaton_x1s": {
            "command_config_store": _Store()
        }
    }

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
    hub.devices = {}
    hub._proxy.state.devices[7] = {
        "brand": "m3tac0de-default-hash",
        "name": "Fresh Wifi Device",
    }

    loop.run_until_complete(
        hub.async_handle_roku_http_post(
            path="/launch/actionid/7/0/short",
            headers={"content-type": "text/plain"},
            body=b"payload",
            source_ip="127.0.0.1",
        )
    )

    ip_command = hub.get_last_ip_command()
    assert ip_command
    assert ip_command["command_label"] == "Edited Slot"
    assert ip_command["entity_name"] == "Fresh Wifi Device"

    loop.close()


def test_roku_http_post_new_format_lazy_loads_command_store(monkeypatch):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    hass = FakeHass(loop)
    hass.data = {"sofabaton_x1s": {}}

    class _Store:
        def get_deployed_wifi_commands(self, entry_id, *, hub_device_id=None, device_key=None):
            if entry_id == "entry-id" and hub_device_id == 8:
                return [{"name": "Scene Lights"}]
            return []

        def get_live_wifi_command_slot(self, entry_id, *, command_index, hub_device_id=None, device_key=None):
            if entry_id == "entry-id" and hub_device_id == 8 and command_index == 0:
                return {
                    "name": "Scene Lights",
                    "action": {"action": "perform-action", "perform_action": "script.scene_lights"},
                }
            return None

        async def async_get_hub_config(self, _entry_id, **_kwargs):
            return {"commands": []}

    async def _fake_get_store(_hass):
        return _Store()

    monkeypatch.setattr(wifi_ingress_module, "async_get_command_config_store", _fake_get_store)

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
            path="/launch/actionid/8/0/short",
            headers={"content-type": "text/plain"},
            body=b"payload",
            source_ip="127.0.0.1",
        )
    )

    ip_command = hub.get_last_ip_command()
    assert ip_command
    assert ip_command["command_label"] == "Scene Lights"

    loop.close()


def test_roku_http_post_logs_mapped_command(caplog):
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

    with caplog.at_level(logging.INFO, logger="custom_components.sofabaton_x1s.hub"):
        loop.run_until_complete(
            hub.async_handle_roku_http_post(
                path="/launch/actionid/7/Lights_On/Living_Room_TV/long",
                headers={"content-type": "text/plain"},
                body=b"payload",
                source_ip="127.0.0.1",
            )
        )

    messages = [record.getMessage() for record in caplog.records]
    assert any(
        "[entry-id] [WIFI_HTTP] mapped listener request source_ip=127.0.0.1 device_id=7 device_name=Living Room TV command=Lights On press_type=long path=/launch/actionid/7/Lights_On/Living_Room_TV/long"
        in message
        for message in messages
    )

    loop.close()


def _mqtt_msg(payload, retain=False):
    return SimpleNamespace(payload=payload, retain=retain)


def _make_mqtt_ingress_fake(dispatched):
    fake = SimpleNamespace(
        _log=logging.getLogger("test-mqtt-ingress"),
        hass=None,
        entry_id="entry-id",
        devices={11: {"name": "Lights"}},
    )
    fake._get_cached_device_name = lambda device_id: None

    async def fake_dispatch(**kwargs):
        dispatched.append(kwargs)

    fake._async_dispatch_wifi_press = fake_dispatch
    return fake


class _FakeMqttStore:
    def __init__(self):
        self.devices = [
            {
                "device_key": "lights",
                "deployed_device_id": 11,
                "deployed_transport": "mqtt",
                "slot_count": 2,
            },
            {
                "device_key": "legacy",
                "deployed_device_id": 12,
                "deployed_transport": "http",
                "slot_count": 10,
            },
        ]

    async def async_list_hub_devices(self, entry_id):
        return list(self.devices)

    def get_deployed_wifi_commands(self, entry_id, hub_device_id=None):
        if hub_device_id == 11:
            return [{"name": "Lights Toggle"}, {"name": "Lights Scene"}]
        return []


def test_mqtt_ingress_handler_guards_and_dispatch(monkeypatch):
    dispatched = []
    fake = _make_mqtt_ingress_fake(dispatched)

    async def fake_get_store(hass):
        return _FakeMqttStore()

    monkeypatch.setattr(wifi_ingress_module, "async_get_command_config_store", fake_get_store)
    handler = SofabatonHub._async_handle_wifi_mqtt_message

    loop = asyncio.new_event_loop()
    try:
        run = loop.run_until_complete

        # Retained messages are dropped before anything else (restart
        # replay must never run an Action).
        run(handler(fake, _mqtt_msg('{"device_id": 11, "key_id": 1}', retain=True)))
        assert dispatched == []

        # Malformed payloads are dropped silently.
        run(handler(fake, _mqtt_msg("not json")))
        run(handler(fake, _mqtt_msg('{"device_id": "x", "key_id": 1}')))
        assert dispatched == []

        # Unmanaged device ids never fire (app-created MQTT devices).
        run(handler(fake, _mqtt_msg('{"device_id": 99, "key_id": 1}')))
        assert dispatched == []

        # A device deployed over HTTP is not routable via MQTT either.
        run(handler(fake, _mqtt_msg('{"device_id": 12, "key_id": 1}')))
        assert dispatched == []

        # Short press: key 2 on a 2-slot device -> index 1, short.
        run(handler(fake, _mqtt_msg('{"device_id": 11, "key_id": 2}')))
        assert len(dispatched) == 1
        assert dispatched[-1]["command_index"] == 1
        assert dispatched[-1]["press_type"] == "short"
        assert dispatched[-1]["command_label"] == "Lights Scene"
        assert dispatched[-1]["record"]["transport"] == "mqtt"
        assert dispatched[-1]["record"]["source_ip"] == ""

        # Long press: key 3 -> index 0, long (long = short + slot_count).
        run(handler(fake, _mqtt_msg('{"device_id": 11, "key_id": 3}')))
        assert dispatched[-1]["command_index"] == 0
        assert dispatched[-1]["press_type"] == "long"

        # Out-of-range key ids are dropped (slot_count 2 -> max key 4).
        before = len(dispatched)
        run(handler(fake, _mqtt_msg('{"device_id": 11, "key_id": 5}')))
        assert len(dispatched) == before
    finally:
        loop.close()


def _make_activity_ingress_fake(applied):
    async def _executor(func, *args):
        return func(*args)

    def _apply(new_id):
        applied.append(new_id)
        return True

    return SimpleNamespace(
        _log=logging.getLogger("test-mqtt-activity"),
        hass=SimpleNamespace(async_add_executor_job=_executor),
        hub_connected=True,
        activities_ready=True,
        current_activity=0x68,
        _proxy=SimpleNamespace(apply_external_activity_state=_apply),
    )


def test_mqtt_activity_ingress_handler():
    applied = []
    fake = _make_activity_ingress_fake(applied)
    handler = SofabatonHub._async_handle_activity_state_message

    loop = asyncio.new_event_loop()
    try:
        run = loop.run_until_complete

        # Retained messages are dropped before anything else: a replayed
        # transition must never flip state on restart.
        run(handler(fake, _mqtt_msg('{"activity_id": 105, "state": "on"}', retain=True)))
        assert applied == []

        # Malformed payloads are dropped silently.
        run(handler(fake, _mqtt_msg("not json")))
        run(handler(fake, _mqtt_msg('"scalar"')))
        run(handler(fake, _mqtt_msg('{"activity_id": "x", "state": "on"}')))
        assert applied == []

        # No TCP link, or no activities baseline yet: initial sync is the
        # safer source, the push is ignored.
        fake.hub_connected = False
        run(handler(fake, _mqtt_msg('{"activity_id": 105, "state": "on"}')))
        fake.hub_connected = True
        fake.activities_ready = False
        run(handler(fake, _mqtt_msg('{"activity_id": 105, "state": "on"}')))
        fake.activities_ready = True
        assert applied == []

        # Switch push carries the new id.
        run(handler(fake, _mqtt_msg('{"activity_id": 105, "state": "on"}')))
        assert applied == [105]

        # 255 = all off (OFF press), regardless of the state field.
        run(handler(fake, _mqtt_msg('{"activity_id": 255, "state": "off"}')))
        assert applied == [105, None]

        # Individual off for the CURRENT activity powers off ...
        run(handler(fake, _mqtt_msg('{"activity_id": 104, "state": "off"}')))
        assert applied == [105, None, None]

        # ... but an off for a non-current activity carries no state.
        fake.current_activity = 0x69
        run(handler(fake, _mqtt_msg('{"activity_id": 104, "state": "off"}')))
        assert applied == [105, None, None]

        # The request-side {"data": {...}} envelope is tolerated.
        run(handler(fake, _mqtt_msg('{"data": {"activity_id": 106, "state": "on"}}')))
        assert applied == [105, None, None, 106]

        # Unknown state strings are ignored.
        run(handler(fake, _mqtt_msg('{"activity_id": 106, "state": "toggling"}')))
        assert applied == [105, None, None, 106]
    finally:
        loop.close()


def test_activity_state_topic_uses_press_mac():
    fake = SimpleNamespace(_wifi_mqtt_mac=lambda: "A1B2C3D4E5F6")
    assert (
        SofabatonHub._activity_state_topic(fake)
        == "activity/A1B2C3D4E5F6/activity_control_up"
    )
    fake_none = SimpleNamespace(_wifi_mqtt_mac=lambda: None)
    assert SofabatonHub._activity_state_topic(fake_none) is None


def test_map_wifi_mqtt_key_law():
    from custom_components.sofabaton_x1s.command_config import map_wifi_mqtt_key

    assert map_wifi_mqtt_key(1, 10) == (0, "short")
    assert map_wifi_mqtt_key(10, 10) == (9, "short")
    assert map_wifi_mqtt_key(11, 10) == (0, "long")
    assert map_wifi_mqtt_key(20, 10) == (9, "long")
    assert map_wifi_mqtt_key(21, 10) is None
    assert map_wifi_mqtt_key(0, 10) is None
    assert map_wifi_mqtt_key("junk", 10) is None
    assert map_wifi_mqtt_key(1, 0) is None
