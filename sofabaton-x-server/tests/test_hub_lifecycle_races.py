"""R5 batch 2.4: hub lifecycle against running jobs, re-keys and store errors."""

from __future__ import annotations

import asyncio
import json
import threading
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from sofabaton import HubConfig

from sofabaton_server import API_PREFIX
from sofabaton_server import openapi
from sofabaton_server.app import create_app
from sofabaton_server.config import Settings
from sofabaton_server.discovery import Advertiser
from sofabaton_server.jobs import JobConflict, JobRunner
from sofabaton_server.manager import HubBusy, HubDisabled, HubManager
from sofabaton_server.problems import problem_body
from sofabaton_server.store import HubStore

from fakes import Factory, no_network_discovery

HUBS = f"{API_PREFIX}/hubs"


def _manager(tmp_path: Path, factory: Factory, **kwargs) -> HubManager:
    m = HubManager(Settings(data_dir=tmp_path), proxy_factory=factory, **kwargs)
    m.jobs = JobRunner(problem_for=problem_body)
    m.on_rekey(m.jobs.rekey)
    return m


async def _blocked_job(m: HubManager, hub_id: str):
    gate = asyncio.Event()

    async def body(progress):
        await gate.wait()

    return m.jobs.start(hub_id, "refresh", body, cancellable=True), gate


def test_a_running_job_follows_the_rekey(tmp_path: Path) -> None:
    """CR-S1-1: after host -> MAC the job is still the hub's job."""
    factory = Factory()

    async def main():
        m = _manager(tmp_path, factory)
        await m.start()
        await m.add(HubConfig(host="192.168.1.50"))
        view, gate = await _blocked_job(m, "192.168.1.50")
        factory.latest("192.168.1.50").ready("E2:6A:44:86:1B:45")
        await asyncio.sleep(0.05)

        assert m.ids() == ["e26a44861b45"]
        assert m.jobs.active("e26a44861b45") is view and view.hub_id == "e26a44861b45"
        with pytest.raises(JobConflict):
            m.jobs.start("e26a44861b45", "apply", lambda p: asyncio.sleep(0), cancellable=False)
        with pytest.raises(HubBusy):
            await m.disable("e26a44861b45")
        assert [j.job_id for j in m.jobs.list("e26a44861b45")] == [view.job_id]
        gate.set()
        await asyncio.sleep(0.01)
        await m.stop()

    asyncio.run(main())


def test_shutdown_tells_a_learn_to_stop_before_cancelling_it() -> None:
    """CR-S1-2: the on_cancel hook releases the engine's blocked thread."""

    async def main():
        runner = JobRunner(problem_for=problem_body)
        armed, released = threading.Event(), threading.Event()

        def engine_learn() -> None:
            armed.set()
            released.wait(5)

        async def learn(progress):
            await asyncio.to_thread(engine_learn)

        async def cancel_learn():
            released.set()

        runner.start("hub-a", "learn_ir", learn, cancellable=True, on_cancel=cancel_learn)
        assert await asyncio.to_thread(armed.wait, 2)
        await runner.shutdown(drain_timeout=2)
        assert released.is_set()

    asyncio.run(main())


class _FlakyStore(HubStore):
    def __init__(self, data_dir: Path) -> None:
        super().__init__(data_dir)
        self.fail_next = False

    def save(self, rows) -> None:
        if self.fail_next:
            self.fail_next = False
            raise PermissionError("hubs.json is locked")
        super().save(rows)


def test_a_store_error_on_the_first_ready_never_ends_the_relay(tmp_path: Path) -> None:
    """CR-S1-3: the event survives, the re-key rolls back and retries."""
    factory = Factory()
    store = _FlakyStore(tmp_path)
    seen: list[tuple[str, str]] = []

    async def main():
        m = _manager(tmp_path, factory, store=store)
        m.on_hub_event(lambda hub_id, ev: seen.append((hub_id, ev.kind)))
        await m.start()
        await m.add(HubConfig(host="192.168.1.50"))
        proxy = factory.latest("192.168.1.50")
        store.fail_next = True
        proxy.ready("E2:6A:44:86:1B:45")
        await asyncio.sleep(0.05)
        assert m.ids() == ["192.168.1.50"]          # rolled back, still addressable
        assert m.proxy("192.168.1.50") is proxy

        proxy.emit("hub_state")                       # the relay is alive
        proxy.ready("E2:6A:44:86:1B:45")              # the next ready re-keys
        await asyncio.sleep(0.05)
        assert m.ids() == ["e26a44861b45"]
        await m.stop()

    asyncio.run(main())
    assert ("192.168.1.50", "hub_state") in seen
    saved = json.loads((tmp_path / "hubs.json").read_text(encoding="utf-8"))
    assert saved["hubs"][0]["hub_id"] == "e26a44861b45"


def test_stop_reaches_a_hub_rekeyed_during_shutdown(tmp_path: Path) -> None:
    """CR-S1-4."""
    factory = Factory()

    async def main():
        m = _manager(tmp_path, factory)
        await m.start()
        await m.add(HubConfig(host="192.168.1.50"))
        await m.add(HubConfig(host="192.168.1.51"))
        first, second = factory.latest("192.168.1.50"), factory.latest("192.168.1.51")
        original = m._stop_hub
        fired: list[bool] = []

        async def stop_hub(hub_id, *, release):
            if not fired:
                fired.append(True)
                second.ready("E2:6A:44:86:1B:45")      # its watcher wants the lock now
                await asyncio.sleep(0.05)
            await original(hub_id, release=release)

        m._stop_hub = stop_hub
        await m.stop()
        assert first.stops and second.stops

    asyncio.run(main())


def test_a_job_cannot_start_on_a_proxy_being_stopped(tmp_path: Path) -> None:
    """CR-X5-3: a route that took its proxy before a disable gets a
    refusal, not a job on a stopping proxy."""
    factory = Factory()
    with TestClient(create_app(
        Settings(data_dir=tmp_path),
        manager=(m := HubManager(Settings(data_dir=tmp_path), proxy_factory=factory)),
        discovery=no_network_discovery(Settings(data_dir=tmp_path), m),
    )) as client:
        assert client.post(HUBS, json={"host": "192.168.1.50"}).status_code == 201
        proxy = m.proxy("192.168.1.50")
        assert client.post(f"{HUBS}/192.168.1.50/disable").status_code == 200
        with pytest.raises(HubDisabled):
            m.proxy("192.168.1.50")
        assert proxy.stops == [True]


def test_removing_a_hub_drops_its_apply_records_and_jobs(tmp_path: Path) -> None:
    """CR-S1-6: a re-added hub must not resume or replay old applies."""
    factory = Factory()
    settings = Settings(data_dir=tmp_path)
    m = HubManager(settings, proxy_factory=factory)
    with TestClient(create_app(settings, manager=m, discovery=no_network_discovery(settings, m))) as client:
        assert client.post(HUBS, json={"host": "192.168.1.50", "mac": "e2:6a:44:86:1b:45"}).status_code == 201
        folder = client.app.state.apply_store.hub_dir("e26a44861b45")
        folder.mkdir(parents=True, exist_ok=True)
        (folder / "old.json").write_text("{}", encoding="utf-8")

        async def body(progress):
            return None

        async def run_one():
            m.jobs.start("e26a44861b45", "refresh", body, cancellable=True)
            await asyncio.sleep(0.01)

        client.portal.call(run_one)
        assert m.jobs.list("e26a44861b45")
        assert client.delete(f"{HUBS}/e26a44861b45").status_code == 204
        assert not folder.exists()
        assert m.jobs.list("e26a44861b45") == []


def test_a_mac_without_six_hex_octets_is_refused(tmp_path: Path) -> None:
    """CR-S1-7."""
    factory = Factory()
    settings = Settings(data_dir=tmp_path)
    m = HubManager(settings, proxy_factory=factory)
    with TestClient(create_app(settings, manager=m, discovery=no_network_discovery(settings, m))) as client:
        for mac in ("--", "hub-1"):
            r = client.post(HUBS, json={"host": "192.168.1.60", "mac": mac})
            assert r.status_code == 422 and r.json()["type"] == "invalid_hub_config"


def test_openapi_export_refuses_to_write_into_an_installed_copy(tmp_path: Path, monkeypatch) -> None:
    """CR-S1-9."""
    monkeypatch.setattr(openapi, "DEFAULT_PATH", tmp_path / "site-packages" / "openapi.json")
    assert openapi.main([]) == 2
    assert not (tmp_path / "site-packages" / "openapi.json").exists()


def test_the_hub_list_never_asks_the_hub_for_its_banner(tmp_path: Path) -> None:
    """CR-X3-3: GET /hubs and GET /status are pure state reads."""
    factory = Factory()
    calls: list[dict] = []

    async def main():
        m = _manager(tmp_path, factory)
        await m.start()
        await m.add(HubConfig(host="192.168.1.50"))
        proxy = factory.latest("192.168.1.50")
        original = proxy.hub_info

        async def hub_info(**kwargs):
            calls.append(kwargs)
            return await original(**kwargs)

        proxy.hub_info = hub_info
        await m.views()
        await m.stop()

    asyncio.run(main())
    assert calls == [{"cached_only": True}]


def test_an_advertisement_update_leaves_the_event_loop_at_once() -> None:
    """CR-S1-5: update_service waits for the whole announcement; the event
    loop does not, and the newest TXT is the one left published."""

    class _SlowZc:
        def __init__(self) -> None:
            self.published: list = []

        def update_service(self, info) -> None:
            threading.Event().wait(0.2)
            self.published.append(info.properties.get(b"hubs"))

    async def main():
        advertiser = Advertiser()
        zc = _SlowZc()
        advertiser._zc, advertiser._info = zc, object()
        settings = Settings()
        loop = asyncio.get_running_loop()
        started = loop.time()
        advertiser.update(settings, 1)
        advertiser.update(settings, 2)
        assert loop.time() - started < 0.1
        await asyncio.sleep(0.6)
        return zc.published

    published = asyncio.run(main())
    # Serialized: an older update that was already under way may still go
    # out, but never after a newer one.
    assert published and published[-1] == b"2"
