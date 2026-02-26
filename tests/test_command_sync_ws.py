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


class _Store:
    async def async_get_hub_config(self, entry_id, **kwargs):
        return {
            "commands_hash": "abc123",
            "commands": [
                {
                    "name": "Launch Netflix",
                    "add_as_favorite": True,
                    "hard_button": "",
                    "activities": ["101"],
                    "action": {"action": "perform-action", "service": "script.test"},
                }
            ],
        }


class _Hub:
    entry_id = "entry-1"

    def __init__(self, progress=None):
        self._progress = progress or {
            "status": "idle",
            "current_step": 0,
            "total_steps": 0,
            "message": "Idle",
        }

    def get_command_sync_progress(self):
        return dict(self._progress)

    def get_managed_command_hashes(self):
        return ["oldhash"]


def test_ws_command_sync_progress_reports_sync_needed(monkeypatch):
    conn = _Conn()
    hub = _Hub()

    async def fake_resolve(_hass, _data):
        return hub

    async def fake_store(_hass):
        return _Store()

    monkeypatch.setattr(integration, "_async_resolve_hub_from_data", fake_resolve)
    monkeypatch.setattr(integration, "_async_get_command_config_store", fake_store)

    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(
            integration._ws_get_command_sync_progress(
                SimpleNamespace(), conn, {"id": 7, "entity_id": "remote.living_room"}
            )
        )
    finally:
        loop.close()

    assert conn.error is None
    assert conn.result[0] == 7
    payload = conn.result[1]
    assert payload["commands_hash"] == "abc123"
    assert payload["managed_command_hashes"] == ["oldhash"]
    assert payload["sync_needed"] is True


def test_ws_command_sync_progress_reports_not_found(monkeypatch):
    conn = _Conn()

    async def fake_resolve(_hass, _data):
        return None

    monkeypatch.setattr(integration, "_async_resolve_hub_from_data", fake_resolve)

    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(
            integration._ws_get_command_sync_progress(
                SimpleNamespace(), conn, {"id": 8, "entity_id": "remote.missing"}
            )
        )
    finally:
        loop.close()

    assert conn.result is None
    assert conn.error == (8, "not_found", "Could not resolve Sofabaton hub")


def test_ws_command_sync_progress_uses_success_hash_to_clear_sync_needed(monkeypatch):
    conn = _Conn()
    hub = _Hub(
        progress={
            "status": "success",
            "current_step": 6,
            "total_steps": 6,
            "message": "Sync complete",
            "commands_hash": "abc123",
        }
    )

    async def fake_resolve(_hass, _data):
        return hub

    async def fake_store(_hass):
        return _Store()

    monkeypatch.setattr(integration, "_async_resolve_hub_from_data", fake_resolve)
    monkeypatch.setattr(integration, "_async_get_command_config_store", fake_store)

    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(
            integration._ws_get_command_sync_progress(
                SimpleNamespace(), conn, {"id": 9, "entity_id": "remote.living_room"}
            )
        )
    finally:
        loop.close()

    assert conn.error is None
    payload = conn.result[1]
    assert payload["status"] == "success"
    assert payload["sync_needed"] is False


class _EmptyStore:
    async def async_get_hub_config(self, entry_id, **kwargs):
        return {"commands_hash": "abc123", "commands": []}


def test_ws_command_sync_progress_zero_config_and_no_managed_not_needed(monkeypatch):
    conn = _Conn()

    class _NoManagedHub(_Hub):
        def get_managed_command_hashes(self):
            return []

    hub = _NoManagedHub()

    async def fake_resolve(_hass, _data):
        return hub

    async def fake_store(_hass):
        return _EmptyStore()

    monkeypatch.setattr(integration, "_async_resolve_hub_from_data", fake_resolve)
    monkeypatch.setattr(integration, "_async_get_command_config_store", fake_store)

    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(
            integration._ws_get_command_sync_progress(
                SimpleNamespace(), conn, {"id": 10, "entity_id": "remote.living_room"}
            )
        )
    finally:
        loop.close()

    assert conn.error is None
    payload = conn.result[1]
    assert payload["configured_slot_count"] == 0
    assert payload["has_managed_device"] is False
    assert payload["sync_needed"] is False
