from __future__ import annotations

import ipaddress
import logging

from homeassistant.components.text import TextEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.entity import DeviceInfo, EntityCategory
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import CONF_HOST, CONF_MAC, CONF_NAME, DOMAIN
from .hub import SofabatonHub, get_hub_model

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    hub: SofabatonHub = hass.data[DOMAIN][entry.entry_id]
    async_add_entities([SofabatonHubIpText(hub, entry)])


class SofabatonHubIpText(TextEntity):
    _attr_should_poll = False
    _attr_entity_category = EntityCategory.CONFIG
    _attr_icon = "mdi:ip"

    def __init__(self, hub: SofabatonHub, entry: ConfigEntry) -> None:
        self._hub = hub
        self._entry = entry
        self._attr_unique_id = f"{entry.data[CONF_MAC]}_ip_address"
        self._attr_name = f"{entry.data[CONF_NAME]} hub IP address"

    @property
    def native_value(self) -> str | None:
        return self._hub.host

    @property
    def device_info(self) -> DeviceInfo:
        return DeviceInfo(
            identifiers={(DOMAIN, self._entry.data[CONF_MAC])},
            name=self._entry.data[CONF_NAME],
            model=get_hub_model(self._entry),
        )

    async def async_set_value(self, value: str) -> None:
        new_host = value.strip()
        try:
            ip = ipaddress.ip_address(new_host)
        except ValueError as err:
            raise HomeAssistantError("Enter a valid IPv4 address for the hub") from err

        if ip.version != 4:
            raise HomeAssistantError("IPv4 addresses are required for the hub")

        entry = self.hass.config_entries.async_get_entry(self._entry.entry_id)
        if entry is None:
            raise HomeAssistantError("Config entry missing for this hub")

        if entry.data.get(CONF_HOST) == new_host:
            return

        _LOGGER.debug("[%s] Updating hub IP to %s via text entity", entry.entry_id, new_host)
        self.hass.config_entries.async_update_entry(
            entry, data={**entry.data, CONF_HOST: new_host}
        )
        await self.hass.config_entries.async_reload(entry.entry_id)
