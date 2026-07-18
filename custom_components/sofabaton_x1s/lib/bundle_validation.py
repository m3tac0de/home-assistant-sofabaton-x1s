"""Authoritative structural validation for live editor sync bundles.

The frontend mirrors these rules for feedback, but WebSocket callers can
bypass the card.  This module therefore validates raw ``hub_bundle`` payloads
before a sync plan is built or an operation is registered.
"""

from __future__ import annotations

from collections import Counter
from collections.abc import Callable, Collection, Mapping
import re
import unicodedata
from typing import Any

from .hub_versions import (
    HUB_BUNDLE_SCHEMA_VERSION,
    HUB_VERSION_X1,
    HUB_VERSION_X1S,
    HUB_VERSION_X2,
)
from .protocol_const import ButtonName

ACTIVITY_ID_BASE = 0x65
POWER_ON_MACRO_BUTTON_ID = 0xC6
POWER_OFF_MACRO_BUTTON_ID = 0xC7
DEVICE_INPUT_REF_COMMAND = 0xC5
DEVICE_POWER_ON_REF_COMMAND = 0xC6
DEVICE_POWER_OFF_REF_COMMAND = 0xC7
MACRO_DELAY_SENTINEL = 0xFF

_KNOWN_MODELS = {HUB_VERSION_X1, HUB_VERSION_X1S, HUB_VERSION_X2}
_POWER_MACRO_IDS = {POWER_ON_MACRO_BUTTON_ID, POWER_OFF_MACRO_BUTTON_ID}
_POWER_REF_COMMANDS = {
    DEVICE_INPUT_REF_COMMAND,
    DEVICE_POWER_ON_REF_COMMAND,
    DEVICE_POWER_OFF_REF_COMMAND,
}
_X2_EXTRA_BUTTONS = {
    ButtonName.A,
    ButtonName.B,
    ButtonName.C,
    ButtonName.EXIT,
    ButtonName.DVR,
    ButtonName.PLAY,
    ButtonName.GUIDE,
}
_SHARED_BUTTONS = {
    value
    for key, value in ButtonName.__dict__.items()
    if key.isupper()
    and isinstance(value, int)
    and value not in _X2_EXTRA_BUTTONS
    and value not in _POWER_MACRO_IDS
}
_HEX_BYTES = re.compile(r"^(?:[0-9a-fA-F]{2})(?:[ ,\r\n\t]+[0-9a-fA-F]{2})*$")
# Cloud- and app-provisioned names on unicode-capable hubs may contain any
# printable ASCII punctuation (e.g. the stock "Ok/Select" command), so the
# whole set must round-trip through the editor.
_NAME_PUNCTUATION = set(" !\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~")


def _error(path: str, message: str) -> ValueError:
    return ValueError(f"{path}: {message}")


def _mapping(value: Any, path: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise _error(path, "must be an object")
    return value


def _list(value: Any, path: str) -> list[Any]:
    if not isinstance(value, list):
        raise _error(path, "must be an array")
    return value


def _integer(value: Any, path: str, *, minimum: int, maximum: int) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise _error(path, "must be an integer")
    if not minimum <= value <= maximum:
        raise _error(path, f"must be between {minimum} and {maximum}")
    return value


def _optional_byte(row: Mapping[str, Any], key: str, path: str) -> None:
    if key in row and row[key] is not None:
        _integer(row[key], f"{path}.{key}", minimum=0, maximum=0xFF)


def _validate_name(value: Any, path: str, model: str, *, allow_empty: bool = False) -> None:
    if not isinstance(value, str):
        raise _error(path, "must be a string")
    if not value:
        if allow_empty:
            return
        raise _error(path, "must not be empty")
    # Name slots hold 30 bytes of ASCII (X1) or 60 bytes of UTF-16BE
    # (X1S/X2), so the cap is 30 UTF-16 code units, not code points.
    if len(value.encode("utf-16-be")) > 60:
        raise _error(path, "must be at most 30 characters")
    if model == HUB_VERSION_X1:
        if any(not (char.isascii() and (char.isalnum() or char == " ")) for char in value):
            raise _error(path, "contains characters unsupported by X1")
        return
    for char in value:
        if char in _NAME_PUNCTUATION:
            continue
        if unicodedata.category(char)[:1] in {"L", "N", "M"}:
            continue
        raise _error(path, f"contains unsupported character {char!r}")


def _validate_hex_bytes(value: Any, path: str) -> None:
    if not isinstance(value, str) or not value.strip():
        raise _error(path, "must contain hex bytes")
    normalized = value.strip().replace("0x", "").replace("0X", "")
    if not _HEX_BYTES.fullmatch(normalized):
        compact = re.sub(r"[ ,\r\n\t]+", "", normalized)
        if len(compact) % 2 or not compact or re.search(r"[^0-9a-fA-F]", compact):
            raise _error(path, "must contain an even number of hexadecimal digits")


def _button_catalog(model: str) -> set[int]:
    return _SHARED_BUTTONS | (_X2_EXTRA_BUTTONS if model == HUB_VERSION_X2 else set())


def _index_bundle(
    bundle: Mapping[str, Any],
    *,
    path: str,
    model: str,
    strict_for: Callable[[int], bool],
) -> tuple[dict[int, Mapping[str, Any]], dict[int, Mapping[str, Any]], dict[int, set[int]]]:
    devices: dict[int, Mapping[str, Any]] = {}
    commands: dict[int, set[int]] = {}
    for index, raw in enumerate(_list(bundle.get("devices"), f"{path}.devices")):
        item_path = f"{path}.devices[{index}]"
        device = _mapping(raw, item_path)
        block = _mapping(device.get("device"), f"{item_path}.device")
        device_id = _integer(
            block.get("device_id"), f"{item_path}.device.device_id", minimum=1, maximum=ACTIVITY_ID_BASE - 1
        )
        if device_id in devices:
            raise _error(f"{item_path}.device.device_id", f"duplicates device {device_id}")
        devices[device_id] = device
        strict = strict_for(device_id)
        if strict:
            _validate_name(block.get("name"), f"{item_path}.device.name", model)
            idle = block.get("idle_behavior", block.get("power_mode"))
            if idle is not None and idle not in {1, 2, 3, 4}:
                raise _error(f"{item_path}.device.idle_behavior", "must be one of 1, 2, 3, or 4")

        command_ids: set[int] = set()
        for command_index, raw_command in enumerate(device.get("commands") or []):
            command_path = f"{item_path}.commands[{command_index}]"
            command = _mapping(raw_command, command_path)
            command_id = _integer(
                command.get("command_id"), f"{command_path}.command_id", minimum=1, maximum=0xFE
            )
            if command_id in command_ids:
                raise _error(f"{command_path}.command_id", f"duplicates command {command_id}")
            command_ids.add(command_id)
            if strict:
                _validate_name(command.get("name"), f"{command_path}.name", model)
                restore = command.get("restore_data")
                if restore is not None:
                    restore_map = _mapping(restore, f"{command_path}.restore_data")
                    if restore_map.get("data_hex") is not None:
                        _validate_hex_bytes(restore_map["data_hex"], f"{command_path}.restore_data.data_hex")
        commands[device_id] = command_ids

    activities: dict[int, Mapping[str, Any]] = {}
    for index, raw in enumerate(_list(bundle.get("activities"), f"{path}.activities")):
        item_path = f"{path}.activities[{index}]"
        activity = _mapping(raw, item_path)
        block = _mapping(activity.get("device"), f"{item_path}.device")
        activity_id = _integer(
            block.get("device_id"), f"{item_path}.device.device_id", minimum=ACTIVITY_ID_BASE, maximum=0xFF
        )
        if activity_id in activities:
            raise _error(f"{item_path}.device.device_id", f"duplicates activity {activity_id}")
        activities[activity_id] = activity
        if strict_for(activity_id):
            _validate_name(block.get("name"), f"{item_path}.device.name", model)

    return devices, activities, commands


def _validate_target(
    *,
    device_id: int,
    command_id: int,
    path: str,
    devices: Mapping[int, Mapping[str, Any]],
    activities: Mapping[int, Mapping[str, Any]],
    commands: Mapping[int, set[int]],
    allow_activity: bool,
) -> None:
    if device_id >= ACTIVITY_ID_BASE:
        if not allow_activity or device_id not in activities:
            raise _error(path, f"references unknown activity {device_id}")
        macro_ids = {
            int(row.get("button_id", 0))
            for row in activities[device_id].get("macros") or []
            if isinstance(row, Mapping)
        }
        if command_id not in macro_ids:
            raise _error(path, f"references missing macro {command_id} on activity {device_id}")
        return
    if device_id not in devices:
        raise _error(path, f"references unknown device {device_id}")
    if command_id not in commands.get(device_id, set()):
        raise _error(path, f"references missing command {command_id} on device {device_id}")


def _validate_macros(
    owner: Mapping[str, Any],
    *,
    owner_id: int,
    owner_kind: str,
    path: str,
    model: str,
    strict: bool,
    devices: Mapping[int, Mapping[str, Any]],
    activities: Mapping[int, Mapping[str, Any]],
    commands: Mapping[int, set[int]],
) -> dict[int, Mapping[str, Any]]:
    macros: dict[int, Mapping[str, Any]] = {}
    for index, raw in enumerate(owner.get("macros") or []):
        macro_path = f"{path}.macros[{index}]"
        macro = _mapping(raw, macro_path)
        button_id = _integer(macro.get("button_id"), f"{macro_path}.button_id", minimum=1, maximum=0xFF)
        if button_id in macros:
            raise _error(f"{macro_path}.button_id", f"duplicates macro slot {button_id}")
        macros[button_id] = macro
        if strict and button_id not in _POWER_MACRO_IDS:
            _validate_name(macro.get("name"), f"{macro_path}.name", model)

        previous_was_delay = False
        for step_index, raw_step in enumerate(macro.get("steps") or []):
            step_path = f"{macro_path}.steps[{step_index}]"
            step = _mapping(raw_step, step_path)
            command_id = _integer(step.get("command_id"), f"{step_path}.command_id", minimum=1, maximum=0xFF)
            raw_device_id = step.get("device_id")
            if raw_device_id is None and owner_kind == "device":
                device_id = owner_id
            else:
                device_id = _integer(raw_device_id, f"{step_path}.device_id", minimum=1, maximum=0xFF)
            _optional_byte(step, "duration", step_path)
            _optional_byte(step, "delay", step_path)
            if step.get("button_code") is not None:
                _integer(step["button_code"], f"{step_path}.button_code", minimum=0, maximum=0xFFFFFFFFFFFF)

            is_delay = command_id == MACRO_DELAY_SENTINEL or device_id == MACRO_DELAY_SENTINEL
            if is_delay:
                if command_id != MACRO_DELAY_SENTINEL:
                    raise _error(step_path, "delay rows must use command_id 255")
                if owner_kind == "activity" and device_id != MACRO_DELAY_SENTINEL:
                    raise _error(step_path, "activity delay rows must use device_id 255")
                if strict and (step_index == 0 or previous_was_delay):
                    raise _error(step_path, "delay row must immediately follow a command step")
                previous_was_delay = True
                continue

            previous_was_delay = False
            if command_id in _POWER_REF_COMMANDS:
                if device_id not in devices:
                    raise _error(step_path, f"power row references unknown device {device_id}")
                continue
            _validate_target(
                device_id=device_id,
                command_id=command_id,
                path=step_path,
                devices=devices,
                activities=activities,
                commands=commands,
                allow_activity=owner_kind == "activity",
            )
    return macros


def _validate_bindings(
    owner: Mapping[str, Any],
    *,
    owner_id: int,
    owner_kind: str,
    path: str,
    model: str,
    macros: Mapping[int, Mapping[str, Any]],
    devices: Mapping[int, Mapping[str, Any]],
    activities: Mapping[int, Mapping[str, Any]],
    commands: Mapping[int, set[int]],
) -> None:
    seen: set[int] = set()
    allowed_buttons = _button_catalog(model)
    for index, raw in enumerate(owner.get("button_bindings") or []):
        binding_path = f"{path}.button_bindings[{index}]"
        binding = _mapping(raw, binding_path)
        button_id = _integer(binding.get("button_id"), f"{binding_path}.button_id", minimum=1, maximum=0xFF)
        if button_id not in allowed_buttons:
            raise _error(f"{binding_path}.button_id", f"button 0x{button_id:02X} is unsupported on {model}")
        if button_id in seen:
            raise _error(f"{binding_path}.button_id", f"duplicates button 0x{button_id:02X}")
        seen.add(button_id)

        device_id = binding.get("device_id", owner_id if owner_kind == "device" else None)
        device_id = _integer(device_id, f"{binding_path}.device_id", minimum=1, maximum=0xFF)
        command_id = _integer(binding.get("command_id"), f"{binding_path}.command_id", minimum=1, maximum=0xFE)
        if owner_kind == "activity" and device_id == owner_id:
            if command_id not in macros or command_id in _POWER_MACRO_IDS:
                raise _error(binding_path, f"references missing editable macro {command_id}")
        else:
            if owner_kind == "device" and device_id != owner_id:
                raise _error(binding_path, "device bindings may only target their own device")
            _validate_target(
                device_id=device_id,
                command_id=command_id,
                path=binding_path,
                devices=devices,
                activities=activities,
                commands=commands,
                allow_activity=False,
            )

        has_long_device = binding.get("long_press_device_id") is not None
        has_long_command = binding.get("long_press_command_id") is not None
        if has_long_device != has_long_command and owner_kind == "activity":
            raise _error(binding_path, "long press requires both device and command ids")
        if has_long_command:
            long_device = binding.get("long_press_device_id", owner_id)
            long_device = _integer(long_device, f"{binding_path}.long_press_device_id", minimum=1, maximum=0xFF)
            long_command = _integer(
                binding["long_press_command_id"], f"{binding_path}.long_press_command_id", minimum=1, maximum=0xFE
            )
            if owner_kind == "activity" and long_device == owner_id:
                if long_command not in macros or long_command in _POWER_MACRO_IDS:
                    raise _error(binding_path, f"long press references missing editable macro {long_command}")
            else:
                if owner_kind == "device" and long_device != owner_id:
                    raise _error(binding_path, "device long press may only target its own device")
                _validate_target(
                    device_id=long_device,
                    command_id=long_command,
                    path=binding_path,
                    devices=devices,
                    activities=activities,
                    commands=commands,
                    allow_activity=False,
                )


def _validate_activity(
    activity: Mapping[str, Any],
    *,
    activity_id: int,
    path: str,
    model: str,
    strict: bool,
    macros: Mapping[int, Mapping[str, Any]],
    devices: Mapping[int, Mapping[str, Any]],
    activities: Mapping[int, Mapping[str, Any]],
    commands: Mapping[int, set[int]],
) -> None:
    favorite_slots: set[int] = set()
    direct_refs: set[int] = set()
    for index, raw in enumerate(activity.get("favorite_slots") or []):
        favorite_path = f"{path}.favorite_slots[{index}]"
        favorite = _mapping(raw, favorite_path)
        button_id = _integer(favorite.get("button_id"), f"{favorite_path}.button_id", minimum=1, maximum=0xC5)
        if button_id in favorite_slots:
            raise _error(f"{favorite_path}.button_id", f"duplicates shortcut slot {button_id}")
        if button_id in macros and button_id not in _POWER_MACRO_IDS:
            raise _error(f"{favorite_path}.button_id", f"collides with macro slot {button_id}")
        favorite_slots.add(button_id)
        device_id = _integer(favorite.get("device_id"), f"{favorite_path}.device_id", minimum=1, maximum=ACTIVITY_ID_BASE - 1)
        command_id = _integer(favorite.get("command_id"), f"{favorite_path}.command_id", minimum=1, maximum=0xFE)
        _validate_target(
            device_id=device_id,
            command_id=command_id,
            path=favorite_path,
            devices=devices,
            activities=activities,
            commands=commands,
            allow_activity=False,
        )
        direct_refs.add(device_id)
        if strict and favorite.get("name") not in {None, ""}:
            _validate_name(favorite.get("name"), f"{favorite_path}.name", model, allow_empty=True)

    for binding in activity.get("button_bindings") or []:
        if not isinstance(binding, Mapping):
            continue
        for key in ("device_id", "long_press_device_id"):
            device_id = binding.get(key)
            if isinstance(device_id, int) and 0 < device_id < ACTIVITY_ID_BASE:
                direct_refs.add(device_id)

    for macro_id, macro in macros.items():
        for step in macro.get("steps") or []:
            if not isinstance(step, Mapping):
                continue
            device_id = step.get("device_id")
            command_id = step.get("command_id")
            if not isinstance(device_id, int) or not isinstance(command_id, int):
                continue
            if device_id == MACRO_DELAY_SENTINEL or command_id in _POWER_REF_COMMANDS | {MACRO_DELAY_SENTINEL}:
                continue
            if 0 < device_id < ACTIVITY_ID_BASE:
                direct_refs.add(device_id)

        if strict:
            for step in macro.get("steps") or []:
                if not isinstance(step, Mapping) or step.get("command_id") not in _POWER_REF_COMMANDS:
                    continue
                command_id = int(step["command_id"])
                allowed = (
                    macro_id == POWER_ON_MACRO_BUTTON_ID
                    and command_id in {DEVICE_POWER_ON_REF_COMMAND, DEVICE_INPUT_REF_COMMAND}
                ) or (
                    macro_id == POWER_OFF_MACRO_BUTTON_ID
                    and command_id == DEVICE_POWER_OFF_REF_COMMAND
                )
                if not allowed:
                    raise _error(f"{path}.macros", "power reference appears in the wrong macro")

    linked_raw = activity.get("referenced_source_device_ids") or []
    linked = [
        _integer(value, f"{path}.referenced_source_device_ids[{index}]", minimum=1, maximum=ACTIVITY_ID_BASE - 1)
        for index, value in enumerate(_list(linked_raw, f"{path}.referenced_source_device_ids"))
    ]
    if len(linked) != len(set(linked)):
        raise _error(f"{path}.referenced_source_device_ids", "must not contain duplicates")
    for device_id in linked:
        if device_id not in devices:
            raise _error(f"{path}.referenced_source_device_ids", f"references unknown device {device_id}")
    if not strict:
        return

    def _power_counts(macro_id: int, commands_to_count: set[int]) -> Counter[tuple[int, int]]:
        counts: Counter[tuple[int, int]] = Counter()
        macro = macros.get(macro_id)
        for step in (macro or {}).get("steps") or []:
            if not isinstance(step, Mapping):
                continue
            device_id = step.get("device_id")
            command_id = step.get("command_id")
            if isinstance(device_id, int) and isinstance(command_id, int) and command_id in commands_to_count:
                counts[(device_id, command_id)] += 1
        return counts

    on_counts = _power_counts(
        POWER_ON_MACRO_BUTTON_ID, {DEVICE_POWER_ON_REF_COMMAND, DEVICE_INPUT_REF_COMMAND}
    )
    off_counts = _power_counts(POWER_OFF_MACRO_BUTTON_ID, {DEVICE_POWER_OFF_REF_COMMAND})
    power_members = {device_id for device_id, _command_id in [*on_counts, *off_counts]}
    if linked != sorted(power_members):
        raise _error(
            f"{path}.referenced_source_device_ids",
            "must be the sorted device set represented in the power macros",
        )
    missing_direct = sorted(direct_refs - power_members)
    if missing_direct:
        raise _error(path, f"referenced devices are missing power linkage: {missing_direct}")
    for device_id in sorted(power_members):
        required = (
            on_counts[(device_id, DEVICE_POWER_ON_REF_COMMAND)],
            on_counts[(device_id, DEVICE_INPUT_REF_COMMAND)],
            off_counts[(device_id, DEVICE_POWER_OFF_REF_COMMAND)],
        )
        if required != (1, 1, 1):
            raise _error(
                f"{path}.macros",
                f"linked device {device_id} requires exactly one power-on, input, and power-off row",
            )


def validate_hub_bundle_for_model(
    bundle: Any,
    *,
    hub_version: str | None,
    payload_name: str = "bundle",
    enforce_editor_invariants: bool = True,
    strict_entity_ids: Collection[int] | None = None,
) -> str:
    """Validate one sync bundle and return its normalized hub model.

    ``enforce_editor_invariants=False`` is used for the captured baseline: its
    structure and references must be safe to diff, but the edited bundle may
    legitimately be repairing missing generated rows from that baseline.

    ``strict_entity_ids`` limits the editor invariants (name rules, idle
    values, power-macro linkage) to the given device/activity ids. Entity-
    scoped syncs pass the set of entities that differ from the baseline:
    those are the only entities a plan can write, while unchanged entities
    are hub truth passing through — a stale or hub-quirky cached entry
    elsewhere in the bundle must not block the sync. Structural checks
    (shape, duplicates, reference integrity) always cover the whole bundle.
    ``None`` applies the invariants to every entity.
    """

    strict_ids = (
        None
        if strict_entity_ids is None
        else {int(entity) & 0xFF for entity in strict_entity_ids}
    )

    def _strict_for(entity_id: int) -> bool:
        if not enforce_editor_invariants:
            return False
        return strict_ids is None or entity_id in strict_ids

    root = _mapping(bundle, payload_name)
    if root.get("kind") != "hub_bundle":
        raise _error(payload_name, "must declare kind == 'hub_bundle'")
    if root.get("schema_version") != HUB_BUNDLE_SCHEMA_VERSION:
        raise _error(payload_name, f"schema_version must be {HUB_BUNDLE_SCHEMA_VERSION}")
    hub = _mapping(root.get("hub"), f"{payload_name}.hub")
    model = str(hub.get("version") or "").upper()
    if model not in _KNOWN_MODELS:
        raise _error(f"{payload_name}.hub.version", "must be X1, X1S, or X2")
    actual_model = str(hub_version or "").upper()
    if actual_model in _KNOWN_MODELS and model != actual_model:
        raise _error(
            f"{payload_name}.hub.version",
            f"declares {model} but the selected hub is {actual_model}",
        )
    if enforce_editor_invariants and hub.get("name") is not None:
        _validate_name(hub.get("name"), f"{payload_name}.hub.name", model)

    devices, activities, commands = _index_bundle(
        root,
        path=payload_name,
        model=model,
        strict_for=_strict_for,
    )
    for device_id, device in devices.items():
        path = f"{payload_name}.devices[{device_id}]"
        macros = _validate_macros(
            device,
            owner_id=device_id,
            owner_kind="device",
            path=path,
            model=model,
            strict=_strict_for(device_id),
            devices=devices,
            activities=activities,
            commands=commands,
        )
        _validate_bindings(
            device,
            owner_id=device_id,
            owner_kind="device",
            path=path,
            model=model,
            macros=macros,
            devices=devices,
            activities=activities,
            commands=commands,
        )
        if _strict_for(device_id):
            record = device.get("input_record")
            if record is not None:
                entries = _list(_mapping(record, f"{path}.input_record").get("entries"), f"{path}.input_record.entries")
                for index, raw_entry in enumerate(entries):
                    entry_path = f"{path}.input_record.entries[{index}]"
                    entry = _mapping(raw_entry, entry_path)
                    command_id = _integer(entry.get("command_id"), f"{entry_path}.command_id", minimum=1, maximum=0xFE)
                    if command_id not in commands[device_id]:
                        raise _error(entry_path, f"references missing command {command_id}")
                    _optional_byte(entry, "input_index", entry_path)

    for activity_id, activity in activities.items():
        path = f"{payload_name}.activities[{activity_id}]"
        macros = _validate_macros(
            activity,
            owner_id=activity_id,
            owner_kind="activity",
            path=path,
            model=model,
            strict=_strict_for(activity_id),
            devices=devices,
            activities=activities,
            commands=commands,
        )
        _validate_bindings(
            activity,
            owner_id=activity_id,
            owner_kind="activity",
            path=path,
            model=model,
            macros=macros,
            devices=devices,
            activities=activities,
            commands=commands,
        )
        _validate_activity(
            activity,
            activity_id=activity_id,
            path=path,
            model=model,
            strict=_strict_for(activity_id),
            macros=macros,
            devices=devices,
            activities=activities,
            commands=commands,
        )
    return model

