# custom_components/sofabaton_x1s/switch.py
from __future__ import annotations

from homeassistant.components.switch import SwitchEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.core import callback
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.entity import DeviceInfo
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.entity import EntityCategory

from .const import DOMAIN, CONF_MAC
from .const import signal_wifi_device
from .hub import SofabatonHub, get_hub_display_name, get_hub_model


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
            SofabatonWifiDeviceSwitch(hub, entry),
        ]
    )


class SofabatonProxySwitch(SwitchEntity):
    _attr_should_poll = False
    _attr_entity_category = EntityCategory.CONFIG  # ← this makes it show under "Configuration"
    # Stable identifier surfaced in the frontend entity registry; used by the
    # Control Panel card's getEntitySuggestion to recommend itself for this entity.
    _attr_translation_key = "proxy"

    def __init__(self, hub: SofabatonHub, entry: ConfigEntry) -> None:
        self._hub = hub
        self._entry = entry
        self._attr_unique_id = f"{entry.data[CONF_MAC]}_proxy"

    @property
    def name(self) -> str | None:
        return f"{get_hub_display_name(self._hub, self._entry)} Proxy enabled"

    @property
    def device_info(self) -> DeviceInfo:
        return DeviceInfo(
            identifiers={(DOMAIN, self._entry.data[CONF_MAC])},
            name=get_hub_display_name(self._hub, self._entry),
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
    _attr_translation_key = "hex_logging"

    def __init__(self, hub: SofabatonHub, entry: ConfigEntry) -> None:
        self._hub = hub
        self._entry = entry
        self._attr_unique_id = f"{entry.data[CONF_MAC]}_hex_logging"

    @property
    def name(self) -> str | None:
        return f"{get_hub_display_name(self._hub, self._entry)} Hex logging"

    @property
    def device_info(self) -> DeviceInfo:
        return DeviceInfo(
            identifiers={(DOMAIN, self._entry.data[CONF_MAC])},
            name=get_hub_display_name(self._hub, self._entry),
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

class SofabatonWifiDeviceSwitch(SwitchEntity):
    _attr_should_poll = False
    _attr_entity_category = EntityCategory.CONFIG
    _attr_translation_key = "wifi_device"

    def __init__(self, hub: SofabatonHub, entry: ConfigEntry) -> None:
        self._hub = hub
        self._entry = entry
        self._attr_unique_id = f"{entry.data[CONF_MAC]}_wifi_device"

    @property
    def name(self) -> str | None:
        return f"{get_hub_display_name(self._hub, self._entry)} Wifi Device"

    @property
    def device_info(self) -> DeviceInfo:
        return DeviceInfo(
            identifiers={(DOMAIN, self._entry.data[CONF_MAC])},
            name=get_hub_display_name(self._hub, self._entry),
            model=get_hub_model(self._entry),
        )

    async def async_added_to_hass(self) -> None:
        self.async_on_remove(
            async_dispatcher_connect(
                self.hass,
                signal_wifi_device(self._hub.entry_id),
                self._handle_wifi_device_toggle,
            )
        )

    @callback
    def _handle_wifi_device_toggle(self) -> None:
        self.async_write_ha_state()

    @property
    def is_on(self) -> bool:
        return self._hub.roku_server_enabled

    async def async_turn_on(self, **kwargs) -> None:
        await self._hub.async_set_roku_server_enabled(True)
        self.async_write_ha_state()

    async def async_turn_off(self, **kwargs) -> None:
        await self._hub.async_set_roku_server_enabled(False)
        self.async_write_ha_state()
