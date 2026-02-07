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

    async def async_create_roku_device(self, *, device_name: str, ip_address: str, commands: list[str]):
        payload = {
            "device_name": device_name,
            "ip_address": ip_address,
            "commands": commands,
        }
        self.calls.append(payload)
        return payload


def test_create_roku_device_requires_commands(monkeypatch) -> None:
    hub = _FakeHub()
    async def _resolve(hass, call):
        return hub

    monkeypatch.setattr(integration, "_async_resolve_hub_from_call", _resolve)

    with pytest.raises(ValueError, match="commands requires between 1 and 10 entries"):
        asyncio.run(
            integration._async_handle_create_roku_device(
                _FakeCall({"device_name": "Home Assistant", "ip_address": "192.168.1.2", "commands": []})
            )
        )


def test_create_roku_device_validates_device_name(monkeypatch) -> None:
    hub = _FakeHub()
    async def _resolve(hass, call):
        return hub

    monkeypatch.setattr(integration, "_async_resolve_hub_from_call", _resolve)

    with pytest.raises(ValueError, match="device_name must contain only letters, numbers, and spaces"):
        asyncio.run(
            integration._async_handle_create_roku_device(
                _FakeCall({"device_name": "Living-Room", "ip_address": "192.168.1.2", "commands": ["Launch"]})
            )
        )


def test_create_roku_device_validates_command_names(monkeypatch) -> None:
    hub = _FakeHub()
    async def _resolve(hass, call):
        return hub

    monkeypatch.setattr(integration, "_async_resolve_hub_from_call", _resolve)

    with pytest.raises(ValueError, match="commands entries must contain only letters, numbers, and spaces"):
        asyncio.run(
            integration._async_handle_create_roku_device(
                _FakeCall({"device_name": "Living Room", "ip_address": "192.168.1.2", "commands": ["Do_Thing"]})
            )
        )


def test_create_roku_device_accepts_valid_input(monkeypatch) -> None:
    hub = _FakeHub()
    async def _resolve(hass, call):
        return hub

    monkeypatch.setattr(integration, "_async_resolve_hub_from_call", _resolve)

    result = asyncio.run(
        integration._async_handle_create_roku_device(
            _FakeCall({"device_name": "Living Room", "ip_address": "10.0.0.7", "commands": ["Lights On", "Lights Off"]})
        )
    )

    assert result == {
        "device_name": "Living Room",
        "ip_address": "10.0.0.7",
        "commands": ["Lights On", "Lights Off"],
    }
    assert hub.calls == [result]
