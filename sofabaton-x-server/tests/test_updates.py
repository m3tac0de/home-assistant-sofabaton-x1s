"""The PyPI update check: version ordering, the checker, its schedule, the routes."""

from __future__ import annotations

import asyncio
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from sofabaton_server import API_PREFIX, __version__
from sofabaton_server.app import create_app
from sofabaton_server.config import Settings, load_settings
from sofabaton_server.manager import HubManager
from sofabaton_server.updates import (
    STATE_FILE,
    UpdateChecker,
    is_newer,
    newest_release,
    parse_version,
)

from fakes import Factory, no_network_discovery

URL = f"{API_PREFIX}/server/updates"
T0 = datetime(2026, 9, 23, 12, 0, tzinfo=timezone.utc)


def _pypi(*versions: str, yanked: tuple[str, ...] = ()) -> dict:
    return {
        "info": {"version": versions[-1]},
        "releases": {v: [{"filename": f"x-{v}.whl", "yanked": v in yanked}] for v in versions},
    }


class Clock:
    def __init__(self, at: datetime = T0) -> None:
        self.at = at

    def __call__(self) -> datetime:
        return self.at


def _checker(tmp_path: Path, payloads: list, *, installed: str = "0.2.1", automatic: bool = False,
             clock: Clock | None = None, **kw) -> tuple[UpdateChecker, list[int]]:
    calls: list[int] = []

    async def fetch():
        calls.append(1)
        answer = payloads.pop(0) if payloads else payloads_exhausted()
        if isinstance(answer, Exception):
            raise answer
        return answer

    def payloads_exhausted():
        raise AssertionError("more fetches than the test expected")

    settings = Settings(data_dir=tmp_path, update_check=automatic)
    checker = UpdateChecker(settings, installed_version=installed, fetch=fetch, now=clock or Clock(), **kw)
    return checker, calls


# -- versions ----------------------------------------------------------------------


def test_version_ordering_covers_what_the_project_ships() -> None:
    assert is_newer("0.2.2", "0.2.1")
    assert is_newer("0.10.0", "0.9.9")
    assert is_newer("1.0", "0.99.99")
    assert not is_newer("0.2.1", "0.2.1")
    assert not is_newer("0.2.1.0", "0.2.1")           # trailing zeros are the same release
    assert not is_newer("0.2.1", "0.2.1.post1")
    assert is_newer("0.2.1", "0.2.1rc1")               # a final beats its release candidate
    assert is_newer("0.2.1rc1", "0.2.1b2")
    assert is_newer("0.2.1b1", "0.2.1a9")
    assert is_newer("0.2.1a1", "0.2.1.dev5")
    assert is_newer("0.2.1", "0.2.1.dev0")             # a dev build of the same version is older
    assert is_newer("0.3.0.dev0", "0.2.1")             # a dev build of the next version is newer
    assert not is_newer("garbage", "0.2.1") and not is_newer("0.2.2", "garbage")
    assert parse_version("1!1.0") is None and parse_version("1.0+local") is None
    assert parse_version("v0.2.1").release == (0, 2, 1)


def test_newest_release_skips_pre_releases_and_yanked_files() -> None:
    assert newest_release(_pypi("0.1.0", "0.2.1", "0.2.0")) == "0.2.1"
    assert newest_release(_pypi("0.2.1", "0.3.0rc1", "0.3.0.dev2")) == "0.2.1"
    assert newest_release(_pypi("0.2.1", "0.2.2", yanked=("0.2.2",))) == "0.2.1"
    doc = _pypi("0.2.1")
    doc["releases"]["0.2.2"] = []                      # a release with no files is not installable
    assert newest_release(doc) == "0.2.1"
    assert newest_release({"info": {"version": "0.2.3"}}) == "0.2.3"
    assert newest_release({"info": {"version": "0.3.0b1"}}) is None
    assert newest_release({"releases": {}}) is None
    assert newest_release("nope") is None and newest_release(None) is None


# -- the checker ---------------------------------------------------------------------


def test_off_by_default_no_schedule_no_request(tmp_path: Path) -> None:
    checker, calls = _checker(tmp_path, [_pypi("0.2.1")])

    async def main():
        await checker.start()
        await asyncio.sleep(0.05)
        await checker.stop()

    asyncio.run(main())
    assert calls == []
    view = checker.status()
    assert view.status == "not_checked" and view.checked_at is None and view.next_check_at is None
    assert view.automatic is False and view.automatic_pinned is False
    assert view.installed_version == "0.2.1"
    assert not (tmp_path / STATE_FILE).exists()


def test_manual_check_finds_a_newer_release_and_persists(tmp_path: Path) -> None:
    checker, calls = _checker(tmp_path, [_pypi("0.2.1", "0.2.2")])
    seen: list = []
    checker.on_result(seen.append)

    async def main():
        result = await checker.check()
        assert result.ok and result.latest_version == "0.2.2" and result.source == "manual"

    asyncio.run(main())
    assert calls == [1] and len(seen) == 1
    view = checker.status()
    assert view.status == "update_available" and view.latest_version == "0.2.2"
    assert view.checked_at == T0.isoformat() and view.checked_by == "manual" and view.error is None
    assert view.pypi_url.endswith("/sofabaton-x-server/0.2.2/")
    assert view.next_check_at is None                  # one check enables nothing
    saved = json.loads((tmp_path / STATE_FILE).read_text(encoding="utf-8"))
    assert saved["ok"] is True and saved["latest_version"] == "0.2.2"
    # A new process reads it back, and judges it against the version running now.
    again = UpdateChecker(Settings(data_dir=tmp_path), installed_version="0.2.1")
    assert again.status().status == "update_available"
    upgraded = UpdateChecker(Settings(data_dir=tmp_path), installed_version="0.2.2")
    assert upgraded.status().status == "up_to_date" and upgraded.status().checked_at == T0.isoformat()


def test_a_failed_check_is_never_up_to_date(tmp_path: Path) -> None:
    checker, _ = _checker(tmp_path, [OSError("boom"), _pypi("0.2.1"), {"info": {}}])

    async def main():
        failed = await checker.check()
        assert not failed.ok and failed.latest_version is None and "boom" in (failed.error or "")
        view = checker.status()
        assert view.status == "failed" and view.error == "OSError: boom" and view.latest_version is None
        ok = await checker.check()
        assert ok.ok and checker.status().status == "up_to_date" and checker.status().error is None
        # An answer without a usable release is a failure too, and it does
        # not keep the previous verdict.
        empty = await checker.check()
        assert not empty.ok and checker.status().status == "failed"
        assert checker.status().latest_version is None

    asyncio.run(main())


def test_concurrent_checks_share_one_request(tmp_path: Path) -> None:
    gate = asyncio.Event()
    calls: list[int] = []

    async def fetch():
        calls.append(1)
        await gate.wait()
        return _pypi("0.2.1", "0.2.5")

    checker = UpdateChecker(Settings(data_dir=tmp_path), installed_version="0.2.1", fetch=fetch, now=Clock())

    async def main():
        first = asyncio.create_task(checker.check())
        second = asyncio.create_task(checker.check("automatic"))
        await asyncio.sleep(0.01)
        assert checker.checking and checker.status().checking is True
        gate.set()
        results = await asyncio.gather(first, second)
        assert results[0] is results[1] and results[0].source == "manual"
        assert not checker.checking

    asyncio.run(main())
    assert calls == [1]


def test_automatic_schedule_runs_and_stops(tmp_path: Path) -> None:
    clock = Clock()
    checker, calls = _checker(tmp_path, [_pypi("0.2.1"), _pypi("0.2.1", "0.2.2")], automatic=True, clock=clock,
                              startup_delay=timedelta(milliseconds=20), interval=timedelta(milliseconds=60),
                              retry_after_failure=timedelta(milliseconds=30))

    async def main():
        assert checker.next_check_at() == T0 + timedelta(milliseconds=20)
        await checker.start()
        await asyncio.sleep(0.04)
        assert calls == [1] and checker.status().checked_by == "automatic"
        # The next one is an interval after the last (the clock stands still, so it is due in 60 ms;
        # the startup delay floors it at 20 ms).
        assert checker.next_check_at() == T0 + timedelta(milliseconds=60)
        checker.set_automatic(False)
        assert checker.next_check_at() is None and checker.status().next_check_at is None
        await asyncio.sleep(0.1)
        assert calls == [1]                            # turning it off stopped the schedule
        checker.set_automatic(True)
        await asyncio.sleep(0.1)
        assert calls == [1, 1] and checker.status().status == "update_available"
        await checker.stop()

    asyncio.run(main())


def test_next_check_honours_the_record_and_the_failure_retry(tmp_path: Path) -> None:
    clock = Clock()
    checker, _ = _checker(tmp_path, [OSError("down")], automatic=True, clock=clock)
    (tmp_path / STATE_FILE).write_text(json.dumps({"checked_at": (T0 - timedelta(hours=2)).isoformat(), "ok": True,
                                                   "source": "automatic", "latest_version": "0.2.1"}), encoding="utf-8")
    fresh = UpdateChecker(Settings(data_dir=tmp_path, update_check=True), installed_version="0.2.1", now=clock)
    assert fresh.status().status == "up_to_date" and fresh.status().checked_by == "automatic"
    assert fresh.next_check_at() == T0 + timedelta(hours=22)
    # Overdue (the server was down for days): soon after start, not at once.
    clock.at = T0 + timedelta(days=3)
    assert fresh.next_check_at() == clock.at + timedelta(seconds=30)

    async def main():
        await checker.check("automatic")

    asyncio.run(main())
    assert checker.next_check_at() == clock.at + timedelta(hours=1)

    (tmp_path / STATE_FILE).write_text("not json", encoding="utf-8")
    assert UpdateChecker(Settings(data_dir=tmp_path)).last is None


# -- the setting ---------------------------------------------------------------------


def test_update_check_setting_layers(tmp_path: Path) -> None:
    assert load_settings(environ={}, data_dir=tmp_path).update_check is False
    (tmp_path / "server.json").write_text(json.dumps({"update_check": True}), encoding="utf-8")
    assert load_settings(environ={}, data_dir=tmp_path).update_check is True
    pinned = load_settings(environ={"SOFABATON_UPDATE_CHECK": "false"}, data_dir=tmp_path)
    assert pinned.update_check is False and "update_check" in pinned.pinned
    assert load_settings(environ={"SOFABATON_UPDATE_CHECK": "yes"}, data_dir=tmp_path).update_check is True
    with pytest.raises(ValueError):
        load_settings(environ={"SOFABATON_UPDATE_CHECK": "maybe"}, data_dir=tmp_path)
    with pytest.raises(ValueError):
        Settings(data_dir=tmp_path, update_check="true")  # type: ignore[arg-type]


# -- the routes ----------------------------------------------------------------------


def _app(settings: Settings, checker: UpdateChecker):
    manager = HubManager(settings, proxy_factory=Factory())
    return create_app(settings, manager=manager, discovery=no_network_discovery(settings, manager),
                      update_checker=checker)


def test_routes_check_and_configure(tmp_path: Path) -> None:
    settings = Settings(data_dir=tmp_path)
    checker, calls = _checker(tmp_path, [_pypi("0.2.1", "0.2.2")])
    with TestClient(_app(settings, checker)) as client:
        before = client.get(URL).json()
        assert before["status"] == "not_checked" and before["automatic"] is False
        assert before["installed_version"] == "0.2.1"
        info = client.get(f"{API_PREFIX}/server").json()
        assert info["update"]["status"] == "not_checked"
        assert calls == []                              # nothing fetched by opening the page

        checked = client.post(f"{URL}/check")
        assert checked.status_code == 200, checked.text
        body = checked.json()
        assert body["status"] == "update_available" and body["latest_version"] == "0.2.2"
        assert body["checked_by"] == "manual" and body["next_check_at"] is None
        assert calls == [1]
        assert client.get(f"{API_PREFIX}/server").json()["update"]["status"] == "update_available"

        on = client.put(URL, json={"automatic": True})
        assert on.status_code == 200, on.text
        assert on.json()["automatic"] is True and on.json()["next_check_at"] is not None
        assert json.loads((tmp_path / "server.json").read_text(encoding="utf-8")) == {"update_check": True}
        assert load_settings(environ={}, data_dir=tmp_path).update_check is True
        off = client.put(URL, json={"automatic": False})
        assert off.json()["automatic"] is False and off.json()["next_check_at"] is None
        assert json.loads((tmp_path / "server.json").read_text(encoding="utf-8")) == {"update_check": False}
        bad = client.put(URL, json={"automatic": "later"})
        assert bad.status_code == 422 and bad.json()["type"] == "validation_error"
    assert calls == [1]                                 # the schedule never fired inside the test


def test_routes_refuse_a_pinned_setting(tmp_path: Path) -> None:
    settings = Settings(data_dir=tmp_path, update_check=True, pinned=frozenset({"update_check"}))
    checker, calls = _checker(tmp_path, [], automatic=True, startup_delay=timedelta(hours=1))
    checker.automatic_pinned = True
    with TestClient(_app(settings, checker)) as client:
        view = client.get(URL).json()
        assert view["automatic"] is True and view["automatic_pinned"] is True
        same = client.put(URL, json={"automatic": True})        # unchanged: fine
        assert same.status_code == 200
        refused = client.put(URL, json={"automatic": False})
        assert refused.status_code == 409 and refused.json()["type"] == "setting_pinned"
    assert not (tmp_path / "server.json").exists() and calls == []


def test_a_finished_check_is_announced_on_the_stream(tmp_path: Path) -> None:
    settings = Settings(data_dir=tmp_path)
    checker, _ = _checker(tmp_path, [_pypi("0.2.1")])
    app = _app(settings, checker)
    with TestClient(app) as client:
        with client.websocket_connect(f"{API_PREFIX}/events") as ws:
            assert ws.receive_json()["type"] == "hello"
            client.post(f"{URL}/check")
            assert ws.receive_json() == {"type": "server_event", "hub_id": "", "kind": "update_check"}


def test_installed_version_is_the_package_version(tmp_path: Path) -> None:
    assert UpdateChecker(Settings(data_dir=tmp_path)).installed_version == __version__
