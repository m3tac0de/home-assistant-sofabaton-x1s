"""Regression tests for the device-restore finalize step list (BUG #6).

A device whose backup carries no usable key-sort table (the hub answers
KEY_SORT reads with STATUS_ACK status=0x07, or reports every command
with the 0xFF "unpositioned" sentinel) must not get a key-sort finalize
write: the hub rejects an all-0xFF table with STATUS_ACK status=0x06 and
the whole restore fails (X1S bench 2026-07-14). And when a finalize step
does fail, the freshly-created device must be rolled back instead of
being left as a partial orphan on the hub.
"""
import types
from typing import Any

from custom_components.sofabaton_x1s.const import HUB_VERSION_X1S
from custom_components.sofabaton_x1s.lib.device_create import (
    DeviceCreateRequest,
)
from custom_components.sofabaton_x1s.lib.proxy_restore import (
    _key_sort_table_has_positions,
)
from custom_components.sofabaton_x1s.lib.x1_proxy import X1Proxy
import custom_components.sofabaton_x1s.lib.x1_proxy as x1_proxy_module


def _device_backup(key_sort: dict[str, Any] | None) -> dict[str, Any]:
    return {
        "kind": "device_backup",
        "schema_version": 4,
        "device": {
            "device_id": 8,
            "name": "Samsungtst",
            "brand": "Samsung",
            "device_class": "IR",
            "device_class_code": 0x10,
            "icon": 1,
            "sort": 0,
            "code_type": 0x10,
            "device_type": 0x10,
            "code_id_hex": "00 " * 15 + "00",
            "hide": 0,
            "input_flag": 0,
            "channel": 0,
            "power_state": 0,
            "ip_address": None,
            "poll_time": -1,
            "input_mode": 0,
            "inputs_configured": False,
            "power_mode": 0,
            "power_style": 0,
            "power_configured": False,
            "share_mode": 0,
            "tail_marker": 1,
            "extras": None,
        },
        "commands": [
            {
                "command_id": 1,
                "name": "Power",
                "restore_data": {
                    "transport": "hub_code_record",
                    "library_type": 0x0D,
                    "button_code": 0,
                    "data_hex": "00 01 02 03 04 05 06 07 08 09",
                },
            },
            {
                "command_id": 2,
                "name": "Ok/Select",
                "restore_data": {
                    "transport": "hub_code_record",
                    "library_type": 0x0D,
                    "button_code": 0,
                    "data_hex": "10 11 12 13 14 15 16 17 18 19",
                },
            },
        ],
        "key_sort": key_sort,
        "input_record": None,
        "button_bindings": [],
        "macros": [],
    }


def _x1s_proxy(monkeypatch) -> X1Proxy:
    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=HUB_VERSION_X1S,
    )
    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(proxy, "reset_ack_queues", lambda: None)
    monkeypatch.setattr(proxy, "_refresh_destination_catalog", lambda timeout=5.0: None)
    return proxy


def _stub_create_sequences(monkeypatch, sequence_calls, *, fail_finalize_at=None):
    def _run_create_sequence(_proxy, steps):
        step_list = list(steps)
        sequence_calls.append(step_list)
        if fail_finalize_at is not None and len(sequence_calls) > 1:
            failed_step = next(
                (step for step in step_list if step.label == fail_finalize_at),
                None,
            )
            if failed_step is not None:
                return types.SimpleNamespace(
                    success=False,
                    assigned_device_id=0x22,
                    failed_step=failed_step,
                    failed_index=step_list.index(failed_step),
                )
        return types.SimpleNamespace(
            success=True,
            assigned_device_id=0x22,
            failed_step=None,
            failed_index=None,
        )

    monkeypatch.setattr(x1_proxy_module, "run_create_sequence", _run_create_sequence)


# ---------------------------------------------------------------------------
# _key_sort_table_has_positions
# ---------------------------------------------------------------------------


def test_key_sort_all_unpositioned_pairs_has_no_positions() -> None:
    # 86 commands, every one reported with the 0xFF sentinel -- the exact
    # table the X1S bench hub rejected with status=0x06.
    msg_hex = "".join(f"{cmd:02x}ff" for cmd in range(1, 87))
    assert _key_sort_table_has_positions(msg_hex) is False


def test_key_sort_mixed_table_has_positions() -> None:
    # Trailing (slot, 0xFF) pairs are a hub-native shape and must be kept.
    assert _key_sort_table_has_positions("01 01 02 02 03 ff") is True


def test_key_sort_zero_position_is_unpositioned() -> None:
    # Positions are 1-based; 0x00 means "unset" (mirrors sort_id==0 in the
    # command-add registration). Live X1S repro (2026-07-14): a table whose
    # only non-0xFF position byte was 0x00 -- left behind by a command-add
    # on a device without a sort table -- was rejected with status=0x06.
    msg_hex = "".join(f"{cmd:02x}ff" for cmd in range(1, 86)) + "5600"
    assert _key_sort_table_has_positions(msg_hex) is False


def test_key_sort_empty_table_has_no_positions() -> None:
    assert _key_sort_table_has_positions("") is False


def test_key_sort_malformed_hex_defers_to_builder_validation() -> None:
    assert _key_sort_table_has_positions("zz") is True


# ---------------------------------------------------------------------------
# finalize step list construction
# ---------------------------------------------------------------------------


def test_restore_skips_key_sort_write_for_all_unpositioned_table(monkeypatch) -> None:
    proxy = _x1s_proxy(monkeypatch)
    sequence_calls: list[list[Any]] = []
    _stub_create_sequences(monkeypatch, sequence_calls)

    msg_hex = " ".join(f"{cmd:02x} ff" for cmd in (1, 2))
    result = proxy.restore_device(_device_backup({"device_id": 8, "msg_hex": msg_hex}))

    assert result is not None and result["status"] == "success"
    post_families = [step.family for step in sequence_calls[1]]
    assert 0x61 not in post_families


def test_restore_skips_key_sort_write_for_empty_msg_hex(monkeypatch) -> None:
    # The STATUS_ACK status=0x07 capture path stores msg_hex="" -- no write.
    proxy = _x1s_proxy(monkeypatch)
    sequence_calls: list[list[Any]] = []
    _stub_create_sequences(monkeypatch, sequence_calls)

    result = proxy.restore_device(_device_backup({"device_id": 8, "msg_hex": ""}))

    assert result is not None and result["status"] == "success"
    post_families = [step.family for step in sequence_calls[1]]
    assert 0x61 not in post_families


def test_restore_replays_positioned_key_sort_table_verbatim(monkeypatch) -> None:
    proxy = _x1s_proxy(monkeypatch)
    sequence_calls: list[list[Any]] = []
    _stub_create_sequences(monkeypatch, sequence_calls)

    result = proxy.restore_device(
        _device_backup({"device_id": 8, "msg_hex": "01 01 02 ff"})
    )

    assert result is not None and result["status"] == "success"
    key_sort_steps = [step for step in sequence_calls[1] if step.family == 0x61]
    assert len(key_sort_steps) == 1
    # Table bytes ride inside the paged body after [0x01, pages_be, dev_id];
    # trailing (slot, 0xFF) pairs stay verbatim.
    assert bytes.fromhex("01 01 02 ff") in key_sort_steps[0].payload


# ---------------------------------------------------------------------------
# finalize-failure rollback
# ---------------------------------------------------------------------------


def test_finalize_failure_rolls_back_created_device(monkeypatch) -> None:
    proxy = _x1s_proxy(monkeypatch)
    sequence_calls: list[list[Any]] = []
    _stub_create_sequences(
        monkeypatch, sequence_calls, fail_finalize_at="key-sort page=1/1"
    )

    deleted: list[int] = []

    def _delete_device(device_id: int) -> dict[str, Any]:
        deleted.append(device_id)
        return {"device_id": device_id, "confirmed_activities": [], "status": "success"}

    monkeypatch.setattr(proxy, "delete_device", _delete_device)

    result = proxy.restore_device(
        _device_backup({"device_id": 8, "msg_hex": "01 01 02 02"})
    )

    assert result is None
    assert deleted == [0x22]


def test_finalize_failure_keeps_device_id_when_rollback_fails(monkeypatch) -> None:
    proxy = _x1s_proxy(monkeypatch)
    sequence_calls: list[list[Any]] = []
    _stub_create_sequences(
        monkeypatch, sequence_calls, fail_finalize_at="key-sort page=1/1"
    )
    monkeypatch.setattr(proxy, "delete_device", lambda device_id: None)

    backup = _device_backup({"device_id": 8, "msg_hex": "01 01 02 02"})
    request = DeviceCreateRequest(
        transport="ir",
        device_block=dict(backup["device"]),
        commands=list(backup["commands"]),
        key_sort=dict(backup["key_sort"]),
    )
    result = proxy._run_restore_style_device_create(request)

    assert result.success is False
    assert result.device_id == 0x22
    assert result.failed_step_label == "key-sort page=1/1"


def test_finalize_failure_clears_device_id_when_rollback_succeeds(monkeypatch) -> None:
    proxy = _x1s_proxy(monkeypatch)
    sequence_calls: list[list[Any]] = []
    _stub_create_sequences(
        monkeypatch, sequence_calls, fail_finalize_at="key-sort page=1/1"
    )
    monkeypatch.setattr(
        proxy,
        "delete_device",
        lambda device_id: {
            "device_id": device_id,
            "confirmed_activities": [],
            "status": "success",
        },
    )

    backup = _device_backup({"device_id": 8, "msg_hex": "01 01 02 02"})
    request = DeviceCreateRequest(
        transport="ir",
        device_block=dict(backup["device"]),
        commands=list(backup["commands"]),
        key_sort=dict(backup["key_sort"]),
    )
    result = proxy._run_restore_style_device_create(request)

    assert result.success is False
    assert result.device_id is None
    assert result.failed_step_label == "key-sort page=1/1"
