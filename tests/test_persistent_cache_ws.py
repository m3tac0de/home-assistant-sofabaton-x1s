import asyncio
from types import SimpleNamespace

import importlib

integration = importlib.import_module("custom_components.sofabaton_x1s.__init__")


class _Conn:
    def __init__(self):
        self.result = None
        self.error = None

    def send_result(self, msg_id, payload):
        self.result = (msg_id, payload)

    def send_error(self, msg_id, code, message):
        self.error = (msg_id, code, message)


class _CacheStore:
    def __init__(self, enabled=True):
        self.enabled = enabled
        self.set_enabled_to = None

    async def async_set_enabled(self, enabled):
        self.enabled = bool(enabled)
        self.set_enabled_to = self.enabled

    async def async_clear_all_hub_cache(self):
        self.cleared = True


class _Hub:
    entry_id = "entry-1"
    name = "Living Room"

    def __init__(self):
        self.cleared = None
        self.fetched = None
        self.cache_generation = 7
        self.host = "192.168.1.50"
        self.activities = {101: {"name": "Movies"}, 102: {"name": "TV"}}
        self.devices = {1: {"name": "TV"}, 2: {"name": "Amp"}}
        self.proxy_enabled = True
        self.hex_logging_enabled = False
        self.roku_server_enabled = True
        self.client_connected = False
        self.hub_connected = True
        self.find_remote_called = False
        self.sync_remote_called = False

    async def async_clear_cache_for(self, *, kind, ent_id):
        self.cleared = (kind, ent_id)

    async def async_fetch_device_commands(self, ent_id, wait_timeout=10.0):
        self.fetched = (ent_id, wait_timeout)

    async def async_export_cache_state(self):
        return {"devices": {"1": {"name": "TV"}}}

    async def async_get_cache_contents(self):
        return {
            "entry_id": self.entry_id,
            "name": self.name,
            "cache_generation": self.cache_generation,
            "devices": {"1": {"name": "TV"}},
            "activities": [{"id": 101, "name": "Movies", "favorite_count": 1, "keybinding_count": 1, "macro_count": 0}],
            "activity_favorites": {"101": [{"button_id": 1, "device_id": 1, "device_name": "TV", "command_id": 2, "label": "Power", "source": "activity_map"}]},
            "activity_keybindings": {"101": [{"button_id": 183, "button_name": "Ch Up", "device_id": 1, "device_name": "TV", "command_id": 3, "label": "Channel Up", "source": "keymap"}]},
            "devices_list": [{"id": 1, "name": "TV", "command_count": 1, "has_commands": True}],
        }

    async def async_set_proxy_enabled(self, enabled):
        self.proxy_enabled = bool(enabled)

    async def async_set_hex_logging_enabled(self, enabled):
        self.hex_logging_enabled = bool(enabled)

    async def async_set_roku_server_enabled(self, enabled):
        self.roku_server_enabled = bool(enabled)

    async def async_find_remote(self):
        self.find_remote_called = True

    async def async_resync_remote(self):
        self.sync_remote_called = True


def test_ws_set_persistent_cache(monkeypatch):
    conn = _Conn()
    store = _CacheStore(enabled=False)

    async def fake_store(_hass):
        return store

    monkeypatch.setattr(integration, "_async_get_persistent_cache_store", fake_store)

    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(
            integration._ws_set_persistent_cache(SimpleNamespace(), conn, {"id": 1, "enabled": True})
        )
    finally:
        loop.close()

    assert conn.error is None
    assert conn.result == (1, {"enabled": True})
    assert store.set_enabled_to is True


def test_ws_refresh_persistent_cache_entry(monkeypatch):
    conn = _Conn()
    store = _CacheStore(enabled=True)
    hub = _Hub()

    async def fake_store(_hass):
        return store

    async def fake_resolve(_hass, _data):
        return hub

    saved = {}

    async def fake_set_hub_cache(entry_id, payload):
        saved[entry_id] = payload

    store.async_set_hub_cache = fake_set_hub_cache

    monkeypatch.setattr(integration, "_async_get_persistent_cache_store", fake_store)
    monkeypatch.setattr(integration, "_async_resolve_hub_from_data", fake_resolve)

    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(
            integration._ws_refresh_persistent_cache_entry(
                SimpleNamespace(),
                conn,
                {
                    "id": 2,
                    "entity_id": "remote.sofabaton_x1s",
                    "kind": "device",
                    "target_id": 17,
                },
            )
        )
    finally:
        loop.close()

    assert conn.error is None
    assert conn.result == (2, {"ok": True})
    assert hub.cleared == ("device", 17)
    assert hub.fetched == (17, 30.0)
    assert saved["entry-1"] == {"devices": {"1": {"name": "TV"}}}


def test_ws_get_persistent_cache_contents_disabled(monkeypatch):
    conn = _Conn()
    store = _CacheStore(enabled=False)

    async def fake_store(_hass):
        return store

    monkeypatch.setattr(integration, "_async_get_persistent_cache_store", fake_store)

    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(
            integration._ws_get_persistent_cache_contents(SimpleNamespace(data={}), conn, {"id": 3})
        )
    finally:
        loop.close()

    assert conn.error is None
    assert conn.result == (3, {"enabled": False, "hubs": []})


def test_ws_get_persistent_cache_contents_returns_derived_activity_data(monkeypatch):
    conn = _Conn()
    store = _CacheStore(enabled=True)
    hub = _Hub()

    async def fake_store(_hass):
        return store

    monkeypatch.setattr(integration, "_async_get_persistent_cache_store", fake_store)
    monkeypatch.setattr(integration, "_get_hubs", lambda _data: [hub])

    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(
            integration._ws_get_persistent_cache_contents(SimpleNamespace(data={}), conn, {"id": 33})
        )
    finally:
        loop.close()

    assert conn.error is None
    assert conn.result == (
        33,
        {
            "enabled": True,
            "hubs": [
                {
                    "entry_id": "entry-1",
                    "name": "Living Room",
                    "cache_generation": 7,
                    "devices": {"1": {"name": "TV"}},
                    "activities": [{"id": 101, "name": "Movies", "favorite_count": 1, "keybinding_count": 1, "macro_count": 0}],
                    "activity_favorites": {"101": [{"button_id": 1, "device_id": 1, "device_name": "TV", "command_id": 2, "label": "Power", "source": "activity_map"}]},
                    "activity_keybindings": {"101": [{"button_id": 183, "button_name": "Ch Up", "device_id": 1, "device_name": "TV", "command_id": 3, "label": "Channel Up", "source": "keymap"}]},
                    "devices_list": [{"id": 1, "name": "TV", "command_count": 1, "has_commands": True}],
                }
            ],
        },
    )


def test_ws_get_persistent_cache_includes_cache_generation(monkeypatch):
    conn = _Conn()
    store = _CacheStore(enabled=True)
    hub = _Hub()

    async def fake_store(_hass):
        return store

    monkeypatch.setattr(integration, "_async_get_persistent_cache_store", fake_store)
    monkeypatch.setattr(integration, "_get_hubs", lambda _data: [hub])

    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(
            integration._ws_get_persistent_cache(SimpleNamespace(data={}), conn, {"id": 34})
        )
    finally:
        loop.close()

    assert conn.error is None
    assert conn.result == (
        34,
        {
            "enabled": True,
            "hubs": [
                {
                    "entry_id": "entry-1",
                    "name": "Living Room",
                    "cache_generation": 7,
                }
            ],
        },
    )


def test_ws_refresh_persistent_cache_entry_by_entry_id(monkeypatch):
    conn = _Conn()
    store = _CacheStore(enabled=True)
    hub = _Hub()

    async def fake_store(_hass):
        return store

    async def fake_resolve(_hass, data):
        assert data["entry_id"] == "entry-1"
        assert data["entity_id"] is None
        return hub

    saved = {}

    async def fake_set_hub_cache(entry_id, payload):
        saved[entry_id] = payload

    store.async_set_hub_cache = fake_set_hub_cache

    monkeypatch.setattr(integration, "_async_get_persistent_cache_store", fake_store)
    monkeypatch.setattr(integration, "_async_resolve_hub_from_data", fake_resolve)

    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(
            integration._ws_refresh_persistent_cache_entry(
                SimpleNamespace(),
                conn,
                {
                    "id": 4,
                    "entry_id": "entry-1",
                    "kind": "activity",
                    "target_id": 33,
                },
            )
        )
    finally:
        loop.close()

    assert conn.error is None
    assert conn.result == (4, {"ok": True})
    assert hub.cleared == ("activity", 33)
    assert hub.fetched == (33, 30.0)
    assert saved["entry-1"] == {"devices": {"1": {"name": "TV"}}}


def test_ws_get_control_panel_state_returns_hub_metadata(monkeypatch):
    conn = _Conn()
    store = _CacheStore(enabled=False)
    hub = _Hub()

    async def fake_store(_hass):
        return store

    async def fake_version(_hass):
        return "2026.5.1"

    hass = SimpleNamespace(
        data={},
        config_entries=SimpleNamespace(
            async_get_entry=lambda _entry_id: SimpleNamespace()
        ),
    )

    monkeypatch.setattr(integration, "_async_get_persistent_cache_store", fake_store)
    monkeypatch.setattr(integration, "_async_get_integration_version", fake_version)
    monkeypatch.setattr(integration, "_get_hubs", lambda _data: [hub])
    monkeypatch.setattr(integration, "get_hub_model", lambda _entry: "X1S")

    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(
            integration._ws_get_control_panel_state(hass, conn, {"id": 40})
        )
    finally:
        loop.close()

    assert conn.error is None
    assert conn.result == (
        40,
        {
            "persistent_cache_enabled": False,
            "tools_frontend_version": "2026.5.1",
            "hubs": [
                {
                    "entry_id": "entry-1",
                    "name": "Living Room",
                    "version": "X1S",
                    "ip_address": "192.168.1.50",
                    "device_count": 2,
                    "activity_count": 2,
                    "hub_connected": True,
                    "proxy_client_connected": False,
                    "persistent_cache_enabled": False,
                    "settings": {
                        "proxy_enabled": True,
                        "hex_logging_enabled": False,
                        "wifi_device_enabled": True,
                    },
                    "actions": {
                        "can_find_remote": True,
                        "can_sync_remote": True,
                    },
                }
            ],
        },
    )


def test_ws_get_control_panel_state_disables_actions_when_client_connected(monkeypatch):
    conn = _Conn()
    store = _CacheStore(enabled=True)
    hub = _Hub()
    hub.client_connected = True

    async def fake_store(_hass):
        return store

    async def fake_version(_hass):
        return "2026.5.1"

    hass = SimpleNamespace(
        data={},
        config_entries=SimpleNamespace(
            async_get_entry=lambda _entry_id: SimpleNamespace()
        ),
    )

    monkeypatch.setattr(integration, "_async_get_persistent_cache_store", fake_store)
    monkeypatch.setattr(integration, "_async_get_integration_version", fake_version)
    monkeypatch.setattr(integration, "_get_hubs", lambda _data: [hub])
    monkeypatch.setattr(integration, "get_hub_model", lambda _entry: "X1S")

    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(
            integration._ws_get_control_panel_state(hass, conn, {"id": 41})
        )
    finally:
        loop.close()

    assert conn.error is None
    assert conn.result[1]["hubs"][0]["actions"] == {
        "can_find_remote": False,
        "can_sync_remote": False,
    }


def test_ws_control_panel_set_setting_updates_hub_setting(monkeypatch):
    conn = _Conn()
    hub = _Hub()

    async def fake_resolve(_hass, data):
        assert data["entry_id"] == "entry-1"
        return hub

    monkeypatch.setattr(integration, "_async_resolve_hub_from_data", fake_resolve)

    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(
            integration._ws_control_panel_set_setting(
                SimpleNamespace(),
                conn,
                {
                    "id": 42,
                    "entry_id": "entry-1",
                    "setting": "hex_logging_enabled",
                    "enabled": True,
                },
            )
        )
    finally:
        loop.close()

    assert conn.error is None
    assert conn.result == (42, {"ok": True, "enabled": True})
    assert hub.hex_logging_enabled is True


def test_ws_control_panel_run_action_triggers_hub_action(monkeypatch):
    conn = _Conn()
    hub = _Hub()

    async def fake_resolve(_hass, data):
        assert data["entry_id"] == "entry-1"
        return hub

    monkeypatch.setattr(integration, "_async_resolve_hub_from_data", fake_resolve)

    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(
            integration._ws_control_panel_run_action(
                SimpleNamespace(),
                conn,
                {
                    "id": 43,
                    "entry_id": "entry-1",
                    "action": "find_remote",
                },
            )
        )
    finally:
        loop.close()

    assert conn.error is None
    assert conn.result == (43, {"ok": True})
    assert hub.find_remote_called is True
