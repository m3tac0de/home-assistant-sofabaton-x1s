"""Live activity sync executor (Phase L4).

Mixed into :class:`X1Proxy`. Walks the plan produced by
``activity_sync.build_activity_sync_plan`` and issues each step as a
targeted in-place write against the existing activity id, ack-gated and
serial exactly like the restore path. The plan builder is pure; this
module is where the wire writes happen.

Orchestration (ordering, ack-gating, failure-stop, progress, stale
pre-flight) is unit-tested against a fake proxy that overrides the driver
methods. The individual wire builders it calls are the same drivers restore
and the vendor-app-derived activity ops already exercise in production;
end-to-end wire correctness is gated by the doc's §10 live-hub checklist.
"""

from __future__ import annotations

import json
from typing import Any, Callable, Mapping

from .activity_sync import SyncStep, build_activity_sync_plan
from .macros import MacroKeyEntry, build_macro_save_payload
from .protocol_const import FAMILY_FAV_DELETE

_STALE_FIELDS = ("favorite_slots", "macros", "button_bindings")


def _canonical(value: Any) -> str:
    return json.dumps(value, sort_keys=True, default=str)


def _activity_block_signature(activity: Mapping[str, Any] | None) -> str:
    """Order-sensitive signature of the mutable parts of an activity block,
    used to detect the hub changing underneath us between capture and sync."""
    if not activity:
        return ""
    block = dict(activity.get("device") or {})
    return _canonical(
        {
            "name": str(block.get("name") or ""),
            **{field: activity.get(field) for field in _STALE_FIELDS},
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

    # ── Stale pre-flight ────────────────────────────────────────────────

    def _activity_sync_is_stale(self, baseline: Mapping[str, Any], activity_id: int) -> bool:
        fresh = self.backup_activity(activity_id)
        baseline_activity = None
        for activity in baseline.get("activities") or []:
            if int((activity.get("device") or {}).get("device_id") or 0) == activity_id:
                baseline_activity = activity
                break
        return _activity_block_signature(fresh) != _activity_block_signature(baseline_activity)

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
        return self.reorder_favorites(
            int(payload["activity_id"]), [int(b) for b in payload.get("order") or []],
            refresh_after_write=False,
        ) is not None

    def _sync_step_member_replay(self, payload: Mapping[str, Any]) -> bool:
        return self.add_device_to_activity(
            int(payload["activity_id"]), int(payload["device_id"])
        ) is not None

    def _sync_step_idle_behavior(self, payload: Mapping[str, Any]) -> bool:
        return bool(self.set_idle_behavior(int(payload["device_id"]), int(payload["mode"])))

    def _sync_step_remote_sync(self, payload: Mapping[str, Any]) -> bool:
        return bool(self.request_activity_mapping(int(payload["activity_id"])))

    # Wire builders below are gated by the live-hub checklist (§10): the
    # orchestration above is fully tested, but the exact bytes these emit
    # need a bench pass before the affordance is trusted end-to-end.

    def _sync_step_binding_delete(self, payload: Mapping[str, Any]) -> bool:
        return self._activity_sync_delete_key(
            int(payload["activity_id"]), int(payload["button_id"])
        )

    def _sync_step_macro_delete(self, payload: Mapping[str, Any]) -> bool:
        return self._activity_sync_delete_key(
            int(payload["activity_id"]), int(payload["button_id"])
        )

    def _sync_step_macro_write(self, payload: Mapping[str, Any]) -> bool:
        activity_id = int(payload["activity_id"])
        button_id = int(payload["button_id"])
        key_sequence = self._macro_key_sequence_from_steps(payload.get("steps") or [])
        wire = build_macro_save_payload(
            activity_id=activity_id & 0xFF,
            key_id=button_id & 0xFF,
            key_sequence=key_sequence,
        )
        return self._send_paged_macro_save(payload=wire, macro_button=button_id & 0xFF) is not None

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
            timeout=7.5,
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
                    fid=int(step.get("button_code") or 0) & 0xFF,
                    duration=int(step.get("duration") or 0) & 0xFF,
                    delay=int(step.get("delay") or 0) & 0xFF,
                )
            )
        return sequence
