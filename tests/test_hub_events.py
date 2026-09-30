"""Engine callbacks, the activity catalog and hub event actions (hub_proxy_events.py)."""

import asyncio

from custom_components.sofabaton_x1s.hub import SofabatonHub
from tests.hub_fakes import FakeHass


def test_cache_generation_increments_for_cache_visible_updates(monkeypatch):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )

    assert hub.cache_generation == 0

    monkeypatch.setattr(hub._proxy, "get_devices", lambda **_k: ({0x01: {"name": "TV"}}, True))
    hub._on_devices_burst("devices")
    loop.run_until_complete(asyncio.sleep(0))
    assert hub.cache_generation == 1

    hub._on_commands_burst("commands:1")
    loop.run_until_complete(asyncio.sleep(0))
    assert hub.cache_generation == 2

    hub._on_macros_burst("macros:1")
    loop.run_until_complete(asyncio.sleep(0))
    assert hub.cache_generation == 3

    loop.close()


def test_identical_activity_refresh_does_not_bump_cache_generation(monkeypatch):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )

    hub.activities = {101: {"name": "Watch TV", "active": False, "needs_confirm": False}}

    monkeypatch.setattr(
        hub._proxy,
        "get_activities",
        lambda: ({101: {"name": "Watch TV", "active": False, "needs_confirm": False}}, True),
    )

    hub._on_activities_burst("activities")
    loop.run_until_complete(asyncio.sleep(0))

    assert hub.cache_generation == 0
    assert hub.activities[101]["name"] == "Watch TV"

    loop.close()


def test_activity_active_flag_changes_without_bumping_cache_generation(monkeypatch):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )

    hub.activities = {101: {"name": "Watch TV", "active": False, "needs_confirm": False}}
    hub.current_activity = None

    monkeypatch.setattr(
        hub._proxy,
        "get_activities",
        lambda: ({101: {"name": "Watch TV", "active": True, "needs_confirm": False}}, True),
    )

    hub._on_activities_burst("activities")
    loop.run_until_complete(asyncio.sleep(0))

    assert hub.cache_generation == 0
    assert hub.current_activity == 101
    assert hub.activities[101]["active"] is True

    loop.close()


def test_activity_catalog_name_change_bumps_cache_generation(monkeypatch):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )

    hub.activities = {101: {"name": "Old Name", "active": False, "needs_confirm": False}}

    monkeypatch.setattr(
        hub._proxy,
        "get_activities",
        lambda: ({101: {"name": "New Name", "active": False, "needs_confirm": False}}, True),
    )

    hub._on_activities_burst("activities")
    loop.run_until_complete(asyncio.sleep(0))

    assert hub.cache_generation == 1
    assert hub.activities[101]["name"] == "New Name"

    loop.close()


def test_on_activities_burst_syncs_current_activity_from_active_flag(monkeypatch):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )

    monkeypatch.setattr(
        hub._proxy,
        "get_activities",
        lambda: ({101: {"name": "Watch a movie", "active": True, "needs_confirm": False}}, True),
    )

    hub.current_activity = None
    hub._on_activities_burst("activities")
    loop.run_until_complete(asyncio.sleep(0))

    assert hub.current_activity == 101

    loop.close()


def test_on_activity_list_update_syncs_current_activity_from_active_flag(monkeypatch):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )

    monkeypatch.setattr(
        hub._proxy,
        "get_activities",
        lambda: ({102: {"name": "Play Steamdeck", "active": True, "needs_confirm": False}}, False),
    )

    hub.current_activity = None
    hub._on_activity_list_update()
    loop.run_until_complete(asyncio.sleep(0))

    assert hub.current_activity == 102

    loop.close()


def test_activity_list_update_does_not_clear_current_until_burst_complete(monkeypatch):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )

    hub.current_activity = 101

    monkeypatch.setattr(
        hub._proxy,
        "get_activities",
        lambda: ({101: {"name": "Watch a movie", "active": False}}, False),
    )

    hub._on_activity_list_update()
    loop.run_until_complete(asyncio.sleep(0))

    assert hub.current_activity == 101

    monkeypatch.setattr(
        hub._proxy,
        "get_activities",
        lambda: ({102: {"name": "Play Steamdeck", "active": True}}, False),
    )

    hub._on_activity_list_update()
    loop.run_until_complete(asyncio.sleep(0))

    assert hub.current_activity == 102

    loop.close()


def test_activities_burst_can_clear_current_when_no_activity_active(monkeypatch):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )

    hub.current_activity = 101

    monkeypatch.setattr(
        hub._proxy,
        "get_activities",
        lambda: ({101: {"name": "Watch a movie", "active": False}}, True),
    )

    hub._on_activities_burst("activities")
    loop.run_until_complete(asyncio.sleep(0))

    assert hub.current_activity is None

    loop.close()


def test_commands_burst_with_targeted_suffix_updates_activity_fetch_state(monkeypatch):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )

    act_id = 0x0101
    act_lo = act_id & 0xFF
    dev_id = 0x0202
    cmd_id = 0x002A

    hub._commands_in_flight.add(act_id)
    hub._proxy.state.activities[act_lo] = {"name": "Test Activity"}
    hub._proxy.state.activity_favorite_slots[act_lo] = [
        {"button_id": 1, "device_id": dev_id, "command_id": cmd_id}
    ]
    hub._proxy.state.record_favorite_label(act_lo, dev_id, cmd_id, "Fav Label")

    hub._on_commands_burst(f"commands:{dev_id & 0xFF}:{cmd_id & 0xFF}")
    loop.run_until_complete(asyncio.sleep(0))

    assert act_id not in hub._commands_in_flight

    loop.close()


def test_on_devices_burst_does_not_override_mdns_hub_version() -> None:
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    hub = SofabatonHub(
        FakeHass(loop),
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
        version="X1",
    )

    hub._proxy.hub_version = "X1S"
    hub._proxy.get_devices = lambda **_k: ({1: {"name": "TV", "brand": "Sony"}}, True)

    hub._on_devices_burst("devices")
    loop.run_until_complete(asyncio.sleep(0))

    assert hub.version == "X1"

    loop.close()


def _make_event_hook_hub(monkeypatch, activity_actions=None):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )

    monkeypatch.setattr(
        "custom_components.sofabaton_x1s.hub_proxy_events.async_dispatcher_send", lambda *_: None
    )

    async def _noop_prime(_activity_id):
        return None

    monkeypatch.setattr(hub, "_async_prime_buttons_for", _noop_prime)

    executed: list[dict] = []

    async def _record_action(action_config):
        executed.append(dict(action_config))

    monkeypatch.setattr(hub, "_async_execute_action_config", _record_action)

    class _EventStore:
        def get_hub_event_actions(self, _entry_id):
            return {
                "power_off": {"action": "perform-action", "perform_action": "script.hub_off"},
                "redundant_off": {"action": "perform-action", "perform_action": "script.still_off"},
                "activity_start": {"action": "perform-action", "perform_action": "script.started"},
                "activity_stop": {"action": "perform-action", "perform_action": "script.stopped"},
            }

        def get_activity_event_actions(self, _entry_id):
            return dict(activity_actions or {})

    async def _fake_store(_hass):
        return _EventStore()

    monkeypatch.setattr(
        "custom_components.sofabaton_x1s.hub_proxy_events.async_get_command_config_store", _fake_store
    )

    def _drain():
        loop.run_until_complete(asyncio.sleep(0))
        loop.run_until_complete(asyncio.sleep(0))

    return hub, loop, executed, _drain


def test_hub_event_actions_fire_on_activity_transitions(monkeypatch):
    hub, loop, executed, drain = _make_event_hook_hub(monkeypatch)
    try:
        # First resolution after startup only arms the hooks.
        hub._on_activity_change(5, None, "Movie")
        drain()
        assert executed == []

        # Power off from 5: the global activity-stop hook runs before the
        # power-off hook.
        hub._on_activity_change(None, 5, None)
        drain()
        assert [a.get("perform_action") for a in executed] == [
            "script.stopped",
            "script.hub_off",
        ]

        hub._on_activity_change(7, None, "Music")
        drain()
        assert [a.get("perform_action") for a in executed] == [
            "script.stopped",
            "script.hub_off",
            "script.started",
        ]
    finally:
        loop.close()


def test_hub_event_actions_fire_on_first_transition_after_powered_off_startup(monkeypatch):
    # Startup with the hub powered off: the initial activities read resolves
    # to "nothing running" without ever emitting an activity-change callback,
    # so the catalog read itself must arm the hooks. The first real
    # off -> activity transition then fires normally instead of being
    # swallowed as the initial-state report.
    hub, loop, executed, drain = _make_event_hook_hub(monkeypatch)
    try:
        monkeypatch.setattr(hub, "_get_activities_cached", lambda: ({}, True))
        hub._on_activities_burst("activities")
        drain()
        assert executed == []
        assert hub.get_last_hub_event() is None

        hub._on_activity_change(5, None, "Movie")
        drain()
        assert [a.get("perform_action") for a in executed] == ["script.started"]
        event = hub.get_last_hub_event()
        assert event is not None
        assert event["type"] == "activity_change"
        assert event["from_activity_id"] is None
        assert event["to_activity_id"] == 5
    finally:
        loop.close()


def test_hub_event_hooks_not_armed_by_incomplete_activities_read(monkeypatch):
    # A partial catalog read does not establish the activity state, so it
    # must not arm the hooks: the initial-state report can still be pending
    # and has to stay suppressed.
    hub, loop, executed, drain = _make_event_hook_hub(monkeypatch)
    try:
        monkeypatch.setattr(hub, "_get_activities_cached", lambda: ({}, False))
        hub._on_activities_burst("activities")
        drain()

        hub._on_activity_change(5, None, "Movie")
        drain()
        assert executed == []
    finally:
        loop.close()


def test_hub_event_actions_redundant_off_press(monkeypatch):
    hub, loop, executed, drain = _make_event_hook_hub(monkeypatch)
    try:
        hub._on_redundant_off_press()
        drain()
        assert [a.get("perform_action") for a in executed] == ["script.still_off"]
    finally:
        loop.close()


_ACTIVITY_EVENT_ACTIONS = {
    "5": {
        "start": {"action": "perform-action", "perform_action": "script.movie_start"},
        "stop": {"action": "perform-action", "perform_action": "script.movie_stop"},
    },
    "7": {
        "start": {"action": "perform-action", "perform_action": "script.music_start"},
        "stop": {"action": "perform-action", "perform_action": "script.music_stop"},
    },
}


def test_activity_event_actions_fire_on_start_stop_and_switch(monkeypatch):
    hub, loop, executed, drain = _make_event_hook_hub(
        monkeypatch, activity_actions=_ACTIVITY_EVENT_ACTIONS
    )
    try:
        # First resolution after startup only arms the hooks.
        hub._on_activity_change(5, None, "Movie")
        drain()
        assert executed == []

        # Direct switch 5 -> 7: the old activity's stop hook runs first with
        # the global activity-stop hook right behind it, then the new one
        # starts and the global activity-start hook runs.
        hub._on_activity_change(7, 5, "Music")
        drain()
        assert [a.get("perform_action") for a in executed] == [
            "script.movie_stop",
            "script.stopped",
            "script.music_start",
            "script.started",
        ]

        # Power off from 7: its stop hook runs alongside the global stop and
        # power-off hooks.
        executed.clear()
        hub._on_activity_change(None, 7, None)
        drain()
        assert [a.get("perform_action") for a in executed] == [
            "script.music_stop",
            "script.stopped",
            "script.hub_off",
        ]

        # Power on into an activity with no configured entry: only the
        # global hook fires.
        executed.clear()
        hub._on_activity_change(9, None, "Sports")
        drain()
        assert [a.get("perform_action") for a in executed] == ["script.started"]
    finally:
        loop.close()


def test_hub_event_notify_records_transitions(monkeypatch):
    hub, loop, _executed, drain = _make_event_hook_hub(monkeypatch)
    try:
        # The arming resolution must not surface as a firing.
        hub._on_activity_change(5, None, "Movie")
        drain()
        assert hub.get_last_hub_event() is None

        hub._on_activity_change(7, 5, "Music")
        drain()
        event = hub.get_last_hub_event()
        assert event is not None
        assert event["type"] == "activity_change"
        assert event["from_activity_id"] == 5
        assert event["to_activity_id"] == 7
        assert isinstance(event["timestamp"], float)

        hub._on_activity_change(None, 7, None)
        drain()
        event = hub.get_last_hub_event()
        assert event["type"] == "activity_change"
        assert event["from_activity_id"] == 7
        assert event["to_activity_id"] is None

        hub._on_redundant_off_press()
        drain()
        assert hub.get_last_hub_event()["type"] == "redundant_off"
    finally:
        loop.close()


def test_activities_burst_prunes_stale_activity_event_actions(monkeypatch):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )

    monkeypatch.setattr(
        "custom_components.sofabaton_x1s.hub_proxy_events.async_dispatcher_send", lambda *_: None
    )

    prune_calls: list[tuple[str, list[int]]] = []

    class _PruneStore:
        async def async_prune_activity_event_actions(self, entry_id, activity_ids):
            prune_calls.append((entry_id, sorted(int(a) for a in activity_ids)))
            return True

    async def _fake_store(_hass):
        return _PruneStore()

    monkeypatch.setattr(
        "custom_components.sofabaton_x1s.hub_proxy_events.async_get_command_config_store", _fake_store
    )

    hub.activities = {101: {"name": "Movie", "active": False, "needs_confirm": False}}
    monkeypatch.setattr(
        hub._proxy,
        "get_activities",
        lambda: ({102: {"name": "Music", "active": False, "needs_confirm": False}}, True),
    )

    hub._on_activities_burst("activities")
    loop.run_until_complete(asyncio.sleep(0))
    loop.run_until_complete(asyncio.sleep(0))

    assert prune_calls == [("entry-id", [102])]

    # An identical follow-up burst (no catalog change) must not prune again.
    hub._on_activities_burst("activities")
    loop.run_until_complete(asyncio.sleep(0))
    loop.run_until_complete(asyncio.sleep(0))
    assert prune_calls == [("entry-id", [102])]

    loop.close()
