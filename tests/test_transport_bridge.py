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


def test_claim_once_handles_address_in_use(monkeypatch):
    bridge = TransportBridge(
        "192.168.2.10", 8102, 8102, 8200, proxy_id="proxy", mdns_instance="proxy", mdns_txt={}
    )

    monkeypatch.setattr(transport_bridge, "_pick_port_near", lambda base: base + 1)

    class FailingSocket:
        def __init__(self, *_args, **_kwargs):
            self.closed = False

        def setsockopt(self, *_args, **_kwargs):
            pass

        def bind(self, *_args, **_kwargs):
            raise OSError("address in use")

        def listen(self, *_args, **_kwargs):
            raise AssertionError("listen should not be called when bind fails")

        def settimeout(self, *_args, **_kwargs):
            raise AssertionError("settimeout should not be called when bind fails")

        def close(self):
            self.closed = True

    sock = FailingSocket()
    monkeypatch.setattr(transport_bridge.socket, "socket", lambda *a, **k: sock)

    assert bridge._claim_once() is False
    assert sock.closed


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
