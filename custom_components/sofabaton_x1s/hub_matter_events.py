"""The X2's Matter buttons as hub events (docs/internal/matter-events-plan.md).

When an X2 is linked to Matter and Home Assistant's Matter integration holds
it, each of the hub's 8 Matter buttons is an event entity there. This mixin
finds those entities for this hub (matter_link), and when one fires it runs
the action stored for that button and press type, pulses the Wifi Commands
sensor like any press, and lights the row in the Events subtab.
"""

from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Any

from homeassistant.core import callback
from homeassistant.helpers.dispatcher import async_dispatcher_connect, async_dispatcher_send
from homeassistant.helpers.event import async_call_later, async_track_state_change_event

from .command_config import async_get_command_config_store
from .const import DOMAIN, HUB_VERSION_X2, signal_devices, signal_ip_commands
from .lib.protocol_const import MATTER_DEVICE_ID, is_hub_owned_device
from .matter_link import (
    MatterHubDevice,
    async_read_matter_record,
    find_sofabaton_matter_devices,
    record_matches_hub,
)

# Home Assistant's event types for a Generic Switch, as the Wifi Commands
# sensor's press types.
MATTER_PRESS_TYPES = {
    "multi_press_1": "short",
    "multi_press_2": "double",
    "long_press": "long",
    "long_release": "release",
}
# Registry changes come in bursts (a pairing adds a device and ~30 entities).
_MATTER_REFRESH_DELAY_S = 2.0
# A Matter record that did not answer is asked again after this long.
_MATTER_RECORD_RETRY_S = 60.0
# An event older than this is a restored state, not a press.
_MATTER_PRESS_MAX_AGE_S = 30.0
_DEVICE_REGISTRY_UPDATED = "device_registry_updated"
_ENTITY_REGISTRY_UPDATED = "entity_registry_updated"


class HubMatterEventsMixin:
    """The X2's Matter buttons as hub events."""

    def _matter_events_init(self) -> None:
        self._matter_link: MatterHubDevice | None = None
        self._matter_link_reason: str | None = "not_x2"
        self._matter_candidates: list[MatterHubDevice] = []
        self._matter_listeners: list[Any] = []
        self._matter_state_unsub: Any = None
        self._matter_refresh_unsub: Any = None
        # Matter record per instance: (record or None, monotonic time read).
        self._matter_records: dict[str, tuple[dict[str, Any] | None, float]] = {}

    # -- lifecycle ---------------------------------------------------------------------------

    def _start_matter_events(self) -> None:
        """Watch the registries and our catalog (X2 only); idempotent."""

        if self.version != HUB_VERSION_X2 or self._matter_listeners:
            return
        bus = self.hass.bus
        self._matter_listeners = [
            bus.async_listen(_DEVICE_REGISTRY_UPDATED, self._on_matter_registry_change),
            bus.async_listen(_ENTITY_REGISTRY_UPDATED, self._on_matter_registry_change),
            async_dispatcher_connect(self.hass, signal_devices(self.entry_id), self._schedule_matter_refresh),
        ]
        self._schedule_matter_refresh()

    def _stop_matter_events(self) -> None:
        for unsub in self._matter_listeners:
            unsub()
        self._matter_listeners = []
        if self._matter_refresh_unsub is not None:
            self._matter_refresh_unsub()
            self._matter_refresh_unsub = None
        self._set_matter_link(None, "not_x2" if self.version != HUB_VERSION_X2 else "stopped")

    @callback
    def _on_matter_registry_change(self, _event: Any = None) -> None:
        self._schedule_matter_refresh()

    @callback
    def _schedule_matter_refresh(self, *_args: Any) -> None:
        if self._matter_refresh_unsub is not None:
            self._matter_refresh_unsub()

        @callback
        def _fire(_now: Any) -> None:
            self._matter_refresh_unsub = None
            self.hass.async_create_task(self._async_refresh_matter_link())

        self._matter_refresh_unsub = async_call_later(self.hass, _MATTER_REFRESH_DELAY_S, _fire)

    # -- finding this hub's Matter device -----------------------------------------------------

    def _hub_matter_linked(self) -> bool:
        """Our own catalog shows the hub linked to Matter (device 51)."""

        return is_hub_owned_device((self.devices or {}).get(MATTER_DEVICE_ID))

    def _x2_hub_count(self) -> int:
        hubs = (self.hass.data.get(DOMAIN) or {}).values()
        return sum(1 for hub in hubs if getattr(hub, "version", None) == HUB_VERSION_X2 and hasattr(hub, "_matter_link"))

    async def _async_matter_record(self, instance: str) -> dict[str, Any] | None:
        cached = self._matter_records.get(instance)
        now = time.monotonic()
        if cached is not None and (cached[0] is not None or now - cached[1] < _MATTER_RECORD_RETRY_S):
            return cached[0]
        try:
            record = await async_read_matter_record(self.hass, instance)
        except Exception as err:  # pragma: no cover - zeroconf boundary
            self._log.debug("[MATTER] reading the Matter record %s failed: %s", instance, err)
            record = None
        self._matter_records[instance] = (record, now)
        return record

    async def _async_refresh_matter_link(self) -> None:
        if self.version != HUB_VERSION_X2:
            self._set_matter_link(None, "not_x2")
            return
        if not self._hub_matter_linked():
            self._set_matter_link(None, "hub_not_linked")
            return
        candidates = [device for device in find_sofabaton_matter_devices(self.hass) if device.buttons]
        self._matter_candidates = candidates
        if not candidates:
            self._set_matter_link(None, "no_matter_device")
            return
        store = await async_get_command_config_store(self.hass)
        picked = store.get_matter_device_choice(self.entry_id)
        chosen = next((device for device in candidates if device.device_id == picked), None)
        if chosen is None:
            for device in candidates:
                if not device.instance:
                    continue
                record = await self._async_matter_record(device.instance)
                if record and record_matches_hub(record, mac=self.mac, host=self.host):
                    chosen = device
                    break
        if chosen is None and len(candidates) == 1 and self._x2_hub_count() == 1:
            chosen = candidates[0]
        self._set_matter_link(chosen, None if chosen else "ambiguous")

    def _set_matter_link(self, device: MatterHubDevice | None, reason: str | None) -> None:
        previous = self._matter_link
        self._matter_link = device
        self._matter_link_reason = reason
        entity_ids = sorted(button.entity_id for button in device.buttons.values()) if device else []
        previous_ids = sorted(button.entity_id for button in previous.buttons.values()) if previous else []
        if entity_ids == previous_ids and (self._matter_state_unsub is not None or not entity_ids):
            return
        if self._matter_state_unsub is not None:
            self._matter_state_unsub()
            self._matter_state_unsub = None
        if entity_ids:
            self._matter_state_unsub = async_track_state_change_event(
                self.hass, entity_ids, self._on_matter_button_state
            )
            self._log.info(
                "[MATTER] following %d button(s) of the Matter device '%s'", len(entity_ids), device.name
            )

    # -- a press ------------------------------------------------------------------------------

    @callback
    def _on_matter_button_state(self, event: Any) -> None:
        data = getattr(event, "data", None) or {}
        old_state, new_state = data.get("old_state"), data.get("new_state")
        if new_state is None or new_state.state in ("unknown", "unavailable"):
            return
        if old_state is not None and new_state.state == old_state.state:
            return
        # An event entity's state is the time of its last event. A restore
        # (a restart, the Matter integration reloading) brings back an old
        # one; only a fresh time is a press.
        try:
            fired = datetime.fromisoformat(str(new_state.state))
        except ValueError:
            return
        if fired.tzinfo is None or abs((datetime.now(timezone.utc) - fired).total_seconds()) > _MATTER_PRESS_MAX_AGE_S:
            return
        event_type = str(new_state.attributes.get("event_type") or "")
        link = self._matter_link
        if not event_type or link is None:
            return
        number = next(
            (button.number for button in link.buttons.values() if button.entity_id == new_state.entity_id), None
        )
        if number is None:
            return
        self._record_matter_press(number, event_type)
        self._notify_hub_event({"type": "matter", "button": number, "event_type": event_type})
        self.hass.async_create_task(self._async_run_matter_action(number, event_type))

    def _matter_button_names(self) -> dict[int, str]:
        """The hub's own names for its Matter buttons (renameable), by number."""

        try:
            commands, _complete = self._proxy.get_commands_for_entity(MATTER_DEVICE_ID, fetch_if_missing=False)
        except Exception:  # pragma: no cover - defensive, engine boundary
            commands = {}
        return {int(cid): str(label) for cid, label in (commands or {}).items() if str(label or "").strip()}

    def _record_matter_press(self, number: int, event_type: str) -> None:
        """The press becomes the last command record, so the Wifi Commands
        sensor pulses for it like for a Wifi press (plan D4b)."""

        device_name = str(((self.devices or {}).get(MATTER_DEVICE_ID) or {}).get("name") or "Matter")
        button_name = self._matter_button_names().get(number) or f"Button {number}"
        now = datetime.now(timezone.utc)
        self._last_ip_command = {
            "entity_id": MATTER_DEVICE_ID,
            "entity_kind": "device",
            "entity_name": device_name,
            "command_id": button_name,
            "command_index": None,
            "command_label": button_name,
            "button_label": button_name,
            "press_type": MATTER_PRESS_TYPES.get(event_type, event_type),
            "timestamp": now.timestamp(),
            "iso_time": now.isoformat(),
            "source_ip": "",
            "path": "",
            "body": "",
            "headers": {},
            "transport": "matter",
        }
        async_dispatcher_send(self.hass, signal_ip_commands(self.entry_id))

    async def _async_run_matter_action(self, number: int, event_type: str) -> None:
        try:
            store = await async_get_command_config_store(self.hass)
            action = (store.get_matter_event_actions(self.entry_id).get(str(number)) or {}).get(event_type)
            if action:
                await self._async_execute_action_config(action)
        except Exception as err:  # pragma: no cover - service boundary
            self._log.warning(
                "[%s] Failed executing the Matter button %s action '%s': %s", self.entry_id, number, event_type, err
            )

    # -- the card's view ----------------------------------------------------------------------

    def matter_events_view(self) -> dict[str, Any]:
        """What the Events subtab needs: whether the section shows, and the
        buttons in the hub's names with the press types HA declares."""

        link = self._matter_link
        names = self._matter_button_names()
        return {
            "available": link is not None,
            "reason": self._matter_link_reason,
            "device": {"id": link.device_id, "name": link.name} if link else None,
            "candidates": (
                [{"id": device.device_id, "name": device.name} for device in self._matter_candidates]
                if self._matter_link_reason == "ambiguous"
                else []
            ),
            "buttons": [
                {
                    "button": button.number,
                    "name": names.get(button.number) or f"Button {button.number}",
                    "entity_id": button.entity_id,
                    "event_types": list(button.event_types),
                }
                for button in (link.buttons.values() if link else [])
            ],
        }
