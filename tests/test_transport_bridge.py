import logging
import selectors
import socket
import threading
import time
from itertools import count

from custom_components.sofabaton_x1s.lib import transport_bridge
from custom_components.sofabaton_x1s.lib.network import LocalAddress
from custom_components.sofabaton_x1s.lib.transport_bridge import TransportBridge


def _bound(ip: str) -> LocalAddress:
    """A selection that differs from OS routing, so sockets bind to it."""
    return LocalAddress(ip, "198.51.100.10", "subnet", True)


def _make_bridge() -> TransportBridge:
    return TransportBridge(
        "192.168.2.10", 8102, 8102, 8200, proxy_id="proxy", mdns_instance="proxy", mdns_txt={}
    )


def test_call_me_binds_to_the_advertised_lan_source(monkeypatch):
    """The UDP request must use the same interface as its callback address."""
    bridge = TransportBridge(
        "192.0.2.20", 8102, 8102, 8200, proxy_id="proxy", mdns_instance="proxy", mdns_txt={}
    )
    sent = []

    class DatagramSocket:
        source_ip = "198.51.100.10"

        def bind(self, address):
            self.source_ip = address[0]

        def sendto(self, frame, destination):
            sent.append((frame, destination, self.source_ip))
            bridge._stop.set()

        def close(self):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            self.close()

    monkeypatch.setattr(transport_bridge.socket, "socket", lambda *_: DatagramSocket())
    monkeypatch.setattr(
        transport_bridge, "_select_local_address", lambda *_: _bound("192.0.2.10")
    )
    monkeypatch.setattr(transport_bridge.time, "sleep", lambda _: None)

    bridge._call_me_loop()

    assert len(sent) == 1
    frame, destination, source_ip = sent[0]
    assert source_ip == "192.0.2.10"
    assert destination == ("192.0.2.20", 8102)
    assert frame[:4] == bytes.fromhex("a55a0cc3")
    assert frame[4:10] == b"\x00" * 6
    assert socket.inet_ntoa(frame[10:14]) == "192.0.2.10"
    assert int.from_bytes(frame[14:16], "big") == 8200
    assert frame[-1] == sum(frame[:-1]) & 0xFF


def test_call_me_stays_unbound_when_os_routing_is_kept(monkeypatch):
    """The ordinary host: one unbound socket for every attempt, as before."""
    bridge = TransportBridge(
        "192.0.2.20", 8102, 8102, 8200, proxy_id="proxy", mdns_instance="proxy", mdns_txt={}
    )
    sockets = []
    sent = []
    clock = count(100.0, 3.0)

    class DatagramSocket:
        def bind(self, _address):
            raise AssertionError("an unchanged source must not be bound")

        def sendto(self, frame, destination):
            sent.append((self, socket.inet_ntoa(frame[10:14]), destination))
            if len(sent) == 2:
                bridge._stop.set()

        def close(self):
            pass

    def open_socket(*_args):
        sockets.append(DatagramSocket())
        return sockets[-1]

    monkeypatch.setattr(transport_bridge.socket, "socket", open_socket)
    monkeypatch.setattr(
        transport_bridge,
        "_select_local_address",
        lambda *_: LocalAddress("192.0.2.10", "192.0.2.10", "os", False),
    )
    monkeypatch.setattr(transport_bridge.time, "time", lambda: next(clock))
    monkeypatch.setattr(transport_bridge.time, "sleep", lambda _: None)

    bridge._call_me_loop()

    assert len(sockets) == 1
    assert [(ip, dest) for _sock, ip, dest in sent] == [
        ("192.0.2.10", ("192.0.2.20", 8102))
    ] * 2
    assert sent[0][0] is sent[1][0] is sockets[0]


def test_call_me_passes_the_manual_local_address_to_selection(monkeypatch):
    bridge = TransportBridge(
        "192.0.2.20", 8102, 8102, 8200, proxy_id="proxy", mdns_instance="proxy",
        mdns_txt={}, local_address="203.0.113.5",
    )
    seen = []

    class DatagramSocket:
        def sendto(self, frame, _destination):
            seen.append(socket.inet_ntoa(frame[10:14]))
            bridge._stop.set()

        def close(self):
            pass

    def select(peer, override=None):
        seen.append((peer, override))
        # Not an address of this host: advertised, never bound.
        return LocalAddress(override, "192.0.2.10", "manual", False)

    monkeypatch.setattr(transport_bridge.socket, "socket", lambda *_: DatagramSocket())
    monkeypatch.setattr(transport_bridge, "_select_local_address", select)
    monkeypatch.setattr(transport_bridge.time, "sleep", lambda _: None)

    bridge._call_me_loop()

    assert seen == [("192.0.2.20", "203.0.113.5"), "203.0.113.5"]


def test_app_session_stays_unbound_when_os_routing_is_kept(monkeypatch):
    bridge = TransportBridge(
        "203.0.113.20", 8102, 8102, 8200, proxy_id="proxy", mdns_instance="proxy", mdns_txt={}
    )
    events = []

    class StreamSocket:
        def settimeout(self, _timeout):
            pass

        def bind(self, address):
            events.append(("bind", address))

        def connect(self, address):
            events.append(("connect", address))

        def setsockopt(self, *_args):
            pass

        def close(self):
            pass

    monkeypatch.setattr(transport_bridge.socket, "socket", lambda *_: StreamSocket())
    monkeypatch.setattr(
        transport_bridge,
        "_select_local_address",
        lambda *_: LocalAddress("192.0.2.10", "192.0.2.10", "os", False),
    )
    try:
        bridge._handle_app_session(("192.0.2.20", 8100))

        assert events == [("connect", ("192.0.2.20", 8100))]
    finally:
        bridge.stop()


def test_call_me_packet_source_matches_callback_over_real_udp(monkeypatch):
    """Exercise socket binding and the actual packet, entirely on loopback."""
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as receiver:
        receiver.bind(("127.0.0.1", 0))
        receiver.settimeout(3.0)
        bridge = TransportBridge(
            "127.0.0.1", receiver.getsockname()[1], 8102, 8200,
            proxy_id="proxy", mdns_instance="proxy", mdns_txt={},
        )
        monkeypatch.setattr(
            transport_bridge, "_select_local_address", lambda *_: _bound("127.0.0.2")
        )
        worker = threading.Thread(target=bridge._call_me_loop, daemon=True)
        worker.start()
        try:
            frame, source = receiver.recvfrom(2048)
        finally:
            bridge._stop.set()
            worker.join(3.0)

    assert not worker.is_alive()
    assert source[0] == "127.0.0.2"
    assert socket.inet_ntoa(frame[10:14]) == "127.0.0.2"


def test_call_me_retries_after_a_source_bind_failure(monkeypatch):
    bridge = TransportBridge(
        "192.0.2.20", 8102, 8102, 8200, proxy_id="proxy", mdns_instance="proxy", mdns_txt={}
    )
    sockets = []
    binds = []
    sent = []
    clock = count(100.0, 3.0)

    class DatagramSocket:
        closed = False

        def bind(self, address):
            binds.append(self)
            if len(binds) == 1:
                raise OSError("address temporarily unavailable")
            self.source_ip = address[0]

        def close(self):
            self.closed = True

        def sendto(self, frame, destination):
            sent.append((socket.inet_ntoa(frame[10:14]), self.source_ip))
            bridge._stop.set()

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            self.closed = True

    def open_socket(*_args):
        sock = DatagramSocket()
        sockets.append(sock)
        return sock

    monkeypatch.setattr(transport_bridge.socket, "socket", open_socket)
    monkeypatch.setattr(
        transport_bridge, "_select_local_address", lambda *_: _bound("192.0.2.10")
    )
    monkeypatch.setattr(transport_bridge.time, "time", lambda: next(clock))
    monkeypatch.setattr(transport_bridge.time, "sleep", lambda _: None)

    bridge._call_me_loop()

    assert sent == [("192.0.2.10", "192.0.2.10")]
    assert all(sock.closed for sock in sockets)


def test_app_session_binds_to_the_phone_source_before_connecting(monkeypatch):
    """Select for the phone, which may be on a different subnet from the hub."""
    bridge = TransportBridge(
        "203.0.113.20", 8102, 8102, 8200, proxy_id="proxy", mdns_instance="proxy", mdns_txt={}
    )
    events = []
    routed_peers = []
    states = []
    bridge.on_client_state(states.append)

    class StreamSocket:
        def settimeout(self, timeout):
            events.append(("timeout", timeout))

        def bind(self, address):
            events.append(("bind", address))

        def connect(self, address):
            events.append(("connect", address))

        def setsockopt(self, *_args):
            pass

        def close(self):
            pass

    def select_source(peer, *_):
        routed_peers.append(peer)
        return _bound("192.0.2.10")

    monkeypatch.setattr(transport_bridge.socket, "socket", lambda *_: StreamSocket())
    monkeypatch.setattr(transport_bridge, "_select_local_address", select_source)

    try:
        bridge._handle_app_session(("192.0.2.20", 8100))

        assert bridge.is_client_connected
        assert states == [False, True]
        assert routed_peers == ["192.0.2.20"]
        assert events == [
            ("timeout", 5.0),
            ("bind", ("192.0.2.10", 0)),
            ("connect", ("192.0.2.20", 8100)),
            ("timeout", 0.0),
        ]
    finally:
        bridge.stop()


def test_app_session_uses_the_selected_source_over_real_tcp(monkeypatch):
    """Observe the TCP source at the phone-side listener, entirely on loopback."""
    bridge = TransportBridge(
        "203.0.113.20", 8102, 8102, 8200, proxy_id="proxy", mdns_instance="proxy", mdns_txt={}
    )
    monkeypatch.setattr(
        transport_bridge, "_select_local_address", lambda *_: _bound("127.0.0.2")
    )

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as phone:
        phone.bind(("127.0.0.1", 0))
        phone.listen(1)
        phone.settimeout(3.0)
        try:
            bridge._handle_app_session(phone.getsockname())

            assert bridge.is_client_connected
            connection, source = phone.accept()
            with connection:
                assert source[0] == "127.0.0.2"
                assert source[1] > 0
        finally:
            bridge.stop()


def test_app_session_bind_failure_closes_socket_and_restores_discovery(monkeypatch):
    bridge = TransportBridge(
        "203.0.113.20", 8102, 8102, 8200, proxy_id="proxy", mdns_instance="proxy", mdns_txt={}
    )
    registrations = {}
    connections = []
    states = []
    bridge.on_client_state(states.append)

    class FakeDemuxer:
        def register_proxy(self, **kwargs):
            registrations[kwargs["proxy_id"]] = kwargs["call_me_cb"]

        def unregister_proxy(self, proxy_id):
            registrations.pop(proxy_id, None)

    class UnavailableSourceSocket:
        closed = False

        def settimeout(self, _timeout):
            pass

        def bind(self, _address):
            raise OSError("address temporarily unavailable")

        def connect(self, address):
            connections.append(address)

        def setsockopt(self, *_args):
            pass

        def close(self):
            self.closed = True

    sock = UnavailableSourceSocket()
    monkeypatch.setattr(transport_bridge.socket, "socket", lambda *_: sock)
    monkeypatch.setattr(
        transport_bridge, "_select_local_address", lambda *_: _bound("192.0.2.10")
    )
    monkeypatch.setattr(transport_bridge, "get_notify_demuxer", lambda *_: FakeDemuxer())
    bridge.start_notify_listener()
    try:
        bridge._handle_app_session(("192.0.2.20", 8100))

        assert not bridge.is_client_connected
        assert states == [False]
        assert connections == []
        assert sock.closed
        assert bridge._notify_registered
        assert registrations == {"proxy": bridge._handle_call_me}
    finally:
        bridge.stop()


def test_connect_beacon_is_intentionally_disabled(monkeypatch):
    sent = []

    class FakeSocket:
        def __init__(self, *_args, **_kwargs):
            self.closed = False

        def setsockopt(self, *_args, **_kwargs):
            pass

        def sendto(self, data, addr):
            sent.append((data, addr))

        def close(self):
            self.closed = True

    monkeypatch.setattr(transport_bridge.socket, "socket", lambda *a, **k: FakeSocket())

    bridge = TransportBridge(
        "192.168.2.10",
        8102,
        8102,
        8200,
        proxy_id="proxy",
        mdns_instance="proxy",
        mdns_txt={"MAC": "CB:38:35:39:68:AA", "HVER": "1"},
    )
    bridge._emit_connect_ready_beacon("192.168.2.15")

    assert sent == []


def test_notify_listener_stops_when_connecting(monkeypatch):
    bridge = TransportBridge(
        "192.168.2.10", 8102, 8102, 8200, proxy_id="proxy", mdns_instance="proxy", mdns_txt={}
    )
    stopped = False
    connect_attempted = False

    def fake_stop() -> None:
        nonlocal stopped
        stopped = True

    bridge._stop_notify_listener = fake_stop  # type: ignore[assignment]

    class FakeDemuxer:
        def register_proxy(self, *args, **kwargs):
            pass

        def unregister_proxy(self, *args, **kwargs):
            pass

    monkeypatch.setattr(transport_bridge, "get_notify_demuxer", lambda *a, **k: FakeDemuxer())

    class FailingSocket:
        def __init__(self, *_args, **_kwargs):
            pass

        def settimeout(self, *_args, **_kwargs):
            pass

        def bind(self, *_args, **_kwargs):
            assert stopped

        def connect(self, *_args, **_kwargs):
            nonlocal connect_attempted
            assert stopped
            connect_attempted = True
            raise OSError("connect failed")

        def setsockopt(self, *_args, **_kwargs):
            pass

        def close(self):
            pass

    monkeypatch.setattr(transport_bridge.socket, "socket", lambda *a, **k: FailingSocket())
    monkeypatch.setattr(
        transport_bridge, "_select_local_address", lambda *_: _bound("192.0.2.10")
    )

    bridge._handle_app_session(("192.168.2.20", 1234))

    assert stopped
    assert connect_attempted


def test_install_hub_socket_configures_socket_and_notifies_state():
    bridge = TransportBridge(
        "192.168.2.10", 8102, 8102, 8200, proxy_id="proxy", mdns_instance="proxy", mdns_txt={}
    )

    class FakeSocket:
        def __init__(self):
            self.timeout = None
            self.sockopts = []
            self.closed = False

        def settimeout(self, value):
            self.timeout = value

        def setsockopt(self, *args):
            self.sockopts.append(args)

        def close(self):
            self.closed = True

        def shutdown(self, *_):
            pass

    states = []
    bridge.on_hub_state(lambda c: states.append(c))

    sock = FakeSocket()
    bridge._install_hub_socket(sock, ("192.168.2.10", 51234))

    assert bridge.is_hub_connected is True
    assert sock.timeout == 0.0
    assert states[-1] is True


def test_install_hub_socket_replaces_existing_socket():
    bridge = TransportBridge(
        "192.168.2.10", 8102, 8102, 8200, proxy_id="proxy", mdns_instance="proxy", mdns_txt={}
    )

    class FakeSocket:
        def __init__(self):
            self.closed = False

        def settimeout(self, *_):
            pass

        def setsockopt(self, *_):
            pass

        def shutdown(self, *_):
            pass

        def close(self):
            self.closed = True

    old = FakeSocket()
    bridge._hub_sock = old  # type: ignore[assignment]

    new = FakeSocket()
    bridge._install_hub_socket(new, ("192.168.2.10", 51235))

    assert old.closed is True
    assert bridge._hub_sock is new


def test_flush_buffer_retries_after_blocking():
    buf = bytearray(b"hello")

    class FakeSocket:
        def __init__(self):
            self.calls = 0

        def send(self, data):
            self.calls += 1
            if self.calls == 1:
                raise BlockingIOError()
            return min(len(data), 2)

    sock = FakeSocket()

    assert transport_bridge._flush_buffer(sock, buf, "test") is False
    assert buf == bytearray(b"hello")

    assert transport_bridge._flush_buffer(sock, buf, "test") is False
    assert buf == bytearray()


def test_flush_buffer_send_does_not_export_shared_buffer():
    """A concurrent send_local() extend() during the send syscall must not
    die with BufferError (live-hub bench 2026-07-12): socket.send(bytearray)
    holds a buffer export, so _flush_buffer must send from a copy. The fake
    socket extends the buffer re-entrantly inside send() — with the shared
    bytearray passed directly this raises BufferError."""
    buf = bytearray(b"frame-one")

    class ExtendingSocket:
        extended = False

        def send(self, data):
            # Hold a buffer export over the send payload like the real
            # socket.send C implementation does, then mutate the shared
            # buffer — simulates the cross-thread send_local() landing
            # mid-send. If `data` IS the shared bytearray, extend()
            # raises BufferError here.
            with memoryview(data):
                if not self.extended:
                    self.extended = True
                    buf.extend(b"frame-two")
            return len(data)

    # old code (sock.send(buf)) dies with BufferError inside send()
    assert transport_bridge._flush_buffer(ExtendingSocket(), buf, "test") is False
    # both the original frame and the concurrently-appended one flushed
    assert buf == bytearray()


def test_flush_buffer_clears_on_error():
    buf = bytearray(b"data")

    class FailingSocket:
        def send(self, _data):
            raise OSError("boom")

    sock = FailingSocket()

    assert transport_bridge._flush_buffer(sock, buf, "test") is True
    assert buf == bytearray()


def test_send_local_wakes_bridge_immediately(monkeypatch):
    signals = []

    class FakeWakeSocket:
        def __init__(self):
            self.closed = False

        def send(self, data):
            signals.append(data)
            return len(data)

        def close(self):
            self.closed = True

    bridge = TransportBridge(
        "192.168.2.10", 8102, 8102, 8200, proxy_id="proxy", mdns_instance="proxy", mdns_txt={}
    )
    bridge._wake_writer = FakeWakeSocket()

    bridge.send_local(b"abc")

    assert bridge._local_to_hub == bytearray(b"abc")
    assert signals == [b"\x00"]


def test_drain_wake_socket_reads_until_blocking():
    class FakeWakeReader:
        def __init__(self):
            self.calls = 0

        def recv(self, _size):
            self.calls += 1
            if self.calls == 1:
                return b"\x00\x00"
            raise BlockingIOError()

    bridge = TransportBridge(
        "192.168.2.10", 8102, 8102, 8200, proxy_id="proxy", mdns_instance="proxy", mdns_txt={}
    )

    reader = FakeWakeReader()
    bridge._drain_wake_socket(reader)

    assert reader.calls == 2


def test_bridge_loop_moves_hub_bytes_and_counts_stats():
    """End-to-end pass over the selectors-based loop (issue #279 regression):
    hub bytes reach the frame callbacks, local sends reach the hub socket,
    and the diagnostics counters track both directions."""
    bridge = _make_bridge()
    bridge._init_wake_channel()
    hub_side, peer = socket.socketpair()
    hub_side.setblocking(False)

    received: list[bytes] = []
    got_frame = threading.Event()

    def on_frame(data: bytes, _cid: int) -> None:
        received.append(bytes(data))
        got_frame.set()

    bridge.on_hub_frame(on_frame)
    bridge._hub_sock = hub_side

    thr = threading.Thread(target=bridge._bridge_forever, daemon=True)
    thr.start()
    try:
        peer.sendall(b"hello")
        assert got_frame.wait(5.0)

        bridge.send_local(b"cmd-bytes")
        peer.settimeout(5.0)
        assert peer.recv(1024) == b"cmd-bytes"

        deadline = time.monotonic() + 5.0
        while (
            bridge.get_bridge_stats()["hub_tx_bytes"] < len(b"cmd-bytes")
            and time.monotonic() < deadline
        ):
            time.sleep(0.01)
    finally:
        bridge.stop()
        thr.join(5.0)
        try:
            peer.close()
        except OSError:
            pass

    assert received[0] == b"hello"
    stats = bridge.get_bridge_stats()
    assert stats["hub_rx_bytes"] == len(b"hello")
    assert stats["hub_tx_bytes"] == len(b"cmd-bytes")
    assert stats["hub_last_rx"] is not None
    assert stats["select_errors"] == 0


def test_sync_selector_registers_modifies_and_unregisters():
    a, b = socket.socketpair()
    c, d = socket.socketpair()
    sel = selectors.DefaultSelector()
    try:
        TransportBridge._sync_selector(sel, {a: selectors.EVENT_READ})
        assert sel.get_key(a).events == selectors.EVENT_READ

        both = selectors.EVENT_READ | selectors.EVENT_WRITE
        TransportBridge._sync_selector(sel, {a: both, c: selectors.EVENT_READ})
        assert sel.get_key(a).events == both
        assert sel.get_key(c).events == selectors.EVENT_READ

        TransportBridge._sync_selector(sel, {c: selectors.EVENT_READ})
        assert a not in sel.get_map()
        assert c in sel.get_map()
    finally:
        sel.close()
        for s in (a, b, c, d):
            s.close()


def test_sync_selector_tolerates_concurrently_closed_stale_socket():
    a, b = socket.socketpair()
    sel = selectors.DefaultSelector()
    try:
        TransportBridge._sync_selector(sel, {a: selectors.EVENT_READ})
        a.close()
        # Stale registration for a closed socket must not raise.
        TransportBridge._sync_selector(sel, {})
        assert not dict(sel.get_map())
    finally:
        sel.close()
        b.close()


def test_select_failure_drops_closed_hub_socket():
    bridge = _make_bridge()
    hub_side, peer = socket.socketpair()
    hub_side.close()
    bridge._hub_sock = hub_side

    states: list[bool] = []
    bridge.on_hub_state(states.append)
    assert states == [True]

    app_to_hub = bytearray(b"pending")
    bridge._handle_select_failure(
        ValueError("filedescriptor out of range in select()"),
        hub_side,
        None,
        None,
        app_to_hub,
        bytearray(),
        bytearray(),
    )

    assert bridge._hub_sock is None
    assert states[-1] is False
    assert app_to_hub == bytearray()
    stats = bridge.get_bridge_stats()
    assert stats["select_errors"] == 1
    assert "filedescriptor out of range" in stats["last_select_error"]
    assert stats["last_select_error_at"] is not None
    peer.close()


def test_select_failure_force_drops_after_persistent_streak():
    bridge = _make_bridge()
    hub_side, peer = socket.socketpair()
    bridge._hub_sock = hub_side
    try:
        args = (OSError("boom"), hub_side, None, None, bytearray(), bytearray(), bytearray())
        for _ in range(19):
            bridge._handle_select_failure(*args)
        # A healthy socket survives isolated select failures...
        assert bridge._hub_sock is hub_side

        # ...but a persistent streak forces a reconnect so the loop can
        # never wedge silently again.
        bridge._handle_select_failure(*args)
        assert bridge._hub_sock is None
        assert bridge.get_bridge_stats()["select_errors"] == 20
    finally:
        peer.close()


def test_select_failure_recreates_broken_wake_channel():
    bridge = _make_bridge()
    bridge._init_wake_channel()
    old_reader = bridge._wake_reader
    assert old_reader is not None
    old_reader.close()

    bridge._handle_select_failure(
        OSError("boom"), None, None, old_reader, bytearray(), bytearray(), bytearray()
    )

    assert bridge._wake_reader is not None
    assert bridge._wake_reader is not old_reader
    bridge._close_wake_channel()


def test_select_failure_logging_is_throttled(caplog):
    bridge = _make_bridge()
    with caplog.at_level(logging.WARNING, logger="x1proxy.transport"):
        for _ in range(5):
            bridge._handle_select_failure(
                OSError("boom"), None, None, None, bytearray(), bytearray(), bytearray()
            )
    warnings = [r for r in caplog.records if "bridge select failed" in r.getMessage()]
    assert len(warnings) == 1


def test_get_bridge_stats_defaults():
    bridge = _make_bridge()
    stats = bridge.get_bridge_stats()
    assert stats == {
        "hub_rx_bytes": 0,
        "hub_tx_bytes": 0,
        "hub_last_rx": None,
        "hub_last_rx_age_s": None,
        "select_errors": 0,
        "last_select_error": None,
        "last_select_error_at": None,
    }


def test_stop_closes_wake_channel_safely():
    closed = []

    class FakeWakeSocket:
        def __init__(self, name):
            self.name = name

        def send(self, data):
            return len(data)

        def close(self):
            closed.append(self.name)

    bridge = TransportBridge(
        "192.168.2.10", 8102, 8102, 8200, proxy_id="proxy", mdns_instance="proxy", mdns_txt={}
    )
    bridge._wake_reader = FakeWakeSocket("reader")
    bridge._wake_writer = FakeWakeSocket("writer")

    bridge.stop()

    assert closed == ["reader", "writer"]
    assert bridge._wake_reader is None
    assert bridge._wake_writer is None


def test_stop_joins_bridge_thread_before_closing_descriptors():
    """Issue #283: stop() must not close sockets the bridge is about to register.

    Pause the real worker between capturing its sockets and syncing the
    selector, call stop() from the test thread, then release the worker.
    Before the fix the worker registered freshly closed descriptors and
    recorded a selector failure plus a wake-channel recreation during an
    intentional shutdown.
    """

    bridge = TransportBridge(
        "127.0.0.1", 8102, 0, 0, proxy_id="proxy", mdns_instance="proxy", mdns_txt={}
    )
    left, right = socket.socketpair()
    left.setblocking(False)
    bridge._hub_sock = left
    bridge._init_wake_channel()

    captured = threading.Event()
    release = threading.Event()
    original_sync = bridge._sync_selector

    def paused_sync(selector, desired):
        captured.set()
        assert release.wait(3), "worker was not released"
        return original_sync(selector, desired)

    bridge._sync_selector = paused_sync
    worker = threading.Thread(target=bridge._bridge_forever, daemon=True)
    bridge._bridge_thr = worker
    worker.start()
    try:
        assert captured.wait(3), "worker did not reach the selector sync"

        stopper = threading.Thread(target=bridge.stop, daemon=True)
        stopper.start()
        # stop() is now blocked in join(); the worker only proceeds once released.
        time.sleep(0.05)
        assert bridge._hub_sock is left, "stop() closed the hub socket before the worker exited"
        release.set()
        stopper.join(5.0)
        worker.join(5.0)

        assert not stopper.is_alive()
        assert not worker.is_alive()
        stats = bridge.get_bridge_stats()
        assert stats["select_errors"] == 0, stats
        assert stats["last_select_error"] is None
        assert bridge._hub_sock is None
        assert bridge._wake_reader is None
    finally:
        bridge._stop.set()
        release.set()
        worker.join(3.0)
        for sock in (left, right):
            try:
                sock.close()
            except OSError:
                pass


def test_stop_does_not_join_when_called_from_bridge_thread():
    bridge = TransportBridge(
        "127.0.0.1", 8102, 0, 0, proxy_id="proxy", mdns_instance="proxy", mdns_txt={}
    )
    bridge._init_wake_channel()
    finished = threading.Event()

    def run():
        bridge._bridge_thr = threading.current_thread()
        bridge.stop()
        finished.set()

    thr = threading.Thread(target=run, daemon=True)
    thr.start()
    assert finished.wait(3), "stop() blocked when invoked from the bridge thread"
    thr.join(3.0)
    assert bridge._wake_reader is None


def test_stop_fallback_after_join_timeout_does_not_count_selector_errors():
    """Issue #283, fallback path: the worker stays paused past stop()'s join cap.

    stop() then closes the descriptors anyway; when the worker finally
    syncs the selector the failure must be treated as shutdown noise and
    not recorded or handled as a bridge fault.
    """

    bridge = TransportBridge(
        "127.0.0.1", 8102, 0, 0, proxy_id="proxy", mdns_instance="proxy", mdns_txt={}
    )
    left, right = socket.socketpair()
    left.setblocking(False)
    bridge._hub_sock = left
    bridge._init_wake_channel()

    captured = threading.Event()
    release = threading.Event()
    original_sync = bridge._sync_selector

    def paused_sync(selector, desired):
        captured.set()
        assert release.wait(5), "worker was not released"
        return original_sync(selector, desired)

    bridge._sync_selector = paused_sync
    worker = threading.Thread(target=bridge._bridge_forever, daemon=True)
    bridge._bridge_thr = worker
    worker.start()
    try:
        assert captured.wait(3), "worker did not reach the selector sync"
        bridge.stop()  # blocks for the join cap, then closes descriptors
        assert bridge._hub_sock is None
        release.set()
        worker.join(5.0)
        assert not worker.is_alive()
        stats = bridge.get_bridge_stats()
        assert stats["select_errors"] == 0, stats
        assert stats["last_select_error"] is None
        assert bridge._wake_reader is None
    finally:
        bridge._stop.set()
        release.set()
        worker.join(3.0)
        for sock in (left, right):
            try:
                sock.close()
            except OSError:
                pass


def test_replacing_hub_socket_under_a_running_bridge_keeps_the_new_socket():
    """CR-L3b-1: a hub that re-dials replaces socket A with B. Closing A wakes
    the bridge thread, which reads EOF on A; it must drop A only, never the
    socket that replaced it. Repeated: the race is timing dependent."""
    for _attempt in range(5):
        bridge = _make_bridge()
        bridge._init_wake_channel()
        states: list[bool] = []
        bridge.on_hub_state(states.append)
        a_side, a_peer = socket.socketpair()
        b_side, b_peer = socket.socketpair()
        thr = threading.Thread(target=bridge._bridge_forever, daemon=True)
        try:
            bridge._install_hub_socket(a_side, ("192.168.2.10", 51234))
            thr.start()
            time.sleep(0.2)  # the bridge is selecting on A
            bridge._install_hub_socket(b_side, ("192.168.2.10", 51235))
            time.sleep(0.3)  # the bridge wakes on A's close and handles it
            assert bridge._hub_sock is b_side
            assert bridge.is_hub_connected is True
            assert states[-1] is True

            # B is really served: bytes from the hub still arrive.
            got = threading.Event()
            bridge.on_hub_frame(lambda _data, _cid, got=got: got.set())
            b_peer.sendall(b"still-here")
            assert got.wait(5.0)
        finally:
            bridge.stop()
            thr.join(5.0)
            for sock in (a_peer, b_peer):
                try:
                    sock.close()
                except OSError:
                    pass
