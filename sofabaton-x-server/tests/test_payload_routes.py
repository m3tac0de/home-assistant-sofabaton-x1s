"""Phase 3 S11: payload read / play / learn / overwrite / add, backup, restore, erase."""

from __future__ import annotations

import asyncio
import time
from pathlib import Path

from fastapi.testclient import TestClient

from sofabaton import IrPayload, NetworkCommand

from sofabaton_server import API_PREFIX
from sofabaton_server.app import create_app
from sofabaton_server.config import Settings
from sofabaton_server.manager import HubManager

from fakes import Factory, no_network_discovery

HUBS = f"{API_PREFIX}/hubs"
HOST = "192.168.1.50"
H = f"{HUBS}/{HOST}"


def _rig(tmp_path: Path):
    factory = Factory()
    settings = Settings(data_dir=tmp_path)
    manager = HubManager(settings, proxy_factory=factory)
    client = TestClient(create_app(settings, manager=manager, discovery=no_network_discovery(settings, manager)))
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
        roku = NetworkCommand.roku("/keypress/Home")
        proxy.payloads[(1, 5)] = IrPayload.from_bytes(roku.blob)
        r = client.get(f"{H}/devices/1/commands/5/payload")
        assert r.status_code == 200
        assert r.json()["decoded"]["class"] == "wifi_roku" and r.json()["decoded"]["fields"] == dict(roku.fields)
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
        client.portal.call(proxy.restore_gate.set)
        assert _wait(client, job_id)["status"] == "done"
        assert client.post(f"{H}/disable").status_code == 200
