from __future__ import annotations

import asyncio
import contextlib
import logging
from collections import deque
from datetime import datetime, timezone
from functools import partial
from typing import Any, Dict, Optional

from homeassistant.components import persistent_notification
from homeassistant.components.zeroconf import async_get_instance
from homeassistant.core import HomeAssistant
from homeassistant.helpers.dispatcher import async_dispatcher_send

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
)
from .diagnostics import async_disable_hex_logging_capture, async_enable_hex_logging_capture
from .logging_utils import get_hub_logger
from .lib.x1_proxy import X1Proxy
from .command_config import (
    async_get_command_config_store,
)

# Re-exported: __init__.py and the tests read these from .hub.
from .wifi_deploy import (  # noqa: F401
    WifiDeployMixin,
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


class SofabatonHub(WifiDeployMixin, HubOpsMixin, HubFetchMixin, WifiIngressMixin, HubIdentityMixin, HubCacheViewMixin):
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


