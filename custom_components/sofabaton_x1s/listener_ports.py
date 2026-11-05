"""The listener ports every hub shares.

Hubs dial back to one TCP port, the Sofabaton app finds Home Assistant
on one UDP port, and Wifi Commands arrive on one HTTP port. The three
are integration-wide: stored in every hub entry's options, and changed
from the entry's cogwheel (options flow) or the control panel's Settings
tab. Both write through :func:`async_apply_listener_ports`.
"""

from __future__ import annotations

import logging
import os
import socket
from typing import Any, Dict, Iterable, Mapping, Optional

from homeassistant.core import HomeAssistant

from .const import (
    CONF_ROKU_LISTEN_PORT,
    DEFAULT_HUB_LISTEN_BASE,
    DEFAULT_PROXY_UDP_PORT,
    DEFAULT_ROKU_LISTEN_PORT,
    DOMAIN,
)

_LOGGER = logging.getLogger(__name__)

# (option key, UDP?, where a free stand-in is looked for, the config
# flow's "in use" error, its placeholder prefix). The hub range is the
# one the official app listens in.
PORT_FIELDS = (
    ("hub_listen_base", False, range(8201, 8264), "hub_port_in_use", "hub"),
    ("proxy_udp_port", True, range(8103, 8121), "app_port_in_use", "app"),
    (CONF_ROKU_LISTEN_PORT, False, range(8061, 8081), "wifi_port_in_use", "wifi"),
)

PORT_KEYS = tuple(key for key, *_ in PORT_FIELDS)

DEFAULT_LISTENER_PORTS: Dict[str, int] = {
    "hub_listen_base": DEFAULT_HUB_LISTEN_BASE,
    "proxy_udp_port": DEFAULT_PROXY_UDP_PORT,
    CONF_ROKU_LISTEN_PORT: DEFAULT_ROKU_LISTEN_PORT,
}


def port_is_free(port: int, *, udp: bool) -> bool:
    """Whether this host could open the port right now.

    Stricter than the listeners themselves (they share with SO_REUSEPORT,
    and UDP with SO_REUSEADDR), so a program that shares the port is
    found as well. TCP keeps SO_REUSEADDR off Windows only: elsewhere it
    just lets a closed listener's lingering connections pass, but on
    Windows it would bind over a live listener.
    """

    kind = socket.SOCK_DGRAM if udp else socket.SOCK_STREAM
    with socket.socket(socket.AF_INET, kind) as sock:
        if not udp and os.name != "nt":
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            sock.bind(("0.0.0.0", port))
        except OSError:
            return False
    return True


def ports_in_use(
    ports: Mapping[str, int], keys: Optional[Iterable[str]] = None
) -> Dict[str, Optional[int]]:
    """{option key: a free stand-in, or None} for every port in use.

    ``keys`` limits the check to those ports: a port one of our own
    listeners holds is always "in use", so a change checks only the
    ports it moves.
    """

    wanted = set(PORT_KEYS if keys is None else keys)
    busy: Dict[str, Optional[int]] = {}
    tcp_taken = {ports[key] for key, udp, *_ in PORT_FIELDS if not udp}
    for key, udp, stand_ins, *_ in PORT_FIELDS:
        if key not in wanted or port_is_free(ports[key], udp=udp):
            continue
        stand_in = next(
            (
                port
                for port in stand_ins
                if (udp or port not in tcp_taken) and port_is_free(port, udp=udp)
            ),
            None,
        )
        if stand_in is not None and not udp:
            tcp_taken.add(stand_in)
        busy[key] = stand_in
    return busy


def configured_listener_ports(hass: HomeAssistant) -> Dict[str, int]:
    """The shared ports as stored: the first hub entry's, else the defaults.

    Every entry holds the same set (both writers update all of them).
    """

    entries = hass.config_entries.async_entries(DOMAIN)
    options: Mapping[str, Any] = entries[0].options if entries else {}
    return {key: int(options.get(key, DEFAULT_LISTENER_PORTS[key])) for key in PORT_KEYS}


async def async_apply_listener_ports(hass: HomeAssistant, ports: Mapping[str, int]) -> None:
    """Store the shared ports in every hub entry and move the listeners.

    The hub and app listeners are process-wide and keep their port while
    any hub is registered, so restarting hubs one by one would leave them
    on the old ports until Home Assistant restarts. Every hub whose
    proxy listens elsewhere stops first; the first one to start again
    finds the listeners idle and moves them, the rest join it. The Wifi
    listener moves on its own.
    """

    from . import runtime

    shared = {key: int(ports[key]) for key in PORT_KEYS}
    wanted = (str(shared["proxy_udp_port"]), str(shared["hub_listen_base"]))
    domain_data = getattr(hass, "data", {}).get(DOMAIN, {})
    moving = [hub for hub in runtime._get_hubs(domain_data) if hub.listener_ports != wanted]
    for hub in moving:
        await hub.async_stop()
    try:
        for hub in moving:
            await hub.async_apply_new_settings(
                host=hub.host,
                port=hub.port,
                proxy_udp_port=shared["proxy_udp_port"],
                hub_listen_base=shared["hub_listen_base"],
            )
    finally:
        # The entries' update listeners run after this: the hubs above
        # already hold these ports, so for them it is a no-op.
        for entry in hass.config_entries.async_entries(DOMAIN):
            merged = {**entry.options, **shared}
            if merged != entry.options:
                hass.config_entries.async_update_entry(entry, options=merged)
    # Set here too, so the caller's answer already holds: the listener
    # follows at once (no-op when it is on this port already).
    roku_listener = domain_data.get("roku_listener")
    if roku_listener is not None:
        await roku_listener.async_set_listen_port(shared[CONF_ROKU_LISTEN_PORT])
    _LOGGER.info(
        "Listener ports set: hub TCP %s, app UDP %s, Wifi HTTP %s (%d hub(s) restarted)",
        shared["hub_listen_base"],
        shared["proxy_udp_port"],
        shared[CONF_ROKU_LISTEN_PORT],
        len(moving),
    )
