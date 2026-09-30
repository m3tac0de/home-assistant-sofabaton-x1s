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
from homeassistant.core import HomeAssistant, ServiceCall, SupportsResponse
from homeassistant.helpers import config_validation as cv
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.dispatcher import async_dispatcher_send
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
    signal_command_sync,
    HVER_BY_HUB_VERSION,
    HUB_VERSION_BY_HVER,
)
from .diagnostics import (
    async_disable_hex_logging_capture,
    async_setup_diagnostics,
    async_teardown_diagnostics,
)
from .hub import SofabatonHub
from .command_config import (
    CommandConfigStore,
    WIFI_EVENTS_DEVICE_KEY,
    is_wifi_events_device_key,
    normalize_command_id_list,
    normalize_power_command_id,
)
from .lib.activity_sync import build_activity_sync_plan, build_device_sync_plan
from .lib.bundle_validation import validate_new_entity_name
from .lib.hub_listener import bounce_hub_listener
from .lib.device_class_profiles import MAX_DEVICE_NAME_LEN, supported_create_classes
from .lib.protocol_const import normalize_device_class
from .roku_listener import async_get_roku_listener

from . import operations

from . import runtime

from . import entity_sync

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

_LOGGER = logging.getLogger(__name__)
_UNLOAD_DRAIN_TIMEOUT_S = 600.0


def _new_entity_name_storable(hub: SofabatonHub, name: str) -> bool:
    """A new activity/device name the hub stores as given (CR-X4-2)."""

    try:
        validate_new_entity_name(name, hub_version=_hub_model_for_names(hub))
    except ValueError:
        return False
    return True


def _hub_model_for_names(hub: SofabatonHub) -> str:
    version = str(getattr(hub, "version", "") or "").upper()
    if "X2" in version:
        return "X2"
    if "X1S" in version:
        return "X1S"
    return "X1"


async def _handle_entity_sync_ws(
    hass: HomeAssistant,
    connection,
    msg: dict[str, Any],
    *,
    entity_kind: str,
) -> None:
    hub = await runtime._async_resolve_hub_from_data(hass, {"entry_id": msg["entry_id"]})
    if hub is None:
        connection.send_error(msg["id"], "not_found", "Could not resolve Sofabaton hub")
        return

    try:
        operation_id, baseline, edited, entity_id = await entity_sync._async_prepare_entity_sync(
            hass,
            hub=hub,
            entity_kind=entity_kind,
            sync_input=msg,
            operation_label=f"_ws_{entity_kind}_sync",
        )
    except entity_sync._EntitySyncRejected as err:
        connection.send_error(msg["id"], err.code, str(err))
        return

    hass.async_create_task(
        entity_sync._run_entity_sync_operation(
            hass,
            operation_id,
            hub=hub,
            baseline=baseline,
            edited=edited,
            entity_kind=entity_kind,
            entity_id=entity_id,
        )
    )
    connection.send_result(msg["id"], {"operation_id": operation_id})


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/activity/sync",
        vol.Required("entry_id"): str,
        vol.Required("activity_id"): vol.All(int, vol.Range(min=1, max=255)),
        vol.Required("baseline"): dict,
        vol.Required("edited"): dict,
    }
)
@websocket_api.async_response
async def _ws_activity_sync(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    await _handle_entity_sync_ws(hass, connection, msg, entity_kind="activity")


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/device/sync",
        vol.Required("entry_id"): str,
        vol.Required("device_id"): vol.All(int, vol.Range(min=1, max=255)),
        vol.Required("baseline"): dict,
        vol.Required("edited"): dict,
    }
)
@websocket_api.async_response
async def _ws_device_sync(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    await _handle_entity_sync_ws(hass, connection, msg, entity_kind="device")


async def _handle_entity_delete_ws(
    hass: HomeAssistant,
    connection,
    msg: dict[str, Any],
    *,
    entity_kind: str,
) -> None:
    # Immediate live delete of a whole activity/device. The hub's delete
    # primitive keys purely by id (device and activity id ranges share one
    # table), so both kinds go through async_delete_device with the target id.
    hub = await runtime._async_resolve_hub_from_data(hass, {"entry_id": msg["entry_id"]})
    if hub is None:
        connection.send_error(msg["id"], "not_found", "Could not resolve Sofabaton hub")
        return

    entity_id = int(msg["activity_id" if entity_kind == "activity" else "device_id"])
    result = await hub.async_delete_device(device_id=entity_id)
    if not result or str(result.get("status")) != "success":
        connection.send_error(
            msg["id"],
            "delete_failed",
            f"The hub did not confirm deletion of {entity_kind} {entity_id}",
        )
        return
    # W7 decision 4: deleting the Wifi Events device wholesale from the Hub
    # tab drops its orphaned store record and, if nothing else needs it,
    # disables the HTTP listener (the store record is what keeps the guard
    # alive). The hub-side delete already cascaded its refs.
    if entity_kind == "device":
        try:
            store = await runtime._async_get_command_config_store(hass)
            events_state = store.wifi_events_record_state(hub.entry_id)
            if events_state.get("device_id") == entity_id:
                await store.async_delete_hub_device(hub.entry_id, WIFI_EVENTS_DEVICE_KEY)
                if hub.roku_server_enabled and not await _async_wifi_listener_needed(hass, hub.entry_id):
                    await hub.async_set_roku_server_enabled(False)
                async_dispatcher_send(hass, signal_command_sync(hub.entry_id))
        except Exception:  # pragma: no cover - cleanup must never fail the delete
            _LOGGER.exception("[device_delete] wifi events store cleanup failed")
    connection.send_result(msg["id"], result)


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/activity/delete",
        vol.Required("entry_id"): str,
        vol.Required("activity_id"): vol.All(int, vol.Range(min=1, max=255)),
    }
)
@websocket_api.async_response
@runtime._hub_write_ws()
async def _ws_activity_delete(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    await _handle_entity_delete_ws(hass, connection, msg, entity_kind="activity")


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/device/delete",
        vol.Required("entry_id"): str,
        vol.Required("device_id"): vol.All(int, vol.Range(min=1, max=255)),
    }
)
@websocket_api.async_response
@runtime._hub_write_ws()
async def _ws_device_delete(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    await _handle_entity_delete_ws(hass, connection, msg, entity_kind="device")


async def _resolve_hub_for_activity_write(
    hass: HomeAssistant, connection, msg: dict[str, Any], *, op_name: str
):
    """Resolve the hub for an immediate catalog write (activity reorder /
    create, device reorder / create). The busy refusal runs in the
    handlers' ``_hub_write_ws`` decorator."""

    hub = await runtime._async_resolve_hub_from_data(hass, {"entry_id": msg["entry_id"]})
    if hub is None:
        connection.send_error(msg["id"], "not_found", "Could not resolve Sofabaton hub")
        return None
    return hub


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/activity/reorder",
        vol.Required("entry_id"): str,
        vol.Required("ordered_ids"): [vol.All(int, vol.Range(min=1, max=255))],
    }
)
@websocket_api.async_response
@runtime._hub_write_ws()
async def _ws_activity_reorder(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    # Immediate live write of the hub's stored activity display order.
    hub = await _resolve_hub_for_activity_write(
        hass, connection, msg, op_name="_ws_activity_reorder"
    )
    if hub is None:
        return

    result = await hub.async_reorder_activities(list(msg["ordered_ids"]))
    if not result or str(result.get("status")) != "success":
        connection.send_error(
            msg["id"],
            "reorder_failed",
            "The hub did not confirm the new activity order",
        )
        return
    connection.send_result(msg["id"], result)


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/device/reorder",
        vol.Required("entry_id"): str,
        vol.Required("ordered_ids"): [vol.All(int, vol.Range(min=1, max=255))],
    }
)
@websocket_api.async_response
@runtime._hub_write_ws()
async def _ws_device_reorder(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    # Immediate live write of the hub's stored device display order.
    hub = await _resolve_hub_for_activity_write(
        hass, connection, msg, op_name="_ws_device_reorder"
    )
    if hub is None:
        return

    result = await hub.async_reorder_devices(list(msg["ordered_ids"]))
    if not result or str(result.get("status")) != "success":
        connection.send_error(
            msg["id"],
            "reorder_failed",
            "The hub did not confirm the new device order",
        )
        return
    connection.send_result(msg["id"], result)


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/activity/create",
        vol.Required("entry_id"): str,
        vol.Required("name"): str,
    }
)
@websocket_api.async_response
@runtime._hub_write_ws()
async def _ws_activity_create(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    # Create a fresh, empty activity; the frontend then opens the live
    # editor on the assigned id.
    name = str(msg["name"]).strip()
    if not name or len(name) > 30:
        connection.send_error(
            msg["id"],
            "invalid_name",
            "Activity name must be 1-30 characters",
        )
        return

    hub = await _resolve_hub_for_activity_write(
        hass, connection, msg, op_name="_ws_activity_create"
    )
    if hub is None:
        return
    if not _new_entity_name_storable(hub, name):
        connection.send_error(
            msg["id"],
            "invalid_name",
            "The hub cannot store this activity name",
        )
        return

    result = await hub.async_create_activity(name)
    if not result or str(result.get("status")) != "success":
        connection.send_error(
            msg["id"],
            "create_failed",
            "The hub did not confirm creation of the new activity",
        )
        return
    connection.send_result(msg["id"], result)


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/device/create",
        vol.Required("entry_id"): str,
        vol.Required("name"): str,
        vol.Required("device_class"): str,
    }
)
@websocket_api.async_response
@runtime._hub_write_ws()
async def _ws_device_create(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    # Hub tab "Add device": create an EMPTY device of the chosen class;
    # the frontend then opens the live editor on the assigned id and the
    # user adds commands there. Same guard chain as activity create.
    name = str(msg["name"]).strip()
    if not name or len(name) > MAX_DEVICE_NAME_LEN:
        connection.send_error(
            msg["id"],
            "invalid_name",
            f"Device name must be 1-{MAX_DEVICE_NAME_LEN} characters",
        )
        return

    hub = await _resolve_hub_for_activity_write(
        hass, connection, msg, op_name="_ws_device_create"
    )
    if hub is None:
        return
    if not _new_entity_name_storable(hub, name):
        connection.send_error(
            msg["id"],
            "invalid_name",
            "The hub cannot store this device name",
        )
        return

    device_class = normalize_device_class(msg.get("device_class"))
    if device_class is None or device_class not in supported_create_classes(hub.version):
        connection.send_error(
            msg["id"],
            "unsupported_class",
            f"Device class {msg.get('device_class')!r} cannot be created on a "
            f"{hub.version} hub",
        )
        return

    result = await hub.async_create_device(name, device_class=device_class)
    if not result or str(result.get("status")) != "success":
        connection.send_error(
            msg["id"],
            "create_failed",
            "The hub did not confirm creation of the new device",
        )
        return
    connection.send_result(msg["id"], result)


async def _handle_entity_sync_plan_ws(
    hass: HomeAssistant,
    connection,
    msg: dict[str, Any],
    *,
    entity_kind: str,
) -> None:
    # Bench and debug API (L-K6): compute the write plan without executing
    # it. No card calls it since the review dialog went; bench_240 uses it to
    # check a plan the live editor would send.
    hub = await runtime._async_resolve_hub_from_data(hass, {"entry_id": msg["entry_id"]})
    if hub is None:
        connection.send_error(msg["id"], "not_found", "Could not resolve Sofabaton hub")
        return
    try:
        baseline, edited, entity_id = entity_sync._validate_entity_sync_inputs(
            msg,
            entity_kind=entity_kind,
            hub_version=getattr(hub, "version", None),
        )
        if entity_kind == "device":
            plan = build_device_sync_plan(
                baseline,
                edited,
                entity_id,
                # Command removal is in scope for every device (the review
                # preview must mirror the executor's rules).
                allow_command_removal=True,
            )
        else:
            plan = build_activity_sync_plan(baseline, edited, entity_id)
    except (ValueError, TypeError, AttributeError) as err:
        connection.send_error(msg["id"], "invalid_payload", str(err))
        return
    connection.send_result(
        msg["id"],
        {
            "step_count": len(plan),
            "steps": [{"kind": step.kind, "label": step.label} for step in plan],
        },
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/activity/sync_plan",
        vol.Required("entry_id"): str,
        vol.Required("activity_id"): vol.All(int, vol.Range(min=1, max=255)),
        vol.Required("baseline"): dict,
        vol.Required("edited"): dict,
    }
)
@websocket_api.async_response
async def _ws_activity_sync_plan(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    await _handle_entity_sync_plan_ws(hass, connection, msg, entity_kind="activity")


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/device/sync_plan",
        vol.Required("entry_id"): str,
        vol.Required("device_id"): vol.All(int, vol.Range(min=1, max=255)),
        vol.Required("baseline"): dict,
        vol.Required("edited"): dict,
    }
)
@websocket_api.async_response
async def _ws_device_sync_plan(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    await _handle_entity_sync_plan_ws(hass, connection, msg, entity_kind="device")


# ── Whole-hub cache refresh + structural bundle (blob-free) ─────────────
# One operation refreshes the entire hub's *structural* cache (no per-command
# IR blob dump — seconds, not minutes) and persists a blob-free hub_bundle the
# live activity editor reads instantly. Reuses the backup operation registry
# (kind="cache_refresh") and progress surface.


# The refresh reuses the library's bundle-export progress stream, whose
# messages speak backup language ("Backing up device 3…"). The dock shows
# them verbatim, so recast them as cache-refresh language here.
_CACHE_REFRESH_MESSAGE_REWRITES = (
    ("Backing up ", "Refreshing "),
    ("Backed up ", "Refreshed "),
    ("Finalizing backup bundle", "Finalizing hub cache"),
)


def _cache_refresh_progress_message(message: str) -> str:
    for prefix, replacement in _CACHE_REFRESH_MESSAGE_REWRITES:
        if message.startswith(prefix):
            return replacement + message[len(prefix):]
    return message


@runtime._hub_operation
async def _run_cache_refresh_operation(
    hass: HomeAssistant,
    operation_id: str,
    *,
    hub: SofabatonHub,
) -> None:
    registry = operations._backup_operation_registry(hass)

    def _progress(**payload: Any) -> None:
        message = payload.get("message")
        if isinstance(message, str) and message:
            payload["message"] = _cache_refresh_progress_message(message)
        registry.update_from_thread(operation_id, **payload)

    try:
        await hub.async_refresh_hub_cache(progress_callback=_progress)
        store = await runtime._async_get_persistent_cache_store(hass)
        if store.enabled:
            # The canonical cache now carries everything structural; the
            # editor's bundle is assembled from it on demand.
            summary = await hub.async_export_cache_state()
            await store.async_set_hub_cache(hub.entry_id, summary)
        registry.update(
            operation_id,
            status="success",
            phase="completed",
            message="Hub cache refreshed.",
            generation=hub.cache_generation,
        )
    except Exception as err:
        registry.update(
            operation_id,
            status="failed",
            phase="failed",
            message=str(err) or "Cache refresh failed",
            error=str(err) or "Cache refresh failed",
        )


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/cache/refresh_all",
        vol.Required("entry_id"): str,
    }
)
@websocket_api.async_response
async def _ws_refresh_all_cache(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    hub = await runtime._async_resolve_hub_from_data(hass, {"entry_id": msg["entry_id"]})
    if hub is None:
        connection.send_error(msg["id"], "not_found", "Could not resolve Sofabaton hub")
        return

    registry = operations._backup_operation_registry(hass)
    if runtime._hub_is_busy(hass, hub):
        connection.send_error(msg["id"], "busy", "Another operation is already running for this hub")
        return

    try:
        runtime._raise_if_hub_operation_locked(hass, hub, "_ws_refresh_all_cache")
    except HomeAssistantError as err:
        connection.send_error(msg["id"], "unavailable", str(err))
        return

    operation_id = registry.create(
        kind="cache_refresh",
        entry_id=hub.entry_id,
        initial_state={
            "status": "pending",
            "phase": "queued",
            "message": "Starting hub cache refresh…",
            "completed_steps": 0,
            "total_steps": 0,
        },
    )
    hass.async_create_task(_run_cache_refresh_operation(hass, operation_id, hub=hub))
    connection.send_result(msg["id"], {"operation_id": operation_id})


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/cache/structural_bundle",
        vol.Required("entry_id"): str,
    }
)
@websocket_api.async_response
async def _ws_get_structural_bundle(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    hub = await runtime._async_resolve_hub_from_data(hass, {"entry_id": msg["entry_id"]})
    if hub is None:
        connection.send_error(msg["id"], "not_found", "Could not resolve Sofabaton hub")
        return
    # Assembled on demand from the canonical cache (proxy state); nothing is
    # read from storage here. The persistent-cache gate stays so the editor
    # remains an opt-in feature tied to caching being enabled.
    store = await runtime._async_get_persistent_cache_store(hass)
    bundle = await hub.async_get_structural_bundle() if store.enabled else None
    if not bundle:
        connection.send_result(msg["id"], {"bundle": None, "generation": None})
        return
    connection.send_result(
        msg["id"],
        {"bundle": bundle, "generation": hub.cache_generation},
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/device/keymap",
        vol.Required("entry_id"): str,
        vol.Required("device_id"): int,
    }
)
@websocket_api.async_response
async def _ws_get_device_keymap(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    """Remote-card device mode: one device's cached bindings + commands.

    A pure projection of cached proxy state — no hub I/O, ever. Device
    mode is gated on the persistent cache; a cold device returns a clean
    cache_miss and the card points the user at a control-panel refresh
    (docs/internal/device-mode-plan.md).
    """

    hub = await runtime._async_resolve_hub_from_data(hass, {"entry_id": msg["entry_id"]})
    if hub is None:
        connection.send_error(msg["id"], "not_found", "Could not resolve Sofabaton hub")
        return

    store = await runtime._async_get_persistent_cache_store(hass)
    if not store.enabled:
        connection.send_result(msg["id"], {"keymap": None, "reason": "cache_disabled"})
        return

    keymap = hub.get_device_keymap(int(msg["device_id"]))
    if keymap is None:
        connection.send_result(msg["id"], {"keymap": None, "reason": "cache_miss"})
        return

    connection.send_result(
        msg["id"],
        {"keymap": keymap, "generation": hub.cache_generation},
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/device/power_state",
        vol.Required("entry_id"): str,
        vol.Required("device_id"): int,
    }
)
@websocket_api.async_response
async def _ws_get_device_power_state(
    hass: HomeAssistant, connection, msg: dict[str, Any]
) -> None:
    """Remote-card power button: live power state of one device.

    Unlike device/keymap this deliberately does hub I/O: the click flow
    reads the device row's live power_state byte via a fresh REQ_DEVICES
    burst, then the card fires the matching 198/199 power macro
    (docs/internal/device-mode-plan.md section 8).
    """

    hub = await runtime._async_resolve_hub_from_data(hass, {"entry_id": msg["entry_id"]})
    if hub is None:
        connection.send_error(msg["id"], "not_found", "Could not resolve Sofabaton hub")
        return

    if runtime._hub_is_busy(hass, hub):
        # Its REQ_DEVICES burst would land between an operation's page
        # writes; an unknown state makes the card fall back safely.
        connection.send_result(msg["id"], {"power_state": None})
        return
    power_state = await hub.async_get_device_power_state(int(msg["device_id"]))
    connection.send_result(msg["id"], {"power_state": power_state})


def _register_websocket_commands(hass: HomeAssistant) -> None:
    domain_data = hass.data.setdefault(DOMAIN, {})
    if domain_data.get("ws_registered"):
        return

    websocket_api.async_register_command(hass, _ws_get_command_config)
    websocket_api.async_register_command(hass, _ws_set_command_config)
    websocket_api.async_register_command(hass, _ws_get_command_sync_progress)
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

    if not hass.services.has_service(DOMAIN, "fetch_device_commands"):
        hass.services.async_register(DOMAIN, "fetch_device_commands", _async_handle_fetch_device_commands)
    if not hass.services.has_service(DOMAIN, "dump_ir_commands"):
        hass.services.async_register(
            DOMAIN,
            "dump_ir_commands",
            _async_handle_dump_ir_commands,
            supports_response=SupportsResponse.OPTIONAL,
        )
    if not hass.services.has_service(DOMAIN, "fetch_blob"):
        hass.services.async_register(
            DOMAIN,
            "fetch_blob",
            _async_handle_fetch_blob,
            supports_response=SupportsResponse.OPTIONAL,
        )
    if not hass.services.has_service(DOMAIN, "backup_bundle"):
        hass.services.async_register(
            DOMAIN,
            "backup_bundle",
            _async_handle_backup_bundle,
            supports_response=SupportsResponse.OPTIONAL,
        )
    if not hass.services.has_service(DOMAIN, "restore_backup"):
        hass.services.async_register(
            DOMAIN,
            "restore_backup",
            _async_handle_restore_backup,
            supports_response=SupportsResponse.OPTIONAL,
        )
    if not hass.services.has_service(DOMAIN, "play_ir_blob"):
        hass.services.async_register(DOMAIN, "play_ir_blob", _async_handle_play_ir_blob)
    if not hass.services.has_service(DOMAIN, "set_ir_learn_mode"):
        hass.services.async_register(DOMAIN, "set_ir_learn_mode", _async_handle_set_ir_learn_mode)
    if not hass.services.has_service(DOMAIN, "ir_learn_command"):
        hass.services.async_register(
            DOMAIN,
            "ir_learn_command",
            _async_handle_ir_learn_command,
            supports_response=SupportsResponse.OPTIONAL,
        )
    if not hass.services.has_service(DOMAIN, "persist_ir_blob"):
        hass.services.async_register(
            DOMAIN,
            "persist_ir_blob",
            _async_handle_persist_ir_blob,
            supports_response=SupportsResponse.OPTIONAL,
        )
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
    if not hass.services.has_service(DOMAIN, "export_snapshot"):
        hass.services.async_register(
            DOMAIN,
            "export_snapshot",
            _async_handle_export_snapshot,
            supports_response=SupportsResponse.OPTIONAL,
        )
    if not hass.services.has_service(DOMAIN, "sync_from_snapshot"):
        hass.services.async_register(
            DOMAIN,
            "sync_from_snapshot",
            _async_handle_sync_from_snapshot,
            supports_response=SupportsResponse.OPTIONAL,
        )

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
            hass.services.async_remove(DOMAIN, "fetch_device_commands")
            hass.services.async_remove(DOMAIN, "dump_ir_commands")
            hass.services.async_remove(DOMAIN, "fetch_blob")
            hass.services.async_remove(DOMAIN, "backup_bundle")
            hass.services.async_remove(DOMAIN, "restore_backup")
            hass.services.async_remove(DOMAIN, "play_ir_blob")
            hass.services.async_remove(DOMAIN, "set_ir_learn_mode")
            hass.services.async_remove(DOMAIN, "ir_learn_command")
            hass.services.async_remove(DOMAIN, "persist_ir_blob")
            hass.services.async_remove(DOMAIN, "create_wifi_device")
            hass.services.async_remove(DOMAIN, "device_to_activity")
            hass.services.async_remove(DOMAIN, "delete_device")
            hass.services.async_remove(DOMAIN, "command_to_favorite")
            hass.services.async_remove(DOMAIN, "get_favorites")
            hass.services.async_remove(DOMAIN, "reorder_favorites")
            hass.services.async_remove(DOMAIN, "delete_favorite")
            hass.services.async_remove(DOMAIN, "command_to_button")
            hass.services.async_remove(DOMAIN, "sync_command_config")
            hass.services.async_remove(DOMAIN, "export_snapshot")
            hass.services.async_remove(DOMAIN, "sync_from_snapshot")
            async_teardown_diagnostics(hass)
            if frontend_resources._get_lovelace_resource_mode(hass) == frontend_resources._LOVELACE_STORAGE_MODE:
                if hass.data[DOMAIN].get("storage_resources_registered"):
                    await frontend_resources._async_unregister_lovelace_resources(hass)
                hass.data[DOMAIN]["storage_resources_registered"] = False
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


@runtime._hub_write_service()
async def _async_handle_fetch_device_commands(call: ServiceCall):
    hass = call.hass
    hub = await runtime._async_resolve_hub_from_call(hass, call)
    if hub is None:
        raise ValueError("Could not resolve Sofabaton hub from service call")

    ent_id = call.data["ent_id"]
    await hub.async_fetch_device_commands(ent_id)


@runtime._hub_write_service(persist=False)
async def _async_handle_dump_ir_commands(call: ServiceCall):
    hass = call.hass
    hub = await runtime._async_resolve_hub_from_call(hass, call)
    if hub is None:
        raise ValueError("Could not resolve Sofabaton hub from service call")


    device_id = int(call.data["device_id"])
    if device_id < 1 or device_id > 255:
        raise ValueError("device_id must be between 1 and 255")

    raw_command_id = call.data.get("command_id")
    command_id: int | None = None
    if raw_command_id is not None:
        command_id = int(raw_command_id)
        if command_id < 1 or command_id > 255:
            raise ValueError("command_id must be between 1 and 255")

    result = await hub.async_dump_ir_commands(device_id=device_id, command_id=command_id)
    if result is None:
        if command_id is None:
            raise ValueError(f"Hub did not respond to IR dump request for device {device_id}")
        raise ValueError(
            f"Hub did not respond to IR dump request for device {device_id}, command {command_id}"
        )
    return result


@runtime._hub_write_service(persist=False)
async def _async_handle_fetch_blob(call: ServiceCall):
    hass = call.hass
    hub = await runtime._async_resolve_hub_from_call(hass, call)
    if hub is None:
        raise ValueError("Could not resolve Sofabaton hub from service call")


    device_id = int(call.data["device_id"])
    if device_id < 1 or device_id > 255:
        raise ValueError("device_id must be between 1 and 255")

    raw_command_id = call.data.get("command_id")
    command_id: int | None = None
    if raw_command_id is not None:
        command_id = int(raw_command_id)
        if command_id < 1 or command_id > 255:
            raise ValueError("command_id must be between 1 and 255")

    result = await hub.async_fetch_blob(device_id=device_id, command_id=command_id)
    if result is None:
        if command_id is None:
            raise ValueError(f"Hub did not respond to blob fetch request for device {device_id}")
        raise ValueError(
            f"Hub did not respond to blob fetch request for device {device_id}, command {command_id}"
        )
    return result


@runtime._hub_write_service(persist=False)
async def _async_handle_backup_bundle(call: ServiceCall):
    """Service handler for ``sofabaton_x1s.backup_bundle``.

    ``device_ids`` (optional list of 1..255 integers) selects a
    device-only bundle; omit it (or pass an empty list) to back up
    everything (all devices + all activities). The return is a
    ``hub_bundle`` payload (see :meth:`SofabatonHub.async_backup_hub`).
    """

    hass = call.hass
    hub = await runtime._async_resolve_hub_from_call(hass, call)
    if hub is None:
        raise ValueError("Could not resolve Sofabaton hub from service call")

    device_ids = _validate_backup_device_ids(call.data.get("device_ids"))
    return await hub.async_backup_hub(device_ids=device_ids)


@runtime._hub_write_service(persist=False)
async def _async_handle_restore_backup(call: ServiceCall):
    """Service handler for ``sofabaton_x1s.restore_backup``.

    Accepts a ``hub_bundle`` payload (schema_version 5). Devices in
    the bundle are restored first; activities are restored second,
    after the hub has been erased
    (see :meth:`SofabatonHub.async_erase_configuration`).
    """

    hass = call.hass
    hub = await runtime._async_resolve_hub_from_call(hass, call)
    if hub is None:
        raise ValueError("Could not resolve Sofabaton hub from service call")


    payload = call.data.get("backup")
    if not isinstance(payload, dict):
        raise ValueError(
            "backup must be an object payload returned by backup_bundle"
        )

    wifi_commands_request_port = runtime._resolve_roku_listen_port(hass, hub.entry_id)

    try:
        result = await hub.async_restore_backup(
            payload,
            wifi_commands_request_port=wifi_commands_request_port,
        )
    except ValueError as exc:
        raise HomeAssistantError(f"restore_backup validation failed: {exc}") from exc
    except Exception as exc:
        raise HomeAssistantError(f"restore_backup failed: {exc}") from exc
    if result is None:
        raise HomeAssistantError("Hub did not accept the restore transaction")
    return result


@runtime._hub_write_service(persist=False)
async def _async_handle_play_ir_blob(call: ServiceCall):
    hass = call.hass
    hub = await runtime._async_resolve_hub_from_call(hass, call)
    if hub is None:
        raise ValueError("Could not resolve Sofabaton hub from service call")


    blob_bytes = _parse_play_ir_blob_input(call.data.get("blob"))

    ok = await hub.async_play_ir_blob(blob_bytes)
    if not ok:
        raise HomeAssistantError("Hub is not ready to play IR blob (proxy client connected?)")


@runtime._hub_write_service(persist=False)
async def _async_handle_set_ir_learn_mode(call: ServiceCall):
    hass = call.hass
    hub = await runtime._async_resolve_hub_from_call(hass, call)
    if hub is None:
        raise ValueError("Could not resolve Sofabaton hub from service call")


    enabled = call.data.get("enabled")
    if not isinstance(enabled, bool):
        raise ValueError("enabled must be a boolean")

    ok = await hub.async_set_ir_learn_mode(enabled)
    if not ok:
        raise HomeAssistantError(
            "Hub did not accept the IR learn-mode toggle (proxy client connected?)"
        )


@runtime._hub_write_service(persist=False)
async def _async_handle_ir_learn_command(call: ServiceCall):
    hass = call.hass
    hub = await runtime._async_resolve_hub_from_call(hass, call)
    if hub is None:
        raise ValueError("Could not resolve Sofabaton hub from service call")


    timeout = call.data.get("timeout", 60)
    try:
        timeout = float(timeout)
    except (TypeError, ValueError) as exc:
        raise ValueError("timeout must be a number of seconds") from exc
    if timeout < 5 or timeout > 120:
        raise ValueError("timeout must be between 5 and 120 seconds")

    result = await hub.async_ir_learn_command(timeout=timeout)
    if result is None:
        raise HomeAssistantError(
            "Hub did not accept the IR learn-mode arm (proxy client connected?)"
        )
    return result


@runtime._hub_write_service()
async def _async_handle_persist_ir_blob(call: ServiceCall):
    hass = call.hass
    hub = await runtime._async_resolve_hub_from_call(hass, call)
    if hub is None:
        raise ValueError("Could not resolve Sofabaton hub from service call")


    device_id = int(call.data["device_id"])
    if device_id < 1 or device_id > 255:
        raise ValueError("device_id must be between 1 and 255")

    command_name = _validate_ir_command_name(call.data.get("command_name"))
    blob_bytes = _parse_play_ir_blob_input(call.data.get("blob"))

    result = await hub.async_persist_ir_blob(
        device_id=device_id,
        command_name=command_name,
        blob=blob_bytes,
    )
    if result is None:
        raise HomeAssistantError("Hub is not ready to persist IR blob (proxy client connected?)")
    return result


@runtime._hub_write_service()
async def _async_handle_create_wifi_device(call: ServiceCall):
    hass = call.hass
    hub = await runtime._async_resolve_hub_from_call(hass, call)
    if hub is None:
        raise ValueError("Could not resolve Sofabaton hub from service call")


    device_name = _validate_wifi_name_for_hub(hub, call.data.get("device_name", "Home Assistant"), field_name="device_name")
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
        _validate_wifi_name_for_hub(hub, command_name, field_name="commands entries")
        commands.append(command_name)

    max_command_id = len(commands)
    raw_power_on_command_id = call.data.get("power_on_command_id")
    raw_power_off_command_id = call.data.get("power_off_command_id")
    raw_input_command_ids = call.data.get("input_command_ids")
    power_on_command_id = normalize_power_command_id(
        raw_power_on_command_id,
        max_command_id=max_command_id,
    )
    power_off_command_id = normalize_power_command_id(
        raw_power_off_command_id,
        max_command_id=max_command_id,
    )
    if raw_power_on_command_id is not None and power_on_command_id is None:
        raise ValueError(f"power_on_command_id must be between 1 and {max_command_id}")
    if raw_power_off_command_id is not None and power_off_command_id is None:
        raise ValueError(f"power_off_command_id must be between 1 and {max_command_id}")
    input_command_ids = normalize_command_id_list(
        raw_input_command_ids,
        max_command_id=max_command_id,
    )
    if raw_input_command_ids is not None and input_command_ids is None:
        raise ValueError(f"input_command_ids entries must each be between 1 and {max_command_id}")

    request_port = runtime._resolve_roku_listen_port(hass, hub.entry_id)

    return await hub.async_create_wifi_device(
        device_name=device_name,
        commands=commands,
        request_port=request_port,
        power_on_command_id=power_on_command_id,
        power_off_command_id=power_off_command_id,
        input_command_ids=input_command_ids,
    )


@runtime._hub_write_service()
async def _async_handle_device_to_activity(call: ServiceCall):
    hass = call.hass
    hub = await runtime._async_resolve_hub_from_call(hass, call)
    if hub is None:
        raise ValueError("Could not resolve Sofabaton hub from service call")


    activity_id = int(call.data["activity_id"])
    device_id = int(call.data["device_id"])
    input_command_id: int | None = call.data.get("input_command_id")
    if input_command_id is not None:
        input_command_id = int(input_command_id)

    if activity_id < 1 or activity_id > 255:
        raise ValueError("activity_id must be between 1 and 255")
    if device_id < 1 or device_id > 255:
        raise ValueError("device_id must be between 1 and 255")

    return await hub.async_add_device_to_activity(
        activity_id=activity_id,
        device_id=device_id,
        input_cmd_id=input_command_id,
    )


@runtime._hub_write_service()
async def _async_handle_delete_device(call: ServiceCall):
    hass = call.hass
    hub = await runtime._async_resolve_hub_from_call(hass, call)
    if hub is None:
        raise ValueError("Could not resolve Sofabaton hub from service call")


    device_id = int(call.data["device_id"])
    if device_id < 1 or device_id > 255:
        raise ValueError("device_id must be between 1 and 255")

    return await hub.async_delete_device(device_id=device_id)


@runtime._hub_write_service()
async def _async_handle_command_to_favorite(call: ServiceCall):
    hass = call.hass
    hub = await runtime._async_resolve_hub_from_call(hass, call)
    if hub is None:
        raise ValueError("Could not resolve Sofabaton hub from service call")


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


@runtime._hub_write_service(persist=False)
async def _async_handle_get_favorites(call: ServiceCall):
    hass = call.hass
    hub = await runtime._async_resolve_hub_from_call(hass, call)
    if hub is None:
        raise ValueError("Could not resolve Sofabaton hub from service call")

    activity_id = int(call.data["activity_id"])
    if activity_id < 1 or activity_id > 255:
        raise ValueError("activity_id must be between 1 and 255")

    order = await hub.async_request_favorites_order(activity_id)
    if order is None:
        raise ValueError(f"Hub did not respond to favorites order request for activity {activity_id}")

    return {"favorites": hub.describe_favorites_order(activity_id, order)}


@runtime._hub_write_service()
async def _async_handle_reorder_favorites(call: ServiceCall):
    hass = call.hass
    hub = await runtime._async_resolve_hub_from_call(hass, call)
    if hub is None:
        raise ValueError("Could not resolve Sofabaton hub from service call")


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


@runtime._hub_write_service()
async def _async_handle_delete_favorite(call: ServiceCall):
    hass = call.hass
    hub = await runtime._async_resolve_hub_from_call(hass, call)
    if hub is None:
        raise ValueError("Could not resolve Sofabaton hub from service call")


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


@runtime._hub_write_service()
async def _async_handle_command_to_button(call: ServiceCall):
    hass = call.hass
    hub = await runtime._async_resolve_hub_from_call(hass, call)
    if hub is None:
        raise ValueError("Could not resolve Sofabaton hub from service call")


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


async def _async_pick_wifi_device_key(
    store: CommandConfigStore, entry_id: str, wifi_device: str, *, roku_listen_port: int
) -> str | None:
    """The record a sync_command_config call means (CR-X2-6).

    ``wifi_device`` names it as the Wifi Commands tab shows it. Without a
    name, a hub with one Wifi Device deploys that one, and a hub with
    several refuses instead of silently deploying the first.
    """

    records = [
        record
        for record in await store.async_list_hub_devices(entry_id, roku_listen_port=roku_listen_port)
        if not is_wifi_events_device_key(record.get("device_key"))
    ]
    names = sorted(str(record.get("device_name") or "") for record in records)
    if wifi_device:
        wanted = wifi_device.casefold()
        matches = [
            record for record in records
            if str(record.get("device_name") or "").strip().casefold() == wanted
        ]
        if len(matches) != 1:
            raise HomeAssistantError(
                f"No single Wifi Device is named {wifi_device!r} (Wifi Devices: {', '.join(names)})"
            )
        return str(matches[0].get("device_key") or "") or None
    if len(records) > 1:
        raise HomeAssistantError(
            "This hub has several Wifi Devices; name one with wifi_device "
            f"(Wifi Devices: {', '.join(names)})"
        )
    return None


@runtime._hub_write_service(persist=False)
async def _async_handle_sync_command_config(call: ServiceCall):
    hass = call.hass
    hub = await runtime._async_resolve_hub_from_call(hass, call)
    if hub is None:
        raise ValueError("Could not resolve Sofabaton hub from service call")

    store = await runtime._async_get_command_config_store(hass)
    device_key = str(call.data.get("device_key") or "").strip() or None
    roku_listen_port = runtime._resolve_roku_listen_port(hass, hub.entry_id)
    if device_key is None:
        device_key = await _async_pick_wifi_device_key(
            store,
            hub.entry_id,
            str(call.data.get("wifi_device") or "").strip(),
            roku_listen_port=roku_listen_port,
        )

    payload = await store.async_get_hub_config(
        hub.entry_id,
        device_key=device_key,
        roku_listen_port=roku_listen_port,
    )
    request_port = roku_listen_port
    device_name = str(call.data.get("device_name") or payload.get("device_name") or "Home Assistant").strip() or "Home Assistant"

    return await hub.async_sync_command_config(
        command_payload=payload,
        request_port=request_port,
        device_key=str(payload.get("device_key") or device_key or ""),
        device_name=device_name,
    )


async def _async_handle_export_snapshot(call: ServiceCall):
    """Service handler for ``sofabaton_x1s.export_snapshot``.

    Wraps :meth:`SofabatonHub.async_get_structural_bundle` — the exact
    projection the live Control Panel editor reads (WS command
    ``sofabaton_x1s/cache/structural_bundle``, see
    ``_ws_get_structural_bundle``). It is a pure read from the cached
    proxy state: no hub I/O and no per-command IR blob dump, so it is
    cheap enough to call before every ``sync_from_snapshot`` and safe to
    call while the vendor app owns the hub.

    Deliberately not ``backup_bundle``: that action always does a live
    round trip to the hub (and, for a whole-hub backup, dumps every
    command's IR blob) — see ``docs/protocol/write-flows.md``.
    ``export_snapshot`` only returns what the integration already has
    cached; open the Control Panel's Hub or Activities tab once (or run
    a whole-hub cache refresh) to populate the cache on a fresh install.

    Response is ``{bundle, generation}`` — the same shape the WS command
    sends. ``generation`` is the cache generation the snapshot was
    exported at; pass it back as ``sync_from_snapshot``'s
    ``expected_generation`` to refuse a stale baseline loudly.
    """

    hass = call.hass
    hub = await runtime._async_resolve_hub_from_call(hass, call)
    if hub is None:
        raise ValueError("Could not resolve Sofabaton hub from service call")

    store = await runtime._async_get_persistent_cache_store(hass)
    if not store.enabled:
        raise HomeAssistantError(
            "export_snapshot requires the persistent cache to be enabled "
            "(Sofabaton X1S integration options)."
        )

    bundle = await hub.async_get_structural_bundle()
    if not bundle:
        raise HomeAssistantError(
            "No cached structural snapshot is available yet. Open the "
            "Control Panel's Hub or Activities tab once (or run a "
            "whole-hub cache refresh) to populate it, then retry."
        )
    return {"bundle": bundle, "generation": hub.cache_generation}


async def _async_handle_sync_from_snapshot(call: ServiceCall):
    """Service handler for ``sofabaton_x1s.sync_from_snapshot``.

    Script-callable counterpart of the live Control Panel editor's save
    action. Accepts the same ``baseline``/``edited`` hub_bundle pair the
    WS ``activity/sync`` and ``device/sync`` commands accept (see
    ``_validate_entity_sync_inputs``), routes through the identical
    pre-write gauntlet (``_async_prepare_entity_sync``: busy guard, lock
    guard, payload validation, operation-registry bookkeeping) and the
    identical engine entry point (``_run_entity_sync_operation`` ->
    ``hub.async_sync_activity``/``async_sync_device`` ->
    ``ActivitySyncMixin.sync_activity``/``sync_device``) the WS handler
    uses — so paging, label-slot reuse, and ack tolerance all apply
    exactly as they do from the Control Panel.

    Typical flow: call ``export_snapshot`` to get a bundle, keep the
    ``generation`` it returns, edit the two POWER_ON/POWER_OFF steps for
    one device in the returned JSON, then call this with the untouched
    export as ``baseline``, the edited copy as ``edited``, and that
    generation as ``expected_generation`` — the sync then refuses loudly
    if the hub cache has moved since the export instead of failing later
    (or writing against a rebased diff).
    """

    hass = call.hass
    hub = await runtime._async_resolve_hub_from_call(hass, call)
    if hub is None:
        raise ValueError("Could not resolve Sofabaton hub from service call")

    entity_kind = str(call.data.get("entity_kind") or "").strip().lower()
    if entity_kind not in ("activity", "device"):
        raise ValueError("entity_kind must be 'activity' or 'device'")

    baseline = call.data.get("baseline")
    edited = call.data.get("edited")
    if not isinstance(baseline, dict) or not isinstance(edited, dict):
        raise ValueError("baseline and edited must be hub_bundle objects")

    raw_generation = call.data.get("expected_generation")
    expected_generation: int | None = None
    if raw_generation is not None:
        try:
            expected_generation = int(raw_generation)
        except (TypeError, ValueError) as exc:
            raise ValueError("expected_generation must be an integer") from exc

    sync_input = {
        "baseline": baseline,
        "edited": edited,
        f"{entity_kind}_id": call.data.get("entity_id"),
    }

    try:
        operation_id, baseline, edited, entity_id = await entity_sync._async_prepare_entity_sync(
            hass,
            hub=hub,
            entity_kind=entity_kind,
            sync_input=sync_input,
            operation_label=f"sync_from_snapshot[{entity_kind}]",
            expected_generation=expected_generation,
        )
    except entity_sync._EntitySyncRejected as err:
        raise HomeAssistantError(str(err)) from err

    result = await entity_sync._run_entity_sync_operation(
        hass,
        operation_id,
        hub=hub,
        baseline=baseline,
        edited=edited,
        entity_kind=entity_kind,
        entity_id=entity_id,
    )
    if isinstance(result, dict) and str(result.get("status") or "") == "failed":
        raise HomeAssistantError(str(result.get("message") or "Sync failed"))
    return result


