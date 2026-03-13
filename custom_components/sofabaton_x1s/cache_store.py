"""Persistent cache store for Sofabaton hub data."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import CACHE_STORE_VERSION, CACHE_STORE_MINOR_VERSION, DOMAIN


class CacheStore:
    """Persists hub cache (activities, devices, buttons, commands, macros, favorites)."""

    def __init__(self, hass: HomeAssistant) -> None:
        self._store: Store[dict[str, Any]] = Store(
            hass,
            CACHE_STORE_VERSION,
            f"{DOMAIN}.cache_store",
            minor_version=CACHE_STORE_MINOR_VERSION,
        )
        self._data: dict[str, Any] = {
            "persistent_cache_enabled": False,
            "hubs": {},
        }

    async def async_load(self) -> None:
        loaded = await self._store.async_load()
        if isinstance(loaded, dict):
            if isinstance(loaded.get("hubs"), dict):
                self._data = loaded
            if "persistent_cache_enabled" not in self._data:
                self._data["persistent_cache_enabled"] = False

    def is_cache_enabled(self) -> bool:
        return bool(self._data.get("persistent_cache_enabled", False))

    async def async_set_cache_enabled(self, enabled: bool) -> None:
        self._data["persistent_cache_enabled"] = bool(enabled)
        await self._store.async_save(self._data)

    def get_hub_cache(self, entry_id: str) -> dict[str, Any] | None:
        return self._data.get("hubs", {}).get(entry_id)

    async def async_save_hub_cache(self, entry_id: str, snapshot: dict[str, Any]) -> None:
        snapshot = dict(snapshot)
        snapshot["saved_at"] = datetime.now(timezone.utc).isoformat()
        self._data.setdefault("hubs", {})[entry_id] = snapshot
        await self._store.async_save(self._data)

    async def async_clear_hub_cache(self, entry_id: str) -> None:
        self._data.setdefault("hubs", {}).pop(entry_id, None)
        await self._store.async_save(self._data)


async def async_get_cache_store(hass: HomeAssistant) -> CacheStore:
    """Return (and lazily create) the shared CacheStore instance."""
    domain_data = hass.data.setdefault(DOMAIN, {})
    store = domain_data.get("cache_store")
    if isinstance(store, CacheStore):
        return store
    store = CacheStore(hass)
    await store.async_load()
    domain_data["cache_store"] = store
    return store
