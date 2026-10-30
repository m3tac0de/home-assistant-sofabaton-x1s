"""The delivery test (wifi webhook transport plan, wave 4): every deploy,
update and redeploy of a Wifi Device ends with a test press that is
claimed before it becomes a press event; the verdict lands in the record's
``delivery``; ``POST .../test-delivery`` runs it on request; a real press
settles a failed one."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

from test_callbacks import EVENTS, HUB_ID, HUBS, _bound_port, _deploy, _hub, _post, _rig, _wait
from test_wifi_devices import _create


def _arrives_over_the_listener(port: int):
    """A probe hook that makes the hub call the listener back for slot 1 short."""

    async def hook(deployment, _arrived) -> None:
        await asyncio.to_thread(_post, port, f"/launch/{HUB_ID}/{deployment.device_id}/0/short")

    return hook


def test_a_deploy_tests_delivery_inside_its_batch(tmp_path: Path) -> None:
    client, factory = _rig(tmp_path)
    with client:
        hub_id, proxy = _hub(client, factory)
        record = _create(client, hub_id, {"name": "Lights", "slots": [{"label": "On"}]})
        # Nothing called back: the hub took the press, nothing arrived.
        delivery = record["delivery"]
        assert delivery["status"] == "not_delivered" and delivery["via"] == "test"
        assert delivery["transport"] == "http"
        assert delivery["target"] == f"http://192.168.1.10:{_bound_port(client)}"
        assert delivery["hub_ip"] == "127.0.0.1"
        # The create and its test press ran in one batch (its one remote sync comes after).
        assert proxy.batches == 1 and proxy.probes == [record["device_id"]]
        row = json.loads((tmp_path / "hubs.json").read_text(encoding="utf-8"))["hubs"][0]
        assert row["wifi_devices"][record["key"]]["delivery"]["status"] == "not_delivered"


def test_a_test_press_that_arrives_is_never_a_press_event(tmp_path: Path) -> None:
    client, factory = _rig(tmp_path)
    with client:
        hub_id, proxy = _hub(client, factory)
        # The listener comes up with the first device; a first one gives the port.
        _create(client, hub_id, {"name": "First"})
        proxy.probe_hook = _arrives_over_the_listener(_bound_port(client))
        record = _create(client, hub_id, {"name": "Lights", "slots": [{"label": "On"}]})
        delivery = record["delivery"]
        assert delivery["status"] == "delivered" and delivery["source"] == "127.0.0.1"
        assert delivery["latency_s"] == 0.05
        page = client.get(f"{HUBS}/{hub_id}/presses").json()
        assert page["presses"] == []
        # A repeat right after the test is still the test's.
        assert _post(_bound_port(client), f"/launch/{HUB_ID}/{record['device_id']}/0/short") == 200
        assert client.get(f"{HUBS}/{hub_id}/presses").json()["presses"] == []
        # Another slot is an ordinary press.
        with client.websocket_connect(EVENTS) as ws:
            ws.receive_json()
            assert _post(_bound_port(client), f"/launch/{HUB_ID}/{record['device_id']}/0/long") == 200
            assert ws.receive_json()["press_type"] == "long"


def test_a_real_press_settles_a_failed_test(tmp_path: Path) -> None:
    client, factory = _rig(tmp_path)
    with client:
        hub_id, _proxy = _hub(client, factory)
        record = _create(client, hub_id, {"name": "Lights", "slots": [{"label": "On"}, {"label": "Off"}]})
        assert record["delivery"]["status"] == "not_delivered"
        assert _post(_bound_port(client), f"/launch/{HUB_ID}/{record['device_id']}/1/short") == 200
        view = client.get(f"{HUBS}/{hub_id}/wifi-devices/{record['key']}").json()
        assert view["delivery"]["status"] == "delivered" and view["delivery"]["via"] == "press"
        row = json.loads((tmp_path / "hubs.json").read_text(encoding="utf-8"))["hubs"][0]
        assert row["wifi_devices"][record["key"]]["delivery"]["status"] == "delivered"


def test_test_delivery_on_request(tmp_path: Path) -> None:
    client, factory = _rig(tmp_path)
    with client:
        hub_id, proxy = _hub(client, factory)
        record = _create(client, hub_id, {"name": "Lights", "slots": [{"label": "On"}]})
        proxy.probe_hook = _arrives_over_the_listener(_bound_port(client))
        r = client.post(f"{HUBS}/{hub_id}/wifi-devices/{record['key']}/test-delivery")
        assert r.status_code == 202, r.text
        job = _wait(client, hub_id, r.json()["job_id"])
        assert job["kind"] == "test_wifi_delivery" and job["status"] == "done", job
        assert job["result"]["delivery"]["status"] == "delivered"
        assert job["progress"]["phase"] == "testing_delivery"
        assert client.post(f"{HUBS}/{hub_id}/wifi-devices/nope/test-delivery").status_code == 404
        # The callback device answers under its key too.
        _deploy(client, hub_id)
        r = client.post(f"{HUBS}/{hub_id}/wifi-devices/default/test-delivery")
        assert _wait(client, hub_id, r.json()["job_id"])["status"] == "done"


def test_a_test_that_cannot_run_never_fails_the_deploy(tmp_path: Path) -> None:
    client, factory = _rig(tmp_path)
    with client:
        hub_id, proxy = _hub(client, factory)

        async def broken(_deployment, _arrived) -> None:
            raise RuntimeError("the hub went away")

        proxy.probe_hook = broken
        record = _create(client, hub_id, {"name": "Lights", "slots": [{"label": "On"}]})
        assert record["deployed"] is True and record["delivery"] is None
