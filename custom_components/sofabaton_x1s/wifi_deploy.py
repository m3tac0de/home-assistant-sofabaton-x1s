"""Wifi Commands deploy for SofabatonHub (R6, CR-H1-13).

Holds the deploy's hub-side constants and the managed-brand parser; the
deploy itself moves here in a later step of the hub.py split.
"""

from __future__ import annotations

from .command_config import (
    COMMAND_BRAND_PREFIX,
    DEFAULT_WIFI_DEVICE_KEY,
    LEGACY_COMMAND_BRAND_PREFIX,
)
from .lib.protocol_const import ButtonName

_HARD_BUTTON_TO_CODE: dict[str, int] = {"up": ButtonName.UP, "down": ButtonName.DOWN, "left": ButtonName.LEFT, "right": ButtonName.RIGHT, "ok": ButtonName.OK, "back": ButtonName.BACK, "home": ButtonName.HOME, "menu": ButtonName.MENU, "volup": ButtonName.VOL_UP, "voldn": ButtonName.VOL_DOWN, "mute": ButtonName.MUTE, "chup": ButtonName.CH_UP, "chdn": ButtonName.CH_DOWN, "guide": ButtonName.GUIDE, "dvr": ButtonName.DVR, "play": ButtonName.PLAY, "exit": ButtonName.EXIT, "rew": ButtonName.REW, "pause": ButtonName.PAUSE, "fwd": ButtonName.FWD, "red": ButtonName.RED, "green": ButtonName.GREEN, "yellow": ButtonName.YELLOW, "blue": ButtonName.BLUE, "a": ButtonName.A, "b": ButtonName.B, "c": ButtonName.C}
# Default (user-device) slot count. Per-record slot counts ride the store
# payload's `slot_count` (the Wifi Events record uses 25); the long-record
# id offset always equals the record's slot count (long = short + N,
# live-validated at N=6/10/50 — docs/internal/wifi-events-plan.md §11).
_WIFI_COMMAND_SLOT_COUNT = 10


def _parse_managed_wifi_brand(brand: str) -> tuple[str | None, str | None]:
    text = str(brand or "").strip()
    suffix = ""
    for prefix_value in (COMMAND_BRAND_PREFIX, LEGACY_COMMAND_BRAND_PREFIX):
        prefix = f"{prefix_value}-"
        if text.startswith(prefix):
            suffix = text[len(prefix):].strip()
            break
    if not suffix:
        return None, None
    if "-" not in suffix:
        return None, suffix
    device_key, command_hash = suffix.split("-", 1)
    device_key = "".join(ch for ch in str(device_key).lower() if ch.isalnum())
    return (device_key or DEFAULT_WIFI_DEVICE_KEY), command_hash.strip()
