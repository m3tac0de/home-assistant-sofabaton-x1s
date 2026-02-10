import asyncio

import pytest

import importlib

integration = importlib.import_module("custom_components.sofabaton_x1s.__init__")


class _FakeCall:
    def __init__(self, data: dict):
        self.data = data
        self.hass = object()


class _FakeHub:
    def __init__(self) -> None:
        self.calls: list[dict] = []

    async def async_create_wifi_device(self, *, device_name: str, commands: list[str]):
        payload = {
            "device_name": device_name,
            "commands": commands,
        }
        self.calls.append(payload)
        return payload

    async def async_add_device_to_activity(self, *, activity_id: int, device_id: int):
        payload = {
            "activity_id": activity_id,
            "device_id": device_id,
        }
        self.calls.append(payload)
        return payload

    async def async_command_to_favorite(
        self,
        *,
        activity_id: int,
        device_id: int,
        command_id: int,
        slot_id: int,
    ):
        payload = {
            "activity_id": activity_id,
            "device_id": device_id,
            "command_id": command_id,
            "slot_id": slot_id,
        }
        self.calls.append(payload)
        return payload


def test_create_wifi_device_requires_commands(monkeypatch) -> None:
    hub = _FakeHub()
    async def _resolve(hass, call):
        return hub

    monkeypatch.setattr(integration, "_async_resolve_hub_from_call", _resolve)

    with pytest.raises(ValueError, match="commands requires between 1 and 10 entries"):
        asyncio.run(
            integration._async_handle_create_wifi_device(
                _FakeCall({"device_name": "Home Assistant", "commands": []})
            )
        )


def test_create_wifi_device_validates_device_name(monkeypatch) -> None:
    hub = _FakeHub()
    async def _resolve(hass, call):
        return hub

    monkeypatch.setattr(integration, "_async_resolve_hub_from_call", _resolve)

    with pytest.raises(ValueError, match="device_name must contain only letters, numbers, and spaces"):
        asyncio.run(
            integration._async_handle_create_wifi_device(
                _FakeCall({"device_name": "Living-Room", "commands": ["Launch"]})
            )
        )


def test_create_wifi_device_validates_command_names(monkeypatch) -> None:
    hub = _FakeHub()
    async def _resolve(hass, call):
        return hub

    monkeypatch.setattr(integration, "_async_resolve_hub_from_call", _resolve)

    with pytest.raises(ValueError, match="commands entries must contain only letters, numbers, and spaces"):
        asyncio.run(
            integration._async_handle_create_wifi_device(
                _FakeCall({"device_name": "Living Room", "commands": ["Do_Thing"]})
            )
        )


def test_create_wifi_device_accepts_valid_input(monkeypatch) -> None:
    hub = _FakeHub()
    async def _resolve(hass, call):
        return hub

    monkeypatch.setattr(integration, "_async_resolve_hub_from_call", _resolve)

    result = asyncio.run(
        integration._async_handle_create_wifi_device(
            _FakeCall({"device_name": "Living Room", "commands": ["Lights On", "Lights Off"]})
        )
    )

    assert result == {
        "device_name": "Living Room",
        "commands": ["Lights On", "Lights Off"],
    }
    assert hub.calls == [result]


def test_device_to_activity_validates_activity_id(monkeypatch) -> None:
    hub = _FakeHub()

    async def _resolve(hass, call):
        return hub

    monkeypatch.setattr(integration, "_async_resolve_hub_from_call", _resolve)

    with pytest.raises(ValueError, match="activity_id must be between 1 and 255"):
        asyncio.run(
            integration._async_handle_device_to_activity(
                _FakeCall({"activity_id": 0, "device_id": 6})
            )
        )


def test_device_to_activity_accepts_valid_input(monkeypatch) -> None:
    hub = _FakeHub()

    async def _resolve(hass, call):
        return hub

    monkeypatch.setattr(integration, "_async_resolve_hub_from_call", _resolve)

    result = asyncio.run(
        integration._async_handle_device_to_activity(
            _FakeCall({"activity_id": 101, "device_id": 6})
        )
    )

    assert result == {"activity_id": 101, "device_id": 6}
    assert hub.calls[-1] == result



def test_command_to_favorite_validates_command_id(monkeypatch) -> None:
    hub = _FakeHub()

    async def _resolve(hass, call):
        return hub

    monkeypatch.setattr(integration, "_async_resolve_hub_from_call", _resolve)

    with pytest.raises(ValueError, match="command_id must be between 1 and 255"):
        asyncio.run(
            integration._async_handle_command_to_favorite(
                _FakeCall({"activity_id": 101, "device_id": 6, "command_id": 0})
            )
        )


def test_command_to_favorite_accepts_valid_input(monkeypatch) -> None:
    hub = _FakeHub()

    async def _resolve(hass, call):
        return hub

    monkeypatch.setattr(integration, "_async_resolve_hub_from_call", _resolve)

    result = asyncio.run(
        integration._async_handle_command_to_favorite(
            _FakeCall({"activity_id": 101, "device_id": 6, "command_id": 4, "slot_id": 0})
        )
    )

    assert result == {"activity_id": 101, "device_id": 6, "command_id": 4, "slot_id": 0}
    assert hub.calls[-1] == result
