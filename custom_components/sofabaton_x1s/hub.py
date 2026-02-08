from __future__ import annotations

import logging
from datetime import datetime, timezone
from functools import partial
from typing import Any, Dict, Optional
from urllib.parse import unquote

from homeassistant.components.zeroconf import async_get_instance
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.exceptions import HomeAssistantError

from .const import (
    DOMAIN,
    CONF_HEX_LOGGING_ENABLED,
    CONF_MDNS_VERSION,
    CONF_PROXY_ENABLED,
    CONF_ROKU_SERVER_ENABLED,
    signal_activity,
    signal_app_activations,
    signal_ip_commands,
    signal_buttons,
    signal_client,
    signal_commands,
    signal_devices,
    signal_hub,
    signal_macros,
)
from .diagnostics import async_disable_hex_logging_capture, async_enable_hex_logging_capture
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
        roku_server_enabled: bool = False,
        version: str | None = None,
    ) -> None:
        self.hass = hass
        self.entry_id = entry_id
        self.name = name
        self.host = host
        self.port = port
        self.mdns_txt = mdns_txt
        self.mdns_txt["HA_PROXY"] = "1"
        self.version = version

        self._proxy_udp_port = proxy_udp_port
        self._hub_listen_base = hub_listen_base
        self.activities: Dict[int, Dict[str, Any]] = {}
        self.devices: Dict[int, Dict[str, Any]] = {}
        self.current_activity: Optional[int] = None
        self.client_connected: bool = False
        self.hub_connected: bool = False
        self.activities_ready: bool = False
        self.devices_ready: bool = False
        self.proxy_enabled: bool = proxy_enabled
        self.hex_logging_enabled: bool = hex_logging_enabled
        self.roku_server_enabled: bool = roku_server_enabled
        # store mac so service can find us by mac
        self.mac = mdns_txt.get("MAC") or mdns_txt.get("mac") or None

        # track which activities we already asked buttons for
        self._pending_button_fetch: set[int] = set()
        self._command_entities: set[int] = set()
        self._buttons_ready_for: set[int] = set()
        self._commands_in_flight: set[int] = set()    # entities we are currently fetching
        self._app_activations: list[dict[str, Any]] = []
        self._last_ip_command: dict[str, Any] | None = None
        self._button_waiters: dict[int, list] = {}

        _LOGGER.debug(
            "[%s] Creating X1Proxy for hub %s (%s:%s)",
            self.entry_id,
            name,
            host,
            port,
        )
        self._proxy = self._create_proxy()

        if self.hex_logging_enabled:
            async_enable_hex_logging_capture(self.hass, self.entry_id)

    def _create_proxy(self) -> X1Proxy:
        proxy = X1Proxy(
            real_hub_ip=self.host,
            real_hub_udp_port=self.port,
            mdns_instance=self.name,
            mdns_txt=self.mdns_txt,
            proxy_id=self.entry_id,
            diag_dump=self.hex_logging_enabled,
            diag_parse=True,
            proxy_udp_port=self._proxy_udp_port,
            hub_listen_base=self._hub_listen_base,
            proxy_enabled=self.proxy_enabled,
        )

        proxy.on_activity_change(self._on_activity_change)
        proxy.on_activity_list_update(self._on_activity_list_update)
        proxy.on_burst_end("activities", self._on_activities_burst)
        proxy.on_burst_end("buttons", self._on_buttons_burst)
        proxy.on_client_state_change(self._on_client_state_change)
        proxy.on_hub_state_change(self._on_hub_state_change)
        proxy.on_burst_end("devices", self._on_devices_burst)
        proxy.on_burst_end("commands", self._on_commands_burst)
        proxy.on_burst_end("macros", self._on_macros_burst)
        proxy.on_app_activation(self._on_app_activation)
        return proxy

    async def async_start(self) -> None:
        _LOGGER.debug("[%s] Starting proxy threads", self.entry_id)
        zc = await async_get_instance(self.hass)
        self._proxy.set_zeroconf(zc)
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
            self.activities_ready = ready
            if ready:
                self.activities = acts
            async_dispatcher_send(self.hass, signal_activity(self.entry_id))
        self.hass.loop.call_soon_threadsafe(_inner)

    def _on_activity_list_update(self) -> None:
        def _inner() -> None:
            acts, ready = self._proxy.get_activities()
            if acts:
                self.activities = acts
            if ready:
                self.activities_ready = True
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

                waiters = self._button_waiters.pop(ent_id, [])
                for waiter in waiters:
                    if not waiter.done():
                        waiter.set_result(None)

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
            if not connected:
                self.activities_ready = False
                self.devices_ready = False
                self._pending_button_fetch.clear()
                self._commands_in_flight.clear()
            async_dispatcher_send(self.hass, signal_hub(self.entry_id))

            if connected:
                _LOGGER.debug("[%s] Hub connected, doing initial sync", self.entry_id)
                self.hass.async_create_task(self._async_initial_sync())
        self.hass.loop.call_soon_threadsafe(_inner)

    def _on_devices_burst(self, key: str) -> None:
        def _inner() -> None:
            devs, ready = self._proxy.get_devices()
            self.devices_ready = ready
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
                self._maybe_complete_command_fetch(ent_id)

            if self._commands_in_flight:
                completed: list[int] = []

                for ent_id in self._commands_in_flight:
                    if self._commands_ready_for(ent_id):
                        completed.append(ent_id)

                for ent_id in completed:
                    self._commands_in_flight.discard(ent_id)

            # tell HA to refresh the sensor
            async_dispatcher_send(self.hass, signal_commands(self.entry_id))
        self.hass.loop.call_soon_threadsafe(_inner)

    def _on_macros_burst(self, key: str) -> None:
        def _inner() -> None:
            ent_id = None
            if ":" in key:
                _, ent_str = key.split(":", 1)
                try:
                    ent_id = int(ent_str)
                except ValueError:
                    ent_id = None

            if ent_id is not None:
                self._maybe_complete_command_fetch(ent_id)

            async_dispatcher_send(self.hass, signal_commands(self.entry_id))
            async_dispatcher_send(self.hass, signal_macros(self.entry_id))

        self.hass.loop.call_soon_threadsafe(_inner)

    def _on_app_activation(self, record: dict[str, Any]) -> None:
        def _inner() -> None:
            self._app_activations = self._proxy.get_app_activations()
            async_dispatcher_send(self.hass, signal_app_activations(self.entry_id))

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
        self.activities_ready = acts_ready

        devs, devs_ready = await self.hass.async_add_executor_job(self._proxy.get_devices)
        _LOGGER.debug(
            "[%s] initial_sync: got devices ready=%s count=%s",
            self.entry_id,
            devs_ready,
            len(devs) if devs else 0,
        )
        self.devices_ready = devs_ready
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



    def _looks_like_activity(self, ent_id: int) -> bool:
        ent_lo = ent_id & 0xFF
        return ent_lo in self._proxy.state.activities

    def _looks_like_device(self, ent_id: int) -> bool:
        ent_lo = ent_id & 0xFF
        return ent_lo in self._proxy.state.devices or ent_lo in self._proxy.state.ip_devices

    def _commands_ready_for(self, ent_id: int) -> bool:
        if self._looks_like_activity(ent_id):
            _, commands_ready = self._proxy.ensure_commands_for_activity(
                ent_id, fetch_if_missing=False
            )
            act_lo = ent_id & 0xFF
            macros, macros_ready = self._proxy.get_macros_for_activity(
                ent_id, fetch_if_missing=False
            )
            if not macros:
                macros_ready = True
            return commands_ready and macros_ready

        _, ready = self._proxy.get_commands_for_entity(ent_id, fetch_if_missing=False)
        return ready

    def _maybe_complete_command_fetch(self, ent_id: int) -> None:
        if ent_id not in self._commands_in_flight:
            return

        if self._commands_ready_for(ent_id):
            self._commands_in_flight.discard(ent_id)
            async_dispatcher_send(self.hass, signal_commands(self.entry_id))

    async def async_fetch_device_commands(self, ent_id: int) -> None:
        """User asked to fetch commands for this device/activity."""
        self._commands_in_flight.add(ent_id)
        async_dispatcher_send(self.hass, signal_commands(self.entry_id))

        if self._looks_like_activity(ent_id):
            await self._async_fetch_activity_commands(ent_id)
        else:
            await self._async_fetch_device_commands(ent_id)

    async def async_create_wifi_device(
        self,
        device_name: str = "Home Assistant",
        commands: list[str] | None = None,
    ) -> dict[str, Any] | None:
        """Replay the WiFi virtual-device creation sequence on the selected hub."""

        return await self.hass.async_add_executor_job(
            self._proxy.create_wifi_device,
            device_name,
            commands,
        )

    async def _async_fetch_activity_commands(self, act_id: int) -> None:
        self._reset_entity_cache(
            act_id, clear_buttons=True, clear_favorites=True, clear_macros=True
        )
        await self.hass.async_add_executor_job(
            self._proxy.clear_entity_cache,
            act_id,
            True,
            True,
            True,
        )

        _, macros_ready = await self.hass.async_add_executor_job(
            partial(
                self._proxy.get_macros_for_activity,
                act_id,
                fetch_if_missing=True,
            )
        )

        _, buttons_ready = await self.hass.async_add_executor_job(
            self._proxy.get_buttons_for_entity, act_id
        )

        if not buttons_ready:
            await self._async_wait_for_buttons_ready(act_id)

        await self.hass.async_add_executor_job(
            partial(
                self._proxy.ensure_commands_for_activity,
                act_id,
                fetch_if_missing=True,
            )
        )

        if macros_ready:
            self._maybe_complete_command_fetch(act_id)
            async_dispatcher_send(self.hass, signal_macros(self.entry_id))
        else:
            # Make sure in-flight state reflects macro completion later.
            self._commands_in_flight.add(act_id)
            self._maybe_complete_command_fetch(act_id)
            async_dispatcher_send(self.hass, signal_commands(self.entry_id))

    async def _async_fetch_device_commands(self, ent_id: int) -> None:
        self._reset_entity_cache(
            ent_id, clear_buttons=True, clear_favorites=False, clear_macros=False
        )
        await self.hass.async_add_executor_job(
            self._proxy.clear_entity_cache,
            ent_id,
            True,
            False,
            False,
        )

        await self.hass.async_add_executor_job(
            partial(self._proxy.get_commands_for_entity, ent_id, fetch_if_missing=True)
        )

    async def _async_wait_for_buttons_ready(self, ent_id: int) -> None:
        if ent_id in self._buttons_ready_for:
            return

        future = self.hass.loop.create_future()
        self._button_waiters.setdefault(ent_id, []).append(future)
        try:
            await future
        finally:
            waiters = self._button_waiters.get(ent_id)
            if waiters and future in waiters:
                waiters.remove(future)
                if not waiters:
                    self._button_waiters.pop(ent_id, None)

    def _reset_entity_cache(
        self,
        ent_id: int,
        *,
        clear_buttons: bool,
        clear_favorites: bool,
        clear_macros: bool,
    ) -> None:
        self._command_entities.discard(ent_id)

        if clear_buttons:
            self._buttons_ready_for.discard(ent_id)
            self._pending_button_fetch.discard(ent_id)
            self._button_waiters.pop(ent_id, None)

        if clear_favorites:
            self._proxy.state.activity_command_refs.pop(ent_id & 0xFF, None)
            self._proxy.state.activity_favorite_slots.pop(ent_id & 0xFF, None)
            self._proxy.state.activity_favorite_labels.pop(ent_id & 0xFF, None)
            self._proxy._clear_favorite_label_requests_for_activity(ent_id & 0xFF)

        if clear_macros:
            self._proxy.state.activity_macros.pop(ent_id & 0xFF, None)
            self._proxy._pending_macro_requests.discard(ent_id & 0xFF)
            self._proxy._macros_complete.discard(ent_id & 0xFF)

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
        else:
            await self._async_wait_for_buttons_ready(act_id)

        await self.hass.async_add_executor_job(
            partial(self._proxy.ensure_commands_for_activity, act_id, fetch_if_missing=True)
        )
        await self.hass.async_add_executor_job(
            partial(self._proxy.get_macros_for_activity, act_id, fetch_if_missing=True)
        )

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

    def get_all_cached_macros(self) -> dict[int, list[dict[str, int | str]]]:
        """Return cached macros for activities that are fully ready."""

        result: dict[int, list[dict[str, int | str]]] = {}
        for ent_id in self.activities:
            macros, ready = self._proxy.get_macros_for_activity(
                ent_id, fetch_if_missing=False
            )
            if ready and macros:
                result[ent_id] = macros

        return result

    def get_activity_favorites(self) -> dict[int, list[dict[str, int | str]]]:
        """Return favorite commands with labels for activities."""

        favorites: dict[int, list[dict[str, int | str]]] = {}

        for act_id in self.activities:
            labels = self._proxy.state.get_activity_favorite_labels(act_id & 0xFF)
            if labels:
                favorites[act_id] = labels

        return favorites

    def get_activity_favorites_for(self, act_id: int) -> list[dict[str, int | str]]:
        """Return favorite commands with labels for a specific activity."""

        return self._proxy.state.get_activity_favorite_labels(act_id & 0xFF)

    def get_activity_macros_for(self, act_id: int) -> list[dict[str, int | str]]:
        """Return macro definitions for a specific activity."""

        macros, ready = self._proxy.get_macros_for_activity(act_id, fetch_if_missing=False)
        if not ready or not macros:
            return []

        return [
            {
                "name": macro.get("label", ""),
                "device_id": act_id,
                "command_id": macro["command_id"],
            }
            for macro in macros
            if macro.get("label")
        ]

    def get_roku_action_id(self) -> str:
        raw_mac = str(self.mac or "").strip()
        normalized_mac = "".join(ch for ch in raw_mac if ch.lower() in "0123456789abcdef").lower()
        if normalized_mac:
            return normalized_mac
        return str(self.entry_id).strip()

    async def async_handle_roku_http_post(
        self,
        *,
        path: str,
        headers: dict[str, str],
        body: bytes,
        source_ip: str,
    ) -> None:
        parts = [part for part in path.strip("/").split("/") if part]
        device_id = -1
        command_label = ""
        device_name = None
        if len(parts) >= 4 and parts[0] == "launch":
            try:
                device_id = int(parts[2])
            except ValueError:
                device_id = -1
            command_label = unquote(parts[3]).replace("_", " ")
            if len(parts) >= 5:
                device_name = unquote("/".join(parts[4:])).replace("_", " ")

        timestamp = datetime.now(timezone.utc)
        record = {
            "entity_id": device_id,
            "entity_kind": "device",
            "entity_name": device_name or (self.devices.get(device_id, {}).get("name") if device_id >= 0 else None),
            "command_id": command_label,
            "command_label": command_label,
            "button_label": command_label,
            "timestamp": timestamp.timestamp(),
            "iso_time": timestamp.isoformat(),
            "source_ip": source_ip,
            "path": path,
            "body": body.decode("utf-8", errors="ignore"),
            "headers": headers,
        }
        self._last_ip_command = record
        async_dispatcher_send(self.hass, signal_ip_commands(self.entry_id))

    def get_last_ip_command(self) -> dict[str, Any] | None:
        if self._last_ip_command is None:
            return None
        return dict(self._last_ip_command)

    def get_app_activations(self) -> list[dict[str, Any]]:
        """Return recent app-originated activation requests."""
        return list(self._app_activations)

    def get_activity_name_by_id(self, act_id: int) -> Optional[str]:
        act = self.activities.get(act_id)
        return act.get("name") if act else None

    def get_id_by_activity_name(self, name: str) -> Optional[int]:
        for act_id, act in self.activities.items():
            if act.get("name") == name:
                return act_id
        return None

    def get_index_state(self) -> str:
        if not self.hub_connected:
            return "offline"

        if not (self.activities_ready and self.devices_ready):
            return "loading"

        if self._commands_in_flight or self._pending_button_fetch:
            return "loading"

        return "ready"

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
        await self.hass.async_add_executor_job(self._proxy.find_remote, self.version)

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


    async def async_set_roku_server_enabled(self, enable: bool) -> None:
        _LOGGER.debug("[%s] Setting WiFi device enabled=%s", self.entry_id, enable)
        self.roku_server_enabled = enable
        self.hass.loop.call_soon_threadsafe(
            self._async_update_options, CONF_ROKU_SERVER_ENABLED, enable
        )
        from .roku_listener import async_get_roku_listener

        listener = await async_get_roku_listener(self.hass)
        await listener.async_set_hub_enabled(self.entry_id, enable)

    async def async_set_hex_logging_enabled(self, enable: bool) -> None:
        _LOGGER.debug("[%s] Setting hex logging enabled=%s", self.entry_id, enable)
        await self.hass.async_add_executor_job(self._proxy.set_diag_dump, enable)
        self.hex_logging_enabled = enable
        if enable:
            async_enable_hex_logging_capture(self.hass, self.entry_id)
        else:
            async_disable_hex_logging_capture(self.hass, self.entry_id)
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
        
        _LOGGER.debug("[DEBUG] Trying to send command %s to device %s", key, device)

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
