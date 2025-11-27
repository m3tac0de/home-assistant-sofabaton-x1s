from __future__ import annotations

from homeassistant.components.sensor import SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import callback
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.entity import DeviceInfo, EntityCategory

from .const import (
    DOMAIN,
    CONF_MAC,
    CONF_NAME,
    signal_activity,
    signal_buttons,
    signal_devices,
    signal_commands,
    signal_app_activations,
)
from .hub import SofabatonHub, get_hub_model


async def async_setup_entry(hass, entry: ConfigEntry, async_add_entities):
    hub: SofabatonHub = hass.data[DOMAIN][entry.entry_id]
    async_add_entities(
        [
            SofabatonIndexSensor(hub, entry),
            SofabatonActivitySensor(hub, entry),
        ]
    )


class SofabatonIndexSensor(SensorEntity):
    _attr_should_poll = False
    _attr_entity_category = EntityCategory.DIAGNOSTIC

    def __init__(self, hub: SofabatonHub, entry: ConfigEntry) -> None:
        self._hub = hub
        self._entry = entry
        self._attr_name = f"{entry.data[CONF_NAME]} index"
        self._attr_unique_id = f"{entry.data[CONF_MAC]}_index"

    @property
    def device_info(self) -> DeviceInfo:
        return DeviceInfo(
            identifiers={(DOMAIN, self._entry.data[CONF_MAC])},
            name=self._entry.data[CONF_NAME],
            model=get_hub_model(self._entry),
        )

    async def async_added_to_hass(self) -> None:
        for sig in (
            signal_activity(self._hub.entry_id),
            signal_buttons(self._hub.entry_id),
            signal_devices(self._hub.entry_id),
            signal_commands(self._hub.entry_id),
            signal_app_activations(self._hub.entry_id),
        ):
            self.async_on_remove(
                async_dispatcher_connect(self.hass, sig, self._handle_update)
            )

    @callback
    def _handle_update(self) -> None:
        self.async_write_ha_state()

    @property
    def state(self) -> str:
        if not self._hub.hub_connected:
            return "offline"
        # if we are currently fetching commands for at least one device/activity
        if getattr(self._hub, "_commands_in_flight", None):
            if len(self._hub._commands_in_flight) > 0:
                return "loading"
        return "ready"

    def _label_for_ent(self, ent_id: int) -> str:
        """Return something like '3 (Playstation 5)' or '102 (Watch TV)'."""
        name = None
        if getattr(self._hub, "devices", None):
            dev = self._hub.devices.get(ent_id)
            if dev:
                name = dev.get("name")
        if name is None and self._hub.activities:
            act = self._hub.activities.get(ent_id)
            if act:
                name = act.get("name")

        if name:
            return f"{ent_id} ({name})"
        return str(ent_id)

    @property
    def extra_state_attributes(self) -> dict:
        # 1) buttons (current)
        current_btn_codes, current_ready = self._hub.get_buttons_for_current()
        button_name_map = self._hub.get_button_name_map()

        if current_ready:
            current_activity_buttons = [
                {
                    "code": code,
                    "name": button_name_map.get(code, f"0x{code:02X}"),
                }
                for code in current_btn_codes
            ]
        else:
            current_activity_buttons = []

        # 2) buttons (all cached per-entity)
        all_btns_by_ent = self._hub.get_all_cached_buttons()
        decorated_buttons: dict[str, list[dict[str, str | int]]] = {}
        for ent_id, codes in all_btns_by_ent.items():
            label = self._label_for_ent(ent_id)
            decorated_buttons[label] = [
                {
                    "code": code,
                    "name": button_name_map.get(code, f"0x{code:02X}"),
                }
                for code in codes
            ]

        # 3) commands (per-entity, already in proxy cache)
        commands_raw = self._hub.get_all_cached_commands()
        decorated_commands: dict[str, list[dict[str, str | int]]] = {}
        for ent_id, cmd_map in commands_raw.items():
            label = self._label_for_ent(ent_id)
            decorated_commands[label] = [
                {
                    "code": int(code),
                    "name": name,
                }
                for code, name in cmd_map.items()
            ]

        # 4) app-sourced activation requests
        recent_app_requests = []
        for record in self._hub.get_app_activations():
            ent_id = int(record.get("entity_id", -1))
            label = self._label_for_ent(ent_id) if ent_id >= 0 else None
            service_data = {
                "command": record.get("command_id"),
                "device": ent_id if ent_id >= 0 else None,
            }

            recent_app_requests.append(
                {
                    "timestamp": record.get("iso_time") or record.get("timestamp"),
                    "direction": record.get("direction"),
                    "entity_id": ent_id,
                    "entity_label": label,
                    "entity_kind": record.get("entity_kind"),
                    "entity_name": record.get("entity_name"),
                    "command_id": record.get("command_id"),
                    "command_label": record.get("command_label")
                    or record.get("button_label"),
                    "button_label": record.get("button_label"),
                    "example_remote_send_command": service_data,
                }
            )

        return {
            "activities": self._hub.activities,
            "devices": getattr(self._hub, "devices", {}),
            "current_activity": self._hub.current_activity,
            "current_activity_buttons": current_activity_buttons,
            "buttons": decorated_buttons,
            "commands": decorated_commands,
            "recent_app_activations": recent_app_requests,
        }

class SofabatonActivitySensor(SensorEntity):
    """Shows the current activity name (or 'Powered Off')."""

    _attr_should_poll = False
    # No entity_category here -> it's a normal sensor, not diagnostic

    def __init__(self, hub: SofabatonHub, entry: ConfigEntry) -> None:
        self._hub = hub
        self._entry = entry
        self._attr_name = f"{entry.data[CONF_NAME]} activity"
        self._attr_unique_id = f"{entry.data[CONF_MAC]}_activity"

    @property
    def device_info(self) -> DeviceInfo:
        return DeviceInfo(
            identifiers={(DOMAIN, self._entry.data[CONF_MAC])},
            name=self._entry.data[CONF_NAME],
            model=get_hub_model(self._entry),
        )

    async def async_added_to_hass(self) -> None:
        # Update when the activity changes
        self.async_on_remove(
            async_dispatcher_connect(
                self.hass,
                signal_activity(self._hub.entry_id),
                self._handle_update,
            )
        )

    @callback
    def _handle_update(self) -> None:
        self.async_write_ha_state()

    @property
    def available(self) -> bool:
        return self._hub.hub_connected

    @property
    def state(self) -> str:
        """Return the current activity name, or 'Powered Off' if none."""
        # If the hub isn't connected you *could* return None or 'offline';
        # for now we'll just base it purely on the activity.
        act_id = self._hub.current_activity
        if act_id is None:
            return "Powered Off"

        name = self._hub.get_activity_name_by_id(act_id)
        if name:
            return name

        # Fallback if name lookup fails
        return f"Activity {act_id}"