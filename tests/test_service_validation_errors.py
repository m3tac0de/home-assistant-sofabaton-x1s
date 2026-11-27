"""Registered actions report input refusals as validation errors (#330).

The handlers check their input with ``ValueError``. Home Assistant treats
anything that is not a ``HomeAssistantError`` as a bug (a bare HTTP 500 over
REST, a traceback in the log), so registration wraps every handler to raise
a ``ValueError`` as a ``ServiceValidationError`` (HTTP 400 with its message).
"""

from __future__ import annotations

import asyncio
import importlib
from types import SimpleNamespace

import pytest

integration = importlib.import_module("custom_components.sofabaton_x1s.__init__")
services_module = importlib.import_module("custom_components.sofabaton_x1s.services")


class _FakeServices:
    def __init__(self) -> None:
        self.handlers: dict[str, object] = {}

    def has_service(self, domain, name) -> bool:
        return name in self.handlers

    def async_register(self, domain, name, handler, **_kwargs) -> None:
        self.handlers[name] = handler


def _registered() -> dict[str, object]:
    services = _FakeServices()
    services_module.async_register_services(SimpleNamespace(services=services))
    return services.handlers


def test_every_action_is_registered_through_the_wrapper() -> None:
    handlers = _registered()

    assert set(handlers) == {name for name, _handler, _responds in services_module.SERVICES}
    for name, raw_handler, _responds in services_module.SERVICES:
        assert handlers[name] is not raw_handler
        assert handlers[name].__wrapped__ is raw_handler


def test_a_handler_value_error_reaches_the_caller_as_a_validation_error() -> None:
    # No hub matches the call's device: the handler raises a ValueError.
    handler = _registered()["set_mqtt_command"]
    call = SimpleNamespace(data={"device_id": 8, "name": "Input"}, hass=SimpleNamespace(data={}))

    with pytest.raises(services_module.ServiceValidationError, match="Could not resolve Sofabaton hub") as info:
        asyncio.run(handler(call))
    assert isinstance(info.value.__cause__, ValueError)


def test_the_wrapper_passes_responses_and_hub_errors_through() -> None:
    async def _answers(_call):
        return {"ok": True}

    async def _hub_fails(_call):
        raise services_module.HomeAssistantError("hub did not answer")

    call = SimpleNamespace(data={})
    assert asyncio.run(services_module._validation_errors(_answers)(call)) == {"ok": True}
    with pytest.raises(services_module.HomeAssistantError, match="hub did not answer") as info:
        asyncio.run(services_module._validation_errors(_hub_fails)(call))
    assert not isinstance(info.value, services_module.ServiceValidationError)
