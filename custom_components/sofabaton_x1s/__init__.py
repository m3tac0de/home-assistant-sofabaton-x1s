from __future__ import annotations

import json
import logging
from pathlib import Path
import re
from typing import Any
from urllib.parse import urlparse

import voluptuous as vol

from homeassistant.components import frontend
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.helpers import config_validation as cv
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
)
from .diagnostics import (
    async_disable_hex_logging_capture,
    async_setup_diagnostics,
    async_teardown_diagnostics,
)
from .hub import SofabatonHub
from .roku_listener import async_get_roku_listener

_LOGGER = logging.getLogger(__name__)
_ALPHANUM_SPACE_RE = re.compile(r"^[A-Za-z0-9 ]+$")

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

    # Ensure DOMAIN data is initialized
    hass.data.setdefault(DOMAIN, {})

    if not hass.data[DOMAIN].get("frontend_registered"):
        community_card_dir = Path(
            hass.config.path("www", "community", "sofabaton-virtual-remote")
        )
        community_card_exists = await hass.async_add_executor_job(
            lambda: community_card_dir.exists() and community_card_dir.is_dir()
        )
        if community_card_exists:
            _LOGGER.info(
                "[%s] Skipping frontend injection; community card found at %s",
                DOMAIN,
                community_card_dir,
            )
            return True

        frontend_dir = Path(__file__).parent / "www"
        abs_path = str(frontend_dir.resolve())
        
        _LOGGER.info("[%s] Resolved static path: %s", DOMAIN, abs_path)
        
        if frontend_dir.exists() and frontend_dir.is_dir():
            contents = list(frontend_dir.iterdir())
            _LOGGER.info("[%s] Directory exists. Found %s files: %s", 
                         DOMAIN, len(contents), [f.name for f in contents])
            
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
                url = f"/{DOMAIN}/www/{js_file}"
                _LOGGER.info("[%s] Adding extra JS URL: %s", DOMAIN, url)
                frontend.add_extra_js_url(hass, url)
            
            hass.data[DOMAIN]["frontend_registered"] = True
        else:
            _LOGGER.error("[%s] FRONTEND DIR MISSING: Expected at %s", DOMAIN, abs_path)

    return True


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

    proxy_udp_port = opts.get("proxy_udp_port", DEFAULT_PROXY_UDP_PORT)
    hub_listen_base = opts.get("hub_listen_base", DEFAULT_HUB_LISTEN_BASE)
    proxy_enabled = opts.get(CONF_PROXY_ENABLED, True)
    hex_logging_enabled = opts.get(CONF_HEX_LOGGING_ENABLED, False)
    roku_server_enabled = opts.get(CONF_ROKU_SERVER_ENABLED, False)
    version = data.get(CONF_MDNS_VERSION) or opts.get(CONF_MDNS_VERSION)
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

    if not hass.services.has_service(DOMAIN, "fetch_device_commands"):
        hass.services.async_register(DOMAIN, "fetch_device_commands", _async_handle_fetch_device_commands)
    if not hass.services.has_service(DOMAIN, "create_wifi_device"):
        hass.services.async_register(DOMAIN, "create_wifi_device", _async_handle_create_wifi_device)
    #if not hass.services.has_service(DOMAIN, "create_ip_button"):
    #    hass.services.async_register(DOMAIN, "create_ip_button", _async_handle_create_ip_button)
        
    hass.data[DOMAIN][entry.entry_id] = hub

    roku_listener = await async_get_roku_listener(hass)
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

async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        hub = hass.data[DOMAIN].pop(entry.entry_id, None)
        if not _get_hubs(hass.data[DOMAIN]):
            hass.services.async_remove(DOMAIN, "fetch_device_commands")
            hass.services.async_remove(DOMAIN, "create_wifi_device")
            #hass.services.async_remove(DOMAIN, "create_ip_button")
            async_teardown_diagnostics(hass)
        async_disable_hex_logging_capture(hass, entry.entry_id)
        if hub is not None:
            roku_listener = await async_get_roku_listener(hass)
            await roku_listener.async_remove_hub(entry.entry_id)
            await hub.async_stop()
    return unload_ok
    
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

    return await hub.async_create_wifi_device(
        device_name=device_name,
        commands=commands,
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
    """Try device → hub text → entity → fallback to single hub."""
    domain_data = hass.data.get(DOMAIN, {})
    hubs = _get_hubs(domain_data)

    # 1) device_id from service
    device_id = call.data.get("device")
    if device_id:
        dev_reg = dr.async_get(hass)
        device = dev_reg.async_get(device_id)
        if device:
            # we put (DOMAIN, mac) in device identifiers earlier
            for ident_domain, ident in device.identifiers:
                if ident_domain == DOMAIN:
                    # find hub by mac
                    for hub in hubs:
                        if getattr(hub, "mac", None) == ident:
                            return hub

    # 2) explicit hub field (mac or entry_id)
    hub_key = call.data.get("hub")
    if hub_key:
        # try entry_id
        if hub_key in domain_data and domain_data[hub_key] in hubs:
            return domain_data[hub_key]
        # try mac
        for hub in hubs:
            if getattr(hub, "mac", None) == hub_key:
                return hub

    # 3) entity_id 
    entity_id = call.data.get("entity_id")
    if entity_id:
        ent_reg = er.async_get(hass)
        ent = ent_reg.async_get(entity_id)
        if ent and ent.device_id:
            dev_reg = dr.async_get(hass)
            device = dev_reg.async_get(ent.device_id)
            if device:
                for ident_domain, ident in device.identifiers:
                    if ident_domain == DOMAIN:
                        for hub in hubs:
                            if getattr(hub, "mac", None) == ident:
                                return hub

    # 4) last resort: if there is only 1 hub, just use it
    if len(hubs) == 1:
        return hubs[0]

    return None


def _get_hubs(domain_data: dict[str, Any]) -> list[SofabatonHub]:
    return [
        hub
        for hub in domain_data.values()
        if isinstance(hub, SofabatonHub)
    ]
