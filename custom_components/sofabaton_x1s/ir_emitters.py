"""The X2's IR emitter routing targets, for the device editor's IR pill.

Which emitters send a device's IR is the device record's routing
(``device.extras``, edited through the device sync like the name). What the
pill also needs is the hardware it can route to: the hub's own emitters and
both IR ports are always there (the hub's cable flags are not reliable, see
docs/protocol/live-hub-testing.md "Validated: X2 IR emitter routing"), so
only the paired remotes and repeaters are read, and only when the pill's
dropdown opens.
"""

from __future__ import annotations

from typing import Any, Iterable

from homeassistant.core import HomeAssistant

from .lib.hub_versions import HUB_VERSION_X2


def paired_view(rows: Iterable[Any] | None) -> list[dict[str, Any]] | None:
    """Remotes and repeaters by their routing number; single-button RF
    devices (which take no IR) left out. None when the list was not read."""

    if rows is None:
        return None
    view: list[dict[str, Any]] = []
    for row in rows:
        if not (row.is_remote or row.is_repeater) or row.number is None:
            continue
        view.append(
            {
                "kind": "remote" if row.is_remote else "repeater",
                "number": int(row.number),
                "name": str(row.name),
                "online": bool(row.online),
                "port_cable": row.port_cable,
            }
        )
    return view


def status_view(raw: dict[str, Any] | None) -> dict[str, Any]:
    """The WS answer for an engine read (or the kept one): ``paired`` and
    ``read_at`` both None when there is none."""

    raw = raw or {}
    read_at = raw.get("read_at")
    return {
        "available": True,
        "paired": paired_view(raw.get("paired")),
        "read_at": float(read_at) if read_at else None,
    }


def is_x2(hub: Any) -> bool:
    return getattr(hub, "version", None) == HUB_VERSION_X2


async def async_read_status(hass: HomeAssistant, hub: Any) -> dict[str, Any] | None:
    """Read the paired list from the hub (a few seconds: the hub polls its
    paired devices first) and keep it on the engine. None when the hub
    cannot be asked or did not answer."""

    raw = await hass.async_add_executor_job(hub._proxy.read_ir_emitter_status)
    if raw is None or raw.get("paired") is None:
        return None
    return status_view(raw)


def last_status(hub: Any) -> dict[str, Any]:
    """The last read, without asking the hub."""

    return status_view(hub._proxy.last_ir_emitter_status())
