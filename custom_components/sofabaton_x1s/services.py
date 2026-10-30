"""The integration's Home Assistant services (R6, CR-H2-13).

The 24 service handlers; they resolve their hub and guard it through
runtime.
"""

from __future__ import annotations

import logging
import re
from collections.abc import Mapping
from typing import Any, Callable
from urllib.parse import urlsplit

from homeassistant.core import HomeAssistant, ServiceCall, SupportsResponse
from homeassistant.exceptions import HomeAssistantError

from .const import DOMAIN
from .command_config import (
    CommandConfigStore,
    is_wifi_events_device_key,
    normalize_command_id_list,
    normalize_power_command_id,
)
from .hub import _parse_managed_wifi_brand
from .lib import edits
from .lib.blob_decoders import WIFI_HTTPS_METHODS
from .lib.bundle_validation import validate_new_entity_name
from .lib.device_class_profiles import supported_create_classes
from .lib.devices import validate_appearance
from .lib.payloads import NetworkCommand
from .lib.protocol_const import DEVICE_CLASS_WIFI_IP, normalize_device_class
from . import runtime
from . import entity_sync
from .ws_backup import (
    _validate_backup_device_ids,
)
from .ws_editor import (
    _hub_model_for_names,
)
from .ws_ir import (
    _validate_ir_command_name,
    _parse_play_ir_blob_input,
)
from .ws_wifi import (
    _validate_wifi_name_for_hub,
)

# Same logger name as the package: log lines keep their source name.
_LOGGER = logging.getLogger(__package__)


@runtime._hub_write_service()
async def _async_handle_fetch_device_commands(call: ServiceCall):
    hass = call.hass
    hub = await runtime._async_resolve_hub_from_call(hass, call)
    if hub is None:
        raise ValueError("Could not resolve Sofabaton hub from service call")

    ent_id = call.data["ent_id"]
    await hub.async_fetch_device_commands(ent_id)


@runtime._hub_write_service(persist=False)
async def _async_handle_dump_ir_commands(call: ServiceCall):
    hass = call.hass
    hub = await runtime._async_resolve_hub_from_call(hass, call)
    if hub is None:
        raise ValueError("Could not resolve Sofabaton hub from service call")


    device_id = int(call.data["device_id"])
    if device_id < 1 or device_id > 255:
        raise ValueError("device_id must be between 1 and 255")

    raw_command_id = call.data.get("command_id")
    command_id: int | None = None
    if raw_command_id is not None:
        command_id = int(raw_command_id)
        if command_id < 1 or command_id > 255:
            raise ValueError("command_id must be between 1 and 255")

    result = await hub.async_dump_ir_commands(device_id=device_id, command_id=command_id)
    if result is None:
        if command_id is None:
            raise ValueError(f"Hub did not respond to IR dump request for device {device_id}")
        raise ValueError(
            f"Hub did not respond to IR dump request for device {device_id}, command {command_id}"
        )
    return result


@runtime._hub_write_service(persist=False)
async def _async_handle_fetch_blob(call: ServiceCall):
    hass = call.hass
    hub = await runtime._async_resolve_hub_from_call(hass, call)
    if hub is None:
        raise ValueError("Could not resolve Sofabaton hub from service call")


    device_id = int(call.data["device_id"])
    if device_id < 1 or device_id > 255:
        raise ValueError("device_id must be between 1 and 255")

    raw_command_id = call.data.get("command_id")
    command_id: int | None = None
    if raw_command_id is not None:
        command_id = int(raw_command_id)
        if command_id < 1 or command_id > 255:
            raise ValueError("command_id must be between 1 and 255")

    result = await hub.async_fetch_blob(device_id=device_id, command_id=command_id)
    if result is None:
        if command_id is None:
            raise ValueError(f"Hub did not respond to blob fetch request for device {device_id}")
        raise ValueError(
            f"Hub did not respond to blob fetch request for device {device_id}, command {command_id}"
        )
    return result


@runtime._hub_write_service(persist=False)
async def _async_handle_backup_bundle(call: ServiceCall):
    """Service handler for ``sofabaton_x1s.backup_bundle``.

    ``device_ids`` (optional list of 1..255 integers) selects a
    device-only bundle; omit it (or pass an empty list) to back up
    everything (all devices + all activities). The return is a
    ``hub_bundle`` payload (see :meth:`SofabatonHub.async_backup_hub`).
    """

    hass = call.hass
    hub = await runtime._async_resolve_hub_from_call(hass, call)
    if hub is None:
        raise ValueError("Could not resolve Sofabaton hub from service call")

    device_ids = _validate_backup_device_ids(call.data.get("device_ids"))
    return await hub.async_backup_hub(device_ids=device_ids)


@runtime._hub_write_service(persist=False)
async def _async_handle_restore_backup(call: ServiceCall):
    """Service handler for ``sofabaton_x1s.restore_backup``.

    Accepts a ``hub_bundle`` payload (schema_version 5). Devices in
    the bundle are restored first; activities are restored second,
    after the hub has been erased
    (see :meth:`SofabatonHub.async_erase_configuration`).
    """

    hass = call.hass
    hub = await runtime._async_resolve_hub_from_call(hass, call)
    if hub is None:
        raise ValueError("Could not resolve Sofabaton hub from service call")


    payload = call.data.get("backup")
    if not isinstance(payload, dict):
        raise ValueError(
            "backup must be an object payload returned by backup_bundle"
        )

    wifi_commands_request_port = runtime._resolve_roku_listen_port(hass, hub.entry_id)

    try:
        result = await hub.async_restore_backup(
            payload,
            wifi_commands_request_port=wifi_commands_request_port,
        )
    except ValueError as exc:
        raise HomeAssistantError(f"restore_backup validation failed: {exc}") from exc
    except Exception as exc:
        raise HomeAssistantError(f"restore_backup failed: {exc}") from exc
    if result is None:
        raise HomeAssistantError("Hub did not accept the restore transaction")
    return result


@runtime._hub_write_service(persist=False)
async def _async_handle_play_ir_blob(call: ServiceCall):
    hass = call.hass
    hub = await runtime._async_resolve_hub_from_call(hass, call)
    if hub is None:
        raise ValueError("Could not resolve Sofabaton hub from service call")


    blob_bytes = _parse_play_ir_blob_input(call.data.get("blob"))

    ok = await hub.async_play_ir_blob(blob_bytes)
    if not ok:
        raise HomeAssistantError("Hub is not ready to play IR blob (proxy client connected?)")


@runtime._hub_write_service(persist=False)
async def _async_handle_set_ir_learn_mode(call: ServiceCall):
    hass = call.hass
    hub = await runtime._async_resolve_hub_from_call(hass, call)
    if hub is None:
        raise ValueError("Could not resolve Sofabaton hub from service call")


    enabled = call.data.get("enabled")
    if not isinstance(enabled, bool):
        raise ValueError("enabled must be a boolean")

    ok = await hub.async_set_ir_learn_mode(enabled)
    if not ok:
        raise HomeAssistantError(
            "Hub did not accept the IR learn-mode toggle (proxy client connected?)"
        )


@runtime._hub_write_service(persist=False)
async def _async_handle_ir_learn_command(call: ServiceCall):
    hass = call.hass
    hub = await runtime._async_resolve_hub_from_call(hass, call)
    if hub is None:
        raise ValueError("Could not resolve Sofabaton hub from service call")


    timeout = call.data.get("timeout", 60)
    try:
        timeout = float(timeout)
    except (TypeError, ValueError) as exc:
        raise ValueError("timeout must be a number of seconds") from exc
    if timeout < 5 or timeout > 120:
        raise ValueError("timeout must be between 5 and 120 seconds")

    result = await hub.async_ir_learn_command(timeout=timeout)
    if result is None:
        raise HomeAssistantError(
            "Hub did not accept the IR learn-mode arm (proxy client connected?)"
        )
    return result


@runtime._hub_write_service()
async def _async_handle_persist_ir_blob(call: ServiceCall):
    hass = call.hass
    hub = await runtime._async_resolve_hub_from_call(hass, call)
    if hub is None:
        raise ValueError("Could not resolve Sofabaton hub from service call")


    device_id = int(call.data["device_id"])
    if device_id < 1 or device_id > 255:
        raise ValueError("device_id must be between 1 and 255")

    command_name = _validate_ir_command_name(call.data.get("command_name"))
    blob_bytes = _parse_play_ir_blob_input(call.data.get("blob"))

    result = await hub.async_persist_ir_blob(
        device_id=device_id,
        command_name=command_name,
        blob=blob_bytes,
    )
    if result is None:
        raise HomeAssistantError("Hub is not ready to persist IR blob (proxy client connected?)")
    return result


@runtime._hub_write_service()
async def _async_handle_create_wifi_device(call: ServiceCall):
    hass = call.hass
    hub = await runtime._async_resolve_hub_from_call(hass, call)
    if hub is None:
        raise ValueError("Could not resolve Sofabaton hub from service call")


    device_name = _validate_wifi_name_for_hub(hub, call.data.get("device_name", "Home Assistant"), field_name="device_name")
    raw_commands = call.data.get("commands")
    if not isinstance(raw_commands, list):
        raise ValueError("commands must be a list of strings")
    if not raw_commands:
        raise ValueError("commands requires between 1 and 10 entries")
    if len(raw_commands) > 10:
        raise ValueError("commands requires between 1 and 10 entries")

    commands: list[str] = []
    for command in raw_commands:
        command_name = str(command).strip()
        if not command_name:
            raise ValueError("commands entries must not be empty")
        _validate_wifi_name_for_hub(hub, command_name, field_name="commands entries")
        commands.append(command_name)

    max_command_id = len(commands)
    raw_power_on_command_id = call.data.get("power_on_command_id")
    raw_power_off_command_id = call.data.get("power_off_command_id")
    raw_input_command_ids = call.data.get("input_command_ids")
    power_on_command_id = normalize_power_command_id(
        raw_power_on_command_id,
        max_command_id=max_command_id,
    )
    power_off_command_id = normalize_power_command_id(
        raw_power_off_command_id,
        max_command_id=max_command_id,
    )
    if raw_power_on_command_id is not None and power_on_command_id is None:
        raise ValueError(f"power_on_command_id must be between 1 and {max_command_id}")
    if raw_power_off_command_id is not None and power_off_command_id is None:
        raise ValueError(f"power_off_command_id must be between 1 and {max_command_id}")
    input_command_ids = normalize_command_id_list(
        raw_input_command_ids,
        max_command_id=max_command_id,
    )
    if raw_input_command_ids is not None and input_command_ids is None:
        raise ValueError(f"input_command_ids entries must each be between 1 and {max_command_id}")

    request_port = runtime._resolve_roku_listen_port(hass, hub.entry_id)

    return await hub.async_create_wifi_device(
        device_name=device_name,
        commands=commands,
        request_port=request_port,
        power_on_command_id=power_on_command_id,
        power_off_command_id=power_off_command_id,
        input_command_ids=input_command_ids,
    )


@runtime._hub_write_service()
async def _async_handle_device_to_activity(call: ServiceCall):
    hass = call.hass
    hub = await runtime._async_resolve_hub_from_call(hass, call)
    if hub is None:
        raise ValueError("Could not resolve Sofabaton hub from service call")


    activity_id = int(call.data["activity_id"])
    device_id = int(call.data["device_id"])
    input_command_id: int | None = call.data.get("input_command_id")
    if input_command_id is not None:
        input_command_id = int(input_command_id)

    if activity_id < 1 or activity_id > 255:
        raise ValueError("activity_id must be between 1 and 255")
    if device_id < 1 or device_id > 255:
        raise ValueError("device_id must be between 1 and 255")

    return await hub.async_add_device_to_activity(
        activity_id=activity_id,
        device_id=device_id,
        input_cmd_id=input_command_id,
    )


@runtime._hub_write_service()
async def _async_handle_delete_device(call: ServiceCall):
    hass = call.hass
    hub = await runtime._async_resolve_hub_from_call(hass, call)
    if hub is None:
        raise ValueError("Could not resolve Sofabaton hub from service call")


    device_id = int(call.data["device_id"])
    if device_id < 1 or device_id > 255:
        raise ValueError("device_id must be between 1 and 255")

    return await hub.async_delete_device(device_id=device_id, sync_remotes=True)


def _validate_new_name(hub, value: Any) -> str:
    """A new activity or device name the hub stores as given, or ValueError."""

    name = str(value or "").strip()
    if not name:
        raise ValueError("name is required")
    validate_new_entity_name(name, hub_version=_hub_model_for_names(hub))
    return name


def _validate_create_appearance(hub, data: Mapping[str, Any]) -> tuple[int | None, int | None]:
    """A create's optional icon and color, as ints the hub line offers."""

    raw_icon = data.get("icon")
    raw_color_id = data.get("color_id")
    icon = int(raw_icon) if raw_icon is not None else None
    color_id = int(raw_color_id) if raw_color_id is not None else None
    validate_appearance(str(hub.version or ""), icon=icon, color_id=color_id)
    return icon, color_id


async def _async_refresh_created_entity(hub, *, kind: str, ent_id: int) -> None:
    """Read a new entity into the cache, as the Control Panel does after a
    create, so the next export_snapshot carries it. The create stands
    either way."""

    try:
        await hub.async_refresh_entity_structure(kind=kind, ent_id=ent_id)
    except Exception:  # noqa: BLE001 - the entity exists on the hub
        _LOGGER.warning(
            "[%s] cache read of new %s %s failed", hub.entry_id, kind, ent_id, exc_info=True
        )


@runtime._hub_write_service()
async def _async_handle_create_activity(call: ServiceCall):
    """Service handler for ``sofabaton_x1s.create_activity``.

    The Activities tab's Add Activity: an empty activity (no members,
    buttons or favorites). Fill it in with ``sync_from_snapshot`` on the
    returned ``activity_id``.
    """

    hass = call.hass
    hub = await runtime._async_resolve_hub_from_call(hass, call)
    if hub is None:
        raise ValueError("Could not resolve Sofabaton hub from service call")

    name = _validate_new_name(hub, call.data.get("name"))
    icon, color_id = _validate_create_appearance(hub, call.data)

    result = await hub.async_create_activity(name, icon=icon, color_id=color_id)
    activity_id = int((result or {}).get("activity_id") or 0)
    if str((result or {}).get("status")) != "success" or not activity_id:
        raise HomeAssistantError("The hub did not confirm creation of the new activity")
    await _async_refresh_created_entity(hub, kind="activity", ent_id=activity_id)
    return {"activity_id": activity_id}


@runtime._hub_write_service()
async def _async_handle_delete_activity(call: ServiceCall):
    """Service handler for ``sofabaton_x1s.delete_activity``.

    The hub keeps devices and activities in one table and deletes by id,
    so this is the device delete on an activity id (as the Control Panel
    does), limited to the activity range.
    """

    hass = call.hass
    hub = await runtime._async_resolve_hub_from_call(hass, call)
    if hub is None:
        raise ValueError("Could not resolve Sofabaton hub from service call")

    activity_id = int(call.data["activity_id"])
    if activity_id < 101 or activity_id > 255:
        raise ValueError("activity_id must be between 101 and 255")

    result = await hub.async_delete_device(device_id=activity_id, sync_remotes=True)
    if not result or str(result.get("status")) != "success":
        raise HomeAssistantError(f"The hub did not confirm deletion of activity {activity_id}")


@runtime._hub_write_service()
async def _async_handle_create_device(call: ServiceCall):
    """Service handler for ``sofabaton_x1s.create_device``.

    The Hub tab's Add device: an empty device of ``device_class``. Add its
    commands with ``set_wifi_command`` (``wifi_ip``) or ``persist_ir_blob``
    (``ir``) on the returned ``device_id``.
    """

    hass = call.hass
    hub = await runtime._async_resolve_hub_from_call(hass, call)
    if hub is None:
        raise ValueError("Could not resolve Sofabaton hub from service call")

    name = _validate_new_name(hub, call.data.get("name"))
    device_class = normalize_device_class(call.data.get("device_class"))
    creatable = supported_create_classes(hub.version)
    if device_class is None or device_class not in creatable:
        raise ValueError(
            f"device_class must be one of {', '.join(creatable) or 'none'} on a {hub.version} hub"
        )
    icon, color_id = _validate_create_appearance(hub, call.data)

    result = await hub.async_create_device(
        name, device_class=device_class, icon=icon, color_id=color_id
    )
    device_id = int((result or {}).get("device_id") or 0)
    if str((result or {}).get("status")) != "success" or not device_id:
        raise HomeAssistantError("The hub did not confirm creation of the new device")
    await _async_refresh_created_entity(hub, kind="device", ent_id=device_id)
    return {"device_id": device_id}


_IPV4_RE = re.compile(r"^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$")
_HTTP_METHOD_RE = re.compile(r"^[A-Z]+$")
# The request text writer adds these itself (Content-Type from its own field).
_REQUEST_TEXT_OWNED_HEADERS = frozenset({"host", "content-length"})


def _canonical_ipv4(host: str) -> str | None:
    """The dotted quad without leading zeros (the record packs four bytes), or None."""

    match = _IPV4_RE.match(host)
    if not match:
        return None
    octets = [int(octet) for octet in match.groups()]
    return ".".join(str(octet) for octet in octets) if all(octet <= 255 for octet in octets) else None


def _wifi_command_headers(raw: Any) -> list[list[str]]:
    """``headers`` as ``[name, value]`` pairs in order: from a mapping, a list
    of pairs or ``"Name: value"`` lines, or one string of such lines."""

    if raw is None or raw == "":
        return []
    if isinstance(raw, str):
        items: list[Any] = [line for line in raw.splitlines() if line.strip()]
    elif isinstance(raw, Mapping):
        items = [[name, value] for name, value in raw.items()]
    elif isinstance(raw, (list, tuple)):
        items = list(raw)
    else:
        raise ValueError("headers must be a mapping, a list of [name, value] pairs or 'Name: value' lines")
    pairs: list[list[str]] = []
    for item in items:
        if isinstance(item, str):
            name, colon, value = item.partition(":")
            if not colon:
                raise ValueError(f"header {item!r} has no colon (Name: value)")
        elif isinstance(item, (list, tuple)) and len(item) == 2:
            name, value = item
        else:
            raise ValueError(f"a header is a [name, value] pair, got {item!r}")
        name = str(name).strip()
        value = "" if value is None else str(value).strip()
        if not name:
            raise ValueError("a header needs a name")
        if any(ch in name + value for ch in "\r\n"):
            raise ValueError(f"header {name!r} must be a single line")
        pairs.append([name, value])
    return pairs


def _wifi_command_payload(
    *,
    url: Any,
    method: Any,
    headers: Any,
    body: Any,
    existing: Mapping[str, Any] | None,
    is_x2: bool,
) -> NetworkCommand:
    """The wifi_ip record to write, its kind picked as the device editor's
    HTTP form picks it (shared/wifi-ip-form.ts).

    Request text (code 0x1C, X1S and X2) unless the URL needs a URL record
    (0x21, https or a host name, X2 only). ``existing`` is the stored
    command's decoded block: a URL record stays one, since turning one into
    request text was never benched, and the stored trailer is kept while
    the kind is unchanged.
    """

    text = str(url or "").strip()
    if not text or any(ch.isspace() for ch in text):
        raise ValueError("url must be one URL without spaces, like http://192.168.1.20:8080/path")
    parts = urlsplit(text)
    scheme = parts.scheme.lower()
    if scheme not in ("http", "https"):
        raise ValueError("url must start with http:// or https://")
    if not parts.hostname:
        raise ValueError("url has no host")
    try:
        port = parts.port
    except ValueError as err:
        raise ValueError(f"url port is not valid ({err})") from err

    ipv4 = _canonical_ipv4(parts.hostname)
    stored_url = existing is not None and "url" in (existing.get("fields") or {})
    needs_url = scheme == "https" or ipv4 is None
    if needs_url and not is_x2 and not stored_url:
        raise ValueError(
            "this hub only stores http:// URLs to an IPv4 address; https and host names need an X2"
        )
    kind_url = needs_url or stored_url
    same_kind = existing is not None and stored_url == kind_url
    trailer_hex = str(existing.get("trailer_hex") or "") if same_kind and existing else ""

    method_value = str(method or "").strip().upper() or "GET"
    pairs = _wifi_command_headers(headers)
    body_value = "" if body is None else str(body)

    if kind_url:
        if method_value not in WIFI_HTTPS_METHODS:
            raise ValueError(f"method must be one of {', '.join(WIFI_HTTPS_METHODS)} for this URL")
        fields: dict[str, Any] = {"url": text, "method": method_value, "headers": pairs, "body": body_value}
    else:
        # Request text holds host, port, path and header lines; anything
        # else in the URL would be dropped without a word.
        if parts.username or parts.password:
            raise ValueError("url must not carry user:password@ here; send credentials in a header")
        if parts.fragment:
            raise ValueError("url must not carry a #fragment here")
        if not _HTTP_METHOD_RE.match(method_value):
            raise ValueError(f"method {method_value!r} is not an HTTP method")
        content_type: str | None = None
        lines: list[str] = []
        for name, value in pairs:
            lowered = name.lower()
            if lowered == "content-type" and content_type is None:
                content_type = value
                continue
            if lowered in _REQUEST_TEXT_OWNED_HEADERS or lowered == "content-type":
                raise ValueError(f"the hub writes the {name} header of this request itself")
            lines.append(f"{name}: {value}")
        path = parts.path or "/"
        if parts.query:
            path = f"{path}?{parts.query}"
        fields = {
            "host": ipv4,
            "port": port or 80,
            "method": method_value,
            "path": path,
            "header": "\r\n".join(lines),
            "content_type": content_type or "",
            "body": body_value,
        }
    try:
        return NetworkCommand.from_dict(
            {"device_class": DEVICE_CLASS_WIFI_IP, "fields": fields, "trailer_hex": trailer_hex}
        )
    except ValueError as err:
        raise ValueError(f"the hub cannot store this command ({err})") from err


async def _async_handle_set_wifi_command(call: ServiceCall):
    """Service handler for ``sofabaton_x1s.set_wifi_command``.

    Writes one HTTP command on a ``wifi_ip`` device: overwrites
    ``command_id``, or adds a command named ``name`` without one. The
    record is built as the device editor's HTTP form builds it (see
    :func:`_wifi_command_payload`) and written by a device sync through the
    same gauntlet as ``sync_from_snapshot``, with the cached structural
    snapshot as the baseline; the engine's stale check refuses it when the
    device changed on the hub since. Not a ``_hub_write_service``: the
    sync's own busy guard refuses while hub work runs.
    """

    hass = call.hass
    hub = await runtime._async_resolve_hub_from_call(hass, call)
    if hub is None:
        raise ValueError("Could not resolve Sofabaton hub from service call")

    device_id = int(call.data["device_id"])
    if device_id < 1 or device_id > 255:
        raise ValueError("device_id must be between 1 and 255")
    raw_command_id = call.data.get("command_id")
    command_id: int | None = int(raw_command_id) if raw_command_id is not None else None
    if command_id is not None and (command_id < 1 or command_id > 255):
        raise ValueError("command_id must be between 1 and 255")
    name = str(call.data.get("name") or "").strip()
    if command_id is None and not name:
        raise ValueError("name is required to add a command (no command_id given)")

    store = await runtime._async_get_persistent_cache_store(hass)
    if not store.enabled:
        raise HomeAssistantError(
            "set_wifi_command requires the persistent cache to be enabled "
            "(Sofabaton X1S integration options)."
        )
    bundle = await hub.async_get_structural_bundle()
    if not bundle:
        raise HomeAssistantError(
            "No cached structural snapshot is available yet. Open the "
            "Control Panel's Hub or Activities tab once (or run a "
            "whole-hub cache refresh) to populate it, then retry."
        )
    block = entity_sync._find_bundle_device_block(bundle, device_id)
    if block is None:
        raise ValueError(f"device {device_id} is not in the cached snapshot")
    if normalize_device_class(block.get("device_class")) != DEVICE_CLASS_WIFI_IP:
        raise ValueError(f"device {device_id} is not a wifi_ip device")
    if any(_parse_managed_wifi_brand(str(block.get("brand") or ""))):
        raise HomeAssistantError(
            f"device {device_id} is a Wifi Device this integration deploys; "
            "change its commands in the Control Panel's Wifi Commands tab"
        )

    existing: Mapping[str, Any] | None = None
    if command_id is not None:
        rows = next(
            (
                entry.get("commands") or []
                for entry in bundle.get("devices") or []
                if isinstance(entry, dict) and entry.get("device") is block
            ),
            [],
        )
        if not any(int(row.get("command_id") or 0) == command_id for row in rows):
            raise ValueError(f"device {device_id} has no command {command_id}")
        # The stored record decides its kind and trailer; the structural
        # snapshot carries no payloads.
        runtime._raise_if_hub_operation_locked(hass, hub, "set_wifi_command")
        async with runtime._hub_work(hub):
            fetched = await hub.async_fetch_blob(device_id=device_id, command_id=command_id)
        existing = next(
            (
                row.get("decoded")
                for row in (fetched or {}).get("commands") or []
                if int(row.get("command_id") or 0) == command_id
            ),
            None,
        )
        if not isinstance(existing, Mapping) or existing.get("class") != DEVICE_CLASS_WIFI_IP:
            raise HomeAssistantError(
                f"Could not read the stored record of command {command_id} on device {device_id}"
            )

    payload = _wifi_command_payload(
        url=call.data.get("url"),
        method=call.data.get("method"),
        headers=call.data.get("headers"),
        body=call.data.get("body"),
        existing=existing,
        is_x2=_hub_model_for_names(hub) == "X2",
    )
    try:
        if command_id is None:
            edited, command_id = edits.add_command(bundle, device_id, payload, name)
        else:
            edited = edits.set_command_payload(bundle, device_id, command_id, payload)
            if name:
                edited = edits.rename_command(edited, device_id, command_id, name)
    except KeyError as err:
        raise ValueError(str(err.args[0] if err.args else err)) from err

    try:
        operation_id, baseline, edited, _entity_id = await entity_sync._async_prepare_entity_sync(
            hass,
            hub=hub,
            entity_kind="device",
            sync_input={"baseline": bundle, "edited": edited, "device_id": device_id},
            operation_label="set_wifi_command",
        )
    except entity_sync._EntitySyncRejected as err:
        raise HomeAssistantError(str(err)) from err

    result = await entity_sync._run_entity_sync_operation(
        hass,
        operation_id,
        hub=hub,
        baseline=baseline,
        edited=edited,
        entity_kind="device",
        entity_id=device_id,
    )
    if isinstance(result, dict) and str(result.get("status") or "") == "failed":
        raise HomeAssistantError(str(result.get("message") or "Sync failed"))
    return {
        **(result if isinstance(result, dict) else {}),
        "device_id": device_id,
        "command_id": command_id,
        "record": "url" if payload.is_url else "request_text",
    }


@runtime._hub_write_service()
async def _async_handle_command_to_favorite(call: ServiceCall):
    hass = call.hass
    hub = await runtime._async_resolve_hub_from_call(hass, call)
    if hub is None:
        raise ValueError("Could not resolve Sofabaton hub from service call")


    activity_id = int(call.data["activity_id"])
    device_id = int(call.data["device_id"])
    command_id = int(call.data["command_id"])
    raw_slot_id = call.data.get("slot_id")
    slot_id = int(raw_slot_id) if raw_slot_id is not None else None

    if activity_id < 1 or activity_id > 255:
        raise ValueError("activity_id must be between 1 and 255")
    if device_id < 1 or device_id > 255:
        raise ValueError("device_id must be between 1 and 255")
    if command_id < 1 or command_id > 255:
        raise ValueError("command_id must be between 1 and 255")
    if slot_id is not None and (slot_id < 0 or slot_id > 255):
        raise ValueError("slot_id must be between 0 and 255")

    kwargs: dict[str, Any] = {}
    if slot_id is not None:
        kwargs["slot_id"] = slot_id

    return await hub.async_command_to_favorite(
        activity_id=activity_id,
        device_id=device_id,
        command_id=command_id,
        **kwargs,
    )


@runtime._hub_write_service(persist=False)
async def _async_handle_get_favorites(call: ServiceCall):
    hass = call.hass
    hub = await runtime._async_resolve_hub_from_call(hass, call)
    if hub is None:
        raise ValueError("Could not resolve Sofabaton hub from service call")

    activity_id = int(call.data["activity_id"])
    if activity_id < 1 or activity_id > 255:
        raise ValueError("activity_id must be between 1 and 255")

    order = await hub.async_request_favorites_order(activity_id)
    if order is None:
        raise ValueError(f"Hub did not respond to favorites order request for activity {activity_id}")

    return {"favorites": hub.describe_favorites_order(activity_id, order)}


@runtime._hub_write_service()
async def _async_handle_reorder_favorites(call: ServiceCall):
    hass = call.hass
    hub = await runtime._async_resolve_hub_from_call(hass, call)
    if hub is None:
        raise ValueError("Could not resolve Sofabaton hub from service call")


    activity_id = int(call.data["activity_id"])
    raw_order = call.data.get("ordered_fav_ids", call.data.get("order"))
    if raw_order is None:
        raise ValueError("ordered_fav_ids is required")
    ordered_fav_ids = [int(x) for x in raw_order]

    if activity_id < 1 or activity_id > 255:
        raise ValueError("activity_id must be between 1 and 255")
    if not ordered_fav_ids:
        raise ValueError("ordered_fav_ids must be a non-empty list of fav_ids")

    return await hub.async_reorder_favorites(
        activity_id=activity_id,
        ordered_fav_ids=ordered_fav_ids,
    )


@runtime._hub_write_service()
async def _async_handle_delete_favorite(call: ServiceCall):
    hass = call.hass
    hub = await runtime._async_resolve_hub_from_call(hass, call)
    if hub is None:
        raise ValueError("Could not resolve Sofabaton hub from service call")


    activity_id = int(call.data["activity_id"])
    raw_fav_id = call.data.get("fav_id", call.data.get("button_id"))
    if raw_fav_id is None:
        raise ValueError("fav_id is required")
    fav_id = int(raw_fav_id)

    if activity_id < 1 or activity_id > 255:
        raise ValueError("activity_id must be between 1 and 255")
    if fav_id < 1 or fav_id > 255:
        raise ValueError("fav_id must be between 1 and 255")

    return await hub.async_delete_favorite(
        activity_id=activity_id,
        fav_id=fav_id,
    )


@runtime._hub_write_service()
async def _async_handle_command_to_button(call: ServiceCall):
    hass = call.hass
    hub = await runtime._async_resolve_hub_from_call(hass, call)
    if hub is None:
        raise ValueError("Could not resolve Sofabaton hub from service call")


    activity_id = int(call.data["activity_id"])
    button_id = int(call.data["button_id"])
    device_id = int(call.data["device_id"])
    command_id = int(call.data["command_id"])

    if activity_id < 1 or activity_id > 255:
        raise ValueError("activity_id must be between 1 and 255")
    if button_id < 1 or button_id > 255:
        raise ValueError("button_id must be between 1 and 255")
    if device_id < 1 or device_id > 255:
        raise ValueError("device_id must be between 1 and 255")
    if command_id < 1 or command_id > 255:
        raise ValueError("command_id must be between 1 and 255")

    long_press_device_id = call.data.get("long_press_device_id")
    long_press_command_id = call.data.get("long_press_command_id")
    if long_press_device_id is not None:
        long_press_device_id = int(long_press_device_id)
        if long_press_device_id < 1 or long_press_device_id > 255:
            raise ValueError("long_press_device_id must be between 1 and 255")
    if long_press_command_id is not None:
        long_press_command_id = int(long_press_command_id)
        if long_press_command_id < 1 or long_press_command_id > 255:
            raise ValueError("long_press_command_id must be between 1 and 255")

    return await hub.async_command_to_button(
        activity_id=activity_id,
        button_id=button_id,
        device_id=device_id,
        command_id=command_id,
        long_press_device_id=long_press_device_id,
        long_press_command_id=long_press_command_id,
    )


async def _async_pick_wifi_device_key(
    store: CommandConfigStore, entry_id: str, wifi_device: str, *, roku_listen_port: int
) -> str | None:
    """The record a sync_command_config call means (CR-X2-6).

    ``wifi_device`` names it as the Wifi Commands tab shows it. Without a
    name, a hub with one Wifi Device deploys that one, and a hub with
    several refuses instead of silently deploying the first.
    """

    records = [
        record
        for record in await store.async_list_hub_devices(entry_id, roku_listen_port=roku_listen_port)
        if not is_wifi_events_device_key(record.get("device_key"))
    ]
    names = sorted(str(record.get("device_name") or "") for record in records)
    if wifi_device:
        wanted = wifi_device.casefold()
        matches = [
            record for record in records
            if str(record.get("device_name") or "").strip().casefold() == wanted
        ]
        if len(matches) != 1:
            raise HomeAssistantError(
                f"No single Wifi Device is named {wifi_device!r} (Wifi Devices: {', '.join(names)})"
            )
        return str(matches[0].get("device_key") or "") or None
    if len(records) > 1:
        raise HomeAssistantError(
            "This hub has several Wifi Devices; name one with wifi_device "
            f"(Wifi Devices: {', '.join(names)})"
        )
    return None


@runtime._hub_write_service(persist=False)
async def _async_handle_sync_command_config(call: ServiceCall):
    hass = call.hass
    hub = await runtime._async_resolve_hub_from_call(hass, call)
    if hub is None:
        raise ValueError("Could not resolve Sofabaton hub from service call")

    store = await runtime._async_get_command_config_store(hass)
    device_key = str(call.data.get("device_key") or "").strip() or None
    roku_listen_port = runtime._resolve_roku_listen_port(hass, hub.entry_id)
    if device_key is None:
        device_key = await _async_pick_wifi_device_key(
            store,
            hub.entry_id,
            str(call.data.get("wifi_device") or "").strip(),
            roku_listen_port=roku_listen_port,
        )

    payload = await store.async_get_hub_config(
        hub.entry_id,
        device_key=device_key,
        roku_listen_port=roku_listen_port,
    )
    request_port = roku_listen_port
    device_name = str(call.data.get("device_name") or payload.get("device_name") or "Home Assistant").strip() or "Home Assistant"

    return await hub.async_sync_command_config(
        command_payload=payload,
        request_port=request_port,
        device_key=str(payload.get("device_key") or device_key or ""),
        device_name=device_name,
    )


async def _async_handle_export_snapshot(call: ServiceCall):
    """Service handler for ``sofabaton_x1s.export_snapshot``.

    Wraps :meth:`SofabatonHub.async_get_structural_bundle` — the exact
    projection the live Control Panel editor reads (WS command
    ``sofabaton_x1s/cache/structural_bundle``, see
    ``_ws_get_structural_bundle``). It is a pure read from the cached
    proxy state: no hub I/O and no per-command IR blob dump, so it is
    cheap enough to call before every ``sync_from_snapshot`` and safe to
    call while the vendor app owns the hub.

    Deliberately not ``backup_bundle``: that action always does a live
    round trip to the hub (and, for a whole-hub backup, dumps every
    command's IR blob) — see ``docs/protocol/write-flows.md``.
    ``export_snapshot`` only returns what the integration already has
    cached; open the Control Panel's Hub or Activities tab once (or run
    a whole-hub cache refresh) to populate the cache on a fresh install.

    Response is ``{bundle, generation}`` — the same shape the WS command
    sends. ``generation`` is the cache generation the snapshot was
    exported at; pass it back as ``sync_from_snapshot``'s
    ``expected_generation`` to refuse a stale baseline loudly.
    """

    hass = call.hass
    hub = await runtime._async_resolve_hub_from_call(hass, call)
    if hub is None:
        raise ValueError("Could not resolve Sofabaton hub from service call")

    store = await runtime._async_get_persistent_cache_store(hass)
    if not store.enabled:
        raise HomeAssistantError(
            "export_snapshot requires the persistent cache to be enabled "
            "(Sofabaton X1S integration options)."
        )

    bundle = await hub.async_get_structural_bundle()
    if not bundle:
        raise HomeAssistantError(
            "No cached structural snapshot is available yet. Open the "
            "Control Panel's Hub or Activities tab once (or run a "
            "whole-hub cache refresh) to populate it, then retry."
        )
    return {"bundle": bundle, "generation": hub.cache_generation}


async def _async_handle_sync_from_snapshot(call: ServiceCall):
    """Service handler for ``sofabaton_x1s.sync_from_snapshot``.

    Script-callable counterpart of the live Control Panel editor's save
    action. Accepts the same ``baseline``/``edited`` hub_bundle pair the
    WS ``activity/sync`` and ``device/sync`` commands accept (see
    ``_validate_entity_sync_inputs``), routes through the identical
    pre-write gauntlet (``_async_prepare_entity_sync``: busy guard, lock
    guard, payload validation, operation-registry bookkeeping) and the
    identical engine entry point (``_run_entity_sync_operation`` ->
    ``hub.async_sync_activity``/``async_sync_device`` ->
    ``ActivitySyncMixin.sync_activity``/``sync_device``) the WS handler
    uses — so paging, label-slot reuse, and ack tolerance all apply
    exactly as they do from the Control Panel.

    Typical flow: call ``export_snapshot`` to get a bundle, keep the
    ``generation`` it returns, edit the two POWER_ON/POWER_OFF steps for
    one device in the returned JSON, then call this with the untouched
    export as ``baseline``, the edited copy as ``edited``, and that
    generation as ``expected_generation`` — the sync then refuses loudly
    if the hub cache has moved since the export instead of failing later
    (or writing against a rebased diff).
    """

    hass = call.hass
    hub = await runtime._async_resolve_hub_from_call(hass, call)
    if hub is None:
        raise ValueError("Could not resolve Sofabaton hub from service call")

    entity_kind = str(call.data.get("entity_kind") or "").strip().lower()
    if entity_kind not in ("activity", "device"):
        raise ValueError("entity_kind must be 'activity' or 'device'")

    baseline = call.data.get("baseline")
    edited = call.data.get("edited")
    if not isinstance(baseline, dict) or not isinstance(edited, dict):
        raise ValueError("baseline and edited must be hub_bundle objects")

    raw_generation = call.data.get("expected_generation")
    expected_generation: int | None = None
    if raw_generation is not None:
        try:
            expected_generation = int(raw_generation)
        except (TypeError, ValueError) as exc:
            raise ValueError("expected_generation must be an integer") from exc

    sync_input = {
        "baseline": baseline,
        "edited": edited,
        f"{entity_kind}_id": call.data.get("entity_id"),
    }

    try:
        operation_id, baseline, edited, entity_id = await entity_sync._async_prepare_entity_sync(
            hass,
            hub=hub,
            entity_kind=entity_kind,
            sync_input=sync_input,
            operation_label=f"sync_from_snapshot[{entity_kind}]",
            expected_generation=expected_generation,
        )
    except entity_sync._EntitySyncRejected as err:
        raise HomeAssistantError(str(err)) from err

    result = await entity_sync._run_entity_sync_operation(
        hass,
        operation_id,
        hub=hub,
        baseline=baseline,
        edited=edited,
        entity_kind=entity_kind,
        entity_id=entity_id,
    )
    if isinstance(result, dict) and str(result.get("status") or "") == "failed":
        raise HomeAssistantError(str(result.get("message") or "Sync failed"))
    return result


#: Every service: (name, handler, returns a response), in registration order.
#: One table for registration (first hub set up) and removal (last hub
#: unloaded); the two hand-kept 20-name lists had to change in lockstep.
SERVICES: tuple[tuple[str, Callable[[ServiceCall], Any], bool], ...] = (
    ("fetch_device_commands", _async_handle_fetch_device_commands, False),
    ("dump_ir_commands", _async_handle_dump_ir_commands, True),
    ("fetch_blob", _async_handle_fetch_blob, True),
    ("backup_bundle", _async_handle_backup_bundle, True),
    ("restore_backup", _async_handle_restore_backup, True),
    ("play_ir_blob", _async_handle_play_ir_blob, False),
    ("set_ir_learn_mode", _async_handle_set_ir_learn_mode, False),
    ("ir_learn_command", _async_handle_ir_learn_command, True),
    ("persist_ir_blob", _async_handle_persist_ir_blob, True),
    ("create_wifi_device", _async_handle_create_wifi_device, False),
    ("device_to_activity", _async_handle_device_to_activity, False),
    ("delete_device", _async_handle_delete_device, False),
    ("create_activity", _async_handle_create_activity, True),
    ("delete_activity", _async_handle_delete_activity, False),
    ("create_device", _async_handle_create_device, True),
    ("set_wifi_command", _async_handle_set_wifi_command, True),
    ("command_to_favorite", _async_handle_command_to_favorite, False),
    ("get_favorites", _async_handle_get_favorites, True),
    ("reorder_favorites", _async_handle_reorder_favorites, False),
    ("delete_favorite", _async_handle_delete_favorite, False),
    ("command_to_button", _async_handle_command_to_button, False),
    ("sync_command_config", _async_handle_sync_command_config, False),
    ("export_snapshot", _async_handle_export_snapshot, True),
    ("sync_from_snapshot", _async_handle_sync_from_snapshot, True),
)


def async_register_services(hass: HomeAssistant) -> None:
    """Register every service that is not registered yet."""

    for name, handler, responds in SERVICES:
        if hass.services.has_service(DOMAIN, name):
            continue
        if responds:
            hass.services.async_register(DOMAIN, name, handler, supports_response=SupportsResponse.OPTIONAL)
        else:
            hass.services.async_register(DOMAIN, name, handler)


def async_remove_services(hass: HomeAssistant) -> None:
    """Remove every service (the last hub unloaded)."""

    for name, _handler, _responds in SERVICES:
        hass.services.async_remove(DOMAIN, name)
