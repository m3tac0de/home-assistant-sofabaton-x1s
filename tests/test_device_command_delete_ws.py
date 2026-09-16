"""WS-layer tests for the device/command_delete endpoint: a scoped, in-place
delete of a single command from a hub device, independent of the managed Wifi
Events / command-config store (so it reaches a device authored in the phone
app's Home Assistant Remote, whose brand the store does not recognize)."""

import asyncio
import importlib
from types import SimpleNamespace

integration = importlib.import_module("custom_components.sofabaton_x1s.__init__")


class _Conn:
    def __init__(self):
        self.result = None
        self.error = None

    def send_result(self, msg_id, payload):
        self.result = (msg_id, payload)

    def send_error(self, msg_id, code, message):
        self.error = (msg_id, code, message)


def _run(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


def _bundle(command_ids):
    return {
        "devices": [
            {
                "device": {"device_id": 7, "name": "HA Trigger", "brand": "Ha"},
                "commands": [
                    {"command_id": cid, "name": f"cmd{cid}"} for cid in command_ids
                ],
            },
            {
                "device": {"device_id": 6, "name": "NVIDIA SHIELD"},
                "commands": [{"command_id": 12, "name": "PLAY"}],
            },
        ]
    }


class _Hub:
    def __init__(self, command_ids):
        self.entry_id = "entry-1"
        self._command_ids = list(command_ids)
        self.delete_calls: list[tuple[int, list[int]]] = []
        self.delete_result = True

    async def async_get_structural_bundle(self):
        return _bundle(self._command_ids)

    async def async_delete_device_commands(self, *, device_id, command_ids):
        self.delete_calls.append((int(device_id), [int(c) for c in command_ids]))
        if self.delete_result:
            for cid in command_ids:
                if int(cid) in self._command_ids:
                    self._command_ids.remove(int(cid))
        return self.delete_result


def _setup(monkeypatch, hub, *, cache_enabled=True, running=False):
    async def fake_resolve(_hass, _data):
        return hub

    async def fake_cache_store(_hass):
        return SimpleNamespace(enabled=cache_enabled)

    monkeypatch.setattr(integration, "_async_resolve_hub_from_data", fake_resolve)
    monkeypatch.setattr(integration, "_async_get_persistent_cache_store", fake_cache_store)
    monkeypatch.setattr(
        integration,
        "_backup_operation_registry",
        lambda _hass: SimpleNamespace(has_running_for_entry=lambda _entry: running),
    )
    monkeypatch.setattr(
        integration, "_raise_if_hub_operation_locked", lambda *_a, **_k: None
    )


def _msg(**kwargs):
    return {"id": 1, "entry_id": "entry-1", **kwargs}


def test_deletes_one_command_and_keeps_the_rest(monkeypatch):
    hub = _Hub([1, 2, 3, 4, 5, 6])
    _setup(monkeypatch, hub)
    conn = _Conn()
    _run(
        integration._ws_device_command_delete(
            None, conn, _msg(device_id=7, command_id=1)
        )
    )
    assert conn.error is None
    payload = conn.result[1]
    assert payload["status"] == "success"
    assert payload["deleted"] is True
    assert hub.delete_calls == [(7, [1])]
    assert payload["commands_before"] == [1, 2, 3, 4, 5, 6]
    # The remaining commands (and their bindings) survive.
    assert payload["commands_after"] == [2, 3, 4, 5, 6]


def test_missing_command_is_a_noop_success(monkeypatch):
    hub = _Hub([4, 6])
    _setup(monkeypatch, hub)
    conn = _Conn()
    _run(
        integration._ws_device_command_delete(
            None, conn, _msg(device_id=7, command_id=1)
        )
    )
    assert conn.error is None
    payload = conn.result[1]
    assert payload["deleted"] is False
    assert hub.delete_calls == []


def test_unknown_device_is_not_found(monkeypatch):
    hub = _Hub([1, 2])
    _setup(monkeypatch, hub)
    conn = _Conn()
    _run(
        integration._ws_device_command_delete(
            None, conn, _msg(device_id=99, command_id=1)
        )
    )
    assert conn.result is None
    assert conn.error[1] == "not_found"


def test_hub_delete_failure_surfaces(monkeypatch):
    hub = _Hub([1, 2])
    hub.delete_result = False
    _setup(monkeypatch, hub)
    conn = _Conn()
    _run(
        integration._ws_device_command_delete(
            None, conn, _msg(device_id=7, command_id=1)
        )
    )
    assert conn.result is None
    assert conn.error[1] == "delete_failed"


def test_cache_disabled_is_refused(monkeypatch):
    hub = _Hub([1, 2])
    _setup(monkeypatch, hub, cache_enabled=False)
    conn = _Conn()
    _run(
        integration._ws_device_command_delete(
            None, conn, _msg(device_id=7, command_id=1)
        )
    )
    assert conn.result is None
    assert conn.error[1] == "cache_disabled"


def test_busy_registry_refuses(monkeypatch):
    hub = _Hub([1, 2])
    _setup(monkeypatch, hub, running=True)
    conn = _Conn()
    _run(
        integration._ws_device_command_delete(
            None, conn, _msg(device_id=7, command_id=1)
        )
    )
    assert conn.result is None
    assert conn.error[1] == "busy"
    assert hub.delete_calls == []
