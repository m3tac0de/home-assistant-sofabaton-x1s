from __future__ import annotations

import hashlib
import json
import re
from copy import deepcopy
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import DEFAULT_ROKU_LISTEN_PORT, DOMAIN

COMMAND_CONFIG_STORE_VERSION = 1
COMMAND_CONFIG_STORE_MINOR_VERSION = 1
COMMAND_HASH_VERSION = "v2"
COMMAND_BRAND_PREFIX = "m3tac0de"
COMMAND_SLOT_COUNT = 9

DEFAULT_COMMAND_ACTION = {"action": "perform-action"}

_SPACE_RE = re.compile(r"\s+")


def _default_slot(idx: int) -> dict[str, Any]:
    return {
        "name": f"Command {idx + 1}",
        "add_as_favorite": True,
        "hard_button": "",
        "activities": [],
        "action": deepcopy(DEFAULT_COMMAND_ACTION),
    }


def default_commands() -> list[dict[str, Any]]:
    return [_default_slot(idx) for idx in range(COMMAND_SLOT_COUNT)]


def _normalize_slot(slot: Any, idx: int) -> dict[str, Any]:
    if not isinstance(slot, dict):
        return _default_slot(idx)

    return {
        "name": str(slot.get("name", f"Command {idx + 1}")),
        "add_as_favorite": bool(slot.get("add_as_favorite", False)),
        "hard_button": str(slot.get("hard_button", "")),
        "activities": [
            str(activity)
            for activity in slot.get("activities", [])
            if str(activity) != ""
        ]
        if isinstance(slot.get("activities"), list)
        else [],
        "action": _normalize_action(slot.get("action")),
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


def _hash_payload(commands: list[dict[str, Any]]) -> list[dict[str, Any]]:
    payload: list[dict[str, Any]] = []
    for slot in commands:
        payload.append(
            {
                "name": str(slot.get("name", "")).strip(),
                "is_favorite": bool(slot.get("add_as_favorite", False)),
                "mapped_key": str(slot.get("hard_button", "")).strip(),
                "activities": sorted(
                    [str(activity).strip() for activity in slot.get("activities", []) if str(activity).strip()],
                ),
            }
        )

    payload.sort(
        key=lambda row: (
            row["name"].lower(),
            row["mapped_key"],
            "1" if row["is_favorite"] else "0",
            ",".join(row["activities"]),
        )
    )
    return payload


def compute_commands_hash(
    commands: list[dict[str, Any]],
    *,
    roku_listen_port: int = DEFAULT_ROKU_LISTEN_PORT,
) -> str:
    payload = {
        "commands": _hash_payload(normalize_commands(commands)),
        "roku_listen_port": int(roku_listen_port),
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

    async def async_get_hub_config(
        self,
        entry_id: str,
        *,
        roku_listen_port: int = DEFAULT_ROKU_LISTEN_PORT,
    ) -> dict[str, Any]:
        hub = self._data.setdefault("hubs", {}).get(entry_id)
        if not isinstance(hub, dict):
            commands = default_commands()
            return {
                "commands": commands,
                "hash_version": COMMAND_HASH_VERSION,
                "commands_hash": compute_commands_hash(
                    commands,
                    roku_listen_port=roku_listen_port,
                ),
            }

        commands = normalize_commands(hub.get("commands"))
        return {
            "commands": commands,
            "hash_version": COMMAND_HASH_VERSION,
            "commands_hash": compute_commands_hash(
                commands,
                roku_listen_port=roku_listen_port,
            ),
        }

    async def async_set_hub_commands(
        self,
        entry_id: str,
        commands: Any,
        *,
        roku_listen_port: int = DEFAULT_ROKU_LISTEN_PORT,
    ) -> dict[str, Any]:
        normalized = normalize_commands(commands)
        payload = {
            "commands": normalized,
            "hash_version": COMMAND_HASH_VERSION,
            "commands_hash": compute_commands_hash(
                normalized,
                roku_listen_port=roku_listen_port,
            ),
        }
        hubs = self._data.setdefault("hubs", {})
        hubs[entry_id] = payload
        await self._store.async_save(self._data)
        return payload
