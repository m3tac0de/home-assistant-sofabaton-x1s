import asyncio
from types import SimpleNamespace

import importlib

integration = importlib.import_module("custom_components.sofabaton_x1s.__init__")


class _Store:
    def __init__(self, enabled=True):
        self.enabled = enabled
        self.saved = {}

    async def async_set_hub_cache(self, entry_id, payload):
        self.saved[entry_id] = payload


class _Hub:
    def __init__(self, entry_id):
        self.entry_id = entry_id

    async def async_export_cache_state(self):
        return {"devices": {"1": {"name": "TV"}}}


def test_async_persist_hub_cache_disabled(monkeypatch):
    store = _Store(enabled=False)
    hub = _Hub("entry-1")

    async def fake_store(_hass):
        return store

    monkeypatch.setattr(integration, "_async_get_persistent_cache_store", fake_store)

    loop = asyncio.new_event_loop()
    try:
        saved = loop.run_until_complete(integration._async_persist_hub_cache(SimpleNamespace(), hub))
    finally:
        loop.close()

    assert saved is False
    assert store.saved == {}


def test_async_persist_all_hub_cache_saves_each_hub(monkeypatch):
    store = _Store(enabled=True)
    hub_a = _Hub("entry-a")
    hub_b = _Hub("entry-b")
    hass = SimpleNamespace(data={integration.DOMAIN: {"a": hub_a, "b": hub_b}})

    async def fake_store(_hass):
        return store

    monkeypatch.setattr(integration, "_async_get_persistent_cache_store", fake_store)
    monkeypatch.setattr(integration, "_get_hubs", lambda _domain_data: [hub_a, hub_b])

    loop = asyncio.new_event_loop()
    try:
        persisted = loop.run_until_complete(integration._async_persist_all_hub_cache(hass))
    finally:
        loop.close()

    assert persisted == 2
    assert set(store.saved) == {"entry-a", "entry-b"}
