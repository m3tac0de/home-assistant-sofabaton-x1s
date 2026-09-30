"""Wifi Commands deploy for SofabatonHub (R6, CR-H1-13).

The deploy constants, the managed-brand parser, and WifiDeployMixin: the
sync of a configured Wifi Device to the hub (in place when it can, replace
otherwise), its progress reporting, the managed-device bookkeeping and the
X1 quick-access check that closes a sync.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from functools import partial
from typing import Any, Iterable

from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.exceptions import HomeAssistantError

from .const import (
    HUB_VERSION_X1,
    signal_commands,
    signal_devices,
    signal_command_sync,
)
from .lib.wifi_inplace_plan import (
    COMMAND_RECORD_STEP_KINDS,
    REFERENCED_RECORD_STEP_KINDS,
    baseline_snapshot_from_bundle,
    build_wifi_inplace_plan,
    classify_live_slots,
    derive_device_level_bindings,
    desired_snapshot_from_config,
)
from .lib.protocol_const import ButtonName
from .command_config import (
    COMMAND_BRAND_PREFIX,
    LEGACY_COMMAND_BRAND_PREFIX,
    async_get_command_config_store,
    DEFAULT_WIFI_DEVICE_KEY,
    count_configured_command_slots,
    is_wifi_events_device_key,
    normalize_power_command_id,
    normalize_wifi_transport,
    WIFI_TRANSPORT_HTTP,
    WIFI_TRANSPORT_MQTT,
)

# Same logger name as hub.py: log lines keep their source name.
_LOGGER = logging.getLogger(__name__.rsplit(".", 1)[0] + ".hub")

_HARD_BUTTON_TO_CODE: dict[str, int] = {"up": ButtonName.UP, "down": ButtonName.DOWN, "left": ButtonName.LEFT, "right": ButtonName.RIGHT, "ok": ButtonName.OK, "back": ButtonName.BACK, "home": ButtonName.HOME, "menu": ButtonName.MENU, "volup": ButtonName.VOL_UP, "voldn": ButtonName.VOL_DOWN, "mute": ButtonName.MUTE, "chup": ButtonName.CH_UP, "chdn": ButtonName.CH_DOWN, "guide": ButtonName.GUIDE, "dvr": ButtonName.DVR, "play": ButtonName.PLAY, "exit": ButtonName.EXIT, "rew": ButtonName.REW, "pause": ButtonName.PAUSE, "fwd": ButtonName.FWD, "red": ButtonName.RED, "green": ButtonName.GREEN, "yellow": ButtonName.YELLOW, "blue": ButtonName.BLUE, "a": ButtonName.A, "b": ButtonName.B, "c": ButtonName.C}
# Default (user-device) slot count. Per-record slot counts ride the store
# payload's `slot_count` (the Wifi Events record uses 25); the long-record
# id offset always equals the record's slot count (long = short + N,
# live-validated at N=6/10/50 — docs/internal/wifi-events-plan.md §11).
_WIFI_COMMAND_SLOT_COUNT = 10


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


@dataclass
class _DeployRun:
    """What one Wifi Commands deploy carries between its phases."""

    commands: list[Any]
    command_payload: dict[str, Any]
    normalized_device_key: str
    slot_count: int
    configured_slots: int
    commands_hash: str
    deployed_commands_hash: str
    deployed_device_id: Any
    brand_name: str
    selected_transport: str
    total_steps: int
    store: Any
    request_port: int
    device_name: str
    referenced_activity_ids: set[int] = field(default_factory=set)
    managed: list[Any] = field(default_factory=list)
    activity_input_command_ids: dict[int, int] = field(default_factory=dict)
    wifi_device_id: int = 0
    activity_ids: set[int] = field(default_factory=set)
    add_results: dict[int, bool] = field(default_factory=dict)
    delete_confirmed_acts: set[int] = field(default_factory=set)
    activities_with_favorites: set[int] = field(default_factory=set)
    failed_writes: list[str] = field(default_factory=list)


class WifiDeployMixin:
    """Wifi Commands deploy for SofabatonHub (R6, CR-H1-13)."""

    @property
    def is_sync_in_progress(self) -> bool:
        return self._command_sync_lock.locked()

    def is_long_running_task_active(self) -> bool:
        """True while a backup, restore, sync or other hub work is running.

        Wired into the transport bridge as the CALL_ME busy gate so proxy
        clients are ignored without tearing down mDNS/broadcast discovery.
        """

        if self.hub_work_active:
            return True
        try:
            from .operations import _backup_operation_registry  # local import to avoid cycle
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
            run = _DeployRun(
                commands=commands,
                command_payload=command_payload,
                normalized_device_key=normalized_device_key,
                slot_count=slot_count,
                configured_slots=configured_slots,
                commands_hash=commands_hash,
                deployed_commands_hash=deployed_commands_hash,
                deployed_device_id=deployed_device_id,
                brand_name=brand_name,
                selected_transport=selected_transport,
                total_steps=total_steps,
                store=store,
                request_port=request_port,
                device_name=device_name,
            )

            try:
                await self._deploy_preflight(run)
                if run.configured_slots == 0:
                    return await self._deploy_teardown_zero_slots(run)

                # ── In-place re-sync: with exactly one managed device
                # matched, edit it in place so its device id (and everything
                # the user attached to it in the app) survives. Declines —
                # port change, drift, planner fallback, no snapshot — fall
                # through to the replace path below. A failure AFTER writes
                # started raises instead (never replace on top of a
                # half-applied edit). docs/internal/wifi-inplace-deploy-plan.md
                if len(run.managed) == 1:
                    inplace_result = await self._async_try_inplace_command_sync(
                        managed_device_id=run.managed[0][0],
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

                await self._deploy_replace_create_and_verify(run)
                await self._deploy_attach(run)
                return await self._deploy_epilogue(run)
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

    async def _deploy_preflight(self, run: _DeployRun) -> None:
        """Step 1: the listener, the activity check against a fresh hub read,
        and the managed device(s) this deploy replaces or edits."""

        commands = run.commands
        command_payload = run.command_payload
        normalized_device_key = run.normalized_device_key
        slot_count = run.slot_count
        configured_slots = run.configured_slots
        commands_hash = run.commands_hash
        deployed_commands_hash = run.deployed_commands_hash
        deployed_device_id = run.deployed_device_id
        selected_transport = run.selected_transport
        store = run.store
        request_port = run.request_port

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

        run.referenced_activity_ids = referenced_activity_ids
        run.managed = managed


    async def _deploy_teardown_zero_slots(self, run: _DeployRun) -> dict[str, Any]:
        """No configured slots: delete the managed device and forget the deploy."""

        normalized_device_key = run.normalized_device_key
        managed = run.managed
        store = run.store
        total_steps = run.total_steps
        commands_hash = run.commands_hash

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


    async def _deploy_replace_create_and_verify(self, run: _DeployRun) -> None:
        """Step 2 (replace path): create the new device and, when it replaces
        one, verify its command table before anything else is touched."""

        commands = run.commands
        command_payload = run.command_payload
        normalized_device_key = run.normalized_device_key
        slot_count = run.slot_count
        brand_name = run.brand_name
        selected_transport = run.selected_transport
        device_name = run.device_name
        request_port = run.request_port
        managed = run.managed

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

        run.activity_input_command_ids = activity_input_command_ids
        run.wifi_device_id = wifi_device_id


    async def _deploy_attach(self, run: _DeployRun) -> None:
        """Steps 3-6: join the activities, delete the old device, favorites and
        their order, activity and device-page bindings."""

        commands = run.commands
        normalized_device_key = run.normalized_device_key
        slot_count = run.slot_count
        referenced_activity_ids = run.referenced_activity_ids
        managed = run.managed
        wifi_device_id = run.wifi_device_id
        activity_input_command_ids = run.activity_input_command_ids

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

        run.activity_ids = activity_ids
        run.add_results = add_results
        run.delete_confirmed_acts = delete_confirmed_acts
        run.activities_with_favorites = activities_with_favorites
        run.failed_writes = failed_writes


    async def _deploy_epilogue(self, run: _DeployRun) -> dict[str, Any]:
        """Steps 7-8: re-warm, persist, resync the remote, save the deploy."""

        commands = run.commands
        normalized_device_key = run.normalized_device_key
        slot_count = run.slot_count
        commands_hash = run.commands_hash
        selected_transport = run.selected_transport
        total_steps = run.total_steps
        store = run.store
        request_port = run.request_port
        managed = run.managed
        wifi_device_id = run.wifi_device_id
        activity_ids = run.activity_ids
        add_results = run.add_results
        delete_confirmed_acts = run.delete_confirmed_acts
        activities_with_favorites = run.activities_with_favorites
        failed_writes = run.failed_writes

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
