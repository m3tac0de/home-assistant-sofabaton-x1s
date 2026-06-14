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
    ) -> dict[str, Any] | None:
        """Build a restore-oriented ``device_backup`` payload from the hub.

        Returns ``None`` when the device is unknown. Captures only what a
        restore needs (schema, command table, keymap, macros, IR blobs);
        runtime state is deliberately excluded.
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

        commands_ready = self._fetch_and_wait(
            f"commands:{dev_lo}",
            lambda: self.get_commands_for_entity(dev_lo, fetch_if_missing=True),
            lambda: dev_lo in self._commands_complete,
            timeout=wait_timeout,
        )
        final_buttons_ready = self._fetch_and_wait(
            f"buttons:{dev_lo}",
            lambda: self.get_buttons_for_entity(dev_lo, fetch_if_missing=True),
            lambda: dev_lo in self.state.buttons,
            timeout=wait_timeout,
        )
        if skip_macros:
            final_macros_ready = True
        else:
            final_macros_ready = self._fetch_and_wait(
                f"macros:{dev_lo}",
                lambda: self.get_macros_for_activity(dev_lo, fetch_if_missing=True),
                lambda: dev_lo in self._macros_complete,
                timeout=wait_timeout,
            )

        command_labels, _ = self.get_commands_for_entity(dev_lo, fetch_if_missing=False)
        button_codes, _ = self.get_buttons_for_entity(dev_lo, fetch_if_missing=False)

        normalized_device_class = normalize_device_class(
            device_meta.get("device_class", device_meta.get("device_class_code"))
        )
        raw_dump_class = _bx.uses_raw_command_dump(normalized_device_class)

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

        if skip_inputs:
            input_record: dict[str, Any] | None = None
            input_entries: list[Any] | None = []
        else:
            input_record = self.fetch_device_input_record(dev_lo, timeout=wait_timeout)
            input_entries = (
                list(input_record.get("entries") or [])
                if isinstance(input_record, dict)
                else []
            )
        key_sort_row = self.fetch_device_key_sort(dev_lo, timeout=wait_timeout)

        label_map = {
            int(command_id) & 0xFF: str(label)
            for command_id, label in dict(command_labels).items()
        }
        blob_by_command: dict[int, dict[str, Any]] = {}
        blobs_complete = False
        if isinstance(blob_source, dict):
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
        device_block = _bx.build_device_block(dev_lo, device_meta, device_config)

        complete = all(
            [
                bool(device_block),
                commands_ready,
                final_buttons_ready,
                final_macros_ready,
                input_entries is not None,
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
            input_record=input_record,
            complete=complete,
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

        activity_config = self._parse_config(
            activity_meta.get("raw_body"), hub_version=self.hub_version
        )

        self.clear_entity_cache(act_lo, True, True, True)

        final_buttons_ready = self._fetch_and_wait(
            f"buttons:{act_lo}",
            lambda: self.get_buttons_for_entity(act_lo, fetch_if_missing=True),
            lambda: act_lo in self.state.buttons,
            timeout=wait_timeout,
        )
        final_macros_ready = self._fetch_and_wait(
            f"macros:{act_lo}",
            lambda: self.get_macros_for_activity(act_lo, fetch_if_missing=True),
            lambda: act_lo in self._macros_complete,
            timeout=wait_timeout,
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

        activity_block = _bx.build_device_block(act_lo, activity_meta, activity_config)

        complete = all([bool(activity_block), final_buttons_ready, final_macros_ready])

        return _bx.assemble_activity_backup(
            activity_block=activity_block,
            button_rows=button_rows,
            favorite_rows=favorite_rows,
            macro_rows=macro_rows,
            referenced_source_device_ids=referenced,
            complete=complete,
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
    ) -> dict[str, Any]:
        """Build a ``hub_bundle`` covering the requested scope.

        ``device_ids=None`` backs up every device and activity; a list
        restricts to those devices (no activities). ``progress`` receives
        the same status dicts the integration surfaces. ``hub_info``
        overrides the bundle's informational ``hub`` block.
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
            payload = self.backup_device(dev_id, wait_timeout=wait_timeout)
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
        )

    # ------------------------------------------------------------------
    # snapshot helper
    # ------------------------------------------------------------------

    def _refresh_devices_snapshot(self, *, timeout: float) -> dict[int, dict[str, Any]]:
        self._refresh_catalog("devices", timeout=timeout)
        return dict(self.state.entities("device"))
