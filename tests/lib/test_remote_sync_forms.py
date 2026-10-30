"""Candidate remote-sync forms (bench_333): the frame builders, and the
engine switches that pick them. The defaults must send exactly what the
write flows always sent."""

from __future__ import annotations

import importlib
import importlib.util
import sys
import types
from pathlib import Path

import pytest

LIB_DIR = Path(__file__).resolve().parents[2] / "custom_components" / "sofabaton_x1s" / "lib"


def _load_lib() -> types.ModuleType:
    name = "sofabaton_real_engine_test_pkg"
    if name in sys.modules:
        return sys.modules[name]
    spec = importlib.util.spec_from_file_location(
        name, LIB_DIR / "__init__.py", submodule_search_locations=[str(LIB_DIR)]
    )
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


_pkg = _load_lib()
frames = importlib.import_module(f"{_pkg.__name__}.remote_sync_frames")
write_batch = importlib.import_module(f"{_pkg.__name__}.write_batch")
x1_proxy_mod = importlib.import_module(f"{_pkg.__name__}.x1_proxy")


class _Step:
    def __init__(self, ok: bool = True) -> None:
        self.ok = ok


def _engine(hub_version: str, monkeypatch) -> tuple[object, list[tuple[int, bytes]]]:
    engine = x1_proxy_mod.X1Proxy("127.0.0.1", hub_version=hub_version, proxy_enabled=False)
    sent: list[tuple[int, bytes]] = []

    def fake_send_step(*, step_name, family, payload, ack_opcode, **kw):
        sent.append((family, bytes(payload)))
        return _Step()

    monkeypatch.setattr(engine, "_send_step", fake_send_step)
    return engine, sent


# -- builders ---------------------------------------------------------------

def test_entity_sync_frame_forms() -> None:
    assert frames.entity_sync_frame(0x66, x2_form=False) == (0x0165, b"\x66")
    assert frames.entity_sync_frame(0x66, x2_form=True) == (0x0265, b"\x66\x01")
    assert frames.entity_sync_frame(0x1FF, x2_form=False) == (0x0165, b"\xff")


def test_x2_targets_put_the_slot_in_the_byte_of_its_row_type() -> None:
    assert frames.x2_target(0, 8) == bytes.fromhex("00 00 08")
    assert frames.x2_target(1, 4) == bytes.fromhex("00 04 00")
    assert frames.x2_target(2, 3) == bytes.fromhex("03 00 00")
    # An unknown type is treated like a remote.
    assert frames.x2_target(7, 5) == bytes.fromhex("00 00 05")


def test_x2_sync_frames() -> None:
    assert frames.x2_remote_sync_frame(bytes.fromhex("00 00 08")) == (0x0464, bytes.fromhex("00 00 08 01"))
    assert frames.x2_remote_sync_frame(frames.X2_TARGET_ALL) == (0x0464, bytes.fromhex("ff ff ff 01"))
    assert frames.x2_order_sync_frame() == (0x0464, bytes.fromhex("00 00 ff 00"))
    with pytest.raises(ValueError):
        frames.x2_remote_sync_frame(b"\x08")
    assert frames.order_sync_frame("X2") == (0x0464, bytes.fromhex("00 00 ff 00"))
    assert frames.order_sync_frame("X1S") is None and frames.order_sync_frame(None) is None


def test_parse_x2_paired_row_reads_the_slot_byte_of_its_type() -> None:
    row = bytes([1, 2, 3, 0, 0, 80, 3]) + bytes(4) + bytes([9, 2, 1, 0]) + bytes(6) + b"Rep\x00"
    parsed = frames.parse_x2_paired_row(row)
    assert parsed is not None
    assert (parsed.index, parsed.count, parsed.row_type, parsed.slot) == (1, 2, 2, 3)
    assert parsed.target == bytes.fromhex("03 00 00") and parsed.name == "Rep"
    assert frames.parse_x2_paired_row(bytes(12)) is None


# -- engine switches ----------------------------------------------------------

@pytest.mark.parametrize("hub_version", ["X1", "X1S", "X2"])
def test_entity_sync_default_is_the_legacy_frame_on_every_model(monkeypatch, hub_version) -> None:
    engine, sent = _engine(hub_version, monkeypatch)
    assert engine.entity_sync_form == write_batch.ENTITY_SYNC_LEGACY
    assert engine._send_entity_sync_step(0x66, "favorite-commit-65[act=0x66]") is True
    assert sent == [(0x65, b"\x66")]


@pytest.mark.parametrize("hub_version, payload", [("X1S", b"\x66"), ("X2", b"\x66\x01")])
def test_entity_sync_native_form_sends_the_x2_its_own_frame(monkeypatch, hub_version, payload) -> None:
    engine, sent = _engine(hub_version, monkeypatch)
    engine.entity_sync_form = write_batch.ENTITY_SYNC_NATIVE
    assert engine._send_entity_sync_step(0x66, "keymap-commit-65[act=0x66]") is True
    assert sent == [(0x65, payload)]


def test_entity_sync_none_sends_nothing_and_reports_success(monkeypatch) -> None:
    engine, sent = _engine("X2", monkeypatch)
    engine.entity_sync_form = write_batch.ENTITY_SYNC_NONE
    assert engine._send_entity_sync_step(0x66, "fav-delete-commit-65[act=0x66]") is True
    assert sent == []


def test_entity_sync_is_deferred_to_the_batch_end(monkeypatch) -> None:
    engine, sent = _engine("X2", monkeypatch)
    engine.begin_write_batch()
    assert engine._send_entity_sync_step(0x66, "favorite-commit-65[act=0x66]") is True
    assert engine._send_entity_sync_step(0x66, "keymap-commit-65[act=0x66]") is True
    assert sent == []
    summary = engine.end_write_batch()
    # Once, at the end, however many steps asked for it.
    assert sent == [(0x65, b"\x66")]
    assert summary["remote_sync_requests"] == 0 and summary["remote_sync_kind"] == "item"


@pytest.mark.parametrize("hub_version, payload", [("X1S", b""), ("X2", bytes.fromhex("00 00 ff 00"))])
def test_order_trigger_default_is_the_x2_order_sync(monkeypatch, hub_version, payload) -> None:
    engine, sent = _engine(hub_version, monkeypatch)
    assert engine.order_sync_form == write_batch.ORDER_SYNC_NATIVE
    assert engine._send_remote_sync_step("activity-sort-remote-sync", ack_first_byte=0x00, purpose="order")
    # The X2 gets its ~10 s order-only sync; the X1S has none and keeps the full trigger.
    assert sent == [(0x64, payload)]


def test_x1_order_trigger_sends_nothing_unless_the_full_form_is_asked(monkeypatch) -> None:
    engine, sent = _engine("X1", monkeypatch)
    engine.begin_write_batch()
    # The X1 remote takes a new order on its own (bench_333): nothing sent or deferred.
    assert engine._send_remote_sync_step("device-sort-remote-sync", ack_first_byte=0x00, purpose="order")
    assert engine.end_write_batch()["remote_sync"] == "not_needed" and sent == []
    engine.order_sync_form = write_batch.ORDER_SYNC_FULL
    assert engine._send_remote_sync_step("activity-sort-remote-sync", ack_first_byte=0x00, purpose="order")
    assert sent == [(0x64, b"")]


@pytest.mark.parametrize("hub_version, payload", [("X1S", b""), ("X2", b"\xff\xff\xff")])
def test_order_trigger_full_form_sends_the_full_trigger(monkeypatch, hub_version, payload) -> None:
    engine, sent = _engine(hub_version, monkeypatch)
    engine.order_sync_form = write_batch.ORDER_SYNC_FULL
    assert engine._send_remote_sync_step("activity-sort-remote-sync", ack_first_byte=0x00, purpose="order")
    assert sent == [(0x64, payload)]


@pytest.mark.parametrize("hub_version, payload", [("X1S", b""), ("X2", bytes.fromhex("00 00 ff 00"))])
def test_order_trigger_native_form_sends_the_x2_its_order_sync(monkeypatch, hub_version, payload) -> None:
    engine, sent = _engine(hub_version, monkeypatch)
    engine.order_sync_form = write_batch.ORDER_SYNC_NATIVE
    assert engine._send_remote_sync_step("device-sort-remote-sync", ack_first_byte=0x00, purpose="order")
    # A trigger that is not a reorder's keeps the full form.
    assert engine._send_remote_sync_step("save-tail-remote-sync")
    full = b"\xff\xff\xff" if hub_version == "X2" else b""
    assert sent == [(0x64, payload), (0x64, full)]


def test_x2_order_trigger_inside_a_batch_stays_the_order_sync(monkeypatch) -> None:
    engine, sent = _engine("X2", monkeypatch)
    engine.order_sync_form = write_batch.ORDER_SYNC_NATIVE
    enqueued: list = []
    monkeypatch.setattr(engine, "enqueue_cmd", lambda opcode, payload=b"", **kw: enqueued.append((opcode, payload)) or True)
    engine.begin_write_batch()
    assert engine._send_remote_sync_step("activity-sort-remote-sync", ack_first_byte=0x00, purpose="order")
    assert engine._send_remote_sync_step("device-sort-remote-sync", ack_first_byte=0x00, purpose="order")
    assert sent == []
    summary = engine.end_write_batch()
    # One order-only sync for both reorders; no full broadcast.
    assert summary["remote_sync"] == "sent" and summary["remote_sync_kind"] == "order"
    assert sent == [(0x64, bytes.fromhex("00 00 ff 00"))] and enqueued == []


# -- per-item sync after a write plan, find-remote target ---------------------

class _PlanStep:
    def __init__(self, kind: str, activity_id: int | None = None) -> None:
        self.kind = kind
        self.payload = {} if activity_id is None else {"activity_id": activity_id}


@pytest.mark.parametrize("steps, expected", [
    ([("command_rename", None), ("command_rename", None)], (12,)),
    ([("command_rename", None), ("favorite_add", 101), ("binding_write", 12)], (12, 101)),
    ([("member_replay", 102), ("wifi_power_config", 102)], (102,)),
    ([("wifi_head_commit", None), ("device_rename", None)], ()),
    ([("activity_rename", 101), ("idle_behavior", None)], ()),
    ([], ()),
])
def test_entities_touched_by_skips_remote_neutral_steps(steps, expected) -> None:
    plan = [_PlanStep(kind, act) for kind, act in steps]
    assert frames.entities_touched_by(plan, 0x10C) == expected


# -- sync_remotes_after_write: the per-model rule (bench_333) -------------------

def _rule_engine(hub_version: str, monkeypatch):
    engine, sent = _engine(hub_version, monkeypatch)
    full: list = []
    monkeypatch.setattr(engine, "resync_remote", lambda *a, **kw: full.append("full") or True)
    return engine, sent, full


def test_x2_create_sends_the_order_sync_then_per_item(monkeypatch) -> None:
    engine, sent, full = _rule_engine("X2", monkeypatch)
    assert engine.sync_remotes_after_write(created=(0x0A,), touched=(0x6B,)) is True
    assert sent == [(0x64, bytes.fromhex("00 00 ff 00")), (0x65, b"\x0a"), (0x65, b"\x6b")]
    assert full == []


def test_x2_create_without_the_order_form_sends_the_full_sync_only(monkeypatch) -> None:
    engine, sent, full = _rule_engine("X2", monkeypatch)
    engine.order_sync_form = write_batch.ORDER_SYNC_FULL
    assert engine.sync_remotes_after_write(created=(0x0A,), touched=(0x6B,)) is True
    # The broadcast rebuilds everything: no per-item syncs after it.
    assert full == ["full"] and sent == []


@pytest.mark.parametrize("hub_version", ["X1", "X1S"])
def test_x1_family_create_or_delete_sends_the_full_sync_only(monkeypatch, hub_version) -> None:
    engine, sent, full = _rule_engine(hub_version, monkeypatch)
    assert engine.sync_remotes_after_write(created=(0x0A,), touched=(0x6B,)) is True
    assert engine.sync_remotes_after_write(deleted=(0x0A,), touched=(0x6B,)) is True
    assert full == ["full", "full"] and sent == []


def test_x2_delete_needs_only_the_touched_per_item_syncs(monkeypatch) -> None:
    engine, sent, full = _rule_engine("X2", monkeypatch)
    assert engine.sync_remotes_after_write(deleted=(0x0A,), touched=(0x6B, 0x0A)) is True
    # The deleted device itself is never synced; renames and deletes need nothing else.
    assert sent == [(0x65, b"\x6b")] and full == []


@pytest.mark.parametrize("hub_version", ["X1", "X1S", "X2"])
def test_content_edits_get_per_item_syncs_on_every_model(monkeypatch, hub_version) -> None:
    engine, sent, full = _rule_engine(hub_version, monkeypatch)
    assert engine.sync_remotes_after_write(touched=(0x0A, 0x65, 0x0A)) is True
    assert sent == [(0x65, b"\x0a"), (0x65, b"\x65")] and full == []


def test_an_unacked_partial_sync_falls_back_to_the_full_sync(monkeypatch) -> None:
    engine, _sent, full = _rule_engine("X2", monkeypatch)
    monkeypatch.setattr(engine, "_send_step", lambda **kw: _Step(ok=False))
    assert engine.sync_remotes_after_write(touched=(0x0A,)) is True
    assert full == ["full"]


def test_editor_close_skips_entities_a_step_already_synced(monkeypatch) -> None:
    engine, sent, _full = _rule_engine("X2", monkeypatch)
    engine._begin_item_sync_tracking()
    # A favorite write's own commit already synced the activity.
    assert engine._send_entity_sync_step(0x65, "favorite-commit-65[act=0x65]")
    plan = [_PlanStep("favorite_add", 0x65), _PlanStep("macro_write", 0x65), _PlanStep("activity_rename", 0x65)]
    assert engine._sync_remotes_after_edit(0x65, plan, "activity-sync") is True
    assert sent == [(0x65, b"\x65")]
    # A plan with only renames needs no sync at all.
    engine._begin_item_sync_tracking()
    assert engine._sync_remotes_after_edit(0x0A, [_PlanStep("device_rename")], "device-sync") is True
    assert sent == [(0x65, b"\x65")]


# -- write batch with order-only and per-item requests ----------------------------

def test_x2_batch_sends_the_order_sync_before_the_deferred_per_item_syncs(monkeypatch) -> None:
    engine, sent, full = _rule_engine("X2", monkeypatch)
    engine.begin_write_batch()
    assert engine._send_entity_sync_step(0x65, "favorite-commit-65[act=0x65]")
    assert engine.sync_remotes_after_write(created=(0x0A,), touched=(0x65,))
    assert sent == [], "nothing goes out while the batch is open"
    summary = engine.end_write_batch()
    assert sent == [(0x64, bytes.fromhex("00 00 ff 00")), (0x65, b"\x65"), (0x65, b"\x0a")]
    assert (summary["remote_sync"], summary["remote_sync_kind"], summary["item_syncs"]) == ("sent", "order", 2)
    assert full == []


def test_batch_full_request_covers_the_partial_ones(monkeypatch) -> None:
    engine, sent = _engine("X2", monkeypatch)
    enqueued: list = []
    monkeypatch.setattr(engine, "enqueue_cmd", lambda opcode, payload=b"", **kw: enqueued.append((opcode, payload)) or True)
    engine.begin_write_batch()
    engine.sync_remotes_after_write(touched=(0x65,))
    assert engine.resync_remote() is True          # e.g. a restore inside the batch
    summary = engine.end_write_batch()
    assert summary["remote_sync_kind"] == "full" and sent == []
    assert enqueued == [(0x0364, b"\xff\xff\xff")]


def test_x1s_batch_order_request_becomes_the_full_sync(monkeypatch) -> None:
    engine, sent, _full = _rule_engine("X1S", monkeypatch)
    engine.begin_write_batch()
    assert engine._send_remote_sync_step("activity-sort-remote-sync", ack_first_byte=0x00, purpose="order")
    assert engine._send_entity_sync_step(0x65, "favorite-commit-65[act=0x65]")
    summary = engine.end_write_batch()
    # The X1S has no order-only form: its full trigger covers the per-item request.
    assert sent == [(0x64, b"")] and summary["remote_sync_kind"] == "full"


def test_batch_of_only_per_item_requests_sends_just_those(monkeypatch) -> None:
    engine, sent, full = _rule_engine("X1S", monkeypatch)
    engine.begin_write_batch()
    engine.sync_remotes_after_write(touched=(0x0A, 0x65))
    summary = engine.end_write_batch()
    assert sent == [(0x65, b"\x0a"), (0x65, b"\x65")] and full == []
    assert summary["remote_sync_kind"] == "item" and summary["remote_sync_requests"] == 0


def test_x2_batch_drops_the_per_item_sync_of_an_entity_deleted_later(monkeypatch) -> None:
    engine, sent, full = _rule_engine("X2", monkeypatch)
    engine.begin_write_batch()
    # A device delete re-syncs the activity it cascaded into, then the
    # activity itself is deleted (a teardown, or one document apply).
    engine.sync_remotes_after_write(deleted=(0x04,), touched=(0x6A,))
    engine.sync_remotes_after_write(deleted=(0x6A,))
    summary = engine.end_write_batch()
    assert sent == [] and full == [] and summary["remote_sync"] == "not_needed"
    # An id deleted and then created again in one batch is synced as new.
    engine.begin_write_batch()
    engine.sync_remotes_after_write(deleted=(0x0A,))
    engine.sync_remotes_after_write(created=(0x0A,))
    engine.end_write_batch()
    assert sent == [(0x64, bytes.fromhex("00 00 ff 00")), (0x65, b"\x0a")]


@pytest.mark.parametrize("hub_version", ["X1", "X1S", "X2"])
def test_sync_remote_entity_sends_the_per_item_frame(monkeypatch, hub_version) -> None:
    engine, sent = _engine(hub_version, monkeypatch)
    assert engine.sync_remote_entity(0x10C) is True
    assert sent == [(0x65, b"\x0c")]


def _paired_row(index: int, count: int, row_type: int, bit: int) -> bytes:
    slots = bytearray(3)
    slots[{2: 0, 1: 1}.get(row_type, 2)] = bit
    head = bytes([index, count]) + bytes(slots) + bytes(7) + bytes([row_type, 1, 0]) + bytes(6) + b"R"
    return head.ljust(0x33, b"\x00")


def test_x2_find_remote_targets_every_paired_remote(monkeypatch) -> None:
    engine = x1_proxy_mod.X1Proxy("127.0.0.1", hub_version="X2", proxy_enabled=False)
    for row in (_paired_row(1, 3, 0, 0x08), _paired_row(2, 3, 1, 0x01), _paired_row(3, 3, 0, 0x10)):
        engine.note_x2_paired_device(frames.parse_x2_paired_row(row))
    sent: list = []
    monkeypatch.setattr(engine, "enqueue_cmd", lambda opcode, payload=b"", **kw: sent.append((opcode, payload)) or True)
    assert engine.find_remote() is True
    # Remotes 1 and 2 OR together; the repeater (type 1) is left out.
    assert sent == [(0x0323, bytes.fromhex("00 00 18"))]


def test_x2_find_remote_falls_back_to_remote_one_without_a_list(monkeypatch) -> None:
    engine = x1_proxy_mod.X1Proxy("127.0.0.1", hub_version="X2", proxy_enabled=False)
    sent: list = []
    monkeypatch.setattr(engine, "enqueue_cmd", lambda opcode, payload=b"", **kw: sent.append((opcode, payload)) or True)
    # Not controllable here: no list request, the validated remote 1 target.
    assert engine.find_remote() is True
    assert sent == [(0x0323, bytes.fromhex("00 00 08"))]


def test_a_rename_carrying_an_icon_or_color_counts_as_touched() -> None:
    # Renames reach the remotes on their own; an icon or color change rides
    # the same write but is not bench-proven to, so it gets a per-item sync.
    plain = _PlanStep("activity_rename", 101)
    themed = _PlanStep("activity_rename", 101)
    themed.payload["icon"] = 34
    device = _PlanStep("device_rename")
    device.payload["color_id"] = 3
    assert frames.entities_touched_by([plain], 0x10C) == ()
    assert frames.entities_touched_by([themed, device], 0x0C) == (101, 0x0C)


def test_a_refusal_soon_after_a_remote_sync_reads_as_the_remote_updating(monkeypatch) -> None:
    engine = x1_proxy_mod.X1Proxy("127.0.0.1", hub_version="X1S", proxy_enabled=False)
    clock = [1000.0]
    monkeypatch.setattr(write_batch.time, "monotonic", lambda: clock[0])
    monkeypatch.setattr(engine, "enqueue_cmd", lambda *a, **k: True)
    start = clock[0]
    # No trigger sent yet: a 0x04 refusal is a plain refusal.
    engine._note_step_refusal(0x04)
    assert engine.refused_during_remote_sync(start) is False
    assert engine.resync_remote() is True   # the trigger is noted when it goes out
    clock[0] += 3
    engine._note_step_refusal(0x04)
    assert engine.refused_during_remote_sync(start) is True
    # Another status, a refusal from before the write began, or one past the window is not.
    engine._note_step_refusal(0x01)
    assert engine.refused_during_remote_sync(start) is False
    engine._note_step_refusal(0x04)
    assert engine.refused_during_remote_sync(clock[0] + 1) is False
    clock[0] += write_batch.REMOTE_SYNC_REFUSAL_WINDOW_S + 1
    engine._note_step_refusal(0x04)
    assert engine.refused_during_remote_sync(start) is False
    # A trigger a batch only recorded is not one the hub got.
    clock[0] += 10
    engine.begin_write_batch()
    engine.resync_remote()
    clock[0] += 1
    engine._note_step_refusal(0x04)
    assert engine.refused_during_remote_sync(start) is False
