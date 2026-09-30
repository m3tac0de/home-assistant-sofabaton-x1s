"""The X1 quick-access order table lists every live record (2026-09-30).

On the X1, favorites and macro shortcuts share one id space and one
family-0x61 order table. A record the table leaves out still takes a row on
the remote, at the slot equal to its own id, covering the entry the table
put there and leaving the last row empty. Marcel's X1 after an erasing
restore: Watch Apple TV listed [1, 3, 4, 5] with macro 2 unlisted (Command 1
covered), play xbox listed [2, 3, 4, 5] with favorite 1 unlisted (Power
covered). Two fixes: the restore writes the table whole, and every writer of
the table puts back live records it would leave out (the repair for hubs
already affected, run by the next Wifi deploy or activity sync).
"""

from __future__ import annotations

from typing import Any

import pytest

from custom_components.sofabaton_x1s.lib.ack import AckOutcome, SendStepResult
from custom_components.sofabaton_x1s.lib.hub_versions import HUB_VERSION_X1, HUB_VERSION_X1S
from custom_components.sofabaton_x1s.lib.proxy_activity_ops import ActivityOpsMixin
from custom_components.sofabaton_x1s.lib.x1_proxy import X1Proxy

from tests.test_phase8_activity_restore import _activity_backup, _patched_proxy


def _order_ids(payload: bytes) -> list[int]:
    """The fav ids of a family-0x61 order payload, in slot order."""

    pairs = payload[7:-1]
    return [pairs[i] for i in range(0, len(pairs), 2)]


def _proxy(monkeypatch: pytest.MonkeyPatch, hub_version: str, *, order, live) -> tuple[X1Proxy, list[tuple[str, int, bytes]], list[int]]:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False, hub_version=hub_version)
    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(proxy, "reset_ack_queues", lambda: None)
    monkeypatch.setattr(proxy, "clear_entity_cache", lambda *args, **kwargs: None)
    monkeypatch.setattr(proxy, "request_activity_mapping", lambda act_id: True)
    monkeypatch.setattr(proxy, "request_favorites_order", lambda act_id: list(order))
    monkeypatch.setattr(proxy, "_send_family_frame", lambda family, payload: None)
    live_reads: list[int] = []

    def _live(act_lo: int):
        live_reads.append(act_lo)
        return None if live is None else set(live)

    monkeypatch.setattr(proxy, "_x1_live_quick_access_ids", _live)
    steps: list[tuple[str, int, bytes]] = []

    def _send_step(*, step_name, family, payload, ack_opcode, timeout=5.0):
        steps.append((step_name, family, payload))
        return SendStepResult(outcome=AckOutcome.acked)

    monkeypatch.setattr(proxy, "_send_step", _send_step)
    return proxy, steps, live_reads


def _written_order(steps: list[tuple[str, int, bytes]]) -> list[int]:
    return _order_ids(next(payload for _name, family, payload in steps if family == 0x61))


# -- the repair rule ----------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("order", "live", "expected"),
    [
        # Marcel's two activities: the unlisted record returns where the remote drew it.
        ([1, 3, 4, 5], {1, 2, 3, 4, 5}, [1, 2, 3, 4, 5]),
        ([2, 3, 4, 5], {1, 2, 3, 4, 5}, [1, 2, 3, 4, 5]),
        # A caller's own order is kept; only the missing record is placed.
        ([5, 4, 1], {1, 2, 4, 5}, [5, 2, 4, 1]),
        # An id past the end is appended; an empty table gets the record.
        ([1, 2], {1, 2, 9}, [1, 2, 9]),
        ([], {3}, [3]),
        # Nothing missing, or no live read: the order stays as given.
        ([3, 1, 2], {1, 2, 3}, [3, 1, 2]),
        ([1, 3], None, [1, 3]),
        # A listed id without a live record is left alone (not this repair's job).
        ([1, 7], {1}, [1, 7]),
    ],
)
def test_unlisted_records_return_to_the_slot_the_remote_draws_them_at(order, live, expected) -> None:
    assert ActivityOpsMixin._with_x1_unlisted_records(order, live) == expected


# -- the writers ---------------------------------------------------------------------------------


def test_x1_reorder_writes_every_live_record(monkeypatch) -> None:
    # The Wifi deploy's closing reorder: the pre-existing order read back
    # lacks the macro, the new favorites follow.
    proxy, steps, live_reads = _proxy(
        monkeypatch, HUB_VERSION_X1, order=[(1, 1), (3, 2), (4, 3), (5, 4)], live={1, 2, 3, 4, 5}
    )
    monkeypatch.setattr(proxy, "_validate_favorite_fav_id", lambda act_lo, fav_id, order: fav_id)

    result = proxy.reorder_favorites(0x65, [1, 3, 4, 5], refresh_after_write=False)

    assert result is not None and result["fav_ids"] == [1, 2, 3, 4, 5]
    assert _written_order(steps) == [1, 2, 3, 4, 5]
    assert live_reads == [0x65]


def test_x1s_reorder_is_not_repaired(monkeypatch) -> None:
    # X1S/X2 keep macros in their own namespace: their order table is not this one.
    proxy, steps, live_reads = _proxy(monkeypatch, HUB_VERSION_X1S, order=[(1, 1), (3, 2)], live={1, 2, 3})
    monkeypatch.setattr(proxy, "_validate_favorite_fav_id", lambda act_lo, fav_id, order: fav_id)

    proxy.reorder_favorites(0x65, [1, 3], refresh_after_write=False)

    assert _written_order(steps) == [1, 3]
    assert live_reads == []


def test_x1_reorder_without_a_live_read_writes_the_order_as_given(monkeypatch, caplog) -> None:
    proxy, steps, _live = _proxy(monkeypatch, HUB_VERSION_X1, order=[(1, 1), (3, 2)], live=None)
    monkeypatch.setattr(proxy, "_validate_favorite_fav_id", lambda act_lo, fav_id, order: fav_id)

    proxy.reorder_favorites(0x65, [3, 1], refresh_after_write=False)

    assert _written_order(steps) == [3, 1]
    assert "could not be re-read" in caplog.text


def test_x1_delete_rewrites_the_remaining_order_with_every_live_record(monkeypatch) -> None:
    proxy, steps, _live = _proxy(
        monkeypatch, HUB_VERSION_X1, order=[(2, 1), (3, 2), (4, 3), (5, 4)], live={1, 2, 3, 4, 5}
    )

    result = proxy.delete_favorite(0x67, 4, refresh_after_write=False)

    assert result is not None
    assert [family for _name, family, _payload in steps] == [0x10, 0x61, 0x65]
    # The deleted favorite stays out even though it was live before the delete.
    assert _written_order(steps) == [1, 2, 3, 5]


def test_x1_add_stages_every_live_record(monkeypatch) -> None:
    proxy, steps, live_reads = _proxy(monkeypatch, HUB_VERSION_X1, order=[(2, 1)], live={1, 2})
    monkeypatch.setattr(proxy, "wait_for_ack_any", lambda candidates, *, timeout=5.0, not_before=None: (0x013E, b"\x03"))

    result = proxy.command_to_favorite(0x67, 0x0A, 0x01, refresh_after_write=False)

    assert result is not None and result["fav_id"] == 3
    assert _written_order(steps) == [1, 2, 3]
    assert live_reads == [0x67]


def test_x1_add_can_leave_the_repair_to_a_closing_reorder(monkeypatch) -> None:
    proxy, steps, live_reads = _proxy(monkeypatch, HUB_VERSION_X1, order=[(2, 1)], live={1, 2})
    monkeypatch.setattr(proxy, "wait_for_ack_any", lambda candidates, *, timeout=5.0, not_before=None: (0x013E, b"\x03"))

    proxy.command_to_favorite(0x67, 0x0A, 0x01, refresh_after_write=False, repair_order=False)

    assert _written_order(steps) == [2, 3]
    assert live_reads == []


def test_x1_add_stages_a_given_order_without_reading(monkeypatch) -> None:
    proxy, steps, live_reads = _proxy(monkeypatch, HUB_VERSION_X1, order=[(9, 1)], live={9})
    monkeypatch.setattr(proxy, "request_favorites_order", lambda act_id: pytest.fail("the given order is used"))
    monkeypatch.setattr(proxy, "wait_for_ack_any", lambda candidates, *, timeout=5.0, not_before=None: (0x013E, b"\x01"))

    proxy.command_to_favorite(
        0x67, 0x0A, 0x01, refresh_after_write=False, existing_order_ids=[2], repair_order=False
    )

    assert _written_order(steps) == [2, 1]
    assert live_reads == []


# -- the restore ---------------------------------------------------------------------------------


def _restore_backup(favorites_order: list[int] | None) -> dict[str, Any]:
    """Watch Apple TV as captured: Power (fav 1), macro "Reporter TV" (key 2),
    then two Wifi favorites (3, 4)."""

    backup = _activity_backup(
        favorites=[
            {"button_id": 1, "device_id": 11, "command_id": 1},
            {"button_id": 3, "device_id": 12, "command_id": 1},
            {"button_id": 4, "device_id": 12, "command_id": 2},
        ]
    )
    backup["macros"] = [
        *backup["macros"],
        {"button_id": 2, "name": "Reporter TV", "steps": [{"device_id": 11, "command_id": 1, "button_code": 0x4E21}]},
    ]
    backup["button_bindings"] = []
    if favorites_order is not None:
        backup["favorites_order"] = favorites_order
    return backup


def _restoring_proxy(monkeypatch, hub_version: str):
    proxy, _sequence_calls = _patched_proxy(monkeypatch)
    proxy.hub_version = hub_version
    favorite_calls: list[dict[str, Any]] = []
    assigned = iter([1, 3, 4])

    def _command_to_favorite(activity_id, device_id, command_id, **kwargs):
        favorite_calls.append(dict(kwargs, device_id=device_id))
        return {"activity_id": activity_id, "fav_id": next(assigned), "status": "success"}

    monkeypatch.setattr(proxy, "command_to_favorite", _command_to_favorite)
    steps: list[tuple[str, int, bytes]] = []

    def _send_step(*, step_name, family, payload, ack_opcode, timeout=5.0):
        steps.append((step_name, family, payload))
        return SendStepResult(outcome=AckOutcome.acked)

    monkeypatch.setattr(proxy, "_send_step", _send_step)
    return proxy, favorite_calls, steps


def test_x1_restore_stages_the_table_as_it_stands_and_writes_the_captured_order(monkeypatch) -> None:
    proxy, favorite_calls, steps = _restoring_proxy(monkeypatch, HUB_VERSION_X1)

    result = proxy.restore_activity(
        _restore_backup([1, 2, 3, 4]), device_id_map={11: 0x21, 12: 0x22}, send_remote_sync=False
    )

    assert result is not None and result["restored_favorites"] == 3
    # Each add stages every record already on the hub: the macro first, then
    # the favorites as they land; never only its own id.
    assert [call["existing_order_ids"] for call in favorite_calls] == [[2], [2, 1], [2, 1, 3]]
    assert all(call["repair_order"] is False for call in favorite_calls)
    # One closing write puts the captured display order back.
    assert [(family, _order_ids(payload)) for _name, family, payload in steps if family == 0x61] == [
        (0x61, [1, 2, 3, 4])
    ]
    assert [family for _name, family, _payload in steps][-2:] == [0x61, 0x65]


def test_x1_restore_of_an_older_backup_orders_by_source_id(monkeypatch) -> None:
    proxy, _favorite_calls, steps = _restoring_proxy(monkeypatch, HUB_VERSION_X1)

    proxy.restore_activity(_restore_backup(None), device_id_map={11: 0x21, 12: 0x22}, send_remote_sync=False)

    assert [_order_ids(payload) for _name, family, payload in steps if family == 0x61] == [[1, 2, 3, 4]]


def test_x1_restore_skips_the_closing_write_when_the_staged_order_is_right(monkeypatch) -> None:
    proxy, _favorite_calls, steps = _restoring_proxy(monkeypatch, HUB_VERSION_X1)

    # Captured: the macro first, then the favorites in add order.
    proxy.restore_activity(
        _restore_backup([2, 1, 3, 4]), device_id_map={11: 0x21, 12: 0x22}, send_remote_sync=False
    )

    assert [family for _name, family, _payload in steps if family in (0x61, 0x65)] == []


def test_x1s_restore_is_unchanged(monkeypatch) -> None:
    proxy, favorite_calls, steps = _restoring_proxy(monkeypatch, HUB_VERSION_X1S)

    proxy.restore_activity(
        _restore_backup([1, 2, 3, 4]), device_id_map={11: 0x21, 12: 0x22}, send_remote_sync=False
    )

    assert all(call["existing_order_ids"] is None for call in favorite_calls)
    assert [family for _name, family, _payload in steps if family in (0x61, 0x65)] == []


# -- the sync-time repair ------------------------------------------------------------------------


def test_repair_rewrites_an_order_that_leaves_a_record_out(monkeypatch) -> None:
    proxy, steps, _live = _proxy(
        monkeypatch, HUB_VERSION_X1, order=[(1, 1), (3, 2), (4, 3), (5, 4)], live={1, 2, 3, 4, 5}
    )

    assert proxy.repair_x1_quick_access_order(0x65) is True
    assert [family for _name, family, _payload in steps] == [0x61, 0x65]
    assert _written_order(steps) == [1, 2, 3, 4, 5]
    assert proxy.state.activity_favorites_order[0x65] == [(1, 1), (2, 2), (3, 3), (4, 4), (5, 5)]


def test_repair_writes_nothing_when_every_record_is_listed(monkeypatch) -> None:
    proxy, steps, live_reads = _proxy(monkeypatch, HUB_VERSION_X1, order=[(2, 1), (1, 2)], live={1, 2})

    assert proxy.repair_x1_quick_access_order(0x66) is False
    assert steps == []
    assert live_reads == [0x66]


@pytest.mark.parametrize(("hub_version", "live"), [(HUB_VERSION_X1S, {1, 2}), (HUB_VERSION_X1, None)])
def test_repair_stays_out_of_other_hubs_and_failed_reads(monkeypatch, hub_version, live) -> None:
    proxy, steps, _live = _proxy(monkeypatch, hub_version, order=[(1, 1)], live=live)

    assert proxy.repair_x1_quick_access_order(0x65) is None
    assert steps == []
