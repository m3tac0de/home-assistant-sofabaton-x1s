import asyncio
from types import SimpleNamespace

from custom_components.sofabaton_x1s.command_config import (
    COMMAND_HASH_VERSION,
    CommandConfigStore,
    compute_commands_hash,
    default_commands,
    normalize_commands,
    count_configured_command_slots,
)


def _run(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


def test_compute_commands_hash_is_order_insensitive_for_relevant_fields() -> None:
    first = [
        {
            "name": "Lights",
            "add_as_favorite": True,
            "hard_button": "182",
            "activities": ["102", "101"],
            "action": {"action": "perform-action", "service": "x"},
        },
        {
            "name": "Movie",
            "add_as_favorite": False,
            "hard_button": "193",
            "activities": ["103"],
            "action": {"action": "perform-action", "service": "y"},
        },
    ]

    second = [
        {
            "name": "Movie",
            "add_as_favorite": False,
            "hard_button": "193",
            "activities": ["103"],
            "action": {"action": "perform-action", "service": "other"},
        },
        {
            "name": "Lights",
            "add_as_favorite": True,
            "hard_button": "182",
            "activities": ["101", "102"],
            "action": {"action": "perform-action", "service": "different"},
        },
    ]

    assert compute_commands_hash(first) == compute_commands_hash(second)


def test_normalize_commands_always_returns_ten_slots() -> None:
    normalized = normalize_commands([{"name": "Only One"}])
    assert len(normalized) == 10
    assert normalized[0]["name"] == "Only One"
    assert normalized[1]["name"] == "Command 2"


def test_command_store_get_set_roundtrip() -> None:
    store = CommandConfigStore(SimpleNamespace())
    _run(store.async_load())

    default_payload = _run(store.async_get_hub_config("hub-1"))
    assert len(default_payload["commands"]) == 10
    assert default_payload["power_on_command_id"] is None
    assert default_payload["power_off_command_id"] is None
    assert default_payload["hash_version"] == COMMAND_HASH_VERSION

    updated = _run(
        store.async_set_hub_commands(
            "hub-1",
            [
                {
                    "name": "Launch Netflix",
                    "add_as_favorite": True,
                    "hard_button": "194",
                    "input_activity_id": "101",
                    "activities": ["101"],
                    "action": {"action": "perform-action", "perform_action": "script.test"},
                }
            ],
            power_on_command_id=1,
            power_off_command_id=2,
        )
    )
    assert updated["commands"][0]["name"] == "Launch Netflix"
    assert updated["commands"][0]["input_activity_id"] == "101"
    assert updated["power_on_command_id"] == 1
    assert updated["power_off_command_id"] == 2
    assert len(updated["commands_hash"]) == 15

    loaded = _run(store.async_get_hub_config("hub-1"))
    assert loaded["commands"] == updated["commands"]
    assert loaded["power_on_command_id"] == updated["power_on_command_id"]
    assert loaded["power_off_command_id"] == updated["power_off_command_id"]
    assert loaded["commands_hash"] == updated["commands_hash"]


def test_default_commands_produces_expected_defaults() -> None:
    defaults = default_commands()
    assert defaults[0]["name"] == "Command 1"
    assert defaults[0]["add_as_favorite"] is True
    assert defaults[0]["hard_button"] == ""
    assert defaults[0]["long_press_enabled"] is False


def test_compute_commands_hash_changes_when_roku_listener_port_changes() -> None:
    commands = [
        {
            "name": "Lights",
            "add_as_favorite": True,
            "hard_button": "182",
            "activities": ["102", "101"],
            "action": {"action": "perform-action", "service": "x"},
        }
    ]

    default_hash = compute_commands_hash(commands, roku_listen_port=8060)
    updated_hash = compute_commands_hash(commands, roku_listen_port=8070)

    assert default_hash != updated_hash


def test_compute_commands_hash_changes_when_long_press_toggle_changes() -> None:
    commands = [
        {
            "name": "Lights",
            "add_as_favorite": True,
            "hard_button": "182",
            "long_press_enabled": False,
            "activities": ["102", "101"],
            "action": {"action": "perform-action", "service": "x"},
        }
    ]

    with_long_press = [{**commands[0], "long_press_enabled": True}]

    assert compute_commands_hash(commands) != compute_commands_hash(with_long_press)


def test_compute_commands_hash_changes_when_power_command_changes() -> None:
    commands = [
        {
            "name": "Lights",
            "add_as_favorite": True,
            "hard_button": "182",
            "activities": ["102", "101"],
            "action": {"action": "perform-action", "service": "x"},
        }
    ]

    assert compute_commands_hash(commands) != compute_commands_hash(commands, power_on_command_id=1)


def test_compute_commands_hash_changes_when_input_activity_changes() -> None:
    commands = [
        {
            "name": "Lights",
            "add_as_favorite": False,
            "hard_button": "",
            "input_activity_id": "101",
            "activities": [],
            "action": {"action": "perform-action", "service": "x"},
        }
    ]

    with_other_activity = [{**commands[0], "input_activity_id": "102"}]

    assert compute_commands_hash(commands) != compute_commands_hash(with_other_activity)


def test_compute_commands_hash_changes_when_device_name_changes() -> None:
    commands = [
        {
            "name": "Lights",
            "add_as_favorite": True,
            "hard_button": "182",
            "activities": ["102", "101"],
            "action": {"action": "perform-action", "service": "x"},
        }
    ]

    assert compute_commands_hash(commands, device_name="Home Assistant") != compute_commands_hash(
        commands,
        device_name="Bedroom TV",
    )


def test_count_configured_command_slots_counts_non_default_slots() -> None:
    assert count_configured_command_slots([]) == 0

    commands = [
        {
            "name": "Launch Netflix",
            "add_as_favorite": True,
            "hard_button": "",
            "activities": [],
            "action": {"action": "perform-action"},
        }
    ]
    assert count_configured_command_slots(commands) == 1


def test_get_deployed_wifi_commands_falls_back_for_migrated_single_device_store() -> None:
    store = CommandConfigStore(SimpleNamespace())
    _run(store.async_load())
    store._data = {  # type: ignore[attr-defined]
        "hubs": {
            "hub-1": {
                "commands": default_commands(),
                "deployed_wifi_commands": [
                    {
                        "name": "Legacy Slot",
                        "action": {"action": "perform-action", "perform_action": "script.legacy"},
                    }
                ],
            }
        }
    }

    deployed = store.get_deployed_wifi_commands("hub-1", hub_device_id=77)

    assert deployed == [
        {
            "name": "Legacy Slot",
            "action": {"action": "perform-action", "perform_action": "script.legacy"},
        }
    ]


def test_get_deployed_wifi_commands_does_not_fall_back_when_multiple_devices_exist() -> None:
    store = CommandConfigStore(SimpleNamespace())
    _run(store.async_load())
    store._data = {  # type: ignore[attr-defined]
        "hubs": {
            "hub-1": {
                "devices": [
                    {
                        "device_key": "default",
                        "device_name": "Home Assistant",
                        "commands": default_commands(),
                        "deployed_commands": [{"name": "Legacy Slot"}],
                        "deployed_device_id": None,
                    },
                    {
                        "device_key": "other",
                        "device_name": "Bedroom TV",
                        "commands": default_commands(),
                        "deployed_commands": [],
                        "deployed_device_id": None,
                    },
                ]
            }
        }
    }

    assert store.get_deployed_wifi_commands("hub-1", hub_device_id=77) == []


def test_get_live_wifi_command_slot_uses_deployed_device_id_match() -> None:
    store = CommandConfigStore(SimpleNamespace())
    _run(store.async_load())
    store._data = {  # type: ignore[attr-defined]
        "hubs": {
            "hub-1": {
                "devices": [
                    {
                        "device_key": "default",
                        "device_name": "Home Assistant",
                        "commands": [
                            {"name": "Live Slot", "action": {"action": "perform-action", "perform_action": "script.live"}}
                        ],
                        "deployed_commands": [{"name": "Old Slot"}],
                        "deployed_device_id": 77,
                    }
                ]
            }
        }
    }

    slot = store.get_live_wifi_command_slot("hub-1", hub_device_id=77, command_index=0)

    assert slot == {
        "name": "Live Slot",
        "add_as_favorite": False,
        "hard_button": "",
        "long_press_enabled": False,
        "input_activity_id": "",
        "activities": [],
        "action": {"action": "perform-action", "perform_action": "script.live"},
        "long_press_action": {"action": "perform-action"},
    }


def test_get_live_wifi_command_slot_falls_back_for_migrated_single_device_store() -> None:
    store = CommandConfigStore(SimpleNamespace())
    _run(store.async_load())
    store._data = {  # type: ignore[attr-defined]
        "hubs": {
            "hub-1": {
                "commands": [
                    {"name": "Live Slot", "action": {"action": "perform-action", "perform_action": "script.live"}}
                ],
                "deployed_wifi_commands": [{"name": "Old Slot"}],
            }
        }
    }

    slot = store.get_live_wifi_command_slot("hub-1", hub_device_id=77, command_index=0)

    assert slot == {
        "name": "Live Slot",
        "add_as_favorite": False,
        "hard_button": "",
        "long_press_enabled": False,
        "input_activity_id": "",
        "activities": [],
        "action": {"action": "perform-action", "perform_action": "script.live"},
        "long_press_action": {"action": "perform-action"},
    }


def test_async_set_deployed_device_id_updates_existing_device_record() -> None:
    store = CommandConfigStore(SimpleNamespace())
    _run(store.async_load())
    store._data = {  # type: ignore[attr-defined]
        "hubs": {
            "hub-1": {
                "devices": [
                    {
                        "device_key": "default",
                        "device_name": "Home Assistant",
                        "commands": default_commands(),
                        "deployed_commands": [{"name": "Legacy Slot"}],
                        "deployed_device_id": None,
                    }
                ]
            }
        }
    }

    changed = _run(store.async_set_deployed_device_id("hub-1", "default", 77))
    payload = _run(store.async_get_hub_config("hub-1", device_key="default"))

    assert changed is True
    assert payload["deployed_device_id"] == 77
