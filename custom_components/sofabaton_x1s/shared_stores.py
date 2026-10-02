"""One loader for the integration's shared, lazily loaded stores.

The command-config, persistent-cache and UI-settings stores live once in
``hass.data[DOMAIN]`` and load on first use. The getters checked, awaited
the load, then set the key: two hubs setting up at once could each build
and load a store, and the one stored last won (CR-H2-13). The load now
runs under a per-key lock and the key is re-checked inside it.
"""

from __future__ import annotations

import asyncio
from typing import Any, Callable

from homeassistant.core import HomeAssistant

from .const import DOMAIN

_LOAD_LOCKS_KEY = "_store_load_locks"


async def async_shared_store(
    hass: HomeAssistant,
    key: str,
    factory: Callable[[HomeAssistant], Any],
    *,
    store_type: type | None = None,
) -> Any:
    """The store under ``hass.data[DOMAIN][key]``, built by ``factory`` and
    loaded once. ``store_type``, when given, is what counts as loaded (any
    other value there is replaced); otherwise any value does."""

    domain_data = hass.data.setdefault(DOMAIN, {})

    def _loaded() -> Any:
        store = domain_data.get(key)
        if store_type is None:
            return store
        return store if isinstance(store, store_type) else None

    store = _loaded()
    if store is not None:
        return store
    lock = domain_data.setdefault(_LOAD_LOCKS_KEY, {}).setdefault(key, asyncio.Lock())
    async with lock:
        store = _loaded()
        if store is not None:
            return store
        store = factory(hass)
        await store.async_load()
        domain_data[key] = store
        return store
