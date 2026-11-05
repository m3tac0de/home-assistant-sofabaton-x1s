from __future__ import annotations

import asyncio
import functools
import hashlib
import ipaddress
import logging
import re
from typing import Any, Dict, Optional

import voluptuous as vol

from homeassistant import config_entries
from homeassistant.components.zeroconf import async_get_instance as async_get_zeroconf_instance
from homeassistant.helpers.selector import (
    SelectOptionDict,
    SelectSelector,
    SelectSelectorConfig,
    SelectSelectorMode,
)
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
    CONF_BANNER_MAC,
    HUB_VERSION_X2,
    MDNS_SERVICE_TYPES,
    DEFAULT_ROKU_LISTEN_PORT,
    PORTS_DOCS_URL,
    classify_hub_version,
    format_hub_entry_title,
)
from .lib.discovery import DiscoveredHub, discover_hubs
from .listener_ports import (
    DEFAULT_LISTENER_PORTS,
    PORT_FIELDS,
    PORT_KEYS,
    async_apply_listener_ports,
    ports_in_use,
)

_LOGGER = logging.getLogger(__name__)

# How long "Add integration" listens for hub advertisements. Hubs answer
# an mDNS query within a second; the margin covers a slow Wi-Fi hop.
_SCAN_SECONDS = 4.0

# The pick list's last row; never a valid host, so it cannot collide.
_MANUAL_CHOICE = "manual"

# The listener ports every hub shares, and the check for ports in use,
# live in listener_ports (the control panel's Settings tab uses them too).
_PORT_FIELDS = PORT_FIELDS


def generate_static_mac(host: str, port: int) -> str:
    """Generate a stable, locally administered MAC-like address."""

    raw_str = f"{host}:{port}"
    hash_bytes = hashlib.md5(raw_str.encode()).digest()

    mac_int = bytearray(hash_bytes[:6])
    mac_int[0] = (mac_int[0] & 0xFE) | 0x02

    return ":".join(f"{b:02x}" for b in mac_int)


def _normalized_mac(value: Any) -> str:
    """A MAC in any of its spellings (colons, case) as 12 lowercase hex."""

    text = re.sub(r"[^0-9a-f]", "", str(value or "").lower())
    return text if len(text) == 12 else ""


def _valid_ipv4(value: str) -> bool:
    try:
        return ipaddress.ip_address(value).version == 4
    except ValueError:
        return False


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


def _hub_from_scan(hub: DiscoveredHub) -> Dict[str, Any] | None:
    """The scan's counterpart of _prepare_discovered_hub: same shape and
    the same rules (no proxies, no unrecognised firmware lineage, the
    instance name standing in for a missing MAC)."""

    if hub.is_proxy:
        return None
    if hub.hub_version is None:
        _LOGGER.debug("Hub scan skipped unrecognised hub %s at %s", hub.name, hub.host)
        return None
    return {
        "name": hub.name,
        "mac": hub.mac or hub.instance_name,
        "host": hub.host,
        "port": hub.port,
        "props": dict(hub.txt),
        "version": hub.hub_version,
        "service_type": hub.service_type,
    }


def _hub_choice_label(hub: Dict[str, Any]) -> str:
    return f"{hub['name']} ({hub['version']}, {hub['host']})"


def _hub_unique_id(hub: Dict[str, Any]) -> str:
    """Prefer the MAC from the advertisement, then the flow's own id."""

    return hub.get("props", {}).get("MAC") or hub.get("mac") or hub["name"]


class ConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    VERSION = 1

    def __init__(self) -> None:
        self._chosen_hub: Optional[Dict[str, Any]] = None
        self._discovered_from_zeroconf: Optional[Dict[str, Any]] = None
        self._scan_task: Optional[asyncio.Task] = None
        self._found_hubs: list[Dict[str, Any]] = []
        self._port_proposal: Optional[Dict[str, int]] = None
        self._port_conflicts: Dict[str, Optional[int]] = {}

    def _entry_for_hub(self, *, host: str, mac: str = ""):
        """An existing entry for the same hub under another identity.

        A manual entry's id is a synthetic MAC and a discovered one's the
        real MAC, so the ids never match for one hub (CR-H3-4): the host,
        or the MAC the hub reported in its banner, finds it instead.
        """

        wanted_mac = _normalized_mac(mac)
        for entry in self._async_current_entries():
            if host and entry.data.get(CONF_HOST) == host:
                return entry
            if wanted_mac and _normalized_mac(entry.data.get(CONF_BANNER_MAC)) == wanted_mac:
                return entry
        return None

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
    # step 1: search the network; the IP form is only the fallback
    # ------------------------------------------------------------------
    async def async_step_user(self, user_input: Dict[str, Any] | None = None):
        """Search the network for hubs before asking for anything.

        Home Assistant's own discovery only knows our service types after
        a restart, so a fresh install (the 2026.11 Marketplace opens this
        flow without one) would otherwise land on the IP form.
        """

        if self._scan_task is None:
            self._scan_task = self.hass.async_create_task(self._async_scan_hubs())
        if not self._scan_task.done():
            return self.async_show_progress(
                step_id="user",
                progress_action="scan",
                progress_task=self._scan_task,
            )

        task, self._scan_task = self._scan_task, None
        try:
            self._found_hubs = task.result()
        except asyncio.CancelledError:
            self._found_hubs = []

        return self.async_show_progress_done(
            next_step_id="pick_hub" if self._found_hubs else "no_hubs"
        )

    async def _async_scan_hubs(self) -> list[Dict[str, Any]]:
        """Never raises: a scan that fails is a scan that found nothing."""

        try:
            # Always HA's shared zeroconf: an integration must never open
            # its own (discover_hubs would, given no instance).
            zc = await async_get_zeroconf_instance(self.hass)
            if zc is None:
                return []
            scanned = await self.hass.async_add_executor_job(
                functools.partial(discover_hubs, _SCAN_SECONDS, zc=zc)
            )
        except Exception:  # noqa: BLE001
            _LOGGER.debug("Hub scan failed", exc_info=True)
            return []
        return self._new_hubs(scanned)

    def _new_hubs(self, scanned: list[DiscoveredHub]) -> list[Dict[str, Any]]:
        """Hubs worth offering: not configured yet, one row per hub."""

        configured_ids = {entry.unique_id for entry in self._async_current_entries()}
        by_host: Dict[str, Dict[str, Any]] = {}
        for item in scanned:
            hub = _hub_from_scan(item)
            if hub is None:
                continue
            if hub["version"] == HUB_VERSION_X2 and not self._x2_enabled():
                continue
            if hub["mac"] in configured_ids or self._entry_for_hub(
                host=hub["host"], mac=hub["mac"]
            ) is not None:
                continue
            # An X2 answers on both service types; one row per address.
            by_host.setdefault(hub["host"], hub)
        return sorted(by_host.values(), key=lambda hub: (hub["name"].casefold(), hub["host"]))

    async def async_step_rescan(self, user_input: Dict[str, Any] | None = None):
        return await self.async_step_user()

    async def async_step_no_hubs(self, user_input: Dict[str, Any] | None = None):
        """Nothing found: search again, or fall back to the IP address."""

        return self.async_show_menu(step_id="no_hubs", menu_options=["rescan", "manual"])

    async def async_step_pick_hub(self, user_input: Dict[str, Any] | None = None):
        """The hubs the search found, the first one chosen, with "a hub
        that is not listed" as the last row: a hub on another subnet never
        shows up in a search.

        One hub per run, never several: Home Assistant's success dialog
        (device name and area) only covers the entry its own flow made.
        That dialog names the other hubs found and how to add them.
        """

        hubs = {hub["host"]: hub for hub in self._found_hubs}
        if not hubs:
            return await self.async_step_no_hubs()

        if user_input is not None:
            choice = user_input.get("hub")
            if choice == _MANUAL_CHOICE:
                return await self.async_step_manual()
            if choice in hubs:
                return await self._async_continue_with(hubs[choice])

        options = [
            SelectOptionDict(value=host, label=_hub_choice_label(hub))
            for host, hub in hubs.items()
        ]
        # Hub rows keep their own label (no translation exists for an
        # address); the manual row is translated through translation_key.
        options.append(
            SelectOptionDict(value=_MANUAL_CHOICE, label="A hub that is not listed (enter its IP address)")
        )
        schema = vol.Schema({
            vol.Required("hub", default=next(iter(hubs))): SelectSelector(
                SelectSelectorConfig(
                    options=options,
                    mode=SelectSelectorMode.LIST,
                    translation_key="hub_choice",
                )
            ),
        })
        return self.async_show_form(step_id="pick_hub", data_schema=schema)

    async def _async_continue_with(self, hub: Dict[str, Any]):
        self._chosen_hub = {
            "name": hub["name"],
            "host": hub["host"],
            "port": hub["port"],
            "props": hub.get("props", {}),
            "mac": hub["mac"],
            "version": hub.get("version"),
        }
        return await self._async_create_hub_entry()

    # ------------------------------------------------------------------
    # step manual: user types IP address only
    # ------------------------------------------------------------------
    async def async_step_manual(self, user_input: Dict[str, Any] | None = None):
        errors: Dict[str, str] = {}
        if user_input is not None:
            # The shared hub listener matches the hub's dial-back by its
            # exact IP, so a name or a stray space could never connect
            # (CR-H3-3); the text entity applies the same rule.
            host = str(user_input.get("host") or "").strip()
            if not _valid_ipv4(host):
                errors["host"] = "invalid_host"
        if user_input is not None and not errors:
            if self._entry_for_hub(host=host) is not None:
                return self.async_abort(reason="already_configured")
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
            return await self._async_create_hub_entry()

        schema = vol.Schema({
            vol.Required("host"): str,
        })
        return self.async_show_form(
            step_id="manual",
            data_schema=schema,
            errors=errors,
        )

    # ------------------------------------------------------------------
    # entry creation: ports are only asked for when a default is taken
    # ------------------------------------------------------------------
    def _shared_port_options(self) -> Dict[str, int]:
        """The listener ports every hub shares: an existing hub's, else
        the defaults. Changed later from the entry's cogwheel (options
        flow), which writes them to every hub."""

        existing = self._async_current_entries(include_ignore=False)
        options = existing[0].options if existing else {}
        return {
            "proxy_udp_port": options.get("proxy_udp_port", DEFAULT_PROXY_UDP_PORT),
            "hub_listen_base": options.get("hub_listen_base", DEFAULT_HUB_LISTEN_BASE),
            CONF_ROKU_LISTEN_PORT: options.get(CONF_ROKU_LISTEN_PORT, DEFAULT_ROKU_LISTEN_PORT),
        }

    async def _async_ports_in_use(self, ports: Dict[str, int]) -> Dict[str, Optional[int]]:
        return await self.hass.async_add_executor_job(ports_in_use, ports)

    async def async_step_ports(self, user_input: Dict[str, Any] | None = None):
        """The first hub, with a default port already taken on this host.

        Each taken port is marked on its field with a free stand-in filled
        in; Submit checks the ports again, so a port taken in the meantime
        is caught here and not at setup.
        """

        if self._chosen_hub is None or self._port_proposal is None:
            return self.async_abort(reason="unknown")

        errors: Dict[str, str] = {}
        if user_input is not None and self._async_current_entries(include_ignore=False):
            # Another hub was set up meanwhile and now holds the shared
            # ports: this one joins it on those.
            return self._async_finish_hub_entry(self._shared_port_options())
        if user_input is not None:
            ports = {key: int(user_input[key]) for key, *_ in _PORT_FIELDS}
            self._port_conflicts = await self._async_ports_in_use(ports)
            if ports["hub_listen_base"] == ports[CONF_ROKU_LISTEN_PORT]:
                errors[CONF_ROKU_LISTEN_PORT] = "same_port"
            if not self._port_conflicts and not errors:
                return self._async_finish_hub_entry(ports)
            self._port_proposal = ports

        placeholders = {"docs_url": PORTS_DOCS_URL}
        for key, _udp, _stand_ins, error, prefix in _PORT_FIELDS:
            busy = key in self._port_conflicts
            stand_in = self._port_conflicts.get(key)
            placeholders[f"{prefix}_busy"] = str(self._port_proposal[key]) if busy else ""
            placeholders[f"{prefix}_free"] = str(stand_in) if stand_in is not None else ""
            if busy:
                errors[key] = error if stand_in is not None else "port_in_use_no_free"
        proposal = {
            **self._port_proposal,
            **{key: port for key, port in self._port_conflicts.items() if port is not None},
        }

        port_field = vol.All(int, vol.Range(min=1, max=65535))
        schema = vol.Schema({
            vol.Required(key, default=proposal[key]): port_field for key, *_ in _PORT_FIELDS
        })
        return self.async_show_form(
            step_id="ports",
            data_schema=schema,
            errors=errors,
            description_placeholders=placeholders,
        )

    async def _async_create_hub_entry(self):
        hub_info = self._chosen_hub
        if hub_info is None:
            # should not happen
            return self.async_abort(reason="unknown")

        mac = _hub_unique_id(hub_info)

        # raise_on_progress=False: a hub picked from the scan may also
        # sit in Discovered; that card's flow is aborted when this
        # entry is created, it must not abort this one.
        await self.async_set_unique_id(mac, raise_on_progress=False)
        self._abort_if_unique_id_configured()

        ports = self._shared_port_options()
        if not self._async_current_entries(include_ignore=False):
            # The first hub: none of ours holds the ports yet, so whether
            # the defaults are free can be checked before the entry exists.
            conflicts = await self._async_ports_in_use(ports)
            if conflicts:
                self._port_proposal = ports
                self._port_conflicts = conflicts
                return await self.async_step_ports()
        return self._async_finish_hub_entry(ports)

    def _async_finish_hub_entry(self, ports: Dict[str, int]):
        hub_info = self._chosen_hub
        if hub_info is None:
            return self.async_abort(reason="unknown")
        mac = _hub_unique_id(hub_info)
        # Again: the ports step may have waited while the same hub was
        # added from its Discovered card.
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

        # One hub per run: the success dialog names the other hubs the
        # search found and says how to add the next one.
        others = [
            hub["name"]
            for hub in self._found_hubs
            if hub["host"] != hub_info["host"] and _hub_unique_id(hub) != mac
        ]
        extra: Dict[str, Any] = {}
        if others:
            extra = {
                "description": "more_hubs_found",
                "description_placeholders": {"others": ", ".join(others)},
            }

        # store ports in options (per entry)
        return self.async_create_entry(
            title=format_hub_entry_title(version, hub_info["host"], mac),
            data=data,
            options={**ports, CONF_MDNS_VERSION: version},
            **extra,
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


        if existing_entry is None:
            other = self._entry_for_hub(host=host, mac=mac)
            if other is not None:
                if other.data.get(CONF_HOST) != host:
                    self.hass.config_entries.async_update_entry(
                        other, data={**other.data, CONF_HOST: host}
                    )
                return self.async_abort(reason="already_configured")

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
        return await self._async_continue_with(self._discovered_from_zeroconf)


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

        if user_input is not None:
            new_options = {
                **self.entry.options,
                **user_input,
            }

            # Every hub entry gets the ports, and the shared listeners move
            # now rather than at the next Home Assistant restart.
            await async_apply_listener_ports(
                self.hass,
                {key: new_options.get(key, DEFAULT_LISTENER_PORTS[key]) for key in PORT_KEYS},
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
