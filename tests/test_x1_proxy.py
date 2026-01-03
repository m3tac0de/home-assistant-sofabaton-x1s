"""Tests for x1_proxy helpers."""
import sys
import types

from custom_components.sofabaton_x1s.lib.protocol_const import ButtonName, OP_REQ_COMMANDS
from custom_components.sofabaton_x1s.lib.state_helpers import ActivityCache
from custom_components.sofabaton_x1s.lib.x1_proxy import X1Proxy


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


def test_ensure_commands_for_activity_without_favorites_does_nothing(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

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
