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
    OP_ACTIVITY_ASSIGN_FINALIZE,
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
    define_payloads = [payload for opcode, payload in sent if (opcode & 0xFF) == 0x0E]

    assert len(define_payloads) == 2

    custom_payloads = {payload[0]: payload for payload in define_payloads if payload[0] in {0x18, 0x19, 0x1A}}
    assert set(custom_payloads) == {0x18, 0x19}

    action_1 = custom_payloads[0x18][46 : 46 + custom_payloads[0x18][45]].decode("ascii")
    action_2 = custom_payloads[0x19][46 : 46 + custom_payloads[0x19][45]].decode("ascii")

    assert custom_payloads[0x18][15:45].rstrip(b"\x00") == b"Lights On"
    assert custom_payloads[0x19][15:45].rstrip(b"\x00") == b"Lights Off"
    assert action_1 == "launch/aabbccddeeff/7/Lights_On/Home_Assistant"
    assert action_2 == "launch/aabbccddeeff/7/Lights_Off/Home_Assistant"


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


def test_add_device_to_activity_replays_confirm_sequence(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)

    requested: list[int] = []

    def _request_activity_mapping(act_id: int) -> bool:
        requested.append(act_id)
        proxy._activity_map_complete.add(act_id & 0xFF)
        return True

    monkeypatch.setattr(proxy, "request_activity_mapping", _request_activity_mapping)

    proxy.state.activities[101] = {"name": "Play PlayStation 5", "active": False}
    proxy.state.activity_favorite_slots[101] = [
        {"button_id": 1, "device_id": 1, "command_id": 0x10},
        {"button_id": 2, "device_id": 2, "command_id": 0x11},
    ]

    sent: list[tuple[int, bytes]] = []
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: sent.append((opcode, payload)))

    clear_calls: list[tuple[int, bool, bool, bool]] = []

    def _clear_entity_cache(
        ent_id: int,
        clear_buttons: bool = False,
        clear_favorites: bool = False,
        clear_macros: bool = False,
    ) -> None:
        clear_calls.append((ent_id, clear_buttons, clear_favorites, clear_macros))

    monkeypatch.setattr(proxy, "clear_entity_cache", _clear_entity_cache)

    macro_saves: list[tuple[int, bytes]] = []
    monkeypatch.setattr(
        proxy,
        "_send_family_frame",
        lambda family, payload: macro_saves.append((family, payload)),
    )

    macro_payloads = {
        (101, ButtonName.POWER_ON): bytes.fromhex(
            "01 00 01 01 00 01 65 c6 "
            "01 c6 00 00 00 00 00 00 01 ff "
            "02 c6 00 00 00 00 00 00 01 ff "
            "01 c5 00 00 00 00 00 00 1a ff "
            "02 c5 00 00 00 00 00 00 00 ff "
            "01 ff ff ff ff ff ff ff ff ff "
            "02 ff ff ff ff ff ff ff ff ff "
            "50 4f 57 45 52 5f 4f 4e 00 00 00 00 00 00 00 00 00 00 00 00 00 00 "
            "02 00 00 00 00 00 2d 76 00"
        ),
        (101, ButtonName.POWER_OFF): bytes.fromhex(
            "01 00 01 01 00 01 65 c7 "
            "01 c7 00 00 00 00 00 00 01 ff "
            "02 c7 00 00 00 00 00 00 01 ff "
            "01 ff ff ff ff ff ff ff ff ff "
            "02 ff ff ff ff ff ff ff ff ff "
            "50 4f 57 45 52 5f 4f 46 46 00 00 00 00 00 00 00 00 00 00 00 00 00 00 "
            "00 00 00 00 00 00 ff ff"
        ),
    }

    monkeypatch.setattr(
        proxy,
        "wait_for_macro_payload",
        lambda act, button, timeout=5.0: macro_payloads.get((act, button)),
    )
    monkeypatch.setattr(proxy, "wait_for_activity_inputs_burst", lambda timeout=5.0: True)
    monkeypatch.setattr(
        proxy,
        "_build_macro_save_payload",
        lambda source_payload, *, device_id, button_id, allowed_device_ids=None: source_payload,
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

    assert requested == [101]
    assert result == {
        "activity_id": 101,
        "device_id": 6,
        "members_before": [1, 2],
        "members_confirmed": [1, 2, 6],
        "macros_updated": [ButtonName.POWER_ON, ButtonName.POWER_OFF],
        "status": "success",
    }
    assert sent == [
        (0x024F, bytes([0x01, 0x01])),
        (0x024F, bytes([0x02, 0x01])),
        (0x024F, bytes([0x06, 0x00])),
        (0x024D, bytes([0x65, 0xC6])),
        (0x0148, b"\x01"),
        (0x024D, bytes([0x65, 0xC6])),
        (0x024D, bytes([0x65, 0xC7])),
    ]
    assert macro_saves and all(family == 0x12 for family, _payload in macro_saves)
    assert ack_calls == [
        [(0x0103, None)],
        [(0x0103, None)],
        [(0x0103, None)],
        [(0x0112, ButtonName.POWER_ON), (0x0112, 0x01)],
        [(0x0112, ButtonName.POWER_OFF), (0x0112, 0x01)],
    ]
    assert clear_calls == [(101, False, False, True)]




def test_add_device_to_activity_uses_activity_members_from_map(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(
        proxy,
        "request_activity_mapping",
        lambda act_id: proxy._activity_map_complete.add(act_id & 0xFF) or True,
    )

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
        lambda source_payload, *, device_id, button_id, allowed_device_ids=None: source_payload,
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
        (0x024F, bytes([0x01, 0x01])),
        (0x024F, bytes([0x02, 0x01])),
        (0x024F, bytes([0x06, 0x00])),
        (0x024F, bytes([0x05, 0x00])),
    ]

def test_add_device_to_activity_requires_ack(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(
        proxy,
        "request_activity_mapping",
        lambda act_id: proxy._activity_map_complete.add(act_id & 0xFF) or True,
    )

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
        lambda source_payload, *, device_id, button_id, allowed_device_ids=None: source_payload,
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
        (0x024F, bytes([0x01, 0x01])),
        (0x024F, bytes([0x06, 0x01])),
    ]



def test_add_device_to_activity_x1s_does_not_send_finalize_stage(monkeypatch) -> None:
    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=HUB_VERSION_X1S,
    )

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(
        proxy,
        "request_activity_mapping",
        lambda act_id: proxy._activity_map_complete.add(act_id & 0xFF) or True,
    )

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
        lambda source_payload, *, device_id, button_id, allowed_device_ids=None: source_payload,
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
        (0x024F, bytes([0x01, 0x01])),
        (0x024F, bytes([0x02, 0x01])),
        (0x024F, bytes([0x06, 0x00])),
        (0x024D, bytes([0x65, 0xC6])),
        (0x0148, b"\x01"),
        (0x024D, bytes([0x65, 0xC6])),
        (0x024D, bytes([0x65, 0xC7])),
    ]
    assert len(family_sends) == 2
    assert all(family == 0x12 for family, _payload in family_sends)
    assert ack_calls[-1] == [(0x0112, ButtonName.POWER_OFF), (0x0112, 0x01)]


def test_add_device_to_activity_x1_does_not_send_finalize_stage(monkeypatch) -> None:
    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=HUB_VERSION_X1,
    )

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(
        proxy,
        "request_activity_mapping",
        lambda act_id: proxy._activity_map_complete.add(act_id & 0xFF) or True,
    )

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
        lambda source_payload, *, device_id, button_id, allowed_device_ids=None: source_payload,
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

def test_delete_device_uses_30_second_delete_ack_timeout(monkeypatch) -> None:
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
    assert observed["timeout"] == 30.0
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
        "status": "success",
    }
    assert [opcode & 0xFF for opcode, _payload in sent] == [0x3E, 0x61, 0x65]
    assert sent[0][1] == bytes.fromhex(
        "01 00 01 01 00 01 66 00 06 00 00 00 00 4e 24 04 00 00 00 00 00 00 00 00 e4"
    )
    assert sent[1][1] == bytes([0x00, 0x01, 0x01, 0x00, 0x01, 0x66, 0x01, 0x01, 0x6A])
    assert sent[2][1] == b"f"
    assert ack_calls == [
        [(0x013E, None), (0x0103, None)],
        [(0x0103, None)],
        [(0x0103, None)],
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
    assert ack_calls[0] == [(0x013E, None), (0x0103, None)]


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
