from __future__ import annotations

import asyncio
import json
import logging
from pathlib import Path
import re
from typing import Any, Mapping
from urllib.parse import urlparse
from uuid import uuid4

import voluptuous as vol

from aiohttp import web

from homeassistant.components import frontend
from homeassistant.components.http import HomeAssistantView, StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, ServiceCall, SupportsResponse, callback
from homeassistant.helpers import config_validation as cv
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.event import async_call_later
from homeassistant.helpers.dispatcher import async_dispatcher_connect
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
    signal_ip_commands,
    HVER_BY_HUB_VERSION,
    HUB_VERSION_BY_HVER,
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
    async_get_command_config_store,
    count_configured_command_slots,
    normalize_command_id_list,
    normalize_power_command_id,
    wifi_device_requires_listener,
)
from .cache_store import PersistentCacheStore
from .lib.commands import build_descriptive_ir_blob_body
from .lib.hub_listener import bounce_hub_listener
from .roku_listener import async_get_roku_listener

_LOGGER = logging.getLogger(__name__)
_WIFI_NAME_RE = re.compile(r"^(?:[^\W_]|[ +&.'()_-])+$", re.UNICODE)
_WIFI_NAME_ASCII_RE = re.compile(r"^[A-Za-z0-9 ]+$")
_FRONTEND_URL_BASE = f"/{DOMAIN}/www"
_TOOLS_CARD_FILENAME = "tools-card.js"
_REMOTE_CARD_FILENAME = "remote-card.js"
_CARD_LOADER_FILENAME = "card-loader.js"
_COMMUNITY_REMOTE_CARD_DIRNAME = "sofabaton-virtual-remote"
_LOVELACE_STORAGE_MODE = "storage"
_BACKUP_OPERATIONS_KEY = "_backup_operations"


class _BackupOperationRegistry:
    """Track background backup/restore jobs and fan out progress events."""

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self._ops: dict[str, dict[str, Any]] = {}

    @callback
    def create(self, *, kind: str, entry_id: str, initial_state: dict[str, Any]) -> str:
        self._drop_completed_for_entry(entry_id, kind=kind)
        operation_id = uuid4().hex
        self._ops[operation_id] = {
            "operation_id": operation_id,
            "kind": kind,
            "entry_id": entry_id,
            "subscribers": {},
            "state": {
                "operation_id": operation_id,
                "kind": kind,
                "entry_id": entry_id,
                **initial_state,
            },
            "cleanup_unsub": None,
        }
        return operation_id

    @callback
    def get(self, operation_id: str) -> dict[str, Any] | None:
        return self._ops.get(operation_id)

    @callback
    def has_running_for_entry(self, entry_id: str) -> bool:
        for operation in self._ops.values():
            state = operation.get("state") or {}
            if state.get("entry_id") != entry_id:
                continue
            if str(state.get("status") or "") in {"pending", "running"}:
                return True
        return False

    @callback
    def latest_for_entry(self, entry_id: str, *, kind: str | None = None) -> dict[str, Any] | None:
        for operation in reversed(list(self._ops.values())):
            state = operation.get("state") or {}
            if state.get("entry_id") != entry_id:
                continue
            if kind is not None and state.get("kind") != kind:
                continue
            return dict(state)
        return None

    @callback
    def running_for_entry(self, entry_id: str) -> dict[str, Any] | None:
        for operation in reversed(list(self._ops.values())):
            state = operation.get("state") or {}
            if state.get("entry_id") != entry_id:
                continue
            if str(state.get("status") or "") in {"pending", "running"}:
                return dict(state)
        return None

    @callback
    def update(self, operation_id: str, **payload: Any) -> None:
        operation = self._ops.get(operation_id)
        if operation is None:
            return
        state = dict(operation.get("state") or {})
        current_status = str(state.get("status") or "")
        next_status = str(payload.get("status") or current_status or "")
        # Progress callbacks may be queued from another thread. If a terminal
        # update already landed, never let a late pending/running callback
        # demote the operation back into an active state.
        if current_status in {"success", "failed"} and next_status in {"pending", "running"}:
            return
        state.update(payload)
        operation["state"] = state
        self._notify(operation_id)
        if str(state.get("status") or "") in {"success", "failed"}:
            # Every terminal operation gets the same 300s retention. The
            # bundle (if any) ages out on its own — we don't shorten the
            # timer post-download because that races in-flight clients.
            self._schedule_cleanup(operation_id)

    def update_from_thread(self, operation_id: str, **payload: Any) -> None:
        self.hass.loop.call_soon_threadsafe(lambda: self.update(operation_id, **payload))

    @callback
    def subscribe(
        self,
        operation_id: str,
        token: object,
        callback_fn,
    ) -> dict[str, Any] | None:
        operation = self._ops.get(operation_id)
        if operation is None:
            return None
        subscribers = operation.setdefault("subscribers", {})
        subscribers[token] = callback_fn
        return dict(operation.get("state") or {})

    @callback
    def unsubscribe(self, operation_id: str, token: object) -> None:
        operation = self._ops.get(operation_id)
        if operation is None:
            return
        subscribers = operation.setdefault("subscribers", {})
        subscribers.pop(token, None)

    @callback
    def clear_backup_result(self, operation_id: str) -> bool:
        operation = self._ops.get(operation_id)
        if operation is None:
            return False
        state = dict(operation.get("state") or {})
        if not state.get("backup"):
            return False
        state.pop("backup", None)
        state["backup_downloaded"] = True
        operation["state"] = state
        self._notify(operation_id)
        self._schedule_cleanup(operation_id, delay_seconds=30.0)
        return True

    @callback
    def dismiss_operation(self, operation_id: str) -> bool:
        # Full drop of a terminal operation: cancels any pending cleanup
        # timer and removes the op from the registry entirely. After this
        # returns True, ``latest_for_entry`` will no longer surface the
        # op, so a card refresh cannot snap a "Complete" view back to a
        # stale success/failure record. Refuses to drop pending/running
        # ops — those have to terminate naturally first.
        operation = self._ops.get(operation_id)
        if operation is None:
            return False
        state = operation.get("state") or {}
        if str(state.get("status") or "") in {"pending", "running"}:
            return False
        cleanup_unsub = operation.get("cleanup_unsub")
        if callable(cleanup_unsub):
            try:
                cleanup_unsub()
            except Exception:
                pass
        self._ops.pop(operation_id, None)
        return True

    @callback
    def flag_backup_downloaded(self, operation_id: str) -> bool:
        """Mark a backup as downloaded so the UI can show a confirmation.

        Does NOT touch the cleanup timer — the bundle ages out on the
        original 300s schedule so the user can re-download within that
        window if their first save-as didn't land.
        """
        operation = self._ops.get(operation_id)
        if operation is None:
            return False
        state = dict(operation.get("state") or {})
        if state.get("backup_downloaded"):
            return True
        state["backup_downloaded"] = True
        operation["state"] = state
        self._notify(operation_id)
        return True

    @callback
    def _notify(self, operation_id: str) -> None:
        operation = self._ops.get(operation_id)
        if operation is None:
            return
        payload = dict(operation.get("state") or {})
        for callback_fn in list((operation.get("subscribers") or {}).values()):
            try:
                callback_fn(payload)
            except Exception:
                _LOGGER.exception("[backup] Failed to notify subscriber")

    @callback
    def _schedule_cleanup(self, operation_id: str, delay_seconds: float = 300.0) -> None:
        operation = self._ops.get(operation_id)
        if operation is None:
            return
        existing_unsub = operation.get("cleanup_unsub")
        if callable(existing_unsub):
            try:
                existing_unsub()
            except Exception:
                pass

        @callback
        def _cleanup(_now) -> None:
            op = self._ops.get(operation_id)
            if op is not None:
                state = dict(op.get("state") or {})
                # If the bundle is still present, let subscribers know it's
                # being thrown away. The UI uses this to swap the
                # "Download backup" button for an "expired" note instead
                # of failing silently with a stale enabled button.
                if state.get("backup"):
                    state.pop("backup", None)
                    state["backup_expired"] = True
                    op["state"] = state
                    self._notify(operation_id)
            self._ops.pop(operation_id, None)

        operation["cleanup_unsub"] = async_call_later(self.hass, delay_seconds, _cleanup)

    @callback
    def _drop_completed_for_entry(self, entry_id: str, *, kind: str) -> None:
        for operation_id, operation in list(self._ops.items()):
            state = operation.get("state") or {}
            if state.get("entry_id") != entry_id or state.get("kind") != kind:
                continue
            if str(state.get("status") or "") in {"pending", "running"}:
                continue
            cleanup_unsub = operation.get("cleanup_unsub")
            if callable(cleanup_unsub):
                try:
                    cleanup_unsub()
                except Exception:
                    pass
            self._ops.pop(operation_id, None)


def _backup_operation_registry(hass: HomeAssistant) -> _BackupOperationRegistry:
    domain_data = hass.data.setdefault(DOMAIN, {})
    registry = domain_data.get(_BACKUP_OPERATIONS_KEY)
    if isinstance(registry, _BackupOperationRegistry):
        return registry
    registry = _BackupOperationRegistry(hass)
    domain_data[_BACKUP_OPERATIONS_KEY] = registry
    return registry


class SofabatonBackupDownloadView(HomeAssistantView):
    """Serve completed backup bundles from the in-memory registry.

    Mirrors HA core's pattern (backup / diagnostics / camera snapshot):
    server endpoint returning Content-Disposition: attachment, fetched
    via auth/sign_path + fileDownload helper on the frontend. The HA
    mobile apps' WebView delegates (setDownloadListener on Android,
    WKDownloadDelegate on iOS) intercept the response and surface it as
    a native download. Blob URLs do not trigger those delegates.
    """

    url = "/api/sofabaton_x1s/backup/download/{operation_id}"
    name = "api:sofabaton_x1s:backup_download"
    requires_auth = True

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass

    async def get(self, request: web.Request, operation_id: str) -> web.Response:
        _LOGGER.info(
            "[%s] backup download view hit: operation_id=%s authenticated=%s",
            DOMAIN,
            operation_id,
            request.get("ha_authenticated", "unknown"),
        )
        registry = _backup_operation_registry(self.hass)
        operation = registry.get(operation_id)
        if operation is None:
            _LOGGER.warning("[%s] backup download: unknown operation_id=%s", DOMAIN, operation_id)
            return web.Response(status=404, text="unknown operation")
        state = operation.get("state") or {}
        kind = str(state.get("kind") or "")
        if kind not in {"backup_export", "backup_edited"}:
            return web.Response(status=404, text="not a backup")
        if str(state.get("status") or "") != "success":
            return web.Response(status=404, text="backup not ready")
        bundle = state.get("backup")
        if not bundle:
            _LOGGER.warning("[%s] backup download: bundle already cleared for %s", DOMAIN, operation_id)
            return web.Response(status=410, text="backup no longer available")
        filename = str(state.get("filename") or "sofabaton_backup.json")
        body = json.dumps(bundle, indent=2).encode("utf-8")
        _LOGGER.info("[%s] backup download: serving %s (%d bytes)", DOMAIN, filename, len(body))
        # Flag the bundle as downloaded for the UI's "✓ Downloaded"
        # indicator. Does NOT shorten the retention timer — the user can
        # re-download for the full original 300s window if their first
        # save-as didn't land. Only meaningful for backup_export ops; the
        # Edit screen doesn't subscribe to a stashed-edited op's progress.
        registry.flag_backup_downloaded(operation_id)
        return web.Response(
            body=body,
            content_type="application/json",
            charset="utf-8",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )


def _hub_supports_unicode_wifi_names(hub: SofabatonHub) -> bool:
    version = str(getattr(hub, "version", "") or "").upper()
    return "X1S" in version or "X2" in version


def _sanitize_wifi_name_for_hub(hub: SofabatonHub, value: Any) -> str:
    text = str(value or "")
    pattern = _WIFI_NAME_RE if _hub_supports_unicode_wifi_names(hub) else _WIFI_NAME_ASCII_RE
    filtered = "".join(ch for ch in text if pattern.fullmatch(ch))
    return filtered[:20].strip()


def _validate_wifi_name_for_hub(hub: SofabatonHub, value: Any, *, field_name: str = "device_name") -> str:
    raw = str(value or "").strip()
    if not raw:
        raise ValueError(f"{field_name} is required")
    text = _sanitize_wifi_name_for_hub(hub, raw)
    if not text:
        if _hub_supports_unicode_wifi_names(hub):
            raise ValueError(
                f"{field_name} must contain only letters (including accented/umlaut), numbers, spaces, and common symbols like +"
            )
        raise ValueError(f"{field_name} must contain only letters, numbers, and spaces")
    return text


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
    store = await _async_get_command_config_store(hass)
    roku_listen_port = _resolve_roku_listen_port(hass, entry_id)
    devices = await store.async_list_hub_devices(entry_id, roku_listen_port=roku_listen_port)
    return any(wifi_device_requires_listener(device) for device in devices)


async def _async_build_control_panel_runtime_payload(
    hass: HomeAssistant,
    hub: SofabatonHub,
) -> dict[str, Any]:
    registry = _backup_operation_registry(hass)
    active_backup_operation = registry.running_for_entry(hub.entry_id)
    if active_backup_operation:
        kind = str(active_backup_operation.get("kind") or "").strip().lower()
        operation = "backup_restore" if kind == "backup_restore" else "backup_export"
        return {
            "kind": "operation_running",
            "operation": operation,
            "label": "Restoring backup" if operation == "backup_restore" else "Creating backup",
            "detail": str(
                active_backup_operation.get("message")
                or active_backup_operation.get("phase")
                or "Working..."
            ),
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
        }

    store = await _async_get_command_config_store(hass)
    roku_listen_port = _resolve_roku_listen_port(hass, hub.entry_id)
    devices = await store.async_list_hub_devices(hub.entry_id, roku_listen_port=roku_listen_port)
    for device in devices:
        device_key = str(device.get("device_key") or "")
        sync_payload = _build_wifi_device_sync_payload(hub, device, device_key=device_key)
        if str(sync_payload.get("status") or "").strip().lower() != "running":
            continue
        return {
            "kind": "operation_running",
            "operation": "wifi_deploy",
            "label": "Deploying Wifi commands",
            "detail": str(sync_payload.get("message") or "Sync in progress"),
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
    }


async def _async_build_control_panel_hub_payload(
    hass: HomeAssistant,
    hub: SofabatonHub,
    *,
    persistent_cache_enabled: bool,
) -> dict[str, Any]:
    registry = _backup_operation_registry(hass)
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
    return {
        "entry_id": hub.entry_id,
        "name": hub.name,
        "version": version,
        "firmware_version": getattr(hub, "hub_firmware_version", None),
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
        "remote_battery": hub.get_remote_battery_state(),
    }


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
        vol.Optional("device_key"): str,
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
    try:
        payload = await store.async_get_hub_config(
            hub.entry_id,
            device_key=msg.get("device_key"),
            roku_listen_port=roku_listen_port,
        )
    except KeyError:
        connection.send_error(msg["id"], "not_found", "Could not resolve Wifi Device")
        return
    connection.send_result(msg["id"], payload)


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/command_config/export",
        vol.Required("entity_id"): cv.entity_id,
    }
)
@websocket_api.async_response
async def _ws_export_command_config(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    hub = await _async_resolve_hub_from_data(hass, {"entity_id": msg["entity_id"]})
    if hub is None:
        connection.send_error(msg["id"], "not_found", "Could not resolve Sofabaton hub")
        return

    store = await _async_get_command_config_store(hass)
    roku_listen_port = _resolve_roku_listen_port(hass, hub.entry_id)
    payload = await store.async_export_hub_config(
        hub.entry_id,
        roku_listen_port=roku_listen_port,
    )
    payload["managed_wifi_devices"] = [
        {
            "device_id": dev_id,
            "device_key": device_key,
            "commands_hash": command_hash,
            "brand": brand,
        }
        for dev_id, device_key, command_hash, brand in hub._managed_wifi_devices()
    ]
    connection.send_result(msg["id"], payload)


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/command_config/set",
        vol.Required("entity_id"): cv.entity_id,
        vol.Required("commands"): list,
        vol.Optional("device_key"): str,
        vol.Optional("power_on_command_id"): int,
        vol.Optional("power_off_command_id"): int,
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
        device_key=msg.get("device_key"),
        roku_listen_port=roku_listen_port,
        power_on_command_id=msg.get("power_on_command_id"),
        power_off_command_id=msg.get("power_off_command_id"),
    )
    connection.send_result(msg["id"], payload)


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/command_sync/progress",
        vol.Required("entity_id"): cv.entity_id,
        vol.Optional("device_key"): str,
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


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/command_devices/list",
        vol.Required("entity_id"): cv.entity_id,
    }
)
@websocket_api.async_response
async def _ws_list_command_devices(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    hub = await _async_resolve_hub_from_data(hass, {"entity_id": msg["entity_id"]})
    if hub is None:
        connection.send_error(msg["id"], "not_found", "Could not resolve Sofabaton hub")
        return

    store = await _async_get_command_config_store(hass)
    roku_listen_port = _resolve_roku_listen_port(hass, hub.entry_id)
    devices = await store.async_list_hub_devices(hub.entry_id, roku_listen_port=roku_listen_port)
    payload = []
    for device in devices:
        device_key = str(device.get("device_key") or "")
        payload.append({
            **device,
            **_build_wifi_device_sync_payload(hub, device, device_key=device_key),
        })
    connection.send_result(msg["id"], {"devices": payload, "max_devices": MAX_WIFI_DEVICES})


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/command_device/create",
        vol.Required("entity_id"): cv.entity_id,
        vol.Required("device_name"): str,
    }
)
@websocket_api.async_response
async def _ws_create_command_device(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    hub = await _async_resolve_hub_from_data(hass, {"entity_id": msg["entity_id"]})
    if hub is None:
        connection.send_error(msg["id"], "not_found", "Could not resolve Sofabaton hub")
        return
    try:
        device_name = _validate_wifi_name_for_hub(hub, msg.get("device_name"), field_name="device_name")
    except ValueError as err:
        connection.send_error(msg["id"], "invalid_format", str(err))
        return
    store = await _async_get_command_config_store(hass)
    roku_listen_port = _resolve_roku_listen_port(hass, hub.entry_id)
    try:
        payload = await store.async_create_hub_device(
            hub.entry_id,
            device_name,
            roku_listen_port=roku_listen_port,
        )
    except ValueError as err:
        connection.send_error(msg["id"], "invalid_format", str(err))
        return
    connection.send_result(msg["id"], payload)


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/command_device/delete",
        vol.Required("entity_id"): cv.entity_id,
        vol.Required("device_key"): str,
    }
)
@websocket_api.async_response
async def _ws_delete_command_device(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    hub = await _async_resolve_hub_from_data(hass, {"entity_id": msg["entity_id"]})
    if hub is None:
        connection.send_error(msg["id"], "not_found", "Could not resolve Sofabaton hub")
        return
    store = await _async_get_command_config_store(hass)
    roku_listen_port = _resolve_roku_listen_port(hass, hub.entry_id)
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
        snapshot = await hub._async_refresh_devices_snapshot()
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
        for managed_device_id, _managed_key, _managed_hash, _brand in matches:
            result = await hub.async_delete_device(managed_device_id)
            deleted_hub_device = bool(result)
            if deleted_hub_device:
                break
    deleted_config = await store.async_delete_hub_device(hub.entry_id, msg["device_key"])
    if (
        hub.roku_server_enabled
        and (deleted_hub_device or not wifi_device_requires_listener(payload))
        and not await _async_wifi_listener_needed(hass, hub.entry_id)
    ):
        await hub.async_set_roku_server_enabled(False)
    connection.send_result(msg["id"], {"deleted_config": deleted_config, "deleted_hub_device": deleted_hub_device})


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/control_panel/state",
    }
)
@websocket_api.async_response
async def _ws_get_control_panel_state(
    hass: HomeAssistant, connection, msg: dict[str, Any]
) -> None:
    store = await _async_get_persistent_cache_store(hass)
    tools_frontend_version = await _async_get_integration_version(hass)
    hubs = await asyncio.gather(
        *[
            _async_build_control_panel_hub_payload(
                hass,
                hub,
                persistent_cache_enabled=store.enabled,
            )
            for hub in _get_hubs(hass.data.get(DOMAIN, {}))
        ]
    )
    payload = {
        "persistent_cache_enabled": store.enabled,
        "tools_frontend_version": tools_frontend_version,
        "hubs": hubs,
    }
    connection.send_result(msg["id"], payload)


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/control_panel/set_setting",
        vol.Required("entry_id"): str,
        vol.Required("setting"): vol.In(
            ["persistent_cache", "proxy_enabled", "hex_logging_enabled", "wifi_device_enabled"]
        ),
        vol.Required("enabled"): cv.boolean,
    }
)
@websocket_api.async_response
async def _ws_control_panel_set_setting(
    hass: HomeAssistant, connection, msg: dict[str, Any]
) -> None:
    setting = str(msg["setting"])
    enabled = bool(msg["enabled"])

    if setting == "persistent_cache":
        store = await _async_get_persistent_cache_store(hass)
        await store.async_set_enabled(enabled)
        if not enabled:
            await store.async_clear_all_hub_cache()
        connection.send_result(msg["id"], {"ok": True, "enabled": enabled})
        return

    hub = await _async_resolve_hub_from_data(hass, {"entry_id": msg["entry_id"]})
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
async def _ws_control_panel_run_action(
    hass: HomeAssistant, connection, msg: dict[str, Any]
) -> None:
    hub = await _async_resolve_hub_from_data(hass, {"entry_id": msg["entry_id"]})
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

    try:
        _raise_if_hub_operation_locked(hass, hub, "_ws_control_panel_run_action")
    except HomeAssistantError as err:
        connection.send_error(msg["id"], "unavailable", str(err))
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


def _validate_backup_device_ids(raw_device_ids: Any) -> list[int] | None:
    if raw_device_ids is None:
        return None
    if not isinstance(raw_device_ids, (list, tuple)):
        raise ValueError(
            "device_ids must be a list of device id integers, or omitted "
            "to back up the whole hub"
        )
    if not raw_device_ids:
        return None

    device_ids: list[int] = []
    for raw in raw_device_ids:
        try:
            value = int(raw)
        except (TypeError, ValueError) as exc:
            raise ValueError(
                f"device_ids entries must be integers (got {raw!r})"
            ) from exc
        if value < 1 or value > 255:
            raise ValueError(
                f"device_ids entries must be in 1..255 (got {value})"
            )
        if value not in device_ids:
            device_ids.append(value)
    return device_ids or None


def _validate_restore_mode(raw_mode: Any) -> str:
    mode = str(raw_mode or "").strip().lower()
    if mode not in {"replace", "merge"}:
        raise ValueError("mode must be 'replace' or 'merge'")
    return mode


def _backup_result_filename(bundle: Mapping[str, Any], hub: SofabatonHub) -> str:
    hub_block = bundle.get("hub") if isinstance(bundle, Mapping) else None
    hub_name = ""
    if isinstance(hub_block, Mapping):
        hub_name = str(hub_block.get("name") or "").strip()
    if not hub_name:
        hub_name = str(getattr(hub, "name", "") or "hub").strip()
    safe_name = re.sub(r"[^A-Za-z0-9._-]+", "_", hub_name).strip("._-") or "hub"

    captured_at = str(bundle.get("captured_at") or "").strip()
    timestamp = captured_at.replace(":", "-")
    timestamp = timestamp.replace("T", "_")
    timestamp = timestamp.replace("+00-00", "Z")
    timestamp = timestamp.replace("+", "_")
    timestamp = timestamp.replace(".", "-")
    timestamp = timestamp.rstrip("Z")
    timestamp = timestamp.split("_", 1)
    if len(timestamp) == 2:
        date_part, time_part = timestamp
        time_part = time_part.split("-", 3)
        if len(time_part) >= 3:
            timestamp_text = f"{date_part}_{time_part[0]}-{time_part[1]}-{time_part[2]}"
        else:
            timestamp_text = f"{date_part}_{'-'.join(time_part)}"
    else:
        timestamp_text = re.sub(r"[^0-9A-Za-z_-]+", "", str(bundle.get("captured_at") or "")) or "backup"
    return f"{timestamp_text}_{safe_name}.json"


async def _run_backup_export_operation(
    hass: HomeAssistant,
    operation_id: str,
    *,
    hub: SofabatonHub,
    device_ids: list[int] | None,
) -> None:
    registry = _backup_operation_registry(hass)

    def _normalize_progress_payload(
        payload: dict[str, Any] | None = None,
        **payload_update: Any,
    ) -> dict[str, Any]:
        if payload is not None:
            merged = dict(payload)
            merged.update(payload_update)
            return merged
        return dict(payload_update)

    def _progress(payload: dict[str, Any] | None = None, **payload_update: Any) -> None:
        # The library runs the backup in an executor and invokes this from
        # that thread, so marshal onto the loop.
        registry.update_from_thread(
            operation_id,
            **_normalize_progress_payload(payload, **payload_update),
        )

    try:
        result = await hub.async_backup_hub(
            device_ids=device_ids,
            progress_callback=_progress,
        )
        registry.update(
            operation_id,
            status="success",
            phase="completed",
            message="Backup completed.",
            completed_steps=int(result.get("_progress_total_steps") or 0),
            total_steps=int(result.get("_progress_total_steps") or 0),
            filename=_backup_result_filename(result, hub),
            backup=result,
        )
    except Exception as err:
        registry.update(
            operation_id,
            status="failed",
            phase="failed",
            message=str(err) or "Backup failed",
            error=str(err) or "Backup failed",
        )


async def _run_backup_restore_operation(
    hass: HomeAssistant,
    operation_id: str,
    *,
    hub: SofabatonHub,
    payload: dict[str, Any],
    mode: str,
) -> None:
    registry = _backup_operation_registry(hass)

    def _normalize_progress_payload(
        payload: dict[str, Any] | None = None,
        **payload_update: Any,
    ) -> dict[str, Any]:
        if payload is not None:
            merged = dict(payload)
            merged.update(payload_update)
            return merged
        return dict(payload_update)

    progress_seen = False

    def _progress(payload: dict[str, Any] | None = None, **payload_update: Any) -> None:
        nonlocal progress_seen
        progress_seen = True
        registry.update_from_thread(
            operation_id,
            **_normalize_progress_payload(payload, **payload_update),
        )

    try:
        result = await hub.async_restore_backup(
            payload,
            replace_mode=(mode == "replace"),
            wifi_commands_request_port=_resolve_roku_listen_port(hass, hub.entry_id),
            progress_callback=_progress,
        )
        if isinstance(result, dict) and str(result.get("status") or "") == "failed":
            failed_at = result.get("failed_at")
            registry.update(
                operation_id,
                status="failed",
                phase="failed",
                message=f"Restore failed at {failed_at!r}.",
                error=f"Restore failed at {failed_at!r}.",
                result=result,
            )
            return
        success_payload: dict[str, Any] = {
            "status": "success",
            "phase": "completed",
            "message": "Restore completed.",
            "result": result or {"status": "success"},
        }
        if isinstance(result, dict):
            if result.get("_progress_completed_steps") is not None:
                success_payload["completed_steps"] = int(result["_progress_completed_steps"])
            if result.get("_progress_total_steps") is not None:
                success_payload["total_steps"] = int(result["_progress_total_steps"])
        registry.update(operation_id, **success_payload)
    except Exception as err:
        # Pre-flight failures (validator round-trip rejection, malformed
        # bundle, schema mismatch) raise before any progress callback
        # fires — there's no "operation in a failed state" to persist
        # because no wire writes happened. Surface the error to the
        # active subscriber, then dismiss the op so a card refresh does
        # not snap a stale failure record back onto the UI. In-flight
        # failures (progress already started, hub disconnected midway,
        # etc.) take the normal failed-status path so the user can
        # navigate away and come back to the error report.
        if not progress_seen:
            registry.update(
                operation_id,
                status="failed",
                phase="failed",
                message=str(err) or "Restore failed",
                error=str(err) or "Restore failed",
                transient=True,
            )
            registry.dismiss_operation(operation_id)
            return
        registry.update(
            operation_id,
            status="failed",
            phase="failed",
            message=str(err) or "Restore failed",
            error=str(err) or "Restore failed",
        )


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/blobs/fetch",
        vol.Required("entry_id"): str,
        vol.Required("device_id"): vol.All(int, vol.Range(min=1, max=255)),
        vol.Optional("command_id"): vol.All(int, vol.Range(min=1, max=255)),
    }
)
@websocket_api.async_response
async def _ws_fetch_blob(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    hub = await _async_resolve_hub_from_data(hass, {"entry_id": msg["entry_id"]})
    if hub is None:
        connection.send_error(msg["id"], "not_found", "Could not resolve Sofabaton hub")
        return

    try:
        _raise_if_hub_operation_locked(hass, hub, "_ws_fetch_blob")
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
async def _ws_play_ir_blob(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    hub = await _async_resolve_hub_from_data(hass, {"entry_id": msg["entry_id"]})
    if hub is None:
        connection.send_error(msg["id"], "not_found", "Could not resolve Sofabaton hub")
        return

    try:
        _raise_if_hub_operation_locked(hass, hub, "_ws_play_ir_blob")
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


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/blobs/persist",
        vol.Required("entry_id"): str,
        vol.Required("device_id"): vol.All(int, vol.Range(min=1, max=255)),
        vol.Required("command_name"): str,
        vol.Required("blob"): str,
    }
)
@websocket_api.async_response
async def _ws_persist_ir_blob(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    hub = await _async_resolve_hub_from_data(hass, {"entry_id": msg["entry_id"]})
    if hub is None:
        connection.send_error(msg["id"], "not_found", "Could not resolve Sofabaton hub")
        return

    try:
        _raise_if_hub_operation_locked(hass, hub, "_ws_persist_ir_blob")
        blob_bytes = _parse_play_ir_blob_input(msg.get("blob"))
        command_name = _validate_ir_command_name(msg.get("command_name"))
        result = await hub.async_persist_ir_blob(
            device_id=int(msg["device_id"]),
            command_name=command_name,
            blob=blob_bytes,
        )
    except HomeAssistantError as err:
        connection.send_error(msg["id"], "unavailable", str(err))
        return
    except ValueError as err:
        message = str(err)
        if "device_id" in message:
            error_code = "invalid_id"
        elif "command_name" in message:
            error_code = "invalid_name"
        else:
            error_code = "invalid_blob"
        connection.send_error(msg["id"], error_code, message)
        return

    if result is None:
        connection.send_error(
            msg["id"],
            "unavailable",
            "Hub is not ready to persist IR blob (proxy client connected?)",
        )
        return

    connection.send_result(msg["id"], result)


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/backup/export",
        vol.Required("entry_id"): str,
        vol.Optional("device_ids"): [vol.All(int, vol.Range(min=1, max=255))],
    }
)
@websocket_api.async_response
async def _ws_backup_export(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    hub = await _async_resolve_hub_from_data(hass, {"entry_id": msg["entry_id"]})
    if hub is None:
        connection.send_error(msg["id"], "not_found", "Could not resolve Sofabaton hub")
        return

    registry = _backup_operation_registry(hass)
    if registry.has_running_for_entry(hub.entry_id):
        connection.send_error(msg["id"], "busy", "Another backup or restore operation is already running for this hub")
        return

    try:
        _raise_if_hub_operation_locked(hass, hub, "_ws_backup_export")
        device_ids = _validate_backup_device_ids(msg.get("device_ids"))
    except HomeAssistantError as err:
        connection.send_error(msg["id"], "unavailable", str(err))
        return
    except ValueError as err:
        connection.send_error(msg["id"], "invalid_id", str(err))
        return

    operation_id = registry.create(
        kind="backup_export",
        entry_id=hub.entry_id,
        initial_state={
            "status": "pending",
            "phase": "queued",
            "message": "Starting backup…",
            "completed_steps": 0,
            "total_steps": 0,
        },
    )
    hass.async_create_task(
        _run_backup_export_operation(
            hass,
            operation_id,
            hub=hub,
            device_ids=device_ids,
        )
    )
    connection.send_result(msg["id"], {"operation_id": operation_id})


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/backup/restore",
        vol.Required("entry_id"): str,
        vol.Required("backup"): dict,
        vol.Required("mode"): str,
    }
)
@websocket_api.async_response
async def _ws_backup_restore(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    hub = await _async_resolve_hub_from_data(hass, {"entry_id": msg["entry_id"]})
    if hub is None:
        connection.send_error(msg["id"], "not_found", "Could not resolve Sofabaton hub")
        return

    registry = _backup_operation_registry(hass)
    if registry.has_running_for_entry(hub.entry_id):
        connection.send_error(msg["id"], "busy", "Another backup or restore operation is already running for this hub")
        return

    try:
        _raise_if_hub_operation_locked(hass, hub, "_ws_backup_restore")
        mode = _validate_restore_mode(msg.get("mode"))
        payload = msg.get("backup")
        if not isinstance(payload, dict):
            raise ValueError("backup must be a hub_bundle object")
    except HomeAssistantError as err:
        connection.send_error(msg["id"], "unavailable", str(err))
        return
    except ValueError as err:
        connection.send_error(msg["id"], "invalid_payload", str(err))
        return

    operation_id = registry.create(
        kind="backup_restore",
        entry_id=hub.entry_id,
        initial_state={
            "status": "pending",
            "phase": "queued",
            "message": "Starting restore…",
            "mode": mode,
            "completed_steps": 0,
            "total_steps": 0,
        },
    )
    hass.async_create_task(
        _run_backup_restore_operation(
            hass,
            operation_id,
            hub=hub,
            payload=payload,
            mode=mode,
        )
    )
    connection.send_result(msg["id"], {"operation_id": operation_id})


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/backup/stash_edited",
        vol.Required("entry_id"): str,
        vol.Required("backup"): dict,
        vol.Required("filename"): str,
    }
)
@websocket_api.async_response
async def _ws_backup_stash_edited(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    # The Edit screen mutates the bundle entirely in-browser. To hand
    # the JSON to the user through the same authenticated download path
    # the Make screen uses (so HA mobile WebView delegates can intercept
    # Content-Disposition and surface a native save dialog), the
    # frontend stashes the edited bundle here. Parked in the operation
    # registry under a dedicated backup_edited kind — same 300s TTL as
    # backup_export, served by the same view — and the returned
    # operation_id is immediately consumed by
    # /api/sofabaton_x1s/backup/download/{op_id}.
    payload = msg.get("backup")
    if not isinstance(payload, dict):
        connection.send_error(msg["id"], "invalid_payload", "backup must be an object")
        return
    filename = str(msg.get("filename") or "").strip() or "sofabaton_backup_edited.json"
    registry = _backup_operation_registry(hass)
    operation_id = registry.create(
        kind="backup_edited",
        entry_id=str(msg["entry_id"]),
        initial_state={},
    )
    registry.update(
        operation_id,
        status="success",
        phase="complete",
        filename=filename,
        backup=payload,
    )
    connection.send_result(msg["id"], {"operation_id": operation_id})


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/backup/progress_subscribe",
        vol.Required("operation_id"): str,
    }
)
@websocket_api.async_response
async def _ws_backup_progress_subscribe(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    registry = _backup_operation_registry(hass)
    token = object()

    @callback
    def _forward(payload: dict[str, Any]) -> None:
        connection.send_message(websocket_api.event_message(msg["id"], payload))

    initial_state = registry.subscribe(msg["operation_id"], token, _forward)
    if initial_state is None:
        connection.send_error(msg["id"], "not_found", "Could not resolve backup operation")
        return

    @callback
    def _unsubscribe() -> None:
        registry.unsubscribe(msg["operation_id"], token)

    connection.subscriptions[msg["id"]] = _unsubscribe
    connection.send_result(msg["id"])
    _forward(initial_state)


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/backup/state",
        vol.Required("entry_id"): str,
    }
)
@websocket_api.async_response
async def _ws_backup_state(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    hub = await _async_resolve_hub_from_data(hass, {"entry_id": msg["entry_id"]})
    if hub is None:
        connection.send_error(msg["id"], "not_found", "Could not resolve Sofabaton hub")
        return

    registry = _backup_operation_registry(hass)
    connection.send_result(
        msg["id"],
        {
            "backup_export": registry.latest_for_entry(hub.entry_id, kind="backup_export"),
            "backup_restore": registry.latest_for_entry(hub.entry_id, kind="backup_restore"),
            "active_operation": registry.running_for_entry(hub.entry_id),
        },
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/backup/clear_result",
        vol.Required("operation_id"): str,
    }
)
@websocket_api.async_response
async def _ws_backup_clear_result(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    # Full-drop the completed op from the registry. The "Complete"
    # button on backup/restore screens calls this — the op must vanish
    # so a card refresh does not snap the success view back from
    # cached server state. Returns ok even if the op is already gone
    # (idempotent — covers double-clicks and races with the auto-300s
    # cleanup timer).
    registry = _backup_operation_registry(hass)
    operation = registry.get(msg["operation_id"])
    if operation is None:
        connection.send_result(msg["id"], {"ok": True, "already_dismissed": True})
        return
    state = operation.get("state") or {}
    if str(state.get("status") or "") in {"pending", "running"}:
        connection.send_error(
            msg["id"], "still_running", "Operation is still running"
        )
        return
    registry.dismiss_operation(msg["operation_id"])
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
    hub = await _async_resolve_hub_from_data(hass, {"entry_id": msg["entry_id"]})
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
    hub = await _async_resolve_hub_from_data(hass, {"entry_id": msg["entry_id"]})
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

    hub = await _async_resolve_hub_from_data(hass, {"entry_id": msg["entry_id"]})
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
                "cache_generation": hub.cache_generation,
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

    try:
        _raise_if_hub_operation_locked(hass, hub, "_ws_refresh_persistent_cache_entry")
    except HomeAssistantError as err:
        connection.send_error(msg["id"], "unavailable", str(err))
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

    try:
        _raise_if_hub_operation_locked(hass, hub, "_ws_refresh_catalog")
    except HomeAssistantError as err:
        connection.send_error(msg["id"], "unavailable", str(err))
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
    websocket_api.async_register_command(hass, _ws_export_command_config)
    websocket_api.async_register_command(hass, _ws_set_command_config)
    websocket_api.async_register_command(hass, _ws_get_command_sync_progress)
    websocket_api.async_register_command(hass, _ws_list_command_devices)
    websocket_api.async_register_command(hass, _ws_create_command_device)
    websocket_api.async_register_command(hass, _ws_delete_command_device)
    websocket_api.async_register_command(hass, _ws_get_control_panel_state)
    websocket_api.async_register_command(hass, _ws_control_panel_set_setting)
    websocket_api.async_register_command(hass, _ws_control_panel_run_action)
    websocket_api.async_register_command(hass, _ws_fetch_blob)
    websocket_api.async_register_command(hass, _ws_play_ir_blob)
    websocket_api.async_register_command(hass, _ws_persist_ir_blob)
    websocket_api.async_register_command(hass, _ws_backup_export)
    websocket_api.async_register_command(hass, _ws_backup_restore)
    websocket_api.async_register_command(hass, _ws_backup_stash_edited)
    websocket_api.async_register_command(hass, _ws_backup_progress_subscribe)
    websocket_api.async_register_command(hass, _ws_backup_state)
    websocket_api.async_register_command(hass, _ws_backup_clear_result)
    websocket_api.async_register_command(hass, _ws_get_hub_logs)
    websocket_api.async_register_command(hass, _ws_subscribe_hub_logs)
    websocket_api.async_register_command(hass, _ws_subscribe_wifi_presses)
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

    if not hass.data[DOMAIN].get("backup_download_view_registered"):
        hass.http.register_view(SofabatonBackupDownloadView(hass))
        hass.data[DOMAIN]["backup_download_view_registered"] = True

    if not hass.data[DOMAIN].get("stop_listener_registered"):
        async def _async_handle_hass_stop(_event: Any) -> None:
            persisted = await _async_persist_all_hub_cache(hass)
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
    await _async_get_command_config_store(hass)

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

    cache_store = await _async_get_persistent_cache_store(hass)
    hass.data[DOMAIN]["config"][CONF_PERSISTENT_CACHE_ENABLED] = cache_store.enabled
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

    hass.data[DOMAIN][entry.entry_id] = hub

    roku_listener = await async_get_roku_listener(hass)
    await roku_listener.async_set_listen_port(int(roku_listen_port))
    await roku_listener.async_register_hub(hub, enabled=roku_server_enabled)

    # ← important: tell HA to call us when options change
    entry.async_on_unload(
        entry.add_update_listener(async_update_options)
    )

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    await _async_ensure_storage_mode_frontend_resources(hass)
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
            hass.services.async_remove(DOMAIN, "dump_ir_commands")
            hass.services.async_remove(DOMAIN, "fetch_blob")
            hass.services.async_remove(DOMAIN, "backup_bundle")
            hass.services.async_remove(DOMAIN, "restore_backup")
            hass.services.async_remove(DOMAIN, "play_ir_blob")
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
            async_teardown_diagnostics(hass)
            if _get_lovelace_resource_mode(hass) == _LOVELACE_STORAGE_MODE:
                if hass.data[DOMAIN].get("storage_resources_registered"):
                    await _async_unregister_lovelace_resources(hass)
                hass.data[DOMAIN]["storage_resources_registered"] = False
        async_disable_hex_logging_capture(hass, entry.entry_id)
        if hub is not None:
            await _async_persist_hub_cache(hass, hub)
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

    await hass.async_add_executor_job(bounce_hub_listener)



def _raise_if_sync_in_progress(hub: SofabatonHub, operation: str) -> None:
    if bool(getattr(hub, "is_sync_in_progress", False)):
        raise HomeAssistantError(f"sync_in_progress: {operation}")


def _raise_if_backup_operation_in_progress(
    hass: HomeAssistant, hub: SofabatonHub, operation: str
) -> None:
    registry = _backup_operation_registry(hass)
    if registry.has_running_for_entry(hub.entry_id):
        raise HomeAssistantError(f"backup_operation_in_progress: {operation}")


def _raise_if_hub_operation_locked(
    hass: HomeAssistant, hub: SofabatonHub, operation: str
) -> None:
    _raise_if_sync_in_progress(hub, operation)
    _raise_if_backup_operation_in_progress(hass, hub, operation)

async def _async_handle_fetch_device_commands(call: ServiceCall):
    hass = call.hass
    hub = await _async_resolve_hub_from_call(hass, call)
    if hub is None:
        raise ValueError("Could not resolve Sofabaton hub from service call")

    ent_id = call.data["ent_id"]
    await hub.async_fetch_device_commands(ent_id)


async def _async_handle_dump_ir_commands(call: ServiceCall):
    hass = call.hass
    hub = await _async_resolve_hub_from_call(hass, call)
    if hub is None:
        raise ValueError("Could not resolve Sofabaton hub from service call")

    _raise_if_sync_in_progress(hub, "_async_handle_dump_ir_commands")

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


async def _async_handle_fetch_blob(call: ServiceCall):
    hass = call.hass
    hub = await _async_resolve_hub_from_call(hass, call)
    if hub is None:
        raise ValueError("Could not resolve Sofabaton hub from service call")

    _raise_if_sync_in_progress(hub, "_async_handle_fetch_blob")

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


async def _async_handle_backup_bundle(call: ServiceCall):
    """Service handler for ``sofabaton_x1s.backup_bundle``.

    ``device_ids`` (optional list of 1..255 integers) selects a
    device-only bundle; omit it (or pass an empty list) to back up
    everything (all devices + all activities). The return is a
    ``hub_bundle`` payload (see :meth:`SofabatonHub.async_backup_hub`).
    """

    hass = call.hass
    hub = await _async_resolve_hub_from_call(hass, call)
    if hub is None:
        raise ValueError("Could not resolve Sofabaton hub from service call")

    _raise_if_sync_in_progress(hub, "_async_handle_backup_bundle")

    raw_device_ids = call.data.get("device_ids")
    device_ids: list[int] | None
    if raw_device_ids is None:
        device_ids = None
    elif isinstance(raw_device_ids, (list, tuple)):
        if not raw_device_ids:
            device_ids = None
        else:
            device_ids = []
            for raw in raw_device_ids:
                try:
                    value = int(raw)
                except (TypeError, ValueError) as exc:
                    raise ValueError(
                        f"device_ids entries must be integers (got {raw!r})"
                    ) from exc
                if value < 1 or value > 255:
                    raise ValueError(
                        f"device_ids entries must be in 1..255 (got {value})"
                    )
                device_ids.append(value)
    else:
        raise ValueError(
            "device_ids must be a list of device id integers, or omitted "
            "to back up the whole hub"
        )

    return await hub.async_backup_hub(device_ids=device_ids)


async def _async_handle_restore_backup(call: ServiceCall):
    """Service handler for ``sofabaton_x1s.restore_backup``.

    Accepts a ``hub_bundle`` payload (schema_version 5). Devices in
    the bundle are restored first; activities are restored second,
    after the hub has been erased
    (see :meth:`SofabatonHub.async_erase_configuration`).
    """

    hass = call.hass
    hub = await _async_resolve_hub_from_call(hass, call)
    if hub is None:
        raise ValueError("Could not resolve Sofabaton hub from service call")

    _raise_if_sync_in_progress(hub, "_async_handle_restore_backup")

    payload = call.data.get("backup")
    if not isinstance(payload, dict):
        raise ValueError(
            "backup must be an object payload returned by backup_bundle"
        )

    wifi_commands_request_port = _resolve_roku_listen_port(hass, hub.entry_id)

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




async def _async_handle_play_ir_blob(call: ServiceCall):
    hass = call.hass
    hub = await _async_resolve_hub_from_call(hass, call)
    if hub is None:
        raise ValueError("Could not resolve Sofabaton hub from service call")

    _raise_if_sync_in_progress(hub, "_async_handle_play_ir_blob")

    blob_bytes = _parse_play_ir_blob_input(call.data.get("blob"))

    ok = await hub.async_play_ir_blob(blob_bytes)
    if not ok:
        raise HomeAssistantError("Hub is not ready to play IR blob (proxy client connected?)")


async def _async_handle_persist_ir_blob(call: ServiceCall):
    hass = call.hass
    hub = await _async_resolve_hub_from_call(hass, call)
    if hub is None:
        raise ValueError("Could not resolve Sofabaton hub from service call")

    _raise_if_sync_in_progress(hub, "_async_handle_persist_ir_blob")

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


async def _async_handle_create_wifi_device(call: ServiceCall):
    hass = call.hass
    hub = await _async_resolve_hub_from_call(hass, call)
    if hub is None:
        raise ValueError("Could not resolve Sofabaton hub from service call")

    _raise_if_sync_in_progress(hub, "_async_handle_create_wifi_device")

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
        if not _sanitize_wifi_name_for_hub(hub, command_name) or _sanitize_wifi_name_for_hub(hub, command_name) != command_name[:20].strip():
            if _hub_supports_unicode_wifi_names(hub):
                raise ValueError("commands entries must contain only letters (including accented/umlaut), numbers, and spaces")
            raise ValueError("commands entries must contain only letters, numbers, and spaces")
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

    request_port = _resolve_roku_listen_port(hass, hub.entry_id)

    return await hub.async_create_wifi_device(
        device_name=device_name,
        commands=commands,
        request_port=request_port,
        power_on_command_id=power_on_command_id,
        power_off_command_id=power_off_command_id,
        input_command_ids=input_command_ids,
    )


async def _async_handle_device_to_activity(call: ServiceCall):
    hass = call.hass
    hub = await _async_resolve_hub_from_call(hass, call)
    if hub is None:
        raise ValueError("Could not resolve Sofabaton hub from service call")

    _raise_if_sync_in_progress(hub, "_async_handle_device_to_activity")

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
    device_key = str(call.data.get("device_key") or "").strip() or None

    roku_listen_port = _resolve_roku_listen_port(hass, hub.entry_id)
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
