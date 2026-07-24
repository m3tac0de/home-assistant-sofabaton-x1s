"""Store-layer tests for the reserved Wifi Events record (`haevents`).

Plan: docs/internal/wifi-events-plan.md §2 / §9-W1; listener-safety §8
test 5 (store half — the WS half lives in test_command_sync_ws.py).
"""

import asyncio
from types import SimpleNamespace

from custom_components.sofabaton_x1s.command_config import (
    COMMAND_SLOT_COUNT,
    CommandConfigStore,
    MAX_WIFI_DEVICES,
    WIFI_EVENTS_DEVICE_KEY,
    WIFI_EVENTS_DEVICE_NAME,
    WIFI_EVENTS_SLOT_COUNT,
    compute_commands_hash,
    default_commands,
    is_wifi_events_device_key,
    normalize_commands,
)


def _run(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


def _store() -> CommandConfigStore:
    store = CommandConfigStore(SimpleNamespace())
    _run(store.async_load())
    return store


def test_is_wifi_events_device_key() -> None:
    assert is_wifi_events_device_key("haevents")
    assert is_wifi_events_device_key(" HAEVENTS ")
    assert not is_wifi_events_device_key("default")
    assert not is_wifi_events_device_key("")
    assert not is_wifi_events_device_key(None)


def test_get_or_create_wifi_events_device() -> None:
    store = _store()
    payload = _run(store.async_get_or_create_wifi_events_device("hub-1"))
    assert payload["device_key"] == WIFI_EVENTS_DEVICE_KEY
    assert payload["device_name"] == WIFI_EVENTS_DEVICE_NAME
    assert payload["slot_count"] == WIFI_EVENTS_SLOT_COUNT
    assert len(payload["commands"]) == WIFI_EVENTS_SLOT_COUNT

    # idempotent
    again = _run(store.async_get_or_create_wifi_events_device("hub-1"))
    assert again["device_key"] == WIFI_EVENTS_DEVICE_KEY
    devices = _run(store.async_list_hub_devices("hub-1"))
    assert [d["device_key"] for d in devices].count(WIFI_EVENTS_DEVICE_KEY) == 1


def test_store_list_always_includes_reserved_record() -> None:
    # §8 test 5 (store half): async_list_hub_devices must NEVER filter the
    # reserved record — the listener guard iterates this list.
    store = _store()
    _run(store.async_get_or_create_wifi_events_device("hub-1"))
    _run(store.async_create_hub_device("hub-1", "User Device"))
    keys = [d["device_key"] for d in _run(store.async_list_hub_devices("hub-1"))]
    assert WIFI_EVENTS_DEVICE_KEY in keys


def test_events_record_is_cap_exempt() -> None:
    store = _store()
    _run(store.async_get_or_create_wifi_events_device("hub-1"))
    for idx in range(MAX_WIFI_DEVICES):
        _run(store.async_create_hub_device("hub-1", f"Device {idx + 1}"))
    # 5 user devices + the events record coexist…
    devices = _run(store.async_list_hub_devices("hub-1"))
    assert len(devices) == MAX_WIFI_DEVICES + 1
    assert WIFI_EVENTS_DEVICE_KEY in [d["device_key"] for d in devices]
    # …and the 6th user device is refused.
    try:
        _run(store.async_create_hub_device("hub-1", "One Too Many"))
        raise AssertionError("expected ValueError")
    except ValueError:
        pass
    # The cap trim never drops the reserved record.
    keys = [d["device_key"] for d in _run(store.async_list_hub_devices("hub-1"))]
    assert WIFI_EVENTS_DEVICE_KEY in keys


def test_no_key_fallback_skips_reserved_record() -> None:
    store = _store()
    _run(store.async_get_or_create_wifi_events_device("hub-1"))
    payload = _run(store.async_get_hub_config("hub-1"))
    assert payload["device_key"] != WIFI_EVENTS_DEVICE_KEY


def test_allocate_and_list_events() -> None:
    store = _store()
    first = _run(store.async_allocate_wifi_event("hub-1", "Movie Night"))
    assert first["slot_index"] == 0
    assert first["command_id"] == 1
    assert first["long_press_command_id"] == 1 + WIFI_EVENTS_SLOT_COUNT

    second = _run(store.async_allocate_wifi_event("hub-1", "Lights Off"))
    assert second["slot_index"] == 1

    events = store.list_wifi_events("hub-1")
    assert [e["name"] for e in events] == ["Movie Night", "Lights Off"]
    assert all(e["deployed"] is False for e in events)
    assert events[0]["long_press_enabled"] is False


def test_allocate_rejects_duplicate_and_empty_names() -> None:
    store = _store()
    _run(store.async_allocate_wifi_event("hub-1", "Movie Night"))
    for dupe in ("Movie Night", "movie_night", "  MOVIE  NIGHT "):
        try:
            _run(store.async_allocate_wifi_event("hub-1", dupe))
            raise AssertionError("expected duplicate_name")
        except ValueError as err:
            assert str(err) == "duplicate_name"
    try:
        _run(store.async_allocate_wifi_event("hub-1", "   "))
        raise AssertionError("expected empty_name")
    except ValueError as err:
        assert str(err) == "empty_name"


def test_allocate_full_raises() -> None:
    store = _store()
    for idx in range(WIFI_EVENTS_SLOT_COUNT):
        _run(store.async_allocate_wifi_event("hub-1", f"Event {idx + 1}"))
    try:
        _run(store.async_allocate_wifi_event("hub-1", "Overflow"))
        raise AssertionError("expected wifi_events_full")
    except ValueError as err:
        assert str(err) == "wifi_events_full"


def test_delete_leaves_hole_and_reallocation_fills_it() -> None:
    store = _store()
    for name in ("One", "Two", "Three"):
        _run(store.async_allocate_wifi_event("hub-1", name))
    assert _run(store.async_reset_wifi_event_slot("hub-1", 1)) is True
    events = store.list_wifi_events("hub-1")
    # slot-index stability: the hole stays, no compaction
    assert [(e["slot_index"], e["name"]) for e in events] == [(0, "One"), (2, "Three")]
    # the next allocation fills the hole
    refill = _run(store.async_allocate_wifi_event("hub-1", "Two Again"))
    assert refill["slot_index"] == 1
    # resetting a non-configured slot is a no-op
    assert _run(store.async_reset_wifi_event_slot("hub-1", 40)) is False


def test_allocate_skips_slot_pending_hub_delete() -> None:
    # §9b.6 slot-allocator guard: a slot freed in the store but whose hub
    # record delete has not synced (its deployed snapshot still names a real
    # event) must NOT be reallocated — the new event would inherit the old
    # event's hub refs. It is skipped, and the next clean hole is used.
    store = _store()
    _run(store.async_allocate_wifi_event("hub-1", "One"))
    _run(store.async_allocate_wifi_event("hub-1", "Two"))
    # Deploy the record so the deployed snapshot carries the real names.
    commands = normalize_commands(
        _run(store.async_get_hub_config("hub-1", device_key=WIFI_EVENTS_DEVICE_KEY))["commands"],
        slot_count=WIFI_EVENTS_SLOT_COUNT,
        standalone_long_press=True,
    )
    _run(
        store.async_save_deployed_wifi_commands(
            "hub-1", WIFI_EVENTS_DEVICE_KEY, commands, deployed_device_id=10,
        )
    )
    # Free slot 0 in the store WITHOUT syncing the hub-side delete.
    assert _run(store.async_reset_wifi_event_slot("hub-1", 0)) is True

    # slot 0 is store-free but its deployed record still names "One" -> the
    # allocator skips it and fills slot 2 instead of recycling slot 0.
    allocated = _run(store.async_allocate_wifi_event("hub-1", "Three"))
    assert allocated["slot_index"] == 2

    # Once the deployed snapshot resets slot 0 to its placeholder (delete
    # synced), the slot is reallocatable again.
    _run(
        store.async_reconcile_wifi_events_command_removals("hub-1", [1, 1 + WIFI_EVENTS_SLOT_COUNT])
    )
    refill = _run(store.async_allocate_wifi_event("hub-1", "Reused"))
    assert refill["slot_index"] == 0


def test_allocate_pending_delete_when_only_freed_slot_is_undeleted() -> None:
    # When every free slot is a not-yet-deleted hole, allocation is refused
    # with the distinct pending-delete code (not wifi_events_full).
    store = _store()
    for idx in range(WIFI_EVENTS_SLOT_COUNT):
        _run(store.async_allocate_wifi_event("hub-1", f"Event {idx + 1}"))
    commands = normalize_commands(
        _run(store.async_get_hub_config("hub-1", device_key=WIFI_EVENTS_DEVICE_KEY))["commands"],
        slot_count=WIFI_EVENTS_SLOT_COUNT,
        standalone_long_press=True,
    )
    _run(
        store.async_save_deployed_wifi_commands(
            "hub-1", WIFI_EVENTS_DEVICE_KEY, commands, deployed_device_id=10,
        )
    )
    # Free one slot in the store but leave the hub record un-deleted.
    assert _run(store.async_reset_wifi_event_slot("hub-1", 3)) is True
    try:
        _run(store.async_allocate_wifi_event("hub-1", "Overflow"))
        raise AssertionError("expected wifi_events_pending_delete")
    except ValueError as err:
        assert str(err) == "wifi_events_pending_delete"


def test_standalone_long_press_only_for_events_record() -> None:
    store = _store()
    _run(store.async_allocate_wifi_event("hub-1", "Movie Night"))
    assert _run(store.async_set_wifi_event_longpress("hub-1", 0, True)) is True
    events = store.list_wifi_events("hub-1")
    assert events[0]["long_press_enabled"] is True
    # the live-slot read (callback runtime) sees the standalone flag too
    slot = store.get_live_wifi_command_slot(
        "hub-1", command_index=0, device_key=WIFI_EVENTS_DEVICE_KEY
    )
    assert slot is not None and slot["long_press_enabled"] is True

    # user devices keep the original coupling: no hard button -> forced off
    _run(
        store.async_set_hub_commands(
            "hub-1",
            [{"name": "User Cmd", "long_press_enabled": True, "hard_button": ""}],
            device_key="default",
        )
    )
    user_slot = store.get_live_wifi_command_slot(
        "hub-1", command_index=0, device_key="default"
    )
    assert user_slot is not None and user_slot["long_press_enabled"] is False


def test_set_event_actions_short_and_long() -> None:
    store = _store()
    _run(store.async_allocate_wifi_event("hub-1", "Movie Night"))
    short_action = {"action": "perform-action", "perform_action": "script.short"}
    long_action = {"action": "perform-action", "perform_action": "script.long"}
    assert _run(store.async_set_wifi_event_action("hub-1", 0, "short", short_action)) is True
    assert _run(store.async_set_wifi_event_action("hub-1", 0, "long", long_action)) is True
    events = store.list_wifi_events("hub-1")
    assert events[0]["action"]["perform_action"] == "script.short"
    assert events[0]["long_press_action"]["perform_action"] == "script.long"
    # unknown / unconfigured slot -> False
    assert _run(store.async_set_wifi_event_action("hub-1", 7, "short", short_action)) is False


def test_live_slot_read_covers_high_indices() -> None:
    store = _store()
    for idx in range(WIFI_EVENTS_SLOT_COUNT):
        _run(store.async_allocate_wifi_event("hub-1", f"Event {idx + 1}"))
    slot = store.get_live_wifi_command_slot(
        "hub-1",
        command_index=WIFI_EVENTS_SLOT_COUNT - 1,
        device_key=WIFI_EVENTS_DEVICE_KEY,
    )
    assert slot is not None and slot["name"] == f"Event {WIFI_EVENTS_SLOT_COUNT}"


def test_hash_stable_at_default_slot_count() -> None:
    # The slot_count parameter must not perturb existing 10-slot hashes.
    commands = default_commands()
    assert compute_commands_hash(commands) == compute_commands_hash(
        commands, slot_count=COMMAND_SLOT_COUNT
    )
    # …while a wider events record hashes differently (more default rows).
    assert compute_commands_hash(commands) != compute_commands_hash(
        normalize_commands(commands, slot_count=WIFI_EVENTS_SLOT_COUNT),
        slot_count=WIFI_EVENTS_SLOT_COUNT,
    )


def test_longpress_flip_does_not_change_deploy_hash() -> None:
    # Plan §11 discovery 1: the long record always exists, so flipping the
    # standalone flag must never flag the record out-of-step.
    store = _store()
    _run(store.async_allocate_wifi_event("hub-1", "Movie Night"))
    before = _run(
        store.async_get_hub_config("hub-1", device_key=WIFI_EVENTS_DEVICE_KEY)
    )["commands_hash"]
    _run(store.async_set_wifi_event_longpress("hub-1", 0, True))
    after = _run(
        store.async_get_hub_config("hub-1", device_key=WIFI_EVENTS_DEVICE_KEY)
    )["commands_hash"]
    assert before == after


def test_slot_count_fallback_for_legacy_events_record() -> None:
    # A persisted events record without the slot_count field (or a bogus
    # value) resolves to the events default, not the user default.
    store = _store()
    store._data = {
        "hubs": {
            "hub-1": {
                "devices": [
                    {"device_key": WIFI_EVENTS_DEVICE_KEY, "device_name": "Wifi Events"},
                    {"device_key": "default", "device_name": "Home Assistant", "slot_count": "bogus"},
                ]
            }
        }
    }
    payloads = {d["device_key"]: d for d in _run(store.async_list_hub_devices("hub-1"))}
    assert payloads[WIFI_EVENTS_DEVICE_KEY]["slot_count"] == WIFI_EVENTS_SLOT_COUNT
    assert len(payloads[WIFI_EVENTS_DEVICE_KEY]["commands"]) == WIFI_EVENTS_SLOT_COUNT
    assert payloads["default"]["slot_count"] == COMMAND_SLOT_COUNT


def test_reconcile_command_removals_resets_short_slot(_store=None):
    # W7 stage 2: a removed SHORT id resets its slot to default in place
    # (actions cleared) and updates the deployed snapshot + hash.
    store = _store or CommandConfigStore(SimpleNamespace())
    _run(store.async_load())
    _run(store.async_allocate_wifi_event("hub-1", "One"))
    _run(store.async_allocate_wifi_event("hub-1", "Two"))
    _run(store.async_set_wifi_event_action(
        "hub-1", 0, "short", {"action": "perform-action", "perform_action": "script.x"}))
    # simulate a deployed record so the hash path runs
    commands = normalize_commands(
        _run(store.async_get_hub_config("hub-1", device_key=WIFI_EVENTS_DEVICE_KEY))["commands"],
        slot_count=WIFI_EVENTS_SLOT_COUNT, standalone_long_press=True)
    _run(store.async_save_deployed_wifi_commands(
        "hub-1", WIFI_EVENTS_DEVICE_KEY, commands, deployed_device_id=10,
        commands_hash=_run(store.async_get_hub_config("hub-1", device_key=WIFI_EVENTS_DEVICE_KEY))["commands_hash"]))

    changed = _run(store.async_reconcile_wifi_events_command_removals("hub-1", [1]))
    assert changed is True
    events = store.list_wifi_events("hub-1")
    assert [e["name"] for e in events] == ["Two"]  # slot 0 freed, slot 1 stays
    assert events[0]["slot_index"] == 1
    payload = _run(store.async_get_hub_config("hub-1", device_key=WIFI_EVENTS_DEVICE_KEY))
    assert payload["deployed_commands_hash"] == payload["commands_hash"]


def test_reconcile_command_removals_long_id_flips_flag_only():
    store = CommandConfigStore(SimpleNamespace())
    _run(store.async_load())
    _run(store.async_allocate_wifi_event("hub-1", "One"))
    _run(store.async_set_wifi_event_longpress("hub-1", 0, True))
    # removing only the LONG id (1 + slot_count) keeps the event, flag off
    changed = _run(store.async_reconcile_wifi_events_command_removals(
        "hub-1", [1 + WIFI_EVENTS_SLOT_COUNT]))
    assert changed is True
    events = store.list_wifi_events("hub-1")
    assert [e["name"] for e in events] == ["One"]
    assert events[0]["long_press_enabled"] is False


def test_reconcile_command_removals_noop_for_unconfigured():
    store = CommandConfigStore(SimpleNamespace())
    _run(store.async_load())
    _run(store.async_allocate_wifi_event("hub-1", "One"))
    assert _run(store.async_reconcile_wifi_events_command_removals("hub-1", [40])) is False
