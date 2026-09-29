import socket
import struct

from custom_components.sofabaton_x1s.lib.notify_demuxer import NotifyDemuxer
from custom_components.sofabaton_x1s.lib.protocol_const import OP_CALL_ME, SYNC0, SYNC1


def _build_call_me(device_id_hint: bytes, app_ip: str, app_port: int) -> bytes:
    payload = device_id_hint + socket.inet_aton(app_ip) + struct.pack(">H", app_port)
    return bytes([SYNC0, SYNC1, (OP_CALL_ME >> 8) & 0xFF, OP_CALL_ME & 0xFF]) + payload + b"\x00"


def test_call_me_routes_by_mac(monkeypatch):
    demux = NotifyDemuxer()
    demux._ensure_running_locked = lambda: None  # type: ignore[assignment]

    called = []

    def cb(src_ip: str, src_port: int, app_ip: str, app_port: int) -> None:
        called.append((src_ip, src_port, app_ip, app_port))

    mdns_txt = {"MAC": "AA:BB:CC:DD:EE:FF"}
    demux.register_proxy("proxy1", "192.168.1.10", mdns_txt, 8102, cb)

    pkt = _build_call_me(bytes.fromhex("aabbccddee45"), "10.0.0.5", 1234)
    demux._handle_call_me(pkt, "10.0.0.5", 5678)

    assert called == [("10.0.0.5", 5678, "10.0.0.5", 1234)]


def test_call_me_routes_by_x2_full_mac_hint(monkeypatch):
    demux = NotifyDemuxer()
    demux._ensure_running_locked = lambda: None  # type: ignore[assignment]

    called = []

    def cb(src_ip: str, src_port: int, app_ip: str, app_port: int) -> None:
        called.append((src_ip, src_port, app_ip, app_port))

    mdns_txt = {"MAC": "FC:01:2C:39:D3:90", "HVER": "3"}
    demux.register_proxy("proxy1", "192.168.1.10", mdns_txt, 8102, cb)

    pkt = _build_call_me(bytes.fromhex("fc012c39d390"), "10.0.0.5", 1234)
    demux._handle_call_me(pkt, "10.0.0.5", 5678)

    assert called == [("10.0.0.5", 5678, "10.0.0.5", 1234)]


def test_call_me_ignored_when_no_match(monkeypatch):
    demux = NotifyDemuxer()
    demux._ensure_running_locked = lambda: None  # type: ignore[assignment]

    called = []

    def cb(src_ip: str, src_port: int, app_ip: str, app_port: int) -> None:
        called.append((src_ip, src_port, app_ip, app_port))

    demux.register_proxy("proxy1", "192.168.1.10", {"MAC": "AA:BB:CC:DD:EE:FF"}, 8102, cb)
    demux.register_proxy("proxy2", "192.168.1.11", {"MAC": "11:22:33:44:55:66"}, 8102, cb)

    pkt = _build_call_me(b"\x00\x00\x00\x00\x00\x00", "10.0.0.5", 1234)
    demux._handle_call_me(pkt, "10.0.0.5", 5678)

    assert not called


def test_notify_reply_x1_matches_hub_format():
    demux = NotifyDemuxer()
    demux._ensure_running_locked = lambda: None  # type: ignore[assignment]
    demux.register_proxy(
        "proxy1",
        "192.168.1.10",
        {"MAC": "CB:38:35:39:68:AA", "NAME": "X1 HUB test", "HVER": "1"},
        8102,
        lambda *_: None,
    )

    reg = demux._registrations["proxy1"]
    reply = demux._build_notify_reply(reg)

    assert reply == bytes.fromhex(
        "a55a1ac2cb383539684b64012021060911000058312048554220746573742d"
    )


def test_notify_reply_x1s_matches_proxy_format():
    demux = NotifyDemuxer()
    demux._ensure_running_locked = lambda: None  # type: ignore[assignment]
    demux.register_proxy(
        "proxy1",
        "192.168.1.10",
        {"MAC": "E2:6A:44:86:1B:AA", "NAME": "Souterrain hub", "HVER": "2"},
        8102,
        lambda *_: None,
    )

    reg = demux._registrations["proxy1"]
    reply = demux._build_notify_reply(reg)

    assert reply == bytes.fromhex(
        "a55a1dc2e26a44861b45640220221120050100536f757465727261696e20687562be"
    )


def test_notify_reply_x2_matches_hub_format():
    demux = NotifyDemuxer()
    demux._ensure_running_locked = lambda: None  # type: ignore[assignment]
    demux.register_proxy(
        "proxy1",
        "192.168.1.10",
        {"MAC": "FC:01:2C:39:D3:90", "NAME": "X2 HUB", "HVER": "3", "AVER": "8"},
        8102,
        lambda *_: None,
    )

    reg = demux._registrations["proxy1"]
    reply = demux._build_notify_reply(reg)

    assert reply == bytes.fromhex(
        "a55a15c2fc012c39d39064032022112008010058322048554207"
    )


def test_call_me_for_another_hub_is_not_routed_to_the_only_proxy():
    demux = NotifyDemuxer()
    demux._ensure_running_locked = lambda: None  # type: ignore[assignment]
    called = []
    demux.register_proxy(
        "proxy1", "192.168.1.10", {"MAC": "AA:BB:CC:DD:EE:FF"}, 8102,
        lambda *args: called.append(args),
    )

    # Hub B's hint: its proxy is disabled, so only A is registered.
    demux._handle_call_me(_build_call_me(bytes.fromhex("112233445566"), "10.0.0.5", 1234), "10.0.0.5", 5678)
    assert not called

    # No hint at all: the only proxy is still the answer.
    demux._handle_call_me(_build_call_me(b"\x00" * 6, "10.0.0.5", 1234), "10.0.0.5", 5678)
    assert len(called) == 1


def test_notify_reply_goes_to_the_real_subnet_broadcast(monkeypatch):
    import ipaddress

    from custom_components.sofabaton_x1s.lib import notify_demuxer

    monkeypatch.setattr(
        notify_demuxer,
        "_local_ipv4_networks",
        lambda: [ipaddress.IPv4Network("10.0.0.0/16"), ipaddress.IPv4Network("192.168.1.128/25")],
    )
    assert notify_demuxer._broadcast_ip("10.0.7.20") == "10.0.255.255"
    assert notify_demuxer._broadcast_ip("192.168.1.200") == "192.168.1.255"
    # No local interface on the app's subnet: the /24 assumption remains.
    assert notify_demuxer._broadcast_ip("172.16.4.9") == "172.16.4.255"


def test_notify_reply_cuts_a_long_name_on_a_character_boundary():
    demux = NotifyDemuxer()
    demux._ensure_running_locked = lambda: None  # type: ignore[assignment]
    demux.register_proxy(
        "proxy1", "192.168.1.10",
        {"MAC": "AA:BB:CC:DD:EE:FF", "NAME": "Wohnzimmer Fernbedienung Küche"}, 8102,
        lambda *args: None,
    )
    reg = next(iter(demux._registrations.values()))

    reply = demux._build_notify_reply(reg)

    assert reply is not None
    name_tail = reply[:-1].split(b"Wohnzimmer", 1)[1]
    ("Wohnzimmer".encode() + name_tail).decode("utf-8")  # no split character
