"""Hub cache fetches, waiters and catalog refreshes (hub_fetch.py)."""

import asyncio

from custom_components.sofabaton_x1s.hub import SofabatonHub
from tests.hub_fakes import FakeHass


def test_activity_fetch_clears_inflight_after_favorite_labels(monkeypatch):
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
    hub.roku_server_enabled = True

    hub.hub_connected = True
    hub.activities_ready = True
    hub.devices_ready = True

    act_id = 0x0101
    act_lo = act_id & 0xFF
    dev_id = 0x0202
    cmd_id = 0x002A

    hub._proxy.state.activities[act_lo] = {"name": "Test Activity"}
    hub._proxy.state.activity_favorite_slots[act_lo] = [
        {"button_id": 1, "device_id": dev_id, "command_id": cmd_id}
    ]

    monkeypatch.setattr(hub, "_reset_entity_cache", lambda *_, **__: None)
    async def _noop_wait(*_):
        return None

    monkeypatch.setattr(hub, "_async_wait_for_buttons_ready", _noop_wait)
    monkeypatch.setattr(hub._proxy, "clear_entity_cache", lambda *_, **__: None)
    monkeypatch.setattr(hub._proxy, "get_buttons_for_entity", lambda *_, **__: ([], True))

    loop.run_until_complete(hub.async_fetch_device_commands(act_id))

    assert act_id in hub._commands_in_flight
    hub.hub_connected = True
    assert hub.get_index_state() == "loading"

    hub._proxy.state.commands[dev_id & 0xFF] = {cmd_id: "Fav Label"}
    hub._proxy.state.record_favorite_label(act_lo, dev_id, cmd_id, "Fav Label")
    hub._proxy._favorite_label_requests.clear()

    hub._on_commands_burst(f"commands:{dev_id & 0xFF}")
    loop.run_until_complete(asyncio.sleep(0))

    # Activity fetch should stay in-flight until macro burst completion is observed.
    assert act_id in hub._commands_in_flight

    hub._proxy._macros_complete.add(act_lo)
    hub._on_macros_burst(f"macros:{act_lo}")
    loop.run_until_complete(asyncio.sleep(0))

    assert act_id not in hub._commands_in_flight
    assert hub._commands_in_flight == set()
    assert hub._pending_button_fetch == set()
    hub.hub_connected = True
    hub.activities_ready = True
    hub.devices_ready = True
    assert hub.get_index_state() == "ready"

    loop.close()


def test_async_fetch_single_device_command_force_refresh_bypasses_cached_label(monkeypatch):
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

    hub._proxy.state.commands[11] = {112: "Optimistic Label"}
    call_log: list[tuple[bool, bool]] = []

    def _get_single_command_for_entity(
        ent_id: int,
        command_id: int,
        *,
        fetch_if_missing: bool = True,
    ):
        cached = command_id in hub._proxy.state.commands.get(ent_id & 0xFF, {})
        call_log.append((fetch_if_missing, cached))
        if fetch_if_missing:
            assert cached is False
            return ({}, False)
        hub._proxy.state.commands.setdefault(ent_id & 0xFF, {})[command_id] = "Hub Label"
        return ({command_id: "Hub Label"}, True)

    monkeypatch.setattr(
        hub._proxy,
        "get_single_command_for_entity",
        _get_single_command_for_entity,
    )

    result = loop.run_until_complete(
        hub.async_fetch_single_device_command(
            11,
            112,
            wait_timeout=0.2,
            force_refresh=True,
        )
    )

    assert result == {112: "Hub Label"}
    assert hub._proxy.state.commands[11][112] == "Hub Label"
    assert call_log == [(True, False), (False, False)]

    loop.close()


def test_async_restore_persistent_cache_bumps_cache_generation():
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

    loop.run_until_complete(hub.async_restore_persistent_cache({}))

    assert hub.cache_generation == 1

    loop.close()


def test_device_fetch_waits_until_command_burst_completes(monkeypatch):
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

    ent_id = 0x0202
    ready = {"value": False}

    monkeypatch.setattr(hub, "_reset_entity_cache", lambda *_, **__: None)
    monkeypatch.setattr(hub._proxy, "clear_entity_cache", lambda *_, **__: None)

    def _get_commands(_ent_id: int, *, fetch_if_missing: bool = True):
        if ready["value"]:
            return ({0x01: "Power"}, True)
        return ({}, False)

    monkeypatch.setattr(hub._proxy, "get_commands_for_entity", _get_commands)

    loop.call_later(0.1, lambda: ready.__setitem__("value", True))

    loop.run_until_complete(hub.async_fetch_device_commands(ent_id))

    assert ready["value"] is True
    assert ent_id not in hub._commands_in_flight

    loop.close()


def test_activity_fetch_requests_activity_map_before_favorite_command_resolution(monkeypatch):
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
    call_order: list[str] = []

    hub._proxy.state.activities[act_lo] = {"name": "Test Activity"}

    monkeypatch.setattr(hub, "_reset_entity_cache", lambda *_, **__: None)
    monkeypatch.setattr(hub._proxy, "clear_entity_cache", lambda *_, **__: None)
    monkeypatch.setattr(hub._proxy, "get_buttons_for_entity", lambda *_args, **_kwargs: ([], True))
    async def _noop_wait(*_):
        return None

    monkeypatch.setattr(hub, "_async_wait_for_buttons_ready", _noop_wait)

    def _request_map(_act_id: int) -> bool:
        call_order.append("request_activity_mapping")
        hub._proxy._activity_map_complete.add(_act_id & 0xFF)
        return True

    def _ensure_commands(_act_id: int, *, fetch_if_missing: bool = True):
        call_order.append("ensure_commands_for_activity")
        return ({}, True)

    def _get_macros(_act_id: int, *, fetch_if_missing: bool = True):
        call_order.append("get_macros_for_activity")
        return ([], True)

    monkeypatch.setattr(hub._proxy, "request_activity_mapping", _request_map)
    monkeypatch.setattr(hub._proxy, "ensure_commands_for_activity", _ensure_commands)
    monkeypatch.setattr(hub._proxy, "get_macros_for_activity", _get_macros)

    loop.run_until_complete(hub.async_fetch_device_commands(act_id))

    assert call_order.index("request_activity_mapping") < call_order.index("ensure_commands_for_activity")

    loop.close()


def test_prime_buttons_requests_activity_map_before_favorite_command_resolution(monkeypatch):
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
    call_order: list[str] = []

    hub._proxy.state.activities[act_lo] = {"name": "Test Activity"}

    monkeypatch.setattr(hub._proxy, "get_buttons_for_entity", lambda *_args, **_kwargs: ([], True))

    def _request_map(_act_id: int) -> bool:
        call_order.append("request_activity_mapping")
        hub._proxy._activity_map_complete.add(_act_id & 0xFF)
        return True

    def _ensure_commands(_act_id: int, *, fetch_if_missing: bool = True):
        call_order.append("ensure_commands_for_activity")
        return ({}, True)

    def _get_macros(_act_id: int, *, fetch_if_missing: bool = True):
        call_order.append("get_macros_for_activity")
        return ([], True)

    monkeypatch.setattr(hub._proxy, "request_activity_mapping", _request_map)
    monkeypatch.setattr(hub._proxy, "ensure_commands_for_activity", _ensure_commands)
    monkeypatch.setattr(hub._proxy, "get_macros_for_activity", _get_macros)

    loop.run_until_complete(hub._async_prime_buttons_for(act_id))

    assert call_order.index("request_activity_mapping") < call_order.index("ensure_commands_for_activity")

    loop.close()


def test_refresh_devices_snapshot_default_timeout_is_15_seconds():
    assert (
        SofabatonHub._async_refresh_devices_snapshot.__defaults__ == (15.0,)
    )


def test_prime_buttons_skips_activity_map_when_cached(monkeypatch):
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

    act_id = 0x0105
    act_lo = act_id & 0xFF

    hub._proxy.state.activity_favorite_slots[act_lo] = [
        {"button_id": 1, "device_id": 2, "command_id": 3, "source": "cache"}
    ]

    monkeypatch.setattr(hub._proxy, "get_buttons_for_entity", lambda *_args, **_kwargs: ([1, 2], True))
    monkeypatch.setattr(hub._proxy, "ensure_commands_for_activity", lambda *_args, **_kwargs: ({}, True))
    monkeypatch.setattr(hub._proxy, "get_macros_for_activity", lambda *_args, **_kwargs: ([], True))

    called = {"request_map": 0}

    def _request_map(_act_id: int) -> bool:
        called["request_map"] += 1
        return True

    monkeypatch.setattr(hub._proxy, "request_activity_mapping", _request_map)

    loop.run_until_complete(hub._async_prime_buttons_for(act_id))

    assert called["request_map"] == 0

    loop.close()


def test_prime_buttons_fetches_activity_map_when_not_cached(monkeypatch):
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

    act_id = 0x0106

    monkeypatch.setattr(hub._proxy, "get_buttons_for_entity", lambda *_args, **_kwargs: ([1, 2], True))
    monkeypatch.setattr(hub._proxy, "ensure_commands_for_activity", lambda *_args, **_kwargs: ({}, True))
    monkeypatch.setattr(hub._proxy, "get_macros_for_activity", lambda *_args, **_kwargs: ([], True))

    called = {"request_map": 0}

    def _request_map(_act_id: int) -> bool:
        called["request_map"] += 1
        hub._proxy._activity_map_complete.add(_act_id & 0xFF)
        return True

    monkeypatch.setattr(hub._proxy, "request_activity_mapping", _request_map)

    loop.run_until_complete(hub._async_prime_buttons_for(act_id))

    assert called["request_map"] == 1

    loop.close()


def test_restore_persistent_cache_primes_hub_trackers():
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

    payload = {
        "devices": {"104": {"name": "Xbox", "brand": "Xbox"}},
        "buttons": {"104": [174, 176]},
        "commands": {"104": {"1": "Power"}},
        "activity_favorite_slots": {"104": [{"button_id": 1, "device_id": 2, "command_id": 3, "source": "cache"}]},
    }

    loop.run_until_complete(hub.async_restore_persistent_cache(payload))

    assert 104 in hub._buttons_ready_for
    assert 104 in hub._command_entities
    assert 104 in hub._proxy._activity_map_complete
    assert hub.devices.get(104, {}).get("name") == "Xbox"

    loop.close()


def test_commands_ready_for_activity_waits_for_macro_completion(monkeypatch):
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

    act_id = 0x22
    hub._proxy.state.activities[act_id] = {"name": "Watch TV"}

    monkeypatch.setattr(hub._proxy, "ensure_commands_for_activity", lambda *_args, **_kwargs: ({1: "Power"}, True))
    monkeypatch.setattr(hub._proxy, "get_macros_for_activity", lambda *_args, **_kwargs: ([], False))

    assert hub._commands_ready_for(act_id) is False

    loop.close()


def test_async_request_catalog_prunes_auxiliary_only_removed_activity_ids(monkeypatch):
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

    hub._activities_generation = 2
    hub._proxy.get_known_activity_ids = lambda: {101, 102}  # type: ignore[method-assign]
    hub._proxy.get_cached_activity_detail_ids = lambda: {5, 6, 101, 102}  # type: ignore[method-assign]

    def _clear_must_not_run():
        raise AssertionError("catalog refresh must not clear the cached catalog before the read")

    hub._proxy.clear_activities_catalog = _clear_must_not_run  # type: ignore[method-assign]
    hub._proxy.request_activities = lambda: None  # type: ignore[method-assign]

    cleared: list[tuple[int, str]] = []

    def _clear_cached_entity_detail(ent_id, *, kind):
        cleared.append((ent_id, kind))

    hub._proxy.clear_cached_entity_detail = _clear_cached_entity_detail  # type: ignore[method-assign]

    def _fake_get_known_activity_ids():
        if hub._activities_generation == 2:
            return {101, 102}
        return {101, 102}

    hub._proxy.get_known_activity_ids = _fake_get_known_activity_ids  # type: ignore[method-assign]

    async def _fake_sleep(_delay):
        hub._proxy._activities_commit_serial += 1

    monkeypatch.setattr("custom_components.sofabaton_x1s.hub.asyncio.sleep", _fake_sleep)
    monkeypatch.setattr("custom_components.sofabaton_x1s.hub_fetch.async_dispatcher_send", lambda *_: None)

    loop.run_until_complete(hub.async_request_catalog("activities", timeout_seconds=0.2))

    assert set(cleared) == {(5, "activity"), (6, "activity")}

    loop.close()


def _bare_hub(loop):
    hass = FakeHass(loop)
    hub = SofabatonHub(hass, "entry-id", "hub-name", "127.0.0.1", 1234, {}, 9999, 10000, True, False)
    hub.hub_connected = True
    return hub


def test_buttons_wait_returns_when_nothing_can_be_requested(monkeypatch):
    """CR-H1-1 (a)/(c): with the vendor app connected (or the hub down) no
    buttons request is ever sent; the wait must not block forever."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hub = _bare_hub(loop)
    monkeypatch.setattr(hub._proxy, "can_issue_commands", lambda: False)
    loop.run_until_complete(asyncio.wait_for(hub._async_wait_for_buttons_ready(0x65), 2))
    assert hub._button_waiters == {}


def test_buttons_wait_has_a_deadline(monkeypatch):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hub = _bare_hub(loop)
    monkeypatch.setattr(hub._proxy, "can_issue_commands", lambda: True)
    loop.run_until_complete(
        asyncio.wait_for(hub._async_wait_for_buttons_ready(0x65, timeout=0.05), 2)
    )
    assert hub._button_waiters == {}


def test_cache_reset_and_hub_drop_release_button_waiters(monkeypatch):
    """CR-H1-1 (b)/(d): a reset or a hub disconnect must wake a running wait,
    not strand it."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hub = _bare_hub(loop)
    monkeypatch.setattr(hub._proxy, "can_issue_commands", lambda: True)

    async def main():
        waiting = asyncio.ensure_future(hub._async_wait_for_buttons_ready(0x65, timeout=30))
        await asyncio.sleep(0)
        hub._reset_entity_cache(0x65)
        await asyncio.wait_for(waiting, 2)

        waiting = asyncio.ensure_future(hub._async_wait_for_buttons_ready(0x66, timeout=30))
        await asyncio.sleep(0)
        hub._on_hub_state_change(False)
        await asyncio.wait_for(waiting, 2)
        assert hub._button_waiters == {}

    loop.run_until_complete(main())


def test_prime_does_not_stay_pending_when_nothing_was_requested(monkeypatch):
    """CR-H1-1 (c): a prime that could not ask the hub must not leave its
    activity pending, or the re-prime after the app disconnects is skipped."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hub = _bare_hub(loop)
    monkeypatch.setattr(hub._proxy, "can_issue_commands", lambda: False)
    monkeypatch.setattr(hub._proxy, "get_buttons_for_entity", lambda *_a, **_k: ([], False))
    monkeypatch.setattr(hub, "_activity_map_cached", lambda *_a: True)
    loop.run_until_complete(asyncio.wait_for(hub._async_prime_buttons_for(0x65), 2))
    assert 0x65 not in hub._pending_button_fetch


def test_async_request_catalog_never_prunes_a_catalog_device_as_an_activity(monkeypatch):
    # Regression (2026-10-01): an activity rename ended in this prune with
    # the device ids reported as cached activity detail (their macro lists
    # sit in the shared macros table), and forgetting them under the
    # activity kind wiped every device's commands and keymap.
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hub = _bare_hub(loop)

    hub._proxy.get_known_activity_ids = lambda: {101, 102}  # type: ignore[method-assign]
    hub._proxy.get_known_device_ids = lambda: {1, 2, 5}  # type: ignore[method-assign]
    hub._proxy.get_cached_activity_detail_ids = lambda: {1, 2, 5, 101, 102, 103}  # type: ignore[method-assign]
    hub._proxy.request_activities = lambda: None  # type: ignore[method-assign]

    cleared: list[tuple[int, str]] = []

    def _clear_cached_entity_detail(ent_id, *, kind):
        cleared.append((ent_id, kind))

    hub._proxy.clear_cached_entity_detail = _clear_cached_entity_detail  # type: ignore[method-assign]

    async def _fake_sleep(_delay):
        hub._proxy._activities_commit_serial += 1

    monkeypatch.setattr("custom_components.sofabaton_x1s.hub.asyncio.sleep", _fake_sleep)
    monkeypatch.setattr("custom_components.sofabaton_x1s.hub_fetch.async_dispatcher_send", lambda *_: None)

    loop.run_until_complete(hub.async_request_catalog("activities", timeout_seconds=0.2))

    # Only the activity that really left the catalog is forgotten.
    assert cleared == [(103, "activity")]

    loop.close()
