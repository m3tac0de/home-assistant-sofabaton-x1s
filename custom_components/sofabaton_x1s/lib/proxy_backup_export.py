# proxy_backup_export.py — synchronous backup-export orchestration.
#
# BackupExportMixin gives X1Proxy the export half of backup/restore: it
# refreshes catalogs, fetches per-entity detail (commands, buttons,
# macros, blobs, inputs, key-sort) using the proxy's own blocking
# primitives, then hands the gathered state to the pure assemblers in
# backup_export.py. It is the mirror image of RestoreMixin.
#
# All waits poll the proxy's OWN completion state (``_commands_complete``,
# ``_macros_complete``, ``_devices_catalog_ready``) and/or the proxy's
# burst-end signal — never any Home Assistant bookkeeping — so the same
# orchestration runs in-tree and standalone. The integration calls these
# sync methods through an executor, exactly as it calls restore.
from __future__ import annotations

import threading
import time
from copy import deepcopy
from typing import Any, Callable, Optional

from . import backup_export as _bx
from .devices import DeviceConfig, parse_device_record
from .protocol_const import DEVICE_CLASS_IR, normalize_device_class


class _SyncBurstWaiter:
    """Hands out one-shot Events keyed by burst key (e.g. ``commands:7``).

    One persistent dispatcher is registered per burst-kind on first use,
    so repeated waits don't leak listeners onto the scheduler.
    """

    def __init__(self, proxy: "BackupExportMixin") -> None:
        self._proxy = proxy
        self._waiters: dict[str, list[threading.Event]] = {}
        self._kinds: set[str] = set()
        self._lock = threading.Lock()

    def arm(self, key: str) -> threading.Event:
        kind = key.split(":", 1)[0]
        event = threading.Event()
        with self._lock:
            self._waiters.setdefault(key, []).append(event)
            new_kind = kind not in self._kinds
            if new_kind:
                self._kinds.add(kind)
        if new_kind:
            # Registered outside the lock; on_burst_end is itself locked.
            self._proxy.on_burst_end(kind, self._dispatch)
        return event

    def _dispatch(self, full_key: str) -> None:
        with self._lock:
            events = self._waiters.pop(full_key, [])
        for event in events:
            event.set()


class BackupExportMixin:
    """Synchronous backup-export operations on :class:`X1Proxy`."""

    # ------------------------------------------------------------------
    # sync fetch/wait plumbing
    # ------------------------------------------------------------------

    @property
    def _backup_burst_waiter(self) -> _SyncBurstWaiter:
        waiter = getattr(self, "_backup_burst_waiter_obj", None)
        if waiter is None:
            waiter = _SyncBurstWaiter(self)
            self._backup_burst_waiter_obj = waiter
        return waiter

    def _fetch_and_wait(
        self,
        burst_key: str,
        kick: Callable[[], Any],
        ready_check: Callable[[], bool],
        *,
        timeout: float,
    ) -> bool:
        """Kick a fetch and block until its burst lands (or ``timeout``).

        Returns True when ``ready_check`` passes or the matching burst
        fires; arms the burst waiter before kicking so the signal can't
        be missed.
        """

        if ready_check():
            return True
        # Backup can only fetch while the proxy owns the hub (no app
        # client connected). If it can't issue, there's nothing to wait
        # for: report whatever is already cached rather than blocking.
        if not self.can_issue_commands():
            return ready_check()
        event = self._backup_burst_waiter.arm(burst_key)
        kick()
        if ready_check():
            return True
        deadline = time.monotonic() + timeout
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                return ready_check()
            if event.wait(min(remaining, 0.2)) or ready_check():
                return True

    def _refresh_catalog(self, kind: str, *, timeout: float) -> None:
        """Request a fresh devices/activities burst and wait for it.

        No-op when the proxy can't issue commands (no hub to refresh
        from): callers fall back to the currently-cached catalog.
        """

        if not self.can_issue_commands():
            return
        event = self._backup_burst_waiter.arm(kind)
        if kind == "devices":
            self.request_devices()
        else:
            self.request_activities()
        event.wait(timeout)

    def _resolve_device_class(self, device_id: int) -> str | None:
        dev_lo = device_id & 0xFF
        for source in (self.state.entities("device"), self.state.ip_devices):
            if not isinstance(source, dict):
                continue
            cached = source.get(dev_lo)
            if isinstance(cached, dict):
                device_class = str(cached.get("device_class") or "").strip()
                if device_class:
                    return device_class
        return None

    @staticmethod
    def _parse_config(raw_body: Any, *, hub_version: str) -> Optional[DeviceConfig]:
        if isinstance(raw_body, (bytes, bytearray)) and raw_body:
            try:
                return parse_device_record(bytes(raw_body), hub_version=hub_version)
            except ValueError:
                return None
        return None

    # ------------------------------------------------------------------
    # device backup
    # ------------------------------------------------------------------

    def backup_device(
        self,
        device_id: int,
        *,
        wait_timeout: float = 10.0,
        include_blobs: bool = True,
    ) -> dict[str, Any] | None:
        """Build a restore-oriented ``device_backup`` payload from the hub.

        Returns ``None`` when the device is unknown. Captures only what a
        restore needs (schema, command table, keymap, macros, IR blobs);
        runtime state is deliberately excluded.

        ``include_blobs=False`` skips the per-command IR blob dump — the
        dominant cost of a whole-hub read. The result keeps command *labels*,
        key bindings, macros, input records and idle behaviour (everything the
        live activity editor needs) but is **not** restorable (no command
        payloads). Used by the structural "refresh entire hub cache" path.
        """

        dev_lo = device_id & 0xFF
        device_snapshot = self._refresh_devices_snapshot(timeout=max(wait_timeout, 5.0))
        device_meta = dict(device_snapshot.get(dev_lo) or {})
        if not device_meta:
            return None

        device_config = self._parse_config(
            device_meta.get("raw_body"), hub_version=self.hub_version
        )
        skip_macros = device_config is not None and not device_config.is_power_configured
        skip_inputs = device_config is not None and not device_config.is_input_configured

        self.clear_entity_cache(dev_lo, True, True, True)

        self._fetch_and_wait(
            f"commands:{dev_lo}",
            lambda: self.get_commands_for_entity(dev_lo, fetch_if_missing=True),
            lambda: dev_lo in self._commands_complete,
            timeout=wait_timeout,
        )
        self._fetch_and_wait(
            f"buttons:{dev_lo}",
            lambda: self.get_buttons_for_entity(dev_lo, fetch_if_missing=True),
            lambda: dev_lo in self.state.buttons,
            timeout=wait_timeout,
        )
        if not skip_macros:
            self._fetch_and_wait(
                f"macros:{dev_lo}",
                lambda: self.get_macros_for_activity(dev_lo, fetch_if_missing=True),
                lambda: dev_lo in self._macros_complete,
                timeout=wait_timeout,
            )

        normalized_device_class = normalize_device_class(
            device_meta.get("device_class", device_meta.get("device_class_code"))
        )
        raw_dump_class = _bx.uses_raw_command_dump(normalized_device_class)

        if include_blobs:
            dump = self.request_ir_command_dump(
                dev_lo, command_id=None, timeout=max(wait_timeout, 15.0)
            )
            if raw_dump_class:
                blob_source = dump
            else:
                blob_source = _bx.normalize_dump_to_blobs(
                    dump,
                    resolve_device_class=self._resolve_device_class,
                    fallback_device_id=dev_lo,
                )
        else:
            # Structural capture: skip the per-command IR dump entirely.
            blob_source = None

        if skip_inputs:
            self.state.device_input_records.pop(dev_lo, None)
        else:
            input_record = self.fetch_device_input_record(dev_lo, timeout=wait_timeout)
            if isinstance(input_record, dict):
                self.state.device_input_records[dev_lo] = input_record
            else:
                self.state.device_input_records.pop(dev_lo, None)
        # The family-0x63 burst path already stores into
        # ``state.device_key_sorts``; the explicit write also captures the
        # STATUS_ACK "no key-sort configured" empty row so a later
        # from-state assembly sees the same value this capture did.
        key_sort_row = self.fetch_device_key_sort(dev_lo, timeout=wait_timeout)
        if key_sort_row is not None:
            self.state.device_key_sorts[dev_lo] = dict(key_sort_row)

        # Idle / automatic-power behavior lives in its own hub query
        # (OP_IDLE_BEHAVIOR, 0x0242), not the device record, so it must be
        # fetched explicitly. The reply handler stores it on the device's
        # catalog entry, which is where the assembler reads it back.
        self.fetch_idle_behavior(dev_lo, timeout=wait_timeout)

        self.state.detail_fetched_at["device"][dev_lo] = _bx.now_iso()

        return self.assemble_device_backup_from_state(
            dev_lo, blob_source=blob_source, include_blobs=include_blobs
        )

    def assemble_device_backup_from_state(
        self,
        device_id: int,
        *,
        blob_source: dict[str, Any] | None = None,
        include_blobs: bool = False,
    ) -> dict[str, Any] | None:
        """Assemble a ``device_backup`` purely from cached proxy state.

        No hub I/O happens here: the payload is a projection of whatever the
        last fetch (live capture or persistent-cache import) left in
        ``self.state``. Without ``blob_source`` the result is a structural
        payload; ``backup_device`` threads the freshly-dumped blobs through
        for the full-backup shape. Returns ``None`` when the device is not
        in the catalog.
        """

        dev_lo = device_id & 0xFF
        device_meta = dict(self.state.entities("device").get(dev_lo) or {})
        if not device_meta:
            return None

        device_config = self._parse_config(
            device_meta.get("raw_body"), hub_version=self.hub_version
        )
        skip_macros = device_config is not None and not device_config.is_power_configured
        skip_inputs = device_config is not None and not device_config.is_input_configured

        command_labels, _ = self.get_commands_for_entity(dev_lo, fetch_if_missing=False)
        button_codes, _ = self.get_buttons_for_entity(dev_lo, fetch_if_missing=False)

        normalized_device_class = normalize_device_class(
            device_meta.get("device_class", device_meta.get("device_class_code"))
        )
        raw_dump_class = _bx.uses_raw_command_dump(normalized_device_class)

        label_map = {
            int(command_id) & 0xFF: str(label)
            for command_id, label in dict(command_labels).items()
        }
        blob_by_command: dict[int, dict[str, Any]] = {}
        # A structural capture intentionally has no blobs, so it counts as
        # "complete" for the blobs dimension (nothing was meant to be fetched).
        blobs_complete = not include_blobs
        if include_blobs and isinstance(blob_source, dict):
            blobs_complete = bool(blob_source.get("complete"))
            for command in blob_source.get("commands", []):
                if not isinstance(command, dict):
                    continue
                command_id = int(command.get("command_id", 0)) & 0xFF
                if command_id:
                    blob_by_command[command_id] = dict(command)

        command_metadata = (
            self.state.command_metadata.get(dev_lo, {})
            if hasattr(self.state, "command_metadata")
            else {}
        )

        command_rows = _bx.build_device_command_rows(
            label_map=label_map,
            blob_by_command=blob_by_command,
            normalized_device_class=normalized_device_class,
            command_metadata=command_metadata,
            raw_dump_class=raw_dump_class,
        )
        button_rows = _bx.build_device_button_rows(
            button_codes=list(button_codes),
            button_details=self.state.button_details.get(dev_lo, {}),
            label_map=label_map,
        )
        macro_rows = _bx.build_device_macro_rows(self.get_cached_macro_records(dev_lo))

        input_record = (
            None if skip_inputs else self.state.device_input_records.get(dev_lo)
        )
        key_sort_row = self.state.device_key_sorts.get(dev_lo)

        idle_value = device_meta.get("idle_behavior")
        idle_behavior = int(idle_value) & 0xFF if isinstance(idle_value, int) else None

        device_block = _bx.build_device_block(
            dev_lo, device_meta, device_config, idle_behavior=idle_behavior
        )

        # Readiness mirrors the predicates the fetch phase waits on, so a
        # payload assembled right after ``backup_device`` reports the same
        # completeness the inline assembly used to.
        complete = all(
            [
                bool(device_block),
                dev_lo in self._commands_complete,
                dev_lo in self.state.buttons,
                skip_macros or dev_lo in self._macros_complete,
                blobs_complete,
                key_sort_row is not None,
            ]
        )

        return _bx.assemble_device_backup(
            device_block=device_block,
            command_rows=command_rows,
            button_rows=button_rows,
            macro_rows=macro_rows,
            key_sort_row=key_sort_row,
            input_record=deepcopy(input_record) if isinstance(input_record, dict) else None,
            complete=complete,
            payload_profile=(
                _bx.PAYLOAD_PROFILE_FULL if include_blobs else _bx.PAYLOAD_PROFILE_STRUCTURAL
            ),
            fetched_at=self.state.detail_fetched_at["device"].get(dev_lo),
        )

    # ------------------------------------------------------------------
    # activity backup
    # ------------------------------------------------------------------

    def backup_activity(
        self,
        activity_id: int,
        *,
        wait_timeout: float = 10.0,
    ) -> dict[str, Any] | None:
        """Build a restore-oriented ``activity_backup`` payload from the hub."""

        act_lo = activity_id & 0xFF
        self._refresh_catalog("activities", timeout=max(wait_timeout, 5.0))

        activity_meta = dict(self.state.entities("activity").get(act_lo) or {})
        if not activity_meta:
            return None

        self.clear_entity_cache(act_lo, True, True, True)

        self._fetch_and_wait(
            f"buttons:{act_lo}",
            lambda: self.get_buttons_for_entity(act_lo, fetch_if_missing=True),
            lambda: act_lo in self.state.buttons,
            timeout=wait_timeout,
        )
        self._fetch_and_wait(
            f"macros:{act_lo}",
            lambda: self.get_macros_for_activity(act_lo, fetch_if_missing=True),
            lambda: act_lo in self._macros_complete,
            timeout=wait_timeout,
        )

        # Quick-access display order (family-0x61 slot table). Best-effort: a
        # reorder rewrites this table without renumbering button_ids, so it is
        # the only source for the shortcut display order. A failed/absent read
        # leaves the bundle without ``favorites_order`` and consumers fall back
        # to button_id order. Runs after the buttons/macros bursts have settled
        # so the 0x0162 request does not collide with an in-flight mapping.
        try:
            self.request_favorites_order(act_lo)
        except Exception:  # noqa: BLE001 - ordering is advisory, never fatal
            self._log.debug("[FAV_ORDER] backup_activity order read failed act=0x%02X", act_lo)

        self.state.detail_fetched_at["activity"][act_lo] = _bx.now_iso()

        return self.assemble_activity_backup_from_state(act_lo)

    def assemble_activity_backup_from_state(
        self, activity_id: int
    ) -> dict[str, Any] | None:
        """Assemble an ``activity_backup`` purely from cached proxy state.

        The activity counterpart of
        :meth:`assemble_device_backup_from_state` -- no hub I/O, ``None``
        when the activity is not in the catalog. Activities never carry
        command payloads, so the same payload serves both profiles.
        """

        act_lo = activity_id & 0xFF
        activity_meta = dict(self.state.entities("activity").get(act_lo) or {})
        if not activity_meta:
            return None

        activity_config = self._parse_config(
            activity_meta.get("raw_body"), hub_version=self.hub_version
        )

        button_codes, _ = self.get_buttons_for_entity(act_lo, fetch_if_missing=False)

        button_rows, referenced = _bx.build_activity_button_rows(
            button_codes=list(button_codes),
            button_details=self.state.button_details.get(act_lo, {}),
        )
        macro_rows, macro_refs = _bx.build_activity_macro_rows(
            self.get_cached_macro_records(act_lo)
        )
        referenced |= macro_refs
        favorite_rows, fav_refs = _bx.build_activity_favorite_rows(
            self.state.get_activity_favorite_slots(act_lo)
        )
        referenced |= fav_refs

        # Quick-access display order (hub ids sorted by their family-0x61 slot).
        # Populated by a prior request_favorites_order(); absent when never
        # fetched, in which case consumers fall back to button_id order.
        order_pairs = self.state.activity_favorites_order.get(act_lo) or []
        favorites_order = [
            int(fav_id) & 0xFF
            for fav_id, _slot in sorted(order_pairs, key=lambda pair: int(pair[1]))
        ]

        activity_block = _bx.build_device_block(act_lo, activity_meta, activity_config)

        complete = all(
            [
                bool(activity_block),
                act_lo in self.state.buttons,
                act_lo in self._macros_complete,
            ]
        )

        return _bx.assemble_activity_backup(
            activity_block=activity_block,
            button_rows=button_rows,
            favorite_rows=favorite_rows,
            macro_rows=macro_rows,
            referenced_source_device_ids=referenced,
            complete=complete,
            fetched_at=self.state.detail_fetched_at["activity"].get(act_lo),
            favorites_order=favorites_order,
        )

    # ------------------------------------------------------------------
    # hub bundle
    # ------------------------------------------------------------------

    def backup_hub_bundle(
        self,
        *,
        device_ids: list[int] | None = None,
        hub_info: dict[str, Any] | None = None,
        wait_timeout: float = 10.0,
        progress: Callable[..., None] | None = None,
        include_blobs: bool = True,
    ) -> dict[str, Any]:
        """Build a ``hub_bundle`` covering the requested scope.

        ``device_ids=None`` backs up every device and activity; a list
        restricts to those devices (no activities). ``progress`` receives
        the same status dicts the integration surfaces. ``hub_info``
        overrides the bundle's informational ``hub`` block.

        ``include_blobs=False`` produces a **structural** bundle (no command
        IR payloads) — dramatically faster because it skips the per-command
        blob dump. Same `hub_bundle` shape; suitable for the live activity
        editor (which never reads blobs) but not for restore.
        """

        def _progress(**payload: Any) -> None:
            if callable(progress):
                progress(**payload)

        if device_ids is None:
            _progress(
                status="running",
                phase="preparing",
                message="Refreshing devices and activities from the hub…",
                completed_steps=0,
                total_steps=0,
            )
            self._refresh_catalog("devices", timeout=max(wait_timeout, 5.0))
            self._refresh_catalog("activities", timeout=max(wait_timeout, 5.0))
            selected_device_ids = sorted(self.get_known_device_ids())
            selected_activity_ids = sorted(self.get_known_activity_ids())
        else:
            normalized: list[int] = []
            for raw in device_ids:
                value = int(raw)
                if value < 1 or value > 255:
                    raise ValueError(
                        f"backup_hub_bundle device_ids entries must be in 1..255 (got {raw!r})"
                    )
                if value not in normalized:
                    normalized.append(value)
            if not normalized:
                raise ValueError(
                    "backup_hub_bundle device_ids must contain at least one device id "
                    "or be omitted entirely (to back up the whole hub)"
                )
            selected_device_ids = normalized
            selected_activity_ids = []

        total_steps = len(selected_device_ids) + len(selected_activity_ids) + 1
        completed_steps = 0

        device_payloads: list[dict[str, Any]] = []
        for dev_id in selected_device_ids:
            _progress(
                status="running",
                phase="device",
                message=f"Backing up device {dev_id}…",
                completed_steps=completed_steps,
                total_steps=total_steps,
                current_device_id=dev_id,
            )
            payload = self.backup_device(dev_id, wait_timeout=wait_timeout, include_blobs=include_blobs)
            if payload is None:
                raise ValueError(f"Hub did not return device data for device {dev_id}")
            device_payloads.append(payload)
            completed_steps += 1
            _progress(
                status="running",
                phase="device",
                message=f"Backed up device {dev_id}.",
                completed_steps=completed_steps,
                total_steps=total_steps,
                current_device_id=dev_id,
            )

        activity_payloads: list[dict[str, Any]] = []
        for act_id in selected_activity_ids:
            _progress(
                status="running",
                phase="activity",
                message=f"Backing up activity {act_id}…",
                completed_steps=completed_steps,
                total_steps=total_steps,
                current_activity_id=act_id,
            )
            payload = self.backup_activity(act_id, wait_timeout=wait_timeout)
            if payload is None:
                raise ValueError(f"Hub did not return activity data for activity {act_id}")
            activity_payloads.append(payload)
            completed_steps += 1
            _progress(
                status="running",
                phase="activity",
                message=f"Backed up activity {act_id}.",
                completed_steps=completed_steps,
                total_steps=total_steps,
                current_activity_id=act_id,
            )

        completed_steps += 1
        _progress(
            status="running",
            phase="finalizing",
            message="Finalizing backup bundle…",
            completed_steps=completed_steps,
            total_steps=total_steps,
        )

        resolved_hub_info = hub_info if hub_info is not None else {
            "entry_id": self.proxy_id,
            "name": self.get_banner_info().get("name") or self.mdns_instance,
            "version": self.hub_version,
        }

        return _bx.assemble_hub_bundle(
            device_payloads=device_payloads,
            activity_payloads=activity_payloads,
            hub_info=resolved_hub_info,
            total_steps=total_steps,
            payload_profile=(
                _bx.PAYLOAD_PROFILE_FULL if include_blobs else _bx.PAYLOAD_PROFILE_STRUCTURAL
            ),
        )

    def assemble_hub_bundle_from_state(
        self,
        *,
        hub_info: dict[str, Any] | None = None,
    ) -> dict[str, Any] | None:
        """Assemble a structural ``hub_bundle`` purely from cached proxy state.

        This is the projection the live activity editor reads: every device
        and activity currently in the catalog, assembled without any hub
        I/O or blob dumps, stamped ``payload_profile == "structural"``.

        Returns ``None`` when no backup-grade structural fetch has ever
        populated the state (fresh start with an empty/summary-only cache):
        assembling a bundle of bare catalog names would present empty
        keymaps as hub truth, and a sync diffed against that baseline could
        issue destructive writes.
        """

        fetched = self.state.detail_fetched_at
        if not fetched.get("device") and not fetched.get("activity"):
            return None

        device_payloads: list[dict[str, Any]] = []
        for dev_id in sorted(self.get_known_device_ids()):
            payload = self.assemble_device_backup_from_state(dev_id)
            if payload is not None:
                device_payloads.append(payload)

        activity_payloads: list[dict[str, Any]] = []
        for act_id in sorted(self.get_known_activity_ids()):
            payload = self.assemble_activity_backup_from_state(act_id)
            if payload is not None:
                activity_payloads.append(payload)

        resolved_hub_info = hub_info if hub_info is not None else {
            "entry_id": self.proxy_id,
            "name": self.get_banner_info().get("name") or self.mdns_instance,
            "version": self.hub_version,
        }

        return _bx.assemble_hub_bundle(
            device_payloads=device_payloads,
            activity_payloads=activity_payloads,
            hub_info=resolved_hub_info,
            payload_profile=_bx.PAYLOAD_PROFILE_STRUCTURAL,
        )

    # ------------------------------------------------------------------
    # snapshot helper
    # ------------------------------------------------------------------

    def _refresh_devices_snapshot(self, *, timeout: float) -> dict[int, dict[str, Any]]:
        self._refresh_catalog("devices", timeout=timeout)
        return dict(self.state.entities("device"))
