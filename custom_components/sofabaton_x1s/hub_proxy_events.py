"""Engine callbacks and hub events for SofabatonHub (R6, CR-H1-13).

The proxy's burst, state and activity callbacks (each hops to the event
loop, L-A13), the activity catalog they keep, and the hub and activity
event actions they fire.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from homeassistant.components import persistent_notification
from homeassistant.helpers.dispatcher import async_dispatcher_send

from .const import (
    signal_activity,
    signal_app_activations,
    signal_hub_events,
    signal_buttons,
    signal_client,
    signal_commands,
    signal_devices,
    signal_hub,
    signal_macros,
)
from .command_config import (
    async_get_command_config_store,
)


class HubProxyEventsMixin:
    """Engine callbacks and hub events for SofabatonHub (R6, CR-H1-13)."""

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
