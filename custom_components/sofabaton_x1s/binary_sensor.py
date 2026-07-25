# custom_components/sofabaton_x1s/binary_sensor.py
from __future__ import annotations

from homeassistant.components.binary_sensor import (
    BinarySensorEntity,
    BinarySensorDeviceClass,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.entity import DeviceInfo
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import (
    DOMAIN,
    CONF_MAC,
    signal_client,
    signal_hub,
)
from .hub import SofabatonHub, get_hub_display_name, get_hub_model


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    hub: SofabatonHub = hass.data[DOMAIN][entry.entry_id]
    async_add_entities(
        [
            SofabatonClientSensor(hub, entry),
            SofabatonHubConnectionSensor(hub, entry),
        ]
    )


class SofabatonClientSensor(BinarySensorEntity):
    """Is the official app connected to our proxy?"""

    _attr_should_poll = False
    _attr_has_entity_name = True
    _attr_device_class = BinarySensorDeviceClass.CONNECTIVITY
    # Stable identifier surfaced in the frontend entity registry; used by the
    # Control Panel card's getEntitySuggestion to recommend itself for this entity.
    _attr_translation_key = "client"

    def __init__(self, hub: SofabatonHub, entry: ConfigEntry) -> None:
        self._hub = hub
        self._entry = entry
        self._attr_unique_id = f"{entry.data[CONF_MAC]}_client"

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
                signal_client(self._hub.entry_id),
                self._handle_client_state,
            )
        )

    @callback
    def _handle_client_state(self) -> None:
        self.async_write_ha_state()

    @property
    def is_on(self) -> bool:
        return self._hub.client_connected


class SofabatonHubConnectionSensor(BinarySensorEntity):
    """Are we connected to the real Sofabaton hub?"""

    _attr_should_poll = False
    _attr_has_entity_name = True
    _attr_device_class = BinarySensorDeviceClass.CONNECTIVITY
    _attr_translation_key = "hub_connected"

    def __init__(self, hub: SofabatonHub, entry: ConfigEntry) -> None:
        self._hub = hub
        self._entry = entry
        self._attr_unique_id = f"{entry.data[CONF_MAC]}_hub_connected"

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
                signal_hub(self._hub.entry_id),
                self._handle_hub_state,
            )
        )

    @callback
    def _handle_hub_state(self) -> None:
        self.async_write_ha_state()

    @property
    def is_on(self) -> bool:
        return self._hub.hub_connected
