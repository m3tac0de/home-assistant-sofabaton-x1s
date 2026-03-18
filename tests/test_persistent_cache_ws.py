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

    async def async_clear_cache_for(self, *, kind, ent_id):
        self.cleared = (kind, ent_id)

    async def async_fetch_device_commands(self, ent_id, wait_timeout=10.0):
        self.fetched = (ent_id, wait_timeout)

    async def async_export_cache_state(self):
        return {"devices": {"1": {"name": "TV"}}}

    async def async_get_cache_contents(self):
        return {"entry_id": self.entry_id, "name": self.name, "devices": {"1": {"name": "TV"}}}


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
