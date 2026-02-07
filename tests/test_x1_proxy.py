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
    OP_REQ_COMMANDS,
)
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


def test_send_family_frame_sets_length_in_opcode(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    sent: list[tuple[int, bytes]] = []
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: sent.append((opcode, payload)))

    payload = bytes.fromhex("01 02 03")
    proxy._send_family_frame(0x0E, payload)

    assert sent == [((len(payload) << 8) | 0x0E, payload)]


def test_create_roku_device_replays_sequence(monkeypatch) -> None:
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

    result = proxy.create_roku_device(commands=["Launch One"])

    assert result == {"device_id": 0x07, "status": "success"}
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


def test_create_roku_device_uses_custom_name_brand_and_ip(monkeypatch) -> None:
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

    result = proxy.create_roku_device(device_name="Living Room Roku", ip_address="10.0.0.7", commands=["My Cmd"])

    assert result == {"device_id": 0x07, "status": "success"}
    create_payload = sent[0][1]
    finalize_payload = next(payload for opcode, payload in sent if (opcode & 0xFF) == 0x08)

    assert create_payload[32:62].rstrip(b"\x00") == b"Living Room Roku"
    assert create_payload[62:92].rstrip(b"\x00") == b"m3tac0de"
    assert create_payload[94:98] == bytes([10, 0, 0, 7])

    assert finalize_payload[32:62].rstrip(b"\x00") == b"Living Room Roku"
    assert finalize_payload[62:92].rstrip(b"\x00") == b"m3tac0de"
    assert finalize_payload[94:98] == bytes([10, 0, 0, 7])




def test_create_roku_device_x1s_uses_utf16_name_fields(monkeypatch) -> None:
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

    result = proxy.create_roku_device(device_name="Living Room Roku", ip_address="10.0.0.7", commands=["My Cmd"])

    assert result == {"device_id": 0x09, "status": "success"}
    create_payload = sent[0][1]
    define_payload = next(payload for opcode, payload in sent if (opcode & 0xFF) == 0x0E)
    finalize_payload = next(payload for opcode, payload in sent if (opcode & 0xFF) == 0x08)

    encoded_name = "Living Room Roku".encode("utf-16le")
    assert encoded_name in create_payload
    assert create_payload[7] == 0xFF
    assert bytes([10, 0, 0, 7]) in create_payload

    assert len(define_payload) >= 75
    assert define_payload[15] == 0x00
    assert define_payload[16:75].startswith("My Cmd".encode("utf-16le")[:-1])

    assert finalize_payload[7] == 0x09
    assert encoded_name in finalize_payload
    assert bytes([10, 0, 0, 7]) in finalize_payload



def test_create_roku_device_uses_custom_app_commands(monkeypatch) -> None:
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

    result = proxy.create_roku_device(commands=["Lights On", "Lights Off"])

    assert result == {"device_id": 0x07, "status": "success"}
    define_payloads = [payload for opcode, payload in sent if (opcode & 0xFF) == 0x0E]

    assert len(define_payloads) == 2

    custom_payloads = {payload[0]: payload for payload in define_payloads if payload[0] in {0x18, 0x19, 0x1A}}
    assert set(custom_payloads) == {0x18, 0x19}

    action_1 = custom_payloads[0x18][46 : 46 + custom_payloads[0x18][45]].decode("ascii")
    action_2 = custom_payloads[0x19][46 : 46 + custom_payloads[0x19][45]].decode("ascii")

    assert custom_payloads[0x18][15:45].rstrip(b"\x00") == b"Lights On"
    assert custom_payloads[0x19][15:45].rstrip(b"\x00") == b"Lights Off"
    assert action_1 == "launch/aabbccddeeff/7/Lights_On"
    assert action_2 == "launch/aabbccddeeff/7/Lights_Off"


def test_stable_hub_action_id_falls_back_to_proxy_id() -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False, proxy_id="proxy-123")

    assert proxy._stable_hub_action_id() == "proxy-123"


def test_create_roku_device_without_custom_commands_defines_no_slots(monkeypatch) -> None:
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

    result = proxy.create_roku_device()

    assert result == {"device_id": 0x07, "status": "success"}
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
