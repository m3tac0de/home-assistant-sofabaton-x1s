"""Shared runtime helpers for the integration's handlers (R6, CR-H2-13).

Hub resolution, the one-operation-per-hub guard and write decorators, the
lazy store getters and the cache persist helpers. Handlers reach these as
runtime.<name>, so a test patches them in one place.
"""

from __future__ import annotations

import contextlib
import functools
import logging
from typing import Any

from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import device_registry as dr, entity_registry as er

from .const import (
    DOMAIN,
    CONF_ROKU_LISTEN_PORT,
    DEFAULT_ROKU_LISTEN_PORT,
)
from .hub import SofabatonHub
from .command_config import (
    CommandConfigStore,
    async_get_command_config_store,
)
from .cache_store import PersistentCacheStore
from .ui_settings_store import UiSettingsStore
from . import operations

# Same logger name as the package: log lines keep their source name.
_LOGGER = logging.getLogger(__package__)


_HUB_BUSY_MESSAGE = "Another backup, restore, sync or hub write is already running for this hub"


def _hub_work(hub: SofabatonHub):
    """The hub's work scope (see SofabatonHub.async_hub_work)."""

    work = getattr(hub, "async_hub_work", None)
    return work() if callable(work) else contextlib.nullcontext()


def _hub_is_busy(hass: HomeAssistant, hub: SofabatonHub) -> bool:
    """One operation per hub: a registry operation, hub work (an immediate
    write, a write service) or a Wifi Command sync."""

    if isinstance(getattr(hass, "data", None), dict) and operations._backup_operation_registry(
        hass
    ).has_running_for_entry(hub.entry_id):
        return True
    return bool(
        getattr(hub, "hub_work_active", False) or getattr(hub, "is_sync_in_progress", False)
    )


def _raise_if_hub_operation_locked(
    hass: HomeAssistant, hub: SofabatonHub, operation: str
) -> None:
    if _hub_is_busy(hass, hub):
        raise HomeAssistantError(f"hub_busy: {operation}: {_HUB_BUSY_MESSAGE}")


async def _async_persist_after_write(hass: HomeAssistant, hub: SofabatonHub) -> None:
    """Best-effort persist after a one-shot write (CR-R1-8)."""

    try:
        await _async_persist_hub_cache(hass, hub)
    except Exception:  # noqa: BLE001 - the write itself succeeded
        _LOGGER.debug("[%s] cache persist after a write failed", hub.entry_id, exc_info=True)


def _hub_operation(fn):
    """A registry-operation runner: the whole run counts as hub work, so
    the busy guard, the CALL_ME gate and unload see it."""

    @functools.wraps(fn)
    async def wrapper(hass, operation_id, *args, hub, **kwargs):
        async with _hub_work(hub):
            return await fn(hass, operation_id, *args, hub=hub, **kwargs)

    return wrapper


def _hub_write_service(*, persist: bool = True):
    """A service that talks to the hub: refused while the hub is busy, run
    as hub work, and followed by a cache persist when it writes."""

    def decorate(fn):
        @functools.wraps(fn)
        async def wrapper(call: ServiceCall):
            hub = await _async_resolve_hub_from_call(call.hass, call)
            if hub is None:
                return await fn(call)
            _raise_if_hub_operation_locked(call.hass, hub, fn.__name__)
            async with _hub_work(hub):
                result = await fn(call)
            if persist:
                await _async_persist_after_write(call.hass, hub)
            return result

        return wrapper

    return decorate


def _hub_write_ws(*, persist: bool = True):
    """The WS counterpart of :func:`_hub_write_service`: a busy hub answers
    ``busy`` before the handler runs."""

    def decorate(fn):
        @functools.wraps(fn)
        async def wrapper(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
            hub = await _async_resolve_hub_from_data(
                hass, {"entry_id": msg.get("entry_id"), "entity_id": msg.get("entity_id")}
            )
            if hub is None:
                await fn(hass, connection, msg)
                return
            if _hub_is_busy(hass, hub):
                connection.send_error(msg["id"], "busy", _HUB_BUSY_MESSAGE)
                return
            async with _hub_work(hub):
                await fn(hass, connection, msg)
            if persist:
                await _async_persist_after_write(hass, hub)

        return wrapper

    return decorate


def _resolve_roku_listen_port(hass: HomeAssistant, entry_id: str) -> int:
    config_entries = getattr(hass, "config_entries", None)
    if config_entries is None:
        return DEFAULT_ROKU_LISTEN_PORT

    entry = config_entries.async_get_entry(entry_id)
    options = entry.options if entry is not None else {}
    return int(options.get(CONF_ROKU_LISTEN_PORT, DEFAULT_ROKU_LISTEN_PORT))


async def _async_get_command_config_store(hass: HomeAssistant) -> CommandConfigStore:
    return await async_get_command_config_store(hass)


async def _async_get_persistent_cache_store(hass: HomeAssistant) -> PersistentCacheStore:
    domain_data = hass.data.setdefault(DOMAIN, {})
    store = domain_data.get("persistent_cache_store")
    if isinstance(store, PersistentCacheStore):
        return store

    store = PersistentCacheStore(hass)
    await store.async_load()
    domain_data["persistent_cache_store"] = store
    return store


async def _async_get_ui_settings_store(hass: HomeAssistant) -> UiSettingsStore:
    domain_data = hass.data.setdefault(DOMAIN, {})
    store = domain_data.get("ui_settings_store")
    if isinstance(store, UiSettingsStore):
        return store

    store = UiSettingsStore(hass)
    await store.async_load()
    domain_data["ui_settings_store"] = store
    return store


async def _async_persist_hub_cache(hass: HomeAssistant, hub: SofabatonHub) -> bool:
    store = await _async_get_persistent_cache_store(hass)
    if not store.enabled:
        return False

    await store.async_set_hub_cache(hub.entry_id, await hub.async_export_cache_state())
    return True


async def _async_persist_all_hub_cache(hass: HomeAssistant) -> int:
    persisted = 0
    store = await _async_get_persistent_cache_store(hass)
    if not store.enabled:
        return persisted

    for hub in _get_hubs(hass.data.get(DOMAIN, {})):
        try:
            await store.async_set_hub_cache(hub.entry_id, await hub.async_export_cache_state())
            persisted += 1
        except Exception:
            _LOGGER.exception("[%s] Failed to persist cache for hub %s during shutdown", DOMAIN, hub.entry_id)

    return persisted


async def _async_resolve_hub_from_call(hass: HomeAssistant, call: ServiceCall):
    return await _async_resolve_hub_from_data(hass, call.data)


async def _async_resolve_hub_from_data(hass: HomeAssistant, data: dict[str, Any]):
    """Try device → hub text → entity → fallback to single hub."""
    domain_data = hass.data.get(DOMAIN, {})
    hubs = _get_hubs(domain_data)

    device_id = data.get("device")
    if device_id:
        dev_reg = dr.async_get(hass)
        device = dev_reg.async_get(device_id) if dev_reg else None
        if device:
            for ident_domain, ident in device.identifiers:
                if ident_domain == DOMAIN:
                    for hub in hubs:
                        if getattr(hub, "mac", None) == ident:
                            return hub

    hub_key = data.get("hub")
    if hub_key:
        if hub_key in domain_data and domain_data[hub_key] in hubs:
            return domain_data[hub_key]
        for hub in hubs:
            if getattr(hub, "mac", None) == hub_key:
                return hub

    entry_id = data.get("entry_id")
    if entry_id:
        for hub in hubs:
            if getattr(hub, "entry_id", None) == entry_id:
                return hub

    entity_id = data.get("entity_id")
    if entity_id:
        ent_reg = er.async_get(hass)
        ent = ent_reg.async_get(entity_id) if ent_reg else None
        if ent and ent.device_id:
            dev_reg = dr.async_get(hass)
            device = dev_reg.async_get(ent.device_id) if dev_reg else None
            if device:
                for ident_domain, ident in device.identifiers:
                    if ident_domain == DOMAIN:
                        for hub in hubs:
                            if getattr(hub, "mac", None) == ident:
                                return hub

    # Only a call that named no hub at all may fall back to the only one:
    # a selector that matched nothing (a disabled or reloading hub) must
    # never land on another hub (CR-H2-1).
    named = any(data.get(key) for key in ("device", "hub", "entry_id", "entity_id"))
    if not named and len(hubs) == 1:
        return hubs[0]

    return None


def _ws_hub_selector(msg: dict[str, Any]) -> dict[str, Any]:
    """The hub a WS message names: its config entry id (what the cards send)
    or, for older clients, the hub's remote entity (CR-X2-2)."""

    return {"entry_id": msg.get("entry_id"), "entity_id": msg.get("entity_id")}


def _get_hubs(domain_data: dict[str, Any]) -> list[SofabatonHub]:
    return [
        hub
        for hub in domain_data.values()
        if isinstance(hub, SofabatonHub)
    ]
