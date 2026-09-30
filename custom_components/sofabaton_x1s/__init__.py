from __future__ import annotations

import asyncio
import contextlib
import json
import logging
from pathlib import Path
import re
import unicodedata
from typing import Any, Mapping
from urllib.parse import urlparse

import voluptuous as vol

from homeassistant.components import frontend
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, ServiceCall, SupportsResponse, callback
from homeassistant.helpers import config_validation as cv
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.event import async_call_later
from homeassistant.helpers.dispatcher import async_dispatcher_connect, async_dispatcher_send
from homeassistant.helpers import entity_registry as er
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
    signal_hub_events,
    signal_ip_commands,
    signal_ir_intercept,
    HVER_BY_HUB_VERSION,
    HUB_VERSION_BY_HVER,
    MIN_RECOMMENDED_FIRMWARE,
    MIN_SUPPORTED_FIRMWARE,
    firmware_is_outdated,
    firmware_is_unsupported,
)
from .diagnostics import (
    async_disable_hex_logging_capture,
    async_get_hub_log_lines,
    async_subscribe_hub_log_lines,
    async_setup_diagnostics,
    async_teardown_diagnostics,
)
from .hub import SofabatonHub, get_hub_model
from .command_config import (
    CommandConfigStore,
    MAX_WIFI_DEVICES,
    WIFI_EVENTS_DEVICE_KEY,
    count_configured_command_slots,
    is_wifi_events_device_key,
    normalize_activity_event_actions,
    normalize_hub_event_actions,
    normalize_command_id_list,
    normalize_power_command_id,
    normalize_wifi_transport,
    WIFI_TRANSPORT_MQTT,
    wifi_device_requires_listener,
)
from . import ir_library
from . import ir_uc_hex
from .ui_settings_store import HUB_CLICK_ACTIONS
from .lib.activity_sync import build_activity_sync_plan, build_device_sync_plan
from .lib.bundle_validation import validate_new_entity_name
from .lib.commands import build_descriptive_ir_blob_body
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

_LOGGER = logging.getLogger(__name__)
# The characters a Wifi Device, command or event name may hold: the card's
# rule (\p{L}\p{N}\p{M} plus ASCII punctuation on X1S/X2, A-Z a-z 0-9 and
# space on the X1). Combining marks count, or Thai and Hindi names lose
# their vowel signs (CR-X4-1).
_WIFI_NAME_PUNCTUATION = frozenset(" !\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~")
_WIFI_NAME_MAX_LEN = 20
_FRONTEND_URL_BASE = f"/{DOMAIN}/www"
_TOOLS_CARD_FILENAME = "tools-card.js"
_REMOTE_CARD_FILENAME = "remote-card.js"
_CARD_LOADER_FILENAME = "card-loader.js"
_COMMUNITY_REMOTE_CARD_DIRNAME = "sofabaton-virtual-remote"
_LOVELACE_STORAGE_MODE = "storage"
_UNLOAD_DRAIN_TIMEOUT_S = 600.0


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


def _validate_ir_command_name(value: Any) -> str:
    text = str(value or "").strip()
    if not text:
        raise ValueError("command_name is required")
    return text


def _inspect_frontend_dir(frontend_dir: Path) -> tuple[str, bool, list[str]]:
    """Resolve and inspect the packaged frontend directory."""

    abs_path = str(frontend_dir.resolve())
    if not frontend_dir.is_dir():
        return abs_path, False, []

    return abs_path, True, [entry.name for entry in frontend_dir.iterdir()]


def _frontend_resource_path(filename: str) -> str:
    return f"{_FRONTEND_URL_BASE}/{filename}"


def _frontend_resource_url(filename: str, version: str | None = None) -> str:
    path = _frontend_resource_path(filename)
    normalized_version = str(version or "").strip()
    if not normalized_version:
        return path
    return f"{path}?v={normalized_version}"


def _frontend_loader_url(
    version: str | None,
    inject_remote_card: bool,
    *,
    remote_version: str | None = None,
) -> str:
    base_url = _frontend_resource_url(_CARD_LOADER_FILENAME, version)
    separator = "&" if "?" in base_url else "?"
    remote_flag = "1" if inject_remote_card else "0"
    remote_query = ""
    normalized_remote_version = str(remote_version or "").strip()
    if normalized_remote_version:
        remote_query = f"&remote_v={normalized_remote_version}"
    return f"{base_url}{separator}inject_remote={remote_flag}{remote_query}"


def _resource_url_path(url: str) -> str:
    return urlparse(str(url or "")).path


def _remote_card_community_dir(hass: HomeAssistant) -> Path:
    return Path(hass.config.path("www", "community", _COMMUNITY_REMOTE_CARD_DIRNAME))


async def _async_has_community_remote_card(hass: HomeAssistant) -> bool:
    community_card_dir = _remote_card_community_dir(hass)
    return await hass.async_add_executor_job(
        lambda: community_card_dir.exists() and community_card_dir.is_dir()
    )


def _get_lovelace_resource_mode(hass: HomeAssistant) -> str | None:
    lovelace = hass.data.get("lovelace")
    if not lovelace:
        return None
    mode = getattr(lovelace, "resource_mode", None)
    if mode is None:
        mode = getattr(lovelace, "mode", None)
    normalized = str(mode or "").strip().lower()
    return normalized or None


def _build_frontend_module_specs(
    *,
    tools_version: str,
    remote_version: str,
    include_remote_card: bool,
) -> list[dict[str, str]]:
    modules = [
        {
            "name": "Sofabaton Control Panel",
            "filename": _TOOLS_CARD_FILENAME,
            "version": str(tools_version or "").strip(),
        },
    ]
    if include_remote_card:
        modules.append(
            {
                "name": "Sofabaton Virtual Remote",
                "filename": _REMOTE_CARD_FILENAME,
                "version": str(remote_version or "").strip(),
            }
        )
    return modules


async def _async_get_remote_card_version(hass: HomeAssistant) -> str:
    bundle_path = Path(__file__).parent / "www" / _REMOTE_CARD_FILENAME
    try:
        source = await hass.async_add_executor_job(bundle_path.read_text, "utf-8")
    except FileNotFoundError as err:
        _LOGGER.warning("[%s] Failed to read remote card version source: %s", DOMAIN, err)
        return ""

    match = re.search(r'(?:var|let|const)\s+CARD_VERSION\s*=\s*"([^"]+)"', source)
    if not match:
        _LOGGER.warning("[%s] Failed to parse remote card version from %s", DOMAIN, bundle_path)
        return ""
    return str(match.group(1)).strip()


async def _async_sync_lovelace_resources(
    hass: HomeAssistant,
    modules: list[dict[str, str]],
) -> None:
    lovelace = hass.data.get("lovelace")
    resources = getattr(lovelace, "resources", None)
    if lovelace is None or resources is None:
        return

    desired_by_path = {
        _frontend_resource_path(module["filename"]): {
            **module,
            "url": _frontend_resource_url(module["filename"], module["version"]),
        }
        for module in modules
    }
    existing_resources = [
        resource for resource in resources.async_items()
        if str(resource.get("url", "")).startswith(_FRONTEND_URL_BASE)
    ]
    existing_by_path: dict[str, list[dict[str, Any]]] = {}
    for resource in existing_resources:
        existing_by_path.setdefault(_resource_url_path(resource.get("url", "")), []).append(resource)

    for resource_path, module in desired_by_path.items():
        matches = existing_by_path.pop(resource_path, [])
        keep = matches[0] if matches else None
        if keep is None:
            _LOGGER.info(
                "[%s] Registering %s resource: %s",
                DOMAIN,
                module["name"],
                module["url"],
            )
            await resources.async_create_item({"res_type": "module", "url": module["url"]})
        else:
            current_url = str(keep.get("url", ""))
            current_type = str(keep.get("res_type", ""))
            if current_url != module["url"] or current_type != "module":
                _LOGGER.info(
                    "[%s] Updating %s resource to %s",
                    DOMAIN,
                    module["name"],
                    module["url"],
                )
                await resources.async_update_item(
                    keep.get("id"),
                    {"res_type": "module", "url": module["url"]},
                )
            for duplicate in matches[1:]:
                await resources.async_delete_item(duplicate.get("id"))

    for stale_resources in existing_by_path.values():
        for resource in stale_resources:
            _LOGGER.info("[%s] Removing stale frontend resource: %s", DOMAIN, resource.get("url"))
            await resources.async_delete_item(resource.get("id"))


async def _async_register_storage_mode_resources(
    hass: HomeAssistant,
    modules: list[dict[str, str]],
    *,
    retry_delay_seconds: float = 5.0,
) -> bool:
    domain_data = hass.data.setdefault(DOMAIN, {})
    lovelace = hass.data.get("lovelace")
    resources = getattr(lovelace, "resources", None)
    if lovelace is None or resources is None:
        domain_data["storage_resources_registration_pending"] = False
        return False

    if not getattr(resources, "loaded", False):
        domain_data["storage_resources_registration_pending"] = True
        _LOGGER.debug(
            "[%s] Lovelace resources not loaded yet; retrying frontend resource registration in %.1f seconds",
            DOMAIN,
            retry_delay_seconds,
        )

        async def _retry(_now: Any) -> None:
            await _async_register_storage_mode_resources(
                hass,
                modules,
                retry_delay_seconds=retry_delay_seconds,
            )

        async_call_later(hass, retry_delay_seconds, _retry)
        return False

    await _async_sync_lovelace_resources(hass, modules)
    domain_data["storage_resources_registered"] = True
    domain_data["storage_resources_registration_pending"] = False
    return True


async def _async_unregister_lovelace_resources(hass: HomeAssistant) -> None:
    lovelace = hass.data.get("lovelace")
    resources = getattr(lovelace, "resources", None)
    if lovelace is None or resources is None:
        return

    existing_resources = [
        resource for resource in resources.async_items()
        if str(resource.get("url", "")).startswith(_FRONTEND_URL_BASE)
    ]
    for resource in existing_resources:
        _LOGGER.info("[%s] Removing frontend resource during unload: %s", DOMAIN, resource.get("url"))
        await resources.async_delete_item(resource.get("id"))


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
    tools_frontend_version = await _async_get_integration_version(hass)
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


def _parse_play_ir_blob_input(raw_blob: Any) -> bytes:
    if not isinstance(raw_blob, str) or not raw_blob.strip():
        raise ValueError("blob is required and must be a hex string or descriptor string")

    blob_text = raw_blob.strip()
    if blob_text.startswith("P:"):
        try:
            return build_descriptive_ir_blob_body(blob_text)
        except ValueError as err:
            raise ValueError(f"blob descriptor is invalid: {err}") from err

    try:
        blob_bytes = bytes.fromhex(re.sub(r"\s+", "", raw_blob))
    except ValueError as err:
        raise ValueError(f"blob must be valid hex: {err}") from err

    if len(blob_bytes) < 10:
        raise ValueError("blob is too short to be a valid IR command")
    return blob_bytes


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/blobs/fetch",
        vol.Required("entry_id"): str,
        vol.Required("device_id"): vol.All(int, vol.Range(min=1, max=255)),
        vol.Optional("command_id"): vol.All(int, vol.Range(min=1, max=255)),
    }
)
@websocket_api.async_response
@runtime._hub_write_ws(persist=False)
async def _ws_fetch_blob(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    hub = await runtime._async_resolve_hub_from_data(hass, {"entry_id": msg["entry_id"]})
    if hub is None:
        connection.send_error(msg["id"], "not_found", "Could not resolve Sofabaton hub")
        return

    try:
        result = await hub.async_fetch_blob(
            device_id=int(msg["device_id"]),
            command_id=int(msg["command_id"]) if msg.get("command_id") is not None else None,
        )
        if result is None:
            command_id = msg.get("command_id")
            if command_id is None:
                connection.send_error(
                    msg["id"],
                    "no_response",
                    f"Hub did not respond to blob fetch request for device {int(msg['device_id'])}",
                )
            else:
                connection.send_error(
                    msg["id"],
                    "no_response",
                    (
                        "Hub did not respond to blob fetch request for device "
                        f"{int(msg['device_id'])}, command {int(command_id)}"
                    ),
                )
            return
    except HomeAssistantError as err:
        connection.send_error(msg["id"], "unavailable", str(err))
        return
    except ValueError as err:
        connection.send_error(msg["id"], "invalid_id", str(err))
        return

    connection.send_result(msg["id"], result)


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/blobs/play",
        vol.Required("entry_id"): str,
        vol.Required("blob"): str,
    }
)
@websocket_api.async_response
@runtime._hub_write_ws(persist=False)
async def _ws_play_ir_blob(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    hub = await runtime._async_resolve_hub_from_data(hass, {"entry_id": msg["entry_id"]})
    if hub is None:
        connection.send_error(msg["id"], "not_found", "Could not resolve Sofabaton hub")
        return

    try:
        blob_bytes = _parse_play_ir_blob_input(msg.get("blob"))
        ok = await hub.async_play_ir_blob(blob_bytes)
    except HomeAssistantError as err:
        connection.send_error(msg["id"], "unavailable", str(err))
        return
    except ValueError as err:
        connection.send_error(msg["id"], "invalid_blob", str(err))
        return

    if not ok:
        connection.send_error(
            msg["id"],
            "unavailable",
            "Hub is not ready to play IR blob (proxy client connected?)",
        )
        return

    connection.send_result(msg["id"], {"ok": True})


# ── Payload-editor learn mode (IR9) ─────────────────────────────────────
# Two capture sources feed the control panel's payload editor:
#
# * the hub's own IR receiver, driven as a *listener*: one learn window
#   per subscription, ended by a capture, a timeout, wire traffic, or the
#   card giving up (unsubscribe / socket close => cancel);
# * the HA infrared emitter's intercept ring, exposed as an *inbox*: a
#   subscription that replays the ring on connect and again on every
#   emitter send, so nothing has to stay "running" while the user walks
#   off to press a button on a consumer integration's entity.
#
# Consumer discovery is by config-entry inspection: HA core keeps no
# registry of which integrations use which emitter, but every consumer
# stores the emitter entity id as a plain string in its entry data or
# options (Samsung/LG Infrared, AC climate, ...), which is enough to
# gate the HA option and name the entities the user can poke.

_IR_LEARN_TIMEOUT_DEFAULT = 60.0
_IR_LEARN_TIMEOUT_MIN = 5.0
_IR_LEARN_TIMEOUT_MAX = 120.0
_IR_LEARN_ERROR_FAILED = "ir_learn_failed"
_IR_LEARN_ERROR_REFUSED = "ir_learn_refused"


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/ir_learn/subscribe",
        vol.Required("entry_id"): str,
        vol.Optional("timeout"): int,
    }
)
@websocket_api.async_response
@runtime._hub_write_ws(persist=False)
async def _ws_ir_learn_subscribe(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    """Run one hub learn window and push its outcome as a subscription event.

    Event ``state`` values: ``listening`` (window armed) then exactly one
    terminal state - ``learned`` (with ``payload_hex``), ``timed_out``,
    ``interrupted`` (``interrupted_by`` names the frame), ``cancelled``,
    ``refused`` (hub would not arm) or ``error``. Failure events carry a
    stable ``error_code`` for frontend localization. Unsubscribing before
    the terminal event - including the socket closing - cancels the window
    so the hub is never left armed behind a closed card; the outcome is
    then swallowed, because the client already dropped the subscription
    and would log an "unknown subscription" warning for it.
    """

    hub = await runtime._async_resolve_hub_from_data(hass, {"entry_id": msg["entry_id"]})
    if hub is None:
        connection.send_error(msg["id"], "not_found", "Could not resolve Sofabaton hub")
        return

    timeout = float(msg.get("timeout", _IR_LEARN_TIMEOUT_DEFAULT))
    timeout = min(max(timeout, _IR_LEARN_TIMEOUT_MIN), _IR_LEARN_TIMEOUT_MAX)
    finished = False

    @callback
    def _cancel() -> None:
        if not finished:
            hub.cancel_ir_learn()

    def _push(payload: dict[str, Any]) -> None:
        try:
            connection.send_message(websocket_api.event_message(msg["id"], payload))
        except Exception:  # noqa: BLE001 - socket gone; nothing left to tell
            _LOGGER.debug("IR learn: could not push %s (connection closed?)", payload.get("state"))

    connection.subscriptions[msg["id"]] = _cancel
    connection.send_result(msg["id"])
    _push({"state": "listening", "timeout_s": timeout})

    try:
        result = await hub.async_ir_learn_command(timeout=timeout)
    except Exception as err:  # noqa: BLE001 - logged; card receives a stable code
        _LOGGER.warning("IR learn window failed: %s", err)
        result = {"state": "error", "error_code": _IR_LEARN_ERROR_FAILED}
    finally:
        finished = True

    if result is None:
        result = {
            "state": "refused",
            "error_code": _IR_LEARN_ERROR_REFUSED,
        }
    # HA pops the subscription before running its unsub callback, so a
    # missing entry means the client (or the socket) is gone.
    if msg["id"] in connection.subscriptions:
        _push(result)


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/ir_emissions/subscribe",
        vol.Required("entry_id"): str,
    }
)
@websocket_api.async_response
async def _ws_ir_emissions_subscribe(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    """Replay the emitter intercept ring now and on every emitter send.

    Each event carries the whole ring (oldest first, at most 20 entries)
    so the card never has to merge deltas; the ring is the same one the
    IR intercept sensor reads, fanned out via ``signal_ir_intercept``.
    """

    hub = await runtime._async_resolve_hub_from_data(hass, {"entry_id": msg["entry_id"]})
    if hub is None:
        connection.send_error(msg["id"], "not_found", "Could not resolve Sofabaton hub")
        return

    @callback
    def _forward() -> None:
        connection.send_message(
            websocket_api.event_message(msg["id"], {"emissions": hub.get_ir_emissions()})
        )

    connection.subscriptions[msg["id"]] = async_dispatcher_connect(
        hass, signal_ir_intercept(hub.entry_id), _forward
    )
    connection.send_result(msg["id"])
    _forward()


def _ir_emitter_entity_id(hass: HomeAssistant, hub: SofabatonHub) -> str | None:
    """The hub's infrared emitter entity id, or None when it does not exist."""

    if not infrared_platform_available():
        return None
    registry = er.async_get(hass)
    if registry is None:
        return None
    for entry in er.async_entries_for_config_entry(registry, hub.entry_id):
        if entry.domain == "infrared":
            return entry.entity_id
    return None


def _value_references_entity(value: Any, entity_id: str) -> bool:
    """Deep string match over a config entry's data/options mapping.

    ``ConfigEntry.data``/``options`` are read-only ``MappingProxyType``
    views, not dicts, so match on the Mapping ABC (live-HA finding
    2026-09-02: a dict check silently found zero consumers).
    """

    if isinstance(value, str):
        return value == entity_id
    if isinstance(value, Mapping):
        return any(_value_references_entity(item, entity_id) for item in value.values())
    if isinstance(value, (list, tuple, set)):
        return any(_value_references_entity(item, entity_id) for item in value)
    return False


def build_ir_emitter_consumers(hass: HomeAssistant, hub: SofabatonHub) -> dict[str, Any]:
    """Which config entries point at this hub's emitter, and their entities.

    ``available`` is False when the emitter entity does not exist (older
    HA core, or the entity was removed), in which case the card hides the
    "from Home Assistant" learn option entirely.
    """

    emitter_entity_id = _ir_emitter_entity_id(hass, hub)
    if emitter_entity_id is None:
        return {"available": False, "emitter_entity_id": None, "consumers": []}

    registry = er.async_get(hass)
    consumers: list[dict[str, Any]] = []
    for entry in hass.config_entries.async_entries():
        if entry.domain == DOMAIN:
            continue
        if not (
            _value_references_entity(getattr(entry, "data", None), emitter_entity_id)
            or _value_references_entity(getattr(entry, "options", None), emitter_entity_id)
        ):
            continue
        entities: list[dict[str, Any]] = []
        for ent in er.async_entries_for_config_entry(registry, entry.entry_id):
            if getattr(ent, "disabled_by", None) is not None:
                continue
            state = hass.states.get(ent.entity_id)
            friendly = state.attributes.get("friendly_name") if state is not None else None
            name = friendly or ent.name or getattr(ent, "original_name", None) or ent.entity_id
            entities.append({"entity_id": ent.entity_id, "name": str(name)})
        consumers.append(
            {
                "entry_id": entry.entry_id,
                "domain": entry.domain,
                "title": str(getattr(entry, "title", "") or entry.domain),
                "entities": entities,
            }
        )
    return {
        "available": True,
        "emitter_entity_id": emitter_entity_id,
        "consumers": consumers,
    }


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/ir_emitter/consumers",
        vol.Required("entry_id"): str,
    }
)
@websocket_api.async_response
async def _ws_ir_emitter_consumers(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    hub = await runtime._async_resolve_hub_from_data(hass, {"entry_id": msg["entry_id"]})
    if hub is None:
        connection.send_error(msg["id"], "not_found", "Could not resolve Sofabaton hub")
        return
    connection.send_result(msg["id"], build_ir_emitter_consumers(hass, hub))


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/ir_library/catalog",
    }
)
@websocket_api.async_response
async def _ws_ir_library_catalog(
    hass: HomeAssistant, connection, msg: dict[str, Any]
) -> None:
    """Browsable infrared-protocols catalog (no hub interaction).

    The first call scans and imports the library's code modules, so it
    runs in the executor; later calls hit the module-level cache.
    """

    result = await hass.async_add_executor_job(ir_library.catalog)
    connection.send_result(msg["id"], result)


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/ir_library/commands",
        vol.Required("brand"): str,
        vol.Required("device_type"): str,
    }
)
@websocket_api.async_response
async def _ws_ir_library_commands(
    hass: HomeAssistant, connection, msg: dict[str, Any]
) -> None:
    """Rendered commands for one code set: labels + playable payload hex."""

    try:
        result = await hass.async_add_executor_job(
            ir_library.commands, msg["brand"], msg["device_type"]
        )
    except LookupError as err:
        connection.send_error(msg["id"], "not_found", str(err))
        return
    except RuntimeError as err:
        connection.send_error(msg["id"], "unavailable", str(err))
        return
    connection.send_result(msg["id"], {"commands": result})


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/ir_payload/convert",
        vol.Required("text"): str,
        vol.Optional("format", default="uc_hex"): vol.In(["uc_hex"]),
    }
)
@websocket_api.async_response
async def _ws_ir_payload_convert(
    hass: HomeAssistant, connection, msg: dict[str, Any]
) -> None:
    """Render a foreign IR code into the canonical signal + both hex projections.

    The single conversion path for anything that needs protocol knowledge:
    the card detects the format by shape, this command turns it into
    ``(timings, carrier)`` through ``infrared-protocols`` and hands back
    the pronto and Sofabaton renderings the payload editor shows. Hub
    independent - nothing is sent, no entry is resolved. Errors keep a
    stable ``uc_hex_*`` code; the message is the refused protocol label.
    """

    from .lib.blob_decoders import build_raw_ir_blob_body, render_pronto_hex

    try:
        result = await hass.async_add_executor_job(ir_uc_hex.convert_uc_hex, msg["text"])
    except ir_uc_hex.UcHexError as err:
        code = "unavailable" if err.code == "unavailable" else f"uc_hex_{err.code}"
        connection.send_error(msg["id"], code, err.detail or err.code)
        return
    timings = result["timings_us"]
    carrier_hz = result["carrier_hz"]
    try:
        pronto_hex = render_pronto_hex(timings, carrier_hz)
        sofabaton_hex = build_raw_ir_blob_body(timings, carrier_hz).hex()
    except ValueError as err:
        connection.send_error(msg["id"], "uc_hex_unrepresentable", str(err))
        return
    connection.send_result(
        msg["id"],
        {
            "format": "uc_hex",
            "timings_us": timings,
            "carrier_hz": carrier_hz,
            "pronto_hex": pronto_hex,
            "sofabaton_hex": sofabaton_hex,
            "protocol": result["protocol"],
            "protocol_name": result["protocol_name"],
            "bits": result["bits"],
            "repeat": result["repeat"],
        },
    )


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

            if _get_lovelace_resource_mode(hass) != _LOVELACE_STORAGE_MODE:
                module_specs = await _async_build_frontend_module_specs(hass)
                tools_module = next(
                    module for module in module_specs if module["filename"] == _TOOLS_CARD_FILENAME
                )
                remote_modules = [
                    module for module in module_specs if module["filename"] == _REMOTE_CARD_FILENAME
                ]
                loader_url = _frontend_loader_url(
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


async def _async_build_frontend_module_specs(hass: HomeAssistant) -> list[dict[str, str]]:
    community_card_exists = await _async_has_community_remote_card(hass)
    include_remote_card = not community_card_exists
    if community_card_exists:
        _LOGGER.info(
            "[%s] Community remote card found at %s; bundled remote card will not be registered",
            DOMAIN,
            _remote_card_community_dir(hass),
        )

    tools_version = await _async_get_integration_version(hass)
    remote_version = await _async_get_remote_card_version(hass)
    return _build_frontend_module_specs(
        tools_version=tools_version,
        remote_version=remote_version,
        include_remote_card=include_remote_card,
    )


async def _async_ensure_storage_mode_frontend_resources(hass: HomeAssistant) -> None:
    if _get_lovelace_resource_mode(hass) != _LOVELACE_STORAGE_MODE:
        return

    domain_data = hass.data.setdefault(DOMAIN, {})
    lock = domain_data.get("storage_resources_lock")
    if not isinstance(lock, asyncio.Lock):
        lock = asyncio.Lock()
        domain_data["storage_resources_lock"] = lock

    async with lock:
        if (
            domain_data.get("storage_resources_registered")
            or domain_data.get("storage_resources_registration_pending")
        ):
            return

        _LOGGER.info(
            "[%s] Registering Lovelace frontend resources in storage mode",
            DOMAIN,
        )
        module_specs = await _async_build_frontend_module_specs(hass)
        await _async_register_storage_mode_resources(hass, module_specs)


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
    await _async_ensure_storage_mode_frontend_resources(hass)
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
            if _get_lovelace_resource_mode(hass) == _LOVELACE_STORAGE_MODE:
                if hass.data[DOMAIN].get("storage_resources_registered"):
                    await _async_unregister_lovelace_resources(hass)
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


