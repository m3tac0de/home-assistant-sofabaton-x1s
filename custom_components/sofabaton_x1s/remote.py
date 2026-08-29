from __future__ import annotations
import asyncio
from typing import Any

from homeassistant.components.remote import (
    ATTR_DELAY_SECS,
    RemoteEntity,
    RemoteEntityFeature,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.entity import DeviceInfo
from .const import (
    DOMAIN,
    CONF_MAC,
    signal_activity,
    signal_hub,
    signal_client,
    signal_buttons,
    signal_commands,
    signal_devices,
    signal_macros,
)
from .hub import get_hub_display_name, get_hub_model

# Home Assistant leaves ``delay_secs`` unset when the caller omits it, so the
# integration picks its own default. We keep sending back-to-back like we always
# have instead of adopting the core default of 0.4 s, so existing automations do
# not suddenly get slower.
DEFAULT_DELAY_SECS = 0.0


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities,
) -> None:
    hub = hass.data[DOMAIN][entry.entry_id]
    async_add_entities([SofabatonRemote(hub, entry)])


class SofabatonRemote(RemoteEntity):
    _attr_has_entity_name = True
    _attr_translation_key = "remote"

    def __init__(self, hub, entry: ConfigEntry) -> None:
        self._hub = hub
        self._entry = entry
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
        hub_mac_raw = self._hub.mac or self._entry.data.get(CONF_MAC)
        hub_mac = None
        if hub_mac_raw:
            hub_mac = (
                str(hub_mac_raw)
                .replace(":", "")
                .replace("-", "")
                .strip()
                .upper()
            )

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
                    "button_id": fav.get("button_id"),
                }
                for fav in favorites
                if fav.get("command_id") is not None
            ]
        # Device mode (remote card): the dropdown catalog. Published only
        # while the persistent cache is enabled — device mode is gated on it
        # (docs/internal/device-mode-plan.md), so its absence doubles as the
        # card's capability signal. Wifi Events is filtered inside
        # get_ui_device_list (presentation layer only).
        devices: list[dict[str, Any]] | None = None
        # Transparent long-press (docs/internal/long-press-plan.md): the
        # resolved long-press pair per bound hard button, per entity page
        # (activity ids and device ids share one keymap-detail namespace).
        # The card fires a pair through the ordinary favorites-style
        # `send_command {command, device}` — long-press exists ONLY in the
        # card, never in the remote entity or its services. Published only
        # while the persistent cache is enabled, mirroring `devices`, so
        # its absence doubles as the card's capability signal.
        long_press_keys: dict[str, dict[str, dict[str, int]]] | None = None
        hass = getattr(self, "hass", None)
        if hass is not None:
            cache_store = hass.data.get(DOMAIN, {}).get("persistent_cache_store")
            if bool(getattr(cache_store, "enabled", False)):
                devices = self._hub.get_ui_device_list()
                long_press_keys = {}
                for ent_id, details in self._hub.get_all_cached_button_details().items():
                    bindings: dict[str, dict[str, int]] = {}
                    for button_id, row in details.items():
                        lp_device = row.get("long_press_device_id")
                        lp_command = row.get("long_press_command_id")
                        if lp_device and lp_command is not None:
                            bindings[str(int(button_id))] = {
                                "device_id": int(lp_device),
                                "command_id": int(lp_command),
                            }
                    if bindings:
                        long_press_keys[str(ent_id)] = bindings

        mdns_txt = self._entry.data.get("mdns_txt", {})
        hub_version_confident = (
            isinstance(mdns_txt, dict) and mdns_txt.get("HVER") is not None
        )
        attrs = {
            "proxy_client_connected": self._hub.client_connected,
            "cache_generation": self._hub.cache_generation,
            "hub_version": get_hub_model(self._entry),
            "hub_version_confident": hub_version_confident,
            "hub_mac": hub_mac,
            "activities": activities,
            "assigned_keys": assigned_keys,
            "macro_keys": macro_keys,
            "favorite_keys": favorite_keys,
            "current_activity_id": activity_id,
            "load_state": self._hub.get_index_state(),
            "entry_id": self._entry.entry_id,
        }
        if devices is not None:
            attrs["devices"] = devices
        if long_press_keys is not None:
            attrs["long_press_keys"] = long_press_keys
        return attrs

    @property
    def device_info(self) -> DeviceInfo:
        firmware = getattr(self._hub, "hub_firmware_version", None)
        return DeviceInfo(
            identifiers={(DOMAIN, self._entry.data[CONF_MAC])},
            name=get_hub_display_name(self._hub, self._entry),
            manufacturer="Sofabaton",
            model=get_hub_model(self._entry),
            sw_version=str(firmware) if firmware is not None else None,
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
        self.async_on_remove(
            async_dispatcher_connect(
                self.hass,
                signal_devices(self._hub.entry_id),
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
        delay_secs = kwargs.get(ATTR_DELAY_SECS)
        if delay_secs is None:
            delay_secs = DEFAULT_DELAY_SECS
        delay_secs = float(delay_secs)

        for index, cmd in enumerate(commands):
            # Wait between commands only, never after the last one.
            if index and delay_secs > 0:
                await asyncio.sleep(delay_secs)
            await self._hub.async_send_key(cmd, device=device)
