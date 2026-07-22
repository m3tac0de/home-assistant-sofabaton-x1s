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

# The hidden, system-owned "Wifi Events" device (docs/internal/
# wifi-events-plan.md). A regular store record under a reserved key —
# user keys come from secrets.token_hex(4) (pure hex) and "haevents"
# contains non-hex letters, so collision is impossible. The record is
# exempt from MAX_WIFI_DEVICES and hidden only at the WS/frontend
# presentation layer — NEVER filter it in async_list_hub_devices (the
# listener guard, deploy reconciliation, and diagnostics iterate that).
WIFI_EVENTS_DEVICE_KEY = "haevents"
WIFI_EVENTS_DEVICE_NAME = "Wifi Events"
# 50 events -> 100 hub records (50 short + 50 long; deploys always write
# every slot). Hub ceiling live-validated on X1 + X1S 2026-07-22
# (bench_140, plan §11 W0.4). Frozen at record creation: the long-record
# id law (long = short + slot_count) bakes this into deployed ids.
WIFI_EVENTS_SLOT_COUNT = 50
# Defensive clamp for persisted per-record slot counts.
_MAX_RECORD_SLOT_COUNT = 100

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


def default_commands(slot_count: int = COMMAND_SLOT_COUNT) -> list[dict[str, Any]]:
    return [_default_slot(idx) for idx in range(int(slot_count))]


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


def _normalize_slot(
    slot: Any,
    idx: int,
    *,
    standalone_long_press: bool = False,
) -> dict[str, Any]:
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
        # For the Wifi Events record the flag is honored standalone: the
        # long record is always deployed, so the flag only gates HA-side
        # long-press action execution — no hard button required. User wifi
        # devices keep the original coupling. The deploy hash still ANDs
        # with hard_button (see _hash_payload), so flipping the standalone
        # flag never flags the record out-of-step.
        "long_press_enabled": bool(slot.get("long_press_enabled", False))
        and (standalone_long_press or bool(hard_button.strip())),
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


def normalize_commands(
    raw: Any,
    *,
    slot_count: int = COMMAND_SLOT_COUNT,
    standalone_long_press: bool = False,
) -> list[dict[str, Any]]:
    slots = default_commands(slot_count)
    if not isinstance(raw, list):
        return slots

    for idx, item in enumerate(raw[: int(slot_count)]):
        slots[idx] = _normalize_slot(item, idx, standalone_long_press=standalone_long_press)

    return slots


def count_configured_command_slots(
    commands: Any,
    *,
    slot_count: int = COMMAND_SLOT_COUNT,
    standalone_long_press: bool = False,
) -> int:
    normalized = normalize_commands(
        commands, slot_count=slot_count, standalone_long_press=standalone_long_press
    )
    defaults = default_commands(slot_count)
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
    slot_count: int = COMMAND_SLOT_COUNT,
) -> str:
    payload = {
        # Salting with the hash version lets a deploy-behavior change (not
        # just a config change) flag existing deploys out of step once —
        # v5: derived device-page key bindings ride the deploy.
        "hash_version": COMMAND_HASH_VERSION,
        # slot_count deliberately hashes only through the commands list
        # length: at the default 10 the digest is byte-identical to
        # pre-slot_count builds, so existing deploys stay in step.
        "commands": _hash_payload(normalize_commands(commands, slot_count=slot_count)),
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


def is_wifi_events_device_key(value: Any) -> bool:
    """True when *value* names the reserved Wifi Events record."""

    return _normalize_device_key(value) == WIFI_EVENTS_DEVICE_KEY


def _record_slot_count(device_key: Any, raw: Any = None) -> int:
    """Resolve a record's slot count: the persisted value, else the
    per-key default (events record 50, user devices 10)."""

    fallback = (
        WIFI_EVENTS_SLOT_COUNT
        if is_wifi_events_device_key(device_key)
        else COMMAND_SLOT_COUNT
    )
    try:
        value = int(raw)
    except (TypeError, ValueError):
        return fallback
    if value < 1 or value > _MAX_RECORD_SLOT_COUNT:
        return fallback
    return value


def _default_device_payload(
    *,
    device_key: str = DEFAULT_WIFI_DEVICE_KEY,
    device_name: str = DEFAULT_WIFI_DEVICE_NAME,
    slot_count: int | None = None,
) -> dict[str, Any]:
    normalized_key = _normalize_device_key(device_key) or DEFAULT_WIFI_DEVICE_KEY
    resolved_slot_count = _record_slot_count(normalized_key, slot_count)
    return {
        "device_key": normalized_key,
        "device_name": str(device_name or DEFAULT_WIFI_DEVICE_NAME).strip() or DEFAULT_WIFI_DEVICE_NAME,
        # Frozen at record creation: the long-record id law
        # (long = short + slot_count) bakes this into deployed ids.
        "slot_count": resolved_slot_count,
        "commands": default_commands(resolved_slot_count),
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
        slot_count=device.get("slot_count"),
    )
    payload["commands"] = normalize_commands(
        device.get("commands"),
        slot_count=payload["slot_count"],
        standalone_long_press=is_wifi_events_device_key(payload["device_key"]),
    )
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
            # The user-device cap must never drop the reserved Wifi Events
            # record (it is cap-exempt); trim user devices only.
            kept: list[dict[str, Any]] = []
            user_count = 0
            for payload in normalized:
                if is_wifi_events_device_key(payload["device_key"]):
                    kept.append(payload)
                    continue
                if user_count < MAX_WIFI_DEVICES:
                    kept.append(payload)
                    user_count += 1
            hub["devices"] = kept
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
            # Auto-create the legacy default record when no USER device
            # exists yet — the reserved Wifi Events record doesn't count
            # (it can legitimately be the only record in the store).
            if normalized_key == DEFAULT_WIFI_DEVICE_KEY and not any(
                not is_wifi_events_device_key(device["device_key"]) for device in devices
            ):
                default_device = _default_device_payload()
                devices.append(default_device)
                return default_device
            raise KeyError(normalized_key)
        # No-key fallback (legacy sync_command_config service and friends):
        # never silently pick the reserved Wifi Events record.
        for device in devices:
            if not is_wifi_events_device_key(device["device_key"]):
                return device
        default_device = _default_device_payload()
        devices.append(default_device)
        return default_device

    def _payload_for_device(
        self,
        device: dict[str, Any],
        *,
        roku_listen_port: int,
    ) -> dict[str, Any]:
        device_key = str(device.get("device_key") or DEFAULT_WIFI_DEVICE_KEY)
        slot_count = _record_slot_count(device_key, device.get("slot_count"))
        standalone_long_press = is_wifi_events_device_key(device_key)
        commands = normalize_commands(
            device.get("commands"),
            slot_count=slot_count,
            standalone_long_press=standalone_long_press,
        )
        power_on_command_id = normalize_power_command_id(device.get("power_on_command_id"))
        power_off_command_id = normalize_power_command_id(device.get("power_off_command_id"))
        device_name = str(device.get("device_name") or DEFAULT_WIFI_DEVICE_NAME).strip() or DEFAULT_WIFI_DEVICE_NAME
        return {
            "device_key": device_key,
            "device_name": device_name,
            "slot_count": slot_count,
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
                slot_count=slot_count,
            ),
            "configured_slot_count": count_configured_command_slots(
                commands,
                slot_count=slot_count,
                standalone_long_press=standalone_long_press,
            ),
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
        # The reserved Wifi Events record is cap-exempt: only user devices
        # count against the budget.
        user_devices = [
            device for device in devices
            if not is_wifi_events_device_key(device["device_key"])
        ]
        if len(user_devices) >= MAX_WIFI_DEVICES:
            raise ValueError(f"Maximum of {MAX_WIFI_DEVICES} Wifi Devices supported")
        device_key = _normalize_device_key(secrets.token_hex(4))
        # token_hex can't produce the reserved key (non-hex letters) — the
        # loop guard is belt-and-braces should key generation ever change.
        while (
            any(device["device_key"] == device_key for device in devices)
            or is_wifi_events_device_key(device_key)
        ):
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

        commands = normalize_commands(
            target_device.get("commands"),
            slot_count=_record_slot_count(
                target_device.get("device_key"), target_device.get("slot_count")
            ),
            standalone_long_press=is_wifi_events_device_key(target_device.get("device_key")),
        )
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
        device = self._find_hub_device_record(entry_id, device_key)
        normalized = normalize_commands(
            commands,
            slot_count=_record_slot_count(device.get("device_key"), device.get("slot_count")),
            standalone_long_press=is_wifi_events_device_key(device.get("device_key")),
        )
        normalized_power_on = normalize_power_command_id(power_on_command_id)
        normalized_power_off = normalize_power_command_id(power_off_command_id)
        device["commands"] = normalized
        device["power_on_command_id"] = normalized_power_on
        device["power_off_command_id"] = normalized_power_off
        if activity_labels is not None:
            device["activity_labels"] = _normalize_activity_labels(activity_labels)
        await self._store.async_save(self._data)
        return self._payload_for_device(device, roku_listen_port=roku_listen_port)

    # ── Wifi Events (reserved `haevents` record) ────────────────────────
    #
    # docs/internal/wifi-events-plan.md. The record is a regular store
    # record; these helpers are the narrow mutation surface the
    # `wifi_event/*` WS endpoints use — they can't corrupt slot order or
    # unrelated slots the way a wholesale `command_config/set` could.

    def _wifi_events_record(self, entry_id: str) -> dict[str, Any] | None:
        for device in self._hub_device_records(entry_id):
            if is_wifi_events_device_key(device["device_key"]):
                return device
        return None

    def _wifi_events_slots(
        self, record: dict[str, Any]
    ) -> tuple[list[dict[str, Any]], int]:
        slot_count = _record_slot_count(record.get("device_key"), record.get("slot_count"))
        commands = normalize_commands(
            record.get("commands"), slot_count=slot_count, standalone_long_press=True
        )
        return commands, slot_count

    async def async_get_or_create_wifi_events_device(
        self,
        entry_id: str,
        *,
        roku_listen_port: int = DEFAULT_ROKU_LISTEN_PORT,
    ) -> dict[str, Any]:
        """Return the Wifi Events record payload, creating the (cap-exempt)
        record on first use."""

        record = self._wifi_events_record(entry_id)
        if record is None:
            record = _default_device_payload(
                device_key=WIFI_EVENTS_DEVICE_KEY,
                device_name=WIFI_EVENTS_DEVICE_NAME,
            )
            self._hub_device_records(entry_id).append(record)
            await self._store.async_save(self._data)
        return self._payload_for_device(record, roku_listen_port=roku_listen_port)

    def list_wifi_events(self, entry_id: str) -> list[dict[str, Any]]:
        """Configured slots of the Wifi Events record, with their hub ids.

        ``command_id`` follows the short law (slot index + 1),
        ``long_press_command_id`` the long law (short + slot_count) —
        both live-validated at slot_count=50 (plan §11). ``deployed`` is
        True when the slot index is covered by the deployed snapshot;
        a freshly allocated slot reads False until its sync lands.
        """

        record = self._wifi_events_record(entry_id)
        if record is None:
            return []
        commands, slot_count = self._wifi_events_slots(record)
        deployed_commands = record.get("deployed_commands")
        deployed_len = len(deployed_commands) if isinstance(deployed_commands, list) else 0
        deployed_device_id = record.get("deployed_device_id")
        events: list[dict[str, Any]] = []
        for idx, slot in enumerate(commands):
            if slot == _default_slot(idx):
                continue
            events.append(
                {
                    "slot_index": idx,
                    "name": str(slot.get("name") or ""),
                    "long_press_enabled": bool(slot.get("long_press_enabled")),
                    "action": _normalize_action(slot.get("action")),
                    "long_press_action": _normalize_action(slot.get("long_press_action")),
                    "command_id": idx + 1,
                    "long_press_command_id": idx + 1 + slot_count,
                    "device_id": deployed_device_id if isinstance(deployed_device_id, int) else None,
                    "deployed": isinstance(deployed_device_id, int) and idx < deployed_len,
                }
            )
        return events

    async def async_allocate_wifi_event(
        self,
        entry_id: str,
        name: str,
    ) -> dict[str, Any]:
        """Configure the first free slot of the Wifi Events record as a new
        event named *name* (a pure-callback slot: no favorite, no hard
        button, no activities).

        Raises ``ValueError('wifi_events_full')`` when every slot is
        configured and ``ValueError('duplicate_name')`` when *name*
        collides with an existing event (``normalize_command_name``
        equivalence). Charset/hub validation of the name is the caller's
        job (``_validate_wifi_name_for_hub``).
        """

        normalized_name = str(name or "").strip()
        if not normalized_name:
            raise ValueError("empty_name")

        record = self._wifi_events_record(entry_id)
        if record is None:
            record = _default_device_payload(
                device_key=WIFI_EVENTS_DEVICE_KEY,
                device_name=WIFI_EVENTS_DEVICE_NAME,
            )
            self._hub_device_records(entry_id).append(record)

        commands, slot_count = self._wifi_events_slots(record)
        wanted = normalize_command_name(normalized_name)
        free_index: int | None = None
        for idx, slot in enumerate(commands):
            if slot == _default_slot(idx):
                if free_index is None:
                    free_index = idx
                continue
            if normalize_command_name(slot.get("name")) == wanted:
                raise ValueError("duplicate_name")
        if free_index is None:
            raise ValueError("wifi_events_full")

        commands[free_index] = {
            "name": normalized_name,
            "add_as_favorite": False,
            "hard_button": "",
            "long_press_enabled": False,
            "input_activity_id": "",
            "activities": [],
            "action": deepcopy(DEFAULT_COMMAND_ACTION),
            "long_press_action": deepcopy(DEFAULT_COMMAND_ACTION),
        }
        record["commands"] = commands
        await self._store.async_save(self._data)
        return {
            "slot_index": free_index,
            "name": normalized_name,
            "command_id": free_index + 1,
            "long_press_command_id": free_index + 1 + slot_count,
        }

    def _wifi_events_configured_slot(
        self, entry_id: str, slot_index: int
    ) -> tuple[dict[str, Any], list[dict[str, Any]]] | None:
        record = self._wifi_events_record(entry_id)
        if record is None:
            return None
        commands, _slot_count = self._wifi_events_slots(record)
        idx = int(slot_index)
        if not (0 <= idx < len(commands)) or commands[idx] == _default_slot(idx):
            return None
        return record, commands

    async def async_reset_wifi_event_slot(
        self, entry_id: str, slot_index: int
    ) -> bool:
        """Delete an event by resetting its slot to the default IN PLACE.

        Never compacts the list — callback URLs embed the slot index
        (`async_save_deployed_wifi_commands` invariant). Returns False
        when the slot wasn't a configured event.
        """

        found = self._wifi_events_configured_slot(entry_id, slot_index)
        if found is None:
            return False
        record, commands = found
        commands[int(slot_index)] = _default_slot(int(slot_index))
        record["commands"] = commands
        await self._store.async_save(self._data)
        return True

    async def async_set_wifi_event_action(
        self,
        entry_id: str,
        slot_index: int,
        press_type: str,
        action: Any,
    ) -> bool:
        """Set an event's ``action`` (press_type "short") or
        ``long_press_action`` ("long"). No re-deploy needed: the runtime
        reads the staged slot (`get_live_wifi_command_slot`)."""

        found = self._wifi_events_configured_slot(entry_id, slot_index)
        if found is None:
            return False
        record, commands = found
        key = "long_press_action" if str(press_type).lower() == "long" else "action"
        commands[int(slot_index)][key] = _normalize_action(action)
        record["commands"] = commands
        await self._store.async_save(self._data)
        return True

    def wifi_events_record_state(
        self,
        entry_id: str,
        *,
        roku_listen_port: int = DEFAULT_ROKU_LISTEN_PORT,
    ) -> dict[str, Any]:
        """Record-level sync state for the Wifi Events record (W7).

        ``record_needs_sync`` is the standard hash comparison every wifi
        device uses; ``device_id`` is the deployed hub device id or None
        before the first deploy (the frontend inserts placeholder refs
        and the Sync flow resolves them after phase 1).
        """

        record = self._wifi_events_record(entry_id)
        if record is None:
            return {"exists": False, "record_needs_sync": False, "device_id": None}
        payload = self._payload_for_device(record, roku_listen_port=roku_listen_port)
        deployed_hash = str(payload.get("deployed_commands_hash") or "").strip()
        raw_device_id = payload.get("deployed_device_id")
        return {
            "exists": True,
            "record_needs_sync": payload.get("commands_hash") != deployed_hash,
            "device_id": raw_device_id if isinstance(raw_device_id, int) else None,
        }

    async def async_reconcile_wifi_events_command_renames(
        self,
        entry_id: str,
        renames: dict[int, str],
        *,
        roku_listen_port: int = DEFAULT_ROKU_LISTEN_PORT,
    ) -> bool:
        """Store-follows-hub reconcile after a device/sync renamed command
        records on the Wifi Events device (plan §6a).

        *renames* maps SHORT hub command ids (1..slot_count) to their new
        labels. The matching configured slot's name, the deployed-snapshot
        name, and the deployed hash are all updated together so the record
        never reads out-of-step from its own editor. Renames of
        unconfigured placeholder records and of long records are ignored
        (the short slot name is authoritative; a long-record rename is
        hub-side drift the next replace-path sync heals).
        """

        record = self._wifi_events_record(entry_id)
        if record is None or not renames:
            return False
        commands, slot_count = self._wifi_events_slots(record)
        deployed = record.get("deployed_commands")
        deployed_list = deployed if isinstance(deployed, list) else []
        changed = False
        for raw_id, raw_name in renames.items():
            try:
                command_id = int(raw_id)
            except (TypeError, ValueError):
                continue
            name = str(raw_name or "").strip()
            if not name or not (1 <= command_id <= slot_count):
                continue
            idx = command_id - 1
            if commands[idx] == _default_slot(idx):
                continue
            if commands[idx].get("name") != name:
                commands[idx]["name"] = name
                changed = True
            if idx < len(deployed_list) and isinstance(deployed_list[idx], dict):
                if deployed_list[idx].get("name") != name:
                    deployed_list[idx]["name"] = name
                    changed = True
        if not changed:
            return False
        record["commands"] = commands
        if str(record.get("deployed_commands_hash") or "").strip():
            record["deployed_commands_hash"] = compute_commands_hash(
                commands,
                device_name=str(record.get("device_name") or WIFI_EVENTS_DEVICE_NAME),
                roku_listen_port=roku_listen_port,
                power_on_command_id=normalize_power_command_id(record.get("power_on_command_id")),
                power_off_command_id=normalize_power_command_id(record.get("power_off_command_id")),
                slot_count=slot_count,
            )
        await self._store.async_save(self._data)
        return True

    async def async_reconcile_wifi_events_command_removals(
        self,
        entry_id: str,
        removed_ids: list[int],
        *,
        roku_listen_port: int = DEFAULT_ROKU_LISTEN_PORT,
    ) -> bool:
        """Store-follows-hub reconcile after a device/sync DELETED command
        records on the Wifi Events device (W7 stage 2, plan §9b.3).

        A removed SHORT id resets its slot to the default in place (slot
        indices stay stable; the event's actions are cleared with it); a
        removed LONG id alone just flips the slot's ``long_press_enabled``
        off. The deployed snapshot follows (freed entries return to their
        placeholder names) and the deployed hash is recomputed so the
        record reads in sync — the next event create's phase-1 sync
        re-adds placeholder records for the freed ids.
        """

        record = self._wifi_events_record(entry_id)
        if record is None or not removed_ids:
            return False
        commands, slot_count = self._wifi_events_slots(record)
        deployed = record.get("deployed_commands")
        deployed_list = deployed if isinstance(deployed, list) else []
        changed = False
        for raw_id in removed_ids:
            try:
                command_id = int(raw_id)
            except (TypeError, ValueError):
                continue
            if 1 <= command_id <= slot_count:
                idx = command_id - 1
                if commands[idx] != _default_slot(idx):
                    commands[idx] = _default_slot(idx)
                    changed = True
            elif slot_count < command_id <= 2 * slot_count:
                idx = command_id - slot_count - 1
                if commands[idx].get("long_press_enabled"):
                    commands[idx]["long_press_enabled"] = False
                    commands[idx]["long_press_action"] = deepcopy(DEFAULT_COMMAND_ACTION)
                    changed = True
            else:
                continue
            if idx < len(deployed_list) and isinstance(deployed_list[idx], dict):
                default_name = f"Command {idx + 1}"
                if 1 <= command_id <= slot_count and deployed_list[idx].get("name") != default_name:
                    deployed_list[idx]["name"] = default_name
                    changed = True
        if not changed:
            return False
        record["commands"] = commands
        if str(record.get("deployed_commands_hash") or "").strip():
            record["deployed_commands_hash"] = compute_commands_hash(
                commands,
                device_name=str(record.get("device_name") or WIFI_EVENTS_DEVICE_NAME),
                roku_listen_port=roku_listen_port,
                power_on_command_id=normalize_power_command_id(record.get("power_on_command_id")),
                power_off_command_id=normalize_power_command_id(record.get("power_off_command_id")),
                slot_count=slot_count,
            )
        await self._store.async_save(self._data)
        return True

    async def async_set_wifi_event_longpress(
        self,
        entry_id: str,
        slot_index: int,
        enabled: bool,
    ) -> bool:
        """Toggle an event's standalone long-press flag.

        A pure store-flag edit: the long record is always deployed (plan
        §11 discovery 1), so the flag only gates HA-side long-press action
        execution — zero hub writes."""

        found = self._wifi_events_configured_slot(entry_id, slot_index)
        if found is None:
            return False
        record, commands = found
        commands[int(slot_index)]["long_press_enabled"] = bool(enabled)
        record["commands"] = commands
        await self._store.async_save(self._data)
        return True


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
