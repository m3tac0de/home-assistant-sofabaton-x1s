from __future__ import annotations

from copy import deepcopy
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import DOMAIN

CACHE_STORE_VERSION = 2
CACHE_STORE_MINOR_VERSION = 1


class _MigratingStore(Store[dict[str, Any]]):
    async def _async_migrate_func(
        self,
        old_major_version: int,
        old_minor_version: int,
        old_data: dict[str, Any],
    ) -> dict[str, Any]:
        # Phase 6 reshaped cached state; discard any pre-v2 payload.
        if old_major_version < CACHE_STORE_VERSION:
            return {"enabled": False, "hubs": {}}
        return old_data


class PersistentCacheStore:
    def __init__(self, hass: HomeAssistant) -> None:
        self._store: Store[dict[str, Any]] = _MigratingStore(
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

    async def async_get_structural_bundle(self, entry_id: str) -> dict[str, Any] | None:
        """Blob-free structural ``hub_bundle`` the live activity editor reads
        (kept separate from the Cache-tab summary payload)."""
        bundles = self._data.setdefault("structural_bundles", {})
        entry = bundles.get(entry_id)
        return deepcopy(entry) if isinstance(entry, dict) else None

    async def async_set_structural_bundle(self, entry_id: str, payload: dict[str, Any]) -> None:
        bundles = self._data.setdefault("structural_bundles", {})
        bundles[entry_id] = deepcopy(payload)
        await self._store.async_save(self._data)

    async def async_clear_hub_cache(self, entry_id: str) -> None:
        hubs = self._data.setdefault("hubs", {})
        if entry_id in hubs:
            hubs.pop(entry_id, None)
            await self._store.async_save(self._data)
        bundles = self._data.setdefault("structural_bundles", {})
        if entry_id in bundles:
            bundles.pop(entry_id, None)
            await self._store.async_save(self._data)

    async def async_clear_all_hub_cache(self) -> None:
        self._data["hubs"] = {}
        await self._store.async_save(self._data)
