from __future__ import annotations

import logging
from typing import Any, List

from homeassistant.components.select import SelectEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.entity import DeviceInfo, EntityCategory
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import (
    DOMAIN,
    CONF_MAC,
    CONF_NAME,
    HUB_VERSION_X1,
    HUB_VERSION_X1S,
    HUB_VERSION_X2,
    signal_activity,
    signal_client,
    signal_hub,
)
from .hub import SofabatonHub, get_hub_model

_LOGGER = logging.getLogger(__name__)

POWERED_OFF = "Powered Off"


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    hub: SofabatonHub = hass.data[DOMAIN][entry.entry_id]
    async_add_entities([SofabatonActivitySelect(hub, entry), SofabatonHubVersionSelect(hub, entry)])


class SofabatonActivitySelect(SelectEntity):
    _attr_should_poll = False

    def __init__(self, hub: SofabatonHub, entry: ConfigEntry) -> None:
        self._hub = hub
        self._entry = entry
        self._attr_unique_id = f"{entry.data[CONF_MAC]}_activity"
        self._attr_name = f"{entry.data[CONF_NAME]} Activity"
        self._attr_options = [POWERED_OFF]
        self._attr_available = True

    @property
    def device_info(self) -> DeviceInfo:
        return DeviceInfo(
            identifiers={(DOMAIN, self._entry.data[CONF_MAC])},
            name=self._entry.data[CONF_NAME],
            manufacturer="Sofabaton",
            model=f"{get_hub_model(self._entry)} via proxy",
        )

    async def async_added_to_hass(self) -> None:
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
                signal_client(self._hub.entry_id),
                self._handle_client_state,
            )
        )
        # initial populate
        self._rebuild_options()
        self._handle_client_state()

    @callback
    def _rebuild_options(self) -> None:
        opts = [POWERED_OFF]
        # keep the order from the hub response
        for act_id, activity in self._hub.activities.items():
            name = activity.get("name") or f"Activity {act_id}"
            opts.append(name)
        self._attr_options = opts
        self.async_write_ha_state()

    @callback
    def _handle_update(self) -> None:
        self._rebuild_options()
        self.async_write_ha_state()

    @callback
    def _handle_client_state(self) -> None:
        # when a proxy client is connected, make ourselves unavailable
        self._attr_available = not self._hub.client_connected
        self.async_write_ha_state()

    @property
    def current_option(self) -> str | None:
        if self._hub.client_connected:
            # entity is unavailable anyway
            return None
        if self._hub.current_activity is None:
            return POWERED_OFF
        name = self._hub.get_activity_name_by_id(self._hub.current_activity)
        return name or POWERED_OFF

    async def async_select_option(self, option: str) -> None:
        if self._hub.client_connected:
            # ignore – app is using the proxy
            return

        if option == POWERED_OFF:
            await self._hub.async_power_off_current()
            return

        act_id = self._hub.get_id_by_activity_name(option)
        if act_id is None:
            _LOGGER.warning("Unknown activity %s", option)
            return
        await self._hub.async_activate_activity(act_id)


class SofabatonHubVersionSelect(SelectEntity):
    _attr_should_poll = False
    _attr_entity_category = EntityCategory.CONFIG
    _attr_entity_registry_enabled_default = False
    _attr_icon = "mdi:source-branch"

    def __init__(self, hub: SofabatonHub, entry: ConfigEntry) -> None:
        self._hub = hub
        self._entry = entry
        self._attr_unique_id = f"{entry.data[CONF_MAC]}_hub_version"
        self._attr_name = f"{entry.data[CONF_NAME]} hub version"
        self._attr_options = [HUB_VERSION_X1, HUB_VERSION_X1S, HUB_VERSION_X2]

    @property
    def device_info(self) -> DeviceInfo:
        return DeviceInfo(
            identifiers={(DOMAIN, self._entry.data[CONF_MAC])},
            name=self._entry.data[CONF_NAME],
            manufacturer="Sofabaton",
            model=get_hub_model(self._entry),
        )

    @property
    def current_option(self) -> str | None:
        value = get_hub_model(self._entry)
        return value if value in self._attr_options else None

    async def async_added_to_hass(self) -> None:
        self.async_on_remove(
            async_dispatcher_connect(
                self.hass,
                signal_hub(self._hub.entry_id),
                self._handle_update,
            )
        )

    @callback
    def _handle_update(self) -> None:
        self.async_write_ha_state()

    async def async_select_option(self, option: str) -> None:
        if option not in self._attr_options:
            raise ValueError(f"Invalid hub version: {option}")

        await self._hub.async_set_hub_version(option)
        self.async_write_ha_state()
