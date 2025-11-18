from __future__ import annotations

import logging
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.helpers import device_registry as dr, entity_registry as er

from .const import DOMAIN, PLATFORMS, DEFAULT_PROXY_UDP_PORT, DEFAULT_HUB_LISTEN_BASE, CONF_MAC, CONF_PROXY_ENABLED, CONF_HEX_LOGGING_ENABLED
from .hub import SofabatonHub

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    data = entry.data
    opts = entry.options

    proxy_udp_port = opts.get("proxy_udp_port", DEFAULT_PROXY_UDP_PORT)
    hub_listen_base = opts.get("hub_listen_base", DEFAULT_HUB_LISTEN_BASE)

    proxy_enabled = opts.get(CONF_PROXY_ENABLED, True)
    hex_logging_enabled = opts.get(CONF_HEX_LOGGING_ENABLED, False)

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
    )
    await hub.async_start()

    if DOMAIN not in hass.data:
        hass.data[DOMAIN] = {}
        hass.services.async_register(DOMAIN, "fetch_device_commands", _async_handle_fetch_device_commands)
        
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
        if not hass.data[DOMAIN]:
            hass.services.async_remove(DOMAIN, "send_command")
            hass.services.async_remove(DOMAIN, "fetch_device_commands")
            hass.data.pop(DOMAIN)
        if hub is not None:
            await hub.async_stop()
    return unload_ok
    
async def _async_handle_send_command(call: ServiceCall):
    hass = call.hass
    hub = await _async_resolve_hub_from_call(hass, call)
    if hub is None:
        raise ValueError("Could not resolve Sofabaton hub from service call")

    ent_id = call.data["ent_id"]
    key_code = call.data["key_code"]

    await hub.async_send_raw_command(ent_id, key_code)
    
async def _async_handle_fetch_device_commands(call: ServiceCall):
    hass = call.hass
    hub = await _async_resolve_hub_from_call(hass, call)
    if hub is None:
        raise ValueError("Could not resolve Sofabaton hub from service call")

    ent_id = call.data["ent_id"]
    await hub.async_fetch_device_commands(ent_id)

async def _async_resolve_hub_from_call(hass: HomeAssistant, call: ServiceCall):
    """Try device → hub text → entity → fallback to single hub."""
    domain_data = hass.data.get(DOMAIN, {})

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
                    for hub in domain_data.values():
                        if getattr(hub, "mac", None) == ident:
                            return hub

    # 2) explicit hub field (mac or entry_id)
    hub_key = call.data.get("hub")
    if hub_key:
        # try entry_id
        if hub_key in domain_data:
            return domain_data[hub_key]
        # try mac
        for hub in domain_data.values():
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
                        for hub in domain_data.values():
                            if getattr(hub, "mac", None) == ident:
                                return hub

    # 4) last resort: if there is only 1 hub, just use it
    if len(domain_data) == 1:
        return next(iter(domain_data.values()))

    return None