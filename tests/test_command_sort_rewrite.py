"""Family-0x61 display-sort table maintenance around command add/delete.

The hub keeps a deleted command's slot in the device's sort table (X2 bench
2026-09-16), and the command-list record reports never-positioned commands
with the 0xFF sentinel. These tests pin the add-side registration (0xFF is
unpositioned, not a position) and the delete-side rewrite step (prune the
removed ids, fold survivors in, renumber 1..n, leave a table that orders
nothing alone, never fail the sync).
"""

from __future__ import annotations

import copy
import logging
from types import SimpleNamespace

import pytest

from custom_components.sofabaton_x1s.lib import proxy_activity_sync, proxy_ir_blob
from custom_components.sofabaton_x1s.lib.activity_sync import build_device_sync_plan
from custom_components.sofabaton_x1s.lib.device_create import encode_command_sort_body
from custom_components.sofabaton_x1s.lib.proxy_activity_sync import ActivitySyncMixin
from test_device_sync_plan import DEVICE_ID, _device, _kinds, base_bundle

_IR_BLOB_CLASS = next(
    cls for cls in vars(proxy_ir_blob).values()
    if isinstance(cls, type) and "_register_command_in_device_sort" in vars(cls)
)


def _pairs_written(steps) -> list[tuple[int, int]]:
    """Recover the (command_id, position) pairs from a one-page 0x61 write."""
    assert len(steps) == 1
    payload = bytes(steps[0].payload)
    # payload = 0x01 + page_no(2) + sealed body; body = 0x01 + pages(2) + dev + pairs + seal
    body = payload[3:]
    pairs_bytes = body[4:]
    # Strip the seal by matching the longest even prefix that re-encodes.
    for cut in range(len(pairs_bytes), -1, -1):
        chunk = pairs_bytes[:cut]
        if len(chunk) % 2 == 0:
            pairs = [(chunk[i], chunk[i + 1]) for i in range(0, len(chunk), 2)]
            if encode_command_sort_body(pairs) == chunk and cut <= len(pairs_bytes) - 1:
                return pairs
    raise AssertionError(f"could not decode pairs from {payload.hex(' ')}")


class _Fake:
    def __init__(self, *, commands, metadata, table_hex=""):
        self.state = SimpleNamespace(commands=commands, command_metadata=metadata)
        self._log = logging.getLogger("test")
        self.table_hex = table_hex
        self.fetched = []

    def clear_ack_queue(self):
        pass

    def reset_ack_queues(self):
        pass

    def fetch_device_key_sort(self, device_id):
        self.fetched.append(device_id)
        return {"device_id": device_id, "msg_hex": self.table_hex}


# ── add side ────────────────────────────────────────────────────────────


def test_add_registration_treats_0xff_sort_id_as_unpositioned(monkeypatch):
    captured = {}

    def fake_run(_proxy, steps):
        captured["steps"] = list(steps)
        return SimpleNamespace(success=True, rejected=False, failed_index=None)

    monkeypatch.setattr(proxy_ir_blob, "_run_create_sequence", fake_run)
    fake = _Fake(
        commands={1: {2: {}, 3: {}, 4: {}}},
        # What the command-list read stores for never-positioned commands.
        metadata={1: {2: {"sort_id": 0xFF}, 3: {"sort_id": 0xFF}, 4: {"sort_id": 0}}},
    )
    _IR_BLOB_CLASS._register_command_in_device_sort(fake, dev_lo=1, new_command_id=5, ack_timeout=5.0)
    assert _pairs_written(captured["steps"]) == [(2, 1), (3, 2), (4, 3), (5, 4)]
    assert fake.state.command_metadata[1][5]["sort_id"] == 4


def test_add_registration_keeps_real_positions_and_appends(monkeypatch):
    captured = {}
    monkeypatch.setattr(
        proxy_ir_blob, "_run_create_sequence",
        lambda _p, steps: captured.setdefault("steps", list(steps)) and SimpleNamespace(success=True, rejected=False, failed_index=None),
    )
    fake = _Fake(commands={1: {7: {}, 8: {}}}, metadata={1: {7: {"sort_id": 2}, 8: {"sort_id": 1}}})
    _IR_BLOB_CLASS._register_command_in_device_sort(fake, dev_lo=1, new_command_id=9, ack_timeout=5.0)
    assert _pairs_written(captured["steps"]) == [(8, 1), (7, 2), (9, 3)]


# ── delete side: planner ────────────────────────────────────────────────


def test_plan_appends_one_sort_rewrite_after_all_deletes():
    base = base_bundle()
    _device(base)["commands"].append({"command_id": 12, "name": "Extra"})
    edited = copy.deepcopy(base)
    _device(edited)["commands"] = [c for c in _device(edited)["commands"] if c["command_id"] not in (11, 12)]
    plan = build_device_sync_plan(base, edited, DEVICE_ID, allow_command_removal=True)
    assert _kinds(plan) == ["command_delete", "command_delete", "command_sort_rewrite"]
    rewrite = plan[-1]
    assert rewrite.target_device_id == DEVICE_ID
    assert rewrite.payload == {"device_id": DEVICE_ID, "removed_command_ids": [11, 12]}


def test_plan_has_no_sort_rewrite_without_deletes():
    base = base_bundle()
    edited = copy.deepcopy(base)
    _device(edited)["commands"][0]["name"] = "Renamed"
    plan = build_device_sync_plan(base, edited, DEVICE_ID, allow_command_removal=True)
    assert "command_sort_rewrite" not in _kinds(plan)


# ── delete side: executor ───────────────────────────────────────────────


def _table(pairs) -> str:
    return encode_command_sort_body(pairs).hex()


def test_rewrite_prunes_removed_ids_folds_survivors_and_renumbers(monkeypatch):
    captured = {}

    def fake_run(_proxy, steps):
        captured["steps"] = list(steps)
        return SimpleNamespace(success=True, rejected=False, failed_index=None)

    monkeypatch.setattr(proxy_activity_sync, "run_create_sequence", fake_run)
    fake = _Fake(
        # 6 is on the device but never positioned; 3 is being removed and
        # (as in the real engine) still sits in state until the re-warm.
        commands={1: {2: {}, 3: {}, 4: {}, 5: {}, 6: {}}},
        metadata={1: {2: {"sort_id": 1}, 3: {"sort_id": 2}, 4: {"sort_id": 3}, 5: {"sort_id": 4}, 6: {"sort_id": 0xFF}}},
        table_hex=_table([(2, 1), (3, 2), (4, 3), (5, 4), (6, 0xFF)]),
    )
    ok = ActivitySyncMixin._sync_step_command_sort_rewrite(
        fake, {"device_id": 1, "removed_command_ids": [3]}
    )
    assert ok is True
    assert fake.fetched == [1]
    assert _pairs_written(captured["steps"]) == [(2, 1), (4, 2), (5, 3), (6, 4)]
    assert fake.state.command_metadata[1][6]["sort_id"] == 4
    assert fake.state.command_metadata[1][4]["sort_id"] == 2


def test_rewrite_keeps_existing_order_not_id_order(monkeypatch):
    captured = {}
    monkeypatch.setattr(
        proxy_activity_sync, "run_create_sequence",
        lambda _p, steps: captured.setdefault("steps", list(steps)) and SimpleNamespace(success=True, rejected=False, failed_index=None),
    )
    fake = _Fake(
        commands={1: {1: {}, 2: {}, 27: {}, 28: {}}},
        metadata={1: {}},
        table_hex=_table([(27, 1), (28, 2), (1, 3), (2, 4)]),
    )
    ActivitySyncMixin._sync_step_command_sort_rewrite(fake, {"device_id": 1, "removed_command_ids": [28]})
    assert _pairs_written(captured["steps"]) == [(27, 1), (1, 2), (2, 3)]


@pytest.mark.parametrize("table_hex", ["", _table([(2, 0xFF), (3, 0xFF), (4, 0)])])
def test_rewrite_leaves_a_table_that_orders_nothing_alone(monkeypatch, table_hex):
    monkeypatch.setattr(
        proxy_activity_sync, "run_create_sequence",
        lambda *_a: (_ for _ in ()).throw(AssertionError("must not write")),
    )
    fake = _Fake(commands={1: {2: {}, 3: {}, 4: {}}}, metadata={1: {}}, table_hex=table_hex)
    assert ActivitySyncMixin._sync_step_command_sort_rewrite(fake, {"device_id": 1, "removed_command_ids": [2]}) is True


def test_rewrite_is_best_effort_when_the_hub_rejects(monkeypatch):
    monkeypatch.setattr(
        proxy_activity_sync, "run_create_sequence",
        lambda _p, steps: SimpleNamespace(success=False, rejected=True, failed_index=0),
    )
    fake = _Fake(commands={1: {2: {}, 3: {}}}, metadata={1: {2: {"sort_id": 1}, 3: {"sort_id": 2}}},
                 table_hex=_table([(2, 1), (3, 2)]))
    assert ActivitySyncMixin._sync_step_command_sort_rewrite(fake, {"device_id": 1, "removed_command_ids": [3]}) is True
    # Metadata is not touched when the write did not land.
    assert fake.state.command_metadata[1][2]["sort_id"] == 1


def test_rewrite_refuses_a_missing_device_id():
    fake = _Fake(commands={}, metadata={})
    assert ActivitySyncMixin._sync_step_command_sort_rewrite(fake, {"removed_command_ids": [1]}) is False
