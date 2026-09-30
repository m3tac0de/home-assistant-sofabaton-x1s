"""Cache fetches for SofabatonHub (R6, CR-H1-13).

Command, keymap and macro fetches with their waiters, the catalog and
snapshot refreshes, and the persistent cache restore and persist.
"""

from __future__ import annotations

import asyncio
from time import monotonic
from functools import partial
from typing import Any

from homeassistant.helpers.dispatcher import async_dispatcher_send

from .const import (
    signal_activity,
    signal_buttons,
    signal_commands,
    signal_devices,
    signal_macros,
)
from .cache_store import PersistentCacheStore
from .lib.devices import parse_device_record
from .shared_stores import async_shared_store


# How long a fetch or prime waits for an activity's buttons burst. Longer
# than the macro/activity-map waits (5 s): the buttons page of a large
# activity takes several frames.
BUTTONS_WAIT_TIMEOUT = 10.0


class HubFetchMixin:
    """Cache fetches for SofabatonHub (R6, CR-H1-13)."""

    async def _async_get_persistent_cache_store(self) -> PersistentCacheStore:
        # The same store and loader as the WS handlers (runtime).
        return await async_shared_store(
            self.hass, "persistent_cache_store", PersistentCacheStore, store_type=PersistentCacheStore
        )

    async def _async_persist_cache_if_enabled(self) -> bool:
        """Persist the cache when enabled. Best effort: a failure is logged
        and never ends the caller (the initial sync persists mid-way)."""

        store = await self._async_get_persistent_cache_store()
        if not store.enabled:
            return False

        try:
            await store.async_set_hub_cache(self.entry_id, await self.async_export_cache_state())
        except Exception:
            self._log.exception("[%s] Failed to persist the hub cache", self.entry_id)
            return False
        return True

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

    def _commands_ready_for(self, ent_id: int) -> bool:
        if self._looks_like_activity(ent_id):
            _, commands_ready = self._proxy.ensure_commands_for_activity(
                ent_id, fetch_if_missing=False
            )
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

    async def _async_fetch_activity_commands(self, act_id: int) -> None:
        self._reset_entity_cache(act_id)
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
        self._reset_entity_cache(ent_id)
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

    async def _async_wait_for_buttons_ready(
        self, ent_id: int, *, timeout: float = BUTTONS_WAIT_TIMEOUT
    ) -> None:
        if ent_id in self._buttons_ready_for:
            return
        if not self._proxy.can_issue_commands():
            # With the vendor app connected (or the hub down) no buttons
            # request was sent and none will be: nothing would resolve the
            # wait. Callers go on with what is cached.
            self._log.debug(
                "[%s] buttons for 0x%02X cannot be requested now; not waiting",
                self.entry_id,
                ent_id & 0xFF,
            )
            return

        future = self.hass.loop.create_future()
        self._button_waiters.setdefault(ent_id, []).append(future)
        try:
            await asyncio.wait_for(future, timeout)
        except asyncio.TimeoutError:
            self._log.debug(
                "[%s] timed out waiting for buttons for 0x%02X",
                self.entry_id,
                ent_id & 0xFF,
            )
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

    def _reset_entity_cache(self, ent_id: int) -> None:
        """Forget the HA-side readiness trackers for ``ent_id``.

        Engine state is cleared by ``X1Proxy.clear_entity_cache`` in the
        executor, which every caller runs right after this.
        """

        self._command_entities.discard(ent_id)
        self._buttons_ready_for.discard(ent_id)
        self._pending_button_fetch.discard(ent_id)
        self._release_button_waiters(ent_id)

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

    async def _async_prime_buttons_for(self, act_id: int) -> None:
        if self.is_long_running_task_active():
            # Its REQ_BUTTONS would land between a running operation's page
            # writes; that operation re-warms what it touches (CR-X1-3).
            self._log.debug(
                "[%s] prime_buttons_for(%s): hub busy, skipping", self.entry_id, act_id
            )
            return
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
            if act_id not in self._buttons_ready_for:
                # The wait ended without the burst (nothing could be
                # requested, a timeout, a reset or a hub drop). Leaving the
                # activity pending would make the next prime skip it.
                self._pending_button_fetch.discard(act_id)

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

    async def _async_refresh_devices_snapshot(
        self, timeout_seconds: float = 15.0
    ) -> dict[int, dict[str, Any]]:
        """Request a fresh device burst and return the proxy-state snapshot.

        The returned mapping is the raw ``state.entities("device")`` view, so
        ``raw_body`` is included. Callers that need a JSON-safe view
        must pass each entry through :func:`to_export_view`. This
        contract is symmetric with :meth:`_async_refresh_activities_snapshot`.

        Raises ``TimeoutError`` when no complete devices burst commits
        before the deadline. The cached catalog is left as it was; it is
        never cleared ahead of the read (a hub that stays silent is not a
        hub with no devices).
        """

        proxy = self._proxy
        baseline = proxy.devices_commit_serial
        await self.hass.async_add_executor_job(proxy.request_devices)

        deadline = monotonic() + timeout_seconds
        while monotonic() < deadline:
            if proxy.devices_commit_serial > baseline:
                return dict(proxy.state.entities("device"))
            await asyncio.sleep(0.1)

        raise TimeoutError("Timed out waiting for a complete device list from the hub")

    async def _async_warm_devices_snapshot(self) -> None:
        """Best-effort devices re-read for post-write epilogues.

        The write already succeeded; a hub that does not answer the
        follow-up catalog read only leaves the cached view one step
        behind until the next read, which is not worth failing the
        operation over.
        """

        try:
            await self._async_refresh_devices_snapshot()
        except TimeoutError:
            self._log.warning(
                "[%s] devices catalog re-read timed out; cached view may lag",
                self.entry_id,
            )

    async def async_get_device_power_state(self, device_id: int) -> int | None:
        """Fresh read of one device's live power state (0 off, 1 on).

        The hub live-updates the device row's power_state byte as
        activities and device-scope power macros run, and a full
        REQ_DEVICES burst is the protocol's only read for it (the hub
        ignores request payloads on the device family; wire-validated
        2026-08-25). Returns ``None`` when the row is unavailable or
        does not parse. Note the byte commits with a macro-runtime lag
        after a power fire, so callers that just fired must not expect
        an immediate flip; the card keeps a short-lived optimistic
        assumption instead.
        """

        dev_lo = int(device_id) & 0xFF
        try:
            snapshot = await self._async_refresh_devices_snapshot()
        except TimeoutError:
            return None
        body = (snapshot.get(dev_lo) or {}).get("raw_body") or b""
        try:
            config = parse_device_record(bytes(body), hub_version=self.version)
        except ValueError:
            return None
        return int(config.power_state) & 0xFF

    async def _async_refresh_activities_snapshot(
        self, timeout_seconds: float = 15.0
    ) -> dict[int, dict[str, Any]]:
        """Request a fresh activities burst and return the proxy-state snapshot.

        Returns the raw ``state.entities("activity")`` view (``raw_body``
        included); the JSON-export boundary is the only place that
        strips it via :func:`to_export_view`.

        Raises ``TimeoutError`` when no complete activities burst commits
        before the deadline. The cached catalog and the current activity
        are left untouched: they are never cleared ahead of the read, so
        an unanswered request cannot masquerade as a powered-off hub.

        The wait keys on the proxy's commit serial, not on the HA-side
        ``_activities_generation``: that counter is bumped by a loop
        callback which can still be queued from an earlier burst when this
        request goes out, and would then satisfy an unanswered wait. The
        returned snapshot is therefore read from proxy state directly and
        may be ahead of ``self.activities`` until that callback runs;
        callers that validate against the fresh catalog use the return
        value, not the HA-side dict.
        """

        proxy = self._proxy
        baseline = proxy.activities_commit_serial
        await self.hass.async_add_executor_job(proxy.request_activities)

        deadline = monotonic() + timeout_seconds
        while monotonic() < deadline:
            if proxy.activities_commit_serial > baseline:
                return dict(proxy.state.entities("activity"))
            await asyncio.sleep(0.1)

        raise TimeoutError("Timed out waiting for a complete Activity list from the hub")

    async def async_request_catalog(
        self, kind: str, timeout_seconds: float = 30.0
    ) -> dict[int, dict[str, Any]]:
        """Send REQ_ACTIVITIES or REQ_DEVICES to the hub and wait for the burst to complete.

        Returns the committed raw snapshot (see the refresh helpers), so a
        caller that must validate against the fresh catalog does not read
        the HA-side dict, which a queued older callback may still hold.

        Fetch-then-prune: the cached catalog stays in place until a complete
        burst replaces it wholesale (the proxy commits a full row set or
        nothing), so entries deleted on the hub drop out on success while an
        unanswered request changes nothing. Per-entity detail data (commands,
        macros) is pruned only for ids that a successful read no longer
        returns.

        Raises ``TimeoutError`` when the hub does not answer with a complete
        catalog in time. The old clear-before-read variant wiped the catalog
        and the active-activity hint ahead of the request, which turned a
        timed-out read into a phantom power-off (issue #279 / PR #280).
        """
        if kind == "activities":
            old_ids = await self.hass.async_add_executor_job(self._proxy.get_known_activity_ids)
            snapshot = await self._async_refresh_activities_snapshot(timeout_seconds=timeout_seconds)
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
            snapshot = await self._async_refresh_devices_snapshot(timeout_seconds=timeout_seconds)
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
        return snapshot
