"""Tests for the shared TCP HubListener.

Covers per-hub dispatch by peer IP, drop-on-unknown-peer, and the
singleton lifecycle (start/stop tied to registration count).
"""

from __future__ import annotations

import socket
import threading
import time

import pytest

from custom_components.sofabaton_x1s.lib.hub_listener import (
    HubListener,
    get_hub_listener,
    reset_hub_listener_for_tests,
)


@pytest.fixture(autouse=True)
def _reset_listener_singleton():
    reset_hub_listener_for_tests()
    yield
    reset_hub_listener_for_tests()


def _pick_free_port() -> int:
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]
    finally:
        s.close()


def _wait(predicate, timeout: float = 2.0) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return True
        time.sleep(0.01)
    return predicate()


def test_dispatches_accepted_socket_by_peer_ip():
    port = _pick_free_port()
    listener = HubListener(listen_port=port)

    received: list[tuple[socket.socket, tuple[str, int]]] = []
    event = threading.Event()

    def on_socket(sock, addr):
        received.append((sock, addr))
        event.set()

    listener.register_hub(
        proxy_id="hubA",
        real_hub_ip="127.0.0.1",
        on_socket=on_socket,
    )

    client = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        client.connect(("127.0.0.1", port))
        assert event.wait(2.0), "listener never delivered the socket"
        assert len(received) == 1
        sock, addr = received[0]
        assert addr[0] == "127.0.0.1"
        sock.close()
    finally:
        client.close()
        listener.shutdown()


def test_drops_connection_from_unregistered_peer():
    port = _pick_free_port()
    listener = HubListener(listen_port=port)

    delivered: list = []

    listener.register_hub(
        proxy_id="hubA",
        real_hub_ip="10.99.99.99",  # not loopback — won't match a 127.0.0.1 client
        on_socket=lambda s, a: delivered.append((s, a)),
    )

    client = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        client.connect(("127.0.0.1", port))
        # Give the listener a moment to accept-and-drop
        time.sleep(0.2)
        assert delivered == []
        # Server-side close should be observed: a recv returns b"" or fails
        client.settimeout(1.0)
        try:
            data = client.recv(16)
        except OSError:
            data = b""
        assert data == b""
    finally:
        client.close()
        listener.shutdown()


def test_unregister_stops_listener_when_idle():
    port = _pick_free_port()
    listener = HubListener(listen_port=port)
    listener.register_hub(
        proxy_id="hubA",
        real_hub_ip="127.0.0.1",
        on_socket=lambda s, a: None,
    )
    assert listener._thr is not None and listener._thr.is_alive()

    listener.unregister_hub("hubA")
    assert _wait(lambda: listener._thr is None or not listener._thr.is_alive())


def _connect_refused(port: float) -> bool:
    c = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    c.settimeout(1.0)
    try:
        c.connect(("127.0.0.1", port))
        return False
    except OSError:
        return True
    finally:
        c.close()


def test_bounce_refuses_during_window_then_reopens():
    port = _pick_free_port()
    listener = HubListener(listen_port=port)
    listener.register_hub(
        proxy_id="hubA",
        real_hub_ip="127.0.0.1",
        on_socket=lambda s, a: s.close(),
    )
    assert _wait(lambda: listener._thr is not None and listener._thr.is_alive())

    try:
        listener.bounce(downtime=0.5)

        # During the window the port is closed -> connections are refused.
        assert _wait(lambda: _connect_refused(port), timeout=0.4)

        # After the window the listener comes back on the same port and the
        # registration is still there.
        assert _wait(
            lambda: listener._thr is not None and listener._thr.is_alive(),
            timeout=2.0,
        )
        assert "hubA" in listener._by_proxy
        assert _wait(lambda: not _connect_refused(port), timeout=1.0)
    finally:
        listener.shutdown()


def test_bounce_noop_when_no_hubs_registered():
    port = _pick_free_port()
    listener = HubListener(listen_port=port)
    try:
        listener.bounce(downtime=0.5)
        assert listener._bouncing is False
        assert listener._thr is None
    finally:
        listener.shutdown()


def test_get_hub_listener_singleton_is_shared():
    port = _pick_free_port()
    a = get_hub_listener(port)
    b = get_hub_listener(port)
    assert a is b


def test_get_hub_listener_warns_on_port_mismatch(caplog):
    first = get_hub_listener(_pick_free_port())
    other_port = _pick_free_port()
    with caplog.at_level("WARNING", logger="x1proxy.listener"):
        second = get_hub_listener(other_port)
    assert first is second
    assert any("existing listener" in rec.getMessage() for rec in caplog.records)
