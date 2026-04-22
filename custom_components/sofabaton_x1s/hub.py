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
    CONF_MAC,
    CONF_MDNS_TXT,
    CONF_MDNS_VERSION,
    CONF_PROXY_ENABLED,
    CONF_ROKU_SERVER_ENABLED,
    HUB_VERSION_X1,
    HUB_VERSION_X1S,
    HUB_VERSION_X2,
    WIFI_DEVICE_ENABLE_DOCS_URL,
    HVER_BY_HUB_VERSION,
    classify_hub_version,
    format_hub_entry_title,
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
from .logging_utils import get_hub_logger
from .lib.protocol_const import ButtonName
from .lib.x1_proxy import X1Proxy
from .command_config import (
    COMMAND_BRAND_PREFIX,
    DEFAULT_WIFI_DEVICE_KEY,
    count_configured_command_slots,
    normalize_command_name,
    normalize_power_command_id,
)

_LOGGER = logging.getLogger(__name__)

_HARD_BUTTON_TO_CODE: dict[str, int] = {"up": ButtonName.UP, "down": ButtonName.DOWN, "left": ButtonName.LEFT, "right": ButtonName.RIGHT, "ok": ButtonName.OK, "back": ButtonName.BACK, "home": ButtonName.HOME, "menu": ButtonName.MENU, "volup": ButtonName.VOL_UP, "voldn": ButtonName.VOL_DOWN, "mute": ButtonName.MUTE, "chup": ButtonName.CH_UP, "chdn": ButtonName.CH_DOWN, "guide": ButtonName.GUIDE, "dvr": ButtonName.DVR, "play": ButtonName.PLAY, "exit": ButtonName.EXIT, "rew": ButtonName.REW, "pause": ButtonName.PAUSE, "fwd": ButtonName.FWD, "red": ButtonName.RED, "green": ButtonName.GREEN, "yellow": ButtonName.YELLOW, "blue": ButtonName.BLUE, "a": ButtonName.A, "b": ButtonName.B, "c": ButtonName.C}
_WIFI_COMMAND_SLOT_COUNT = 10
_WIFI_COMMAND_LONG_PRESS_OFFSET = 10


def _parse_managed_wifi_brand(brand: str) -> tuple[str | None, str | None]:
    text = str(brand or "").strip()
    prefix = f"{COMMAND_BRAND_PREFIX}-"
    if not text.startswith(prefix):
        return None, None
    suffix = text[len(prefix):].strip()
    if not suffix:
        return None, None
    if "-" not in suffix:
        return DEFAULT_WIFI_DEVICE_KEY, suffix
    device_key, command_hash = suffix.split("-", 1)
    device_key = "".join(ch for ch in str(device_key).lower() if ch.isalnum())
    return (device_key or DEFAULT_WIFI_DEVICE_KEY), command_hash.strip()


def get_hub_model(entry: ConfigEntry) -> str:
    """Return the model string for this hub, preferring detected mDNS metadata."""

    mdns_txt = entry.data.get("mdns_txt", {})
    if isinstance(mdns_txt, dict):
        detected_model = classify_hub_version(mdns_txt)
        if detected_model:
            return detected_model

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
        self._devices_generation: int = 0
        self._activities_generation: int = 0
        self._cache_generation: int = 0
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
        self._command_sync_progress: dict[str, dict[str, Any]] = {}
        self._log = get_hub_logger(_LOGGER, self.entry_id)

        self._log.debug(
            "[%s] Creating X1Proxy for hub %s (%s:%s)",
            self.entry_id,
            name,
            host,
            port,
        )
        self._proxy = self._create_proxy()

        if self.hex_logging_enabled:
            async_enable_hex_logging_capture(self.hass, self.entry_id)

    @property
    def cache_generation(self) -> int:
        return self._cache_generation

    def _bump_cache_generation(self) -> int:
        self._cache_generation += 1
        return self._cache_generation

    def _activity_catalog_signature(
        self, activities: dict[int, dict[str, Any]] | None = None
    ) -> tuple[tuple[int, str], ...]:
        rows = activities if isinstance(activities, dict) else self.activities
        signature: list[tuple[int, str]] = []
        for act_id, activity in rows.items():
            if not isinstance(activity, dict):
                continue
            signature.append((int(act_id) & 0xFF, str(activity.get("name") or "").strip()))
        signature.sort()
        return tuple(signature)

    def _replace_activities(self, activities: dict[int, dict[str, Any]]) -> bool:
        previous_signature = self._activity_catalog_signature()
        self.activities = activities
        return self._activity_catalog_signature(activities) != previous_signature

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
            hub_version=self.version,
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
        self._log.debug("[%s] Starting proxy threads", self.entry_id)
        zc = await async_get_instance(self.hass)
        self._proxy.set_zeroconf(zc)
        await self.hass.async_add_executor_job(self._proxy.start)

    async def async_stop(self) -> None:
        self._log.debug("[%s] Stopping proxy", self.entry_id)
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

        self._log.debug(
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
            self._log.debug(
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


    def _get_activities_cached(self) -> tuple[dict[int, dict[str, Any]], bool]:
        try:
            return self._proxy.get_activities(force_refresh=False)
        except TypeError:
            return self._proxy.get_activities()

    def _on_activities_burst(self, key: str) -> None:
        def _inner() -> None:
            acts, ready = self._get_activities_cached()
            self._log.debug(
                "[%s] on_burst_end('activities'): ready=%s, count=%s",
                self.entry_id,
                ready,
                len(acts) if acts else 0,
            )
            self.activities_ready = ready
            if ready:
                activities_changed = self._replace_activities(acts)
                self._activities_generation += 1
                if activities_changed:
                    self._bump_cache_generation()
                self._sync_current_activity_from_cache(clear_when_unknown=True)
            async_dispatcher_send(self.hass, signal_activity(self.entry_id))
        self.hass.loop.call_soon_threadsafe(_inner)

    def _on_activity_list_update(self) -> None:
        def _inner() -> None:
            acts, ready = self._get_activities_cached()
            if acts:
                if self._replace_activities(acts):
                    self._bump_cache_generation()
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
                self._bump_cache_generation()

            async_dispatcher_send(self.hass, signal_buttons(self.entry_id))
        self.hass.loop.call_soon_threadsafe(_inner)

    def _on_client_state_change(self, connected: bool) -> None:
        def _inner() -> None:
            self._log.debug(
                "[%s] Proxy client state changed: connected=%s",
                self.entry_id,
                connected,
            )
            self.client_connected = connected
            async_dispatcher_send(self.hass, signal_client(self.entry_id))

            if not connected and self.current_activity is not None:
                self._log.debug(
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
            self._log.debug(
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
                self._log.debug("[%s] Hub connected, doing initial sync", self.entry_id)
                self.hass.async_create_task(self._async_initial_sync())
        self.hass.loop.call_soon_threadsafe(_inner)

    def _on_devices_burst(self, key: str) -> None:
        def _inner() -> None:
            devs, ready = self._proxy.get_devices()
            self.devices_ready = ready
            if ready:
                self.devices = devs
                self._devices_generation += 1
                self._bump_cache_generation()
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
                self._bump_cache_generation()

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

                # Burst keys carry the low-byte entity id while in-flight tracking may
                # hold full ids. Re-check any matching in-flight entries by low byte.
                for inflight_ent_id in list(self._commands_in_flight):
                    if (inflight_ent_id & 0xFF) == (ent_id & 0xFF):
                        self._maybe_complete_command_fetch(inflight_ent_id)
                self._bump_cache_generation()

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
        acts, acts_ready = await self.hass.async_add_executor_job(partial(self._proxy.get_activities, force_refresh=True))
        self._log.debug(
            "[%s] initial_sync: got activities ready=%s count=%s",
            self.entry_id,
            acts_ready,
            len(acts) if acts else 0,
        )
        self.activities_ready = acts_ready

        devs, devs_ready = await self.hass.async_add_executor_job(self._proxy.get_devices)
        self._log.debug(
            "[%s] initial_sync: got devices ready=%s count=%s",
            self.entry_id,
            devs_ready,
            len(devs) if devs else 0,
        )
        self.devices_ready = devs_ready
        if devs_ready:
            self.devices = devs
            self._devices_generation += 1
            self._bump_cache_generation()
            async_dispatcher_send(self.hass, signal_devices(self.entry_id))

        if acts_ready:
            if self._replace_activities(acts):
                self._bump_cache_generation()
            async_dispatcher_send(self.hass, signal_activity(self.entry_id))

        if self.current_activity is not None:
            self._log.debug(
                "[%s] initial_sync: priming buttons for current activity %s",
                self.entry_id,
                self.current_activity,
            )
            await self._async_prime_buttons_for(self.current_activity)


    async def async_restore_persistent_cache(self, payload: dict[str, Any]) -> None:
        await self.hass.async_add_executor_job(self._proxy.import_cache_state, payload)

        devs, devs_ready = await self.hass.async_add_executor_job(self._proxy.get_devices)
        self.devices_ready = devs_ready
        if devs_ready:
            self.devices = devs
            self._devices_generation += 1
            self._bump_cache_generation()
            async_dispatcher_send(self.hass, signal_devices(self.entry_id))

        # Prime hub-side readiness trackers from restored proxy cache.
        self._buttons_ready_for = {int(ent_id) for ent_id in self._proxy.state.buttons.keys()}
        self._command_entities = {int(ent_id) for ent_id in self._proxy.state.commands.keys()}

        self._log.debug(
            "[%s] Restored persistent cache: devices=%s buttons=%s commands=%s macros=%s activities_map=%s",
            self.entry_id,
            len(self._proxy.state.devices),
            len(self._proxy.state.buttons),
            len(self._proxy.state.commands),
            len(self._proxy.state.activity_macros),
            len(self._proxy._activity_map_complete),
        )

        self._bump_cache_generation()
        async_dispatcher_send(self.hass, signal_buttons(self.entry_id))
        async_dispatcher_send(self.hass, signal_commands(self.entry_id))
        async_dispatcher_send(self.hass, signal_macros(self.entry_id))

    async def async_export_cache_state(self) -> dict[str, Any]:
        return await self.hass.async_add_executor_job(self._proxy.export_cache_state)

    async def async_clear_cache_for(self, *, kind: str, ent_id: int) -> None:
        await self.hass.async_add_executor_job(
            partial(self._proxy.clear_persistent_cache_for, ent_id, kind=kind)
        )
        if kind == "device":
            await self._async_refresh_devices_snapshot(timeout_seconds=5.0)
            devs, ready = await self.hass.async_add_executor_job(self._proxy.get_devices)
            self.devices_ready = ready
            if ready:
                self.devices = devs
                self._devices_generation += 1
                self._bump_cache_generation()
            async_dispatcher_send(self.hass, signal_devices(self.entry_id))
        else:
            self._bump_cache_generation()
            async_dispatcher_send(self.hass, signal_activity(self.entry_id))

        async_dispatcher_send(self.hass, signal_commands(self.entry_id))
        async_dispatcher_send(self.hass, signal_macros(self.entry_id))

    async def async_get_cache_contents(self) -> dict[str, Any]:
        data = await self.async_export_cache_state()
        data["entry_id"] = self.entry_id
        data["name"] = self.name
        data["cache_generation"] = self.cache_generation
        data["activities"] = self._build_cache_activity_list(data)
        data["activity_favorites"] = self._build_cache_activity_favorites()
        data["activity_keybindings"] = self._build_cache_activity_keybindings()
        data["devices_list"] = self._build_cache_devices_list(data)
        return data

    def _cache_activity_ids(self, data: dict[str, Any]) -> list[int]:
        catalog_ids: set[int] = set()
        catalog_ids.update(int(act_id) & 0xFF for act_id in self.activities.keys())
        state_activities = getattr(self._proxy.state, "activities", {})
        if isinstance(state_activities, dict):
            catalog_ids.update(int(act_id) & 0xFF for act_id in state_activities.keys())

        activity_ids: set[int] = set(catalog_ids)

        for key in (
            "activity_macros",
            "activity_favorite_slots",
            "activity_keybinding_slots",
            "activity_favorite_labels",
            "activity_keybinding_labels",
            "activity_members",
        ):
            rows = data.get(key, {})
            if not isinstance(rows, dict):
                continue
            for act_id in rows:
                try:
                    activity_ids.add(int(act_id) & 0xFF)
                except (TypeError, ValueError):
                    continue

        visible_ids = catalog_ids if catalog_ids else activity_ids
        return sorted(activity_id for activity_id in visible_ids if 1 <= activity_id <= 255)

    def _get_cached_activity_name(self, act_id: int) -> str | None:
        act_lo = act_id & 0xFF
        activity = self.activities.get(act_lo)
        if isinstance(activity, dict):
            name = str(activity.get("name") or "").strip()
            if name:
                return name

        state_activities = getattr(self._proxy.state, "activities", {})
        if isinstance(state_activities, dict):
            cached_activity = state_activities.get(act_lo)
            if isinstance(cached_activity, dict):
                name = str(cached_activity.get("name") or "").strip()
                if name:
                    return name

        return None

    def _get_cached_device_name(self, device_id: int) -> str | None:
        dev_lo = device_id & 0xFF
        device = self.devices.get(dev_lo)
        if isinstance(device, dict):
            name = str(device.get("name") or "").strip()
            if name:
                return name

        for source in (self._proxy.state.devices, self._proxy.state.ip_devices):
            if not isinstance(source, dict):
                continue
            cached_device = source.get(dev_lo)
            if isinstance(cached_device, dict):
                name = str(
                    cached_device.get("name")
                    or cached_device.get("device_name")
                    or cached_device.get("label")
                    or ""
                ).strip()
                if name:
                    return name

        return None

    def _build_cache_activity_list(self, data: dict[str, Any]) -> list[dict[str, Any]]:
        favorites = self._build_cache_activity_favorites()
        keybindings = self._build_cache_activity_keybindings()
        macros_raw = data.get("activity_macros", {})
        macros_by_activity = macros_raw if isinstance(macros_raw, dict) else {}

        activities: list[dict[str, Any]] = []
        for act_id in self._cache_activity_ids(data):
            act_key = str(act_id)
            macros = macros_by_activity.get(act_key, [])
            activity = self.activities.get(act_id) or getattr(self._proxy.state, "activities", {}).get(act_id, {})
            activities.append(
                {
                    "id": act_id,
                    "name": self._get_cached_activity_name(act_id) or f"Activity {act_id}",
                    "is_active": bool(activity.get("active", False)) if isinstance(activity, dict) else False,
                    "favorite_count": len(favorites.get(act_key, [])),
                    "keybinding_count": len(keybindings.get(act_key, [])),
                    "macro_count": len(macros) if isinstance(macros, list) else 0,
                }
            )

        return activities

    def _build_cache_activity_favorites(self) -> dict[str, list[dict[str, Any]]]:
        favorites_by_activity: dict[str, list[dict[str, Any]]] = {}
        activity_ids = (
            set(int(act_id) & 0xFF for act_id in self.activities.keys())
            | set(int(act_id) & 0xFF for act_id in self._proxy.state.activity_favorite_slots.keys())
        )

        for act_id in sorted(activity_id for activity_id in activity_ids if 1 <= activity_id <= 255):
            act_lo = act_id & 0xFF
            slots = self._proxy.state.get_activity_favorite_slots(act_lo)
            labels = {
                (int(row.get("device_id", 0)) & 0xFF, int(row.get("command_id", 0)) & 0xFF): str(row.get("name") or "").strip()
                for row in self._proxy.state.get_activity_favorite_labels(act_lo)
                if isinstance(row, dict)
            }
            if not slots:
                continue

            rows: list[dict[str, Any]] = []
            for slot in slots:
                device_id = int(slot.get("device_id", 0)) & 0xFF
                command_id = int(slot.get("command_id", 0)) & 0xFF
                button_id = int(slot.get("button_id", 0)) & 0xFF
                label = labels.get((device_id, command_id)) or self._proxy.state.commands.get(device_id, {}).get(command_id)
                rows.append(
                    {
                        "button_id": button_id,
                        "device_id": device_id,
                        "device_name": self._get_cached_device_name(device_id) or f"Device {device_id}",
                        "command_id": command_id,
                        "label": str(label).strip() if label else f"Command {command_id}",
                        "source": str(slot.get("source", "cache")),
                    }
                )

            # Apply hub-defined display order if available.
            # activity_favorites_order stores [(fav_id, slot), ...] where fav_id
            # matches button_id and slot is the 1-based display position.
            order = self._proxy.state.activity_favorites_order.get(act_lo)
            if order:
                slot_by_fav: dict[int, int] = {fav_id: slot for fav_id, slot in order}
                rows.sort(key=lambda r: slot_by_fav.get(r["button_id"], 0xFFFF))

            favorites_by_activity[str(act_lo)] = rows

        return favorites_by_activity

    def _build_cache_activity_keybindings(self) -> dict[str, list[dict[str, Any]]]:
        keybindings_by_activity: dict[str, list[dict[str, Any]]] = {}
        button_names = self.get_button_name_map()
        activity_ids = (
            set(int(act_id) & 0xFF for act_id in self.activities.keys())
            | set(int(act_id) & 0xFF for act_id in self._proxy.state.activity_keybinding_slots.keys())
        )

        for act_id in sorted(activity_id for activity_id in activity_ids if 1 <= activity_id <= 255):
            act_lo = act_id & 0xFF
            slots = self._proxy.state.get_activity_keybinding_slots(act_lo)
            labels = {
                (int(row.get("device_id", 0)) & 0xFF, int(row.get("command_id", 0)) & 0xFF): str(row.get("name") or "").strip()
                for row in self._proxy.state.get_activity_keybinding_labels(act_lo)
                if isinstance(row, dict)
            }
            if not slots:
                continue

            rows: list[dict[str, Any]] = []
            for slot in slots:
                button_id = int(slot.get("button_id", 0)) & 0xFF
                device_id = int(slot.get("device_id", 0)) & 0xFF
                command_id = int(slot.get("command_id", 0)) & 0xFF
                label = labels.get((device_id, command_id)) or self._proxy.state.commands.get(device_id, {}).get(command_id)
                rows.append(
                    {
                        "button_id": button_id,
                        "button_name": button_names.get(button_id, f"Button {button_id}"),
                        "device_id": device_id,
                        "device_name": self._get_cached_device_name(device_id) or f"Device {device_id}",
                        "command_id": command_id,
                        "label": str(label).strip() if label else f"Command {command_id}",
                        "source": str(slot.get("source", "cache")),
                    }
                )

            keybindings_by_activity[str(act_lo)] = rows

        return keybindings_by_activity

    def _build_cache_devices_list(self, data: dict[str, Any]) -> list[dict[str, Any]]:
        devices_raw = data.get("devices", {})
        ip_devices_raw = data.get("ip_devices", {})
        commands_raw = data.get("commands", {})

        device_ids: set[int] = set()
        for raw_map in (devices_raw, ip_devices_raw, commands_raw):
            if not isinstance(raw_map, dict):
                continue
            for device_id in raw_map:
                try:
                    device_ids.add(int(device_id) & 0xFF)
                except (TypeError, ValueError):
                    continue

        devices_list: list[dict[str, Any]] = []
        for device_id in sorted(dev_id for dev_id in device_ids if 1 <= dev_id <= 255):
            commands = commands_raw.get(str(device_id), {})
            devices_list.append(
                {
                    "id": device_id,
                    "name": self._get_cached_device_name(device_id) or f"Device {device_id}",
                    "command_count": len(commands) if isinstance(commands, dict) else 0,
                    "has_commands": bool(commands) if isinstance(commands, dict) else False,
                }
            )

        return devices_list



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
            _, macros_ready = self._proxy.get_macros_for_activity(
                ent_id, fetch_if_missing=False
            )
            return commands_ready and macros_ready

        _, ready = self._proxy.get_commands_for_entity(ent_id, fetch_if_missing=False)
        return ready

    def _maybe_complete_command_fetch(self, ent_id: int) -> None:
        if ent_id not in self._commands_in_flight:
            return

        if self._commands_ready_for(ent_id):
            self._commands_in_flight.discard(ent_id)
            async_dispatcher_send(self.hass, signal_commands(self.entry_id))

    async def async_fetch_device_commands(
        self,
        ent_id: int,
        *,
        wait_timeout: float = 10.0,
    ) -> None:
        """User asked to fetch commands for this device/activity."""
        self._commands_in_flight.add(ent_id)
        async_dispatcher_send(self.hass, signal_commands(self.entry_id))

        if self._looks_like_activity(ent_id):
            await self._async_fetch_activity_commands(ent_id)
        else:
            await self._async_fetch_device_commands(ent_id)

        await self._async_wait_for_command_fetch_complete(ent_id, timeout=wait_timeout)

    async def async_create_wifi_device(
        self,
        device_name: str = "Home Assistant",
        commands: list[Any] | None = None,
        request_port: int = 8060,
        brand_name: str = "m3tac0de",
        power_on_command_id: int | None = None,
        power_off_command_id: int | None = None,
        input_command_ids: list[int] | None = None,
    ) -> dict[str, Any] | None:
        """Replay the WiFi virtual-device creation sequence on the selected hub."""

        return await self.hass.async_add_executor_job(
            partial(
                self._proxy.create_wifi_device,
                device_name=device_name,
                commands=commands,
                request_port=request_port,
                brand_name=brand_name,
                power_on_command_id=power_on_command_id,
                power_off_command_id=power_off_command_id,
                input_command_ids=input_command_ids,
            ),
        )

    async def async_add_device_to_activity(
        self,
        activity_id: int,
        device_id: int,
        input_cmd_id: int | None = None,
    ) -> dict[str, Any] | None:
        """Replay the activity-device confirmation sequence on the selected hub."""

        return await self.hass.async_add_executor_job(
            lambda: self._proxy.add_device_to_activity(
                activity_id,
                device_id,
                input_cmd_id=input_cmd_id,
            )
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

    def get_favorites(self, activity_id: int) -> list[dict[str, Any]]:
        """Return cached favorites for *activity_id* (no hub round-trip).

        Each entry comes from the activity map/keymap cache and contains the
        activity-map ``button_id`` plus ``device_id``, ``command_id``, and
        ``source``.

        On X1S, these cached quick-access ``button_id`` values share the same
        identifier space used by the Macro & Favorite Keys UI. The hub's raw
        0x63 favorites-order response can still be partial, so callers that
        need the visible ordered list should prefer :meth:`async_request_favorites_order`
        or the Home Assistant ``get_favorites`` service, which merges hub order
        with cached keymap/macros metadata.
        """
        act_lo = activity_id & 0xFF
        favorites: list[dict[str, Any]] = []
        for slot in self._proxy.state.get_activity_favorite_slots(act_lo):
            favorite = dict(slot)
            favorite.setdefault("activity_map_button_id", favorite.get("button_id"))
            favorites.append(favorite)
        return favorites

    async def async_request_favorites_order(
        self,
        activity_id: int,
    ) -> list[tuple[int, int]] | None:
        """Fetch the current favorites ordering for *activity_id* from the hub."""
        return await self.hass.async_add_executor_job(
            self._proxy.request_favorites_order,
            activity_id,
        )

    def describe_favorites_order(
        self,
        activity_id: int,
        order: list[tuple[int, int]],
    ) -> list[dict[str, Any]]:
        """Decorate hub-order entries with cached labels and entry types.

        The hub order uses a shared identifier space for quick-access entries.
        Favorite commands and macros can therefore appear interleaved in the
        same ordered list. On X1S, the hub's 0x63 response may contain only a
        partial ordering even though the activity keymap/macros caches expose
        additional visible quick-access ids. This helper enriches the hub
        entries with cached metadata and backfills any remaining visible ids so
        the returned list better matches the app UI.
        """

        act_lo = activity_id & 0xFF

        favorite_by_id: dict[int, dict[str, Any]] = {}
        for slot in self._proxy.state.get_activity_favorite_slots(act_lo):
            entry_id = int(slot.get("button_id", 0)) & 0xFF
            if entry_id == 0:
                continue
            device_id = int(slot.get("device_id", 0)) & 0xFF
            command_id = int(slot.get("command_id", 0)) & 0xFF
            label = self._proxy.state.get_favorite_label(act_lo, device_id, command_id)
            favorite_by_id[entry_id] = {
                "fav_id": entry_id,
                "button_id": entry_id,
                "activity_map_button_id": entry_id,
                "slot": None,
                "type": "favorite",
                "name": label,
                "device_id": device_id,
                "command_id": command_id,
            }

        macro_by_id: dict[int, dict[str, Any]] = {}
        for macro in self._proxy.state.get_activity_macros(act_lo):
            entry_id = int(macro.get("command_id", 0)) & 0xFF
            if entry_id == 0:
                continue
            macro_by_id[entry_id] = {
                "fav_id": entry_id,
                "button_id": entry_id,
                "slot": None,
                "type": "macro",
                "name": str(macro.get("label") or ""),
                "command_id": entry_id,
            }

        described: list[dict[str, Any]] = []
        seen_ids: set[int] = set()
        for entry_id, slot in sorted(order, key=lambda pair: pair[1]):
            entry_lo = entry_id & 0xFF
            info = dict(
                favorite_by_id.get(entry_lo)
                or macro_by_id.get(entry_lo)
                or {
                    "fav_id": entry_lo,
                    "button_id": entry_lo,
                    "type": "unknown",
                    "name": None,
                }
            )
            info["slot"] = slot & 0xFF
            described.append(info)
            seen_ids.add(entry_lo)

        next_slot = max((int(entry.get("slot", 0)) for entry in described), default=0) + 1
        remaining_ids = sorted(
            (set(favorite_by_id) | set(macro_by_id)) - seen_ids
        )
        for entry_id in remaining_ids:
            info = dict(favorite_by_id.get(entry_id) or macro_by_id.get(entry_id) or {})
            if not info:
                continue
            info["slot"] = next_slot & 0xFF
            described.append(info)
            next_slot += 1

        return described

    async def async_reorder_favorites(
        self,
        activity_id: int,
        ordered_fav_ids: list[int],
        *,
        refresh_after_write: bool = True,
    ) -> dict[str, Any] | None:
        """Re-order favorites for *activity_id* to match *ordered_fav_ids*.

        *ordered_fav_ids* must come from :meth:`async_request_favorites_order`
        or the Home Assistant ``get_favorites`` service.
        """
        return await self.hass.async_add_executor_job(
            partial(
                self._proxy.reorder_favorites,
                activity_id,
                ordered_fav_ids,
                refresh_after_write=refresh_after_write,
            )
        )

    async def async_delete_favorite(
        self,
        activity_id: int,
        fav_id: int,
        *,
        refresh_after_write: bool = True,
    ) -> dict[str, Any] | None:
        """Delete the favorite identified by *fav_id* from *activity_id*.

        Use :meth:`async_request_favorites_order` or the Home Assistant
        ``get_favorites`` service to discover available ``fav_id`` values.
        """
        return await self.hass.async_add_executor_job(
            partial(
                self._proxy.delete_favorite,
                activity_id,
                fav_id,
                refresh_after_write=refresh_after_write,
            )
        )

    async def async_command_to_button(
        self,
        activity_id: int,
        button_id: int,
        device_id: int,
        command_id: int,
        *,
        long_press_device_id: int | None = None,
        long_press_command_id: int | None = None,
        refresh_after_write: bool = True,
    ) -> dict[str, Any] | None:
        """Replay the button-mapping write sequence on the selected hub."""

        return await self.hass.async_add_executor_job(
            partial(
                self._proxy.command_to_button,
                activity_id,
                button_id,
                device_id,
                command_id,
                long_press_device_id=long_press_device_id,
                long_press_command_id=long_press_command_id,
                refresh_after_write=refresh_after_write,
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

        self._log.debug(
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

    async def _async_wait_for_command_fetch_complete(
        self,
        ent_id: int,
        *,
        timeout: float = 10.0,
    ) -> None:
        deadline = monotonic() + timeout
        while monotonic() < deadline:
            self._maybe_complete_command_fetch(ent_id)
            if ent_id not in self._commands_in_flight:
                return
            await asyncio.sleep(0.05)

        self._log.debug(
            "[%s] timed out waiting for commands for 0x%02X",
            self.entry_id,
            ent_id & 0xFF,
        )

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
            self._proxy.state.activity_keybinding_slots.pop(ent_id & 0xFF, None)
            self._proxy.state.activity_members.pop(ent_id & 0xFF, None)
            self._proxy.state.activity_favorite_labels.pop(ent_id & 0xFF, None)
            self._proxy.state.activity_keybinding_labels.pop(ent_id & 0xFF, None)
            self._proxy._clear_favorite_label_requests_for_activity(ent_id & 0xFF)
            self._proxy._clear_keybinding_label_requests_for_activity(ent_id & 0xFF)

        if clear_macros:
            self._proxy.state.activity_macros.pop(ent_id & 0xFF, None)
            self._proxy._pending_macro_requests.discard(ent_id & 0xFF)
            self._proxy._macros_complete.discard(ent_id & 0xFF)

    def _activity_map_cached(self, act_id: int) -> bool:
        act_lo = act_id & 0xFF
        if act_lo in self._proxy._activity_map_complete:
            return True

        # Restored persistent cache may not populate _activity_map_complete,
        # but these structures indicate we already captured activity mapping data.
        return bool(
            self._proxy.state.activity_favorite_slots.get(act_lo)
            or self._proxy.state.activity_members.get(act_lo)
            or self._proxy.state.activity_command_refs.get(act_lo)
        )

    def _activity_favorites_ready(self, act_id: int) -> bool:
        _, ready = self._proxy.ensure_commands_for_activity(
            act_id,
            fetch_if_missing=False,
        )
        return ready

    async def _async_prime_buttons_for(self, act_id: int) -> None:
        # dedupe here
        if act_id in self._pending_button_fetch:
            self._log.debug(
                "[%s] prime_buttons_for(%s): already pending, skipping",
                self.entry_id,
                act_id,
            )
            return

        self._pending_button_fetch.add(act_id)
        self._log.debug(
            "[%s] prime_buttons_for(%s): calling proxy.get_buttons_for_entity()",
            self.entry_id,
            act_id,
        )
        btns, ready = await self.hass.async_add_executor_job(
            self._proxy.get_buttons_for_entity,
            act_id,
        )
        self._log.debug(
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

        map_cached = await self.hass.async_add_executor_job(self._activity_map_cached, act_id)
        if not map_cached:
            await self.hass.async_add_executor_job(self._proxy.request_activity_mapping, act_id)
            await self._async_wait_for_activity_map_ready(act_id)
            await self.hass.async_add_executor_job(
                partial(self._proxy.ensure_commands_for_activity, act_id, fetch_if_missing=True)
            )
        else:
            favorites_ready = await self.hass.async_add_executor_job(
                self._activity_favorites_ready,
                act_id,
            )
            if not favorites_ready:
                await self.hass.async_add_executor_job(
                    partial(self._proxy.ensure_commands_for_activity, act_id, fetch_if_missing=True)
                )

        _, macros_ready = await self.hass.async_add_executor_job(
            partial(self._proxy.get_macros_for_activity, act_id, fetch_if_missing=False)
        )
        if not macros_ready:
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

    def get_all_cached_button_details(self) -> dict[int, dict[int, dict[str, int]]]:
        """Return per-button mapping details (short + long press) from proxy cache."""
        return dict(self._proxy.state.button_details)

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
        press_type = "short"
        resolved_slot: dict[str, Any] | None = None

        if len(parts) >= 4 and parts[0] == "launch":
            try:
                device_id = int(parts[2])
            except ValueError:
                device_id = -1

            if parts[3].isdigit():
                # New format: launch/{hub_id}/{device_id}/{command_index}/{press_type}
                # Resolve command from the deployed snapshot (independent of staged config).
                command_index = int(parts[3])
                if len(parts) >= 5 and parts[4] in ("short", "long"):
                    press_type = parts[4]
                hass_data = getattr(self.hass, "data", {})
                domain_data = hass_data.get(DOMAIN, {}) if isinstance(hass_data, dict) else {}
                store = domain_data.get("command_config_store")
                if store is not None:
                    deployed = store.get_deployed_wifi_commands(self.entry_id, hub_device_id=device_id)
                    if 0 <= command_index < len(deployed):
                        resolved_slot = deployed[command_index]
                        command_label = str(resolved_slot.get("name", ""))
            else:
                # Old format (backwards compat):
                # launch/{hub_id}/{device_id}/{command_name}/{device_name}/{press_type}
                command_label = unquote(parts[3]).replace("_", " ")
                trailing_parts = parts[4:]
                if trailing_parts and trailing_parts[-1] in ("short", "long"):
                    press_type = trailing_parts[-1]
                    trailing_parts = trailing_parts[:-1]
                if trailing_parts:
                    device_name = unquote("/".join(trailing_parts)).replace("_", " ")

        timestamp = datetime.now(timezone.utc)
        record = {
            "entity_id": device_id,
            "entity_kind": "device",
            "entity_name": device_name or (self.devices.get(device_id, {}).get("name") if device_id >= 0 else None),
            "command_id": command_label,
            "command_label": command_label,
            "button_label": command_label,
            "press_type": press_type,
            "timestamp": timestamp.timestamp(),
            "iso_time": timestamp.isoformat(),
            "source_ip": source_ip,
            "path": path,
            "body": body.decode("utf-8", errors="ignore"),
            "headers": headers,
        }
        self._last_ip_command = record
        async_dispatcher_send(self.hass, signal_ip_commands(self.entry_id))
        if resolved_slot is not None:
            await self._async_run_wifi_slot_action(resolved_slot, command_label, press_type=press_type)
        else:
            await self._async_maybe_run_configured_ip_action(command_label, press_type=press_type)

    @property
    def is_sync_in_progress(self) -> bool:
        return self._command_sync_lock.locked()

    def get_command_sync_progress(self, device_key: str | None = None) -> dict[str, Any]:
        normalized_key = "".join(ch for ch in str(device_key or DEFAULT_WIFI_DEVICE_KEY).lower() if ch.isalnum()) or DEFAULT_WIFI_DEVICE_KEY
        progress = self._command_sync_progress.get(normalized_key)
        if isinstance(progress, dict):
            return dict(progress)
        return {"status": "idle", "current_step": 0, "total_steps": 0, "message": "Idle"}

    def _set_command_sync_progress(self, *, device_key: str | None = None, **payload: Any) -> None:
        normalized_key = "".join(ch for ch in str(device_key or DEFAULT_WIFI_DEVICE_KEY).lower() if ch.isalnum()) or DEFAULT_WIFI_DEVICE_KEY
        next_payload = self.get_command_sync_progress(normalized_key)
        next_payload.update(payload)
        self._command_sync_progress[normalized_key] = next_payload
        async_dispatcher_send(self.hass, signal_command_sync(self.entry_id))

    def _managed_wifi_devices(
        self, devices: dict[int, dict[str, Any]] | None = None
    ) -> list[tuple[int, str, str, str]]:
        managed: list[tuple[int, str, str, str]] = []
        for dev_id, device in (devices or self.devices).items():
            brand = str(device.get("brand") or "").strip()
            device_key, command_hash = _parse_managed_wifi_brand(brand)
            if device_key and command_hash:
                managed.append((int(dev_id), device_key, command_hash, brand))
        return managed

    async def _async_refresh_devices_snapshot(
        self, timeout_seconds: float = 15.0
    ) -> dict[int, dict[str, Any]]:
        """Request a fresh device burst and wait briefly for the local cache to update."""

        previous_generation = self._devices_generation
        await self.hass.async_add_executor_job(self._proxy.request_devices)

        deadline = monotonic() + timeout_seconds
        while monotonic() < deadline:
            if self._devices_generation > previous_generation:
                return dict(self.devices)
            await asyncio.sleep(0.1)

        return dict(self.devices)

    async def async_request_catalog(self, kind: str, timeout_seconds: float = 30.0) -> None:
        """Send REQ_ACTIVITIES or REQ_DEVICES to the hub and wait for the burst to complete.

        Uses a snapshot-clear-fetch-prune strategy: the name catalog is cleared before
        the request so deleted entries don't persist, and per-entity detail data
        (commands, macros) is preserved for entities that still exist and pruned only
        for entities that were removed from the catalog.
        """
        if kind == "activities":
            old_ids = await self.hass.async_add_executor_job(self._proxy.get_known_activity_ids)
            await self.hass.async_add_executor_job(self._proxy.clear_activities_catalog)
            previous_generation = self._activities_generation
            await self.hass.async_add_executor_job(self._proxy.request_activities)
            deadline = monotonic() + timeout_seconds
            while monotonic() < deadline:
                if self._activities_generation > previous_generation:
                    break
                await asyncio.sleep(0.1)
            new_ids = await self.hass.async_add_executor_job(self._proxy.get_known_activity_ids)
            cached_detail_ids = await self.hass.async_add_executor_job(
                self._proxy.get_cached_activity_detail_ids
            )
            for act_id in (old_ids | cached_detail_ids) - new_ids:
                await self.hass.async_add_executor_job(
                    partial(self._proxy.clear_persistent_cache_for, act_id, kind="activity")
                )
        elif kind == "devices":
            old_ids = await self.hass.async_add_executor_job(self._proxy.get_known_device_ids)
            await self.hass.async_add_executor_job(self._proxy.clear_devices_catalog)
            await self._async_refresh_devices_snapshot(timeout_seconds=timeout_seconds)
            new_ids = await self.hass.async_add_executor_job(self._proxy.get_known_device_ids)
            for dev_id in old_ids - new_ids:
                await self.hass.async_add_executor_job(
                    partial(self._proxy.clear_persistent_cache_for, dev_id, kind="device")
                )
        else:
            raise ValueError(f"Unknown catalog kind: {kind!r}")

        self._bump_cache_generation()
        if kind == "activities":
            async_dispatcher_send(self.hass, signal_activity(self.entry_id))
            async_dispatcher_send(self.hass, signal_commands(self.entry_id))
            async_dispatcher_send(self.hass, signal_macros(self.entry_id))
        else:
            async_dispatcher_send(self.hass, signal_devices(self.entry_id))
            async_dispatcher_send(self.hass, signal_commands(self.entry_id))

    def get_managed_command_hashes(self, device_key: str | None = None) -> list[str]:
        normalized_key = "".join(ch for ch in str(device_key or "").lower() if ch.isalnum())
        hashes: set[str] = set()
        for _dev_id, managed_key, command_hash, _brand in self._managed_wifi_devices():
            if normalized_key and managed_key != normalized_key:
                continue
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

    async def _async_run_wifi_slot_action(
        self,
        slot: dict[str, Any],
        command_label: str,
        *,
        press_type: str = "short",
    ) -> None:
        """Execute the configured action from a resolved command slot dict."""
        if press_type == "long":
            if not bool(slot.get("long_press_enabled")):
                return
            action = (
                slot.get("long_press_action")
                if isinstance(slot.get("long_press_action"), dict)
                else {}
            )
        else:
            action = slot.get("action") if isinstance(slot.get("action"), dict) else {}
        try:
            await self._async_execute_action_config(action)
        except Exception as err:  # pragma: no cover - service boundary
            self._log.warning(
                "[%s] Failed executing configured IP action for '%s': %s",
                self.entry_id,
                command_label,
                err,
            )

    async def _async_maybe_run_configured_ip_action(
        self,
        command_label: str,
        *,
        press_type: str = "short",
    ) -> None:
        hass_data = getattr(self.hass, "data", {})
        domain_data = hass_data.get(DOMAIN, {}) if isinstance(hass_data, dict) else {}
        store = domain_data.get("command_config_store")
        if store is None:
            return

        payload = await store.async_get_hub_config(self.entry_id, device_key=DEFAULT_WIFI_DEVICE_KEY)
        command_key = normalize_command_name(command_label)
        for slot in payload.get("commands", []):
            if normalize_command_name(slot.get("name")) != command_key:
                continue
            await self._async_run_wifi_slot_action(slot, command_label, press_type=press_type)
            return

    async def async_sync_command_config(
        self,
        *,
        command_payload: dict[str, Any],
        request_port: int,
        device_key: str = DEFAULT_WIFI_DEVICE_KEY,
        device_name: str = "Home Assistant",
    ) -> dict[str, Any]:
        if self._command_sync_lock.locked():
            raise HomeAssistantError("sync_in_progress")

        async with self._command_sync_lock:
            commands = list(command_payload.get("commands") or [])
            configured_slots = count_configured_command_slots(commands)
            commands_hash = str(command_payload.get("commands_hash") or "")
            deployed_commands_hash = str(command_payload.get("deployed_commands_hash") or "")
            deployed_device_id = command_payload.get("deployed_device_id")
            normalized_device_key = "".join(ch for ch in str(device_key or DEFAULT_WIFI_DEVICE_KEY).lower() if ch.isalnum()) or DEFAULT_WIFI_DEVICE_KEY
            brand_name = f"{COMMAND_BRAND_PREFIX}-{commands_hash}"
            total_steps = 8 if configured_slots > 0 else 7
            self._set_command_sync_progress(
                device_key=normalized_device_key,
                status="running",
                current_step=0,
                total_steps=total_steps,
                message="Starting sync",
            )

            self._set_command_sync_progress(
                device_key=normalized_device_key,
                current_step=1,
                message="Ensuring Wifi Device is enabled",
            )
            if configured_slots > 0 and not self.roku_server_enabled:
                await self.async_set_roku_server_enabled(True)
                from .roku_listener import async_get_roku_listener

                listener = await async_get_roku_listener(self.hass)
                listener_error = listener.get_last_start_error()
                if listener_error:
                    self._set_command_sync_progress(
                        device_key=normalized_device_key,
                        status="failed",
                        message=(
                            "Failed enabling Wifi Device. "
                            f"Port {request_port} may already be in use. "
                            f"Details: {listener_error}. See {WIFI_DEVICE_ENABLE_DOCS_URL}"
                        ),
                    )
                    raise HomeAssistantError(
                        "Unable to enable Wifi Device (Roku/HTTP Listener): "
                        f"port {request_port} may already be in use. "
                        f"See {WIFI_DEVICE_ENABLE_DOCS_URL}"
                    )

            device_snapshot = await self._async_refresh_devices_snapshot()
            managed_by_id: dict[int, tuple[int, str, str, str]] = {}
            for dev_id, managed_key, managed_hash, brand in self._managed_wifi_devices(device_snapshot):
                if isinstance(deployed_device_id, int) and int(dev_id) == deployed_device_id:
                    managed_by_id[int(dev_id)] = (dev_id, managed_key, managed_hash, brand)
                    continue
                if deployed_commands_hash and managed_hash == deployed_commands_hash:
                    managed_by_id[int(dev_id)] = (dev_id, managed_key, managed_hash, brand)
                    continue
                if managed_key == normalized_device_key:
                    managed_by_id[int(dev_id)] = (dev_id, managed_key, managed_hash, brand)
            managed = list(managed_by_id.values())
            self._set_command_sync_progress(
                device_key=normalized_device_key,
                current_step=2,
                message="Deleting existing managed Wifi Device(s)",
            )
            for dev_id, _managed_key, _managed_hash, _brand in managed:
                result = await self.async_delete_device(dev_id)
                if not result:
                    self._set_command_sync_progress(
                        device_key=normalized_device_key,
                        status="failed",
                        message=f"Failed deleting managed device {dev_id}",
                    )
                    raise HomeAssistantError(
                        f"Failed deleting managed device {dev_id}"
                    )

            if configured_slots == 0:
                if self.roku_server_enabled:
                    self._set_command_sync_progress(
                        device_key=normalized_device_key,
                        current_step=3,
                        message="Disabling Wifi Device",
                    )
                    await self.async_set_roku_server_enabled(False)

                hass_data = getattr(self.hass, "data", {})
                domain_data = hass_data.get(DOMAIN, {}) if isinstance(hass_data, dict) else {}
                store = domain_data.get("command_config_store")
                if store is not None:
                    await store.async_save_deployed_wifi_commands(
                        self.entry_id,
                        normalized_device_key,
                        [],
                        deployed_device_id=None,
                        commands_hash="",
                    )

                self._set_command_sync_progress(
                    device_key=normalized_device_key,
                    status="success",
                    current_step=7,
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

            command_defs: list[dict[str, Any]] = []
            input_command_ids: list[int] = []
            activity_input_command_ids: dict[int, int] = {}
            max_power_command_id = min(len(commands), _WIFI_COMMAND_SLOT_COUNT)
            raw_power_on_command_id = command_payload.get("power_on_command_id")
            raw_power_off_command_id = command_payload.get("power_off_command_id")
            power_on_command_id = normalize_power_command_id(
                raw_power_on_command_id,
                max_command_id=max_power_command_id,
            )
            power_off_command_id = normalize_power_command_id(
                raw_power_off_command_id,
                max_command_id=max_power_command_id,
            )
            if raw_power_on_command_id is not None and power_on_command_id is None:
                raise HomeAssistantError(
                    f"power_on_command_id must be between 1 and {max_power_command_id}"
                )
            if raw_power_off_command_id is not None and power_off_command_id is None:
                raise HomeAssistantError(
                    f"power_off_command_id must be between 1 and {max_power_command_id}"
                )
            for idx, slot in enumerate(commands[:_WIFI_COMMAND_SLOT_COUNT]):
                raw_input_activity_id = str(slot.get("input_activity_id") or "").strip()
                if not raw_input_activity_id:
                    continue
                try:
                    input_activity_id = int(raw_input_activity_id)
                except (TypeError, ValueError):
                    continue
                command_id = idx + 1
                input_command_ids.append(command_id)
                activity_input_command_ids.setdefault(input_activity_id, command_id)
            for idx, slot in enumerate(commands[:_WIFI_COMMAND_SLOT_COUNT]):
                name = str(slot.get("name") or f"Command {idx + 1}").strip() or f"Command {idx + 1}"
                command_defs.append(
                    {
                        "display_name": name,
                        "trigger_name": name,
                        "press_type": "short",
                        "command_index": idx,
                    }
                )
            for idx, slot in enumerate(commands[:_WIFI_COMMAND_SLOT_COUNT]):
                name = str(slot.get("name") or f"Command {idx + 1}").strip() or f"Command {idx + 1}"
                command_defs.append(
                    {
                        "display_name": f"{name} Long Press",
                        "trigger_name": name,
                        "press_type": "long",
                        "command_index": idx,
                    }
                )

            self._set_command_sync_progress(
                device_key=normalized_device_key,
                current_step=3,
                message="Creating Wifi Device on Hub",
            )
            created = await self.async_create_wifi_device(
                device_name=device_name,
                commands=command_defs,
                request_port=request_port,
                brand_name=brand_name,
                power_on_command_id=power_on_command_id,
                power_off_command_id=power_off_command_id,
                input_command_ids=input_command_ids or None,
            )
            if not created or not created.get("device_id"):
                self._set_command_sync_progress(
                    device_key=normalized_device_key,
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
                raw_input_activity_id = str(slot.get("input_activity_id") or "").strip()
                if raw_input_activity_id:
                    try:
                        activity_ids.add(int(raw_input_activity_id))
                    except (TypeError, ValueError):
                        pass

            add_results: dict[int, bool] = {}
            self._set_command_sync_progress(
                device_key=normalized_device_key,
                current_step=4,
                message="Adding Wifi Device to Activities",
            )
            for act_id in sorted(activity_ids):
                result = await self.async_add_device_to_activity(
                    act_id,
                    wifi_device_id,
                    input_cmd_id=activity_input_command_ids.get(act_id),
                )
                add_results[act_id] = bool(result)

            if activity_ids and not all(add_results.values()):
                await self.async_delete_device(wifi_device_id)
                self._set_command_sync_progress(
                    device_key=normalized_device_key,
                    status="failed",
                    current_step=5,
                    message="Failed activity membership; rolled back Wifi Device",
                )
                raise HomeAssistantError("Failed adding Wifi Device to all activities")

            self._set_command_sync_progress(
                device_key=normalized_device_key,
                current_step=5,
                message="Applying activity favorites",
            )

            # Track the hub-assigned fav_id for every successfully added favorite,
            # keyed by activity and ordered by command slot (add order).  We use
            # these tracked ids in the post-hoc reorder rather than a pre-existing
            # snapshot so that fav_id recycling (the hub reusing freed ids) cannot
            # cause old scrambled orders to be mistaken for "existing to preserve".
            activities_new_fav_ids: dict[int, list[int]] = {}

            activities_with_favorites: set[int] = set()
            for slot_idx, slot in enumerate(commands[:_WIFI_COMMAND_SLOT_COUNT]):
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
                    result = await self.async_command_to_favorite(
                        act_id,
                        wifi_device_id,
                        command_id,
                        refresh_after_write=False,
                    )
                    activities_with_favorites.add(act_id)
                    if result and result.get("fav_id") is not None:
                        activities_new_fav_ids.setdefault(act_id, []).append(
                            result["fav_id"]
                        )

            # Explicitly reorder so that all favorites (including the 5th+) get
            # a display slot on the physical remote.  Without this step the
            # stage payload sent by command_to_favorite may leave favorites beyond
            # the 4th without a slot assignment on X1S/X2, making them invisible
            # on the remote's touch screen.
            #
            # Desired order: pre-existing entries (macros, other-device favorites)
            # in their current slot order, followed by the newly-added wifi-command
            # favorites in command-slot order (i.e. the order they were added).
            #
            # We identify "new" favorites by the fav_id returned from each
            # command_to_favorite call.  This is robust against hub fav_id
            # recycling: when the hub reuses an id that was freed by a prior
            # managed-device deletion, the recycled id still lands in
            # activities_new_fav_ids and is correctly treated as a new add.
            for act_id in sorted(activities_with_favorites):
                all_order = await self.async_request_favorites_order(act_id)
                if not all_order:
                    continue
                new_fav_id_list = activities_new_fav_ids.get(act_id, [])
                new_fav_id_set = set(new_fav_id_list)
                # Pre-existing = everything in current slot order that is NOT
                # one of the newly-added wifi-command favorites.
                pre_existing = [
                    fav_id
                    for fav_id, _slot in sorted(all_order, key=lambda x: x[1])
                    if fav_id not in new_fav_id_set
                ]
                final_order = pre_existing + new_fav_id_list
                await self.async_reorder_favorites(
                    act_id, final_order, refresh_after_write=False
                )

            self._set_command_sync_progress(
                device_key=normalized_device_key,
                current_step=6,
                message="Applying activity button mappings",
            )
            for slot_idx, slot in enumerate(commands[:_WIFI_COMMAND_SLOT_COUNT]):
                hard_button = str(slot.get("hard_button") or "").strip().lower()
                if not hard_button:
                    continue
                button_id = _HARD_BUTTON_TO_CODE.get(hard_button)
                if not button_id:
                    continue
                command_id = slot_idx + 1
                long_press_enabled = bool(slot.get("long_press_enabled"))
                long_press_command_id = (
                    slot_idx + 1 + _WIFI_COMMAND_LONG_PRESS_OFFSET
                    if long_press_enabled
                    else None
                )
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
                        long_press_device_id=wifi_device_id if long_press_enabled else None,
                        long_press_command_id=long_press_command_id,
                        refresh_after_write=False,
                    )

            self._set_command_sync_progress(
                device_key=normalized_device_key,
                current_step=7,
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

            # Fetch device commands for the newly-created wifi device so that
            # state.commands[wifi_device_id] is populated with the real labels
            # (e.g. "Dim the lights").  Without this, _build_cache_activity_favorites
            # falls back to "Command N" because command_to_favorite clears
            # activity_favorite_labels and the activity-map refresh only returns
            # slot/command IDs, not labels.
            await self.hass.async_add_executor_job(
                partial(self._proxy.get_commands_for_entity, wifi_device_id, fetch_if_missing=True)
            )

            self._set_command_sync_progress(
                device_key=normalized_device_key,
                current_step=8,
                message="Resyncing physical remote",
            )
            await self.async_resync_remote()

            # Persist the command list that was just synced to the hub.
            # Callbacks will resolve command indices against this frozen snapshot,
            # independently of any subsequent staged-config edits.
            hass_data = getattr(self.hass, "data", {})
            domain_data = hass_data.get(DOMAIN, {}) if isinstance(hass_data, dict) else {}
            store = domain_data.get("command_config_store")
            if store is not None:
                await store.async_save_deployed_wifi_commands(
                    self.entry_id,
                    normalized_device_key,
                    list(commands[:_WIFI_COMMAND_SLOT_COUNT]),
                    deployed_device_id=wifi_device_id,
                    commands_hash=commands_hash,
                )

            self._set_command_sync_progress(
                device_key=normalized_device_key,
                status="success",
                current_step=8,
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
        self._log.debug("[%s] Activating activity %s", self.entry_id, act_id)
        await self.hass.async_add_executor_job(
            self._proxy.send_command,
            int(act_id),
            ButtonName.POWER_ON,
        )

    async def async_power_off_current(self) -> None:
        if self.current_activity is None:
            return
        self._log.debug("[%s] Powering off current activity %s", self.entry_id, self.current_activity)
        await self.hass.async_add_executor_job(
            self._proxy.send_command,
            int(self.current_activity),
            ButtonName.POWER_OFF,
        )

    async def async_find_remote(self) -> None:
        self._log.debug("[%s] Triggering find-remote signal", self.entry_id)
        await self.hass.async_add_executor_job(self._proxy.find_remote, self.version)

    async def async_resync_remote(self) -> None:
        self._log.debug("[%s] Triggering remote resync", self.entry_id)
        await self.hass.async_add_executor_job(self._proxy.resync_remote, self.version)

    def _async_update_options(self, key: str, value: Any) -> None:
        """Update a key in the ConfigEntry options."""
        entry = self.hass.config_entries.async_get_entry(self.entry_id)
        if entry:
            new_options = entry.options.copy()
            new_options[key] = value
            self.hass.config_entries.async_update_entry(entry, options=new_options)

    async def async_set_hub_version(self, version: str) -> None:
        """Set hub version override and persist to config entry metadata."""

        if version not in HVER_BY_HUB_VERSION:
            raise HomeAssistantError("hub_version must be one of: X1, X1S, X2")

        entry = self.hass.config_entries.async_get_entry(self.entry_id)
        if entry is None:
            raise HomeAssistantError("Config entry not found")

        data = dict(entry.data)
        options = dict(entry.options)
        mdns_txt_raw = data.get(CONF_MDNS_TXT, {})
        mdns_txt = dict(mdns_txt_raw) if isinstance(mdns_txt_raw, dict) else {}
        mdns_txt["HVER"] = HVER_BY_HUB_VERSION[version]

        data[CONF_MDNS_TXT] = mdns_txt
        data[CONF_MDNS_VERSION] = version
        options[CONF_MDNS_VERSION] = version

        self.version = version
        self.mdns_txt = mdns_txt
        self._proxy.hub_version = version
        self._proxy.mdns_txt["HVER"] = mdns_txt["HVER"]

        self.hass.config_entries.async_update_entry(
            entry,
            data=data,
            options=options,
            title=format_hub_entry_title(version, data.get("host"), data.get(CONF_MAC)),
        )
        async_dispatcher_send(self.hass, signal_hub(self.entry_id))

    async def async_set_proxy_enabled(self, enable: bool) -> None:
        self._log.debug("[%s] Setting proxy enabled=%s", self.entry_id, enable)
        if enable:
            await self.hass.async_add_executor_job(self._proxy.enable_proxy)
        else:
            await self.hass.async_add_executor_job(self._proxy.disable_proxy)
        self.proxy_enabled = enable
        self.hass.loop.call_soon_threadsafe(
            self._async_update_options, CONF_PROXY_ENABLED, enable
        )


    async def async_set_roku_server_enabled(self, enable: bool) -> None:
        self._log.debug("[%s] Setting WiFi device enabled=%s", self.entry_id, enable)
        self.roku_server_enabled = enable
        self.hass.loop.call_soon_threadsafe(
            self._async_update_options, CONF_ROKU_SERVER_ENABLED, enable
        )
        async_dispatcher_send(self.hass, signal_wifi_device(self.entry_id))
        from .roku_listener import async_get_roku_listener

        listener = await async_get_roku_listener(self.hass)
        await listener.async_set_hub_enabled(self.entry_id, enable)

    async def async_set_hex_logging_enabled(self, enable: bool) -> None:
        self._log.debug("[%s] Setting hex logging enabled=%s", self.entry_id, enable)
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
            self._log.debug("[%s] Tried to send button %s but no activity is active", self.entry_id, btn_code)
            return
        self._log.debug(
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
        
        self._log.debug("Trying to send command %s to device %s", key, device)

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

