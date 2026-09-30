"""Wifi Commands WS commands (R6, CR-H2-13).

Command config and sync progress, the command devices, Wifi Events, hub
event actions, the press and hub-event subscriptions, and the Wifi name
rules they validate against.
"""

from __future__ import annotations

import logging
import unicodedata
from typing import Any

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import config_validation as cv
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.dispatcher import async_dispatcher_connect

from .const import (
    DOMAIN,
    signal_hub_events,
    signal_ip_commands,
)
from .hub import SofabatonHub
from .command_config import (
    CommandConfigStore,
    MAX_WIFI_DEVICES,
    WIFI_EVENTS_DEVICE_KEY,
    count_configured_command_slots,
    is_wifi_events_device_key,
    normalize_activity_event_actions,
    normalize_hub_event_actions,
    normalize_wifi_transport,
    WIFI_TRANSPORT_MQTT,
    wifi_device_requires_listener,
)
from . import runtime

# Same logger name as the package: log lines keep their source name.
_LOGGER = logging.getLogger(__package__)


# The characters a Wifi Device, command or event name may hold: the card's
# rule (\p{L}\p{N}\p{M} plus ASCII punctuation on X1S/X2, A-Z a-z 0-9 and
# space on the X1). Combining marks count, or Thai and Hindi names lose
# their vowel signs (CR-X4-1).
_WIFI_NAME_PUNCTUATION = frozenset(" !\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~")


_WIFI_NAME_MAX_LEN = 20


def _hub_supports_unicode_wifi_names(hub: SofabatonHub) -> bool:
    version = str(getattr(hub, "version", "") or "").upper()
    return "X1S" in version or "X2" in version


def _wifi_name_char_allowed(ch: str, *, unicode_names: bool) -> bool:
    if unicode_names:
        return unicodedata.category(ch)[0] in "LNM" or ch in _WIFI_NAME_PUNCTUATION
    return ch.isascii() and (ch.isalnum() or ch == " ")


def _validate_wifi_name_for_hub(hub: SofabatonHub, value: Any, *, field_name: str = "device_name") -> str:
    """The name as given (cut to the hub's 20 characters), or ValueError.

    A character outside the rule refuses the name instead of being dropped
    from it: a silently shortened word is a misspelled one.
    """

    raw = str(value or "").strip()
    if not raw:
        raise ValueError(f"{field_name} is required")
    unicode_names = _hub_supports_unicode_wifi_names(hub)
    if not all(_wifi_name_char_allowed(ch, unicode_names=unicode_names) for ch in raw):
        if unicode_names:
            raise ValueError(
                f"{field_name} must contain only letters (including accented/umlaut), numbers, spaces, and punctuation"
            )
        raise ValueError(f"{field_name} must contain only letters, numbers, and spaces")
    return raw[:_WIFI_NAME_MAX_LEN].strip()


def _build_wifi_device_sync_payload(
    hub: SofabatonHub,
    config_payload: dict[str, Any],
    *,
    device_key: str,
) -> dict[str, Any]:
    commands_hash = str(config_payload.get("commands_hash") or "")
    deployed_commands_hash = str(config_payload.get("deployed_commands_hash") or "")
    deployed_device_id = config_payload.get("deployed_device_id")
    managed_hashes = hub.get_managed_command_hashes()
    progress = hub.get_command_sync_progress(device_key)
    progress_hash = str(progress.get("commands_hash") or "")
    configured_slots = count_configured_command_slots(config_payload.get("commands"))
    has_deployed_device = isinstance(deployed_device_id, int)
    sync_needed = (
        (configured_slots > 0 and bool(commands_hash) and commands_hash != deployed_commands_hash)
        or (configured_slots == 0 and (has_deployed_device or bool(deployed_commands_hash)))
    )
    if (
        commands_hash
        and str(progress.get("status") or "") == "success"
        and progress_hash == commands_hash
        and (has_deployed_device or bool(deployed_commands_hash))
    ):
        sync_needed = False
    return {
        **progress,
        "device_key": device_key,
        "commands_hash": commands_hash,
        "deployed_commands_hash": deployed_commands_hash,
        "managed_command_hashes": managed_hashes,
        "configured_slot_count": configured_slots,
        "has_managed_device": has_deployed_device or bool(deployed_commands_hash),
        "sync_needed": sync_needed,
    }


async def _async_wifi_listener_needed(hass: HomeAssistant, entry_id: str) -> bool:
    store = await runtime._async_get_command_config_store(hass)
    roku_listen_port = runtime._resolve_roku_listen_port(hass, entry_id)
    devices = await store.async_list_hub_devices(entry_id, roku_listen_port=roku_listen_port)
    return any(wifi_device_requires_listener(device) for device in devices)


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/command_config/get",
        vol.Optional("entity_id"): cv.entity_id,
        vol.Optional("entry_id"): str,
        vol.Optional("device_key"): str,
    }
)
@websocket_api.async_response
async def _ws_get_command_config(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    hub = await runtime._async_resolve_hub_from_data(hass, runtime._ws_hub_selector(msg))
    if hub is None:
        connection.send_error(msg["id"], "not_found", "Could not resolve Sofabaton hub")
        return

    store = await runtime._async_get_command_config_store(hass)
    roku_listen_port = runtime._resolve_roku_listen_port(hass, hub.entry_id)
    try:
        payload = await store.async_get_hub_config(
            hub.entry_id,
            device_key=msg.get("device_key"),
            roku_listen_port=roku_listen_port,
        )
    except KeyError:
        connection.send_error(msg["id"], "not_found", "Could not resolve Wifi Device")
        return
    payload["mqtt_available"] = _hub_mqtt_available(hass, hub)
    connection.send_result(msg["id"], payload)


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/command_config/set",
        vol.Optional("entity_id"): cv.entity_id,
        vol.Optional("entry_id"): str,
        vol.Required("commands"): list,
        vol.Optional("device_key"): str,
        vol.Optional("power_on_command_id"): int,
        vol.Optional("power_off_command_id"): int,
    }
)
@websocket_api.async_response
async def _ws_set_command_config(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    hub = await runtime._async_resolve_hub_from_data(hass, runtime._ws_hub_selector(msg))
    if hub is None:
        connection.send_error(msg["id"], "not_found", "Could not resolve Sofabaton hub")
        return
    if is_wifi_events_device_key(msg.get("device_key")):
        # The Wifi Events record is mutated only through the narrow
        # wifi_event/* endpoints — a wholesale slot-list write could
        # corrupt slot order (callback URLs embed slot indices).
        connection.send_error(msg["id"], "reserved_device", "Use the wifi_event endpoints for the Wifi Events device")
        return

    store = await runtime._async_get_command_config_store(hass)
    roku_listen_port = runtime._resolve_roku_listen_port(hass, hub.entry_id)

    # Snapshot the names of every referenced activity as the user saw them.
    # Deploy-time validation compares this snapshot against a fresh hub read
    # to catch hub-side id reuse (delete + recreate) between save and sync.
    referenced_activity_keys: set[str] = set()
    for slot in msg["commands"]:
        if not isinstance(slot, dict):
            continue
        # Mirror the deploy-side rule: a slot's activities list only counts
        # for favorites and hard-button bindings (orphaned lists are ignored).
        slot_activities_active = bool(slot.get("add_as_favorite")) or bool(
            str(slot.get("hard_button") or "").strip()
        )
        raw_activities = slot.get("activities")
        if slot_activities_active and isinstance(raw_activities, list):
            referenced_activity_keys.update(
                str(act) for act in raw_activities if str(act).strip()
            )
        raw_input_activity_id = str(slot.get("input_activity_id") or "").strip()
        if raw_input_activity_id:
            referenced_activity_keys.add(raw_input_activity_id)
    activity_labels: dict[str, str] = {}
    for activity_key in referenced_activity_keys:
        try:
            activity_id = int(activity_key)
        except (TypeError, ValueError):
            continue
        entry = hub.activities.get(activity_id)
        if isinstance(entry, dict):
            name = str(entry.get("name") or "").strip()
            if name:
                activity_labels[activity_key] = name

    payload = await store.async_set_hub_commands(
        hub.entry_id,
        msg["commands"],
        device_key=msg.get("device_key"),
        roku_listen_port=roku_listen_port,
        power_on_command_id=msg.get("power_on_command_id"),
        power_off_command_id=msg.get("power_off_command_id"),
        activity_labels=activity_labels,
    )
    connection.send_result(msg["id"], payload)


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/hub_event_actions/get",
        vol.Optional("entity_id"): cv.entity_id,
        vol.Optional("entry_id"): str,
    }
)
@websocket_api.async_response
async def _ws_get_hub_event_actions(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    hub = await runtime._async_resolve_hub_from_data(hass, runtime._ws_hub_selector(msg))
    if hub is None:
        connection.send_error(msg["id"], "not_found", "Could not resolve Sofabaton hub")
        return

    store = await runtime._async_get_command_config_store(hass)
    connection.send_result(
        msg["id"],
        {
            "actions": store.get_hub_event_actions(hub.entry_id),
            "activity_actions": store.get_activity_event_actions(hub.entry_id),
        },
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/hub_event_actions/set",
        vol.Optional("entity_id"): cv.entity_id,
        vol.Optional("entry_id"): str,
        vol.Required("actions"): dict,
        vol.Optional("activity_actions"): dict,
    }
)
@websocket_api.async_response
async def _ws_set_hub_event_actions(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    hub = await runtime._async_resolve_hub_from_data(hass, runtime._ws_hub_selector(msg))
    if hub is None:
        connection.send_error(msg["id"], "not_found", "Could not resolve Sofabaton hub")
        return

    store = await runtime._async_get_command_config_store(hass)
    actions = await store.async_set_hub_event_actions(
        hub.entry_id, normalize_hub_event_actions(msg["actions"])
    )
    if "activity_actions" in msg:
        activity_actions = normalize_activity_event_actions(msg["activity_actions"])
        if hub.activities_ready and hub.activities:
            # Ids the hub no longer knows never make it into the store; the
            # burst-time prune covers ids that disappear later.
            valid = {str(int(act_id)) for act_id in hub.activities}
            activity_actions = {
                key: entry
                for key, entry in activity_actions.items()
                if key in valid
            }
        activity_actions = await store.async_set_activity_event_actions(
            hub.entry_id, activity_actions
        )
    else:
        activity_actions = store.get_activity_event_actions(hub.entry_id)
    connection.send_result(
        msg["id"], {"actions": actions, "activity_actions": activity_actions}
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/command_sync/progress",
        vol.Optional("entity_id"): cv.entity_id,
        vol.Optional("entry_id"): str,
        vol.Optional("device_key"): str,
    }
)
@websocket_api.async_response
async def _ws_get_command_sync_progress(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    hub = await runtime._async_resolve_hub_from_data(hass, runtime._ws_hub_selector(msg))
    if hub is None:
        connection.send_error(msg["id"], "not_found", "Could not resolve Sofabaton hub")
        return

    store = await runtime._async_get_command_config_store(hass)
    roku_listen_port = runtime._resolve_roku_listen_port(hass, hub.entry_id)
    device_key = str(msg.get("device_key") or "").strip()
    try:
        payload = await store.async_get_hub_config(
            hub.entry_id,
            device_key=device_key or None,
            roku_listen_port=roku_listen_port,
        )
    except KeyError:
        connection.send_error(msg["id"], "not_found", "Could not resolve Wifi Device")
        return
    connection.send_result(
        msg["id"],
        _build_wifi_device_sync_payload(hub, payload, device_key=str(payload.get("device_key") or device_key or "")),
    )


def _hub_mqtt_available(hass: HomeAssistant, hub: Any) -> bool:
    """Whether the create flow may offer the MQTT transport for this hub.

    Delegates to the hub (X2 + MQTT integration loaded + a REAL hub MAC
    known — manually-added hubs carry a synthetic MAC until mDNS
    identifies them, and the press topic needs the real one). Whether
    the hub actually reaches a broker stays unknowable (F7) and is the
    user's responsibility.
    """

    del hass  # the hub checks its own hass reference
    checker = getattr(hub, "wifi_mqtt_available", None)
    if not callable(checker):
        return False
    return bool(checker())


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/command_devices/list",
        vol.Optional("entity_id"): cv.entity_id,
        vol.Optional("entry_id"): str,
    }
)
@websocket_api.async_response
async def _ws_list_command_devices(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    hub = await runtime._async_resolve_hub_from_data(hass, runtime._ws_hub_selector(msg))
    if hub is None:
        connection.send_error(msg["id"], "not_found", "Could not resolve Sofabaton hub")
        return

    store = await runtime._async_get_command_config_store(hass)
    roku_listen_port = runtime._resolve_roku_listen_port(hass, hub.entry_id)
    devices = await store.async_list_hub_devices(hub.entry_id, roku_listen_port=roku_listen_port)
    payload = []
    for device in devices:
        device_key = str(device.get("device_key") or "")
        # Presentation-layer filter ONLY (never in the store): the reserved
        # Wifi Events record has its own UI (activity editor + Events tab)
        # and must not appear in the Wifi Devices list. max_devices already
        # matches — the store cap counts user devices only.
        if is_wifi_events_device_key(device_key):
            continue
        payload.append({
            **device,
            **_build_wifi_device_sync_payload(hub, device, device_key=device_key),
        })
    connection.send_result(
        msg["id"],
        {
            "devices": payload,
            "max_devices": MAX_WIFI_DEVICES,
            "mqtt_available": _hub_mqtt_available(hass, hub),
        },
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/command_device/create",
        vol.Optional("entity_id"): cv.entity_id,
        vol.Optional("entry_id"): str,
        vol.Required("device_name"): str,
        vol.Optional("transport"): str,
    }
)
@websocket_api.async_response
async def _ws_create_command_device(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    hub = await runtime._async_resolve_hub_from_data(hass, runtime._ws_hub_selector(msg))
    if hub is None:
        connection.send_error(msg["id"], "not_found", "Could not resolve Sofabaton hub")
        return
    try:
        device_name = _validate_wifi_name_for_hub(hub, msg.get("device_name"), field_name="device_name")
    except ValueError as err:
        connection.send_error(msg["id"], "invalid_format", str(err))
        return
    requested_transport = normalize_wifi_transport(msg.get("transport"))
    if requested_transport == WIFI_TRANSPORT_MQTT and not _hub_mqtt_available(hass, hub):
        connection.send_error(
            msg["id"],
            "mqtt_unavailable",
            "MQTT transport needs an X2 hub and the MQTT integration",
        )
        return
    store = await runtime._async_get_command_config_store(hass)
    roku_listen_port = runtime._resolve_roku_listen_port(hass, hub.entry_id)
    try:
        payload = await store.async_create_hub_device(
            hub.entry_id,
            device_name,
            roku_listen_port=roku_listen_port,
        )
    except ValueError as err:
        connection.send_error(msg["id"], "invalid_format", str(err))
        return
    if requested_transport == WIFI_TRANSPORT_MQTT:
        await store.async_set_requested_transport(
            hub.entry_id, str(payload.get("device_key") or ""), requested_transport
        )
        payload = dict(payload)
        payload["requested_transport"] = requested_transport
    connection.send_result(msg["id"], payload)


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/command_device/delete",
        vol.Optional("entity_id"): cv.entity_id,
        vol.Optional("entry_id"): str,
        vol.Required("device_key"): str,
    }
)
@websocket_api.async_response
@runtime._hub_write_ws()
async def _ws_delete_command_device(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    hub = await runtime._async_resolve_hub_from_data(hass, runtime._ws_hub_selector(msg))
    if hub is None:
        connection.send_error(msg["id"], "not_found", "Could not resolve Sofabaton hub")
        return
    if is_wifi_events_device_key(msg.get("device_key")):
        # The Wifi Events device is removed automatically when its last
        # event is deleted (zero-slot sync) — never through this endpoint.
        connection.send_error(msg["id"], "reserved_device", "The Wifi Events device cannot be deleted here")
        return
    store = await runtime._async_get_command_config_store(hass)
    roku_listen_port = runtime._resolve_roku_listen_port(hass, hub.entry_id)
    try:
        payload = await store.async_get_hub_config(
            hub.entry_id,
            device_key=msg["device_key"],
            roku_listen_port=roku_listen_port,
        )
    except KeyError:
        connection.send_error(msg["id"], "not_found", "Could not resolve Wifi Device")
        return

    deleted_hub_device = False
    deployed_device_id = payload.get("deployed_device_id")
    deployed_commands_hash = str(payload.get("deployed_commands_hash") or "").strip()
    if isinstance(deployed_device_id, int):
        result = await hub.async_delete_device(deployed_device_id)
        deleted_hub_device = bool(result)
    if not deleted_hub_device:
        try:
            snapshot = await hub._async_refresh_devices_snapshot()
        except TimeoutError as err:
            connection.send_error(msg["id"], "timeout", str(err))
            return
        stored_devices = await store.async_list_hub_devices(hub.entry_id, roku_listen_port=roku_listen_port)
        matches, ambiguous = hub._match_managed_wifi_devices(
            managed_devices=hub._managed_wifi_devices(snapshot),
            stored_devices=stored_devices,
            device_key=msg["device_key"],
            deployed_device_id=deployed_device_id,
            deployed_commands_hash=deployed_commands_hash,
            commands_hash=str(payload.get("commands_hash") or ""),
        )
        if ambiguous:
            connection.send_error(
                msg["id"],
                "ambiguous",
                "Could not safely identify existing Wifi Device on hub",
            )
            return
        if not matches and isinstance(deployed_device_id, int):
            # The first delete landed although it reported no success.
            deleted_hub_device = True
        for managed_device_id, _managed_key, _managed_hash, _brand in matches:
            result = await hub.async_delete_device(managed_device_id)
            deleted_hub_device = bool(result)
            if deleted_hub_device:
                break
        if matches and not deleted_hub_device:
            # The device is still on the hub: keep the record so its presses
            # still resolve and the user can retry the delete.
            connection.send_error(
                msg["id"],
                "delete_failed",
                "The hub did not confirm deletion of the Wifi Device",
            )
            return
    deleted_config = await store.async_delete_hub_device(hub.entry_id, msg["device_key"])
    if (
        hub.roku_server_enabled
        and (deleted_hub_device or not wifi_device_requires_listener(payload))
        and not await _async_wifi_listener_needed(hass, hub.entry_id)
    ):
        await hub.async_set_roku_server_enabled(False)
    await hub.async_update_wifi_mqtt_ingress()
    connection.send_result(msg["id"], {"deleted_config": deleted_config, "deleted_hub_device": deleted_hub_device})


# ── Wifi Events WS endpoints (docs/internal/wifi-events-plan.md §4/§5) ──
#
# The narrow mutation surface for the reserved `haevents` record. Creating
# an event only stages it in the store; the deploy is deferred to the
# activity editor's Sync press (W7), and delete deploys the reset at once.


def _wifi_events_state_payload(
    hass: HomeAssistant, store: CommandConfigStore, entry_id: str
) -> dict[str, Any]:
    """Events plus record-level sync state (W7: the frontend defers all
    deploys to the Sync press and needs to know whether phase 1 — the
    events-record deploy — is required).

    ``record_needs_sync`` compares the record's live hash against its
    deployed hash; because the listen port is hashed
    (``compute_commands_hash``), it MUST be computed against the entry's
    resolved port — the default would flag every non-default-port hub as
    permanently needing a sync and trip a spurious phase-1 deploy on every
    activity Sync.
    """

    record_state = store.wifi_events_record_state(
        entry_id, roku_listen_port=runtime._resolve_roku_listen_port(hass, entry_id)
    )
    return {
        "events": store.list_wifi_events(entry_id),
        "record_needs_sync": bool(record_state.get("record_needs_sync")),
        "device_id": record_state.get("device_id"),
    }


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/wifi_event/list",
        vol.Optional("entity_id"): cv.entity_id,
        vol.Optional("entry_id"): str,
    }
)
@websocket_api.async_response
async def _ws_list_wifi_events(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    hub = await runtime._async_resolve_hub_from_data(hass, runtime._ws_hub_selector(msg))
    if hub is None:
        connection.send_error(msg["id"], "not_found", "Could not resolve Sofabaton hub")
        return
    store = await runtime._async_get_command_config_store(hass)
    connection.send_result(msg["id"], _wifi_events_state_payload(hass, store, hub.entry_id))


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/wifi_event/create",
        vol.Optional("entity_id"): cv.entity_id,
        vol.Optional("entry_id"): str,
        vol.Required("name"): str,
    }
)
@websocket_api.async_response
async def _ws_create_wifi_event(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    hub = await runtime._async_resolve_hub_from_data(hass, runtime._ws_hub_selector(msg))
    if hub is None:
        connection.send_error(msg["id"], "not_found", "Could not resolve Sofabaton hub")
        return
    try:
        name = _validate_wifi_name_for_hub(hub, msg.get("name"), field_name="name")
    except ValueError as err:
        connection.send_error(msg["id"], "invalid_format", str(err))
        return
    store = await runtime._async_get_command_config_store(hass)
    try:
        allocated = await store.async_allocate_wifi_event(hub.entry_id, name)
    except ValueError as err:
        code = str(err)
        messages = {
            "wifi_events_full": "All Wifi Event slots are in use",
            "wifi_events_pending_delete": (
                "A deleted Wifi Event is still being removed from the hub; "
                "sync the hub, then try again"
            ),
            "duplicate_name": "A Wifi Event with this name already exists",
            "empty_name": "name is required",
        }
        connection.send_error(msg["id"], code, messages.get(code, code))
        return

    # W7 full deferral: creation is a pure store allocation — NOTHING is
    # deployed here. The activity editor's Sync press runs the events-record
    # deploy as phase 1 (frontend orchestrates via wifi_event/sync) before
    # the activity writes. command_id is already law-derived (slot + 1);
    # device_id is the deployed id when the device exists, else None (the
    # frontend inserts a placeholder ref and rewrites it after phase 1).
    state = _wifi_events_state_payload(hass, store, hub.entry_id)
    connection.send_result(
        msg["id"],
        {
            "event": {**allocated, "device_id": state.get("device_id")},
            **state,
        },
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/wifi_event/delete",
        vol.Optional("entity_id"): cv.entity_id,
        vol.Optional("entry_id"): str,
        vol.Required("slot_index"): int,
    }
)
@websocket_api.async_response
@runtime._hub_write_ws(persist=False)
async def _ws_delete_wifi_event(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    hub = await runtime._async_resolve_hub_from_data(hass, runtime._ws_hub_selector(msg))
    if hub is None:
        connection.send_error(msg["id"], "not_found", "Could not resolve Sofabaton hub")
        return
    store = await runtime._async_get_command_config_store(hass)
    # Reset-in-place — never compacts (callback URLs embed slot indices).
    deleted = await store.async_reset_wifi_event_slot(hub.entry_id, msg["slot_index"])
    if not deleted:
        connection.send_error(msg["id"], "not_found", "No Wifi Event at this slot")
        return

    # Deploy the reset. Full-table writes mean a freed slot re-labels to
    # its "Command N" placeholder in place (slot indices stable); the LAST
    # event freed drops configured_slots to 0 and the existing zero-slot
    # branch removes the hub device + disables the listener only when
    # nothing else needs it. On failure the reset stays staged (sync
    # re-offers).
    roku_listen_port = runtime._resolve_roku_listen_port(hass, hub.entry_id)
    payload = await store.async_get_hub_config(
        hub.entry_id,
        device_key=WIFI_EVENTS_DEVICE_KEY,
        roku_listen_port=roku_listen_port,
    )
    try:
        result = await hub.async_sync_command_config(
            command_payload=payload,
            request_port=roku_listen_port,
            device_key=WIFI_EVENTS_DEVICE_KEY,
            device_name=str(payload.get("device_name") or ""),
        )
    except HomeAssistantError as err:
        message = str(err)
        code = "sync_in_progress" if "sync_in_progress" in message else "sync_failed"
        connection.send_error(msg["id"], code, message)
        return

    # Last event gone and the hub device removed -> drop the store record
    # too (user decision 2, plan §10). The listener guard already ran
    # inside the zero-slot branch (the device delete cascades all refs).
    if (
        int(payload.get("configured_slot_count") or 0) == 0
        and isinstance(result, dict)
        and result.get("wifi_device_id") is None
    ):
        await store.async_delete_hub_device(hub.entry_id, WIFI_EVENTS_DEVICE_KEY)
    elif isinstance(result, dict) and isinstance(result.get("wifi_device_id"), int):
        # The sync re-labeled the freed slot's records to placeholders
        # (full-table invariant keeps slot ids stable) — but references on
        # the hub only cascade on a REAL record delete. Delete the freed
        # short + long records so favorites/bindings/macro-steps that
        # pointed at the event are cleaned up (the confirm dialog promises
        # exactly this). Best-effort: on failure the placeholders keep the
        # stale refs firing no-op callbacks until the next full replace.
        try:
            slot_count = int(payload.get("slot_count") or 10)
            short_id = int(msg["slot_index"]) + 1
            await hub.async_delete_wifi_event_records(
                device_id=int(result["wifi_device_id"]),
                command_ids=[short_id, short_id + slot_count],
            )
        except Exception:  # pragma: no cover - cascade is best-effort
            _LOGGER.exception("[wifi_events] freed-slot record delete failed")
    connection.send_result(msg["id"], _wifi_events_state_payload(hass, store, hub.entry_id))


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/wifi_event/sync",
        vol.Optional("entity_id"): cv.entity_id,
        vol.Optional("entry_id"): str,
    }
)
@websocket_api.async_response
@runtime._hub_write_ws(persist=False)
async def _ws_sync_wifi_events(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    """Retry the Wifi Events deploy without changing the store — the
    needs-sync affordance for a slot whose create/delete deploy failed."""

    hub = await runtime._async_resolve_hub_from_data(hass, runtime._ws_hub_selector(msg))
    if hub is None:
        connection.send_error(msg["id"], "not_found", "Could not resolve Sofabaton hub")
        return
    store = await runtime._async_get_command_config_store(hass)
    roku_listen_port = runtime._resolve_roku_listen_port(hass, hub.entry_id)
    try:
        payload = await store.async_get_hub_config(
            hub.entry_id,
            device_key=WIFI_EVENTS_DEVICE_KEY,
            roku_listen_port=roku_listen_port,
        )
    except KeyError:
        connection.send_error(msg["id"], "not_found", "No Wifi Events device")
        return
    try:
        await hub.async_sync_command_config(
            command_payload=payload,
            request_port=roku_listen_port,
            device_key=WIFI_EVENTS_DEVICE_KEY,
            device_name=str(payload.get("device_name") or ""),
        )
    except HomeAssistantError as err:
        message = str(err)
        code = "sync_in_progress" if "sync_in_progress" in message else "sync_failed"
        connection.send_error(msg["id"], code, message)
        return
    connection.send_result(msg["id"], _wifi_events_state_payload(hass, store, hub.entry_id))


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/wifi_event/clear_all",
        vol.Optional("entity_id"): cv.entity_id,
        vol.Optional("entry_id"): str,
    }
)
@websocket_api.async_response
async def _ws_clear_all_wifi_events(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    """Drop the entire HA-side Wifi Events configuration, record included.

    The Events tab offers this only in the orphaned state: the hub-side
    device was deleted out-of-band (an app re-sync purge) and the deployed
    ownership was cleared by the reconcile pass, so there is nothing left
    on the hub to clean up. Guarded on that state; a record that still
    owns a deployed device must keep its config (the staged slots are what
    the callback runtime reads).
    """

    hub = await runtime._async_resolve_hub_from_data(hass, runtime._ws_hub_selector(msg))
    if hub is None:
        connection.send_error(msg["id"], "not_found", "Could not resolve Sofabaton hub")
        return
    store = await runtime._async_get_command_config_store(hass)
    record_state = store.wifi_events_record_state(
        hub.entry_id, roku_listen_port=runtime._resolve_roku_listen_port(hass, hub.entry_id)
    )
    if record_state.get("device_id") is not None:
        connection.send_error(
            msg["id"],
            "still_deployed",
            "The Wifi Events device is still deployed on the hub",
        )
        return
    # Whole-record delete mirrors the last-event branch of wifi_event/delete
    # (plan §10): the next event create re-creates a fresh record.
    await store.async_delete_hub_device(hub.entry_id, WIFI_EVENTS_DEVICE_KEY)
    connection.send_result(msg["id"], _wifi_events_state_payload(hass, store, hub.entry_id))


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/wifi_event/set_action",
        vol.Optional("entity_id"): cv.entity_id,
        vol.Optional("entry_id"): str,
        vol.Required("slot_index"): int,
        vol.Required("press_type"): vol.In(["short", "long"]),
        vol.Required("action"): dict,
    }
)
@websocket_api.async_response
async def _ws_set_wifi_event_action(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    hub = await runtime._async_resolve_hub_from_data(hass, runtime._ws_hub_selector(msg))
    if hub is None:
        connection.send_error(msg["id"], "not_found", "Could not resolve Sofabaton hub")
        return
    store = await runtime._async_get_command_config_store(hass)
    # No re-deploy: the callback runtime reads the staged slot.
    updated = await store.async_set_wifi_event_action(
        hub.entry_id, msg["slot_index"], msg["press_type"], msg["action"]
    )
    if not updated:
        connection.send_error(msg["id"], "not_found", "No Wifi Event at this slot")
        return
    connection.send_result(msg["id"], _wifi_events_state_payload(hass, store, hub.entry_id))


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/wifi_event/set_longpress",
        vol.Optional("entity_id"): cv.entity_id,
        vol.Optional("entry_id"): str,
        vol.Required("slot_index"): int,
        vol.Required("enabled"): bool,
    }
)
@websocket_api.async_response
async def _ws_set_wifi_event_longpress(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    hub = await runtime._async_resolve_hub_from_data(hass, runtime._ws_hub_selector(msg))
    if hub is None:
        connection.send_error(msg["id"], "not_found", "Could not resolve Sofabaton hub")
        return
    store = await runtime._async_get_command_config_store(hass)
    # Pure store-flag edit: the long record is always deployed (plan §11
    # discovery 1) — zero hub writes, the flag gates HA-side execution.
    updated = await store.async_set_wifi_event_longpress(
        hub.entry_id, msg["slot_index"], msg["enabled"]
    )
    if not updated:
        connection.send_error(msg["id"], "not_found", "No Wifi Event at this slot")
        return
    connection.send_result(msg["id"], _wifi_events_state_payload(hass, store, hub.entry_id))


def _build_wifi_press_event(record: dict[str, Any] | None) -> dict[str, Any] | None:
    """Project a hub IP-command record into the small payload pushed to the card.

    The card only needs the bits required to label and dedupe a press;
    we deliberately drop the HTTP envelope (headers, body, source_ip,
    raw path) so the WS frame stays tiny and we don't leak request
    internals through the control-panel surface.
    """

    if not isinstance(record, dict):
        return None
    timestamp = record.get("timestamp")
    if not isinstance(timestamp, (int, float)):
        return None
    raw_command_index = record.get("command_index")
    command_index = (
        int(raw_command_index)
        if isinstance(raw_command_index, int) and raw_command_index >= 0
        else None
    )
    return {
        "device_id": record.get("entity_id"),
        "device_name": record.get("entity_name"),
        "command_index": command_index,
        "command_label": record.get("command_label") or record.get("button_label") or "",
        "press_type": record.get("press_type") or "short",
        "timestamp": float(timestamp),
    }


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/wifi_presses/subscribe",
        vol.Required("entry_id"): str,
    }
)
@websocket_api.async_response
async def _ws_subscribe_wifi_presses(
    hass: HomeAssistant, connection, msg: dict[str, Any]
) -> None:
    """Forward physical-remote Wifi Command presses to a subscribed card.

    Mirrors the lifecycle of the logs subscription: one subscription per
    hub, fan-out via the existing ``signal_ip_commands`` dispatcher so
    we don't duplicate the press-tracking state the
    :class:`SofabatonIpCommandsSensor` already owns. The card uses the
    event purely to drive a transient bottom-dock pulse; the
    automation-facing sensor is still the source of truth for state.
    """

    hub = await runtime._async_resolve_hub_from_data(hass, {"entry_id": msg["entry_id"]})
    if hub is None:
        connection.send_error(msg["id"], "not_found", "Could not resolve Sofabaton hub")
        return

    @callback
    def _forward() -> None:
        payload = _build_wifi_press_event(hub.get_last_ip_command())
        if payload is None:
            return
        connection.send_message(websocket_api.event_message(msg["id"], payload))

    connection.subscriptions[msg["id"]] = async_dispatcher_connect(
        hass, signal_ip_commands(hub.entry_id), _forward
    )
    connection.send_result(msg["id"])


def _build_hub_event_payload(record: dict[str, Any] | None) -> dict[str, Any] | None:
    """Project a hub-event record into the payload pushed to the card.

    ``activity_change`` describes the full transition (either side may be
    None: None -> id is a power-on, id -> None a power-off) so a single
    frame can light every affected row at once; ``redundant_off`` carries
    no activity ids.
    """

    if not isinstance(record, dict):
        return None
    timestamp = record.get("timestamp")
    event_type = record.get("type")
    if not isinstance(timestamp, (int, float)) or event_type not in (
        "activity_change",
        "redundant_off",
    ):
        return None

    def _activity_id(value: Any) -> int | None:
        return int(value) if isinstance(value, int) else None

    return {
        "type": event_type,
        "from_activity_id": _activity_id(record.get("from_activity_id")),
        "to_activity_id": _activity_id(record.get("to_activity_id")),
        "timestamp": float(timestamp),
    }


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/hub_events/subscribe",
        vol.Required("entry_id"): str,
    }
)
@websocket_api.async_response
async def _ws_subscribe_hub_events(
    hass: HomeAssistant, connection, msg: dict[str, Any]
) -> None:
    """Forward hub-event firings (activity transitions, redundant OFF) to a card.

    Mirrors the wifi-press subscription: the event drives a transient row
    glow in the Hub Events tab and fires whether or not an action is
    configured for the event.
    """

    hub = await runtime._async_resolve_hub_from_data(hass, {"entry_id": msg["entry_id"]})
    if hub is None:
        connection.send_error(msg["id"], "not_found", "Could not resolve Sofabaton hub")
        return

    @callback
    def _forward() -> None:
        payload = _build_hub_event_payload(hub.get_last_hub_event())
        if payload is None:
            return
        connection.send_message(websocket_api.event_message(msg["id"], payload))

    connection.subscriptions[msg["id"]] = async_dispatcher_connect(
        hass, signal_hub_events(hub.entry_id), _forward
    )
    connection.send_result(msg["id"])
