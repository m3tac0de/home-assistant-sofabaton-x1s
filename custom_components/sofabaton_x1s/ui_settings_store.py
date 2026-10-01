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
            # Whether the "Sofabaton X" sidebar panel is registered.
            "sidebar_panel": False,
        }

    async def async_load(self) -> None:
        loaded = await self._store.async_load()
        if isinstance(loaded, dict):
            action = loaded.get("hub_click_action")
            if action in HUB_CLICK_ACTIONS:
                self._data["hub_click_action"] = action
            sidebar_panel = loaded.get("sidebar_panel")
            if isinstance(sidebar_panel, bool):
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
    def sidebar_panel_enabled(self) -> bool:
        return self._data.get("sidebar_panel") is True

    async def async_set_sidebar_panel_enabled(self, enabled: bool) -> None:
        self._data["sidebar_panel"] = bool(enabled)
        await self._store.async_save(self._data)
