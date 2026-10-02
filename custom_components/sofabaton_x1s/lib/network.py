"""Local IPv4 source selection for hub callbacks and advertisements."""

from __future__ import annotations

import ipaddress
import socket


def _local_ipv4_interfaces() -> list[ipaddress.IPv4Interface]:
    """Read local IPv4 interface addresses and subnet prefixes."""
    try:
        import ifaddr

        interfaces = [
            ipaddress.IPv4Interface(f"{address.ip}/{address.network_prefix}")
            for adapter in ifaddr.get_adapters()
            for address in adapter.ips
            if isinstance(address.ip, str) and address.network_prefix
        ]
    except (ImportError, OSError, ValueError):
        return []
    return sorted(interfaces, key=lambda iface: iface.network.prefixlen, reverse=True)


def route_local_ip(peer_ip: str) -> str:
    """Prefer a directly attached IPv4 subnet, otherwise use OS routing.

    On multi-homed hosts, callbacks and advertisements must use an address
    reachable from the peer. Callers bind outgoing traffic to the selected
    address to keep the packet source and callback address consistent.
    """
    try:
        peer = ipaddress.IPv4Address(peer_ip)
    except ipaddress.AddressValueError:
        peer = None
    if peer is not None:
        for interface in _local_ipv4_interfaces():
            if peer in interface.network:
                return str(interface.ip)

    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect((peer_ip, 80))
            return sock.getsockname()[0]
    except OSError:
        return "127.0.0.1"
