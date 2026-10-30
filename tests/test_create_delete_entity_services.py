"""Service-handler tests for ``create_activity``, ``delete_activity`` and
``create_device`` (issue #299).

Style follows ``tests/test_roku_service_validation.py``: monkeypatch
``_async_resolve_hub_from_call`` with a fake hub that records calls, then
drive the ``_async_handle_*`` coroutine directly with a bare ``_FakeCall``.
The three are the script-callable Add Activity, activity delete and Add
device of the Control Panel (WS ``activity/create``, ``activity/delete``,
``device/create``), with the same per-entity cache read after a create.
"""

from __future__ import annotations

import asyncio
import importlib
from types import SimpleNamespace

import pytest

integration = importlib.import_module("custom_components.sofabaton_x1s.__init__")
services_module = importlib.import_module("custom_components.sofabaton_x1s.services")
runtime_module = importlib.import_module("custom_components.sofabaton_x1s.runtime")


class _FakeCall:
    def __init__(self, data: dict):
        self.data = data
        self.hass = SimpleNamespace()


class _FakeHub:
    def __init__(self, *, version: str = "X1S") -> None:
        self.entry_id = "entry-1"
        self.version = version
        self.calls: list[tuple[str, dict]] = []
        self.create_result: dict | None = None
        self.delete_result: dict | None = {"status": "success"}
        self.refresh_error: Exception | None = None

    async def async_create_activity(self, name, *, icon=None, color_id=None):
        self.calls.append(("create_activity", {"name": name, "icon": icon, "color_id": color_id}))
        return self.create_result

    async def async_create_device(self, name, *, device_class, icon=None, color_id=None):
        self.calls.append(
            ("create_device", {"name": name, "device_class": device_class, "icon": icon, "color_id": color_id})
        )
        return self.create_result

    async def async_delete_device(self, *, device_id, sync_remotes=False):
        self.calls.append(("delete_device", {"device_id": device_id, "sync_remotes": sync_remotes}))
        return self.delete_result

    async def async_refresh_entity_structure(self, *, kind, ent_id):
        self.calls.append(("refresh_entity_structure", {"kind": kind, "ent_id": ent_id}))
        if self.refresh_error is not None:
            raise self.refresh_error


def _wire_hub(monkeypatch, hub: _FakeHub) -> _FakeHub:
    async def _resolve(_hass, _call):
        return hub

    monkeypatch.setattr(runtime_module, "_async_resolve_hub_from_call", _resolve)
    return hub


def test_the_three_services_are_registered_with_their_response_modes() -> None:
    table = {name: responds for name, _handler, responds in services_module.SERVICES}

    assert table["create_activity"] is True
    assert table["delete_activity"] is False
    assert table["create_device"] is True


# ---------------------------------------------------------------------------
# create_activity
# ---------------------------------------------------------------------------


def test_create_activity_requires_a_name(monkeypatch) -> None:
    hub = _wire_hub(monkeypatch, _FakeHub())

    with pytest.raises(ValueError, match="name is required"):
        asyncio.run(integration._async_handle_create_activity(_FakeCall({"name": "  "})))
    assert hub.calls == []


def test_create_activity_refuses_a_name_the_hub_cannot_store(monkeypatch) -> None:
    # X1 names are ASCII letters, digits and spaces only.
    hub = _wire_hub(monkeypatch, _FakeHub(version="X1"))

    with pytest.raises(ValueError):
        asyncio.run(integration._async_handle_create_activity(_FakeCall({"name": "Café"})))
    assert hub.calls == []


def test_create_activity_refuses_a_color_off_the_x2(monkeypatch) -> None:
    hub = _wire_hub(monkeypatch, _FakeHub(version="X1S"))

    with pytest.raises(ValueError, match="only an X2"):
        asyncio.run(
            integration._async_handle_create_activity(_FakeCall({"name": "Movie", "color_id": 3}))
        )
    assert hub.calls == []


def test_create_activity_creates_reads_it_into_the_cache_and_returns_its_id(monkeypatch) -> None:
    hub = _wire_hub(monkeypatch, _FakeHub(version="X2"))
    hub.create_result = {"status": "success", "activity_id": 104}

    result = asyncio.run(
        integration._async_handle_create_activity(
            # Number selectors hand floats over.
            _FakeCall({"name": " Movie night ", "icon": 3.0, "color_id": 2.0})
        )
    )

    assert result == {"activity_id": 104}
    assert hub.calls == [
        ("create_activity", {"name": "Movie night", "icon": 3, "color_id": 2}),
        ("refresh_entity_structure", {"kind": "activity", "ent_id": 104}),
    ]


def test_create_activity_raises_when_the_hub_does_not_confirm(monkeypatch) -> None:
    hub = _wire_hub(monkeypatch, _FakeHub())
    hub.create_result = None

    with pytest.raises(services_module.HomeAssistantError, match="did not confirm"):
        asyncio.run(integration._async_handle_create_activity(_FakeCall({"name": "Movie"})))
    assert [name for name, _ in hub.calls] == ["create_activity"]


def test_create_activity_stands_when_its_cache_read_fails(monkeypatch) -> None:
    hub = _wire_hub(monkeypatch, _FakeHub())
    hub.create_result = {"status": "success", "activity_id": 105}
    hub.refresh_error = RuntimeError("read timed out")

    result = asyncio.run(integration._async_handle_create_activity(_FakeCall({"name": "Movie"})))

    assert result == {"activity_id": 105}


# ---------------------------------------------------------------------------
# delete_activity
# ---------------------------------------------------------------------------


def test_delete_activity_refuses_a_device_id(monkeypatch) -> None:
    hub = _wire_hub(monkeypatch, _FakeHub())

    with pytest.raises(ValueError, match="between 101 and 255"):
        asyncio.run(integration._async_handle_delete_activity(_FakeCall({"activity_id": 5})))
    assert hub.calls == []


def test_delete_activity_deletes_by_id_and_syncs_the_remotes(monkeypatch) -> None:
    hub = _wire_hub(monkeypatch, _FakeHub())

    asyncio.run(integration._async_handle_delete_activity(_FakeCall({"activity_id": 103})))

    assert hub.calls == [("delete_device", {"device_id": 103, "sync_remotes": True})]


def test_delete_activity_raises_when_the_hub_does_not_confirm(monkeypatch) -> None:
    hub = _wire_hub(monkeypatch, _FakeHub())
    hub.delete_result = None

    with pytest.raises(services_module.HomeAssistantError, match="activity 103"):
        asyncio.run(integration._async_handle_delete_activity(_FakeCall({"activity_id": 103})))


# ---------------------------------------------------------------------------
# create_device
# ---------------------------------------------------------------------------


def test_create_device_refuses_a_class_the_hub_cannot_create(monkeypatch) -> None:
    hub = _wire_hub(monkeypatch, _FakeHub(version="X1"))

    with pytest.raises(ValueError, match="device_class must be one of"):
        asyncio.run(
            integration._async_handle_create_device(
                _FakeCall({"name": "HTTP box", "device_class": "wifi_ip"})
            )
        )
    assert hub.calls == []


def test_create_device_creates_an_aliased_class_and_returns_its_id(monkeypatch) -> None:
    hub = _wire_hub(monkeypatch, _FakeHub(version="X1S"))
    hub.create_result = {"status": "success", "device_id": 12}

    result = asyncio.run(
        integration._async_handle_create_device(
            _FakeCall({"name": "HTTP box", "device_class": "IP", "icon": 2})
        )
    )

    assert result == {"device_id": 12}
    assert hub.calls == [
        ("create_device", {"name": "HTTP box", "device_class": "wifi_ip", "icon": 2, "color_id": None}),
        ("refresh_entity_structure", {"kind": "device", "ent_id": 12}),
    ]


def test_create_device_raises_when_the_hub_reports_no_id(monkeypatch) -> None:
    hub = _wire_hub(monkeypatch, _FakeHub(version="X1S"))
    hub.create_result = {"status": "success"}

    with pytest.raises(services_module.HomeAssistantError, match="did not confirm"):
        asyncio.run(
            integration._async_handle_create_device(
                _FakeCall({"name": "HTTP box", "device_class": "wifi_ip"})
            )
        )
    assert [name for name, _ in hub.calls] == ["create_device"]
