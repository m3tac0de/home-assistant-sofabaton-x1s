from __future__ import annotations

import ipaddress
import logging

from homeassistant.components.text import TextEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.entity import DeviceInfo, EntityCategory
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import CONF_HOST, CONF_MAC, DOMAIN, signal_hub
from .hub import SofabatonHub, hub_device_info
from .lib.network import is_local_ipv4, normalize_local_address

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    hub: SofabatonHub = hass.data[DOMAIN][entry.entry_id]
    async_add_entities([SofabatonHubIpText(hub, entry), SofabatonLocalAddressText(hub, entry)])


class SofabatonHubIpText(TextEntity):
    _attr_should_poll = False
    _attr_has_entity_name = True
    _attr_translation_key = "hub_ip_address"
    _attr_entity_category = EntityCategory.CONFIG
    _attr_icon = "mdi:ip"
    _attr_entity_registry_enabled_default = False

    def __init__(self, hub: SofabatonHub, entry: ConfigEntry) -> None:
        self._hub = hub
        self._entry = entry
        self._attr_unique_id = f"{entry.data[CONF_MAC]}_ip_address"

    @property
    def native_value(self) -> str | None:
        return self._hub.host

    async def async_added_to_hass(self) -> None:
        # A rediscovered or edited host shows once the hub reconnects on it.
        self.async_on_remove(
            async_dispatcher_connect(self.hass, signal_hub(self._hub.entry_id), self._handle_hub)
        )

    @callback
    def _handle_hub(self) -> None:
        self.async_write_ha_state()

    @property
    def device_info(self) -> DeviceInfo:
        return hub_device_info(self._hub, self._entry)

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
        # The entry's update listener applies the new host (and keeps the
        # engine cache); a reload on top raced it and could leave an
        # orphaned proxy holding the hub (CR-H3-5).
        self.hass.config_entries.async_update_entry(
            entry, data={**entry.data, CONF_HOST: new_host}
        )


class SofabatonLocalAddressText(TextEntity):
    """The address of ours the hub is told to call back, per hub.

    Shows the address in use. Typing one makes it manual; clearing the
    field returns to automatic selection.
    """

    _attr_should_poll = False
    _attr_has_entity_name = True
    _attr_translation_key = "local_ip_address"
    _attr_entity_category = EntityCategory.CONFIG
    _attr_icon = "mdi:ip"
    _attr_entity_registry_enabled_default = False

    def __init__(self, hub: SofabatonHub, entry: ConfigEntry) -> None:
        self._hub = hub
        self._entry = entry
        self._attr_unique_id = f"{entry.data[CONF_MAC]}_local_ip_address"
        self._address_in_use: str | None = None

    @property
    def native_value(self) -> str | None:
        return self._address_in_use

    @property
    def extra_state_attributes(self) -> dict[str, str]:
        return {"mode": "manual" if self._hub.local_address else "automatic"}

    async def async_added_to_hass(self) -> None:
        # The automatic choice can change with the hub's address or the
        # host's interfaces; a hub (re)connect is when that shows.
        self.async_on_remove(
            async_dispatcher_connect(self.hass, signal_hub(self._hub.entry_id), self._handle_hub)
        )
        await self._async_refresh()

    @callback
    def _handle_hub(self) -> None:
        self.hass.async_create_task(self._async_refresh())

    async def _async_refresh(self) -> None:
        # An interface and routing lookup: kept off the event loop.
        self._address_in_use = await self.hass.async_add_executor_job(
            self._hub.local_address_in_use
        )
        self.async_write_ha_state()

    @property
    def device_info(self) -> DeviceInfo:
        return hub_device_info(self._hub, self._entry)

    async def async_set_value(self, value: str) -> None:
        try:
            address = normalize_local_address(value)
        except ValueError as err:
            raise HomeAssistantError(
                "Enter a valid IPv4 address, or clear the field to select it automatically"
            ) from err
        # An address nobody answers on takes the hub offline, and it stays
        # unsettled for minutes after the address is corrected.
        if address is not None and not await self.hass.async_add_executor_job(
            is_local_ipv4, address
        ):
            raise HomeAssistantError(
                f"{address} is not an address of this Home Assistant host"
            )
        await self._hub.async_set_local_address(address)
        await self._async_refresh()

