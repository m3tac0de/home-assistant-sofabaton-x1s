# custom_components/sofabaton_x1s/switch.py
from __future__ import annotations

from homeassistant.components.switch import SwitchEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity import DeviceInfo
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.entity import EntityCategory

from .const import DOMAIN, CONF_MAC, CONF_NAME
from .hub import SofabatonHub, get_hub_model


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    hub: SofabatonHub = hass.data[DOMAIN][entry.entry_id]
    async_add_entities(
        [
            SofabatonProxySwitch(hub, entry),
            SofabatonHexLoggingSwitch(hub, entry),
            SofabatonRokuServerSwitch(hub, entry),
        ]
    )


class SofabatonProxySwitch(SwitchEntity):
    _attr_should_poll = False
    _attr_entity_category = EntityCategory.CONFIG  # ← this makes it show under "Configuration"

    def __init__(self, hub: SofabatonHub, entry: ConfigEntry) -> None:
        self._hub = hub
        self._entry = entry
        self._attr_unique_id = f"{entry.data[CONF_MAC]}_proxy"
        self._attr_name = f"{entry.data[CONF_NAME]} Proxy enabled"

    @property
    def device_info(self) -> DeviceInfo:
        return DeviceInfo(
            identifiers={(DOMAIN, self._entry.data[CONF_MAC])},
            name=self._entry.data[CONF_NAME],
            model=get_hub_model(self._entry),
        )

    @property
    def is_on(self) -> bool:
        return self._hub.proxy_enabled

    async def async_turn_on(self, **kwargs) -> None:
        await self._hub.async_set_proxy_enabled(True)
        self.async_write_ha_state()

    async def async_turn_off(self, **kwargs) -> None:
        await self._hub.async_set_proxy_enabled(False)
        self.async_write_ha_state()

class SofabatonHexLoggingSwitch(SwitchEntity):
    _attr_should_poll = False
    _attr_entity_category = EntityCategory.CONFIG  # ← this makes it show under "Configuration"

    def __init__(self, hub: SofabatonHub, entry: ConfigEntry) -> None:
        self._hub = hub
        self._entry = entry
        self._attr_unique_id = f"{entry.data[CONF_MAC]}_hex_logging"
        self._attr_name = f"{entry.data[CONF_NAME]} Hex logging"

    @property
    def device_info(self) -> DeviceInfo:
        return DeviceInfo(
            identifiers={(DOMAIN, self._entry.data[CONF_MAC])},
            name=self._entry.data[CONF_NAME],
            model=get_hub_model(self._entry),
        )

    @property
    def is_on(self) -> bool:
        return self._hub.hex_logging_enabled

    async def async_turn_on(self, **kwargs) -> None:
        await self._hub.async_set_hex_logging_enabled(True)
        self.async_write_ha_state()

    async def async_turn_off(self, **kwargs) -> None:
        await self._hub.async_set_hex_logging_enabled(False)
        self.async_write_ha_state()

class SofabatonRokuServerSwitch(SwitchEntity):
    _attr_should_poll = False
    _attr_entity_category = EntityCategory.CONFIG

    def __init__(self, hub: SofabatonHub, entry: ConfigEntry) -> None:
        self._hub = hub
        self._entry = entry
        self._attr_unique_id = f"{entry.data[CONF_MAC]}_roku_server"
        self._attr_name = f"{entry.data[CONF_NAME]} Roku server"

    @property
    def device_info(self) -> DeviceInfo:
        return DeviceInfo(
            identifiers={(DOMAIN, self._entry.data[CONF_MAC])},
            name=self._entry.data[CONF_NAME],
            model=get_hub_model(self._entry),
        )

    @property
    def is_on(self) -> bool:
        return self._hub.roku_server_enabled

    async def async_turn_on(self, **kwargs) -> None:
        await self._hub.async_set_roku_server_enabled(True)
        self.async_write_ha_state()

    async def async_turn_off(self, **kwargs) -> None:
        await self._hub.async_set_roku_server_enabled(False)
        self.async_write_ha_state()
