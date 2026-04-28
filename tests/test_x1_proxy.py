"""Tests for x1_proxy helpers."""
import sys
import types

from custom_components.sofabaton_x1s.const import (
    HUB_VERSION_X1,
    HUB_VERSION_X1S,
    HUB_VERSION_X2,
    MDNS_SERVICE_TYPE_X1,
)
from custom_components.sofabaton_x1s.lib.protocol_const import (
    ButtonName,
    OP_FIND_REMOTE,
    OP_FIND_REMOTE_X2,
    OP_REMOTE_SYNC,
    OP_X2_REMOTE_LIST,
    OP_X2_REMOTE_SYNC,
    OP_REQ_COMMANDS,
    OP_ACTIVITY_ASSIGN_FINALIZE,
)
from custom_components.sofabaton_x1s.lib.frame_handlers import FrameContext
from custom_components.sofabaton_x1s.lib.opcode_handlers import ActivityMapHandler, DeviceButtonFamilyHandler
from custom_components.sofabaton_x1s.lib.state_helpers import ActivityCache
from custom_components.sofabaton_x1s.lib.x1_proxy import X1Proxy


def test_incomplete_activity_snapshot_preserves_committed_state() -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)
    proxy.state.activities = {0x65: {"name": "Watch TV", "active": True, "needs_confirm": False}}
    proxy.state.set_hint(0x65)

    proxy._begin_activity_request()
    accepted = proxy.ingest_activity_row(
        row_idx=1,
        expected_rows=5,
        act_id=0x66,
        activity={"id": 0x66, "name": "Play Xbox", "active": False, "needs_confirm": False},
        payload=b"\x01\x00\x01\x05",
    )

    assert accepted is True
    assert proxy.state.current_activity_hint == 0x65

    proxy._on_activities_burst_end("activities")

    assert proxy.state.activities == {0x65: {"name": "Watch TV", "active": True, "needs_confirm": False}}
    assert proxy.state.current_activity_hint == 0x65


def test_complete_activity_snapshot_commits_after_row1_then_out_of_order_rows() -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    proxy._begin_activity_request()
    assert proxy.ingest_activity_row(
        row_idx=1,
        expected_rows=3,
        act_id=0x65,
        activity={"id": 0x65, "name": "Watch TV", "active": False, "needs_confirm": False},
    )
    assert proxy.ingest_activity_row(
        row_idx=3,
        expected_rows=3,
        act_id=0x67,
        activity={"id": 0x67, "name": "Play Switch 2", "active": False, "needs_confirm": False},
    )
    assert proxy.ingest_activity_row(
        row_idx=2,
        expected_rows=3,
        act_id=0x66,
        activity={"id": 0x66, "name": "Play Xbox", "active": True, "needs_confirm": False},
    )

    proxy._on_activities_burst_end("activities")

    assert proxy.state.activities == {
        0x65: {"name": "Watch TV", "active": False, "needs_confirm": False},
        0x66: {"name": "Play Xbox", "active": True, "needs_confirm": False},
        0x67: {"name": "Play Switch 2", "active": False, "needs_confirm": False},
    }
    assert proxy.state.current_activity_hint == 0x66


def test_try_finish_activities_burst_ends_burst_once_snapshot_is_complete() -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    proxy._begin_activity_request()
    assert proxy.ingest_activity_row(
        row_idx=1,
        expected_rows=2,
        act_id=0x65,
        activity={"id": 0x65, "name": "Watch TV", "active": False, "needs_confirm": False},
    )
    assert proxy.ingest_activity_row(
        row_idx=2,
        expected_rows=2,
        act_id=0x66,
        activity={"id": 0x66, "name": "Play Xbox", "active": True, "needs_confirm": False},
    )
    proxy._burst.start("activities", now=0.0)

    finished = proxy.try_finish_activities_burst()

    assert finished is True
    assert proxy._burst.active is False
    assert proxy.state.activities == {
        0x65: {"name": "Watch TV", "active": False, "needs_confirm": False},
        0x66: {"name": "Play Xbox", "active": True, "needs_confirm": False},
    }
    assert proxy.state.current_activity_hint == 0x66


def test_try_finish_activity_map_burst_ends_matching_burst() -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    proxy._activity_map_complete.add(0x65)
    proxy._burst.start("activity_map:101", now=0.0)

    finished = proxy.try_finish_activity_map_burst(0x65)

    assert finished is True
    assert proxy._burst.active is False


def test_try_finish_buttons_burst_requires_expected_final_frame() -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    proxy._burst.start("buttons:101", now=0.0)
    proxy.note_buttons_frame(0x65, frame_no=1, total_frames=2)

    assert proxy.try_finish_buttons_burst(0x65, frame_no=1) is False
    assert proxy.try_finish_buttons_burst(0x65, frame_no=2) is True
    assert proxy._burst.active is False


def test_ghost_activity_row_is_ignored_without_request_in_flight() -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    accepted = proxy.ingest_activity_row(
        row_idx=1,
        expected_rows=2,
        act_id=0x65,
        activity={"id": 0x65, "name": "Watch TV", "active": True, "needs_confirm": False},
    )

    assert accepted is False
    assert proxy.state.activities == {}


def test_incomplete_x2_activity_snapshot_retries_once_after_delay(monkeypatch) -> None:
    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=HUB_VERSION_X2,
    )

    proxy._begin_activity_request()
    proxy.ingest_activity_row(
        row_idx=1,
        expected_rows=5,
        act_id=0x65,
        activity={"id": 0x65, "name": "Watch TV", "active": False, "needs_confirm": False},
    )

    proxy._on_activities_burst_end("activities")

    assert proxy._activity_retry_due_at is not None
    assert proxy._activity_retry_count == 1

    retries: list[bool] = []
    monkeypatch.setattr(proxy, "request_activities", lambda *, is_retry=False: retries.append(is_retry) or True)
    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    proxy._burst.active = False

    proxy._handle_idle(proxy._activity_retry_due_at)

    assert retries == [True]
    assert proxy._activity_retry_due_at is None


def test_ensure_commands_for_activity_groups_favorites(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    cache = ActivityCache()
    act = 0x10
    cache.activity_favorite_slots[act] = [
        {"button_id": 0xFE, "device_id": 0x01, "command_id": 0x1111},
        {"button_id": 0xFD, "device_id": 0x01, "command_id": 0x2222},
        {"button_id": 0xFC, "device_id": 0x02, "command_id": 0x3333},
    ]
    proxy.state = cache

    calls: list[tuple[int, int, bool]] = []

    def fake_get_single(ent_id: int, command_id: int, fetch_if_missing: bool = True):
        calls.append((ent_id, command_id, fetch_if_missing))
        mappings = {
            (0x01, 0x1111): ({0x1111: "one"}, True),
            (0x01, 0x2222): ({0x2222: "two"}, False),
            (0x02, 0x3333): ({0x3333: "three"}, True),
        }
        return mappings.get((ent_id, command_id), ({}, False))

    monkeypatch.setattr(proxy, "get_single_command_for_entity", fake_get_single)

    commands_by_device, ready = proxy.ensure_commands_for_activity(act)

    assert ready is False
    assert set(calls) == {
        (0x01, 0x1111, True),
        (0x01, 0x2222, True),
        (0x02, 0x3333, True),
    }
    assert commands_by_device == {
        0x01: {0x1111: "one", 0x2222: "two"},
        0x02: {0x3333: "three"},
    }
    assert proxy.state.activity_favorite_labels[act] == {
        (0x01, 0x1111): "one",
        (0x01, 0x2222): "two",
        (0x02, 0x3333): "three",
    }
    assert proxy._favorite_label_requests == {(0x01, 0x2222): {act}}


def test_ensure_commands_for_activity_only_favorites(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    cache = ActivityCache()
    act = 0x10
    cache.activity_favorite_slots[act] = [
        {"button_id": 0xFE, "device_id": 0x01, "command_id": 0xAAAA},
        {"button_id": 0xFD, "device_id": 0x03, "command_id": 0xCCCC},
    ]
    proxy.state = cache

    calls: list[tuple[int, int, bool]] = []

    def fake_get_single(ent_id: int, command_id: int, fetch_if_missing: bool = True):
        calls.append((ent_id, command_id, fetch_if_missing))
        mappings = {
            (0x01, 0xAAAA): ({0xAAAA: "alpha"}, True),
            (0x03, 0xCCCC): ({0xCCCC: "charlie"}, False),
        }
        return mappings.get((ent_id, command_id), ({}, False))

    monkeypatch.setattr(proxy, "get_single_command_for_entity", fake_get_single)

    commands_by_device, ready = proxy.ensure_commands_for_activity(act)

    assert ready is False
    assert set(calls) == {
        (0x01, 0xAAAA, True),
        (0x03, 0xCCCC, True),
    }
    assert commands_by_device == {0x01: {0xAAAA: "alpha"}, 0x03: {0xCCCC: "charlie"}}
    assert proxy.state.activity_favorite_labels[act] == {
        (0x01, 0xAAAA): "alpha",
        (0x03, 0xCCCC): "charlie",
    }




def test_ensure_commands_for_activity_fetches_keybinding_labels(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    cache = ActivityCache()
    act = 0x10
    cache.activity_favorite_slots[act] = [
        {"button_id": 0x01, "device_id": 0x01, "command_id": 0x1111},
    ]
    cache.activity_keybinding_slots[act] = [
        {"button_id": ButtonName.VOL_DOWN, "device_id": 0x01, "command_id": 0x2222},
    ]
    proxy.state = cache

    calls: list[tuple[int, int, bool]] = []

    def fake_get_single(ent_id: int, command_id: int, fetch_if_missing: bool = True):
        calls.append((ent_id, command_id, fetch_if_missing))
        mappings = {
            (0x01, 0x1111): ({0x1111: "Favorite One"}, True),
            (0x01, 0x2222): ({0x2222: "Volume Down Cmd"}, False),
        }
        return mappings.get((ent_id, command_id), ({}, False))

    monkeypatch.setattr(proxy, "get_single_command_for_entity", fake_get_single)

    commands_by_device, ready = proxy.ensure_commands_for_activity(act)

    assert ready is True
    assert set(calls) == {(0x01, 0x1111, True), (0x01, 0x2222, True)}
    assert commands_by_device == {0x01: {0x1111: "Favorite One", 0x2222: "Volume Down Cmd"}}
    assert proxy.state.activity_favorite_labels[act] == {(0x01, 0x1111): "Favorite One"}
    assert proxy.state.activity_keybinding_labels[act] == {(0x01, 0x2222): "Volume Down Cmd"}
    assert proxy._keybinding_label_requests == {(0x01, 0x2222): {act}}


def test_ensure_commands_for_activity_does_not_requeue_keybinding_fetches_during_poll(
    monkeypatch,
) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    cache = ActivityCache()
    act = 0x10
    cache.activity_favorite_slots[act] = [
        {"button_id": 0x01, "device_id": 0x01, "command_id": 0x1111},
    ]
    cache.activity_keybinding_slots[act] = [
        {"button_id": ButtonName.VOL_DOWN, "device_id": 0x01, "command_id": 0x2222},
    ]
    proxy.state = cache
    proxy._keybinding_label_requests[(0x01, 0x2222)] = {act}

    calls: list[tuple[int, int, bool]] = []

    def fake_get_single(ent_id: int, command_id: int, fetch_if_missing: bool = True):
        calls.append((ent_id, command_id, fetch_if_missing))
        mappings = {
            (0x01, 0x1111): ({0x1111: "Favorite One"}, True),
        }
        return mappings.get((ent_id, command_id), ({}, False))

    monkeypatch.setattr(proxy, "get_single_command_for_entity", fake_get_single)

    commands_by_device, ready = proxy.ensure_commands_for_activity(act, fetch_if_missing=False)

    assert ready is True
    assert calls == [(0x01, 0x1111, False)]
    assert commands_by_device == {0x01: {0x1111: "Favorite One"}}
    assert proxy._keybinding_label_requests == {(0x01, 0x2222): {act}}

def test_start_mdns_stops_on_bad_service_type(monkeypatch) -> None:
    registered = []

    class BadTypeInNameException(Exception):
        pass

    class DummyServiceInfo:
        def __init__(self, *, type_, name, addresses, port, properties, server):
            self.type = type_
            self.name = name
            self.addresses = addresses
            self.port = port
            self.properties = properties
            self.server = server

    class DummyZeroconf:
        def __init__(self, *_args, **_kwargs):
            pass

        def register_service(self, info):
            if info.type == "badtype":
                raise BadTypeInNameException("invalid name")
            registered.append(info)

        def close(self):
            pass

    class DummyIPVersion:
        V4Only = object()

    zc_module = types.ModuleType("zeroconf")
    zc_module.BadTypeInNameException = BadTypeInNameException
    zc_module.IPVersion = DummyIPVersion
    zc_module.ServiceInfo = DummyServiceInfo
    zc_module.Zeroconf = DummyZeroconf
    monkeypatch.setitem(sys.modules, "zeroconf", zc_module)
    x1_proxy_module = sys.modules["custom_components.sofabaton_x1s.lib.x1_proxy"]
    monkeypatch.setattr(x1_proxy_module, "_route_local_ip", lambda _ip: "127.0.0.1")
    monkeypatch.setattr(x1_proxy_module, "mdns_service_type_for_props", lambda _props: "badtype")

    proxy = X1Proxy("127.0.0.1", proxy_enabled=True, diag_dump=False, diag_parse=False)
    proxy._start_mdns()

    assert registered == []
    assert proxy._adv_started is False


def test_start_mdns_advertises_x1_service_for_x2_hub(monkeypatch) -> None:
    registered = []

    class DummyServiceInfo:
        def __init__(self, *, type_, name, addresses, port, properties, server):
            self.type = type_
            self.name = name
            self.addresses = addresses
            self.port = port
            self.properties = properties
            self.server = server

    class DummyZeroconf:
        def __init__(self, *_args, **_kwargs):
            pass

        def register_service(self, info):
            registered.append(info)

        def close(self):
            pass

    class DummyIPVersion:
        V4Only = object()

    zc_module = types.ModuleType("zeroconf")
    zc_module.BadTypeInNameException = Exception
    zc_module.IPVersion = DummyIPVersion
    zc_module.ServiceInfo = DummyServiceInfo
    zc_module.Zeroconf = DummyZeroconf
    monkeypatch.setitem(sys.modules, "zeroconf", zc_module)
    x1_proxy_module = sys.modules["custom_components.sofabaton_x1s.lib.x1_proxy"]
    monkeypatch.setattr(x1_proxy_module, "_route_local_ip", lambda _ip: "127.0.0.1")

    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=True,
        diag_dump=False,
        diag_parse=False,
        mdns_txt={"HVER": "3"},
    )
    proxy._start_mdns()

    assert len(registered) == 1
    assert registered[0].type == MDNS_SERVICE_TYPE_X1
    assert proxy._adv_started is True


def test_find_remote_uses_classic_opcode(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    sent: list[tuple[int, bytes]] = []
    monkeypatch.setattr(
        proxy,
        "enqueue_cmd",
        lambda opcode, payload=b"", **_kwargs: sent.append((opcode, payload)) or True,
    )

    assert proxy.find_remote() is True
    assert sent == [(OP_FIND_REMOTE, b"")]


def test_find_remote_uses_x2_opcode(monkeypatch) -> None:
    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=HUB_VERSION_X2,
    )

    sent: list[tuple[int, bytes]] = []
    monkeypatch.setattr(
        proxy,
        "enqueue_cmd",
        lambda opcode, payload=b"", **_kwargs: sent.append((opcode, payload)) or True,
    )

    assert proxy.find_remote() is True
    assert sent == [(OP_FIND_REMOTE_X2, b"\x00\x00\x08")]



def test_resync_remote_uses_classic_opcode(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    sent: list[tuple[int, bytes]] = []
    monkeypatch.setattr(
        proxy,
        "enqueue_cmd",
        lambda opcode, payload=b"", **_kwargs: sent.append((opcode, payload)) or True,
    )

    assert proxy.resync_remote() is True
    assert sent == [(OP_REMOTE_SYNC, b"")]


def test_resync_remote_x2_fetches_id_then_sync(monkeypatch) -> None:
    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=HUB_VERSION_X2,
    )

    sent: list[tuple[int, bytes]] = []

    def _enqueue(opcode, payload=b"", **_kwargs):
        sent.append((opcode, payload))
        return True

    monkeypatch.setattr(proxy, "enqueue_cmd", _enqueue)
    monkeypatch.setattr(proxy, "wait_for_x2_remote_sync_id", lambda timeout=2.0: b"\x00\x08\x5e")

    assert proxy.resync_remote() is True
    assert sent == [
        (OP_X2_REMOTE_LIST, b"\x00"),
        (OP_X2_REMOTE_SYNC, b"\x00\x08\x5e\x01"),
    ]


def test_resync_remote_x2_returns_false_without_remote_id(monkeypatch) -> None:
    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=HUB_VERSION_X2,
    )

    sent: list[tuple[int, bytes]] = []

    def _enqueue(opcode, payload=b"", **_kwargs):
        sent.append((opcode, payload))
        return True

    monkeypatch.setattr(proxy, "enqueue_cmd", _enqueue)
    monkeypatch.setattr(proxy, "wait_for_x2_remote_sync_id", lambda timeout=2.0: None)

    assert proxy.resync_remote() is False
    assert sent == [(OP_X2_REMOTE_LIST, b"\x00")]


def test_send_family_frame_sets_length_in_opcode(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    sent: list[tuple[int, bytes]] = []
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: sent.append((opcode, payload)))

    payload = bytes.fromhex("01 02 03")
    proxy._send_family_frame(0x0E, payload)

    assert sent == [((len(payload) << 8) | 0x0E, payload)]


def test_create_wifi_device_replays_sequence(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(proxy, "wait_for_roku_device_id", lambda timeout=5.0: 0x07)
    ack_waits: list[list[tuple[int, int | None]]] = []

    def _wait_for_roku_ack_any(
        candidates: list[tuple[int, int | None]],
        *,
        timeout: float = 5.0,
    ) -> tuple[int, bytes] | None:
        ack_waits.append(candidates)
        first_opcode = candidates[0][0]
        return first_opcode, b"\x00"

    monkeypatch.setattr(proxy, "wait_for_roku_ack_any", _wait_for_roku_ack_any)

    sent: list[tuple[int, bytes]] = []
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: sent.append((opcode, payload)))

    result = proxy.create_wifi_device(commands=["Launch One"])

    assert result == {"device_id": 0x07, "status": "success"}
    assert proxy.state.devices[0x07] == {"brand": "m3tac0de", "name": "Home Assistant"}
    assert sent
    # first frame is the create-device head family
    assert (sent[0][0] & 0xFF) == 0x07
    families = {opcode & 0xFF for opcode, _ in sent}
    assert {0x07, 0x0E, 0x3E, 0x41, 0x12, 0x46, 0x08, 0x64}.issubset(families)
    assert ack_waits[0][0] == (0x0107, None)
    assert ack_waits[-1][0] == (0x0103, None)
    assert any((0x013E, 0xAB) in wait for wait in ack_waits)
    assert any((0x0112, 0xC6) in wait for wait in ack_waits)
    assert any((0x0112, 0xC7) in wait for wait in ack_waits)
    power_payloads = {payload[7]: payload for opcode, payload in sent if (opcode & 0xFF) == 0x12}
    assert power_payloads[ButtonName.POWER_ON][8] == 0x00
    assert power_payloads[ButtonName.POWER_OFF][8] == 0x00
    frame_7746 = next(payload for opcode, payload in sent if (opcode & 0xFF) == 0x46)
    expected_token = (sum(frame_7746[:-1]) - 2) & 0xFF
    assert frame_7746[-1] == expected_token


def test_create_wifi_device_can_assign_power_on_and_power_off_commands(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(proxy, "wait_for_roku_device_id", lambda timeout=5.0: 0x04)
    monkeypatch.setattr(
        proxy,
        "wait_for_roku_ack_any",
        lambda candidates, timeout=5.0: (candidates[0][0], b"\x00"),
    )

    sent: list[tuple[int, bytes]] = []
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: sent.append((opcode, payload)))

    result = proxy.create_wifi_device(
        commands=[f"Command {idx}" for idx in range(1, 11)],
        power_on_command_id=9,
        power_off_command_id=10,
    )

    assert result == {"device_id": 0x04, "status": "success"}
    power_payloads = [payload for opcode, payload in sent if (opcode & 0xFF) == 0x12]
    assert len(power_payloads) == 4

    create_on_payload, create_off_payload, on_payload, off_payload = power_payloads

    assert create_on_payload[:9] == bytes.fromhex("01 00 01 01 00 01 04 c6 00")
    assert create_off_payload[:9] == bytes.fromhex("01 00 01 01 00 01 04 c7 00")
    assert on_payload[:19] == bytes.fromhex("01 00 01 01 00 01 04 c6 01 04 09 00 00 00 00 4e 29 00 ff")
    assert off_payload[:19] == bytes.fromhex("01 00 01 01 00 01 04 c7 01 04 0a 00 00 00 00 4e 2a 00 ff")
    assert on_payload[19:49].rstrip(b"\x00") == b"POWER_ON"
    assert off_payload[19:49].rstrip(b"\x00") == b"POWER_OFF"

    family_41_payloads = [payload for opcode, payload in sent if (opcode & 0xFF) == 0x41]
    assert family_41_payloads == [bytes([0x04, 0x04]), bytes([0x04, 0x04]), bytes([0x04, 0x01])]

    payload_7b08 = [payload for opcode, payload in sent if (opcode & 0xFF) == 0x08]
    assert len(payload_7b08) == 2
    assert bytes.fromhex("fc 02 01 03 00 fc 00 fc 01") in payload_7b08[-1]


def test_create_wifi_device_can_mix_assigned_and_cleared_power_commands(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(proxy, "wait_for_roku_device_id", lambda timeout=5.0: 0x04)
    monkeypatch.setattr(
        proxy,
        "wait_for_roku_ack_any",
        lambda candidates, timeout=5.0: (candidates[0][0], b"\x00"),
    )

    sent: list[tuple[int, bytes]] = []
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: sent.append((opcode, payload)))

    result = proxy.create_wifi_device(
        commands=[f"Command {idx}" for idx in range(1, 10)],
        power_on_command_id=9,
        power_off_command_id=None,
    )

    assert result == {"device_id": 0x04, "status": "success"}
    power_payloads = [payload for opcode, payload in sent if (opcode & 0xFF) == 0x12]
    assert len(power_payloads) == 4

    _create_on_payload, _create_off_payload, on_payload, off_payload = power_payloads

    assert on_payload[:19] == bytes.fromhex("01 00 01 01 00 01 04 c6 01 04 09 00 00 00 00 4e 29 00 ff")
    assert off_payload[:9] == bytes.fromhex("01 00 01 01 00 01 04 c7 00")
    assert off_payload[9:39].rstrip(b"\x00") == b"POWER_OFF"


def test_create_wifi_device_skips_second_stage_when_power_is_unset(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(proxy, "wait_for_roku_device_id", lambda timeout=5.0: 0x08)
    monkeypatch.setattr(
        proxy,
        "wait_for_roku_ack_any",
        lambda candidates, timeout=5.0: (candidates[0][0], b"\x00"),
    )

    sent: list[tuple[int, bytes]] = []
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: sent.append((opcode, payload)))

    result = proxy.create_wifi_device(commands=["Launch One"])

    assert result == {"device_id": 0x08, "status": "success"}
    family_41_payloads = [payload for opcode, payload in sent if (opcode & 0xFF) == 0x41]
    assert family_41_payloads == [bytes([0x08, 0x04]), bytes([0x08, 0x04])]
    payload_7b08 = [payload for opcode, payload in sent if (opcode & 0xFF) == 0x08]
    assert len(payload_7b08) == 1


def test_create_wifi_device_uses_custom_name_brand_and_ip(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(proxy, "wait_for_roku_device_id", lambda timeout=5.0: 0x07)

    def _wait_for_roku_ack_any(
        candidates: list[tuple[int, int | None]],
        *,
        timeout: float = 5.0,
    ) -> tuple[int, bytes] | None:
        first_opcode = candidates[0][0]
        return first_opcode, b"\x00"

    monkeypatch.setattr(proxy, "wait_for_roku_ack_any", _wait_for_roku_ack_any)

    sent: list[tuple[int, bytes]] = []
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: sent.append((opcode, payload)))

    monkeypatch.setattr(proxy, "get_routed_local_ip", lambda: "10.0.0.7")
    result = proxy.create_wifi_device(device_name="Living Room Roku", commands=["My Cmd"])

    assert result == {"device_id": 0x07, "status": "success"}
    assert proxy.state.devices[0x07] == {"brand": "m3tac0de", "name": "Living Room Roku"}
    create_payload = sent[0][1]
    finalize_payload = next(payload for opcode, payload in sent if (opcode & 0xFF) == 0x08)

    assert create_payload[32:62].rstrip(b"\x00") == b"Living Room Roku"
    assert create_payload[62:92].rstrip(b"\x00") == b"m3tac0de"
    assert create_payload[94:98] == bytes([10, 0, 0, 7])

    assert finalize_payload[32:62].rstrip(b"\x00") == b"Living Room Roku"
    assert finalize_payload[62:92].rstrip(b"\x00") == b"m3tac0de"
    assert finalize_payload[94:98] == bytes([10, 0, 0, 7])

    expected_tail_prefix = bytes.fromhex("fc 02")
    expected_tail_middle = bytes.fromhex("02 00 fc 00 fc")
    assert create_payload[101:103] == expected_tail_prefix
    assert create_payload[104:109] == expected_tail_middle
    assert create_payload[109] == 0x01
    assert create_payload[103] == 0x00

    assert finalize_payload[101:103] == expected_tail_prefix
    assert finalize_payload[104:109] == expected_tail_middle
    assert finalize_payload[109] == 0x01
    assert finalize_payload[103] == 0x01




def test_create_wifi_device_x1s_uses_utf16_name_fields(monkeypatch) -> None:
    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=HUB_VERSION_X1S,
    )

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(proxy, "wait_for_roku_device_id", lambda timeout=5.0: 0x09)

    def _wait_for_roku_ack_any(
        candidates: list[tuple[int, int | None]],
        *,
        timeout: float = 5.0,
    ) -> tuple[int, bytes] | None:
        first_opcode = candidates[0][0]
        return first_opcode, b"\x00"

    monkeypatch.setattr(proxy, "wait_for_roku_ack_any", _wait_for_roku_ack_any)

    sent: list[tuple[int, bytes]] = []
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: sent.append((opcode, payload)))

    monkeypatch.setattr(proxy, "get_routed_local_ip", lambda: "10.0.0.7")
    result = proxy.create_wifi_device(device_name="Living Room Roku", commands=["My Cmd"], request_port=8765)

    assert result == {"device_id": 0x09, "status": "success"}
    assert proxy.state.devices[0x09] == {"brand": "m3tac0de", "name": "Living Room Roku"}
    create_payload = sent[0][1]
    define_payload = next(payload for opcode, payload in sent if (opcode & 0xFF) == 0x0E)
    finalize_payload = next(payload for opcode, payload in sent if (opcode & 0xFF) == 0x08)

    encoded_name = "Living Room Roku".encode("utf-16le")
    assert encoded_name in create_payload
    assert create_payload[7] == 0xFF
    assert create_payload[10] == 0x1C
    assert b"\xfc\x00\x00\xfc\x02\x00\x00\x00\xfc\x00\xfc\x00" in create_payload

    assert define_payload[0] == 0x01
    assert define_payload[1:6] == bytes([0x00, 0x01, 0x03, 0x00, 0x01])
    assert define_payload[16:75].startswith("My Cmd".encode("utf-16le"))
    assert define_payload[75:79] == bytes([10, 0, 0, 7])
    assert define_payload[79:81] == (8765).to_bytes(2, "big")
    request_len = define_payload[82]
    request_start = 83
    request_end = request_start + request_len
    assert request_end == len(define_payload) - 1
    request_blob = define_payload[request_start:request_end]
    assert request_blob.startswith(b"POST /launch/")
    assert b"Host:10.0.0.7:8765\r\n" in request_blob

    families = {opcode & 0xFF for opcode, _ in sent}
    assert 0x12 not in families
    assert 0x3E not in families

    assert finalize_payload[7] == 0x09
    assert finalize_payload[10] == 0x1C
    assert encoded_name in finalize_payload
    assert b"\xfc\x00\x00\xfc\x02\x00\x00\x00\xfc\x00\xfc\x01" in finalize_payload
    frame_7746 = next(payload for opcode, payload in sent if (opcode & 0xFF) == 0x46)
    expected_token = (sum(frame_7746[:-1]) - 2) & 0xFF
    assert frame_7746[-1] == expected_token


def test_create_wifi_device_x1s_accepts_command_definitions_with_press_type(monkeypatch) -> None:
    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=HUB_VERSION_X1S,
        proxy_id="proxy-123",
        mdns_txt={"MAC": "AA:BB:CC:DD:EE:FF"},
    )

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(proxy, "wait_for_roku_device_id", lambda timeout=5.0: 0x09)

    def _wait_for_roku_ack_any(
        candidates: list[tuple[int, int | None]],
        *,
        timeout: float = 5.0,
    ) -> tuple[int, bytes] | None:
        first_opcode = candidates[0][0]
        return first_opcode, b"\x00"

    monkeypatch.setattr(proxy, "wait_for_roku_ack_any", _wait_for_roku_ack_any)
    monkeypatch.setattr(proxy, "get_routed_local_ip", lambda: "10.0.0.7")

    sent: list[tuple[int, bytes]] = []
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: sent.append((opcode, payload)))

    result = proxy.create_wifi_device(
        device_name="Living Room Roku",
        commands=[
            {"display_name": "My Cmd", "trigger_name": "My Cmd", "press_type": "short"},
            {"display_name": "My Cmd Long Press", "trigger_name": "My Cmd", "press_type": "long"},
        ],
        request_port=8765,
    )

    assert result == {"device_id": 0x09, "status": "success"}
    define_payloads = [payload for opcode, payload in sent if (opcode & 0xFF) == 0x0E]
    assert len(define_payloads) == 2

    short_request_len = define_payloads[0][82]
    short_request = define_payloads[0][83 : 83 + short_request_len]
    long_request_len = define_payloads[1][82]
    long_request = define_payloads[1][83 : 83 + long_request_len]

    assert define_payloads[0][16:75].startswith("My Cmd".encode("utf-16le"))
    assert define_payloads[1][16:75].startswith("My Cmd Long Press".encode("utf-16le"))
    assert short_request.startswith(b"POST /launch/")
    assert long_request.startswith(b"POST /launch/")
    assert b"/0/short" in short_request
    assert b"/1/long" in long_request


def test_create_wifi_device_x1s_can_assign_power_on_and_power_off_commands(monkeypatch) -> None:
    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=HUB_VERSION_X1S,
    )

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(proxy, "wait_for_roku_device_id", lambda timeout=5.0: 0x09)
    monkeypatch.setattr(
        proxy,
        "wait_for_roku_ack_any",
        lambda candidates, timeout=5.0: (candidates[0][0], b"\x00"),
    )
    monkeypatch.setattr(proxy, "get_routed_local_ip", lambda: "10.0.0.7")

    sent: list[tuple[int, bytes]] = []
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: sent.append((opcode, payload)))

    result = proxy.create_wifi_device(
        device_name="Living Room Roku",
        commands=[f"Command {idx}" for idx in range(1, 11)],
        request_port=8765,
        power_on_command_id=6,
        power_off_command_id=4,
    )

    assert result == {"device_id": 0x09, "status": "success"}
    family_41_payloads = [payload for opcode, payload in sent if (opcode & 0xFF) == 0x41]
    assert family_41_payloads == [bytes([0x09, 0x04]), bytes([0x09, 0x01])]

    payload_08 = [payload for opcode, payload in sent if (opcode & 0xFF) == 0x08]
    assert len(payload_08) == 2

    power_payloads = [payload for opcode, payload in sent if (opcode & 0xFF) == 0x12]
    assert len(power_payloads) == 2
    on_payload, off_payload = power_payloads

    assert on_payload[:19] == bytes.fromhex("01 00 01 01 00 01 09 c6 01 09 06 00 00 00 00 00 00 00 ff")
    assert off_payload[:19] == bytes.fromhex("01 00 01 01 00 01 09 c7 01 09 04 00 00 00 00 00 00 00 ff")
    assert on_payload[19:79].startswith("POWER_ON".encode("utf-16le"))
    assert off_payload[19:79].startswith("POWER_OFF".encode("utf-16le"))


def test_create_wifi_device_x1s_without_power_commands_skips_power_edit_flow(monkeypatch) -> None:
    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=HUB_VERSION_X1S,
    )

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(proxy, "wait_for_roku_device_id", lambda timeout=5.0: 0x09)
    monkeypatch.setattr(
        proxy,
        "wait_for_roku_ack_any",
        lambda candidates, timeout=5.0: (candidates[0][0], b"\x00"),
    )
    monkeypatch.setattr(proxy, "get_routed_local_ip", lambda: "10.0.0.7")

    sent: list[tuple[int, bytes]] = []
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: sent.append((opcode, payload)))

    result = proxy.create_wifi_device(device_name="Living Room Roku", commands=["My Cmd"], request_port=8765)

    assert result == {"device_id": 0x09, "status": "success"}
    families = {opcode & 0xFF for opcode, _ in sent}
    assert 0x12 not in families
    assert [payload for opcode, payload in sent if (opcode & 0xFF) == 0x41] == [bytes([0x09, 0x04])]


def test_create_wifi_device_x1_can_assign_input_commands(monkeypatch) -> None:
    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=HUB_VERSION_X1,
    )

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(proxy, "wait_for_roku_device_id", lambda timeout=5.0: 0x04)
    monkeypatch.setattr(
        proxy,
        "wait_for_roku_ack_any",
        lambda candidates, timeout=5.0: (candidates[0][0], b"\x00"),
    )
    monkeypatch.setattr(proxy, "get_routed_local_ip", lambda: "192.168.2.77")
    monkeypatch.setattr(proxy, "wait_for_activity_inputs_burst", lambda timeout=5.0: True)
    monkeypatch.setattr(proxy, "_wait_for_wifi_input_refresh", lambda *, device_id, command_id, timeout=5.0: True)

    sent: list[tuple[int, bytes]] = []
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: sent.append((opcode, payload)))

    result = proxy.create_wifi_device(
        commands=[f"Command {idx}" for idx in range(1, 11)],
        input_command_ids=[2, 4, 6],
    )

    assert result == {"device_id": 0x04, "status": "success"}

    assert any(opcode == 0x0148 and payload == bytes([0x04]) for opcode, payload in sent)

    input_payload = next(payload for opcode, payload in sent if opcode == 0xC846)
    assert len(input_payload) == 200
    assert input_payload[:11] == bytes.fromhex("01 00 01 01 00 01 04 01 03 00 00")
    assert input_payload[11:38] == bytes.fromhex("02 00 00 00 00 4e 22") + b"Command 2".ljust(20, b"\x00")
    assert input_payload[38:65] == bytes.fromhex("04 00 00 00 00 4e 24") + b"Command 4".ljust(20, b"\x00")
    assert input_payload[65:92] == bytes.fromhex("06 00 00 00 00 4e 26") + b"Command 6".ljust(20, b"\x00")
    assert input_payload[92:199] == b"\x00" * 107
    assert input_payload[-1] == (sum(input_payload[:-1]) - 0x02) & 0xFF

    refresh_requests = [(opcode, payload) for opcode, payload in sent if opcode == 0x020C]
    assert refresh_requests == [
        (0x020C, bytes([0x04, 0x02])),
        (0x020C, bytes([0x04, 0x04])),
        (0x020C, bytes([0x04, 0x06])),
    ]

    payload_08 = [payload for opcode, payload in sent if (opcode & 0xFF) == 0x08]
    assert len(payload_08) == 2


def test_create_wifi_device_x1_six_inputs_uses_fa46_plus_2246_commit(monkeypatch) -> None:
    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=HUB_VERSION_X1,
    )

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(proxy, "wait_for_roku_device_id", lambda timeout=5.0: 0x0D)
    monkeypatch.setattr(
        proxy,
        "wait_for_roku_ack_any",
        lambda candidates, timeout=5.0: (candidates[0][0], b"\x00"),
    )
    monkeypatch.setattr(proxy, "get_routed_local_ip", lambda: "192.168.2.77")
    monkeypatch.setattr(proxy, "wait_for_activity_inputs_burst", lambda timeout=5.0: True)
    monkeypatch.setattr(proxy, "_wait_for_wifi_input_refresh", lambda *, device_id, command_id, timeout=5.0: True)

    sent: list[tuple[int, bytes]] = []
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: sent.append((opcode, payload)))

    result = proxy.create_wifi_device(
        commands=[f"TEST {idx}" for idx in range(1, 7)],
        input_command_ids=[1, 2, 3, 4, 5, 6],
    )

    assert result == {"device_id": 0x0D, "status": "success"}

    family_46_frames = [(opcode, payload) for opcode, payload in sent if (opcode & 0xFF) == 0x46]

    # FA46: 250B fixed, sub=02, N_total=6 in header, all 6 entries
    fa46_frames = [(opcode, payload) for opcode, payload in family_46_frames if opcode == 0xFA46]
    assert len(fa46_frames) == 1
    _, fa46_payload = fa46_frames[0]
    assert len(fa46_payload) == 250
    assert fa46_payload[:11] == bytes.fromhex("01 00 01 01 00 02 0d 01 06 00 00")  # sub=02, N=6
    # Entry 1: cmd_id=1, command_code=0x4E21, label "TEST 1" (20B padded)
    assert fa46_payload[11:38] == bytes.fromhex("01 00 00 00 00 4e 21") + b"TEST 1".ljust(20, b"\x00")
    # Entry 6: cmd_id=6, command_code=0x4E26, label "TEST 6"
    assert fa46_payload[11 + 5 * 27 : 11 + 6 * 27] == bytes.fromhex("06 00 00 00 00 4e 26") + b"TEST 6".ljust(20, b"\x00")

    # 2246 commit: 34B (= 6*27 - 128), last byte = (sum(fa46_payload) - 0x02) & 0xFF
    commit_frames = [(opcode, payload) for opcode, payload in family_46_frames if opcode == 0x2246]
    assert len(commit_frames) == 1
    _, commit_payload = commit_frames[0]
    assert len(commit_payload) == 34
    assert commit_payload[:4] == bytes.fromhex("01 00 02 00")
    assert commit_payload[4:-1] == bytes(29)
    expected_checksum = (sum(fa46_payload) - 0x02) & 0xFF
    assert commit_payload[-1] == expected_checksum

    # No old-style single-frame with inline checksum (e.g., 0xC846) for N=6
    old_style_opcodes = {0xFA46, 0x2246, 0x7746}  # FA46, commit, sync are all expected
    assert not any(opcode not in old_style_opcodes and (opcode & 0xFF) == 0x46 for opcode, _ in family_46_frames)


def test_create_wifi_device_x1s_can_assign_input_commands(monkeypatch) -> None:
    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=HUB_VERSION_X1S,
    )

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(proxy, "wait_for_roku_device_id", lambda timeout=5.0: 0x09)
    monkeypatch.setattr(
        proxy,
        "wait_for_roku_ack_any",
        lambda candidates, timeout=5.0: (candidates[0][0], b"\x00"),
    )
    monkeypatch.setattr(proxy, "get_routed_local_ip", lambda: "10.0.0.7")

    sent: list[tuple[int, bytes]] = []
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: sent.append((opcode, payload)))

    monkeypatch.setattr(proxy, "wait_for_activity_inputs_burst", lambda timeout=5.0: True)
    monkeypatch.setattr(proxy, "_wait_for_wifi_input_refresh", lambda *, device_id, command_id, timeout=5.0: True)

    result = proxy.create_wifi_device(
        device_name="Living Room Roku",
        commands=[f"TEST {idx}" for idx in range(1, 7)],
        request_port=8060,
        input_command_ids=[1, 3, 5],
    )

    assert result == {"device_id": 0x09, "status": "success"}

    req_activity_frames = [(opcode, payload) for opcode, payload in sent if opcode == 0x0148]
    assert req_activity_frames == [(0x0148, bytes([0x09]))]

    # X1S uses FA46 (sub=02, fixed 250B) + 1046 commit for N≥3 inputs.
    family_46_frames = [(opcode, payload) for opcode, payload in sent if (opcode & 0xFF) == 0x46]
    fa46_frames = [(opcode, payload) for opcode, payload in family_46_frames if opcode == 0xFA46]
    assert len(fa46_frames) == 1, f"expected exactly 1 FA46 frame, got {len(fa46_frames)}"
    _, fa46_payload = fa46_frames[0]
    assert len(fa46_payload) == 250
    # Header: sub=02 (byte[5]), device_id=0x09, num_inputs=3
    assert fa46_payload[:10] == bytes.fromhex("01 00 01 01 00 02 09 01 03 00")
    # First input entry (48B): fixed fields + label
    assert fa46_payload[10:20] == bytes.fromhex("00 01 00 00 00 00 00 00 01 00")
    assert "TEST 1".encode("utf-16le") in fa46_payload
    assert "TEST 3".encode("utf-16le") in fa46_payload
    assert "TEST 5".encode("utf-16le") in fa46_payload
    # No inner checksum byte on FA46

    # 1046 commit frame: 16B, last byte = (sum(fa46_payload) - 0x02) & 0xFF
    commit_frames = [(opcode, payload) for opcode, payload in sent if opcode == 0x1046]
    assert len(commit_frames) == 1, f"expected exactly 1 1046 commit frame, got {len(commit_frames)}"
    _, commit_payload = commit_frames[0]
    assert len(commit_payload) == 16
    assert commit_payload[:15] == bytes.fromhex("01 00 02 00 00 00 00 00 00 00 00 00 00 00 00")
    expected_checksum = (sum(fa46_payload) - 0x02) & 0xFF
    assert commit_payload[15] == expected_checksum

    refresh_requests = [(opcode, payload) for opcode, payload in sent if opcode == 0x020C]
    assert refresh_requests == [
        (0x020C, bytes([0x09, 0x01])),
        (0x020C, bytes([0x09, 0x03])),
        (0x020C, bytes([0x09, 0x05])),
    ]

    finalize_payload = next(payload for opcode, payload in sent if opcode == 0xD508)
    assert len(finalize_payload) == 213
    assert finalize_payload[7] == 0x09
    assert finalize_payload[9] == 0x09
    assert finalize_payload[10:12] == bytes.fromhex("1c 10")


def test_create_wifi_device_x1s_five_inputs_uses_fa46_plus_7046_commit(monkeypatch) -> None:
    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=HUB_VERSION_X1S,
    )

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(proxy, "wait_for_roku_device_id", lambda timeout=5.0: 0x10)
    monkeypatch.setattr(
        proxy,
        "wait_for_roku_ack_any",
        lambda candidates, timeout=5.0: (candidates[0][0], b"\x00"),
    )
    monkeypatch.setattr(proxy, "get_routed_local_ip", lambda: "10.0.0.7")

    sent: list[tuple[int, bytes]] = []
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: sent.append((opcode, payload)))

    monkeypatch.setattr(proxy, "wait_for_activity_inputs_burst", lambda timeout=5.0: True)
    monkeypatch.setattr(proxy, "_wait_for_wifi_input_refresh", lambda *, device_id, command_id, timeout=5.0: True)

    result = proxy.create_wifi_device(
        device_name="Input test 6cmd 5in",
        commands=[f"TEST {idx}" for idx in range(1, 7)],
        request_port=8060,
        input_command_ids=[1, 2, 3, 4, 5],
    )

    assert result == {"device_id": 0x10, "status": "success"}

    family_46_frames = [(opcode, payload) for opcode, payload in sent if (opcode & 0xFF) == 0x46]
    fa46_frames = [(opcode, payload) for opcode, payload in family_46_frames if opcode == 0xFA46]
    assert len(fa46_frames) == 1
    _, fa46_payload = fa46_frames[0]
    assert len(fa46_payload) == 250
    assert fa46_payload[:10] == bytes.fromhex("01 00 01 01 00 02 10 01 05 00")  # N_total=5

    # N=5 commit: opcode 0x7046 (112B payload = 5*48-128)
    commit_frames = [(opcode, payload) for opcode, payload in sent if opcode == 0x7046]
    assert len(commit_frames) == 1
    _, commit_payload = commit_frames[0]
    assert len(commit_payload) == 112
    assert commit_payload[:4] == bytes.fromhex("01 00 02 00")
    assert commit_payload[4:-1] == bytes(107)  # 107 zero bytes
    expected_checksum = (sum(fa46_payload) - 0x02) & 0xFF
    assert commit_payload[-1] == expected_checksum

    assert not any(opcode == 0x1046 for opcode, _ in sent)
    assert not any(opcode == 0xA046 for opcode, _ in sent)


def test_create_wifi_device_x1s_six_inputs_uses_fa46_plus_a046(monkeypatch) -> None:
    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=HUB_VERSION_X1S,
    )

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(proxy, "wait_for_roku_device_id", lambda timeout=5.0: 0x09)
    monkeypatch.setattr(
        proxy,
        "wait_for_roku_ack_any",
        lambda candidates, timeout=5.0: (candidates[0][0], b"\x00"),
    )
    monkeypatch.setattr(proxy, "get_routed_local_ip", lambda: "10.0.0.7")

    sent: list[tuple[int, bytes]] = []
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: sent.append((opcode, payload)))

    monkeypatch.setattr(proxy, "wait_for_activity_inputs_burst", lambda timeout=5.0: True)
    monkeypatch.setattr(proxy, "_wait_for_wifi_input_refresh", lambda *, device_id, command_id, timeout=5.0: True)

    result = proxy.create_wifi_device(
        device_name="Input test 9x",
        commands=[f"TEST {idx}" for idx in range(1, 7)],
        request_port=8060,
        input_command_ids=[1, 2, 3, 4, 5, 6],
    )

    assert result == {"device_id": 0x09, "status": "success"}

    # FA46 frame: 250B, sub=02, N_total=6 in header, only entries 1-5
    family_46_frames = [(opcode, payload) for opcode, payload in sent if (opcode & 0xFF) == 0x46]
    fa46_frames = [(opcode, payload) for opcode, payload in family_46_frames if opcode == 0xFA46]
    assert len(fa46_frames) == 1
    _, fa46_payload = fa46_frames[0]
    assert len(fa46_payload) == 250
    assert fa46_payload[:10] == bytes.fromhex("01 00 01 01 00 02 09 01 06 00")  # N_total=6
    assert "TEST 1".encode("utf-16le") in fa46_payload
    assert "TEST 5".encode("utf-16le") in fa46_payload
    assert "TEST 6".encode("utf-16le") not in fa46_payload  # overflow, not in FA46

    # A046 frame: 160B continuation, overflow entry 6, combined checksum
    a046_frames = [(opcode, payload) for opcode, payload in family_46_frames if opcode == 0xA046]
    assert len(a046_frames) == 1
    _, a046_payload = a046_frames[0]
    assert len(a046_payload) == 160
    assert a046_payload[:10] == bytes.fromhex("01 00 02 00 06 00 00 00 00 00")  # N_total=6
    assert a046_payload[10:13] == bytes.fromhex("00 06 00")  # overflow entry cmd_id=6
    assert "TEST 6".encode("utf-16le") in a046_payload
    expected_checksum = (sum(fa46_payload) + sum(a046_payload[:-1]) - 0x05) & 0xFF
    assert a046_payload[-1] == expected_checksum

    # No variable-size commit frame for N>5 (uses A046 instead)
    assert not any(opcode in {0x1046, 0x4046, 0x7046} for opcode, _ in sent)

    refresh_requests = [(opcode, payload) for opcode, payload in sent if opcode == 0x020C]
    assert refresh_requests == [(0x020C, bytes([0x09, i])) for i in range(1, 7)]


def test_x1s_input_refresh_frame_updates_command_cache() -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)
    handler = DeviceButtonFamilyHandler()
    payload = bytes.fromhex(
        "01 00 01 01 00 01 0A 03 1C 00 00 00 00 00 00 00 "
        "54 00 45 00 53 00 54 00 20 00 31 00 "
        + "00 " * 48 +
        "C0 A8 02 4D 1F 7C 00 79 "
        + "50 4F 53 54 20 2F 6C 61 75 6E 63 68 2F 65 32 36 61 34 34 38 36 31 62 34 35 2F 31 30 2F 32 2F 73 68 6F 72 74 20 48 54 54 50 2F 31 2E 31 0D 0A 48 6F 73 74 3A 31 39 32 2E 31 36 38 2E 32 2E 37 37 3A 38 30 36 30 0D 0A 43 6F 6E 74 65 6E 74 2D 54 79 70 65 3A 61 70 70 6C 69 63 61 74 69 6F 6E 2F 78 2D 77 77 77 2D 66 6F 72 6D 2D 75 72 6C 65 6E 63 6F 64 65 64 0D 0A 0D 0A B9"
    )
    raw = bytes.fromhex("a5 5a cd 0d") + payload + bytes.fromhex("4e")

    handler.handle(
        FrameContext(
            proxy=proxy,
            opcode=0xCD0D,
            direction="H→A",
            payload=payload,
            raw=raw,
            name="OP_CD0D",
        )
    )

    assert proxy.state.commands[0x0A][0x03] == "TEST 1"


def test_create_wifi_device_uses_custom_app_commands(monkeypatch) -> None:
    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        proxy_id="proxy-123",
        mdns_txt={"MAC": "AA:BB:CC:DD:EE:FF"},
    )

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(proxy, "wait_for_roku_device_id", lambda timeout=5.0: 0x07)

    def _wait_for_roku_ack_any(
        candidates: list[tuple[int, int | None]],
        *,
        timeout: float = 5.0,
    ) -> tuple[int, bytes] | None:
        first_opcode = candidates[0][0]
        return first_opcode, b"\x00"

    monkeypatch.setattr(proxy, "wait_for_roku_ack_any", _wait_for_roku_ack_any)

    sent: list[tuple[int, bytes]] = []
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: sent.append((opcode, payload)))

    result = proxy.create_wifi_device(commands=["Lights On", "Lights Off"])

    assert result == {"device_id": 0x07, "status": "success"}
    assert proxy.state.devices[0x07] == {"brand": "m3tac0de", "name": "Home Assistant"}
    define_payloads = [payload for opcode, payload in sent if (opcode & 0xFF) == 0x0E]

    assert len(define_payloads) == 2

    custom_payloads = {payload[0]: payload for payload in define_payloads if payload[0] in {0x18, 0x19, 0x1A}}
    assert set(custom_payloads) == {0x18, 0x19}

    action_1 = custom_payloads[0x18][46 : 46 + custom_payloads[0x18][45]].decode("ascii")
    action_2 = custom_payloads[0x19][46 : 46 + custom_payloads[0x19][45]].decode("ascii")

    assert custom_payloads[0x18][15:45].rstrip(b"\x00") == b"Lights On"
    assert custom_payloads[0x19][15:45].rstrip(b"\x00") == b"Lights Off"
    assert action_1 == "launch/aabbccddeeff/7/0/short"
    assert action_2 == "launch/aabbccddeeff/7/1/short"


def test_stable_hub_action_id_falls_back_to_proxy_id() -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False, proxy_id="proxy-123")

    assert proxy._stable_hub_action_id() == "proxy-123"


def test_create_wifi_device_without_custom_commands_defines_no_slots(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(proxy, "wait_for_roku_device_id", lambda timeout=5.0: 0x07)

    def _wait_for_roku_ack_any(
        candidates: list[tuple[int, int | None]],
        *,
        timeout: float = 5.0,
    ) -> tuple[int, bytes] | None:
        first_opcode = candidates[0][0]
        return first_opcode, b"\x00"

    monkeypatch.setattr(proxy, "wait_for_roku_ack_any", _wait_for_roku_ack_any)

    sent: list[tuple[int, bytes]] = []
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: sent.append((opcode, payload)))

    result = proxy.create_wifi_device()

    assert result == {"device_id": 0x07, "status": "success"}
    assert proxy.state.devices[0x07] == {"brand": "m3tac0de", "name": "Home Assistant"}
    define_slots = [payload[0] for opcode, payload in sent if (opcode & 0xFF) == 0x0E]
    assert define_slots == []

def test_wait_for_roku_ack_matches_opcode_and_button() -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)
    proxy.notify_roku_ack(0x0103, b"\x00")
    proxy.notify_roku_ack(0x013E, b"\xAB")

    assert proxy.wait_for_roku_ack(0x013E, first_byte=0xAB, timeout=0.1) is True
    assert proxy.wait_for_roku_ack(0x0103, timeout=0.1) is True


def test_wait_for_roku_ack_timeout() -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)
    assert proxy.wait_for_roku_ack(0x0112, first_byte=0xC6, timeout=0.01) is False


def test_send_roku_step_uses_fallback_ack() -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    sent: list[tuple[int, bytes]] = []
    proxy._send_cmd_frame = lambda opcode, payload: sent.append((opcode, payload))  # type: ignore[method-assign]

    def _wait_any(
        candidates: list[tuple[int, int | None]],
        *,
        timeout: float = 5.0,
    ) -> tuple[int, bytes] | None:
        assert candidates == [(0x013E, 0xAB), (0x0103, None)]
        return 0x0103, b"\x0c"

    proxy.wait_for_roku_ack_any = _wait_any  # type: ignore[method-assign]

    ok = proxy._send_roku_step(
        step_name="map-button[0xAB]",
        family=0x3E,
        payload=b"\x00" * 25,
        ack_opcode=0x013E,
        ack_first_byte=0xAB,
        ack_fallback_opcodes=(0x0103,),
    )

    assert ok is True
    assert sent


def test_ensure_commands_for_activity_without_favorites_does_nothing(monkeypatch) -> None:
    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=HUB_VERSION_X1S,
    )

    cache = ActivityCache()
    act = 0x10
    cache.activity_command_refs[act] = {(0x01, 0xAAAA), (0x02, 0xBBBB)}
    proxy.state = cache

    def fake_get_single(ent_id: int, command_id: int, fetch_if_missing: bool = True):
        raise AssertionError("should not fetch commands when no favorites")

    monkeypatch.setattr(proxy, "get_single_command_for_entity", fake_get_single)

    commands_by_device, ready = proxy.ensure_commands_for_activity(act)

    assert ready is True
    assert commands_by_device == {}


def test_ensure_commands_for_activity_no_mapping_without_favorites_on_x1(
    monkeypatch,
) -> None:
    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=HUB_VERSION_X1,
    )

    cache = ActivityCache()
    act = 0x10
    proxy.state = cache

    monkeypatch.setattr(proxy, "request_activity_mapping", lambda _act: False)

    commands_by_device, ready = proxy.ensure_commands_for_activity(act)

    assert ready is True
    assert commands_by_device == {}


def test_get_single_command_for_entity_uses_cache(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)
    proxy.state.commands[0x02] = {0x1234: "Cmd"}

    enqueue_called = False

    def fake_enqueue(*args, **kwargs):
        nonlocal enqueue_called
        enqueue_called = True

    monkeypatch.setattr(proxy, "enqueue_cmd", fake_enqueue)

    commands, ready = proxy.get_single_command_for_entity(0x02, 0x1234)

    assert ready is True
    assert commands == {0x1234: "Cmd"}
    assert enqueue_called is False


def test_get_single_command_for_entity_enqueues_targeted_request(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    enqueued: list[tuple[int, bytes, bool, str | None]] = []

    def fake_enqueue(opcode, payload, expects_burst=False, burst_kind=None):
        enqueued.append((opcode, payload, expects_burst, burst_kind))

    monkeypatch.setattr(proxy, "enqueue_cmd", fake_enqueue)
    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)

    command_id = 0x0D
    commands, ready = proxy.get_single_command_for_entity(0x12, command_id)

    assert commands == {}
    assert ready is False
    assert enqueued == [
        (
            OP_REQ_COMMANDS,
            b"\x12\r",
            True,
            "commands:18:13",
        )
    ]


def test_get_single_command_for_entity_falls_back_for_high_byte(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    enqueued: list[tuple[int, bytes, bool, str | None]] = []

    def fake_enqueue(opcode, payload, expects_burst=False, burst_kind=None):
        enqueued.append((opcode, payload, expects_burst, burst_kind))

    monkeypatch.setattr(proxy, "enqueue_cmd", fake_enqueue)
    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)

    command_id = 0x0103
    commands, ready = proxy.get_single_command_for_entity(0x12, command_id)

    assert commands == {}
    assert ready is False
    assert enqueued == [
        (OP_REQ_COMMANDS, b"\x12\xff", True, "commands:18"),
    ]


def test_get_single_command_allows_multiple_pending_commands(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    enqueued: list[tuple[int, bytes, bool, str | None]] = []

    def fake_enqueue(opcode, payload, expects_burst=False, burst_kind=None):
        enqueued.append((opcode, payload, expects_burst, burst_kind))

    monkeypatch.setattr(proxy, "enqueue_cmd", fake_enqueue)
    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)

    proxy.get_single_command_for_entity(0x05, 0x01)
    proxy.get_single_command_for_entity(0x05, 0x02)

    assert enqueued == [
        (OP_REQ_COMMANDS, b"\x05\x01", True, "commands:5:1"),
        (OP_REQ_COMMANDS, b"\x05\x02", True, "commands:5:2"),
    ]


def test_x1_input_refresh_frame_updates_command_cache() -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)
    handler = DeviceButtonFamilyHandler()
    payload = bytes.fromhex(
        "01 00 01 01 00 01 08 02 0a 00 00 00 00 4e 22 "
        "54 45 53 54 20 32 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 "
        "1d 6c 61 75 6e 63 68 2f 63 62 33 38 33 35 33 39 36 38 34 62 2f 38 2f 31 2f 73 68 6f 72 74 2b"
    )
    raw = bytes.fromhex("a5 5a 4c 0d") + payload + bytes.fromhex("92")

    handler.handle(
        FrameContext(
            proxy=proxy,
            opcode=0x4C0D,
            direction="H→A",
            payload=payload,
            raw=raw,
            name="OP_4C0D",
        )
    )

    assert proxy.state.commands[0x08][0x02] == "TEST 2"


def test_build_frame_for_single_command_payloads() -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    single_01 = proxy._build_frame(OP_REQ_COMMANDS, b"\x01\x02")
    single_03 = proxy._build_frame(OP_REQ_COMMANDS, b"\x03\x03")
    single_full = proxy._build_frame(OP_REQ_COMMANDS, b"\x12\xff")

    assert single_01 == bytes.fromhex("a55a025c010260")
    assert single_03 == bytes.fromhex("a55a025c030363")
    assert single_full == bytes.fromhex("a55a025c12ff6e")


def test_clear_entity_cache_resets_all(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    ent_id = 0x42
    ent_lo = ent_id & 0xFF

    proxy.state.commands[ent_lo] = {0x01: "One"}
    proxy.state.buttons[ent_lo] = {ButtonName.VOL_UP}
    proxy.state.activity_command_refs[ent_lo] = {(0x10, 0x99)}
    proxy.state.activity_favorite_slots[ent_lo] = [
        {"button_id": 0xFE, "device_id": 0x10, "command_id": 0x99}
    ]
    proxy._pending_command_requests[ent_lo] = {0xFF}
    proxy._commands_complete.add(ent_lo)
    proxy._pending_button_requests.add(ent_lo)

    proxy.clear_entity_cache(ent_id, True, True)

    assert ent_lo not in proxy.state.commands
    assert ent_lo not in proxy.state.buttons
    assert ent_lo not in proxy.state.activity_command_refs
    assert ent_lo not in proxy.state.activity_favorite_slots
    assert ent_lo not in proxy._pending_command_requests
    assert ent_lo not in proxy._commands_complete
    assert ent_lo not in proxy._pending_button_requests


def test_partial_commands_still_trigger_full_fetch(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    ent_id = 0x07
    ent_lo = ent_id & 0xFF
    proxy.state.commands[ent_lo] = {0x01: "Exit"}

    enqueued: list[tuple] = []

    def fake_enqueue(opcode, payload, expects_burst=False, burst_kind=None):
        enqueued.append((opcode, payload, expects_burst, burst_kind))

    monkeypatch.setattr(proxy, "enqueue_cmd", fake_enqueue)
    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)

    cmds, ready = proxy.get_commands_for_entity(ent_id)

    assert cmds == {0x01: "Exit"}
    assert not ready
    assert enqueued == [
        (OP_REQ_COMMANDS, b"\x07\xff", True, "commands:7"),
    ]

    # When the burst for the full list ends, the cache becomes authoritative
    proxy._on_commands_burst_end("commands:7")

    enqueued.clear()
    cmds, ready = proxy.get_commands_for_entity(ent_id)

    assert cmds == {0x01: "Exit"}
    assert ready
    assert enqueued == []


def test_activity_map_handler_detects_last_page_marker() -> None:
    handler = ActivityMapHandler()

    assert handler._is_last_page(bytes.fromhex("01 00 01 05")) is False
    assert handler._is_last_page(bytes.fromhex("05 00 01 05")) is True
    assert handler._is_last_page(bytes.fromhex("06 00 01 05")) is True


def test_single_command_burst_end_clears_pending_without_completion() -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    ent_id = 0x09
    ent_lo = ent_id & 0xFF
    proxy._pending_command_requests[ent_lo] = {0x03}

    proxy._on_commands_burst_end("commands:9")

    assert ent_lo not in proxy._pending_command_requests
    assert ent_lo not in proxy._commands_complete


def test_targeted_command_burst_end_only_drops_matching_pending() -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    ent_id = 0x0A
    ent_lo = ent_id & 0xFF
    proxy._pending_command_requests[ent_lo] = {0x01, 0x02}

    proxy._on_commands_burst_end("commands:10:1")

    assert proxy._pending_command_requests[ent_lo] == {0x02}
    assert ent_lo not in proxy._commands_complete




def test_build_macro_save_payload_from_observed_power_on_payload() -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    source_payload = bytes.fromhex(
        "01 00 01 01 00 01 66 c6 08 "
        "01 c6 00 00 00 00 00 00 01 ff ff ff ff ff ff ff ff ff ff 01 "
        "02 c6 00 00 00 00 00 00 01 ff ff ff ff ff ff ff ff ff ff 01 "
        "01 c5 00 00 00 00 00 00 1d ff ff ff ff ff ff ff ff ff ff 01 "
        "02 c5 00 00 00 00 00 00 00 ff ff ff ff ff ff ff ff ff ff 01 "
        "50 4f 57 45 52 5f 4f 4e 00 00 00 00 00 00 00 00 00 00 00 00 00 00 "
        "02 00 00 00 00 00 2d 76 00"
    )

    payload = proxy._build_macro_save_payload(
        source_payload,
        device_id=0x06,
        button_id=ButtonName.POWER_ON,
    )

    assert payload is not None
    assert payload[8] == 0x06
    assert len(payload) == 100
    assert bytes([0x06, 0xC6]) in payload
    assert bytes([0x06, 0xC5]) in payload


def test_build_macro_save_payload_from_observed_power_off_payload() -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    source_payload = bytes.fromhex(
        "01 00 01 01 00 01 66 c7 04 "
        "01 c7 00 00 00 00 00 00 01 ff ff ff ff ff ff ff ff ff ff 01 "
        "02 c7 00 00 00 00 00 00 01 ff ff ff ff ff ff ff ff ff ff 01 "
        "50 4f 57 45 52 5f 4f 46 46 00 00 00 00 00 00 00 00 00 00 00 00 00 00 "
        "00 00 00 00 00 00 ff ff"
    )

    payload = proxy._build_macro_save_payload(
        source_payload,
        device_id=0x06,
        button_id=ButtonName.POWER_OFF,
    )

    assert payload is not None
    assert payload[8] == 0x03
    assert len(payload) == 70
    assert bytes([0x06, 0xC7]) in payload



def test_build_macro_save_payload_keeps_compact_rows_when_len_divisible_by_20() -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    # Compact rows (already 10-byte records), total length divisible by 20.
    source_payload = bytes.fromhex(
        "01 00 01 01 00 01 66 c6 06 "
        "01 c6 00 00 00 00 00 00 01 ff "
        "02 c6 00 00 00 00 00 00 01 ff "
        "01 c5 00 00 00 00 00 00 1d ff "
        "02 c5 00 00 00 00 00 00 00 ff "
        "04 c6 00 00 00 00 00 00 00 ff "
        "04 c5 00 00 00 00 00 00 00 ff "
        "50 4f 57 45 52 5f 4f 4e 00 00 00 00 00 00 00 00 00 00 00 00 00 00 "
        "02 00 00 00 00 00 2d 76 2a"
    )

    payload = proxy._build_macro_save_payload(
        source_payload,
        device_id=0x06,
        button_id=ButtonName.POWER_ON,
    )

    assert payload is not None
    # Keep existing 6 rows and append 2 new ones for device 6.
    assert payload[8] == 0x08
    assert len(payload) == 120
    assert bytes([0x02, 0xC6]) in payload
    assert bytes([0x02, 0xC5]) in payload
    assert bytes([0x04, 0xC6]) in payload
    assert bytes([0x04, 0xC5]) in payload
    assert bytes([0x06, 0xC6]) in payload
    assert bytes([0x06, 0xC5]) in payload



def test_build_macro_save_payload_filters_devices_by_activity_members() -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    source_payload = bytes.fromhex(
        "01 00 01 01 00 01 66 c6 06 "
        "01 c6 00 00 00 00 00 00 01 ff "
        "02 c6 00 00 00 00 00 00 01 ff "
        "01 c5 00 00 00 00 00 00 1d ff "
        "02 c5 00 00 00 00 00 00 00 ff "
        "04 c6 00 00 00 00 00 00 00 ff "
        "04 c5 00 00 00 00 00 00 00 ff "
        "50 4f 57 45 52 5f 4f 4e 00 00 00 00 00 00 00 00 00 00 00 00 00 00 "
        "02 00 00 00 00 00 2d 76 2a"
    )

    payload = proxy._build_macro_save_payload(
        source_payload,
        device_id=0x06,
        button_id=ButtonName.POWER_ON,
        allowed_device_ids={1, 2, 6},
    )

    assert payload is not None
    # Rows for device 4 are removed; device 6 rows are added.
    assert payload[8] == 0x06
    assert len(payload) == 100
    assert bytes([0x04, 0xC6]) not in payload
    assert bytes([0x04, 0xC5]) not in payload
    assert bytes([0x06, 0xC6]) in payload
    assert bytes([0x06, 0xC5]) in payload



def test_build_macro_save_payload_recomputes_trailing_token() -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    source_payload = bytes.fromhex(
        "01 00 01 01 00 01 66 c6 06 "
        "01 c6 00 00 00 00 00 00 01 ff "
        "02 c6 00 00 00 00 00 00 01 ff "
        "01 c5 00 00 00 00 00 00 1d ff "
        "02 c5 00 00 00 00 00 00 00 ff "
        "50 4f 57 45 52 5f 4f 4e 00 00 00 00 00 00 00 00 00 00 00 00 00 00 "
        "02 00 00 00 00 00 2d 76 97"
    )

    payload = proxy._build_macro_save_payload(
        source_payload,
        device_id=0x06,
        button_id=ButtonName.POWER_ON,
        allowed_device_ids={1, 2, 6},
    )

    assert payload is not None
    assert payload[-1] == ((sum(payload[:-1]) - 2) & 0xFF)
    assert payload[-1] != 0x97


def test_build_macro_save_payload_preserves_trailing_metadata_chunk() -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    source_payload = bytes.fromhex(
        "01 00 01 01 00 02 65 c6 0c "
        "03 c6 00 00 00 00 00 00 01 ff "
        "01 c5 00 00 00 00 00 00 05 ff "
        "06 c6 00 00 00 00 00 00 01 ff "
        "01 c6 00 00 00 00 00 00 01 ff "
        "02 c6 00 00 00 00 00 00 00 ff "
        "04 c6 00 00 00 00 00 00 00 ff "
        "02 c5 00 00 00 00 00 00 00 ff "
        "03 c5 00 00 00 00 00 00 00 ff "
        "04 c5 00 00 00 00 00 00 00 ff "
        "06 c5 00 00 00 00 00 00 00 ff "
        # metadata chunk observed in failing captures before label region
        "6a 71 00 00 00 00 00 00 0b e7 "
        "00 50 00 4f 00 57 00 45 00 52 00 5f 00 4f 00 4e "
        "00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00"
    )

    payload = proxy._build_macro_save_payload(
        source_payload,
        device_id=0x08,
        button_id=ButtonName.POWER_ON,
        allowed_device_ids={1, 2, 3, 4, 6, 8},
    )

    assert payload is not None
    assert bytes.fromhex("6a 71 00 00 00 00 00 00 0b") in payload


def test_build_macro_save_payload_drops_placeholder_rows_for_x2_snapshot() -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    source_payload = bytes.fromhex(
        "01 00 01 01 00 02 69 c6 15 "
        "03 c6 00 00 00 00 00 00 01 ff ff ff ff ff ff ff ff ff ff "
        "01 01 c5 00 00 00 00 00 00 0b ff ff ff ff ff ff ff ff ff ff "
        "01 01 c6 00 00 00 00 00 00 01 ff ff ff ff ff ff ff ff ff ff "
        "01 02 c6 00 00 00 00 00 00 00 ff ff ff ff ff ff ff ff ff ff "
        "01 04 c6 00 00 00 00 00 00 00 ff ff ff ff ff ff ff ff ff ff "
        "01 07 c6 00 00 00 00 00 00 00 ff ff ff ff ff ff ff ff ff ff "
        "01 02 c5 00 00 00 00 00 00 00 ff ff ff ff ff ff ff ff ff ff "
        "01 03 c5 00 00 00 00 00 00 00 ff ff ff ff ff ff ff ff ff ff "
        "01 04 c5 00 00 00 00 00 00 00 ff ff ff ff ff ff ff ff ff ff "
        "01 07 c5 00 00 00 00 00 00 00 ff "
        "08 c6 00 00 00 00 00 00 00 ff 08 c5 00 00 00 00 00 00 00 ff "
        "00 50 00 4f 00 57 00 45 00 52 00 5f 00 4f 00 4e "
        "00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 "
        "00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 fd"
    )

    payload = proxy._build_macro_save_payload(
        source_payload,
        device_id=0x08,
        button_id=ButtonName.POWER_ON,
        allowed_device_ids={1, 2, 3, 4, 7, 8},
    )

    assert payload is not None
    # Mirrors app's compact save count for this capture style (12 rows).
    assert payload[8] == 0x0C
    assert bytes.fromhex("ff ff ff ff ff ff ff ff ff ff") not in payload


def test_build_macro_save_payload_accepts_utf16_macro_labels() -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    # X1S/X2 observed payload style (UTF-16BE POWER_ON label with leading nulls).
    source_payload = bytes.fromhex(
        "01 00 01 01 00 01 68 c6 08 "
        "01 c6 00 00 00 00 00 00 01 ff "
        "03 c6 00 00 00 00 00 00 01 ff "
        "07 c6 00 00 00 00 00 00 01 ff "
        "01 c5 00 00 00 00 00 00 00 ff "
        "03 c5 00 00 00 00 00 00 05 ff "
        "07 c5 00 00 00 00 00 00 00 ff "
        "04 c6 00 00 00 00 00 00 01 ff "
        "04 c5 00 00 00 00 00 00 00 ff "
        "00 50 00 4f 00 57 00 45 00 52 00 5f 00 4f 00 4e "
        "00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 "
        "00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 "
        "fc 00 fc 04"
    )

    payload = proxy._build_macro_save_payload(
        source_payload,
        device_id=0x09,
        button_id=ButtonName.POWER_ON,
        allowed_device_ids={1, 3, 4, 7, 9},
    )

    assert payload is not None
    assert payload[8] == 0x0A
    assert bytes([0x09, 0xC6]) in payload
    assert bytes([0x09, 0xC5]) in payload
    assert b"\x00P\x00O\x00W" in payload


def test_build_macro_save_payload_without_embedded_label_uses_row_count_hint() -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    # Observed variant from OP_F013: no embedded POWER_ON label marker,
    # compact 10-byte rows followed by trailing metadata bytes.
    source_payload = bytes.fromhex(
        "01 00 01 01 00 01 65 c6 09 "
        "11 03 c6 00 00 00 00 00 00 00 "
        "01 05 c6 00 00 00 00 00 00 00 "
        "01 01 c5 00 00 00 00 00 00 00 "
        "01 01 c6 00 00 00 00 00 00 00 "
        "01 07 c6 00 00 00 00 00 00 00 "
        "01 03 c5 00 00 00 00 00 00 00 "
        "02 03 1d 00 00 00 00 00 00 00 "
        "01 07 c5 00 00 00 00 00 00 00 "
        "01 05 c5 00 00 00 00 00 00 06 "
        "00 00 00 00 00 00 00 00 00 00 00 00"
    )

    payload = proxy._build_macro_save_payload(
        source_payload,
        device_id=0x09,
        button_id=ButtonName.POWER_ON,
        allowed_device_ids={1, 3, 5, 7, 9},
    )

    assert payload is not None
    assert payload[8] >= 0x08
    assert bytes([0x09, 0xC6]) in payload
    assert bytes([0x09, 0xC5]) in payload


def test_add_device_to_activity_discards_stale_members_before_refresh(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)

    # Simulate stale cache from an earlier run.
    for dev_id in (1, 2, 3, 4, 5):
        proxy.state.record_activity_member(101, dev_id)

    def _request_activity_mapping(act_id: int) -> bool:
        act_lo = act_id & 0xFF
        # Fresh burst only reports one member before adding a new one.
        proxy.state.record_activity_member(act_lo, 1)
        proxy._activity_map_complete.add(act_lo)
        return True

    monkeypatch.setattr(proxy, "request_activity_mapping", _request_activity_mapping)

    sent: list[tuple[int, bytes]] = []
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: sent.append((opcode, payload)))
    monkeypatch.setattr(proxy, "wait_for_activity_inputs_burst", lambda timeout=5.0: True)
    monkeypatch.setattr(
        proxy,
        "wait_for_macro_payload",
        lambda _act, _button, timeout=5.0: bytes.fromhex(
            "01 00 01 01 00 01 65 c7 "
            "01 c7 00 00 00 00 00 00 01 ff "
            "01 ff ff ff ff ff ff ff ff ff "
            "50 4f 57 45 52 5f 4f 46 46 00 00 00 00 00 00 00 00 00 00 00 00 00 00 "
            "00 00 00 00 00 00 ff ff"
        ),
    )
    monkeypatch.setattr(
        proxy,
        "_build_macro_save_payload",
        lambda source_payload, *, device_id, button_id, allowed_device_ids=None, input_index=0: source_payload,
    )
    monkeypatch.setattr(proxy, "_send_family_frame", lambda family, payload: None)
    monkeypatch.setattr(
        proxy,
        "wait_for_roku_ack_any",
        lambda candidates, timeout=5.0: (candidates[0][0], bytes([candidates[0][1] if candidates[0][1] is not None else 0x00])),
    )

    result = proxy.add_device_to_activity(101, 9)

    assert result is not None
    # Confirm sequence should use fresh map data (dev 1) + new device only.
    assert sent[:2] == [
        (0x024F, bytes([0x01, 0x00])),
        (0x024F, bytes([0x09, 0x00])),
    ]


def test_add_device_to_activity_uses_activity_members_from_map(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    def _request_activity_mapping(act_id: int) -> bool:
        act_lo = act_id & 0xFF
        proxy.state.record_activity_member(act_lo, 1)
        proxy.state.record_activity_member(act_lo, 2)
        proxy.state.record_activity_member(act_lo, 6)
        proxy._activity_map_complete.add(act_lo)
        return True

    monkeypatch.setattr(proxy, "request_activity_mapping", _request_activity_mapping)

    # Favorites only reveal two members, but activity-map membership includes device 6.
    proxy.state.activity_favorite_slots[101] = [
        {"button_id": 1, "device_id": 1, "command_id": 0x10},
        {"button_id": 2, "device_id": 2, "command_id": 0x11},
    ]
    proxy.state.record_activity_member(101, 1)
    proxy.state.record_activity_member(101, 2)
    proxy.state.record_activity_member(101, 6)

    sent: list[tuple[int, bytes]] = []
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: sent.append((opcode, payload)))

    monkeypatch.setattr(proxy, "wait_for_activity_inputs_burst", lambda timeout=5.0: True)
    monkeypatch.setattr(
        proxy,
        "wait_for_macro_payload",
        lambda _act, _button, timeout=5.0: bytes.fromhex(
            "01 00 01 01 00 01 65 c7 "
            "01 c7 00 00 00 00 00 00 01 ff "
            "02 c7 00 00 00 00 00 00 01 ff "
            "50 4f 57 45 52 5f 4f 46 46 00 00 00 00 00 00 00 00 00 00 00 00 00 00 "
            "00 00 00 00 00 00 ff ff"
        )
        if _button == ButtonName.POWER_OFF
        else bytes.fromhex(
            "01 00 01 01 00 01 65 c6 "
            "01 c6 00 00 00 00 00 00 01 ff "
            "02 c6 00 00 00 00 00 00 01 ff "
            "01 c5 00 00 00 00 00 00 1a ff "
            "02 c5 00 00 00 00 00 00 00 ff "
            "50 4f 57 45 52 5f 4f 4e 00 00 00 00 00 00 00 00 00 00 00 00 00 00 "
            "02 00 00 00 00 00 2d 76 00"
        ),
    )
    monkeypatch.setattr(
        proxy,
        "_build_macro_save_payload",
        lambda source_payload, *, device_id, button_id, allowed_device_ids=None, input_index=0: source_payload,
    )
    monkeypatch.setattr(proxy, "_send_family_frame", lambda family, payload: None)
    monkeypatch.setattr(
        proxy,
        "wait_for_roku_ack_any",
        lambda candidates, timeout=5.0: (candidates[0][0], bytes([candidates[0][1] if candidates[0][1] is not None else 0x00])),
    )

    result = proxy.add_device_to_activity(101, 5)

    assert result is not None
    assert result["members_before"] == [1, 2, 6]
    assert result["members_confirmed"] == [1, 2, 6, 5]
    assert sent[:4] == [
        (0x024F, bytes([0x01, 0x00])),
        (0x024F, bytes([0x02, 0x00])),
        (0x024F, bytes([0x06, 0x00])),
        (0x024F, bytes([0x05, 0x00])),
    ]

def test_add_device_to_activity_requires_ack(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    def _request_activity_mapping(act_id: int) -> bool:
        act_lo = act_id & 0xFF
        proxy.state.record_activity_member(act_lo, 1)
        proxy._activity_map_complete.add(act_lo)
        return True

    monkeypatch.setattr(proxy, "request_activity_mapping", _request_activity_mapping)

    proxy.state.activity_favorite_slots[101] = [
        {"button_id": 1, "device_id": 1, "command_id": 0x10},
    ]

    sent: list[tuple[int, bytes]] = []
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: sent.append((opcode, payload)))

    monkeypatch.setattr(proxy, "wait_for_activity_inputs_burst", lambda timeout=5.0: True)
    monkeypatch.setattr(
        proxy,
        "wait_for_macro_payload",
        lambda _act, button, timeout=5.0: (
            bytes.fromhex(
                "01 00 01 01 00 01 65 c7 "
                "01 c7 00 00 00 00 00 00 01 ff "
                "02 c7 00 00 00 00 00 00 01 ff "
                "01 ff ff ff ff ff ff ff ff ff "
                "02 ff ff ff ff ff ff ff ff ff "
                "50 4f 57 45 52 5f 4f 46 46 00 00 00 00 00 00 00 00 00 00 00 00 00 00 "
                "00 00 00 00 00 00 ff ff"
            )
            if button == ButtonName.POWER_OFF
            else bytes.fromhex(
                "01 00 01 01 00 01 65 c6 "
                "01 c6 00 00 00 00 00 00 01 ff "
                "02 c6 00 00 00 00 00 00 01 ff "
                "01 c5 00 00 00 00 00 00 1a ff "
                "02 c5 00 00 00 00 00 00 00 ff "
                "01 ff ff ff ff ff ff ff ff ff "
                "02 ff ff ff ff ff ff ff ff ff "
                "50 4f 57 45 52 5f 4f 4e 00 00 00 00 00 00 00 00 00 00 00 00 00 00 "
                "02 00 00 00 00 00 2d 76 00"
            )
        ),
    )
    monkeypatch.setattr(
        proxy,
        "_build_macro_save_payload",
        lambda source_payload, *, device_id, button_id, allowed_device_ids=None, input_index=0: source_payload,
    )

    monkeypatch.setattr(proxy, "_send_family_frame", lambda family, payload: None)

    attempts = {"count": 0}

    def _wait_for_roku_ack_any(
        candidates: list[tuple[int, int | None]],
        *,
        timeout: float = 5.0,
    ) -> tuple[int, bytes] | None:
        attempts["count"] += 1
        if attempts["count"] == 1:
            first_opcode, first_byte = candidates[0]
            return first_opcode, bytes([first_byte if first_byte is not None else 0x00])
        return None

    monkeypatch.setattr(proxy, "wait_for_roku_ack_any", _wait_for_roku_ack_any)

    result = proxy.add_device_to_activity(101, 6)

    assert result is None
    assert sent == [
        (0x024F, bytes([0x01, 0x00])),
        (0x024F, bytes([0x06, 0x00])),
    ]





def test_add_device_to_activity_x2_uses_same_assignment_flow_as_x1s(monkeypatch) -> None:
    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=HUB_VERSION_X2,
    )

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    def _request_activity_mapping(act_id: int) -> bool:
        act_lo = act_id & 0xFF
        proxy.state.record_activity_member(act_lo, 1)
        proxy.state.record_activity_member(act_lo, 2)
        proxy._activity_map_complete.add(act_lo)
        return True

    monkeypatch.setattr(proxy, "request_activity_mapping", _request_activity_mapping)

    proxy.state.activities[101] = {"name": "Play PlayStation 5", "active": False}
    proxy.state.activity_favorite_slots[101] = [
        {"button_id": 1, "device_id": 1, "command_id": 0x10},
        {"button_id": 2, "device_id": 2, "command_id": 0x11},
    ]

    sent: list[tuple[int, bytes]] = []
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: sent.append((opcode, payload)))

    family_sends: list[tuple[int, bytes]] = []
    monkeypatch.setattr(proxy, "_send_family_frame", lambda family, payload: family_sends.append((family, payload)))

    macro_payload = bytes.fromhex(
        "01 00 01 01 00 01 65 c6 "
        "01 c6 00 00 00 00 00 00 01 ff "
        "02 c6 00 00 00 00 00 00 01 ff "
        "01 c5 00 00 00 00 00 00 1a ff "
        "02 c5 00 00 00 00 00 00 00 ff "
        "50 4f 57 45 52 5f 4f 4e 00 00 00 00 00 00 00 00 00 00 00 00 00 00 "
        "02 00 00 00 00 00 2d 76 00"
    )

    monkeypatch.setattr(proxy, "wait_for_macro_payload", lambda _act, _button, timeout=5.0: macro_payload)
    monkeypatch.setattr(proxy, "wait_for_activity_inputs_burst", lambda timeout=5.0: True)
    monkeypatch.setattr(
        proxy,
        "_build_macro_save_payload",
        lambda source_payload, *, device_id, button_id, allowed_device_ids=None, input_index=0: source_payload,
    )

    ack_calls: list[list[tuple[int, int | None]]] = []

    def _wait_for_roku_ack_any(
        candidates: list[tuple[int, int | None]],
        *,
        timeout: float = 5.0,
    ) -> tuple[int, bytes] | None:
        ack_calls.append(candidates)
        first_opcode, first_byte = candidates[0]
        return first_opcode, bytes([first_byte if first_byte is not None else 0x00])

    monkeypatch.setattr(proxy, "wait_for_roku_ack_any", _wait_for_roku_ack_any)

    result = proxy.add_device_to_activity(101, 6)

    assert result is not None
    assert sent == [
        (0x024F, bytes([0x01, 0x00])),
        (0x024F, bytes([0x02, 0x00])),
        (0x024F, bytes([0x06, 0x00])),
        (0x024D, bytes([0x65, 0xC6])),
        (0x024D, bytes([0x65, 0xC7])),
    ]
    assert len(family_sends) == 2
    assert ack_calls == [
        [(0x0103, None)],
        [(0x0103, None)],
        [(0x0103, None)],
        [(0x0112, 198)],
        [(0x0112, 199)],
    ]


def test_add_device_to_activity_rejects_activity_inputs_error_ack(monkeypatch) -> None:
    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=HUB_VERSION_X1S,
    )

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)

    def _request_activity_mapping(act_id: int) -> bool:
        act_lo = act_id & 0xFF
        proxy.state.record_activity_member(act_lo, 1)
        proxy._activity_map_complete.add(act_lo)
        return True

    monkeypatch.setattr(proxy, "request_activity_mapping", _request_activity_mapping)

    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: None)
    monkeypatch.setattr(proxy, "_send_family_frame", lambda family, payload: None)

    macro_payload = bytes.fromhex(
        "01 00 01 01 00 01 65 c6 "
        "01 c6 00 00 00 00 00 00 01 ff "
        "01 c5 00 00 00 00 00 00 1a ff "
        "50 4f 57 45 52 5f 4f 4e 00 00 00 00 00 00 00 00 00 00 00 00 00 00 "
        "01 00 00 00 00 00 2d 76 00"
    )

    monkeypatch.setattr(proxy, "wait_for_macro_payload", lambda _act, _button, timeout=5.0: macro_payload)
    monkeypatch.setattr(proxy, "wait_for_activity_inputs_burst", lambda timeout=5.0: False)

    def _wait_for_roku_ack_any(candidates: list[tuple[int, int | None]], *, timeout: float = 5.0):
        if candidates == [(0x0103, None)]:
            return 0x0103, b"\xff"
        first_opcode, first_byte = candidates[0]
        return first_opcode, bytes([first_byte if first_byte is not None else 0x00])

    monkeypatch.setattr(proxy, "wait_for_roku_ack_any", _wait_for_roku_ack_any)

    assert proxy.add_device_to_activity(101, 6) is None


def test_add_device_to_activity_x1_does_not_send_finalize_stage(monkeypatch) -> None:
    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=HUB_VERSION_X1,
    )

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    def _request_activity_mapping(act_id: int) -> bool:
        act_lo = act_id & 0xFF
        proxy.state.record_activity_member(act_lo, 1)
        proxy._activity_map_complete.add(act_lo)
        return True

    monkeypatch.setattr(proxy, "request_activity_mapping", _request_activity_mapping)

    proxy.state.activity_favorite_slots[101] = [{"button_id": 1, "device_id": 1, "command_id": 0x10}]

    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: None)

    family_sends: list[int] = []
    monkeypatch.setattr(proxy, "_send_family_frame", lambda family, payload: family_sends.append(family))

    macro_payload = bytes.fromhex(
        "01 00 01 01 00 01 65 c7 "
        "01 c7 00 00 00 00 00 00 01 ff "
        "01 ff ff ff ff ff ff ff ff ff "
        "50 4f 57 45 52 5f 4f 46 46 00 00 00 00 00 00 00 00 00 00 00 00 00 00 "
        "00 00 00 00 00 00 ff ff"
    )

    monkeypatch.setattr(proxy, "wait_for_macro_payload", lambda _act, _button, timeout=5.0: macro_payload)
    monkeypatch.setattr(proxy, "wait_for_activity_inputs_burst", lambda timeout=5.0: True)
    monkeypatch.setattr(
        proxy,
        "_build_macro_save_payload",
        lambda source_payload, *, device_id, button_id, allowed_device_ids=None, input_index=0: source_payload,
    )
    monkeypatch.setattr(
        proxy,
        "wait_for_roku_ack_any",
        lambda candidates, timeout=5.0: (candidates[0][0], bytes([candidates[0][1] if candidates[0][1] is not None else 0x00])),
    )

    result = proxy.add_device_to_activity(101, 6)

    assert result is not None
    assert family_sends == [0x12, 0x12]

def test_build_favorite_map_payload_matches_observed_sample() -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    payload = proxy._build_favorite_map_payload(
        activity_id=0x66,
        device_id=0x06,
        command_id=0x04,
        slot_id=0x00,
    )

    assert payload == bytes.fromhex(
        "01 00 01 01 00 01 66 00 06 00 00 00 00 4e 24 04 00 00 00 00 00 00 00 00 e4"
    )



def test_delete_device_replays_delete_and_confirms_impacted_activities(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)

    sent: list[tuple[int, bytes]] = []
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: sent.append((opcode, payload)))

    def _request_activities() -> bool:
        proxy._burst.active = True
        proxy._burst.kind = "activities"
        proxy._burst.active = False
        proxy.state.activities[0x66] = {"name": "heyo", "active": False, "needs_confirm": True}
        proxy.state.activities[0x65] = {"name": "test", "active": True, "needs_confirm": False}
        return True

    monkeypatch.setattr(proxy, "request_activities", _request_activities)

    ack_calls: list[list[tuple[int, int | None]]] = []

    def _wait_for_roku_ack_any(
        candidates: list[tuple[int, int | None]],
        *,
        timeout: float = 5.0,
    ) -> tuple[int, bytes] | None:
        ack_calls.append(candidates)
        return 0x0103, b"\x00"

    monkeypatch.setattr(proxy, "wait_for_roku_ack_any", _wait_for_roku_ack_any)

    result = proxy.delete_device(0x04)

    assert result == {
        "device_id": 0x04,
        "confirmed_activities": [0x66],
        "status": "success",
    }
    assert [opcode for opcode, _payload in sent] == [0x0109, 0x7B38]
    assert sent[0][1] == b""
    assert sent[1][1][7] == 0x66
    assert sent[1][1][9] == 0x02
    assert sent[1][1][95] == 0x00
    assert ack_calls == [[(0x0103, None)], [(0x0103, None)]]






def test_delete_device_uses_x1s_finalize_opcode_for_activity_confirmation(monkeypatch) -> None:
    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=HUB_VERSION_X1S,
    )

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)

    sent: list[tuple[int, bytes]] = []
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: sent.append((opcode, payload)))

    def _request_activities() -> bool:
        proxy._burst.active = True
        proxy._burst.kind = "activities"
        proxy._burst.active = False
        row_payload = bytearray(214)
        row_payload[0] = 0x04
        row_payload[6:8] = (0x0068).to_bytes(2, "big")
        row_payload[170:174] = bytes([0xFC, 0x00, 0xFC, 0x01])
        proxy.state.activities[0x68] = {
            "name": "Play Xbox",
            "active": False,
            "needs_confirm": True,
        }
        proxy._activity_row_payloads[0x68] = bytes(row_payload)
        return True

    monkeypatch.setattr(proxy, "request_activities", _request_activities)
    monkeypatch.setattr(proxy, "wait_for_roku_ack_any", lambda candidates, timeout=5.0: (0x0103, b"\x00"))

    result = proxy.delete_device(0x04)

    assert result is not None
    assert [opcode for opcode, _payload in sent] == [0x0109, OP_ACTIVITY_ASSIGN_FINALIZE]
    assert len(sent[1][1]) == 214
    assert sent[1][1][173] == 0x00

def test_delete_device_uses_120_second_delete_ack_timeout(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False, hub_version=HUB_VERSION_X1)

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: None)

    observed: dict[str, float] = {}

    def _wait_for_roku_ack_any(candidates, *, timeout=5.0):
        observed["timeout"] = timeout
        return 0x0103, b"\x00"

    monkeypatch.setattr(proxy, "wait_for_roku_ack_any", _wait_for_roku_ack_any)
    monkeypatch.setattr(proxy, "request_activities", lambda: False)

    assert proxy.delete_device(0x04) is None
    assert observed["timeout"] == 120.0
def test_delete_device_requires_delete_ack(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: None)
    monkeypatch.setattr(proxy, "wait_for_roku_ack_any", lambda candidates, timeout=5.0: None)

    requested = {"count": 0}

    def _request_activities() -> bool:
        requested["count"] += 1
        return True

    monkeypatch.setattr(proxy, "request_activities", _request_activities)

    assert proxy.delete_device(0x04) is None
    assert requested["count"] == 0

def test_build_command_to_button_payload_matches_observed_sample() -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    payload = proxy._build_command_to_button_payload(
        activity_id=0x65,
        button_id=0xC1,
        device_id=0x05,
        command_id=0x02,
    )

    assert payload == bytes.fromhex(
        "01 00 01 01 00 01 65 c1 05 00 00 00 00 4e 22 02 00 00 00 00 00 00 00 00 9f"
    )


def test_build_command_to_button_payload_with_long_press() -> None:
    """Verify the long-press payload matches the captured protocol sample.

    The sample was captured from the official app setting OK button (0xB0)
    with short press (dev=0x05, cmd=0x01) and long press (dev=0x05, cmd=0x02).
    """
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    payload = proxy._build_command_to_button_payload(
        activity_id=0x65,
        button_id=0xB0,
        device_id=0x05,
        command_id=0x01,
        long_press_device_id=0x05,
        long_press_command_id=0x02,
    )

    assert payload == bytes.fromhex(
        "01 00 01 01 00 01 65 b0 05 00 00 00 00 4e 21 01 05 00 00 00 00 4e 22 02 03"
    )


def test_command_to_favorite_replays_sequence(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)

    sent: list[tuple[int, bytes]] = []
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: sent.append((opcode, payload)))

    ack_calls: list[list[tuple[int, int | None]]] = []

    def _wait_for_roku_ack_any(
        candidates: list[tuple[int, int | None]],
        *,
        timeout: float = 5.0,
    ) -> tuple[int, bytes] | None:
        ack_calls.append(candidates)
        first_opcode, first_byte = candidates[0]
        return first_opcode, bytes([first_byte if first_byte is not None else 0x00])

    monkeypatch.setattr(proxy, "wait_for_roku_ack_any", _wait_for_roku_ack_any)

    requested: list[int] = []
    monkeypatch.setattr(proxy, "request_activity_mapping", lambda act_id: requested.append(act_id) or True)

    cleared: list[tuple[int, bool, bool, bool]] = []
    monkeypatch.setattr(
        proxy,
        "clear_entity_cache",
        lambda ent_id, clear_buttons=False, clear_favorites=False, clear_macros=False: cleared.append(
            (ent_id, clear_buttons, clear_favorites, clear_macros)
        ),
    )

    result = proxy.command_to_favorite(0x66, 0x06, 0x04)

    assert result == {
        "activity_id": 0x66,
        "device_id": 0x06,
        "command_id": 0x04,
        "slot_id": 0x00,
        "fav_id": None,
        "status": "success",
    }
    # X1 sends a 0x62 favorites-order request before the map step so it can
    # include the existing (fav_id, slot) pairs in the stage payload.
    assert [opcode & 0xFF for opcode, _payload in sent] == [0x62, 0x3E, 0x61, 0x65]
    assert sent[0][1] == bytes([0x66])   # fav-order request payload = act_lo
    assert sent[1][1] == bytes.fromhex(
        "01 00 01 01 00 01 66 00 06 00 00 00 00 4e 24 04 00 00 00 00 00 00 00 00 e4"
    )
    # X1 stage uses _build_favorites_reorder_payload([1]) — no pre-existing entries,
    # new_fav_id=None so fallback ordered_ids=[1]:
    # [01 00 01 01 00 01 66 01 01] + checksum 6A
    assert sent[2][1] == bytes([0x01, 0x00, 0x01, 0x01, 0x00, 0x01, 0x66, 0x01, 0x01, 0x6A])
    assert sent[3][1] == b"f"
    assert ack_calls == [
        [(0xFF63, 0x66)],                      # fav-order query for act=0x66
        [(0x013E, None), (0x0103, None)],      # map
        [(0x0103, None)],                      # stage
        [(0x0103, None)],                      # commit
    ]
    assert cleared == [(0x66, False, True, False)]
    assert requested == [0x66]


def test_command_to_favorite_x1s_replays_sequence(monkeypatch) -> None:
    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=HUB_VERSION_X1S,
    )

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)

    sent: list[tuple[int, bytes]] = []
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: sent.append((opcode, payload)))

    ack_calls: list[list[tuple[int, int | None]]] = []

    def _wait_for_roku_ack_any(
        candidates: list[tuple[int, int | None]],
        *,
        timeout: float = 5.0,
    ) -> tuple[int, bytes] | None:
        ack_calls.append(candidates)
        first_opcode, first_byte = candidates[0]
        return first_opcode, bytes([first_byte if first_byte is not None else 0x04])

    monkeypatch.setattr(proxy, "wait_for_roku_ack_any", _wait_for_roku_ack_any)

    requested: list[int] = []
    monkeypatch.setattr(proxy, "request_activity_mapping", lambda act_id: requested.append(act_id) or True)

    cleared: list[tuple[int, bool, bool, bool]] = []
    monkeypatch.setattr(
        proxy,
        "clear_entity_cache",
        lambda ent_id, clear_buttons=False, clear_favorites=False, clear_macros=False: cleared.append(
            (ent_id, clear_buttons, clear_favorites, clear_macros)
        ),
    )

    result = proxy.command_to_favorite(0x68, 0x01, 0x03)

    assert result == {
        "activity_id": 0x68,
        "device_id": 0x01,
        "command_id": 0x03,
        "slot_id": 0x00,
        "fav_id": 4,
        "status": "success",
    }
    assert [opcode & 0xFF for opcode, _payload in sent] == [0x3E, 0x61, 0x65]
    assert sent[0][1] == bytes.fromhex(
        "01 00 01 01 00 01 68 00 01 00 00 00 00 4e 23 03 00 00 00 00 00 00 00 00 df"
    )
    assert sent[1][1] == bytes.fromhex("01 00 01 01 00 01 68 01 01 02 02 03 03 04 04 7e")
    assert sent[2][1] == b"h"
    assert ack_calls == [
        [(0x013E, None), (0x0103, None)],
        [(0x0103, None)],
        [(0x0103, None)],
    ]
    assert cleared == [(0x68, False, True, False)]
    assert requested == [0x68]


def test_command_to_favorite_can_skip_refresh_after_write(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: None)

    def _wait_for_roku_ack_any(
        candidates: list[tuple[int, int | None]],
        *,
        timeout: float = 5.0,
    ) -> tuple[int, bytes] | None:
        first_opcode, first_byte = candidates[0]
        return first_opcode, bytes([first_byte if first_byte is not None else 0x00])

    monkeypatch.setattr(proxy, "wait_for_roku_ack_any", _wait_for_roku_ack_any)

    requested: list[int] = []
    monkeypatch.setattr(proxy, "request_activity_mapping", lambda act_id: requested.append(act_id) or True)

    result = proxy.command_to_favorite(0x68, 0x01, 0x03, refresh_after_write=False)
    assert result is not None
    assert requested == []


def test_delete_favorite_requires_explicit_fav_id(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(proxy, "request_favorites_order", lambda act_id: [(0x02, 0x01), (0x04, 0x02), (0x06, 0x03)])

    steps: list[tuple[str, int, bytes, float]] = []

    def _send_roku_step(*, step_name, family, payload, ack_opcode, timeout=5.0):
        steps.append((step_name, family, payload, timeout))
        return True

    monkeypatch.setattr(proxy, "_send_roku_step", _send_roku_step)
    monkeypatch.setattr(proxy, "start_roku_create", lambda: None)
    monkeypatch.setattr(proxy, "clear_entity_cache", lambda *args, **kwargs: None)
    requested: list[int] = []
    monkeypatch.setattr(proxy, "request_activity_mapping", lambda act_id: requested.append(act_id) or True)

    result = proxy.delete_favorite(0x66, 0x04)

    assert result == {
        "activity_id": 0x66,
        "deleted_fav_id": 0x04,
        "remaining": 2,
        "status": "success",
    }
    assert steps == [
        ("fav-delete-10[act=0x66 fav=0x04]", 0x10, bytes([0x66, 0x04]), 7.5),
        ("fav-delete-reorder-61[act=0x66]", 0x61, bytes.fromhex("01 00 01 01 00 01 66 02 01 06 02 73"), 5.0),
        ("fav-delete-commit-65[act=0x66]", 0x65, b"\x66", 5.0),
    ]
    assert requested == [0x66]


def test_delete_favorite_rejects_unknown_fav_id(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(proxy, "request_favorites_order", lambda act_id: [(0x02, 0x01), (0x04, 0x02), (0x06, 0x03)])

    assert proxy.delete_favorite(0x66, 0x09) is None


def test_reorder_favorites_requires_explicit_fav_ids(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(proxy, "request_favorites_order", lambda act_id: [(0x02, 0x01), (0x04, 0x02), (0x06, 0x03)])

    steps: list[tuple[str, int, bytes]] = []

    def _send_roku_step(*, step_name, family, payload, ack_opcode, timeout=5.0):
        steps.append((step_name, family, payload))
        return True

    monkeypatch.setattr(proxy, "_send_roku_step", _send_roku_step)
    monkeypatch.setattr(proxy, "start_roku_create", lambda: None)
    monkeypatch.setattr(proxy, "clear_entity_cache", lambda *args, **kwargs: None)
    requested: list[int] = []
    monkeypatch.setattr(proxy, "request_activity_mapping", lambda act_id: requested.append(act_id) or True)

    result = proxy.reorder_favorites(0x66, [0x06, 0x02, 0x04])

    assert result == {"activity_id": 0x66, "fav_ids": [0x06, 0x02, 0x04], "status": "success"}
    assert steps == [
        ("fav-reorder-61[act=0x66]", 0x61, bytes.fromhex("01 00 01 01 00 01 66 06 01 02 02 04 03 7a")),
        ("fav-reorder-commit-65[act=0x66]", 0x65, b"\x66"),
    ]
    assert requested == [0x66]


def test_reorder_favorites_skips_unknown_fav_ids(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(proxy, "request_favorites_order", lambda act_id: [(0x02, 0x01), (0x04, 0x02), (0x06, 0x03)])

    steps: list[tuple[str, int, bytes]] = []

    def _send_roku_step(*, step_name, family, payload, ack_opcode, timeout=5.0):
        steps.append((step_name, family, payload))
        return True

    monkeypatch.setattr(proxy, "_send_roku_step", _send_roku_step)
    monkeypatch.setattr(proxy, "start_roku_create", lambda: None)
    monkeypatch.setattr(proxy, "clear_entity_cache", lambda *args, **kwargs: None)
    monkeypatch.setattr(proxy, "request_activity_mapping", lambda act_id: True)

    result = proxy.reorder_favorites(0x66, [0x06, 0x09, 0x04])

    assert result == {"activity_id": 0x66, "fav_ids": [0x06, 0x04], "status": "success"}
    assert steps == [
        ("fav-reorder-61[act=0x66]", 0x61, bytes.fromhex("01 00 01 01 00 01 66 06 01 04 02 75")),
        ("fav-reorder-commit-65[act=0x66]", 0x65, b"\x66"),
    ]


def test_reorder_favorites_accepts_keymap_backfilled_ids_when_hub_order_is_partial(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    act_lo = 0x65
    proxy.state.activity_favorite_slots[act_lo] = [
        {"button_id": 0x01, "device_id": 0x04, "command_id": 0x1A, "source": "keymap"},
        {"button_id": 0x02, "device_id": 0x04, "command_id": 0x20, "source": "keymap"},
        {"button_id": 0x03, "device_id": 0x08, "command_id": 0x01, "source": "keymap"},
        {"button_id": 0x04, "device_id": 0x08, "command_id": 0x02, "source": "keymap"},
        {"button_id": 0x05, "device_id": 0x08, "command_id": 0x03, "source": "keymap"},
        {"button_id": 0x06, "device_id": 0x08, "command_id": 0x04, "source": "keymap"},
        {"button_id": 0x07, "device_id": 0x08, "command_id": 0x05, "source": "keymap"},
    ]

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(proxy, "request_favorites_order", lambda activity_id: [(0x01, 0x01), (0x02, 0x02), (0x03, 0x03), (0x04, 0x04)])

    steps: list[tuple[str, int, bytes]] = []

    def _send_roku_step(*, step_name, family, payload, ack_opcode, timeout=5.0):
        steps.append((step_name, family, payload))
        return True

    monkeypatch.setattr(proxy, "_send_roku_step", _send_roku_step)
    monkeypatch.setattr(proxy, "start_roku_create", lambda: None)
    monkeypatch.setattr(proxy, "clear_entity_cache", lambda *args, **kwargs: None)
    requested: list[int] = []
    monkeypatch.setattr(proxy, "request_activity_mapping", lambda activity_id: requested.append(activity_id) or True)

    result = proxy.reorder_favorites(act_lo, [0x05, 0x06, 0x01, 0x02, 0x03, 0x07, 0x04])

    assert result == {
        "activity_id": act_lo,
        "fav_ids": [0x05, 0x06, 0x01, 0x02, 0x03, 0x07, 0x04],
        "status": "success",
    }
    assert steps == [
        (
            "fav-reorder-61[act=0x65]",
            0x61,
            bytes.fromhex("01 00 01 01 00 01 65 05 01 06 02 01 03 02 04 03 05 07 06 04 07 9f"),
        ),
        ("fav-reorder-commit-65[act=0x65]", 0x65, b"\x65"),
    ]
    assert requested == [act_lo]


def test_command_to_favorite_x1_does_not_pin_ack_first_byte(monkeypatch) -> None:
    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=HUB_VERSION_X1,
    )

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: None)

    ack_calls: list[list[tuple[int, int | None]]] = []

    def _wait_for_roku_ack_any(
        candidates: list[tuple[int, int | None]],
        *,
        timeout: float = 5.0,
    ) -> tuple[int, bytes] | None:
        ack_calls.append(candidates)
        return 0x013E, b""

    monkeypatch.setattr(proxy, "wait_for_roku_ack_any", _wait_for_roku_ack_any)
    monkeypatch.setattr(proxy, "request_activity_mapping", lambda act_id: True)

    result = proxy.command_to_favorite(0x65, 0x04, 0x02, slot_id=3)

    assert result is not None
    # ack_calls[0] is the favorites-order pre-query (X1-specific); the map
    # step is at index 1 — verify it uses (0x013E, None) not a pinned byte.
    assert ack_calls[1] == [(0x013E, None), (0x0103, None)]


def test_command_to_favorite_x1s_does_not_pin_ack_first_byte(monkeypatch) -> None:
    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=HUB_VERSION_X1S,
    )

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: None)

    ack_calls: list[list[tuple[int, int | None]]] = []

    def _wait_for_roku_ack_any(
        candidates: list[tuple[int, int | None]],
        *,
        timeout: float = 5.0,
    ) -> tuple[int, bytes] | None:
        ack_calls.append(candidates)
        first_opcode, _first_byte = candidates[0]
        return first_opcode, b""

    monkeypatch.setattr(proxy, "wait_for_roku_ack_any", _wait_for_roku_ack_any)
    monkeypatch.setattr(proxy, "request_activity_mapping", lambda act_id: True)

    result = proxy.command_to_favorite(0x65, 0x04, 0x02, slot_id=3)

    assert result is not None
    assert ack_calls[0] == [(0x013E, None), (0x0103, None)]


def test_command_to_favorite_requires_all_acks(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: None)

    attempts = {"count": 0}

    def _wait_for_roku_ack_any(
        candidates: list[tuple[int, int | None]],
        *,
        timeout: float = 5.0,
    ) -> tuple[int, bytes] | None:
        attempts["count"] += 1
        if attempts["count"] == 1:
            first_opcode, first_byte = candidates[0]
            return first_opcode, bytes([first_byte if first_byte is not None else 0x00])
        return None

    monkeypatch.setattr(proxy, "wait_for_roku_ack_any", _wait_for_roku_ack_any)

    requested: list[int] = []
    monkeypatch.setattr(proxy, "request_activity_mapping", lambda act_id: requested.append(act_id) or True)

    assert proxy.command_to_favorite(0x66, 0x06, 0x04) is None
    assert requested == []


def test_command_to_button_replays_sequence(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)

    sent: list[tuple[int, bytes]] = []
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: sent.append((opcode, payload)))

    ack_calls: list[list[tuple[int, int | None]]] = []

    def _wait_for_roku_ack_any(
        candidates: list[tuple[int, int | None]],
        *,
        timeout: float = 5.0,
    ) -> tuple[int, bytes] | None:
        ack_calls.append(candidates)
        first_opcode, first_byte = candidates[0]
        return first_opcode, bytes([first_byte if first_byte is not None else 0x00])

    monkeypatch.setattr(proxy, "wait_for_roku_ack_any", _wait_for_roku_ack_any)

    requested_map: list[int] = []
    monkeypatch.setattr(proxy, "request_activity_mapping", lambda act_id: requested_map.append(act_id) or True)

    requested_buttons: list[tuple[int, bool]] = []

    def _get_buttons_for_entity(ent_id: int, fetch_if_missing: bool = True):
        requested_buttons.append((ent_id, fetch_if_missing))
        return [], False

    monkeypatch.setattr(proxy, "get_buttons_for_entity", _get_buttons_for_entity)

    cleared: list[tuple[int, bool, bool, bool]] = []
    monkeypatch.setattr(
        proxy,
        "clear_entity_cache",
        lambda ent_id, clear_buttons=False, clear_favorites=False, clear_macros=False: cleared.append(
            (ent_id, clear_buttons, clear_favorites, clear_macros)
        ),
    )

    result = proxy.command_to_button(0x65, 0xC1, 0x05, 0x02)

    assert result == {
        "activity_id": 0x65,
        "button_id": 0xC1,
        "device_id": 0x05,
        "command_id": 0x02,
        "status": "success",
    }
    assert [opcode & 0xFF for opcode, _payload in sent] == [0x3E, 0x65]
    assert sent[0][1] == bytes.fromhex(
        "01 00 01 01 00 01 65 c1 05 00 00 00 00 4e 22 02 00 00 00 00 00 00 00 00 9f"
    )
    assert sent[1][1] == b"e"
    assert ack_calls == [
        [(0x013E, 0xC1), (0x0103, None)],
        [(0x0103, None)],
    ]
    assert cleared == [(0x65, True, False, False)]
    assert requested_map == [0x65]
    assert requested_buttons == [(0x65, True)]


def test_command_to_button_with_long_press(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)

    sent: list[tuple[int, bytes]] = []
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: sent.append((opcode, payload)))

    def _wait_for_roku_ack_any(
        candidates: list[tuple[int, int | None]],
        *,
        timeout: float = 5.0,
    ) -> tuple[int, bytes] | None:
        first_opcode, first_byte = candidates[0]
        return first_opcode, bytes([first_byte if first_byte is not None else 0x00])

    monkeypatch.setattr(proxy, "wait_for_roku_ack_any", _wait_for_roku_ack_any)
    monkeypatch.setattr(proxy, "request_activity_mapping", lambda act_id: True)
    monkeypatch.setattr(proxy, "get_buttons_for_entity", lambda ent_id, fetch_if_missing=True: ([], False))
    monkeypatch.setattr(
        proxy,
        "clear_entity_cache",
        lambda ent_id, clear_buttons=False, clear_favorites=False, clear_macros=False: None,
    )

    result = proxy.command_to_button(
        0x65, 0xB0, 0x05, 0x01,
        long_press_device_id=0x05,
        long_press_command_id=0x02,
    )

    assert result == {
        "activity_id": 0x65,
        "button_id": 0xB0,
        "device_id": 0x05,
        "command_id": 0x01,
        "long_press_device_id": 0x05,
        "long_press_command_id": 0x02,
        "status": "success",
    }
    assert sent[0][1] == bytes.fromhex(
        "01 00 01 01 00 01 65 b0 05 00 00 00 00 4e 21 01 05 00 00 00 00 4e 22 02 03"
    )


def test_command_to_button_can_skip_refresh_after_write(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: None)

    def _wait_for_roku_ack_any(
        candidates: list[tuple[int, int | None]],
        *,
        timeout: float = 5.0,
    ) -> tuple[int, bytes] | None:
        first_opcode, first_byte = candidates[0]
        return first_opcode, bytes([first_byte if first_byte is not None else 0x00])

    monkeypatch.setattr(proxy, "wait_for_roku_ack_any", _wait_for_roku_ack_any)

    requested_map: list[int] = []
    monkeypatch.setattr(proxy, "request_activity_mapping", lambda act_id: requested_map.append(act_id) or True)

    requested_buttons: list[tuple[int, bool]] = []

    def _get_buttons_for_entity(ent_id: int, fetch_if_missing: bool = True):
        requested_buttons.append((ent_id, fetch_if_missing))
        return [], False

    monkeypatch.setattr(proxy, "get_buttons_for_entity", _get_buttons_for_entity)

    result = proxy.command_to_button(0x65, 0xC1, 0x05, 0x02, refresh_after_write=False)
    assert result is not None
    assert requested_map == []
    assert requested_buttons == []


def test_command_to_button_requires_all_acks(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: None)

    attempts = {"count": 0}

    def _wait_for_roku_ack_any(
        candidates: list[tuple[int, int | None]],
        *,
        timeout: float = 5.0,
    ) -> tuple[int, bytes] | None:
        attempts["count"] += 1
        if attempts["count"] == 1:
            first_opcode, first_byte = candidates[0]
            return first_opcode, bytes([first_byte if first_byte is not None else 0x00])
        return None

    monkeypatch.setattr(proxy, "wait_for_roku_ack_any", _wait_for_roku_ack_any)

    requested_map: list[int] = []
    monkeypatch.setattr(proxy, "request_activity_mapping", lambda act_id: requested_map.append(act_id) or True)

    assert proxy.command_to_button(0x65, 0xC1, 0x05, 0x02) is None
    assert requested_map == []


# ---------------------------------------------------------------------------
# _parse_activity_inputs_payloads
# ---------------------------------------------------------------------------

def _make_activity_inputs_entry(slot_id: int, cmd_id: int, name: str = "") -> bytes:
    """Build a 27-byte ACTIVITY_INPUTS entry."""
    name_bytes = name.encode("ascii", errors="replace")[:20].ljust(20, b"\x00")
    return bytes([slot_id, 0, 0, 0, 0, (cmd_id >> 8) & 0xFF, cmd_id & 0xFF]) + name_bytes


def test_parse_activity_inputs_payloads_single_page() -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    header = b"\x00" * 11
    entry3 = _make_activity_inputs_entry(3, 3, "CMD 3")
    entry4 = _make_activity_inputs_entry(4, 4, "CMD 4")
    entry6 = _make_activity_inputs_entry(6, 6, "CMD 6")
    payload = header + entry3 + entry4 + entry6

    entries = proxy._parse_activity_inputs_payloads([payload])

    assert entries == [(3, 3), (4, 4), (6, 6)]


def test_parse_activity_inputs_payloads_multi_page_spanning_entry() -> None:
    """An entry that straddles the page-1/page-2 boundary must be reassembled correctly."""
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    entry_a = _make_activity_inputs_entry(0x31, 0x31, "Input A")
    entry_b = _make_activity_inputs_entry(0x45, 0x45, "Input B")

    # Split entry_b across two pages: first 10 bytes in page 1, rest in page 2
    header1 = b"\x00" * 11
    header2 = bytes([0x01, 0x00, 0x02])

    page1 = header1 + entry_a + entry_b[:10]
    page2 = header2 + entry_b[10:] + _make_activity_inputs_entry(0x46, 0x46, "Input C")

    entries = proxy._parse_activity_inputs_payloads([page1, page2])

    assert entries == [(0x31, 0x31), (0x45, 0x45), (0x46, 0x46)]


def test_parse_activity_inputs_payloads_stops_at_null_slot() -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    header = b"\x00" * 11
    entry = _make_activity_inputs_entry(5, 5, "CMD 5")
    terminator = b"\x00" * 27

    entries = proxy._parse_activity_inputs_payloads([header + entry + terminator])

    assert entries == [(5, 5)]


# ---------------------------------------------------------------------------
# _parse_activity_inputs_x1s
# ---------------------------------------------------------------------------

def _make_x1s_wifi_entry(slot_id: int, ordinal: int, name: str = "") -> bytes:
    """Build a 48-byte X1S WiFi/custom-device ACTIVITY_INPUTS entry (sub_type=0x02)."""
    name_utf16 = name.encode("utf-16-le")[:38]
    name_padded = name_utf16.ljust(38, b"\x00")
    return bytes([0x00, slot_id, 0, 0, 0, 0, 0, 0, ordinal, 0]) + name_padded


def _make_x1s_ir_entry(slot_id: int, cmd_code: int, ordinal: int, name: str = "") -> bytes:
    """Build a 36-byte X1S IR/RF-device ACTIVITY_INPUTS entry (sub_type=0x03)."""
    name_utf16 = name.encode("utf-16-le")[:27]
    name_padded = name_utf16.ljust(27, b"\x00")
    return bytes([slot_id, 0, 0, 0, 0, (cmd_code >> 8) & 0xFF, cmd_code & 0xFF, ordinal, 0]) + name_padded


def _make_x1s_wifi_page1_header(device_id: int, num_inputs: int) -> bytes:
    """Build the 10-byte page-1 header for X1S WiFi device (sub_type=0x02)."""
    return bytes([0x01, 0x00, 0x01, 0x01, 0x00, 0x02, device_id & 0xFF, 0x01, num_inputs & 0xFF, 0x00])


def _make_x1s_ir_page1_header(device_id: int, num_inputs: int) -> bytes:
    """Build the 11-byte page-1 header for X1S IR device (sub_type=0x03)."""
    return bytes([0x01, 0x00, 0x01, 0x01, 0x00, 0x03, device_id & 0xFF, 0x01, num_inputs & 0xFF, 0x00, 0x00])


def test_parse_activity_inputs_x1s_wifi_single_page() -> None:
    """WiFi device (sub_type=02, entry_size=48): parse 4 entries from one FA47 page."""
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    header = _make_x1s_wifi_page1_header(device_id=0x09, num_inputs=4)
    e1 = _make_x1s_wifi_entry(3, 1, "TEST 3")
    e2 = _make_x1s_wifi_entry(4, 2, "TEST 4")
    e3 = _make_x1s_wifi_entry(5, 3, "TEST 5")
    e4 = _make_x1s_wifi_entry(6, 4, "TEST 6")
    payload = header + e1 + e2 + e3 + e4 + bytes(250 - 10 - 4 * 48)

    entries = proxy._parse_activity_inputs_x1s([payload])

    assert entries == [(3, 1), (4, 2), (5, 3), (6, 4)]


def test_parse_activity_inputs_x1s_wifi_stops_at_null_slot() -> None:
    """Parsing halts when slot_id is 0x00 (end-of-list sentinel)."""
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    header = _make_x1s_wifi_page1_header(device_id=0x0A, num_inputs=2)
    e1 = _make_x1s_wifi_entry(3, 1, "TEST 3")
    e2 = _make_x1s_wifi_entry(4, 2, "TEST 4")
    terminator = bytes(48)  # slot_id=0 -> stop
    payload = header + e1 + e2 + terminator

    entries = proxy._parse_activity_inputs_x1s([payload])

    assert entries == [(3, 1), (4, 2)]


def test_parse_activity_inputs_x1s_wifi_matches_real_capture() -> None:
    """Regression: captured X1S WiFi FA47 payload parses into all 4 entries."""
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    payload = bytes.fromhex(
        "01 00 01 01 00 02 09 01 04 00 00 03 00 00 00 00 00 00 01 00 "
        "54 00 45 00 53 00 54 00 20 00 33 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 "
        "00 04 00 00 00 00 00 00 02 00 54 00 45 00 53 00 54 00 20 00 34 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 "
        "00 05 00 00 00 00 00 00 03 00 54 00 45 00 53 00 54 00 20 00 35 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 "
        "00 06 00 00 00 00 00 00 04 00 54 00 45 00 53 00 54 00 20 00 36 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 "
        "00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00"
    )

    entries = proxy._parse_activity_inputs_x1s([payload])

    assert entries == [(3, 1), (4, 2), (5, 3), (6, 4)]


def test_parse_activity_inputs_x1s_ir_single_page() -> None:
    """IR device (sub_type=03, entry_size=36): parse entries correctly."""
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    header = _make_x1s_ir_page1_header(device_id=0x03, num_inputs=3)
    e1 = _make_x1s_ir_entry(0x33, 0x3310, 1, "Input aux1")
    e2 = _make_x1s_ir_entry(0x34, 0x3311, 2, "Input aux2")
    e3 = _make_x1s_ir_entry(0x35, 0x3667, 3, "Input bk")
    payload = header + e1 + e2 + e3 + bytes(250 - 11 - 3 * 36)

    entries = proxy._parse_activity_inputs_x1s([payload])

    assert entries == [(0x33, 1), (0x34, 2), (0x35, 3)]


def test_parse_activity_inputs_x1s_multi_page_uses_4byte_header() -> None:
    """Subsequent FA47 pages for X1S carry a 4-byte header (not 3-byte like X1)."""
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    header1 = _make_x1s_ir_page1_header(device_id=0x03, num_inputs=7)
    entries_p1 = b"".join(_make_x1s_ir_entry(0x30 + i, 0x3300 + i, i + 1, f"Input {i+1}") for i in range(5))
    page1 = header1 + entries_p1 + bytes(250 - 11 - 5 * 36)

    # X1S subsequent page: 4-byte header
    header2 = bytes([0x01, 0x00, 0x02, 0x00])
    entries_p2 = (
        _make_x1s_ir_entry(0x35, 0x3305, 6, "Input 6")
        + _make_x1s_ir_entry(0x36, 0x3306, 7, "Input 7")
    )
    page2 = header2 + entries_p2 + bytes(100)

    entries = proxy._parse_activity_inputs_x1s([page1, page2])

    assert len(entries) == 7
    assert entries[0] == (0x30, 1)
    assert entries[5] == (0x35, 6)
    assert entries[6] == (0x36, 7)


def test_parse_activity_inputs_x1s_unknown_subtype_falls_back_to_36() -> None:
    """An unknown sub_type defaults to entry_size=36 and logs a warning."""
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    unknown_header = bytes([0x01, 0x00, 0x01, 0x01, 0x00, 0xFF, 0x05, 0x01, 0x02, 0x00, 0x00])
    e1 = _make_x1s_ir_entry(0x10, 0x1011, 1, "Inp1")
    e2 = _make_x1s_ir_entry(0x11, 0x1012, 2, "Inp2")
    payload = unknown_header + e1 + e2

    entries = proxy._parse_activity_inputs_x1s([payload])

    assert entries == [(0x10, 1), (0x11, 2)]


# ---------------------------------------------------------------------------
# query_device_input_index
# ---------------------------------------------------------------------------

def test_query_device_input_index_returns_ordinal(monkeypatch) -> None:
    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=HUB_VERSION_X1,
    )

    header = b"\x00" * 11
    # slot_ids 3, 4, 5, 6 — cmd 5 is at ordinal 3
    entries_bytes = (
        _make_activity_inputs_entry(3, 3)
        + _make_activity_inputs_entry(4, 4)
        + _make_activity_inputs_entry(5, 5)
        + _make_activity_inputs_entry(6, 6)
    )
    payload = header + entries_bytes

    sent: list[tuple[int, bytes]] = []
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, data: sent.append((opcode, data)))

    def _fake_burst(timeout=5.0):
        proxy._activity_inputs_payloads.clear()
        proxy._activity_inputs_payloads.append(payload)
        return True

    monkeypatch.setattr(proxy, "wait_for_activity_inputs_burst", _fake_burst)

    result = proxy.query_device_input_index(0x05, 5)

    assert result == 3
    from custom_components.sofabaton_x1s.lib.protocol_const import OP_REQ_ACTIVITY_INPUTS
    assert sent == [(OP_REQ_ACTIVITY_INPUTS, bytes([0x05]))]


def test_query_device_input_index_returns_none_on_timeout(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, data: None)
    monkeypatch.setattr(proxy, "wait_for_activity_inputs_burst", lambda timeout=5.0: False)

    assert proxy.query_device_input_index(0x05, 5) is None


def test_query_device_input_index_returns_none_when_not_found(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    header = b"\x00" * 11
    payload = header + _make_activity_inputs_entry(3, 3)

    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, data: None)

    def _fake_burst(timeout=5.0):
        proxy._activity_inputs_payloads.clear()
        proxy._activity_inputs_payloads.append(payload)
        return True

    monkeypatch.setattr(proxy, "wait_for_activity_inputs_burst", _fake_burst)

    assert proxy.query_device_input_index(0x05, 99) is None


def test_query_device_input_index_x1s_returns_embedded_ordinal(monkeypatch) -> None:
    """On X1S, the ordinal is read from chunk[7] rather than computed by list position."""
    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=HUB_VERSION_X1S,
    )

    # Device 9 has inputs TEST 3 (cmd=3, ord=1), TEST 4 (cmd=4, ord=2), TEST 5 (cmd=5, ord=3)
    header = _make_x1s_wifi_page1_header(device_id=0x09, num_inputs=3)
    page1 = (
        header
        + _make_x1s_wifi_entry(3, 1, "TEST 3")
        + _make_x1s_wifi_entry(4, 2, "TEST 4")
        + _make_x1s_wifi_entry(5, 3, "TEST 5")
        + bytes(250 - 10 - 3 * 48)
    )

    sent: list[tuple[int, bytes]] = []
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, data: sent.append((opcode, data)))

    def _fake_burst(timeout=5.0):
        proxy._activity_inputs_payloads.clear()
        proxy._activity_inputs_payloads.append(page1)
        return True

    monkeypatch.setattr(proxy, "wait_for_activity_inputs_burst", _fake_burst)

    # cmd_id=4 (TEST 4) should return ordinal=2
    result = proxy.query_device_input_index(0x09, 4)
    assert result == 2

    from custom_components.sofabaton_x1s.lib.protocol_const import OP_REQ_ACTIVITY_INPUTS
    assert sent == [(OP_REQ_ACTIVITY_INPUTS, bytes([0x09]))]


def test_query_device_input_index_autodetects_x1s_payload_shape_when_hub_version_is_x1(monkeypatch) -> None:
    """X1S/X2 payload layout should win even if the stored hub_version is stale."""
    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=HUB_VERSION_X1,
    )

    header = _make_x1s_wifi_page1_header(device_id=0x09, num_inputs=4)
    page1 = (
        header
        + _make_x1s_wifi_entry(3, 1, "TEST 3")
        + _make_x1s_wifi_entry(4, 2, "TEST 4")
        + _make_x1s_wifi_entry(5, 3, "TEST 5")
        + _make_x1s_wifi_entry(6, 4, "TEST 6")
        + bytes(250 - 10 - 4 * 48)
    )
    page2 = bytes([0x01, 0x00, 0x02, 0x00]) + bytes(65)

    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, data: None)

    def _fake_burst(timeout=5.0):
        proxy._activity_inputs_payloads.clear()
        proxy._activity_inputs_payloads.extend([page1, page2])
        return True

    monkeypatch.setattr(proxy, "wait_for_activity_inputs_burst", _fake_burst)

    assert proxy.query_device_input_index(0x09, 4) == 2


def test_query_device_input_index_x1s_returns_none_when_not_found(monkeypatch) -> None:
    """X1S: return None and log warning when cmd_id is absent from the inputs list."""
    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=HUB_VERSION_X1S,
    )

    header = _make_x1s_wifi_page1_header(device_id=0x09, num_inputs=1)
    page1 = header + _make_x1s_wifi_entry(3, 1, "TEST 3") + bytes(200)

    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, data: None)

    def _fake_burst(timeout=5.0):
        proxy._activity_inputs_payloads.clear()
        proxy._activity_inputs_payloads.append(page1)
        return True

    monkeypatch.setattr(proxy, "wait_for_activity_inputs_burst", _fake_burst)

    assert proxy.query_device_input_index(0x09, 99) is None


# ---------------------------------------------------------------------------
# add_device_to_activity with input_cmd_id
# ---------------------------------------------------------------------------

def _make_add_device_to_activity_mocks(proxy, monkeypatch, *, members=(1,)):
    """Set up minimal mocks for add_device_to_activity integration tests."""
    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)

    def _request_activity_mapping(act_id: int) -> bool:
        act_lo = act_id & 0xFF
        for m in members:
            proxy.state.record_activity_member(act_lo, m)
        proxy._activity_map_complete.add(act_lo)
        return True

    monkeypatch.setattr(proxy, "request_activity_mapping", _request_activity_mapping)

    sent_cmd: list[tuple[int, bytes]] = []
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: sent_cmd.append((opcode, payload)))
    monkeypatch.setattr(proxy, "_send_family_frame", lambda family, payload: None)
    monkeypatch.setattr(
        proxy,
        "wait_for_roku_ack_any",
        lambda candidates, timeout=5.0: (
            candidates[0][0],
            bytes([candidates[0][1] if candidates[0][1] is not None else 0x00]),
        ),
    )
    return sent_cmd


def test_add_device_to_activity_with_input_cmd_id_sets_c5_byte(monkeypatch) -> None:
    """input_cmd_id resolves to ordinal 3 and that value is written to byte[8] of the 0xC5 record."""
    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=HUB_VERSION_X1,
    )

    sent_cmd = _make_add_device_to_activity_mocks(proxy, monkeypatch, members=[1])

    # Header must be exactly 9 bytes; byte[8] = row count.
    power_on_source = bytes.fromhex(
        "01 00 01 01 00 01 65 c6 01 "
        "01 c6 00 00 00 00 00 00 01 ff "
        "50 4f 57 45 52 5f 4f 4e 00 00 00 00 00 00 00 00 00 00 00 00 00 00 "
        "01 00 00 00 00 00 2d 76 00"
    )
    power_off_source = bytes.fromhex(
        "01 00 01 01 00 01 65 c7 01 "
        "01 c7 00 00 00 00 00 00 01 ff "
        "50 4f 57 45 52 5f 4f 46 46 00 00 00 00 00 00 00 00 00 00 00 00 00 00 "
        "00 00 00 00 00 00 ff ff"
    )
    monkeypatch.setattr(
        proxy,
        "wait_for_macro_payload",
        lambda act, button, timeout=5.0: (
            power_on_source if button == 0xC6 else power_off_source
        ),
    )

    # query_device_input_index mock: cmd_id 5 is ordinal 3
    monkeypatch.setattr(proxy, "query_device_input_index", lambda dev_id, cmd_id, **kw: 3)

    saved_payloads: list[bytes] = []
    monkeypatch.setattr(
        proxy,
        "_send_family_frame",
        lambda family, payload: saved_payloads.append(payload),
    )

    result = proxy.add_device_to_activity(101, 2, input_cmd_id=5)

    assert result is not None

    # POWER_ON macro (first saved payload) must contain a 0xC5 record with byte[8]=3
    on_payload = saved_payloads[0]
    c5_idx = on_payload.find(bytes([0x02, 0xC5]))
    assert c5_idx != -1, "0xC5 record for device 0x02 not found in POWER_ON payload"
    assert on_payload[c5_idx + 8] == 3, f"Expected input_index=3, got {on_payload[c5_idx + 8]}"


def test_add_device_to_activity_x1s_with_input_cmd_id_sets_input_index(monkeypatch) -> None:
    """On X1S hubs, input_cmd_id resolves via query_device_input_index and writes the ordinal to byte[8]."""
    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=HUB_VERSION_X1S,
    )

    _make_add_device_to_activity_mocks(proxy, monkeypatch, members=[1])

    power_on_source = bytes.fromhex(
        "01 00 01 01 00 01 65 c6 01 "
        "01 c6 00 00 00 00 00 00 01 ff "
        "50 4f 57 45 52 5f 4f 4e 00 00 00 00 00 00 00 00 00 00 00 00 00 00 "
        "01 00 00 00 00 00 2d 76 00"
    )
    power_off_source = bytes.fromhex(
        "01 00 01 01 00 01 65 c7 01 "
        "01 c7 00 00 00 00 00 00 01 ff "
        "50 4f 57 45 52 5f 4f 46 46 00 00 00 00 00 00 00 00 00 00 00 00 00 00 "
        "00 00 00 00 00 00 ff ff"
    )
    monkeypatch.setattr(
        proxy,
        "wait_for_macro_payload",
        lambda act, button, timeout=5.0: (
            power_on_source if button == 0xC6 else power_off_source
        ),
    )

    # cmd_id 5 is at ordinal 2 in the X1S device's input list
    monkeypatch.setattr(proxy, "query_device_input_index", lambda dev_id, cmd_id, **kw: 2)

    saved_payloads: list[bytes] = []
    monkeypatch.setattr(
        proxy,
        "_send_family_frame",
        lambda family, payload: saved_payloads.append(payload),
    )

    result = proxy.add_device_to_activity(101, 2, input_cmd_id=5)

    assert result is not None

    # POWER_ON macro must contain a 0xC5 record for device 0x02 with byte[8]=2
    on_payload = saved_payloads[0]
    c5_idx = on_payload.find(bytes([0x02, 0xC5]))
    assert c5_idx != -1, "0xC5 record for device 0x02 not found in POWER_ON payload"
    assert on_payload[c5_idx + 8] == 2, f"Expected input_index=2, got {on_payload[c5_idx + 8]}"


def test_add_device_to_activity_input_cmd_id_updates_existing_c5_record(monkeypatch) -> None:
    """When a 0xC5 record already exists in the macro, its byte[8] is updated to the new input_index."""
    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=HUB_VERSION_X1,
    )

    _make_add_device_to_activity_mocks(proxy, monkeypatch, members=[1])

    # POWER_ON source already contains a 0xC5 record for device 1 with old input_index=0x1A (26)
    power_on_source = bytes.fromhex(
        "01 00 01 01 00 01 65 c6 02 "
        "01 c6 00 00 00 00 00 00 01 ff "
        "01 c5 00 00 00 00 00 00 1a ff "
        "50 4f 57 45 52 5f 4f 4e 00 00 00 00 00 00 00 00 00 00 00 00 00 00 "
        "02 00 00 00 00 00 2d 76 00"
    )
    power_off_source = bytes.fromhex(
        "01 00 01 01 00 01 65 c7 01 "
        "01 c7 00 00 00 00 00 00 01 ff "
        "50 4f 57 45 52 5f 4f 46 46 00 00 00 00 00 00 00 00 00 00 00 00 00 00 "
        "00 00 00 00 00 00 ff ff"
    )
    monkeypatch.setattr(
        proxy,
        "wait_for_macro_payload",
        lambda act, button, timeout=5.0: (
            power_on_source if button == 0xC6 else power_off_source
        ),
    )

    # query returns ordinal 4 (new input)
    monkeypatch.setattr(proxy, "query_device_input_index", lambda dev_id, cmd_id, **kw: 4)

    saved_payloads: list[bytes] = []
    monkeypatch.setattr(
        proxy,
        "_send_family_frame",
        lambda family, payload: saved_payloads.append(payload),
    )

    result = proxy.add_device_to_activity(101, 1, input_cmd_id=5)

    assert result is not None

    on_payload = saved_payloads[0]
    c5_idx = on_payload.find(bytes([0x01, 0xC5]))
    assert c5_idx != -1
    assert on_payload[c5_idx + 8] == 4, f"Expected updated input_index=4, got {on_payload[c5_idx + 8]}"
