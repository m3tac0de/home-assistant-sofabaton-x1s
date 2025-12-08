from __future__ import annotations

from datetime import timedelta

from homeassistant.components.sensor import SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import callback
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.entity import DeviceInfo, EntityCategory
from homeassistant.helpers.event import async_track_time_interval
from homeassistant.util import dt as dt_util

from .const import (
    DOMAIN,
    CONF_MAC,
    CONF_NAME,
    signal_activity,
    signal_buttons,
    signal_devices,
    signal_commands,
    signal_hub,
    signal_macros,
    signal_app_activations,
)
from .hub import SofabatonHub, get_hub_model


async def async_setup_entry(hass, entry: ConfigEntry, async_add_entities):
    hub: SofabatonHub = hass.data[DOMAIN][entry.entry_id]
    async_add_entities(
        [
            SofabatonIndexSensor(hub, entry),
            SofabatonActivitySensor(hub, entry),
            SofabatonRecordedKeypressSensor(hub, entry),
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
            signal_devices(self._hub.entry_id),
            signal_commands(self._hub.entry_id),
            signal_buttons(self._hub.entry_id),
            signal_hub(self._hub.entry_id),
            signal_macros(self._hub.entry_id),
        ):
            self.async_on_remove(
                async_dispatcher_connect(self.hass, sig, self._handle_update)
            )

    @callback
    def _handle_update(self) -> None:
        self.async_write_ha_state()

    @property
    def state(self) -> str | None:
        return self._hub.get_index_state()

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
        # commands (per-entity, already in proxy cache)
        commands_raw = self._hub.get_all_cached_commands()
        decorated_commands: dict[int, list[dict[str, str | int]]] = {}
        for ent_id, cmd_map in commands_raw.items():
            decorated_commands[ent_id] = [
                {
                    "name": name,
                    "command": int(code),
                }
                for code, name in cmd_map.items()
            ]

        macros_by_activity = self._hub.get_all_cached_macros()
        favorite_commands = self._hub.get_activity_favorites()
        decorated_activities: dict[str, dict[str, object]] = {}
        for act_id, activity in self._hub.activities.items():
            activity_attrs: dict[str, object] = dict(activity)
            macros = macros_by_activity.get(act_id, [])
            activity_attrs["macros"] = [
                {
                    "name": macro.get("label") or macro.get("name"),
                    "command": macro.get("command_id"),
                }
                for macro in macros
                if macro.get("command_id") is not None
            ]

            favorites = favorite_commands.get(act_id, [])
            activity_attrs["favorites"] = [
                {
                    "name": fav.get("name"),
                    "command": fav.get("command_id"),
                    "device": fav.get("device_id"),
                }
                for fav in favorites
            ]

            if act_id in decorated_commands:
                activity_attrs["commands"] = decorated_commands[act_id]

            decorated_activities[str(act_id)] = activity_attrs

        decorated_devices: dict[str, dict[str, object]] = {}
        for dev_id, device in getattr(self._hub, "devices", {}).items():
            device_attrs: dict[str, object] = dict(device)

            device_attrs["commands"] = decorated_commands.get(dev_id, [])

            decorated_devices[str(dev_id)] = device_attrs

        return {
            "activities": decorated_activities,
            "devices": decorated_devices,
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


class SofabatonRecordedKeypressSensor(SensorEntity):
    _attr_should_poll = False
    _attr_has_entity_name = True
    _attr_name = "Recorded keypress"
    _attr_entity_category = EntityCategory.DIAGNOSTIC

    def __init__(self, hub: SofabatonHub, entry: ConfigEntry) -> None:
        self._hub = hub
        self._entry = entry
        self._attr_unique_id = f"{entry.data[CONF_MAC]}_recorded_keypress"
        self._last_activation: dict | None = None
        self._time_unsub = None

    @property
    def device_info(self) -> DeviceInfo:
        return DeviceInfo(
            identifiers={(DOMAIN, self._entry.data[CONF_MAC])},
            name=self._entry.data[CONF_NAME],
            model=get_hub_model(self._entry),
        )

    async def async_added_to_hass(self) -> None:
        self._last_activation = self._get_latest_activation()
        self._schedule_time_updates()
        self.async_on_remove(
            async_dispatcher_connect(
                self.hass,
                signal_app_activations(self._hub.entry_id),
                self._handle_app_activation,
            )
        )

    @callback
    def _handle_app_activation(self) -> None:
        self._last_activation = self._get_latest_activation()
        self._schedule_time_updates()
        self.async_write_ha_state()

    def _get_latest_activation(self) -> dict | None:
        activations = self._hub.get_app_activations()
        if not activations:
            return None
        return activations[-1]

    def _schedule_time_updates(self) -> None:
        if self._last_activation is None:
            if self._time_unsub:
                self._time_unsub()
                self._time_unsub = None
            return

        if self._time_unsub is None:
            self._time_unsub = async_track_time_interval(
                self.hass, self._refresh_state, timedelta(seconds=5)
            )
            self.async_on_remove(self._time_unsub)

    @callback
    def _refresh_state(self, _now) -> None:
        if self._last_activation:
            self.async_write_ha_state()
        else:
            if self._time_unsub:
                self._time_unsub()
                self._time_unsub = None

    @property
    def state(self) -> str:
        if not self._last_activation:
            return "No keypress recorded"

        timestamp = self._last_activation.get("timestamp")
        if not timestamp:
            return "Unknown"

        seconds = int(dt_util.utcnow().timestamp() - float(timestamp))
        if seconds < 5:
            return "Just now"
        if seconds < 60:
            return f"{seconds} seconds ago"
        minutes = seconds // 60
        if minutes < 60:
            suffix = "minute" if minutes == 1 else "minutes"
            return f"{minutes} {suffix} ago"
        hours = minutes // 60
        if hours < 24:
            suffix = "hour" if hours == 1 else "hours"
            return f"{hours} {suffix} ago"
        days = hours // 24
        suffix = "day" if days == 1 else "days"
        return f"{days} {suffix} ago"

    def _label_for_ent(self, ent_id: int) -> str:
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

    def _get_remote_entity_id(self) -> str | None:
        entity_registry = er.async_get(self.hass)
        return entity_registry.async_get_entity_id(
            "remote", DOMAIN, f"{self._entry.data[CONF_MAC]}_remote"
        )

    @property
    def extra_state_attributes(self) -> dict:
        if not self._last_activation:
            return {}

        ent_id = int(self._last_activation.get("entity_id", -1))
        label = self._label_for_ent(ent_id) if ent_id >= 0 else None
        service_data = {
            "command": self._last_activation.get("command_id"),
            "device": ent_id if ent_id >= 0 else None,
        }

        example_remote_send_command = {
            "action": "remote.send_command",
            "data": service_data,
        }
        remote_entity_id = self._get_remote_entity_id()
        if remote_entity_id:
            example_remote_send_command["target"] = {"entity_id": remote_entity_id}

        return {
            "timestamp": self._last_activation.get("iso_time")
            or self._last_activation.get("timestamp"),
            "entity_id": ent_id,
            "context_label": label,
            "context_kind": self._last_activation.get("entity_kind"),
            "context_name": self._last_activation.get("entity_name"),
            "command_id": self._last_activation.get("command_id"),
            "command_label": self._last_activation.get("command_label")
            or self._last_activation.get("button_label"),
            "button_label": self._last_activation.get("button_label"),
            "example_remote_send_command": example_remote_send_command,
        }
