"""Local IPv4 source selection for hub callbacks and advertisements."""

from __future__ import annotations

import ipaddress
import socket
from dataclasses import dataclass
from typing import Optional

SOURCE_MANUAL = "manual"
SOURCE_OS = "os"
SOURCE_SUBNET = "subnet"


@dataclass(frozen=True)
class LocalAddress:
    """The local IPv4 address chosen toward one peer.

    ``ip`` is what gets advertised; ``os_ip`` is what OS routing alone
    would have used. ``bind`` is set only when the two differ and ``ip``
    is one of this host's addresses: outgoing sockets then bind to it so
    the packet source matches the advertisement. Everywhere else sockets
    stay unbound and the OS keeps choosing, as it always did.
    """

    ip: str
    os_ip: str
    source: str
    bind: bool


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


def _os_route_ip(peer_ip: str) -> str:
    """The source address OS routing picks toward ``peer_ip``."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect((peer_ip, 80))
            return sock.getsockname()[0]
    except OSError:
        return "127.0.0.1"


def normalize_local_address(value: object) -> Optional[str]:
    """A manual local address as dotted-decimal IPv4; blank means automatic."""
    text = str(value or "").strip()
    if not text:
        return None
    try:
        return str(ipaddress.IPv4Address(text))
    except ipaddress.AddressValueError as err:
        raise ValueError(f"local address must be a dotted-decimal IPv4 address, got {value!r}") from err


def is_local_ipv4(address: str) -> bool:
    """Whether ``address`` is assigned to one of this host's interfaces."""
    return any(str(interface.ip) == address for interface in _local_ipv4_interfaces())


def select_local_address(peer_ip: str, override: Optional[str] = None) -> LocalAddress:
    """Choose the local IPv4 address to use toward ``peer_ip``.

    1. A manual ``override`` wins.
    2. Otherwise OS routing decides, and its answer stands whenever it is
       on the peer's subnet or no local address is.
    3. Only when OS routing picks an address off the peer's subnet while
       another local address is on it does that address win (most specific
       subnet first). That is the multi-homed host whose main routing table
       has no route for the peer's LAN, e.g. source-based policy routing.
    """
    os_ip = _os_route_ip(peer_ip)
    interfaces = _local_ipv4_interfaces()

    if override:
        local = any(str(interface.ip) == override for interface in interfaces)
        return LocalAddress(override, os_ip, SOURCE_MANUAL, local and override != os_ip)

    try:
        peer = ipaddress.IPv4Address(peer_ip)
    except ipaddress.AddressValueError:
        return LocalAddress(os_ip, os_ip, SOURCE_OS, False)
    on_subnet = [str(interface.ip) for interface in interfaces if peer in interface.network]
    if not on_subnet or os_ip in on_subnet:
        return LocalAddress(os_ip, os_ip, SOURCE_OS, False)
    return LocalAddress(on_subnet[0], os_ip, SOURCE_SUBNET, True)


def route_local_ip(peer_ip: str, override: Optional[str] = None) -> str:
    """The local IPv4 address to advertise toward ``peer_ip``."""
    return select_local_address(peer_ip, override).ip
