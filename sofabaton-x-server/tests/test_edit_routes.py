"""Phase 3 S8 + S10: row edits with If-Match, the plan preview, and the intents."""

from __future__ import annotations

import copy
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


def _rig(tmp_path: Path):
    factory = Factory()
    settings = Settings(data_dir=tmp_path)
    manager = HubManager(settings, proxy_factory=factory)
    client = TestClient(create_app(settings, manager=manager, discovery=no_network_discovery(settings, manager)))
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


def test_row_edit_requires_and_checks_if_match_then_syncs(tmp_path: Path) -> None:
    client, factory = _rig(tmp_path)
    with client:
        client.post(HUBS, json={"host": HOST})
        proxy = factory.latest(HOST)
        proxy.fetched = {1, 2, 101, 102}
        doc, etag = _snapshot(client)
        activity = copy.deepcopy(_activity(doc, 101))
        # Device 1 is already a member; binding a non-member would add a
        # member_replay step in front (the planner's own doing).
        activity["button_bindings"] = [{"button_id": 0xB6, "device_id": 1, "command_id": 2,
                                        "long_press_device_id": None, "long_press_command_id": None}]

        r = client.put(f"{H}/activities/101", json=activity)
        assert r.status_code == 428 and r.json()["type"] == "if_match_required"
        r = client.put(f"{H}/activities/101", json=activity, headers={"If-Match": '"stale"'})
        assert r.status_code == 412 and r.json()["type"] == "snapshot_outdated"
        wrong = copy.deepcopy(activity)
        wrong["device"]["device_id"] = 102
        assert client.put(f"{H}/activities/101", json=wrong, headers={"If-Match": etag}).status_code == 422
        # Not a number at all: the same 422, never a bare 500 (CR-S2-9).
        for junk in ("abc", None):
            wrong["device"]["device_id"] = junk
            r = client.put(f"{H}/activities/101", json=wrong, headers={"If-Match": etag})
            assert r.status_code == 422 and r.json()["type"] == "invalid_request", r.text

        # Preview first: the planner names the binding write.
        plan = client.post(f"{H}/activities/101/plan", json=activity).json()
        assert [s["kind"] for s in plan["steps"]] == ["binding_write", "remote_sync"] and plan["step_count"] == 2

        r = client.put(f"{H}/activities/101", json=activity, headers={"If-Match": etag})
        assert r.status_code == 202 and r.json()["kind"] == "sync_activity" and r.json()["cancellable"] is False
        job = _wait(client, r.json()["job_id"])
        assert job["status"] == "done" and job["result"]["status"] == "success"
        assert job["progress"]["step_kind"] == "binding_write"
        sync = proxy.syncs[-1]
        assert sync["entity_id"] == 101 and sync["snapshot_id"] == doc["snapshot_id"]
        assert sync["baseline"]["devices"] == doc["devices"]   # the baseline is the snapshot the client read
        assert _activity(sync["edited"], 101)["button_bindings"][0]["command_id"] == 2
        # The client's provenance copy cannot move the scope guard: it is the baseline's.
        assert _activity(sync["edited"], 101)["complete"] is True

        # The snapshot moved with the write; the old ETag is now stale.
        doc2, etag2 = _snapshot(client)
        assert etag2 != etag and _activity(doc2, 101)["button_bindings"][0]["device_id"] == 1
        assert client.put(f"{H}/activities/101", json=activity, headers={"If-Match": etag}).status_code == 412


def test_row_edit_refuses_unfetched_entity_and_out_of_scope_edit(tmp_path: Path) -> None:
    client, factory = _rig(tmp_path)
    with client:
        client.post(HUBS, json={"host": HOST})
        proxy = factory.latest(HOST)
        proxy.fetched = {1}
        doc, etag = _snapshot(client)
        activity = _activity(doc, 101)
        r = client.put(f"{H}/activities/101", json=activity, headers={"If-Match": etag})
        assert r.status_code == 409 and r.json()["type"] == "entity_not_editable"
        r = client.post(f"{H}/devices/1/rename", json={"name": "Big TV"})
        assert r.status_code == 202
        _wait(client, r.json()["job_id"])
        r = client.post(f"{H}/devices/2/rename", json={"name": "Big Amp"})
        assert r.status_code == 409 and r.json()["type"] == "entity_not_editable"
        # A device edit that adds a command without the planner's marker is out of scope.
        proxy.fetched = {1, 2, 101, 102}
        doc, etag = _snapshot(client)
        device = copy.deepcopy(next(d for d in doc["devices"] if d["device"]["device_id"] == 1))
        device["commands"].append({"command_id": 9, "name": "Ghost"})
        r = client.post(f"{H}/devices/1/plan", json=device)
        assert r.status_code == 422 and r.json()["type"] == "out_of_scope"
        # Dropping a command is in scope on a device (the card's live editor deletes commands): one delete
        # per removed id and one rewrite of the display-sort table, and the write asks the library for it.
        device = copy.deepcopy(next(d for d in doc["devices"] if d["device"]["device_id"] == 1))
        removed = device["commands"].pop()
        r = client.post(f"{H}/devices/1/plan", json=device)
        assert r.status_code == 200, r.text
        kinds = [step["kind"] for step in r.json()["steps"]]
        assert kinds == ["command_delete", "command_sort_rewrite"], kinds
        r = client.put(f"{H}/devices/1", json=device, headers={"If-Match": etag})
        assert r.status_code == 202, r.text
        _wait(client, r.json()["job_id"])
        assert proxy.last_allow_command_removal is True
        assert removed["command_id"] not in [c["command_id"] for c in proxy.syncs[-1]["edited"]["devices"][0]["commands"]]


def test_activity_edit_carries_the_device_elements_it_touched(tmp_path: Path) -> None:
    """Picking an input in the power-on sequence appends to a device's input_record: the PUT carries that device."""

    client, factory = _rig(tmp_path)
    with client:
        client.post(HUBS, json={"host": HOST})
        proxy = factory.latest(HOST)
        proxy.fetched = {1, 2, 101, 102}
        doc, etag = _snapshot(client)
        activity = copy.deepcopy(_activity(doc, 101))
        device = copy.deepcopy(next(d for d in doc["devices"] if d["device"]["device_id"] == 1))
        record = dict(device.get("input_record") or {})
        record["entries"] = [*(record.get("entries") or []), {"command_id": 1, "name": "HDMI 1"}]
        device["input_record"] = record

        plan = client.post(f"{H}/activities/101/plan", json={**activity, "devices": [device]})
        assert plan.status_code == 200, plan.text
        assert "inputs_write" in [s["kind"] for s in plan.json()["steps"]]

        r = client.put(f"{H}/activities/101", json={**activity, "devices": [device]}, headers={"If-Match": etag})
        assert r.status_code == 202, r.text
        _wait(client, r.json()["job_id"])
        edited = proxy.syncs[-1]["edited"]
        assert next(d for d in edited["devices"] if d["device"]["device_id"] == 1)["input_record"]["entries"][-1]["name"] == "HDMI 1"
        assert "devices" not in _activity(edited, 101)          # the list never lands inside the activity element

        # A touched device outside the planner's allowed fields is out of scope; an unknown one is refused.
        doc, etag = _snapshot(client)
        activity = copy.deepcopy(_activity(doc, 101))
        renamed = copy.deepcopy(next(d for d in doc["devices"] if d["device"]["device_id"] == 1))
        renamed["device"]["name"] = "Other"
        r = client.post(f"{H}/activities/101/plan", json={**activity, "devices": [renamed]})
        assert r.status_code == 422 and r.json()["type"] == "out_of_scope"
        ghost = copy.deepcopy(renamed)
        ghost["device"]["device_id"] = 77
        r = client.post(f"{H}/activities/101/plan", json={**activity, "devices": [ghost]})
        assert r.status_code == 422 and r.json()["type"] == "invalid_request"


def test_intents_derive_the_edit_from_the_snapshot(tmp_path: Path) -> None:
    client, factory = _rig(tmp_path)
    with client:
        client.post(HUBS, json={"host": HOST})
        proxy = factory.latest(HOST)
        proxy.fetched = {1, 2, 101, 102}

        def run(method, path, **kw):
            r = getattr(client, method)(f"{H}{path}", **kw)
            assert r.status_code == 202, r.text
            job = _wait(client, r.json()["job_id"])
            assert job["status"] == "done", job
            return proxy.syncs[-1]

        s = run("post", "/activities/101/rename", json={"name": "Movie night"})
        assert _activity(s["edited"], 101)["device"]["name"] == "Movie night"

        s = run("put", "/activities/101/buttons/VOL_UP", json={"device_id": 2, "command_id": 1, "long_press": {"device_id": 2, "command_id": 2}})
        binding = _activity(s["edited"], 101)["button_bindings"][0]
        assert (binding["button_id"], binding["device_id"], binding["long_press_command_id"]) == (0xB6, 2, 2)

        s = run("delete", "/activities/101/buttons/182")
        assert _activity(s["edited"], 101)["button_bindings"] == []

        s = run("post", "/activities/101/favorites", json={"device_id": 2, "command_id": 2, "name": "Mute"})
        assert [(f["device_id"], f["command_id"]) for f in _activity(s["edited"], 101)["favorite_slots"]] == [(1, 1), (2, 2)]

        s = run("put", "/activities/101/favorites/order", json={"order": [{"device_id": 2, "command_id": 2}, {"device_id": 1, "command_id": 1}]})
        assert _activity(s["edited"], 101)["favorites_order"][0] != _activity(s["baseline"], 101)["favorites_order"][0]

        s = run("delete", "/activities/101/favorites/2/2")
        assert [(f["device_id"], f["command_id"]) for f in _activity(s["edited"], 101)["favorite_slots"]] == [(1, 1)]

        s = run("post", "/devices/1/rename", json={"name": "Big TV", "brand": "Sony"})
        dev = next(d for d in s["edited"]["devices"] if d["device"]["device_id"] == 1)
        assert (dev["device"]["name"], dev["device"]["brand"]) == ("Big TV", "Sony")

        s = run("post", "/devices/1/commands/2/rename", json={"name": "Silence"})
        dev = next(d for d in s["edited"]["devices"] if d["device"]["device_id"] == 1)
        assert dev["commands"][1]["name"] == "Silence"

        s = run("put", "/devices/1/idle-behavior", json={"mode": 3})
        assert next(d for d in s["edited"]["devices"] if d["device"]["device_id"] == 1)["device"]["idle_behavior"] == 3

        # Bad targets are 4xx before any job: unknown button alias, unknown command, duplicate favorite.
        assert client.put(f"{H}/activities/101/buttons/NOPE", json={"device_id": 2, "command_id": 1}).status_code == 422
        r = client.post(f"{H}/devices/1/commands/9/rename", json={"name": "x"})
        assert r.status_code == 404
        r = client.post(f"{H}/activities/101/favorites", json={"device_id": 1, "command_id": 1})
        assert r.status_code == 422 and r.json()["type"] == "invalid_request"
        # An optional If-Match is honoured when present.
        _, etag = _snapshot(client)
        assert client.post(f"{H}/activities/101/rename", json={"name": "x"}, headers={"If-Match": '"old"'}).status_code == 412
        r = client.post(f"{H}/activities/101/rename", json={"name": "y"}, headers={"If-Match": etag})
        assert r.status_code == 202


def test_whole_entity_intents_run_as_jobs(tmp_path: Path) -> None:
    client, factory = _rig(tmp_path)
    with client:
        client.post(HUBS, json={"host": HOST})
        proxy = factory.latest(HOST)

        r = client.post(f"{H}/devices", json={"name": "Fan", "device_class": "tv"})
        assert r.status_code == 202 and r.json()["kind"] == "add_device"
        job = _wait(client, r.json()["job_id"])
        assert job["status"] == "done" and job["result"]["device_id"] == 3 and "snapshot_id" in job["result"]

        r = client.post(f"{H}/activities", json={"name": "Read"})
        assert _wait(client, r.json()["job_id"])["result"]["activity_id"] == 103

        r = client.delete(f"{H}/devices/3")
        job = _wait(client, r.json()["job_id"])
        assert job["kind"] == "remove_device" and job["result"]["impacted_activity_ids"] == [101]
        assert client.delete(f"{H}/devices/99").status_code == 404

        r = client.delete(f"{H}/activities/103")
        assert _wait(client, r.json()["job_id"])["kind"] == "remove_activity"
        assert client.delete(f"{H}/activities/999").status_code == 404
        assert [a["device"]["device_id"] for a in client.get(f"{H}/snapshot").json()["activities"]] == [101, 102]

        r = client.put(f"{H}/devices/order", json={"order": [2, 1]})
        assert r.status_code == 202 and _wait(client, r.json()["job_id"])["status"] == "done"
        r = client.put(f"{H}/activities/order", json={"order": [102, 101]})
        assert _wait(client, r.json()["job_id"])["status"] == "done"
        r = client.put(f"{H}/name", json={"name": "Den"})
        assert _wait(client, r.json()["job_id"])["result"]["name"] == "Den"
        assert [i[0] for i in proxy.intents] == ["add_device", "add_activity", "remove_device", "remove_activity",
                                                 "reorder_devices", "reorder_activities", "set_hub_name"]

        # A hub refusal is a failed job with a 502 problem; observe mode is refused up front.
        proxy.reject_intents = True
        r = client.post(f"{H}/activities", json={"name": "Nope"})
        job = _wait(client, r.json()["job_id"])
        assert job["status"] == "failed" and job["error"]["type"] == "hub_rejected" and job["error"]["status"] == 502
        proxy.refuse = True
        r = client.post(f"{H}/activities", json={"name": "Nope"})
        assert r.status_code == 409 and r.json()["type"] == "hub_busy"


def test_failed_sync_is_a_failed_job_carrying_the_result(tmp_path: Path) -> None:
    client, factory = _rig(tmp_path)
    with client:
        client.post(HUBS, json={"host": HOST})
        proxy = factory.latest(HOST)
        proxy.fetched = {1, 2, 101, 102}
        proxy.sync_failure = {"status": "failed", "failed_at": "stale_check",
                              "message": "This activity changed on the hub after you loaded it."}
        r = client.post(f"{H}/activities/101/rename", json={"name": "Movie"})
        job = _wait(client, r.json()["job_id"])
        assert job["status"] == "failed"
        assert job["error"]["type"] == "sync_failed" and job["error"]["status"] == 409
        assert job["result"]["failed_at"] == "stale_check"

        proxy.sync_failure = {"status": "failed", "failed_at": "binding_write (device 2)",
                              "message": "The hub rejected", "completed_steps": 1, "total_steps": 3}
        r = client.post(f"{H}/activities/101/rename", json={"name": "Movie"})
        job = _wait(client, r.json()["job_id"])
        assert job["error"]["status"] == 502 and job["result"]["completed_steps"] == 1


def test_icons_and_colors_are_checked_against_the_hub_line(tmp_path: Path) -> None:
    client, factory = _rig(tmp_path)  # an X1S: icons 1-16, no colors
    with client:
        client.post(HUBS, json={"host": HOST})
        proxy = factory.latest(HOST)

        # Creates carry an icon; one the hub line lacks, or a color off the X2, is a 422 before any job.
        r = client.post(f"{H}/devices", json={"name": "Fan", "device_class": "ir", "icon": 9})
        assert r.status_code == 202 and _wait(client, r.json()["job_id"])["status"] == "done"
        assert proxy.create_appearance == (9, None)
        r = client.post(f"{H}/activities", json={"name": "Read", "icon": 4})
        assert r.status_code == 202 and _wait(client, r.json()["job_id"])["status"] == "done"
        assert proxy.create_appearance == (4, None)
        intents = len(proxy.intents)
        r = client.post(f"{H}/devices", json={"name": "Lamp", "device_class": "ir", "icon": 30})
        assert r.status_code == 422 and r.json()["type"] == "invalid_appearance", r.text
        r = client.post(f"{H}/activities", json={"name": "Nap", "color_id": 3})
        assert r.status_code == 422 and r.json()["type"] == "invalid_appearance", r.text
        assert client.post(f"{H}/activities", json={"name": "Nap", "icon": 46}).status_code == 422
        assert len(proxy.intents) == intents

        # A row edit's changed icon goes to the sync; one the hub line lacks is a 422, not a failed job.
        proxy.fetched = {1, 2, 101, 102}
        doc, etag = _snapshot(client)
        device = copy.deepcopy(next(d for d in doc["devices"] if d["device"]["device_id"] == 1))
        device["device"]["icon"] = 99
        r = client.put(f"{H}/devices/1", json=device, headers={"If-Match": etag})
        assert r.status_code == 422 and r.json()["type"] == "invalid_appearance", r.text
        device["device"]["icon"] = 12
        r = client.post(f"{H}/devices/1/plan", json=device)
        assert r.status_code == 200, r.text
        r = client.put(f"{H}/devices/1", json=device, headers={"If-Match": etag})
        assert r.status_code == 202, r.text
        _wait(client, r.json()["job_id"])
        edited = next(d for d in proxy.syncs[-1]["edited"]["devices"] if d["device"]["device_id"] == 1)
        assert edited["device"]["icon"] == 12


def test_a_write_refused_while_the_remote_updates_is_a_409_to_retry(tmp_path: Path) -> None:
    client, factory = _rig(tmp_path)
    with client:
        client.post(HUBS, json={"host": HOST})
        proxy = factory.latest(HOST)
        proxy.remote_syncing = True
        r = client.post(f"{H}/activities", json={"name": "Read"})
        job = _wait(client, r.json()["job_id"])
        assert job["status"] == "failed" and job["error"]["type"] == "remote_syncing" and job["error"]["status"] == 409
        assert job["error"]["title"] == "The hub is updating its remote"


def _device(doc, device_id):
    return copy.deepcopy(next(d for d in doc["devices"] if d["device"]["device_id"] == device_id))


def test_device_edit_writes_the_x2_emitter_routing_in_one_step(tmp_path: Path) -> None:
    client, factory = _rig(tmp_path)
    with client:
        client.post(HUBS, json={"host": HOST})
        proxy = factory.latest(HOST)
        proxy.model = "X2"
        proxy.fetched = {1, 2, 101, 102}
        proxy.device_blocks[1] = {"extras": {"a": 0, "b": 0, "c": 0x07}}       # hub, all emitters
        doc, etag = _snapshot(client)
        device = _device(doc, 1)
        device["device"]["extras"] = {"a": 0, "b": 0, "c": 0x0C}                 # port 2 and remote 1

        # One record rewrite and no remote sync: the hub updates its remotes itself.
        plan = client.post(f"{H}/devices/1/plan", json=device)
        assert plan.status_code == 200, plan.text
        assert [s["kind"] for s in plan.json()["steps"]] == ["device_rename"] and plan.json()["step_count"] == 1
        # Remote only (no hub emitter) is a valid pick too.
        remote_only = copy.deepcopy(device)
        remote_only["device"]["extras"] = {"a": 0, "b": 0, "c": 0x08}
        plan = client.post(f"{H}/devices/1/plan", json=remote_only)
        assert plan.status_code == 200 and [s["kind"] for s in plan.json()["steps"]] == ["device_rename"], plan.text

        r = client.put(f"{H}/devices/1", json=device, headers={"If-Match": etag})
        assert r.status_code == 202 and r.json()["kind"] == "sync_device", r.text
        job = _wait(client, r.json()["job_id"])
        assert job["status"] == "done", job
        assert len(proxy.syncs) == 1
        sync = proxy.syncs[-1]
        assert sync["entity_id"] == 1 and sync["snapshot_id"] == doc["snapshot_id"]
        assert _device(sync["baseline"], 1)["device"]["extras"] == {"a": 0, "b": 0, "c": 0x07}
        assert _device(sync["edited"], 1)["device"]["extras"] == {"a": 0, "b": 0, "c": 0x0C}
        assert _device(client.get(f"{H}/snapshot").json(), 1)["device"]["extras"]["c"] == 0x0C


def test_device_edit_refuses_a_routing_the_hub_cannot_take(tmp_path: Path) -> None:
    client, factory = _rig(tmp_path)
    with client:
        client.post(HUBS, json={"host": HOST})
        proxy = factory.latest(HOST)
        proxy.model = "X2"
        proxy.fetched = {1, 2, 101, 102}
        proxy.device_blocks[1] = {"extras": {"a": 0, "b": 0, "c": 0x07}}
        doc, etag = _snapshot(client)
        for extras, detail in (
            ({"a": 0, "b": 0, "c": 0}, "at least one emitter"),
            ({"a": 1, "b": 0, "c": 0x07}, "RF-button byte"),
            ({"a": 0, "b": 0, "c": 0x03}, "not one of the choices"),
        ):
            device = _device(doc, 1)
            device["device"]["extras"] = extras
            for r in (client.post(f"{H}/devices/1/plan", json=device),
                      client.put(f"{H}/devices/1", json=device, headers={"If-Match": etag})):
                assert r.status_code == 422, r.text
                assert r.json()["type"] == "out_of_scope" and detail in r.json()["detail"], r.text
        # Dropping the routing is refused too.
        device = _device(doc, 1)
        del device["device"]["extras"]
        r = client.put(f"{H}/devices/1", json=device, headers={"If-Match": etag})
        assert r.status_code == 422 and r.json()["type"] == "out_of_scope", r.text
        assert proxy.syncs == []                                     # refused before any job


def test_device_edit_refuses_a_routing_off_the_x2(tmp_path: Path) -> None:
    client, factory = _rig(tmp_path)                                 # an X1S
    with client:
        client.post(HUBS, json={"host": HOST})
        proxy = factory.latest(HOST)
        proxy.fetched = {1, 2, 101, 102}
        doc, etag = _snapshot(client)
        device = _device(doc, 1)
        device["device"]["extras"] = {"a": 0, "b": 0, "c": 0x07}
        r = client.put(f"{H}/devices/1", json=device, headers={"If-Match": etag})
        assert r.status_code == 422, r.text
        assert r.json()["type"] == "out_of_scope" and "X2 only" in r.json()["detail"]
        assert proxy.syncs == []


def test_add_device_leaves_the_x2_ir_routing_to_the_library(tmp_path: Path) -> None:
    from sofabaton.device_class_profiles import build_empty_device_block

    client, factory = _rig(tmp_path)
    with client:
        client.post(HUBS, json={"host": HOST})
        proxy = factory.latest(HOST)
        proxy.model = "X2"
        r = client.post(f"{H}/devices", json={"name": "Fan", "device_class": "ir"})
        assert r.status_code == 202 and _wait(client, r.json()["job_id"])["status"] == "done"
        # The route passes no routing: the device gets the library's create default.
        assert proxy.intents[-1] == ("add_device", ("Fan", "ir")) and proxy.create_appearance == (None, None)
    # Which is the hub with all its emitters (built-in and both ports), as the Sofabaton app creates one.
    assert build_empty_device_block("Fan", "ir", hub_version="X2")["extras"] == {"a": 0, "b": 0, "c": 0x07}
