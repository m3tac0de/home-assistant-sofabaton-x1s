"""Every WS command handler must actually be registered.

The @websocket_command decorator only attaches the schema; a handler
that never reaches async_register_command silently does not exist to
clients (the card's call errors, and the click path degrades into
"nothing happens"). conftest stubs async_register_command to a no-op,
so no behavioral test can catch a missing line; this source-level scan
does (found the device/power_state handler unregistered, 2026-08-25).
"""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PKG = ROOT / "custom_components" / "sofabaton_x1s"
INIT = PKG / "__init__.py"
# Handlers live in __init__.py and, since the __init__.py split (R6,
# CR-H2-13), in the ws_*.py modules; registration stays in __init__.py.
HANDLER_SOURCES = [INIT, *sorted(PKG.glob("ws_*.py"))]


def test_every_ws_handler_is_registered() -> None:
    handlers: set[str] = set()
    for path in HANDLER_SOURCES:
        handlers |= set(re.findall(r"^async def (_ws_[a-z0-9_]+)\(", path.read_text(encoding="utf-8"), re.M))
    registered = set(
        re.findall(r"async_register_command\(hass, (_ws_[a-z0-9_]+)\)", INIT.read_text(encoding="utf-8"))
    )
    assert handlers, "no WS handlers found; scan pattern is stale"
    missing = sorted(handlers - registered)
    assert not missing, f"WS handlers never registered: {missing}"
    stale = sorted(registered - handlers)
    assert not stale, f"registrations without handlers: {stale}"
