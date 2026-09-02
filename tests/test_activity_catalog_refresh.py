"""Activity refreshes must never turn missing replies into power events.

Exercise the real request, snapshot and burst listeners through the HA hub.
Only the transport and HA side effects are replaced; no hub is contacted.
"""

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from custom_components.sofabaton_x1s import hub as hub_module
from custom_components.sofabaton_x1s.const import HUB_VERSION_X2
from custom_components.sofabaton_x1s.hub import SofabatonHub
from custom_components.sofabaton_x1s.lib.frame_handlers import FrameContext
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


def test_incomplete_burst_does_not_confirm_pending_redundant_off(catalog):
    hub, proxy = catalog.hub, catalog.proxy
    assert proxy.request_activities()
    _reply(proxy, [(101, "TV", False)])
    catalog.loop.run_until_complete(_drain())
    catalog.hub_actions.reset_mock()
    catalog.activity_actions.reset_mock()
    catalog.changes.clear()
    generation = hub._activities_generation
    proxy.flag_pending_redundant_off_check()
    proxy._ack_ready_refresh_pending = True

    assert proxy.request_activities()
    _expire(proxy)
    catalog.loop.run_until_complete(_drain())
    assert proxy._pending_redundant_off_check
    assert not proxy._ack_ready_refresh_pending
    assert hub._activities_generation == generation
    catalog.hub_actions.assert_not_awaited()

    assert proxy.request_activities()
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
