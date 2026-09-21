"""Facade behaviour against the REAL engine (X1Proxy), no sockets.

The fake engine in test_aio.py models the lazy-fetch pattern but is
kinder than the real one in three ways a review caught on 2026-09-09:
the real catalog getters enqueue a request even with ``force_refresh``
off, strip the stored record body through the export view, and end a
burst on the idle timeout without anything having landed. These tests
drive ``AsyncXProxy`` over an unstarted ``X1Proxy`` whose transport
flags are poked directly, so the facade is judged against what the
engine really does.
"""

from __future__ import annotations

import asyncio
import importlib
import importlib.util
import sys
import threading
import time
import types
from pathlib import Path

import pytest

LIB_DIR = (
    Path(__file__).resolve().parents[2]
    / "custom_components"
    / "sofabaton_x1s"
    / "lib"
)


def _load_lib() -> types.ModuleType:
    name = "sofabaton_real_engine_test_pkg"
    if name in sys.modules:
        return sys.modules[name]
    spec = importlib.util.spec_from_file_location(
        name, LIB_DIR / "__init__.py", submodule_search_locations=[str(LIB_DIR)]
    )
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


_pkg = _load_lib()
aio = importlib.import_module(f"{_pkg.__name__}.aio")
errors = importlib.import_module(f"{_pkg.__name__}.errors")
devices_mod = importlib.import_module(f"{_pkg.__name__}.devices")
x1_proxy_mod = importlib.import_module(f"{_pkg.__name__}.x1_proxy")


class _Sock:
    """Stands in for a connected hub socket: the transport only tests truthiness."""


def _engine(hub_version: str = "X1S") -> "x1_proxy_mod.X1Proxy":
    # Never started: no threads, no sockets, no mDNS. Outbound frames land
    # in the transport's local buffer and go nowhere.
    return x1_proxy_mod.X1Proxy("127.0.0.1", hub_version=hub_version, proxy_enabled=False)


def _hub_link(proxy, connected: bool) -> None:
    """Flip the hub side of the transport and fire the engine's listeners."""

    with proxy.transport._hub_lock:
        proxy.transport._hub_sock = _Sock() if connected else None
    proxy._notify_hub_state(connected)


def _end_burst_idle(proxy) -> None:
    """End the active burst the way the engine does on its idle timeout."""

    proxy._burst.tick(
        time.monotonic() + 3600.0,
        can_issue=proxy.can_issue_commands,
        sender=proxy._send_cmd_frame,
    )


def _pending_local_bytes(proxy) -> int:
    return len(proxy.transport._local_to_hub)


# ---------------------------------------------------------------------------
# (5) status() is a pure state read
# ---------------------------------------------------------------------------


def test_status_on_cold_controllable_engine_sends_nothing() -> None:
    async def main():
        engine = _engine()
        proxy = aio.AsyncXProxy.wrap(engine)
        _hub_link(engine, True)
        assert engine.can_issue_commands()
        before = _pending_local_bytes(engine)

        st = await proxy.status()

        assert st.mode == "control" and st.activities_cached == 0 and st.devices_cached == 0
        assert _pending_local_bytes(engine) == before, "status() enqueued a hub request"
        assert not engine._burst.active

    asyncio.run(main())


# ---------------------------------------------------------------------------
# (1) a burst that ends on idle is not a reply
# ---------------------------------------------------------------------------


def test_read_raises_when_burst_ends_without_a_reply() -> None:
    async def main():
        engine = _engine()
        proxy = aio.AsyncXProxy.wrap(engine)
        _hub_link(engine, True)

        read = asyncio.ensure_future(proxy.devices(timeout=2.0))
        await asyncio.sleep(0.05)
        assert engine._burst.active and engine._burst.kind == "devices"

        _end_burst_idle(engine)          # nothing landed
        with pytest.raises(errors.FetchTimeoutError):
            await read

    asyncio.run(main())


def test_initial_sync_does_not_report_ready_without_data() -> None:
    async def main():
        engine = _engine()
        proxy = aio.AsyncXProxy.wrap(engine, initial_sync=True)
        _hub_link(engine, True)
        await asyncio.sleep(0.05)
        # The banner read is a real hub exchange; with no frames it has to
        # give up before the catalogs are even requested. Wait for that.
        await asyncio.sleep(0.05)
        for _ in range(50):
            if engine._burst.active:
                _end_burst_idle(engine)
            await asyncio.sleep(0.05)
            task = proxy._initial_sync_task
            if task is not None and task.done():
                break

        assert not await proxy.wait_until_ready(timeout=0.2)
        assert not (await proxy.status()).catalog_ready
        assert not engine.get_banner_info()

    asyncio.run(main())


# ---------------------------------------------------------------------------
# (2) cancellation releases the in-flight key
# ---------------------------------------------------------------------------


def test_cancelled_fetch_releases_inflight_key() -> None:
    async def main():
        engine = _engine()
        proxy = aio.AsyncXProxy.wrap(engine)
        _hub_link(engine, True)

        first = asyncio.ensure_future(proxy.devices(timeout=5.0))
        await asyncio.sleep(0)               # cancel while the request is being issued
        first.cancel()
        with pytest.raises(asyncio.CancelledError):
            await first
        assert "devices" not in proxy._inflight
        assert not proxy._burst_waiters.get("devices")

        # The next read must issue its own request rather than join a
        # fetch nobody owns.
        _end_burst_idle(engine)              # clear whatever the first one started
        second = asyncio.ensure_future(proxy.devices(timeout=1.0))
        await asyncio.sleep(0.05)
        assert "devices" in proxy._inflight
        assert engine._burst.active and engine._burst.kind == "devices"
        _end_burst_idle(engine)
        with pytest.raises(errors.FetchTimeoutError):
            await second

    asyncio.run(main())


# ---------------------------------------------------------------------------
# (3) power state survives the export view
# ---------------------------------------------------------------------------


def test_devices_project_power_state_from_engine_state_rows() -> None:
    async def main():
        engine = _engine("X1S")
        proxy = aio.AsyncXProxy.wrap(engine)
        cfg = devices_mod.DeviceConfig(name="TV", brand="Sony", power_state=1)
        body = devices_mod.build_device_create_payload(cfg, hub_version="X1S")[3:]
        # Commit a catalog the way the engine does after a devices burst.
        engine.state.devices = {
            5: {"name": "TV", "brand": "Sony", "device_class": "ir", "raw_body": body}
        }
        engine._devices_catalog_ready = True

        # Sanity: the getter's export view strips the body ...
        rows, ready = engine.get_devices(force_refresh=False)
        assert ready and "raw_body" not in rows[5]
        # ... and the facade still reports the power byte.
        devs = await proxy.devices()
        assert [(d.device_id, d.power_state) for d in devs] == [(5, 1)]

    asyncio.run(main())


# ---------------------------------------------------------------------------
# (4) a drop-and-reconnect that lands before the loop runs
# ---------------------------------------------------------------------------


def test_quick_reconnect_resets_readiness_and_resyncs() -> None:
    async def main():
        engine = _engine()
        proxy = aio.AsyncXProxy.wrap(engine, initial_sync=True)

        # Pretend an earlier session completed its sync.
        _hub_link(engine, True)
        await asyncio.sleep(0.02)
        if proxy._initial_sync_task is not None:
            proxy._initial_sync_task.cancel()
        proxy._set_catalog_ready(True)
        gen = proxy._session_gen

        # Disconnect + reconnect on the engine thread before the loop runs.
        _hub_link(engine, False)
        _hub_link(engine, True)
        await asyncio.sleep(0.05)

        assert proxy._session_gen == gen + 1
        assert not (await proxy.status()).catalog_ready
        # A new sync was started for the new session.
        assert proxy._initial_sync_task is not None and not proxy._initial_sync_task.done()
        proxy._initial_sync_task.cancel()

    asyncio.run(main())


def test_stale_session_sync_cannot_mark_new_session_ready() -> None:
    async def main():
        engine = _engine()
        proxy = aio.AsyncXProxy.wrap(engine, initial_sync=True)
        _hub_link(engine, True)
        stale_gen = proxy._session_gen
        proxy._session_gen += 1               # a disconnect happened meanwhile

        async def fake_sync():
            await proxy._run_initial_sync(stale_gen)

        # Monkeypatch the three steps to succeed instantly.
        engine.fetch_banner_info = lambda **kw: ({"model": "X1S"}, True)
        proxy._await_fetch = lambda *a, **kw: asyncio.sleep(0)
        await fake_sync()
        assert not proxy._catalog_ready

    asyncio.run(main())


# ---------------------------------------------------------------------------
# engine-thread callbacks must never re-enter the transport (live finding)
# ---------------------------------------------------------------------------


def test_event_listeners_do_not_deadlock_under_transport_lock() -> None:
    """bench_190 on the X1S hung at shutdown: transport.stop() notifies hub
    state while holding its socket lock, and the facade's listener read
    can_issue_commands() on that same thread, which takes the lock."""

    import threading

    async def main():
        engine = _engine()
        proxy = aio.AsyncXProxy.wrap(engine, initial_sync=True)
        agen = proxy.events()                       # arms the event listeners
        pending = asyncio.ensure_future(agen.__anext__())
        await asyncio.sleep(0.01)

        done = threading.Event()

        def engine_thread():
            # Exactly what TransportBridge.stop() does.
            with engine.transport._hub_lock:
                engine._notify_hub_state(False)
            done.set()

        t = threading.Thread(target=engine_thread, daemon=True)
        t.start()
        for _ in range(100):
            if done.is_set():
                break
            await asyncio.sleep(0.02)
        assert done.is_set(), "hub-state listener deadlocked under the transport lock"

        first = await asyncio.wait_for(pending, 1.0)
        assert first.kind == "hub_state" and first.payload.connected is False
        pending.cancel()
        await agen.aclose()

    asyncio.run(main())


# ---------------------------------------------------------------------------
# review 2026-09-09: a sync cancelled by a quick reconnect must run again
# ---------------------------------------------------------------------------


def test_reconnect_during_active_sync_restarts_the_sync() -> None:
    # The first session's sync is mid-fetch (its task alive) when the hub
    # drops and returns before the loop turns. The reconnect used to see
    # the old task still pending and skip starting a new one; the old
    # task then died of the cancellation and nothing ever synced.
    async def main():
        engine = _engine()
        proxy = aio.AsyncXProxy.wrap(engine, initial_sync=True)
        _hub_link(engine, True)
        await asyncio.sleep(0.05)
        first = proxy._initial_sync_task
        assert first is not None and not first.done()
        banner_requests = _pending_local_bytes(engine)
        gen = proxy._session_gen

        _hub_link(engine, False)
        _hub_link(engine, True)
        await asyncio.sleep(0.05)

        assert proxy._session_gen == gen + 1
        assert first.cancelled()
        second = proxy._initial_sync_task
        assert second is not None and second is not first and not second.done()
        # The new session asked the hub for its banner again.
        assert _pending_local_bytes(engine) > banner_requests
        second.cancel()

    asyncio.run(main())


def test_sync_that_ends_without_readiness_is_retried_later(monkeypatch) -> None:
    # The banner request never lands (the engine's own wait times out).
    # The sync ends without readiness; the hub is still connected, so
    # nothing else would ever start a new one. The done-callback does,
    # after a pause.
    async def main():
        monkeypatch.setattr(aio, "INITIAL_SYNC_RETRY_S", 0.08)
        engine = _engine()
        proxy = aio.AsyncXProxy.wrap(engine, initial_sync=True)
        banner_attempts = 0

        def no_banner(**kw):
            nonlocal banner_attempts
            banner_attempts += 1
            return ({}, False)

        engine.fetch_banner_info = no_banner
        _hub_link(engine, True)
        await asyncio.sleep(0.02)
        first = proxy._initial_sync_task
        assert first is not None and first.done() and not first.cancelled()
        assert banner_attempts == 1 and not proxy._catalog_ready

        await asyncio.sleep(0.1)                 # past one retry pause, short of two
        second = proxy._initial_sync_task
        assert second is not None and second is not first
        assert banner_attempts == 2 and not proxy._catalog_ready
        # Once the session ends, the pending retry finds no link and does nothing.
        _hub_link(engine, False)
        await asyncio.sleep(0.2)
        assert banner_attempts == 2

    asyncio.run(main())


def test_refused_refresh_keeps_the_committed_catalog_on_the_real_engine() -> None:
    async def main():
        engine = _engine("X1S")
        proxy = aio.AsyncXProxy.wrap(engine)
        engine.state.devices = {5: {"name": "TV", "brand": "Sony", "device_class": "ir", "raw_body": b""}}
        engine._devices_catalog_ready = True
        _hub_link(engine, True)
        assert [d.name for d in await proxy.devices()] == ["TV"]

        with engine.transport._app_lock:
            engine.transport._app_sock = _Sock()         # the app takes the hub
        with pytest.raises(errors.HubBusyError):
            await proxy.devices(refresh=True)
        assert [d.name for d in await proxy.devices()] == ["TV"]
        assert not engine._burst.active

    asyncio.run(main())


# ---------------------------------------------------------------------------
# snapshot / state document on the real engine (phase 3 plan, W0)
# ---------------------------------------------------------------------------


def _seed_catalog(proxy) -> None:
    """A device and an activity in the catalog, as the initial sync leaves them."""

    proxy.state.devices[5] = {"name": "TV", "brand": "Acme", "device_class": "tv"}
    proxy.state.activities[101] = {"name": "Watch TV"}
    proxy._devices_catalog_ready = True
    proxy._activities_catalog_ready = True


def test_snapshot_on_cold_engine_sends_nothing_and_is_incomplete() -> None:
    async def main():
        engine = _engine()
        _hub_link(engine, True)
        proxy = aio.AsyncXProxy.wrap(engine)
        snap = await proxy.snapshot()
        assert _pending_local_bytes(engine) == 0
        assert snap.devices == [] and snap.activities == []
        # No catalog has been read: the empty projection is not "complete".
        assert snap.complete is False
        assert snap.bundle["payload_profile"] == "structural"

        _seed_catalog(engine)
        snap = await proxy.snapshot()
        assert _pending_local_bytes(engine) == 0
        assert [e.entity_id for e in snap.devices] == [5]
        assert [e.entity_id for e in snap.activities] == [101]
        tv = snap.entity("device", 5)
        assert tv.name == "TV" and not tv.complete and not tv.editable
        assert snap.bundle["devices"][0]["editable"] is False
        assert "stale_risk" not in snap.bundle["devices"][0]

    asyncio.run(main())


def test_state_document_round_trip_keeps_id_generation_and_stamps() -> None:
    async def main():
        engine = _engine()
        _seed_catalog(engine)
        # Pretend the activity was fetched.
        engine._note_detail_fetched("activity", 101)
        proxy = aio.AsyncXProxy.wrap(engine)
        origin = await proxy.snapshot()
        assert origin.entity("activity", 101).fetched_at
        assert origin.entity("device", 5).fetched_at is None  # never fetched
        doc = await proxy.export_state()
        assert "detail_stale_risk" not in doc["state"]
        assert doc["state"]["detail_fetched_at"]["activity"] == {"101": origin.entity("activity", 101).fetched_at}

        fresh = _engine()
        other = aio.AsyncXProxy.wrap(fresh)
        restored = await other.import_state(doc)
        assert restored.snapshot_id == origin.snapshot_id
        assert restored.entity("activity", 101).fetched_at == origin.entity("activity", 101).fetched_at
        assert restored.engine_generation > origin.engine_generation
        assert _pending_local_bytes(fresh) == 0

        # A document from before 2026-09-10 carries a stale-flag table: ignored.
        legacy = {**doc, "state": {**doc["state"], "detail_stale_risk": {"device": [], "activity": [101]}}}
        assert (await aio.AsyncXProxy.wrap(_engine()).import_state(legacy)).snapshot_id == origin.snapshot_id

        # A cache clear bumps the generation.
        before = fresh.state.generation
        fresh.clear_cached_entity_detail(101, kind="activity")
        assert fresh.state.generation > before

    asyncio.run(main())


def test_burst_end_bumps_generation() -> None:
    engine = _engine()
    before = engine.state.generation
    engine._burst.start("devices")
    _end_burst_idle(engine)
    assert engine.state.generation > before


def test_sync_refuses_unfetched_baseline_before_the_engine() -> None:
    async def main():
        engine = _engine()
        _hub_link(engine, True)
        _seed_catalog(engine)
        proxy = aio.AsyncXProxy.wrap(engine)
        snap = await proxy.snapshot()
        try:
            await proxy.sync_activity(baseline=snap.bundle, edited=snap.bundle, activity_id=101)
        except errors.SnapshotIncompleteError:
            pass
        else:
            raise AssertionError("an unfetched activity is not an editable baseline")
        assert _pending_local_bytes(engine) == 0

    asyncio.run(main())


def test_app_session_end_leaves_the_engine_cache_alone() -> None:
    # stale_risk removed 2026-09-10: an app session is not evidence the
    # cache is fresh or stale, so the engine records nothing about it.
    engine = _engine()
    _seed_catalog(engine)
    engine._note_detail_fetched("activity", 101)
    before = engine.state.generation
    engine._notify_client_state(True)
    engine._notify_client_state(False)
    assert engine.state.generation == before
    assert not hasattr(engine.state, "detail_stale_risk")

def test_app_session_end_reaches_facade_consumers_from_the_engine_thread() -> None:
    # An app session ending on the engine thread is delivered as app_state
    # only; the snapshot does not move (stale_risk removed 2026-09-10).
    async def main():
        engine = _engine()
        _seed_catalog(engine)
        engine._note_detail_fetched("activity", 101)
        _hub_link(engine, True)
        proxy = aio.AsyncXProxy.wrap(engine)
        before = await proxy.snapshot()

        async def session():
            await asyncio.sleep(0.01)
            def _engine_thread():
                engine._notify_client_state(True)
                engine._notify_client_state(False)
            t = threading.Thread(target=_engine_thread)
            t.start(); t.join()

        asyncio.ensure_future(session())
        agen = proxy.events()
        seen = []
        try:
            while not any(e.kind == "app_state" and e.payload.connected is False for e in seen):
                seen.append(await asyncio.wait_for(agen.__anext__(), 2))
            while True:
                try:
                    seen.append(await asyncio.wait_for(agen.__anext__(), 0.05))
                except asyncio.TimeoutError:
                    break
        finally:
            await agen.aclose()
        assert not any(e.kind == "snapshot_changed" for e in seen)
        after = await proxy.snapshot()
        assert after.snapshot_id == before.snapshot_id and after.engine_generation == before.engine_generation
        assert after.entity("activity", 101).fetched_at == before.entity("activity", 101).fetched_at
        assert _pending_local_bytes(engine) == 0

    asyncio.run(main())


# ---------------------------------------------------------------------------
# W2: intents fetch their own preconditions (phase 3 plan, P3.2)
# ---------------------------------------------------------------------------


def _ok_step(*args, **kwargs):
    ack = importlib.import_module(f"{_pkg.__name__}.ack")
    return ack.SendStepResult(outcome=ack.AckOutcome.acked, ack_opcode=0x0103, ack_payload=b"\x00")


def test_reorder_devices_reads_the_catalog_when_cold_and_refuses_without_it(monkeypatch) -> None:
    engine = _engine()
    _hub_link(engine, True)
    reads = []
    monkeypatch.setattr(engine, "_request_devices_and_wait", lambda **kw: reads.append(1) or False)
    sent = []
    monkeypatch.setattr(engine, "_send_step", lambda **kw: sent.append(kw) or _ok_step())
    assert engine.reorder_devices([5, 7]) is None
    assert reads == [1] and sent == []


def test_reorder_devices_never_writes_a_guessed_kind_byte(monkeypatch) -> None:
    engine = _engine()
    _hub_link(engine, True)
    engine._devices_catalog_ready = True
    engine.state.devices[5] = {"name": "TV", "raw_body": bytes([0, 0, 0, 0x21, 0])}
    engine.state.devices[7] = {"name": "Fresh"}          # created in place, no record yet
    sent = []
    monkeypatch.setattr(engine, "_send_step", lambda **kw: sent.append(kw) or _ok_step())

    def _catalog_read(**kw):
        engine.state.devices[7]["raw_body"] = bytes([0, 0, 0, 0x33, 0])
        return True

    monkeypatch.setattr(engine, "_request_devices_and_wait", _catalog_read)
    result = engine.reorder_devices([7, 5])
    assert result is not None
    sort = sent[0]["payload"]
    # Rows are (marker, id, position): the fetched record's kind byte, never 0x00.
    assert bytes([0x33, 7, 1, 0x21, 5, 2]) in sort


def test_reorder_activities_reads_the_catalog_when_cold(monkeypatch) -> None:
    engine = _engine()
    _hub_link(engine, True)
    reads = []

    def _catalog_read(**kw):
        reads.append(1)
        engine.state.activities[101] = {"name": "Watch TV"}
        engine._activities_catalog_ready = True
        return True

    monkeypatch.setattr(engine, "_request_activities_and_wait", _catalog_read)
    sent = []
    monkeypatch.setattr(engine, "_send_step", lambda **kw: sent.append(kw) or _ok_step())
    assert engine.reorder_activities([101]) is not None
    # One read before the write (the trailing refresh is the second), then sort + remote sync.
    assert reads and len(sent) == 2


def test_persist_ir_blob_reads_the_command_table_before_allocating(monkeypatch) -> None:
    engine = _engine()
    _hub_link(engine, True)
    fetched = []

    def _fetch(key, kick, ready, *, timeout):
        fetched.append(key)
        engine.state.commands[5] = {1: "Power", 2: "Mute"}   # the hub's table
        engine._commands_complete.add(5)
        return True

    monkeypatch.setattr(engine, "_fetch_and_wait", _fetch)
    written = {}

    def _write(**kw):
        written.update(kw)
        return {"status": "success", "page_count": 1, "command_id": kw["command_id"]}

    monkeypatch.setattr(engine, "_run_persist_write", _write)
    monkeypatch.setattr(engine, "_register_command_in_device_sort", lambda **kw: None)
    result = engine.persist_ir_blob(device_id=5, command_name="Input", blob=bytes(16))
    assert result is not None
    assert fetched == ["commands:5"]
    assert written["command_id"] == 3          # next free slot, not 1


def test_persist_refuses_when_the_command_table_cannot_be_read(monkeypatch) -> None:
    engine = _engine()
    _hub_link(engine, True)
    monkeypatch.setattr(engine, "_fetch_and_wait", lambda *a, **kw: False)
    written = []
    monkeypatch.setattr(engine, "_run_persist_write", lambda **kw: written.append(kw))
    assert engine.persist_ir_blob(device_id=5, command_name="Input", blob=bytes(16)) is None
    assert engine.persist_command_record(
        device_id=5, command_name="Pair", library_type=0x03, command_data=b"\x01"
    ) is None
    assert written == []


def test_persist_skips_the_read_when_the_table_is_complete(monkeypatch) -> None:
    engine = _engine()
    _hub_link(engine, True)
    engine.state.commands[5] = {1: "Power"}
    engine._commands_complete.add(5)
    monkeypatch.setattr(engine, "_fetch_and_wait", lambda *a, **kw: (_ for _ in ()).throw(AssertionError("no read expected")))
    written = {}
    monkeypatch.setattr(engine, "_run_persist_write", lambda **kw: written.update(kw) or {"status": "success", "page_count": 1})
    monkeypatch.setattr(engine, "_register_command_in_device_sort", lambda **kw: None)
    assert engine.persist_ir_blob(device_id=5, command_name="Input", blob=bytes(16)) is not None
    assert written["command_id"] == 2


def test_delete_device_scope_needs_no_prefetch() -> None:
    # Audit result recorded as a test: the scan only names activities whose
    # detail IS cached (unfetched detail cannot be stale), and the confirm
    # scope comes from the hub's own activities burst inside delete_device.
    engine = _engine()
    engine.state.activities[101] = {"name": "Watch TV"}
    engine.state.activities[102] = {"name": "Music"}
    engine.state.activity_members[101] = {5}
    assert engine.activities_referencing_device(5) == [101]


def test_state_document_keeps_the_favorites_order() -> None:
    # Found live (bench_210, X1): the quick-access slot order was not in
    # the state document, so the projected activity lost its
    # ``favorites_order`` after a restart and the snapshot id moved.
    async def main():
        engine = _engine()
        _seed_catalog(engine)
        engine.state.activity_favorite_slots[101] = [
            {"button_id": 1, "device_id": 5, "command_id": 2},
            {"button_id": 2, "device_id": 5, "command_id": 3},
        ]
        engine.state.activity_favorites_order[101] = [(2, 0), (1, 1)]
        engine._note_detail_fetched("activity", 101)
        proxy = aio.AsyncXProxy.wrap(engine)
        origin = await proxy.snapshot()
        assert _bundle_activity(origin, 101)["favorites_order"] == [2, 1]

        fresh = _engine()
        other = aio.AsyncXProxy.wrap(fresh)
        restored = await other.import_state(await proxy.export_state())
        assert _bundle_activity(restored, 101)["favorites_order"] == [2, 1]
        assert restored.snapshot_id == origin.snapshot_id

    asyncio.run(main())


def _bundle_activity(snap, activity_id):
    return next(a for a in snap.bundle["activities"] if a["device"]["device_id"] == activity_id)


def test_key_sort_timeout_on_a_network_device_records_an_empty_row() -> None:
    # Found live (bench_210, X1): the hub never answers the key-sort read
    # for a wifi_sonos device, which left the capture incomplete forever.
    export = importlib.import_module(f"{_pkg.__name__}.proxy_backup_export")
    empty = {"device_id": 4, "msg_hex": ""}
    assert export._key_sort_row_or_fallback(4, "wifi_sonos", None) == empty
    assert export._key_sort_row_or_fallback(4, "wifi_hue", None) == empty
    assert export._key_sort_row_or_fallback(1, "ir", None) is None          # a real gap
    assert export._key_sort_row_or_fallback(1, None, None) is None          # class unknown: no guess
    row = {"device_id": 1, "msg_hex": "01 ff"}
    assert export._key_sort_row_or_fallback(1, "wifi_sonos", row) is row    # a reply always wins


# ---------------------------------------------------------------------------
# restore: preflight before erase, and the engine's real result shape
# (review of 635ecfe, findings 1 and 2)
# ---------------------------------------------------------------------------


def _full_bundle(**extra) -> dict:
    export = importlib.import_module(f"{_pkg.__name__}.backup_export")
    return {
        "kind": "hub_bundle", "schema_version": export.HUB_BUNDLE_SCHEMA_VERSION,
        "payload_profile": "full_backup",
        "devices": [{"kind": "device_backup", "schema_version": export.DEVICE_BACKUP_SCHEMA_VERSION,
                     "device": {"device_id": 5, "name": "TV", "device_class": "ir"}, "commands": []}],
        "activities": [],
        **extra,
    }


def _activity(**extra) -> dict:
    export = importlib.import_module(f"{_pkg.__name__}.backup_export")
    return {
        "kind": "activity_backup", "schema_version": export.ACTIVITY_BACKUP_SCHEMA_VERSION,
        "device": {"entity_type": "activity", "device_id": 0x65, "name": "Watch TV"},
        "button_bindings": [], "favorite_slots": [],
        "macros": [{"button_id": 0xC6, "steps": [{"device_id": 5, "command_id": 1}]}],
        **extra,
    }


def test_restore_preflight_rejects_a_bad_bundle_before_any_write(monkeypatch) -> None:
    async def main():
        engine = _engine()
        _hub_link(engine, True)
        writes = []
        monkeypatch.setattr(engine, "erase_configuration", lambda **kw: writes.append("erase") or True)
        monkeypatch.setattr(engine, "restore_device", lambda payload, **kw: writes.append("restore_device") or {"status": "success", "device_id": 9})
        monkeypatch.setattr(engine, "resync_remote", lambda *a, **kw: True)
        proxy = aio.AsyncXProxy.wrap(engine)
        bad = [
            _full_bundle(schema_version=999),
            _full_bundle(payload_profile="structural"),
            {**_full_bundle(), "devices": [{"kind": "device_backup", "schema_version": 999, "device": {"device_id": 5}}]},
            {**_full_bundle(), "devices": [{"kind": "device_backup", "schema_version": 1, "device": {"device_id": 5, "device_class": "no_such_class"}}]},
            # Activities are checked too (review of ce9f205, P1): schema,
            # marker, and references outside the bundle.
            _full_bundle(activities=[_activity(schema_version=999)]),
            _full_bundle(activities=[_activity(device={"device_id": 0x65, "name": "A"})]),
            _full_bundle(activities=[_activity(macros=[{"button_id": 0xC6, "steps": [{"device_id": 0x20, "command_id": 1}]}])]),
            _full_bundle(activities=[_activity(macros=[{"button_id": 0xC6, "steps": [{"device_id": 0x70, "command_id": 1}]}])]),
        ]
        for bundle in bad:
            try:
                await proxy.restore(bundle, replace=True)
            except ValueError:
                pass
            else:
                raise AssertionError(f"must refuse {bundle}")
        assert writes == []                              # never erased, never restored
        assert _pending_local_bytes(engine) == 0

    asyncio.run(main())


def _record_rereads(monkeypatch) -> list:
    """Capture what a write asks to have read back, in place of the reads
    (the wire of these engines is stubbed; nothing would answer them)."""

    rereads: list = []

    async def record(self, device_ids, activity_ids, *, refresh_catalog=False, **kw):
        if list(device_ids) or list(activity_ids):
            rereads.append((tuple(device_ids), tuple(activity_ids), refresh_catalog))

    monkeypatch.setattr(aio.AsyncXProxy, "_reread_after_write", record)
    return rereads


def test_restore_adapts_the_engine_result_shape(monkeypatch) -> None:
    async def main():
        engine = _engine()
        _hub_link(engine, True)
        monkeypatch.setattr(engine, "restore_device", lambda payload, **kw: {"status": "success", "device_id": 9, "restored_commands": 0})
        monkeypatch.setattr(engine, "resync_remote", lambda *a, **kw: True)
        rereads = _record_rereads(monkeypatch)
        proxy = aio.AsyncXProxy.wrap(engine)
        result = await proxy.restore(_full_bundle())      # the REAL restore_hub_bundle
        assert result.ok and result.restored_devices == 1 and result.restored_activities == 0
        assert result.device_id_map == {5: 9} and result.restored["devices"][0]["device_id"] == 9
        assert result.to_dict()["restored_devices"] == 1
        assert rereads == [((9,), (), True)]             # what the rebuild made, lists included

        # A first-entity failure keeps the counts honest and is not a success.
        monkeypatch.setattr(engine, "restore_device", lambda payload, **kw: None)
        failed = await proxy.restore(_full_bundle())
        assert not failed.ok and failed.failed_at == ("device", 5) and failed.wrote_nothing
        assert len(rereads) == 1                         # nothing made, nothing to read back

    asyncio.run(main())


# ---------------------------------------------------------------------------
# managed wifi devices: deploy and in-place update (callbacks plan, C0b / C0c)
# ---------------------------------------------------------------------------

wifi_device_mod = importlib.import_module(f"{_pkg.__name__}.wifi_device")
_WifiDeviceSpec = wifi_device_mod.WifiDeviceSpec
_WifiSlotSpec = wifi_device_mod.WifiSlotSpec
_N = wifi_device_mod.WIFI_SLOT_COUNT
_TARGET = "192.168.1.10"


def _wifi_engine(monkeypatch, hub_version: str = "X1S", *, device_id: int = 12):
    """A controllable engine whose wifi-create wire is stubbed; the
    facade's own logic (spec normalization, the profile, the rebase, the
    action id) runs for real."""

    engine = _engine(hub_version)
    _hub_link(engine, True)
    creates: list[dict] = []

    def fake_create(**kw):
        creates.append(kw)
        return {"device_id": device_id, "status": "success"}

    monkeypatch.setattr(engine, "create_wifi_device", fake_create)
    monkeypatch.setattr(engine, "_stable_hub_action_id", lambda: "aabbccddeeff")
    engine.rereads = _record_rereads(monkeypatch)
    return engine, creates


def test_deploy_wifi_device_builds_the_profile_and_returns_the_deployment(monkeypatch) -> None:
    async def main():
        engine, creates = _wifi_engine(monkeypatch, "X1S")
        proxy = aio.AsyncXProxy.wrap(engine)
        spec = _WifiDeviceSpec(name=" Server ", slots=(_WifiSlotSpec("Play"),), power_on_slot=1, input_slots=(2,))

        dep = await proxy.deploy_wifi_device(spec, host=_TARGET, port=8480)

        assert dep.device_id == 12 and dep.hub_version == "X1S"
        assert (dep.target.host, dep.target.port, dep.target.action_id) == (_TARGET, 8480, "aabbccddeeff")
        assert dep.spec == spec.normalized()
        assert len(dep.labels) == 2 * _N and dep.labels[1] == "Play" and dep.labels[1 + _N] == "Play Long"
        assert dep.labels[2] == "Button 2"
        kw = creates[0]
        assert kw["ip_address"] == _TARGET and kw["request_port"] == 8480 and kw["device_name"] == "Server"
        assert kw["brand_name"] == "m3tac0de" and kw["send_remote_sync"] is True
        assert len(kw["commands"]) == 2 * _N
        assert kw["commands"][0]["display_name"] == "Play" and kw["commands"][0]["press_type"] == "short"
        assert kw["commands"][_N]["display_name"] == "Play Long" and kw["commands"][_N]["press_type"] == "long"
        assert kw["commands"][_N]["command_index"] == 0
        assert kw["power_on_command_id"] == 1 and kw["power_off_command_id"] is None
        assert kw["input_command_ids"] == [2]
        # The create seeds a head and labels only: the device is read back, its list too.
        assert engine.rereads == [((12,), (), True)]

    asyncio.run(main())


def test_deploy_wifi_device_x1_rules(monkeypatch) -> None:
    async def main():
        engine, creates = _wifi_engine(monkeypatch, "X1")
        proxy = aio.AsyncXProxy.wrap(engine)
        spec = _WifiDeviceSpec(name="Server", power_on_slot=1, input_slots=(2,))
        with pytest.raises(ValueError):
            await proxy.deploy_wifi_device(spec, host=_TARGET, port=8480)   # X1 calls 8060, always
        assert creates == []
        dep = await proxy.deploy_wifi_device(spec, host=_TARGET, port=8060)
        kw = creates[0]
        # The hooks are ignored on an X1 (one power / one input callback per transition regardless).
        assert kw["power_on_command_id"] is None and kw["input_command_ids"] is None
        assert dep.target.port == 8060 and dep.spec.power_on_slot == 1   # the spec is kept as asked

    asyncio.run(main())


def test_deploy_wifi_device_refuses_when_the_hub_cannot_be_written(monkeypatch) -> None:
    async def main():
        engine, creates = _wifi_engine(monkeypatch, "X1S")
        _hub_link(engine, False)
        proxy = aio.AsyncXProxy.wrap(engine)
        with pytest.raises(errors.HubNotConnectedError):
            await proxy.deploy_wifi_device(_WifiDeviceSpec(name="Server"), host=_TARGET, port=8480)
        assert creates == []
        _hub_link(engine, True)
        monkeypatch.setattr(engine, "create_wifi_device", lambda **kw: None)
        with pytest.raises(errors.HubRejectedError):
            await proxy.deploy_wifi_device(_WifiDeviceSpec(name="Server"), host=_TARGET, port=8480)

    asyncio.run(main())


def _live_device(dep, *, labels=None, name=None, ip=_TARGET) -> dict:
    """A blob-free device backup as the engine reads the deployed device back."""

    live_labels = dict(dep.labels)
    live_labels.update(labels or {})
    block = {"device_id": dep.device_id, "name": name or dep.spec.name, "brand": dep.spec.brand,
             "device_class": "wifi_ip" if dep.hub_version != "X1" else "wifi_roku"}
    if ip:
        block["ip_address"] = ip
    return {
        "device": block,
        "commands": [{"command_id": cid, "command_label": label} for cid, label in sorted(live_labels.items())],
        "input_record": None, "macros": [], "button_bindings": [],
    }


def _live_activity(act_id: int, members: list[int]) -> dict:
    return {"device": {"device_id": act_id, "name": f"Act {act_id}"},
            "referenced_source_device_ids": list(members), "macros": [], "favorite_slots": [],
            "button_bindings": []}


def _update_engine(monkeypatch, dep, *, hub_version="X1S", device=None, run_result=None):
    """An engine whose reads return the given live device and one activity
    that lists it as a member (with a second device, so nothing empties);
    the in-place runner is captured instead of hitting the wire."""

    engine = _engine(hub_version)
    _hub_link(engine, True)
    engine.state.activities = {101: {"name": "Watch"}}
    engine._activities_catalog_ready = True
    engine.state.devices = {dep.device_id: {"name": dep.spec.name}}
    live = device if device is not None else _live_device(dep)
    # Hub traffic in order: every read, and the plan run between them.
    engine.trace = trace = []

    def read_device(dev_id, **kw):
        trace.append(("device", dev_id))
        return live if dev_id == dep.device_id else None

    def read_activity(act_id, **kw):
        trace.append(("activity", act_id))
        return _live_activity(act_id, [dep.device_id, 5])

    monkeypatch.setattr(engine, "backup_device", read_device)
    monkeypatch.setattr(engine, "backup_activity", read_activity)
    runs: list = []

    def fake_run(plan, *, progress_callback=None):
        runs.append(plan)
        trace.append("run")
        if run_result is not None:
            return run_result
        return {"status": "success", "completed_steps": len(plan.steps), "total_steps": len(plan.steps), "counters": {}}

    monkeypatch.setattr(engine, "run_wifi_inplace_plan", fake_run)
    return engine, runs


def _deployment(hub_version="X1S", **spec_kw):
    spec = _WifiDeviceSpec(name="Server", slots=(_WifiSlotSpec("Play"), _WifiSlotSpec("Pause")), **spec_kw).normalized()
    return wifi_device_mod.WifiDeployment(
        device_id=12, spec=spec, target=wifi_device_mod.WifiTarget(_TARGET, 8060, "aabbccddeeff"),
        labels=wifi_device_mod.labels_from_spec(spec), hub_version=hub_version)


def test_update_wifi_device_with_an_unchanged_spec_writes_nothing(monkeypatch) -> None:
    async def main():
        dep = _deployment()
        engine, runs = _update_engine(monkeypatch, dep)
        proxy = aio.AsyncXProxy.wrap(engine)
        again = await proxy.update_wifi_device(dep, _WifiDeviceSpec.from_dict(dep.spec.to_dict()))
        assert runs == [] and again.labels == dep.labels and again.spec == dep.spec
        assert engine.trace == [("device", 12), ("activity", 101)]      # the baseline read; nothing written, nothing re-read

    asyncio.run(main())


def test_update_wifi_device_renames_records_in_place(monkeypatch) -> None:
    async def main():
        dep = _deployment()
        engine, runs = _update_engine(monkeypatch, dep)
        proxy = aio.AsyncXProxy.wrap(engine)
        progress = []
        new_spec = _WifiDeviceSpec(name="Server", slots=(_WifiSlotSpec("Start"), _WifiSlotSpec("Pause")))

        updated = await proxy.update_wifi_device(dep, new_spec, progress=progress.append)

        assert len(runs) == 1
        kinds = [(s.kind, s.payload.get("command_id"), s.payload.get("name")) for s in runs[0].steps]
        assert kinds == [("command_rename", 1, "Start"), ("command_rename", 1 + _N, "Start Long")]
        assert updated.labels[1] == "Start" and updated.labels[1 + _N] == "Start Long"
        assert updated.labels[2] == "Pause" and updated.target == dep.target
        # The activity the device is a member of was never planned away.
        assert not any(s.kind == "membership_remove" for s in runs[0].steps)
        # No step wrote to an activity, but a renamed record changes the labels every activity
        # naming the device holds: those are read back with the device.
        monkeypatch.setattr(engine, "activities_referencing_device", lambda dev_id: [101])
        engine.trace.clear()
        await proxy.update_wifi_device(dep, _WifiDeviceSpec(name="Server", slots=(_WifiSlotSpec("Go"), _WifiSlotSpec("Pause"))))
        assert engine.trace[engine.trace.index("run"):] == ["run", ("device", 12), ("activity", 101)]

    asyncio.run(main())


def test_update_wifi_device_applies_slot_references_and_checks_the_activities(monkeypatch) -> None:
    async def main():
        dep = _deployment()
        engine, runs = _update_engine(monkeypatch, dep)
        proxy = aio.AsyncXProxy.wrap(engine)
        routed = _WifiDeviceSpec(name="Server", slots=(
            _WifiSlotSpec("Play", favorite=True, button=0xB6, long_press=True, activities=(101,)), _WifiSlotSpec("Pause")))

        updated = await proxy.update_wifi_device(dep, routed)

        kinds = [(s.kind, s.payload.get("activity_id"), s.payload.get("command_id")) for s in runs[0].steps]
        # The device is already a member of 101 (the fixture), so no join: a favorite, the activity's
        # button with its long press, and the device-page binding.
        assert kinds == [("binding_write", 12, 1), ("favorite_add", 101, 1), ("binding_write", 101, 1)]
        assert runs[0].steps[-1].payload["long_press_command_id"] == 1 + _N
        assert updated.spec.slots[0].button == 0xB6 and updated.spec.slots[0].activities == (101,)
        # The engine's favorite write drops the activity's favorites and leaves the re-read to its
        # caller: after the run the device and the activity written to are read back (found live
        # 2026-09-21: a deploy left the Hub tab counting 0 favorites).
        assert engine.trace == [("device", 12), ("activity", 101), "run", ("device", 12), ("activity", 101)]

        # An activity the hub does not have is declined before anything is planned or written.
        runs.clear()
        gone = _WifiDeviceSpec(name="Server", slots=(_WifiSlotSpec("Play", favorite=True, activities=(150,)), _WifiSlotSpec("Pause")))
        with pytest.raises(errors.WifiUpdateDeclined) as caught:
            await proxy.update_wifi_device(dep, gone)
        assert caught.value.reason == "activity" and "150" in str(caught.value) and runs == []

    asyncio.run(main())


def test_deploy_wifi_device_creates_bare_then_applies_the_references(monkeypatch) -> None:
    async def main():
        engine, creates = _wifi_engine(monkeypatch)
        routed = _WifiDeviceSpec(name="Server", slots=(
            _WifiSlotSpec("Play", button=0xB6, activities=(101,)), _WifiSlotSpec("Scene", input_activity_id=101)))
        bare = routed.normalized().without_references()
        created = wifi_device_mod.WifiDeployment(
            device_id=12, spec=bare, target=wifi_device_mod.WifiTarget(_TARGET, 8060, "aabbccddeeff"),
            labels=wifi_device_mod.labels_from_spec(bare), hub_version="X1S")
        engine.state.activities = {101: {"name": "Watch"}}
        engine._activities_catalog_ready = True
        monkeypatch.setattr(engine, "backup_device", lambda dev_id, **kw: _live_device(created))
        monkeypatch.setattr(engine, "backup_activity", lambda act_id, **kw: _live_activity(act_id, [5]))
        captured: list = []
        monkeypatch.setattr(engine, "run_wifi_inplace_plan", lambda plan, *, progress_callback=None: (
            captured.append(plan) or {"status": "success", "completed_steps": len(plan.steps), "total_steps": len(plan.steps), "counters": {}}))
        proxy = aio.AsyncXProxy.wrap(engine)

        dep = await proxy.deploy_wifi_device(routed, host=_TARGET, port=8060)

        # The create carries the records and the input list, no references; the first update applies them.
        assert len(creates) == 1 and creates[0]["input_command_ids"] == [2]
        assert dep.spec == routed.normalized() and dep.spec.slots[0].button == 0xB6
        kinds = [(s.kind, s.payload.get("activity_id")) for s in captured[0].steps]
        assert ("member_replay", 101) in kinds and ("binding_write", 101) in kinds and ("binding_write", 12) in kinds
        join = next(s for s in captured[0].steps if s.kind == "member_replay")
        assert join.payload["input_cmd_id"] == 2 and join.payload.get("join") is True
        # The create leaves the read to the update (its baseline reads the device); the update
        # reads back the device and the activity its steps wrote to.
        assert engine.rereads == [((12,), (101,), False)]

    asyncio.run(main())


def test_deploy_wifi_device_over_mqtt_is_x2_only_and_names_no_address(monkeypatch) -> None:
    async def main():
        engine = _engine("X2")
        _hub_link(engine, True)
        creates: list[dict] = []
        monkeypatch.setattr(engine, "create_wifi_mqtt_device", lambda **kw: creates.append(kw) or {"device_id": 12, "status": "success"})
        monkeypatch.setattr(engine, "create_wifi_device", lambda **kw: pytest.fail("an mqtt deploy must not build callback records"))
        rereads = _record_rereads(monkeypatch)
        proxy = aio.AsyncXProxy.wrap(engine)
        spec = _WifiDeviceSpec(name="Lights", slots=(_WifiSlotSpec("On"), _WifiSlotSpec("Scene")), power_on_slot=1,
                               input_slots=(2,), brand="c0-a1b2c3d4")

        dep = await proxy.deploy_wifi_device(spec, transport="mqtt")

        assert dep.transport == "mqtt" and dep.target is None and dep.device_id == 12 and dep.hub_version == "X2"
        assert dep.labels[1] == "On" and dep.labels[1 + _N] == "On Long"
        kw = creates[0]
        assert kw["device_name"] == "Lights" and kw["brand_name"] == "c0-a1b2c3d4"
        assert kw["power_on_command_id"] == 1 and kw["input_command_ids"] == [2]
        assert len(kw["commands"]) == 2 * _N and "request_port" not in kw and "ip_address" not in kw
        assert rereads == [((12,), (), True)]

        # Any other hub: refused before the hub is touched.
        for version in ("X1", "X1S"):
            other = _engine(version)
            _hub_link(other, True)
            monkeypatch.setattr(other, "create_wifi_mqtt_device", lambda **kw: pytest.fail("not an X2"))
            with pytest.raises(ValueError, match="X2 only"):
                await aio.AsyncXProxy.wrap(other).deploy_wifi_device(spec, transport="mqtt")
        with pytest.raises(ValueError):
            await proxy.deploy_wifi_device(spec, transport="smoke signals")
        with pytest.raises(ValueError, match="host and port"):
            await proxy.deploy_wifi_device(spec)                              # http without an address

    asyncio.run(main())


def test_update_of_an_mqtt_device_keeps_its_head_an_mqtt_head(monkeypatch) -> None:
    async def main():
        spec = _WifiDeviceSpec(name="Lights", slots=(_WifiSlotSpec("On"),), brand="c0-a1b2c3d4").normalized()
        dep = wifi_device_mod.WifiDeployment(device_id=12, spec=spec, target=None, labels=wifi_device_mod.labels_from_spec(spec),
                                             hub_version="X2", transport="mqtt")
        live = _live_device(dep, ip=None)
        live["device"]["device_class"] = "wifi_mqtt"
        engine, runs = _update_engine(monkeypatch, dep, hub_version="X2", device=live)
        proxy = aio.AsyncXProxy.wrap(engine)

        updated = await proxy.update_wifi_device(dep, _WifiDeviceSpec(name="Lamps", slots=spec.slots, brand=spec.brand))

        assert updated.transport == "mqtt" and updated.target is None
        head = [s for s in runs[0].steps if s.kind == "wifi_head_commit"]
        assert len(head) == 1 and "ip_address" not in head[0].payload

        # The real executor for that step, over the head the hub has: the vendor's wifi_mqtt head
        # (code type 0x20, icon 8, idle behaviour and power fields as captured). Only the name moves.
        current = devices_mod.DeviceConfig(name="Lights", brand="c0-a1b2c3d4", device_id=12, code_type=0x20, device_type=0x10,
                                           icon=8, input_mode=2, power_mode=1, tail_marker=1)
        raw = devices_mod.build_device_create_payload(current, hub_version="X2")[3:]
        engine.state.devices[12] = {"name": "Lights", "brand": "c0-a1b2c3d4", "device_class": "wifi_mqtt", "raw_body": raw}
        sent: list[dict] = []
        monkeypatch.setattr(engine, "_send_step", lambda **kw: sent.append(kw) or _ok_step())
        monkeypatch.setattr(engine, "_build_wifi_device_payload", lambda **kw: pytest.fail("that builder writes an http head"))
        assert engine._sync_step_wifi_head_commit(head[0].payload) is True
        written = devices_mod.parse_device_record(sent[0]["payload"][3:], hub_version="X2", entity_kind="device")
        assert (written.name, written.brand, written.device_id) == ("Lamps", "c0-a1b2c3d4", 12)
        assert (written.code_type, written.icon, written.input_mode, written.power_mode, written.tail_marker) == (0x20, 8, 2, 1, 1)
        assert sent[0]["family"] == 0x08 and engine.state.devices[12]["name"] == "Lamps"

        # With no head in the cache there is nothing safe to write: the step fails, nothing is sent.
        sent.clear()
        engine.state.devices[12] = {"name": "Lamps", "device_class": "wifi_mqtt"}
        assert engine._sync_step_wifi_head_commit(head[0].payload) is False and sent == []

    asyncio.run(main())


def test_update_wifi_device_rename_on_x1_pins_the_head_address(monkeypatch) -> None:
    async def main():
        dep = _deployment(hub_version="X1")
        engine, runs = _update_engine(monkeypatch, dep, hub_version="X1")
        proxy = aio.AsyncXProxy.wrap(engine)
        head_writes = []

        def fake_head(**kw):
            head_writes.append(kw)
            return devices_mod.build_device_create_payload(
                devices_mod.DeviceConfig(name=kw["device_name"], brand=kw["brand_name"]), hub_version="X1")

        monkeypatch.setattr(engine, "_build_wifi_device_payload", fake_head)
        monkeypatch.setattr(engine, "get_routed_local_ip", lambda: "172.17.0.2")     # a container address

        await proxy.update_wifi_device(dep, _WifiDeviceSpec(name="Renamed", slots=dep.spec.slots))

        head = [s for s in runs[0].steps if s.kind == "wifi_head_commit"]
        assert len(head) == 1 and head[0].payload["ip_address"] == _TARGET
        # Drive the real executor for that step: the pinned address wins over the routed one.
        monkeypatch.setattr(engine, "_send_step", lambda **kw: _ok_step())
        assert engine._sync_step_wifi_head_commit(head[0].payload) is True
        assert head_writes[-1]["ip_address"] == _TARGET

    asyncio.run(main())


def test_update_wifi_device_declines_drift_and_missing_records(monkeypatch) -> None:
    async def main():
        dep = _deployment()
        # A record the app relabelled matches neither side: drift, nothing written.
        engine, runs = _update_engine(monkeypatch, dep, device=_live_device(dep, labels={3: "Foreign"}))
        proxy = aio.AsyncXProxy.wrap(engine)
        with pytest.raises(errors.WifiUpdateDeclined) as info:
            await proxy.update_wifi_device(dep, _WifiDeviceSpec(name="Server", slots=(_WifiSlotSpec("Start"),)))
        assert info.value.reason == "drift" and info.value.command_ids == (3,) and runs == []

        # A record the deployment wrote is gone: missing.
        gone = _live_device(dep)
        gone["commands"] = [row for row in gone["commands"] if row["command_id"] != 2 * _N]
        engine, runs = _update_engine(monkeypatch, dep, device=gone)
        proxy = aio.AsyncXProxy.wrap(engine)
        with pytest.raises(errors.WifiUpdateDeclined) as info:
            await proxy.update_wifi_device(dep, dep.spec)
        assert info.value.reason == "missing" and info.value.command_ids == (2 * _N,) and runs == []

        # The device is not readable at all.
        engine, runs = _update_engine(monkeypatch, dep)
        monkeypatch.setattr(engine, "backup_device", lambda dev_id, **kw: None)
        proxy = aio.AsyncXProxy.wrap(engine)
        with pytest.raises(errors.WifiUpdateDeclined) as info:
            await proxy.update_wifi_device(dep, dep.spec)
        assert info.value.reason == "device" and runs == []

    asyncio.run(main())


def test_update_wifi_device_resumes_an_interrupted_apply(monkeypatch) -> None:
    async def main():
        dep = _deployment()
        # Slot 1's short record already carries the desired label (a previous
        # update died after it); the long one still carries the deployed label.
        engine, runs = _update_engine(monkeypatch, dep, device=_live_device(dep, labels={1: "Start"}))
        proxy = aio.AsyncXProxy.wrap(engine)
        new_spec = _WifiDeviceSpec(name="Server", slots=(_WifiSlotSpec("Start"), _WifiSlotSpec("Pause")))

        updated = await proxy.update_wifi_device(dep, new_spec)

        kinds = [(s.kind, s.payload.get("command_id")) for s in runs[0].steps]
        assert kinds == [("command_rename", 1 + _N)]          # only what is still behind
        assert updated.labels[1] == "Start"

    asyncio.run(main())


def test_update_wifi_device_reports_a_rejected_step(monkeypatch) -> None:
    async def main():
        dep = _deployment()
        engine, runs = _update_engine(
            monkeypatch, dep,
            run_result={"status": "failed", "failed_at": "command_rename", "completed_steps": 1,
                        "message": "The hub rejected: Renaming command"})
        proxy = aio.AsyncXProxy.wrap(engine)
        with pytest.raises(errors.WifiUpdateFailed) as info:
            await proxy.update_wifi_device(dep, _WifiDeviceSpec(name="Server", slots=(_WifiSlotSpec("Start"),)))
        assert info.value.failed_at == "command_rename" and info.value.completed_steps == 1
        assert isinstance(info.value, errors.HubRejectedError) and len(runs) == 1

    asyncio.run(main())


def test_local_address_is_the_routed_ipv4_toward_the_hub() -> None:
    import ipaddress

    async def main():
        engine = _engine("X1S")
        proxy = aio.AsyncXProxy.wrap(engine)
        address = proxy.local_address()
        ipaddress.IPv4Address(address)             # a dotted-decimal IPv4, no hub traffic needed
        assert address == engine.get_routed_local_ip()
        assert _pending_local_bytes(engine) == 0

    asyncio.run(main())


def test_action_id_prefers_the_banner_mac_over_the_proxy_id() -> None:
    """A hub registered by host has no mDNS TXT record; the banner the hub
    sends on connect carries its MAC and must win over the proxy id, which
    two hubs on one host would otherwise share (bench_220, 2026-09-11)."""

    engine = _engine("X1S")
    assert engine._stable_hub_action_id() == engine.proxy_id           # nothing known yet
    with engine._banner_info_lock:
        engine._banner_info = {"mac": "E2:6A:44:86:1B:45", "model": "X1S"}
    assert engine._stable_hub_action_id() == "e26a44861b45"
    engine.mdns_txt["MAC"] = "00:11:22:33:44:55"
    assert engine._stable_hub_action_id() == "e26a44861b45"           # the banner still wins


# ---------------------------------------------------------------------------
# phase 4 H2: the engine write batch and the strict preflight
# ---------------------------------------------------------------------------

device_create_mod = importlib.import_module(f"{_pkg.__name__}.device_create")
protocol_const = importlib.import_module(f"{_pkg.__name__}.protocol_const")


def _batch_doc() -> dict:
    return {
        "kind": "hub_bundle",
        "hub": {"name": "Den", "version": "X1S"},
        "devices": [
            {"device": {"device_id": 5, "name": "TV", "device_class": "ir"},
             "commands": [{"command_id": 1, "name": "Power"}], "button_bindings": [], "macros": [],
             "input_record": None, "key_sort": None, "complete": True},
        ],
        "activities": [
            {"device": {"device_id": 101, "name": "Watch", "entity_type": "activity"},
             "button_bindings": [], "favorite_slots": [], "favorites_order": [], "macros": [],
             "complete": True},
        ],
    }


@pytest.mark.parametrize("hub_version, trigger", [
    ("X1S", (protocol_const.OP_REMOTE_SYNC, b"")),
    ("X2", (protocol_const.OP_X2_REMOTE_SYNC_ALL, b"\xff\xff\xff")),
])
def test_write_batch_coalesces_every_remote_sync_path_into_one_trigger(monkeypatch, hub_version, trigger) -> None:
    engine = _engine(hub_version)
    _hub_link(engine, True)
    enqueued: list = []
    monkeypatch.setattr(engine, "enqueue_cmd", lambda opcode, payload=b"", **kw: enqueued.append((opcode, payload)) or True)
    frames: list = []
    monkeypatch.setattr(engine, "_send_family_frame", lambda family, payload: frames.append((family, payload)))

    engine.begin_write_batch()
    assert engine.write_batch_open
    # 1. resync_remote itself (create_device, restore).
    assert engine.resync_remote() is True
    # 2. the inline 0x64 step the reorder writes send through execute_exchange.
    step = engine.execute_exchange(step_name="device-sort-remote-sync", family=0x64, payload=b"",
                                   ack_opcode=0x0103, ack_first_byte=0x00)
    assert step.ok
    # 3. a create sequence's terminal step.
    seq = device_create_mod.run_create_sequence(engine, [device_create_mod.build_remote_sync_step()])
    assert seq.success
    assert enqueued == [] and frames == [], "a batch must send no trigger while open"

    summary = engine.end_write_batch()
    assert not engine.write_batch_open
    assert summary["remote_sync"] == "sent" and summary["remote_sync_requests"] == 3
    assert summary["origins"][:2] == ["resync_remote", "device-sort-remote-sync"]
    assert enqueued == [trigger] and frames == []


def test_write_batch_without_requests_sends_nothing_and_reports_not_needed(monkeypatch) -> None:
    engine = _engine()
    _hub_link(engine, True)
    enqueued: list = []
    monkeypatch.setattr(engine, "enqueue_cmd", lambda *a, **kw: enqueued.append(a) or True)
    engine.begin_write_batch()
    assert engine.end_write_batch() == {"remote_sync": "not_needed", "remote_sync_requests": 0, "origins": []}
    assert enqueued == []


def test_write_batch_reports_a_failed_trigger_and_can_drop_it(monkeypatch) -> None:
    engine = _engine()
    # Hub not writable: the coalesced trigger cannot be enqueued.
    engine.begin_write_batch()
    engine.resync_remote()
    assert engine.end_write_batch()["remote_sync"] == "failed"
    # send_remote_sync=False drops the pending requests without sending.
    enqueued: list = []
    monkeypatch.setattr(engine, "enqueue_cmd", lambda *a, **kw: enqueued.append(a) or True)
    engine.begin_write_batch()
    engine.resync_remote()
    summary = engine.end_write_batch(send_remote_sync=False)
    assert summary["remote_sync"] == "not_needed" and summary["remote_sync_requests"] == 1
    assert enqueued == []


def test_write_batch_is_exclusive_and_outside_it_the_trigger_goes_out(monkeypatch) -> None:
    engine = _engine()
    _hub_link(engine, True)
    enqueued: list = []
    monkeypatch.setattr(engine, "enqueue_cmd", lambda opcode, payload=b"", **kw: enqueued.append(opcode) or True)
    with pytest.raises(RuntimeError):
        engine.end_write_batch()
    engine.begin_write_batch()
    with pytest.raises(RuntimeError):
        engine.begin_write_batch()
    engine.end_write_batch()
    assert engine.resync_remote() is True
    assert enqueued == [protocol_const.OP_REMOTE_SYNC]


def test_strict_preflight_refuses_what_the_lenient_one_lets_through(monkeypatch) -> None:
    engine = _engine()
    _hub_link(engine, True)
    doc = _batch_doc()

    monkeypatch.setattr(engine, "backup_activity", lambda *a, **kw: None)
    monkeypatch.setattr(engine, "backup_device", lambda *a, **kw: None)
    assert engine._activity_sync_preflight(doc, 101, strict=False) == (None, None)
    assert engine._device_sync_preflight(doc, 5, strict=False) == (None, None)
    verdict, message = engine._activity_sync_preflight(doc, 101, strict=True)
    assert verdict == "unreadable" and "re-read" in message and "nothing was written" in message
    assert engine._device_sync_preflight(doc, 5, strict=True)[0] == "unreadable"
    assert engine._activity_sync_is_stale(doc, 101) is False  # the lenient wrapper is unchanged

    monkeypatch.setattr(engine, "backup_activity", lambda *a, **kw: {**doc["activities"][0], "complete": False})
    assert engine._activity_sync_preflight(doc, 101, strict=False) == (None, None)
    verdict, message = engine._activity_sync_preflight(doc, 101, strict=True)
    assert verdict == "incomplete" and "incomplete" in message


def test_sync_activity_strict_preflight_fails_before_any_write(monkeypatch) -> None:
    engine = _engine()
    _hub_link(engine, True)
    doc = _batch_doc()
    edited = _pkg.edits.bind_button(doc, 101, int(_pkg.ButtonName.VOL_UP), 5, 1)
    monkeypatch.setattr(engine, "backup_activity", lambda *a, **kw: None)
    frames: list = []
    monkeypatch.setattr(engine, "_send_family_frame", lambda family, payload: frames.append((family, payload)))

    result = engine.sync_activity(baseline=doc, edited=edited, activity_id=101, strict_preflight=True)
    assert result["status"] == "failed" and result["failed_at"] == "stale_check"
    assert result["preflight"] == "unreadable"
    assert frames == []


# ---------------------------------------------------------------------------
# bench_230 finding: an idle read answered "no record" is known absent
# ---------------------------------------------------------------------------


def test_idle_read_answered_no_record_is_known_absent_and_wakes_the_waiter(monkeypatch) -> None:
    engine = _engine()
    _hub_link(engine, True)
    sent: list = []

    def hub_answers_no_record(dev):
        # The hub's reply to the read: a bare STATUS_ACK 0x07.
        sent.append(dev)
        engine.note_catalog_status_ack(0x07)
        return True

    monkeypatch.setattr(engine, "request_idle_behavior", hub_answers_no_record)

    # Before any answer: unknown, and a fetch would ask the hub.
    assert engine.get_idle_behavior(12, fetch_if_missing=False) == (None, False)

    # The read is in flight; the hub answers with a bare STATUS_ACK 0x07.
    engine._idle_behavior_pending = 12
    assert engine.note_catalog_status_ack(0x07) is False
    assert 12 in engine._idle_behavior_absent and engine._idle_behavior_pending is None
    assert engine.get_idle_behavior(12, fetch_if_missing=False) == (None, True)
    # A waiting fetch returns at once with "known, absent" (no timeout).
    t = time.monotonic()
    assert engine.fetch_idle_behavior(12, timeout=5.0) == (None, True)
    assert time.monotonic() - t < 1.0

    # The state document carries it; an import restores it.
    doc = engine.export_cache_state()
    assert doc["detail_complete"]["idle_absent"] == [12]
    fresh = _engine()
    fresh.import_cache_state(doc)
    assert 12 in fresh._idle_behavior_absent

    # A later value (set locally or read back) supersedes "absent".
    engine.record_idle_behavior_value(12, 2, source="local_set")
    assert 12 not in engine._idle_behavior_absent
    assert engine.get_idle_behavior(12, fetch_if_missing=False) == (2, True)

    # A 0x07 with no idle read pending is not attributed to one.
    engine._idle_behavior_pending = None
    engine.note_catalog_status_ack(0x07)
    assert 12 not in engine._idle_behavior_absent


# ---------------------------------------------------------------------------
# bench_230 finding: an empty-catalog reply over a non-empty cache is verified
# ---------------------------------------------------------------------------


def test_empty_catalog_reply_over_a_non_empty_cache_is_doubted_once() -> None:
    engine = _engine()
    # An empty cache believes the first empty answer (an empty or erased hub).
    assert engine._doubt_empty_catalog("activities", 1, False) is False
    # A non-empty cache doubts it: no commit, one re-request.
    assert engine._doubt_empty_catalog("activities", 2, True) is True
    # The same request answered again: still doubted (no new generation).
    assert engine._doubt_empty_catalog("activities", 2, True) is True
    # The re-request (a later generation) answered empty too: believed.
    assert engine._doubt_empty_catalog("activities", 3, True) is False
    # A committed catalog with rows clears the doubt, so a later empty
    # answer is doubted afresh.
    engine._clear_empty_catalog_doubt("activities")
    assert engine._doubt_empty_catalog("activities", 4, True) is True
    # The two catalogs are tracked apart.
    assert engine._doubt_empty_catalog("devices", 4, True) is True
    assert engine._doubt_empty_catalog("devices", 5, True) is False


def test_stray_empty_reply_does_not_commit_an_empty_activities_catalog(monkeypatch) -> None:
    """The live sequence: the cache holds activities, a catalog request is in
    flight, a per-entity 0x07 arrives and is taken for the catalog's answer.
    The catalog must survive it, and the request must go out again."""

    engine = _engine()
    _hub_link(engine, True)
    engine.state.activities = {101: {"name": "Watch TV"}}
    engine._activities_catalog_ready = True
    reissued: list = []
    monkeypatch.setattr(engine, "request_activities", lambda **kw: reissued.append(kw) or True)
    finished: list = []
    monkeypatch.setattr(engine._burst, "finish", lambda kind, **kw: finished.append(kind) or True)

    engine._begin_activity_request()
    generation = engine._activity_request_inflight
    engine.note_catalog_status_ack(0x07)
    assert finished == ["activities"] and reissued == [{}]
    assert engine._activity_pending_expected_rows is None, "expected_rows=0 would have committed an empty catalog"
    assert engine.state.activities == {101: {"name": "Watch TV"}}

    # The re-request answers empty as well: now it is believed.
    engine._begin_activity_request()
    assert engine._activity_request_inflight > generation
    engine.note_catalog_status_ack(0x07)
    assert engine._activity_pending_expected_rows == 0 and len(finished) == 2 and len(reissued) == 1


# ---------------------------------------------------------------------------
# bench_230 finding: a burst-terminating 0x07 is not left for the next exchange
# ---------------------------------------------------------------------------


def test_status_ack_that_finished_a_burst_is_not_left_consumable(monkeypatch) -> None:
    engine = _engine()
    protocol_const = importlib.import_module(f"{_pkg.__name__}.protocol_const")
    op = protocol_const.OP_STATUS_ACK

    # The byte terminated a read burst: it answered that burst, nobody else.
    monkeypatch.setattr(engine, "note_catalog_status_ack", lambda status: True)
    engine.notify_ack(op, b"\x07")
    assert list(engine._ack_queue) == []

    # A 0x07 that finished no burst is an exchange's own reply and stays.
    monkeypatch.setattr(engine, "note_catalog_status_ack", lambda status: False)
    engine.notify_ack(op, b"\x07")
    assert [(o, p) for o, p, _ts in engine._ack_queue] == [(op, b"\x07")]

    # An accepted (0x00) ack never goes through the catalog hook.
    calls: list = []
    monkeypatch.setattr(engine, "note_catalog_status_ack", lambda status: calls.append(status) or True)
    engine.notify_ack(op, b"\x00")
    assert calls == [] and len(engine._ack_queue) == 2


# ---------------------------------------------------------------------------
# diag_parse gates the decoded summaries only, never the protocol
# ---------------------------------------------------------------------------

# An X1S banner reply as captured on the wire (probe 2026-09-12): the frame
# the opcode handlers turn into get_banner_info().
_BANNER_FRAME = bytes.fromhex(
    "a55a1e02e26a44861b4500022022112005010058312048554220"
    "62656e63683233304d"
)


@pytest.mark.parametrize("diag_dump, diag_parse", [(False, False), (True, False), (False, True), (True, True)])
def test_inbound_frames_are_dispatched_whatever_the_diag_flags(diag_dump, diag_parse) -> None:
    """Handler dispatch used to live under ``if self.diag_parse``, so a
    diag_parse=False engine never recorded the banner, never saw an ack and
    never finished a burst (latent since the first commit; a diagnostics-off
    bench probe found it 2026-09-12)."""

    engine = x1_proxy_mod.X1Proxy("127.0.0.1", hub_version="X1S", proxy_enabled=False,
                                  diag_dump=diag_dump, diag_parse=diag_parse)
    assert not engine.get_banner_info()
    engine._handle_hub_frame(_BANNER_FRAME, 1)
    info = engine.get_banner_info()
    assert info.get("model") == "X1S" and str(info.get("mac", "")).upper() == "E26A44861B45", info
    assert engine.has_banner_identity()
