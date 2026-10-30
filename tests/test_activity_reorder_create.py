"""Tests for the live catalog-order writes: reorder_activities /
reorder_devices / create_activity."""
from typing import Any

import pytest

from custom_components.sofabaton_x1s.const import HUB_VERSION_X1, HUB_VERSION_X1S, HUB_VERSION_X2
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
    OP_REMOTE_SYNC,
    OP_X2_REMOTE_SYNC,
)
from custom_components.sofabaton_x1s.lib.proxy_activity_ops import ActivityOpsMixin
from custom_components.sofabaton_x1s.lib.x1_proxy import X1Proxy
import custom_components.sofabaton_x1s.lib.proxy_restore as proxy_restore_module

# The conftest stubs _settle_order for every test that is not about it; the
# tests of it put this (captured at import) back.
_REAL_SETTLE_ORDER = ActivityOpsMixin._settle_order


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
    proxy._activities_catalog_ready = True  # a seeded catalog counts as read (W2)


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
    # The X1 remote takes a new activity order on its own (bench_333): no remote sync.
    assert [family for family, _payload in sent] == [FAMILY_ACTIVITY_SORT]
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
    proxy._devices_catalog_ready = True  # a seeded catalog counts as read (W2)


def test_reorder_devices_sends_family_11_order_and_no_x1_remote_sync(monkeypatch) -> None:
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
    # The X1 remote takes a new device order on its own (bench_333): no remote sync.
    assert [family for family, _payload in sent] == [FAMILY_DEVICE_SORT]
    # Golden payload from the live X1 bench write (opcode 0x1011,
    # bench 2026-07-16): reverse order 0x06→1 … 0x01→6; the hub acked and
    # restamped every record's sort byte to match.
    assert sent[0][1] == bytes.fromhex(
        "01 00 01 01 00 01 00 06 01 00 05 02 00 04 03 00 03 04 00 02 05 00 01 06 2c"
    )
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


# ── the remote sync after a reorder, per hub ────────────────────────────


def _resync_remote_frame(hub_version: str, monkeypatch) -> tuple[int, bytes]:
    """The frame the bench-validated ``resync_remote`` enqueues on this hub."""

    proxy = _make_proxy(hub_version)
    enqueued: list[tuple[int, bytes]] = []
    monkeypatch.setattr(
        proxy, "enqueue_cmd", lambda opcode, payload=b"", **_kw: enqueued.append((opcode, payload)) or True
    )
    assert proxy.resync_remote() is True
    assert len(enqueued) == 1
    return enqueued[0]


@pytest.mark.parametrize(
    "hub_version, trigger",
    [
        (HUB_VERSION_X1, (OP_REMOTE_SYNC, b"")),
        (HUB_VERSION_X1S, (OP_REMOTE_SYNC, b"")),
        # The X2 gets its order-only sync (~10 s, bench_333 C3) instead of
        # the all-remotes full broadcast (a bare 0x0064 starts nothing there).
        (HUB_VERSION_X2, (OP_X2_REMOTE_SYNC, b"\x00\x00\xff\x00")),
    ],
)
@pytest.mark.parametrize("kind", ["activity", "device"])
def test_reorder_remote_sync_is_the_resync_remote_frame(monkeypatch, hub_version, trigger, kind) -> None:
    proxy = _make_proxy(hub_version)
    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    if kind == "activity":
        _seed_x1s_activity(proxy, 0x65, "Watch TV")
        _seed_x1s_activity(proxy, 0x66, "Play Xbox")
        monkeypatch.setattr(proxy, "_request_activities_and_wait", lambda timeout=15.0: True)
        reorder, sort_family = proxy.reorder_activities, FAMILY_ACTIVITY_SORT
    else:
        _seed_device(proxy, 0x01, "TV")
        _seed_device(proxy, 0x02, "Soundbar")
        monkeypatch.setattr(proxy, "_request_devices_and_wait", lambda timeout=15.0: True)
        reorder, sort_family = proxy.reorder_devices, FAMILY_DEVICE_SORT

    wire: list[tuple[int, bytes]] = []
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: wire.append((opcode, payload)))
    ack_waits: list[list[tuple[int, int | None]]] = []
    monkeypatch.setattr(
        proxy,
        "wait_for_ack_any",
        lambda candidates, timeout=5.0, not_before=None: ack_waits.append(candidates) or (0x0103, b"\x00"),
    )

    result = reorder([0x02, 0x01] if kind == "device" else [0x66, 0x65])

    assert result is not None and result["status"] == "success"
    if hub_version == HUB_VERSION_X1:
        # The X1 remote takes a new device or activity order on its own (bench_333).
        assert [opcode & 0xFF for opcode, _payload in wire] == [sort_family] and len(ack_waits) == 1
        return
    assert [opcode & 0xFF for opcode, _payload in wire] == [sort_family, FAMILY_REMOTE_SYNC]
    assert wire[1] == trigger
    if hub_version != HUB_VERSION_X2:
        # The X1/X1S have no order-only form: the trigger is resync_remote's.
        assert wire[1] == _resync_remote_frame(hub_version, monkeypatch)
    # The trigger's own STATUS_ACK is consumed as part of the step.
    assert len(ack_waits) == 2 and ack_waits[1][0] == (0x0103, 0x00)


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


def test_create_activity_carries_a_picked_icon_and_color(monkeypatch) -> None:
    proxy = _make_proxy("X2")
    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(proxy, "_settle_order", lambda kind, ids: "kept")
    monkeypatch.setattr(proxy, "sync_remotes_after_write", lambda **kw: True)
    captured: dict[str, Any] = {}
    monkeypatch.setattr(
        proxy,
        "restore_activity",
        lambda payload, **kw: captured.update(payload=payload) or {"status": "success", "activity_id": 0x69},
    )

    assert proxy.create_activity("Sleep", icon=34, color_id=3) is not None
    assert (captured["payload"]["device"]["icon"], captured["payload"]["device"]["color_id"]) == (34, 3)


def test_create_activity_refuses_an_icon_the_hub_lacks(monkeypatch) -> None:
    proxy = _make_proxy()  # X1S: icons 1-16, no colors
    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(proxy, "restore_activity", lambda *a, **kw: pytest.fail("must not write"))

    assert proxy.create_activity("Sleep", icon=34) is None
    assert proxy.create_activity("Sleep", color_id=3) is None


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


# ── the display order after a create (ordering audit, 2026-10-14) ────────


def _seed_sorted(proxy: X1Proxy, kind: str, sorts: dict[int, int]) -> None:
    table = proxy.state.devices if kind == "devices" else proxy.state.activities
    for entity_id, sort in sorts.items():
        body = bytearray(120)
        body[4] = entity_id & 0xFF
        body[6] = sort & 0xFF
        table[entity_id] = {"name": f"Entity {entity_id}", "raw_body": bytes(body)}
    setattr(proxy, f"_{kind}_catalog_ready", True)


def _settling(monkeypatch, sorts: dict[int, int], *, kind: str = "devices", read_ok: bool = True):
    proxy = _make_proxy()
    monkeypatch.setattr(ActivityOpsMixin, "_settle_order", _REAL_SETTLE_ORDER)
    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    _seed_sorted(proxy, kind, sorts)
    monkeypatch.setattr(proxy, f"_request_{kind}_and_wait", lambda timeout=15.0: read_ok)
    writes: list[tuple[list[int], bool]] = []
    monkeypatch.setattr(
        proxy,
        f"reorder_{kind}",
        lambda ids, *, remote_sync=True: writes.append((list(ids), remote_sync)) or {"status": "success"},
    )
    return proxy, writes


def test_settle_puts_a_new_device_last(monkeypatch) -> None:
    # The X1S keeps a created device at the sort byte the create carried,
    # 0 for an empty one (bench_332, 2026-10-14). The write sends no
    # remote-sync trigger: the create owns that.
    proxy, writes = _settling(monkeypatch, {1: 1, 6: 2, 4: 3, 3: 0})

    assert proxy._settle_order("devices", [3]) == "written"
    assert writes == [([1, 6, 4, 3], False)]


def test_settle_leaves_a_device_the_hub_appended_alone(monkeypatch) -> None:
    # The X1 appends a created device itself (sort N+1).
    proxy, writes = _settling(monkeypatch, {1: 1, 2: 2, 3: 3})

    assert proxy._settle_order("devices", [3]) == "kept"
    assert writes == []


def test_settle_puts_several_new_ones_last_in_the_given_order(monkeypatch) -> None:
    # A merged restore on the X1S: the creates kept the backup's sort
    # bytes and tie with what was there.
    proxy, writes = _settling(monkeypatch, {1: 1, 2: 2, 8: 2, 9: 1})

    assert proxy._settle_order("devices", [9, 8]) == "written"
    assert writes == [([1, 2, 9, 8], False)]


def test_settle_renumbers_ties_and_zeros_an_older_create_left(monkeypatch) -> None:
    proxy, writes = _settling(monkeypatch, {1: 1, 5: 1, 6: 2, 7: 0})

    assert proxy._settle_order("devices", []) == "written"
    assert writes == [([1, 5, 6, 7], False)]


def test_settle_orders_activities_too(monkeypatch) -> None:
    proxy, writes = _settling(monkeypatch, {0x65: 2, 0x66: 1, 0x67: 0}, kind="activities")

    assert proxy._settle_order("activities", [0x67]) == "written"
    assert writes == [([0x66, 0x65, 0x67], False)]


def test_settle_reports_a_failed_read_or_write(monkeypatch) -> None:
    proxy, writes = _settling(monkeypatch, {1: 1, 2: 0}, read_ok=False)
    assert proxy._settle_order("devices", [2]) == "failed"
    assert writes == []

    proxy, _writes = _settling(monkeypatch, {1: 1, 2: 0})
    monkeypatch.setattr(proxy, "reorder_devices", lambda ids, *, remote_sync=True: None)
    assert proxy._settle_order("devices", [2]) == "failed"


@pytest.mark.parametrize("kind", ["activity", "device"])
def test_reorder_without_remote_sync_sends_no_trigger(monkeypatch, kind) -> None:
    proxy = _make_proxy(HUB_VERSION_X1S)
    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    if kind == "activity":
        _seed_x1s_activity(proxy, 0x65, "Watch TV")
        _seed_x1s_activity(proxy, 0x66, "Play Xbox")
        monkeypatch.setattr(proxy, "_request_activities_and_wait", lambda timeout=15.0: True)
        reorder, sort_family, order = proxy.reorder_activities, FAMILY_ACTIVITY_SORT, [0x66, 0x65]
    else:
        _seed_device(proxy, 0x01, "TV")
        _seed_device(proxy, 0x02, "Soundbar")
        monkeypatch.setattr(proxy, "_request_devices_and_wait", lambda timeout=15.0: True)
        reorder, sort_family, order = proxy.reorder_devices, FAMILY_DEVICE_SORT, [0x02, 0x01]
    wire: list[tuple[int, bytes]] = []
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: wire.append((opcode, payload)))
    monkeypatch.setattr(
        proxy, "wait_for_ack_any", lambda candidates, timeout=5.0, not_before=None: (0x0103, b"\x00")
    )

    assert reorder(order, remote_sync=False)["status"] == "success"
    assert [opcode & 0xFF for opcode, _payload in wire] == [sort_family]


def test_create_activity_settles_the_order_before_its_one_remote_sync(monkeypatch) -> None:
    proxy = _make_proxy()
    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    events: list[Any] = []

    def _restore_activity(payload, *, device_id_map, send_remote_sync=True, **kwargs):
        events.append(("restore", send_remote_sync))
        return {"status": "success", "activity_id": 0x69}

    monkeypatch.setattr(proxy, "restore_activity", _restore_activity)
    monkeypatch.setattr(proxy, "_settle_order", lambda kind, ids: events.append(("settle", kind, list(ids))) or "kept")
    monkeypatch.setattr(proxy, "resync_remote", lambda hub_version=None: events.append("resync") or True)

    assert proxy.create_activity("Movie Night") == {"status": "success", "activity_id": 0x69}
    assert events == [("restore", False), ("settle", "activities", [0x69]), "resync"]
