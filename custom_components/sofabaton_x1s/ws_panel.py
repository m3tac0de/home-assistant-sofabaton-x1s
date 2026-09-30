"""Control panel WS commands (R6, CR-H2-13).

The tools card's state, settings and actions with their payload builders,
hub logs, the persistent cache commands and the catalog refresh.
"""

from __future__ import annotations

import asyncio
from typing import Any

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import config_validation as cv

from .const import (
    DOMAIN,
    MIN_RECOMMENDED_FIRMWARE,
    MIN_SUPPORTED_FIRMWARE,
    firmware_is_outdated,
    firmware_is_unsupported,
)
from .diagnostics import (
    async_get_hub_log_lines,
    async_subscribe_hub_log_lines,
)
from .hub import SofabatonHub, get_hub_model
from .ui_settings_store import HUB_CLICK_ACTIONS
from . import operations
from . import runtime
from .ws_wifi import (
    _build_wifi_device_sync_payload,
)
from . import frontend_resources


async def _async_build_control_panel_runtime_payload(
    hass: HomeAssistant,
    hub: SofabatonHub,
) -> dict[str, Any]:
    registry = operations._backup_operation_registry(hass)
    active_backup_operation = registry.running_for_entry(hub.entry_id)
    if active_backup_operation:
        kind = str(active_backup_operation.get("kind") or "").strip().lower()
        if kind == "backup_restore":
            operation = "backup_restore"
            label = "Restoring backup"
        elif kind == "cache_refresh":
            operation = "cache_refresh"
            label = "Refreshing hub cache"
        elif kind == "activity_sync":
            operation = "entity_sync"
            label = "Syncing activity to hub"
        elif kind == "device_sync":
            operation = "entity_sync"
            label = "Syncing device to hub"
        else:
            operation = "backup_export"
            label = "Creating backup"
        return {
            "kind": "operation_running",
            "operation": operation,
            "operation_id": active_backup_operation.get("operation_id"),
            "label": label,
            # `detail` is this module's own English prose and cannot be
            # translated in the frontend, so it is only a fallback now. The
            # structured trio below is what the control panel localizes into
            # "Restoring device 8..." and friends; the progress callback already
            # merges these keys into the registry record.
            "detail": str(
                active_backup_operation.get("message")
                or active_backup_operation.get("phase")
                or "Working..."
            ),
            "phase": active_backup_operation.get("phase"),
            "step_kind": active_backup_operation.get("step_kind"),
            "step_device_id": active_backup_operation.get("step_device_id"),
            "current_device_id": active_backup_operation.get("current_device_id"),
            "current_activity_id": active_backup_operation.get("current_activity_id"),
            "current_step": active_backup_operation.get("completed_steps"),
            "total_steps": active_backup_operation.get("total_steps"),
            "device_key": None,
            "device_name": None,
        }

    if bool(getattr(hub, "client_connected", False)):
        return {
            "kind": "app_connected",
            "operation": None,
            "label": "Only Logs is available while the Sofabaton app is connected.",
            "detail": None,
            "current_step": None,
            "total_steps": None,
            "device_key": None,
            "device_name": None,
            "last_operation": _control_panel_last_operation(registry, hub.entry_id),
            "last_wifi_deploys": {},
        }

    store = await runtime._async_get_command_config_store(hass)
    roku_listen_port = runtime._resolve_roku_listen_port(hass, hub.entry_id)
    devices = await store.async_list_hub_devices(hub.entry_id, roku_listen_port=roku_listen_port)
    last_wifi_deploys: dict[str, str] = {}
    for device in devices:
        device_key = str(device.get("device_key") or "")
        sync_payload = _build_wifi_device_sync_payload(hub, device, device_key=device_key)
        status = str(sync_payload.get("status") or "").strip().lower()
        if status in {"success", "failed"}:
            last_wifi_deploys[device_key] = status
        if status != "running":
            continue
        return {
            "kind": "operation_running",
            "operation": "wifi_deploy",
            "label": "Deploying Wifi commands",
            # See the backup branch above: `phase` is what gets localized,
            # `detail` is the English fallback for stages without a mapping
            # (the in-place planner's per-step labels name user data, so they
            # have no fixed phase).
            "detail": str(sync_payload.get("message") or "Sync in progress"),
            "phase": sync_payload.get("phase"),
            "step_kind": sync_payload.get("step_kind"),
            "step_name": sync_payload.get("step_name"),
            "current_step": sync_payload.get("current_step"),
            "total_steps": sync_payload.get("total_steps"),
            "device_key": device_key or None,
            "device_name": str(device.get("device_name") or "").strip() or None,
        }

    return {
        "kind": "idle",
        "operation": None,
        "label": None,
        "detail": None,
        "current_step": None,
        "total_steps": None,
        "device_key": None,
        "device_name": None,
        # How the operations that just ended went: the control panel sees a
        # running operation disappear from the poll and must not announce
        # success for one that failed.
        "last_operation": _control_panel_last_operation(registry, hub.entry_id),
        "last_wifi_deploys": last_wifi_deploys,
    }


def _control_panel_last_operation(
    registry: "operations._BackupOperationRegistry", entry_id: str
) -> dict[str, Any] | None:
    """The most recent registry operation of this hub, once it has ended."""

    latest = registry.latest_for_entry(entry_id)
    if not latest or str(latest.get("status") or "") not in {"success", "failed"}:
        return None
    return {"operation_id": latest.get("operation_id"), "status": str(latest.get("status"))}


async def _async_build_control_panel_hub_payload(
    hass: HomeAssistant,
    hub: SofabatonHub,
    *,
    persistent_cache_enabled: bool,
) -> dict[str, Any]:
    registry = operations._backup_operation_registry(hass)
    entry = hass.config_entries.async_get_entry(hub.entry_id)
    banner_model = str(getattr(hub, "banner_model", "") or "").strip()
    version = banner_model or (get_hub_model(entry) if entry is not None else getattr(hub, "version", ""))
    can_run_hub_actions = bool(getattr(hub, "hub_connected", False)) and not bool(
        getattr(hub, "client_connected", False)
    )
    activities = getattr(hub, "activities", {}) or {}
    devices = getattr(hub, "devices", {}) or {}
    active_backup_operation = registry.running_for_entry(hub.entry_id)
    runtime_state = await _async_build_control_panel_runtime_payload(hass, hub)
    installed_firmware = getattr(hub, "hub_firmware_version", None)
    # Same classified version the firmware repair issue compares against,
    # so the card gate and the HA repair can never disagree.
    classified_version = getattr(hub, "version", None)
    return {
        "entry_id": hub.entry_id,
        "name": hub.name,
        "version": version,
        "firmware_version": installed_firmware,
        # Firmware gate for the card, computed here so the floor tables
        # stay Python-only. "outdated" nags (update available), while
        # "unsupported" blocks the write surfaces (editors, Wifi Commands,
        # backup) because such firmware ACKs writes and drops them.
        "firmware_outdated": firmware_is_outdated(classified_version, installed_firmware),
        "firmware_unsupported": firmware_is_unsupported(classified_version, installed_firmware),
        "firmware_min_recommended": MIN_RECOMMENDED_FIRMWARE.get(classified_version or ""),
        "firmware_min_supported": MIN_SUPPORTED_FIRMWARE.get(classified_version or ""),
        "ip_address": getattr(hub, "host", ""),
        "device_count": len(devices),
        "activity_count": len(activities),
        "hub_connected": bool(getattr(hub, "hub_connected", False)),
        "proxy_client_connected": bool(getattr(hub, "client_connected", False)),
        "persistent_cache_enabled": persistent_cache_enabled,
        "settings": {
            "proxy_enabled": bool(getattr(hub, "proxy_enabled", False)),
            "hex_logging_enabled": bool(getattr(hub, "hex_logging_enabled", False)),
            "wifi_device_enabled": bool(getattr(hub, "roku_server_enabled", False)),
        },
        "actions": {
            "can_find_remote": can_run_hub_actions,
            "can_sync_remote": can_run_hub_actions,
        },
        "active_backup_operation": active_backup_operation,
        "runtime_state": runtime_state,
    }


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/control_panel/state",
    }
)
@websocket_api.async_response
async def _ws_get_control_panel_state(
    hass: HomeAssistant, connection, msg: dict[str, Any]
) -> None:
    store = await runtime._async_get_persistent_cache_store(hass)
    ui_settings = await runtime._async_get_ui_settings_store(hass)
    tools_frontend_version = await frontend_resources._async_get_integration_version(hass)
    hubs = await asyncio.gather(
        *[
            _async_build_control_panel_hub_payload(
                hass,
                hub,
                persistent_cache_enabled=store.enabled,
            )
            for hub in runtime._get_hubs(hass.data.get(DOMAIN, {}))
        ]
    )
    payload = {
        "persistent_cache_enabled": store.enabled,
        "hub_click_action": ui_settings.hub_click_action,
        "tools_frontend_version": tools_frontend_version,
        "hubs": hubs,
    }
    connection.send_result(msg["id"], payload)


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/control_panel/set_setting",
        vol.Required("entry_id"): str,
        vol.Required("setting"): vol.In(
            [
                "persistent_cache",
                "hub_click_action",
                "proxy_enabled",
                "hex_logging_enabled",
                "wifi_device_enabled",
            ]
        ),
        # Boolean settings pass "enabled"; hub_click_action passes "value".
        vol.Optional("enabled"): cv.boolean,
        vol.Optional("value"): vol.In(list(HUB_CLICK_ACTIONS)),
    }
)
@websocket_api.async_response
async def _ws_control_panel_set_setting(
    hass: HomeAssistant, connection, msg: dict[str, Any]
) -> None:
    setting = str(msg["setting"])

    if setting == "hub_click_action":
        value = msg.get("value")
        if value not in HUB_CLICK_ACTIONS:
            connection.send_error(
                msg["id"], "invalid_format", "hub_click_action requires a value"
            )
            return
        ui_settings = await runtime._async_get_ui_settings_store(hass)
        await ui_settings.async_set_hub_click_action(str(value))
        connection.send_result(msg["id"], {"ok": True, "value": value})
        return

    if "enabled" not in msg:
        connection.send_error(
            msg["id"], "invalid_format", f"{setting} requires an enabled boolean"
        )
        return
    enabled = bool(msg["enabled"])

    if setting == "persistent_cache":
        store = await runtime._async_get_persistent_cache_store(hass)
        await store.async_set_enabled(enabled)
        if not enabled:
            await store.async_clear_all_hub_cache()
        connection.send_result(msg["id"], {"ok": True, "enabled": enabled})
        return

    hub = await runtime._async_resolve_hub_from_data(hass, {"entry_id": msg["entry_id"]})
    if hub is None:
        connection.send_error(msg["id"], "not_found", "Could not resolve Sofabaton hub")
        return

    if setting == "proxy_enabled":
        await hub.async_set_proxy_enabled(enabled)
    elif setting == "hex_logging_enabled":
        await hub.async_set_hex_logging_enabled(enabled)
    else:
        await hub.async_set_roku_server_enabled(enabled)

    connection.send_result(msg["id"], {"ok": True, "enabled": enabled})


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/control_panel/run_action",
        vol.Required("entry_id"): str,
        vol.Required("action"): vol.In(["find_remote", "sync_remote"]),
    }
)
@websocket_api.async_response
@runtime._hub_write_ws(persist=False)
async def _ws_control_panel_run_action(
    hass: HomeAssistant, connection, msg: dict[str, Any]
) -> None:
    hub = await runtime._async_resolve_hub_from_data(hass, {"entry_id": msg["entry_id"]})
    if hub is None:
        connection.send_error(msg["id"], "not_found", "Could not resolve Sofabaton hub")
        return

    can_run_hub_actions = bool(getattr(hub, "hub_connected", False)) and not bool(
        getattr(hub, "client_connected", False)
    )
    if not can_run_hub_actions:
        connection.send_error(
            msg["id"],
            "unavailable",
            "Action unavailable while proxy client is connected or hub is offline",
        )
        return

    if msg["action"] == "find_remote":
        await hub.async_find_remote()
    else:
        await hub.async_resync_remote()

    connection.send_result(msg["id"], {"ok": True})


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/logs/get",
        vol.Required("entry_id"): str,
        vol.Optional("limit", default=250): vol.All(int, vol.Range(min=1, max=1000)),
    }
)
@websocket_api.async_response
async def _ws_get_hub_logs(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    hub = await runtime._async_resolve_hub_from_data(hass, {"entry_id": msg["entry_id"]})
    if hub is None:
        connection.send_error(msg["id"], "not_found", "Could not resolve Sofabaton hub")
        return

    entry = hass.config_entries.async_get_entry(hub.entry_id)
    if entry is None:
        connection.send_error(msg["id"], "not_found", "Could not resolve Sofabaton config entry")
        return

    lines = await async_get_hub_log_lines(hass, entry, limit=int(msg["limit"]))
    connection.send_result(msg["id"], {"lines": lines})


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/logs/subscribe",
        vol.Required("entry_id"): str,
    }
)
@websocket_api.async_response
async def _ws_subscribe_hub_logs(
    hass: HomeAssistant, connection, msg: dict[str, Any]
) -> None:
    hub = await runtime._async_resolve_hub_from_data(hass, {"entry_id": msg["entry_id"]})
    if hub is None:
        connection.send_error(msg["id"], "not_found", "Could not resolve Sofabaton hub")
        return

    entry = hass.config_entries.async_get_entry(hub.entry_id)
    if entry is None:
        connection.send_error(msg["id"], "not_found", "Could not resolve Sofabaton config entry")
        return

    @callback
    def _forward(payload: dict[str, Any]) -> None:
        connection.send_message(websocket_api.event_message(msg["id"], payload))

    connection.subscriptions[msg["id"]] = async_subscribe_hub_log_lines(hass, entry, _forward)
    connection.send_result(msg["id"])


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
@runtime._hub_write_ws(persist=False)
async def _ws_refresh_persistent_cache_entry(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    hub = await runtime._async_resolve_hub_from_data(
        hass,
        {
            "entity_id": msg.get("entity_id"),
            "entry_id": msg.get("entry_id"),
        },
    )
    if hub is None:
        connection.send_error(msg["id"], "not_found", "Could not resolve Sofabaton hub")
        return

    store = await runtime._async_get_persistent_cache_store(hass)
    if not store.enabled:
        connection.send_error(msg["id"], "disabled", "Persistent cache is disabled")
        return

    target_id = int(msg["target_id"])
    if target_id < 1 or target_id > 255:
        connection.send_error(msg["id"], "invalid_id", "target_id must be between 1 and 255")
        return

    # Full structural refresh (commands, buttons, macros, inputs, key-sort,
    # idle behavior) rather than the old commands-only fetch, so per-entity
    # refresh keeps the canonical cache bundle-grade.
    await hub.async_refresh_entity_structure(kind=msg["kind"], ent_id=target_id)
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
    store = await runtime._async_get_persistent_cache_store(hass)
    if not store.enabled:
        connection.send_result(msg["id"], {"enabled": False, "hubs": []})
        return

    hub_payloads = []
    for hub in runtime._get_hubs(hass.data.get(DOMAIN, {})):
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
@runtime._hub_write_ws(persist=False)
async def _ws_refresh_catalog(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    hub = await runtime._async_resolve_hub_from_data(
        hass,
        {"entry_id": msg.get("entry_id")},
    )
    if hub is None:
        connection.send_error(msg["id"], "not_found", "Could not resolve Sofabaton hub")
        return

    try:
        await hub.async_request_catalog(msg["kind"])
    except TimeoutError as err:
        # The cached catalog is untouched; tell the card the refresh
        # failed instead of reporting success over stale data.
        connection.send_error(msg["id"], "timeout", str(err))
        return
    store = await runtime._async_get_persistent_cache_store(hass)
    if store.enabled:
        payload = await hub.async_export_cache_state()
        await store.async_set_hub_cache(hub.entry_id, payload)
    connection.send_result(msg["id"], {"ok": True})
