"""Executor orchestration tests (Phase L4).

The wire builders are gated by the live-hub checklist; these tests verify
the orchestration — plan dispatch, ordering, ack-failure stop, stale
pre-flight, and the progress contract — against a fake proxy that records
every driver call and can simulate a rejection.
"""

from __future__ import annotations

import copy
import logging
from types import SimpleNamespace

from custom_components.sofabaton_x1s.lib.proxy_activity_sync import ActivitySyncMixin
from tests.test_activity_sync_plan import base_bundle, _activity, _device, ACTIVITY_ID
from tests.test_device_sync_plan import base_bundle as device_base_bundle, DEVICE_ID


class FakeProxy(ActivitySyncMixin):
    def __init__(self, *, fresh_activity: dict, fail_kind: str | None = None) -> None:
        self._log = logging.getLogger("test.activity_sync")
        self._fresh_activity = fresh_activity
        self._fail_kind = fail_kind
        self.calls: list[tuple] = []
        self.can_issue = True
        self.hub_version = "X1S"
        self.macro_records: list[object] = []
        # command_payload deps: metadata the executor reads button_code /
        # library_type back from, plus the command label map.
        self.state = SimpleNamespace(command_metadata={})
        self.command_labels: dict[int, str] = {}

    # Environment
    def can_issue_commands(self) -> bool:
        return self.can_issue

    def backup_activity(self, activity_id, **_kw):
        if isinstance(self._fresh_activity, list):
            # A queue of reads: pop until one remains, then repeat the last.
            if len(self._fresh_activity) > 1:
                return self._fresh_activity.pop(0)
            return self._fresh_activity[0]
        return self._fresh_activity

    def backup_device(self, device_id, **kw):
        self.calls.append(("backup_device", (device_id,), kw))
        return self._fresh_device

    _fresh_device: dict | None = None

    # Drivers — record and honour the simulated rejection.
    def _record(self, kind, *args, **kwargs):
        self.calls.append((kind, args, kwargs))
        return None if self._fail_kind == kind else {"status": "success"}

    def command_to_button(self, *a, **k):
        return self._record("binding_write", *a, **k)

    def command_to_favorite(self, *a, **k):
        return self._record("favorite_add", *a, **k)

    def delete_favorite(self, *a, **k):
        return self._record("favorite_delete", *a, **k)

    def reorder_favorites(self, *a, **k):
        return self._record("favorite_order", *a, **k)

    def add_device_to_activity(self, *a, **k):
        return self._record("member_replay", *a, **k)

    def set_idle_behavior(self, *a, **k):
        return {"status": "success"} if self._record("idle_behavior", *a, **k) else False

    def request_activity_mapping(self, act):
        self.calls.append(("remote_sync", (act,), {}))
        return True

    # Low-level primitives (stubbed so wire bytes aren't exercised here).
    def _activity_sync_delete_key(self, activity_id, button_id):
        return bool(self._record("delete_key", activity_id, button_id))

    def _send_paged_macro_save(self, *, payload, macro_button, **_kw):
        return self._record("macro_write", macro_button, payload)

    def get_cached_macro_records(self, activity_id):
        return list(self.macro_records)

    # command_payload executor deps.
    def get_commands_for_entity(self, entity_id, *, fetch_if_missing=False):
        return dict(self.command_labels), True

    def overwrite_command_payload(self, **kwargs):
        self.calls.append(("command_payload", (), kwargs))
        return None if self._fail_kind == "command_payload" else {"status": "success"}

    # command_add executor deps: the two persist primitives plus the
    # family-0x61 sort registration persist_command_record leaves to the
    # caller.
    def persist_ir_blob(self, **kwargs):
        self.calls.append(("persist_ir_blob", (), kwargs))
        return None if self._fail_kind == "command_add" else {"status": "success"}

    def persist_command_record(self, **kwargs):
        self.calls.append(("persist_command_record", (), kwargs))
        return None if self._fail_kind == "command_add" else {"status": "success"}

    def _register_command_in_device_sort(self, **kwargs):
        self.calls.append(("command_sort", (), kwargs))

    def _edited_command_data_hex(self, restore_data, command_id):
        # Raw-edit path by default (returns None → executor uses data_hex);
        # the decoded re-encode is covered by test_restore_edited_commands.
        # Tests override this for the decoded case.
        return None

    # command_rename executor dep: single-command blob dump. Tests seed
    # command_blobs[cmd] with the raw dump hex (payload + a 1-byte tail).
    command_blobs: dict[int, str] = {}

    def request_ir_command_dump(self, device_id, *, command_id=None, timeout=10.0):
        blob = self.command_blobs.get(int(command_id))
        if blob is None:
            return {"commands": []}
        return {"commands": [{"command_id": int(command_id), "ir_blob_hex": blob}]}


class DeleteKeyProxy(ActivitySyncMixin):
    def __init__(self) -> None:
        self.reset_count = 0
        self.steps: list[dict] = []

    def reset_ack_queues(self):
        self.reset_count += 1

    def _send_step(self, **kwargs):
        self.steps.append(kwargs)
        return SimpleNamespace(ok=True)


def _kinds(calls):
    return [call[0] for call in calls]


def test_noop_returns_success_without_writes():
    base = base_bundle()
    proxy = FakeProxy(fresh_activity=_activity(base))
    result = proxy.sync_activity(baseline=base, edited=copy.deepcopy(base), activity_id=ACTIVITY_ID)
    assert result["status"] == "success"
    assert result["total_steps"] == 0
    assert proxy.calls == []


def test_full_edit_dispatches_in_plan_order_and_reports_counters():
    base = base_bundle()
    edited = copy.deepcopy(base)
    _activity(edited)["favorite_slots"].append(
        {"button_id": 9, "device_id": 3, "command_id": 31, "name": "Netflix"}
    )
    _device(edited, 2)["device"]["idle_behavior"] = 1
    proxy = FakeProxy(fresh_activity=_activity(base))

    result = proxy.sync_activity(baseline=base, edited=edited, activity_id=ACTIVITY_ID)

    assert result["status"] == "success"
    kinds = _kinds(proxy.calls)
    # member_replay (device 3 became a member) precedes favorite_add,
    # idle_behavior is ordered late, remote_sync is the tail, plus the final
    # request_activity_mapping refresh.
    assert kinds.index("member_replay") < kinds.index("favorite_add")
    assert kinds.index("favorite_add") < kinds.index("idle_behavior")
    assert kinds[-1] == "remote_sync"
    assert result["counters"]["favorite_add"] == 1


def test_member_replay_threads_input_cmd_id_to_add_device():
    """BUG #8: the plan's member_replay carries the editor's "Set input"
    choice as ``input_cmd_id``; the executor must hand it through to
    ``add_device_to_activity`` so the from-scratch 0xC5 power-on row is
    written with the chosen input instead of duration 0."""
    base = base_bundle()
    _device(base, 3)["input_record"] = {
        "entries": [{"command_id": 54, "input_index": 4, "name": "Input blu-ray"}]
    }
    edited = copy.deepcopy(base)
    macro = next(m for m in _activity(edited)["macros"] if m["button_id"] == 198)
    macro["steps"].extend(
        [
            {"device_id": 3, "command_id": 0xC6, "button_code": 0, "duration": 1, "delay": 255},
            {"device_id": 3, "command_id": 0xC5, "button_code": 0, "duration": 4, "delay": 255},
        ]
    )
    proxy = FakeProxy(fresh_activity=_activity(base))

    result = proxy.sync_activity(baseline=base, edited=edited, activity_id=ACTIVITY_ID)

    assert result["status"] == "success"
    replay = next(call for call in proxy.calls if call[0] == "member_replay")
    assert replay[1] == (ACTIVITY_ID, 3)
    assert replay[2] == {"input_cmd_id": 54}


def test_favorite_reorder_resolves_content_to_current_fav_ids():
    base = base_bundle()
    edited = copy.deepcopy(base)
    # Swap the two favorites (positional button_ids, content flipped).
    _activity(edited)["favorite_slots"] = [
        {"button_id": 1, "device_id": 2, "command_id": 20, "name": "Bar Power"},
        {"button_id": 2, "device_id": 1, "command_id": 10, "name": "TV Power"},
    ]
    proxy = FakeProxy(fresh_activity=_activity(base))
    # The hub's live favorites map content → fav_id (arbitrary ids, not 1..N).
    proxy._activity_sync_current_favorite_fav_ids = lambda _act: {(2, 20): 7, (1, 10): 3}

    result = proxy.sync_activity(baseline=base, edited=edited, activity_id=ACTIVITY_ID)

    assert result["status"] == "success"
    order_call = next(c for c in proxy.calls if c[0] == "favorite_order")
    # Bar Power then TV Power, resolved to the hub's live fav_ids [7, 3].
    assert order_call[1][1] == [7, 3]


def test_macro_move_reorders_by_baseline_key_id_without_rewrite():
    """A quick-access move of a macro must not delete/recreate the macro
    record; the executor receives the combined order (favorites as content,
    the macro by its baseline hub key id) and writes one 0x61 sort page."""
    base = base_bundle()
    _activity(base)["macros"].append(
        {"button_id": 3, "name": "Combo", "steps": [
            {"device_id": 1, "command_id": 10, "button_code": 0, "duration": 0, "delay": 255},
        ]}
    )
    edited = copy.deepcopy(base)
    _activity(edited)["macros"] = [
        {"button_id": 1, "name": "Combo", "steps": [
            {"device_id": 1, "command_id": 10, "button_code": 0, "duration": 0, "delay": 255},
        ]},
        *[m for m in _activity(edited)["macros"] if m["button_id"] in (198, 199)],
    ]
    _activity(edited)["favorite_slots"] = [
        {"button_id": 2, "device_id": 1, "command_id": 10, "name": "TV Power"},
        {"button_id": 3, "device_id": 2, "command_id": 20, "name": "Bar Power"},
    ]
    proxy = FakeProxy(fresh_activity=_activity(base))
    proxy._activity_sync_current_favorite_fav_ids = lambda _act: {(1, 10): 1, (2, 20): 2}

    result = proxy.sync_activity(baseline=base, edited=edited, activity_id=ACTIVITY_ID)

    assert result["status"] == "success"
    kinds = _kinds(proxy.calls)
    assert "macro_write" not in kinds
    assert "delete_key" not in kinds
    order_call = next(c for c in proxy.calls if c[0] == "favorite_order")
    # Macro key 3 first, then the favorites' live fav_ids.
    assert order_call[1][1] == [3, 1, 2]


def test_new_macro_enters_order_at_allocated_id():
    """A NEW macro's order entry follows the id the allocator assigned (the
    editor's proposal may be occupied by a live favorite) and is registered
    in the sort table even when appended at the tail."""
    base = base_bundle()
    edited = copy.deepcopy(base)
    _activity(edited)["macros"].append(
        {"button_id": 2, "name": "Bench macro", "steps": [
            {"device_id": 1, "command_id": 10, "button_code": 0, "duration": 0, "delay": 255},
        ]}
    )
    proxy = FakeProxy(fresh_activity=_activity(base))
    # Proposal 2 is occupied by a live favorite → allocator lands on 3.
    proxy._activity_sync_current_favorite_fav_ids = lambda _act: {(1, 10): 1, (2, 20): 2}

    result = proxy.sync_activity(baseline=base, edited=edited, activity_id=ACTIVITY_ID)

    assert result["status"] == "success"
    macro_write = next(c for c in proxy.calls if c[0] == "macro_write")
    assert macro_write[1][0] == 3  # allocated, not the proposal
    order_call = next(c for c in proxy.calls if c[0] == "favorite_order")
    assert order_call[1][1] == [1, 2, 3]


def test_step_rejection_stops_and_reports_failed_at():
    base = base_bundle()
    edited = copy.deepcopy(base)
    _activity(edited)["favorite_slots"].append(
        {"button_id": 9, "device_id": 3, "command_id": 31, "name": "Netflix"}
    )
    proxy = FakeProxy(fresh_activity=_activity(base), fail_kind="favorite_add")

    result = proxy.sync_activity(baseline=base, edited=edited, activity_id=ACTIVITY_ID)

    assert result["status"] == "failed"
    assert result["failed_at"].startswith("favorite_add")
    # No idle/remote steps ran after the rejected favorite_add.
    assert "remote_sync" not in _kinds(proxy.calls)


def test_activity_sync_delete_key_allows_slow_status_ack():
    proxy = DeleteKeyProxy()

    result = proxy._activity_sync_delete_key(0x65, 0x01)

    assert result is True
    assert proxy.reset_count == 1
    delete_step = proxy.steps[0]
    assert delete_step["step_name"] == "activity-sync-delete-10[act=0x65 key=0x01]"
    assert delete_step["ack_opcode"] == 0x0103
    assert delete_step["timeout"] >= 10.0
    commit_step = proxy.steps[1]
    assert commit_step["step_name"] == "activity-sync-delete-commit-65[act=0x65]"
    assert "timeout" not in commit_step


def test_macro_write_passes_label_hub_version_and_preserves_power_label_slot():
    base = base_bundle()
    edited = copy.deepcopy(base)
    _activity(edited)["macros"][0]["steps"].append(
        {"device_id": 1, "command_id": 10, "button_code": 0x010203040506, "duration": 0, "delay": 0}
    )
    proxy = FakeProxy(fresh_activity=_activity(base))
    raw_label_slot = "POWER_ON".encode("utf-16-be").ljust(58, b"\x00") + b"\x12\x34"
    proxy.macro_records = [SimpleNamespace(key_id=198, raw_label_slot=raw_label_slot)]

    result = proxy.sync_activity(baseline=base, edited=edited, activity_id=ACTIVITY_ID)

    assert result["status"] == "success"
    macro_call = next(call for call in proxy.calls if call[0] == "macro_write")
    assert macro_call[1][0] == 198
    assert isinstance(macro_call[1][1], bytes)
    assert raw_label_slot in macro_call[1][1]


def test_stale_preflight_blocks_before_any_write():
    base = base_bundle()
    edited = copy.deepcopy(base)
    _activity(edited)["favorite_slots"].append(
        {"button_id": 9, "device_id": 3, "command_id": 31, "name": "Netflix"}
    )
    # Hub now reports a different activity block than the captured baseline.
    stale = copy.deepcopy(_activity(base))
    stale["favorite_slots"].append({"button_id": 5, "device_id": 1, "command_id": 11, "name": "Sneaky"})
    proxy = FakeProxy(fresh_activity=stale)

    result = proxy.sync_activity(baseline=base, edited=edited, activity_id=ACTIVITY_ID)

    assert result["status"] == "failed"
    assert result["failed_at"] == "stale_check"
    assert proxy.calls == []


def test_stale_preflight_ignores_capture_noise_and_row_order():
    base = base_bundle()
    edited = copy.deepcopy(base)
    _activity(edited)["favorite_slots"].append(
        {"button_id": 9, "device_id": 3, "command_id": 31, "name": "Netflix"}
    )
    fresh = copy.deepcopy(_activity(base))
    fresh["device"]["name"] = "Same hub state, different exported label"
    fresh["favorite_slots"] = list(reversed(fresh["favorite_slots"]))
    for slot in fresh["favorite_slots"]:
        slot["button_id"] = int(slot["button_id"]) + 20
        slot["source"] = "keymap"
        slot["name"] = "ignored cache label"
    fresh["button_bindings"] = list(reversed(fresh["button_bindings"]))
    for binding in fresh["button_bindings"]:
        binding["button_name"] = "Ignored display name"
        binding["long_press_device_id"] = binding.get("long_press_device_id") or 0
        binding["long_press_command_id"] = binding.get("long_press_command_id") or 0
    fresh["macros"] = list(reversed(fresh["macros"]))
    for macro in fresh["macros"]:
        macro["name"] = f"ignored label {macro['button_id']}"
    proxy = FakeProxy(fresh_activity=fresh)

    result = proxy.sync_activity(baseline=base, edited=edited, activity_id=ACTIVITY_ID)

    assert result["status"] == "success"
    assert "favorite_add" in _kinds(proxy.calls)


def test_stale_preflight_ignores_hub_canonicalized_power_durations():
    """The hub rewrites the duration byte on 0xC6/0xC7 power rows after the
    sync's own post-write re-read (it lands with the closing remote-sync), so
    a second sync in the same editor session must not read that as a foreign
    hub edit. The 0xC5 input-ordinal duration stays significant."""

    base = base_bundle()
    edited = copy.deepcopy(base)
    _activity(edited)["favorite_slots"].append(
        {"button_id": 9, "device_id": 3, "command_id": 31, "name": "Netflix"}
    )
    fresh = copy.deepcopy(_activity(base))
    for macro in fresh["macros"]:
        for step in macro["steps"]:
            if step["command_id"] in (0xC6, 0xC7):
                step["duration"] = 1 - int(step["duration"])  # flip every power-row duration
    proxy = FakeProxy(fresh_activity=fresh)

    result = proxy.sync_activity(baseline=base, edited=edited, activity_id=ACTIVITY_ID)

    assert result["status"] == "success"
    assert "favorite_add" in _kinds(proxy.calls)


def test_stale_preflight_still_flags_changed_input_ordinal():
    base = base_bundle()
    _activity(base)["macros"][0]["steps"].append(
        {"device_id": 1, "command_id": 0xC5, "button_code": 0, "duration": 1, "delay": 255}
    )
    edited = copy.deepcopy(base)
    _activity(edited)["favorite_slots"].append(
        {"button_id": 9, "device_id": 3, "command_id": 31, "name": "Netflix"}
    )
    fresh = copy.deepcopy(_activity(base))
    fresh["macros"][0]["steps"][-1]["duration"] = 2  # someone changed the input choice
    proxy = FakeProxy(fresh_activity=fresh)

    result = proxy.sync_activity(baseline=base, edited=edited, activity_id=ACTIVITY_ID)

    assert result["status"] == "failed"
    assert result["failed_at"] == "stale_check"


def test_stale_preflight_tolerates_hub_materialized_role_page_slot():
    """The hub derives role-page keymap slots from the target device's own
    device-mode page and materializes them minutes after a sync (BUG #4,
    X1S 2026-07-14): a binding row that mirrors the device page appearing
    on the hub is not a foreign edit."""

    base = base_bundle()
    _device(base, 3)["button_bindings"] = [{"button_id": 0xBD, "command_id": 31}]
    edited = copy.deepcopy(base)
    _activity(edited)["favorite_slots"].append(
        {"button_id": 9, "device_id": 3, "command_id": 31, "name": "Netflix"}
    )
    fresh = copy.deepcopy(_activity(base))
    fresh["button_bindings"].append({"button_id": 0xBD, "device_id": 3, "command_id": 31})
    proxy = FakeProxy(fresh_activity=fresh)

    result = proxy.sync_activity(baseline=base, edited=edited, activity_id=ACTIVITY_ID)

    assert result["status"] == "success"
    assert "favorite_add" in _kinds(proxy.calls)


def test_stale_preflight_tolerates_hub_dematerialized_role_page_slot():
    """The reverse flip: a device-page-mirroring row captured in the session
    baseline disappearing from the hub is the hub dropping its own derived
    slot, not a foreign delete."""

    base = base_bundle()
    _device(base, 3)["button_bindings"] = [{"button_id": 0xBD, "command_id": 31}]
    _activity(base)["button_bindings"].append(
        {"button_id": 0xBD, "device_id": 3, "command_id": 31}
    )
    edited = copy.deepcopy(base)
    _activity(edited)["favorite_slots"].append(
        {"button_id": 9, "device_id": 3, "command_id": 31, "name": "Netflix"}
    )
    fresh = copy.deepcopy(_activity(base))
    fresh["button_bindings"] = [
        row for row in fresh["button_bindings"] if int(row["button_id"]) != 0xBD
    ]
    proxy = FakeProxy(fresh_activity=fresh)

    result = proxy.sync_activity(baseline=base, edited=edited, activity_id=ACTIVITY_ID)

    assert result["status"] == "success"
    assert "favorite_add" in _kinds(proxy.calls)


def test_stale_preflight_role_tolerance_accepts_live_state_device_page():
    """The device page can flip between the session capture and the
    preflight; the live proxy cache is an equally valid reference."""

    base = base_bundle()  # no device button_bindings in the bundle
    edited = copy.deepcopy(base)
    _activity(edited)["favorite_slots"].append(
        {"button_id": 9, "device_id": 3, "command_id": 31, "name": "Netflix"}
    )
    fresh = copy.deepcopy(_activity(base))
    fresh["button_bindings"].append({"button_id": 0xBD, "device_id": 3, "command_id": 31})
    proxy = FakeProxy(fresh_activity=fresh)
    proxy.state.button_details = {3: {0xBD: {"device_id": 3, "command_id": 31}}}

    result = proxy.sync_activity(baseline=base, edited=edited, activity_id=ACTIVITY_ID)

    assert result["status"] == "success"
    assert "favorite_add" in _kinds(proxy.calls)


def test_stale_preflight_still_flags_binding_that_diverges_from_device_page():
    """A binding whose command (or long-press) does NOT mirror the device's
    device-mode page cannot be a hub-derived role slot — that is a real
    foreign edit and must stay stale."""

    base = base_bundle()
    _device(base, 3)["button_bindings"] = [{"button_id": 0xBD, "command_id": 31}]
    edited = copy.deepcopy(base)
    _activity(edited)["favorite_slots"].append(
        {"button_id": 9, "device_id": 3, "command_id": 31, "name": "Netflix"}
    )

    for foreign_row in (
        {"button_id": 0xBD, "device_id": 3, "command_id": 30},  # different command
        {"button_id": 0xBD, "device_id": 1, "command_id": 31},  # different device
        {"button_id": 0xBD, "device_id": 3, "command_id": 31,   # long press not on page
         "long_press_device_id": 3, "long_press_command_id": 30},
    ):
        fresh = copy.deepcopy(_activity(base))
        fresh["button_bindings"].append(dict(foreign_row))
        proxy = FakeProxy(fresh_activity=fresh)

        result = proxy.sync_activity(baseline=base, edited=edited, activity_id=ACTIVITY_ID)

        assert result["status"] == "failed", foreign_row
        assert result["failed_at"] == "stale_check", foreign_row
        assert proxy.calls == [], foreign_row


def test_stale_preflight_retries_through_transient_partial_reads():
    """One flaky hub re-read (observed live: a favorites fetch missing a slot
    the hub actually has) must not fail the sync — only a persistent
    mismatch across consecutive re-reads is stale."""

    base = base_bundle()
    edited = copy.deepcopy(base)
    _activity(edited)["favorite_slots"].append(
        {"button_id": 9, "device_id": 3, "command_id": 31, "name": "Netflix"}
    )
    partial = copy.deepcopy(_activity(base))
    partial["favorite_slots"] = partial["favorite_slots"][:1]  # transiently missing a slot
    good = copy.deepcopy(_activity(base))
    proxy = FakeProxy(fresh_activity=[partial, good])

    result = proxy.sync_activity(baseline=base, edited=edited, activity_id=ACTIVITY_ID)

    assert result["status"] == "success"
    assert "favorite_add" in _kinds(proxy.calls)


def test_stale_preflight_skips_incomplete_fresh_capture():
    base = base_bundle()
    edited = copy.deepcopy(base)
    _activity(edited)["favorite_slots"].append(
        {"button_id": 9, "device_id": 3, "command_id": 31, "name": "Netflix"}
    )
    fresh = copy.deepcopy(_activity(base))
    fresh["complete"] = False
    fresh["macros"] = []
    fresh["button_bindings"] = []
    proxy = FakeProxy(fresh_activity=fresh)

    result = proxy.sync_activity(baseline=base, edited=edited, activity_id=ACTIVITY_ID)

    assert result["status"] == "success"
    assert "favorite_add" in _kinds(proxy.calls)


def test_out_of_scope_plan_fails_before_writes():
    base = base_bundle()
    edited = copy.deepcopy(base)
    _device(edited, 3)["button_bindings"] = [{"button_id": 0xAE, "command_id": 30}]
    proxy = FakeProxy(fresh_activity=_activity(base))

    result = proxy.sync_activity(baseline=base, edited=edited, activity_id=ACTIVITY_ID)

    assert result["status"] == "failed"
    assert result["failed_at"] == "plan"
    assert proxy.calls == []


def test_unavailable_when_cannot_issue_commands():
    base = base_bundle()
    proxy = FakeProxy(fresh_activity=_activity(base))
    proxy.can_issue = False
    result = proxy.sync_activity(baseline=base, edited=copy.deepcopy(base), activity_id=ACTIVITY_ID)
    assert result["status"] == "failed"
    assert result["failed_at"] == "unavailable"


# ── Device sync orchestration (live device editor) ─────────────────────


def _device_of(bundle: dict, device_id: int = DEVICE_ID) -> dict:
    return next(d for d in bundle["devices"] if d["device"]["device_id"] == device_id)


def test_device_sync_dispatches_with_device_entity_id_and_refreshes():
    base = device_base_bundle()
    edited = copy.deepcopy(base)
    _device_of(edited)["button_bindings"] = [{"button_id": 0xB0, "device_id": 1, "command_id": 11}]
    _device_of(edited)["device"]["idle_behavior"] = 1
    proxy = FakeProxy(fresh_activity=None)
    proxy._fresh_device = _device_of(base)

    result = proxy.sync_device(baseline=base, edited=edited, device_id=DEVICE_ID)

    assert result["status"] == "success"
    kinds = _kinds(proxy.calls)
    assert kinds.index("binding_write") < kinds.index("idle_behavior")
    # command_to_button is addressed with the device id as the keymap entity id.
    binding_call = next(call for call in proxy.calls if call[0] == "binding_write")
    assert binding_call[1][0] == DEVICE_ID
    # Tail refresh re-reads the device (blob-free) after the writes.
    assert kinds[-1] == "backup_device"
    assert proxy.calls[-1][2].get("include_blobs") is False


def test_device_macro_write_uses_the_single_page_device_builder():
    base = device_base_bundle()
    edited = copy.deepcopy(base)
    # Edit the power-on sequence: one command step plus a delay row.
    _device_of(edited)["macros"][0]["steps"] = [
        {"command_id": 10, "duration": 4, "delay": 255},
        {"command_id": 255, "duration": 255, "delay": 3},
    ]
    proxy = FakeProxy(fresh_activity=None)
    proxy._fresh_device = _device_of(base)
    frames: list[tuple[int, bytes]] = []
    proxy._send_family_frame = lambda family, payload: frames.append((family, payload))
    proxy.wait_for_ack_any = lambda candidates, **kw: (candidates[0][0], b"\xc6")
    proxy.reset_ack_queues = lambda: None

    result = proxy.sync_device(baseline=base, edited=edited, device_id=DEVICE_ID)

    assert result["status"] == "success"
    assert len(frames) == 1
    family, payload = frames[0]
    assert family == 0x12
    # Outer page wrapper [01 00 01], then body [01 00 01][dev][key][count]
    # followed by 10-byte step rows.
    assert payload[0:3] == b"\x01\x00\x01"
    assert payload[3:6] == b"\x01\x00\x01"
    assert payload[6] == DEVICE_ID
    assert payload[7] == 198
    assert payload[8] == 2
    step1 = payload[9:19]
    assert step1[0] == DEVICE_ID          # device byte defaults to self
    assert step1[1] == 10                 # command id
    assert int.from_bytes(step1[2:8], "big") == 0x4E20 + 10  # synthetic code
    assert step1[8] == 4 and step1[9] == 255
    step2 = payload[19:29]
    assert step2[:9] == b"\xff" * 9 and step2[9] == 3  # delay sentinel row


def test_device_sync_stale_preflight_blocks_before_any_write():
    base = device_base_bundle()
    edited = copy.deepcopy(base)
    edited_dev = _device_of(edited)
    edited_dev["button_bindings"] = []
    stale = copy.deepcopy(_device_of(base))
    stale["button_bindings"].append({"button_id": 0xB6, "device_id": 1, "command_id": 11})
    proxy = FakeProxy(fresh_activity=None)
    proxy._fresh_device = stale

    result = proxy.sync_device(baseline=base, edited=edited, device_id=DEVICE_ID)

    assert result["status"] == "failed"
    assert result["failed_at"] == "stale_check"
    # Preflight reads only (retried while mismatched), never a write.
    assert set(_kinds(proxy.calls)) == {"backup_device"}


def test_device_sync_out_of_scope_plan_fails_before_writes():
    base = device_base_bundle()
    edited = copy.deepcopy(base)
    # Adding a command changes the command-id set — still out of scope.
    _device_of(edited)["commands"].append({"command_id": 99, "name": "Ghost"})
    proxy = FakeProxy(fresh_activity=None)
    proxy._fresh_device = _device_of(base)

    result = proxy.sync_device(baseline=base, edited=edited, device_id=DEVICE_ID)

    assert result["status"] == "failed"
    assert result["failed_at"] == "plan"
    assert proxy.calls == []


def test_device_sync_progress_carries_device_id():
    base = device_base_bundle()
    edited = copy.deepcopy(base)
    _device_of(edited)["device"]["idle_behavior"] = 1
    proxy = FakeProxy(fresh_activity=None)
    proxy._fresh_device = _device_of(base)
    events: list[dict] = []

    proxy.sync_device(
        baseline=base, edited=edited, device_id=DEVICE_ID,
        progress_callback=lambda **payload: events.append(payload),
    )

    phases = [e.get("phase") for e in events]
    assert phases[-1] == "completed"
    assert all("current_device_id" in e for e in events)


def test_progress_contract_matches_restore_shape():
    base = base_bundle()
    edited = copy.deepcopy(base)
    _activity(edited)["favorite_slots"].append(
        {"button_id": 9, "device_id": 3, "command_id": 31, "name": "Netflix"}
    )
    proxy = FakeProxy(fresh_activity=_activity(base))
    events: list[dict] = []
    proxy.sync_activity(
        baseline=base, edited=edited, activity_id=ACTIVITY_ID,
        progress_callback=lambda **payload: events.append(payload),
    )
    phases = [e.get("phase") for e in events]
    assert "stale_check" in phases
    assert "writing" in phases
    assert phases[-1] == "completed"
    last = events[-1]
    assert last["completed_steps"] == last["total_steps"]
    assert "current_activity_id" in last


# ── command_payload executor (live payload overwrite) ──────────────────


def _edit_command_payload(bundle: dict, *, restore_data: dict, device_id: int = DEVICE_ID, command_id: int = 10) -> None:
    command = next(
        c for c in _device_of(bundle, device_id)["commands"] if c["command_id"] == command_id
    )
    command["restore_data"] = restore_data


def test_command_payload_raw_edit_overwrites_preserving_code_and_type():
    base = device_base_bundle()
    edited = copy.deepcopy(base)
    _edit_command_payload(edited, restore_data={
        "library_type": 0x0D, "button_code": 999, "data_hex": "0a 4f 23", "edited": True,
    })
    proxy = FakeProxy(fresh_activity=None)
    proxy._fresh_device = _device_of(base)
    # button_code / library_type are preserved from cached metadata, NOT from
    # the (fetch-provided, code-less) restore_data.
    proxy.state.command_metadata = {DEVICE_ID: {10: {"library_type": 0x0D, "button_code": 0x0102}}}

    result = proxy.sync_device(baseline=base, edited=edited, device_id=DEVICE_ID)

    assert result["status"] == "success"
    call = next(c for c in proxy.calls if c[0] == "command_payload")
    kw = call[2]
    assert kw["device_id"] == DEVICE_ID
    assert kw["command_id"] == 10
    assert kw["command_name"] == "Power"           # from the plan payload
    assert kw["library_data"] == bytes.fromhex("0a4f23")
    assert kw["button_code"] == 0x0102             # cached metadata, not restore_data's 999
    assert kw["library_type"] == 0x0D


def test_command_payload_decoded_edit_uses_reencoded_bytes():
    base = device_base_bundle()
    edited = copy.deepcopy(base)
    _edit_command_payload(edited, restore_data={
        "library_type": 0x0D, "button_code": 1, "data_hex": "0a 4f 22",
        "decoded": {"class": "ir", "trailer_hex": "", "fields": {}, "edited": True},
    })
    proxy = FakeProxy(fresh_activity=None)
    proxy._fresh_device = _device_of(base)
    proxy.state.command_metadata = {DEVICE_ID: {10: {"library_type": 0x0D, "button_code": 0x0102}}}
    # Stand in for the real re-encode (its own tests live in
    # test_restore_edited_commands); return distinct bytes so we can assert
    # the executor prefers the re-encode over data_hex.
    proxy._edited_command_data_hex = lambda restore_data, command_id: "aabbcc"

    result = proxy.sync_device(baseline=base, edited=edited, device_id=DEVICE_ID)

    assert result["status"] == "success"
    call = next(c for c in proxy.calls if c[0] == "command_payload")
    assert call[2]["library_data"] == bytes.fromhex("aabbcc")


def test_command_payload_refuses_when_metadata_missing():
    base = device_base_bundle()
    edited = copy.deepcopy(base)
    _edit_command_payload(edited, restore_data={
        "library_type": 0x0D, "button_code": 1, "data_hex": "0a 4f 23", "edited": True,
    })
    proxy = FakeProxy(fresh_activity=None)
    proxy._fresh_device = _device_of(base)
    # No command_metadata for the target → executor refuses rather than write
    # a wrong (zero) button_code.

    result = proxy.sync_device(baseline=base, edited=edited, device_id=DEVICE_ID)

    assert result["status"] == "failed"
    assert result["failed_at"].startswith("command_payload")
    assert not any(c[0] == "command_payload" for c in proxy.calls)


# ── command_add executor (live add-command dialog) ────────────────────


def _append_new_command(bundle: dict, *, restore_data: dict, command_id: int = 12, name: str = "Netflix") -> None:
    _device_of(bundle)["commands"].append({
        "command_id": command_id,
        "name": name,
        "restore_data": {**restore_data, "new": True},
    })


def test_command_add_ir_descriptor_synthesizes_and_persists():
    from custom_components.sofabaton_x1s.lib.commands import build_descriptive_ir_blob_body

    base = device_base_bundle()
    edited = copy.deepcopy(base)
    _append_new_command(edited, restore_data={
        "transport": "hub_code_record",
        "decoded": {
            "class": "ir",
            "trailer_hex": "",
            "fields": {"descriptor": "P:Sony12 R:40000 D:1 F:18"},
            "edited": True,
        },
    })
    proxy = FakeProxy(fresh_activity=None)
    proxy._fresh_device = _device_of(base)

    result = proxy.sync_device(baseline=base, edited=edited, device_id=DEVICE_ID)

    assert result["status"] == "success"
    call = next(c for c in proxy.calls if c[0] == "persist_ir_blob")
    kw = call[2]
    assert kw["device_id"] == DEVICE_ID
    assert kw["command_id"] == 12
    assert kw["command_name"] == "Netflix"
    # Synthesis path: validated descriptor + writer trailing nulls, exactly
    # what the persist_ir_blob service would build for the same input.
    assert kw["blob"] == build_descriptive_ir_blob_body("P:Sony12 R:40000 D:1 F:18")
    # persist_ir_blob owns its own sort registration — no extra call.
    assert not any(c[0] == "command_sort" for c in proxy.calls)


def test_command_add_ir_rejects_bad_descriptor():
    base = device_base_bundle()
    edited = copy.deepcopy(base)
    _append_new_command(edited, restore_data={
        "transport": "hub_code_record",
        "decoded": {"class": "ir", "trailer_hex": "", "fields": {"descriptor": "not a descriptor"}, "edited": True},
    })
    proxy = FakeProxy(fresh_activity=None)
    proxy._fresh_device = _device_of(base)

    result = proxy.sync_device(baseline=base, edited=edited, device_id=DEVICE_ID)

    assert result["status"] == "failed"
    assert result["failed_at"].startswith("command_add")
    assert not any(c[0] == "persist_ir_blob" for c in proxy.calls)


def test_command_add_raw_clones_library_type_and_registers_sort():
    base = device_base_bundle()
    edited = copy.deepcopy(base)
    _append_new_command(edited, restore_data={
        "transport": "hub_code_record", "data_hex": "0a 4f 23",
    })
    proxy = FakeProxy(fresh_activity=None)
    proxy._fresh_device = _device_of(base)
    # Non-IR record write: library_type is cloned from an existing command's
    # cached metadata (a device's commands share one codec).
    proxy.state.command_metadata = {DEVICE_ID: {10: {"library_type": 0x03, "button_code": 0x0102}}}

    result = proxy.sync_device(baseline=base, edited=edited, device_id=DEVICE_ID)

    assert result["status"] == "success"
    call = next(c for c in proxy.calls if c[0] == "persist_command_record")
    kw = call[2]
    assert kw["device_id"] == DEVICE_ID
    assert kw["command_id"] == 12
    assert kw["command_name"] == "Netflix"
    assert kw["command_data"] == bytes.fromhex("0a4f23")
    assert kw["library_type"] == 0x03
    assert kw["command_code"] == 0  # hub assigns the canonical code on accept
    # The fresh record is appended to the device's display-sort table.
    sort_call = next(c for c in proxy.calls if c[0] == "command_sort")
    assert sort_call[2]["new_command_id"] == 12


def test_command_add_raw_refuses_without_metadata_to_clone():
    base = device_base_bundle()
    edited = copy.deepcopy(base)
    _append_new_command(edited, restore_data={
        "transport": "hub_code_record", "data_hex": "0a 4f 23",
    })
    proxy = FakeProxy(fresh_activity=None)
    proxy._fresh_device = _device_of(base)
    # No cached record metadata on the device → no library_type to clone.

    result = proxy.sync_device(baseline=base, edited=edited, device_id=DEVICE_ID)

    assert result["status"] == "failed"
    assert result["failed_at"].startswith("command_add")
    assert not any(c[0] == "persist_command_record" for c in proxy.calls)


def test_command_add_rejection_stops_the_sync():
    base = device_base_bundle()
    edited = copy.deepcopy(base)
    _append_new_command(edited, restore_data={
        "transport": "hub_code_record", "data_hex": "0a 4f 23",
    })
    _device_of(edited)["device"]["idle_behavior"] = 1
    proxy = FakeProxy(fresh_activity=None, fail_kind="command_add")
    proxy._fresh_device = _device_of(base)
    proxy.state.command_metadata = {DEVICE_ID: {10: {"library_type": 0x0D, "button_code": 0x0102}}}

    result = proxy.sync_device(baseline=base, edited=edited, device_id=DEVICE_ID)

    assert result["status"] == "failed"
    assert result["failed_at"].startswith("command_add")
    # The add precedes everything else, so nothing further ran.
    assert not any(c[0] == "idle_behavior" for c in proxy.calls)


# ── command_rename executor (live command rename) ─────────────────────


def test_command_rename_fetches_current_payload_and_relabels():
    base = device_base_bundle()
    edited = copy.deepcopy(base)
    _device_of(edited)["commands"][0]["name"] = "Power Toggle"
    proxy = FakeProxy(fresh_activity=None)
    proxy._fresh_device = _device_of(base)
    proxy.state.command_metadata = {DEVICE_ID: {10: {"library_type": 0x0D, "button_code": 0x0102}}}
    # Raw dump = payload bytes + a 1-byte replay tail (0xff) the write drops.
    proxy.command_blobs = {10: "0a 4f 22 ff"}

    result = proxy.sync_device(baseline=base, edited=edited, device_id=DEVICE_ID)

    assert result["status"] == "success"
    call = next(c for c in proxy.calls if c[0] == "command_payload")  # overwrite primitive
    kw = call[2]
    assert kw["command_name"] == "Power Toggle"
    assert kw["library_data"] == bytes.fromhex("0a4f22")  # tail stripped, payload preserved
    assert kw["button_code"] == 0x0102
    assert kw["library_type"] == 0x0D


def test_command_rename_refuses_when_payload_unreadable():
    base = device_base_bundle()
    edited = copy.deepcopy(base)
    _device_of(edited)["commands"][0]["name"] = "Power Toggle"
    proxy = FakeProxy(fresh_activity=None)
    proxy._fresh_device = _device_of(base)
    proxy.state.command_metadata = {DEVICE_ID: {10: {"library_type": 0x0D, "button_code": 0x0102}}}
    proxy.command_blobs = {}  # dump returns nothing

    result = proxy.sync_device(baseline=base, edited=edited, device_id=DEVICE_ID)

    assert result["status"] == "failed"
    assert result["failed_at"].startswith("command_rename")
    assert not any(c[0] == "command_payload" for c in proxy.calls)


# ── BUG #5: shared favorite/macro fav-id namespace (hub-side allocation) ──
#
# On the hub, activity favorites and macro shortcuts share ONE fav-id/key-id
# namespace, but the editor renumbers quick-access button_ids 1..N
# positionally — bundle ids are proposals, not hub identities. Bench repro
# (P3 chunk 1, 2026-07-14): favorites reordered+deleted kept their original
# hub fav_ids (Exit stayed fav_id 5 at display slot 3) while the card's
# bundle showed 1..4; the next macro shortcut was proposed at "free" id 5
# and the hub overwrote favorite 5 with it.


def _bug5_baseline():
    """Client-renumbered view: four favorites at positional ids 1..4."""
    base = base_bundle()
    _activity(base)["favorite_slots"] = [
        {"button_id": 1, "device_id": 1, "command_id": 10, "name": "TV Power"},
        {"button_id": 2, "device_id": 1, "command_id": 11, "name": "TV Vol+"},
        {"button_id": 3, "device_id": 2, "command_id": 20, "name": "Bar Power"},
        {"button_id": 4, "device_id": 2, "command_id": 21, "name": "Exit"},
    ]
    return base


# The hub's live truth: "Exit" kept its original fav_id 5 after an earlier
# reorder+delete sync, so id 5 is occupied even though the bundle ends at 4.
_BUG5_LIVE_FAV_IDS = {(1, 10): 1, (1, 11): 2, (2, 20): 3, (2, 21): 5}


def test_new_macro_id_is_allocated_against_live_hub_fav_ids():
    base = _bug5_baseline()
    edited = copy.deepcopy(base)
    _activity(edited)["macros"].append(
        {"button_id": 5, "name": "Bench macro", "steps": [
            {"device_id": 1, "command_id": 10, "button_code": 0, "duration": 0, "delay": 255},
        ]}
    )
    proxy = FakeProxy(fresh_activity=_activity(base))
    proxy.macro_records = [SimpleNamespace(key_id=198), SimpleNamespace(key_id=199)]
    proxy._activity_sync_current_favorite_fav_ids = lambda _act: dict(_BUG5_LIVE_FAV_IDS)

    result = proxy.sync_activity(baseline=base, edited=edited, activity_id=ACTIVITY_ID)

    assert result["status"] == "success"
    macro_call = next(c for c in proxy.calls if c[0] == "macro_write")
    # Proposed id 5 collides with the live favorite "Exit" -> allocated 6.
    assert macro_call[1][0] == 6
    # The favorite itself was never touched.
    assert not any(c[0] in ("favorite_delete", "delete_key") for c in proxy.calls)


def test_new_macro_keeps_proposed_id_when_hub_side_free():
    base = _bug5_baseline()
    edited = copy.deepcopy(base)
    _activity(edited)["macros"].append(
        {"button_id": 6, "name": "Bench macro", "steps": [
            {"device_id": 1, "command_id": 10, "button_code": 0, "duration": 0, "delay": 255},
        ]}
    )
    proxy = FakeProxy(fresh_activity=_activity(base))
    proxy.macro_records = [SimpleNamespace(key_id=198), SimpleNamespace(key_id=199)]
    proxy._activity_sync_current_favorite_fav_ids = lambda _act: dict(_BUG5_LIVE_FAV_IDS)

    result = proxy.sync_activity(baseline=base, edited=edited, activity_id=ACTIVITY_ID)

    assert result["status"] == "success"
    macro_call = next(c for c in proxy.calls if c[0] == "macro_write")
    assert macro_call[1][0] == 6


def test_binding_to_new_macro_follows_the_allocated_id():
    base = _bug5_baseline()
    edited = copy.deepcopy(base)
    _activity(edited)["macros"].append(
        {"button_id": 5, "name": "Bench macro", "steps": [
            {"device_id": 1, "command_id": 10, "button_code": 0, "duration": 0, "delay": 255},
        ]}
    )
    # A macro-target binding: device_id = the activity itself, command_id =
    # the macro's (proposed) button_id.
    _activity(edited)["button_bindings"].append(
        {"button_id": 0xB1, "device_id": ACTIVITY_ID, "command_id": 5}
    )
    proxy = FakeProxy(fresh_activity=_activity(base))
    proxy.macro_records = [SimpleNamespace(key_id=198), SimpleNamespace(key_id=199)]
    proxy._activity_sync_current_favorite_fav_ids = lambda _act: dict(_BUG5_LIVE_FAV_IDS)

    result = proxy.sync_activity(baseline=base, edited=edited, activity_id=ACTIVITY_ID)

    assert result["status"] == "success"
    binding_call = next(c for c in proxy.calls if c[0] == "binding_write")
    # command_to_button(activity_id, button_id, device_id, command_id, ...)
    assert binding_call[1] == (ACTIVITY_ID, 0xB1, ACTIVITY_ID, 6)


def test_favorite_delete_resolves_stale_baseline_id_by_content():
    base = _bug5_baseline()
    edited = copy.deepcopy(base)
    # Remove "Exit" (dev 2, cmd 21). The baseline claims fav_id 4, but the
    # hub still holds it at its original fav_id 5.
    _activity(edited)["favorite_slots"] = _activity(edited)["favorite_slots"][:3]
    proxy = FakeProxy(fresh_activity=_activity(base))
    proxy._activity_sync_current_favorite_fav_ids = lambda _act: dict(_BUG5_LIVE_FAV_IDS)

    result = proxy.sync_activity(baseline=base, edited=edited, activity_id=ACTIVITY_ID)

    assert result["status"] == "success"
    delete_call = next(c for c in proxy.calls if c[0] == "favorite_delete")
    assert delete_call[1] == (ACTIVITY_ID, 5)


def test_favorite_delete_trusts_baseline_id_when_it_is_live():
    base = base_bundle()
    edited = copy.deepcopy(base)
    _activity(edited)["favorite_slots"] = [_activity(edited)["favorite_slots"][0]]
    proxy = FakeProxy(fresh_activity=_activity(base))
    # Baseline is hub-true: fav_id 2 exists live.
    proxy._activity_sync_current_favorite_fav_ids = lambda _act: {(1, 10): 1, (2, 20): 2}

    result = proxy.sync_activity(baseline=base, edited=edited, activity_id=ACTIVITY_ID)

    assert result["status"] == "success"
    delete_call = next(c for c in proxy.calls if c[0] == "favorite_delete")
    assert delete_call[1] == (ACTIVITY_ID, 2)


def test_favorite_delete_skips_when_content_already_gone():
    base = base_bundle()
    edited = copy.deepcopy(base)
    _activity(edited)["favorite_slots"] = [_activity(edited)["favorite_slots"][0]]
    proxy = FakeProxy(fresh_activity=_activity(base))
    # The hub no longer has (2, 20) at all - nothing to delete.
    proxy._activity_sync_current_favorite_fav_ids = lambda _act: {(1, 10): 7}

    result = proxy.sync_activity(baseline=base, edited=edited, activity_id=ACTIVITY_ID)

    assert result["status"] == "success"
    assert not any(c[0] == "favorite_delete" for c in proxy.calls)


def test_macro_delete_refuses_to_delete_a_live_favorite_id():
    base = _bug5_baseline()
    # Baseline carries a (stale) user macro at id 5 - the id the hub actually
    # uses for the favorite "Exit".
    _activity(base)["macros"].append(
        {"button_id": 5, "name": "Stale macro", "steps": [
            {"device_id": 1, "command_id": 10, "button_code": 0, "duration": 0, "delay": 255},
        ]}
    )
    edited = copy.deepcopy(base)
    _activity(edited)["macros"] = [
        m for m in _activity(edited)["macros"] if m["button_id"] != 5
    ]
    proxy = FakeProxy(fresh_activity=_activity(base))
    proxy._activity_sync_current_favorite_fav_ids = lambda _act: dict(_BUG5_LIVE_FAV_IDS)

    result = proxy.sync_activity(baseline=base, edited=edited, activity_id=ACTIVITY_ID)

    assert result["status"] == "success"
    # The 0x0210 delete never fired - it would have destroyed the favorite.
    assert not any(c[0] == "delete_key" for c in proxy.calls)


def test_new_macro_write_fails_when_live_favorites_unreadable():
    """Writing a NEW macro blind is the favorite-overwrite bug itself, so a
    failed live favorite read must fail the step (no silent fallback)."""
    base = _bug5_baseline()
    edited = copy.deepcopy(base)
    _activity(edited)["macros"].append(
        {"button_id": 5, "name": "Bench macro", "steps": [
            {"device_id": 1, "command_id": 10, "button_code": 0, "duration": 0, "delay": 255},
        ]}
    )
    proxy = FakeProxy(fresh_activity=_activity(base))

    def _boom(_act):
        raise RuntimeError("keymap read failed")

    proxy._activity_sync_current_favorite_fav_ids = _boom

    result = proxy.sync_activity(baseline=base, edited=edited, activity_id=ACTIVITY_ID)

    assert result["status"] == "failed"
    assert result["failed_at"].startswith("macro_write")
    assert not any(c[0] == "macro_write" for c in proxy.calls)
