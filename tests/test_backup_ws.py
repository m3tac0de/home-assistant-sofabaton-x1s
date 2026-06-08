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
            "schema_version": 5,
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
                {"id": 23, "entry_id": "entry-1", "mode": "merge", "backup": {"kind": "hub_bundle", "schema_version": 5, "devices": [], "activities": []}},
            )
        )
    finally:
        loop.close()

    assert conn.error is None
    assert conn.result[0] == 23
    assert "operation_id" in conn.result[1]
    assert started["coro"] is not None
    started["coro"].close()


def test_run_backup_restore_operation_preserves_final_progress_counts():
    class _Hub:
        entry_id = "entry-1"

        async def async_restore_backup(self, payload, *, replace_mode=None, progress_callback=None, wifi_commands_request_port=8060):
            assert replace_mode is True
            assert payload["kind"] == "hub_bundle"
            if callable(progress_callback):
                progress_callback(
                    {
                        "status": "running",
                        "phase": "hub",
                        "message": "Restored hub name.",
                        "completed_steps": 4,
                        "total_steps": 4,
                    }
                )
            return {
                "status": "success",
                "_progress_completed_steps": 4,
                "_progress_total_steps": 4,
            }

    loop = asyncio.new_event_loop()
    try:
        hass = SimpleNamespace(loop=loop, data={integration.DOMAIN: {}})
        registry = integration._backup_operation_registry(hass)
        operation_id = registry.create(
            kind="backup_restore",
            entry_id="entry-1",
            initial_state={"status": "running", "phase": "queued", "message": "Queued"},
        )
        loop.run_until_complete(
            integration._run_backup_restore_operation(
                hass,
                operation_id,
                hub=_Hub(),
                payload={"kind": "hub_bundle", "schema_version": 5, "devices": [], "activities": []},
                mode="replace",
            )
        )
        state = registry.get(operation_id)["state"]
    finally:
        loop.close()

    assert state["status"] == "success"
    assert state["message"] == "Restore completed."
    assert state["completed_steps"] == 4
    assert state["total_steps"] == 4


def test_run_backup_restore_operation_ignores_late_running_progress_after_success():
    class _Hub:
        entry_id = "entry-1"

        async def async_restore_backup(self, payload, *, replace_mode=None, progress_callback=None, wifi_commands_request_port=8060):
            assert replace_mode is True
            assert payload["kind"] == "hub_bundle"
            if callable(progress_callback):
                progress_callback(
                    {
                        "status": "running",
                        "phase": "hub",
                        "message": "Restored hub name.",
                        "completed_steps": 4,
                        "total_steps": 4,
                    }
                )
            return {
                "status": "success",
                "_progress_completed_steps": 4,
                "_progress_total_steps": 4,
            }

    loop = asyncio.new_event_loop()
    try:
        hass = SimpleNamespace(loop=loop, data={integration.DOMAIN: {}})
        registry = integration._backup_operation_registry(hass)
        operation_id = registry.create(
            kind="backup_restore",
            entry_id="entry-1",
            initial_state={"status": "running", "phase": "queued", "message": "Queued"},
        )
        loop.run_until_complete(
            integration._run_backup_restore_operation(
                hass,
                operation_id,
                hub=_Hub(),
                payload={"kind": "hub_bundle", "schema_version": 5, "devices": [], "activities": []},
                mode="replace",
            )
        )
        loop.run_until_complete(asyncio.sleep(0))
        state = registry.get(operation_id)["state"]
    finally:
        loop.close()

    assert state["status"] == "success"
    assert state["phase"] == "completed"
    assert state["message"] == "Restore completed."


def test_dismiss_operation_drops_terminal_op_and_refuses_running():
    loop = asyncio.new_event_loop()
    try:
        registry = integration._BackupOperationRegistry(SimpleNamespace(loop=loop))
        op_id = registry.create(
            kind="backup_export",
            entry_id="entry-1",
            initial_state={"status": "running", "phase": "queued"},
        )
        # Refuses to drop a still-running op.
        assert registry.dismiss_operation(op_id) is False
        assert registry.get(op_id) is not None

        registry.update(op_id, status="success", phase="completed")
        # Terminal op gets fully dropped and is no longer surfaced by
        # ``latest_for_entry`` — that's what stops a card refresh from
        # snapping the success view back.
        assert registry.dismiss_operation(op_id) is True
        assert registry.get(op_id) is None
        assert (
            registry.latest_for_entry("entry-1", kind="backup_export") is None
        )

        # Idempotent — dismissing an unknown id returns False without raising.
        assert registry.dismiss_operation("not-a-real-id") is False
    finally:
        loop.close()


def test_ws_backup_clear_result_fully_drops_terminal_op():
    conn = _Conn()
    loop = asyncio.new_event_loop()
    try:
        hass = SimpleNamespace(loop=loop, data={integration.DOMAIN: {}})
        registry = integration._backup_operation_registry(hass)
        op_id = registry.create(
            kind="backup_export",
            entry_id="entry-1",
            initial_state={
                "status": "success",
                "phase": "completed",
                "backup": {"kind": "hub_bundle", "schema_version": 5},
            },
        )
        loop.run_until_complete(
            integration._ws_backup_clear_result(
                hass, conn, {"id": 99, "operation_id": op_id}
            )
        )
    finally:
        loop.close()

    assert conn.error is None
    assert conn.result == (99, {"ok": True})
    # The fix: the op must be GONE, not merely stripped of its bundle.
    # Pre-fix behavior kept status=success around for 30s so the
    # Complete view would snap back.
    assert registry.get(op_id) is None
    assert registry.latest_for_entry("entry-1", kind="backup_export") is None


def test_ws_backup_clear_result_refuses_to_dismiss_running_op():
    conn = _Conn()
    loop = asyncio.new_event_loop()
    try:
        hass = SimpleNamespace(loop=loop, data={integration.DOMAIN: {}})
        registry = integration._backup_operation_registry(hass)
        op_id = registry.create(
            kind="backup_export",
            entry_id="entry-1",
            initial_state={"status": "running", "phase": "queued"},
        )
        loop.run_until_complete(
            integration._ws_backup_clear_result(
                hass, conn, {"id": 100, "operation_id": op_id}
            )
        )
    finally:
        loop.close()

    assert conn.error is not None
    assert conn.error[1] == "still_running"
    assert registry.get(op_id) is not None


def test_run_backup_restore_operation_dismisses_preflight_failures():
    class _RejectingHub:
        entry_id = "entry-1"

        async def async_restore_backup(
            self,
            payload,
            *,
            replace_mode=None,
            progress_callback=None,
            wifi_commands_request_port=8060,
        ):
            # Pre-flight failure: validator rejects the bundle before
            # any progress event fires. Mirrors the path my
            # ``_edited_command_data_hex`` validator takes when an
            # edited row fails its round-trip self-check.
            raise ValueError("edited decoded block failed round-trip self-check")

    loop = asyncio.new_event_loop()
    try:
        hass = SimpleNamespace(loop=loop, data={integration.DOMAIN: {}})
        registry = integration._backup_operation_registry(hass)
        op_id = registry.create(
            kind="backup_restore",
            entry_id="entry-1",
            initial_state={"status": "running", "phase": "queued"},
        )
        loop.run_until_complete(
            integration._run_backup_restore_operation(
                hass,
                op_id,
                hub=_RejectingHub(),
                payload={
                    "kind": "hub_bundle",
                    "schema_version": 5,
                    "devices": [],
                    "activities": [],
                },
                mode="merge",
            )
        )
    finally:
        loop.close()

    # The op gets the failed-status update so any live subscriber
    # sees the error message, then is immediately dismissed from the
    # registry so no card refresh can snap a stale failure view back.
    assert registry.get(op_id) is None
    assert registry.latest_for_entry("entry-1", kind="backup_restore") is None


def test_run_backup_restore_operation_persists_inflight_failures():
    class _MidwayFailHub:
        entry_id = "entry-1"

        async def async_restore_backup(
            self,
            payload,
            *,
            replace_mode=None,
            progress_callback=None,
            wifi_commands_request_port=8060,
        ):
            # Emit progress THEN fail — represents an in-flight error
            # (hub disconnect, partial restore). Distinct from
            # pre-flight: the operation actually started touching the
            # hub, so the user needs the failed-status record to
            # persist while they navigate away to investigate.
            if callable(progress_callback):
                progress_callback(
                    status="running",
                    phase="device",
                    message="Restoring device 11…",
                    completed_steps=1,
                    total_steps=4,
                )
            raise RuntimeError("hub disconnected midway")

    loop = asyncio.new_event_loop()
    try:
        hass = SimpleNamespace(loop=loop, data={integration.DOMAIN: {}})
        registry = integration._backup_operation_registry(hass)
        op_id = registry.create(
            kind="backup_restore",
            entry_id="entry-1",
            initial_state={"status": "running", "phase": "queued"},
        )
        loop.run_until_complete(
            integration._run_backup_restore_operation(
                hass,
                op_id,
                hub=_MidwayFailHub(),
                payload={
                    "kind": "hub_bundle",
                    "schema_version": 5,
                    "devices": [],
                    "activities": [],
                },
                mode="merge",
            )
        )
        loop.run_until_complete(asyncio.sleep(0))
    finally:
        loop.close()

    state = registry.get(op_id)
    assert state is not None
    assert state["state"]["status"] == "failed"
    assert "hub disconnected midway" in str(state["state"]["error"])
    assert state["state"].get("transient") is not True
