"""Activity refreshes must never turn missing replies into power events.

Exercise the real request, snapshot and burst listeners through the HA hub.
Only the transport and HA side effects are replaced; no hub is contacted.
"""

import asyncio
import threading
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from custom_components.sofabaton_x1s import hub as hub_module
from custom_components.sofabaton_x1s.const import HUB_VERSION_X1, HUB_VERSION_X1S, HUB_VERSION_X2
from custom_components.sofabaton_x1s.hub import SofabatonHub
from custom_components.sofabaton_x1s.lib.frame_handlers import FrameContext
from custom_components.sofabaton_x1s.lib import x1_proxy as proxy_module
from custom_components.sofabaton_x1s.lib import proxy_catalog as catalog_module
from custom_components.sofabaton_x1s.lib.opcode_handlers import AckReadyHandler
from custom_components.sofabaton_x1s.lib.protocol_const import OP_ACK_READY


class _Hass:
    def __init__(self, loop):
        self.loop = loop
        self.data = {}
        self.config_entries = SimpleNamespace(async_get_entry=lambda _id: None)

    async def async_add_executor_job(self, func, *args):
        return func(*args)

    def async_create_task(self, coro):
        return self.loop.create_task(coro)


def _reply(proxy, rows):
    assert proxy._burst.kind == "activities"
    if not rows:
        assert proxy.note_catalog_status_ack(0x07)
        return
    for index, (activity_id, name, active) in enumerate(rows, 1):
        assert proxy.ingest_activity_row(
            row_idx=index,
            expected_rows=len(rows),
            act_id=activity_id,
            activity={"id": activity_id, "name": name, "active": active, "needs_confirm": False},
        )
    assert proxy.try_finish_activities_burst()


def _expire(proxy, partial=False):
    if partial:
        assert proxy.ingest_activity_row(
            row_idx=1,
            expected_rows=2,
            act_id=101,
            activity={"id": 101, "name": "TV", "active": False, "needs_confirm": False},
        )
    proxy._burst.tick(
        proxy._burst.last_ts + proxy._burst.idle_s + 1,
        can_issue=proxy.can_issue_commands,
        sender=proxy._send_cmd_frame,
    )


async def _drain():
    await asyncio.sleep(0)
    await asyncio.sleep(0)


@pytest.fixture
def catalog(monkeypatch):
    loop = asyncio.new_event_loop()
    hass = _Hass(loop)
    hub = SofabatonHub(
        hass, "entry-id", "hub-name", "127.0.0.1", 1234, {}, 9999, 10000, False, False
    )
    proxy = hub._proxy
    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(proxy.transport, "send_local", lambda _frame: None)
    monkeypatch.setattr(hub, "_async_prime_buttons_for", AsyncMock())
    monkeypatch.setattr(hub, "_async_prune_activity_event_actions", AsyncMock())
    hub_actions = AsyncMock()
    activity_actions = AsyncMock()
    monkeypatch.setattr(hub, "_async_run_hub_event_action", hub_actions)
    monkeypatch.setattr(hub, "_async_run_activity_event_action", activity_actions)
    published = []
    monkeypatch.setattr(
        hub_module,
        "async_dispatcher_send",
        lambda _hass, signal, *args: published.append((signal, hub.current_activity)),
    )
    changes = []
    proxy.on_activity_change(lambda new, old, name: changes.append((new, old)))
    assert proxy.request_activities()
    _reply(proxy, [(101, "TV", True), (102, "Music", False)])
    loop.run_until_complete(_drain())
    assert hub.current_activity == 101
    assert hub.activities_ready
    assert hub._hub_event_hooks_armed
    changes.clear()
    published.clear()
    hub_actions.reset_mock()
    activity_actions.reset_mock()
    # Include a removed catalog entry and an auxiliary-only stale cache entry.
    proxy.state.activity_macros = {101: [], 102: [], 103: []}
    try:
        yield SimpleNamespace(
            hub=hub, proxy=proxy, loop=loop, changes=changes, published=published,
            hub_actions=hub_actions, activity_actions=activity_actions,
        )
    finally:
        for task in asyncio.all_tasks(loop):
            task.cancel()
        loop.run_until_complete(_drain())
        loop.close()


@pytest.mark.parametrize("partial", [False, True], ids=["silence", "partial"])
def test_failed_refresh_preserves_activity_and_details_until_recovery(catalog, partial):
    hub, proxy = catalog.hub, catalog.proxy
    generation = hub._activities_generation
    cache_generation = hub.cache_generation
    original = dict(proxy.state.activities)

    async def scenario():
        task = asyncio.create_task(hub.async_request_catalog("activities", timeout_seconds=0.2))
        await asyncio.sleep(0)
        # The committed view must remain usable while the request is in flight.
        assert proxy.get_activities(force_refresh=False) == (original, True)
        assert proxy.state.current_activity_hint == 101
        _expire(proxy, partial=partial)
        await _drain()
        assert hub.current_activity == proxy.state.current_activity == 101
        assert hub.activities_ready
        assert hub._activities_generation == generation
        assert hub.cache_generation == cache_generation
        assert catalog.changes == []
        catalog.hub_actions.assert_not_awaited()
        catalog.activity_actions.assert_not_awaited()
        assert catalog.published == []
        with pytest.raises(TimeoutError, match="activit"):
            await task
        assert set(proxy.state.activity_macros) == {101, 102, 103}

        # A later valid reply commits and prunes removals without an Off/On bounce.
        task = asyncio.create_task(hub.async_request_catalog("activities", timeout_seconds=0.5))
        await asyncio.sleep(0)
        _reply(proxy, [(101, "TV", True)])
        await task
        await _drain()
        assert hub._activities_generation == generation + 1
        assert set(hub.activities) == {101}
        assert set(proxy.state.activity_macros) == {101}
        assert catalog.changes == []
        catalog.hub_actions.assert_not_awaited()
        catalog.activity_actions.assert_not_awaited()
        assert all(activity == 101 for _signal, activity in catalog.published)

    catalog.loop.run_until_complete(scenario())


@pytest.mark.parametrize("empty", [False, True], ids=["inactive-rows", "empty-ack"])
def test_complete_off_reply_still_fires_stop_and_power_off(catalog, empty):
    hub, proxy = catalog.hub, catalog.proxy
    generation = hub._activities_generation

    async def scenario():
        task = asyncio.create_task(hub.async_request_catalog("activities", timeout_seconds=0.5))
        await asyncio.sleep(0)
        _reply(proxy, [] if empty else [(101, "TV", False), (102, "Music", False)])
        await task
        await _drain()

    catalog.loop.run_until_complete(scenario())
    assert hub.current_activity is proxy.state.current_activity is None
    assert hub._activities_generation == generation + 1
    assert hub.activities_ready
    assert catalog.changes == [(None, 101)]
    catalog.activity_actions.assert_awaited_once_with(101, "stop")
    assert [call.args for call in catalog.hub_actions.await_args_list] == [
        ("activity_stop",), ("power_off",)
    ]
    assert set(proxy.state.activity_macros) == (set() if empty else {101, 102})


def test_x2_retry_can_confirm_pending_redundant_off(catalog):
    hub, proxy = catalog.hub, catalog.proxy
    proxy.hub_version = HUB_VERSION_X2
    assert proxy.request_activities()
    _reply(proxy, [(101, "TV", False)])
    catalog.loop.run_until_complete(_drain())
    catalog.hub_actions.reset_mock()
    catalog.activity_actions.reset_mock()
    catalog.changes.clear()
    generation = hub._activities_generation
    AckReadyHandler().handle(FrameContext(
        proxy=proxy, opcode=OP_ACK_READY, direction="H→A",
        payload=b"\x00", raw=b"", name="ACK_READY",
    ))
    _expire(proxy)
    catalog.loop.run_until_complete(_drain())
    assert proxy._pending_redundant_off_check
    assert not proxy._ack_ready_refresh_pending
    assert hub._activities_generation == generation
    catalog.hub_actions.assert_not_awaited()

    assert proxy._activity_retry_due_at is not None
    proxy._handle_idle(proxy._activity_retry_due_at)
    _reply(proxy, [(101, "TV", False)])
    catalog.loop.run_until_complete(_drain())
    catalog.hub_actions.assert_awaited_once_with("redundant_off")
    assert not proxy._pending_redundant_off_check
    assert not proxy._ack_ready_refresh_pending
    assert catalog.changes == []


def test_queued_old_completion_cannot_satisfy_a_new_refresh(catalog):
    hub, proxy = catalog.hub, catalog.proxy
    generation = hub._activities_generation

    async def scenario():
        assert proxy.request_activities()
        _reply(proxy, [(101, "TV", True), (102, "Music", False)])
        # The proxy has committed, but its HA callback has not run yet.
        assert hub._activities_generation == generation
        catalog.loop.call_soon(_expire, proxy)
        with pytest.raises(TimeoutError):
            await hub.async_request_catalog("activities", timeout_seconds=0.2)
        assert hub._activities_generation == generation + 1
        assert set(proxy.state.activity_macros) == {101, 102, 103}
        assert catalog.changes == []

    catalog.loop.run_until_complete(scenario())


def test_burst_outcome_is_captured_before_ha_callbacks_run(catalog):
    hub, proxy = catalog.hub, catalog.proxy
    generation = hub._activities_generation

    assert proxy.request_activities()
    _expire(proxy)
    assert proxy.request_activities()
    _reply(proxy, [(101, "TV", True)])
    # Both bursts finish before the event loop gets a turn. The discarded
    # burst must not inherit the later successful burst's ready flag.
    catalog.loop.run_until_complete(_drain())
    assert hub._activities_generation == generation + 1
    assert catalog.changes == []


def test_external_off_still_applies_after_a_failed_tcp_refresh(catalog):
    proxy = catalog.proxy
    assert proxy.request_activities()
    _expire(proxy)
    catalog.loop.run_until_complete(_drain())
    assert proxy.apply_external_activity_state(None)
    catalog.loop.run_until_complete(_drain())
    assert catalog.hub.current_activity is None
    assert catalog.changes == [(None, 101)]
    assert [call.args for call in catalog.hub_actions.await_args_list] == [
        ("activity_stop",), ("power_off",)
    ]


def test_external_off_after_failed_ack_refresh_is_not_redundant(catalog):
    proxy = catalog.proxy
    proxy.hub_version = HUB_VERSION_X2
    proxy.state.buttons[101] = set()
    handler = AckReadyHandler()
    frame = FrameContext(
        proxy=proxy, opcode=OP_ACK_READY, direction="H→A",
        payload=b"\x00", raw=b"", name="ACK_READY",
    )

    # An earlier transition's ACK refresh and its one X2 retry both time out.
    handler.handle(frame)
    assert proxy._ack_ready_refresh_pending
    _expire(proxy)
    assert proxy._activity_retry_due_at is not None
    proxy._handle_idle(proxy._activity_retry_due_at)
    _expire(proxy)
    assert proxy._activity_retry_due_at is None
    catalog.loop.run_until_complete(_drain())
    assert catalog.hub.current_activity == 101

    # The next real Off arrives over MQTT before its ACK. It must arm the
    # settling gate so that ACK is recognized as part of this transition.
    assert proxy.apply_external_activity_state(None)
    assert not proxy._external_settle_event.is_set()
    handler.handle(frame)
    assert proxy._external_settle_event.is_set()
    _reply(proxy, [(101, "TV", False), (102, "Music", False)])
    catalog.loop.run_until_complete(_drain())
    assert catalog.changes == [(None, 101)]
    assert [call.args for call in catalog.hub_actions.await_args_list] == [
        ("activity_stop",), ("power_off",)
    ]
    assert not proxy._ack_ready_refresh_pending

    # A later Off press while already Off still fires exactly once.
    catalog.hub_actions.reset_mock()
    handler.handle(frame)
    _reply(proxy, [(101, "TV", False), (102, "Music", False)])
    catalog.loop.run_until_complete(_drain())
    catalog.hub_actions.assert_awaited_once_with("redundant_off")


@pytest.mark.parametrize("operation", ["catalog", "command_sync"])
def test_new_proxy_commit_waits_for_its_own_ha_delivery(catalog, monkeypatch, operation):
    """An old HA callback and a new proxy commit cannot acknowledge each other."""
    hub, proxy, loop = catalog.hub, catalog.proxy, catalog.loop
    hub.roku_server_enabled = True
    queued = []
    call_soon_threadsafe = loop.call_soon_threadsafe
    monkeypatch.setattr(loop, "call_soon_threadsafe", lambda cb, *args: queued.append((cb, args)))
    assert proxy.request_activities()
    _reply(proxy, [(101, "TV", True), (102, "Music", False)])
    monkeypatch.setattr(loop, "call_soon_threadsafe", call_soon_threadsafe)
    assert len(queued) == 1
    assert hub._activities_generation < proxy._activities_snapshot_generation

    async def threaded_executor(func, *args):
        return await asyncio.to_thread(func, *args)

    monkeypatch.setattr(hub.hass, "async_add_executor_job", threaded_executor)
    requested, committed = asyncio.Event(), asyncio.Event()
    release_delivery = threading.Event()
    request_activities = proxy.request_activities

    def request_new_snapshot():
        sent = request_activities()
        # The refresh has now recorded its baselines. Deliver the older
        # callback while the newer response is still outstanding.
        for cb, args in queued:
            call_soon_threadsafe(cb, *args)
        call_soon_threadsafe(requested.set)
        return sent

    monkeypatch.setattr(proxy, "request_activities", request_new_snapshot)
    log_info = proxy._log.info

    def pause_after_commit(message, *args, **kwargs):
        log_info(message, *args, **kwargs)
        if message.startswith("[ACT] committed complete activities snapshot"):
            call_soon_threadsafe(committed.set)
            assert release_delivery.wait(10), "test did not release the frame thread"

    monkeypatch.setattr(proxy._log, "info", pause_after_commit)
    device_refresh = AsyncMock(side_effect=AssertionError("sync passed stale activity validation"))
    monkeypatch.setattr(hub, "_async_refresh_devices_snapshot", device_refresh)
    delete_device = AsyncMock()
    monkeypatch.setattr(hub, "async_delete_device", delete_device)
    payload = {
        "commands": [{"name": "Command 1", "add_as_favorite": True, "activities": ["101"]}],
        "commands_hash": "abc",
        "activity_labels": {"101": "TV"},
    }

    async def scenario():
        if operation == "catalog":
            task = asyncio.create_task(hub.async_request_catalog("activities", timeout_seconds=2))
        else:
            task = asyncio.create_task(hub.async_sync_command_config(command_payload=payload, request_port=8060))
        response = None
        try:
            await asyncio.wait_for(requested.wait(), 5)
            response = asyncio.create_task(asyncio.to_thread(_reply, proxy, [(101, "Movie Night", True)]))
            await asyncio.wait_for(committed.wait(), 5)
            assert hub.activities[101]["name"] == "TV"
            assert proxy.state.activities[101]["name"] == "Movie Night"
            # Let the real refresh waiter run while B's frame thread is held
            # between its commit and its HA callback, not inside an inline stub.
            await asyncio.sleep(0.15)
            assert not task.done(), "a different snapshot's HA callback satisfied the refresh"
            assert set(proxy.state.activity_macros) == {101, 102, 103}
            device_refresh.assert_not_awaited()
            delete_device.assert_not_awaited()

            release_delivery.set()
            await response
            if operation == "command_sync":
                from homeassistant.exceptions import HomeAssistantError

                with pytest.raises(HomeAssistantError, match="Failed Activity validation"):
                    await task
                device_refresh.assert_not_awaited()
                delete_device.assert_not_awaited()
            else:
                await task
            assert hub.activities[101]["name"] == "Movie Night"
            assert set(proxy.state.activity_macros) == {101}
        finally:
            release_delivery.set()
            if response is not None:
                await asyncio.gather(response, return_exceptions=True)
            if not task.done():
                task.cancel()
            await asyncio.gather(task, return_exceptions=True)
            await loop.shutdown_default_executor()

    loop.run_until_complete(scenario())


def test_snapshot_result_keeps_its_captured_contents(catalog):
    hub, proxy, loop = catalog.hub, catalog.proxy, catalog.loop

    async def scenario():
        task = asyncio.create_task(hub._async_refresh_activities_snapshot(timeout_seconds=0.5))
        await asyncio.sleep(0)
        _reply(proxy, [(101, "Movie Night", True)])
        # The commit is queued for HA delivery. A later cache mutation must
        # not replace the contents paired with that commit's acknowledgment.
        proxy.state.activities[101]["name"] = "Undelivered change"
        snapshot = await task
        assert snapshot[101]["name"] == hub.activities[101]["name"] == "Movie Night"
        snapshot[101]["name"] = "Caller edit"
        assert hub.activities[101]["name"] == "Movie Night"
        assert proxy._committed_activity_snapshot[1][101]["name"] == "Movie Night"

    loop.run_until_complete(scenario())


def test_replaced_proxy_cannot_deliver_a_queued_snapshot(catalog, monkeypatch):
    hub, proxy, loop = catalog.hub, catalog.proxy, catalog.loop
    assert proxy.request_activities()
    _reply(proxy, [(101, "Old proxy", True)])
    replacement = hub._create_proxy()
    hub._proxy = replacement
    monkeypatch.setattr(replacement, "can_issue_commands", lambda: True)
    monkeypatch.setattr(replacement.transport, "send_local", lambda _frame: None)
    loop.run_until_complete(_drain())
    assert hub.activities[101]["name"] == "TV"
    # The previous proxy's generations exceed the fresh proxy's zero, but
    # they cannot acknowledge its request or trigger detail pruning.
    with pytest.raises(TimeoutError):
        loop.run_until_complete(hub.async_request_catalog("activities", timeout_seconds=0.05))
    assert set(proxy.state.activity_macros) == {101, 102, 103}


@pytest.mark.parametrize("version", [HUB_VERSION_X1, HUB_VERSION_X1S, HUB_VERSION_X2])
@pytest.mark.parametrize("exhaust_attempts", [False, True], ids=["inflight", "exhausted"])
def test_failed_off_confirmation_cannot_fire_after_reconnect(catalog, monkeypatch, version, exhaust_attempts):
    hub, proxy, loop = catalog.hub, catalog.proxy, catalog.loop
    proxy.hub_version = version
    monkeypatch.setattr(hub, "_async_initial_sync", AsyncMock())
    assert proxy.request_activities()
    _reply(proxy, [(101, "TV", False)])
    loop.run_until_complete(_drain())
    catalog.hub_actions.reset_mock()
    handler = AckReadyHandler()
    frame = FrameContext(
        proxy=proxy, opcode=OP_ACK_READY, direction="H→A",
        payload=b"\x00", raw=b"", name="ACK_READY",
    )

    handler.handle(frame)
    assert proxy._pending_redundant_off_check
    if exhaust_attempts:
        _expire(proxy)
        if version == HUB_VERSION_X2:
            assert proxy._activity_retry_due_at is not None
            proxy._handle_idle(proxy._activity_retry_due_at)
            _expire(proxy)
    loop.run_until_complete(_drain())
    catalog.hub_actions.assert_not_awaited()

    proxy._notify_hub_state(False)
    proxy._notify_hub_state(True)
    loop.run_until_complete(_drain())
    if not proxy._burst.active:
        assert proxy.request_activities()
    _reply(proxy, [(101, "TV", False)])
    loop.run_until_complete(_drain())
    catalog.hub_actions.assert_not_awaited()

    handler.handle(frame)
    _reply(proxy, [(101, "TV", False)])
    loop.run_until_complete(_drain())
    catalog.hub_actions.assert_awaited_once_with("redundant_off")


@pytest.mark.parametrize("version", [HUB_VERSION_X1, HUB_VERSION_X1S, HUB_VERSION_X2])
def test_failed_off_confirmation_expires_without_disconnect(catalog, version):
    proxy, loop = catalog.proxy, catalog.loop
    proxy.hub_version = version
    assert proxy.request_activities()
    _reply(proxy, [(101, "TV", False)])
    loop.run_until_complete(_drain())
    catalog.hub_actions.reset_mock()
    frame = FrameContext(
        proxy=proxy, opcode=OP_ACK_READY, direction="H→A",
        payload=b"\x00", raw=b"", name="ACK_READY",
    )
    AckReadyHandler().handle(frame)
    _expire(proxy)
    if version == HUB_VERSION_X2:
        proxy._handle_idle(proxy._activity_retry_due_at)
        _expire(proxy)
    assert not proxy._pending_redundant_off_check
    assert proxy.request_activities()
    _reply(proxy, [(101, "TV", False)])
    loop.run_until_complete(_drain())
    catalog.hub_actions.assert_not_awaited()


@pytest.mark.parametrize("idle_tick", [False, True])
def test_queued_off_confirmation_has_a_deadline(catalog, monkeypatch, idle_tick):
    proxy, loop = catalog.proxy, catalog.loop
    assert proxy.request_activities()
    _reply(proxy, [(101, "TV", False)])
    loop.run_until_complete(_drain())
    catalog.hub_actions.reset_mock()
    clock = SimpleNamespace(now=100.0)
    fake_time = SimpleNamespace(monotonic=lambda: clock.now)
    monkeypatch.setattr(proxy_module, "time", fake_time)
    monkeypatch.setattr(catalog_module, "time", fake_time)
    # A command exchange can hold the wire much longer than a catalog burst.
    # Its eventual release must not revive a minute-old button press.
    proxy._burst.start("exchange:test")
    frame = FrameContext(
        proxy=proxy, opcode=OP_ACK_READY, direction="H→A",
        payload=b"\x00", raw=b"", name="ACK_READY",
    )
    handler = AckReadyHandler()
    handler.handle(frame)
    assert proxy._pending_redundant_off_check
    clock.now += 60
    if idle_tick:
        proxy._handle_idle(clock.now)
    assert proxy._burst.finish(
        "exchange:test", can_issue=proxy.can_issue_commands, sender=proxy._send_cmd_frame
    )
    _reply(proxy, [(101, "TV", False)])
    loop.run_until_complete(_drain())
    catalog.hub_actions.assert_not_awaited()
    assert not proxy._pending_redundant_off_check

    handler.handle(frame)
    _reply(proxy, [(101, "TV", False)])
    loop.run_until_complete(_drain())
    catalog.hub_actions.assert_awaited_once_with("redundant_off")


@pytest.mark.parametrize("version", [HUB_VERSION_X1, HUB_VERSION_X1S, HUB_VERSION_X2])
@pytest.mark.parametrize("older_result", ["silence", "partial", "complete"])
@pytest.mark.parametrize("extra_queued_read", [False, True])
def test_fresh_off_confirmation_waits_for_its_own_queued_read(
    catalog, version, older_result, extra_queued_read
):
    proxy, loop = catalog.proxy, catalog.loop
    proxy.hub_version = version
    assert proxy.request_activities()
    _reply(proxy, [(101, "TV", False)])
    loop.run_until_complete(_drain())
    catalog.hub_actions.reset_mock()

    # The ordinary read A, and optionally C, precede this actual Off press.
    assert proxy.request_activities()
    if extra_queued_read:
        assert proxy.request_activities()
    AckReadyHandler().handle(FrameContext(
        proxy=proxy, opcode=OP_ACK_READY, direction="H→A",
        payload=b"\x00", raw=b"", name="ACK_READY",
    ))

    for _ in range(2 if extra_queued_read else 1):
        if older_result == "complete":
            _reply(proxy, [(101, "TV", False)])
        else:
            _expire(proxy, partial=older_result == "partial")
        loop.run_until_complete(_drain())
        catalog.hub_actions.assert_not_awaited()
    assert proxy._pending_redundant_off_check

    # Only the ACK-triggered confirmation B may consume the fresh intent.
    _reply(proxy, [(101, "TV", False)])
    loop.run_until_complete(_drain())
    catalog.hub_actions.assert_awaited_once_with("redundant_off")
    assert not proxy._pending_redundant_off_check


def test_newer_off_press_is_not_bound_to_an_older_queued_confirmation(catalog):
    proxy, loop = catalog.proxy, catalog.loop
    assert proxy.request_activities()
    _reply(proxy, [(101, "TV", False)])
    loop.run_until_complete(_drain())
    catalog.hub_actions.reset_mock()
    assert proxy.request_activities()
    handler = AckReadyHandler()
    frame = FrameContext(
        proxy=proxy, opcode=OP_ACK_READY, direction="H→A",
        payload=b"\x00", raw=b"", name="ACK_READY",
    )
    handler.handle(frame)
    handler.handle(frame)
    # Ordinary read A and the superseded press's B must leave the latest
    # pending press alone. Its own confirmation C consumes it once.
    for _ in range(2):
        _reply(proxy, [(101, "TV", False)])
        loop.run_until_complete(_drain())
        catalog.hub_actions.assert_not_awaited()
    _reply(proxy, [(101, "TV", False)])
    loop.run_until_complete(_drain())
    catalog.hub_actions.assert_awaited_once_with("redundant_off")


def test_unrelated_read_cannot_replace_an_off_confirmations_x2_retry(catalog):
    proxy, loop = catalog.proxy, catalog.loop
    proxy.hub_version = HUB_VERSION_X2
    assert proxy.request_activities()
    _reply(proxy, [(101, "TV", False)])
    loop.run_until_complete(_drain())
    catalog.hub_actions.reset_mock()
    AckReadyHandler().handle(FrameContext(
        proxy=proxy, opcode=OP_ACK_READY, direction="H→A",
        payload=b"\x00", raw=b"", name="ACK_READY",
    ))
    _expire(proxy)
    assert proxy._activity_retry_due_at is not None
    # This normal poll cancels the scheduled retry in _begin_activity_request.
    assert proxy.request_activities()
    assert proxy._activity_retry_due_at is None
    _reply(proxy, [(101, "TV", False)])
    loop.run_until_complete(_drain())
    catalog.hub_actions.assert_not_awaited()
    assert not proxy._pending_redundant_off_check
