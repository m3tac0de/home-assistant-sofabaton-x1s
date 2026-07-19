from __future__ import annotations

import asyncio
import logging
from time import monotonic
from datetime import datetime, timezone
from functools import partial
from typing import Any, Dict, Optional
from urllib.parse import unquote

from homeassistant.components import persistent_notification
from homeassistant.components.zeroconf import async_get_instance
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.helpers import device_registry as dr
from homeassistant.exceptions import HomeAssistantError

from .const import (
    DOMAIN,
    HUB_BUNDLE_SCHEMA_VERSION,
    CONF_HEX_LOGGING_ENABLED,
    CONF_MAC,
    CONF_NAME,
    CONF_MDNS_TXT,
    CONF_MDNS_VERSION,
    CONF_PROXY_ENABLED,
    CONF_ROKU_SERVER_ENABLED,
    HUB_VERSION_X1,
    HUB_VERSION_X1S,
    HVER_BY_HUB_VERSION,
    classify_hub_version,
    format_hub_entry_title,
    signal_activity,
    signal_app_activations,
    signal_hub_events,
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
from .cache_store import PersistentCacheStore
from .lib.protocol_const import (
    BUTTONNAME_BY_CODE,
    ButtonName,
    DEVICE_CLASS_BLUETOOTH,
    DEVICE_CLASS_IR,
    DEVICE_CLASS_RF_315,
    DEVICE_CLASS_RF_433,
    DEVICE_CLASS_WIFI_HUE,
    DEVICE_CLASS_WIFI_IP,
    DEVICE_CLASS_WIFI_MQTT,
    DEVICE_CLASS_WIFI_ROKU,
    DEVICE_CLASS_WIFI_SONOS,
    normalize_device_class,
)
from .lib.blob_decoders import (
    format_decoded_for_display as decoded_blob_display_text,
    is_decodable_class as is_blob_decodable_class,
    try_decode_blob as try_decode_command_blob,
)
from .lib.backup_export import PAYLOAD_PROFILE_FULL
from .lib.commands import split_play_blob_tail
from .lib.devices import DeviceConfig, parse_device_record
from .lib.wifi_inplace_plan import (
    baseline_snapshot_from_bundle,
    build_wifi_inplace_plan,
    derive_device_level_bindings,
    desired_snapshot_from_config,
)
from .lib.x1_proxy import X1Proxy
from .command_config import (
    COMMAND_BRAND_PREFIX,
    LEGACY_COMMAND_BRAND_PREFIX,
    async_get_command_config_store,
    DEFAULT_WIFI_DEVICE_KEY,
    count_configured_command_slots,
    normalize_command_name,
    normalize_power_command_id,
    wifi_device_requires_listener,
)

_LOGGER = logging.getLogger(__name__)

_HARD_BUTTON_TO_CODE: dict[str, int] = {"up": ButtonName.UP, "down": ButtonName.DOWN, "left": ButtonName.LEFT, "right": ButtonName.RIGHT, "ok": ButtonName.OK, "back": ButtonName.BACK, "home": ButtonName.HOME, "menu": ButtonName.MENU, "volup": ButtonName.VOL_UP, "voldn": ButtonName.VOL_DOWN, "mute": ButtonName.MUTE, "chup": ButtonName.CH_UP, "chdn": ButtonName.CH_DOWN, "guide": ButtonName.GUIDE, "dvr": ButtonName.DVR, "play": ButtonName.PLAY, "exit": ButtonName.EXIT, "rew": ButtonName.REW, "pause": ButtonName.PAUSE, "fwd": ButtonName.FWD, "red": ButtonName.RED, "green": ButtonName.GREEN, "yellow": ButtonName.YELLOW, "blue": ButtonName.BLUE, "a": ButtonName.A, "b": ButtonName.B, "c": ButtonName.C}
_WIFI_COMMAND_SLOT_COUNT = 10
_WIFI_COMMAND_LONG_PRESS_OFFSET = 10


def _parse_managed_wifi_brand(brand: str) -> tuple[str | None, str | None]:
    text = str(brand or "").strip()
    suffix = ""
    for prefix_value in (COMMAND_BRAND_PREFIX, LEGACY_COMMAND_BRAND_PREFIX):
        prefix = f"{prefix_value}-"
        if text.startswith(prefix):
            suffix = text[len(prefix):].strip()
            break
    if not suffix:
        return None, None
    if "-" not in suffix:
        return None, suffix
    device_key, command_hash = suffix.split("-", 1)
    device_key = "".join(ch for ch in str(device_key).lower() if ch.isalnum())
    return (device_key or DEFAULT_WIFI_DEVICE_KEY), command_hash.strip()


def _is_network_callback_device_class(device_class: Any) -> bool:
    normalized = normalize_device_class(device_class)
    return normalized in {
        DEVICE_CLASS_WIFI_ROKU,
        DEVICE_CLASS_WIFI_IP,
        DEVICE_CLASS_WIFI_HUE,
        DEVICE_CLASS_WIFI_MQTT,
        DEVICE_CLASS_WIFI_SONOS,
    }


def get_hub_model(entry: ConfigEntry) -> str:
    """Return the model string for this hub, preferring detected mDNS metadata."""

    mdns_txt = entry.data.get("mdns_txt", {})
    if isinstance(mdns_txt, dict):
        try:
            return classify_hub_version(mdns_txt)
        except ValueError:
            # Fall through to the stored config-entry value when the
            # advertisement is missing/unrecognised; the banner will
            # repair it on first connect.
            pass

    model = entry.options.get(CONF_MDNS_VERSION) or entry.data.get(CONF_MDNS_VERSION)
    if isinstance(model, str) and model:
        return model

    return "X1"


def get_hub_display_name(hub: "SofabatonHub", entry: ConfigEntry | None = None) -> str:
    """Return the current authoritative hub name for UI and discovery."""

    name = str(getattr(hub, "name", "") or "").strip()
    if name:
        return name

    if entry is not None:
        fallback = str(entry.data.get(CONF_NAME) or "").strip()
        if fallback:
            return fallback

    return "Sofabaton Hub"


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
        self.mdns_txt = dict(mdns_txt or {})
        self.mdns_txt["HA_PROXY"] = "1"
        if version:
            self.version = version
        else:
            try:
                self.version = classify_hub_version(self.mdns_txt)
            except ValueError:
                # Manual entry or pre-handshake: variant is unknown
                # until the connect banner identifies it. Pin to the
                # narrow-line layout in the meantime so wire-schema
                # lookups stay valid; a real-hub mismatch is corrected
                # by ``_apply_banner_identity`` on first connect.
                self.version = HUB_VERSION_X1

        self._proxy_udp_port = proxy_udp_port
        self._hub_listen_base = hub_listen_base
        self.activities: Dict[int, Dict[str, Any]] = {}
        self.devices: Dict[int, Dict[str, Any]] = {}
        self.current_activity: Optional[int] = None
        # Hub-level event hooks stay disarmed until the initial activity
        # state is established after (re)creating the proxy — the first
        # complete activities read, or the first change callback if one
        # lands earlier — so a restart that merely discovers an
        # already-running activity doesn't fire user actions.
        self._hub_event_hooks_armed = False
        self.client_connected: bool = False
        self.hub_connected: bool = False
        self.banner_model: str | None = None
        self.hub_firmware_version: int | None = None
        self.production_batch: str | None = None
        self.activities_ready: bool = False
        self.devices_ready: bool = False
        # Set while the hub is doing a firmware OTA (opcode 0x0167); we
        # suppress reconnect attempts and post a persistent notification
        # so the user knows to come back in a few minutes. Cleared on the
        # next successful hub connection.
        self._ota_in_progress: bool = False
        self._ota_notification_id = f"sofabaton_x1s_ota_{entry_id}"
        self._ota_pause_seconds: float = 300.0
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
        self._last_hub_event: dict[str, Any] | None = None
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

    def _apply_banner_info(self, banner_info: dict[str, Any] | None) -> bool:
        info = banner_info if isinstance(banner_info, dict) else {}
        next_model = str(info.get("model") or "").strip() or None
        next_batch = str(info.get("production_batch") or "").strip() or None
        firmware_value = info.get("firmware_version")
        next_firmware = int(firmware_value) if isinstance(firmware_value, (int, float)) else None

        changed = (
            self.banner_model != next_model
            or self.production_batch != next_batch
            or self.hub_firmware_version != next_firmware
        )
        if not changed:
            return False

        self.banner_model = next_model
        self.production_batch = next_batch
        self.hub_firmware_version = next_firmware
        return True

    def _build_authoritative_mdns_txt(
        self,
        *,
        name: str,
        version: str,
        firmware_version: int,
    ) -> dict[str, str]:
        next_txt = dict(self.mdns_txt)
        next_txt.pop("HA_PROXY", None)
        next_txt["NAME"] = name
        next_txt["HVER"] = HVER_BY_HUB_VERSION[version]
        next_txt["AVER"] = str(int(firmware_version))
        return next_txt

    async def _async_update_device_registry_name(self, next_name: str) -> None:
        """Keep the HA device registry aligned with the authoritative hub name."""

        normalized_name = str(next_name or "").strip()
        if not normalized_name:
            return

        device_registry = dr.async_get(self.hass)
        if device_registry is None:
            return

        config_entries = getattr(self.hass, "config_entries", None)
        entry = (
            config_entries.async_get_entry(self.entry_id)
            if config_entries is not None and hasattr(config_entries, "async_get_entry")
            else None
        )
        hub_mac = str(self.mac or (entry.data.get(CONF_MAC) if entry is not None else "") or "").strip()
        if not hub_mac or not hasattr(device_registry, "async_get_device") or not hasattr(device_registry, "async_update_device"):
            return

        device = device_registry.async_get_device(
            identifiers={(DOMAIN, hub_mac)},
            connections=set(),
        )
        if device is None:
            return

        if str(getattr(device, "name_by_user", "") or "").strip():
            return

        current_name = str(getattr(device, "name", "") or "").strip()
        if current_name == normalized_name:
            return

        device_registry.async_update_device(device.id, name=normalized_name)

    async def _async_sync_authoritative_identity(
        self,
        banner_info: dict[str, Any] | None,
    ) -> bool:
        banner_changed = self._apply_banner_info(banner_info)
        if not isinstance(banner_info, dict):
            return banner_changed

        next_name = str(banner_info.get("name") or "").strip()
        next_version = self.banner_model
        next_firmware = self.hub_firmware_version
        if not next_name or not next_version or next_firmware is None:
            return banner_changed

        next_txt = self._build_authoritative_mdns_txt(
            name=next_name,
            version=next_version,
            firmware_version=next_firmware,
        )
        runtime_txt = dict(next_txt)
        runtime_txt["HA_PROXY"] = "1"

        previous_name = str(self.name or "").strip()
        identity_changed = (
            previous_name != next_name
            or self.version != next_version
            or dict((k, v) for k, v in self.mdns_txt.items() if k != "HA_PROXY") != next_txt
        )

        self.name = next_name
        self.version = next_version
        self.mdns_txt = runtime_txt
        self.mac = runtime_txt.get("MAC") or runtime_txt.get("mac") or None
        await self.hass.async_add_executor_job(
            partial(
                self._proxy.update_discovery_identity,
                mdns_txt=self.mdns_txt,
                hub_version=self.version,
            )
        )

        config_entries = getattr(self.hass, "config_entries", None)
        entry = (
            config_entries.async_get_entry(self.entry_id)
            if config_entries is not None and hasattr(config_entries, "async_get_entry")
            else None
        )
        if entry is not None:
            data = dict(entry.data)
            options = dict(entry.options)
            changed = False
            if data.get(CONF_NAME) != next_name:
                data[CONF_NAME] = next_name
                changed = True
            if data.get(CONF_MDNS_TXT) != next_txt:
                data[CONF_MDNS_TXT] = next_txt
                changed = True
            if data.get(CONF_MDNS_VERSION) != next_version:
                data[CONF_MDNS_VERSION] = next_version
                changed = True
            if options.get(CONF_MDNS_VERSION) != next_version:
                options[CONF_MDNS_VERSION] = next_version
                changed = True
            expected_title = format_hub_entry_title(
                next_version,
                data.get("host"),
                data.get(CONF_MAC),
            )
            update_kwargs: dict[str, Any] = {}
            if changed:
                update_kwargs["data"] = data
                update_kwargs["options"] = options
            if entry.title != expected_title:
                update_kwargs["title"] = expected_title
            if update_kwargs:
                self.hass.config_entries.async_update_entry(entry, **update_kwargs)

        if previous_name != next_name:
            await self._async_update_device_registry_name(next_name)

        return banner_changed or identity_changed

    async def _async_get_persistent_cache_store(self) -> PersistentCacheStore:
        domain_data = self.hass.data.setdefault(DOMAIN, {})
        store = domain_data.get("persistent_cache_store")
        if isinstance(store, PersistentCacheStore):
            return store

        store = PersistentCacheStore(self.hass)
        await store.async_load()
        domain_data["persistent_cache_store"] = store
        return store

    async def _async_persist_cache_if_enabled(self) -> bool:
        store = await self._async_get_persistent_cache_store()
        if not store.enabled:
            return False

        await store.async_set_hub_cache(self.entry_id, await self.async_export_cache_state())
        return True

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
        proxy.on_ota_update(self._on_ota_update)
        proxy.on_burst_end("devices", self._on_devices_burst)
        proxy.on_burst_end("commands", self._on_commands_burst)
        proxy.on_burst_end("macros", self._on_macros_burst)
        proxy.on_app_activation(self._on_app_activation)
        proxy.on_redundant_off_press(self._on_redundant_off_press)
        proxy.transport.set_busy_gate(self.is_long_running_task_active)
        self._hub_event_hooks_armed = False
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
    # proxy -> HA
    # ------------------------------------------------------------------
    def _on_activity_change(self, new_id: Optional[int], old_id: Optional[int], name: Optional[str]) -> None:
        def _inner() -> None:
            self._log.debug(
                "[%s] Activity changed: %s -> %s (%s)",
                self.entry_id,
                old_id,
                new_id,
                name,
            )
            self.current_activity = new_id
            async_dispatcher_send(self.hass, signal_activity(self.entry_id))

            # Fallback arming for change notifications that arrive before
            # the first complete activities read (e.g. the ACK_READY path
            # while a proxy client is connected); the primary arm site is
            # _on_activities_burst, which also covers a powered-off startup.
            hooks_armed = self._hub_event_hooks_armed
            self._hub_event_hooks_armed = True

            if new_id is not None:
                # ask for buttons, but dedup
                self.hass.async_create_task(self._async_prime_buttons_for(new_id))
            if hooks_armed and (new_id is not None or old_id is not None):
                # Per-activity hooks first: the old activity stopped (also on
                # a switch straight into another activity), then the new one
                # started. Task-creation order keeps scheduling deterministic.
                if old_id is not None and old_id != new_id:
                    self.hass.async_create_task(
                        self._async_run_activity_event_action(old_id, "stop")
                    )
                    # Hub-level hook: an activity stopped (switch or OFF).
                    self.hass.async_create_task(
                        self._async_run_hub_event_action("activity_stop")
                    )
                if new_id is not None:
                    self.hass.async_create_task(
                        self._async_run_activity_event_action(new_id, "start")
                    )
                    # Hub-level hook: an activity started.
                    self.hass.async_create_task(
                        self._async_run_hub_event_action("activity_start")
                    )
                elif old_id is not None:
                    # Hub-level hook: the hub switched into POWERED OFF.
                    self.hass.async_create_task(
                        self._async_run_hub_event_action("power_off")
                    )
                self._notify_hub_event(
                    {
                        "type": "activity_change",
                        "from_activity_id": old_id,
                        "to_activity_id": new_id,
                    }
                )
        self.hass.loop.call_soon_threadsafe(_inner)

    def _on_redundant_off_press(self) -> None:
        def _inner() -> None:
            self._log.debug(
                "[%s] OFF pressed while hub already powered off",
                self.entry_id,
            )
            self.hass.async_create_task(
                self._async_run_hub_event_action("redundant_off")
            )
            self._notify_hub_event({"type": "redundant_off"})
        self.hass.loop.call_soon_threadsafe(_inner)

    async def _async_run_hub_event_action(self, event_key: str) -> None:
        """Execute the user-configured action for a hub-level event hook.

        These actions live only in the HA-side config store (never synced to
        the hub); an unset hook carries the default no-op action payload,
        which the executor ignores.
        """

        try:
            store = await async_get_command_config_store(self.hass)
            action = store.get_hub_event_actions(self.entry_id).get(event_key) or {}
            await self._async_execute_action_config(action)
        except Exception as err:  # pragma: no cover - service boundary
            self._log.warning(
                "[%s] Failed executing hub event action '%s': %s",
                self.entry_id,
                event_key,
                err,
            )

    async def _async_run_activity_event_action(
        self, activity_id: int, phase: str
    ) -> None:
        """Execute the user-configured action for a per-activity event hook.

        Keyed strictly by activity id — no name matching. Missing entries
        (or unset phases, which carry the default no-op payload) execute
        nothing.
        """

        try:
            store = await async_get_command_config_store(self.hass)
            entry = store.get_activity_event_actions(self.entry_id).get(
                str(int(activity_id))
            )
            if not entry:
                return
            await self._async_execute_action_config(entry.get(phase) or {})
        except Exception as err:  # pragma: no cover - service boundary
            self._log.warning(
                "[%s] Failed executing activity %s event action '%s': %s",
                self.entry_id,
                activity_id,
                phase,
                err,
            )

    def _notify_hub_event(self, event: dict[str, Any]) -> None:
        """Record a hub-event firing and fan it out to subscribed cards.

        Purely a UI feed (drives the transient row glow in the Hub Events
        tab); fires whenever the event happens, whether or not an action is
        configured. Must be called from the event loop.
        """

        self._last_hub_event = {
            **event,
            "timestamp": datetime.now(timezone.utc).timestamp(),
        }
        async_dispatcher_send(self.hass, signal_hub_events(self.entry_id))

    def get_last_hub_event(self) -> dict[str, Any] | None:
        if self._last_hub_event is None:
            return None
        return dict(self._last_hub_event)

    async def _async_prune_activity_event_actions(self) -> None:
        """Drop per-activity event actions for ids no longer on the hub.

        Runs after an authoritative activity-catalog refresh so persistent
        configuration never accumulates entries for deleted activities.
        """

        try:
            store = await async_get_command_config_store(self.hass)
            await store.async_prune_activity_event_actions(
                self.entry_id, list(self.activities.keys())
            )
        except Exception:  # noqa: BLE001 - housekeeping must never break sync
            self._log.warning(
                "[%s] Failed pruning stale activity event actions",
                self.entry_id,
                exc_info=True,
            )


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
            if ready and not self._hub_event_hooks_armed:
                # A complete catalog read establishes the current activity
                # state even when nothing is running. The proxy's own
                # handle_active_state listener runs before this one, so a
                # genuine initial-state report (None -> X at startup) has
                # already been swallowed by the disarmed guard; arming here
                # additionally covers the powered-off startup, where no
                # change callback ever fires and the first real
                # off -> activity transition must not be eaten as "initial".
                self._hub_event_hooks_armed = True
            if ready:
                activities_changed = self._replace_activities(acts)
                self._activities_generation += 1
                if activities_changed:
                    self._bump_cache_generation()
                    if acts:
                        # Housekeeping: activity ids that left the catalog take
                        # their configured start/stop event actions with them.
                        # Skipped on an empty catalog so a transient empty read
                        # can never wipe the whole configuration.
                        self.hass.async_create_task(
                            self._async_prune_activity_event_actions()
                        )
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
                if self._ota_in_progress:
                    self._ota_in_progress = False
                    self._log.info(
                        "[%s] Hub reconnected after OTA pause; dismissing notification",
                        self.entry_id,
                    )
                    persistent_notification.async_dismiss(
                        self.hass, self._ota_notification_id
                    )
                self._log.debug("[%s] Hub connected, doing initial sync", self.entry_id)
                self.hass.async_create_task(self._async_initial_sync())
        self.hass.loop.call_soon_threadsafe(_inner)

    def _on_ota_update(self) -> None:
        """Handle the hub's OTA-update push: pause reconnects and notify the user.

        On opcode 0x0167 the hub goes silent for several minutes while
        applying a firmware update. We trip a backoff in the transport
        bridge so reconnect attempts are suppressed during that window
        and surface a persistent notification so HA users understand why
        the hub went unavailable.
        """

        def _inner() -> None:
            if self._ota_in_progress:
                return
            self._ota_in_progress = True
            self._log.warning(
                "[%s] Hub announced OTA firmware update; pausing reconnects for %.0fs",
                self.entry_id,
                self._ota_pause_seconds,
            )
            try:
                self._proxy.transport.pause_for_ota(self._ota_pause_seconds)
            except Exception:
                self._log.exception(
                    "[%s] Failed to arm OTA pause on transport", self.entry_id
                )
            minutes = max(1, int(round(self._ota_pause_seconds / 60.0)))
            persistent_notification.async_create(
                self.hass,
                (
                    f"The SofaBaton hub **{self.name}** is installing a firmware "
                    f"update and will be unavailable for several minutes. Home "
                    f"Assistant will reconnect automatically; please come back "
                    f"in about {minutes} minutes."
                ),
                title="SofaBaton hub firmware update in progress",
                notification_id=self._ota_notification_id,
            )

        self.hass.loop.call_soon_threadsafe(_inner)

    def _on_devices_burst(self, key: str) -> None:
        def _inner() -> None:
            devs, ready = self._proxy.get_devices()
            self.devices_ready = ready
            if ready:
                self.devices = devs
                self._devices_generation += 1
                self._bump_cache_generation()
                self.hass.async_create_task(self._async_reconcile_deployed_wifi_device_ids())
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
        banner_info, banner_ready = await self.hass.async_add_executor_job(
            partial(self._proxy.fetch_banner_info, force_refresh=True)
        )
        banner_changed = await self._async_sync_authoritative_identity(
            banner_info if banner_ready else {}
        )
        self._log.debug(
            "[%s] initial_sync: got banner ready=%s model=%s batch=%s fw=%s",
            self.entry_id,
            banner_ready,
            self.banner_model,
            self.production_batch,
            self.hub_firmware_version,
        )
        if banner_changed:
            self._bump_cache_generation()
            async_dispatcher_send(self.hass, signal_hub(self.entry_id))
        await self._async_persist_cache_if_enabled()

        devs, devs_ready = await self.hass.async_add_executor_job(
            partial(self._proxy.get_devices, force_refresh=True)
        )
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
            await self._async_reconcile_deployed_wifi_device_ids()
            async_dispatcher_send(self.hass, signal_devices(self.entry_id))

        acts, acts_ready = await self.hass.async_add_executor_job(
            partial(self._proxy.get_activities, force_refresh=True)
        )
        self._log.debug(
            "[%s] initial_sync: got activities ready=%s count=%s",
            self.entry_id,
            acts_ready,
            len(acts) if acts else 0,
        )
        self.activities_ready = acts_ready

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
        await self._async_sync_authoritative_identity(self._proxy.get_banner_info())

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
            len(self._proxy.state.entities("device")),
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
            partial(self._proxy.clear_cached_entity_detail, ent_id, kind=kind)
        )
        if kind == "device":
            # Use the default 15s wait so a slow devices burst (which now has a
            # 5s response-grace fallback) has room to complete instead of the
            # outer wait expiring first and returning a partial snapshot.
            await self._async_refresh_devices_snapshot()
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
        # REQ_BUTTONS is authoritative for enabled buttons and favorites, but
        # not for the underlying binding targets of normal hard buttons.
        # Preserve the cache key for compatibility, but leave it empty until a
        # dedicated binding-details family is implemented.
        data["activity_keybindings"] = {}
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

        for source in (self._proxy.state.entities("device"), self._proxy.state.ip_devices):
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

    def _get_cached_device_class(self, device_id: int) -> str | None:
        dev_lo = device_id & 0xFF
        device = self.devices.get(dev_lo)
        if isinstance(device, dict):
            device_class = str(device.get("device_class") or "").strip()
            if device_class:
                return device_class

        for source in (self._proxy.state.entities("device"), self._proxy.state.ip_devices):
            if not isinstance(source, dict):
                continue
            cached_device = source.get(dev_lo)
            if isinstance(cached_device, dict):
                device_class = str(cached_device.get("device_class") or "").strip()
                if device_class:
                    return device_class

        return None

    def _build_cache_activity_list(self, data: dict[str, Any]) -> list[dict[str, Any]]:
        favorites = self._build_cache_activity_favorites()
        macros_raw = data.get("activity_macros", {})
        macros_by_activity = macros_raw if isinstance(macros_raw, dict) else {}

        activities: list[dict[str, Any]] = []
        for act_id in self._cache_activity_ids(data):
            act_key = str(act_id)
            macros = macros_by_activity.get(act_key, [])
            activity = self.activities.get(act_id) or getattr(self._proxy.state, "activities", {}).get(act_id, {})
            # The hub stores a display order in the record's sort byte
            # (body[6] of the shared device-record schema). Expose it so the
            # frontend list can follow the hub's stored order; rows without a
            # cached record body (or with sort still 0) fall back to id order.
            # raw_body is stripped from the hub-level activity views, so read
            # it straight from proxy state.
            sort_value = 0
            state_activity = getattr(self._proxy.state, "activities", {}).get(act_id)
            raw_body = state_activity.get("raw_body") if isinstance(state_activity, dict) else None
            if isinstance(raw_body, (bytes, bytearray)) and len(raw_body) > 6:
                sort_value = int(raw_body[6])
            activities.append(
                {
                    "id": act_id,
                    "name": self._get_cached_activity_name(act_id) or f"Activity {act_id}",
                    "is_active": bool(activity.get("active", False)) if isinstance(activity, dict) else False,
                    "sort": sort_value,
                    "favorite_count": len(favorites.get(act_key, [])),
                    "keybinding_count": 0,
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

    def _cache_device_ids(self, data: dict[str, Any]) -> list[int]:
        catalog_ids: set[int] = set()
        catalog_ids.update(int(dev_id) & 0xFF for dev_id in self.devices.keys())

        for source in (self._proxy.state.entities("device"), self._proxy.state.ip_devices):
            if not isinstance(source, dict):
                continue
            catalog_ids.update(int(dev_id) & 0xFF for dev_id in source.keys())

        device_ids: set[int] = set(catalog_ids)
        commands_raw = data.get("commands", {})
        if isinstance(commands_raw, dict):
            for device_id in commands_raw:
                try:
                    device_ids.add(int(device_id) & 0xFF)
                except (TypeError, ValueError):
                    continue

        visible_ids = catalog_ids if catalog_ids else device_ids
        return sorted(device_id for device_id in visible_ids if 1 <= device_id <= 255)

    def _build_cache_devices_list(self, data: dict[str, Any]) -> list[dict[str, Any]]:
        devices_raw = data.get("devices", {})
        ip_devices_raw = data.get("ip_devices", {})
        commands_raw = data.get("commands", {})

        def _device_meta_for(device_id: int) -> dict[str, Any]:
            for source in (devices_raw, ip_devices_raw):
                if not isinstance(source, dict):
                    continue
                meta = source.get(str(device_id))
                if isinstance(meta, dict):
                    return meta
            return {}

        devices_list: list[dict[str, Any]] = []
        for device_id in self._cache_device_ids(data):
            commands = commands_raw.get(str(device_id), {})
            device_meta = _device_meta_for(device_id)
            # Same shared record schema as activities: the hub stores the
            # display order in the record body's sort byte (body[6]). Expose
            # it so the frontend can mirror the remote's device-list order.
            # raw_body is stripped from the hub-level device views, so read
            # it straight from proxy state.
            sort_value = 0
            state_device = self._proxy.state.entities("device").get(device_id)
            raw_body = state_device.get("raw_body") if isinstance(state_device, dict) else None
            if isinstance(raw_body, (bytes, bytearray)) and len(raw_body) > 6:
                sort_value = int(raw_body[6])
            row = {
                "id": device_id,
                "name": self._get_cached_device_name(device_id) or f"Device {device_id}",
                "sort": sort_value,
                "command_count": len(commands) if isinstance(commands, dict) else 0,
                "has_commands": bool(commands) if isinstance(commands, dict) else False,
            }
            if device_meta.get("device_class") is not None:
                row["device_class"] = device_meta.get("device_class")
            if device_meta.get("device_class_code") is not None:
                row["device_class_code"] = device_meta.get("device_class_code")
            devices_list.append(row)

        return devices_list



    def _looks_like_activity(self, ent_id: int) -> bool:
        ent_lo = ent_id & 0xFF
        return ent_lo in self._proxy.state.entities("activity")

    def _looks_like_device(self, ent_id: int) -> bool:
        ent_lo = ent_id & 0xFF
        return (
            ent_lo in self._proxy.state.entities("device")
            or ent_lo in self._proxy.state.ip_devices
        )

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

    async def async_fetch_single_device_command(
        self,
        ent_id: int,
        command_id: int,
        *,
        wait_timeout: float = 10.0,
        force_refresh: bool = False,
    ) -> dict[int, str]:
        """Fetch metadata for a single command on a device.

        This is narrower than :meth:`async_fetch_device_commands`: it verifies
        one command slot without reloading the entire device command catalog.
        """

        ent_lo = ent_id & 0xFF
        cmd_lo = command_id & 0xFF
        commands = self._proxy.state.commands.setdefault(ent_lo, {})
        previous_label = None
        if force_refresh:
            previous_label = commands.pop(cmd_lo, None)

        self._commands_in_flight.add(ent_id)
        async_dispatcher_send(self.hass, signal_commands(self.entry_id))

        try:
            cached, ready = await self.hass.async_add_executor_job(
                partial(
                    self._proxy.get_single_command_for_entity,
                    ent_id,
                    cmd_lo,
                    fetch_if_missing=True,
                )
            )
            if ready:
                return cached

            return await self._async_wait_for_single_command_ready(
                ent_id,
                cmd_lo,
                timeout=wait_timeout,
            )
        finally:
            if force_refresh and previous_label is not None and cmd_lo not in commands:
                commands[cmd_lo] = previous_label
            self._commands_in_flight.discard(ent_id)
            async_dispatcher_send(self.hass, signal_commands(self.entry_id))

    async def async_dump_ir_commands(
        self,
        device_id: int,
        command_id: int | None = None,
        *,
        wait_timeout: float = 10.0,
    ) -> dict[str, Any] | None:
        """Dump raw command blob pages for a device via 0x020C [dev, item]."""

        return await self.hass.async_add_executor_job(
            partial(
                self._proxy.request_ir_command_dump,
                device_id,
                command_id=command_id,
                timeout=wait_timeout,
            )
        )

    async def async_fetch_blob(
        self,
        device_id: int,
        command_id: int | None = None,
        *,
        wait_timeout: float = 10.0,
    ) -> dict[str, Any] | None:
        """Fetch normalized command blobs suitable for ``play_ir_blob`` input."""

        result = await self.async_dump_ir_commands(
            device_id=device_id,
            command_id=command_id,
            wait_timeout=wait_timeout,
        )
        if result is None:
            return None

        commands_out: list[dict[str, Any]] = []
        for command in result.get("commands", []):
            blob_hex = str(command.get("ir_blob_hex") or "").strip()
            blob_bytes = bytes.fromhex(blob_hex) if blob_hex else b""
            blob_body = b""
            replay_tail_checksum: int | None = None
            blob_kind = "raw"
            parsed_blob: str | None = None
            decoded_block: dict[str, Any] | None = None

            command_device_id = command.get("device_id")
            normalized_device_id = int(command_device_id) if command_device_id is not None else device_id
            cached_device_class = self._get_cached_device_class(normalized_device_id)

            if blob_bytes:
                blob_body, replay_tail_checksum = split_play_blob_tail(blob_bytes)
                # One uniform decoder path for every class that can
                # carry user-meaningful structure: descriptive IR
                # payloads (P:Sony12 etc.), wifi_ip, wifi_roku,
                # wifi_hue, wifi_sonos. Each runs a strict round-trip
                # verifier internally; on any mismatch (including
                # non-descriptive IR blobs that fail the magic-prefix
                # sniff) the decoder returns None and the row falls
                # back to the raw-hex view, exactly like a row whose
                # class has no decoder at all.
                if blob_body and is_blob_decodable_class(cached_device_class):
                    candidate = try_decode_command_blob(cached_device_class, blob_body)
                    if candidate is not None:
                        decoded_block = candidate
                        # Two blob_kind values are exposed:
                        #   "descriptive" -- preserved for IR
                        #     descriptors so the existing UI / tests
                        #     stay valid for the historical IR case.
                        #   "decoded"    -- used for the four
                        #     virtual-device classes that newly gain
                        #     structured fields.
                        if candidate.get("class") == DEVICE_CLASS_IR:
                            blob_kind = "descriptive"
                        else:
                            blob_kind = "decoded"
                        parsed_blob = decoded_blob_display_text(candidate)

            commands_out.append(
                {
                    "command_label": command.get("label"),
                    "device_id": normalized_device_id,
                    "command_id": command.get("command_id"),
                    "device_class": cached_device_class,
                    "blob_kind": blob_kind,
                    "command_blob": blob_body.hex(" ") if blob_body else None,
                    "parsed_blob": parsed_blob,
                    "decoded": decoded_block,
                    "replay_tail_checksum": replay_tail_checksum,
                    "command_checksum": replay_tail_checksum,
                }
            )

        return {
            "device_id": result.get("device_id"),
            "requested_command_id": result.get("requested_command_id"),
            "total_commands": result.get("total_commands"),
            "received_command_count": result.get("received_command_count"),
            "complete": result.get("complete"),
            "commands": commands_out,
        }

    async def async_backup_device(
        self,
        device_id: int,
        *,
        wait_timeout: float = 10.0,
    ) -> dict[str, Any] | None:
        """Fetch a restore-oriented device backup payload from the hub.

        The export logic lives in the library
        (:meth:`X1Proxy.backup_device`); this is a thin executor wrapper.
        """

        return await self.hass.async_add_executor_job(
            partial(self._proxy.backup_device, device_id, wait_timeout=wait_timeout)
        )

    async def async_backup_activity(
        self,
        activity_id: int,
        *,
        wait_timeout: float = 10.0,
    ) -> dict[str, Any] | None:
        """Fetch a restore-oriented activity backup payload from the hub.

        The export logic lives in the library
        (:meth:`X1Proxy.backup_activity`); this is a thin executor wrapper.
        """

        return await self.hass.async_add_executor_job(
            partial(self._proxy.backup_activity, activity_id, wait_timeout=wait_timeout)
        )

    async def async_backup_hub(
        self,
        *,
        device_ids: list[int] | None = None,
        wait_timeout: float = 10.0,
        progress_callback: Any = None,
    ) -> dict[str, Any]:
        """Build a ``hub_bundle`` payload covering the requested scope.

        The export logic lives in the library
        (:meth:`X1Proxy.backup_hub_bundle`); this wrapper supplies the
        integration hub identity and forwards progress. ``progress_callback``
        runs on the executor thread, so callers must marshal to the loop
        themselves (see ``_BackupOperationRegistry.update_from_thread``).
        """

        hub_info = {
            "entry_id": self.entry_id,
            "name": self.name,
            "version": self.version,
        }
        return await self.hass.async_add_executor_job(
            partial(
                self._proxy.backup_hub_bundle,
                device_ids=device_ids,
                hub_info=hub_info,
                wait_timeout=wait_timeout,
                progress=progress_callback,
            )
        )

    async def async_refresh_hub_cache(
        self,
        *,
        progress_callback: Any = None,
    ) -> dict[str, Any]:
        """Refresh the whole hub's structural cache and return a blob-free
        ``hub_bundle``.

        Runs :meth:`X1Proxy.backup_hub_bundle` with ``include_blobs=False`` —
        it refreshes the device + activity lists and every entity's structure
        into proxy state, without the multi-minute per-command IR blob dump.
        The caller persists the returned bundle (the live activity editor's
        data source) and the summary export. ``progress_callback`` runs on the
        executor thread (marshal to the loop, as with ``async_backup_hub``).
        """

        hub_info = {"entry_id": self.entry_id, "name": self.name, "version": self.version}
        bundle = await self.hass.async_add_executor_job(
            partial(
                self._proxy.backup_hub_bundle,
                device_ids=None,
                hub_info=hub_info,
                progress=progress_callback,
                include_blobs=False,
            )
        )
        self._bump_cache_generation()
        return bundle

    async def async_get_structural_bundle(self) -> dict[str, Any] | None:
        """Assemble the structural ``hub_bundle`` from cached proxy state.

        Pure projection -- no hub I/O, so it is safe while the app client
        owns the hub. Returns ``None`` until a backup-grade structural
        fetch (whole-hub refresh, per-entity refresh, or a persistent-cache
        import carrying ``detail_fetched_at``) has populated the state.
        """

        hub_info = {"entry_id": self.entry_id, "name": self.name, "version": self.version}
        return await self.hass.async_add_executor_job(
            partial(self._proxy.assemble_hub_bundle_from_state, hub_info=hub_info)
        )

    async def async_refresh_entity_structure(self, *, kind: str, ent_id: int) -> None:
        """Refresh one entity's full structural detail into the proxy cache.

        Runs the blob-free backup fetch for the entity (commands, buttons,
        macros, inputs, key-sort and idle behavior for devices; keymap,
        macros and favorites for activities) so structural bundles assembled
        from state reflect the live hub. The returned payload is discarded
        -- the fetch's side effect on proxy state is the point.
        """

        if kind == "device":
            await self.hass.async_add_executor_job(
                partial(self._proxy.backup_device, ent_id, include_blobs=False)
            )
            devs, ready = await self.hass.async_add_executor_job(self._proxy.get_devices)
            self.devices_ready = ready
            if ready:
                self.devices = devs
                self._devices_generation += 1
            self._bump_cache_generation()
            async_dispatcher_send(self.hass, signal_devices(self.entry_id))
        else:
            await self.hass.async_add_executor_job(
                partial(self._proxy.backup_activity, ent_id)
            )
            self._bump_cache_generation()
            async_dispatcher_send(self.hass, signal_activity(self.entry_id))

        async_dispatcher_send(self.hass, signal_commands(self.entry_id))
        async_dispatcher_send(self.hass, signal_macros(self.entry_id))

    async def async_sync_activity(
        self,
        *,
        baseline: dict[str, Any],
        edited: dict[str, Any],
        activity_id: int,
        progress_callback: Any = None,
    ) -> dict[str, Any]:
        """Sync one activity's edits to the live hub (Phase L4).

        Diffs ``baseline`` vs ``edited`` (both ``hub_bundle`` payloads) and
        issues targeted in-place writes against the existing activity id.
        The engine lives in the library (:meth:`X1Proxy.sync_activity`);
        this wrapper marshals it onto the executor thread. ``progress_callback``
        runs on that thread — callers marshal to the loop themselves (same
        contract as :meth:`async_restore_backup`).
        """

        return await self.hass.async_add_executor_job(
            partial(
                self._proxy.sync_activity,
                baseline=baseline,
                edited=edited,
                activity_id=int(activity_id),
                progress_callback=progress_callback,
            )
        )

    async def async_sync_device(
        self,
        *,
        baseline: dict[str, Any],
        edited: dict[str, Any],
        device_id: int,
        progress_callback: Any = None,
    ) -> dict[str, Any]:
        """Sync one device's edits to the live hub (device-scoped counterpart
        of :meth:`async_sync_activity`; engine :meth:`X1Proxy.sync_device`)."""

        return await self.hass.async_add_executor_job(
            partial(
                self._proxy.sync_device,
                baseline=baseline,
                edited=edited,
                device_id=int(device_id),
                progress_callback=progress_callback,
            )
        )

    async def async_erase_configuration(
        self,
        *,
        timeout: float = 120.0,
        settle_seconds: float = 2.0,
    ) -> bool:
        """Erase all hub configuration (devices, activities, favorites, macros).

        Drives opcode ``0x001D`` via the proxy. The opcode is identical
        across X1, X1S, and X2 -- a single payload-less frame wipes the
        entire user-visible configuration. See ``docs/protocol/erase.md``
        for the wire layout and timing notes.

        Returns ``True`` on success (the hub answered within
        ``timeout``), ``False`` on a pre-ack disconnect or timeout.
        After a successful erase the proxy's catalog mirrors have
        been cleared and a brief settle delay has elapsed.

        Used by :meth:`async_restore_backup` in replace mode (when the
        bundle contains activities) -- erase must succeed before any
        device or activity rewrites are issued.
        """

        return await self.hass.async_add_executor_job(
            partial(
                self._proxy.erase_configuration,
                timeout=timeout,
                settle_seconds=settle_seconds,
            )
        )

    async def async_set_hub_name(
        self,
        name: str,
        *,
        timeout: float = 5.0,
        sync_identity: bool = True,
    ) -> bool:
        """Persist a new hub name and refresh our cached identity."""

        next_name = str(name or "").strip()
        if not next_name:
            return False

        ok = await self.hass.async_add_executor_job(
            partial(self._proxy.set_hub_name, next_name, timeout=timeout)
        )
        if not ok:
            return False

        info = dict(self._proxy.get_banner_info() or {})
        info["name"] = next_name
        if not info.get("model"):
            info["model"] = self.banner_model or self.version
        if info.get("firmware_version") is None and self.hub_firmware_version is not None:
            info["firmware_version"] = self.hub_firmware_version
        if not info.get("production_batch") and self.production_batch:
            info["production_batch"] = self.production_batch

        if sync_identity:
            await self._async_sync_authoritative_identity(info)
        self.name = next_name
        return True

    async def async_restore_backup(
        self,
        payload: dict[str, Any],
        *,
        wifi_commands_request_port: int = 8060,
        replace_mode: bool | None = None,
        progress_callback: Any = None,
    ) -> dict[str, Any] | None:
        """Restore a ``hub_bundle`` payload onto the live hub.

        Walks ``payload['devices']`` first, building an auto
        ``source_device_id -> new_device_id`` map. Then walks
        ``payload['activities']`` (if any), threading the auto map
        plus the bundle's device payloads through so the activity
        restore can resolve ``0xC5`` input-ordinal macro entries
        locally instead of needing the source hub to be reachable.

        Replace mode (``activities`` non-empty) calls
        :meth:`async_erase_configuration` first; until erase ships,
        that stub raises ``NotImplementedError`` and the bundle
        restore fails before any wire writes.
        """

        def _progress(**progress_payload: Any) -> None:
            if callable(progress_callback):
                progress_callback(**progress_payload)

        if not isinstance(payload, dict):
            raise ValueError("restore_backup expects a hub_bundle object")
        if payload.get("kind") != "hub_bundle":
            raise ValueError(
                "restore_backup payload must declare kind == 'hub_bundle'"
            )
        if int(payload.get("schema_version", 0)) != HUB_BUNDLE_SCHEMA_VERSION:
            raise ValueError(
                "restore_backup payload schema_version must be "
                f"{HUB_BUNDLE_SCHEMA_VERSION} "
                f"(got {payload.get('schema_version')!r}); older bundles are "
                "rejected -- no migrator is provided"
            )
        # Must be rejected HERE, before the replace-mode erase below: the lib
        # repeats this check, but only after this method has already wiped the
        # destination hub. A missing profile means a legacy full backup.
        profile = str(payload.get("payload_profile") or PAYLOAD_PROFILE_FULL)
        if profile != PAYLOAD_PROFILE_FULL:
            raise ValueError(
                f"restore_backup payload_profile is {profile!r}: structural "
                "cache bundles carry no command payloads and cannot be "
                "restored -- export a full backup instead"
            )

        devices = list(payload.get("devices") or [])
        activities = list(payload.get("activities") or [])
        use_replace_mode = bool(activities) if replace_mode is None else bool(replace_mode)
        bundle_hub = payload.get("hub") if isinstance(payload.get("hub"), dict) else {}
        bundle_hub_name = str(bundle_hub.get("name") or "").strip()
        current_hub_name = str(
            (self._proxy.get_banner_info() or {}).get("name") or self.name or ""
        ).strip()
        rename_after_replace = bool(use_replace_mode and bundle_hub_name)
        sync_identity_after_replace = bool(bundle_hub_name and bundle_hub_name != current_hub_name)
        total_steps = (
            1
            + len(devices)
            + len(activities)
            + (1 if use_replace_mode else 0)
            + (1 if rename_after_replace else 0)
        )
        completed_steps = 1
        _progress(
            status="running",
            phase="validation",
            message="Validating restore bundle...",
            completed_steps=completed_steps,
            total_steps=total_steps,
        )

        if use_replace_mode:
            # Replace mode. Erase the hub first so device ids reset
            # to a known empty slate before the bundle's devices are
            # rewritten.
            _progress(
                status="running",
                phase="erase",
                message="Erasing the destination hub...",
                completed_steps=completed_steps,
                total_steps=total_steps,
            )
            erased = await self.async_erase_configuration()
            if not erased:
                raise HomeAssistantError(
                    "Hub erase failed -- restore aborted before any wire writes. "
                    "Check the hub is reachable and try again; if it persists, "
                    "inspect the [ERASE] log lines for the specific failure mode."
                )
            completed_steps += 1
            _progress(
                status="running",
                phase="erase",
                message="Destination hub erased.",
                completed_steps=completed_steps,
                total_steps=total_steps,
            )

        result = await self.hass.async_add_executor_job(
            partial(
                self._proxy.restore_hub_bundle,
                payload=payload,
                wifi_commands_request_port=wifi_commands_request_port,
                progress_callback=progress_callback,
                progress_offset=completed_steps,
                progress_total_steps=total_steps,
            )
        )
        if isinstance(result, dict) and str(result.get("status") or "") == "success":
            # ``restore_hub_bundle`` advances progress for each restored device
            # and activity, but the outer counter still needs to absorb those
            # completed steps before any replace-mode tail work runs.
            completed_steps += len(result.get("restored_devices") or [])
            completed_steps += len(result.get("restored_activities") or [])
            total_steps = (
                completed_steps
                + (1 if rename_after_replace else 0)
            )
        if rename_after_replace and isinstance(result, dict) and result.get("status") == "success":
            _progress(
                status="running",
                phase="hub",
                message="Restoring hub name...",
                completed_steps=completed_steps,
                total_steps=total_steps,
            )
            if sync_identity_after_replace:
                hub_name_restored = await self.async_set_hub_name(bundle_hub_name)
            else:
                hub_name_restored = await self.async_set_hub_name(
                    bundle_hub_name,
                    sync_identity=False,
                )
            result = dict(result)
            result["hub_name"] = bundle_hub_name
            result["hub_name_restored"] = bool(hub_name_restored)
            completed_steps += 1
            _progress(
                status="running",
                phase="hub",
                message=(
                    "Restored hub name."
                    if hub_name_restored
                    else "Hub restore finished, but restoring the hub name failed."
                ),
                completed_steps=completed_steps,
                total_steps=total_steps,
            )
            if not hub_name_restored:
                self._log.warning(
                    "[%s] replace-mode restore finished, but restoring hub name %r failed",
                    self.entry_id,
                    bundle_hub_name,
                )
        if isinstance(result, dict) and result.get("status") == "success":
            # Restore clears the per-entity structural caches for every
            # rewritten device and activity and used to leave them cold.
            # Finish with the blob-free whole-hub structural refresh (the
            # same fetch as the Hub tab's "Refresh all") so the cache view
            # and the live activity editor come back warm.
            total_steps += 1
            _progress(
                status="running",
                phase="cache_warm",
                message="Restore complete -- warming the hub cache...",
                completed_steps=completed_steps,
                total_steps=total_steps,
            )
            cache_warmed = True
            try:
                await self.async_refresh_hub_cache()
                await self._async_persist_cache_if_enabled()
            except Exception:  # noqa: BLE001 - warm is best-effort tail work
                cache_warmed = False
                self._log.warning(
                    "[%s] restore finished, but the post-restore cache warm failed",
                    self.entry_id,
                    exc_info=True,
                )
            completed_steps += 1
            result = dict(result)
            result["cache_warmed"] = cache_warmed
            _progress(
                status="running",
                phase="cache_warm",
                message=(
                    "Hub cache warmed."
                    if cache_warmed
                    else "Restore finished, but warming the hub cache failed; "
                    "run Refresh all from the Hub tab to re-warm it."
                ),
                completed_steps=completed_steps,
                total_steps=total_steps,
            )
        if isinstance(result, dict):
            result = dict(result)
            result["_progress_completed_steps"] = completed_steps
            result["_progress_total_steps"] = total_steps
        return result

    async def async_play_ir_blob(
        self,
        blob: bytes,
        *,
        inter_frame_delay: float = 0.08,
    ) -> bool:
        """Stream a raw IR blob to the hub for one-shot playback (no persistence)."""

        return await self.hass.async_add_executor_job(
            partial(
                self._proxy.play_ir_blob,
                blob,
                inter_frame_delay=inter_frame_delay,
            )
        )

    async def async_persist_ir_blob(
        self,
        *,
        device_id: int,
        command_name: str,
        blob: bytes,
        inter_frame_delay: float = 0.08,
        wait_timeout: float = 10.0,
    ) -> dict[str, Any] | None:
        """Persist a new IR command blob onto an existing device."""

        device_class = self._get_cached_device_class(device_id)
        if device_class is not None and device_class != DEVICE_CLASS_IR:
            raise HomeAssistantError(
                f"persist_ir_blob only supports IR devices; device {device_id} is {device_class}"
            )

        # Always refresh command occupancy immediately before persist so the
        # selected command slot comes from an authoritative REQ_COMMANDS view.
        await self.async_fetch_device_commands(device_id, wait_timeout=wait_timeout)

        result = await self.hass.async_add_executor_job(
            partial(
                self._proxy.persist_ir_blob,
                device_id=device_id,
                command_name=command_name,
                blob=blob,
                inter_frame_delay=inter_frame_delay,
            )
        )
        if result is None:
            return None

        # Decouple post-save housekeeping (refresh + cache persist) from
        # the action's return value. The save and the sort-table write
        # have already landed on the hub at this point, so the caller
        # has everything it needs to report success. Running the refresh
        # in the foreground was prone to wedging the websocket action's
        # completion -- the family-0x61 sort write can leave the proxy's
        # burst tracker briefly mid-stream on an unsolicited commands
        # burst, which then stalls the verification round-trip. Move
        # housekeeping to a background task so nothing downstream of
        # this point can block the action from settling.
        self.hass.async_create_task(
            self._async_post_persist_housekeeping(device_id, result, wait_timeout)
        )

        return result

    async def _async_post_persist_housekeeping(
        self,
        device_id: int,
        result: dict[str, Any],
        wait_timeout: float,
    ) -> None:
        """Refresh cached command metadata and persist the catalog cache.

        Runs in the background after ``async_persist_ir_blob`` has
        already returned. Any failure is logged at debug level and
        swallowed -- the user-visible save action has already
        succeeded, and the cache will catch up on the next normal
        refresh cycle if this pass times out.
        """

        refresh_budget = min(2.0, wait_timeout)
        try:
            command_id = result.get("command_id")
            if isinstance(command_id, int):
                await asyncio.wait_for(
                    self.async_fetch_single_device_command(
                        device_id,
                        command_id,
                        wait_timeout=refresh_budget,
                        force_refresh=False,
                    ),
                    timeout=refresh_budget + 0.5,
                )
            else:
                await asyncio.wait_for(
                    self.async_fetch_device_commands(
                        device_id,
                        wait_timeout=refresh_budget,
                    ),
                    timeout=refresh_budget + 0.5,
                )
        except Exception:
            self._log.debug(
                "[BLOBS] persist_ir_blob background refresh failed for device %s",
                device_id,
                exc_info=True,
            )

        try:
            await self._async_persist_cache_if_enabled()
        except Exception:
            self._log.debug(
                "[BLOBS] persist_ir_blob background cache persist failed for device %s",
                device_id,
                exc_info=True,
            )

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

    async def async_delete_device(
        self,
        device_id: int,
        *,
        refresh_impacted_activities: bool = True,
    ) -> dict[str, Any] | None:
        """Delete a device and confirm impacted activities on the selected hub.

        The proxy delete clears the cached keymap/favorites/macros of every
        activity the hub rewrote when it dropped the device, so by default
        those activities are re-warmed here before the cache is persisted.
        Callers that run their own re-warm pass afterwards (the wifi deploy
        pipeline) pass ``refresh_impacted_activities=False`` and fold the
        result's ``confirmed_activities`` into that pass instead.
        """

        result = await self.hass.async_add_executor_job(
            self._proxy.delete_device,
            device_id,
        )
        if isinstance(result, dict) and str(result.get("status")) == "success":
            # The proxy evicted the device from its own state, but the
            # hub-level snapshot is unioned into the cache device list, so
            # without this the Hub tab keeps showing the deleted device
            # until the next devices burst. Activity ids routed through
            # here are never in ``self.devices``; the activities burst the
            # proxy delete already ran keeps that side current.
            if self.devices.pop(device_id & 0xFF, None) is not None:
                self._devices_generation += 1
            if refresh_impacted_activities:
                for act_id in result.get("confirmed_activities") or []:
                    try:
                        await self._async_fetch_activity_commands(int(act_id))
                    except Exception:  # noqa: BLE001 - the delete itself succeeded
                        self._log.warning(
                            "[%s] failed re-warming activity 0x%02X after device delete",
                            self.entry_id,
                            int(act_id) & 0xFF,
                            exc_info=True,
                        )
            self._bump_cache_generation()
            async_dispatcher_send(self.hass, signal_devices(self.entry_id))
            await self._async_persist_cache_if_enabled()
        return result

    async def async_reorder_activities(self, ordered_ids: list[int]) -> dict[str, Any] | None:
        """Rewrite the hub's stored activity display order to *ordered_ids*."""

        return await self.hass.async_add_executor_job(
            self._proxy.reorder_activities,
            list(ordered_ids),
        )

    async def async_reorder_devices(self, ordered_ids: list[int]) -> dict[str, Any] | None:
        """Rewrite the hub's stored device display order to *ordered_ids*."""

        return await self.hass.async_add_executor_job(
            self._proxy.reorder_devices,
            list(ordered_ids),
        )

    async def async_create_activity(self, name: str) -> dict[str, Any] | None:
        """Create a fresh, empty activity named *name* on the selected hub."""

        return await self.hass.async_add_executor_job(
            self._proxy.create_activity,
            name,
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

        Each entry comes from the cached quick-access/keymap view and contains
        the visible quick-access ``button_id`` plus ``device_id``,
        ``command_id``, and ``source``.

        ``favorite_button_id`` is the preferred neutral field name. The older
        ``activity_map_button_id`` alias is still included for compatibility
        with callers that already consume it.

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
            favorite.setdefault("favorite_button_id", favorite.get("button_id"))
            # Legacy alias retained for existing consumers.
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
                "favorite_button_id": entry_id,
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

    async def async_set_power_macro(
        self,
        entity_id: int,
        button_id: int,
        steps: list[dict[str, int]],
    ) -> bool:
        """Rewrite one power-macro row set on the selected hub."""

        return await self.hass.async_add_executor_job(
            partial(
                self._proxy.set_power_macro,
                entity_id,
                button_id,
                steps,
            )
        )

    async def async_set_device_power_binding(
        self,
        device_id: int,
        power_on_command_id: int | None = None,
        power_off_command_id: int | None = None,
    ) -> bool:
        """Rewrite a device's POWER_ON/POWER_OFF rows on the selected hub."""

        return await self.hass.async_add_executor_job(
            partial(
                self._proxy.set_device_power_binding,
                device_id,
                power_on_command_id=power_on_command_id,
                power_off_command_id=power_off_command_id,
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

        if not macros_ready:
            # The macro request only got enqueued; the burst streams in
            # asynchronously. Returning now would let the caller fire its
            # next request mid-burst (the hub drops those silently), so
            # block until the readback lands.
            await self._async_wait_for_macros_ready(act_id)
            macros_ready = (act_id & 0xFF) in self._proxy._macros_complete

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

    async def _async_wait_for_macros_ready(
        self,
        ent_id: int,
        *,
        timeout: float = 5.0,
    ) -> None:
        deadline = monotonic() + timeout
        ent_lo = ent_id & 0xFF
        while monotonic() < deadline:
            if ent_lo in self._proxy._macros_complete:
                return
            await asyncio.sleep(0.05)

        self._log.debug(
            "[%s] timed out waiting for macros for 0x%02X",
            self.entry_id,
            ent_lo,
        )

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

    async def _async_wait_for_single_command_ready(
        self,
        ent_id: int,
        command_id: int,
        *,
        timeout: float = 10.0,
    ) -> dict[int, str]:
        deadline = monotonic() + timeout
        while monotonic() < deadline:
            commands, ready = self._proxy.get_single_command_for_entity(
                ent_id,
                command_id,
                fetch_if_missing=False,
            )
            if ready:
                return commands
            await asyncio.sleep(0.05)

        self._log.debug(
            "[%s] timed out waiting for command 0x%02X on 0x%02X",
            self.entry_id,
            command_id & 0xFF,
            ent_id & 0xFF,
        )
        return {}

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
                fetch_if_missing=False,  # <- important: no queueing
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
        command_index: int | None = None
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
                store = await async_get_command_config_store(self.hass)
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
        resolved_device_name = (
            device_name
            or (self._get_cached_device_name(device_id) if device_id >= 0 else None)
            or (self.devices.get(device_id, {}).get("name") if device_id >= 0 else None)
        )
        record = {
            "entity_id": device_id,
            "entity_kind": "device",
            "entity_name": resolved_device_name,
            "command_id": command_label,
            "command_index": command_index,
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
        self._log.info(
            "[WIFI_HTTP] mapped listener request source_ip=%s device_id=%s device_name=%s command=%s press_type=%s path=%s",
            source_ip or "unknown",
            device_id,
            resolved_device_name or "<unknown>",
            command_label or "<unresolved>",
            press_type,
            path,
        )
        self._last_ip_command = record
        async_dispatcher_send(self.hass, signal_ip_commands(self.entry_id))
        if resolved_slot is not None and command_index is not None:
            await self._async_maybe_run_live_wifi_slot_action(
                command_index=command_index,
                hub_device_id=device_id if device_id >= 0 else None,
                fallback_slot=resolved_slot,
                command_label=command_label,
                press_type=press_type,
            )
        else:
            await self._async_maybe_run_configured_ip_action(command_label, press_type=press_type)

    @property
    def is_sync_in_progress(self) -> bool:
        return self._command_sync_lock.locked()

    def is_long_running_task_active(self) -> bool:
        """True while a backup, restore, or command-config sync is running.

        Wired into the transport bridge as the CALL_ME busy gate so proxy
        clients are ignored without tearing down mDNS/broadcast discovery.
        """

        if self._command_sync_lock.locked():
            return True
        try:
            from . import _backup_operation_registry  # local import to avoid cycle
        except Exception:
            return False
        try:
            registry = _backup_operation_registry(self.hass)
        except Exception:
            return False
        return bool(registry.has_running_for_entry(self.entry_id))

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

    def _command_sync_failure_message(
        self,
        *,
        request_port: int,
        reason: str = "Sync failed",
        detail: str | None = None,
    ) -> str:
        detail_text = str(detail or "").strip()
        if detail_text == "sync_in_progress":
            return "Another Wifi Command sync is already running."
        if detail_text and "port" in detail_text.lower() and "in use" in detail_text.lower():
            return f"Wifi Device could not be enabled on port {request_port}."
        if detail_text.startswith("Failed "):
            return detail_text
        if detail_text.startswith("power_"):
            return detail_text
        return reason

    def _managed_wifi_devices(
        self, devices: dict[int, dict[str, Any]] | None = None
    ) -> list[tuple[int, str | None, str, str]]:
        managed: list[tuple[int, str | None, str, str]] = []
        for dev_id, device in (devices or self.devices).items():
            brand = str(device.get("brand") or "").strip()
            device_key, command_hash = _parse_managed_wifi_brand(brand)
            if command_hash:
                managed.append((int(dev_id), device_key, command_hash, brand))
        return managed

    def _match_managed_wifi_devices(
        self,
        *,
        managed_devices: list[tuple[int, str | None, str, str]],
        stored_devices: list[dict[str, Any]] | None = None,
        device_key: str | None = None,
        deployed_device_id: Any = None,
        deployed_commands_hash: str = "",
        commands_hash: str = "",
    ) -> tuple[list[tuple[int, str | None, str, str]], bool]:
        if isinstance(deployed_device_id, int):
            matches = [row for row in managed_devices if row[0] == int(deployed_device_id)]
            return matches, len(matches) > 1

        deployed_hash = str(deployed_commands_hash or "").strip()
        if deployed_hash:
            matches = [row for row in managed_devices if row[2] == deployed_hash]
            if len(matches) == 1:
                return matches, False
            if len(matches) > 1:
                return [], True

        current_hash = str(commands_hash or "").strip()
        if current_hash:
            matches = [row for row in managed_devices if row[2] == current_hash]
            if len(matches) == 1:
                return matches, False
            if len(matches) > 1:
                return [], True

        normalized_device_key = (
            "".join(ch for ch in str(device_key or DEFAULT_WIFI_DEVICE_KEY).lower() if ch.isalnum())
            or DEFAULT_WIFI_DEVICE_KEY
        )
        matches = [
            row
            for row in managed_devices
            if row[1] is not None and row[1] == normalized_device_key
        ]
        if len(matches) == 1:
            return matches, False
        if len(matches) > 1:
            return [], True

        if stored_devices is None and len(managed_devices) == 1:
            return [managed_devices[0]], False

        if stored_devices is not None and len(stored_devices) <= 1 and len(managed_devices) == 1:
            return [managed_devices[0]], False

        return [], False

    async def _async_reconcile_deployed_wifi_device_ids(self) -> None:
        store = await async_get_command_config_store(self.hass)
        managed_devices = self._managed_wifi_devices()
        stored_devices = await store.async_list_hub_devices(self.entry_id)
        stored_by_key = {
            str(device.get("device_key") or "").strip(): device
            for device in stored_devices
            if str(device.get("device_key") or "").strip()
        }
        assignments: list[tuple[str, int | None, str]] = []
        assigned_keys: set[str] = set()

        def _pick_unique(matches: list[dict[str, Any]]) -> dict[str, Any] | None:
            remaining = [
                device for device in matches
                if str(device.get("device_key") or "").strip() not in assigned_keys
            ]
            if len(remaining) == 1:
                return remaining[0]
            return None

        for managed_device_id, managed_device_key, managed_hash, _brand in managed_devices:
            owner: dict[str, Any] | None = None

            if managed_device_key:
                device = stored_by_key.get(managed_device_key)
                if device is not None and managed_device_key not in assigned_keys:
                    owner = device

            if owner is None:
                owner = _pick_unique(
                    [
                        device for device in stored_devices
                        if str(device.get("deployed_commands_hash") or "").strip() == managed_hash
                    ]
                )

            if owner is None:
                owner = _pick_unique(
                    [
                        device for device in stored_devices
                        if str(device.get("commands_hash") or "").strip() == managed_hash
                    ]
                )

            if owner is None:
                owner = _pick_unique(
                    [
                        device for device in stored_devices
                        if device.get("deployed_device_id") == managed_device_id
                    ]
                )

            if owner is None and len(stored_devices) == 1 and len(managed_devices) == 1:
                only_device_key = str(stored_devices[0].get("device_key") or "").strip()
                if only_device_key and only_device_key not in assigned_keys:
                    owner = stored_devices[0]

            if owner is None:
                continue

            owner_device_key = str(owner.get("device_key") or "").strip()
            if not owner_device_key:
                continue
            assignments.append((owner_device_key, managed_device_id, managed_hash))
            assigned_keys.add(owner_device_key)

        changed = await store.async_reconcile_deployed_wifi_devices(self.entry_id, assignments)

        if changed:
            async_dispatcher_send(self.hass, signal_command_sync(self.entry_id))

    async def _async_refresh_devices_snapshot(
        self, timeout_seconds: float = 15.0
    ) -> dict[int, dict[str, Any]]:
        """Request a fresh device burst and return the proxy-state snapshot.

        The returned mapping is the raw ``state.entities("device")`` view, so
        ``raw_body`` is included. Callers that need a JSON-safe view
        must pass each entry through :func:`to_export_view`. This
        contract is symmetric with :meth:`_async_refresh_activities_snapshot`.
        """

        previous_generation = self._devices_generation
        await self.hass.async_add_executor_job(self._proxy.request_devices)

        deadline = monotonic() + timeout_seconds
        while monotonic() < deadline:
            if self._devices_generation > previous_generation:
                return dict(self._proxy.state.entities("device"))
            await asyncio.sleep(0.1)

        return dict(self._proxy.state.entities("device"))

    async def _async_refresh_activities_snapshot(
        self, timeout_seconds: float = 15.0
    ) -> dict[int, dict[str, Any]]:
        """Request a fresh activities burst and return the proxy-state snapshot.

        Returns the raw ``state.entities("activity")`` view (``raw_body``
        included); the JSON-export boundary is the only place that
        strips it via :func:`to_export_view`.
        """

        previous_generation = self._activities_generation
        await self.hass.async_add_executor_job(self._proxy.request_activities)

        deadline = monotonic() + timeout_seconds
        while monotonic() < deadline:
            if self._activities_generation > previous_generation:
                return dict(self._proxy.state.entities("activity"))
            await asyncio.sleep(0.1)

        return dict(self._proxy.state.entities("activity"))

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
                    partial(self._proxy.clear_cached_entity_detail, act_id, kind="activity")
                )
        elif kind == "devices":
            old_ids = await self.hass.async_add_executor_job(self._proxy.get_known_device_ids)
            await self.hass.async_add_executor_job(self._proxy.clear_devices_catalog)
            await self._async_refresh_devices_snapshot(timeout_seconds=timeout_seconds)
            new_ids = await self.hass.async_add_executor_job(self._proxy.get_known_device_ids)
            for dev_id in old_ids - new_ids:
                await self.hass.async_add_executor_job(
                    partial(self._proxy.clear_cached_entity_detail, dev_id, kind="device")
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
        self._log.debug("[WIFI_ACTION] action_config=%r", action_config)
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
        store = await async_get_command_config_store(self.hass)
        payload = await store.async_get_hub_config(self.entry_id, device_key=DEFAULT_WIFI_DEVICE_KEY)
        command_key = normalize_command_name(command_label)
        for slot in payload.get("commands", []):
            if normalize_command_name(slot.get("name")) != command_key:
                continue
            await self._async_run_wifi_slot_action(slot, command_label, press_type=press_type)
            return

    async def _async_maybe_run_live_wifi_slot_action(
        self,
        *,
        command_index: int,
        hub_device_id: int | None,
        fallback_slot: dict[str, Any],
        command_label: str,
        press_type: str = "short",
    ) -> None:
        store = await async_get_command_config_store(self.hass)
        live_slot = store.get_live_wifi_command_slot(
            self.entry_id,
            command_index=command_index,
            hub_device_id=hub_device_id,
        )
        await self._async_run_wifi_slot_action(
            live_slot if isinstance(live_slot, dict) else fallback_slot,
            command_label,
            press_type=press_type,
        )

    async def _async_wifi_listener_needed(self) -> bool:
        store = await async_get_command_config_store(self.hass)
        devices = await store.async_list_hub_devices(self.entry_id)
        return any(wifi_device_requires_listener(device) for device in devices)

    async def _async_try_inplace_command_sync(
        self,
        *,
        managed_device_id: int,
        commands: list[dict[str, Any]],
        command_payload: dict[str, Any],
        normalized_device_key: str,
        brand_name: str,
        device_name: str,
        commands_hash: str,
        request_port: int,
        store: Any,
    ) -> dict[str, Any] | None:
        """Attempt an in-place re-sync of the matched managed Wifi Device.

        Returns a result dict on success, or ``None`` when the in-place path
        declines (no deployed snapshot, port change, drift, planner fallback)
        — the caller then falls through to the replace path. Raises once
        writes have started and one fails: the brand-hash head commit is the
        LAST step, so an interrupted run leaves the device reading
        out-of-step and the next sync re-offers (no rollback needed; see
        docs/internal/wifi-inplace-deploy-plan.md).
        """
        dev_id = int(managed_device_id)

        # Gate 1: the callback port is baked into the deployed records; only
        # the replace path can change it. None = pre-upgrade deploy with no
        # recorded port — one replace-path sync backfills it.
        deployed_request_port = command_payload.get("deployed_request_port")
        if deployed_request_port != request_port:
            _LOGGER.info(
                "[%s] in-place sync declined: request_port %s != deployed %s",
                self.entry_id, request_port, deployed_request_port,
            )
            return None

        # Gate 2: a deployed snapshot must exist to derive the expected
        # hub-side labels from (drift detection base).
        deployed_slots = (
            store.get_deployed_wifi_commands(self.entry_id, hub_device_id=dev_id)
            if store is not None
            else []
        )
        if not deployed_slots:
            _LOGGER.info("[%s] in-place sync declined: no deployed snapshot", self.entry_id)
            return None

        # Fresh live baseline: the device's structural backup plus every
        # activity (membership is only discoverable by reading them).
        activity_ids = sorted(int(a) for a in self.activities)

        def _read_baseline():
            device_entry = self._proxy.backup_device(dev_id, include_blobs=False)
            activity_entries = []
            for act_id in activity_ids:
                payload = self._proxy.backup_activity(act_id)
                if isinstance(payload, dict):
                    activity_entries.append(payload)
            return device_entry, activity_entries

        self._set_command_sync_progress(
            device_key=normalized_device_key,
            message="Reading the deployed Wifi Device",
        )
        device_entry, activity_entries = await self.hass.async_add_executor_job(_read_baseline)
        if not isinstance(device_entry, dict) or len(activity_entries) < len(activity_ids):
            _LOGGER.info("[%s] in-place sync declined: baseline read incomplete", self.entry_id)
            return None

        baseline = baseline_snapshot_from_bundle(device_entry, activity_entries)
        if baseline.device_id != dev_id:
            return None

        # Gate 3: drift detection — the live records must still match the
        # deployed snapshot's expansion (labels per command id). A user who
        # edited the managed device in the Sofabaton app invalidates the
        # in-place base; replace re-establishes it.
        expected_labels: dict[int, str] = {}
        for idx, slot in enumerate(deployed_slots[:_WIFI_COMMAND_SLOT_COUNT]):
            name = str(slot.get("name") or f"Command {idx + 1}").strip() or f"Command {idx + 1}"
            expected_labels[idx + 1] = name
            expected_labels[idx + 1 + _WIFI_COMMAND_LONG_PRESS_OFFSET] = f"{name} Long Press"
        desired = desired_snapshot_from_config(
            command_payload,
            device_id=dev_id,
            device_name=device_name,
            brand=brand_name,
            hard_button_codes=_HARD_BUTTON_TO_CODE,
        )

        # Classify every live record that disagrees with the deployed
        # snapshot's expansion. A record that instead matches the DESIRED
        # expansion is our own interrupted in-place run (the brand hash is
        # only committed last, so a failed run leaves already-applied edits
        # ahead of the snapshot) — the planner diffs against the live read,
        # so re-running simply resumes: applied steps no-op, the rest
        # re-emit. Only records matching NEITHER side are foreign edits
        # (the Sofabaton app) and force the replace-path rebase.
        drift: list[int] = []
        resumed: list[int] = []
        for cid, slot in baseline.slots.items():
            if expected_labels.get(cid) == slot.label:
                continue
            desired_slot = desired.slots.get(cid)
            if desired_slot is not None and desired_slot.label == slot.label:
                resumed.append(cid)
                continue
            drift.append(cid)
        if drift:
            _LOGGER.info(
                "[%s] in-place sync declined: live records drifted from the deployed "
                "snapshot (command ids %s)", self.entry_id, sorted(drift),
            )
            return None
        if resumed:
            _LOGGER.info(
                "[%s] in-place sync resuming an interrupted apply (command ids %s "
                "already match the desired config)", self.entry_id, sorted(resumed),
            )
        # The deployed expansion scopes reference OWNERSHIP: only favorites /
        # bindings / memberships the last deploy created may be cleaned up;
        # references made outside the config (the app, the activity editor)
        # are never planned away. Desired values are written regardless.
        deployed_config = {
            "commands": deployed_slots,
            "power_on_command_id": None,
            "power_off_command_id": None,
        }
        deployed_snapshot = desired_snapshot_from_config(
            deployed_config,
            device_id=dev_id,
            device_name="",
            brand="",
            hard_button_codes=_HARD_BUTTON_TO_CODE,
        )
        plan = build_wifi_inplace_plan(baseline, desired, deployed=deployed_snapshot)
        if plan.is_fallback:
            _LOGGER.info(
                "[%s] in-place sync declined by planner: %s",
                self.entry_id, plan.fallback_reason,
            )
            return None

        total_steps = len(plan.steps) + 2
        if plan.steps:
            loop = self.hass.loop

            def _progress(**data: Any) -> None:
                message = str(data.get("message") or "")
                completed = int(data.get("completed_steps") or 0)

                def _inner() -> None:
                    self._set_command_sync_progress(
                        device_key=normalized_device_key,
                        current_step=completed + 1,
                        total_steps=total_steps,
                        message=message,
                    )

                loop.call_soon_threadsafe(_inner)

            result = await self.hass.async_add_executor_job(
                partial(self._proxy.run_wifi_inplace_plan, plan, progress_callback=_progress)
            )
            if not isinstance(result, dict) or result.get("status") != "success":
                # Writes started and one was rejected. Do NOT fall back to the
                # replace path on top of a half-applied edit; the brand hash is
                # unwritten so the device reads out-of-step and re-offers sync.
                message = str((result or {}).get("message") or "The hub rejected an in-place write")
                raise HomeAssistantError(f"In-place sync failed: {message}")

        # Post-write cache refresh, mirroring the replace path's epilogue.
        touched_acts = sorted(
            {
                int(step.payload.get("activity_id"))
                for step in plan.steps
                if step.payload.get("activity_id") is not None
            }
        )
        favorite_acts = {
            int(step.payload.get("activity_id"))
            for step in plan.steps
            if step.kind in ("favorite_add", "favorite_delete")
        }
        command_records_touched = any(
            step.kind in ("command_add", "command_rename", "command_payload", "command_delete")
            for step in plan.steps
        )
        if command_records_touched:
            await self.async_fetch_device_commands(dev_id)
        for act_id in touched_acts:
            await self._async_fetch_activity_commands(act_id)
            if act_id in favorite_acts:
                await self.async_request_favorites_order(act_id)
        if plan.steps:
            await self._async_refresh_devices_snapshot()
            self._bump_cache_generation()
            async_dispatcher_send(self.hass, signal_commands(self.entry_id))
            try:
                await self._async_persist_cache_if_enabled()
            except Exception:  # noqa: BLE001 - persist is best-effort
                self._log.debug(
                    "[%s] post-inplace cache persist failed", self.entry_id, exc_info=True
                )
            self._set_command_sync_progress(
                device_key=normalized_device_key,
                current_step=total_steps - 1,
                total_steps=total_steps,
                message="Resyncing physical remote",
            )
            await self.async_resync_remote()

        if store is not None:
            await store.async_save_deployed_wifi_commands(
                self.entry_id,
                normalized_device_key,
                list(commands[:_WIFI_COMMAND_SLOT_COUNT]),
                deployed_device_id=dev_id,
                commands_hash=commands_hash,
                request_port=request_port,
            )

        self._set_command_sync_progress(
            device_key=normalized_device_key,
            status="success",
            current_step=total_steps,
            total_steps=total_steps,
            message="Wifi Device updated in place"
            if plan.steps
            else "Wifi Device already up to date",
            wifi_device_id=dev_id,
            commands_hash=commands_hash,
        )
        _LOGGER.info(
            "[%s] in-place sync applied %d step(s) to device %d (activities %s)",
            self.entry_id, len(plan.steps), dev_id, touched_acts,
        )
        return {
            "status": "success",
            "wifi_device_id": dev_id,
            "commands_hash": commands_hash,
            "activities": touched_acts,
            "inplace": True,
            "steps": len(plan.steps),
        }

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
            brand_name = f"{COMMAND_BRAND_PREFIX}-{normalized_device_key}-{commands_hash}"
            total_steps = 8 if configured_slots > 0 else 7
            store = await async_get_command_config_store(self.hass)
            self._set_command_sync_progress(
                device_key=normalized_device_key,
                status="running",
                current_step=0,
                total_steps=total_steps,
                message="Starting sync",
            )

            try:
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
                        raise HomeAssistantError(
                            "Unable to enable Wifi Device (Roku/HTTP Listener): "
                            f"port {request_port} may already be in use"
                        )

                referenced_activity_ids: set[int] = set()
                for slot in commands[:_WIFI_COMMAND_SLOT_COUNT]:
                    if not isinstance(slot, dict):
                        continue
                    # A slot's activities list only means something for
                    # favorites and hard-button bindings. The command editor
                    # auto-selects a default activity and hides (without
                    # clearing) the selection when both toggles are off, so an
                    # orphaned list must not pull the device into activities
                    # the user never sees referenced (issue #258).
                    slot_activities_active = bool(slot.get("add_as_favorite")) or bool(
                        str(slot.get("hard_button") or "").strip()
                    )
                    raw_activities = slot.get("activities")
                    if slot_activities_active and isinstance(raw_activities, list):
                        for act in raw_activities:
                            try:
                                referenced_activity_ids.add(int(act))
                            except (TypeError, ValueError):
                                continue
                    raw_input_activity_id = str(slot.get("input_activity_id") or "").strip()
                    if raw_input_activity_id:
                        try:
                            referenced_activity_ids.add(int(raw_input_activity_id))
                        except (TypeError, ValueError):
                            pass

                # Validate the configured activities against a fresh hub read
                # BEFORE the destructive delete/recreate below. The hub reuses
                # freed activity ids, so an id picked earlier can silently come
                # to mean a different activity after the user deletes/recreates
                # activities in the Sofabaton app (issue #258). The label
                # snapshot taken at configuration time lets us tell "renamed or
                # reused" apart from "unchanged"; on any mismatch we abort with
                # an actionable message instead of deploying into the wrong
                # activity. Skipped when the proxy cannot issue commands (hub
                # link down or the Sofabaton app attached): the deploy cannot
                # proceed there anyway and fails on its first write.
                if (
                    configured_slots > 0
                    and referenced_activity_ids
                    and self._proxy.can_issue_commands()
                ):
                    self._set_command_sync_progress(
                        device_key=normalized_device_key,
                        message="Validating Activities against the hub",
                    )
                    previous_activities_generation = self._activities_generation
                    await self.async_request_catalog("activities")
                    if self._activities_generation == previous_activities_generation:
                        raise HomeAssistantError(
                            "Failed to refresh the Activity list from the hub; "
                            "sync aborted rather than deploying against a stale catalog"
                        )
                    stored_activity_labels = command_payload.get("activity_labels")
                    if isinstance(stored_activity_labels, dict):
                        label_mismatches: list[str] = []
                        for act_id in sorted(referenced_activity_ids):
                            stored_label = str(
                                stored_activity_labels.get(str(act_id)) or ""
                            ).strip()
                            if not stored_label:
                                continue
                            entry = self.activities.get(act_id)
                            if entry is None:
                                # Deleted activities are dropped from the
                                # deploy further down, matching the existing
                                # recover-from-missing-target behavior.
                                continue
                            hub_label = str(entry.get("name") or "").strip()
                            if hub_label and hub_label != stored_label:
                                label_mismatches.append(
                                    f'Activity {act_id} was "{stored_label}" when this '
                                    f'Wifi Device was configured but is now "{hub_label}"'
                                )
                        if label_mismatches:
                            raise HomeAssistantError(
                                "Failed Activity validation: "
                                + "; ".join(label_mismatches)
                                + ". Activities on the hub changed since this Wifi Device "
                                "was configured (deleting and recreating an Activity reuses "
                                "its id). Re-select the Activities in the Wifi Command "
                                "configuration, save, and sync again."
                            )

                device_snapshot = await self._async_refresh_devices_snapshot()
                managed_devices = self._managed_wifi_devices(device_snapshot)
                stored_devices = await store.async_list_hub_devices(self.entry_id) if store is not None else None
                managed, ambiguous = self._match_managed_wifi_devices(
                    managed_devices=managed_devices,
                    stored_devices=stored_devices,
                    device_key=normalized_device_key,
                    deployed_device_id=deployed_device_id,
                    deployed_commands_hash=deployed_commands_hash,
                    commands_hash=commands_hash,
                )
                if ambiguous:
                    raise HomeAssistantError(
                        "Unable to safely identify existing managed Wifi Device; multiple matches found"
                    )
                if configured_slots == 0:
                    self._set_command_sync_progress(
                        device_key=normalized_device_key,
                        current_step=2,
                        message="Deleting existing managed Wifi Device",
                    )
                    for dev_id, _managed_key, _managed_hash, _brand in managed:
                        result = await self.async_delete_device(dev_id)
                        if not result:
                            raise HomeAssistantError(
                                f"Failed deleting managed device {dev_id}"
                            )

                    if store is not None:
                        await store.async_save_deployed_wifi_commands(
                            self.entry_id,
                            normalized_device_key,
                            [],
                            deployed_device_id=None,
                            commands_hash="",
                        )

                    if self.roku_server_enabled and not await self._async_wifi_listener_needed():
                        self._set_command_sync_progress(
                            device_key=normalized_device_key,
                            current_step=3,
                            message="Disabling Wifi Device",
                        )
                        await self.async_set_roku_server_enabled(False)

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

                # ── In-place re-sync: with exactly one managed device
                # matched, edit it in place so its device id (and everything
                # the user attached to it in the app) survives. Declines —
                # port change, drift, planner fallback, no snapshot — fall
                # through to the replace path below. A failure AFTER writes
                # started raises instead (never replace on top of a
                # half-applied edit). docs/internal/wifi-inplace-deploy-plan.md
                if len(managed) == 1:
                    inplace_result = await self._async_try_inplace_command_sync(
                        managed_device_id=managed[0][0],
                        commands=commands,
                        command_payload=command_payload,
                        normalized_device_key=normalized_device_key,
                        brand_name=brand_name,
                        device_name=device_name,
                        commands_hash=commands_hash,
                        request_port=request_port,
                        store=store,
                    )
                    if inplace_result is not None:
                        return inplace_result

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
                    current_step=2,
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
                    raise HomeAssistantError("Failed creating Wifi Device")

                wifi_device_id = int(created["device_id"])
                cached_created_device = self._proxy.state.entities("device").get(wifi_device_id & 0xFF)
                if isinstance(cached_created_device, dict):
                    self.devices[wifi_device_id & 0xFF] = dict(cached_created_device)
                else:
                    self.devices[wifi_device_id & 0xFF] = {
                        "brand": brand_name,
                        "name": device_name,
                    }
                self._devices_generation += 1
                self._bump_cache_generation()
                async_dispatcher_send(self.hass, signal_devices(self.entry_id))

                # Validated against a fresh hub catalog in the preflight above.
                activity_ids: set[int] = set(referenced_activity_ids)

                # Drop activity ids that no longer exist on this hub (e.g. the
                # user deleted an activity that a previous deploy linked to).
                # Without this filter async_add_device_to_activity fails on the
                # missing target and rolls back the entire deploy, leaving the
                # user no way to recover from the UI.
                known_activity_ids = set(self.activities.keys())
                if known_activity_ids:
                    stale_activity_ids = activity_ids - known_activity_ids
                    if stale_activity_ids:
                        _LOGGER.info(
                            "[%s] sync_command_config: dropping stale activity ids %s (no longer on hub)",
                            self.entry_id,
                            sorted(stale_activity_ids),
                        )
                        activity_ids &= known_activity_ids

                add_results: dict[int, bool] = {}
                self._set_command_sync_progress(
                    device_key=normalized_device_key,
                    current_step=3,
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
                    raise HomeAssistantError("Failed adding Wifi Device to all activities")

                # Delete the previous managed device only now, after the
                # replacement has joined its activities. The hub's delete
                # sweep purges any activity left with zero member devices,
                # so a delete-before-create order destroyed activities whose
                # sole member was the managed Wifi Device.
                self._set_command_sync_progress(
                    device_key=normalized_device_key,
                    current_step=4,
                    message="Deleting existing managed Wifi Device",
                )
                # Activities the hub rewrote while deleting the old managed
                # device. Their per-activity cache is cleared by the delete;
                # the step-7 re-warm below refetches them (including ones the
                # new config no longer references, which would otherwise stay
                # cold until a full cache refresh).
                delete_confirmed_acts: set[int] = set()
                for dev_id, _managed_key, _managed_hash, _brand in managed:
                    result = await self.async_delete_device(
                        dev_id, refresh_impacted_activities=False
                    )
                    if not result:
                        # Roll back to the pre-sync hub state: the store still
                        # points at the old device id, so leaving the new
                        # device behind would orphan it on the next sync.
                        await self.async_delete_device(wifi_device_id)
                        raise HomeAssistantError(
                            f"Failed deleting managed device {dev_id}"
                        )
                    delete_confirmed_acts.update(
                        int(act) & 0xFF
                        for act in (result.get("confirmed_activities") or [])
                    )

                # Warm the wifi-device command cache before activity refreshes
                # so favorite-label resolution can reuse the full REQ_COMMANDS
                # result instead of falling back to per-command lookups later.
                await self.async_fetch_device_commands(wifi_device_id)

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

                # Device-page key rows for unambiguously-claimed hard buttons:
                # they make the Wifi Device selectable as a role-group
                # controller (volume/navigation/…) in activity editors and
                # respond to direct presses on the remote's device page. The
                # KeyToKey table is uniform, so the same binding write applies
                # with the device's own id as the keymap entity.
                for dev_button_id, dev_command_id, dev_long_id in derive_device_level_bindings(
                    commands[:_WIFI_COMMAND_SLOT_COUNT],
                    hard_button_codes=_HARD_BUTTON_TO_CODE,
                    long_press_offset=_WIFI_COMMAND_LONG_PRESS_OFFSET,
                ):
                    await self.async_command_to_button(
                        wifi_device_id,
                        dev_button_id,
                        wifi_device_id,
                        dev_command_id,
                        long_press_device_id=wifi_device_id if dev_long_id else None,
                        long_press_command_id=dev_long_id,
                        refresh_after_write=False,
                    )

                self._set_command_sync_progress(
                    device_key=normalized_device_key,
                    current_step=7,
                    message="Refreshing activity maps and buttons",
                )
                # Re-warm every touched activity with the same clear-then-fetch
                # sequence as the Hub tab's per-activity refresh. The write
                # steps above (managed-device delete, activity re-add, favorite
                # writes, the family-0x61 reorder and keymap writes) each
                # invalidate parts of the per-activity cache, and a partial
                # refetch here used to leave favorites and buttons cold after
                # every deploy.
                warmed_act_los: set[int] = set()
                for act_id in sorted(activity_ids):
                    if not add_results.get(act_id, False):
                        continue
                    warmed_act_los.add(int(act_id) & 0xFF)
                    await self._async_fetch_activity_commands(act_id)
                    if act_id in activities_with_favorites:
                        # reorder_favorites dropped the cached family-0x61
                        # display order; re-read it so the cache view sorts
                        # favorites the way the remote now shows them.
                        await self.async_request_favorites_order(act_id)

                # Activities the managed-device delete rewrote but the new
                # config no longer references: their cache was cleared by the
                # delete, so re-warm them too. Skip ids the hub's delete sweep
                # purged (single-member activities no longer in the catalog).
                for act_lo in sorted(delete_confirmed_acts - warmed_act_los):
                    if act_lo not in self.activities:
                        continue
                    await self._async_fetch_activity_commands(act_lo)

                if activity_ids or delete_confirmed_acts:
                    self._bump_cache_generation()
                    async_dispatcher_send(self.hass, signal_commands(self.entry_id))
                    try:
                        await self._async_persist_cache_if_enabled()
                    except Exception:  # noqa: BLE001 - persist is best-effort
                        self._log.debug(
                            "[%s] post-deploy cache persist failed",
                            self.entry_id,
                            exc_info=True,
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
                if store is not None:
                    await store.async_save_deployed_wifi_commands(
                        self.entry_id,
                        normalized_device_key,
                        list(commands[:_WIFI_COMMAND_SLOT_COUNT]),
                        deployed_device_id=wifi_device_id,
                        commands_hash=commands_hash,
                        request_port=request_port,
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
            except Exception as err:
                self._set_command_sync_progress(
                    device_key=normalized_device_key,
                    status="failed",
                    message=self._command_sync_failure_message(
                        request_port=request_port,
                        detail=str(err),
                    ),
                )
                raise

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

        # string -> try to treat as ButtonName first
        if isinstance(key, str):
            norm = key.strip().upper()
            try:
                btn = getattr(ButtonName, norm)
            except KeyError:
                # not a ButtonName -> treat as numeric
                code = self._normalize_command_id(key)
                await self.async_send_raw_command(self.current_activity, code)
            else:
                await self.async_send_button(btn)
            return

        # int -> just send as raw command to current activity
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
