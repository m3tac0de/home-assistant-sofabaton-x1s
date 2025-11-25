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
        "192.168.2.10", 8102, 9102, 8200, proxy_id="proxy", mdns_instance="proxy", mdns_txt={}
    )
    bridge._emit_connect_ready_beacon("192.168.2.15")

    assert sent
    payload, addr = sent[0]
    assert payload == CONNECT_READY_BROADCAST
    assert addr == ("192.168.2.255", BROADCAST_LISTEN_PORT)


def test_notify_listener_stops_when_connecting(monkeypatch):
    bridge = TransportBridge(
        "192.168.2.10", 8102, 9102, 8200, proxy_id="proxy", mdns_instance="proxy", mdns_txt={}
    )
    stopped = False

    def fake_stop() -> None:
        nonlocal stopped
        stopped = True

    bridge._stop_notify_listener = fake_stop  # type: ignore[assignment]

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
