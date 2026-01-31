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
        {"MAC": "CB:38:35:39:68:AA", "NAME": "X1 HUB test-", "HVER": "1"},
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
        {"MAC": "CB:38:35:39:68:AA", "NAME": "X1 HUB test", "HVER": "2"},
        8102,
        lambda *_: None,
    )

    reg = demux._registrations["proxy1"]
    reply = demux._build_notify_reply(reg)

    assert reply == bytes.fromhex(
        "a55a1dc2cb38353968456402202211200501005831204855422074657374000000be"
    )
