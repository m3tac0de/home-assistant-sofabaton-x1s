from __future__ import annotations

import asyncio
import contextlib
import logging
from pathlib import Path
from typing import Any, Mapping

import voluptuous as vol

from homeassistant.components import frontend
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers import issue_registry as ir

from .const import (
    infrared_platform_available,
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
    CONF_ROKU_LISTEN_PORT,
    DEFAULT_ROKU_LISTEN_PORT,
    format_hub_entry_title,
    HVER_BY_HUB_VERSION,
    HUB_VERSION_BY_HVER,
)
from .diagnostics import (
    async_disable_hex_logging_capture,
    async_setup_diagnostics,
    async_teardown_diagnostics,
)
from .hub import SofabatonHub
from .lib.hub_listener import bounce_hub_listener
from .roku_listener import async_get_roku_listener

from . import operations

from . import runtime
from . import sidebar_panel


from .ws_backup import (  # noqa: F401
    _validate_backup_device_ids,
    _without_bundle,
    _validate_restore_mode,
    _backup_result_filename,
    _run_backup_export_operation,
    _run_backup_restore_operation,
    _ws_backup_export,
    _ws_backup_restore,
    _ws_backup_stash_edited,
    _ws_backup_progress_subscribe,
    _ws_backup_state,
    _ws_backup_clear_result,
)

from .ws_ir import (  # noqa: F401
    _validate_ir_command_name,
    _parse_play_ir_blob_input,
    _ws_fetch_blob,
    _ws_play_ir_blob,
    _IR_LEARN_TIMEOUT_DEFAULT,
    _IR_LEARN_TIMEOUT_MIN,
    _IR_LEARN_TIMEOUT_MAX,
    _IR_LEARN_ERROR_FAILED,
    _IR_LEARN_ERROR_REFUSED,
    _ws_ir_learn_subscribe,
    _ws_ir_emissions_subscribe,
    _ir_emitter_entity_id,
    _value_references_entity,
    build_ir_emitter_consumers,
    _ws_ir_emitter_consumers,
    _ws_ir_library_catalog,
    _ws_ir_library_commands,
    _ws_ir_payload_convert,
)

from .ws_wifi import (  # noqa: F401
    _WIFI_NAME_PUNCTUATION,
    _WIFI_NAME_MAX_LEN,
    _hub_supports_unicode_wifi_names,
    _wifi_name_char_allowed,
    _validate_wifi_name_for_hub,
    _build_wifi_device_sync_payload,
    _async_wifi_listener_needed,
    _ws_get_command_config,
    _ws_set_command_config,
    _ws_get_hub_event_actions,
    _ws_set_hub_event_actions,
    _ws_get_command_sync_progress,
    _ws_run_command_sync,
    _hub_mqtt_available,
    _ws_list_command_devices,
    _ws_create_command_device,
    _ws_delete_command_device,
    _wifi_events_state_payload,
    _ws_list_wifi_events,
    _ws_create_wifi_event,
    _ws_delete_wifi_event,
    _ws_sync_wifi_events,
    _ws_clear_all_wifi_events,
    _ws_set_wifi_event_action,
    _ws_set_wifi_event_longpress,
    _build_wifi_press_event,
    _ws_subscribe_wifi_presses,
    _build_hub_event_payload,
    _ws_subscribe_hub_events,
)

from . import frontend_resources

from .ws_panel import (  # noqa: F401
    _async_build_control_panel_runtime_payload,
    _control_panel_last_operation,
    _async_build_control_panel_hub_payload,
    _ws_get_control_panel_state,
    _ws_control_panel_set_setting,
    _ws_control_panel_run_action,
    _ws_get_hub_logs,
    _ws_subscribe_hub_logs,
    _ws_refresh_persistent_cache_entry,
    _ws_get_persistent_cache_contents,
    _ws_refresh_catalog,
)

from .ws_editor import (  # noqa: F401
    _new_entity_name_storable,
    _hub_model_for_names,
    _handle_entity_sync_ws,
    _ws_activity_sync,
    _ws_device_sync,
    _handle_entity_delete_ws,
    _ws_activity_delete,
    _ws_device_delete,
    _resolve_hub_for_activity_write,
    _ws_activity_reorder,
    _ws_device_reorder,
    _ws_activity_create,
    _ws_device_create,
    _handle_entity_sync_plan_ws,
    _ws_activity_sync_plan,
    _ws_device_sync_plan,
    _CACHE_REFRESH_MESSAGE_REWRITES,
    _cache_refresh_progress_message,
    _run_cache_refresh_operation,
    _ws_refresh_all_cache,
    _ws_get_structural_bundle,
    _ws_get_device_keymap,
    _ws_get_device_power_state,
)

from . import services
from .services import (  # noqa: F401
    _async_handle_fetch_device_commands,
    _async_handle_dump_ir_commands,
    _async_handle_fetch_blob,
    _async_handle_backup_bundle,
    _async_handle_restore_backup,
    _async_handle_play_ir_blob,
    _async_handle_set_ir_learn_mode,
    _async_handle_ir_learn_command,
    _async_handle_persist_ir_blob,
    _async_handle_create_wifi_device,
    _async_handle_device_to_activity,
    _async_handle_delete_device,
    _async_handle_command_to_favorite,
    _async_handle_get_favorites,
    _async_handle_reorder_favorites,
    _async_handle_delete_favorite,
    _async_handle_command_to_button,
    _async_pick_wifi_device_key,
    _async_handle_sync_command_config,
    _async_handle_export_snapshot,
    _async_handle_sync_from_snapshot,
)

_LOGGER = logging.getLogger(__name__)
_UNLOAD_DRAIN_TIMEOUT_S = 600.0


def _register_websocket_commands(hass: HomeAssistant) -> None:
    domain_data = hass.data.setdefault(DOMAIN, {})
    if domain_data.get("ws_registered"):
        return

    websocket_api.async_register_command(hass, _ws_get_command_config)
    websocket_api.async_register_command(hass, _ws_set_command_config)
    websocket_api.async_register_command(hass, _ws_get_command_sync_progress)
    websocket_api.async_register_command(hass, _ws_run_command_sync)
    websocket_api.async_register_command(hass, _ws_list_command_devices)
    websocket_api.async_register_command(hass, _ws_create_command_device)
    websocket_api.async_register_command(hass, _ws_delete_command_device)
    websocket_api.async_register_command(hass, _ws_list_wifi_events)
    websocket_api.async_register_command(hass, _ws_create_wifi_event)
    websocket_api.async_register_command(hass, _ws_delete_wifi_event)
    websocket_api.async_register_command(hass, _ws_sync_wifi_events)
    websocket_api.async_register_command(hass, _ws_clear_all_wifi_events)
    websocket_api.async_register_command(hass, _ws_set_wifi_event_action)
    websocket_api.async_register_command(hass, _ws_set_wifi_event_longpress)
    websocket_api.async_register_command(hass, _ws_get_hub_event_actions)
    websocket_api.async_register_command(hass, _ws_set_hub_event_actions)
    websocket_api.async_register_command(hass, _ws_get_control_panel_state)
    websocket_api.async_register_command(hass, _ws_control_panel_set_setting)
    websocket_api.async_register_command(hass, _ws_control_panel_run_action)
    websocket_api.async_register_command(hass, _ws_fetch_blob)
    websocket_api.async_register_command(hass, _ws_play_ir_blob)
    websocket_api.async_register_command(hass, _ws_ir_learn_subscribe)
    websocket_api.async_register_command(hass, _ws_ir_emissions_subscribe)
    websocket_api.async_register_command(hass, _ws_ir_emitter_consumers)
    websocket_api.async_register_command(hass, _ws_ir_library_catalog)
    websocket_api.async_register_command(hass, _ws_ir_library_commands)
    websocket_api.async_register_command(hass, _ws_ir_payload_convert)
    websocket_api.async_register_command(hass, _ws_backup_export)
    websocket_api.async_register_command(hass, _ws_backup_restore)
    websocket_api.async_register_command(hass, _ws_backup_stash_edited)
    websocket_api.async_register_command(hass, _ws_backup_progress_subscribe)
    websocket_api.async_register_command(hass, _ws_backup_state)
    websocket_api.async_register_command(hass, _ws_backup_clear_result)
    websocket_api.async_register_command(hass, _ws_activity_sync)
    websocket_api.async_register_command(hass, _ws_activity_sync_plan)
    websocket_api.async_register_command(hass, _ws_device_sync)
    websocket_api.async_register_command(hass, _ws_device_sync_plan)
    websocket_api.async_register_command(hass, _ws_activity_delete)
    websocket_api.async_register_command(hass, _ws_device_delete)
    websocket_api.async_register_command(hass, _ws_activity_reorder)
    websocket_api.async_register_command(hass, _ws_device_reorder)
    websocket_api.async_register_command(hass, _ws_activity_create)
    websocket_api.async_register_command(hass, _ws_device_create)
    websocket_api.async_register_command(hass, _ws_refresh_all_cache)
    websocket_api.async_register_command(hass, _ws_get_structural_bundle)
    websocket_api.async_register_command(hass, _ws_get_device_keymap)
    websocket_api.async_register_command(hass, _ws_get_device_power_state)
    websocket_api.async_register_command(hass, _ws_get_hub_logs)
    websocket_api.async_register_command(hass, _ws_subscribe_hub_logs)
    websocket_api.async_register_command(hass, _ws_subscribe_wifi_presses)
    websocket_api.async_register_command(hass, _ws_subscribe_hub_events)
    websocket_api.async_register_command(hass, _ws_refresh_persistent_cache_entry)
    websocket_api.async_register_command(hass, _ws_get_persistent_cache_contents)
    websocket_api.async_register_command(hass, _ws_refresh_catalog)
    domain_data["ws_registered"] = True


CONFIG_SCHEMA = vol.Schema(
    {
        DOMAIN: vol.Schema(
            {vol.Optional(CONF_ENABLE_X2_DISCOVERY, default=True): cv.boolean},
        ),
    },
    extra=vol.ALLOW_EXTRA,
)


async def async_setup(hass: HomeAssistant, config: dict[str, Any]) -> bool:
    domain_config = config.get(DOMAIN, {})
    # X2 discovery is on by default; enable_x2_discovery: false opts out.
    # (The key used to be an opt-in and is still honored in both directions.)
    enable_x2_discovery = bool(domain_config.get(CONF_ENABLE_X2_DISCOVERY, True))

    hass.data.setdefault(DOMAIN, {})
    hass.data[DOMAIN].setdefault("config", {})
    hass.data[DOMAIN]["config"][CONF_ENABLE_X2_DISCOVERY] = enable_x2_discovery

    # Ensure DOMAIN data is initialized
    hass.data.setdefault(DOMAIN, {})

    _register_websocket_commands(hass)

    if not hass.data[DOMAIN].get("backup_download_view_registered"):
        hass.http.register_view(operations.SofabatonBackupDownloadView(hass))
        hass.data[DOMAIN]["backup_download_view_registered"] = True

    if not hass.data[DOMAIN].get("stop_listener_registered"):
        async def _async_handle_hass_stop(_event: Any) -> None:
            persisted = await runtime._async_persist_all_hub_cache(hass)
            if persisted:
                _LOGGER.info("[%s] Persisted cache for %s hub(s) on Home Assistant stop", DOMAIN, persisted)

        hass.bus.async_listen_once("homeassistant_stop", _async_handle_hass_stop)
        hass.data[DOMAIN]["stop_listener_registered"] = True

    if not hass.data[DOMAIN].get("frontend_bootstrap_registered"):
        frontend_dir = Path(__file__).parent / "www"
        abs_path, frontend_dir_exists, contents = await hass.async_add_executor_job(
            frontend_resources._inspect_frontend_dir, frontend_dir
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

            if frontend_resources._get_lovelace_resource_mode(hass) != frontend_resources._LOVELACE_STORAGE_MODE:
                module_specs = await frontend_resources._async_build_frontend_module_specs(hass)
                tools_module = next(
                    module for module in module_specs if module["filename"] == frontend_resources._TOOLS_CARD_FILENAME
                )
                remote_modules = [
                    module for module in module_specs if module["filename"] == frontend_resources._REMOTE_CARD_FILENAME
                ]
                loader_url = frontend_resources._frontend_loader_url(
                    tools_module["version"],
                    bool(remote_modules),
                    remote_version=remote_modules[0]["version"] if remote_modules else "",
                )
                _LOGGER.info("[%s] Adding fallback loader script: %s", DOMAIN, loader_url)
                frontend.add_extra_js_url(hass, loader_url)

            hass.data[DOMAIN]["frontend_bootstrap_registered"] = True
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

    # ``resolved_version`` may be ``None`` for entries created via manual
    # entry before the first proxy connect; in that case the post-connect
    # banner is responsible for filling it in. Downstream consumers that
    # need a concrete variant (wire builders/parsers) read from the live
    # proxy state, not from the persisted entry data.
    resolved_version = detected_version or stored_version
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


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    async_setup_diagnostics(hass)
    await runtime._async_get_command_config_store(hass)

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

    cache_store = await runtime._async_get_persistent_cache_store(hass)
    if cache_store.enabled:
        cache_payload = await cache_store.async_get_hub_cache(entry.entry_id)
        if cache_payload:
            await hub.async_restore_persistent_cache(cache_payload)

    await hub.async_start()

    services.async_register_services(hass)

    hass.data[DOMAIN][entry.entry_id] = hub

    roku_listener = await async_get_roku_listener(hass)
    await roku_listener.async_set_listen_port(int(roku_listen_port))
    await roku_listener.async_register_hub(hub, enabled=roku_server_enabled)

    # MQTT press ingress: subscribe now if the store has MQTT-deployed
    # records (safe no-op otherwise; the sync flow keeps it aligned).
    await hub.async_update_wifi_mqtt_ingress()
    # MQTT activity-state ingress: on for any X2 with the MQTT
    # integration loaded (the persisted banner MAC covers a restart
    # before the hub's first TCP connect).
    await hub.async_update_activity_state_ingress()

    # ← important: tell HA to call us when options change
    entry.async_on_unload(
        entry.add_update_listener(async_update_options)
    )

    await hass.config_entries.async_forward_entry_setups(
        entry, _supported_platforms()
    )
    await frontend_resources._async_ensure_storage_mode_frontend_resources(hass)
    await sidebar_panel.async_sync_sidebar_panel(hass)
    return True


def _supported_platforms() -> list[str]:
    """PLATFORMS plus ``infrared`` when this HA core ships the domain.

    Setup and unload must both use this so the forward/unload platform
    lists match.
    """

    platforms = list(PLATFORMS)
    if not infrared_platform_available():
        _LOGGER.info(
            "This Home Assistant core has no infrared platform; "
            "skipping the IR emitter entity"
        )
        return platforms
    platforms.append("infrared")
    return platforms


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

async def _async_drain_hub_work(hass: HomeAssistant, hub: SofabatonHub) -> None:
    """Let running hub work finish before the hub stops (CR-X1-2).

    A learn window is cancelled; anything else (a replacing restore, a
    sync, a delete waiting for its ack) cannot be interrupted safely, so
    unload waits for it, up to a bound. Past the bound the operations are
    marked failed, so the reloaded hub does not read as busy for work it
    does not own.
    """

    with contextlib.suppress(Exception):
        hub.cancel_ir_learn()
    if not runtime._hub_is_busy(hass, hub):
        return
    _LOGGER.info("[%s] Waiting for running hub work before unloading", hub.entry_id)
    loop = asyncio.get_running_loop()
    deadline = loop.time() + _UNLOAD_DRAIN_TIMEOUT_S
    while runtime._hub_is_busy(hass, hub):
        remaining = deadline - loop.time()
        if remaining <= 0:
            failed = operations._backup_operation_registry(hass).fail_running_for_entry(
                hub.entry_id, "Home Assistant unloaded the hub while this operation was running"
            )
            _LOGGER.warning(
                "[%s] Unloading with hub work still running (%d operation(s) marked failed)",
                hub.entry_id,
                failed,
            )
            return
        await hub.async_wait_until_idle(min(remaining, 1.0))


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    running_hub = hass.data.get(DOMAIN, {}).get(entry.entry_id)
    if isinstance(running_hub, SofabatonHub):
        await _async_drain_hub_work(hass, running_hub)
    unload_ok = await hass.config_entries.async_unload_platforms(
        entry, _supported_platforms()
    )
    if unload_ok:
        hub = hass.data[DOMAIN].pop(entry.entry_id, None)
        if not runtime._get_hubs(hass.data[DOMAIN]):
            services.async_remove_services(hass)
            async_teardown_diagnostics(hass)
            if frontend_resources._get_lovelace_resource_mode(hass) == frontend_resources._LOVELACE_STORAGE_MODE:
                if hass.data[DOMAIN].get("storage_resources_registered"):
                    await frontend_resources._async_unregister_lovelace_resources(hass)
                hass.data[DOMAIN]["storage_resources_registered"] = False
            sidebar_panel.async_remove_sidebar_panel(hass)
        async_disable_hex_logging_capture(hass, entry.entry_id)
        if hub is not None:
            try:
                await runtime._async_persist_hub_cache(hass, hub)
            except Exception:
                # Best effort: the hub must still stop, or the old proxy
                # keeps its threads, sockets and listener registration.
                _LOGGER.exception("[%s] Failed to persist cache for hub %s during unload", DOMAIN, hub.entry_id)
            await hub.async_stop_wifi_mqtt_ingress()
            await hub.async_stop_activity_state_ingress()
            roku_listener = await async_get_roku_listener(hass)
            await roku_listener.async_remove_hub(entry.entry_id)
            await hub.async_stop()
            # On a user-disable (not a reload/options change/HA shutdown) with
            # other hubs still sharing the TCP listener, briefly bounce that
            # listener so the now-disconnected hub's reconnects are refused at
            # the SYN level and it gives up — otherwise it loops forever on the
            # still-open shared port and stays invisible to the Sofabaton app.
            if getattr(entry, "disabled_by", None) is not None:
                await hass.async_add_executor_job(bounce_hub_listener)
    return unload_ok


async def async_remove_entry(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Release a hub when its config entry is deleted.

    Removal isn't distinguishable from a reload inside ``async_unload_entry``
    (neither sets ``disabled_by``), so it gets its own hook. By the time this
    runs the bridge has already been stopped and unregistered by the unload,
    leaving the physical hub looping on the still-open shared listener — a
    bounce refuses it at the SYN level so it gives up and becomes reachable by
    the Sofabaton app. The bounce is a no-op if no other hubs keep the shared
    listener alive (last hub removed → port already closed).
    """

    # The outdated-firmware repair is only cleared by the hub reporting
    # newer firmware; a removed hub can never do that, so drop it here.
    ir.async_delete_issue(hass, DOMAIN, f"outdated_firmware_{entry.entry_id}")

    # Its persisted cache and Wifi Command records have no owner any more.
    try:
        cache_store = await runtime._async_get_persistent_cache_store(hass)
        await cache_store.async_clear_hub_cache(entry.entry_id)
        command_store = await runtime._async_get_command_config_store(hass)
        await command_store.async_remove_hub(entry.entry_id)
    except Exception:  # noqa: BLE001 - removal must still release the hub
        _LOGGER.exception("[%s] Failed to clear stored data of removed hub %s", DOMAIN, entry.entry_id)

    await hass.async_add_executor_job(bounce_hub_listener)


