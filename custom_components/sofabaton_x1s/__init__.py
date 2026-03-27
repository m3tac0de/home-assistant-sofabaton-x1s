from __future__ import annotations

import json
import logging
from pathlib import Path
import re
from typing import Any, Mapping
from urllib.parse import urlparse

import voluptuous as vol

from homeassistant.components import frontend
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, ServiceCall, SupportsResponse
from homeassistant.helpers import config_validation as cv
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import device_registry as dr, entity_registry as er

from .const import (
    DOMAIN,
    PLATFORMS,
    DEFAULT_PROXY_UDP_PORT,
    DEFAULT_HUB_LISTEN_BASE,
    CONF_MAC,
    CONF_PROXY_ENABLED,
    CONF_HEX_LOGGING_ENABLED,
    CONF_ROKU_SERVER_ENABLED,
    CONF_MDNS_VERSION,
    CONF_ENABLE_X2_DISCOVERY,
    CONF_PERSISTENT_CACHE_ENABLED,
    CONF_ROKU_LISTEN_PORT,
    DEFAULT_ROKU_LISTEN_PORT,
    format_hub_entry_title,
    DEFAULT_HUB_VERSION,
    HVER_BY_HUB_VERSION,
    HUB_VERSION_BY_HVER,
)
from .diagnostics import (
    async_disable_hex_logging_capture,
    async_setup_diagnostics,
    async_teardown_diagnostics,
)
from .hub import SofabatonHub
from .command_config import CommandConfigStore, count_configured_command_slots
from .cache_store import PersistentCacheStore
from .roku_listener import async_get_roku_listener

_LOGGER = logging.getLogger(__name__)
_ALPHANUM_SPACE_RE = re.compile(r"^[A-Za-z0-9 ]+$")


def _inspect_frontend_dir(frontend_dir: Path) -> tuple[str, bool, list[str]]:
    """Resolve and inspect the packaged frontend directory."""

    abs_path = str(frontend_dir.resolve())
    if not frontend_dir.is_dir():
        return abs_path, False, []

    return abs_path, True, [entry.name for entry in frontend_dir.iterdir()]


def _resolve_roku_listen_port(hass: HomeAssistant, entry_id: str) -> int:
    config_entries = getattr(hass, "config_entries", None)
    if config_entries is None:
        return DEFAULT_ROKU_LISTEN_PORT

    entry = config_entries.async_get_entry(entry_id)
    options = entry.options if entry is not None else {}
    return int(options.get(CONF_ROKU_LISTEN_PORT, DEFAULT_ROKU_LISTEN_PORT))


async def _async_get_command_config_store(hass: HomeAssistant) -> CommandConfigStore:
    domain_data = hass.data.setdefault(DOMAIN, {})
    store = domain_data.get("command_config_store")
    if isinstance(store, CommandConfigStore):
        return store

    store = CommandConfigStore(hass)
    await store.async_load()
    domain_data["command_config_store"] = store
    return store


async def _async_get_persistent_cache_store(hass: HomeAssistant) -> PersistentCacheStore:
    domain_data = hass.data.setdefault(DOMAIN, {})
    store = domain_data.get("persistent_cache_store")
    if isinstance(store, PersistentCacheStore):
        return store

    store = PersistentCacheStore(hass)
    await store.async_load()
    domain_data["persistent_cache_store"] = store
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


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/command_config/get",
        vol.Required("entity_id"): cv.entity_id,
    }
)
@websocket_api.async_response
async def _ws_get_command_config(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    hub = await _async_resolve_hub_from_data(
        hass,
        {
            "entity_id": msg.get("entity_id"),
            "entry_id": msg.get("entry_id"),
        },
    )
    if hub is None:
        connection.send_error(msg["id"], "not_found", "Could not resolve Sofabaton hub")
        return

    store = await _async_get_command_config_store(hass)
    roku_listen_port = _resolve_roku_listen_port(hass, hub.entry_id)
    payload = await store.async_get_hub_config(hub.entry_id, roku_listen_port=roku_listen_port)
    connection.send_result(msg["id"], payload)


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/command_config/set",
        vol.Required("entity_id"): cv.entity_id,
        vol.Required("commands"): list,
    }
)
@websocket_api.async_response
async def _ws_set_command_config(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    hub = await _async_resolve_hub_from_data(hass, {"entity_id": msg["entity_id"]})
    if hub is None:
        connection.send_error(msg["id"], "not_found", "Could not resolve Sofabaton hub")
        return

    store = await _async_get_command_config_store(hass)
    roku_listen_port = _resolve_roku_listen_port(hass, hub.entry_id)
    payload = await store.async_set_hub_commands(
        hub.entry_id,
        msg["commands"],
        roku_listen_port=roku_listen_port,
    )
    connection.send_result(msg["id"], payload)


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/command_sync/progress",
        vol.Required("entity_id"): cv.entity_id,
    }
)
@websocket_api.async_response
async def _ws_get_command_sync_progress(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    hub = await _async_resolve_hub_from_data(hass, {"entity_id": msg["entity_id"]})
    if hub is None:
        connection.send_error(msg["id"], "not_found", "Could not resolve Sofabaton hub")
        return

    store = await _async_get_command_config_store(hass)
    roku_listen_port = _resolve_roku_listen_port(hass, hub.entry_id)
    payload = await store.async_get_hub_config(hub.entry_id, roku_listen_port=roku_listen_port)
    commands_hash = str(payload.get("commands_hash") or "")
    managed_hashes = hub.get_managed_command_hashes()
    progress = hub.get_command_sync_progress()
    progress_hash = str(progress.get("commands_hash") or "")
    configured_slots = count_configured_command_slots(payload.get("commands"))
    has_managed_device = bool(managed_hashes)
    sync_needed = (
        (configured_slots > 0 and bool(commands_hash) and commands_hash not in managed_hashes)
        or (configured_slots == 0 and has_managed_device)
    )
    if (
        commands_hash
        and str(progress.get("status") or "") == "success"
        and progress_hash == commands_hash
    ):
        sync_needed = False

    connection.send_result(
        msg["id"],
        {
            **progress,
            "commands_hash": commands_hash,
            "managed_command_hashes": managed_hashes,
            "configured_slot_count": configured_slots,
            "has_managed_device": has_managed_device,
            "sync_needed": sync_needed,
        },
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/hub/set_version",
        vol.Required("entity_id"): cv.entity_id,
        vol.Required("version"): str,
    }
)
@websocket_api.async_response
async def _ws_set_hub_version(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    hub = await _async_resolve_hub_from_data(hass, {"entity_id": msg["entity_id"]})
    if hub is None:
        connection.send_error(msg["id"], "not_found", "Could not resolve Sofabaton hub")
        return
    try:
        await hub.async_set_hub_version(msg["version"])
    except HomeAssistantError as err:
        connection.send_error(msg["id"], "invalid_format", str(err))
        return
    connection.send_result(msg["id"], {"ok": True})


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/persistent_cache/get",
    }
)
@websocket_api.async_response
async def _ws_get_persistent_cache(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    store = await _async_get_persistent_cache_store(hass)
    hubs = _get_hubs(hass.data.get(DOMAIN, {}))
    payload = {
        "enabled": store.enabled,
        "hubs": [
            {
                "entry_id": hub.entry_id,
                "name": hub.name,
            }
            for hub in hubs
        ],
    }
    connection.send_result(msg["id"], payload)


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/persistent_cache/set",
        vol.Required("enabled"): cv.boolean,
    }
)
@websocket_api.async_response
async def _ws_set_persistent_cache(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    store = await _async_get_persistent_cache_store(hass)
    enabled = bool(msg["enabled"])
    await store.async_set_enabled(enabled)

    if not enabled:
        await store.async_clear_all_hub_cache()

    connection.send_result(msg["id"], {"enabled": enabled})


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/persistent_cache/refresh",
        vol.Optional("entity_id"): cv.entity_id,
        vol.Optional("entry_id"): str,
        vol.Required("kind"): vol.In(["activity", "device"]),
        vol.Required("target_id"): int,
    }
)
@websocket_api.async_response
async def _ws_refresh_persistent_cache_entry(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    hub = await _async_resolve_hub_from_data(
        hass,
        {
            "entity_id": msg.get("entity_id"),
            "entry_id": msg.get("entry_id"),
        },
    )
    if hub is None:
        connection.send_error(msg["id"], "not_found", "Could not resolve Sofabaton hub")
        return

    store = await _async_get_persistent_cache_store(hass)
    if not store.enabled:
        connection.send_error(msg["id"], "disabled", "Persistent cache is disabled")
        return

    target_id = int(msg["target_id"])
    if target_id < 1 or target_id > 255:
        connection.send_error(msg["id"], "invalid_id", "target_id must be between 1 and 255")
        return

    await hub.async_clear_cache_for(kind=msg["kind"], ent_id=target_id)
    await hub.async_fetch_device_commands(target_id, wait_timeout=30.0)
    payload = await hub.async_export_cache_state()
    await store.async_set_hub_cache(hub.entry_id, payload)
    connection.send_result(msg["id"], {"ok": True})


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/persistent_cache/contents",
    }
)
@websocket_api.async_response
async def _ws_get_persistent_cache_contents(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    store = await _async_get_persistent_cache_store(hass)
    if not store.enabled:
        connection.send_result(msg["id"], {"enabled": False, "hubs": []})
        return

    hub_payloads = []
    for hub in _get_hubs(hass.data.get(DOMAIN, {})):
        hub_payloads.append(await hub.async_get_cache_contents())

    connection.send_result(msg["id"], {"enabled": True, "hubs": hub_payloads})


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/catalog/refresh",
        vol.Optional("entry_id"): str,
        vol.Required("kind"): vol.In(["activities", "devices"]),
    }
)
@websocket_api.async_response
async def _ws_refresh_catalog(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    hub = await _async_resolve_hub_from_data(
        hass,
        {"entry_id": msg.get("entry_id")},
    )
    if hub is None:
        connection.send_error(msg["id"], "not_found", "Could not resolve Sofabaton hub")
        return

    await hub.async_request_catalog(msg["kind"])
    store = await _async_get_persistent_cache_store(hass)
    if store.enabled:
        payload = await hub.async_export_cache_state()
        await store.async_set_hub_cache(hub.entry_id, payload)
    connection.send_result(msg["id"], {"ok": True})


def _register_websocket_commands(hass: HomeAssistant) -> None:
    domain_data = hass.data.setdefault(DOMAIN, {})
    if domain_data.get("ws_registered"):
        return

    websocket_api.async_register_command(hass, _ws_get_command_config)
    websocket_api.async_register_command(hass, _ws_set_command_config)
    websocket_api.async_register_command(hass, _ws_get_command_sync_progress)
    websocket_api.async_register_command(hass, _ws_set_hub_version)
    websocket_api.async_register_command(hass, _ws_get_persistent_cache)
    websocket_api.async_register_command(hass, _ws_set_persistent_cache)
    websocket_api.async_register_command(hass, _ws_refresh_persistent_cache_entry)
    websocket_api.async_register_command(hass, _ws_get_persistent_cache_contents)
    websocket_api.async_register_command(hass, _ws_refresh_catalog)
    domain_data["ws_registered"] = True


CONFIG_SCHEMA = vol.Schema(
    {
        DOMAIN: vol.Schema(
            {vol.Optional(CONF_ENABLE_X2_DISCOVERY, default=False): cv.boolean},
        ),
    },
    extra=vol.ALLOW_EXTRA,
)


async def async_setup(hass: HomeAssistant, config: dict[str, Any]) -> bool:
    domain_config = config.get(DOMAIN, {})
    enable_x2_discovery = bool(domain_config.get(CONF_ENABLE_X2_DISCOVERY, False))

    hass.data.setdefault(DOMAIN, {})
    hass.data[DOMAIN].setdefault("config", {})
    hass.data[DOMAIN]["config"][CONF_ENABLE_X2_DISCOVERY] = enable_x2_discovery
    hass.data[DOMAIN]["config"].setdefault(CONF_PERSISTENT_CACHE_ENABLED, False)

    # Ensure DOMAIN data is initialized
    hass.data.setdefault(DOMAIN, {})

    _register_websocket_commands(hass)

    if not hass.data[DOMAIN].get("stop_listener_registered"):
        async def _async_handle_hass_stop(_event: Any) -> None:
            persisted = await _async_persist_all_hub_cache(hass)
            if persisted:
                _LOGGER.info("[%s] Persisted cache for %s hub(s) on Home Assistant stop", DOMAIN, persisted)

        hass.bus.async_listen_once("homeassistant_stop", _async_handle_hass_stop)
        hass.data[DOMAIN]["stop_listener_registered"] = True

    if not hass.data[DOMAIN].get("frontend_registered"):
        community_card_dir = Path(
            hass.config.path("www", "community", "sofabaton-virtual-remote")
        )
        community_card_exists = await hass.async_add_executor_job(
            lambda: community_card_dir.exists() and community_card_dir.is_dir()
        )
        inject_remote_card = not community_card_exists
        if community_card_exists:
            _LOGGER.info(
                "[%s] Community remote card found at %s; only injecting power tools card",
                DOMAIN,
                community_card_dir,
            )

        frontend_dir = Path(__file__).parent / "www"
        abs_path, frontend_dir_exists, contents = await hass.async_add_executor_job(
            _inspect_frontend_dir, frontend_dir
        )

        _LOGGER.info("[%s] Resolved static path: %s", DOMAIN, abs_path)

        if frontend_dir_exists:
            _LOGGER.info("[%s] Directory exists. Found %s files: %s",
                         DOMAIN, len(contents), contents)

            await hass.http.async_register_static_paths(
                [
                    StaticPathConfig(
                        f"/{DOMAIN}/www",
                        abs_path,
                        False,
                    )
                ]
            )

            # 4. Inject JS URLs
            version_suffix = await _async_get_integration_version(hass)
            js_version = f"?v={version_suffix}" if version_suffix else ""
            js_files = [f"card-loader.js{js_version}"]
            for js_file in js_files:
                remote_flag = "1" if inject_remote_card else "0"
                separator = "&" if "?" in js_file else "?"
                url = f"/{DOMAIN}/www/{js_file}{separator}inject_remote={remote_flag}"
                _LOGGER.info("[%s] Adding extra JS URL: %s", DOMAIN, url)
                frontend.add_extra_js_url(hass, url)

            hass.data[DOMAIN]["frontend_registered"] = True
        else:
            _LOGGER.error("[%s] FRONTEND DIR MISSING: Expected at %s", DOMAIN, abs_path)

    return True


def _reconcile_version_metadata(
    data: Mapping[str, Any],
    opts: Mapping[str, Any],
) -> tuple[str, dict[str, Any], dict[str, Any], bool]:
    """Normalize hub version metadata and determine whether entry updates are needed."""

    current_data = dict(data)
    current_opts = dict(opts)
    mdns_txt_raw = current_data.get("mdns_txt", {})
    mdns_txt = dict(mdns_txt_raw) if isinstance(mdns_txt_raw, dict) else {}

    hvertxt = mdns_txt.get("HVER")
    detected_version = HUB_VERSION_BY_HVER.get(str(hvertxt).strip()) if hvertxt is not None else None

    stored_version = current_data.get(CONF_MDNS_VERSION) or current_opts.get(CONF_MDNS_VERSION)
    if isinstance(stored_version, str):
        stored_version = stored_version.strip() or None

    resolved_version = detected_version or stored_version or DEFAULT_HUB_VERSION
    confidence_version = detected_version or stored_version

    changed = False
    if (
        mdns_txt.get("HVER") is None
        and confidence_version in HVER_BY_HUB_VERSION
    ):
        mdns_txt["HVER"] = HVER_BY_HUB_VERSION[confidence_version]
        changed = True

    if current_data.get("mdns_txt", {}) != mdns_txt:
        current_data["mdns_txt"] = mdns_txt
        changed = True

    if current_data.get(CONF_MDNS_VERSION) != resolved_version:
        current_data[CONF_MDNS_VERSION] = resolved_version
        changed = True

    if current_opts.get(CONF_MDNS_VERSION) != resolved_version:
        current_opts[CONF_MDNS_VERSION] = resolved_version
        changed = True

    return resolved_version, current_data, current_opts, changed


async def _async_get_integration_version(hass: HomeAssistant) -> str:
    manifest_path = Path(__file__).parent / "manifest.json"
    try:
        manifest_contents = await hass.async_add_executor_job(
            manifest_path.read_text, "utf-8"
        )
        manifest = json.loads(manifest_contents)
    except (FileNotFoundError, json.JSONDecodeError) as err:
        _LOGGER.warning("[%s] Failed to read manifest version: %s", DOMAIN, err)
        return ""

    version = manifest.get("version")
    return str(version) if version else ""


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    async_setup_diagnostics(hass)

    data = entry.data
    opts = entry.options

    version, reconciled_data, reconciled_opts, metadata_changed = _reconcile_version_metadata(data, opts)
    if metadata_changed:
        hass.config_entries.async_update_entry(
            entry,
            data=reconciled_data,
            options=reconciled_opts,
        )
        data = reconciled_data
        opts = reconciled_opts

    proxy_udp_port = opts.get("proxy_udp_port", DEFAULT_PROXY_UDP_PORT)
    hub_listen_base = opts.get("hub_listen_base", DEFAULT_HUB_LISTEN_BASE)
    proxy_enabled = opts.get(CONF_PROXY_ENABLED, True)
    hex_logging_enabled = opts.get(CONF_HEX_LOGGING_ENABLED, False)
    roku_server_enabled = opts.get(CONF_ROKU_SERVER_ENABLED, False)
    roku_listen_port = opts.get(CONF_ROKU_LISTEN_PORT, DEFAULT_ROKU_LISTEN_PORT)

    expected_title = format_hub_entry_title(version, data.get("host"), data.get(CONF_MAC))
    if entry.title != expected_title:
        hass.config_entries.async_update_entry(entry, title=expected_title)

    hub = SofabatonHub(
        hass=hass,
        entry_id=entry.entry_id,
        name=data["name"],
        host=data["host"],
        port=data["port"],
        mdns_txt=data.get("mdns_txt", {}),
        proxy_udp_port=proxy_udp_port,
        hub_listen_base=hub_listen_base,
        proxy_enabled=proxy_enabled,
        hex_logging_enabled=hex_logging_enabled,
        roku_server_enabled=roku_server_enabled,
        version=version,
    )
    await hub.async_start()

    cache_store = await _async_get_persistent_cache_store(hass)
    hass.data[DOMAIN]["config"][CONF_PERSISTENT_CACHE_ENABLED] = cache_store.enabled
    if cache_store.enabled:
        cache_payload = await cache_store.async_get_hub_cache(entry.entry_id)
        if cache_payload:
            await hub.async_restore_persistent_cache(cache_payload)

    if not hass.services.has_service(DOMAIN, "fetch_device_commands"):
        hass.services.async_register(DOMAIN, "fetch_device_commands", _async_handle_fetch_device_commands)
    if not hass.services.has_service(DOMAIN, "create_wifi_device"):
        hass.services.async_register(DOMAIN, "create_wifi_device", _async_handle_create_wifi_device)
    if not hass.services.has_service(DOMAIN, "device_to_activity"):
        hass.services.async_register(DOMAIN, "device_to_activity", _async_handle_device_to_activity)
    if not hass.services.has_service(DOMAIN, "delete_device"):
        hass.services.async_register(DOMAIN, "delete_device", _async_handle_delete_device)
    if not hass.services.has_service(DOMAIN, "command_to_favorite"):
        hass.services.async_register(DOMAIN, "command_to_favorite", _async_handle_command_to_favorite)
    if not hass.services.has_service(DOMAIN, "get_favorites"):
        hass.services.async_register(DOMAIN, "get_favorites", _async_handle_get_favorites, supports_response=SupportsResponse.OPTIONAL)
    if not hass.services.has_service(DOMAIN, "reorder_favorites"):
        hass.services.async_register(DOMAIN, "reorder_favorites", _async_handle_reorder_favorites)
    if not hass.services.has_service(DOMAIN, "delete_favorite"):
        hass.services.async_register(DOMAIN, "delete_favorite", _async_handle_delete_favorite)
    if not hass.services.has_service(DOMAIN, "command_to_button"):
        hass.services.async_register(DOMAIN, "command_to_button", _async_handle_command_to_button)
    if not hass.services.has_service(DOMAIN, "sync_command_config"):
        hass.services.async_register(DOMAIN, "sync_command_config", _async_handle_sync_command_config)
    #if not hass.services.has_service(DOMAIN, "create_ip_button"):
    #    hass.services.async_register(DOMAIN, "create_ip_button", _async_handle_create_ip_button)

    hass.data[DOMAIN][entry.entry_id] = hub

    roku_listener = await async_get_roku_listener(hass)
    await roku_listener.async_set_listen_port(int(roku_listen_port))
    await roku_listener.async_register_hub(hub, enabled=roku_server_enabled)

    # ← important: tell HA to call us when options change
    entry.async_on_unload(
        entry.add_update_listener(async_update_options)
    )

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def async_update_options(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Called when user changes options in the UI."""
    hub: SofabatonHub = hass.data[DOMAIN][entry.entry_id]

    new_host = entry.data.get("host", hub.host)
    new_port = entry.data.get("port", hub.port)
    proxy_udp_port = entry.options.get("proxy_udp_port", DEFAULT_PROXY_UDP_PORT)
    hub_listen_base = entry.options.get("hub_listen_base", DEFAULT_HUB_LISTEN_BASE)
    await hub.async_apply_new_settings(
        host=new_host,
        port=new_port,
        proxy_udp_port=proxy_udp_port,
        hub_listen_base=hub_listen_base,
    )

    roku_listen_port = entry.options.get(CONF_ROKU_LISTEN_PORT, DEFAULT_ROKU_LISTEN_PORT)
    roku_listener = await async_get_roku_listener(hass)
    await roku_listener.async_set_listen_port(int(roku_listen_port))

async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        hub = hass.data[DOMAIN].pop(entry.entry_id, None)
        if not _get_hubs(hass.data[DOMAIN]):
            hass.services.async_remove(DOMAIN, "fetch_device_commands")
            hass.services.async_remove(DOMAIN, "create_wifi_device")
            hass.services.async_remove(DOMAIN, "device_to_activity")
            hass.services.async_remove(DOMAIN, "delete_device")
            hass.services.async_remove(DOMAIN, "command_to_favorite")
            hass.services.async_remove(DOMAIN, "get_favorites")
            hass.services.async_remove(DOMAIN, "reorder_favorites")
            hass.services.async_remove(DOMAIN, "delete_favorite")
            hass.services.async_remove(DOMAIN, "command_to_button")
            hass.services.async_remove(DOMAIN, "sync_command_config")
            #hass.services.async_remove(DOMAIN, "create_ip_button")
            async_teardown_diagnostics(hass)
        async_disable_hex_logging_capture(hass, entry.entry_id)
        if hub is not None:
            await _async_persist_hub_cache(hass, hub)
            roku_listener = await async_get_roku_listener(hass)
            await roku_listener.async_remove_hub(entry.entry_id)
            await hub.async_stop()
    return unload_ok



def _raise_if_sync_in_progress(hub: SofabatonHub, operation: str) -> None:
    if bool(getattr(hub, "is_sync_in_progress", False)):
        raise HomeAssistantError(f"sync_in_progress: {operation}")

async def _async_handle_fetch_device_commands(call: ServiceCall):
    hass = call.hass
    hub = await _async_resolve_hub_from_call(hass, call)
    if hub is None:
        raise ValueError("Could not resolve Sofabaton hub from service call")

    ent_id = call.data["ent_id"]
    await hub.async_fetch_device_commands(ent_id)


async def _async_handle_create_wifi_device(call: ServiceCall):
    hass = call.hass
    hub = await _async_resolve_hub_from_call(hass, call)
    if hub is None:
        raise ValueError("Could not resolve Sofabaton hub from service call")

    _raise_if_sync_in_progress(hub, "_async_handle_create_wifi_device")

    device_name = str(call.data.get("device_name", "Home Assistant")).strip() or "Home Assistant"
    if not _ALPHANUM_SPACE_RE.fullmatch(device_name):
        raise ValueError("device_name must contain only letters, numbers, and spaces")
    raw_commands = call.data.get("commands")
    if not isinstance(raw_commands, list):
        raise ValueError("commands must be a list of strings")
    if not raw_commands:
        raise ValueError("commands requires between 1 and 10 entries")
    if len(raw_commands) > 10:
        raise ValueError("commands requires between 1 and 10 entries")

    commands: list[str] = []
    for command in raw_commands:
        command_name = str(command).strip()
        if not command_name:
            raise ValueError("commands entries must not be empty")
        if not _ALPHANUM_SPACE_RE.fullmatch(command_name):
            raise ValueError("commands entries must contain only letters, numbers, and spaces")
        commands.append(command_name)

    request_port = _resolve_roku_listen_port(hass, hub.entry_id)

    return await hub.async_create_wifi_device(
        device_name=device_name,
        commands=commands,
        request_port=request_port,
    )


async def _async_handle_device_to_activity(call: ServiceCall):
    hass = call.hass
    hub = await _async_resolve_hub_from_call(hass, call)
    if hub is None:
        raise ValueError("Could not resolve Sofabaton hub from service call")

    _raise_if_sync_in_progress(hub, "_async_handle_device_to_activity")

    activity_id = int(call.data["activity_id"])
    device_id = int(call.data["device_id"])

    if activity_id < 1 or activity_id > 255:
        raise ValueError("activity_id must be between 1 and 255")
    if device_id < 1 or device_id > 255:
        raise ValueError("device_id must be between 1 and 255")

    return await hub.async_add_device_to_activity(
        activity_id=activity_id,
        device_id=device_id,
    )


async def _async_handle_delete_device(call: ServiceCall):
    hass = call.hass
    hub = await _async_resolve_hub_from_call(hass, call)
    if hub is None:
        raise ValueError("Could not resolve Sofabaton hub from service call")

    _raise_if_sync_in_progress(hub, "_async_handle_delete_device")

    device_id = int(call.data["device_id"])
    if device_id < 1 or device_id > 255:
        raise ValueError("device_id must be between 1 and 255")

    return await hub.async_delete_device(device_id=device_id)


async def _async_handle_command_to_favorite(call: ServiceCall):
    hass = call.hass
    hub = await _async_resolve_hub_from_call(hass, call)
    if hub is None:
        raise ValueError("Could not resolve Sofabaton hub from service call")

    _raise_if_sync_in_progress(hub, "_async_handle_command_to_favorite")

    activity_id = int(call.data["activity_id"])
    device_id = int(call.data["device_id"])
    command_id = int(call.data["command_id"])
    raw_slot_id = call.data.get("slot_id")
    slot_id = int(raw_slot_id) if raw_slot_id is not None else None

    if activity_id < 1 or activity_id > 255:
        raise ValueError("activity_id must be between 1 and 255")
    if device_id < 1 or device_id > 255:
        raise ValueError("device_id must be between 1 and 255")
    if command_id < 1 or command_id > 255:
        raise ValueError("command_id must be between 1 and 255")
    if slot_id is not None and (slot_id < 0 or slot_id > 255):
        raise ValueError("slot_id must be between 0 and 255")

    kwargs: dict[str, Any] = {}
    if slot_id is not None:
        kwargs["slot_id"] = slot_id

    return await hub.async_command_to_favorite(
        activity_id=activity_id,
        device_id=device_id,
        command_id=command_id,
        **kwargs,
    )


async def _async_handle_get_favorites(call: ServiceCall):
    hass = call.hass
    hub = await _async_resolve_hub_from_call(hass, call)
    if hub is None:
        raise ValueError("Could not resolve Sofabaton hub from service call")

    activity_id = int(call.data["activity_id"])
    if activity_id < 1 or activity_id > 255:
        raise ValueError("activity_id must be between 1 and 255")

    order = await hub.async_request_favorites_order(activity_id)
    if order is None:
        raise ValueError(f"Hub did not respond to favorites order request for activity {activity_id}")

    return {"favorites": hub.describe_favorites_order(activity_id, order)}


async def _async_handle_reorder_favorites(call: ServiceCall):
    hass = call.hass
    hub = await _async_resolve_hub_from_call(hass, call)
    if hub is None:
        raise ValueError("Could not resolve Sofabaton hub from service call")

    _raise_if_sync_in_progress(hub, "_async_handle_reorder_favorites")

    activity_id = int(call.data["activity_id"])
    raw_order = call.data.get("ordered_fav_ids", call.data.get("order"))
    if raw_order is None:
        raise ValueError("ordered_fav_ids is required")
    ordered_fav_ids = [int(x) for x in raw_order]

    if activity_id < 1 or activity_id > 255:
        raise ValueError("activity_id must be between 1 and 255")
    if not ordered_fav_ids:
        raise ValueError("ordered_fav_ids must be a non-empty list of fav_ids")

    return await hub.async_reorder_favorites(
        activity_id=activity_id,
        ordered_fav_ids=ordered_fav_ids,
    )


async def _async_handle_delete_favorite(call: ServiceCall):
    hass = call.hass
    hub = await _async_resolve_hub_from_call(hass, call)
    if hub is None:
        raise ValueError("Could not resolve Sofabaton hub from service call")

    _raise_if_sync_in_progress(hub, "_async_handle_delete_favorite")

    activity_id = int(call.data["activity_id"])
    raw_fav_id = call.data.get("fav_id", call.data.get("button_id"))
    if raw_fav_id is None:
        raise ValueError("fav_id is required")
    fav_id = int(raw_fav_id)

    if activity_id < 1 or activity_id > 255:
        raise ValueError("activity_id must be between 1 and 255")
    if fav_id < 1 or fav_id > 255:
        raise ValueError("fav_id must be between 1 and 255")

    return await hub.async_delete_favorite(
        activity_id=activity_id,
        fav_id=fav_id,
    )


async def _async_handle_command_to_button(call: ServiceCall):
    hass = call.hass
    hub = await _async_resolve_hub_from_call(hass, call)
    if hub is None:
        raise ValueError("Could not resolve Sofabaton hub from service call")

    _raise_if_sync_in_progress(hub, "_async_handle_command_to_button")

    activity_id = int(call.data["activity_id"])
    button_id = int(call.data["button_id"])
    device_id = int(call.data["device_id"])
    command_id = int(call.data["command_id"])

    if activity_id < 1 or activity_id > 255:
        raise ValueError("activity_id must be between 1 and 255")
    if button_id < 1 or button_id > 255:
        raise ValueError("button_id must be between 1 and 255")
    if device_id < 1 or device_id > 255:
        raise ValueError("device_id must be between 1 and 255")
    if command_id < 1 or command_id > 255:
        raise ValueError("command_id must be between 1 and 255")

    long_press_device_id = call.data.get("long_press_device_id")
    long_press_command_id = call.data.get("long_press_command_id")
    if long_press_device_id is not None:
        long_press_device_id = int(long_press_device_id)
        if long_press_device_id < 1 or long_press_device_id > 255:
            raise ValueError("long_press_device_id must be between 1 and 255")
    if long_press_command_id is not None:
        long_press_command_id = int(long_press_command_id)
        if long_press_command_id < 1 or long_press_command_id > 255:
            raise ValueError("long_press_command_id must be between 1 and 255")

    return await hub.async_command_to_button(
        activity_id=activity_id,
        button_id=button_id,
        device_id=device_id,
        command_id=command_id,
        long_press_device_id=long_press_device_id,
        long_press_command_id=long_press_command_id,
    )




async def _async_handle_sync_command_config(call: ServiceCall):
    hass = call.hass
    hub = await _async_resolve_hub_from_call(hass, call)
    if hub is None:
        raise ValueError("Could not resolve Sofabaton hub from service call")

    store = await _async_get_command_config_store(hass)

    roku_listen_port = _resolve_roku_listen_port(hass, hub.entry_id)
    payload = await store.async_get_hub_config(hub.entry_id, roku_listen_port=roku_listen_port)
    request_port = roku_listen_port
    device_name = str(call.data.get("device_name", "Home Assistant")).strip() or "Home Assistant"

    return await hub.async_sync_command_config(
        command_payload=payload,
        request_port=request_port,
        device_name=device_name,
    )

async def _async_handle_create_ip_button(call: ServiceCall):
    hass = call.hass
    hub = await _async_resolve_hub_from_call(hass, call)
    if hub is None:
        raise ValueError("Could not resolve Sofabaton hub from service call")

    device_id = call.data.get("device_id")
    device_name = call.data["device_name"].strip()
    button_name = call.data["button_name"].strip()
    method = call.data.get("method", "GET").upper()
    url = call.data["url"]
    headers = {str(k): str(v) for k, v in (call.data.get("headers") or {}).items()}

    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("URL must include scheme and host (http/https)")

    allowed_methods = {"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"}
    if method not in allowed_methods:
        raise ValueError(f"Unsupported HTTP method '{method}'")

    if not isinstance(headers, dict):
        raise ValueError("headers must be a mapping")

    if device_id is not None:
        result = await hass.async_add_executor_job(
            hub._proxy.add_ip_button_to_device,
            int(device_id),
            button_name,
            method,
            url,
            headers,
        )
    else:
        result = await hass.async_add_executor_job(
            hub._proxy.create_ip_button,
            device_name,
            button_name,
            method,
            url,
            headers,
        )

    return result or {}

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

    if len(hubs) == 1:
        return hubs[0]

    return None


def _get_hubs(domain_data: dict[str, Any]) -> list[SofabatonHub]:
    return [
        hub
        for hub in domain_data.values()
        if isinstance(hub, SofabatonHub)
    ]
