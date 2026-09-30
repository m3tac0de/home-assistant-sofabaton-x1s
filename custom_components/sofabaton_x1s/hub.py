from __future__ import annotations

import asyncio
import contextlib
import logging
from collections import deque
from datetime import datetime, timezone
from functools import partial
from typing import Any, Dict, Iterable, Optional

from homeassistant.components import persistent_notification
from homeassistant.components.zeroconf import async_get_instance
from homeassistant.core import HomeAssistant
from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.exceptions import HomeAssistantError

from .const import (
    DOMAIN,
    CONF_HEX_LOGGING_ENABLED,
    CONF_PROXY_ENABLED,
    CONF_ROKU_SERVER_ENABLED,
    HUB_VERSION_X1,
    classify_hub_version,
    signal_activity,
    signal_app_activations,
    signal_hub_events,
    signal_settings,
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
from .lib.wifi_inplace_plan import (
    COMMAND_RECORD_STEP_KINDS,
    REFERENCED_RECORD_STEP_KINDS,
    baseline_snapshot_from_bundle,
    build_wifi_inplace_plan,
    classify_live_slots,
    derive_device_level_bindings,
    desired_snapshot_from_config,
)
from .lib.x1_proxy import X1Proxy
from .command_config import (
    COMMAND_BRAND_PREFIX,
    async_get_command_config_store,
    DEFAULT_WIFI_DEVICE_KEY,
    count_configured_command_slots,
    is_wifi_events_device_key,
    normalize_power_command_id,
    normalize_wifi_transport,
    WIFI_TRANSPORT_HTTP,
    WIFI_TRANSPORT_MQTT,
)

# Re-exported: __init__.py and the tests read these from .hub.
from .wifi_deploy import (  # noqa: F401
    _HARD_BUTTON_TO_CODE,
    _WIFI_COMMAND_SLOT_COUNT,
    _parse_managed_wifi_brand,
)

from .hub_cache_view import HubCacheViewMixin
# Re-exported: the entity platforms import these from .hub.
from .hub_identity import (  # noqa: F401
    HubIdentityMixin,
    get_hub_display_name,
    get_hub_model,
    hub_device_info,
    real_hub_mac,
)
from .wifi_ingress import WifiIngressMixin
from .hub_fetch import HubFetchMixin
from .hub_ops import HubOpsMixin
_LOGGER = logging.getLogger(__name__)


class SofabatonHub(HubOpsMixin, HubFetchMixin, WifiIngressMixin, HubIdentityMixin, HubCacheViewMixin):
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
        # The hub's self-reported MAC from the connect banner — ground
        # truth for the MQTT press topic (see _wifi_mqtt_mac).
        self.banner_mac: str | None = None
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
        self._ir_emissions: deque[dict[str, Any]] = deque(maxlen=20)
        # MQTT press ingress: one subscription on
        # <MAC>/up, established only while a record is deployed over MQTT.
        self._mqtt_press_unsub: Any = None
        self._mqtt_press_topic: str | None = None
        # MQTT activity-state ingress: one subscription on
        # activity/<MAC>/activity_control_up, on whenever the hub is an
        # X2 with the MQTT integration loaded (no store refcount).
        self._mqtt_activity_unsub: Any = None
        self._mqtt_activity_topic: str | None = None
        self._last_hub_event: dict[str, Any] | None = None
        self._button_waiters: dict[int, list] = {}
        self._command_sync_lock = asyncio.Lock()
        # Hub work in flight: registry operations, immediate writes and the
        # write services all run inside async_hub_work. The busy guard, the
        # CALL_ME gate and the on-demand reads consult it, and unload waits
        # for it to drain (the HA side of the facade's hub hold).
        self._hub_work = 0
        self._hub_idle = asyncio.Event()
        self._hub_idle.set()
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

    @property
    def bridge_stats(self) -> dict[str, Any] | None:
        """Bridge-loop health counters for diagnostics (issue #279)."""

        try:
            return self._proxy.transport.get_bridge_stats()
        except Exception:
            return None

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
        if self.hass.data.get(DOMAIN, {}).get(self.entry_id) is not self:
            # Unloaded (or replaced by a reload) while the update listener
            # was queued: starting a proxy here would orphan it.
            return
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
            host,
            port,
            proxy_udp_port,
            hub_listen_base,
        )

        self.host = host
        self.port = port
        self._proxy_udp_port = proxy_udp_port
        self._hub_listen_base = hub_listen_base

        # The new engine starts from the old one's cache, the way setup
        # starts from the persisted one: the initial sync below persists
        # right after its banner read, and an empty engine would replace
        # every fetched detail in the store (CR-H1-3).
        cache_state = await self.async_export_cache_state()
        await self.async_stop()
        self._proxy = self._create_proxy()
        await self.async_restore_persistent_cache(cache_state)
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
        # Captured on the proxy's frame thread, before crossing into the
        # event loop: a burst that ended on the scheduler timeout committed
        # nothing, so the cached catalog (still "ready" from the last good
        # read) must not be mistaken for a fresh one. Reading the flag
        # inside _inner could observe a later burst instead.
        committed = self._proxy.last_activities_burst_committed

        def _inner() -> None:
            acts, ready = self._get_activities_cached()
            self._log.debug(
                "[%s] on_burst_end('activities'): ready=%s, committed=%s, count=%s",
                self.entry_id,
                ready,
                committed,
                len(acts) if acts else 0,
            )
            self.activities_ready = ready
            if not committed:
                # Unanswered or partial read: keep the last complete
                # catalog and the current activity untouched. Waiters on
                # _activities_generation see no advance and time out.
                async_dispatcher_send(self.hass, signal_activity(self.entry_id))
                return
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
                # No buttons burst can land now; wake whoever waits for one.
                self._release_button_waiters()
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
                # Re-align the activity-state subscription on every
                # connect: covers the MQTT integration loading after our
                # setup (no-op when nothing changed).
                self.hass.async_create_task(
                    self.async_update_activity_state_ingress()
                )
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
        # See _on_activities_burst: captured on the frame thread.
        committed = self._proxy.last_devices_burst_committed

        def _inner() -> None:
            # Cache only: retries belong to the initial sync and the
            # explicit refreshes, never to a failed burst (L-A3).
            devs, ready = self._proxy.get_devices(fetch_if_missing=False)
            self.devices_ready = ready
            if ready and committed:
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

        # A forced refresh only requests the catalog (it answers ({}, False));
        # the burst callbacks (_on_devices_burst, _on_activities_burst)
        # commit what lands.
        await self.hass.async_add_executor_job(
            partial(self._proxy.get_devices, force_refresh=True)
        )
        self.devices_ready = False
        await self.hass.async_add_executor_job(
            partial(self._proxy.get_activities, force_refresh=True)
        )
        self.activities_ready = False
        self._log.debug("[%s] initial_sync: catalog reads requested", self.entry_id)

        if self.current_activity is not None:
            self._log.debug(
                "[%s] initial_sync: priming buttons for current activity %s",
                self.entry_id,
                self.current_activity,
            )
            await self._async_prime_buttons_for(self.current_activity)

    def _looks_like_activity(self, ent_id: int) -> bool:
        ent_lo = ent_id & 0xFF
        return ent_lo in self._proxy.state.entities("activity")

    def _release_button_waiters(self, ent_id: int | None = None) -> None:
        """Wake every wait on ``ent_id`` (all entities when None). A waiter
        must never be dropped unresolved: nothing would ever wake it."""
        keys = list(self._button_waiters) if ent_id is None else [ent_id]
        for key in keys:
            for waiter in self._button_waiters.pop(key, []):
                if not waiter.done():
                    waiter.set_result(None)

    def _activity_favorites_ready(self, act_id: int) -> bool:
        _, ready = self._proxy.ensure_commands_for_activity(
            act_id,
            fetch_if_missing=False,
        )
        return ready

    # ------------------------------------------------------------------
    # helpers for entities
    # ------------------------------------------------------------------

    @property
    def is_sync_in_progress(self) -> bool:
        return self._command_sync_lock.locked()

    @contextlib.asynccontextmanager
    async def async_hub_work(self):
        """Mark the hub busy for one operation, write or write service."""

        self._hub_work += 1
        self._hub_idle.clear()
        try:
            yield
        finally:
            self._hub_work -= 1
            if self._hub_work == 0:
                self._hub_idle.set()

    @property
    def hub_work_active(self) -> bool:
        """True while hub work or a Wifi Command sync is running."""

        return self._hub_work > 0 or self._command_sync_lock.locked()

    async def async_wait_until_idle(self, timeout: float) -> bool:
        """Wait up to ``timeout`` s for running hub work to finish."""

        loop = asyncio.get_running_loop()
        deadline = loop.time() + timeout
        while self.hub_work_active:
            remaining = deadline - loop.time()
            if remaining <= 0:
                return False
            if self._hub_work > 0:
                with contextlib.suppress(asyncio.TimeoutError):
                    await asyncio.wait_for(self._hub_idle.wait(), min(remaining, 1.0))
            else:
                await asyncio.sleep(min(remaining, 0.25))
        return True

    def is_long_running_task_active(self) -> bool:
        """True while a backup, restore, sync or other hub work is running.

        Wired into the transport bridge as the CALL_ME busy gate so proxy
        clients are ignored without tearing down mDNS/broadcast discovery.
        """

        if self.hub_work_active:
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

    def get_managed_command_hashes(self, device_key: str | None = None) -> list[str]:
        normalized_key = "".join(ch for ch in str(device_key or "").lower() if ch.isalnum())
        hashes: set[str] = set()
        for _dev_id, managed_key, command_hash, _brand in self._managed_wifi_devices():
            if normalized_key and managed_key != normalized_key:
                continue
            if command_hash:
                hashes.add(command_hash)
        return sorted(hashes)

    def _select_wifi_command_transport(self, command_payload: dict[str, Any]) -> str:
        """Pick the transport for the first deployment.

        A record that has already deployed keeps its transport forever
        (changing it is an explicit re-deploy, never a side effect of a
        re-sync). Fresh deploys honor the create-flow choice only when
        the hub is an X2 and the MQTT integration is loaded; everything
        else is HTTP.
        """

        already_deployed = isinstance(
            command_payload.get("deployed_device_id"), int
        ) or bool(str(command_payload.get("deployed_commands_hash") or "").strip())
        if already_deployed:
            # Absent ⇒ HTTP: every record that predates the MQTT work
            # deployed over HTTP, and a replace must never migrate it.
            return normalize_wifi_transport(command_payload.get("deployed_transport"))
        if not self.wifi_mqtt_available():
            return WIFI_TRANSPORT_HTTP
        return normalize_wifi_transport(command_payload.get("requested_transport"))

    async def async_delete_wifi_event_records(
        self,
        *,
        device_id: int,
        command_ids: list[int],
    ) -> bool:
        """Family-0x10 record deletes for a freed Wifi Event slot (short +
        long record). The hub cascades referencing favorites/bindings and
        removes the step from macros in place — a macro left with no steps
        is removed (live-validated both hubs, wifi-events-plan §11 W0.2).

        Runs AFTER the freed slot's placeholder sync; the records
        resurrect as (ref-less) placeholders on the next full sync, which
        is harmless — the point of the delete is the reference cascade.
        """

        async with self._command_sync_lock:
            ok = True
            for command_id in command_ids:
                result = await self.hass.async_add_executor_job(
                    partial(
                        self._proxy._sync_step_command_delete,
                        {"device_id": int(device_id), "command_id": int(command_id)},
                    )
                )
                ok = ok and bool(result)
            # Cascade epilogue: the deletes rewrote referencing activities'
            # key rows hub-side; re-warm them + the device catalog so the
            # cached views (favorite/binding labels, macro steps) follow.
            await self.async_fetch_device_commands(int(device_id))
            for act_id in sorted(self._proxy.activities_referencing_device(int(device_id))):
                await self._async_fetch_activity_commands(act_id)
            await self._async_warm_devices_snapshot()
            self._bump_cache_generation()
            async_dispatcher_send(self.hass, signal_commands(self.entry_id))
            try:
                await self._async_persist_cache_if_enabled()
            except Exception:  # noqa: BLE001 - persist is best-effort
                self._log.debug(
                    "[%s] post-event-delete cache persist failed", self.entry_id, exc_info=True
                )
            return ok

    async def _async_rewarm_after_inplace(
        self, plan: Any, dev_id: int, referencing_before: set[int]
    ) -> list[int]:
        """Re-read what an in-place plan wrote; returns the touched activities."""

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
        refresh_acts: set[int] = set(touched_acts)
        if any(step.kind in COMMAND_RECORD_STEP_KINDS for step in plan.steps):
            await self.async_fetch_device_commands(dev_id)
        if any(step.kind in REFERENCED_RECORD_STEP_KINDS for step in plan.steps):
            # Record rewrites change labels that other activities' cached
            # favorite label maps still hold (they are resolved
            # copies, not references into the device catalog). Re-warm
            # every activity referencing the managed device, not just the
            # ones the plan wrote to directly — mirroring what a full
            # cache refresh would do for them.
            refresh_acts.update(referencing_before)
            refresh_acts.update(self._proxy.activities_referencing_device(dev_id))
        for act_id in sorted(refresh_acts):
            await self._async_fetch_activity_commands(act_id)
            if act_id in favorite_acts:
                await self.async_request_favorites_order(act_id)
        return touched_acts

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
        slot_count: int = _WIFI_COMMAND_SLOT_COUNT,
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
        # recorded port — one replace-path sync backfills it. MQTT records
        # carry no port at all, so the gate does
        # not apply to them.
        deployed_over_mqtt = (
            normalize_wifi_transport(command_payload.get("deployed_transport"))
            == WIFI_TRANSPORT_MQTT
        )
        deployed_request_port = command_payload.get("deployed_request_port")
        if not deployed_over_mqtt and deployed_request_port != request_port:
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

        # `phase` is the stable, translatable name of this stage; `message` is
        # the English rendering kept for logs and for any consumer that has no
        # localization table. The control panel localizes `phase` and only
        # falls back to `message` for stages it does not know.
        #
        # The baseline read is the long pole of an in-place sync (one hub
        # exchange per activity), so it counts its reads up through
        # current_step/total_steps instead of sitting silent until the plan
        # runs.
        total_reads = 1 + len(activity_ids)
        loop = self.hass.loop

        def _report_read_progress(completed_reads: int) -> None:
            def _report() -> None:
                self._set_command_sync_progress(
                    device_key=normalized_device_key,
                    current_step=completed_reads,
                    total_steps=total_reads,
                    phase="reading_device",
                    message=f"Reading the deployed Wifi Device ({completed_reads} of {total_reads})",
                )

            loop.call_soon_threadsafe(_report)

        self._set_command_sync_progress(
            device_key=normalized_device_key,
            current_step=0,
            total_steps=total_reads,
            phase="reading_device",
            message="Reading the deployed Wifi Device",
        )

        def _read_baseline():
            device_entry = self._proxy.backup_device(dev_id, include_blobs=False)
            # One activity catalog read for the loop (best effort, as each
            # per-activity read's own refresh was), not one per activity.
            self._proxy._refresh_catalog("activities", timeout=5.0)
            activity_entries = []
            for idx, act_id in enumerate(activity_ids):
                _report_read_progress(idx + 1)
                payload = self._proxy.backup_activity(act_id, refresh_catalog=False)
                if isinstance(payload, dict):
                    activity_entries.append(payload)
            return device_entry, activity_entries

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
        for idx, slot in enumerate(deployed_slots[:slot_count]):
            name = str(slot.get("name") or f"Command {idx + 1}").strip() or f"Command {idx + 1}"
            expected_labels[idx + 1] = name
            expected_labels[idx + 1 + slot_count] = f"{name} Long Press"
        desired = desired_snapshot_from_config(
            command_payload,
            device_id=dev_id,
            device_name=device_name,
            brand=brand_name,
            hard_button_codes=_HARD_BUTTON_TO_CODE,
            slot_count=slot_count,
            long_press_offset=slot_count,
        )

        # Classify every live record that disagrees with the deployed
        # snapshot's expansion. A record that instead matches the DESIRED
        # expansion is our own interrupted in-place run (the brand hash is
        # only committed last, so a failed run leaves already-applied edits
        # ahead of the snapshot) — the planner diffs against the live read,
        # so re-running simply resumes: applied steps no-op, the rest
        # re-emit. Only records matching NEITHER side are foreign edits
        # (the Sofabaton app) and force the replace-path rebase.
        # Labels are compared as the hub stores them: the slot is 30
        # characters, so "<20-char name> Long Press" legitimately reads
        # back one character short and is not drift.
        # Missing records are no reason to decline here: the planner diffs
        # against the live read and re-adds them.
        live = classify_live_slots(
            baseline.slots, expected_labels, desired.slots, label_key=self._hub_command_label
        )
        if live.drift:
            _LOGGER.info(
                "[%s] in-place sync declined: live records drifted from the deployed "
                "snapshot (command ids %s)", self.entry_id, list(live.drift),
            )
            return None
        if live.resumed:
            _LOGGER.info(
                "[%s] in-place sync resuming an interrupted apply (command ids %s "
                "already match the desired config)", self.entry_id, list(live.resumed),
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
            slot_count=slot_count,
            long_press_offset=slot_count,
        )
        plan = build_wifi_inplace_plan(
            baseline,
            desired,
            deployed=deployed_snapshot,
            label_key=self._hub_command_label,
        )
        if plan.is_fallback:
            _LOGGER.info(
                "[%s] in-place sync declined by planner: %s",
                self.entry_id, plan.fallback_reason,
            )
            return None

        total_steps = len(plan.steps) + 2
        # Scanned before the write: a failed record delete may already have
        # cascaded the references a later scan would miss.
        referencing_before: set[int] = (
            set(self._proxy.activities_referencing_device(dev_id))
            if any(step.kind in REFERENCED_RECORD_STEP_KINDS for step in plan.steps)
            else set()
        )
        if plan.steps:

            def _progress(**data: Any) -> None:
                message = str(data.get("message") or "")
                completed = int(data.get("completed_steps") or 0)
                step_kind = data.get("step_kind")
                step_name = data.get("step_name")

                def _inner() -> None:
                    # The planner names its steps after the user's own data
                    # ("Adding command "Kitchen lights"…"), so there is no
                    # fixed phase to report — phase=None clears the stale
                    # "reading_device" left by the merge in
                    # _set_command_sync_progress. step_kind/step_name are the
                    # structured form the control panel localizes; `message`
                    # stays the English fallback.
                    self._set_command_sync_progress(
                        device_key=normalized_device_key,
                        current_step=completed + 1,
                        total_steps=total_steps,
                        phase=None,
                        step_kind=step_kind,
                        step_name=step_name,
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
                # The steps before the rejection landed: read back what the
                # plan touched so the cache shows the hub, not what the
                # aborted run left cleared (CR-X1-1).
                try:
                    await self._async_rewarm_after_inplace(plan, dev_id, referencing_before)
                    await self._async_persist_cache_if_enabled()
                except Exception:  # noqa: BLE001 - the read-back is best-effort
                    self._log.warning(
                        "[%s] read-back after a failed in-place sync failed",
                        self.entry_id,
                        exc_info=True,
                    )
                raise HomeAssistantError(f"In-place sync failed: {message}")

        # X1: heal order tables that leave a live favorite or macro out
        # (see _async_repair_x1_quick_access), before the re-warm reads them.
        repaired_order = await self._async_repair_x1_quick_access(
            set(desired.activities) | set(referencing_before or ())
        )
        # Post-write cache refresh, mirroring the replace path's epilogue.
        touched_acts = await self._async_rewarm_after_inplace(plan, dev_id, referencing_before)
        if plan.steps or repaired_order:
            await self._async_warm_devices_snapshot()
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
                phase="resyncing_remote",
                step_kind=None,
                step_name=None,
                message="Resyncing physical remote",
            )
            await self.async_resync_remote()

        if store is not None:
            await store.async_save_deployed_wifi_commands(
                self.entry_id,
                normalized_device_key,
                list(commands[:slot_count]),
                deployed_device_id=dev_id,
                commands_hash=commands_hash,
                request_port=None if deployed_over_mqtt else request_port,
            )

        self._set_command_sync_progress(
            device_key=normalized_device_key,
            status="success",
            current_step=total_steps,
            total_steps=total_steps,
            phase="updated_in_place" if plan.steps else "already_current",
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
            normalized_device_key = "".join(ch for ch in str(device_key or DEFAULT_WIFI_DEVICE_KEY).lower() if ch.isalnum()) or DEFAULT_WIFI_DEVICE_KEY
            # Per-record slot count (store payloads carry it; default 10).
            # The Wifi Events record deploys 25 slots — 50 records — and
            # honors long_press_enabled standalone (plan §2-capacity).
            try:
                slot_count = int(command_payload.get("slot_count"))
            except (TypeError, ValueError):
                slot_count = _WIFI_COMMAND_SLOT_COUNT
            if not (1 <= slot_count <= 100):
                slot_count = _WIFI_COMMAND_SLOT_COUNT
            configured_slots = count_configured_command_slots(
                commands,
                slot_count=slot_count,
                standalone_long_press=is_wifi_events_device_key(normalized_device_key),
            )
            commands_hash = str(command_payload.get("commands_hash") or "")
            deployed_commands_hash = str(command_payload.get("deployed_commands_hash") or "")
            deployed_device_id = command_payload.get("deployed_device_id")
            brand_name = f"{COMMAND_BRAND_PREFIX}-{normalized_device_key}-{commands_hash}"
            selected_transport = self._select_wifi_command_transport(command_payload)
            total_steps = 8 if configured_slots > 0 else 7
            store = await async_get_command_config_store(self.hass)
            self._set_command_sync_progress(
                device_key=normalized_device_key,
                status="running",
                current_step=0,
                total_steps=total_steps,
                phase="starting",
                message="Starting sync",
            )

            try:
                self._set_command_sync_progress(
                    device_key=normalized_device_key,
                    current_step=1,
                    phase="enabling_device",
                    message="Ensuring Wifi Device is enabled",
                )
                if (
                    configured_slots > 0
                    and selected_transport != WIFI_TRANSPORT_MQTT
                    and not self.roku_server_enabled
                ):
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
                for slot in commands[:slot_count]:
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
                        phase="validating_activities",
                        message="Validating Activities against the hub",
                    )
                    try:
                        activity_snapshot = await self.async_request_catalog("activities")
                    except TimeoutError as err:
                        raise HomeAssistantError(
                            "Failed to refresh the Activity list from the hub; "
                            "sync aborted rather than deploying against a stale catalog"
                        ) from err
                    stored_activity_labels = command_payload.get("activity_labels")
                    if isinstance(stored_activity_labels, dict):
                        label_mismatches: list[str] = []
                        for act_id in sorted(referenced_activity_ids):
                            stored_label = str(
                                stored_activity_labels.get(str(act_id)) or ""
                            ).strip()
                            if not stored_label:
                                continue
                            # Validate against the snapshot the refresh
                            # returned, not self.activities: the burst
                            # callback that updates the latter may still
                            # be queued behind an older one.
                            entry = activity_snapshot.get(act_id)
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

                try:
                    device_snapshot = await self._async_refresh_devices_snapshot()
                except TimeoutError as err:
                    raise HomeAssistantError(
                        "Failed to refresh the Device list from the hub; "
                        "sync aborted rather than deploying against a stale catalog"
                    ) from err
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
                        phase="deleting_device",
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
                    await self.async_update_wifi_mqtt_ingress()

                    if self.roku_server_enabled and not await self._async_wifi_listener_needed():
                        self._set_command_sync_progress(
                            device_key=normalized_device_key,
                            current_step=3,
                            phase="disabling_device",
                            message="Disabling Wifi Device",
                        )
                        await self.async_set_roku_server_enabled(False)

                    self._set_command_sync_progress(
                        device_key=normalized_device_key,
                        status="success",
                        current_step=7,
                        total_steps=total_steps,
                        phase="device_removed",
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
                        slot_count=slot_count,
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
                for idx, slot in enumerate(commands[:slot_count]):
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
                for idx, slot in enumerate(commands[:slot_count]):
                    name = str(slot.get("name") or f"Command {idx + 1}").strip() or f"Command {idx + 1}"
                    command_defs.append(
                        {
                            "display_name": name,
                            "press_type": "short",
                            "command_index": idx,
                        }
                    )
                for idx, slot in enumerate(commands[:slot_count]):
                    name = str(slot.get("name") or f"Command {idx + 1}").strip() or f"Command {idx + 1}"
                    command_defs.append(
                        {
                            "display_name": f"{name} Long Press",
                            "press_type": "long",
                            "command_index": idx,
                        }
                    )

                self._set_command_sync_progress(
                    device_key=normalized_device_key,
                    current_step=2,
                    phase="creating_device",
                    message="Creating Wifi Device on Hub",
                )
                if selected_transport == WIFI_TRANSPORT_MQTT:
                    created = await self.async_create_wifi_mqtt_device(
                        device_name=device_name,
                        commands=command_defs,
                        brand_name=brand_name,
                        power_on_command_id=power_on_command_id,
                        power_off_command_id=power_off_command_id,
                        input_command_ids=input_command_ids or None,
                    )
                else:
                    created = await self.async_create_wifi_device(
                        device_name=device_name,
                        commands=command_defs,
                        request_port=request_port,
                        brand_name=brand_name,
                        power_on_command_id=power_on_command_id,
                        power_off_command_id=power_off_command_id,
                        input_command_ids=input_command_ids or None,
                        # The deploy keeps writing after the create
                        # (memberships, favorites, bindings); the single
                        # terminal resync at the end of this pipeline
                        # covers the remote. A mid-batch trigger here
                        # aborts/restarts the remote's multi-minute full
                        # sync (bench 2026-08-27).
                        send_remote_sync=False,
                    )
                if not created or not created.get("device_id"):
                    raise HomeAssistantError("Failed creating Wifi Device")

                wifi_device_id = int(created["device_id"])
                # An ACK only proves the hub accepted each frame. Verify that
                # every command row survived the create transaction before
                # touching activities or deleting the old managed device.
                if managed:
                    await self.async_fetch_device_commands(wifi_device_id)
                    command_rows, commands_ready = (
                        await self.hass.async_add_executor_job(
                            partial(
                                self._proxy.get_commands_for_entity,
                                wifi_device_id,
                                fetch_if_missing=False,
                            )
                        )
                    )
                    # Compare labels as the hub stores them (fixed-width
                    # slot): a 31-character "<name> Long Press" comes back
                    # cut to 30 and is still the row we wrote.
                    actual_commands = {
                        int(command_id) & 0xFF: self._hub_command_label(str(label))
                        for command_id, label in dict(command_rows or {}).items()
                    }
                    expected_commands = {
                        idx + 1: self._hub_command_label(str(command["display_name"]))
                        for idx, command in enumerate(command_defs)
                    }
                    if not commands_ready or actual_commands != expected_commands:
                        mismatched = sorted(
                            cid
                            for cid in set(actual_commands) | set(expected_commands)
                            if actual_commands.get(cid) != expected_commands.get(cid)
                        )
                        _LOGGER.warning(
                            "[%s] sync_command_config: replacement Wifi Device %d failed "
                            "command readback (table complete=%s, %d rows read, %d expected); "
                            "mismatched ids: %s",
                            self.entry_id,
                            wifi_device_id,
                            commands_ready,
                            len(actual_commands),
                            len(expected_commands),
                            "; ".join(
                                f"{cid}: hub={actual_commands.get(cid)!r} "
                                f"expected={expected_commands.get(cid)!r}"
                                for cid in mismatched[:10]
                            )
                            or "none",
                        )
                        await self.async_delete_device(wifi_device_id)
                        raise HomeAssistantError(
                            "The replacement Wifi Device did not pass command "
                            "readback; the existing device was kept unchanged"
                        )
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
                    phase="adding_to_activities",
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
                    phase="deleting_device",
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
                        for act in (
                            result.get("impacted_activities")
                            if result.get("impacted_activities") is not None
                            else result.get("confirmed_activities") or []
                        )
                    )

                self._set_command_sync_progress(
                    device_key=normalized_device_key,
                    current_step=5,
                    phase="applying_favorites",
                    message="Applying activity favorites",
                )

            # Track the hub-assigned fav_id for every successfully added favorite,
            # keyed by activity and ordered by command slot (add order).  We use
            # these tracked ids in the post-hoc reorder rather than a pre-existing
            # snapshot so that fav_id recycling (the hub reusing freed ids) cannot
            # cause old scrambled orders to be mistaken for "existing to preserve".
                activities_new_fav_ids: dict[int, list[int]] = {}
                # Binding and favorite-order writes the hub refused. The
                # deploy still finishes (the device exists and owns its
                # activities), but it reads as out of date and fails, so the
                # next sync repairs it in place (CR-H1-4). A refused
                # favorite add stays tolerated (L-H1).
                failed_writes: list[str] = []

                activities_with_favorites: set[int] = set()
                for slot_idx, slot in enumerate(commands[:slot_count]):
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
                            # The reorder below rewrites each activity's
                            # order once and puts back any record it left
                            # out (X1); one read per activity, not per add.
                            repair_order=False,
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
                    if not await self.async_reorder_favorites(
                        act_id, final_order, refresh_after_write=False
                    ):
                        failed_writes.append(f"favorite order in activity {act_id}")

                self._set_command_sync_progress(
                    device_key=normalized_device_key,
                    current_step=6,
                    phase="applying_bindings",
                    message="Applying activity button mappings",
                )
                for slot_idx, slot in enumerate(commands[:slot_count]):
                    hard_button = str(slot.get("hard_button") or "").strip().lower()
                    if not hard_button:
                        continue
                    button_id = _HARD_BUTTON_TO_CODE.get(hard_button)
                    if not button_id:
                        continue
                    command_id = slot_idx + 1
                    long_press_enabled = bool(slot.get("long_press_enabled"))
                    long_press_command_id = (
                        # long-record id law: long = short + slot_count
                        slot_idx + 1 + slot_count
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
                        if not await self.async_command_to_button(
                            act_id,
                            button_id,
                            wifi_device_id,
                            command_id,
                            long_press_device_id=wifi_device_id if long_press_enabled else None,
                            long_press_command_id=long_press_command_id,
                            refresh_after_write=False,
                        ):
                            failed_writes.append(f"button {hard_button} in activity {act_id}")

                # Device-page key rows for unambiguously-claimed hard buttons:
                # they make the Wifi Device selectable as a role-group
                # controller (volume/navigation/…) in activity editors and
                # respond to direct presses on the remote's device page. The
                # binding table is uniform, so the same binding write applies
                # with the device's own id as the keymap entity.
                for dev_button_id, dev_command_id, dev_long_id in derive_device_level_bindings(
                    commands[:slot_count],
                    hard_button_codes=_HARD_BUTTON_TO_CODE,
                    slot_count=slot_count,
                    long_press_offset=slot_count,
                ):
                    if not await self.async_command_to_button(
                        wifi_device_id,
                        dev_button_id,
                        wifi_device_id,
                        dev_command_id,
                        long_press_device_id=wifi_device_id if dev_long_id else None,
                        long_press_command_id=dev_long_id,
                        refresh_after_write=False,
                    ):
                        failed_writes.append(f"button 0x{dev_button_id:02X} on the device page")

                self._set_command_sync_progress(
                    device_key=normalized_device_key,
                    current_step=7,
                    phase="refreshing_maps",
                    message="Refreshing activity maps and buttons",
                )
                # Backup-grade re-warm of the deployed device, before the
                # activity re-warms so their favorite/binding label
                # resolution reads a populated command catalog. The binding
                # writes above cleared the device's cached key rows, and the
                # create pipeline never fetched key-sort/inputs/idle at all;
                # this is the same fetch as the Hub tab's per-device refresh,
                # so the editor baseline and the persisted cache leave the
                # deploy bundle-grade instead of needing a manual row
                # refresh. On the replace path the readback guard above
                # already verified the command table, so it is reused; first
                # deploys still hold the unverified create-time echo and
                # fetch a real one.
                try:
                    await self.hass.async_add_executor_job(
                        partial(
                            self._proxy.backup_device,
                            wifi_device_id,
                            include_blobs=False,
                            reuse_commands=bool(managed),
                        )
                    )
                except Exception:  # noqa: BLE001 - warm is best-effort tail work
                    self._log.warning(
                        "[%s] deploy finished, but the post-deploy device warm failed",
                        self.entry_id,
                        exc_info=True,
                    )
                # Re-warm every touched activity with the same clear-then-fetch
                # sequence as the Hub tab's per-activity refresh. The write
                # steps above (managed-device delete, activity re-add, favorite
                # writes, the family-0x61 reorder and keymap writes) each
                # invalidate parts of the per-activity cache, and a partial
                # refetch here used to leave favorites and buttons cold after
                # every deploy.
                # X1: heal order tables that leave a live favorite or macro
                # out (see _async_repair_x1_quick_access), before the re-warm
                # reads them; the remote resync below carries the result.
                await self._async_repair_x1_quick_access(
                    [act for act in activity_ids if add_results.get(act, False)]
                    + [act for act in delete_confirmed_acts if act in self.activities]
                )
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

                # Unconditional: every deploy that reaches here changed the
                # device catalog (create + managed delete), and the only
                # earlier generation bump fired mid-pipeline, before the
                # cache was warm. Gating this on activity references froze
                # the frontend on that mid-deploy snapshot (a device with an
                # empty command table) and skipped the disk persist entirely
                # for activity-less deploys.
                self._bump_cache_generation()
                async_dispatcher_send(self.hass, signal_devices(self.entry_id))
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
                    phase="resyncing_remote",
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
                        list(commands[:slot_count]),
                        deployed_device_id=wifi_device_id,
                        # An empty hash reads as "sync needed" in the card.
                        commands_hash="" if failed_writes else commands_hash,
                        # No port is baked into MQTT records; storing None keeps
                        # listener-port changes from ever forcing a replace.
                        request_port=(
                            None if selected_transport == WIFI_TRANSPORT_MQTT else request_port
                        ),
                        deployed_transport=selected_transport,
                    )

                await self.async_update_wifi_mqtt_ingress()

                if failed_writes:
                    _LOGGER.warning(
                        "[%s] sync_command_config: the hub refused %d write(s): %s",
                        self.entry_id,
                        len(failed_writes),
                        ", ".join(failed_writes),
                    )
                    raise HomeAssistantError(
                        f"Failed applying {len(failed_writes)} hub write(s) "
                        f"({', '.join(failed_writes)}); the Wifi Device is deployed, "
                        "sync again to repair it"
                    )

                self._set_command_sync_progress(
                    device_key=normalized_device_key,
                    status="success",
                    current_step=8,
                    total_steps=total_steps,
                    phase="complete",
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

    async def _async_repair_x1_quick_access(self, activity_ids: Iterable[int]) -> bool:
        """X1: rewrite each activity's quick-access order that leaves out a
        live favorite or macro (an older restore wrote such tables; the
        remote then covers an entry and shows an empty row). Runs at the end
        of a Wifi Commands sync, so affected setups heal on their next sync.
        Best effort; True when any activity was rewritten."""

        if self.version != HUB_VERSION_X1:
            return False
        repaired = False
        for act_id in sorted({int(act) & 0xFF for act in activity_ids}):
            if act_id not in self.activities:
                continue
            try:
                result = await self.hass.async_add_executor_job(
                    self._proxy.repair_x1_quick_access_order, act_id
                )
            except Exception:  # noqa: BLE001 - the repair never fails a sync
                self._log.warning(
                    "[%s] quick-access order repair failed for activity %s",
                    self.entry_id,
                    act_id,
                    exc_info=True,
                )
                continue
            repaired = repaired or result is True
        return repaired

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
        async_dispatcher_send(self.hass, signal_settings(self.entry_id))

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
        async_dispatcher_send(self.hass, signal_settings(self.entry_id))


