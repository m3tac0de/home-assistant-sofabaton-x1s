"""Find an X2's own Matter device in Home Assistant's Matter integration.

An X2 linked to Matter joins as one device with 8 Generic Switch buttons,
and Home Assistant's Matter integration gives each button an event entity
(docs/internal/matter-events-plan.md). This module finds that device and
its buttons through the device and entity registries only, never the
Matter integration's code, so nothing here breaks when Matter is absent.

Nothing in the registry names the hub: the Matter serial number is not
the hub's MAC. The device's identifier ``deviceid_<fabric>-<node>-
MatterNodeDevice`` is, however, the name of the hub's Matter operational
record, ``<fabric>-<node>._matter._tcp.local.``. That record's host name,
IPv4 address and EUI-64 IPv6 addresses carry the hub's MAC and address
(bench 2026-11-08), which ties the Matter device to one of our hubs.
"""

from __future__ import annotations

import ipaddress
import re
from dataclasses import dataclass, field
from typing import Any, Iterable

MATTER_DOMAIN = "matter"
MATTER_SERVICE_TYPE = "_matter._tcp.local."
# How Home Assistant's Matter integration names the X2 (manufacturer and
# model from the hub's Basic Information cluster), compared lowercased.
SOFABATON_MATTER_MANUFACTURER = "sofabaton"
SOFABATON_MATTER_MODEL = "sofabatonx2"
MATTER_RECORD_TIMEOUT_MS = 3000

_DEVICE_IDENTIFIER = re.compile(r"^deviceid_([0-9A-Fa-f]{16}-[0-9A-Fa-f]{16})-MatterNodeDevice$")
_BUTTON_UNIQUE_ID = re.compile(r"-MatterNodeDevice-(\d+)-GenericSwitch-")
_BUTTON_NAME = re.compile(r"\((\d+)\)\s*$")


@dataclass(frozen=True)
class MatterButton:
    """One Matter button: its number on the hub (1-8) and HA's event entity."""

    number: int
    entity_id: str
    event_types: tuple[str, ...] = ()


@dataclass(frozen=True)
class MatterHubDevice:
    """A SofaBaton Matter device in HA's device registry."""

    device_id: str
    name: str
    instance: str | None
    buttons: dict[int, MatterButton] = field(default_factory=dict)


def matter_instance_name(identifiers: Iterable[Any]) -> str | None:
    """The operational record name (``<fabric>-<node>``) in a Matter
    device's registry identifiers, or None."""

    for identifier in identifiers or ():
        try:
            domain, value = identifier
        except (TypeError, ValueError):
            continue
        if domain != MATTER_DOMAIN:
            continue
        match = _DEVICE_IDENTIFIER.match(str(value))
        if match:
            return match.group(1).upper()
    return None


def is_sofabaton_matter_device(device: Any) -> bool:
    """A registry device that HA's Matter integration made for an X2."""

    identifiers = getattr(device, "identifiers", None) or ()
    if not any(isinstance(item, tuple) and item and item[0] == MATTER_DOMAIN for item in identifiers):
        return False
    manufacturer = str(getattr(device, "manufacturer", "") or "").strip().lower()
    model = str(getattr(device, "model", "") or "").strip().lower()
    return manufacturer == SOFABATON_MATTER_MANUFACTURER and model == SOFABATON_MATTER_MODEL


def button_number(unique_id: str | None, original_name: str | None) -> int | None:
    """The hub button an event entity stands for: the Matter endpoint in
    its unique id (one endpoint per button), else "(N)" in its name."""

    for pattern, text in ((_BUTTON_UNIQUE_ID, unique_id), (_BUTTON_NAME, original_name)):
        match = pattern.search(str(text or ""))
        if match:
            number = int(match.group(1))
            if 1 <= number <= 8:
                return number
    return None


def _event_types(entity: Any, state: Any) -> tuple[str, ...]:
    for source in (getattr(entity, "capabilities", None), getattr(state, "attributes", None)):
        if isinstance(source, dict) and isinstance(source.get("event_types"), (list, tuple)):
            return tuple(str(item) for item in source["event_types"])
    return ()


def find_sofabaton_matter_devices(hass: Any) -> list[MatterHubDevice]:
    """Every X2 Matter device in HA's registries, with its enabled button
    event entities. Empty when the Matter integration never made one."""

    from homeassistant.helpers import device_registry as dr
    from homeassistant.helpers import entity_registry as er

    devices = dr.async_get(hass)
    entities = er.async_get(hass)
    if devices is None or entities is None:
        return []
    found: list[MatterHubDevice] = []
    for device in list(devices.devices.values()):
        if not is_sofabaton_matter_device(device) or getattr(device, "disabled_by", None):
            continue
        buttons: dict[int, MatterButton] = {}
        for entity in er.async_entries_for_device(entities, device.id):
            if entity.platform != MATTER_DOMAIN or not entity.entity_id.startswith("event."):
                continue
            if getattr(entity, "disabled_by", None):
                continue
            number = button_number(entity.unique_id, getattr(entity, "original_name", None))
            if number is None or number in buttons:
                continue
            buttons[number] = MatterButton(
                number=number,
                entity_id=entity.entity_id,
                event_types=_event_types(entity, hass.states.get(entity.entity_id)),
            )
        found.append(
            MatterHubDevice(
                device_id=device.id,
                name=str(getattr(device, "name_by_user", None) or getattr(device, "name", None) or ""),
                instance=matter_instance_name(device.identifiers),
                buttons=dict(sorted(buttons.items())),
            )
        )
    return found


def mac_from_eui64(address: str) -> str | None:
    """The MAC an EUI-64 IPv6 interface id was built from (``ff:fe`` in the
    middle, the universal/local bit flipped), as 12 lowercase hex digits."""

    try:
        parsed = ipaddress.IPv6Address(str(address).split("%", 1)[0])
    except ValueError:
        return None
    iid = parsed.packed[8:]
    if iid[3:5] != b"\xff\xfe":
        return None
    mac = bytes([iid[0] ^ 0x02]) + iid[1:3] + iid[5:8]
    return mac.hex()


def _hex_only(text: str) -> str:
    return re.sub(r"[^0-9a-f]", "", str(text or "").lower())


def record_matches_hub(record: dict[str, Any], *, mac: str | None, host: str | None) -> bool:
    """Whether a hub's Matter record belongs to the hub with this MAC (12
    hex digits, any separators) or address.

    Checked in order: a MAC decoded from an EUI-64 IPv6 address, the MAC in
    the host name (``FC012C39D390.local``, or the last 6 digits as in
    ``X1-HUB-39d390.local``), then the IPv4 address."""

    hub_mac = _hex_only(mac or "")
    addresses = [str(item) for item in record.get("addresses") or ()]
    if len(hub_mac) == 12:
        if any(mac_from_eui64(address) == hub_mac for address in addresses if ":" in address):
            return True
        server = str(record.get("server") or "").split(".", 1)[0].lower()
        labels = re.split(r"[^0-9a-z]+", server)
        if hub_mac in labels or any(len(label) == 6 and hub_mac.endswith(label) for label in labels):
            return True
    if host and str(host).strip() in addresses:
        return True
    return False


async def async_read_matter_record(hass: Any, instance: str) -> dict[str, Any] | None:
    """Resolve ``<instance>._matter._tcp.local.`` through HA's shared
    zeroconf: ``{"server", "addresses"}``, or None when nothing answers."""

    from homeassistant.components.zeroconf import async_get_instance
    from zeroconf.asyncio import AsyncServiceInfo

    zc = await async_get_instance(hass)
    if zc is None:
        return None
    info = AsyncServiceInfo(MATTER_SERVICE_TYPE, f"{instance}.{MATTER_SERVICE_TYPE}")
    if not await info.async_request(zc, MATTER_RECORD_TIMEOUT_MS):
        return None
    return {"server": info.server or "", "addresses": list(info.parsed_addresses())}


__all__ = [
    "MATTER_DOMAIN",
    "MatterButton",
    "MatterHubDevice",
    "async_read_matter_record",
    "button_number",
    "find_sofabaton_matter_devices",
    "is_sofabaton_matter_device",
    "mac_from_eui64",
    "matter_instance_name",
    "record_matches_hub",
]
