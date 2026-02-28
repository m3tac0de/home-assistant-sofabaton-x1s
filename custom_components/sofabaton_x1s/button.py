from __future__ import annotations

import logging

from homeassistant.components.button import ButtonEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.entity import DeviceInfo, EntityCategory
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import (
    DOMAIN,
    CONF_MAC,
    CONF_NAME,
    HUB_VERSION_X2,
    signal_activity,
    signal_buttons,
    signal_client,
    signal_hub,
)
from .hub import SofabatonHub, get_hub_model
from .lib.protocol_const import ButtonName  # your proxy enum

_LOGGER = logging.getLogger(__name__)

# Fixed, explicit list so HA doesn't invent weird entities
BUTTON_DEFS_X1 = [
    (ButtonName.BACK, "Back", "mdi:keyboard-backspace"),
    (ButtonName.BLUE, "Blue button", "mdi:circle"),
    (ButtonName.CH_DOWN, "Channel down", "mdi:arrow-down-bold-box"),
    (ButtonName.CH_UP, "Channel up", "mdi:arrow-up-bold-box"),
    (ButtonName.DOWN, "Down", "mdi:arrow-down-bold"),
    (ButtonName.FWD, "Fast forward", "mdi:fast-forward"),
    (ButtonName.GREEN, "Green button", "mdi:circle"),
    (ButtonName.HOME, "Home", "mdi:home"),
    (ButtonName.LEFT, "Left", "mdi:arrow-left-bold"),
    (ButtonName.MENU, "Menu", "mdi:menu"),
    (ButtonName.MUTE, "Volume mute", "mdi:volume-mute"),
    (ButtonName.OK, "OK", "mdi:check"),
    (ButtonName.PAUSE, "Pause", "mdi:pause"),
    # (ButtonName.POWER_OFF, "Power off", "mdi:power"),
    # (ButtonName.POWER_ON, "Power on", "mdi:power"),
    (ButtonName.RED, "Red button", "mdi:circle"),
    (ButtonName.REW, "Rewind", "mdi:rewind"),
    (ButtonName.RIGHT, "Right", "mdi:arrow-right-bold"),
    (ButtonName.UP, "Up", "mdi:arrow-up-bold"),
    (ButtonName.VOL_DOWN, "Volume down", "mdi:volume-minus"),
    (ButtonName.VOL_UP, "Volume up", "mdi:volume-plus"),
    (ButtonName.YELLOW, "Yellow button", "mdi:circle"),
]

# sort them nicely
BUTTON_DEFS_X1.sort(key=lambda x: x[1].lower())

BUTTON_DEFS_X2 = BUTTON_DEFS_X1 + [
    (ButtonName.GUIDE, "Guide", "mdi:television-guide"),
    (ButtonName.DVR, "DVR", "mdi:filmstrip"),
    (ButtonName.EXIT, "Exit", "mdi:exit-to-app"),
    (ButtonName.PLAY, "Play", "mdi:play"),
    (ButtonName.A, "A button", "mdi:alpha-a-circle"),
    (ButtonName.B, "B button", "mdi:alpha-b-circle"),
    (ButtonName.C, "C button", "mdi:alpha-c-circle"),
]

BUTTON_DEFS_X2.sort(key=lambda x: x[1].lower())


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    hub: SofabatonHub = hass.data[DOMAIN][entry.entry_id]

    version = getattr(hub, "version", None)
    if version == HUB_VERSION_X2:
        button_defs = BUTTON_DEFS_X2
    else:
        button_defs = BUTTON_DEFS_X1

    entities: list[ButtonEntity] = [
        SofabatonFindRemoteButton(hub, entry),
        SofabatonResyncRemoteButton(hub, entry),
    ]
    for code, label, icon in button_defs:
        entities.append(SofabatonDynamicButton(hub, entry, code, label, icon))

    async_add_entities(entities)

class SofabatonFindRemoteButton(ButtonEntity):
    _attr_should_poll = False
    _attr_entity_category = EntityCategory.DIAGNOSTIC
    _attr_icon = "mdi:remote"

    def __init__(self, hub: SofabatonHub, entry: ConfigEntry) -> None:
        self._hub = hub
        self._entry = entry
        self._attr_name = f"{entry.data[CONF_NAME]} find remote"
        self._attr_unique_id = f"{entry.data[CONF_MAC]}_find_remote"

    @property
    def device_info(self) -> DeviceInfo:
        return DeviceInfo(
            identifiers={(DOMAIN, self._entry.data[CONF_MAC])},
            name=self._entry.data[CONF_NAME],
            model=get_hub_model(self._entry),
        )

    async def async_added_to_hass(self) -> None:
        for sig in (
            signal_client(self._hub.entry_id),
            signal_hub(self._hub.entry_id),
        ):
            self.async_on_remove(
                async_dispatcher_connect(self.hass, sig, self._handle_update)
            )

    @callback
    def _handle_update(self) -> None:
        self.async_write_ha_state()

    @property
    def available(self) -> bool:
        return self._hub.hub_connected and not self._hub.client_connected

    async def async_press(self) -> None:
        if not self.available:
            return
        await self._hub.async_find_remote()





class SofabatonResyncRemoteButton(ButtonEntity):
    _attr_should_poll = False
    _attr_entity_category = EntityCategory.DIAGNOSTIC
    _attr_icon = "mdi:sync"

    def __init__(self, hub: SofabatonHub, entry: ConfigEntry) -> None:
        self._hub = hub
        self._entry = entry
        self._attr_name = f"{entry.data[CONF_NAME]} resync remote"
        self._attr_unique_id = f"{entry.data[CONF_MAC]}_resync_remote"

    @property
    def device_info(self) -> DeviceInfo:
        return DeviceInfo(
            identifiers={(DOMAIN, self._entry.data[CONF_MAC])},
            name=self._entry.data[CONF_NAME],
            model=get_hub_model(self._entry),
        )

    async def async_added_to_hass(self) -> None:
        for sig in (
            signal_client(self._hub.entry_id),
            signal_hub(self._hub.entry_id),
        ):
            self.async_on_remove(
                async_dispatcher_connect(self.hass, sig, self._handle_update)
            )

    @callback
    def _handle_update(self) -> None:
        self.async_write_ha_state()

    @property
    def available(self) -> bool:
        return self._hub.hub_connected and not self._hub.client_connected

    async def async_press(self) -> None:
        if not self.available:
            return
        await self._hub.async_resync_remote()


class SofabatonDynamicButton(ButtonEntity):
    _attr_should_poll = False

    def __init__(
        self,
        hub: SofabatonHub,
        entry: ConfigEntry,
        code: int,
        label: str,
        icon: str,
    ) -> None:
        self._hub = hub
        self._entry = entry
        self._code = code

        self._attr_name = f"{entry.data[CONF_NAME]} {label}"
        self._attr_unique_id = f"{entry.data[CONF_MAC]}_btn_{code:02x}"
        self._attr_icon = icon

    @property
    def device_info(self) -> DeviceInfo:
        return DeviceInfo(
            identifiers={(DOMAIN, self._entry.data[CONF_MAC])},
            name=self._entry.data[CONF_NAME],
            model=get_hub_model(self._entry),
        )

    async def async_added_to_hass(self) -> None:
        # we just listen — hub will prime buttons
        self.async_on_remove(
            async_dispatcher_connect(
                self.hass,
                signal_activity(self._hub.entry_id),
                self._handle_update,
            )
        )
        self.async_on_remove(
            async_dispatcher_connect(
                self.hass,
                signal_buttons(self._hub.entry_id),
                self._handle_update,
            )
        )
        self.async_on_remove(
            async_dispatcher_connect(
                self.hass,
                signal_client(self._hub.entry_id),
                self._handle_update,
            )
        )

    @callback
    def _handle_update(self) -> None:
        # just re-evaluate availability
        self.async_write_ha_state()

    @property
    def available(self) -> bool:
        # 1) app connected → we go unavailable
        if self._hub.client_connected:
            return False

        # 2) no current activity → unavailable
        if self._hub.current_activity is None:
            return False

        # 3) check hub cache for current buttons (no fetch!)
        btns, ready = self._hub.get_buttons_for_current()
        if not ready:
            return False

        return self._code in btns

    async def async_press(self) -> None:
        if not self.available:
            return
        await self._hub.async_send_button(self._code)
