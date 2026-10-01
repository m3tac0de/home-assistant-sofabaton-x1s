"""Live editor WS commands (R6, CR-H2-13).

Activity and device sync, delete, reorder and create, the sync plans, the
whole-cache refresh, the structural bundle, and the device keymap and
power state the remote card reads.
"""

from __future__ import annotations

import logging
import re
from typing import Any

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.dispatcher import async_dispatcher_send

from .const import (
    DOMAIN,
    signal_command_sync,
)
from .hub import SofabatonHub
from .command_config import (
    WIFI_EVENTS_DEVICE_KEY,
)
from .lib.activity_sync import build_activity_sync_plan, build_device_sync_plan
from .lib.bundle_validation import validate_new_entity_name
from .lib.device_class_profiles import MAX_DEVICE_NAME_LEN, supported_create_classes
from .lib.protocol_const import normalize_device_class
from . import operations
from . import runtime
from . import entity_sync
from .ws_wifi import (
    _async_wifi_listener_needed,
)

# Same logger name as the package: log lines keep their source name.
_LOGGER = logging.getLogger(__package__)


def _new_entity_name_storable(hub: SofabatonHub, name: str) -> bool:
    """A new activity/device name the hub stores as given (CR-X4-2)."""

    try:
        validate_new_entity_name(name, hub_version=_hub_model_for_names(hub))
    except ValueError:
        return False
    return True


# The hub's own name: printable ASCII without the backslash, at most 30
# characters. That is what the official app's rename field accepts for
# every hub model, and the name also travels in the hub's mDNS TXT record
# and its discovery banner, where only 7-bit text is safe. The hub itself
# stores other bytes when sent (bench 2026-09-30), so the rule is ours.
_HUB_NAME_RE = re.compile(r"^[ -\[\]-~]{1,30}$")


def _hub_name_storable(hub: SofabatonHub, name: str) -> bool:
    """A hub name every hub model, the app and mDNS carry unchanged."""

    return bool(_HUB_NAME_RE.match(name))


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
        vol.Required("type"): f"{DOMAIN}/hub/rename",
        vol.Required("entry_id"): str,
        vol.Required("name"): str,
    }
)
@websocket_api.async_response
@runtime._hub_write_ws()
async def _ws_hub_rename(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    """Rename the hub (Settings tab pencil): the same wire write a
    replace-mode restore makes, followed by the identity refresh (mDNS
    name, config entry data, device registry name)."""

    name = str(msg["name"]).strip()
    if not name or len(name) > 30:
        connection.send_error(msg["id"], "invalid_name", "Hub name must be 1-30 characters")
        return

    hub = await _resolve_hub_for_activity_write(hass, connection, msg, op_name="_ws_hub_rename")
    if hub is None:
        return
    if not _hub_name_storable(hub, name):
        connection.send_error(msg["id"], "invalid_name", "The hub cannot store this hub name")
        return

    ok = await hub.async_set_hub_name(name)
    if not ok:
        connection.send_error(msg["id"], "rename_failed", "The hub did not confirm the new name")
        return
    connection.send_result(msg["id"], {"status": "success", "name": str(getattr(hub, "name", name) or name)})


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
