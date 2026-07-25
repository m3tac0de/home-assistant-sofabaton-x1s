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
    CONF_ENABLE_X2_DISCOVERY,
    CONF_ROKU_LISTEN_PORT,
    HUB_VERSION_X1,
    HUB_VERSION_X1S,
    HUB_VERSION_X2,
    MDNS_SERVICE_TYPES,
    DEFAULT_ROKU_LISTEN_PORT,
    classify_hub_version,
    format_hub_entry_title,
    HVER_BY_HUB_VERSION,
)

_LOGGER = logging.getLogger(__name__)


def generate_static_mac(host: str, port: int) -> str:
    """Generate a stable, locally administered MAC-like address."""

    raw_str = f"{host}:{port}"
    hash_bytes = hashlib.md5(raw_str.encode()).digest()

    mac_int = bytearray(hash_bytes[:6])
    mac_int[0] = (mac_int[0] & 0xFE) | 0x02

    return ":".join(f"{b:02x}" for b in mac_int)


def _decode_properties(raw_props: Optional[Dict[str, str | bytes]]) -> Dict[str, str]:
    props: Dict[str, str] = {}
    for k, v in (raw_props or {}).items():
        if isinstance(k, bytes):
            k = k.decode("utf-8")
        if isinstance(v, bytes):
            v = v.decode("utf-8")
        props[k] = v
    return props


def _prepare_discovered_hub(discovery_info: ZeroconfServiceInfo) -> Dict[str, Any] | None:
    """Normalize zeroconf discovery details or return None if unsupported."""

    service_type = getattr(discovery_info, "type", None)
    if service_type not in MDNS_SERVICE_TYPES:
        return None

    props = _decode_properties(discovery_info.properties)

    if props.get("HA_PROXY") == "1":
        return None

    name = props.get("NAME") or discovery_info.name.split(".")[0]
    mac = props.get("MAC") or discovery_info.name
    try:
        version = classify_hub_version(props)
    except ValueError as err:
        # Surface unknown firmware lineages instead of silently
        # inheriting an existing variant's wire layout. A discovery
        # we cannot classify is skipped here and re-evaluated on the
        # next advertisement once the user upgrades the integration.
        _LOGGER.warning("Ignoring discovery for unrecognised hub: %s", err)
        return None

    return {
        "name": name,
        "mac": mac,
        "host": discovery_info.host,
        "port": discovery_info.port,
        "props": props,
        "version": version,
        "service_type": service_type,
    }

class ConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    VERSION = 1

    def __init__(self) -> None:
        self._chosen_hub: Optional[Dict[str, Any]] = None
        self._discovered_from_zeroconf: Optional[Dict[str, Any]] = None

    def _x2_enabled(self) -> bool:
        hass = getattr(self, "hass", None)
        if hass is None:
            return True
        return bool(
            hass.data.get(DOMAIN, {})
            .get("config", {})
            .get(CONF_ENABLE_X2_DISCOVERY, True)
        )


    # ------------------------------------------------------------------
    # step 1: pick hub (discovered or manual)
    # ------------------------------------------------------------------
    async def async_step_user(self, user_input: Dict[str, Any] | None = None):
        """Start manual entry when the user initiates the flow."""

        return await self.async_step_manual(user_input)

    # ------------------------------------------------------------------
    # step manual: user types IP address only
    # ------------------------------------------------------------------
    async def async_step_manual(self, user_input: Dict[str, Any] | None = None):
        if user_input is not None:
            # build a hub-like dict
            host = user_input["host"]
            port = DEFAULT_PROXY_UDP_PORT
            mac = generate_static_mac(host, port)
            props = {"MAC": mac}

            # Manual entry has no mDNS advertisement, so the variant is
            # not yet known. Leave ``version`` unset and let the post-
            # connect banner resolve it on first proxy handshake.
            self._chosen_hub = {
                "name": host,
                "host": host,
                "port": port,
                "props": props,
                "mac": mac,
                "version": None,
            }
            return await self.async_step_ports()

        schema = vol.Schema({
            vol.Required("host"): str,
        })
        return self.async_show_form(
            step_id="manual",
            data_schema=schema,
        )

    # ------------------------------------------------------------------
    # step ports: per-entry (but effectively global) listener parameters
    # ------------------------------------------------------------------
    async def async_step_ports(self, user_input: Dict[str, Any] | None = None):
        """Let user adjust the shared listener ports."""
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
            current_roku_listen_port = first.options.get(CONF_ROKU_LISTEN_PORT, DEFAULT_ROKU_LISTEN_PORT)
        else:
            current_proxy_udp = DEFAULT_PROXY_UDP_PORT
            current_hub_listen_base = DEFAULT_HUB_LISTEN_BASE
            current_roku_listen_port = DEFAULT_ROKU_LISTEN_PORT

        if user_input is not None:
            proxy_udp_port = user_input["proxy_udp_port"]
            hub_listen_base = user_input["hub_listen_base"]
            roku_listen_port = user_input.get(CONF_ROKU_LISTEN_PORT, current_roku_listen_port)

            # sync shared port settings back to all existing entries
            shared_options = {
                "proxy_udp_port": proxy_udp_port,
                "hub_listen_base": hub_listen_base,
                CONF_ROKU_LISTEN_PORT: roku_listen_port,
            }
            for existing_entry in self._async_current_entries():
                merged = {**existing_entry.options, **shared_options}
                if merged != existing_entry.options:
                    self.hass.config_entries.async_update_entry(
                        existing_entry,
                        options=merged,
                    )

            # finish
            hub_info = self._chosen_hub

            # unique id: prefer MAC from discovery, otherwise manual
            mac = hub_info.get("props", {}).get("MAC") \
                  or hub_info.get("mac") \
                  or hub_info["name"]

            await self.async_set_unique_id(mac)
            self._abort_if_unique_id_configured()

            # build data. ``version`` may be ``None`` for manual entries
            # where no mDNS advertisement was seen; the proxy resolves
            # it on first connect via the hub banner.
            version = hub_info.get("version")
            if not version:
                props = hub_info.get("props", {})
                try:
                    version = classify_hub_version(props)
                except ValueError:
                    version = None
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
                title=format_hub_entry_title(version, hub_info["host"], mac),
                data=data,
                options={
                    "proxy_udp_port": proxy_udp_port,
                    "hub_listen_base": hub_listen_base,
                    CONF_ROKU_LISTEN_PORT: roku_listen_port,
                    CONF_MDNS_VERSION: version,
                },
            )
            
        PORT_VALIDATOR = vol.All(int, vol.Range(min=1, max=65535))
        schema = vol.Schema({
            vol.Required("proxy_udp_port", default=current_proxy_udp): PORT_VALIDATOR,
            vol.Required("hub_listen_base", default=current_hub_listen_base): PORT_VALIDATOR,
            vol.Required(CONF_ROKU_LISTEN_PORT, default=current_roku_listen_port): PORT_VALIDATOR,
        })

        return self.async_show_form(
            step_id="ports",
            data_schema=schema,
        )

    # ------------------------------------------------------------------
    # zeroconf path (auto-discovery)
    # ------------------------------------------------------------------
    async def async_step_zeroconf(self, discovery_info: ZeroconfServiceInfo):
        """Handle auto-discovery via mDNS."""
        discovered_hub = _prepare_discovered_hub(discovery_info)
        if discovered_hub is None:
            return self.async_abort(reason="not_x1_hub")

        props = discovered_hub["props"]
        name = discovered_hub["name"]
        mac = discovered_hub["mac"]
        host = discovered_hub["host"]
        version = discovered_hub["version"]
        if version == HUB_VERSION_X2 and not self._x2_enabled():
            return self.async_abort(reason="x2_disabled")

        _LOGGER.info(
            "Zeroconf discovered Sofabaton hub %s (%s) at %s:%s model %s with TXT %s via %s",
            name,
            mac,
            host,
            discovery_info.port,
            version,
            props,
            discovered_hub["service_type"],
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
            "service_type": discovered_hub["service_type"],
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
# options flow — user can later change shared listener ports
# ----------------------------------------------------------------------
class SofabatonOptionsFlowHandler(config_entries.OptionsFlow):
    def __init__(self, entry: config_entries.ConfigEntry) -> None:
        self.entry = entry

    async def async_step_init(self, user_input: Dict[str, Any] | None = None):
        return await self.async_step_ports(user_input)


    async def async_step_ports(self, user_input: Dict[str, Any] | None = None):
        PORT_VALIDATOR = vol.All(int, vol.Range(min=1, max=65535))
        shared_option_keys = ("proxy_udp_port", "hub_listen_base", CONF_ROKU_LISTEN_PORT)

        if user_input is not None:
            new_options = {
                **self.entry.options,
                **user_input,
            }

            shared_options = {
                key: new_options[key] for key in shared_option_keys if key in new_options
            }

            for existing_entry in self.hass.config_entries.async_entries(DOMAIN):
                merged_options = {
                    **existing_entry.options,
                    **shared_options,
                }
                if merged_options == existing_entry.options:
                    continue

                self.hass.config_entries.async_update_entry(
                    existing_entry,
                    options=merged_options,
                )

            self.hass.config_entries.async_update_entry(
                self.entry,
                data={
                    **self.entry.data,
                },
            )

            return self.async_create_entry(title="", data=new_options)

        schema = vol.Schema({
            vol.Required(
                "proxy_udp_port",
                default=self.entry.options.get("proxy_udp_port", DEFAULT_PROXY_UDP_PORT),
            ): PORT_VALIDATOR,
            vol.Required(
                "hub_listen_base",
                default=self.entry.options.get("hub_listen_base", DEFAULT_HUB_LISTEN_BASE),
            ): PORT_VALIDATOR,
            vol.Required(
                CONF_ROKU_LISTEN_PORT,
                default=self.entry.options.get(CONF_ROKU_LISTEN_PORT, DEFAULT_ROKU_LISTEN_PORT),
            ): PORT_VALIDATOR,
        })

        return self.async_show_form(
            step_id="ports",
            data_schema=schema,
        )
