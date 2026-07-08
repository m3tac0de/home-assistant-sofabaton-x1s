"""WS + store tests for the blob-free hub cache refresh (Part 1/2)."""

import asyncio
import importlib
from types import SimpleNamespace

from homeassistant.exceptions import HomeAssistantError

integration = importlib.import_module("custom_components.sofabaton_x1s.__init__")


class _Conn:
    def __init__(self):
        self.result = None
        self.error = None

    def send_result(self, msg_id, payload=None):
        self.result = (msg_id, payload)

    def send_error(self, msg_id, code, message):
        self.error = (msg_id, code, message)


class _Hub:
    entry_id = "entry-1"
    name = "Living Room"


class _Store:
    def __init__(self, *, enabled=True, bundle=None):
        self.enabled = enabled
        self._bundle = bundle

    async def async_get_structural_bundle(self, entry_id):
        return self._bundle


def _run(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


def _patch(monkeypatch, *, hub=_Hub(), locked=False, store=None):
    async def fake_resolve(_hass, _data):
        return hub

    async def fake_store(_hass):
        return store if store is not None else _Store()

    monkeypatch.setattr(integration, "_async_resolve_hub_from_data", fake_resolve)
    monkeypatch.setattr(integration, "_async_get_persistent_cache_store", fake_store)

    def fake_lock(*_a, **_k):
        if locked:
            raise HomeAssistantError("The Sofabaton app is connected")

    monkeypatch.setattr(integration, "_raise_if_hub_operation_locked", fake_lock)


def test_ws_refresh_all_cache_starts_operation(monkeypatch):
    conn = _Conn()
    started = {}
    _patch(monkeypatch)
    hass = SimpleNamespace(
        async_create_task=lambda coro: started.setdefault("coro", coro) or SimpleNamespace(),
        data={integration.DOMAIN: {}},
    )
    _run(integration._ws_refresh_all_cache(hass, conn, {"id": 1, "entry_id": "entry-1"}))
    assert conn.error is None
    assert "operation_id" in conn.result[1]
    started["coro"].close()


def test_ws_refresh_all_cache_busy(monkeypatch):
    conn = _Conn()
    _patch(monkeypatch)
    registry = integration._BackupOperationRegistry(SimpleNamespace(loop=asyncio.new_event_loop()))
    registry.create(kind="cache_refresh", entry_id="entry-1", initial_state={"status": "running"})
    hass = SimpleNamespace(
        async_create_task=lambda c: SimpleNamespace(),
        data={integration.DOMAIN: {integration._BACKUP_OPERATIONS_KEY: registry}},
    )
    _run(integration._ws_refresh_all_cache(hass, conn, {"id": 2, "entry_id": "entry-1"}))
    assert conn.error[1] == "busy"


def test_ws_refresh_all_cache_blocked_when_locked(monkeypatch):
    conn = _Conn()
    _patch(monkeypatch, locked=True)
    hass = SimpleNamespace(async_create_task=lambda c: SimpleNamespace(), data={integration.DOMAIN: {}})
    _run(integration._ws_refresh_all_cache(hass, conn, {"id": 3, "entry_id": "entry-1"}))
    assert conn.error[1] == "unavailable"


def test_ws_structural_bundle_present(monkeypatch):
    conn = _Conn()
    bundle = {"kind": "hub_bundle", "schema_version": 5, "devices": [], "activities": []}
    _patch(monkeypatch, store=_Store(bundle={"bundle": bundle, "generation": 7}))
    hass = SimpleNamespace(data={integration.DOMAIN: {}})
    _run(integration._ws_get_structural_bundle(hass, conn, {"id": 4, "entry_id": "entry-1"}))
    assert conn.error is None
    assert conn.result[1]["bundle"]["kind"] == "hub_bundle"
    assert conn.result[1]["generation"] == 7


def test_ws_structural_bundle_absent(monkeypatch):
    conn = _Conn()
    _patch(monkeypatch, store=_Store(bundle=None))
    hass = SimpleNamespace(data={integration.DOMAIN: {}})
    _run(integration._ws_get_structural_bundle(hass, conn, {"id": 5, "entry_id": "entry-1"}))
    assert conn.error is None
    assert conn.result[1] == {"bundle": None, "generation": None}
