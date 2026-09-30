"""Hub operations for SofabatonHub (R6, CR-H1-13).

The executor wrappers the WS handlers and services call: backup, refresh,
sync, erase and restore, IR, device and activity create/delete/reorder,
favorites and bindings, and the send, activate and remote helpers.
"""

from __future__ import annotations

import asyncio
from functools import partial
from typing import Any, Iterable

from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.exceptions import HomeAssistantError

from .const import (
    HUB_BUNDLE_SCHEMA_VERSION,
    signal_activity,
    signal_commands,
    signal_devices,
    signal_macros,
)
from .lib.protocol_const import (
    ButtonName,
    DEVICE_CLASS_IR,
)
from .lib.blob_decoders import (
    format_decoded_for_display as decoded_blob_display_text,
    is_decodable_class as is_blob_decodable_class,
    try_decode_blob as try_decode_command_blob,
)
from .lib.backup_export import PAYLOAD_PROFILE_FULL
from .lib.commands import hub_command_label, split_play_blob_tail


class HubOpsMixin:
    """Hub operations for SofabatonHub (R6, CR-H1-13)."""

    def _hub_command_label(self, label: str) -> str:
        """Project a command label onto the hub's fixed-width label slot.

        Wraps :func:`lib.commands.hub_command_label` for this hub's model;
        identity (stripped) while the model is not known yet, so the
        comparison paths never raise on an unclassified hub.
        """

        try:
            return hub_command_label(label, self._proxy.hub_version)
        except ValueError:
            return str(label or "").strip()

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
        allow_command_removal: bool = False,
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
                allow_command_removal=allow_command_removal,
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
        :meth:`async_erase_configuration` first, after the bundle has
        passed the restore's own preflight. A failed erase raises
        ``HomeAssistantError`` before any wire writes.
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
        # Every check the restore itself would fail on runs before the
        # erase too, so a bundle it refuses never costs the hub its
        # configuration. Raises ValueError; nothing is written.
        await self.hass.async_add_executor_job(self._proxy.preflight_restore_bundle, payload)

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

    async def async_set_ir_learn_mode(self, enabled: bool) -> bool:
        """Arm or disarm the hub's IR learn mode (toggle only, no capture wait)."""

        return await self.hass.async_add_executor_job(
            partial(self._proxy.set_ir_learn_mode, enabled)
        )

    async def async_ir_learn_command(self, *, timeout: float = 60.0) -> dict[str, Any] | None:
        """Arm learn mode and wait for one captured IR command (or timeout/interrupt)."""

        return await self.hass.async_add_executor_job(
            partial(self._proxy.ir_learn_command, timeout=timeout)
        )

    def cancel_ir_learn(self) -> bool:
        """Wake an in-flight ``async_ir_learn_command`` early (non-blocking).

        The exchange then disarms the hub and resolves with state
        ``cancelled``. Returns False when no learn window is open.
        """

        return bool(self._proxy.cancel_ir_learn())

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
        send_remote_sync: bool = True,
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
                send_remote_sync=send_remote_sync,
            ),
        )

    async def async_create_wifi_mqtt_device(
        self,
        device_name: str = "Home Assistant",
        commands: list[Any] | None = None,
        brand_name: str = "m3tac0de",
        power_on_command_id: int | None = None,
        power_off_command_id: int | None = None,
        input_command_ids: list[int] | None = None,
    ) -> dict[str, Any] | None:
        """Create a wifi_mqtt (X2 virtual MQTT) device on the selected hub."""

        return await self.hass.async_add_executor_job(
            partial(
                self._proxy.create_wifi_mqtt_device,
                device_name=device_name,
                commands=commands,
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
        activity that referenced the device (its ``impacted_activities`` —
        the hub-flagged confirm set plus the cache scan of power macros,
        favorites, and bindings), so by default those activities are
        re-warmed here before the cache is persisted. Callers that run
        their own re-warm pass afterwards (the wifi deploy pipeline) pass
        ``refresh_impacted_activities=False`` and fold the result's
        ``impacted_activities`` into that pass instead.
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
                impacted = result.get("impacted_activities")
                if impacted is None:
                    impacted = result.get("confirmed_activities") or []
                for act_id in impacted:
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

    async def async_create_device(
        self, name: str, *, device_class: str
    ) -> dict[str, Any] | None:
        """Create an empty device of *device_class* named *name* on the hub.

        The proxy wrapper already refreshes the hub-side device catalog
        (which feeds ``self.devices`` through the normal devices burst)
        and syncs the remote; the bookkeeping here mirrors
        :meth:`async_delete_device` so the Hub tab repaints and the
        persisted cache picks the new row up without waiting for the
        frontend's per-entity refresh.
        """

        result = await self.hass.async_add_executor_job(
            partial(self._proxy.create_device, name, device_class=device_class)
        )
        if isinstance(result, dict) and str(result.get("status")) == "success":
            self._devices_generation += 1
            self._bump_cache_generation()
            async_dispatcher_send(self.hass, signal_devices(self.entry_id))
            await self._async_persist_cache_if_enabled()
        return result

    async def async_command_to_favorite(
        self,
        activity_id: int,
        device_id: int,
        command_id: int,
        *,
        slot_id: int | None = None,
        refresh_after_write: bool = True,
        repair_order: bool = True,
    ) -> dict[str, Any] | None:
        """Replay the favorite write sequence on the selected hub."""

        kwargs: dict[str, Any] = {}
        if slot_id is not None:
            kwargs["slot_id"] = slot_id
        if not refresh_after_write:
            kwargs["refresh_after_write"] = False
        if not repair_order:
            kwargs["repair_order"] = False

        return await self.hass.async_add_executor_job(
            partial(
                self._proxy.command_to_favorite,
                activity_id,
                device_id,
                command_id,
                **kwargs,
            )
        )

    async def async_request_favorites_order(
        self,
        activity_id: int,
    ) -> list[tuple[int, int]] | None:
        """Fetch the current favorites ordering for *activity_id* from the hub."""
        return await self.hass.async_add_executor_job(
            self._proxy.request_favorites_order,
            activity_id,
        )

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

    async def async_refresh_activities_referencing_device(
        self, device_id: int, *, also: Iterable[int] = ()
    ) -> list[int]:
        """Re-warm every cached activity that references *device_id*.

        Rewriting a device's command records leaves the referencing
        activities' cached favorite label maps and macro views
        holding pre-edit values (they are resolved copies, not references
        into the device catalog). Callers that just rewrote a device's
        records use this to mirror the full-refresh behaviour for exactly
        the referencing activities. ``also`` adds activities scanned before
        the write (a delete may have cascaded their references away).
        Returns the activity ids re-warmed.
        """

        impacted = set(
            await self.hass.async_add_executor_job(
                self._proxy.activities_referencing_device, device_id
            )
        )
        impacted.update(int(act) for act in also)
        impacted = sorted(impacted)
        for act_id in impacted:
            try:
                await self._async_fetch_activity_commands(int(act_id))
            except Exception:  # noqa: BLE001 - re-warm is best-effort
                self._log.warning(
                    "[%s] failed re-warming activity 0x%02X referencing device 0x%02X",
                    self.entry_id,
                    int(act_id) & 0xFF,
                    int(device_id) & 0xFF,
                    exc_info=True,
                )
        return list(impacted)

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
            try:
                code = self._normalize_command_id(key)
            except ValueError as err:
                raise HomeAssistantError(
                    f"Command '{key}' is not a numeric command ID; "
                    "button names are only supported without 'device'"
                ) from err
            await self.async_send_raw_command(device, code)
            return

        # normal path: use current activity
        if self.current_activity is None:
            raise HomeAssistantError("No activity active")

        # string -> try to treat as ButtonName first
        if isinstance(key, str):
            btn = getattr(ButtonName, key.strip().upper(), None)
            if btn is not None:
                await self.async_send_button(btn)
                return
            # not a ButtonName -> treat as numeric
            try:
                code = self._normalize_command_id(key)
            except ValueError as err:
                raise HomeAssistantError(
                    f"Unknown command '{key}': not a button name or a numeric command ID"
                ) from err
            await self.async_send_raw_command(self.current_activity, code)
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
