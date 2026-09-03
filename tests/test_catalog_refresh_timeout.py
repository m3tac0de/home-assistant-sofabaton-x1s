"""An unanswered catalog read must never look like a powered-off hub.

Regression coverage for issue #279 / PR #280: the explicit catalog refresh
used to clear the cached catalog (and the active-activity hint) before the
request went out, so a burst that ended on the scheduler timeout published
a phantom ``activity -> Off`` transition, and the next good read replayed
the same activity as a fresh start. The cached catalog now stays in place
until a complete burst replaces it, only a committed burst evaluates the
active state, and a timed-out refresh surfaces as ``TimeoutError``.
"""

from __future__ import annotations

import asyncio
import importlib
from types import SimpleNamespace

import pytest

from custom_components.sofabaton_x1s.const import HUB_VERSION_X2
from custom_components.sofabaton_x1s.hub import SofabatonHub
from custom_components.sofabaton_x1s.lib.x1_proxy import X1Proxy

integration = importlib.import_module("custom_components.sofabaton_x1s.__init__")


# ---------------------------------------------------------------------------
# Proxy: active-state evaluation is gated on a committed burst
# ---------------------------------------------------------------------------


def _proxy(**kwargs) -> X1Proxy:
    return X1Proxy(
        "127.0.0.1",
        proxy_udp_port=0,
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        **kwargs,
    )


def _seed_running_activity(proxy: X1Proxy) -> None:
    proxy.state.activities = {
        0x65: {"name": "Watch TV", "active": True, "needs_confirm": False},
        0x66: {"name": "Play Xbox", "active": False, "needs_confirm": False},
    }
    proxy.state.set_hint(0x65)
    proxy.state.update_activity_state()
    proxy._activities_catalog_ready = True
    assert proxy.state.current_activity == 0x65


def test_timed_out_activities_burst_publishes_nothing() -> None:
    proxy = _proxy()
    _seed_running_activity(proxy)
    changes: list[tuple] = []
    proxy.on_activity_change(lambda new_id, old_id, name: changes.append((new_id, old_id)))

    # Request goes out, the hub never answers, the scheduler ends the burst.
    proxy._begin_activity_request()
    proxy._on_activities_burst_end("activities")
    proxy.handle_active_state("activities")

    assert proxy.last_activities_burst_committed is False
    assert changes == []
    assert proxy.state.current_activity == 0x65
    assert proxy.state.activities[0x65]["name"] == "Watch TV"
    assert proxy._activities_catalog_ready is True


def test_partial_activities_burst_publishes_nothing() -> None:
    proxy = _proxy()
    _seed_running_activity(proxy)
    changes: list[tuple] = []
    proxy.on_activity_change(lambda new_id, old_id, name: changes.append((new_id, old_id)))

    proxy._begin_activity_request()
    assert proxy.ingest_activity_row(
        row_idx=1,
        expected_rows=2,
        act_id=0x66,
        activity={"id": 0x66, "name": "Play Xbox", "active": False, "needs_confirm": False},
    )
    # Row 2 (the running one) never arrives.
    proxy._on_activities_burst_end("activities")
    proxy.handle_active_state("activities")

    assert changes == []
    assert proxy.state.current_activity == 0x65


def test_complete_burst_with_nothing_active_still_publishes_off() -> None:
    proxy = _proxy()
    _seed_running_activity(proxy)
    changes: list[tuple] = []
    proxy.on_activity_change(lambda new_id, old_id, name: changes.append((new_id, old_id)))

    proxy._begin_activity_request()
    for idx, (act_id, name) in enumerate(((0x65, "Watch TV"), (0x66, "Play Xbox")), start=1):
        assert proxy.ingest_activity_row(
            row_idx=idx,
            expected_rows=2,
            act_id=act_id,
            activity={"id": act_id, "name": name, "active": False, "needs_confirm": False},
        )
    proxy._on_activities_burst_end("activities")
    proxy.handle_active_state("activities")

    assert proxy.last_activities_burst_committed is True
    assert changes == [(None, 0x65)]
    assert proxy.state.current_activity is None


def test_complete_empty_catalog_still_publishes_off() -> None:
    # A truly empty hub answers STATUS_ACK 0x07, which sets expected=0:
    # that is a complete read and must still report Off.
    proxy = _proxy()
    _seed_running_activity(proxy)
    changes: list[tuple] = []
    proxy.on_activity_change(lambda new_id, old_id, name: changes.append((new_id, old_id)))

    proxy._begin_activity_request()
    proxy._activity_pending_expected_rows = 0
    proxy._on_activities_burst_end("activities")
    proxy.handle_active_state("activities")

    assert proxy.last_activities_burst_committed is True
    assert changes == [(None, 0x65)]
    assert proxy.state.activities == {}


def test_next_complete_burst_after_timeout_publishes_normally() -> None:
    proxy = _proxy()
    _seed_running_activity(proxy)
    changes: list[tuple] = []
    proxy.on_activity_change(lambda new_id, old_id, name: changes.append((new_id, old_id)))

    proxy._begin_activity_request()
    proxy._on_activities_burst_end("activities")
    proxy.handle_active_state("activities")
    assert changes == []

    proxy._begin_activity_request()
    assert proxy.ingest_activity_row(
        row_idx=1,
        expected_rows=1,
        act_id=0x66,
        activity={"id": 0x66, "name": "Play Xbox", "active": True, "needs_confirm": False},
    )
    proxy._on_activities_burst_end("activities")
    proxy.handle_active_state("activities")

    assert changes == [(0x66, 0x65)]


def test_timed_out_burst_drops_pending_redundant_off_check_without_retry() -> None:
    # X1/X1S: no incomplete-snapshot retry, so nothing can confirm the
    # press; the check must not linger and fire on a later burst.
    proxy = _proxy()
    proxy._activities_catalog_ready = True
    fired: list[str] = []
    proxy.on_redundant_off_press(lambda: fired.append("off"))

    proxy.flag_pending_redundant_off_check()
    proxy._begin_activity_request()
    proxy._on_activities_burst_end("activities")
    proxy.handle_active_state("activities")
    assert fired == []
    assert proxy._pending_redundant_off_check is False

    # A later, unrelated complete read finds the hub still off: no
    # phantom redundant-OFF from the stale arming.
    proxy._begin_activity_request()
    proxy._activity_pending_expected_rows = 0
    proxy._on_activities_burst_end("activities")
    proxy.handle_active_state("activities")
    assert fired == []


def test_timed_out_burst_keeps_pending_redundant_off_check_for_x2_retry() -> None:
    proxy = _proxy(hub_version=HUB_VERSION_X2)
    proxy._activities_catalog_ready = True
    fired: list[str] = []
    proxy.on_redundant_off_press(lambda: fired.append("off"))

    proxy.flag_pending_redundant_off_check()
    proxy._begin_activity_request()
    proxy._on_activities_burst_end("activities")
    proxy.handle_active_state("activities")
    assert fired == []
    assert proxy._activity_retry_due_at is not None
    assert proxy._pending_redundant_off_check is True

    # The retry lands complete and confirms nothing changed: the press
    # was a genuine redundant OFF.
    proxy._begin_activity_request(is_retry=True)
    proxy._activity_pending_expected_rows = 0
    proxy._on_activities_burst_end("activities")
    proxy.handle_active_state("activities")
    assert fired == ["off"]


def test_timed_out_devices_burst_is_reported_uncommitted() -> None:
    proxy = _proxy()
    proxy.state.devices = {0x0B: {"name": "TV"}}
    proxy._devices_catalog_ready = True

    proxy._begin_device_request()
    proxy._on_devices_burst_end("devices")

    assert proxy.last_devices_burst_committed is False
    assert proxy.state.devices == {0x0B: {"name": "TV"}}
    assert proxy._devices_catalog_ready is True


# ---------------------------------------------------------------------------
# Hub: no clear-before-read, uncommitted bursts do not advance generations
# ---------------------------------------------------------------------------


class _FakeHass:
    def __init__(self, loop: asyncio.AbstractEventLoop) -> None:
        self.loop = loop
        self.data: dict = {}
        self._entries: dict = {}
        self.config_entries = SimpleNamespace(
            async_get_entry=lambda entry_id: self._entries.get(entry_id),
            async_update_entry=lambda *a, **kw: None,
        )

    async def async_add_executor_job(self, func, *args, **kwargs):
        return func(*args, **kwargs)

    def async_create_task(self, coro):
        return self.loop.create_task(coro)


@pytest.fixture
def hub():
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hub = SofabatonHub(
        _FakeHass(loop),
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
    try:
        yield hub
    finally:
        loop.close()


def _silence_dispatcher(monkeypatch) -> None:
    monkeypatch.setattr("custom_components.sofabaton_x1s.hub.async_dispatcher_send", lambda *_: None)


def test_uncommitted_activities_burst_keeps_catalog_and_generation(hub, monkeypatch):
    _silence_dispatcher(monkeypatch)
    hub.activities = {101: {"name": "Watch TV", "active": True, "needs_confirm": False}}
    hub.current_activity = 101
    hub.activities_ready = True
    generation = hub._activities_generation

    # The proxy still reports the last good catalog as ready, but the
    # burst that just ended committed nothing.
    monkeypatch.setattr(
        hub._proxy,
        "get_activities",
        lambda **_kw: ({101: {"name": "Watch TV", "active": True, "needs_confirm": False}}, True),
    )
    hub._proxy._last_activities_burst_committed = False

    hub._on_activities_burst("activities")
    hub.hass.loop.run_until_complete(asyncio.sleep(0))

    assert hub._activities_generation == generation
    assert hub.current_activity == 101
    assert hub.activities_ready is True


def test_committed_activities_burst_advances_generation(hub, monkeypatch):
    _silence_dispatcher(monkeypatch)
    generation = hub._activities_generation
    monkeypatch.setattr(
        hub._proxy,
        "get_activities",
        lambda **_kw: ({101: {"name": "Watch TV", "active": False, "needs_confirm": False}}, True),
    )
    hub._proxy._last_activities_burst_committed = True

    hub._on_activities_burst("activities")
    hub.hass.loop.run_until_complete(asyncio.sleep(0))

    assert hub._activities_generation == generation + 1


def test_uncommitted_devices_burst_keeps_catalog_and_generation(hub, monkeypatch):
    _silence_dispatcher(monkeypatch)
    hub.devices = {0x0B: {"name": "TV"}}
    generation = hub._devices_generation
    monkeypatch.setattr(hub._proxy, "get_devices", lambda: ({0x0B: {"name": "TV"}}, True))
    hub._proxy._last_devices_burst_committed = False

    hub._on_devices_burst("devices")
    hub.hass.loop.run_until_complete(asyncio.sleep(0))

    assert hub._devices_generation == generation
    assert hub.devices == {0x0B: {"name": "TV"}}


def test_request_catalog_activities_times_out_without_clearing(hub, monkeypatch):
    _silence_dispatcher(monkeypatch)
    hub._proxy.state.activities = {101: {"name": "Watch TV", "active": True, "needs_confirm": False}}
    hub._proxy.state.set_hint(101)
    hub._proxy._activities_catalog_ready = True
    monkeypatch.setattr(hub._proxy, "request_activities", lambda *a, **kw: None)

    def _clear_must_not_run():
        raise AssertionError("clear_activities_catalog must not run before the read")

    monkeypatch.setattr(hub._proxy, "clear_activities_catalog", _clear_must_not_run)
    pruned: list = []
    monkeypatch.setattr(
        hub._proxy, "clear_cached_entity_detail", lambda ent_id, *, kind: pruned.append((ent_id, kind))
    )

    with pytest.raises(TimeoutError):
        hub.hass.loop.run_until_complete(
            hub.async_request_catalog("activities", timeout_seconds=0.05)
        )

    assert hub._proxy.state.activities[101]["name"] == "Watch TV"
    assert hub._proxy.state.current_activity_hint == 101
    assert hub._proxy._activities_catalog_ready is True
    assert pruned == []


def test_request_catalog_devices_times_out_without_clearing(hub, monkeypatch):
    _silence_dispatcher(monkeypatch)
    hub._proxy.state.devices = {0x0B: {"name": "TV"}}
    hub._proxy._devices_catalog_ready = True
    monkeypatch.setattr(hub._proxy, "request_devices", lambda *a, **kw: None)

    def _clear_must_not_run():
        raise AssertionError("clear_devices_catalog must not run before the read")

    monkeypatch.setattr(hub._proxy, "clear_devices_catalog", _clear_must_not_run)
    pruned: list = []
    monkeypatch.setattr(
        hub._proxy, "clear_cached_entity_detail", lambda ent_id, *, kind: pruned.append((ent_id, kind))
    )

    with pytest.raises(TimeoutError):
        hub.hass.loop.run_until_complete(
            hub.async_request_catalog("devices", timeout_seconds=0.05)
        )

    assert hub._proxy.state.devices == {0x0B: {"name": "TV"}}
    assert hub._proxy._devices_catalog_ready is True
    assert pruned == []


def test_request_catalog_devices_prunes_removed_ids_on_success(hub, monkeypatch):
    _silence_dispatcher(monkeypatch)
    hub._proxy.state.devices = {0x0B: {"name": "TV"}, 0x0C: {"name": "Gone"}}
    hub._proxy._devices_catalog_ready = True

    def _request_devices(*_a, **_kw):
        # Simulate the committed burst: wholesale replace + generation bump.
        hub._proxy.state.devices = {0x0B: {"name": "TV"}}
        hub._devices_generation += 1

    monkeypatch.setattr(hub._proxy, "request_devices", _request_devices)
    pruned: list = []
    monkeypatch.setattr(
        hub._proxy, "clear_cached_entity_detail", lambda ent_id, *, kind: pruned.append((ent_id, kind))
    )

    hub.hass.loop.run_until_complete(hub.async_request_catalog("devices", timeout_seconds=1.0))

    assert pruned == [(0x0C, "device")]


def test_device_power_state_returns_none_on_timeout(hub, monkeypatch):
    monkeypatch.setattr(hub._proxy, "request_devices", lambda *a, **kw: None)
    monkeypatch.setattr(
        SofabatonHub, "_async_refresh_devices_snapshot", _timeout_snapshot
    )

    assert hub.hass.loop.run_until_complete(hub.async_get_device_power_state(0x0B)) is None


async def _timeout_snapshot(self, timeout_seconds: float = 15.0):
    raise TimeoutError("no burst")


# ---------------------------------------------------------------------------
# WS: the card is told the refresh failed
# ---------------------------------------------------------------------------


class _Conn:
    def __init__(self):
        self.result = None
        self.error = None

    def send_result(self, msg_id, payload=None):
        self.result = (msg_id, payload)

    def send_error(self, msg_id, code, message):
        self.error = (msg_id, code, message)


def test_ws_refresh_catalog_reports_timeout(monkeypatch):
    class _Hub:
        entry_id = "entry-1"

        async def async_request_catalog(self, kind):
            raise TimeoutError("Timed out waiting for a complete Activity list from the hub")

    async def fake_resolve(_hass, _data):
        return _Hub()

    persisted: list = []

    async def fake_store(_hass):
        raise AssertionError("no cache persist after a failed refresh")

    monkeypatch.setattr(integration, "_async_resolve_hub_from_data", fake_resolve)
    monkeypatch.setattr(integration, "_async_get_persistent_cache_store", fake_store)
    monkeypatch.setattr(integration, "_raise_if_hub_operation_locked", lambda *a, **k: None)

    conn = _Conn()
    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(
            integration._ws_refresh_catalog(
                SimpleNamespace(data={}), conn, {"id": 3, "entry_id": "entry-1", "kind": "activities"}
            )
        )
    finally:
        loop.close()

    assert conn.result is None
    assert conn.error[0] == 3
    assert conn.error[1] == "timeout"
    assert "Activity list" in conn.error[2]
    assert persisted == []
