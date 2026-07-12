"""WS handler tests for the activity sync surface (Phase L4)."""

import asyncio
import copy
import importlib
from types import SimpleNamespace

import pytest
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
    version = "X1S"


def _bundle(activity_favs):
    return {
        "kind": "hub_bundle",
        "schema_version": integration.HUB_BUNDLE_SCHEMA_VERSION,
        "hub": {"name": "Living Room", "version": "X1S"},
        "devices": [{
            "device": {"device_id": 1, "name": "TV"},
            "commands": [{"command_id": 10, "name": "Power"}],
        }],
        "activities": [
            {
                "device": {"device_id": 101, "name": "Watch TV", "entity_type": "activity"},
                "referenced_source_device_ids": [1],
                "favorite_slots": activity_favs,
                "macros": [
                    {"button_id": 198, "name": "POWER_ON", "steps": [
                        {"device_id": 1, "command_id": 0xC6, "button_code": 0, "duration": 0, "delay": 0xFF},
                        {"device_id": 1, "command_id": 0xC5, "button_code": 0, "duration": 0, "delay": 0xFF},
                    ]},
                    {"button_id": 199, "name": "POWER_OFF", "steps": [
                        {"device_id": 1, "command_id": 0xC7, "button_code": 0, "duration": 0, "delay": 0xFF},
                    ]},
                ],
                "button_bindings": [],
            }
        ],
    }


def _run(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


def _patch(monkeypatch, *, hub=_Hub(), locked=False):
    async def fake_resolve(_hass, _data):
        return hub

    monkeypatch.setattr(integration, "_async_resolve_hub_from_data", fake_resolve)

    def fake_lock(*_a, **_k):
        if locked:
            raise HomeAssistantError("The Sofabaton app is connected")

    monkeypatch.setattr(integration, "_raise_if_hub_operation_locked", fake_lock)


def test_ws_activity_sync_starts_operation(monkeypatch):
    conn = _Conn()
    started = {}
    _patch(monkeypatch)
    hass = SimpleNamespace(
        async_create_task=lambda coro: started.setdefault("coro", coro) or SimpleNamespace(),
        data={integration.DOMAIN: {}},
    )
    _run(integration._ws_activity_sync(hass, conn, {
        "id": 1, "entry_id": "entry-1", "activity_id": 101,
        "baseline": _bundle([]), "edited": _bundle([{"button_id": 9, "device_id": 1, "command_id": 10, "name": "Fav"}]),
    }))
    assert conn.error is None
    assert "operation_id" in conn.result[1]
    started["coro"].close()


def test_ws_activity_sync_busy(monkeypatch):
    conn = _Conn()
    _patch(monkeypatch)
    registry = integration._BackupOperationRegistry(SimpleNamespace(loop=asyncio.new_event_loop()))
    registry.create(kind="activity_sync", entry_id="entry-1",
                    initial_state={"status": "running"})
    hass = SimpleNamespace(async_create_task=lambda c: SimpleNamespace(),
                           data={integration.DOMAIN: {integration._BACKUP_OPERATIONS_KEY: registry}})
    _run(integration._ws_activity_sync(hass, conn, {
        "id": 2, "entry_id": "entry-1", "activity_id": 101,
        "baseline": _bundle([]), "edited": _bundle([]),
    }))
    assert conn.error[1] == "busy"


def test_ws_activity_sync_invalid_payload(monkeypatch):
    conn = _Conn()
    _patch(monkeypatch)
    hass = SimpleNamespace(async_create_task=lambda c: SimpleNamespace(), data={integration.DOMAIN: {}})
    bad = _bundle([])
    bad["schema_version"] = 99
    _run(integration._ws_activity_sync(hass, conn, {
        "id": 3, "entry_id": "entry-1", "activity_id": 101, "baseline": bad, "edited": _bundle([]),
    }))
    assert conn.error[1] == "invalid_payload"


def _unknown_favorite_device(bundle):
    bundle["activities"][0]["favorite_slots"][0]["device_id"] = 2


def _unknown_favorite_command(bundle):
    bundle["activities"][0]["favorite_slots"][0]["command_id"] = 99


def _duplicate_binding(bundle):
    bundle["activities"][0]["button_bindings"] = [
        {"button_id": 0xB0, "device_id": 1, "command_id": 10},
        {"button_id": 0xB0, "device_id": 1, "command_id": 10},
    ]


def _unsupported_model_button(bundle):
    bundle["activities"][0]["button_bindings"] = [
        {"button_id": 0x99, "device_id": 1, "command_id": 10},
    ]


def _orphan_delay(bundle):
    bundle["activities"][0]["macros"][0]["steps"].insert(
        0, {"device_id": 0xFF, "command_id": 0xFF, "duration": 0xFF, "delay": 2}
    )


def _overflow_timing(bundle):
    bundle["activities"][0]["macros"][0]["steps"][0]["duration"] = 256


def _stale_link_mirror(bundle):
    bundle["activities"][0]["referenced_source_device_ids"] = []


def _missing_shutdown_row(bundle):
    bundle["activities"][0]["macros"][1]["steps"] = []


def _wrong_model(bundle):
    bundle["hub"]["version"] = "X2"


@pytest.mark.parametrize(
    "mutator",
    [
        _unknown_favorite_device,
        _unknown_favorite_command,
        _duplicate_binding,
        _unsupported_model_button,
        _orphan_delay,
        _overflow_timing,
        _stale_link_mirror,
        _missing_shutdown_row,
        _wrong_model,
    ],
    ids=lambda mutator: mutator.__name__.removeprefix("_"),
)
def test_ws_activity_sync_rejects_nested_invalid_payload_before_operation(monkeypatch, mutator):
    conn = _Conn()
    _patch(monkeypatch)
    created_tasks = []
    registry = integration._BackupOperationRegistry(SimpleNamespace(loop=asyncio.new_event_loop()))
    hass = SimpleNamespace(
        async_create_task=lambda coro: created_tasks.append(coro),
        data={integration.DOMAIN: {integration._BACKUP_OPERATIONS_KEY: registry}},
    )
    edited = copy.deepcopy(_bundle([
        {"button_id": 9, "device_id": 1, "command_id": 10, "name": "Fav"},
    ]))
    mutator(edited)

    _run(integration._ws_activity_sync(hass, conn, {
        "id": 30,
        "entry_id": "entry-1",
        "activity_id": 101,
        "baseline": _bundle([]),
        "edited": edited,
    }))

    assert conn.result is None
    assert conn.error[1] == "invalid_payload"
    assert created_tasks == []
    assert registry.latest_for_entry("entry-1", kind="activity_sync") is None


def test_ws_activity_sync_plan_rejects_nested_invalid_payload(monkeypatch):
    conn = _Conn()
    _patch(monkeypatch)
    edited = _bundle([{"button_id": 9, "device_id": 1, "command_id": 10, "name": "Fav"}])
    _missing_shutdown_row(edited)
    hass = SimpleNamespace(data={integration.DOMAIN: {}})

    _run(integration._ws_activity_sync_plan(hass, conn, {
        "id": 31,
        "entry_id": "entry-1",
        "activity_id": 101,
        "baseline": _bundle([]),
        "edited": edited,
    }))

    assert conn.result is None
    assert conn.error[1] == "invalid_payload"


def test_ws_activity_sync_blocked_when_locked(monkeypatch):
    conn = _Conn()
    _patch(monkeypatch, locked=True)
    hass = SimpleNamespace(async_create_task=lambda c: SimpleNamespace(), data={integration.DOMAIN: {}})
    _run(integration._ws_activity_sync(hass, conn, {
        "id": 4, "entry_id": "entry-1", "activity_id": 101, "baseline": _bundle([]), "edited": _bundle([]),
    }))
    assert conn.error[1] == "unavailable"


def test_ws_activity_sync_plan_returns_step_summary(monkeypatch):
    conn = _Conn()
    _patch(monkeypatch)
    hass = SimpleNamespace(data={integration.DOMAIN: {}})
    _run(integration._ws_activity_sync_plan(hass, conn, {
        "id": 5, "entry_id": "entry-1", "activity_id": 101,
        "baseline": _bundle([]),
        "edited": _bundle([{"button_id": 9, "device_id": 1, "command_id": 10, "name": "Fav"}]),
    }))
    assert conn.error is None
    assert conn.result[1]["step_count"] >= 1
    kinds = [s["kind"] for s in conn.result[1]["steps"]]
    assert "favorite_add" in kinds
    assert kinds[-1] == "remote_sync"


# ── Device sync (live device editor) ────────────────────────────────────


def _device_bundle(bindings):
    return {
        "kind": "hub_bundle",
        "schema_version": integration.HUB_BUNDLE_SCHEMA_VERSION,
        "hub": {"name": "Living Room", "version": "X1S"},
        "devices": [
            {
                "device": {"device_id": 1, "name": "TV"},
                "commands": [{"command_id": 10, "name": "Power"}],
                "macros": [],
                "button_bindings": bindings,
            }
        ],
        "activities": [],
    }


def test_ws_device_sync_starts_operation(monkeypatch):
    conn = _Conn()
    started = {}
    _patch(monkeypatch)
    hass = SimpleNamespace(
        async_create_task=lambda coro: started.setdefault("coro", coro) or SimpleNamespace(),
        data={integration.DOMAIN: {}},
    )
    _run(integration._ws_device_sync(hass, conn, {
        "id": 6, "entry_id": "entry-1", "device_id": 1,
        "baseline": _device_bundle([]),
        "edited": _device_bundle([{"button_id": 0xB0, "device_id": 1, "command_id": 10}]),
    }))
    assert conn.error is None
    assert "operation_id" in conn.result[1]
    started["coro"].close()


def test_ws_device_sync_missing_device_is_invalid(monkeypatch):
    conn = _Conn()
    _patch(monkeypatch)
    hass = SimpleNamespace(async_create_task=lambda c: SimpleNamespace(), data={integration.DOMAIN: {}})
    _run(integration._ws_device_sync(hass, conn, {
        "id": 7, "entry_id": "entry-1", "device_id": 42,
        "baseline": _device_bundle([]), "edited": _device_bundle([]),
    }))
    assert conn.error[1] == "invalid_payload"


def test_ws_device_sync_registry_kind_is_device_sync(monkeypatch):
    conn = _Conn()
    started = {}
    _patch(monkeypatch)
    registry = integration._BackupOperationRegistry(SimpleNamespace(loop=asyncio.new_event_loop()))
    hass = SimpleNamespace(
        async_create_task=lambda coro: started.setdefault("coro", coro) or SimpleNamespace(),
        data={integration.DOMAIN: {integration._BACKUP_OPERATIONS_KEY: registry}},
    )
    _run(integration._ws_device_sync(hass, conn, {
        "id": 8, "entry_id": "entry-1", "device_id": 1,
        "baseline": _device_bundle([]),
        "edited": _device_bundle([{"button_id": 0xB0, "device_id": 1, "command_id": 10}]),
    }))
    assert conn.error is None
    op = registry.latest_for_entry("entry-1", kind="device_sync")
    assert op is not None and op["kind"] == "device_sync"
    started["coro"].close()


def test_ws_device_sync_plan_returns_step_summary(monkeypatch):
    conn = _Conn()
    _patch(monkeypatch)
    hass = SimpleNamespace(data={integration.DOMAIN: {}})
    _run(integration._ws_device_sync_plan(hass, conn, {
        "id": 9, "entry_id": "entry-1", "device_id": 1,
        "baseline": _device_bundle([]),
        "edited": _device_bundle([{"button_id": 0xB0, "device_id": 1, "command_id": 10}]),
    }))
    assert conn.error is None
    kinds = [s["kind"] for s in conn.result[1]["steps"]]
    assert kinds == ["binding_write"]
