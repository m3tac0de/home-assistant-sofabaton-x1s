import asyncio
from types import SimpleNamespace

import importlib

integration = importlib.import_module("custom_components.sofabaton_x1s.__init__")
runtime_module = importlib.import_module("custom_components.sofabaton_x1s.runtime")


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

    monkeypatch.setattr(runtime_module, "_async_get_persistent_cache_store", fake_store)

    loop = asyncio.new_event_loop()
    try:
        saved = loop.run_until_complete(runtime_module._async_persist_hub_cache(SimpleNamespace(), hub))
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

    monkeypatch.setattr(runtime_module, "_async_get_persistent_cache_store", fake_store)
    monkeypatch.setattr(runtime_module, "_get_hubs", lambda _domain_data: [hub_a, hub_b])

    loop = asyncio.new_event_loop()
    try:
        persisted = loop.run_until_complete(runtime_module._async_persist_all_hub_cache(hass))
    finally:
        loop.close()

    assert persisted == 2
    assert set(store.saved) == {"entry-a", "entry-b"}


def test_shared_stores_load_once_under_concurrent_setup() -> None:
    """Two hubs setting up at once used to each build and load a store; the
    loader now builds one per key (CR-H2-13)."""

    import asyncio as _asyncio
    from types import SimpleNamespace as _NS

    from custom_components.sofabaton_x1s.shared_stores import async_shared_store

    built: list[object] = []

    class _Store:
        def __init__(self, _hass) -> None:
            built.append(self)

        async def async_load(self) -> None:
            await _asyncio.sleep(0.01)  # the window the old getters raced in

    hass = _NS(data={})

    async def main():
        return await _asyncio.gather(*(async_shared_store(hass, "k", _Store, store_type=_Store) for _ in range(5)))

    stores = _asyncio.run(main())
    assert len(built) == 1
    assert all(store is built[0] for store in stores)
    # A value of another type under the key is replaced; with no store_type, any value counts.
    hass.data["sofabaton_x1s"]["k"] = object()
    assert _asyncio.run(async_shared_store(hass, "k", _Store, store_type=_Store)) is not built[0] and len(built) == 2
    assert _asyncio.run(async_shared_store(hass, "k", _Store)) is built[1]
