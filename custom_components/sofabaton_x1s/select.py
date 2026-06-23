from __future__ import annotations

from homeassistant.components.select import SelectEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.entity import DeviceInfo
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import (
    DOMAIN,
    CONF_MAC,
    signal_activity,
    signal_client,
)
from .hub import SofabatonHub, get_hub_display_name, get_hub_model

POWERED_OFF = "Powered Off"


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    hub: SofabatonHub = hass.data[DOMAIN][entry.entry_id]
    async_add_entities([SofabatonActivitySelect(hub, entry)])


class SofabatonActivitySelect(SelectEntity):
    _attr_should_poll = False

    def __init__(self, hub: SofabatonHub, entry: ConfigEntry) -> None:
        self._hub = hub
        self._entry = entry
        self._attr_unique_id = f"{entry.data[CONF_MAC]}_activity"
        self._attr_options = [POWERED_OFF]
        self._attr_available = True

    @property
    def name(self) -> str | None:
        return f"{get_hub_display_name(self._hub, self._entry)} Activity"

    @property
    def device_info(self) -> DeviceInfo:
        return DeviceInfo(
            identifiers={(DOMAIN, self._entry.data[CONF_MAC])},
            name=get_hub_display_name(self._hub, self._entry),
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
        self._rebuild_options()
        self._handle_client_state()

    @callback
    def _rebuild_options(self) -> None:
        opts = [POWERED_OFF]
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
        self._attr_available = not self._hub.client_connected
        self.async_write_ha_state()

    @property
    def current_option(self) -> str | None:
        if self._hub.client_connected:
            return None
        if self._hub.current_activity is None:
            return POWERED_OFF
        name = self._hub.get_activity_name_by_id(self._hub.current_activity)
        return name or POWERED_OFF

    async def async_select_option(self, option: str) -> None:
        if self._hub.client_connected:
            return

        if option == POWERED_OFF:
            await self._hub.async_power_off_current()
            return

        act_id = self._hub.get_id_by_activity_name(option)
        if act_id is None:
            return
        await self._hub.async_activate_activity(act_id)
