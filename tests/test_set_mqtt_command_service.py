"""Service-handler tests for ``set_mqtt_command`` (issue #330).

The action adds or renames one command on a ``wifi_mqtt`` (X2 MQTT)
device. The record is two bytes the hub ignores (a press publishes the
hub's own device id and the command id to ``<MAC>/up``), so the name is
all the action writes: an add puts a ``CommandRecord`` row in the cached
structural snapshot with ``lib.edits``, a rename renames the row, and the
device sync the ``sync_from_snapshot`` service runs writes it. The fake
hub records the sync's bundle pair; the planner is run on it to show the
write it becomes.
"""

from __future__ import annotations

import asyncio
import copy
import importlib
from types import SimpleNamespace

import pytest

integration = importlib.import_module("custom_components.sofabaton_x1s.__init__")
services_module = importlib.import_module("custom_components.sofabaton_x1s.services")
entity_sync_module = importlib.import_module("custom_components.sofabaton_x1s.entity_sync")
runtime_module = importlib.import_module("custom_components.sofabaton_x1s.runtime")

from custom_components.sofabaton_x1s.lib.activity_sync import build_device_sync_plan

DEVICE_ID = 8


def _bundle(*, brand: str = "", device_class: str = "wifi_mqtt", command_ids=(1,)) -> dict:
    return {
        "kind": "hub_bundle",
        "schema_version": entity_sync_module.HUB_BUNDLE_SCHEMA_VERSION,
        "payload_profile": "structural",
        "hub": {"name": "Living Room", "version": "X2"},
        "devices": [
            {
                "kind": "device_backup",
                "complete": True,
                "payload_profile": "structural",
                "device": {
                    "device_id": DEVICE_ID,
                    "name": "Matrix",
                    "brand": brand,
                    "device_class": device_class,
                    "idle_behavior": 4,
                },
                "commands": [{"command_id": cid, "name": f"Input {cid}"} for cid in command_ids],
                "key_sort": None,
                "input_record": None,
                "button_bindings": [],
                "macros": [],
            }
        ],
        "activities": [],
    }


class _FakeCall:
    def __init__(self, data: dict, hass=None):
        self.data = data
        self.hass = hass if hass is not None else SimpleNamespace(data={integration.DOMAIN: {}})


class _FakeHub:
    def __init__(self) -> None:
        self.entry_id = "entry-1"
        self.version = "X2"
        self.cache_generation = 3
        self.hub_work_active = False
        self.calls: list[tuple[str, dict]] = []
        self.structural_bundle: dict | None = _bundle()
        self.sync_result: dict = {"status": "success", "completed_steps": 1, "total_steps": 1}

    async def async_get_structural_bundle(self):
        return copy.deepcopy(self.structural_bundle)

    async def async_fetch_blob(self, *, device_id, command_id=None):
        self.calls.append(("fetch_blob", {"device_id": device_id, "command_id": command_id}))
        return {"device_id": device_id, "commands": []}

    async def async_sync_device(self, *, baseline, edited, device_id, progress_callback=None, allow_command_removal=False):
        self.calls.append(("sync_device", {"baseline": baseline, "edited": edited, "device_id": device_id}))
        return self.sync_result

    async def async_request_catalog(self, kind):
        self.calls.append(("request_catalog", {"kind": kind}))

    async def async_export_cache_state(self):
        return {}


def _wire(monkeypatch, hub: _FakeHub, *, cache_enabled: bool = True) -> _FakeHub:
    async def _resolve(_hass, _call):
        return hub

    async def _set_hub_cache(_entry_id, _payload):
        return None

    async def _store(_hass):
        return SimpleNamespace(enabled=cache_enabled, async_set_hub_cache=_set_hub_cache)

    monkeypatch.setattr(runtime_module, "_async_resolve_hub_from_call", _resolve)
    monkeypatch.setattr(runtime_module, "_async_get_persistent_cache_store", _store)
    return hub


def _run(data: dict, hass=None):
    return asyncio.run(integration._async_handle_set_mqtt_command(_FakeCall({"device_id": DEVICE_ID, **data}, hass)))


def _synced(hub: _FakeHub) -> tuple[dict, dict]:
    (sync,) = [payload for name, payload in hub.calls if name == "sync_device"]
    return sync["baseline"], sync["edited"]


def _row(bundle: dict, command_id: int) -> dict:
    (row,) = [r for r in bundle["devices"][0]["commands"] if r["command_id"] == command_id]
    return row


def test_set_mqtt_command_is_registered_with_a_response() -> None:
    table = {name: responds for name, _handler, responds in services_module.SERVICES}
    assert table["set_mqtt_command"] is True


# ---------------------------------------------------------------------------
# Refusals before any hub I/O
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("data", [{}, {"command_id": 1}, {"name": "   "}])
def test_needs_a_name(monkeypatch, data) -> None:
    hub = _wire(monkeypatch, _FakeHub())

    with pytest.raises(ValueError, match="name is required"):
        _run(data)
    assert hub.calls == []


@pytest.mark.parametrize(
    ("data", "match"),
    [
        ({"device_id": 0}, "device_id must be between 1 and 255"),
        ({"command_id": 256}, "command_id must be between 1 and 255"),
    ],
)
def test_refuses_ids_out_of_range(monkeypatch, data, match) -> None:
    hub = _wire(monkeypatch, _FakeHub())

    with pytest.raises(ValueError, match=match):
        _run({"name": "Input", **data})
    assert hub.calls == []


def test_needs_the_persistent_cache(monkeypatch) -> None:
    hub = _wire(monkeypatch, _FakeHub(), cache_enabled=False)

    with pytest.raises(services_module.HomeAssistantError, match="set_mqtt_command requires the persistent cache"):
        _run({"name": "Input"})
    assert hub.calls == []


def test_refuses_a_device_that_is_not_mqtt(monkeypatch) -> None:
    hub = _FakeHub()
    hub.structural_bundle = _bundle(device_class="wifi_ip")
    _wire(monkeypatch, hub)

    with pytest.raises(ValueError, match="not a wifi_mqtt device"):
        _run({"name": "Input"})
    assert hub.calls == []


def test_refuses_a_device_missing_from_the_snapshot(monkeypatch) -> None:
    hub = _wire(monkeypatch, _FakeHub())

    with pytest.raises(ValueError, match="device 9 is not in the cached snapshot"):
        _run({"device_id": 9, "name": "Input"})
    assert hub.calls == []


def test_refuses_a_wifi_device_the_integration_deploys(monkeypatch) -> None:
    hub = _FakeHub()
    hub.structural_bundle = _bundle(brand="m3-default-abc123")
    _wire(monkeypatch, hub)

    with pytest.raises(services_module.HomeAssistantError, match="Wifi Commands tab"):
        _run({"name": "Input"})
    assert hub.calls == []


# ---------------------------------------------------------------------------
# Adding a command
# ---------------------------------------------------------------------------


def test_adds_a_command_through_the_device_sync(monkeypatch) -> None:
    hub = _wire(monkeypatch, _FakeHub())

    result = _run({"name": "  Media input 2  "})

    assert result["device_id"] == DEVICE_ID
    assert result["command_id"] == 2
    assert result["status"] == "success"
    baseline, edited = _synced(hub)
    row = _row(edited, 2)
    assert row["name"] == "Media input 2"
    # The vendor app's (device_id, command_id) pair, as a wifi_mqtt record.
    assert row["restore_data"] == {
        "transport": "hub_code_record",
        "library_type": 0x20,
        "button_code": 0,
        "data_hex": f"{DEVICE_ID:02x}02",
        "new": True,
    }
    assert [step.kind for step in build_device_sync_plan(baseline, edited, DEVICE_ID)] == ["command_add"]
    # The sync's success tail ran: the hub's device list is read again.
    assert ("request_catalog", {"kind": "devices"}) in hub.calls
    # An inert record needs no read of anything stored.
    assert not [name for name, _ in hub.calls if name == "fetch_blob"]


def test_adds_the_first_command_on_an_empty_device(monkeypatch) -> None:
    # A device made with create_device has no commands yet.
    hub = _FakeHub()
    hub.structural_bundle = _bundle(command_ids=())
    _wire(monkeypatch, hub)

    result = _run({"name": "Media input 1"})

    assert result["command_id"] == 1
    _baseline, edited = _synced(hub)
    assert _row(edited, 1)["restore_data"]["data_hex"] == f"{DEVICE_ID:02x}01"


def test_adds_at_the_lowest_free_command_id(monkeypatch) -> None:
    hub = _FakeHub()
    hub.structural_bundle = _bundle(command_ids=(1, 3))
    _wire(monkeypatch, hub)

    result = _run({"name": "Media input 2"})

    assert result["command_id"] == 2
    _baseline, edited = _synced(hub)
    assert _row(edited, 2)["restore_data"]["data_hex"] == f"{DEVICE_ID:02x}02"


def test_refuses_to_add_when_every_command_id_is_taken(monkeypatch) -> None:
    hub = _FakeHub()
    hub.structural_bundle = _bundle(command_ids=range(1, 256))
    _wire(monkeypatch, hub)

    with pytest.raises(ValueError, match="all 255 command ids"):
        _run({"name": "One too many"})
    assert hub.calls == []


# ---------------------------------------------------------------------------
# Renaming a command
# ---------------------------------------------------------------------------


def test_renames_a_command_through_the_device_sync(monkeypatch) -> None:
    hub = _wire(monkeypatch, _FakeHub())

    result = _run({"command_id": 1, "name": "HDMI 1"})

    assert result["command_id"] == 1
    baseline, edited = _synced(hub)
    row = _row(edited, 1)
    assert row["name"] == "HDMI 1"
    assert "restore_data" not in row
    assert [step.kind for step in build_device_sync_plan(baseline, edited, DEVICE_ID)] == ["command_rename"]
    assert not [name for name, _ in hub.calls if name == "fetch_blob"]


def test_rename_refuses_a_command_the_device_does_not_have(monkeypatch) -> None:
    hub = _wire(monkeypatch, _FakeHub())

    with pytest.raises(ValueError, match="has no command 9"):
        _run({"command_id": 9, "name": "HDMI 9"})
    assert hub.calls == []


# ---------------------------------------------------------------------------
# The sync's own verdicts
# ---------------------------------------------------------------------------


def test_refuses_while_the_hub_is_busy(monkeypatch) -> None:
    hub = _FakeHub()
    hub.hub_work_active = True
    _wire(monkeypatch, hub)

    with pytest.raises(services_module.HomeAssistantError, match="already running"):
        _run({"name": "Input"})
    assert hub.calls == []


def test_a_failed_sync_raises_its_message(monkeypatch) -> None:
    hub = _FakeHub()
    hub.sync_result = {
        "status": "failed",
        "failed_at": "stale_check",
        "message": "This device changed on the hub after you loaded it.",
    }
    _wire(monkeypatch, hub)

    with pytest.raises(services_module.HomeAssistantError, match="changed on the hub"):
        _run({"name": "Input"})
