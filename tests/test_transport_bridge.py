import logging
import selectors
import socket
import threading
import time

from custom_components.sofabaton_x1s.lib import transport_bridge
from custom_components.sofabaton_x1s.lib.transport_bridge import TransportBridge


def _make_bridge() -> TransportBridge:
    return TransportBridge(
        "192.168.2.10", 8102, 8102, 8200, proxy_id="proxy", mdns_instance="proxy", mdns_txt={}
    )


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
