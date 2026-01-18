from __future__ import annotations

from typing import Any

from homeassistant.components.remote import RemoteEntity, RemoteEntityFeature
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.entity import DeviceInfo
from .const import (
    DOMAIN,
    CONF_MAC,
    CONF_NAME,
    signal_activity,
    signal_hub,
    signal_client,
    signal_buttons,
    signal_commands,
    signal_macros,
)
from .hub import get_hub_model


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities,
) -> None:
    hub = hass.data[DOMAIN][entry.entry_id]
    async_add_entities([SofabatonRemote(hub, entry)])


class SofabatonRemote(RemoteEntity):
    _attr_has_entity_name = True

    def __init__(self, hub, entry: ConfigEntry) -> None:
        self._hub = hub
        self._entry = entry
        self._attr_name = "Remote"
        self._attr_unique_id = f"{entry.data[CONF_MAC]}_remote"
        self._attr_supported_features = RemoteEntityFeature.ACTIVITY

    @property
    def available(self) -> bool:
        return self._hub.hub_connected and not self._hub.client_connected

    @property
    def is_on(self) -> bool:
        return self._hub.current_activity is not None

    @property
    def current_activity(self) -> str | None:
        act_id = self._hub.current_activity
        if act_id is None:
            return None
        return self._hub.get_activity_name_by_id(act_id)

    # 👇 this is what the more-info card expects for the dropdown
    @property
    def activity_list(self) -> list[str]:
        return [
            act.get("name")
            for act in self._hub.activities.values()
            if act.get("name")
        ]

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        activity_id = self._hub.current_activity
        activities: list[dict[str, Any]] = []
        for act_id, activity in self._hub.activities.items():
            activities.append(
                {
                    "id": act_id,
                    "name": activity.get("name"),
                    "state": "on" if activity_id == act_id else "off",
                }
            )

        assigned_keys: dict[str, list[int]] = {}
        for ent_id, buttons in self._hub.get_all_cached_buttons().items():
            assigned_keys[str(ent_id)] = buttons

        macro_keys: dict[str, list[dict[str, int | str]]] = {}
        for act_id, macros in self._hub.get_all_cached_macros().items():
            macro_keys[str(act_id)] = [
                {"id": macro.get("command_id"), "name": macro.get("label")}
                for macro in macros
                if macro.get("command_id") is not None
            ]

        favorite_keys: dict[str, list[dict[str, int | str]]] = {}
        for act_id, favorites in self._hub.get_activity_favorites().items():
            favorite_keys[str(act_id)] = [
                {
                    "id": fav.get("command_id"),
                    "name": fav.get("name"),
                    "device_id": fav.get("device_id"),
                }
                for fav in favorites
                if fav.get("command_id") is not None
            ]
        return {
            "proxy_client_connected": self._hub.client_connected,
            "hub_version": self._hub.version,
            "activities": activities,
            "assigned_keys": assigned_keys,
            "macro_keys": macro_keys,
            "favorite_keys": favorite_keys,
            "current_activity_id": activity_id,
            "load_state": self._hub.get_index_state(),
        }

    @property
    def device_info(self) -> DeviceInfo:
        return DeviceInfo(
            identifiers={(DOMAIN, self._entry.data[CONF_MAC])},
            name=self._entry.data[CONF_NAME],
            manufacturer="Sofabaton",
            model=get_hub_model(self._entry),
        )

    async def async_added_to_hass(self) -> None:
        self.async_on_remove(
            async_dispatcher_connect(
                self.hass,
                signal_activity(self._hub.entry_id),
                self._schedule_update,
            )
        )
        self.async_on_remove(
            async_dispatcher_connect(
                self.hass,
                signal_hub(self._hub.entry_id),
                self._schedule_update,
            )
        )
        self.async_on_remove(
            async_dispatcher_connect(
                self.hass,
                signal_client(self._hub.entry_id),
                self._schedule_update,
            )
        )
        self.async_on_remove(
            async_dispatcher_connect(
                self.hass,
                signal_buttons(self._hub.entry_id),
                self._schedule_update,
            )
        )
        self.async_on_remove(
            async_dispatcher_connect(
                self.hass,
                signal_commands(self._hub.entry_id),
                self._schedule_update,
            )
        )
        self.async_on_remove(
            async_dispatcher_connect(
                self.hass,
                signal_macros(self._hub.entry_id),
                self._schedule_update,
            )
        )

    @callback
    def _schedule_update(self) -> None:
        self.async_write_ha_state()

    async def async_turn_off(self, **kwargs: Any) -> None:
        await self._hub.async_power_off_current()

    async def async_turn_on(self, activity: str | None = None, **kwargs: Any) -> None:
        if activity:
            act_id = self._hub.get_id_by_activity_name(activity)
            if act_id is not None:
                await self._hub.async_activate_activity(act_id)

    async def async_send_command(self, command, **kwargs: Any) -> None:
        if isinstance(command, str):
            commands = [command]
        else:
            commands = command

        device = kwargs.get("device")

        for cmd in commands:
            await self._hub.async_send_key(cmd, device=device)
