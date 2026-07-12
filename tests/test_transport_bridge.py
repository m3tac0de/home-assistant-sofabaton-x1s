from custom_components.sofabaton_x1s.lib import transport_bridge
from custom_components.sofabaton_x1s.lib.transport_bridge import TransportBridge


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
