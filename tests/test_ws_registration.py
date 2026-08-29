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
INIT = ROOT / "custom_components" / "sofabaton_x1s" / "__init__.py"


def test_every_ws_handler_is_registered() -> None:
    source = INIT.read_text(encoding="utf-8")
    handlers = set(re.findall(r"^async def (_ws_[a-z0-9_]+)\(", source, re.M))
    registered = set(
        re.findall(r"async_register_command\(hass, (_ws_[a-z0-9_]+)\)", source)
    )
    assert handlers, "no WS handlers found; scan pattern is stale"
    missing = sorted(handlers - registered)
    assert not missing, f"WS handlers never registered: {missing}"
    stale = sorted(registered - handlers)
    assert not stale, f"registrations without handlers: {stale}"
