"""Phase 3 S11: payload read / play / learn / overwrite / add, backup, restore, erase."""

from __future__ import annotations

import asyncio
import time
from pathlib import Path

from fastapi.testclient import TestClient

from sofabaton import CommandRecord, IrPayload, NetworkCommand

from sofabaton_server import API_PREFIX
from sofabaton_server.app import create_app
from sofabaton_server.config import Settings
from sofabaton_server.manager import HubManager

from fakes import Factory, no_network_discovery

HUBS = f"{API_PREFIX}/hubs"
HOST = "192.168.1.50"
H = f"{HUBS}/{HOST}"


def _rig(tmp_path: Path, **app_options):
    factory = Factory()
    settings = Settings(data_dir=tmp_path)
    manager = HubManager(settings, proxy_factory=factory)
    client = TestClient(create_app(settings, manager=manager, discovery=no_network_discovery(settings, manager), **app_options))
    return client, factory


def _wait(client, job_id, *, status=("done", "failed", "cancelled"), timeout=5.0):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        job = client.get(f"{H}/jobs/{job_id}").json()
        if job["status"] in status:
            return job
        time.sleep(0.01)
    raise AssertionError(f"job {job_id} did not reach {status}: {job}")


def test_read_and_play_payloads_in_every_format(tmp_path: Path) -> None:
    client, factory = _rig(tmp_path)
    with client:
        client.post(HUBS, json={"host": HOST})
        proxy = factory.latest(HOST)
        raw = IrPayload.from_raw_timings([9000, 4500, 560, 560], 38000)
        proxy.payloads[(1, 2)] = raw

        r = client.get(f"{H}/devices/1/commands/2/payload")
        assert r.status_code == 200 and r.json() == {"kind": "raw", "hex": raw.hex, "descriptor": None, "carrier_hz": 38000, "decoded": None}
        # A class the library can round-trip carries its decoded block: a descriptive IR payload on an ir device ...
        proxy.device_blocks[1] = {"device_class": "ir"}
        proxy.payloads[(1, 4)] = IrPayload.from_descriptor("P:NEC1 D:4 S:5 F:21")
        r = client.get(f"{H}/devices/1/commands/4/payload")
        assert r.status_code == 200 and r.json()["kind"] == "descriptive"
        assert r.json()["decoded"]["class"] == "ir" and r.json()["decoded"]["fields"] == {"descriptor": "P:NEC1 D:4 S:5 F:21"}
        # ... and a Roku keypress on a wifi_roku device (the wifi classes' structured forms edit these fields).
        proxy.device_blocks[1] = {"device_class": "wifi_roku"}
        roku = NetworkCommand("wifi_roku", {"path": "keypress/Home"}, "f1")
        proxy.payloads[(1, 5)] = roku
        r = client.get(f"{H}/devices/1/commands/5/payload")
        assert r.status_code == 200 and r.json()["kind"] == "network" and r.json()["hex"] == roku.hex
        assert r.json()["decoded"] == {"class": "wifi_roku", "fields": {"path": "keypress/Home"}, "trailer_hex": "f1"}
        assert r.json()["carrier_hz"] is None
        # Every other stored body is a record: a two-byte wifi_mqtt record decodes ...
        proxy.device_blocks[1] = {"device_class": "wifi_mqtt"}
        proxy.payloads[(1, 6)] = CommandRecord("wifi_mqtt", bytes([0x07, 0x06]))
        r = client.get(f"{H}/devices/1/commands/6/payload")
        assert r.status_code == 200 and r.json()["kind"] == "record" and r.json()["hex"] == "07 06"
        assert r.json()["decoded"] == {"class": "wifi_mqtt", "trailer_hex": "", "fields": {"device_id": 7, "command_id": 6}}
        # ... and a Bluetooth key stays raw.
        proxy.device_blocks[1] = {"device_class": "bluetooth"}
        proxy.payloads[(1, 7)] = CommandRecord("bluetooth", bytes([0x00, 0x4F, 0x01]))
        r = client.get(f"{H}/devices/1/commands/7/payload")
        assert r.status_code == 200 and r.json() == {"kind": "record", "hex": "00 4f 01", "descriptor": None, "carrier_hz": None, "decoded": None}
        proxy.device_blocks.pop(1, None)
        r = client.get(f"{H}/devices/1/commands/3/payload")
        assert r.status_code == 404 and r.json()["type"] == "payload_not_found"
        assert client.get(f"{H}/devices/99/commands/1/payload").status_code == 404

        for spec in ({"hex": raw.hex}, {"pronto": "0000 006D 0002 0000 0158 00AB 0016 0016"},
                     {"timings_us": [9000, 4500, 560, 560], "carrier_hz": 38000},
                     {"descriptor": "P:NEC1 D:4 S:5 F:21"}):
            r = client.post(f"{H}/play", json=spec)
            assert r.status_code == 200 and r.json()["accepted"] is True, spec
        assert len(proxy.played) == 4 and proxy.played[0] == raw and proxy.played[2] == raw
        assert proxy.played[3].kind == "descriptive"

        r = client.post(f"{H}/play", json={"hex": raw.hex, "pronto": "0000"})
        assert r.status_code == 422
        r = client.post(f"{H}/play", json={"timings_us": [1, 2]})
        assert r.status_code == 422
        r = client.post(f"{H}/play", json={"hex": "zz"})
        assert r.status_code == 422 and r.json()["type"] == "invalid_payload"
        proxy.refuse = True
        assert client.post(f"{H}/play", json={"hex": raw.hex}).json()["type"] == "hub_busy"


def test_learn_job_returns_the_capture_and_can_be_cancelled(tmp_path: Path) -> None:
    client, factory = _rig(tmp_path)
    with client:
        client.post(HUBS, json={"host": HOST})
        proxy = factory.latest(HOST)
        proxy.learn_result = IrPayload.from_descriptor("P:NEC1 D:4 S:5 F:21")
        r = client.post(f"{H}/learn", json={"timeout": 20})
        assert r.status_code == 202 and r.json()["kind"] == "learn_ir" and r.json()["cancellable"] is True
        job = _wait(client, r.json()["job_id"])
        assert job["status"] == "done" and job["result"]["descriptor"] == "P:NEC1 D:4 S:5 F:21"
        assert proxy.learn_timeouts == [20.0]

        proxy.learn_result = None
        r = client.post(f"{H}/learn")
        job = _wait(client, r.json()["job_id"])
        assert job["status"] == "failed" and job["error"]["type"] == "ir_learn_failed"

        proxy.learn_gate = client.portal.call(asyncio.Event)
        proxy.learn_result = IrPayload.from_descriptor("P:NEC1 D:4 S:5 F:22")
        r = client.post(f"{H}/learn")
        job_id = r.json()["job_id"]
        _wait(client, job_id, status=("running",))
        assert client.delete(f"{H}/jobs/{job_id}").status_code == 200
        done = _wait(client, job_id)
        assert done["status"] == "cancelled" and proxy.learn_cancels == 1


def test_payload_overwrite_and_new_command_are_sync_jobs(tmp_path: Path) -> None:
    client, factory = _rig(tmp_path)
    with client:
        client.post(HUBS, json={"host": HOST})
        proxy = factory.latest(HOST)
        proxy.fetched = {1, 2, 101, 102}

        r = client.put(f"{H}/devices/1/commands/2/payload", json={"descriptor": "P:NEC1 D:4 S:5 F:21"})
        assert r.status_code == 202 and r.json()["kind"] == "sync_device"
        assert _wait(client, r.json()["job_id"])["status"] == "done"
        edited = next(d for d in proxy.syncs[-1]["edited"]["devices"] if d["device"]["device_id"] == 1)
        row = next(c for c in edited["commands"] if c["command_id"] == 2)
        assert row["restore_data"]["edited"] is True and row["restore_data"]["data_hex"]

        r = client.post(f"{H}/devices/1/commands", json={"name": "Input", "payload": {"hex": IrPayload.from_raw_timings([9000, 4500, 560, 560], 38000).hex}})
        assert r.status_code == 202
        assert _wait(client, r.json()["job_id"])["status"] == "done"
        edited = next(d for d in proxy.syncs[-1]["edited"]["devices"] if d["device"]["device_id"] == 1)
        new_row = edited["commands"][-1]
        assert new_row["command_id"] == 3 and new_row["name"] == "Input" and new_row["restore_data"]["new"] is True

        r = client.post(f"{H}/devices/1/commands", json={"name": "Dup", "payload": {"hex": "00"}, "command_id": 1})
        assert r.status_code == 422 and r.json()["type"] == "invalid_payload"
        r = client.put(f"{H}/devices/1/commands/9/payload", json={"descriptor": "P:NEC1 D:4 S:5 F:21"})
        assert r.status_code == 404


def test_backup_restore_and_erase_jobs(tmp_path: Path) -> None:
    client, factory = _rig(tmp_path)
    with client:
        client.post(HUBS, json={"host": HOST})
        proxy = factory.latest(HOST)

        r = client.post(f"{H}/backup")
        assert r.status_code == 202 and r.json()["kind"] == "backup" and r.json()["cancellable"] is False
        job = _wait(client, r.json()["job_id"])
        assert job["status"] == "done" and job["result"]["bundle"]["payload_profile"] == "full_backup"
        assert job["progress"]["entity_id"] == 1
        bundle = job["result"]["bundle"]

        r = client.post(f"{H}/backup", json={"include_blobs": False, "device_ids": [1]})
        job = _wait(client, r.json()["job_id"])
        assert job["result"]["bundle"]["payload_profile"] == "structural"
        assert proxy.backups[-1] == {"include_blobs": False, "device_ids": [1]}

        r = client.post(f"{H}/restore", json={"bundle": job["result"]["bundle"]})
        assert r.status_code == 422 and "restorable" in r.json()["title"].lower()
        r = client.post(f"{H}/restore", json={"bundle": {"kind": "nope"}})
        assert r.status_code == 422

        r = client.post(f"{H}/restore", json={"bundle": bundle, "replace": True})
        assert r.status_code == 202 and r.json()["kind"] == "restore" and r.json()["cancellable"] is False
        job = _wait(client, r.json()["job_id"])
        assert job["status"] == "done" and job["result"]["device_id_map"] == {"1": 9}
        assert proxy.restores[-1]["replace"] is True

        r = client.post(f"{H}/erase")
        assert r.status_code == 202 and r.json()["kind"] == "erase"
        job = _wait(client, r.json()["job_id"])
        assert job["status"] == "done" and job["result"]["complete"] is True
        assert client.get(f"{H}/snapshot").json()["devices"] == []

        proxy.refuse = True
        for path in ("/backup", "/erase", "/learn"):
            r = client.post(f"{H}{path}")
            assert r.status_code == 409 and r.json()["type"] == "hub_busy", path


def test_backup_bundle_is_staged_downloaded_and_dropped(tmp_path: Path) -> None:
    # Server panel backup plan, decision 1: the bundle is held for a while,
    # only the job record and the download route carry it.
    client, factory = _rig(tmp_path)
    with client:
        client.post(HUBS, json={"host": HOST, "name": "Living Room"})
        with client.websocket_connect(f"{API_PREFIX}/events") as ws:
            ws.receive_json()  # hello
            job_id = client.post(f"{H}/backup").json()["job_id"]
            job = _wait(client, job_id)
            result = job["result"]
            assert result["bundle"]["kind"] == "hub_bundle"
            assert result["devices"] == 1 and result["activities"] == 0
            assert result["filename"].endswith("_Living_Room.json")
            assert result["bundle_available"] is True and result["bundle_expires_at"]
            assert result["bundle_downloaded"] is False and result["bundle_expired"] is False
            finished = None
            while finished is None:
                message = ws.receive_json()
                if message["type"] == "job_event" and message["job"]["status"] == "done":
                    finished = message["job"]
            assert "bundle" not in finished["result"] and finished["result"]["bundle_available"] is True

        hub = client.get(H).json()
        assert hub["last_job"]["job_id"] == job_id and "bundle" not in hub["last_job"]["result"]
        listed = client.get(f"{H}/jobs").json()[0]
        assert listed["job_id"] == job_id and "bundle" not in listed["result"]

        r = client.get(f"{H}/jobs/{job_id}/bundle")
        assert r.status_code == 200 and r.json() == result["bundle"]
        assert r.headers["content-disposition"] == f'attachment; filename="{result["filename"]}"'
        assert client.get(f"{H}/jobs/{job_id}").json()["result"]["bundle_downloaded"] is True
        assert client.get(f"{H}/jobs/{job_id}/bundle").status_code == 200  # again, until it expires

        assert client.delete(f"{H}/jobs/{job_id}/bundle").status_code == 204
        result = client.get(f"{H}/jobs/{job_id}").json()["result"]
        assert "bundle" not in result and result["bundle_available"] is False and result["bundle_expired"] is False
        assert result["filename"] and result["devices"] == 1
        r = client.get(f"{H}/jobs/{job_id}/bundle")
        assert r.status_code == 410 and r.json()["type"] == "bundle_expired"
        assert client.delete(f"{H}/jobs/{job_id}/bundle").status_code == 204  # nothing left: still fine

        assert client.get(f"{H}/jobs/nope/bundle").status_code == 404
        erase = _wait(client, client.post(f"{H}/erase").json()["job_id"])
        r = client.get(f"{H}/jobs/{erase['job_id']}/bundle")
        assert r.status_code == 404 and r.json()["type"] == "bundle_not_found"


def test_backup_bundle_expires_and_a_new_backup_replaces_it(tmp_path: Path) -> None:
    client, _factory = _rig(tmp_path, backup_keep_seconds=0.3)
    with client:
        client.post(HUBS, json={"host": HOST})
        first = _wait(client, client.post(f"{H}/backup").json()["job_id"])
        second = _wait(client, client.post(f"{H}/backup").json()["job_id"])
        # One bundle per hub: the newer backup dropped the older one at once.
        result = client.get(f"{H}/jobs/{first['job_id']}").json()["result"]
        assert "bundle" not in result and result["bundle_expired"] is True
        assert client.get(f"{H}/jobs/{second['job_id']}/bundle").status_code == 200

        deadline = time.monotonic() + 5.0
        while time.monotonic() < deadline:
            result = client.get(f"{H}/jobs/{second['job_id']}").json()["result"]
            if not result["bundle_available"]:
                break
            time.sleep(0.05)
        assert "bundle" not in result and result["bundle_expired"] is True and result["bundle_expires_at"] is None
        assert result["bundle_downloaded"] is True
        assert client.get(f"{H}/jobs/{second['job_id']}/bundle").status_code == 410


def test_failed_restore_is_a_failed_job_with_the_result(tmp_path: Path) -> None:
    # Review of 635ecfe, finding 5: a valid-but-failed RestoreResult used to
    # complete the job with error=null.
    client, factory = _rig(tmp_path)
    with client:
        client.post(HUBS, json={"host": HOST})
        proxy = factory.latest(HOST)
        proxy.restore_failure = {"status": "failed", "failed_at": ["device", 3], "device_id_map": {},
                                 "restored_devices": [], "restored_activities": []}
        r = client.post(f"{H}/restore", json={"bundle": {"kind": "hub_bundle"}})
        job = _wait(client, r.json()["job_id"])
        assert job["status"] == "failed"
        assert job["error"]["type"] == "restore_failed" and job["error"]["status"] == 409
        assert job["result"]["failed_at"] == ["device", 3] and job["result"]["restored_devices"] == 0

        proxy.restore_failure = {"status": "failed", "failed_at": ["activity", 101], "device_id_map": {"1": 9},
                                 "restored_devices": [{"source_device_id": 1, "device_id": 9}], "restored_activities": []}
        r = client.post(f"{H}/restore", json={"bundle": {"kind": "hub_bundle"}})
        job = _wait(client, r.json()["job_id"])
        assert job["error"]["status"] == 502 and "1 device(s)" in job["error"]["detail"]
        assert job["result"]["device_id_map"] == {"1": 9} and job["result"]["restored_devices"] == 1

        proxy.restore_failure = {"status": "failed", "failed_at": ["proxy", None]}
        r = client.post(f"{H}/restore", json={"bundle": {"kind": "hub_bundle"}})
        job = _wait(client, r.json()["job_id"])
        assert job["error"]["status"] == 409 and job["result"]["failed_at"] == ["proxy", None]

        # A replacing restore that fails on its first entity has still erased the hub
        # (found live 2026-09-20): that is a changed hub, 502, and the detail says so.
        proxy.restore_failure = {"status": "failed", "failed_at": ["device", 1], "device_id_map": {},
                                 "restored_devices": [], "restored_activities": []}
        r = client.post(f"{H}/restore", json={"bundle": {"kind": "hub_bundle"}, "replace": True})
        job = _wait(client, r.json()["job_id"])
        assert job["error"]["status"] == 502 and "had been erased" in job["error"]["detail"]
        assert job["result"]["erased"] is True and job["result"]["restored_devices"] == 0


def test_disable_and_remove_are_refused_while_a_job_holds_the_hub(tmp_path: Path) -> None:
    # Review of 635ecfe, finding 3: disable used to release the proxy under
    # a running (non-cancellable) restore.
    client, factory = _rig(tmp_path)
    with client:
        client.post(HUBS, json={"host": HOST})
        proxy = factory.latest(HOST)
        proxy.restore_gate = client.portal.call(asyncio.Event)
        r = client.post(f"{H}/restore", json={"bundle": {"kind": "hub_bundle"}})
        job_id = r.json()["job_id"]
        _wait(client, job_id, status=("running",))
        r = client.post(f"{H}/disable")
        assert r.status_code == 409 and r.json()["type"] == "hub_job_running"
        r = client.delete(f"{H}")
        assert r.status_code == 409 and r.json()["type"] == "hub_job_running"
        assert proxy.stops == [] and client.get(f"{H}/jobs/{job_id}").json()["status"] == "running"
        # So is a manual remote resync: a trigger mid-write restarts the remote's sync.
        r = client.post(f"{H}/resync-remote")
        assert r.status_code == 409 and r.json()["type"] == "hub_job_running"
        assert ("resync", ()) not in proxy.sent
        client.portal.call(proxy.restore_gate.set)
        assert _wait(client, job_id)["status"] == "done"
        assert client.post(f"{H}/resync-remote").status_code == 200
        assert client.post(f"{H}/disable").status_code == 200
