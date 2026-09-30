"""Shared fakes for the hub test modules (split from test_hub_commands.py, R6)."""

import asyncio
from types import SimpleNamespace

import custom_components.sofabaton_x1s.hub as hub_module


class FakeHass:
    def __init__(self, loop: asyncio.AbstractEventLoop):
        self.loop = loop
        self.data = {}
        self._entries = {}
        self.config_entries = SimpleNamespace(
            async_get_entry=self._async_get_entry,
            async_update_entry=self._async_update_entry,
        )

    async def async_add_executor_job(self, func, *args, **kwargs):  # pragma: no cover - passthrough
        return func(*args, **kwargs)

    def async_create_task(self, coro):  # pragma: no cover - passthrough
        return self.loop.create_task(coro)

    def _async_get_entry(self, entry_id):
        return self._entries.get(entry_id)

    def _async_update_entry(self, entry, *, data=None, options=None, title=None):
        if data is not None:
            entry.data = data
        if options is not None:
            entry.options = options
        if title is not None:
            entry.title = title


class FakeDeviceRegistry:
    def __init__(self, device=None):
        self.device = device
        self.updated = []

    def async_get_device(self, *, identifiers=None, connections=None):
        expected = {(hub_module.DOMAIN, "aa:bb:cc:dd:ee:ff")}
        if identifiers == expected:
            return self.device
        return None

    def async_update_device(self, device_id, **kwargs):
        self.updated.append((device_id, kwargs))
