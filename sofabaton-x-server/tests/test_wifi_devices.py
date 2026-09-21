"""Wifi Devices (server panel wifi commands plan, section 2): the keyed
collection the callback device is one of. The single-device behaviour is
covered by test_callbacks.py; this file covers what the keys add: the
list, the ``c0-<key>`` brand, presses resolved across devices with their
``device_key``, the per-hub limit, per-key update / remove / stale /
redeploy, and restart recovery of a pending keyed create."""

from __future__ import annotations

import functools
import json
from pathlib import Path

from sofabaton import WIFI_SLOT_COUNT as N
from sofabaton import WifiDeviceSpec, WifiSlotSpec

from sofabaton_server.callbacks import MAX_WIFI_DEVICES

from test_callbacks import EVENTS, HUB_ID, HUBS, LOOPBACK, MAC, SERVER, _bound_port, _hub, _post, _rig, _until, _wait


def _create(client, hub_id, body):
    r = client.post(f"{HUBS}/{hub_id}/wifi-devices", json=body)
    assert r.status_code == 202, r.text
    job = _wait(client, hub_id, r.json()["job_id"])
    assert job["kind"] == "deploy_wifi_device" and job["status"] == "done", job
    return job["result"]


def test_list_create_and_the_server_brand(tmp_path: Path) -> None:
    client, factory = _rig(tmp_path)
    with client:
        hub_id, proxy = _hub(client, factory)
        listing = client.get(f"{HUBS}/{hub_id}/wifi-devices").json()
        assert listing["devices"] == [] and listing["max_devices"] == MAX_WIFI_DEVICES and listing["transports"] == ["http"]
        assert listing["effective_destination"]["host"] == "192.168.1.10"

        lights = _create(client, hub_id, {"name": "Lights", "slots": [{"label": "On"}, {"label": "Off"}], "power_on_slot": 1})
        key = lights["key"]
        assert key != "default" and len(key) == 8 and lights["transport"] == "http"
        assert lights["device_id"] == 3 and lights["deployed"] is True
        assert lights["spec"]["brand"] == f"c0-{key}" and lights["spec"]["power_on_slot"] == 1
        assert proxy.wifi_deploys[-1]["spec"].brand == f"c0-{key}"
        assert proxy.device_blocks[3]["brand"] == f"c0-{key}"

        # The callback device of the 0.2.0 API is one of them, under the reserved key, and keeps its brand.
        r = client.post(f"{HUBS}/{hub_id}/callback-device", json={"name": "Server"})
        assert _wait(client, hub_id, r.json()["job_id"])["status"] == "done"
        listing = client.get(f"{HUBS}/{hub_id}/wifi-devices").json()
        assert [(d["key"], d["device_id"]) for d in listing["devices"]] == [("default", 4), (key, 3)]
        assert listing["devices"][0]["spec"]["brand"] == "m3tac0de"
        assert client.get(f"{HUBS}/{hub_id}/wifi-devices/default").json()["device_id"] == 4
        assert client.get(f"{HUBS}/{hub_id}/wifi-devices/{key}").json()["spec"]["name"] == "Lights"
        assert client.get(f"{HUBS}/{hub_id}/wifi-devices/nope").status_code == 404

        # Persisted beside the callback device, not in its place.
        row = json.loads((tmp_path / "hubs.json").read_text(encoding="utf-8"))["hubs"][0]
        assert row["callback_device"]["device_id"] == 4 and row["wifi_devices"][key]["device_id"] == 3


def test_presses_resolve_across_devices_with_their_key(tmp_path: Path) -> None:
    client, factory = _rig(tmp_path)
    with client:
        hub_id, _proxy = _hub(client, factory)
        a = _create(client, hub_id, {"name": "Lights", "slots": [{"label": "On"}]})
        b = _create(client, hub_id, {"name": "Blinds", "slots": [{"label": "Up"}, {"label": "Down", "long_label": "All down"}]})
        port = _bound_port(client)
        with client.websocket_connect(EVENTS) as ws:
            ws.receive_json()
            assert _post(port, f"/launch/{HUB_ID}/{a['device_id']}/0/short") == 200
            msg = ws.receive_json()
            assert (msg["device_key"], msg["device_id"], msg["slot"], msg["label"]) == (a["key"], a["device_id"], 1, "On")
            assert _post(port, f"/launch/{HUB_ID}/{b['device_id']}/1/long") == 200
            msg = ws.receive_json()
            assert (msg["device_key"], msg["command_id"], msg["label"], msg["press_type"]) == (b["key"], 2 + N, "All down", "long")
            assert _post(port, f"/launch/{HUB_ID}/9/0/short") == 200
            msg = ws.receive_json()
            assert msg["resolution"] == "unknown_device" and msg["device_key"] is None
        page = client.get(f"{HUBS}/{hub_id}/presses").json()
        assert [p["device_key"] for p in page["presses"]] == [a["key"], b["key"], None]
        assert client.get(f"{HUBS}/{hub_id}/wifi-devices/{a['key']}").json()["last_press"]["seq"] == 1
        assert client.get(f"{HUBS}/{hub_id}/wifi-devices/{b['key']}").json()["last_press"]["seq"] == 2


def test_the_limit_counts_every_record(tmp_path: Path) -> None:
    client, factory = _rig(tmp_path)
    with client:
        hub_id, proxy = _hub(client, factory)
        for index in range(MAX_WIFI_DEVICES):
            _create(client, hub_id, {"name": f"Device {index + 1}"})
        r = client.post(f"{HUBS}/{hub_id}/wifi-devices", json={"name": "One too many"})
        assert r.status_code == 409 and r.json()["type"] == "wifi_device_limit"
        r = client.post(f"{HUBS}/{hub_id}/callback-device", json={"name": "Server"})
        assert r.status_code == 409 and r.json()["type"] == "wifi_device_limit"
        assert len(proxy.wifi_deploys) == MAX_WIFI_DEVICES


def test_update_and_remove_by_key(tmp_path: Path) -> None:
    client, factory = _rig(tmp_path)
    with client:
        hub_id, proxy = _hub(client, factory)
        a = _create(client, hub_id, {"name": "Lights", "slots": [{"label": "On"}]})
        b = _create(client, hub_id, {"name": "Blinds", "slots": [{"label": "Up"}]})

        r = client.put(f"{HUBS}/{hub_id}/wifi-devices/{a['key']}", json={"name": "Lamps", "slots": [{"label": "Toggle"}], "input_slots": [1]})
        assert r.status_code == 202, r.text
        job = _wait(client, hub_id, r.json()["job_id"])
        assert job["kind"] == "update_wifi_device" and job["status"] == "done"
        assert job["result"]["key"] == a["key"] and job["result"]["labels"]["1"] == "Toggle"
        assert job["result"]["spec"]["brand"] == f"c0-{a['key']}" and job["result"]["spec"]["input_slots"] == [1]
        update = proxy.wifi_updates[-1]
        assert update["device_id"] == a["device_id"] and update["spec"].brand == f"c0-{a['key']}"
        assert client.get(f"{HUBS}/{hub_id}/wifi-devices/{b['key']}").json()["spec"]["name"] == "Blinds"   # the other one is untouched
        assert client.put(f"{HUBS}/{hub_id}/wifi-devices/nope", json={"name": "X"}).status_code == 404

        # Remove one: the other stays, and so does the listener.
        r = client.delete(f"{HUBS}/{hub_id}/wifi-devices/{a['key']}")
        assert r.status_code == 202
        job = _wait(client, hub_id, r.json()["job_id"])
        assert job["kind"] == "remove_wifi_device" and job["result"]["key"] == a["key"] and job["result"]["hub_device_removed"] is True
        assert ("remove_device", (a["device_id"],)) in proxy.intents
        assert [d["key"] for d in client.get(f"{HUBS}/{hub_id}/wifi-devices").json()["devices"]] == [b["key"]]
        assert client.get(f"{SERVER}/callback-listener").json()["wanted"] is True
        r = client.delete(f"{HUBS}/{hub_id}/wifi-devices/{b['key']}")
        assert _wait(client, hub_id, r.json()["job_id"])["status"] == "done"
        assert _until(lambda: client.get(f"{SERVER}/callback-listener").json()["wanted"] is False)


def test_remove_refuses_references_unless_forced(tmp_path: Path) -> None:
    client, factory = _rig(tmp_path)
    with client:
        hub_id, proxy = _hub(client, factory)
        a = _create(client, hub_id, {"name": "Lights"})
        proxy.fetched.add(101)
        proxy.edited_entities[("activity", 101)] = {
            **proxy._entity("activity", 101, "Watch TV"),
            "favorite_slots": [{"device_id": a["device_id"], "command_id": 1}],
        }
        r = client.delete(f"{HUBS}/{hub_id}/wifi-devices/{a['key']}")
        assert r.status_code == 409 and r.json()["type"] == "callback_device_referenced" and "101" in r.json()["detail"]
        r = client.delete(f"{HUBS}/{hub_id}/wifi-devices/{a['key']}", params={"force": "true"})
        assert r.status_code == 202 and _wait(client, hub_id, r.json()["job_id"])["status"] == "done"


def test_one_device_goes_stale_and_redeploys_under_its_key(tmp_path: Path) -> None:
    client, factory = _rig(tmp_path)
    with client:
        hub_id, proxy = _hub(client, factory)
        a = _create(client, hub_id, {"name": "Lights", "slots": [{"label": "On"}]})
        b = _create(client, hub_id, {"name": "Blinds"})
        proxy.devices_data = [d for d in proxy.devices_data if d.device_id != a["device_id"]]
        client.portal.call(functools.partial(proxy._emit_snapshot_changed, device_ids=(a["device_id"],)))
        _until(lambda: client.get(f"{HUBS}/{hub_id}/wifi-devices/{a['key']}").json()["stale"])
        assert client.get(f"{HUBS}/{hub_id}/wifi-devices/{b['key']}").json()["stale"] is False
        assert client.post(f"{HUBS}/{hub_id}/wifi-devices/{b['key']}/redeploy").status_code == 409

        r = client.post(f"{HUBS}/{hub_id}/wifi-devices/{a['key']}/redeploy")
        assert r.status_code == 202
        job = _wait(client, hub_id, r.json()["job_id"])
        assert job["kind"] == "redeploy_wifi_device" and job["status"] == "done"
        assert job["result"]["key"] == a["key"] and job["result"]["stale"] is False
        assert job["result"]["spec"]["brand"] == f"c0-{a['key']}" and job["result"]["labels"]["1"] == "On"
        assert len(client.get(f"{HUBS}/{hub_id}/wifi-devices").json()["devices"]) == 2


def test_boot_adopts_a_pending_keyed_create_by_its_brand(tmp_path: Path) -> None:
    client, factory = _rig(tmp_path)
    with client:
        _hub(client, factory)
    key = "a1b2c3d4"
    spec = WifiDeviceSpec(name="Lights", slots=(WifiSlotSpec("On"),), brand=f"c0-{key}").normalized()
    doc = json.loads((tmp_path / "hubs.json").read_text(encoding="utf-8"))
    doc["hubs"][0]["wifi_devices"] = {key: {
        "key": key, "transport": "http", "device_id": None, "spec": spec.to_dict(),
        "target": {"host": "192.168.1.10", "port": 8060, "action_id": HUB_ID},
        "pending": {"op": "create", "started_at": "2026-09-21T00:00:00+00:00"}}}
    (tmp_path / "hubs.json").write_text(json.dumps(doc), encoding="utf-8")

    def on_build(proxy):
        proxy.mac = MAC
        # Another server-made device with the same name but another key is not ours.
        other = WifiDeviceSpec(name="Lights", brand="c0-ffffffff").normalized()
        proxy.place_wifi_device(6, other, host="192.168.1.10", port=8060, brand=other.brand)
        proxy.place_wifi_device(7, spec, host="192.168.1.10", port=8060, brand=spec.brand)

    client, factory = _rig(tmp_path, on_build=on_build)
    with client:
        record = client.get(f"{HUBS}/{HUB_ID}/wifi-devices/{key}").json()
        assert record["device_id"] == 7 and record["adopted"] is True and record["pending"] is None
        assert record["labels"]["1"] == "On"
        assert factory.latest(LOOPBACK).wifi_deploys == []
        # No record for the default key, and the c0- devices are never adopted as the callback device.
        assert client.get(f"{HUBS}/{HUB_ID}/callback-device").status_code == 404


def test_slots_say_where_their_commands_go(tmp_path: Path) -> None:
    client, factory = _rig(tmp_path)
    with client:
        hub_id, proxy = _hub(client, factory)
        a = _create(client, hub_id, {"name": "Lights", "slots": [{"label": "On"}, {"label": "Off"}]})
        body = {"name": "Lights", "slots": [
            {"label": "On", "favorite": True, "button": 182, "long_press": True, "activities": [102, 101]},
            {"label": "Off", "activities": [101]},                       # a list with nothing to hold it is dropped
            {"label": "Scene", "input_activity_id": 101},
        ]}
        r = client.put(f"{HUBS}/{hub_id}/wifi-devices/{a['key']}", json=body)
        assert r.status_code == 202, r.text
        job = _wait(client, hub_id, r.json()["job_id"])
        assert job["status"] == "done", job
        slots = job["result"]["spec"]["slots"]
        assert slots[0] == {"label": "On", "long_label": "On Long", "favorite": True, "button": 182, "long_press": True,
                            "activities": [101, 102], "input_activity_id": None}
        assert slots[1]["activities"] == [] and slots[2]["input_activity_id"] == 101
        sent = proxy.wifi_updates[-1]["spec"]
        assert sent.slots[0].button == 182 and sent.slots[0].activities == (101, 102) and sent.has_references
        # The record keeps them, so the next update's ownership scope is what this one wrote.
        assert client.get(f"{HUBS}/{hub_id}/wifi-devices/{a['key']}").json()["spec"]["slots"][0]["favorite"] is True

        # The card's rules are the library's: one slot per button, one input per activity, a real button code.
        for bad in ([{"label": "a", "button": 182}, {"label": "b", "button": 182}],
                    [{"label": "a", "input_activity_id": 101}, {"label": "b", "input_activity_id": 101}],
                    [{"label": "a", "button": 198}]):
            r = client.put(f"{HUBS}/{hub_id}/wifi-devices/{a['key']}", json={"name": "Lights", "slots": bad})
            assert r.status_code == 422 and r.json()["type"] == "invalid_request", r.text


def test_delete_asks_only_about_references_the_spec_did_not_make(tmp_path: Path) -> None:
    client, factory = _rig(tmp_path)
    with client:
        hub_id, proxy = _hub(client, factory)
        a = _create(client, hub_id, {"name": "Lights", "slots": [{"label": "On", "favorite": True, "button": 182, "activities": [101]}]})
        dev = a["device_id"]
        proxy.fetched.add(101)
        ours = {**proxy._entity("activity", 101, "Watch TV"), "referenced_source_device_ids": [1, dev],
                "favorite_slots": [{"device_id": dev, "command_id": 1}],
                "button_bindings": [{"button_id": 182, "device_id": dev, "command_id": 1}]}
        # With a macro step made in the activity editor on top, the delete asks; the detail names only that.
        proxy.edited_entities[("activity", 101)] = {**ours, "macros": [{"button_id": 1, "steps": [{"device_id": dev, "command_id": 2}]}]}
        r = client.delete(f"{HUBS}/{hub_id}/wifi-devices/{a['key']}")
        assert r.status_code == 409 and r.json()["type"] == "callback_device_referenced"
        assert "macro" in r.json()["detail"] and "favorite" not in r.json()["detail"]
        # Row by row: a button the spec does not claim is foreign even next to one it does claim, and the
        # steps a membership puts into the power macros are the membership, not a macro reference.
        power = [{"button_id": 198, "steps": [{"device_id": dev, "command_id": 198}, {"device_id": dev, "command_id": 197}]},
                 {"button_id": 199, "steps": [{"device_id": dev, "command_id": 199}]}]
        proxy.edited_entities[("activity", 101)] = {**ours, "macros": power, "button_bindings": ours["button_bindings"] + [
            {"button_id": 192, "device_id": dev, "command_id": 4}]}
        r = client.delete(f"{HUBS}/{hub_id}/wifi-devices/{a['key']}")
        assert r.status_code == 409 and "101 (binding)" in r.json()["detail"], r.text
        # What its own slots put there goes with it, no force needed.
        proxy.edited_entities[("activity", 101)] = {**ours, "macros": power}
        r = client.delete(f"{HUBS}/{hub_id}/wifi-devices/{a['key']}")
        assert r.status_code == 202 and _wait(client, hub_id, r.json()["job_id"])["status"] == "done"
