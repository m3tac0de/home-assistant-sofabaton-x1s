from __future__ import annotations

from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import DOMAIN

UI_SETTINGS_STORE_VERSION = 1

# What clicking a command / favorite / macro / button row in the Hub tab does.
HUB_CLICK_ACTION_NONE = "none"
HUB_CLICK_ACTION_SEND = "send"
HUB_CLICK_ACTION_COPY = "copy"
HUB_CLICK_ACTIONS = (
    HUB_CLICK_ACTION_NONE,
    HUB_CLICK_ACTION_SEND,
    HUB_CLICK_ACTION_COPY,
)

# The "Sofabaton X" sidebar panel: absent, for every user, or admins only
# (HA's require_admin, the same gate a dashboard's "admin only" sets).
SIDEBAR_PANEL_OFF = "off"
SIDEBAR_PANEL_ALL = "all"
SIDEBAR_PANEL_ADMIN = "admin"
SIDEBAR_PANEL_MODES = (
    SIDEBAR_PANEL_OFF,
    SIDEBAR_PANEL_ALL,
    SIDEBAR_PANEL_ADMIN,
)


class UiSettingsStore:
    """Global (all-hubs) control-panel UI settings, persisted across restarts."""

    def __init__(self, hass: HomeAssistant) -> None:
        self._store: Store[dict[str, Any]] = Store(
            hass,
            UI_SETTINGS_STORE_VERSION,
            f"{DOMAIN}.ui_settings",
        )
        self._data: dict[str, Any] = {
            "hub_click_action": HUB_CLICK_ACTION_NONE,
            "sidebar_panel": SIDEBAR_PANEL_OFF,
        }

    async def async_load(self) -> None:
        loaded = await self._store.async_load()
        if isinstance(loaded, dict):
            action = loaded.get("hub_click_action")
            if action in HUB_CLICK_ACTIONS:
                self._data["hub_click_action"] = action
            sidebar_panel = loaded.get("sidebar_panel")
            if sidebar_panel in SIDEBAR_PANEL_MODES:
                self._data["sidebar_panel"] = sidebar_panel

    @property
    def hub_click_action(self) -> str:
        action = self._data.get("hub_click_action")
        return action if action in HUB_CLICK_ACTIONS else HUB_CLICK_ACTION_NONE

    async def async_set_hub_click_action(self, action: str) -> None:
        if action not in HUB_CLICK_ACTIONS:
            raise ValueError(f"Invalid hub_click_action: {action!r}")
        self._data["hub_click_action"] = action
        await self._store.async_save(self._data)

    @property
    def sidebar_panel_mode(self) -> str:
        mode = self._data.get("sidebar_panel")
        return mode if mode in SIDEBAR_PANEL_MODES else SIDEBAR_PANEL_OFF

    async def async_set_sidebar_panel_mode(self, mode: str) -> None:
        if mode not in SIDEBAR_PANEL_MODES:
            raise ValueError(f"Invalid sidebar_panel mode: {mode!r}")
        self._data["sidebar_panel"] = mode
        await self._store.async_save(self._data)
