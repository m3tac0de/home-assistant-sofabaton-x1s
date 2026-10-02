"""Local source-address selection on multi-homed hosts."""

import socket
import sys
from types import ModuleType, SimpleNamespace

import pytest

from custom_components.sofabaton_x1s.lib import (
    notify_demuxer,
    transport_bridge,
    x1_proxy,
)


@pytest.fixture
def interface_inventory(monkeypatch):
    def install(*addresses):
        module = ModuleType("ifaddr")
        module.get_adapters = lambda: [
            SimpleNamespace(
                ips=[SimpleNamespace(ip=ip, network_prefix=prefix) for ip, prefix in addresses]
            )
        ]
        monkeypatch.setitem(sys.modules, "ifaddr", module)
        return module

    return install


@pytest.fixture
def default_route(monkeypatch):
    class RouteSocket:
        def __init__(self, *_args):
            self.closed = False

        def connect(self, address):
            self.peer = address

        def getsockname(self):
            return ("198.51.100.10", 12345)

        def close(self):
            self.closed = True

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            self.close()

    monkeypatch.setattr(socket, "socket", RouteSocket)


@pytest.mark.parametrize("module", [transport_bridge, x1_proxy, notify_demuxer])
def test_lan_source_is_selected_instead_of_default_interface(
    module, interface_inventory, default_route
):
    interface_inventory(
        ("198.51.100.10", 24),
        ("192.0.2.10", 24),
        (("2001:db8::1", 0, 2), 64),
    )

    assert module._route_local_ip("192.0.2.20") == "192.0.2.10"


def test_source_uses_the_most_specific_local_subnet(interface_inventory, default_route):
    interface_inventory(("192.0.2.10", 24), ("192.0.2.30", 25))

    assert transport_bridge._route_local_ip("192.0.2.20") == "192.0.2.30"


def test_routed_hub_keeps_os_source_selection(interface_inventory, default_route):
    interface_inventory(("192.0.2.10", 24), ("198.51.100.10", 24))

    assert transport_bridge._route_local_ip("203.0.113.20") == "198.51.100.10"


def test_interface_lookup_failure_keeps_os_source_selection(
    interface_inventory, default_route
):
    module = interface_inventory()

    def fail():
        raise OSError("interface lookup failed")

    module.get_adapters = fail

    assert transport_bridge._route_local_ip("192.0.2.20") == "198.51.100.10"


def test_wifi_callback_source_uses_the_lan_interface(interface_inventory, default_route):
    interface_inventory(("198.51.100.10", 24), ("192.0.2.10", 24))
    proxy = x1_proxy.X1Proxy("192.0.2.20", diag_dump=False, diag_parse=False)

    assert proxy.get_routed_local_ip() == "192.0.2.10"


def test_mdns_advertises_the_lan_interface(monkeypatch, interface_inventory, default_route):
    interface_inventory(("198.51.100.10", 24), ("192.0.2.10", 24))
    advertised = []
    module = ModuleType("zeroconf")
    module.BadTypeInNameException = type("BadTypeInNameException", (Exception,), {})
    module.NonUniqueNameException = type("NonUniqueNameException", (Exception,), {})
    module.IPVersion = SimpleNamespace(V4Only=object())
    module.ServiceInfo = lambda **kwargs: SimpleNamespace(**kwargs)
    module.Zeroconf = lambda **kwargs: SimpleNamespace(register_service=advertised.append)
    monkeypatch.setitem(sys.modules, "zeroconf", module)
    proxy = x1_proxy.X1Proxy("192.0.2.20", diag_dump=False, diag_parse=False)

    proxy._start_mdns()

    assert len(advertised) == 1
    assert advertised[0].addresses == [socket.inet_aton("192.0.2.10")]


def test_missing_interface_dependency_keeps_os_source_selection(monkeypatch, default_route):
    monkeypatch.setitem(sys.modules, "ifaddr", None)

    assert transport_bridge._route_local_ip("192.0.2.20") == "198.51.100.10"


def test_route_lookup_failure_keeps_existing_loopback_fallback(
    monkeypatch, interface_inventory
):
    interface_inventory()
    sockets = []

    class UnreachableSocket:
        closed = False

        def connect(self, address):
            raise OSError("no route to host")

        def close(self):
            self.closed = True

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            self.close()

    def open_socket(*_args):
        sock = UnreachableSocket()
        sockets.append(sock)
        return sock

    monkeypatch.setattr(socket, "socket", open_socket)

    assert transport_bridge._route_local_ip("203.0.113.20") == "127.0.0.1"
    assert sockets[0].closed
