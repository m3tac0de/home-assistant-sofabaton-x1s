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
import time
from dataclasses import replace
from typing import Any, Callable, Mapping

from .activity_sync import ACTIVITY_ID_BASE, SyncStep, build_activity_sync_plan, build_device_sync_plan
from .device_create import (
    ACK_OPCODE_STATUS,
    ACK_STATUS_BYTE_OK,
    CreateStep,
    FAMILY_DEVICE_UPDATE,
    build_macro_step,
    build_macro_step_record,
    run_create_sequence,
    synthesize_command_code,
)
from .commands import build_descriptive_ir_blob_body, split_play_blob_tail
from .devices import build_device_create_payload, parse_device_record
from .hub_versions import HUB_VERSION_X1S, HUB_VERSION_X2
from .macros import MacroKeyEntry, build_macro_save_payload
from .protocol_const import (
    FAMILY_FAV_DELETE,
    OP_ACTIVITY_ASSIGN_FINALIZE,
    OP_ACTIVITY_CONFIRM,
    OP_REQ_MACRO_LABELS,
    ButtonName,
)

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


# ── Role-page tolerance ─────────────────────────────────────────────────
#
# The hub derives "role page" keymap slots for a role-assigned device from
# that device's own device-mode keymap page, and it recomputes them
# asynchronously over long windows (observed live on X1S, 2026-07-14, BUG
# #4 of the UI bench: an activity's FWD slot flipped (dev,0) → (dev,21) →
# (dev,0) minutes after the writes that triggered each recompute, tied to
# remote-sync processing of BT-profile pages). A binding row that mirrors
# the target device's device-mode mapping is therefore hub-managed state:
# its presence cannot distinguish "someone edited the hub" from "the hub
# materialized (or dropped) the slot on its own schedule". Such rows are
# excluded from the staleness comparison on BOTH sides; every other row —
# and favorites/macros in full — still compares byte-for-byte, so real
# foreign edits (a binding pointed at a different device or command, added
# favorites, changed macros) are still caught.

RolePageRef = dict[tuple[int, int], set[tuple[int, int | None]]]


def _role_page_reference(
    baseline: Mapping[str, Any] | None,
    live_button_details: Mapping[int, Mapping[int, Mapping[str, Any]]] | None,
) -> RolePageRef:
    """Map ``(device_id, button_id)`` → the ``(command_id, long_press_command_id)``
    pairs that device's own device-mode keymap carries, merged from the
    baseline bundle's device blocks and the live proxy state (the hub can
    flip a BT device's page between the two captures, so either source
    legitimizes a role slot)."""

    ref: RolePageRef = {}

    def _add(device_id: int, button_id: int, command_id: int, lp_command: Any) -> None:
        command_id &= 0xFF
        if not command_id:
            # An unmaterialized device-page placeholder carries command 0;
            # exported activity rows never do, so it can't legitimize any
            # row — skip it.
            return
        ref.setdefault((device_id & 0xFF, button_id & 0xFF), set()).add(
            (command_id, _optional_int(lp_command))
        )

    for device in (baseline or {}).get("devices") or []:
        if not isinstance(device, Mapping):
            continue
        device_id = _int((device.get("device") or {}).get("device_id"))
        if not device_id:
            continue
        for row in device.get("button_bindings") or []:
            if isinstance(row, Mapping):
                _add(device_id, _int(row.get("button_id")),
                     _int(row.get("command_id")), row.get("long_press_command_id"))

    for device_id, details in (live_button_details or {}).items():
        if _int(device_id) >= ACTIVITY_ID_BASE or not isinstance(details, Mapping):
            continue
        for button_id, row in details.items():
            if isinstance(row, Mapping):
                _add(_int(device_id), _int(button_id),
                     _int(row.get("command_id")), row.get("long_press_command_id"))

    return ref


def _is_role_page_row(row: Mapping[str, Any], role_page_ref: RolePageRef) -> bool:
    device_id = _int(row.get("device_id")) & 0xFF
    button_id = _int(row.get("button_id")) & 0xFF
    lp_device = _optional_int(row.get("long_press_device_id"))
    if lp_device is not None and lp_device != device_id:
        return False
    pairs = role_page_ref.get((device_id, button_id))
    if not pairs:
        return False
    return (
        _int(row.get("command_id")) & 0xFF,
        _optional_int(row.get("long_press_command_id")),
    ) in pairs


def _macro_signature(row: Mapping[str, Any], *, normalize_power_durations: bool = False) -> dict[str, Any]:
    button_id = _int(row.get("button_id")) & 0xFF
    is_power_macro = button_id in (0xC6, 0xC7)
    steps: list[dict[str, Any]] = []
    for step in row.get("steps") or []:
        if not isinstance(step, Mapping):
            continue
        command_id = _int(step.get("command_id")) & 0xFF
        duration = _int(step.get("duration")) & 0xFF
        # The hub rewrites the duration byte on 0xC6/0xC7 power-ref rows on
        # its own schedule (it lands with the closing remote-sync, AFTER the
        # sync operation's post-write re-read), so a signature containing it
        # cannot tell "someone edited the hub" from "the hub canonicalized
        # our own write". 0xC5 keeps its duration: it carries the input
        # ordinal the user chose.
        if normalize_power_durations and is_power_macro and command_id in (0xC6, 0xC7):
            duration = 0
        steps.append(
            {
                "device_id": _int(step.get("device_id")) & 0xFF,
                "command_id": command_id,
                "button_code": _int(step.get("button_code")) & 0xFFFFFFFFFFFF,
                "duration": duration,
                "delay": _int(step.get("delay")) & 0xFF,
            }
        )
    return {"button_id": button_id, "steps": steps}


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


def _activity_block_signature(
    activity: Mapping[str, Any] | None,
    *,
    role_page_ref: RolePageRef | None = None,
) -> str:
    """Stable signature of the mutable parts of an activity block.

    The live editor opens from the persisted structural cache, while this
    pre-flight re-exports the activity. Compare only stable wire targets so
    cache/export representation drift does not masquerade as a hub edit;
    macro step order remains significant. When ``role_page_ref`` is given,
    binding rows that mirror the target device's own device-mode keymap are
    excluded: those "role page" slots are hub-managed and appear/disappear
    on the hub's own schedule (see the role-page tolerance note above).
    """
    if not activity:
        return ""
    bindings = activity.get("button_bindings")
    if role_page_ref:
        bindings = [
            row for row in bindings or []
            if not (isinstance(row, Mapping) and _is_role_page_row(row, role_page_ref))
        ]
    return _canonical(
        {
            "favorite_slots": _rows_signature(
                activity.get("favorite_slots"),
                _favorite_signature,
                lambda item: (_int(item.get("device_id")), _int(item.get("command_id"))),
            ),
            "macros": _rows_signature(
                activity.get("macros"),
                lambda row: _macro_signature(row, normalize_power_durations=True),
                lambda item: _int(item.get("button_id")),
            ),
            "button_bindings": _rows_signature(
                bindings,
                _binding_signature,
                lambda item: _int(item.get("button_id")),
            ),
        }
    )


# Highest editable quick-access id (198/199 are the reserved power macros).
_MAX_QUICK_ACCESS_BUTTON_ID = min(_POWER_MACRO_BUTTON_IDS) - 1


class ActivitySyncMixin:
    """`sync_activity` + per-step dispatch. Mixed into X1Proxy."""

    # ── Per-run allocation state (BUG #5) ──────────────────────────────
    #
    # On the hub, favorites and macro shortcuts share ONE fav-id/key-id
    # namespace per activity, but the editor renumbers quick-access
    # button_ids 1..N positionally, so bundle ids are proposals — not hub
    # identities. Each sync run tracks:
    #   * the live favorite fav-id map (read once, per activity), used to
    #     allocate new macro ids and to re-resolve stale delete targets;
    #   * ids handed out to new macros this run (later allocations and the
    #     live re-read can't see them yet);
    #   * proposed→allocated macro id remaps, which later binding writes
    #     must follow (a macro-target binding stores command_id = the
    #     macro's button_id).

    def _activity_sync_reset_run_state(self) -> None:
        self._activity_sync_macro_id_remap: dict[int, int] = {}
        self._activity_sync_session_key_ids: set[int] = set()
        self._activity_sync_live_fav_cache: dict[int, dict[tuple[int, int], int]] = {}

    def _activity_sync_live_favorite_fav_ids(self, activity_id: int) -> dict[tuple[int, int], int]:
        """Per-run cached live favorite map (content → hub fav_id).

        The uncached read costs a keymap round-trip; within one sync run the
        favorite namespace only changes through this run's own steps, so one
        read per activity is valid for macro allocation (runs before the
        favorite deletes) and for delete-target resolution.
        """
        act_lo = int(activity_id) & 0xFF
        cache = getattr(self, "_activity_sync_live_fav_cache", None)
        if cache is None:
            cache = self._activity_sync_live_fav_cache = {}
        if act_lo not in cache:
            cache[act_lo] = dict(self._activity_sync_current_favorite_fav_ids(act_lo))
        return cache[act_lo]

    def _activity_sync_allocate_macro_button_id(self, activity_id: int, proposed: int) -> int | None:
        """Resolve the real button_id for a NEW macro shortcut against live
        hub occupancy of the shared quick-access namespace.

        Occupied = live favorite fav_ids (fresh keymap read) ∪ the 0x63
        favorites-order table (names every quick-access id, macro shortcuts
        included) ∪ cached macro record key ids ∪ ids already handed out this
        run ∪ the reserved power ids. The client's proposal wins when free;
        otherwise allocate one past the highest editable id in use (mirrors
        the editor's allocator, and avoids re-using ids the hub may hand to
        favorites added later in the same plan). Returns ``None`` when the
        namespace is exhausted.
        """
        act_lo = int(activity_id) & 0xFF
        proposed = int(proposed) & 0xFF
        occupied: set[int] = set(_POWER_MACRO_BUTTON_IDS)
        occupied |= set(getattr(self, "_activity_sync_session_key_ids", ()))
        # No try/except: if the live favorite read fails, the step must fail —
        # writing a new macro blind is exactly the favorite-overwrite bug.
        occupied |= {
            _int(fav_id) & 0xFF
            for fav_id in self._activity_sync_live_favorite_fav_ids(act_lo).values()
        }
        order_getter = getattr(self, "request_favorites_order", None)
        if callable(order_getter):
            for fav_id, _slot in order_getter(act_lo) or []:
                occupied.add(_int(fav_id) & 0xFF)
        records_getter = getattr(self, "get_cached_macro_records", None)
        if callable(records_getter):
            for record in records_getter(act_lo) or []:
                occupied.add(_int(getattr(record, "key_id", 0)) & 0xFF)
        state = getattr(self, "state", None)
        macros_getter = getattr(state, "get_activity_macros", None)
        if callable(macros_getter):
            for macro in macros_getter(act_lo) or []:
                if isinstance(macro, Mapping):
                    occupied.add(_int(macro.get("command_id")) & 0xFF)
        occupied.discard(0)
        if proposed and proposed not in occupied:
            return proposed
        editable = {value for value in occupied if 0 < value <= _MAX_QUICK_ACCESS_BUTTON_ID}
        candidate = max(editable, default=0) + 1
        if candidate > _MAX_QUICK_ACCESS_BUTTON_ID:
            candidate = next(
                (
                    value
                    for value in range(1, _MAX_QUICK_ACCESS_BUTTON_ID + 1)
                    if value not in occupied
                ),
                None,
            )
        return candidate

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

        self._activity_sync_reset_run_state()

        try:
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
        finally:
            # Run state (allocator remaps, session key ids, live fav cache) is
            # meaningful only while this run's steps execute. Clear it so no
            # later flow — restore, HA services, the next editor session —
            # can resolve against this run's leftovers (e.g. the fav-id
            # validator accepting a session key id that no longer exists).
            self._activity_sync_reset_run_state()

        _progress(phase="completed", message="Synced to hub.", completed_steps=total,
                  total_steps=total, current_activity_id=activity_id)
        # Refresh internal mapping so the cache/remote reflect the new state.
        self.request_activity_mapping(activity_id)
        # Settle on user-editable rows only: role-page slots can keep
        # flipping for minutes after the remote sync (BUG #4) and are
        # excluded from the stale preflight anyway.
        settle_ref = _role_page_reference(None, getattr(self.state, "button_details", None))
        self._settle_post_sync_reread(
            lambda: _activity_block_signature(
                self.backup_activity(activity_id), role_page_ref=settle_ref
            ),
            log_tag="ACTIVITY_SYNC",
        )
        return {"status": "success", "completed_steps": total, "total_steps": total, "counters": counters}

    def _settle_post_sync_reread(self, read_signature: Callable[[], str], *, log_tag: str) -> None:
        """Re-read an entity after a sync until consecutive captures agree.

        The hub materializes derived keymap/macro state on its own schedule
        after the terminal remote-sync (observed live: power-row duration
        bytes and role-page placeholder rows settle seconds after the write
        acks). The refreshed cache — and any editor baseline recaptured from
        it — must reflect settled hub truth, not an intermediate read, or
        the next sync's stale preflight false-positives.
        """

        try:
            previous = read_signature()
            for attempt in range(3):
                # A live re-read costs wire round-trips, so consecutive reads
                # are naturally separated; sleep only between retries.
                current = read_signature()
                if current == previous:
                    return
                previous = current
                time.sleep(1.0 * (attempt + 1))
            self._log.warning(
                "[%s] post-sync re-read did not settle; the cache may lag the hub", log_tag
            )
        except Exception:  # pragma: no cover - refresh is best-effort
            self._log.exception("[%s] post-sync re-read failed", log_tag)

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

        self._activity_sync_reset_run_state()

        try:
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
        finally:
            # See sync_activity: run state must not outlive the step walk.
            self._activity_sync_reset_run_state()

        _progress(phase="completed", message="Synced to hub.", completed_steps=total,
                  total_steps=total, current_device_id=device_id)
        # Re-ingest the device's structural detail so proxy state (and the
        # bundles assembled from it) reflect what was just written; settle
        # against the hub's asynchronous canonicalization (see helper).
        self._settle_post_sync_reread(
            lambda: _device_block_signature(self.backup_device(device_id, include_blobs=False)),
            log_tag="DEVICE_SYNC",
        )
        return {"status": "success", "completed_steps": total, "total_steps": total, "counters": counters}

    # ── Stale pre-flight ────────────────────────────────────────────────
    #
    # A single hub re-read can transiently disagree with reality (observed
    # live: a favorites fetch missing a slot the hub demonstrably has, and
    # the hub materializing derived keymap state on its own schedule), so a
    # mismatch is only trusted after consecutive re-reads keep disagreeing.
    _STALE_PREFLIGHT_ATTEMPTS = 3

    def _preflight_is_stale(
        self,
        *,
        read_fresh: Callable[[], Any],
        signature: Callable[[Any], str],
        baseline_entity: Mapping[str, Any] | None,
        log_tag: str,
        entity_label: str,
    ) -> bool:
        baseline_signature = signature(baseline_entity)
        fresh_signature = None
        for attempt in range(self._STALE_PREFLIGHT_ATTEMPTS):
            if attempt:
                time.sleep(1.0)
            fresh = read_fresh()
            if not isinstance(fresh, Mapping):
                self._log.warning(
                    "[%s] stale preflight skipped: %s could not be re-read", log_tag, entity_label
                )
                return False
            if fresh.get("complete") is False:
                self._log.warning(
                    "[%s] stale preflight skipped: %s re-read was incomplete", log_tag, entity_label
                )
                return False
            fresh_signature = signature(fresh)
            if fresh_signature == baseline_signature:
                if attempt:
                    self._log.info(
                        "[%s] stale preflight matched on re-read %d for %s (transient hub read)",
                        log_tag, attempt + 1, entity_label,
                    )
                return False
        self._log.warning(
            "[%s] stale preflight mismatch %s baseline=%s fresh=%s",
            log_tag, entity_label, baseline_signature, fresh_signature,
        )
        return True

    def _device_sync_is_stale(self, baseline: Mapping[str, Any], device_id: int) -> bool:
        baseline_device = None
        for device in baseline.get("devices") or []:
            if int((device.get("device") or {}).get("device_id") or 0) == device_id:
                baseline_device = device
                break
        return self._preflight_is_stale(
            read_fresh=lambda: self.backup_device(device_id, include_blobs=False),
            signature=_device_block_signature,
            baseline_entity=baseline_device,
            log_tag="DEVICE_SYNC",
            entity_label=f"device=0x{device_id & 0xFF:02X}",
        )

    def _activity_sync_is_stale(self, baseline: Mapping[str, Any], activity_id: int) -> bool:
        baseline_activity = None
        for activity in baseline.get("activities") or []:
            if int((activity.get("device") or {}).get("device_id") or 0) == activity_id:
                baseline_activity = activity
                break
        # Device pages from the session baseline and the live cache both
        # legitimize role-page slots — the hub can flip a BT device's page
        # between the two captures.
        role_page_ref = _role_page_reference(
            baseline, getattr(self.state, "button_details", None)
        )
        return self._preflight_is_stale(
            read_fresh=lambda: self.backup_activity(activity_id),
            signature=lambda entity: _activity_block_signature(
                entity, role_page_ref=role_page_ref
            ),
            baseline_entity=baseline_activity,
            log_tag="ACTIVITY_SYNC",
            entity_label=f"activity=0x{activity_id & 0xFF:02X}",
        )

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
        activity_id = int(payload["activity_id"])
        device_id = int(payload["device_id"])
        command_id = int(payload["command_id"])
        lp_dev = int(payload.get("long_press_device_id") or 0) or None
        lp_cmd = int(payload.get("long_press_command_id") or 0) or None
        # A macro-target binding stores device_id = the activity's own id and
        # command_id = the macro's button_id; follow any id the new-macro
        # allocator moved earlier in this run.
        remap = getattr(self, "_activity_sync_macro_id_remap", None) or {}
        if remap:
            if device_id == activity_id and (command_id & 0xFF) in remap:
                command_id = remap[command_id & 0xFF]
            if lp_dev == activity_id and lp_cmd is not None and (lp_cmd & 0xFF) in remap:
                lp_cmd = remap[lp_cmd & 0xFF]
        return self.command_to_button(
            activity_id,
            int(payload["button_id"]),
            device_id,
            command_id,
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
        activity_id = int(payload["activity_id"])
        button_id = int(payload["button_id"]) & 0xFF
        content = (_int(payload.get("device_id")) & 0xFF, _int(payload.get("command_id")) & 0xFF)
        if content[0] and content[1]:
            # When the baseline fav_id is demonstrably stale (absent from the
            # hub's live favorite ids), re-resolve the target by content so
            # the delete cannot land on a different favorite. Best-effort:
            # if the live read fails, fall back to the baseline id (the
            # pre-existing behavior).
            try:
                live = self._activity_sync_live_favorite_fav_ids(activity_id)
            except Exception:
                self._log.exception(
                    "[ACTIVITY_SYNC] favorite_delete: live fav-id read failed; using baseline id"
                )
                live = None
            if live is not None and button_id not in set(live.values()):
                resolved = live.get(content)
                if resolved is None:
                    self._log.info(
                        "[ACTIVITY_SYNC] favorite_delete: favorite (dev=0x%02X cmd=0x%02X) "
                        "already absent on the hub; nothing to delete",
                        content[0], content[1],
                    )
                    return True
                self._log.info(
                    "[ACTIVITY_SYNC] favorite_delete: baseline fav_id 0x%02X is stale; "
                    "resolved (dev=0x%02X cmd=0x%02X) to live fav_id 0x%02X",
                    button_id, content[0], content[1], resolved,
                )
                button_id = resolved & 0xFF
        return self.delete_favorite(
            activity_id, button_id, refresh_after_write=False
        ) is not None

    def _sync_step_favorite_order(self, payload: Mapping[str, Any]) -> bool:
        # The desired order covers the whole quick-access namespace. Favorite
        # entries are carried as content and resolved to the hub's *current*
        # fav_ids (which now include any favorites added earlier in this sync,
        # so add-then-reorder positions the new favorite too). Macro entries
        # carry a hub key id — the baseline id for surviving macros, or the
        # editor's proposal for macros written NEW earlier in this run, which
        # must follow the id the allocator actually assigned.
        activity_id = int(payload["activity_id"])
        entries: list[Mapping[str, Any]] = []
        raw_entries = payload.get("order")
        if raw_entries is None:
            # Legacy favorites-only payload shape.
            for pair in payload.get("order_content") or []:
                if isinstance(pair, (list, tuple)) and len(pair) >= 2:
                    entries.append(
                        {"kind": "favorite", "device_id": pair[0], "command_id": pair[1]}
                    )
        else:
            entries = [entry for entry in raw_entries if isinstance(entry, Mapping)]
        fav_id_by_content = self._activity_sync_current_favorite_fav_ids(activity_id)
        remap = getattr(self, "_activity_sync_macro_id_remap", None) or {}
        session_ids = set(getattr(self, "_activity_sync_session_key_ids", ()) or ())
        order: list[int] = []
        for entry in entries:
            if str(entry.get("kind") or "favorite") == "macro":
                key_id = _int(entry.get("button_id")) & 0xFF
                resolved = remap.get(key_id, key_id)
                if entry.get("new") and resolved not in session_ids:
                    # The new-macro write never landed (or was skipped); a
                    # sort entry for a nonexistent key would be rejected.
                    self._log.warning(
                        "[ACTIVITY_SYNC] favorite_order: new macro id 0x%02X was never "
                        "allocated this run; leaving it out of the order",
                        key_id,
                    )
                    continue
                order.append(resolved)
                continue
            content = (_int(entry.get("device_id")) & 0xFF, _int(entry.get("command_id")) & 0xFF)
            fav_id = fav_id_by_content.get(content)
            if fav_id is not None:
                order.append(fav_id)
        if not order:
            # Nothing resolvable — no reorder to perform.
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
        # BUG #8: the plan carries the editor's "Set input" choice as the
        # input's command id; without it add_device_to_activity writes the
        # from-scratch 0xC5 power-on row with duration 0 (no input).
        raw_input_cmd = payload.get("input_cmd_id")
        return self.add_device_to_activity(
            int(payload["activity_id"]),
            int(payload["device_id"]),
            input_cmd_id=None if raw_input_cmd is None else int(raw_input_cmd),
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
        activity_id = int(payload["activity_id"])
        button_id = int(payload["button_id"]) & 0xFF
        if activity_id >= ACTIVITY_ID_BASE:
            # Shared namespace guard: if this id currently names a live
            # FAVORITE, the bundle's macro id was stale and the 0x0210 delete
            # would destroy that favorite. Skip instead — a leftover macro
            # row is recoverable; a deleted favorite is not. Best-effort: a
            # failed live read falls through to the delete (pre-existing
            # behavior).
            try:
                live = self._activity_sync_live_favorite_fav_ids(activity_id)
            except Exception:
                live = None
            if live and button_id in set(live.values()):
                self._log.warning(
                    "[ACTIVITY_SYNC] macro_delete: id 0x%02X is a live favorite on "
                    "act=0x%02X; skipping the delete to protect it",
                    button_id, activity_id & 0xFF,
                )
                return True
        return self._activity_sync_delete_key(activity_id, button_id)

    def _sync_step_macro_write(self, payload: Mapping[str, Any]) -> bool:
        entity_id = int(payload["activity_id"])
        button_id = int(payload["button_id"])
        if entity_id < ACTIVITY_ID_BASE:
            return self._device_sync_macro_write(entity_id, button_id, payload)
        if payload.get("new"):
            # BUG #5: the proposed id came from the editor's renumbered client
            # view; favorites and macro shortcuts share one fav-id namespace on
            # the hub, so writing at an occupied id silently overwrites a
            # favorite. Allocate against live hub occupancy instead.
            allocated = self._activity_sync_allocate_macro_button_id(entity_id, button_id)
            if allocated is None:
                self._log.warning(
                    "[ACTIVITY_SYNC] macro_write: no free quick-access id on act=0x%02X",
                    entity_id & 0xFF,
                )
                return False
            if allocated != (button_id & 0xFF):
                self._log.info(
                    "[ACTIVITY_SYNC] macro_write: proposed id 0x%02X is occupied on the "
                    "hub; allocated 0x%02X instead",
                    button_id & 0xFF, allocated,
                )
                remap = getattr(self, "_activity_sync_macro_id_remap", None)
                if remap is None:
                    remap = self._activity_sync_macro_id_remap = {}
                remap[button_id & 0xFF] = allocated
                button_id = allocated
            session_ids = getattr(self, "_activity_sync_session_key_ids", None)
            if session_ids is None:
                session_ids = self._activity_sync_session_key_ids = set()
            session_ids.add(button_id & 0xFF)
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
        """Rename a command in place via a full ``0x0E`` record rewrite.

        The record carries the label slot next to the payload, so a rename is
        the same in-place overwrite with a changed label and the command's
        *current* payload preserved. The command-list fetch does not carry the
        payload bytes, so fetch the single command's blob, strip its replay
        tail (the write path recomputes the body checksum), and rewrite with
        the new name and the code/type read from ``state.command_metadata``.
        Bench-validated on X1 + X1S (see live-hub-testing.md "Command rename
        rides the same record write").
        """
        device_id = int(payload.get("device_id") or 0)
        command_id = int(payload.get("command_id") or 0)
        dev_lo = device_id & 0xFF
        cmd_lo = command_id & 0xFF
        new_name = str(payload.get("name") or "").strip()
        if not dev_lo or not cmd_lo or not new_name:
            self._log.warning("[DEVICE_SYNC] command_rename: missing device/command id or name")
            return False

        meta = (self.state.command_metadata.get(dev_lo) or {}).get(cmd_lo)
        if not isinstance(meta, Mapping):
            self._log.warning(
                "[DEVICE_SYNC] command_rename: no cached record metadata dev=0x%02X cmd=0x%02X",
                dev_lo, cmd_lo,
            )
            return False

        library_data = self._fetch_command_library_data(dev_lo, cmd_lo)
        if not library_data:
            self._log.warning(
                "[DEVICE_SYNC] command_rename: could not read current payload dev=0x%02X cmd=0x%02X",
                dev_lo, cmd_lo,
            )
            return False

        result = self.overwrite_command_payload(
            device_id=dev_lo,
            command_id=cmd_lo,
            command_name=new_name,
            library_type=int(meta.get("library_type", 0x0D)) & 0xFF,
            library_data=library_data,
            button_code=int(meta.get("button_code", 0)) & 0xFFFFFFFFFFFF,
        )
        if not isinstance(result, dict) or result.get("status") != "success":
            self._log.warning(
                "[DEVICE_SYNC] command_rename: hub rejected dev=0x%02X cmd=0x%02X", dev_lo, cmd_lo,
            )
            return False
        return True

    def _fetch_command_library_data(self, dev_lo: int, cmd_lo: int) -> bytes | None:
        """Read one command's stored payload bytes (replay tail stripped).

        The tail is the replay checksum the dump appends; the record-write
        path recomputes the body checksum, so it must not be written back.
        """
        dump = self.request_ir_command_dump(dev_lo, command_id=cmd_lo, timeout=10.0)
        for command in (dump or {}).get("commands", []):
            if int(command.get("command_id", -1)) & 0xFF != cmd_lo:
                continue
            blob_hex = str(command.get("ir_blob_hex") or "").strip()
            if not blob_hex:
                return None
            body, _tail = split_play_blob_tail(bytes.fromhex(blob_hex))
            return body or None
        return None

    def _sync_step_command_add(self, payload: Mapping[str, Any]) -> bool:
        """Create a brand-new command record on a device (family ``0x0E``).

        Backs the live editor's add-command dialog: the row never existed on
        the hub, so this persists a fresh record at the provisional command
        id the frontend allocated (the persist path's allocator re-validates
        it against live occupancy from the sync pre-flight's command-list
        fetch). Byte resolution by payload shape:

        * descriptive IR (``decoded.class == "ir"``) — synthesized from the
          descriptor via :func:`build_descriptive_ir_blob_body` (whitespace
          normalization, ``P:`` validation, DenonK canonicalization, writer
          trailing nulls) and saved through :meth:`persist_ir_blob` — the
          exact path the bench-validated ``persist_ir_blob`` service uses,
          including the family-0x61 sort registration.
        * other decoded classes — re-encoded and round-trip-verified via
          :meth:`_edited_command_data_hex`; the record's opaque trailer was
          cloned from a template command on the same device by the dialog.
        * raw hex — ``data_hex`` verbatim.

        Non-IR records need a ``library_type``: it is cloned from the cached
        record metadata of an existing command on the same device (a device's
        commands share one codec) — refuse rather than guess when absent. No
        canonical ``button_code`` is asserted; the hub assigns one on accept,
        and the sync epilogue's command-list refresh picks it up.
        """
        device_id = int(payload.get("device_id") or 0)
        command_id = int(payload.get("command_id") or 0)
        dev_lo = device_id & 0xFF
        cmd_lo = command_id & 0xFF
        if not dev_lo or not cmd_lo:
            self._log.warning("[DEVICE_SYNC] command_add: missing device/command id")
            return False

        restore_data = payload.get("restore_data")
        if not isinstance(restore_data, Mapping):
            self._log.warning(
                "[DEVICE_SYNC] command_add: no restore_data dev=0x%02X cmd=0x%02X",
                dev_lo, cmd_lo,
            )
            return False
        restore_data = dict(restore_data)
        command_name = str(payload.get("command_name") or "").strip() or f"Command {cmd_lo}"

        decoded = restore_data.get("decoded")
        decoded_class = (
            str(decoded.get("class") or "").strip().lower()
            if isinstance(decoded, Mapping)
            else ""
        )

        if decoded_class == "ir":
            descriptor = str((decoded.get("fields") or {}).get("descriptor") or "")
            try:
                blob = build_descriptive_ir_blob_body(descriptor)
            except ValueError:
                self._log.exception(
                    "[DEVICE_SYNC] command_add: invalid IR descriptor dev=0x%02X cmd=0x%02X",
                    dev_lo, cmd_lo,
                )
                return False
            try:
                result = self.persist_ir_blob(
                    device_id=dev_lo,
                    command_name=command_name,
                    blob=blob,
                    command_id=cmd_lo,
                )
            except ValueError:
                self._log.exception(
                    "[DEVICE_SYNC] command_add: persist refused dev=0x%02X cmd=0x%02X",
                    dev_lo, cmd_lo,
                )
                return False
            if not isinstance(result, dict) or result.get("status") != "success":
                self._log.warning(
                    "[DEVICE_SYNC] command_add: hub rejected dev=0x%02X cmd=0x%02X",
                    dev_lo, cmd_lo,
                )
                return False
            return True

        try:
            edited_hex = self._edited_command_data_hex(restore_data, cmd_lo)
        except ValueError:
            self._log.exception(
                "[DEVICE_SYNC] command_add: payload re-encode failed dev=0x%02X cmd=0x%02X",
                dev_lo, cmd_lo,
            )
            return False
        data_hex = edited_hex if edited_hex is not None else str(restore_data.get("data_hex") or "").strip()
        if not data_hex:
            self._log.warning(
                "[DEVICE_SYNC] command_add: empty payload dev=0x%02X cmd=0x%02X",
                dev_lo, cmd_lo,
            )
            return False
        try:
            library_data = bytes.fromhex(data_hex.replace("0x", "").replace(" ", "").strip())
        except ValueError:
            self._log.warning(
                "[DEVICE_SYNC] command_add: payload is not valid hex dev=0x%02X cmd=0x%02X",
                dev_lo, cmd_lo,
            )
            return False

        library_type: int | None = None
        for meta in (self.state.command_metadata.get(dev_lo) or {}).values():
            if isinstance(meta, Mapping) and meta.get("library_type") is not None:
                library_type = int(meta.get("library_type", 0)) & 0xFF
                break
        if library_type is None:
            self._log.warning(
                "[DEVICE_SYNC] command_add: no cached record metadata on dev=0x%02X "
                "to clone a library_type from (device has no existing commands?)",
                dev_lo,
            )
            return False

        try:
            result = self.persist_command_record(
                device_id=dev_lo,
                command_name=command_name,
                library_type=library_type,
                command_data=library_data,
                command_code=0,
                command_id=cmd_lo,
            )
        except ValueError:
            self._log.exception(
                "[DEVICE_SYNC] command_add: persist refused dev=0x%02X cmd=0x%02X",
                dev_lo, cmd_lo,
            )
            return False
        if not isinstance(result, dict) or result.get("status") != "success":
            self._log.warning(
                "[DEVICE_SYNC] command_add: hub rejected dev=0x%02X cmd=0x%02X",
                dev_lo, cmd_lo,
            )
            return False
        # persist_command_record (unlike persist_ir_blob) does not register
        # the new command in the device's family-0x61 display-sort table;
        # without a slot the command plays fine but stays off the remote's
        # device-browse screen. Best-effort, same as the IR path.
        self._register_command_in_device_sort(
            dev_lo=dev_lo,
            new_command_id=cmd_lo,
            ack_timeout=5.0,
        )
        return True

    def _sync_step_command_payload(self, payload: Mapping[str, Any]) -> bool:
        """Overwrite one command's payload in place (family-0x0E record write).

        Backs live command-payload editing: the user fetched a command's blob
        on demand, edited it, and the device Sync folds the change in here. The
        in-place overwrite is bench-validated on X1 + X1S (see
        live-hub-testing.md "Validated: in-place command-payload overwrite").

        Resolves the final bytes exactly like the restore path: a structured
        edit (``decoded.edited``) is re-encoded and round-trip-verified via
        :meth:`_edited_command_data_hex`; a raw-hex edit uses ``data_hex``. The
        preserved ``button_code`` / ``library_type`` come from
        ``state.command_metadata`` (populated by the command-list fetch the
        sync pre-flight runs), so bindings / macros that reference the
        command's 48-bit code keep resolving.
        """
        device_id = int(payload.get("device_id") or 0)
        command_id = int(payload.get("command_id") or 0)
        dev_lo = device_id & 0xFF
        cmd_lo = command_id & 0xFF
        if not dev_lo or not cmd_lo:
            self._log.warning("[DEVICE_SYNC] command_payload: missing device/command id")
            return False

        restore_data = payload.get("restore_data")
        if not isinstance(restore_data, Mapping):
            self._log.warning(
                "[DEVICE_SYNC] command_payload: no restore_data dev=0x%02X cmd=0x%02X",
                dev_lo, cmd_lo,
            )
            return False
        restore_data = dict(restore_data)

        try:
            edited_hex = self._edited_command_data_hex(restore_data, cmd_lo)
        except ValueError:
            self._log.exception(
                "[DEVICE_SYNC] command_payload: edited payload re-encode failed "
                "dev=0x%02X cmd=0x%02X", dev_lo, cmd_lo,
            )
            return False
        data_hex = edited_hex if edited_hex is not None else str(restore_data.get("data_hex") or "").strip()
        if not data_hex:
            self._log.warning(
                "[DEVICE_SYNC] command_payload: empty payload dev=0x%02X cmd=0x%02X",
                dev_lo, cmd_lo,
            )
            return False
        try:
            library_data = bytes.fromhex(data_hex.replace("0x", "").strip())
        except ValueError:
            self._log.warning(
                "[DEVICE_SYNC] command_payload: payload is not valid hex dev=0x%02X cmd=0x%02X",
                dev_lo, cmd_lo,
            )
            return False

        # Preserve the command's canonical code + codec so downstream bindings
        # and macros keep resolving. These are populated by the command-list
        # fetch the sync pre-flight already ran; refuse rather than guess a
        # button_code if they are somehow missing.
        meta = (self.state.command_metadata.get(dev_lo) or {}).get(cmd_lo)
        if not isinstance(meta, Mapping):
            self._log.warning(
                "[DEVICE_SYNC] command_payload: no cached record metadata for "
                "dev=0x%02X cmd=0x%02X (cannot preserve button_code)", dev_lo, cmd_lo,
            )
            return False
        button_code = int(meta.get("button_code", 0)) & 0xFFFFFFFFFFFF
        library_type = int(meta.get("library_type", 0x0D)) & 0xFF
        command_name = str(payload.get("command_name") or "").strip()
        if not command_name:
            labels, _ = self.get_commands_for_entity(dev_lo, fetch_if_missing=False)
            command_name = str(dict(labels).get(cmd_lo) or "").strip()

        result = self.overwrite_command_payload(
            device_id=dev_lo,
            command_id=cmd_lo,
            command_name=command_name,
            library_type=library_type,
            library_data=library_data,
            button_code=button_code,
        )
        if not isinstance(result, dict) or result.get("status") != "success":
            self._log.warning(
                "[DEVICE_SYNC] command_payload: hub rejected dev=0x%02X cmd=0x%02X",
                dev_lo, cmd_lo,
            )
            return False
        return True

    def _sync_step_activity_rename(self, payload: Mapping[str, Any]) -> bool:
        """Rename an activity in place via a full activity-row rewrite.

        Read-modify-write of the row the confirm/finalize opcode carries: the
        name field sits at a fixed offset (ASCII on X1, UTF-16BE on X1S/X2)
        and every other byte of the row is preserved, so only the label
        changes. Mirrors the confirm send the device-delete flow already uses.
        """
        activity_id = int(payload.get("activity_id") or 0)
        act_lo = activity_id & 0xFF
        new_name = str(payload.get("name") or "")
        if not act_lo:
            return False

        # Reflect the new name in cached state first so the X1 builder (which
        # re-encodes from state) and any subsequent read see it. The X1S/X2
        # builder patches the raw row directly.
        activity = self.state.entities("activity").get(act_lo)
        if isinstance(activity, dict):
            activity["name"] = new_name

        confirm_payload = self._build_activity_confirm_payload(act_lo, name=new_name)
        if confirm_payload is None:
            self._log.warning("[ACTIVITY_SYNC] activity_rename: no row for act=0x%02X", act_lo)
            return False

        confirm_opcode = (
            OP_ACTIVITY_ASSIGN_FINALIZE
            if self.hub_version in (HUB_VERSION_X1S, HUB_VERSION_X2)
            else OP_ACTIVITY_CONFIRM
        )
        self.reset_ack_queues()
        self.wait_for_read_burst_quiesce()
        send_ts = time.monotonic()
        self._send_cmd_frame(confirm_opcode, confirm_payload)
        if self.wait_for_ack_any([(0x0103, None)], timeout=5.0, not_before=send_ts) is None:
            self._log.warning("[ACTIVITY_SYNC] activity_rename: missing ACK act=0x%02X", act_lo)
            return False
        return True

    def _sync_step_device_rename(self, payload: Mapping[str, Any]) -> bool:
        """Rename a device in place via a device-record update write.

        The device's cached record body is decoded to a full DeviceConfig,
        the name is swapped, and the canonical write body is rebuilt and
        committed with FAMILY_DEVICE_UPDATE for the device's own id — the same
        record write the create flow ends with. Rebuilding through the
        parser/builder pair (rather than patching bytes) keeps every other
        field, the header framing, and the body checksum correct.
        """
        device_id = int(payload.get("device_id") or 0)
        dev_lo = device_id & 0xFF
        new_name = str(payload.get("name") or "")
        new_brand = payload.get("brand")
        if not dev_lo:
            return False

        device = self.state.entities("device").get(dev_lo)
        raw = device.get("raw_body") if isinstance(device, dict) else None
        if not isinstance(raw, (bytes, bytearray)):
            self._log.warning("[DEVICE_SYNC] device_rename: no record body for dev=0x%02X", dev_lo)
            return False

        try:
            config = parse_device_record(bytes(raw), hub_version=self.hub_version, entity_kind="device")
            renamed = replace(config, name=new_name, device_id=dev_lo)
            if new_brand is not None:
                # Managed Wifi Devices carry their command-config identity in
                # the brand slot; a rename refreshes it in the same rewrite.
                renamed = replace(renamed, brand=str(new_brand))
            body = build_device_create_payload(renamed, hub_version=self.hub_version)
        except (ValueError, TypeError):
            self._log.exception("[DEVICE_SYNC] device_rename: could not rebuild record dev=0x%02X", dev_lo)
            return False

        step = CreateStep(
            label=f"device-rename[dev=0x{dev_lo:02X}]",
            family=FAMILY_DEVICE_UPDATE,
            payload=body,
            ack_opcode=ACK_OPCODE_STATUS,
            ack_first_byte=ACK_STATUS_BYTE_OK,
        )
        self.reset_ack_queues()
        result = run_create_sequence(self, [step])
        if not result.success:
            self._log.warning("[DEVICE_SYNC] device_rename: hub rejected dev=0x%02X", dev_lo)
            return False
        if isinstance(device, dict):
            device["name"] = new_name
            if new_brand is not None:
                device["brand"] = str(new_brand)
            # A later head-record step in the same plan (device_ip) rebuilds
            # from this cached body; keep it current so the writes compose.
            device["raw_body"] = body[3:]
        return True

    def _sync_step_device_ip(self, payload: Mapping[str, Any]) -> bool:
        """Update a device's head IP address via a device-record update write.

        Same record-rewrite primitive as :meth:`_sync_step_device_rename`:
        decode the cached record body, swap ``ip_address`` (empty clears the
        tail IP marker), rebuild the canonical write body, and commit it with
        FAMILY_DEVICE_UPDATE for the device's own id.
        """
        device_id = int(payload.get("device_id") or 0)
        dev_lo = device_id & 0xFF
        new_ip = str(payload.get("ip_address") or "") or None
        if not dev_lo:
            return False

        device = self.state.entities("device").get(dev_lo)
        raw = device.get("raw_body") if isinstance(device, dict) else None
        if not isinstance(raw, (bytes, bytearray)):
            self._log.warning("[DEVICE_SYNC] device_ip: no record body for dev=0x%02X", dev_lo)
            return False

        try:
            config = parse_device_record(bytes(raw), hub_version=self.hub_version, entity_kind="device")
            updated = replace(config, ip_address=new_ip, device_id=dev_lo)
            body = build_device_create_payload(updated, hub_version=self.hub_version)
        except (ValueError, TypeError):
            self._log.exception("[DEVICE_SYNC] device_ip: could not rebuild record dev=0x%02X", dev_lo)
            return False

        step = CreateStep(
            label=f"device-ip[dev=0x{dev_lo:02X}]",
            family=FAMILY_DEVICE_UPDATE,
            payload=body,
            ack_opcode=ACK_OPCODE_STATUS,
            ack_first_byte=ACK_STATUS_BYTE_OK,
        )
        self.reset_ack_queues()
        result = run_create_sequence(self, [step])
        if not result.success:
            self._log.warning("[DEVICE_SYNC] device_ip: hub rejected dev=0x%02X", dev_lo)
            return False
        if isinstance(device, dict):
            device["raw_body"] = body[3:]
        return True

    # ── In-place Wifi Command re-sync step drivers ───────────────────────
    #
    # These back the four step kinds new to build_wifi_inplace_plan. Each
    # frame is bench-validated on live X1 + X1S hubs — see
    # live-hub-testing.md "in-place wifi deploy" bench program (chunks 1–4).

    def _sync_step_command_delete(self, payload: Mapping[str, Any]) -> bool:
        """Delete one command slot from a device (bench chunk 2).

        Device-scoped reuse of the favorite/key delete frame:
        ``FAMILY_FAV_DELETE [dev, command_id]`` → ACK 0x0103, bare — no 0x65
        commit and no 0x61 sort rewrite. The hub cascades any favorite/binding
        that referenced the command, so no separate teardown is needed.
        """
        dev_lo = int(payload.get("device_id") or 0) & 0xFF
        cmd_lo = int(payload.get("command_id") or 0) & 0xFF
        if not dev_lo or not cmd_lo:
            return False
        self.reset_ack_queues()
        step = self._send_step(
            step_name=f"wifi-command-delete[dev=0x{dev_lo:02X} cmd=0x{cmd_lo:02X}]",
            family=FAMILY_FAV_DELETE,
            payload=bytes([dev_lo, cmd_lo]),
            ack_opcode=ACK_OPCODE_STATUS,
            timeout=5.0,
        )
        return step.ok

    def _sync_step_wifi_power_config(self, payload: Mapping[str, Any]) -> bool:
        """Rewrite a wifi device's POWER_ON/POWER_OFF command rows (chunk 1).

        A bare single family-0x12 macro-row write per changed button — no head
        write, no 0x41 enable, no activity write. The activity power macros
        resolve ``(dev, 0xC6)/(dev, 0xC7)`` through these device-side rows, so
        the rewrite propagates without touching any activity.
        """
        dev_lo = int(payload.get("device_id") or 0) & 0xFF
        if not dev_lo:
            return False
        ok = True
        for button_id, key in (
            (ButtonName.POWER_ON, "power_on_command_id"),
            (ButtonName.POWER_OFF, "power_off_command_id"),
        ):
            command_id = payload.get(key)
            if command_id is None:
                continue
            body = self._build_device_power_binding_payload(
                device_id=dev_lo, button_id=button_id, command_id=int(command_id)
            )
            self.reset_ack_queues()
            step = self._send_step(
                step_name=f"wifi-power[dev=0x{dev_lo:02X} btn=0x{button_id:02X}]",
                family=0x12,
                payload=body,
                ack_opcode=0x0112,
                ack_first_byte=button_id,
                ack_fallback_opcodes=(ACK_OPCODE_STATUS,),
            )
            ok = ok and step.ok
        return ok

    def _sync_step_wifi_input_config(self, payload: Mapping[str, Any]) -> bool:
        """Rewrite a wifi device's input record in place (bench chunk 1).

        Re-runs the create path's input configuration with the new ordered
        input list; activities are untouched (their (dev,0xC5) ordinal steps
        keep meaning "position N of this list"). An empty desired list is a
        no-op: the create helper has no clear form, and with every activity
        ordinal at 0 the stale record entries are unreachable.
        """
        dev_lo = int(payload.get("device_id") or 0) & 0xFF
        if not dev_lo:
            return False
        input_command_ids = [int(c) for c in payload.get("input_command_ids") or []]
        if not input_command_ids:
            self._log.info(
                "[DEVICE_SYNC] wifi_input_config: empty input list dev=0x%02X — "
                "leaving the stale record (no clear form; ordinals are 0)",
                dev_lo,
            )
            return True
        labels = {
            int(k): str(v) for k, v in (payload.get("labels") or {}).items()
        }
        max_id = max(input_command_ids)
        command_defs = [
            {
                "display_name": labels.get(cid, f"Command {cid}"),
                "trigger_name": labels.get(cid, f"Command {cid}"),
                "press_type": "short",
                "command_index": cid - 1,
            }
            for cid in range(1, max_id + 1)
        ]
        device = self.state.entities("device").get(dev_lo) or {}
        return bool(
            self._apply_wifi_input_configuration(
                device_id=dev_lo,
                device_name=str(device.get("name") or ""),
                ip_address=self.get_routed_local_ip(),
                brand_name=str(device.get("brand") or "m3tac0de"),
                commands=command_defs,
                input_command_ids=input_command_ids,
            )
        )

    def _sync_step_membership_remove(self, payload: Mapping[str, Any]) -> bool:
        """Remove a device from one activity by rewriting the activity's
        POWER_ON macro without the device's rows (bench chunk 3).

        The firmware cascades the rest: it strips the device from POWER_OFF,
        the member table, and its bindings/favorites. The raw label slot must
        be preserved verbatim or the save is rejected 0x0c. A no-op (device
        already absent from POWER_ON) succeeds without a write.
        """
        dev_lo = int(payload.get("device_id") or 0) & 0xFF
        act_lo = int(payload.get("activity_id") or 0) & 0xFF
        if not dev_lo or not act_lo:
            return False
        self.reset_ack_queues()
        self.wait_for_read_burst_quiesce()
        self._send_cmd_frame(OP_REQ_MACRO_LABELS, bytes([act_lo, ButtonName.POWER_ON & 0xFF]))
        record = self.wait_for_macro_record(act_lo, ButtonName.POWER_ON, timeout=5.0)
        if record is None:
            self._log.warning(
                "[DEVICE_SYNC] membership_remove: no POWER_ON macro act=0x%02X", act_lo
            )
            return False
        filtered = tuple(
            entry
            for entry in record.key_sequence
            if entry.is_delay_only or (entry.device_id & 0xFF) != dev_lo
        )
        if len(filtered) == len(record.key_sequence):
            return True  # device not referenced — already removed
        body = build_macro_save_payload(
            activity_id=act_lo,
            key_id=ButtonName.POWER_ON,
            key_sequence=filtered,
            label="POWER_ON",
            hub_version=self.hub_version,
            label_slot=record.raw_label_slot or None,
        )
        ack = self._send_paged_macro_save(
            payload=body, macro_button=ButtonName.POWER_ON, ack_timeout=5.0
        )
        return ack is not None

    def _sync_step_wifi_head_commit(self, payload: Mapping[str, Any]) -> bool:
        """Commit a managed wifi device's name + brand hash (bench chunk 4).

        Rebuilds the head via the wifi-aware ``_build_wifi_device_payload``
        carrying ``wifi_power_state`` read from the *current* head — without
        that carry the default resets ``is_power_configured`` and breaks X1S
        activity-driven power/input callback delivery. This is the LAST step of
        an in-place re-sync (the commit marker: an interrupted deploy leaves the
        brand hash unwritten, so the device reads out-of-step and re-offers
        sync).
        """
        dev_lo = int(payload.get("device_id") or 0) & 0xFF
        if not dev_lo:
            return False
        new_name = str(payload.get("name") or "")
        new_brand = payload.get("brand")

        device = self.state.entities("device").get(dev_lo)
        raw = device.get("raw_body") if isinstance(device, dict) else None
        wifi_power_state: tuple[int, int, int] | None = None
        if isinstance(raw, (bytes, bytearray)):
            try:
                config = parse_device_record(
                    bytes(raw), hub_version=self.hub_version, entity_kind="device"
                )
                wifi_power_state = (config.power_mode, config.power_style, config.tail_marker)
            except (ValueError, TypeError):
                wifi_power_state = None

        ip_device = self.hub_version in (HUB_VERSION_X1S, HUB_VERSION_X2)
        body = self._build_wifi_device_payload(
            device_name=new_name,
            ip_address=self.get_routed_local_ip(),
            state_byte=0x01,
            device_id=dev_lo,
            ip_device=ip_device,
            brand_name=str(new_brand) if new_brand is not None else "m3tac0de",
            wifi_power_state=wifi_power_state,
        )
        self.reset_ack_queues()
        step = self._send_step(
            step_name=f"wifi-head-commit[dev=0x{dev_lo:02X}]",
            family=0x08,
            payload=body,
            ack_opcode=ACK_OPCODE_STATUS,
            timeout=5.0,
        )
        if step.ok and isinstance(device, dict):
            device["name"] = new_name
            if new_brand is not None:
                device["brand"] = str(new_brand)
        return step.ok

    def run_wifi_inplace_plan(
        self,
        plan: Any,
        *,
        progress_callback: Callable[..., None] | None = None,
    ) -> dict[str, Any]:
        """Walk a :class:`WifiInplacePlan` step by step, ack-gated and serial.

        Mirrors :meth:`sync_device`'s orchestration: per-step progress, stop on
        the first rejected write (the brand-hash commit is last, so a stop
        leaves the device reading out-of-step). ``plan.fallback_reason`` must be
        checked by the caller before calling this — a fallback plan has no
        steps and is a caller-side signal to use the replace path.
        """
        steps = tuple(getattr(plan, "steps", ()) or ())

        def _progress(**data: Any) -> None:
            if callable(progress_callback):
                progress_callback(**data)

        if not self.can_issue_commands():
            return {"status": "failed", "failed_at": "unavailable",
                    "message": "The hub is not reachable (the Sofabaton app may be connected)."}

        total = len(steps)
        counters: dict[str, int] = {}
        for index, step in enumerate(steps):
            _progress(phase="writing", message=step.label, completed_steps=index, total_steps=total)
            ok = self._dispatch_activity_sync_step(step)
            if not ok:
                # Every in-place step is an idempotent rewrite, so a transient
                # ack miss (observed live: a macro-save ack lost under
                # background hub traffic) is safely retried once.
                self._log.warning(
                    "[WIFI_INPLACE] step %s failed; retrying once", step.kind
                )
                time.sleep(2.0)
                ok = self._dispatch_activity_sync_step(step)
            if not ok:
                return {"status": "failed", "failed_at": step.kind,
                        "message": f"The hub rejected: {step.label}", "completed_steps": index}
            counters[step.kind] = counters.get(step.kind, 0) + 1
        _progress(phase="completed", message="Synced to hub.", completed_steps=total, total_steps=total)
        return {"status": "success", "completed_steps": total, "total_steps": total, "counters": counters}

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
