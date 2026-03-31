from __future__ import annotations

from copy import deepcopy
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import DOMAIN

CACHE_STORE_VERSION = 1
CACHE_STORE_MINOR_VERSION = 1


class PersistentCacheStore:
    def __init__(self, hass: HomeAssistant) -> None:
        self._store: Store[dict[str, Any]] = Store(
            hass,
            CACHE_STORE_VERSION,
            f"{DOMAIN}.persistent_cache",
            minor_version=CACHE_STORE_MINOR_VERSION,
        )
        self._data: dict[str, Any] = {
            "enabled": False,
            "hubs": {},
        }

    async def async_load(self) -> None:
        loaded = await self._store.async_load()
        if isinstance(loaded, dict):
            enabled = bool(loaded.get("enabled", False))
            hubs = loaded.get("hubs", {})
            self._data = {
                "enabled": enabled,
                "hubs": hubs if isinstance(hubs, dict) else {},
            }

    @property
    def enabled(self) -> bool:
        return bool(self._data.get("enabled", False))

    async def async_set_enabled(self, enabled: bool) -> None:
        self._data["enabled"] = bool(enabled)
        await self._store.async_save(self._data)

    async def async_get_hub_cache(self, entry_id: str) -> dict[str, Any]:
        hubs = self._data.setdefault("hubs", {})
        hub_cache = hubs.get(entry_id)
        if isinstance(hub_cache, dict):
            return deepcopy(hub_cache)
        return {}

    async def async_set_hub_cache(self, entry_id: str, payload: dict[str, Any]) -> None:
        hubs = self._data.setdefault("hubs", {})
        hubs[entry_id] = deepcopy(payload)
        await self._store.async_save(self._data)

    async def async_clear_hub_cache(self, entry_id: str) -> None:
        hubs = self._data.setdefault("hubs", {})
        if entry_id in hubs:
            hubs.pop(entry_id, None)
            await self._store.async_save(self._data)

    async def async_clear_all_hub_cache(self) -> None:
        self._data["hubs"] = {}
        await self._store.async_save(self._data)
