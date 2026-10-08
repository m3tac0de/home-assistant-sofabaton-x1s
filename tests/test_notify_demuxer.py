import socket
import struct
import sys

import pytest

from custom_components.sofabaton_x1s.lib import notify_demuxer
from custom_components.sofabaton_x1s.lib.network import LocalAddress
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

    from custom_components.sofabaton_x1s.lib import network, notify_demuxer

    monkeypatch.setattr(
        network,
        "_local_ipv4_interfaces",
        lambda: [
            ipaddress.IPv4Interface("198.51.100.130/26"),
            ipaddress.IPv4Interface("192.0.2.10/25"),
        ],
    )
    assert notify_demuxer._broadcast_ip("192.0.2.20") == "192.0.2.127"
    assert notify_demuxer._broadcast_ip("198.51.100.150") == "198.51.100.191"
    # No local interface on the app's subnet: the /24 assumption remains.
    assert notify_demuxer._broadcast_ip("203.0.113.9") == "203.0.113.255"


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


_DISCOVERY_REPLY = bytes.fromhex(
    "a55a17c2aabbccddee456402202211200501005465737420687562f7"
)


def _bound(ip: str) -> LocalAddress:
    """A selection that differs from OS routing, so the source is set."""
    return LocalAddress(ip, "198.51.100.10", "subnet", True)


@pytest.fixture
def discovery_proxy(monkeypatch):
    demux = NotifyDemuxer()
    monkeypatch.setattr(demux, "_ensure_running_locked", lambda: None)
    monkeypatch.setattr(
        notify_demuxer, "_select_local_address", lambda _: _bound("192.0.2.10")
    )
    monkeypatch.setattr(notify_demuxer, "_broadcast_ip", lambda _: "192.0.2.127")
    demux.register_proxy(
        "proxy", "203.0.113.20",
        {"MAC": "AA:BB:CC:DD:EE:FF", "NAME": "Test hub", "HVER": "2"},
        8102, lambda *_: None,
    )
    return demux


@pytest.mark.skipif(
    sys.platform != "linux",
    reason="per-packet IPv4 source selection uses Linux IP_PKTINFO",
)
@pytest.mark.parametrize(
    "constant_available", [True, False], ids=["named_constant", "linux_abi_fallback"]
)
def test_notify_reply_uses_each_phone_selected_source_over_real_udp(
    monkeypatch, discovery_proxy, constant_available
):
    if constant_available:
        monkeypatch.setattr(socket, "IP_PKTINFO", 8, raising=False)
    else:
        monkeypatch.delattr(socket, "IP_PKTINFO", raising=False)
    sources = {"127.0.0.3": "127.0.0.2", "127.0.0.5": "127.0.0.4"}
    monkeypatch.setattr(
        notify_demuxer,
        "_select_local_address",
        lambda peer: _bound(sources.get(peer, "127.0.0.6")),
    )
    monkeypatch.setattr(notify_demuxer, "_broadcast_ip", lambda _: "127.255.255.255")
    discovery_proxy.listen_port = 0
    with discovery_proxy._open_socket() as listener, socket.socket(
        socket.AF_INET, socket.SOCK_DGRAM
    ) as receiver:
        receiver.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        receiver.bind(("0.0.0.0", 0))
        receiver.settimeout(3.0)
        monkeypatch.setattr(
            notify_demuxer, "BROADCAST_LISTEN_PORT", receiver.getsockname()[1]
        )
        original_bind = listener.getsockname()
        for app_ip, selected_source in sources.items():
            discovery_proxy._handle_notify_me(
                listener, notify_demuxer.NOTIFY_ME_PAYLOAD, app_ip, 1234
            )
            reply, source = receiver.recvfrom(2048)
            assert source == (selected_source, original_bind[1])
            assert reply == _DISCOVERY_REPLY

        assert listener.getsockname() == original_bind
        assert original_bind[0] == "0.0.0.0"
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as peer:
            peer.bind(("127.0.0.3", 0))
            peer.sendto(notify_demuxer.NOTIFY_ME_PAYLOAD, ("127.0.0.1", original_bind[1]))
            request, source = listener.recvfrom(2048)
            assert request == notify_demuxer.NOTIFY_ME_PAYLOAD
            assert source == peer.getsockname()


class _ReplySocket:
    """Records how each discovery reply left; optionally fails sendmsg."""

    def __init__(self, sendmsg_error=None):
        self.sent = []
        self._sendmsg_error = sendmsg_error

    def sendmsg(self, buffers, ancillary, flags, destination):
        if self._sendmsg_error is not None:
            raise self._sendmsg_error
        self.sent.append(("sendmsg", buffers, ancillary, flags, destination))

    def sendto(self, data, destination):
        self.sent.append(("sendto", data, destination))


_PLAIN_REPLY = ("sendto", _DISCOVERY_REPLY, ("192.0.2.127", 8100))


def _notify(discovery_proxy, sock):
    discovery_proxy._handle_notify_me(
        sock, notify_demuxer.NOTIFY_ME_PAYLOAD, "192.0.2.20", 1234
    )


def test_notify_reply_sets_the_selected_source_on_linux(monkeypatch, discovery_proxy):
    monkeypatch.setattr(notify_demuxer.sys, "platform", "linux")
    monkeypatch.setattr(socket, "IP_PKTINFO", 8, raising=False)
    sock = _ReplySocket()

    _notify(discovery_proxy, sock)

    info = struct.pack("=I4s4s", 0, socket.inet_aton("192.0.2.10"), b"\x00" * 4)
    assert sock.sent == [
        ("sendmsg", [_DISCOVERY_REPLY], [(socket.IPPROTO_IP, 8, info)], 0, ("192.0.2.127", 8100))
    ]


def test_notify_reply_falls_back_to_a_plain_send_when_source_selection_fails(
    monkeypatch, discovery_proxy
):
    monkeypatch.setattr(notify_demuxer.sys, "platform", "linux")
    sock = _ReplySocket(sendmsg_error=OSError("source temporarily unavailable"))

    _notify(discovery_proxy, sock)

    assert sock.sent == [_PLAIN_REPLY]
    assert "proxy" in discovery_proxy._registrations


@pytest.mark.parametrize("platform", ["win32", "darwin"])
def test_notify_reply_is_a_plain_send_off_linux(monkeypatch, discovery_proxy, platform):
    monkeypatch.setattr(notify_demuxer.sys, "platform", platform)
    sock = _ReplySocket()

    _notify(discovery_proxy, sock)

    assert sock.sent == [_PLAIN_REPLY]


def test_notify_reply_survives_a_socket_without_sendmsg(monkeypatch, discovery_proxy):
    """Windows sockets have no sendmsg; the listener thread must not die."""
    monkeypatch.setattr(notify_demuxer.sys, "platform", "linux")
    sent = []

    class NoSendmsgSocket:
        def sendto(self, data, destination):
            sent.append(("sendto", data, destination))

    _notify(discovery_proxy, NoSendmsgSocket())

    assert sent == [_PLAIN_REPLY]


def test_notify_reply_is_a_plain_send_when_os_routing_is_kept(monkeypatch, discovery_proxy):
    monkeypatch.setattr(notify_demuxer.sys, "platform", "linux")
    monkeypatch.setattr(
        notify_demuxer,
        "_select_local_address",
        lambda _: LocalAddress("192.0.2.10", "192.0.2.10", "os", False),
    )
    sock = _ReplySocket()

    _notify(discovery_proxy, sock)

    assert sock.sent == [_PLAIN_REPLY]
