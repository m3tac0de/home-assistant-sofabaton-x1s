from __future__ import annotations

import logging
from typing import Any
from urllib.parse import urlparse

import voluptuous as vol

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
    CONF_MDNS_VERSION,
    CONF_ENABLE_X2_DISCOVERY,
)
from .diagnostics import (
    async_disable_hex_logging_capture,
    async_setup_diagnostics,
    async_teardown_diagnostics,
)
from .hub import SofabatonHub

_LOGGER = logging.getLogger(__name__)

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

    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    async_setup_diagnostics(hass)

    data = entry.data
    opts = entry.options

    proxy_udp_port = opts.get("proxy_udp_port", DEFAULT_PROXY_UDP_PORT)
    hub_listen_base = opts.get("hub_listen_base", DEFAULT_HUB_LISTEN_BASE)
    proxy_enabled = opts.get(CONF_PROXY_ENABLED, True)
    hex_logging_enabled = opts.get(CONF_HEX_LOGGING_ENABLED, False)
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
        version=version,
    )
    await hub.async_start()

    hass.data.setdefault(DOMAIN, {})

    if not hass.services.has_service(DOMAIN, "fetch_device_commands"):
        hass.services.async_register(DOMAIN, "fetch_device_commands", _async_handle_fetch_device_commands)
    #if not hass.services.has_service(DOMAIN, "create_ip_button"):
    #    hass.services.async_register(DOMAIN, "create_ip_button", _async_handle_create_ip_button)
        
    hass.data[DOMAIN][entry.entry_id] = hub

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
            #hass.services.async_remove(DOMAIN, "create_ip_button")
            async_teardown_diagnostics(hass)
        async_disable_hex_logging_capture(hass, entry.entry_id)
        if hub is not None:
            await hub.async_stop()
    return unload_ok
    
async def _async_handle_fetch_device_commands(call: ServiceCall):
    hass = call.hass
    hub = await _async_resolve_hub_from_call(hass, call)
    if hub is None:
        raise ValueError("Could not resolve Sofabaton hub from service call")

    ent_id = call.data["ent_id"]
    await hub.async_fetch_device_commands(ent_id)


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
