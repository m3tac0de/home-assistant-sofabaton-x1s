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
    signal_hub,
)
from .hub import SofabatonHub, hub_device_info

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
    _attr_has_entity_name = True
    _attr_translation_key = "activity"

    def __init__(self, hub: SofabatonHub, entry: ConfigEntry) -> None:
        self._hub = hub
        self._entry = entry
        self._attr_unique_id = f"{entry.data[CONF_MAC]}_activity"
        self._attr_options = [POWERED_OFF]

    @property
    def device_info(self) -> DeviceInfo:
        return hub_device_info(self._hub, self._entry)

    async def async_added_to_hass(self) -> None:
        self.async_on_remove(
            async_dispatcher_connect(
                self.hass,
                signal_activity(self._hub.entry_id),
                self._handle_update,
            )
        )
        for sig in (signal_client(self._hub.entry_id), signal_hub(self._hub.entry_id)):
            self.async_on_remove(
                async_dispatcher_connect(self.hass, sig, self._handle_client_state)
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
        self.async_write_ha_state()

    @property
    def available(self) -> bool:
        # The remote's gate: a hub that is offline or held by the app
        # cannot switch activities (CR-H3-7).
        return self._hub.hub_connected and not self._hub.client_connected

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
