"""Phase 4 S13: the whole-document write (``PUT /snapshot``), its preview,
the apply records, idempotent submission, resume, cancel and pruning."""

from __future__ import annotations

import copy
import json
import time
from pathlib import Path

from fastapi.testclient import TestClient

from sofabaton_server import API_PREFIX
from sofabaton_server.app import create_app
from sofabaton_server.config import Settings
from sofabaton_server.manager import HubManager

from fakes import Factory, no_network_discovery

HUBS = f"{API_PREFIX}/hubs"
HOST = "192.168.1.50"
H = f"{HUBS}/{HOST}"


def _rig(tmp_path: Path, **settings):
    factory = Factory()
    cfg = Settings(data_dir=tmp_path, **settings)
    manager = HubManager(cfg, proxy_factory=factory)
    client = TestClient(create_app(cfg, manager=manager, discovery=no_network_discovery(cfg, manager)))
    return client, factory


def _wait(client, job_id, timeout=5.0):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        job = client.get(f"{H}/jobs/{job_id}").json()
        if job["status"] in ("done", "failed", "cancelled"):
            return job
        time.sleep(0.01)
    raise AssertionError(f"job {job_id} did not finish: {job}")


def _snapshot(client):
    r = client.get(f"{H}/snapshot")
    return r.json(), r.headers["ETag"]


def _activity(doc, activity_id):
    return next(a for a in doc["activities"] if a["device"]["device_id"] == activity_id)


def _binding(button, dev, cmd):
    return {"button_id": button, "device_id": dev, "command_id": cmd,
            "long_press_device_id": None, "long_press_command_id": None}


def _ready(client, factory):
    client.post(HUBS, json={"host": HOST})
    proxy = factory.latest(HOST)
    proxy.fetched = {1, 2, 101, 102}
    return proxy


def _edited(doc):
    desired = copy.deepcopy(doc)
    _activity(desired, 101)["button_bindings"].append(_binding(0xB6, 1, 2))
    return desired


def test_plan_preview_and_stage_a_refusals(tmp_path: Path) -> None:
    client, factory = _rig(tmp_path)
    with client:
        proxy = _ready(client, factory)
        doc, _etag = _snapshot(client)

        plan = client.post(f"{H}/snapshot/plan", json=_edited(doc))
        assert plan.status_code == 200, plan.text
        body = plan.json()
        assert body["item_count"] == 1 and body["items"][0]["kind"] == "sync_activity"
        assert body["items"][0]["entity_id"] == 101 and body["step_count"] >= 1
        assert body["live_check"] == [{"kind": "activity", "entity_id": 101}] and body["live_check_count"] == 1
        assert body["provisional_ids"] == {} and body["notes"] == []
        # A new device with an inserted position: provisional id, reorder item.
        desired = copy.deepcopy(doc)
        desired["devices"].insert(0, {"device": {"device_id": -1, "name": "Projector", "device_class": "ir"},
                                      "commands": [], "button_bindings": [], "macros": []})
        body = client.post(f"{H}/snapshot/plan", json=desired).json()
        assert [i["kind"] for i in body["items"]] == ["add_device", "reorder_devices"]
        assert body["provisional_ids"] == {"-1": 3} and body["items"][0]["placeholder_id"] == -1
        assert proxy.applies == []  # a preview never runs

        # Stage A refusals are 4xx with the entity named and no job.
        desired = copy.deepcopy(doc)
        desired["devices"] = [d for d in desired["devices"] if d["device"]["device_id"] != 1]
        r = client.post(f"{H}/snapshot/plan", json=desired)
        assert r.status_code == 422 and r.json()["type"] == "dangling_reference" and "activity 101" in r.json()["detail"]
        proxy.fetched = {1, 2, 102}
        r = client.post(f"{H}/snapshot/plan", json=_edited(doc))
        assert r.status_code == 409 and r.json()["type"] == "entity_not_editable"
        desired = copy.deepcopy(doc)
        desired["devices"] = [d for d in desired["devices"] if d["device"]["device_id"] != 2]
        _activity(desired, 101)  # 101 references only device 1
        r = client.post(f"{H}/snapshot/plan", json=desired)
        assert r.status_code == 409 and r.json()["type"] == "snapshot_incomplete" and "101" in r.json()["detail"]
        desired = copy.deepcopy(doc)
        desired["devices"][0]["device"]["device_class"] = "wifi_roku"
        r = client.post(f"{H}/snapshot/plan", json=desired)
        proxy.fetched = {1, 2, 101, 102}
        assert client.post(f"{H}/snapshot/plan", json=desired).status_code == 422
        assert client.post(f"{H}/snapshot/plan", json=desired).json()["type"] == "out_of_scope"


def test_apply_runs_as_a_job_and_keeps_a_record(tmp_path: Path) -> None:
    client, factory = _rig(tmp_path)
    with client:
        proxy = _ready(client, factory)
        doc, etag = _snapshot(client)
        desired = _edited(doc)

        r = client.put(f"{H}/snapshot", json=desired)
        assert r.status_code == 428 and r.json()["type"] == "if_match_required"
        r = client.put(f"{H}/snapshot", json=desired, headers={"If-Match": '"stale"'})
        assert r.status_code == 412 and r.json()["type"] == "snapshot_outdated"

        r = client.put(f"{H}/snapshot", json=desired, headers={"If-Match": etag})
        assert r.status_code == 202, r.text
        view = r.json()
        assert view["kind"] == "sync_hub" and view["cancellable"] is True
        job = _wait(client, view["job_id"])
        assert job["status"] == "done", job
        result = job["result"]
        assert result["status"] == "success" and result["items"][0]["status"] == "done"
        assert result["remote_sync"] == "sent" and result["apply_id"]
        assert job["progress"]["item_count"] == 1 and job["progress"]["item_index"] == 0
        call = proxy.applies[-1]
        # The runner gets the state the server built (its apply id is the
        # record's), with the snapshot the client read as its baseline.
        assert call["snapshot_id"] == doc["snapshot_id"] and call["baseline"] is None
        assert call["state"].apply_id == result["apply_id"]
        assert call["state"].baseline["devices"] == doc["devices"]
        assert _activity(call["state"].desired, 101)["button_bindings"][0]["command_id"] == 2

        # The record is on disk, listed and readable in full.
        apply_id = result["apply_id"]
        files = list((tmp_path / "applies").rglob("*.json"))
        assert len(files) == 1 and json.loads(files[0].read_text())["apply_id"] == apply_id
        listed = client.get(f"{H}/applies").json()
        assert [a["apply_id"] for a in listed] == [apply_id]
        assert listed[0]["status"] == "success" and listed[0]["job_id"] == view["job_id"]
        assert listed[0]["resumable"] is False and listed[0]["item_count"] == 1 and listed[0]["writes"] == 1
        full = client.get(f"{H}/applies/{apply_id}").json()
        assert full["items"][0]["status"] == "done" and full["desired"]["activities"]
        assert client.get(f"{H}/applies/nope").status_code == 404

        # A finished apply does not resume; it can be forgotten.
        r = client.post(f"{H}/applies/{apply_id}/resume")
        assert r.status_code == 409 and r.json()["type"] == "apply_not_resumable"
        assert client.delete(f"{H}/applies/{apply_id}").status_code == 204
        assert client.get(f"{H}/applies").json() == []


def test_idempotency_key_returns_the_existing_apply(tmp_path: Path) -> None:
    client, factory = _rig(tmp_path)
    with client:
        proxy = _ready(client, factory)
        doc, etag = _snapshot(client)
        desired = _edited(doc)
        first = client.put(f"{H}/snapshot", json=desired, headers={"If-Match": etag, "Idempotency-Key": "k1"})
        assert first.status_code == 202
        _wait(client, first.json()["job_id"])
        doc2, etag2 = _snapshot(client)

        again = client.put(f"{H}/snapshot", json=desired, headers={"If-Match": etag2, "Idempotency-Key": "k1"})
        assert again.status_code == 200 and again.json()["job_id"] == first.json()["job_id"]
        assert len(proxy.applies) == 1, "a replay must not run again"

        other = copy.deepcopy(desired)
        other["hub"]["name"] = "Loft"
        r = client.put(f"{H}/snapshot", json=other, headers={"If-Match": etag2, "Idempotency-Key": "k1"})
        assert r.status_code == 409 and r.json()["type"] == "apply_key_reused"
        assert len(proxy.applies) == 1


def test_an_idempotent_replay_of_an_interrupted_apply_is_not_done(tmp_path: Path) -> None:
    """CR-S2-6: a restart left the record running and no job knows it; the
    replay must not report the edit as applied."""
    client, factory = _rig(tmp_path)
    with client:
        _ready(client, factory)
        doc, etag = _snapshot(client)
        desired = _edited(doc)
        first = client.put(f"{H}/snapshot", json=desired, headers={"If-Match": etag, "Idempotency-Key": "k1"})
        _wait(client, first.json()["job_id"])
        doc2, etag2 = _snapshot(client)

        store = client.app.state.apply_store
        record = store.find_by_key(HOST, "k1")
        record.state["status"] = "running"          # the server went down mid-run
        store.save(record)
        client.app.state.job_runner._jobs.clear()   # a fresh process knows no jobs

        again = client.put(f"{H}/snapshot", json=desired, headers={"If-Match": etag2, "Idempotency-Key": "k1"})
        assert again.status_code == 200
        assert again.json()["status"] == "failed" and again.json()["error"]["type"] == "apply_interrupted"


def test_stopped_apply_fails_the_job_and_resumes(tmp_path: Path) -> None:
    client, factory = _rig(tmp_path)
    with client:
        proxy = _ready(client, factory)
        doc, etag = _snapshot(client)
        desired = _edited(doc)
        _activity(desired, 102)["button_bindings"].append(_binding(0xB0, 2, 1))
        proxy.apply_outcome = "stopped"

        r = client.put(f"{H}/snapshot", json=desired, headers={"If-Match": etag})
        job = _wait(client, r.json()["job_id"])
        assert job["status"] == "failed" and job["error"]["type"] == "apply_stopped"
        assert job["error"]["status"] == 502  # the first item landed before the stop
        result = job["result"]
        assert result["status"] == "stopped" and result["resumable"] is True
        assert [i["status"] for i in result["items"]] == ["done", "partial"]
        apply_id = result["apply_id"]
        listed = client.get(f"{H}/applies").json()[0]
        assert listed["status"] == "stopped" and listed["resumable"] and listed["cursor"] == 1
        assert "resume" in job["error"]["detail"]

        proxy.apply_outcome = "success"
        r = client.post(f"{H}/applies/{apply_id}/resume")
        assert r.status_code == 202 and r.json()["kind"] == "resume_apply"
        job = _wait(client, r.json()["job_id"])
        assert job["status"] == "done" and job["result"]["status"] == "success"
        assert job["result"]["apply_id"] == apply_id
        resumed = proxy.applies[-1]
        assert resumed["state"] is not None and resumed["state"].apply_id == apply_id and resumed["baseline"] is None
        assert client.get(f"{H}/applies/{apply_id}").json()["runs"] == 2


def test_cancel_leaves_a_resumable_record_and_blocks_delete_while_running(tmp_path: Path) -> None:
    import asyncio

    client, factory = _rig(tmp_path)
    with client:
        proxy = _ready(client, factory)
        doc, etag = _snapshot(client)
        proxy.apply_gate = asyncio.Event()
        r = client.put(f"{H}/snapshot", json=_edited(doc), headers={"If-Match": etag})
        job_id = r.json()["job_id"]
        deadline = time.monotonic() + 5
        while not proxy.applies and time.monotonic() < deadline:
            time.sleep(0.01)
        apply_id = client.get(f"{H}/applies").json()[0]["apply_id"]
        r = client.delete(f"{H}/applies/{apply_id}")
        assert r.status_code == 409 and r.json()["type"] == "apply_running"

        assert client.delete(f"{H}/jobs/{job_id}").status_code == 200
        job = _wait(client, job_id)
        assert job["status"] == "cancelled"
        record = client.get(f"{H}/applies/{apply_id}").json()
        assert record["status"] == "cancelled" and record["resumable"] is True
        assert client.delete(f"{H}/applies/{apply_id}").status_code == 204


def test_prune_keeps_the_configured_number_of_finished_records(tmp_path: Path) -> None:
    client, factory = _rig(tmp_path, apply_keep=1)
    with client:
        _ready(client, factory)
        for name in ("A", "B"):
            doc, etag = _snapshot(client)
            desired = copy.deepcopy(doc)
            desired["hub"]["name"] = name
            r = client.put(f"{H}/snapshot", json=desired, headers={"If-Match": etag})
            assert r.status_code == 202, r.text
            _wait(client, r.json()["job_id"])
        listed = client.get(f"{H}/applies").json()
        assert len(listed) == 1 and listed[0]["status"] == "success"
