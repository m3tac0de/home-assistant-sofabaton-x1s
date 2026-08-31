"""Infrared emitter entity: the hub as an HA Infrared platform citizen.

One ``InfraredEmitterEntity`` per config entry. Consumer integrations
(Samsung Infrared, LG Infrared, AC climate, ...) select it and hand us
typed protocol commands; we render their raw timings into the
live-validated Sofabaton blob layout and fire them one-shot through the
hub's IR blaster (``play_ir_blob``), nothing stored.

This platform is only forwarded when the HA core provides the
``infrared`` building-block domain (see ``_supported_platforms`` in
``__init__.py``); on older cores the integration behaves as before.

Roadmap: docs/internal/ha-infrared-plan.md (IR4). Repeat policy note:
consumer integrations decide repeat_count themselves before handing us
the command, so no policy is applied here - we transmit exactly the
frames the command renders.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

import voluptuous as vol

from homeassistant.components.infrared import InfraredEmitterEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import config_validation as cv, entity_platform
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.entity import DeviceInfo

from .const import CONF_MAC, DOMAIN, signal_client, signal_hub
from .hub import get_hub_display_name, get_hub_model
from .lib.blob_decoders import build_raw_ir_blob_body, parse_pronto_hex

if TYPE_CHECKING:
    from infrared_protocols.commands import Command as InfraredCommand

_LOGGER = logging.getLogger(__name__)

SERVICE_SEND_PRONTO = "send_pronto"


class ProntoHexCommand:
    """A user-pasted pronto code, shaped like an infrared command.

    Satisfies the emitter contract (``modulation`` +
    ``get_raw_timings``) without importing infrared-protocols, so
    ``send_pronto`` is library-version-independent. The class name and
    repr are what the intercept sensor shows.
    """

    def __init__(self, *, timings: list[int], carrier_hz: int) -> None:
        self.modulation = int(carrier_hz)
        self._timings = list(timings)

    def get_raw_timings(self) -> list[int]:
        # Positional alternation; signs are informational only.
        return [
            value if index % 2 == 0 else -value
            for index, value in enumerate(self._timings)
        ]

    def __repr__(self) -> str:
        return (
            f"ProntoHexCommand({len(self._timings)} timings, "
            f"{self.modulation} Hz)"
        )


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities,
) -> None:
    hub = hass.data[DOMAIN][entry.entry_id]
    async_add_entities([SofabatonInfraredEmitter(hub, entry)])

    platform = entity_platform.async_get_current_platform()
    platform.async_register_entity_service(
        SERVICE_SEND_PRONTO,
        {vol.Required("pronto"): cv.string},
        "async_send_pronto",
    )


class SofabatonInfraredEmitter(InfraredEmitterEntity):
    """IR emitter backed by the hub's one-shot blob playback."""

    _attr_has_entity_name = True
    _attr_translation_key = "ir_emitter"

    def __init__(self, hub, entry: ConfigEntry) -> None:
        self._hub = hub
        self._entry = entry
        self._attr_unique_id = f"{entry.data[CONF_MAC]}_ir_emitter"

    @property
    def available(self) -> bool:
        # Mirrors the remote entity: TCP-connected hub, vendor app not
        # holding the proxy (the single-writer gate for play_ir_blob).
        return self._hub.hub_connected and not self._hub.client_connected

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
        await super().async_added_to_hass()
        for signal in (
            signal_hub(self._hub.entry_id),
            signal_client(self._hub.entry_id),
        ):
            self.async_on_remove(
                async_dispatcher_connect(self.hass, signal, self._schedule_update)
            )

    def _schedule_update(self, *_args) -> None:
        self.schedule_update_ha_state()

    async def async_send_pronto(self, pronto: str) -> None:
        """Entity service: decode a pronto hex string and emit it.

        The pronto arithmetic is parsed by our own
        ``parse_pronto_hex`` (lib), NOT the infrared-protocols library -
        its pronto API differs between the versions HA cores pin, so the
        action works identically on every core the emitter exists on.
        Routes through ``async_send_command_internal`` so the send is
        indistinguishable from a consumer integration's - the emitter
        timestamp updates and the intercept sensor records it.
        """

        try:
            timings, carrier_hz = parse_pronto_hex(str(pronto).strip())
        except ValueError as err:
            raise HomeAssistantError(f"Invalid pronto hex: {err}") from err
        await self.async_send_command_internal(
            ProntoHexCommand(timings=timings, carrier_hz=carrier_hz)
        )

    async def async_send_command(self, command: "InfraredCommand") -> None:
        try:
            timings = [int(t) for t in command.get_raw_timings()]
            carrier_hz = int(command.modulation)
            blob = build_raw_ir_blob_body(timings, carrier_hz)
        except (ValueError, TypeError, AttributeError) as err:
            raise HomeAssistantError(
                f"Could not render infrared command for the hub: {err}"
            ) from err

        ok = await self._hub.async_play_ir_blob(blob)
        if not ok:
            raise HomeAssistantError(
                "Hub is not ready to send infrared (connected? Sofabaton app attached?)"
            )
        recorder = getattr(self._hub, "record_ir_emission", None)
        if recorder is not None:
            # IR5 intercept hook: the hub keeps a ring of recent sends
            # for the intercept sensor. Absent until IR5 lands.
            recorder(command=command, timings=timings, carrier_hz=carrier_hz, blob=blob)
