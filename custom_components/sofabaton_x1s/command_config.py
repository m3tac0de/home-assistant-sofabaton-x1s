from __future__ import annotations

import hashlib
import json
import re
import secrets
from copy import deepcopy
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import DEFAULT_ROKU_LISTEN_PORT, DOMAIN

COMMAND_CONFIG_STORE_VERSION = 1
COMMAND_CONFIG_STORE_MINOR_VERSION = 3
COMMAND_HASH_VERSION = "v4"
COMMAND_BRAND_PREFIX = "m3tac0de"
COMMAND_SLOT_COUNT = 10
POWER_COMMAND_MIN = 1
POWER_COMMAND_MAX = 10
MAX_WIFI_DEVICES = 5
DEFAULT_WIFI_DEVICE_KEY = "default"
DEFAULT_WIFI_DEVICE_NAME = "Home Assistant"

DEFAULT_COMMAND_ACTION = {"action": "perform-action"}

_SPACE_RE = re.compile(r"\s+")


def _default_slot(idx: int) -> dict[str, Any]:
    return {
        "name": f"Command {idx + 1}",
        "add_as_favorite": True,
        "hard_button": "",
        "long_press_enabled": False,
        "input_activity_id": "",
        "activities": [],
        "action": deepcopy(DEFAULT_COMMAND_ACTION),
        "long_press_action": deepcopy(DEFAULT_COMMAND_ACTION),
    }


def default_commands() -> list[dict[str, Any]]:
    return [_default_slot(idx) for idx in range(COMMAND_SLOT_COUNT)]


def normalize_power_command_id(value: Any, *, max_command_id: int = POWER_COMMAND_MAX) -> int | None:
    try:
        command_id = int(value)
    except (TypeError, ValueError):
        return None

    if command_id < POWER_COMMAND_MIN or command_id > int(max_command_id):
        return None

    return command_id


def normalize_command_id_list(
    values: Any,
    *,
    max_command_id: int = POWER_COMMAND_MAX,
) -> list[int] | None:
    if values is None:
        return None

    if not isinstance(values, list):
        return None

    normalized: list[int] = []
    for value in values:
        command_id = normalize_power_command_id(value, max_command_id=max_command_id)
        if command_id is None:
            return None
        normalized.append(command_id)

    return normalized


def _normalize_slot(slot: Any, idx: int) -> dict[str, Any]:
    if not isinstance(slot, dict):
        return _default_slot(idx)

    return {
        "name": str(slot.get("name", f"Command {idx + 1}")),
        "add_as_favorite": bool(slot.get("add_as_favorite", False)),
        "hard_button": str(slot.get("hard_button", "")),
        "long_press_enabled": bool(slot.get("long_press_enabled", False))
        and bool(str(slot.get("hard_button", "")).strip()),
        "input_activity_id": str(slot.get("input_activity_id", "")),
        "activities": [
            str(activity)
            for activity in slot.get("activities", [])
            if str(activity) != ""
        ]
        if isinstance(slot.get("activities"), list)
        else [],
        "action": _normalize_action(slot.get("action")),
        "long_press_action": _normalize_action(slot.get("long_press_action")),
    }


def _normalize_action(action: Any) -> dict[str, Any]:
    if isinstance(action, list):
        first = next((item for item in action if isinstance(item, dict)), None)
        normalized = first or DEFAULT_COMMAND_ACTION
        if isinstance(normalized, dict) and normalized.get("action"):
            return dict(normalized)
        if isinstance(normalized, dict):
            return {**normalized, **DEFAULT_COMMAND_ACTION}
        return dict(DEFAULT_COMMAND_ACTION)

    if isinstance(action, dict):
        return dict(action) if action.get("action") else {**action, **DEFAULT_COMMAND_ACTION}

    return dict(DEFAULT_COMMAND_ACTION)


def normalize_commands(raw: Any) -> list[dict[str, Any]]:
    slots = default_commands()
    if not isinstance(raw, list):
        return slots

    for idx, item in enumerate(raw[:COMMAND_SLOT_COUNT]):
        slots[idx] = _normalize_slot(item, idx)

    return slots


def count_configured_command_slots(commands: Any) -> int:
    normalized = normalize_commands(commands)
    defaults = default_commands()
    configured = 0
    for idx, slot in enumerate(normalized):
        if _normalize_slot(slot, idx) != _normalize_slot(defaults[idx], idx):
            configured += 1
    return configured


def wifi_device_requires_listener(config_payload: dict[str, Any]) -> bool:
    """Return True when this wifi-device record still expects callbacks."""

    deployed_device_id = config_payload.get("deployed_device_id")
    deployed_commands_hash = str(config_payload.get("deployed_commands_hash") or "").strip()
    return isinstance(deployed_device_id, int) or bool(deployed_commands_hash)


def _hash_payload(commands: list[dict[str, Any]]) -> list[dict[str, Any]]:
    payload: list[dict[str, Any]] = []
    for slot in commands:
        payload.append(
            {
                "name": str(slot.get("name", "")).strip(),
                "is_favorite": bool(slot.get("add_as_favorite", False)),
                "mapped_key": str(slot.get("hard_button", "")).strip(),
                "long_press_enabled": bool(slot.get("long_press_enabled", False))
                and bool(str(slot.get("hard_button", "")).strip()),
                "input_activity_id": str(slot.get("input_activity_id", "")).strip(),
                "activities": sorted(
                    [str(activity).strip() for activity in slot.get("activities", []) if str(activity).strip()],
                ),
            }
        )

    payload.sort(
        key=lambda row: (
            row["name"].lower(),
            row["mapped_key"],
            "1" if row["long_press_enabled"] else "0",
            "1" if row["is_favorite"] else "0",
            row["input_activity_id"],
            ",".join(row["activities"]),
        )
    )
    return payload


def compute_commands_hash(
    commands: list[dict[str, Any]],
    *,
    device_name: str = DEFAULT_WIFI_DEVICE_NAME,
    roku_listen_port: int = DEFAULT_ROKU_LISTEN_PORT,
    power_on_command_id: int | None = None,
    power_off_command_id: int | None = None,
) -> str:
    payload = {
        "commands": _hash_payload(normalize_commands(commands)),
        "device_name": str(device_name or DEFAULT_WIFI_DEVICE_NAME).strip(),
        "roku_listen_port": int(roku_listen_port),
        "power_on_command_id": normalize_power_command_id(power_on_command_id),
        "power_off_command_id": normalize_power_command_id(power_off_command_id),
    }
    digest = hashlib.sha256(
        json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    return digest[:15]


def normalize_command_name(value: Any) -> str:
    text = str(value or "")
    text = text.replace("_", " ")
    text = _SPACE_RE.sub(" ", text).strip()
    return text.casefold()


def _normalize_device_key(value: Any) -> str:
    text = str(value or "").strip().lower()
    return "".join(ch for ch in text if ch.isalnum())[:24]


def _default_device_payload(
    *,
    device_key: str = DEFAULT_WIFI_DEVICE_KEY,
    device_name: str = DEFAULT_WIFI_DEVICE_NAME,
) -> dict[str, Any]:
    return {
        "device_key": _normalize_device_key(device_key) or DEFAULT_WIFI_DEVICE_KEY,
        "device_name": str(device_name or DEFAULT_WIFI_DEVICE_NAME).strip() or DEFAULT_WIFI_DEVICE_NAME,
        "commands": default_commands(),
        "power_on_command_id": None,
        "power_off_command_id": None,
        "deployed_commands": [],
        "deployed_device_id": None,
        "deployed_commands_hash": "",
    }


def _normalize_device_payload(
    device: Any,
    *,
    fallback_key: str,
    fallback_name: str = DEFAULT_WIFI_DEVICE_NAME,
) -> dict[str, Any]:
    if not isinstance(device, dict):
        return _default_device_payload(device_key=fallback_key, device_name=fallback_name)

    payload = _default_device_payload(
        device_key=_normalize_device_key(device.get("device_key")) or fallback_key,
        device_name=str(device.get("device_name") or fallback_name).strip() or fallback_name,
    )
    payload["commands"] = normalize_commands(device.get("commands"))
    payload["power_on_command_id"] = normalize_power_command_id(device.get("power_on_command_id"))
    payload["power_off_command_id"] = normalize_power_command_id(device.get("power_off_command_id"))
    deployed = device.get("deployed_commands")
    payload["deployed_commands"] = deployed if isinstance(deployed, list) else []
    deployed_device_id = device.get("deployed_device_id")
    payload["deployed_device_id"] = int(deployed_device_id) if isinstance(deployed_device_id, int) else None
    payload["deployed_commands_hash"] = str(device.get("deployed_commands_hash") or "").strip()
    return payload


class CommandConfigStore:
    def __init__(self, hass: HomeAssistant) -> None:
        self._store: Store[dict[str, Any]] = Store(
            hass,
            COMMAND_CONFIG_STORE_VERSION,
            f"{DOMAIN}.command_config",
            minor_version=COMMAND_CONFIG_STORE_MINOR_VERSION,
        )
        self._data: dict[str, Any] = {"hubs": {}}

    async def async_load(self) -> None:
        loaded = await self._store.async_load()
        if isinstance(loaded, dict) and isinstance(loaded.get("hubs"), dict):
            self._data = loaded

    def _hub_record(self, entry_id: str) -> dict[str, Any]:
        hubs = self._data.setdefault("hubs", {})
        hub = hubs.setdefault(entry_id, {})
        if not isinstance(hub, dict):
            hub = {}
            hubs[entry_id] = hub
        return hub

    def _hub_device_records(self, entry_id: str) -> list[dict[str, Any]]:
        hub = self._hub_record(entry_id)
        devices_raw = hub.get("devices")
        if isinstance(devices_raw, list):
            normalized: list[dict[str, Any]] = []
            seen_keys: set[str] = set()
            for idx, device in enumerate(devices_raw):
                fallback_key = f"device{idx + 1}"
                payload = _normalize_device_payload(device, fallback_key=fallback_key)
                if payload["device_key"] in seen_keys:
                    payload["device_key"] = f"{payload['device_key']}{idx + 1}"
                seen_keys.add(payload["device_key"])
                normalized.append(payload)
            hub["devices"] = normalized[:MAX_WIFI_DEVICES]
            return hub["devices"]

        if any(key in hub for key in ("commands", "power_on_command_id", "power_off_command_id", "deployed_wifi_commands")):
            migrated = _default_device_payload()
            migrated["commands"] = normalize_commands(hub.get("commands"))
            migrated["power_on_command_id"] = normalize_power_command_id(hub.get("power_on_command_id"))
            migrated["power_off_command_id"] = normalize_power_command_id(hub.get("power_off_command_id"))
            deployed = hub.get("deployed_wifi_commands")
            migrated["deployed_commands"] = deployed if isinstance(deployed, list) else []
            hub["devices"] = [migrated]
            return hub["devices"]

        hub["devices"] = []
        return hub["devices"]

    def _find_hub_device_record(
        self,
        entry_id: str,
        device_key: str | None,
    ) -> dict[str, Any]:
        devices = self._hub_device_records(entry_id)
        normalized_key = _normalize_device_key(device_key) if device_key is not None else ""
        if normalized_key:
            for device in devices:
                if device["device_key"] == normalized_key:
                    return device
            raise KeyError(normalized_key)
        if devices:
            return devices[0]
        default_device = _default_device_payload()
        devices.append(default_device)
        return default_device

    def _payload_for_device(
        self,
        device: dict[str, Any],
        *,
        roku_listen_port: int,
    ) -> dict[str, Any]:
        commands = normalize_commands(device.get("commands"))
        power_on_command_id = normalize_power_command_id(device.get("power_on_command_id"))
        power_off_command_id = normalize_power_command_id(device.get("power_off_command_id"))
        device_name = str(device.get("device_name") or DEFAULT_WIFI_DEVICE_NAME).strip() or DEFAULT_WIFI_DEVICE_NAME
        return {
            "device_key": str(device.get("device_key") or DEFAULT_WIFI_DEVICE_KEY),
            "device_name": device_name,
            "commands": commands,
            "power_on_command_id": power_on_command_id,
            "power_off_command_id": power_off_command_id,
            "hash_version": COMMAND_HASH_VERSION,
            "commands_hash": compute_commands_hash(
                commands,
                device_name=device_name,
                roku_listen_port=roku_listen_port,
                power_on_command_id=power_on_command_id,
                power_off_command_id=power_off_command_id,
            ),
            "configured_slot_count": count_configured_command_slots(commands),
            "deployed_device_id": device.get("deployed_device_id"),
            "deployed_commands_hash": str(device.get("deployed_commands_hash") or ""),
        }

    async def async_list_hub_devices(
        self,
        entry_id: str,
        *,
        roku_listen_port: int = DEFAULT_ROKU_LISTEN_PORT,
    ) -> list[dict[str, Any]]:
        return [
            self._payload_for_device(device, roku_listen_port=roku_listen_port)
            for device in self._hub_device_records(entry_id)
        ]

    async def async_get_hub_config(
        self,
        entry_id: str,
        *,
        device_key: str | None = None,
        roku_listen_port: int = DEFAULT_ROKU_LISTEN_PORT,
    ) -> dict[str, Any]:
        device = self._find_hub_device_record(entry_id, device_key)
        return self._payload_for_device(device, roku_listen_port=roku_listen_port)

    async def async_create_hub_device(
        self,
        entry_id: str,
        device_name: str,
        *,
        roku_listen_port: int = DEFAULT_ROKU_LISTEN_PORT,
    ) -> dict[str, Any]:
        devices = self._hub_device_records(entry_id)
        if len(devices) >= MAX_WIFI_DEVICES:
            raise ValueError(f"Maximum of {MAX_WIFI_DEVICES} Wifi Devices supported")
        device_key = _normalize_device_key(secrets.token_hex(4))
        while any(device["device_key"] == device_key for device in devices):
            device_key = _normalize_device_key(secrets.token_hex(4))
        payload = _default_device_payload(
            device_key=device_key,
            device_name=str(device_name or DEFAULT_WIFI_DEVICE_NAME).strip() or DEFAULT_WIFI_DEVICE_NAME,
        )
        devices.append(payload)
        await self._store.async_save(self._data)
        return self._payload_for_device(payload, roku_listen_port=roku_listen_port)

    async def async_delete_hub_device(self, entry_id: str, device_key: str) -> bool:
        devices = self._hub_device_records(entry_id)
        normalized_key = _normalize_device_key(device_key)
        next_devices = [device for device in devices if device["device_key"] != normalized_key]
        if len(next_devices) == len(devices):
            return False
        self._hub_record(entry_id)["devices"] = next_devices
        await self._store.async_save(self._data)
        return True

    async def async_save_deployed_wifi_commands(
        self,
        entry_id: str,
        device_key: str,
        commands: list[dict[str, Any]],
        *,
        deployed_device_id: int | None = None,
        commands_hash: str = "",
    ) -> None:
        """Persist the command list that was last successfully synced to the hub.

        The list is ordered and its indices correspond directly to the
        ``command_index`` values embedded in callback URLs, so it must never be
        mutated after being written here.
        """
        hub_device = self._find_hub_device_record(entry_id, device_key)
        hub_device["deployed_commands"] = commands
        hub_device["deployed_device_id"] = deployed_device_id
        hub_device["deployed_commands_hash"] = str(commands_hash or "").strip()
        await self._store.async_save(self._data)

    async def async_set_deployed_device_id(
        self,
        entry_id: str,
        device_key: str,
        deployed_device_id: int | None,
    ) -> bool:
        """Persist the deployed hub-device id for an existing Wifi Device record."""

        hub_device = self._find_hub_device_record(entry_id, device_key)
        normalized_device_id = int(deployed_device_id) if isinstance(deployed_device_id, int) else None
        if hub_device.get("deployed_device_id") == normalized_device_id:
            return False
        hub_device["deployed_device_id"] = normalized_device_id
        await self._store.async_save(self._data)
        return True

    def get_deployed_wifi_commands(
        self,
        entry_id: str,
        *,
        hub_device_id: int | None = None,
        device_key: str | None = None,
    ) -> list[dict[str, Any]]:
        """Return the deployed command snapshot for *entry_id*, or [] if none."""
        devices = self._hub_device_records(entry_id)
        for device in devices:
            if hub_device_id is not None and device.get("deployed_device_id") == hub_device_id:
                result = device.get("deployed_commands")
                return result if isinstance(result, list) else []
            if device_key is not None and device.get("device_key") == _normalize_device_key(device_key):
                result = device.get("deployed_commands")
                return result if isinstance(result, list) else []

        # Upgrade bridge for the old single-device store layout used before
        # deployed hub-device ids were persisted. Once a user re-syncs on the
        # newer multi-device implementation this fallback becomes unnecessary.
        if hub_device_id is not None and len(devices) == 1:
            legacy_device = devices[0]
            if legacy_device.get("deployed_device_id") is None:
                result = legacy_device.get("deployed_commands")
                if isinstance(result, list) and result:
                    return result
        return []

    def get_live_wifi_command_slot(
        self,
        entry_id: str,
        *,
        command_index: int,
        hub_device_id: int | None = None,
        device_key: str | None = None,
    ) -> dict[str, Any] | None:
        """Return the current staged slot for a callback-targeted Wifi Device."""

        devices = self._hub_device_records(entry_id)
        target_device: dict[str, Any] | None = None

        normalized_key = _normalize_device_key(device_key) if device_key is not None else ""
        if normalized_key:
            for device in devices:
                if device.get("device_key") == normalized_key:
                    target_device = device
                    break
        elif hub_device_id is not None:
            for device in devices:
                if device.get("deployed_device_id") == hub_device_id:
                    target_device = device
                    break

            # Upgrade bridge for single-device records migrated from the old
            # store layout where deployed hub-device ids were not persisted.
            if target_device is None and len(devices) == 1:
                legacy_device = devices[0]
                if legacy_device.get("deployed_device_id") is None:
                    target_device = legacy_device

        if target_device is None:
            return None

        commands = normalize_commands(target_device.get("commands"))
        if 0 <= command_index < len(commands):
            return commands[command_index]
        return None

    async def async_set_hub_commands(
        self,
        entry_id: str,
        commands: Any,
        *,
        device_key: str | None = None,
        roku_listen_port: int = DEFAULT_ROKU_LISTEN_PORT,
        power_on_command_id: Any = None,
        power_off_command_id: Any = None,
    ) -> dict[str, Any]:
        normalized = normalize_commands(commands)
        normalized_power_on = normalize_power_command_id(power_on_command_id)
        normalized_power_off = normalize_power_command_id(power_off_command_id)
        device = self._find_hub_device_record(entry_id, device_key)
        device["commands"] = normalized
        device["power_on_command_id"] = normalized_power_on
        device["power_off_command_id"] = normalized_power_off
        await self._store.async_save(self._data)
        return self._payload_for_device(device, roku_listen_port=roku_listen_port)


async def async_get_command_config_store(hass: HomeAssistant) -> CommandConfigStore:
    """Return the shared command-config store, loading it on demand."""

    domain_data = hass.data.setdefault(DOMAIN, {})
    store = domain_data.get("command_config_store")
    if isinstance(store, CommandConfigStore):
        return store

    store = CommandConfigStore(hass)
    await store.async_load()
    domain_data["command_config_store"] = store
    return store
