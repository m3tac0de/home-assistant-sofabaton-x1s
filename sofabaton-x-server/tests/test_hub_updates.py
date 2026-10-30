"""Cache versions and the opt-in ``hub_update`` stream frame (hub_updates.py)."""

from __future__ import annotations

import asyncio
import time
from pathlib import Path
from types import SimpleNamespace

from fastapi.testclient import TestClient

from sofabaton_server import API_PREFIX, hub_updates
from sofabaton_server.app import create_app
from sofabaton_server.config import Settings
from sofabaton_server.hub_updates import HubUpdates
from sofabaton_server.manager import HubManager

from fakes import Factory, no_network_discovery

HUBS = f"{API_PREFIX}/hubs"
EVENTS = f"{API_PREFIX}/events"
UPDATES = f"{EVENTS}?hub_updates=true"
HOST = "192.168.1.50"


def _rig(tmp_path: Path):
    factory = Factory()
    settings = Settings(data_dir=tmp_path)
    manager = HubManager(settings, proxy_factory=factory)
    client = TestClient(create_app(settings, manager=manager, discovery=no_network_discovery(settings, manager)))
    return client, factory


def _until(ws, predicate, limit: int = 60):
    """Read until a message matches; returns it and everything read before it."""

    seen = []
    for _ in range(limit):
        message = ws.receive_json()
        if predicate(message):
            return message, seen
        seen.append(message)
    raise AssertionError(f"no matching message in {limit}: {seen}")


def _is_update(message) -> bool:
    return message["type"] == "hub_update"


def _wait_job(client, hub, job_id, *, status=("done", "failed", "cancelled"), timeout=5.0):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        job = client.get(f"{HUBS}/{hub}/jobs/{job_id}").json()
        if job["status"] in status:
            return job
        time.sleep(0.01)
    raise AssertionError(f"job {job_id} did not reach {status}")


# -- the version in every hub view ----------------------------------------------------------------


def test_hub_view_carries_the_cache_version(tmp_path: Path) -> None:
    client, factory = _rig(tmp_path)
    with client:
        client.post(HUBS, json={"host": HOST})
        proxy = factory.latest(HOST)
        cache = client.get(f"{HUBS}/{HOST}").json()["cache"]
        doc = client.get(f"{HUBS}/{HOST}/snapshot").json()
        assert cache["snapshot_id"] == doc["snapshot_id"]
        assert cache["generation"] == doc["engine_generation"]
        assert isinstance(cache["epoch"], int) and cache["epoch"] > 0
        assert client.get(HUBS).json()[0]["cache"] == cache

        # The generation moves with no content change: the id stays.
        proxy.move_cache()
        same = client.get(f"{HUBS}/{HOST}").json()["cache"]
        assert same["generation"] == cache["generation"] + 1 and same["snapshot_id"] == cache["snapshot_id"]

        # Content moves: a new id, same epoch.
        proxy.hub_name = "Den"
        proxy.move_cache()
        moved = client.get(f"{HUBS}/{HOST}").json()["cache"]
        assert moved["snapshot_id"] != cache["snapshot_id"] and moved["epoch"] == cache["epoch"]

        # No proxy, no version; a new proxy is a newer epoch.
        client.post(f"{HUBS}/{HOST}/disable")
        assert client.get(f"{HUBS}/{HOST}").json()["cache"] is None
        client.post(f"{HUBS}/{HOST}/enable")
        again = client.get(f"{HUBS}/{HOST}").json()["cache"]
        assert again["epoch"] > cache["epoch"]


def test_projection_runs_only_when_the_generation_moved(tmp_path: Path) -> None:
    client, factory = _rig(tmp_path)
    with client:
        client.post(HUBS, json={"host": HOST})
        proxy = factory.latest(HOST)
        client.get(f"{HUBS}/{HOST}")
        peeks = proxy.peeks
        for _ in range(3):
            client.get(f"{HUBS}/{HOST}")
        assert proxy.peeks == peeks
        proxy.move_cache()
        client.get(f"{HUBS}/{HOST}")
        assert proxy.peeks == peeks + 1


def test_a_running_job_projects_at_most_once_a_second(tmp_path: Path, monkeypatch) -> None:
    # A whole-hub refresh moves the generation on every read: the id is
    # projected again at most once a second while the job runs, and at once
    # when it has ended. The throttle reads its own clock, stepped here: a
    # slow runner starting the job must not use up the second (asyncio keeps
    # the real one).
    now = [1000.0]
    monkeypatch.setattr(hub_updates, "time", SimpleNamespace(time=time.time, monotonic=lambda: now[0]))
    client, factory = _rig(tmp_path)
    with client:
        client.post(HUBS, json={"host": HOST})
        proxy = factory.latest(HOST)
        proxy.refresh_gate = client.portal.call(asyncio.Event)
        first = client.get(f"{HUBS}/{HOST}").json()["cache"]
        job_id = client.post(f"{HUBS}/{HOST}/snapshot/refresh").json()["job_id"]
        _wait_job(client, HOST, job_id, status=("running",))
        proxy.hub_name = "Den"
        proxy.move_cache()
        held = client.get(f"{HUBS}/{HOST}").json()["cache"]
        assert held == first
        now[0] += 1.05
        later = client.get(f"{HUBS}/{HOST}").json()["cache"]
        assert later["snapshot_id"] != first["snapshot_id"] and later["generation"] > first["generation"]
        proxy.hub_name = "Den 2"
        proxy.move_cache()
        client.portal.call(proxy.refresh_gate.set)
        _wait_job(client, HOST, job_id)
        done = client.get(f"{HUBS}/{HOST}").json()["cache"]
        assert done["snapshot_id"] not in (first["snapshot_id"], later["snapshot_id"])


def test_rekey_keeps_the_epoch(tmp_path: Path) -> None:
    client, factory = _rig(tmp_path)
    with client:
        client.post(HUBS, json={"host": HOST})
        proxy = factory.latest(HOST)
        before = client.get(f"{HUBS}/{HOST}").json()["cache"]
        client.portal.call(proxy.ready, "E2:6A:44:86:1B:45")
        time.sleep(0.05)
        after = client.get(f"{HUBS}/e26a44861b45").json()["cache"]
        assert after["epoch"] == before["epoch"]


# -- the stream ------------------------------------------------------------------------------------


def test_hub_updates_are_opt_in(tmp_path: Path) -> None:
    client, factory = _rig(tmp_path)
    with client:
        client.post(HUBS, json={"host": HOST})
        proxy = factory.latest(HOST)
        with client.websocket_connect(EVENTS) as ws:
            assert ws.receive_json()["type"] == "hello"
            client.portal.call(proxy.emit, "ota")
            time.sleep(0.4)                              # past any coalescing window
            client.portal.call(proxy.emit, "ota")
            got = [ws.receive_json() for _ in range(2)]
            assert [m["type"] for m in got] == ["hub_event", "hub_event"]
        assert client.app.state.event_relay.hub_update_subscribers == 0


def test_first_hub_updates_follow_hello(tmp_path: Path) -> None:
    client, _ = _rig(tmp_path)
    with client:
        client.post(HUBS, json={"host": "10.0.0.1"})
        client.post(HUBS, json={"host": "10.0.0.2"})
        with client.websocket_connect(UPDATES) as ws:
            assert ws.receive_json()["type"] == "hello"
            first = [ws.receive_json() for _ in range(2)]
            assert [m["type"] for m in first] == ["hub_update", "hub_update"]
            assert [m["hub_id"] for m in first] == ["10.0.0.1", "10.0.0.2"]
            assert first[0]["seq"] < first[1]["seq"]
            view = first[0]["hub"]
            assert view["hub_id"] == "10.0.0.1" and view["status"]["hub_connected"] is True
            assert view["cache"]["snapshot_id"] and view["active_job"] is None
            # The same shape GET /hubs/{id} returns.
            assert view == client.get(f"{HUBS}/10.0.0.1").json()
        # A hub filter narrows the first frames too.
        with client.websocket_connect(f"{UPDATES}&hub_id=10.0.0.2") as ws:
            ws.receive_json()
            assert ws.receive_json()["hub_id"] == "10.0.0.2"
            client.portal.call(asyncio.sleep, 0)


def test_changes_are_coalesced_into_one_update(tmp_path: Path) -> None:
    client, factory = _rig(tmp_path)
    with client:
        client.post(HUBS, json={"host": HOST})
        proxy = factory.latest(HOST)
        with client.websocket_connect(UPDATES) as ws:
            ws.receive_json()                            # hello
            ws.receive_json()                            # the first hub_update

            def burst() -> None:
                for _ in range(5):
                    proxy.emit("ota")

            client.portal.call(burst)
            update, before = _until(ws, _is_update)
            assert [m["type"] for m in before] == ["hub_event"] * 5
            assert update["hub_id"] == HOST
            # Nothing else was queued for that burst: the next change's own
            # event comes first, then its update.
            client.portal.call(proxy.emit, "ota")
            update2, before2 = _until(ws, _is_update)
            assert [m["type"] for m in before2] == ["hub_event"]
            assert update2["seq"] > update["seq"]


def test_a_cache_move_without_an_event_is_pushed(tmp_path: Path) -> None:
    client, factory = _rig(tmp_path)
    with client:
        client.post(HUBS, json={"host": HOST})
        proxy = factory.latest(HOST)
        with client.websocket_connect(UPDATES) as ws:
            ws.receive_json()
            first = ws.receive_json()
            # Another client's first look at a device: the cache changed, no event.
            proxy.hub_name = "Den"
            proxy.move_cache()
            time.sleep(1.0)
            # A marker, so a missing update fails here instead of hanging.
            client.portal.call(proxy.emit, "ota")
            message = ws.receive_json()
            assert message["type"] == "hub_update", message
            assert message["hub"]["cache"]["snapshot_id"] != first["hub"]["cache"]["snapshot_id"]
            assert message["hub"]["cache"]["epoch"] == first["hub"]["cache"]["epoch"]


def test_a_generation_move_without_a_change_sends_nothing(tmp_path: Path) -> None:
    client, factory = _rig(tmp_path)
    with client:
        client.post(HUBS, json={"host": HOST})
        proxy = factory.latest(HOST)
        with client.websocket_connect(UPDATES) as ws:
            ws.receive_json()
            ws.receive_json()
            peeks = proxy.peeks
            proxy.move_cache()                           # a read that changed nothing
            time.sleep(0.8)
            assert proxy.peeks > peeks                   # the watcher looked
            client.portal.call(proxy.emit, "ota")
            assert ws.receive_json()["type"] == "hub_event"
            assert ws.receive_json()["type"] == "hub_update"


def test_hub_updates_never_trail_the_job_events(tmp_path: Path) -> None:
    client, factory = _rig(tmp_path)
    with client:
        client.post(HUBS, json={"host": HOST})
        proxy = factory.latest(HOST)
        proxy.refresh_gate = client.portal.call(asyncio.Event)
        with client.websocket_connect(UPDATES) as ws:
            ws.receive_json()
            ws.receive_json()
            job_id = client.post(f"{HUBS}/{HOST}/snapshot/refresh").json()["job_id"]
            _wait_job(client, HOST, job_id, status=("running",))
            time.sleep(0.6)                              # a hub update while it runs
            client.portal.call(proxy.refresh_gate.set)
            _wait_job(client, HOST, job_id)

            seen = []
            while True:
                message = ws.receive_json()
                seen.append(message)
                if message["type"] == "hub_update" and (message["hub"]["last_job"] or {}).get("job_id") == job_id:
                    break
            running = False
            updates_while_running = 0
            for message in seen:
                if message["type"] == "job_event":
                    running = message["job"]["status"] in ("queued", "running")
                elif message["type"] == "hub_update" and running:
                    updates_while_running += 1
                    assert (message["hub"]["active_job"] or {}).get("job_id") == job_id, message
            assert updates_while_running >= 1
            final = seen[-1]["hub"]
            assert final["active_job"] is None and final["last_job"]["status"] == "done"


def test_disable_and_enable_are_pushed_with_the_new_epoch(tmp_path: Path) -> None:
    client, _ = _rig(tmp_path)
    with client:
        client.post(HUBS, json={"host": HOST})
        with client.websocket_connect(UPDATES) as ws:
            ws.receive_json()
            first = ws.receive_json()
            client.post(f"{HUBS}/{HOST}/disable")
            off, _ = _until(ws, _is_update)
            assert off["hub"]["enabled"] is False and off["hub"]["cache"] is None
            client.post(f"{HUBS}/{HOST}/enable")
            on, _ = _until(ws, lambda m: _is_update(m) and m["hub"]["cache"] is not None)
            assert on["hub"]["cache"]["epoch"] > first["hub"]["cache"]["epoch"]


# -- the coalescing on its own ------------------------------------------------------------------------


class _Manager:
    def __init__(self) -> None:
        self.views = 0

    def on_hub_event(self, _listener) -> None:
        pass

    def on_server_event(self, _listener) -> None:
        pass

    def ids(self) -> list[str]:
        return []

    async def view(self, hub_id: str):
        self.views += 1
        return {"hub_id": hub_id}


class _Relay:
    hub_update_subscribers = 1

    def __init__(self) -> None:
        self.sent: list[float] = []

    def publish_hub_update(self, _message) -> None:
        self.sent.append(time.monotonic())


def test_debounce_and_max_wait() -> None:
    async def main() -> None:
        relay = _Relay()
        updates = HubUpdates(_Manager(), relay, versions=None, debounce_s=0.05, max_wait_s=0.2)  # type: ignore[arg-type]

        # A single change goes out once the debounce has passed.
        start = time.monotonic()
        updates.poke("h")
        await asyncio.sleep(0.15)
        assert len(relay.sent) == 1 and 0.04 <= relay.sent[0] - start < 0.15

        # A steady stream of changes still goes out, at the max wait.
        relay.sent.clear()
        start = time.monotonic()
        while time.monotonic() - start < 0.7:
            updates.poke("h")
            await asyncio.sleep(0.02)
        await asyncio.sleep(0.1)
        assert len(relay.sent) >= 3
        assert relay.sent[0] - start < 0.3
        gaps = [b - a for a, b in zip(relay.sent, relay.sent[1:], strict=False)]
        assert max(gaps) < 0.3
        await updates.stop()

    asyncio.run(main())


def test_no_subscribers_no_work() -> None:
    async def main() -> None:
        relay = _Relay()
        relay.hub_update_subscribers = 0
        manager = _Manager()
        updates = HubUpdates(manager, relay, versions=None, debounce_s=0.01, max_wait_s=0.05)  # type: ignore[arg-type]
        updates.poke("h")
        await asyncio.sleep(0.1)
        assert relay.sent == [] and manager.views == 0
        await updates.stop()

    asyncio.run(main())
