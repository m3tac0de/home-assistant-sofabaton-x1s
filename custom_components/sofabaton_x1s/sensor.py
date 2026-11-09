from __future__ import annotations

from homeassistant.components.sensor import SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import callback
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.entity import DeviceInfo, EntityCategory
from homeassistant.helpers.event import async_call_later

from .const import (
    DOMAIN,
    CONF_MAC,
    infrared_platform_available,
    signal_activity,
    signal_buttons,
    signal_devices,
    signal_commands,
    signal_hub,
    signal_macros,
    signal_ip_commands,
    signal_ir_intercept,
    signal_wifi_device,
)
from .hub import SofabatonHub, hub_device_info


async def async_setup_entry(hass, entry: ConfigEntry, async_add_entities):
    hub: SofabatonHub = hass.data[DOMAIN][entry.entry_id]
    entities = [
        SofabatonIndexSensor(hub, entry),
        SofabatonActivitySensor(hub, entry),
        SofabatonIpCommandsSensor(hub, entry),
    ]
    if infrared_platform_available():
        # Only meaningful alongside the emitter entity that feeds it.
        entities.append(SofabatonIrInterceptSensor(hub, entry))
    async_add_entities(entities)


class SofabatonIndexSensor(SensorEntity):
    _attr_should_poll = False
    _attr_has_entity_name = True
    _attr_translation_key = "index"
    _attr_entity_category = EntityCategory.DIAGNOSTIC
    # The whole cached catalog: far past the recorder's attribute limit,
    # and the tools card reads it over WS anyway (CR-H3-13).
    _unrecorded_attributes = frozenset({"activities", "devices"})

    def __init__(self, hub: SofabatonHub, entry: ConfigEntry) -> None:
        self._hub = hub
        self._entry = entry
        self._attr_unique_id = f"{entry.data[CONF_MAC]}_index"

    @property
    def device_info(self) -> DeviceInfo:
        return hub_device_info(self._hub, self._entry)

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
    _attr_has_entity_name = True
    _attr_translation_key = "activity"
    # No entity_category here -> it's a normal sensor, not diagnostic

    def __init__(self, hub: SofabatonHub, entry: ConfigEntry) -> None:
        self._hub = hub
        self._entry = entry
        self._attr_unique_id = f"{entry.data[CONF_MAC]}_activity"

    @property
    def device_info(self) -> DeviceInfo:
        return hub_device_info(self._hub, self._entry)

    async def async_added_to_hass(self) -> None:
        # Update when the activity changes, and when the hub drops or comes
        # back (a disconnect sends only signal_hub, CR-H3-7).
        for sig in (signal_activity(self._hub.entry_id), signal_hub(self._hub.entry_id)):
            self.async_on_remove(async_dispatcher_connect(self.hass, sig, self._handle_update))

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


class SofabatonIpCommandsSensor(SensorEntity):
    _attr_should_poll = False
    _attr_force_update = True
    _attr_has_entity_name = True
    # Stable identifier surfaced in the frontend entity registry; used by the
    # Control Panel card's getEntitySuggestion to recommend itself for this
    # entity. The matching translations entry keeps the displayed name intact.
    _attr_translation_key = "ip_commands"

    _DEFAULT_VALUE = "Waiting for button press"

    def __init__(self, hub: SofabatonHub, entry: ConfigEntry) -> None:
        self._hub = hub
        self._entry = entry
        self._attr_unique_id = f"{entry.data[CONF_MAC]}_ip_commands"
        self._display_command: dict | None = None
        self._reset_unsub = None

    @property
    def device_info(self) -> DeviceInfo:
        return hub_device_info(self._hub, self._entry)

    async def async_added_to_hass(self) -> None:
        self.async_on_remove(
            async_dispatcher_connect(
                self.hass,
                signal_ip_commands(self._hub.entry_id),
                self._handle_ip_command,
            )
        )
        self.async_on_remove(
            async_dispatcher_connect(
                self.hass,
                signal_wifi_device(self._hub.entry_id),
                self._handle_wifi_device_toggle,
            )
        )

    @callback
    def _handle_wifi_device_toggle(self) -> None:
        self.async_write_ha_state()

    @callback
    def _handle_ip_command(self) -> None:
        if self._reset_unsub:
            self._reset_unsub()
            self._reset_unsub = None

        if self._display_command is not None:
            self._display_command = None
            self.async_write_ha_state()

        self._display_command = self._hub.get_last_ip_command()
        self._reset_unsub = async_call_later(self.hass, 0.3, self._reset_state)
        self.async_write_ha_state()

    @callback
    def _reset_state(self, _now) -> None:
        self._display_command = None
        self._reset_unsub = None
        self.async_write_ha_state()

    @property
    def available(self) -> bool:
        # Always available: presses can arrive over the HTTP listener OR
        # over MQTT (mqtt-transport-plan §6), so tying availability to
        # the listener switch would blank the sensor in an MQTT-only
        # setup. At-rest it simply shows its waiting state.
        return True

    @property
    def state(self) -> str:
        if not self._display_command:
            return self._DEFAULT_VALUE

        device = self._display_command.get("entity_name") or "Unknown device"
        command = self._display_command.get("command_label") or "Unknown command"
        press_type = self._display_command.get("press_type") or "short"
        # double and release come from the X2's Matter buttons only.
        suffix = {"long": "/longpress", "double": "/doublepress", "release": "/release"}.get(press_type, "")
        return f"{device}/{command}{suffix}"

    @property
    def extra_state_attributes(self) -> dict:
        if not self._display_command:
            return {
                "received_command": self._DEFAULT_VALUE,
                "from_device": self._DEFAULT_VALUE,
                "press_type": "Unknown",
                "timestamp": None,
                "source_ip": None,
                "transport": None,
            }

        return {
            "received_command": self._display_command.get("command_label")
            or "Unknown command",
            "from_device": self._display_command.get("entity_name")
            or "Unknown device",
            "press_type": self._display_command.get("press_type") or "short",
            "timestamp": self._display_command.get("iso_time")
            or self._display_command.get("timestamp"),
            # Empty for MQTT deliveries by design (no source ip exists on a
            # broker hop; never faked).
            "source_ip": self._display_command.get("source_ip"),
            "transport": self._display_command.get("transport") or "http",
        }


class SofabatonIrInterceptSensor(SensorEntity):
    """Last command intercepted by the infrared emitter entity (IR5).

    State is the factual label of the most recent send (command class
    name + payload digest); attributes carry the hub-ready payload hex
    so a working command can be persisted through the payload editor's
    Test/Save flow. Only created when the HA core ships the infrared
    domain (no emitter, nothing to intercept).
    """

    _attr_should_poll = False
    _attr_has_entity_name = True
    _attr_translation_key = "ir_intercept"
    _attr_entity_category = EntityCategory.DIAGNOSTIC
    _attr_entity_registry_enabled_default = False

    _DEFAULT_VALUE = "Waiting for infrared send"

    def __init__(self, hub: SofabatonHub, entry: ConfigEntry) -> None:
        self._hub = hub
        self._entry = entry
        self._attr_unique_id = f"{entry.data[CONF_MAC]}_ir_intercept"

    @property
    def device_info(self) -> DeviceInfo:
        return hub_device_info(self._hub, self._entry)

    async def async_added_to_hass(self) -> None:
        self.async_on_remove(
            async_dispatcher_connect(
                self.hass,
                signal_ir_intercept(self._hub.entry_id),
                self._handle_ir_intercept,
            )
        )

    @callback
    def _handle_ir_intercept(self) -> None:
        self.async_write_ha_state()

    def _last_emission(self) -> dict | None:
        emissions = self._hub.get_ir_emissions()
        return emissions[-1] if emissions else None

    @property
    def native_value(self) -> str:
        last = self._last_emission()
        if last is None:
            return self._DEFAULT_VALUE
        return last["label"]

    @property
    def extra_state_attributes(self) -> dict:
        last = self._last_emission()
        if last is None:
            return {"recent": []}
        recent = [
            {"label": rec["label"], "when": rec["when"], "count": rec["count"]}
            for rec in self._hub.get_ir_emissions()[-5:]
        ]
        return {
            "label": last["label"],
            "command": last["command_repr"],
            "carrier_hz": last["carrier_hz"],
            "timing_count": last["timing_count"],
            "payload_hex": last["payload_hex"],
            "when": last["when"],
            "count": last["count"],
            "recent": recent,
        }
