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


def test_allocating_an_event_creates_the_events_record_once() -> None:
    store = _store()
    _run(store.async_allocate_wifi_event("hub-1", "Movie Night"))
    payload = _run(store.async_get_hub_config("hub-1", device_key=WIFI_EVENTS_DEVICE_KEY))
    assert payload["device_key"] == WIFI_EVENTS_DEVICE_KEY
    assert payload["device_name"] == WIFI_EVENTS_DEVICE_NAME
    assert payload["slot_count"] == WIFI_EVENTS_SLOT_COUNT
    assert len(payload["commands"]) == WIFI_EVENTS_SLOT_COUNT

    _run(store.async_allocate_wifi_event("hub-1", "Bedtime"))
    devices = _run(store.async_list_hub_devices("hub-1"))
    assert [d["device_key"] for d in devices].count(WIFI_EVENTS_DEVICE_KEY) == 1


def test_store_list_always_includes_reserved_record() -> None:
    # §8 test 5 (store half): async_list_hub_devices must NEVER filter the
    # reserved record — the listener guard iterates this list.
    store = _store()
    _run(store.async_allocate_wifi_event("hub-1", "Movie Night"))
    _run(store.async_create_hub_device("hub-1", "User Device"))
    keys = [d["device_key"] for d in _run(store.async_list_hub_devices("hub-1"))]
    assert WIFI_EVENTS_DEVICE_KEY in keys


def test_events_record_is_cap_exempt() -> None:
    store = _store()
    _run(store.async_allocate_wifi_event("hub-1", "Movie Night"))
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
    _run(store.async_allocate_wifi_event("hub-1", "Movie Night"))
    payload = _run(store.async_get_hub_config("hub-1"))
    assert payload["device_key"] != WIFI_EVENTS_DEVICE_KEY


def test_allocate_and_list_events() -> None:
    store = _store()
    first = _run(store.async_allocate_wifi_event("hub-1", "Movie Night"))
    assert first["slot_index"] == 0
    assert first["command_id"] == 1
    # One record per event: no long-record id (single-record plan).
    assert "long_press_command_id" not in first

    second = _run(store.async_allocate_wifi_event("hub-1", "Lights Off"))
    assert second["slot_index"] == 1

    events = store.list_wifi_events("hub-1")
    assert [e["name"] for e in events] == ["Movie Night", "Lights Off"]
    assert all(e["deployed"] is False for e in events)
    for key in ("long_press_enabled", "long_press_action", "long_press_command_id"):
        assert key not in events[0]


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
        single_record=True,
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
        single_record=True,
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


def _legacy_events_store(slot: dict) -> CommandConfigStore:
    """A store persisted before the single-record model."""

    store = _store()
    store._data = {
        "hubs": {
            "hub-1": {
                "devices": [
                    {
                        "device_key": WIFI_EVENTS_DEVICE_KEY,
                        "device_name": WIFI_EVENTS_DEVICE_NAME,
                        "slot_count": WIFI_EVENTS_SLOT_COUNT,
                        "commands": [slot],
                    }
                ]
            }
        }
    }
    return store


def test_events_record_discards_long_press_state() -> None:
    # Plan §1.3: a configured long-press action has no home in the
    # single-record model and is discarded on load.
    store = _legacy_events_store(
        {
            "name": "Movie Night",
            "long_press_enabled": True,
            "action": {"action": "perform-action", "perform_action": "script.short"},
            "long_press_action": {"action": "perform-action", "perform_action": "script.long"},
        }
    )
    slot = store.get_live_wifi_command_slot(
        "hub-1", command_index=0, device_key=WIFI_EVENTS_DEVICE_KEY
    )
    assert slot is not None
    assert slot["long_press_enabled"] is False
    assert slot["long_press_action"] == {"action": "perform-action"}
    assert slot["action"]["perform_action"] == "script.short"
    events = store.list_wifi_events("hub-1")
    assert [e["name"] for e in events] == ["Movie Night"]


def test_user_device_keeps_hard_button_long_press() -> None:
    store = _store()
    _run(
        store.async_set_hub_commands(
            "hub-1",
            [
                {
                    "name": "User Cmd",
                    "long_press_enabled": True,
                    "hard_button": "ok",
                    "long_press_action": {"action": "perform-action", "perform_action": "script.l"},
                },
                {"name": "No Button", "long_press_enabled": True, "hard_button": ""},
            ],
            device_key="default",
        )
    )
    held = store.get_live_wifi_command_slot("hub-1", command_index=0, device_key="default")
    assert held is not None and held["long_press_enabled"] is True
    assert held["long_press_action"]["perform_action"] == "script.l"
    loose = store.get_live_wifi_command_slot("hub-1", command_index=1, device_key="default")
    assert loose is not None and loose["long_press_enabled"] is False


def test_set_event_action() -> None:
    store = _store()
    _run(store.async_allocate_wifi_event("hub-1", "Movie Night"))
    action = {"action": "perform-action", "perform_action": "script.short"}
    assert _run(store.async_set_wifi_event_action("hub-1", 0, action)) is True
    events = store.list_wifi_events("hub-1")
    assert events[0]["action"]["perform_action"] == "script.short"
    # unknown / unconfigured slot -> False
    assert _run(store.async_set_wifi_event_action("hub-1", 7, action)) is False


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


def _events_hash_kwargs() -> dict:
    return {
        "device_name": WIFI_EVENTS_DEVICE_NAME,
        "slot_count": WIFI_EVENTS_SLOT_COUNT,
    }


def test_events_layout_token_flags_pre_change_deploys() -> None:
    # Plan §3.1: every hash deployed before the single-record layout lacks
    # the token, so the events record reads "needs sync" once after the
    # upgrade, even for events that never used long press.
    store = _store()
    _run(store.async_allocate_wifi_event("hub-1", "Movie Night"))
    payload = _run(store.async_get_hub_config("hub-1", device_key=WIFI_EVENTS_DEVICE_KEY))
    legacy_hash = compute_commands_hash(payload["commands"], **_events_hash_kwargs())
    assert payload["commands_hash"] == compute_commands_hash(
        payload["commands"], single_record=True, **_events_hash_kwargs()
    )
    assert payload["commands_hash"] != legacy_hash
    _run(
        store.async_save_deployed_wifi_commands(
            "hub-1", WIFI_EVENTS_DEVICE_KEY, payload["commands"],
            deployed_device_id=10, commands_hash=legacy_hash,
        )
    )
    assert store.wifi_events_record_state("hub-1")["record_needs_sync"] is True


def test_layout_token_leaves_user_devices_alone() -> None:
    commands = default_commands()
    assert compute_commands_hash(commands) == compute_commands_hash(
        commands, single_record=False
    )
    store = _store()
    _run(store.async_set_hub_commands("hub-1", [{"name": "Cmd"}], device_key="default"))
    payload = _run(store.async_get_hub_config("hub-1", device_key="default"))
    assert payload["commands_hash"] == compute_commands_hash(
        payload["commands"], device_name=payload["device_name"]
    )


def _deploy_events(store: CommandConfigStore, *, legacy: bool) -> None:
    payload = _run(store.async_get_hub_config("hub-1", device_key=WIFI_EVENTS_DEVICE_KEY))
    commands_hash = (
        compute_commands_hash(payload["commands"], **_events_hash_kwargs())
        if legacy
        else payload["commands_hash"]
    )
    _run(
        store.async_save_deployed_wifi_commands(
            "hub-1", WIFI_EVENTS_DEVICE_KEY, payload["commands"],
            deployed_device_id=10, commands_hash=commands_hash,
        )
    )


def test_reconcile_keeps_legacy_layout_out_of_step() -> None:
    # A device-editor rename or delete before the user's Sync must not
    # make the retiring sync look done: the deployed hash keeps describing
    # the legacy (short + long) layout the hub still holds.
    store = _store()
    for name in ("One", "Two"):
        _run(store.async_allocate_wifi_event("hub-1", name))
    _deploy_events(store, legacy=True)

    assert _run(store.async_reconcile_wifi_events_command_renames("hub-1", {1: "Uno"})) is True
    assert store.wifi_events_record_state("hub-1")["record_needs_sync"] is True
    payload = _run(store.async_get_hub_config("hub-1", device_key=WIFI_EVENTS_DEVICE_KEY))
    assert payload["deployed_commands_hash"] == compute_commands_hash(
        payload["commands"], **_events_hash_kwargs()
    )

    assert _run(store.async_reconcile_wifi_events_command_removals("hub-1", [2])) is True
    assert store.wifi_events_record_state("hub-1")["record_needs_sync"] is True


def test_reconcile_keeps_current_layout_in_step() -> None:
    store = _store()
    for name in ("One", "Two"):
        _run(store.async_allocate_wifi_event("hub-1", name))
    _deploy_events(store, legacy=False)
    assert store.wifi_events_record_state("hub-1")["record_needs_sync"] is False

    assert _run(store.async_reconcile_wifi_events_command_renames("hub-1", {1: "Uno"})) is True
    assert store.wifi_events_record_state("hub-1")["record_needs_sync"] is False
    assert _run(store.async_reconcile_wifi_events_command_removals("hub-1", [2])) is True
    assert store.wifi_events_record_state("hub-1")["record_needs_sync"] is False


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
        "hub-1", 0, {"action": "perform-action", "perform_action": "script.x"}))
    # simulate a deployed record so the hash path runs
    commands = normalize_commands(
        _run(store.async_get_hub_config("hub-1", device_key=WIFI_EVENTS_DEVICE_KEY))["commands"],
        slot_count=WIFI_EVENTS_SLOT_COUNT, single_record=True)
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


def test_reconcile_command_removals_ignores_long_ids():
    # A long record from before the single-record model is retired by the
    # user's Sync; its removal never touches the event.
    store = CommandConfigStore(SimpleNamespace())
    _run(store.async_load())
    _run(store.async_allocate_wifi_event("hub-1", "One"))
    changed = _run(store.async_reconcile_wifi_events_command_removals(
        "hub-1", [1 + WIFI_EVENTS_SLOT_COUNT]))
    assert changed is False
    events = store.list_wifi_events("hub-1")
    assert [e["name"] for e in events] == ["One"]


def test_reconcile_command_removals_noop_for_unconfigured():
    store = CommandConfigStore(SimpleNamespace())
    _run(store.async_load())
    _run(store.async_allocate_wifi_event("hub-1", "One"))
    assert _run(store.async_reconcile_wifi_events_command_removals("hub-1", [40])) is False
