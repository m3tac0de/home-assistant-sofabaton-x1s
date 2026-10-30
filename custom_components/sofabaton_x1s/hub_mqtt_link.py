"""Both ends of an X2's MQTT broker link, as Home Assistant sees them.

An MQTT press travels hub -> broker -> Home Assistant. Before an MQTT
deploy writes anything, two checks tell the failures apart: Home
Assistant's MQTT integration is connected (its broker host and port are
shown to the user, its credentials never), and the hub reports a broker
connection of its own (family 0x74; ``None`` when the hub does not
answer). When the hub has none, the user can point it at Home Assistant's
broker from here (family 0x73): the broker address as the HUB must reach
it (IPv4 only), the port, and a login (Home Assistant's own by default).

The broker password is sent to the hub and never stored, logged or sent
to the frontend.
"""

from __future__ import annotations

import asyncio
import ipaddress
import socket
import time
from functools import partial
from typing import Any

from homeassistant.core import HomeAssistant

from .const import HUB_VERSION_X2

#: After the hub connects to a broker we pointed it at, give its MQTT stack
#: a moment before anything uses it (the X2's stack is fragile right after
#: it connects; the duration is not benched yet, gate B11).
HUB_MQTT_SETTLE_S = 5.0
#: Broker hosts that only mean something inside Home Assistant's host: the
#: Mosquitto add-on, a container name, the host itself. The hub reaches
#: such a broker on Home Assistant's LAN address.
_HOST_LOCAL_BROKER_NAMES = frozenset({"localhost", "core-mosquitto", "mosquitto"})
_TLS_PORT = 8883


def _mqtt_entry(hass: HomeAssistant) -> Any:
    config_entries = getattr(hass, "config_entries", None)
    if config_entries is None or not hasattr(config_entries, "async_entries"):
        return None
    entries = list(config_entries.async_entries("mqtt"))
    return entries[0] if entries else None


def ha_mqtt_connected(hass: HomeAssistant) -> bool | None:
    """Whether Home Assistant's MQTT integration is connected to its broker.

    ``False`` when it is not loaded, ``None`` when this core cannot say.
    """

    components = getattr(getattr(hass, "config", None), "components", None)
    if components is None:
        return None
    if "mqtt" not in components:
        return False
    try:
        from homeassistant.components import mqtt as ha_mqtt

        checker = getattr(ha_mqtt, "is_connected", None)
        return bool(checker(hass)) if callable(checker) else None
    except Exception:  # noqa: BLE001 - an unknown answer, not a failure
        return None


def ha_mqtt_broker(hass: HomeAssistant) -> dict[str, Any] | None:
    """Home Assistant's broker as its MQTT entry names it: host, port,
    username, whether a password is set and whether TLS is on. Never the
    password itself."""

    entry = _mqtt_entry(hass)
    if entry is None:
        return None
    data = dict(getattr(entry, "data", {}) or {})
    try:
        port = int(data.get("port") or 1883)
    except (TypeError, ValueError):
        port = 1883
    return {
        "host": str(data.get("broker") or ""),
        "port": port,
        "username": str(data.get("username") or ""),
        "has_password": bool(data.get("password")),
        "tls": bool(data.get("certificate")) or port == _TLS_PORT,
    }


def _ha_mqtt_login(hass: HomeAssistant) -> tuple[str, str]:
    entry = _mqtt_entry(hass)
    data = dict(getattr(entry, "data", {}) or {}) if entry is not None else {}
    return str(data.get("username") or ""), str(data.get("password") or "")


def _resolve_ipv4(host: str) -> str:
    try:
        return socket.gethostbyname(host)
    except OSError:
        return ""


async def async_hub_broker_address(hass: HomeAssistant, hub: Any, host: str) -> str:
    """The IPv4 address the HUB must reach ``host`` (a broker host as Home
    Assistant names it) on, or ``""`` when there is none to suggest.

    An add-on, container or loopback name maps to Home Assistant's own LAN
    address (the address the hub already uses for this host); a DNS name
    is resolved now; a LAN IPv4 is used as is. The hub stores IPv4 only.
    """

    text = str(host or "").strip()
    if not text:
        return ""
    lan_address = partial(hass.async_add_executor_job, hub.local_address_in_use)
    try:
        ip = ipaddress.ip_address(text)
    except ValueError:
        ip = None
    if ip is not None:
        if ip.is_loopback:
            return await lan_address()
        return str(ip) if ip.version == 4 else ""
    if text.lower() in _HOST_LOCAL_BROKER_NAMES or "." not in text:
        return await lan_address()
    resolved = await hass.async_add_executor_job(_resolve_ipv4, text)
    if resolved and ipaddress.ip_address(resolved).is_loopback:
        return await lan_address()
    return resolved


async def async_hub_mqtt_status(hass: HomeAssistant, hub: Any) -> bool | None:
    """The hub's own broker link (X2 only): ``None`` when it cannot be asked
    or does not answer (another model, an older firmware, the app attached)."""

    if getattr(hub, "version", None) != HUB_VERSION_X2:
        return None
    try:
        return await hass.async_add_executor_job(hub._proxy.query_hub_mqtt_status)
    except Exception:  # noqa: BLE001 - an unknown answer, not a failure
        return None


async def async_broker_link_state(hass: HomeAssistant, hub: Any) -> dict[str, Any]:
    """Both ends of the link plus what the setup form prefills.

    ``ha_connected`` / ``hub_connected`` are ``True``, ``False`` or
    ``None`` (unknown). ``suggested_host`` is the broker address as the hub
    must reach it.
    """

    broker = ha_mqtt_broker(hass)
    suggested = await async_hub_broker_address(hass, hub, broker["host"]) if broker else ""
    return {
        "available": getattr(hub, "version", None) == HUB_VERSION_X2,
        "ha_connected": ha_mqtt_connected(hass),
        "ha_broker": (
            {"host": broker["host"], "port": broker["port"], "tls": broker["tls"]} if broker else None
        ),
        "hub_connected": await async_hub_mqtt_status(hass, hub),
        "suggested_host": suggested,
        "suggested_port": broker["port"] if broker else 1883,
        "ha_username": broker["username"] if broker else "",
        "ha_login_available": bool(broker and (broker["username"] or broker["has_password"])),
    }


async def async_point_hub_at_broker(
    hass: HomeAssistant,
    hub: Any,
    *,
    host: str,
    port: int,
    username: str | None = None,
    password: str | None = None,
    use_ha_login: bool = True,
) -> bool | None:
    """Point the hub at a broker; the hub's own verdict.

    ``use_ha_login`` sends Home Assistant's own MQTT login (it never leaves
    the backend otherwise); else ``username``/``password`` as given.
    ``True`` connected (after a short settle), ``False`` the hub tried and
    could not, ``None`` no verdict. ``ValueError`` for values the hub
    cannot take, before anything is sent.
    """

    if use_ha_login:
        username, password = _ha_mqtt_login(hass)
    result = await hass.async_add_executor_job(
        partial(
            hub._proxy.set_hub_mqtt_broker,
            broker_ip=str(host or "").strip(),
            broker_port=int(port),
            username=str(username or ""),
            password=str(password or ""),
        )
    )
    connected = result.get("connected") if isinstance(result, dict) else None
    if connected:
        hub._hub_mqtt_connected_at = time.monotonic()
        await asyncio.sleep(HUB_MQTT_SETTLE_S)
    return connected
