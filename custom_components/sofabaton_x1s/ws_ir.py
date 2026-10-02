"""IR WS commands (R6, CR-H2-13).

Blob fetch and play, IR learn and emissions subscriptions, the IR emitter
consumers, the IR library and IR payload conversion.
"""

from __future__ import annotations

import logging
import re
from typing import Any, Mapping

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers import entity_registry as er

from .const import (
    infrared_platform_available,
    DOMAIN,
    signal_ir_intercept,
)
from .hub import SofabatonHub
from . import ir_library
from . import ir_uc_hex
from .lib.commands import build_descriptive_ir_blob_body
from . import runtime

# Same logger name as the package: log lines keep their source name.
_LOGGER = logging.getLogger(__package__)


def _validate_ir_command_name(value: Any) -> str:
    text = str(value or "").strip()
    if not text:
        raise ValueError("command_name is required")
    return text


def _parse_play_ir_blob_input(raw_blob: Any) -> bytes:
    if not isinstance(raw_blob, str) or not raw_blob.strip():
        raise ValueError("blob is required and must be a hex string or descriptor string")

    blob_text = raw_blob.strip()
    if blob_text.startswith("P:"):
        try:
            return build_descriptive_ir_blob_body(blob_text)
        except ValueError as err:
            raise ValueError(f"blob descriptor is invalid: {err}") from err

    try:
        blob_bytes = bytes.fromhex(re.sub(r"\s+", "", raw_blob))
    except ValueError as err:
        raise ValueError(f"blob must be valid hex: {err}") from err

    if len(blob_bytes) < 10:
        raise ValueError("blob is too short to be a valid IR command")
    return blob_bytes


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/blobs/fetch",
        vol.Required("entry_id"): str,
        vol.Required("device_id"): vol.All(int, vol.Range(min=1, max=255)),
        vol.Optional("command_id"): vol.All(int, vol.Range(min=1, max=255)),
    }
)
@websocket_api.async_response
@runtime._hub_write_ws(persist=False)
async def _ws_fetch_blob(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    hub = await runtime._async_resolve_hub_from_data(hass, {"entry_id": msg["entry_id"]})
    if hub is None:
        connection.send_error(msg["id"], "not_found", "Could not resolve Sofabaton hub")
        return

    try:
        result = await hub.async_fetch_blob(
            device_id=int(msg["device_id"]),
            command_id=int(msg["command_id"]) if msg.get("command_id") is not None else None,
        )
        if result is None:
            command_id = msg.get("command_id")
            if command_id is None:
                connection.send_error(
                    msg["id"],
                    "no_response",
                    f"Hub did not respond to blob fetch request for device {int(msg['device_id'])}",
                )
            else:
                connection.send_error(
                    msg["id"],
                    "no_response",
                    (
                        "Hub did not respond to blob fetch request for device "
                        f"{int(msg['device_id'])}, command {int(command_id)}"
                    ),
                )
            return
    except HomeAssistantError as err:
        connection.send_error(msg["id"], "unavailable", str(err))
        return
    except ValueError as err:
        connection.send_error(msg["id"], "invalid_id", str(err))
        return

    connection.send_result(msg["id"], result)


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/blobs/play",
        vol.Required("entry_id"): str,
        vol.Required("blob"): str,
    }
)
@websocket_api.async_response
@runtime._hub_write_ws(persist=False)
async def _ws_play_ir_blob(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    hub = await runtime._async_resolve_hub_from_data(hass, {"entry_id": msg["entry_id"]})
    if hub is None:
        connection.send_error(msg["id"], "not_found", "Could not resolve Sofabaton hub")
        return

    try:
        blob_bytes = _parse_play_ir_blob_input(msg.get("blob"))
        ok = await hub.async_play_ir_blob(blob_bytes)
    except HomeAssistantError as err:
        connection.send_error(msg["id"], "unavailable", str(err))
        return
    except ValueError as err:
        connection.send_error(msg["id"], "invalid_blob", str(err))
        return

    if not ok:
        connection.send_error(
            msg["id"],
            "unavailable",
            "Hub is not ready to play IR blob (proxy client connected?)",
        )
        return

    connection.send_result(msg["id"], {"ok": True})


# ── Payload-editor learn mode (IR9) ─────────────────────────────────────
# Two capture sources feed the control panel's payload editor:
#
# * the hub's own IR receiver, driven as a *listener*: one learn window
#   per subscription, ended by a capture, a timeout, wire traffic, or the
#   card giving up (unsubscribe / socket close => cancel);
# * the HA infrared emitter's intercept ring, exposed as an *inbox*: a
#   subscription that replays the ring on connect and again on every
#   emitter send, so nothing has to stay "running" while the user walks
#   off to press a button on a consumer integration's entity.
#
# Consumer discovery is by config-entry inspection: HA core keeps no
# registry of which integrations use which emitter, but every consumer
# stores the emitter entity id as a plain string in its entry data or
# options (Samsung/LG Infrared, AC climate, ...), which is enough to
# gate the HA option and name the entities the user can poke.

_IR_LEARN_TIMEOUT_DEFAULT = 60.0


_IR_LEARN_TIMEOUT_MIN = 5.0


_IR_LEARN_TIMEOUT_MAX = 120.0


_IR_LEARN_ERROR_FAILED = "ir_learn_failed"


_IR_LEARN_ERROR_REFUSED = "ir_learn_refused"


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/ir_learn/subscribe",
        vol.Required("entry_id"): str,
        vol.Optional("timeout"): int,
    }
)
@websocket_api.async_response
@runtime._hub_write_ws(persist=False)
async def _ws_ir_learn_subscribe(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    """Run one hub learn window and push its outcome as a subscription event.

    Event ``state`` values: ``listening`` (window armed) then exactly one
    terminal state - ``learned`` (with ``payload_hex``), ``timed_out``,
    ``interrupted`` (``interrupted_by`` names the frame), ``cancelled``,
    ``refused`` (hub would not arm) or ``error``. Failure events carry a
    stable ``error_code`` for frontend localization. Unsubscribing before
    the terminal event - including the socket closing - cancels the window
    so the hub is never left armed behind a closed card; the outcome is
    then swallowed, because the client already dropped the subscription
    and would log an "unknown subscription" warning for it.
    """

    hub = await runtime._async_resolve_hub_from_data(hass, {"entry_id": msg["entry_id"]})
    if hub is None:
        connection.send_error(msg["id"], "not_found", "Could not resolve Sofabaton hub")
        return

    timeout = float(msg.get("timeout", _IR_LEARN_TIMEOUT_DEFAULT))
    timeout = min(max(timeout, _IR_LEARN_TIMEOUT_MIN), _IR_LEARN_TIMEOUT_MAX)
    finished = False

    @callback
    def _cancel() -> None:
        if not finished:
            hub.cancel_ir_learn()

    def _push(payload: dict[str, Any]) -> None:
        try:
            connection.send_message(websocket_api.event_message(msg["id"], payload))
        except Exception:  # noqa: BLE001 - socket gone; nothing left to tell
            _LOGGER.debug("IR learn: could not push %s (connection closed?)", payload.get("state"))

    connection.subscriptions[msg["id"]] = _cancel
    connection.send_result(msg["id"])
    _push({"state": "listening", "timeout_s": timeout})

    try:
        result = await hub.async_ir_learn_command(timeout=timeout)
    except Exception as err:  # noqa: BLE001 - logged; card receives a stable code
        _LOGGER.warning("IR learn window failed: %s", err)
        result = {"state": "error", "error_code": _IR_LEARN_ERROR_FAILED}
    finally:
        finished = True

    if result is None:
        result = {
            "state": "refused",
            "error_code": _IR_LEARN_ERROR_REFUSED,
        }
    # HA pops the subscription before running its unsub callback, so a
    # missing entry means the client (or the socket) is gone.
    if msg["id"] in connection.subscriptions:
        _push(result)


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/ir_emissions/subscribe",
        vol.Required("entry_id"): str,
    }
)
@websocket_api.async_response
async def _ws_ir_emissions_subscribe(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    """Replay the emitter intercept ring now and on every emitter send.

    Each event carries the whole ring (oldest first, at most 20 entries)
    so the card never has to merge deltas; the ring is the same one the
    IR intercept sensor reads, fanned out via ``signal_ir_intercept``.
    """

    hub = await runtime._async_resolve_hub_from_data(hass, {"entry_id": msg["entry_id"]})
    if hub is None:
        connection.send_error(msg["id"], "not_found", "Could not resolve Sofabaton hub")
        return

    @callback
    def _forward() -> None:
        connection.send_message(
            websocket_api.event_message(msg["id"], {"emissions": hub.get_ir_emissions()})
        )

    connection.subscriptions[msg["id"]] = async_dispatcher_connect(
        hass, signal_ir_intercept(hub.entry_id), _forward
    )
    connection.send_result(msg["id"])
    _forward()


def _ir_emitter_entity_id(hass: HomeAssistant, hub: SofabatonHub) -> str | None:
    """The hub's infrared emitter entity id, or None when it does not exist."""

    if not infrared_platform_available():
        return None
    registry = er.async_get(hass)
    if registry is None:
        return None
    for entry in er.async_entries_for_config_entry(registry, hub.entry_id):
        if entry.domain == "infrared":
            return entry.entity_id
    return None


def _value_references_entity(value: Any, entity_id: str) -> bool:
    """Deep string match over a config entry's data/options mapping.

    ``ConfigEntry.data``/``options`` are read-only ``MappingProxyType``
    views, not dicts, so match on the Mapping ABC (live-HA finding
    2026-09-02: a dict check silently found zero consumers).
    """

    if isinstance(value, str):
        return value == entity_id
    if isinstance(value, Mapping):
        return any(_value_references_entity(item, entity_id) for item in value.values())
    if isinstance(value, (list, tuple, set)):
        return any(_value_references_entity(item, entity_id) for item in value)
    return False


def build_ir_emitter_consumers(hass: HomeAssistant, hub: SofabatonHub) -> dict[str, Any]:
    """Which config entries point at this hub's emitter, and their entities.

    ``available`` is False when the emitter entity does not exist (older
    HA core, or the entity was removed), in which case the card hides the
    "from Home Assistant" learn option entirely.
    """

    emitter_entity_id = _ir_emitter_entity_id(hass, hub)
    if emitter_entity_id is None:
        return {"available": False, "emitter_entity_id": None, "consumers": []}

    registry = er.async_get(hass)
    consumers: list[dict[str, Any]] = []
    for entry in hass.config_entries.async_entries():
        if entry.domain == DOMAIN:
            continue
        if not (
            _value_references_entity(getattr(entry, "data", None), emitter_entity_id)
            or _value_references_entity(getattr(entry, "options", None), emitter_entity_id)
        ):
            continue
        entities: list[dict[str, Any]] = []
        for ent in er.async_entries_for_config_entry(registry, entry.entry_id):
            if getattr(ent, "disabled_by", None) is not None:
                continue
            state = hass.states.get(ent.entity_id)
            friendly = state.attributes.get("friendly_name") if state is not None else None
            name = friendly or ent.name or getattr(ent, "original_name", None) or ent.entity_id
            entities.append({"entity_id": ent.entity_id, "name": str(name)})
        consumers.append(
            {
                "entry_id": entry.entry_id,
                "domain": entry.domain,
                "title": str(getattr(entry, "title", "") or entry.domain),
                "entities": entities,
            }
        )
    return {
        "available": True,
        "emitter_entity_id": emitter_entity_id,
        "consumers": consumers,
    }


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/ir_emitter/consumers",
        vol.Required("entry_id"): str,
    }
)
@websocket_api.async_response
async def _ws_ir_emitter_consumers(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    hub = await runtime._async_resolve_hub_from_data(hass, {"entry_id": msg["entry_id"]})
    if hub is None:
        connection.send_error(msg["id"], "not_found", "Could not resolve Sofabaton hub")
        return
    connection.send_result(msg["id"], build_ir_emitter_consumers(hass, hub))


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/ir_library/catalog",
    }
)
@websocket_api.async_response
async def _ws_ir_library_catalog(
    hass: HomeAssistant, connection, msg: dict[str, Any]
) -> None:
    """Browsable infrared-protocols catalog (no hub interaction).

    The first call scans and imports the library's code modules, so it
    runs in the executor; later calls hit the module-level cache.
    """

    result = await hass.async_add_executor_job(ir_library.catalog)
    connection.send_result(msg["id"], result)


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/ir_library/commands",
        vol.Required("brand"): str,
        vol.Required("device_type"): str,
    }
)
@websocket_api.async_response
async def _ws_ir_library_commands(
    hass: HomeAssistant, connection, msg: dict[str, Any]
) -> None:
    """Rendered commands for one code set: labels + playable payload hex."""

    try:
        result = await hass.async_add_executor_job(
            ir_library.commands, msg["brand"], msg["device_type"]
        )
    except LookupError as err:
        connection.send_error(msg["id"], "not_found", str(err))
        return
    except RuntimeError as err:
        connection.send_error(msg["id"], "unavailable", str(err))
        return
    connection.send_result(msg["id"], {"commands": result})


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/ir_payload/convert",
        vol.Required("text"): str,
        vol.Optional("format", default="uc_hex"): vol.In(["uc_hex"]),
    }
)
@websocket_api.async_response
async def _ws_ir_payload_convert(
    hass: HomeAssistant, connection, msg: dict[str, Any]
) -> None:
    """Render a foreign IR code into the canonical signal + both hex projections.

    The single conversion path for anything that needs protocol knowledge:
    the card detects the format by shape, this command turns it into
    ``(timings, carrier)`` through ``infrared-protocols`` and hands back
    the pronto and Sofabaton renderings the payload editor shows. Hub
    independent - nothing is sent, no entry is resolved. Errors keep a
    stable ``uc_hex_*`` code; the message is the refused protocol label.
    """

    from .lib.blob_decoders import build_raw_ir_blob_body, render_pronto_hex

    try:
        result = await hass.async_add_executor_job(ir_uc_hex.convert_uc_hex, msg["text"])
    except ir_uc_hex.UcHexError as err:
        code = "unavailable" if err.code == "unavailable" else f"uc_hex_{err.code}"
        connection.send_error(msg["id"], code, err.detail or err.code)
        return
    timings = result["timings_us"]
    carrier_hz = result["carrier_hz"]
    try:
        pronto_hex = render_pronto_hex(timings, carrier_hz)
        sofabaton_hex = build_raw_ir_blob_body(timings, carrier_hz).hex()
    except ValueError as err:
        connection.send_error(msg["id"], "uc_hex_unrepresentable", str(err))
        return
    connection.send_result(
        msg["id"],
        {
            "format": "uc_hex",
            "timings_us": timings,
            "carrier_hz": carrier_hz,
            "pronto_hex": pronto_hex,
            "sofabaton_hex": sofabaton_hex,
            "protocol": result["protocol"],
            "protocol_name": result["protocol_name"],
            "bits": result["bits"],
            "repeat": result["repeat"],
        },
    )
