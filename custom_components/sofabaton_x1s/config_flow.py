from __future__ import annotations

import asyncio
import logging
from typing import Any, Dict, Optional

import voluptuous as vol

from homeassistant import config_entries
from homeassistant.components.zeroconf import async_get_instance, ZeroconfServiceInfo
from homeassistant.core import HomeAssistant, callback

from zeroconf.asyncio import AsyncServiceBrowser

from .const import (
    DOMAIN,
    MDNS_TYPE,
    CONF_MAC,
    CONF_HOST,
    CONF_PORT,
    CONF_NAME,
    CONF_MDNS_TXT,
    DEFAULT_PROXY_UDP_PORT,
    DEFAULT_HUB_LISTEN_BASE,
)

_LOGGER = logging.getLogger(__name__)

class _X1Listener:
    def __init__(self) -> None:
        self.services: Dict[str, Dict[str, Any]] = {}
        self._tasks: list[asyncio.Task] = []

    def remove_service(self, zc, type_, name) -> None:
        pass

    async def _add(self, zc, type_, name) -> None:
        info = await zc.async_get_service_info(type_, name)
        if not info:
            return

        props: Dict[str, str] = {}
        for k, v in (info.properties or {}).items():
            if isinstance(k, bytes):
                k = k.decode("utf-8")
            if isinstance(v, bytes):
                v = v.decode("utf-8")
            props[k] = v

        mac = props.get("MAC") or name

        self.services[mac] = {
            "name": props.get("NAME") or name.split(".")[0],
            "host": info.parsed_addresses()[0],
            "port": info.port,
            "props": props,
            "service_name": name,
        }
        _LOGGER.debug("Found Sofabaton hub %s at %s:%s", name, info.parsed_addresses()[0], info.port)

    def add_service(self, zc, type_, name) -> None:
        self._tasks.append(asyncio.create_task(self._add(zc, type_, name)))

    def update_service(self, zc, type_, name) -> None:
        #self._tasks.append(asyncio.create_task(self._add(zc, type_, name)))
        return

class ConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    VERSION = 1

    def __init__(self) -> None:
        self._discovered: Dict[str, Dict[str, Any]] = {}
        self._chosen_hub: Optional[Dict[str, Any]] = None

    # ------------------------------------------------------------------
    # step 1: pick hub (discovered or manual)
    # ------------------------------------------------------------------
    async def async_step_user(self, user_input: Dict[str, Any] | None = None):
        """Let user pick a discovered hub, or choose manual entry."""
        if user_input is not None:
            choice = user_input["hub"]

            if choice == "__manual__":
                # go to manual step
                return await self.async_step_manual()

            # discovered hub selected
            hub_info = self._discovered[choice]
            self._chosen_hub = hub_info
            # go to advanced (ports) step
            return await self.async_step_ports()

        # discover first
        zc = await async_get_instance(self.hass)
        listener = _X1Listener()
        browser = AsyncServiceBrowser(zc, MDNS_TYPE, listener)
        await asyncio.sleep(1.5)
        await browser.async_cancel()
        await asyncio.gather(*listener._tasks, return_exceptions=True)

        # remove already-configured hubs
        configured_macs = {
            entry.data.get(CONF_MAC)
            for entry in self._async_current_entries()
        }
        
        self._discovered = {}
        for mac, info in listener.services.items():
            props = info.get("props") or {}
            # skip our own virtual hub
            if props.get("HA_PROXY") == "1":
                continue
            # skip already configured
            if mac in configured_macs:
                continue
            self._discovered[mac] = info

        options: Dict[str, str] = {}

        if self._discovered:
            for mac, info in self._discovered.items():
                options[mac] = f"{info['name']} ({info['host']})"
                
            _LOGGER.debug("Discovered Sofabaton hubs: %s", list(self._discovered.keys()))

        # always add manual option
        options["__manual__"] = "Manually enter IP and port of your hub"

        schema = vol.Schema({
            vol.Required("hub"): vol.In(options)
        })

        return self.async_show_form(
            step_id="user",
            data_schema=schema,
            description_placeholders={
                "info": (
                    "Select the Sofabaton hub that was discovered on your network, "
                    "or choose manual setup if yours isn’t listed."
                )
            },
        )

    # ------------------------------------------------------------------
    # step manual: user types IP + port + name
    # ------------------------------------------------------------------
    async def async_step_manual(self, user_input: Dict[str, Any] | None = None):
        if user_input is not None:
            # build a hub-like dict
            name = user_input["name"]
            host = user_input["host"]
            port = user_input["port"]
            mac = f"manual-{host.replace('.', '_')}-{port}"

            self._chosen_hub = {
                "name": name,
                "host": host,
                "port": port,
                "props": {},
                "mac": mac,
            }
            return await self.async_step_ports()

        schema = vol.Schema({
            vol.Required("name"): str,
            vol.Required("host"): str,
            vol.Required("port", default=8102): int,
        })
        return self.async_show_form(
            step_id="manual",
            data_schema=schema,
            description_placeholders={
                "help": (
                    "Enter the IP address and port of your Sofabaton hub. "
                    "The default port is 8102."
                )
            },
        )

    # ------------------------------------------------------------------
    # step ports: per-entry (but effectively global) parameters
    # ------------------------------------------------------------------
    async def async_step_ports(self, user_input: Dict[str, Any] | None = None):
        """Let user adjust the two base ports."""
        if self._chosen_hub is None:
            # should not happen
            return self.async_abort(reason="unknown")

        # try to use values from any existing entry as defaults,
        # so the user doesn’t have to retype for every hub
        existing_entries = self._async_current_entries()
        if existing_entries:
            first = existing_entries[0]
            current_proxy_udp = first.options.get("proxy_udp_port", DEFAULT_PROXY_UDP_PORT)
            current_hub_listen_base = first.options.get("hub_listen_base", DEFAULT_HUB_LISTEN_BASE)
        else:
            current_proxy_udp = DEFAULT_PROXY_UDP_PORT
            current_hub_listen_base = DEFAULT_HUB_LISTEN_BASE

        if user_input is not None:
            proxy_udp_port = user_input["proxy_udp_port"]
            hub_listen_base = user_input["hub_listen_base"]

            # finish
            hub_info = self._chosen_hub

            # unique id: prefer MAC from discovery, otherwise manual
            mac = hub_info.get("props", {}).get("MAC") \
                  or hub_info.get("mac") \
                  or hub_info["name"]

            await self.async_set_unique_id(mac)
            self._abort_if_unique_id_configured()

            # build data
            data = {
                CONF_MAC: mac,
                CONF_NAME: hub_info["name"],
                CONF_HOST: hub_info["host"],
                CONF_PORT: hub_info["port"],
                CONF_MDNS_TXT: hub_info.get("props", {}),
            }

            # store ports in options (per entry)
            return self.async_create_entry(
                title=hub_info["name"],
                data=data,
                options={
                    "proxy_udp_port": proxy_udp_port,
                    "hub_listen_base": hub_listen_base,
                },
            )
            
        PORT_VALIDATOR = vol.All(int, vol.Range(min=1, max=65535))
        schema = vol.Schema({
            vol.Required("proxy_udp_port", default=current_proxy_udp): PORT_VALIDATOR,
            vol.Required("hub_listen_base", default=current_hub_listen_base): PORT_VALIDATOR,
        })

        return self.async_show_form(
            step_id="ports",
            data_schema=schema,
            description_placeholders={
                "explain": (
                    "These ports are used by the local proxy that mimics the physical hub. "
                    "Most users can keep the defaults. Change only if the ports are "
                    "already in use."
                    "Note that this setting currently applies to all configured hubs."
                    "The ports represents a base value, and the integration will try"
                    "to find an open port within 32 ports of what you enter here."
                )
            },
        )

    # ------------------------------------------------------------------
    # zeroconf path (auto-discovery)
    # ------------------------------------------------------------------
    async def async_step_zeroconf(self, discovery_info: ZeroconfServiceInfo):
        """Handle auto-discovery via mDNS."""
        props = {}
        for k, v in (discovery_info.properties or {}).items():
            if isinstance(k, bytes):
                k = k.decode("utf-8")
            if isinstance(v, bytes):
                v = v.decode("utf-8")
            props[k] = v

        if props.get("HA_PROXY") == "1":
            return self.async_abort(reason="not_x1_hub")

        name = props.get("NAME") or discovery_info.name.split(".")[0]
        mac = props.get("MAC") or discovery_info.name

        # store so we can use it in confirm step
        self._discovered_from_zeroconf = {
            "name": name,
            "mac": mac,
            "host": discovery_info.host,
            "port": discovery_info.port,
            "props": props,
        }

        # set unique id so HA can match/ignore properly
        await self.async_set_unique_id(mac)
        self._abort_if_unique_id_configured(
            {
                CONF_HOST: discovery_info.host,
                CONF_PORT: discovery_info.port,
                CONF_MDNS_TXT: props,
            }
        )

        # show a confirm form instead of auto-creating
        return self.async_show_form(
            step_id="zeroconf_confirm",
            description_placeholders={"name": name, "host": discovery_info.host},
            data_schema=vol.Schema({}),
        )

    async def async_step_zeroconf_confirm(self, user_input=None):
        """User clicked 'submit' on the discovery confirmation."""
        info = self._discovered_from_zeroconf
        self._chosen_hub = {
            "name": info["name"],
            "host": info["host"],
            "port": info["port"],
            "props": info.get("props", {}),
            "mac": info["mac"],
        }

        # now ask for ports, just like the other path
        return await self.async_step_ports()
        
        # return self.async_create_entry(
            # title=info["name"],
            # data={
                # CONF_MAC: info["mac"],
                # CONF_NAME: info["name"],
                # CONF_HOST: info["host"],
                # CONF_PORT: info["port"],
                # CONF_MDNS_TXT: info["props"],
            # },
            # # drop defaults in here too
            # options={
                # "proxy_udp_port": DEFAULT_PROXY_UDP_PORT,
                # "hub_listen_base": DEFAULT_HUB_LISTEN_BASE,
            # },
        # )

    @staticmethod
    @callback
    def async_get_options_flow(config_entry):
        """Return the options flow for this entry."""
        return SofabatonOptionsFlowHandler(config_entry)


# ----------------------------------------------------------------------
# options flow — user can later change the two port bases
# ----------------------------------------------------------------------
class SofabatonOptionsFlowHandler(config_entries.OptionsFlow):
    def __init__(self, entry: config_entries.ConfigEntry) -> None:
        self.entry = entry

    async def async_step_init(self, user_input: Dict[str, Any] | None = None):
        if user_input is not None:
            return self.async_create_entry(title="Sofabaton options", data=user_input)
            
        PORT_VALIDATOR = vol.All(int, vol.Range(min=1, max=65535))
        schema = vol.Schema({
            vol.Required(
                "proxy_udp_port",
                default=self.entry.options.get("proxy_udp_port", DEFAULT_PROXY_UDP_PORT),
            ): PORT_VALIDATOR,
            vol.Required(
                "hub_listen_base",
                default=self.entry.options.get("hub_listen_base", DEFAULT_HUB_LISTEN_BASE),
            ): PORT_VALIDATOR,
        })

        return self.async_show_form(
            step_id="init",
            data_schema=schema,
            description_placeholders={
                "note": "These values apply to this Sofabaton integration entry and will be used when starting the local proxy."
            },
        )



