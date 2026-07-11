"""Live activity sync executor (Phase L4).

Mixed into :class:`X1Proxy`. Walks the plan produced by
``activity_sync.build_activity_sync_plan`` and issues each step as a
targeted in-place write against the existing activity id, ack-gated and
serial exactly like the restore path. The plan builder is pure; this
module is where the wire writes happen.

Orchestration (ordering, ack-gating, failure-stop, progress, stale
pre-flight) is unit-tested against a fake proxy that overrides the driver
methods. The individual wire builders it calls are the same drivers restore
and the vendor-app-derived activity ops already exercise in production.
End-to-end wire correctness of the engine's own emissions is bench-validated
on live X1 + X1S hubs for both scopes — see live-hub-testing.md
"Validated: device-edit write flows" and "Validated: activity-edit engine
emissions".
"""

from __future__ import annotations

import json
from typing import Any, Callable, Mapping

from .activity_sync import ACTIVITY_ID_BASE, SyncStep, build_activity_sync_plan, build_device_sync_plan
from .device_create import (
    build_macro_step,
    build_macro_step_record,
    run_create_sequence,
    synthesize_command_code,
)
from .macros import MacroKeyEntry, build_macro_save_payload
from .protocol_const import FAMILY_FAV_DELETE

_POWER_MACRO_BUTTON_IDS = frozenset({198, 199})
_ACTIVITY_SYNC_DELETE_ACK_TIMEOUT = 12.0

def _canonical(value: Any) -> str:
    return json.dumps(value, sort_keys=True, default=str)


def _int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _optional_int(value: Any) -> int | None:
    normalized = _int(value)
    return normalized & 0xFF if normalized else None


def _favorite_signature(row: Mapping[str, Any]) -> dict[str, int]:
    return {
        "device_id": _int(row.get("device_id")) & 0xFF,
        "command_id": _int(row.get("command_id")) & 0xFF,
    }


def _binding_signature(row: Mapping[str, Any]) -> dict[str, int | None]:
    return {
        "button_id": _int(row.get("button_id")) & 0xFF,
        "device_id": _int(row.get("device_id")) & 0xFF,
        "command_id": _int(row.get("command_id")) & 0xFF,
        "long_press_device_id": _optional_int(row.get("long_press_device_id")),
        "long_press_command_id": _optional_int(row.get("long_press_command_id")),
    }


def _macro_signature(row: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "button_id": _int(row.get("button_id")) & 0xFF,
        "steps": [
            {
                "device_id": _int(step.get("device_id")) & 0xFF,
                "command_id": _int(step.get("command_id")) & 0xFF,
                "button_code": _int(step.get("button_code")) & 0xFFFFFFFFFFFF,
                "duration": _int(step.get("duration")) & 0xFF,
                "delay": _int(step.get("delay")) & 0xFF,
            }
            for step in row.get("steps") or []
            if isinstance(step, Mapping)
        ],
    }


def _rows_signature(
    rows: Any,
    row_fn: Callable[[Mapping[str, Any]], dict[str, Any]],
    key_fn: Callable[[dict[str, Any]], Any],
) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    for row in rows or []:
        if isinstance(row, Mapping):
            normalized.append(row_fn(row))
    return sorted(normalized, key=key_fn)


def _device_block_signature(device: Mapping[str, Any] | None) -> str:
    """Stable signature of the mutable parts of a device block (the
    device-scope counterpart of :func:`_activity_block_signature`)."""
    if not device:
        return ""
    return _canonical(
        {
            "macros": _rows_signature(
                device.get("macros"),
                _macro_signature,
                lambda item: _int(item.get("button_id")),
            ),
            "button_bindings": _rows_signature(
                device.get("button_bindings"),
                _binding_signature,
                lambda item: _int(item.get("button_id")),
            ),
        }
    )


def _activity_block_signature(activity: Mapping[str, Any] | None) -> str:
    """Stable signature of the mutable parts of an activity block.

    The live editor opens from the persisted structural cache, while this
    pre-flight re-exports the activity. Compare only stable wire targets so
    cache/export representation drift does not masquerade as a hub edit;
    macro step order remains significant.
    """
    if not activity:
        return ""
    return _canonical(
        {
            "favorite_slots": _rows_signature(
                activity.get("favorite_slots"),
                _favorite_signature,
                lambda item: (_int(item.get("device_id")), _int(item.get("command_id"))),
            ),
            "macros": _rows_signature(
                activity.get("macros"),
                _macro_signature,
                lambda item: _int(item.get("button_id")),
            ),
            "button_bindings": _rows_signature(
                activity.get("button_bindings"),
                _binding_signature,
                lambda item: _int(item.get("button_id")),
            ),
        }
    )


class ActivitySyncMixin:
    """`sync_activity` + per-step dispatch. Mixed into X1Proxy."""

    def sync_activity(
        self,
        *,
        baseline: Mapping[str, Any],
        edited: Mapping[str, Any],
        activity_id: int,
        progress_callback: Callable[..., None] | None = None,
    ) -> dict[str, Any]:
        activity_id = int(activity_id) & 0xFF

        def _progress(**payload: Any) -> None:
            if callable(progress_callback):
                progress_callback(**payload)

        if not self.can_issue_commands():
            return {"status": "failed", "failed_at": "unavailable",
                    "message": "The hub is not reachable (the Sofabaton app may be connected)."}

        # Build the plan first so a scope/plan error fails before any write.
        try:
            plan = build_activity_sync_plan(baseline, edited, activity_id)
        except ValueError as err:
            return {"status": "failed", "failed_at": "plan", "message": str(err)}

        if not plan:
            return {"status": "success", "completed_steps": 0, "total_steps": 0, "counters": {}}

        # Stale pre-flight (§4.5): re-read the activity block and compare with
        # the baseline the session captured. A mismatch means the hub changed
        # (e.g. a vendor-app edit through the proxy) — fail fast, don't write.
        _progress(phase="stale_check", message="Checking the activity hasn't changed…",
                  completed_steps=0, total_steps=len(plan), current_activity_id=activity_id)
        if self._activity_sync_is_stale(baseline, activity_id):
            return {"status": "failed", "failed_at": "stale_check",
                    "message": "This activity changed on the hub after you loaded it."}

        total = len(plan)
        counters: dict[str, int] = {}
        for index, step in enumerate(plan):
            _progress(phase="writing", message=step.label, completed_steps=index,
                      total_steps=total, current_activity_id=activity_id)
            ok = self._dispatch_activity_sync_step(step)
            if not ok:
                target = "" if step.target_device_id is None else f" (device {step.target_device_id})"
                return {"status": "failed", "failed_at": f"{step.kind}{target}",
                        "message": f"The hub rejected: {step.label}", "completed_steps": index}
            counters[step.kind] = counters.get(step.kind, 0) + 1

        _progress(phase="completed", message="Synced to hub.", completed_steps=total,
                  total_steps=total, current_activity_id=activity_id)
        # Refresh internal mapping so the cache/remote reflect the new state.
        self.request_activity_mapping(activity_id)
        return {"status": "success", "completed_steps": total, "total_steps": total, "counters": counters}

    def sync_device(
        self,
        *,
        baseline: Mapping[str, Any],
        edited: Mapping[str, Any],
        device_id: int,
        progress_callback: Callable[..., None] | None = None,
    ) -> dict[str, Any]:
        """Device-scoped counterpart of :meth:`sync_activity`.

        Same orchestration (plan → stale pre-flight → serial ack-gated
        writes); the step handlers are shared, addressing the keymap
        primitives with the device id as the entity id.
        """
        device_id = int(device_id) & 0xFF

        def _progress(**payload: Any) -> None:
            if callable(progress_callback):
                progress_callback(**payload)

        if not self.can_issue_commands():
            return {"status": "failed", "failed_at": "unavailable",
                    "message": "The hub is not reachable (the Sofabaton app may be connected)."}

        try:
            plan = build_device_sync_plan(baseline, edited, device_id)
        except ValueError as err:
            return {"status": "failed", "failed_at": "plan", "message": str(err)}

        if not plan:
            return {"status": "success", "completed_steps": 0, "total_steps": 0, "counters": {}}

        _progress(phase="stale_check", message="Checking the device hasn't changed…",
                  completed_steps=0, total_steps=len(plan), current_device_id=device_id)
        if self._device_sync_is_stale(baseline, device_id):
            return {"status": "failed", "failed_at": "stale_check",
                    "message": "This device changed on the hub after you loaded it."}

        total = len(plan)
        counters: dict[str, int] = {}
        for index, step in enumerate(plan):
            _progress(phase="writing", message=step.label, completed_steps=index,
                      total_steps=total, current_device_id=device_id)
            ok = self._dispatch_activity_sync_step(step)
            if not ok:
                target = "" if step.target_device_id is None else f" (device {step.target_device_id})"
                return {"status": "failed", "failed_at": f"{step.kind}{target}",
                        "message": f"The hub rejected: {step.label}", "completed_steps": index}
            counters[step.kind] = counters.get(step.kind, 0) + 1

        _progress(phase="completed", message="Synced to hub.", completed_steps=total,
                  total_steps=total, current_device_id=device_id)
        # Re-ingest the device's structural detail so proxy state (and the
        # bundles assembled from it) reflect what was just written.
        try:
            self.backup_device(device_id, include_blobs=False)
        except Exception:  # pragma: no cover - refresh is best-effort
            self._log.exception("[DEVICE_SYNC] post-sync device re-read failed")
        return {"status": "success", "completed_steps": total, "total_steps": total, "counters": counters}

    # ── Stale pre-flight ────────────────────────────────────────────────

    def _device_sync_is_stale(self, baseline: Mapping[str, Any], device_id: int) -> bool:
        fresh = self.backup_device(device_id, include_blobs=False)
        if not isinstance(fresh, Mapping):
            self._log.warning("[DEVICE_SYNC] stale preflight skipped: device 0x%02X could not be re-read",
                              device_id & 0xFF)
            return False
        if fresh.get("complete") is False:
            self._log.warning("[DEVICE_SYNC] stale preflight skipped: device 0x%02X re-read was incomplete",
                              device_id & 0xFF)
            return False
        baseline_device = None
        for device in baseline.get("devices") or []:
            if int((device.get("device") or {}).get("device_id") or 0) == device_id:
                baseline_device = device
                break
        fresh_signature = _device_block_signature(fresh)
        baseline_signature = _device_block_signature(baseline_device)
        stale = fresh_signature != baseline_signature
        if stale:
            self._log.warning(
                "[DEVICE_SYNC] stale preflight mismatch device=0x%02X baseline=%s fresh=%s",
                device_id & 0xFF,
                baseline_signature,
                fresh_signature,
            )
        return stale

    def _activity_sync_is_stale(self, baseline: Mapping[str, Any], activity_id: int) -> bool:
        fresh = self.backup_activity(activity_id)
        if not isinstance(fresh, Mapping):
            self._log.warning("[ACTIVITY_SYNC] stale preflight skipped: activity 0x%02X could not be re-read",
                              activity_id & 0xFF)
            return False
        if fresh.get("complete") is False:
            self._log.warning("[ACTIVITY_SYNC] stale preflight skipped: activity 0x%02X re-read was incomplete",
                              activity_id & 0xFF)
            return False
        baseline_activity = None
        for activity in baseline.get("activities") or []:
            if int((activity.get("device") or {}).get("device_id") or 0) == activity_id:
                baseline_activity = activity
                break
        fresh_signature = _activity_block_signature(fresh)
        baseline_signature = _activity_block_signature(baseline_activity)
        stale = fresh_signature != baseline_signature
        if stale:
            self._log.warning(
                "[ACTIVITY_SYNC] stale preflight mismatch activity=0x%02X baseline=%s fresh=%s",
                activity_id & 0xFF,
                baseline_signature,
                fresh_signature,
            )
        return stale

    # ── Step dispatch ───────────────────────────────────────────────────

    def _dispatch_activity_sync_step(self, step: SyncStep) -> bool:
        handler = getattr(self, f"_sync_step_{step.kind}", None)
        if handler is None:
            self._log.warning("[ACTIVITY_SYNC] no handler for step kind=%s", step.kind)
            return False
        payload = step.payload
        try:
            return bool(handler(payload))
        except Exception:  # pragma: no cover - defensive; drivers log their own
            self._log.exception("[ACTIVITY_SYNC] step kind=%s raised", step.kind)
            return False

    # High-level id-based drivers (production code, exercised by restore /
    # the vendor-app-derived activity ops).

    def _sync_step_binding_write(self, payload: Mapping[str, Any]) -> bool:
        lp_dev = int(payload.get("long_press_device_id") or 0) or None
        lp_cmd = int(payload.get("long_press_command_id") or 0) or None
        return self.command_to_button(
            int(payload["activity_id"]),
            int(payload["button_id"]),
            int(payload["device_id"]),
            int(payload["command_id"]),
            long_press_device_id=lp_dev,
            long_press_command_id=lp_cmd,
            refresh_after_write=False,
        ) is not None

    def _sync_step_favorite_add(self, payload: Mapping[str, Any]) -> bool:
        return self.command_to_favorite(
            int(payload["activity_id"]),
            int(payload["device_id"]),
            int(payload["command_id"]),
            slot_id=int(payload.get("button_id") or 0) or None,
            refresh_after_write=False,
        ) is not None

    def _sync_step_favorite_delete(self, payload: Mapping[str, Any]) -> bool:
        return self.delete_favorite(
            int(payload["activity_id"]), int(payload["button_id"]), refresh_after_write=False
        ) is not None

    def _sync_step_favorite_order(self, payload: Mapping[str, Any]) -> bool:
        # The desired order is carried as content pairs; resolve them to the
        # hub's *current* fav_ids (which now include any favorites added earlier
        # in this sync) so add-then-reorder positions the new favorite too.
        activity_id = int(payload["activity_id"])
        desired = payload.get("order_content") or []
        fav_id_by_content = self._activity_sync_current_favorite_fav_ids(activity_id)
        order: list[int] = []
        for pair in desired:
            if not isinstance(pair, (list, tuple)) or len(pair) < 2:
                continue
            content = (_int(pair[0]) & 0xFF, _int(pair[1]) & 0xFF)
            fav_id = fav_id_by_content.get(content)
            if fav_id is not None:
                order.append(fav_id)
        if len(order) < 2:
            # Nothing resolvable (or a single item) — no reorder to perform.
            return True
        return self.reorder_favorites(activity_id, order, refresh_after_write=False) is not None

    def _activity_sync_current_favorite_fav_ids(self, activity_id: int) -> dict[tuple[int, int], int]:
        """Map favorite content ``(device_id, command_id)`` → the hub's current
        fav_id. Re-reads the activity keymap synchronously so favorites added
        earlier in this sync are visible with their hub-assigned ids. The
        refresh must complete before returning: an in-flight mapping burst
        collides with the 0x0162 order request ``reorder_favorites`` sends
        next and the hub drops the overlapped request (observed live on X1,
        2026-07-11)."""
        act_lo = activity_id & 0xFF
        self.clear_entity_cache(act_lo, clear_buttons=True, clear_favorites=True)
        self._fetch_and_wait(
            f"buttons:{act_lo}",
            lambda: self.get_buttons_for_entity(act_lo, fetch_if_missing=True),
            lambda: act_lo in self.state.buttons,
            timeout=10.0,
        )
        mapping: dict[tuple[int, int], int] = {}
        state = getattr(self, "state", None)
        slots = state.get_activity_favorite_slots(act_lo) if state is not None else []
        for slot in slots or []:
            content = (_int(slot.get("device_id")) & 0xFF, _int(slot.get("command_id")) & 0xFF)
            mapping.setdefault(content, _int(slot.get("button_id")) & 0xFF)
        return mapping

    def _sync_step_member_replay(self, payload: Mapping[str, Any]) -> bool:
        return self.add_device_to_activity(
            int(payload["activity_id"]), int(payload["device_id"])
        ) is not None

    def _sync_step_idle_behavior(self, payload: Mapping[str, Any]) -> bool:
        return bool(self.set_idle_behavior(int(payload["device_id"]), int(payload["mode"])))

    def _sync_step_remote_sync(self, payload: Mapping[str, Any]) -> bool:
        return bool(self.request_activity_mapping(int(payload["activity_id"])))

    # The builders below (delete, macro write) are bench-validated on live
    # X1 + X1S hubs at BOTH scopes — see live-hub-testing.md "Validated:
    # device-edit write flows" and "Validated: activity-edit engine
    # emissions".

    def _sync_step_binding_delete(self, payload: Mapping[str, Any]) -> bool:
        return self._activity_sync_delete_key(
            int(payload["activity_id"]), int(payload["button_id"])
        )

    def _sync_step_macro_delete(self, payload: Mapping[str, Any]) -> bool:
        return self._activity_sync_delete_key(
            int(payload["activity_id"]), int(payload["button_id"])
        )

    def _sync_step_macro_write(self, payload: Mapping[str, Any]) -> bool:
        entity_id = int(payload["activity_id"])
        button_id = int(payload["button_id"])
        if entity_id < ACTIVITY_ID_BASE:
            return self._device_sync_macro_write(entity_id, button_id, payload)
        key_sequence = self._macro_key_sequence_from_steps(payload.get("steps") or [])
        label_slot = self._activity_sync_macro_label_slot(entity_id, button_id)
        wire = build_macro_save_payload(
            activity_id=entity_id & 0xFF,
            key_id=button_id & 0xFF,
            key_sequence=key_sequence,
            label=str(payload.get("name") or ""),
            hub_version=self.hub_version,
            label_slot=label_slot,
        )
        return self._send_paged_macro_save(payload=wire, macro_button=button_id & 0xFF) is not None

    def _device_sync_macro_write(self, device_id: int, button_id: int, payload: Mapping[str, Any]) -> bool:
        """Device-scope macro write (incl. the 198/199 power sequences).

        Devices use the single-page OP_3212 write that device create and
        restore already exercise, not the paged activity macro save. Step
        rows default the device byte to the device itself and the 48-bit
        button code to the synthetic command code; a ``command_id == 0xFF``
        row is the firmware's delay sentinel (all head bytes 0xFF).
        """
        dev_lo = device_id & 0xFF
        step_records = bytearray()
        for step in payload.get("steps") or []:
            if not isinstance(step, Mapping):
                continue
            command_id = int(step.get("command_id") or 0) & 0xFF
            if command_id == 0xFF:
                step_records += build_macro_step_record(
                    device_id=0xFF,
                    command_id=0xFF,
                    fid=0xFFFFFFFFFFFF,
                    duration=0xFF,
                    delay=int(step.get("delay", 0xFF)) & 0xFF,
                )
                continue
            step_device = int(step.get("device_id") or 0) & 0xFF or dev_lo
            fid = int(step.get("button_code") or 0) or synthesize_command_code(command_id)
            step_records += build_macro_step_record(
                device_id=step_device,
                command_id=command_id,
                fid=fid,
                duration=int(step.get("duration", 0)) & 0xFF,
                delay=int(step.get("delay", 0xFF)) & 0xFF,
            )
        step = build_macro_step(
            hub_version=self.hub_version,
            device_id=dev_lo,
            key_id=button_id & 0xFF,
            label=str(payload.get("name") or ""),
            step_records=bytes(step_records),
        )
        self.reset_ack_queues()
        result = run_create_sequence(self, [step])
        return bool(result.success)

    def _activity_sync_macro_label_slot(self, activity_id: int, button_id: int) -> bytes | None:
        if (button_id & 0xFF) not in _POWER_MACRO_BUTTON_IDS:
            return None
        getter = getattr(self, "get_cached_macro_records", None)
        if not callable(getter):
            return None
        for record in getter(activity_id):
            if (getattr(record, "key_id", 0) & 0xFF) == (button_id & 0xFF):
                slot = getattr(record, "raw_label_slot", b"")
                return bytes(slot) if slot else None
        return None

    def _sync_step_inputs_write(self, payload: Mapping[str, Any]) -> bool:
        # Input-record rewrites are a device-side side-effect of the input
        # picker; wired via the family-0x46 restore path. Not reachable from
        # the live editor's v1 affordances, but handled defensively.
        self._log.info("[ACTIVITY_SYNC] inputs_write for device %s (deferred to macro input refs)",
                       payload.get("device_id"))
        return True

    def _sync_step_command_rename(self, payload: Mapping[str, Any]) -> bool:
        # Command rename has no vendor-app affordance (V6) and is hidden in
        # live mode; a plan should never contain it. Refuse rather than emit
        # an unvalidated 0x0E rewrite.
        self._log.warning("[ACTIVITY_SYNC] command_rename is not supported in live sync")
        return False

    def _sync_step_activity_rename(self, payload: Mapping[str, Any]) -> bool:
        # Activity rename (V5) is hidden in live mode v1; refuse defensively.
        self._log.warning("[ACTIVITY_SYNC] activity_rename is not supported in live sync yet")
        return False

    # ── Low-level primitives ────────────────────────────────────────────

    def _activity_sync_delete_key(self, activity_id: int, button_id: int) -> bool:
        """Delete one activity key row (binding or user macro) via the
        shared 0x0210 primitive (V2/V3): ``02 10 <act> <btn>`` → ACK 0x0103,
        then a 0x65 commit."""
        act_lo = activity_id & 0xFF
        btn_lo = button_id & 0xFF
        self.reset_ack_queues()
        step = self._send_step(
            step_name=f"activity-sync-delete-10[act=0x{act_lo:02X} key=0x{btn_lo:02X}]",
            family=FAMILY_FAV_DELETE,
            payload=bytes([act_lo, btn_lo]),
            ack_opcode=0x0103,
            timeout=_ACTIVITY_SYNC_DELETE_ACK_TIMEOUT,
        )
        if not step.ok:
            return False
        commit = self._send_step(
            step_name=f"activity-sync-delete-commit-65[act=0x{act_lo:02X}]",
            family=0x65,
            payload=bytes([act_lo]),
            ack_opcode=0x0103,
        )
        return commit.ok

    def _macro_key_sequence_from_steps(self, steps: Any) -> list[MacroKeyEntry]:
        """Convert bundle macro steps to the wire key-entry sequence.

        Bundle step shape: ``{device_id, command_id, button_code, duration,
        delay}``. A delay-only row is ``command_id == 0xFF``.
        """
        sequence: list[MacroKeyEntry] = []
        for step in steps:
            command_id = int(step.get("command_id") or 0) & 0xFF
            sequence.append(
                MacroKeyEntry(
                    device_id=int(step.get("device_id") or 0) & 0xFF,
                    key_id=command_id,
                    fid=int(step.get("button_code") or 0) & 0xFFFFFFFFFFFF,
                    duration=int(step.get("duration") or 0) & 0xFF,
                    delay=int(step.get("delay") or 0) & 0xFF,
                )
            )
        return sequence
