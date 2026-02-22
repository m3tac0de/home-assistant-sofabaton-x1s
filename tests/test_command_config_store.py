import asyncio
from types import SimpleNamespace

from custom_components.sofabaton_x1s.command_config import (
    COMMAND_HASH_VERSION,
    CommandConfigStore,
    compute_commands_hash,
    default_commands,
    normalize_commands,
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


def test_normalize_commands_always_returns_nine_slots() -> None:
    normalized = normalize_commands([{"name": "Only One"}])
    assert len(normalized) == 9
    assert normalized[0]["name"] == "Only One"
    assert normalized[1]["name"] == "Command 2"


def test_command_store_get_set_roundtrip() -> None:
    store = CommandConfigStore(SimpleNamespace())
    _run(store.async_load())

    default_payload = _run(store.async_get_hub_config("hub-1"))
    assert len(default_payload["commands"]) == 9
    assert default_payload["hash_version"] == COMMAND_HASH_VERSION

    updated = _run(
        store.async_set_hub_commands(
            "hub-1",
            [
                {
                    "name": "Launch Netflix",
                    "add_as_favorite": True,
                    "hard_button": "194",
                    "activities": ["101"],
                    "action": {"action": "perform-action", "perform_action": "script.test"},
                }
            ],
        )
    )
    assert updated["commands"][0]["name"] == "Launch Netflix"
    assert len(updated["commands_hash"]) == 15

    loaded = _run(store.async_get_hub_config("hub-1"))
    assert loaded["commands"] == updated["commands"]
    assert loaded["commands_hash"] == updated["commands_hash"]


def test_default_commands_produces_expected_defaults() -> None:
    defaults = default_commands()
    assert defaults[0]["name"] == "Command 1"
    assert defaults[0]["add_as_favorite"] is True
    assert defaults[0]["hard_button"] == ""
