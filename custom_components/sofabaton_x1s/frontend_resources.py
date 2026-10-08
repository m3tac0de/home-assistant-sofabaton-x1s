"""The integration's frontend resources (R6, CR-H2-13).

The card bundles and loader URL, the Lovelace storage-mode resource
registration and removal, and the integration and remote-card version
readers.
"""

from __future__ import annotations

import asyncio
import json
import logging
from pathlib import Path
import re
from typing import Any
from urllib.parse import urlparse

from homeassistant.core import HomeAssistant
from homeassistant.helpers.event import async_call_later

from .const import (
    DOMAIN,
)

# Same logger name as the package: log lines keep their source name.
_LOGGER = logging.getLogger(__package__)


_FRONTEND_URL_BASE = f"/{DOMAIN}/www"


_TOOLS_CARD_FILENAME = "tools-card.js"


_REMOTE_CARD_FILENAME = "remote-card.js"


# The sidebar panel module (the remote view + the admin toggle to the
# control panel); never a Lovelace resource.
_SIDEBAR_PANEL_FILENAME = "sidebar-panel.js"


_CARD_LOADER_FILENAME = "card-loader.js"


_COMMUNITY_REMOTE_CARD_DIRNAME = "sofabaton-virtual-remote"


_LOVELACE_STORAGE_MODE = "storage"


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
