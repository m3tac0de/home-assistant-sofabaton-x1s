from custom_components.sofabaton_x1s.lib import transport_bridge
from custom_components.sofabaton_x1s.lib.notify_demuxer import BROADCAST_LISTEN_PORT
from custom_components.sofabaton_x1s.lib.transport_bridge import (
    CONNECT_READY_BROADCAST,
    TransportBridge,
)


def test_connect_beacon_targets_broadcast_port(monkeypatch):
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
        "192.168.2.10", 8102, 8102, 8200, proxy_id="proxy", mdns_instance="proxy", mdns_txt={}
    )
    bridge._emit_connect_ready_beacon("192.168.2.15")

    assert sent
    payload, addr = sent[0]
    assert payload == CONNECT_READY_BROADCAST
    assert addr == ("192.168.2.255", BROADCAST_LISTEN_PORT)


def test_notify_listener_stops_when_connecting(monkeypatch):
    bridge = TransportBridge(
        "192.168.2.10", 8102, 8102, 8200, proxy_id="proxy", mdns_instance="proxy", mdns_txt={}
    )
    stopped = False

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

        def connect(self, *_args, **_kwargs):
            assert stopped
            raise OSError("connect failed")

        def setsockopt(self, *_args, **_kwargs):
            pass

        def close(self):
            pass

    monkeypatch.setattr(transport_bridge.socket, "socket", lambda *a, **k: FailingSocket())

    bridge._handle_app_session(("192.168.2.20", 1234))

    assert stopped


def test_claim_once_handles_bind_address_in_use(monkeypatch):
    bridge = TransportBridge(
        "192.168.2.10", 8102, 8102, 8200, proxy_id="proxy", mdns_instance="proxy", mdns_txt={}
    )

    class FailingSocket:
        def __init__(self, *_args, **_kwargs):
            self.closed = False

        def setsockopt(self, *_args, **_kwargs):
            pass

        def bind(self, *_args, **_kwargs):
            raise OSError("address in use")

        def close(self):
            self.closed = True

    created = []

    def fake_socket(*_args, **_kwargs):
        sock = FailingSocket()
        created.append(sock)
        return sock

    monkeypatch.setattr(transport_bridge.socket, "socket", fake_socket)

    assert bridge._claim_once() is False
    assert created
    assert all(sock.closed for sock in created)


def test_claim_once_handles_listen_address_in_use(monkeypatch):
    bridge = TransportBridge(
        "192.168.2.10", 8102, 8102, 8200, proxy_id="proxy", mdns_instance="proxy", mdns_txt={}
    )

    class BoundSocket:
        def __init__(self, *_args, **_kwargs):
            self.closed = False
            self.listen_calls = 0

        def listen(self, *_args, **_kwargs):
            self.listen_calls += 1
            raise OSError("address in use")

        def settimeout(self, *_args, **_kwargs):
            raise AssertionError("settimeout should not be called when listen fails")

        def close(self):
            self.closed = True

    sock = BoundSocket()
    monkeypatch.setattr(transport_bridge, "_bind_port_near", lambda base: (sock, base + 1))

    assert bridge._claim_once() is False
    assert sock.closed
    assert sock.listen_calls == 1


def test_bind_port_near_returns_reserved_socket(monkeypatch):
    occupied = set()

    class FakeSocket:
        def __init__(self, *_args, **_kwargs):
            self.bound_port = None

        def setsockopt(self, *_args, **_kwargs):
            pass

        def bind(self, addr):
            port = addr[1]
            if port in occupied:
                raise OSError("busy")
            occupied.add(port)
            self.bound_port = port

        def close(self):
            if self.bound_port is not None:
                occupied.discard(self.bound_port)
                self.bound_port = None

    monkeypatch.setattr(transport_bridge.socket, "socket", lambda *a, **k: FakeSocket())

    sock_one, port_one = transport_bridge._bind_port_near(8200)
    sock_two, port_two = transport_bridge._bind_port_near(8200)
    try:
        assert port_one == 8200
        assert port_two == 8201
    finally:
        sock_one.close()
        sock_two.close()


def test_bind_port_near_closes_sockets_when_range_exhausted(monkeypatch):
    closed = []

    class FailingSocket:
        def setsockopt(self, *_args, **_kwargs):
            pass

        def bind(self, *_args, **_kwargs):
            raise OSError("busy")

        def close(self):
            closed.append(True)

    monkeypatch.setattr(transport_bridge.socket, "socket", lambda *a, **k: FailingSocket())

    try:
        transport_bridge._bind_port_near(8200, tries=3)
    except OSError as exc:
        assert "No free port near 8200" in str(exc)
    else:
        raise AssertionError("expected _bind_port_near to raise when every port is busy")

    assert len(closed) == 3


def test_hub_guard_loop_retries_after_unexpected_claim_error(monkeypatch):
    bridge = TransportBridge(
        "192.168.2.10", 8102, 8102, 8200, proxy_id="proxy", mdns_instance="proxy", mdns_txt={}
    )
    attempts = 0
    sleeps = []

    def fake_claim_once():
        nonlocal attempts
        attempts += 1
        raise RuntimeError("boom")

    def fake_sleep(seconds):
        sleeps.append(seconds)
        bridge._stop.set()

    monkeypatch.setattr(bridge, "_claim_once", fake_claim_once)
    monkeypatch.setattr(transport_bridge.time, "sleep", fake_sleep)

    bridge._hub_guard_loop()

    assert attempts == 1
    assert sleeps == [0.5]


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
