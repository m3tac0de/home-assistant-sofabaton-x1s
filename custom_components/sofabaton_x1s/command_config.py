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
COMMAND_HASH_VERSION = "v5"
COMMAND_BRAND_PREFIX = "m3"
LEGACY_COMMAND_BRAND_PREFIX = "m3tac0de"
COMMAND_SLOT_COUNT = 10
POWER_COMMAND_MIN = 1
POWER_COMMAND_MAX = 10
MAX_WIFI_DEVICES = 5
DEFAULT_WIFI_DEVICE_KEY = "default"
DEFAULT_WIFI_DEVICE_NAME = "Home Assistant"

DEFAULT_COMMAND_ACTION = {"action": "perform-action"}

# Hub-level event hooks. These live only in the HA-side config store and are
# never synced to the hub:
#   power_off      - the hub switched from an activity into POWERED OFF
#   redundant_off  - OFF was pressed while the hub was already POWERED OFF
#   activity_start - the hub switched into an activity
#   activity_stop  - an activity stopped (switch to another activity or OFF)
HUB_EVENT_ACTION_KEYS = ("power_off", "redundant_off", "activity_start", "activity_stop")

# Per-activity event hooks (also HA-side only). Keyed by the hub activity id;
# no matching beyond the id is attempted — if the hub reuses an id for a new
# activity the hook simply applies to the new activity, and ids that leave
# the hub's catalog are pruned so the store stays clean over time.
ACTIVITY_EVENT_PHASES = ("start", "stop")

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

    add_as_favorite = bool(slot.get("add_as_favorite", False))
    hard_button = str(slot.get("hard_button", ""))
    # The activities list only carries meaning for favorites and hard-button
    # bindings. The command editor auto-selects a default activity and hides
    # (without clearing) the selection when both toggles are off, so orphaned
    # entries would otherwise silently pull the wifi device into activities
    # the user never sees referenced (issue #258).
    activities_active = add_as_favorite or bool(hard_button.strip())
    return {
        "name": str(slot.get("name", f"Command {idx + 1}")),
        "add_as_favorite": add_as_favorite,
        "hard_button": hard_button,
        "long_press_enabled": bool(slot.get("long_press_enabled", False))
        and bool(hard_button.strip()),
        "input_activity_id": str(slot.get("input_activity_id", "")),
        "activities": [
            str(activity)
            for activity in slot.get("activities", [])
            if str(activity) != ""
        ]
        if activities_active and isinstance(slot.get("activities"), list)
        else [],
        "action": _normalize_action(slot.get("action")),
        "long_press_action": _normalize_action(slot.get("long_press_action")),
    }


def _normalize_activity_labels(value: Any) -> dict[str, str]:
    """Normalize the id->name snapshot taken when activities were selected.

    Keys are activity ids as strings (matching the id strings stored in the
    command slots); values are the activity names the user saw at
    configuration time. Used at deploy time to detect hub-side id reuse.
    """

    if not isinstance(value, dict):
        return {}
    labels: dict[str, str] = {}
    for key, name in value.items():
        key_text = str(key).strip()
        name_text = str(name).strip()
        if key_text and name_text:
            labels[key_text] = name_text
    return labels


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


def normalize_hub_event_actions(raw: Any) -> dict[str, dict[str, Any]]:
    """Normalize the hub-level event-action mapping.

    Always returns every key in :data:`HUB_EVENT_ACTION_KEYS`; unset hooks
    carry the default (no-op) action payload.
    """

    source = raw if isinstance(raw, dict) else {}
    return {
        key: _normalize_action(source.get(key))
        for key in HUB_EVENT_ACTION_KEYS
    }


def normalize_activity_event_actions(raw: Any) -> dict[str, dict[str, dict[str, Any]]]:
    """Normalize the per-activity event-action mapping.

    Keys are hub activity ids as strings; values carry one action per phase
    in :data:`ACTIVITY_EVENT_PHASES`. Entries whose phases are all the
    default (no-op) action are dropped entirely so unset activities never
    accumulate in the store.
    """

    source = raw if isinstance(raw, dict) else {}
    normalized: dict[str, dict[str, dict[str, Any]]] = {}
    for key, value in source.items():
        try:
            activity_id = int(str(key).strip())
        except (TypeError, ValueError):
            continue
        if activity_id < 0:
            continue
        phases = value if isinstance(value, dict) else {}
        entry = {
            phase: _normalize_action(phases.get(phase))
            for phase in ACTIVITY_EVENT_PHASES
        }
        if all(entry[phase] == DEFAULT_COMMAND_ACTION for phase in ACTIVITY_EVENT_PHASES):
            continue
        normalized[str(activity_id)] = entry
    return normalized


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
        # Salting with the hash version lets a deploy-behavior change (not
        # just a config change) flag existing deploys out of step once —
        # v5: derived device-page key bindings ride the deploy.
        "hash_version": COMMAND_HASH_VERSION,
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
        "activity_labels": {},
        "deployed_commands": [],
        "deployed_device_id": None,
        "deployed_commands_hash": "",
        # The listener port the deployed callbacks were built with. The port
        # is baked into the hub-side records at deploy time, so the in-place
        # re-sync path may only run while it is unchanged; None (pre-upgrade
        # deploys) forces one replace-path sync that backfills it.
        "deployed_request_port": None,
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
    payload["activity_labels"] = _normalize_activity_labels(device.get("activity_labels"))
    deployed = device.get("deployed_commands")
    payload["deployed_commands"] = deployed if isinstance(deployed, list) else []
    deployed_device_id = device.get("deployed_device_id")
    payload["deployed_device_id"] = int(deployed_device_id) if isinstance(deployed_device_id, int) else None
    payload["deployed_commands_hash"] = str(device.get("deployed_commands_hash") or "").strip()
    deployed_request_port = device.get("deployed_request_port")
    payload["deployed_request_port"] = (
        int(deployed_request_port) if isinstance(deployed_request_port, int) else None
    )
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
            if normalized_key == DEFAULT_WIFI_DEVICE_KEY and not devices:
                default_device = _default_device_payload()
                devices.append(default_device)
                return default_device
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
            "activity_labels": _normalize_activity_labels(device.get("activity_labels")),
            "deployed_device_id": device.get("deployed_device_id"),
            "deployed_commands_hash": str(device.get("deployed_commands_hash") or ""),
            "deployed_request_port": device.get("deployed_request_port"),
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

    async def async_export_hub_config(
        self,
        entry_id: str,
        *,
        roku_listen_port: int = DEFAULT_ROKU_LISTEN_PORT,
    ) -> dict[str, Any]:
        """Return a hub-scoped debug snapshot of the command-config store."""

        devices = self._hub_device_records(entry_id)
        return {
            "store_version": COMMAND_CONFIG_STORE_VERSION,
            "store_minor_version": COMMAND_CONFIG_STORE_MINOR_VERSION,
            "entry_id": entry_id,
            "command_config_store": {
                "hubs": {
                    entry_id: {
                        "devices": deepcopy(devices),
                        "event_actions": self.get_hub_event_actions(entry_id),
                        "activity_event_actions": self.get_activity_event_actions(entry_id),
                    }
                }
            },
            "device_summaries": [
                self._payload_for_device(device, roku_listen_port=roku_listen_port)
                for device in devices
            ],
        }

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

    async def async_rename_hub_device(
        self,
        entry_id: str,
        device_key: str,
        device_name: str,
        *,
        deployed_commands_hash: str | None = None,
    ) -> bool:
        """Rename an existing Wifi Device record in place.

        Used when a deployed managed device is renamed through the live
        device editor: the hub already carries the new name, so the store
        must follow instead of flagging (or later reverting) the rename.
        When the record was in sync at rename time the caller passes the
        recomputed *deployed_commands_hash* (the hash covers the device
        name) so the record stays in sync.
        """

        devices = self._hub_device_records(entry_id)
        normalized_key = _normalize_device_key(device_key)
        device = next(
            (item for item in devices if item["device_key"] == normalized_key),
            None,
        )
        if device is None:
            return False
        normalized_name = str(device_name or "").strip()
        if not normalized_name:
            return False
        changed = False
        if device.get("device_name") != normalized_name:
            device["device_name"] = normalized_name
            changed = True
        if deployed_commands_hash is not None:
            normalized_hash = str(deployed_commands_hash or "").strip()
            if str(device.get("deployed_commands_hash") or "").strip() != normalized_hash:
                device["deployed_commands_hash"] = normalized_hash
                changed = True
        if changed:
            await self._store.async_save(self._data)
        return changed

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
        request_port: int | None = None,
    ) -> None:
        """Persist the command list that was last successfully synced to the hub.

        The list is ordered and its indices correspond directly to the
        ``command_index`` values embedded in callback URLs, so it must never be
        mutated after being written here. ``request_port`` records the listener
        port the deployed callbacks were built with (gates the in-place
        re-sync path).
        """
        hub_device = self._find_hub_device_record(entry_id, device_key)
        hub_device["deployed_commands"] = commands
        hub_device["deployed_device_id"] = deployed_device_id
        hub_device["deployed_commands_hash"] = str(commands_hash or "").strip()
        hub_device["deployed_request_port"] = (
            int(request_port) if isinstance(request_port, int) else None
        )
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

    async def async_reconcile_deployed_wifi_devices(
        self,
        entry_id: str,
        assignments: list[tuple[str, int | None, str]],
    ) -> bool:
        """Persist repaired deployed-device ownership for all Wifi Device records.

        Any record not present in *assignments* has its deployed ownership cleared.
        This lets the hub reconcile pass repair duplicate or stale migrated claims
        in one atomic store write.
        """

        devices = self._hub_device_records(entry_id)
        normalized_assignments: dict[str, tuple[int | None, str]] = {}
        for raw_device_key, raw_device_id, raw_commands_hash in assignments:
            normalized_key = _normalize_device_key(raw_device_key)
            if not normalized_key:
                continue
            normalized_assignments[normalized_key] = (
                int(raw_device_id) if isinstance(raw_device_id, int) else None,
                str(raw_commands_hash or "").strip(),
            )

        changed = False
        for device in devices:
            device_key = str(device.get("device_key") or "")
            assignment = normalized_assignments.get(device_key)
            if assignment is not None:
                deployed_device_id, deployed_commands_hash = assignment
                if device.get("deployed_device_id") != deployed_device_id:
                    device["deployed_device_id"] = deployed_device_id
                    changed = True
                if str(device.get("deployed_commands_hash") or "").strip() != deployed_commands_hash:
                    device["deployed_commands_hash"] = deployed_commands_hash
                    changed = True
                continue

            if device.get("deployed_device_id") is not None:
                device["deployed_device_id"] = None
                changed = True
            if str(device.get("deployed_commands_hash") or "").strip():
                device["deployed_commands_hash"] = ""
                changed = True
            deployed_commands = device.get("deployed_commands")
            if isinstance(deployed_commands, list) and deployed_commands:
                device["deployed_commands"] = []
                changed = True

        if changed:
            await self._store.async_save(self._data)
        return changed

    def get_deployed_wifi_commands(
        self,
        entry_id: str,
        *,
        hub_device_id: int | None = None,
        device_key: str | None = None,
    ) -> list[dict[str, Any]]:
        """Return the deployed command snapshot for *entry_id*, or [] if none."""
        devices = self._hub_device_records(entry_id)
        if hub_device_id is not None:
            matches = [device for device in devices if device.get("deployed_device_id") == hub_device_id]
            if len(matches) == 1:
                result = matches[0].get("deployed_commands")
                return result if isinstance(result, list) else []
            if len(matches) > 1:
                return []

        if device_key is not None:
            normalized_key = _normalize_device_key(device_key)
            matches = [device for device in devices if device.get("device_key") == normalized_key]
            if len(matches) == 1:
                result = matches[0].get("deployed_commands")
                return result if isinstance(result, list) else []
            if len(matches) > 1:
                return []

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
            matches = [device for device in devices if device.get("device_key") == normalized_key]
            if len(matches) == 1:
                target_device = matches[0]
            elif len(matches) > 1:
                return None
        elif hub_device_id is not None:
            matches = [device for device in devices if device.get("deployed_device_id") == hub_device_id]
            if len(matches) == 1:
                target_device = matches[0]
            elif len(matches) > 1:
                return None

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

    def get_hub_event_actions(self, entry_id: str) -> dict[str, dict[str, Any]]:
        """Return the hub-level event actions (HA-side only, never synced)."""

        hub = self._hub_record(entry_id)
        return normalize_hub_event_actions(hub.get("event_actions"))

    async def async_set_hub_event_actions(
        self,
        entry_id: str,
        actions: Any,
    ) -> dict[str, dict[str, Any]]:
        hub = self._hub_record(entry_id)
        hub["event_actions"] = normalize_hub_event_actions(actions)
        await self._store.async_save(self._data)
        return normalize_hub_event_actions(hub.get("event_actions"))

    def get_activity_event_actions(self, entry_id: str) -> dict[str, dict[str, dict[str, Any]]]:
        """Return the per-activity event actions (HA-side only, never synced)."""

        hub = self._hub_record(entry_id)
        return normalize_activity_event_actions(hub.get("activity_event_actions"))

    async def async_set_activity_event_actions(
        self,
        entry_id: str,
        actions: Any,
    ) -> dict[str, dict[str, dict[str, Any]]]:
        hub = self._hub_record(entry_id)
        hub["activity_event_actions"] = normalize_activity_event_actions(actions)
        await self._store.async_save(self._data)
        return normalize_activity_event_actions(hub.get("activity_event_actions"))

    async def async_prune_activity_event_actions(
        self,
        entry_id: str,
        valid_activity_ids: Any,
    ) -> bool:
        """Drop per-activity actions whose activity id left the hub catalog.

        Called with the authoritative activity-id set after a catalog
        refresh; saves only when something was actually removed.
        """

        hub = self._hub_record(entry_id)
        current = normalize_activity_event_actions(hub.get("activity_event_actions"))
        if not current:
            return False
        valid: set[str] = set()
        for value in valid_activity_ids or []:
            try:
                valid.add(str(int(value)))
            except (TypeError, ValueError):
                continue
        pruned = {key: entry for key, entry in current.items() if key in valid}
        if pruned == current:
            return False
        hub["activity_event_actions"] = pruned
        await self._store.async_save(self._data)
        return True

    async def async_set_hub_commands(
        self,
        entry_id: str,
        commands: Any,
        *,
        device_key: str | None = None,
        roku_listen_port: int = DEFAULT_ROKU_LISTEN_PORT,
        power_on_command_id: Any = None,
        power_off_command_id: Any = None,
        activity_labels: Any = None,
    ) -> dict[str, Any]:
        normalized = normalize_commands(commands)
        normalized_power_on = normalize_power_command_id(power_on_command_id)
        normalized_power_off = normalize_power_command_id(power_off_command_id)
        device = self._find_hub_device_record(entry_id, device_key)
        device["commands"] = normalized
        device["power_on_command_id"] = normalized_power_on
        device["power_off_command_id"] = normalized_power_off
        if activity_labels is not None:
            device["activity_labels"] = _normalize_activity_labels(activity_labels)
        await self._store.async_save(self._data)
        return self._payload_for_device(device, roku_listen_port=roku_listen_port)


async def async_get_command_config_store(hass: HomeAssistant) -> CommandConfigStore:
    """Return the shared command-config store, loading it on demand."""

    domain_data = hass.data.setdefault(DOMAIN, {})
    store = domain_data.get("command_config_store")
    if store is not None:
        return store

    store = CommandConfigStore(hass)
    await store.async_load()
    domain_data["command_config_store"] = store
    return store
