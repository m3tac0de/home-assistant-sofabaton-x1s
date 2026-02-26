from __future__ import annotations

import asyncio
import logging
from time import monotonic
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
    HUB_VERSION_X1,
    HUB_VERSION_X1S,
    HUB_VERSION_X2,
    signal_activity,
    signal_app_activations,
    signal_ip_commands,
    signal_wifi_device,
    signal_buttons,
    signal_client,
    signal_commands,
    signal_devices,
    signal_hub,
    signal_macros,
    signal_command_sync,
)
from .diagnostics import async_disable_hex_logging_capture, async_enable_hex_logging_capture
from .lib.protocol_const import ButtonName
from .lib.x1_proxy import X1Proxy
from .command_config import COMMAND_BRAND_PREFIX, count_configured_command_slots, normalize_command_name

_LOGGER = logging.getLogger(__name__)

_HARD_BUTTON_TO_CODE: dict[str, int] = {"up": ButtonName.UP, "down": ButtonName.DOWN, "left": ButtonName.LEFT, "right": ButtonName.RIGHT, "ok": ButtonName.OK, "back": ButtonName.BACK, "home": ButtonName.HOME, "menu": ButtonName.MENU, "volup": ButtonName.VOL_UP, "voldn": ButtonName.VOL_DOWN, "mute": ButtonName.MUTE, "chup": ButtonName.CH_UP, "chdn": ButtonName.CH_DOWN, "guide": ButtonName.GUIDE, "dvr": ButtonName.DVR, "play": ButtonName.PLAY, "exit": ButtonName.EXIT, "rew": ButtonName.REW, "pause": ButtonName.PAUSE, "fwd": ButtonName.FWD, "red": ButtonName.RED, "green": ButtonName.GREEN, "yellow": ButtonName.YELLOW, "blue": ButtonName.BLUE, "a": ButtonName.A, "b": ButtonName.B, "c": ButtonName.C}


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
        self._command_sync_lock = asyncio.Lock()
        self._command_sync_progress: dict[str, Any] = {"status": "idle", "current_step": 0, "total_steps": 0, "message": "Idle"}

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


    def _sync_current_activity_from_cache(self, *, clear_when_unknown: bool = True) -> None:
        active_id = None
        for act_id, activity in self.activities.items():
            if isinstance(activity, dict) and bool(activity.get("active", False)):
                active_id = int(act_id)
                break

        if active_id is None and not clear_when_unknown:
            return

        if active_id != self.current_activity:
            self.current_activity = active_id

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
                self._sync_current_activity_from_cache(clear_when_unknown=True)
            async_dispatcher_send(self.hass, signal_activity(self.entry_id))
        self.hass.loop.call_soon_threadsafe(_inner)

    def _on_activity_list_update(self) -> None:
        def _inner() -> None:
            acts, ready = self._proxy.get_activities()
            if acts:
                self.activities = acts
                self._sync_current_activity_from_cache(clear_when_unknown=False)
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
                _, ent_segment = key.split(":", 1)
                ent_str = ent_segment.split(":", 1)[0]
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
                _, ent_segment = key.split(":", 1)
                ent_str = ent_segment.split(":", 1)[0]
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
        request_port: int = 8060,
        brand_name: str = "m3tac0de",
    ) -> dict[str, Any] | None:
        """Replay the WiFi virtual-device creation sequence on the selected hub."""

        return await self.hass.async_add_executor_job(
            self._proxy.create_wifi_device,
            device_name,
            commands,
            request_port,
            brand_name,
        )

    async def async_add_device_to_activity(
        self,
        activity_id: int,
        device_id: int,
    ) -> dict[str, Any] | None:
        """Replay the activity-device confirmation sequence on the selected hub."""

        return await self.hass.async_add_executor_job(
            self._proxy.add_device_to_activity,
            activity_id,
            device_id,
        )

    async def async_delete_device(self, device_id: int) -> dict[str, Any] | None:
        """Delete a device and confirm impacted activities on the selected hub."""

        return await self.hass.async_add_executor_job(
            self._proxy.delete_device,
            device_id,
        )

    async def async_command_to_favorite(
        self,
        activity_id: int,
        device_id: int,
        command_id: int,
        *,
        slot_id: int | None = None,
        refresh_after_write: bool = True,
    ) -> dict[str, Any] | None:
        """Replay the favorite write sequence on the selected hub."""

        kwargs: dict[str, Any] = {}
        if slot_id is not None:
            kwargs["slot_id"] = slot_id
        if not refresh_after_write:
            kwargs["refresh_after_write"] = False

        return await self.hass.async_add_executor_job(
            partial(
                self._proxy.command_to_favorite,
                activity_id,
                device_id,
                command_id,
                **kwargs,
            )
        )

    async def async_command_to_button(
        self,
        activity_id: int,
        button_id: int,
        device_id: int,
        command_id: int,
        *,
        refresh_after_write: bool = True,
    ) -> dict[str, Any] | None:
        """Replay the button-mapping write sequence on the selected hub."""

        if refresh_after_write:
            return await self.hass.async_add_executor_job(
                partial(
                    self._proxy.command_to_button,
                    activity_id,
                    button_id,
                    device_id,
                    command_id,
                )
            )

        return await self.hass.async_add_executor_job(
            partial(
                self._proxy.command_to_button,
                activity_id,
                button_id,
                device_id,
                command_id,
                refresh_after_write=False,
            )
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

        _, buttons_ready = await self.hass.async_add_executor_job(
            self._proxy.get_buttons_for_entity, act_id
        )

        if not buttons_ready:
            await self._async_wait_for_buttons_ready(act_id)

        await self.hass.async_add_executor_job(self._proxy.request_activity_mapping, act_id)
        await self._async_wait_for_activity_map_ready(act_id)

        await self.hass.async_add_executor_job(
            partial(
                self._proxy.ensure_commands_for_activity,
                act_id,
                fetch_if_missing=True,
            )
        )

        _, macros_ready = await self.hass.async_add_executor_job(
            partial(
                self._proxy.get_macros_for_activity,
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


    async def _async_wait_for_activity_map_ready(self, act_id: int, *, timeout: float = 5.0) -> None:
        deadline = monotonic() + timeout
        act_lo = act_id & 0xFF
        while monotonic() < deadline:
            if act_lo in self._proxy._activity_map_complete:
                return
            await asyncio.sleep(0.05)

        _LOGGER.debug(
            "[%s] timed out waiting for activity map for 0x%02X",
            self.entry_id,
            act_lo,
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
            self._proxy.state.activity_members.pop(ent_id & 0xFF, None)
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

        await self.hass.async_add_executor_job(self._proxy.request_activity_mapping, act_id)
        await self._async_wait_for_activity_map_ready(act_id)

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
            if isinstance(val, int) and attr.isupper() and not attr.startswith("_"):
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
        await self._async_maybe_run_configured_ip_action(command_label)

    @property
    def is_sync_in_progress(self) -> bool:
        return self._command_sync_lock.locked()

    def get_command_sync_progress(self) -> dict[str, Any]:
        return dict(self._command_sync_progress)

    def _set_command_sync_progress(self, **payload: Any) -> None:
        next_payload = dict(self._command_sync_progress)
        next_payload.update(payload)
        self._command_sync_progress = next_payload
        async_dispatcher_send(self.hass, signal_command_sync(self.entry_id))

    def _managed_wifi_devices(self) -> list[tuple[int, str]]:
        managed: list[tuple[int, str]] = []
        prefix = f"{COMMAND_BRAND_PREFIX}-"
        for dev_id, device in self.devices.items():
            brand = str(device.get("brand") or "").strip()
            if brand.startswith(prefix):
                managed.append((int(dev_id), brand))
        return managed

    def get_managed_command_hashes(self) -> list[str]:
        prefix = f"{COMMAND_BRAND_PREFIX}-"
        hashes: set[str] = set()
        for _dev_id, brand in self._managed_wifi_devices():
            text = str(brand or "").strip()
            if not text.startswith(prefix):
                continue
            command_hash = text[len(prefix):].strip()
            if command_hash:
                hashes.add(command_hash)
        return sorted(hashes)

    async def _async_execute_action_config(self, action_config: dict[str, Any]) -> None:
        action = str(action_config.get("action") or "").lower().strip()
        implicit_service = (not action or action == "default") and (
            action_config.get("service") or action_config.get("perform_action")
        )
        if action == "none":
            return

        if action in ("call-service", "perform-action") or implicit_service:
            svc = str(
                action_config.get("service") or action_config.get("perform_action") or ""
            ).strip()
            if "." not in svc:
                return
            domain, service = svc.split(".", 1)
            service_data = action_config.get("service_data") or action_config.get("data") or {}
            target = (
                action_config.get("target")
                if isinstance(action_config.get("target"), dict)
                else None
            )
            await self.hass.services.async_call(
                domain,
                service,
                service_data,
                target=target,
                blocking=True,
            )

    async def _async_maybe_run_configured_ip_action(self, command_label: str) -> None:
        hass_data = getattr(self.hass, "data", {})
        domain_data = hass_data.get(DOMAIN, {}) if isinstance(hass_data, dict) else {}
        store = domain_data.get("command_config_store")
        if store is None:
            return

        payload = await store.async_get_hub_config(self.entry_id)
        command_key = normalize_command_name(command_label)
        for slot in payload.get("commands", []):
            if normalize_command_name(slot.get("name")) != command_key:
                continue
            action = slot.get("action") if isinstance(slot.get("action"), dict) else {}
            try:
                await self._async_execute_action_config(action)
            except Exception as err:  # pragma: no cover - service boundary
                _LOGGER.warning(
                    "[%s] Failed executing configured IP action for '%s': %s",
                    self.entry_id,
                    command_label,
                    err,
                )
            return

    async def async_sync_command_config(
        self,
        *,
        command_payload: dict[str, Any],
        request_port: int,
        device_name: str = "Home Assistant",
    ) -> dict[str, Any]:
        if self._command_sync_lock.locked():
            raise HomeAssistantError("sync_in_progress")

        async with self._command_sync_lock:
            commands = list(command_payload.get("commands") or [])
            commands_hash = str(command_payload.get("commands_hash") or "")
            brand_name = f"{COMMAND_BRAND_PREFIX}-{commands_hash}"
            total_steps = 6
            self._set_command_sync_progress(
                status="running",
                current_step=0,
                total_steps=total_steps,
                message="Starting sync",
            )

            managed = self._managed_wifi_devices()
            configured_slots = count_configured_command_slots(commands)
            self._set_command_sync_progress(
                current_step=1,
                message="Deleting existing managed Wifi Device(s)",
            )
            for dev_id, _brand in managed:
                result = await self.async_delete_device(dev_id)
                if not result:
                    self._set_command_sync_progress(
                        status="failed",
                        message=f"Failed deleting managed device {dev_id}",
                    )
                    raise HomeAssistantError(
                        f"Failed deleting managed device {dev_id}"
                    )

            if configured_slots == 0:
                self._set_command_sync_progress(
                    status="success",
                    current_step=6,
                    total_steps=total_steps,
                    message="No configured slots; managed Wifi Device removed",
                    wifi_device_id=None,
                    commands_hash=commands_hash,
                )
                return {
                    "status": "success",
                    "wifi_device_id": None,
                    "commands_hash": commands_hash,
                    "activities": [],
                    "deleted_managed_devices": len(managed),
                }

            slot_labels = [
                str(slot.get("name") or f"Command {idx + 1}").strip() or f"Command {idx + 1}"
                for idx, slot in enumerate(commands[:10])
            ]

            self._set_command_sync_progress(
                current_step=2,
                message="Creating Wifi Device on Hub",
            )
            created = await self.async_create_wifi_device(
                device_name=device_name,
                commands=slot_labels,
                request_port=request_port,
                brand_name=brand_name,
            )
            if not created or not created.get("device_id"):
                self._set_command_sync_progress(
                    status="failed",
                    message="Failed creating Wifi Device",
                )
                raise HomeAssistantError("Failed creating Wifi Device")

            wifi_device_id = int(created["device_id"])

            activity_ids: set[int] = set()
            for slot in commands:
                for act in slot.get("activities", []):
                    try:
                        activity_ids.add(int(act))
                    except (TypeError, ValueError):
                        continue

            add_results: dict[int, bool] = {}
            self._set_command_sync_progress(
                current_step=3,
                message="Adding Wifi Device to Activities",
            )
            for act_id in sorted(activity_ids):
                result = await self.async_add_device_to_activity(act_id, wifi_device_id)
                add_results[act_id] = bool(result)

            if activity_ids and not all(add_results.values()):
                await self.async_delete_device(wifi_device_id)
                self._set_command_sync_progress(
                    status="failed",
                    current_step=4,
                    message="Failed activity membership; rolled back Wifi Device",
                )
                raise HomeAssistantError("Failed adding Wifi Device to all activities")

            self._set_command_sync_progress(
                current_step=4,
                message="Applying activity favorites",
            )
            for slot_idx, slot in enumerate(commands[:10]):
                if not slot.get("add_as_favorite"):
                    continue
                command_id = slot_idx + 1
                for act in slot.get("activities", []):
                    try:
                        act_id = int(act)
                    except (TypeError, ValueError):
                        continue
                    if not add_results.get(act_id, False):
                        continue
                    await self.async_command_to_favorite(
                        act_id,
                        wifi_device_id,
                        command_id,
                        refresh_after_write=False,
                    )

            self._set_command_sync_progress(
                current_step=5,
                message="Applying activity button mappings",
            )
            for slot_idx, slot in enumerate(commands[:10]):
                hard_button = str(slot.get("hard_button") or "").strip().lower()
                if not hard_button:
                    continue
                button_id = _HARD_BUTTON_TO_CODE.get(hard_button)
                if not button_id:
                    continue
                command_id = slot_idx + 1
                for act in slot.get("activities", []):
                    try:
                        act_id = int(act)
                    except (TypeError, ValueError):
                        continue
                    if not add_results.get(act_id, False):
                        continue
                    await self.async_command_to_button(
                        act_id,
                        button_id,
                        wifi_device_id,
                        command_id,
                        refresh_after_write=False,
                    )

            self._set_command_sync_progress(
                current_step=6,
                message="Refreshing activity maps and buttons",
            )
            for act_id in sorted(activity_ids):
                if not add_results.get(act_id, False):
                    continue
                await self.hass.async_add_executor_job(self._proxy.request_activity_mapping, act_id)
                await self.hass.async_add_executor_job(
                    partial(self._proxy.get_buttons_for_entity, act_id, fetch_if_missing=True)
                )
                await self.hass.async_add_executor_job(
                    self._proxy.clear_entity_cache,
                    act_id,
                    False,
                    False,
                    True,
                )
                await self.hass.async_add_executor_job(
                    partial(self._proxy.get_macros_for_activity, act_id, fetch_if_missing=True)
                )

            self._set_command_sync_progress(
                status="success",
                current_step=6,
                total_steps=total_steps,
                message="Sync complete",
                wifi_device_id=wifi_device_id,
                commands_hash=commands_hash,
            )
            return {
                "status": "success",
                "wifi_device_id": wifi_device_id,
                "commands_hash": commands_hash,
                "activities": sorted(activity_ids),
            }

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
        async_dispatcher_send(self.hass, signal_wifi_device(self.entry_id))
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
