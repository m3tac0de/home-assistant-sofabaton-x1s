"""Tests for the live catalog-order writes: reorder_activities /
reorder_devices / create_activity."""
from typing import Any

from custom_components.sofabaton_x1s.const import HUB_VERSION_X1, HUB_VERSION_X1S
from custom_components.sofabaton_x1s.lib.device_create import (
    FAMILY_REMOTE_SYNC,
    DeviceCreateResult,
)
from custom_components.sofabaton_x1s.lib.hub_versions import (
    ACTIVITY_BACKUP_SCHEMA_VERSION,
)
from custom_components.sofabaton_x1s.lib.protocol_const import (
    FAMILY_ACTIVITY_SORT,
    FAMILY_DEVICE_SORT,
)
from custom_components.sofabaton_x1s.lib.x1_proxy import X1Proxy
import custom_components.sofabaton_x1s.lib.proxy_restore as proxy_restore_module


def _make_proxy(hub_version: str = HUB_VERSION_X1S) -> X1Proxy:
    return X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=hub_version,
    )


def _seed_x1s_activity(proxy: X1Proxy, act_lo: int, name: str) -> None:
    row_payload = bytearray(214)
    row_payload[0] = 0x01
    row_payload[6:8] = act_lo.to_bytes(2, "big")
    row_payload[9] = 0x00  # sort byte (record body[6])
    row_payload[170:174] = bytes([0xFC, 0x00, 0xFC, 0x00])
    proxy.state.activities[act_lo] = {
        "name": name,
        "active": False,
        "needs_confirm": False,
    }
    proxy._activity_row_payloads[act_lo] = bytes(row_payload)


# ── reorder_activities ──────────────────────────────────────────────────


def test_reorder_activities_sends_family_51_order_then_remote_sync(monkeypatch) -> None:
    proxy = _make_proxy()
    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    _seed_x1s_activity(proxy, 0x65, "Watch a movie")
    _seed_x1s_activity(proxy, 0x66, "Play a game")
    _seed_x1s_activity(proxy, 0x67, "Listen to music")

    sent: list[tuple[int, bytes]] = []
    monkeypatch.setattr(proxy, "_send_family_frame", lambda family, payload: sent.append((family, payload)))
    monkeypatch.setattr(
        proxy,
        "wait_for_ack_any",
        lambda candidates, timeout=5.0, not_before=None: (0x0103, b"\x00"),
    )
    refreshed: list[bool] = []
    monkeypatch.setattr(
        proxy, "_request_activities_and_wait", lambda timeout=15.0: refreshed.append(True) or True
    )

    result = proxy.reorder_activities([0x67, 0x66, 0x65])

    assert result == {"status": "success", "ordered_ids": [0x67, 0x66, 0x65]}
    assert [family for family, _payload in sent] == [FAMILY_ACTIVITY_SORT, FAMILY_REMOTE_SYNC]
    # Golden payload from the live X1S app capture (opcode 0x1051,
    # bench 2026-07-14): order 0x67→1, 0x66→2, 0x65→3.
    assert sent[0][1] == bytes.fromhex("01 00 01 01 00 01 00 67 01 00 66 02 00 65 03 3a")
    assert sent[1][1] == b""
    assert refreshed == [True]


def test_reorder_activities_uses_same_write_on_x1(monkeypatch) -> None:
    proxy = _make_proxy(HUB_VERSION_X1)
    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    proxy.state.activities[0x65] = {"name": "Watch TV", "active": False, "needs_confirm": False}
    proxy.state.activities[0x66] = {"name": "Play Xbox", "active": True, "needs_confirm": False}

    sent: list[tuple[int, bytes]] = []
    monkeypatch.setattr(proxy, "_send_family_frame", lambda family, payload: sent.append((family, payload)))
    monkeypatch.setattr(
        proxy,
        "wait_for_ack_any",
        lambda candidates, timeout=5.0, not_before=None: (0x0103, b"\x00"),
    )
    monkeypatch.setattr(proxy, "_request_activities_and_wait", lambda timeout=15.0: True)

    result = proxy.reorder_activities([0x66, 0x65])

    assert result == {"status": "success", "ordered_ids": [0x66, 0x65]}
    assert [family for family, _payload in sent] == [FAMILY_ACTIVITY_SORT, FAMILY_REMOTE_SYNC]
    payload = sent[0][1]
    assert payload[6:12] == bytes([0x00, 0x66, 0x01, 0x00, 0x65, 0x02])
    assert payload[-1] == sum(payload[3:-1]) & 0xFF


def test_reorder_activities_rejects_unknown_and_partial_orders(monkeypatch) -> None:
    proxy = _make_proxy()
    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    _seed_x1s_activity(proxy, 0x65, "Watch TV")
    _seed_x1s_activity(proxy, 0x66, "Play Xbox")

    sent: list[Any] = []
    monkeypatch.setattr(proxy, "_send_family_frame", lambda family, payload: sent.append(family))

    # Unknown id refused.
    assert proxy.reorder_activities([0x65, 0x66, 0x77]) is None
    # Partial coverage refused (0x66 missing).
    assert proxy.reorder_activities([0x65]) is None
    assert sent == []


def test_reorder_activities_aborts_on_missing_ack(monkeypatch) -> None:
    proxy = _make_proxy()
    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    _seed_x1s_activity(proxy, 0x65, "Watch TV")
    _seed_x1s_activity(proxy, 0x66, "Play Xbox")

    sent: list[Any] = []
    monkeypatch.setattr(proxy, "_send_family_frame", lambda family, payload: sent.append(family))
    monkeypatch.setattr(
        proxy,
        "wait_for_ack_any",
        lambda candidates, timeout=5.0, not_before=None: None,
    )
    monkeypatch.setattr(proxy, "_request_activities_and_wait", lambda timeout=15.0: True)

    assert proxy.reorder_activities([0x66, 0x65]) is None
    assert sent == [FAMILY_ACTIVITY_SORT]


def test_reorder_activities_refused_while_proxy_client_connected(monkeypatch) -> None:
    proxy = _make_proxy()
    monkeypatch.setattr(proxy, "can_issue_commands", lambda: False)
    _seed_x1s_activity(proxy, 0x65, "Watch TV")

    assert proxy.reorder_activities([0x65]) is None


# ── reorder_devices ─────────────────────────────────────────────────────


def _seed_device(proxy: X1Proxy, dev_lo: int, name: str, *, kind: int = 0x00) -> None:
    raw_body = bytearray(120)
    raw_body[3] = kind & 0xFF
    raw_body[4] = dev_lo & 0xFF
    proxy.state.devices[dev_lo] = {"name": name, "raw_body": bytes(raw_body)}


def test_reorder_devices_sends_family_11_order_then_remote_sync(monkeypatch) -> None:
    proxy = _make_proxy(HUB_VERSION_X1)
    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    for dev_lo, name in enumerate(
        ["TCL C8K", "Apple TV", "NVIDIA SHIELD", "Sonos Move 2", "Marantz", "Xbox"],
        start=1,
    ):
        _seed_device(proxy, dev_lo, name)

    sent: list[tuple[int, bytes]] = []
    monkeypatch.setattr(proxy, "_send_family_frame", lambda family, payload: sent.append((family, payload)))
    monkeypatch.setattr(
        proxy,
        "wait_for_ack_any",
        lambda candidates, timeout=5.0, not_before=None: (0x0103, b"\x00"),
    )
    refreshed: list[bool] = []
    monkeypatch.setattr(
        proxy, "_request_devices_and_wait", lambda timeout=15.0: refreshed.append(True) or True
    )

    result = proxy.reorder_devices([6, 5, 4, 3, 2, 1])

    assert result == {"status": "success", "ordered_ids": [6, 5, 4, 3, 2, 1]}
    assert [family for family, _payload in sent] == [FAMILY_DEVICE_SORT, FAMILY_REMOTE_SYNC]
    # Golden payload from the live X1 bench write (opcode 0x1011,
    # bench 2026-07-16): reverse order 0x06→1 … 0x01→6; the hub acked and
    # restamped every record's sort byte to match.
    assert sent[0][1] == bytes.fromhex(
        "01 00 01 01 00 01 00 06 01 00 05 02 00 04 03 00 03 04 00 02 05 00 01 06 2c"
    )
    assert sent[1][1] == b""
    assert refreshed == [True]


def test_reorder_devices_rows_lead_with_record_kind_byte(monkeypatch) -> None:
    proxy = _make_proxy()
    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    _seed_device(proxy, 0x01, "TV", kind=0x02)
    _seed_device(proxy, 0x02, "Soundbar", kind=0x00)

    sent: list[tuple[int, bytes]] = []
    monkeypatch.setattr(proxy, "_send_family_frame", lambda family, payload: sent.append((family, payload)))
    monkeypatch.setattr(
        proxy,
        "wait_for_ack_any",
        lambda candidates, timeout=5.0, not_before=None: (0x0103, b"\x00"),
    )
    monkeypatch.setattr(proxy, "_request_devices_and_wait", lambda timeout=15.0: True)

    result = proxy.reorder_devices([0x02, 0x01])

    assert result == {"status": "success", "ordered_ids": [0x02, 0x01]}
    payload = sent[0][1]
    assert payload[6:12] == bytes([0x00, 0x02, 0x01, 0x02, 0x01, 0x02])
    assert payload[-1] == sum(payload[3:-1]) & 0xFF


def test_reorder_devices_rejects_unknown_and_partial_orders(monkeypatch) -> None:
    proxy = _make_proxy()
    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    _seed_device(proxy, 0x01, "TV")
    _seed_device(proxy, 0x02, "Soundbar")

    sent: list[Any] = []
    monkeypatch.setattr(proxy, "_send_family_frame", lambda family, payload: sent.append(family))

    # Unknown id refused.
    assert proxy.reorder_devices([0x01, 0x02, 0x77]) is None
    # Partial coverage refused (0x02 missing).
    assert proxy.reorder_devices([0x01]) is None
    assert sent == []


def test_reorder_devices_aborts_on_missing_ack(monkeypatch) -> None:
    proxy = _make_proxy()
    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    _seed_device(proxy, 0x01, "TV")
    _seed_device(proxy, 0x02, "Soundbar")

    sent: list[Any] = []
    monkeypatch.setattr(proxy, "_send_family_frame", lambda family, payload: sent.append(family))
    monkeypatch.setattr(
        proxy,
        "wait_for_ack_any",
        lambda candidates, timeout=5.0, not_before=None: None,
    )
    monkeypatch.setattr(proxy, "_request_devices_and_wait", lambda timeout=15.0: True)

    assert proxy.reorder_devices([0x02, 0x01]) is None
    assert sent == [FAMILY_DEVICE_SORT]


def test_reorder_devices_refused_while_proxy_client_connected(monkeypatch) -> None:
    proxy = _make_proxy()
    monkeypatch.setattr(proxy, "can_issue_commands", lambda: False)
    _seed_device(proxy, 0x01, "TV")

    assert proxy.reorder_devices([0x01]) is None


# ── create_activity ─────────────────────────────────────────────────────


def test_create_activity_builds_minimal_backup_payload(monkeypatch) -> None:
    proxy = _make_proxy()
    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(proxy, "_request_activities_and_wait", lambda timeout=15.0: True)

    captured: dict[str, Any] = {}

    def _restore_activity(payload, *, device_id_map, **kwargs):
        captured["payload"] = payload
        captured["device_id_map"] = device_id_map
        return {"status": "success", "activity_id": 0x69}

    monkeypatch.setattr(proxy, "restore_activity", _restore_activity)

    result = proxy.create_activity("  Movie Night  ")

    assert result == {"status": "success", "activity_id": 0x69}
    payload = captured["payload"]
    assert payload["kind"] == "activity_backup"
    assert payload["schema_version"] == ACTIVITY_BACKUP_SCHEMA_VERSION
    assert payload["device"]["entity_type"] == "activity"
    assert payload["device"]["name"] == "Movie Night"
    assert payload["button_bindings"] == []
    assert payload["macros"] == []
    assert payload["favorite_slots"] == []
    assert captured["device_id_map"] == {}


def test_create_activity_payload_passes_restore_validation(monkeypatch) -> None:
    """The synthetic payload must survive restore_activity's own validation."""

    proxy = _make_proxy()
    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(proxy, "_request_activities_and_wait", lambda timeout=15.0: True)

    captured: dict[str, Any] = {}

    def _run_device_create(target_proxy, request):
        captured["request"] = request
        return DeviceCreateResult(success=True, device_id=0x6A)

    monkeypatch.setattr(proxy_restore_module, "run_device_create", _run_device_create)

    result = proxy.create_activity("Game Room")

    assert result == {"status": "success", "activity_id": 0x6A}
    request = captured["request"]
    assert request.entity_kind == "activity"
    assert request.device_block["name"] == "Game Room"
    assert request.button_bindings == []
    assert request.macros == []
    assert request.favorites == []


def test_create_activity_refuses_empty_name(monkeypatch) -> None:
    proxy = _make_proxy()
    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)

    assert proxy.create_activity("   ") is None


def test_create_activity_refused_while_proxy_client_connected(monkeypatch) -> None:
    proxy = _make_proxy()
    monkeypatch.setattr(proxy, "can_issue_commands", lambda: False)

    assert proxy.create_activity("Movie Night") is None


def test_create_activity_returns_none_on_restore_failure(monkeypatch) -> None:
    proxy = _make_proxy()
    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(
        proxy,
        "restore_activity",
        lambda payload, *, device_id_map, **kwargs: None,
    )

    assert proxy.create_activity("Movie Night") is None
