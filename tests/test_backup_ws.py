import asyncio
from types import SimpleNamespace

import importlib

integration = importlib.import_module("custom_components.sofabaton_x1s.__init__")


class _Conn:
    def __init__(self):
        self.result = None
        self.error = None
        self.messages = []
        self.subscriptions = {}

    def send_result(self, msg_id, payload=None):
        self.result = (msg_id, payload)

    def send_error(self, msg_id, code, message):
        self.error = (msg_id, code, message)

    def send_message(self, payload):
        self.messages.append(payload)


class _Hub:
    entry_id = "entry-1"
    name = "Living Room"

    async def async_backup_hub(self, *, device_ids=None, progress_callback=None, wait_timeout=10.0):
        assert wait_timeout == 10.0
        if callable(progress_callback):
            progress_callback(
                status="running",
                phase="device",
                message="Backing up device 11…",
                completed_steps=0,
                total_steps=2,
            )
        return {
            "kind": "hub_bundle",
            "schema_version": 4,
            "captured_at": "2026-05-26T08:09:10+00:00",
            "devices": [{"device": {"device_id": 11, "name": "TV"}}],
            "activities": [],
            "_progress_total_steps": 2,
            "device_ids": device_ids,
        }

    async def async_restore_backup(self, payload, *, replace_mode=None, progress_callback=None, wifi_commands_request_port=8060):
        assert wifi_commands_request_port == 8060
        assert payload["kind"] == "hub_bundle"
        assert replace_mode is False
        if callable(progress_callback):
            progress_callback(
                status="running",
                phase="device",
                message="Restoring device 11…",
                completed_steps=1,
                total_steps=2,
            )
        return {"status": "success", "restored_devices": [{"source_device_id": 11, "device_id": 21}], "restored_activities": []}


def test_ws_backup_export_starts_operation(monkeypatch):
    conn = _Conn()
    hub = _Hub()
    started = {}

    async def fake_resolve(_hass, _data):
        return hub

    def fake_create_task(coro):
        started["coro"] = coro
        return SimpleNamespace()

    hass = SimpleNamespace(async_create_task=fake_create_task, data={integration.DOMAIN: {}})
    monkeypatch.setattr(integration, "_async_resolve_hub_from_data", fake_resolve)
    monkeypatch.setattr(integration, "_raise_if_sync_in_progress", lambda *args, **kwargs: None)

    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(
            integration._ws_backup_export(
                hass,
                conn,
                {"id": 21, "entry_id": "entry-1", "device_ids": [11, 12]},
            )
        )
    finally:
        loop.close()

    assert conn.error is None
    assert conn.result[0] == 21
    assert "operation_id" in conn.result[1]
    assert started["coro"] is not None
    started["coro"].close()


def test_ws_backup_progress_subscribe_forwards_initial_and_live_events(monkeypatch):
    conn = _Conn()
    registry = integration._BackupOperationRegistry(SimpleNamespace(loop=asyncio.new_event_loop()))
    operation_id = registry.create(
      kind="backup_export",
      entry_id="entry-1",
      initial_state={"status": "running", "phase": "queued", "message": "Queued", "completed_steps": 0, "total_steps": 1},
    )
    hass = SimpleNamespace(data={integration.DOMAIN: {integration._BACKUP_OPERATIONS_KEY: registry}})

    monkeypatch.setattr(
        integration.websocket_api,
        "event_message",
        lambda msg_id, payload: {"id": msg_id, "event": payload},
        raising=False,
    )

    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(
            integration._ws_backup_progress_subscribe(
                hass,
                conn,
                {"id": 22, "operation_id": operation_id},
            )
        )
    finally:
        loop.close()

    assert conn.result == (22, None)
    assert conn.messages[0]["event"]["message"] == "Queued"

    registry.update(operation_id, message="Running", completed_steps=1)
    assert conn.messages[-1]["event"]["message"] == "Running"


def test_ws_backup_restore_starts_merge_operation(monkeypatch):
    conn = _Conn()
    hub = _Hub()
    started = {}

    async def fake_resolve(_hass, _data):
        return hub

    def fake_create_task(coro):
        started["coro"] = coro
        return SimpleNamespace()

    hass = SimpleNamespace(async_create_task=fake_create_task, data={integration.DOMAIN: {}})
    monkeypatch.setattr(integration, "_async_resolve_hub_from_data", fake_resolve)
    monkeypatch.setattr(integration, "_raise_if_sync_in_progress", lambda *args, **kwargs: None)

    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(
            integration._ws_backup_restore(
                hass,
                conn,
                {"id": 23, "entry_id": "entry-1", "mode": "merge", "backup": {"kind": "hub_bundle", "schema_version": 4, "devices": [], "activities": []}},
            )
        )
    finally:
        loop.close()

    assert conn.error is None
    assert conn.result[0] == 23
    assert "operation_id" in conn.result[1]
    assert started["coro"] is not None
    started["coro"].close()
