"""Local address selection: OS routing first, corrected or overridden when needed."""

import logging
import socket
import sys
from types import ModuleType, SimpleNamespace

import pytest

from custom_components.sofabaton_x1s.lib import network, x1_proxy
from custom_components.sofabaton_x1s.lib.network import (
    LocalAddress,
    normalize_local_address,
    route_local_ip,
    select_local_address,
)

# The address OS routing answers with unless a test says otherwise: the
# default-route interface of a multi-homed host.
OS_IP = "198.51.100.10"


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
def os_route(monkeypatch):
    """Make OS routing answer with one address for every peer."""

    def install(ip=OS_IP):
        monkeypatch.setattr(network, "_os_route_ip", lambda _peer: ip)

    install()
    return install


def test_os_routing_is_kept_on_a_single_homed_host(interface_inventory, os_route):
    interface_inventory(("192.0.2.10", 24))
    os_route("192.0.2.10")

    assert select_local_address("192.0.2.20") == LocalAddress(
        "192.0.2.10", "192.0.2.10", "os", False
    )


def test_subnet_address_wins_when_os_routing_picks_one_off_the_hub_subnet(
    interface_inventory, os_route
):
    """Source-based policy routing: the main table has no route for the LAN."""
    interface_inventory(
        (OS_IP, 32),
        ("192.0.2.10", 24),
        (("2001:db8::1", 0, 2), 64),
    )

    assert select_local_address("192.0.2.20") == LocalAddress(
        "192.0.2.10", OS_IP, "subnet", True
    )


def test_os_routing_breaks_a_tie_between_addresses_on_the_hub_subnet(
    interface_inventory, os_route
):
    """Ethernet plus Wifi, or several addresses on one interface."""
    interface_inventory(("192.0.2.10", 24), ("192.0.2.30", 24))
    os_route("192.0.2.30")

    assert select_local_address("192.0.2.20") == LocalAddress(
        "192.0.2.30", "192.0.2.30", "os", False
    )


def test_most_specific_subnet_wins_when_os_routing_is_off_subnet(
    interface_inventory, os_route
):
    interface_inventory(("192.0.2.10", 24), ("192.0.2.30", 25))

    assert route_local_ip("192.0.2.20") == "192.0.2.30"


def test_routed_hub_keeps_os_routing(interface_inventory, os_route):
    interface_inventory(("192.0.2.10", 24), (OS_IP, 24))

    assert select_local_address("203.0.113.20") == LocalAddress(OS_IP, OS_IP, "os", False)


def test_interface_lookup_failure_keeps_os_routing(interface_inventory, os_route):
    module = interface_inventory()

    def fail():
        raise OSError("interface lookup failed")

    module.get_adapters = fail

    assert select_local_address("192.0.2.20") == LocalAddress(OS_IP, OS_IP, "os", False)


def test_missing_interface_dependency_keeps_os_routing(monkeypatch, os_route):
    monkeypatch.setitem(sys.modules, "ifaddr", None)

    assert route_local_ip("192.0.2.20") == OS_IP


def test_hostname_peer_keeps_os_routing(interface_inventory, os_route):
    interface_inventory(("192.0.2.10", 24))

    assert select_local_address("hub.local") == LocalAddress(OS_IP, OS_IP, "os", False)


def test_manual_address_of_this_host_is_advertised_and_bound(interface_inventory, os_route):
    interface_inventory((OS_IP, 24), ("192.0.2.10", 24), ("10.0.0.2", 8))

    # The static-route case: an interface prefix covers the hub, the
    # user knows better than both the OS answer and the subnet match.
    assert select_local_address("10.5.0.20", "192.0.2.10") == LocalAddress(
        "192.0.2.10", OS_IP, "manual", True
    )


def test_manual_address_equal_to_os_routing_is_not_bound(interface_inventory, os_route):
    interface_inventory((OS_IP, 24))

    assert select_local_address("192.0.2.20", OS_IP) == LocalAddress(
        OS_IP, OS_IP, "manual", False
    )


def test_manual_address_of_another_host_is_advertised_only(interface_inventory, os_route):
    """Behind NAT the reachable address belongs to the host, not to us."""
    interface_inventory((OS_IP, 24))

    assert select_local_address("192.0.2.20", "192.0.2.99") == LocalAddress(
        "192.0.2.99", OS_IP, "manual", False
    )


@pytest.mark.parametrize("blank", [None, "", "   "])
def test_blank_manual_address_means_automatic(blank):
    assert normalize_local_address(blank) is None


def test_manual_address_is_normalized_and_validated():
    assert normalize_local_address(" 192.0.2.10 ") == "192.0.2.10"
    for bad in ("192.0.2", "hub.local", "2001:db8::1", "192.0.2.10/24"):
        with pytest.raises(ValueError):
            normalize_local_address(bad)


def test_os_route_lookup_closes_its_socket_and_falls_back_to_loopback(monkeypatch):
    sockets = []

    class UnreachableSocket:
        closed = False

        def connect(self, address):
            raise OSError("no route to host")

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            self.closed = True

    def open_socket(*_args):
        sockets.append(UnreachableSocket())
        return sockets[-1]

    monkeypatch.setattr(socket, "socket", open_socket)

    assert network._os_route_ip("203.0.113.20") == "127.0.0.1"
    assert sockets[0].closed


# -- the proxy ---------------------------------------------------------------


def _proxy(**kwargs):
    return x1_proxy.X1Proxy("192.0.2.20", diag_dump=False, diag_parse=False, **kwargs)


def test_proxy_uses_the_subnet_address_for_wifi_callbacks(interface_inventory, os_route):
    interface_inventory((OS_IP, 24), ("192.0.2.10", 24))

    assert _proxy().get_routed_local_ip() == "192.0.2.10"


def test_proxy_manual_address_reaches_callbacks_and_call_me(interface_inventory, os_route):
    interface_inventory((OS_IP, 24))
    proxy = _proxy(local_address="192.0.2.99")

    assert proxy.local_address == "192.0.2.99"
    assert proxy.transport.local_address == "192.0.2.99"
    assert proxy.get_routed_local_ip() == "192.0.2.99"


def test_proxy_rejects_a_malformed_manual_address():
    with pytest.raises(ValueError):
        _proxy(local_address="not-an-address")


def test_set_local_address_applies_live_and_clears_with_blank(interface_inventory, os_route):
    interface_inventory((OS_IP, 24))
    proxy = _proxy()
    restarts = []
    proxy._stop_discovery = lambda: restarts.append("stop")
    proxy._start_discovery = lambda: restarts.append("start")

    proxy.set_local_address("192.0.2.99")
    assert proxy.transport.local_address == "192.0.2.99"
    assert proxy.get_routed_local_ip() == "192.0.2.99"
    # No advertisement was running, so none is started.
    assert restarts == []

    proxy._adv_started = True
    proxy.set_local_address("")
    assert proxy.local_address is None
    assert proxy.transport.local_address is None
    assert proxy.get_routed_local_ip() == OS_IP
    assert restarts == ["stop", "start"]

    proxy.set_local_address(None)  # unchanged: no second restart
    assert restarts == ["stop", "start"]


def test_set_local_address_keeps_the_old_address_on_bad_input(interface_inventory, os_route):
    interface_inventory((OS_IP, 24))
    proxy = _proxy(local_address="192.0.2.99")

    with pytest.raises(ValueError):
        proxy.set_local_address("nope")

    assert proxy.local_address == "192.0.2.99"


def test_a_deviation_from_os_routing_is_logged_once(interface_inventory, os_route, caplog):
    interface_inventory((OS_IP, 32), ("192.0.2.10", 24))
    proxy = _proxy()

    with caplog.at_level(logging.INFO):
        for _ in range(3):
            proxy.get_routed_local_ip()

    lines = [r.getMessage() for r in caplog.records if "OS routing would use" in r.getMessage()]
    assert len(lines) == 1
    assert "192.0.2.10" in lines[0] and OS_IP in lines[0]


def test_os_routing_is_not_logged(interface_inventory, os_route, caplog):
    interface_inventory((OS_IP, 24))
    proxy = _proxy()

    with caplog.at_level(logging.INFO):
        proxy.get_routed_local_ip()

    assert not [r for r in caplog.records if "OS routing would use" in r.getMessage()]


def test_mdns_advertises_the_address_in_use(monkeypatch, interface_inventory, os_route):
    interface_inventory((OS_IP, 24), ("192.0.2.10", 24))
    advertised = []
    module = ModuleType("zeroconf")
    module.BadTypeInNameException = type("BadTypeInNameException", (Exception,), {})
    module.NonUniqueNameException = type("NonUniqueNameException", (Exception,), {})
    module.IPVersion = SimpleNamespace(V4Only=object())
    module.ServiceInfo = lambda **kwargs: SimpleNamespace(**kwargs)
    module.Zeroconf = lambda **kwargs: SimpleNamespace(register_service=advertised.append)
    monkeypatch.setitem(sys.modules, "zeroconf", module)

    _proxy()._start_mdns()
    _proxy(local_address="192.0.2.99")._start_mdns()

    assert [info.addresses for info in advertised] == [
        [socket.inet_aton("192.0.2.10")],
        [socket.inet_aton("192.0.2.99")],
    ]
