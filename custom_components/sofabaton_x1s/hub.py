from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.exceptions import HomeAssistantError

from .const import (
    CONF_HEX_LOGGING_ENABLED,
    CONF_PROXY_ENABLED,
    signal_activity,
    signal_client,
    signal_hub,
    signal_buttons,
    signal_devices,
    signal_commands,
    CONF_MDNS_VERSION,
)
from .lib.protocol_const import ButtonName
from .lib.x1_proxy import X1Proxy

_LOGGER = logging.getLogger(__name__)


def get_hub_model(entry: ConfigEntry) -> str:
    """Return the model string for this hub, with a sensible default."""

    model = entry.options.get(CONF_MDNS_VERSION) or entry.data.get(CONF_MDNS_VERSION)
    if isinstance(model, str) and model:
        return model

    return "X1"


class SofabatonHub:
    def __init__(
        self,
        hass: HomeAssistant,
        entry_id: str,
        name: str,
        host: str,
        port: int,
        mdns_txt: dict[str, str],
        proxy_udp_port: int,
        hub_listen_base: int,
        proxy_enabled: bool,
        hex_logging_enabled: bool,
    ) -> None:
        self.hass = hass
        self.entry_id = entry_id
        self.name = name
        self.host = host
        self.port = port
        self.mdns_txt = mdns_txt
        self.mdns_txt["HA_PROXY"] = "1"

        self._proxy_udp_port = proxy_udp_port
        self._hub_listen_base = hub_listen_base

        self.activities: Dict[int, Dict[str, Any]] = {}
        self.devices: Dict[int, Dict[str, Any]] = {}
        self.current_activity: Optional[int] = None
        self.client_connected: bool = False
        self.hub_connected: bool = False
        self.proxy_enabled: bool = proxy_enabled
        self.hex_logging_enabled: bool = hex_logging_enabled
        # store mac so service can find us by mac
        self.mac = mdns_txt.get("MAC") or mdns_txt.get("mac") or None

        # track which activities we already asked buttons for
        self._pending_button_fetch: set[int] = set()
        self._command_entities: set[int] = set()
        self._buttons_ready_for: set[int] = set()
        self._commands_in_flight: set[int] = set()    # entities we are currently fetching
        
        _LOGGER.debug(
            "[%s] Creating X1Proxy for hub %s (%s:%s)",
            self.entry_id,
            name,
            host,
            port,
        )
        self._proxy = self._create_proxy()

    def _create_proxy(self) -> X1Proxy:
        proxy = X1Proxy(
            real_hub_ip=self.host,
            real_hub_udp_port=self.port,
            mdns_instance=self.name,
            mdns_txt=self.mdns_txt,
            diag_dump=self.hex_logging_enabled,
            diag_parse=True,
            proxy_udp_port=self._proxy_udp_port,
            hub_listen_base=self._hub_listen_base,
            proxy_enabled=self.proxy_enabled,
        )

        proxy.on_activity_change(self._on_activity_change)
        proxy.on_burst_end("activities", self._on_activities_burst)
        proxy.on_burst_end("buttons", self._on_buttons_burst)
        proxy.on_client_state_change(self._on_client_state_change)
        proxy.on_hub_state_change(self._on_hub_state_change)
        proxy.on_burst_end("devices", self._on_devices_burst)
        proxy.on_burst_end("commands", self._on_commands_burst)
        return proxy

    async def async_start(self) -> None:
        _LOGGER.debug("[%s] Starting proxy threads", self.entry_id)
        await self.hass.async_add_executor_job(self._proxy.start)

    async def async_stop(self) -> None:
        _LOGGER.debug("[%s] Stopping proxy", self.entry_id)
        await self.hass.async_add_executor_job(self._proxy.stop)

    async def async_apply_new_settings(
        self,
        *,
        host: str,
        port: int | str,
        proxy_udp_port: int | str,
        hub_listen_base: int | str,
    ) -> None:
        # normalize types first
        port = port
        proxy_udp_port = proxy_udp_port
        hub_listen_base = hub_listen_base

        changed = (
            str(host) != str(self.host)
            or str(port) != str(self.port)
            or str(proxy_udp_port) != str(self._proxy_udp_port)
            or str(hub_listen_base) != str(self._hub_listen_base)
        )
        if not changed:
            return

        _LOGGER.debug(
            "[%s] Updating hub settings to %s:%s (proxy_udp_port=%s, hub_listen_base=%s)",
            self.entry_id,
            self.host,
            self.port,
            proxy_udp_port,
            hub_listen_base,
        )

        self.host = host
        self.port = port
        self._proxy_udp_port = proxy_udp_port
        self._hub_listen_base = hub_listen_base

        await self.async_stop()
        self._proxy = self._create_proxy()
        await self.async_start()
        self.hass.async_create_task(self._async_initial_sync())


    # ------------------------------------------------------------------
    # proxy → HA
    # ------------------------------------------------------------------
    def _on_activity_change(self, new_id: Optional[int], old_id: Optional[int], name: Optional[str]) -> None:
        def _inner() -> None:
            _LOGGER.debug(
                "[%s] Activity changed: %s → %s (%s)",
                self.entry_id,
                old_id,
                new_id,
                name,
            )
            self.current_activity = new_id
            async_dispatcher_send(self.hass, signal_activity(self.entry_id))

            if new_id is not None:
                # ask for buttons, but dedup
                self.hass.async_create_task(self._async_prime_buttons_for(new_id))
        self.hass.loop.call_soon_threadsafe(_inner)

    def _on_activities_burst(self, key: str) -> None:
        def _inner() -> None:
            acts, ready = self._proxy.get_activities()
            _LOGGER.debug(
                "[%s] on_burst_end('activities'): ready=%s, count=%s",
                self.entry_id,
                ready,
                len(acts) if acts else 0,
            )
            if ready:
                self.activities = acts
            async_dispatcher_send(self.hass, signal_activity(self.entry_id))
        self.hass.loop.call_soon_threadsafe(_inner)

    def _on_buttons_burst(self, key: str) -> None:
        def _inner() -> None:
            ent_id = None
            if ":" in key:
                prefix, ent_str = key.split(":", 1)
                try:
                    ent_id = int(ent_str)
                except ValueError:
                    ent_id = None

            if ent_id is not None:
                # mark buttons for this entity as ready
                self._buttons_ready_for.add(ent_id)
                # also, if you had a "pending" set, clear just this one
                self._pending_button_fetch.discard(ent_id)

            async_dispatcher_send(self.hass, signal_buttons(self.entry_id))
        self.hass.loop.call_soon_threadsafe(_inner)

    def _on_client_state_change(self, connected: bool) -> None:
        def _inner() -> None:
            _LOGGER.debug(
                "[%s] Proxy client state changed: connected=%s",
                self.entry_id,
                connected,
            )
            self.client_connected = connected
            async_dispatcher_send(self.hass, signal_client(self.entry_id))

            if not connected and self.current_activity is not None:
                _LOGGER.debug(
                    "[%s] Client disconnected, re-priming buttons for activity %s",
                    self.entry_id,
                    self.current_activity,
                )
                self.hass.async_create_task(
                    self._async_prime_buttons_for(self.current_activity)
                )
        self.hass.loop.call_soon_threadsafe(_inner)

    def _on_hub_state_change(self, connected: bool) -> None:
        def _inner() -> None:
            _LOGGER.debug(
                "[%s] Hub connection state changed: connected=%s",
                self.entry_id,
                connected,
            )
            self.hub_connected = connected
            async_dispatcher_send(self.hass, signal_hub(self.entry_id))

            if connected:
                _LOGGER.debug("[%s] Hub connected, doing initial sync", self.entry_id)
                self.hass.async_create_task(self._async_initial_sync())
        self.hass.loop.call_soon_threadsafe(_inner)

    def _on_devices_burst(self, key: str) -> None:
        def _inner() -> None:
            devs, ready = self._proxy.get_devices()
            if ready:
                self.devices = devs
            async_dispatcher_send(self.hass, signal_devices(self.entry_id))
        self.hass.loop.call_soon_threadsafe(_inner)

    def _on_commands_burst(self, key: str) -> None:
        def _inner() -> None:
            ent_id = None
            if ":" in key:
                _, ent_str = key.split(":", 1)
                try:
                    ent_id = int(ent_str)
                except ValueError:
                    ent_id = None

            if ent_id is not None:
                # remember that this entity now has commands cached in the proxy
                self._command_entities.add(ent_id)
                self._commands_in_flight.discard(ent_id)

            # tell HA to refresh the sensor
            async_dispatcher_send(self.hass, signal_commands(self.entry_id))
        self.hass.loop.call_soon_threadsafe(_inner)

    # ------------------------------------------------------------------
    # async helpers
    # ------------------------------------------------------------------
    async def _async_initial_sync(self) -> None:
        acts, acts_ready = await self.hass.async_add_executor_job(self._proxy.get_activities)
        _LOGGER.debug(
            "[%s] initial_sync: got activities ready=%s count=%s",
            self.entry_id,
            acts_ready,
            len(acts) if acts else 0,
        )
        
        devs, devs_ready = await self.hass.async_add_executor_job(self._proxy.get_devices)
        _LOGGER.debug(
            "[%s] initial_sync: got devices ready=%s count=%s",
            self.entry_id,
            devs_ready,
            len(devs) if devs else 0,
        )
        if devs_ready:
            self.devices = devs
            async_dispatcher_send(self.hass, signal_devices(self.entry_id))
        
        if acts_ready:
            self.activities = acts
            async_dispatcher_send(self.hass, signal_activity(self.entry_id))

        if self.current_activity is not None:
            _LOGGER.debug(
                "[%s] initial_sync: priming buttons for current activity %s",
                self.entry_id,
                self.current_activity,
            )
            await self._async_prime_buttons_for(self.current_activity)



    async def async_fetch_device_commands(self, ent_id: int) -> None:
        """User asked to fetch commands for this device/activity."""
        self._commands_in_flight.add(ent_id)
        async_dispatcher_send(self.hass, signal_commands(self.entry_id))
        # executor so we can pass keyword
        await self.hass.async_add_executor_job(
            lambda: self._proxy.get_commands_for_entity(ent_id, fetch_if_missing=True)
        )

    async def _async_prime_buttons_for(self, act_id: int) -> None:
        # dedupe here
        if act_id in self._pending_button_fetch:
            _LOGGER.debug(
                "[%s] prime_buttons_for(%s): already pending, skipping",
                self.entry_id,
                act_id,
            )
            return

        self._pending_button_fetch.add(act_id)
        _LOGGER.debug(
            "[%s] prime_buttons_for(%s): calling proxy.get_buttons_for_entity()",
            self.entry_id,
            act_id,
        )
        btns, ready = await self.hass.async_add_executor_job(
            self._proxy.get_buttons_for_entity,
            act_id,
        )
        _LOGGER.debug(
            "[%s] prime_buttons_for(%s): ready=%s count=%s",
            self.entry_id,
            act_id,
            ready,
            len(btns) if btns else 0,
        )
        if ready:
            # if it was actually ready now, we can clear pending right away
            self._pending_button_fetch.discard(act_id)
            async_dispatcher_send(self.hass, signal_buttons(self.entry_id))
        # else: we'll clear the whole set in _on_buttons_burst

    # ------------------------------------------------------------------
    # helpers for entities
    # ------------------------------------------------------------------
    
    def get_button_name_map(self) -> dict[int, str]:
        """Return a static map of button_code -> human name."""
        name_map: dict[int, str] = {}
        for attr, val in ButtonName.__dict__.items():
            if isinstance(val, int):
                # turn VOL_UP -> Vol Up
                pretty = attr.replace("_", " ").title()
                name_map[val] = pretty
        return name_map

    
    def get_all_cached_buttons(self) -> dict[int, list[int]]:
        """Return all button lists we know are ready, from proxy cache."""
        result: dict[int, list[int]] = {}
        for ent_id in self._buttons_ready_for:
            btns, ready = self._proxy.get_buttons_for_entity(
                ent_id,
                fetch_if_missing=False,  # do NOT queue
            )
            if ready and btns:
                result[ent_id] = btns
        return result
        
    def get_all_cached_commands(self) -> dict[int, dict[int, str]]:
        """Build a view from the proxy's cache, without triggering new fetches."""
        result: dict[int, dict[int, str]] = {}
        for ent_id in self._command_entities:
            cmds, ready = self._proxy.get_commands_for_entity(
                ent_id,
                fetch_if_missing=False,  # ← important: no queueing
            )
            if ready and cmds:
                result[ent_id] = cmds
        return result

    def get_activity_name_by_id(self, act_id: int) -> Optional[str]:
        act = self.activities.get(act_id)
        return act.get("name") if act else None

    def get_id_by_activity_name(self, name: str) -> Optional[int]:
        for act_id, act in self.activities.items():
            if act.get("name") == name:
                return act_id
        return None

    async def async_activate_activity(self, act_id: int) -> None:
        _LOGGER.debug("[%s] Activating activity %s", self.entry_id, act_id)
        await self.hass.async_add_executor_job(
            self._proxy.send_command,
            int(act_id),
            ButtonName.POWER_ON,
        )

    async def async_power_off_current(self) -> None:
        if self.current_activity is None:
            return
        _LOGGER.debug("[%s] Powering off current activity %s", self.entry_id, self.current_activity)
        await self.hass.async_add_executor_job(
            self._proxy.send_command,
            int(self.current_activity),
            ButtonName.POWER_OFF,
        )

    async def async_find_remote(self) -> None:
        _LOGGER.debug("[%s] Triggering find-remote signal", self.entry_id)
        await self.hass.async_add_executor_job(self._proxy.find_remote)

    def _async_update_options(self, key: str, value: Any) -> None:
        """Update a key in the ConfigEntry options."""
        entry = self.hass.config_entries.async_get_entry(self.entry_id)
        if entry:
            new_options = entry.options.copy()
            new_options[key] = value
            self.hass.config_entries.async_update_entry(entry, options=new_options)

    async def async_set_proxy_enabled(self, enable: bool) -> None:
        _LOGGER.debug("[%s] Setting proxy enabled=%s", self.entry_id, enable)
        if enable:
            await self.hass.async_add_executor_job(self._proxy.enable_proxy)
        else:
            await self.hass.async_add_executor_job(self._proxy.disable_proxy)
        self.proxy_enabled = enable
        self.hass.loop.call_soon_threadsafe(
            self._async_update_options, CONF_PROXY_ENABLED, enable
        )

    async def async_set_hex_logging_enabled(self, enable: bool) -> None:
        _LOGGER.debug("[%s] Setting hex logging enabled=%s", self.entry_id, enable)
        await self.hass.async_add_executor_job(self._proxy.set_diag_dump, enable)
        self.hex_logging_enabled = enable
        self.hass.loop.call_soon_threadsafe(
            self._async_update_options, CONF_HEX_LOGGING_ENABLED, enable
        )

    def get_buttons_for_current(self) -> tuple[list[int], bool]:
        # entities call this often; keep it cheap
        if self.current_activity is None:
            return ([], True)
        return self._proxy.get_buttons_for_entity(self.current_activity, fetch_if_missing=False)

    async def async_send_button(self, btn_code: int) -> None:
        if self.current_activity is None:
            _LOGGER.debug("[%s] Tried to send button %s but no activity is active", self.entry_id, btn_code)
            return
        _LOGGER.debug(
            "[%s] Sending button %s for activity %s",
            self.entry_id,
            btn_code,
            self.current_activity,
        )
        await self.hass.async_add_executor_job(
            self._proxy.send_command,
            int(self.current_activity),
            int(btn_code),
        )

    async def async_send_key(self, key: str | int, device: int | None = None) -> None:
        """Send either a Sofabaton ButtonName or a raw command ID.

        - If 'device' is given, we send directly to that entity (device or activity).
        - If 'device' is not given, we send in the context of the *current activity*.
        - We do NOT remap/rename button names: you must use the names from ButtonName.
          So "VOL_UP", "VOL_DOWN", "MUTE", etc.
        """
        # advanced path: user specified the target entity
        if device is not None:
            code = self._normalize_command_id(key)
            await self.async_send_raw_command(device, code)
            return

        # normal path: use current activity
        if self.current_activity is None:
            raise HomeAssistantError("No activity active")

        # string → try to treat as ButtonName first
        if isinstance(key, str):
            norm = key.strip().upper()
            try:
                btn = getattr(ButtonName, norm)
            except KeyError:
                # not a ButtonName → treat as numeric
                code = self._normalize_command_id(key)
                await self.async_send_raw_command(self.current_activity, code)
            else:
                await self.async_send_button(btn)
            return

        # int → just send as raw command to current activity
        await self.async_send_raw_command(self.current_activity, int(key))

    def _normalize_command_id(self, key: str | int) -> int:
        if isinstance(key, int):
            return key
        return int(key, 10)


    async def async_send_raw_command(self, ent_id: int, key_code: int) -> None:
        """Send a command directly to an activity or device."""
        await self.hass.async_add_executor_job(
            self._proxy.send_command,
            int(ent_id),
            int(key_code),
        )