from __future__ import annotations

import hashlib
import logging
from typing import Any, Dict, Optional

import voluptuous as vol

from homeassistant import config_entries
from homeassistant.helpers.service_info.zeroconf import ZeroconfServiceInfo
from homeassistant.core import callback

from .const import (
    DOMAIN,
    CONF_MAC,
    CONF_HOST,
    CONF_PORT,
    CONF_NAME,
    CONF_MDNS_TXT,
    CONF_MDNS_VERSION,
    DEFAULT_PROXY_UDP_PORT,
    DEFAULT_HUB_LISTEN_BASE,
    X1S_NO_THRESHOLD,
    CONF_NOTIFY_BROADCASTS,
)

_LOGGER = logging.getLogger(__name__)


def _classify_version(props: Dict[str, str]) -> str:
    no_field = props.get("NO")
    if no_field is not None:
        try:
            no_value = int(str(no_field))
        except ValueError:
            pass
        else:
            if no_value >= X1S_NO_THRESHOLD:
                return "X1S"
            return "X1"

    return "X1"


def generate_static_mac(host: str, port: int) -> str:
    """Generate a stable, locally administered MAC-like address."""

    raw_str = f"{host}:{port}"
    hash_bytes = hashlib.md5(raw_str.encode()).digest()

    mac_int = bytearray(hash_bytes[:6])
    mac_int[0] = (mac_int[0] & 0xFE) | 0x02

    return ":".join(f"{b:02x}" for b in mac_int)

class ConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    VERSION = 1

    def __init__(self) -> None:
        self._chosen_hub: Optional[Dict[str, Any]] = None

    # ------------------------------------------------------------------
    # step 1: pick hub (discovered or manual)
    # ------------------------------------------------------------------
    async def async_step_user(self, user_input: Dict[str, Any] | None = None):
        """Start manual entry when the user initiates the flow."""

        return await self.async_step_manual(user_input)

    # ------------------------------------------------------------------
    # step manual: user types IP + port + name
    # ------------------------------------------------------------------
    async def async_step_manual(self, user_input: Dict[str, Any] | None = None):
        if user_input is not None:
            # build a hub-like dict
            name = user_input["name"]
            host = user_input["host"]
            port = user_input["port"]
            mac = generate_static_mac(host, port)
            props = {"MAC": mac, "NAME": name}

            self._chosen_hub = {
                "name": name,
                "host": host,
                "port": port,
                "props": props,
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
            current_notify_broadcasts = first.options.get(CONF_NOTIFY_BROADCASTS, False)
        else:
            current_proxy_udp = DEFAULT_PROXY_UDP_PORT
            current_hub_listen_base = DEFAULT_HUB_LISTEN_BASE
            current_notify_broadcasts = False

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
            version = hub_info.get("version") or _classify_version(hub_info.get("props", {}))
            data = {
                CONF_MAC: mac,
                CONF_NAME: hub_info["name"],
                CONF_HOST: hub_info["host"],
                CONF_PORT: hub_info["port"],
                CONF_MDNS_TXT: hub_info.get("props", {}),
                CONF_MDNS_VERSION: version,
            }

            # store ports in options (per entry)
            return self.async_create_entry(
                title=hub_info["name"],
                data=data,
                options={
                    "proxy_udp_port": proxy_udp_port,
                    "hub_listen_base": hub_listen_base,
                    CONF_MDNS_VERSION: version,
                    CONF_NOTIFY_BROADCASTS: user_input.get(
                        CONF_NOTIFY_BROADCASTS, False
                    ),
                },
            )
            
        PORT_VALIDATOR = vol.All(int, vol.Range(min=1, max=65535))
        schema = vol.Schema({
            vol.Required("proxy_udp_port", default=current_proxy_udp): PORT_VALIDATOR,
            vol.Required("hub_listen_base", default=current_hub_listen_base): PORT_VALIDATOR,
            vol.Optional(
                CONF_NOTIFY_BROADCASTS, default=current_notify_broadcasts
            ): bool,
        })

        return self.async_show_form(
            step_id="ports",
            data_schema=schema,
            description_placeholders={
                "explain": (
                    "These are ports that this integration binds to. Most users can keep "
                    "the defaults: UDP now defaults to 8102 so CALL_ME and NOTIFY_ME share a "
                    "single listener compatible with Android and iOS. Change only if the port "
                    "is already in use; a non-8102 UDP port may prevent iOS discovery. "
                    "This setting currently applies to all configured hubs. The ports represent "
                    "a base value, and the integration will try to find an open port within 32 "
                    "ports of what you enter here. The UDP port is optional; if you disable the "
                    "proxy capability of the integration, no UDP port is used."
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
        host = discovery_info.host
        version = _classify_version(props)
        no_field = props.get("NO")

        _LOGGER.info(
            "Zeroconf discovered Sofabaton hub %s (%s) at %s:%s model %s (NO=%s) with TXT %s",
            name,
            mac,
            host,
            discovery_info.port,
            version,
            no_field,
            props,
        )

        self.context["title_placeholders"] = {"name": f"{name} ({host})"}
        # store so we can use it in confirm step
        self._discovered_from_zeroconf = {
            "name": name,
            "mac": mac,
            "host": discovery_info.host,
            "port": discovery_info.port,
            "props": props,
            "version": version,
        }

        # set unique id so HA can match/ignore properly
        await self.async_set_unique_id(mac)

        existing_entry = next(
            (
                entry
                for entry in self._async_current_entries()
                if entry.unique_id == mac
            ),
            None,
        )

        if existing_entry is not None:
            if (
                existing_entry.data.get(CONF_HOST) == host
                and existing_entry.data.get(CONF_PORT) == discovery_info.port
                and existing_entry.data.get(CONF_MDNS_TXT, {}) == props
            ):
                return self.async_abort(reason="already_configured")

            new_data = {
                **existing_entry.data,
                CONF_HOST: host,
                CONF_PORT: discovery_info.port,
                CONF_MDNS_TXT: props,
                CONF_MDNS_VERSION: version,
            }
            self.hass.config_entries.async_update_entry(
                existing_entry,
                data=new_data,
            )
            return self.async_abort(reason="already_configured")

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
            "version": info.get("version"),
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
            vol.Optional(
                CONF_NOTIFY_BROADCASTS,
                default=self.entry.options.get(CONF_NOTIFY_BROADCASTS, False),
            ): bool,
        })

        return self.async_show_form(
            step_id="init",
            data_schema=schema,
            description_placeholders={
                "explain": (
                    "These are ports that this integration binds to. "
                    "Most users can keep the defaults. Change only if the ports are "
                    "already in use."
                    "Note that this setting currently applies to all configured hubs."
                    "The ports represents a base value, and the integration will try"
                    "to find an open port within 32 ports of what you enter here."
                    "The UDP port is optional; if you disable the proxy capabilty of"
                    "the integration, no UDP port is used."
                )
            },
        )



