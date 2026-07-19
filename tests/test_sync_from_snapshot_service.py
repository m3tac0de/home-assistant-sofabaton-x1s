"""Service-handler tests for ``export_snapshot`` and ``sync_from_snapshot``.

Style follows ``tests/test_roku_service_validation.py``: monkeypatch
``_async_resolve_hub_from_call`` with a fake hub that records calls, then
drive the ``_async_handle_*`` coroutine directly with a bare ``_FakeCall``.

These two services are the script-callable counterpart of the live Control
Panel editor's Activities/Hub tab (export) and its save action (sync) —
see ``docs/protocol/write-flows.md`` and ``services.yaml`` for the design.
``sync_from_snapshot`` shares its pre-write gauntlet and its engine entry
point with the WS ``activity/sync``/``device/sync`` commands
(``tests/test_activity_sync_ws.py``); the last test in this file proves
that sharing is real code reuse, not parallel copies, by monkeypatching the
shared helper and asserting both transports call through it.
"""

from __future__ import annotations

import asyncio
import importlib
from types import SimpleNamespace

import pytest

integration = importlib.import_module("custom_components.sofabaton_x1s.__init__")

from tests.test_activity_sync_ws import _bundle, _Conn, _device_bundle


class _FakeCall:
    def __init__(self, data: dict, hass=None):
        self.data = data
        self.hass = hass if hass is not None else SimpleNamespace(data={integration.DOMAIN: {}})


class _FakeHub:
    def __init__(self, *, version: str = "X1S", entry_id: str = "entry-1") -> None:
        self.entry_id = entry_id
        self.version = version
        self.cache_generation = 3
        self.calls: list[tuple[str, dict]] = []
        self.structural_bundle: dict | None = None
        self.sync_result: dict = {"status": "success", "completed_steps": 1, "total_steps": 1}

    async def async_get_structural_bundle(self):
        self.calls.append(("get_structural_bundle", {}))
        return self.structural_bundle

    async def async_sync_activity(self, *, baseline, edited, activity_id, progress_callback=None):
        self.calls.append(
            ("sync_activity", {"baseline": baseline, "edited": edited, "activity_id": activity_id})
        )
        return self.sync_result

    async def async_sync_device(self, *, baseline, edited, device_id, progress_callback=None):
        self.calls.append(
            ("sync_device", {"baseline": baseline, "edited": edited, "device_id": device_id})
        )
        return self.sync_result

    async def async_request_catalog(self, kind):
        self.calls.append(("request_catalog", {"kind": kind}))

    async def async_refresh_entity_structure(self, *, kind, ent_id):
        self.calls.append(("refresh_entity_structure", {"kind": kind, "ent_id": ent_id}))


def _wire_hub(monkeypatch, hub: _FakeHub | None = None) -> _FakeHub:
    hub = hub if hub is not None else _FakeHub()

    async def _resolve(_hass, _call):
        return hub

    monkeypatch.setattr(integration, "_async_resolve_hub_from_call", _resolve)
    return hub


def _wire_cache_store(monkeypatch, *, enabled: bool) -> None:
    async def fake_store(_hass):
        return SimpleNamespace(enabled=enabled)

    monkeypatch.setattr(integration, "_async_get_persistent_cache_store", fake_store)


# ---------------------------------------------------------------------------
# export_snapshot
# ---------------------------------------------------------------------------


def test_export_snapshot_requires_a_resolvable_hub(monkeypatch) -> None:
    async def _resolve(_hass, _call):
        return None

    monkeypatch.setattr(integration, "_async_resolve_hub_from_call", _resolve)

    with pytest.raises(ValueError, match="Could not resolve Sofabaton hub"):
        asyncio.run(integration._async_handle_export_snapshot(_FakeCall({})))


def test_export_snapshot_requires_persistent_cache_enabled(monkeypatch) -> None:
    _wire_hub(monkeypatch)
    _wire_cache_store(monkeypatch, enabled=False)

    with pytest.raises(integration.HomeAssistantError, match="persistent cache"):
        asyncio.run(integration._async_handle_export_snapshot(_FakeCall({})))


def test_export_snapshot_requires_a_populated_cache(monkeypatch) -> None:
    hub = _wire_hub(monkeypatch)
    hub.structural_bundle = None
    _wire_cache_store(monkeypatch, enabled=True)

    with pytest.raises(integration.HomeAssistantError, match="No cached structural snapshot"):
        asyncio.run(integration._async_handle_export_snapshot(_FakeCall({})))


def test_export_snapshot_returns_cached_bundle_and_generation(monkeypatch) -> None:
    hub = _wire_hub(monkeypatch)
    hub.structural_bundle = _bundle([])
    hub.cache_generation = 42
    _wire_cache_store(monkeypatch, enabled=True)

    result = asyncio.run(integration._async_handle_export_snapshot(_FakeCall({})))

    assert result == {"bundle": hub.structural_bundle, "generation": 42}
    assert hub.calls == [("get_structural_bundle", {})]


# ---------------------------------------------------------------------------
# sync_from_snapshot: field validation (before any hub write)
# ---------------------------------------------------------------------------


def test_sync_from_snapshot_requires_a_resolvable_hub(monkeypatch) -> None:
    async def _resolve(_hass, _call):
        return None

    monkeypatch.setattr(integration, "_async_resolve_hub_from_call", _resolve)

    with pytest.raises(ValueError, match="Could not resolve Sofabaton hub"):
        asyncio.run(
            integration._async_handle_sync_from_snapshot(
                _FakeCall({"entity_kind": "device", "entity_id": 1, "baseline": {}, "edited": {}})
            )
        )


def test_sync_from_snapshot_requires_valid_entity_kind(monkeypatch) -> None:
    _wire_hub(monkeypatch)

    with pytest.raises(ValueError, match="entity_kind must be 'activity' or 'device'"):
        asyncio.run(
            integration._async_handle_sync_from_snapshot(
                _FakeCall(
                    {"entity_kind": "activity_group", "entity_id": 1, "baseline": {}, "edited": {}}
                )
            )
        )


def test_sync_from_snapshot_requires_dict_baseline_and_edited(monkeypatch) -> None:
    _wire_hub(monkeypatch)

    with pytest.raises(ValueError, match="baseline and edited must be hub_bundle objects"):
        asyncio.run(
            integration._async_handle_sync_from_snapshot(
                _FakeCall({"entity_kind": "device", "entity_id": 1, "baseline": None, "edited": {}})
            )
        )


def test_sync_from_snapshot_rejects_when_busy(monkeypatch) -> None:
    hub = _wire_hub(monkeypatch)
    registry = integration._BackupOperationRegistry(SimpleNamespace(loop=asyncio.new_event_loop()))
    registry.create(kind="device_sync", entry_id=hub.entry_id, initial_state={"status": "running"})
    call = _FakeCall(
        {
            "entity_kind": "device",
            "entity_id": 1,
            "baseline": _device_bundle([]),
            "edited": _device_bundle([]),
        },
        hass=SimpleNamespace(data={integration.DOMAIN: {integration._BACKUP_OPERATIONS_KEY: registry}}),
    )

    with pytest.raises(integration.HomeAssistantError, match="already running"):
        asyncio.run(integration._async_handle_sync_from_snapshot(call))

    assert hub.calls == []


def test_sync_from_snapshot_rejects_invalid_bundle_payload(monkeypatch) -> None:
    _wire_hub(monkeypatch)
    bad_baseline = _device_bundle([])
    bad_baseline["schema_version"] = 99

    with pytest.raises(integration.HomeAssistantError, match="schema_version"):
        asyncio.run(
            integration._async_handle_sync_from_snapshot(
                _FakeCall(
                    {
                        "entity_kind": "device",
                        "entity_id": 1,
                        "baseline": bad_baseline,
                        "edited": _device_bundle([]),
                    }
                )
            )
        )


# ---------------------------------------------------------------------------
# sync_from_snapshot: drives the same engine entry point as the WS handler
# ---------------------------------------------------------------------------


def test_sync_from_snapshot_drives_hub_async_sync_device_and_returns_result(monkeypatch) -> None:
    hub = _wire_hub(monkeypatch)
    _wire_cache_store(monkeypatch, enabled=False)
    baseline = _device_bundle([])
    edited = _device_bundle([{"button_id": 0xB0, "device_id": 1, "command_id": 10}])

    result = asyncio.run(
        integration._async_handle_sync_from_snapshot(
            _FakeCall(
                {"entity_kind": "device", "entity_id": 1, "baseline": baseline, "edited": edited}
            )
        )
    )

    assert result == hub.sync_result
    sync_calls = [c for c in hub.calls if c[0] == "sync_device"]
    assert len(sync_calls) == 1
    assert sync_calls[0][1]["device_id"] == 1
    assert sync_calls[0][1]["baseline"] == baseline
    assert sync_calls[0][1]["edited"] == edited
    # Success tail runs the same post-sync cache refresh the WS path gets.
    assert ("request_catalog", {"kind": "devices"}) in hub.calls
    assert ("refresh_entity_structure", {"kind": "device", "ent_id": 1}) in hub.calls


def test_sync_from_snapshot_drives_hub_async_sync_activity_for_activity_kind(monkeypatch) -> None:
    hub = _wire_hub(monkeypatch)
    _wire_cache_store(monkeypatch, enabled=False)
    baseline = _bundle([])
    edited = _bundle([{"button_id": 9, "device_id": 1, "command_id": 10, "name": "Fav"}])

    result = asyncio.run(
        integration._async_handle_sync_from_snapshot(
            _FakeCall(
                {"entity_kind": "activity", "entity_id": 101, "baseline": baseline, "edited": edited}
            )
        )
    )

    assert result == hub.sync_result
    sync_calls = [c for c in hub.calls if c[0] == "sync_activity"]
    assert len(sync_calls) == 1
    assert sync_calls[0][1]["activity_id"] == 101


def test_sync_from_snapshot_raises_when_engine_reports_failure(monkeypatch) -> None:
    hub = _wire_hub(monkeypatch)
    _wire_cache_store(monkeypatch, enabled=False)
    hub.sync_result = {
        "status": "failed",
        "failed_at": "stale_check",
        "message": "This device changed on the hub after you loaded it.",
    }
    baseline = _device_bundle([])
    edited = _device_bundle([{"button_id": 0xB0, "device_id": 1, "command_id": 10}])

    with pytest.raises(integration.HomeAssistantError, match="changed on the hub"):
        asyncio.run(
            integration._async_handle_sync_from_snapshot(
                _FakeCall(
                    {"entity_kind": "device", "entity_id": 1, "baseline": baseline, "edited": edited}
                )
            )
        )


def test_sync_from_snapshot_accepts_string_entity_id(monkeypatch) -> None:
    """Service calls from YAML scripts commonly arrive as strings; every
    other numeric field in this integration's services tolerates that.
    entity_id goes through the same int() coercion _validate_entity_sync_inputs
    already applies to activity_id/device_id from the WS payload."""

    hub = _wire_hub(monkeypatch)
    _wire_cache_store(monkeypatch, enabled=False)
    baseline = _device_bundle([])
    edited = _device_bundle([{"button_id": 0xB0, "device_id": 1, "command_id": 10}])

    result = asyncio.run(
        integration._async_handle_sync_from_snapshot(
            _FakeCall(
                {"entity_kind": "device", "entity_id": "1", "baseline": baseline, "edited": edited}
            )
        )
    )

    assert result == hub.sync_result


# ---------------------------------------------------------------------------
# WS and service both funnel through _async_prepare_entity_sync
# ---------------------------------------------------------------------------


def test_ws_and_service_share_the_prepare_entity_sync_helper(monkeypatch) -> None:
    """Proves the refactor is real code sharing, not two parallel copies of
    the busy/lock/validate/register logic: both the WS ``activity/sync``
    command and the ``sync_from_snapshot`` service call through
    ``_async_prepare_entity_sync``, and both hand its output to
    ``_run_entity_sync_operation`` — the same engine entry point."""

    prepare_calls: list[dict] = []
    canned_baseline = _bundle([])
    canned_edited = _bundle([{"button_id": 9, "device_id": 1, "command_id": 10, "name": "Fav"}])

    async def fake_prepare(_hass, *, hub, entity_kind, sync_input, operation_label):
        prepare_calls.append(
            {
                "hub": hub,
                "entity_kind": entity_kind,
                "operation_label": operation_label,
                "activity_id": sync_input.get("activity_id"),
            }
        )
        return f"op-{len(prepare_calls)}", canned_baseline, canned_edited, 101

    monkeypatch.setattr(integration, "_async_prepare_entity_sync", fake_prepare)

    hub = _wire_hub(monkeypatch)

    async def fake_resolve_data(_hass, _data):
        return hub

    monkeypatch.setattr(integration, "_async_resolve_hub_from_data", fake_resolve_data)

    # WS transport
    conn = _Conn()
    ws_hass = SimpleNamespace(
        async_create_task=lambda coro: coro.close(),
        data={integration.DOMAIN: {}},
    )
    asyncio.run(
        integration._ws_activity_sync(
            ws_hass,
            conn,
            {
                "id": 1,
                "entry_id": "entry-1",
                "activity_id": 101,
                "baseline": canned_baseline,
                "edited": canned_edited,
            },
        )
    )
    assert conn.error is None
    assert conn.result[1]["operation_id"] == "op-1"

    # service transport
    result = asyncio.run(
        integration._async_handle_sync_from_snapshot(
            _FakeCall(
                {
                    "entity_kind": "activity",
                    "entity_id": 101,
                    "baseline": canned_baseline,
                    "edited": canned_edited,
                }
            )
        )
    )
    assert result == hub.sync_result

    assert len(prepare_calls) == 2
    assert prepare_calls[0]["hub"] is hub
    assert prepare_calls[1]["hub"] is hub
    assert prepare_calls[0]["entity_kind"] == "activity"
    assert prepare_calls[1]["entity_kind"] == "activity"
    assert prepare_calls[0]["operation_label"] == "_ws_activity_sync"
    assert prepare_calls[1]["operation_label"] == "sync_from_snapshot[activity]"
    # Both transports fed _async_prepare_entity_sync the same activity_id.
    assert prepare_calls[0]["activity_id"] == 101
