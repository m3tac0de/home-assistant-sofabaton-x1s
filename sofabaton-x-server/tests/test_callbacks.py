"""Callback devices (callbacks plan, C1 to C4 and the C7 coverage list):
the listener and its gate, the press stream and ring, the routes and
their 409-versus-failed-job split, stale detection, restart recovery,
and the listener's retry loop."""

from __future__ import annotations

import functools
import json
import socket
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from sofabaton import WIFI_SLOT_COUNT as N
from sofabaton import WifiUpdateDeclined, WifiUpdateFailed

from sofabaton_server import API_PREFIX
from sofabaton_server.app import create_app
from sofabaton_server.callbacks import CallbackService, PressRing, parse_callback_path
from sofabaton_server.cli import build_parser, settings_from_args
from sofabaton_server.config import Settings, load_settings
from sofabaton_server.manager import HubManager

from fakes import Factory, no_network_discovery

HUBS = f"{API_PREFIX}/hubs"
EVENTS = f"{API_PREFIX}/events"
SERVER = f"{API_PREFIX}/server"
LOOPBACK = "127.0.0.1"
MAC = "E2:6A:44:86:1B:45"
HUB_ID = "e26a44861b45"


def _rig(tmp_path: Path, *, port: int = 0, ring: PressRing | None = None, on_build=None, **settings_kw):
    factory = Factory()
    factory.on_build = on_build
    settings = Settings(data_dir=tmp_path, callback_port=port, **settings_kw)
    manager = HubManager(settings, proxy_factory=factory)
    callbacks = CallbackService(manager, settings, ring=ring) if ring is not None else None
    app = create_app(settings, manager=manager, discovery=no_network_discovery(settings, manager), callbacks=callbacks)
    return TestClient(app), factory


def _hub(client, factory, host: str = LOOPBACK):
    client.post(HUBS, json={"host": host})
    proxy = factory.latest(host)
    client.portal.call(proxy.ready, MAC)
    return HUB_ID, proxy


def _wait(client, hub_id, job_id, timeout=5.0):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        job = client.get(f"{HUBS}/{hub_id}/jobs/{job_id}").json()
        if job["status"] in ("done", "failed", "cancelled"):
            return job
        time.sleep(0.01)
    raise AssertionError(f"job {job_id} did not finish: {job}")


def _deploy(client, hub_id, body=None):
    r = client.post(f"{HUBS}/{hub_id}/callback-device", json=body or {"name": "Server", "slots": [{"label": "Play"}]})
    assert r.status_code == 202, r.text
    job = _wait(client, hub_id, r.json()["job_id"])
    assert job["status"] == "done", job
    return job["result"]


def _bound_port(client) -> int:
    state = client.get(f"{SERVER}/callback-listener").json()
    assert state["bound"], state
    return state["bound_port"]


def _post(port: int, path: str, *, headers: dict | None = None, method: str = "POST") -> int:
    extra = "".join(f"{k}: {v}\r\n" for k, v in (headers or {}).items())
    with socket.create_connection((LOOPBACK, port), timeout=3) as sock:
        sock.sendall(f"{method} {path} HTTP/1.1\r\nHost: x\r\n{extra}Content-Length: 0\r\n\r\n".encode("ascii"))
        data = b""
        while True:
            chunk = sock.recv(4096)
            if not chunk:
                break
            data += chunk
    return int(data.split(b" ", 2)[1])


def _until(predicate, timeout=5.0):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        value = predicate()
        if value:
            return value
        time.sleep(0.01)
    raise AssertionError("condition not met in time")


# -- settings --------------------------------------------------------------------


def test_callback_settings_validate_and_map_from_flags(tmp_path: Path) -> None:
    s = load_settings(environ={"SOFABATON_CALLBACK_HOST": "192.168.1.9", "SOFABATON_CALLBACK_PORT": "8061"}, data_dir=tmp_path)
    assert (s.callback_host, s.callback_port) == ("192.168.1.9", 8061)
    assert Settings(data_dir=tmp_path).callback_port == 8060 and Settings(data_dir=tmp_path).callback_host is None
    with pytest.raises(ValueError):
        Settings(data_dir=tmp_path, callback_host="sofabaton.local")
    with pytest.raises(ValueError):
        Settings(data_dir=tmp_path, callback_port=70000)
    args = build_parser().parse_args(["--data-dir", str(tmp_path), "--callback-host", "10.0.0.5", "--callback-port", "9060"])
    s = settings_from_args(args)
    assert (s.callback_host, s.callback_port) == ("10.0.0.5", 9060)


def test_parse_callback_path() -> None:
    parsed = parse_callback_path("/launch/e26a44861b45/12/3/long")
    assert (parsed.action_id, parsed.device_id, parsed.slot_index, parsed.press_type) == ("e26a44861b45", 12, 3, "long")
    assert parse_callback_path("/launch/e26a44861b45/12/3").press_type == "short"
    assert parse_callback_path("/keypress/Home") is None
    assert parse_callback_path("/launch/" + "x" * 31 + "/1/1/short") is None


# -- deploy, presses, the stream and the ring -------------------------------------------


def test_deploy_then_presses_reach_the_stream_and_the_ring(tmp_path: Path) -> None:
    client, factory = _rig(tmp_path)
    with client:
        hub_id, proxy = _hub(client, factory)
        info = client.get(SERVER).json()
        assert "callbacks" in info["features"] and info["callback_listener"]["wanted"] is False
        assert client.get(f"{HUBS}/{hub_id}/callback-device").status_code == 404

        record = _deploy(client, hub_id, {"name": "Server", "slots": [{"label": "Play"}, {"label": "Pause", "long_label": "Hold"}],
                                          "power_on_slot": 1, "input_slots": [2]})
        assert record["device_id"] == 3 and record["deployed"] is True and record["stale"] is False
        assert record["target"] == {"host": "192.168.1.10", "port": _bound_port(client), "action_id": HUB_ID}
        assert record["labels"]["1"] == "Play" and record["labels"][str(1 + N)] == "Play Long"
        assert record["labels"]["2"] == "Pause" and record["labels"][str(2 + N)] == "Hold"
        assert record["spec"]["power_on_slot"] == 1 and record["spec"]["input_slots"] == [2]
        assert record["effective_destination"]["host"] == "192.168.1.10"
        deploy = proxy.wifi_deploys[-1]
        assert deploy["host"] == "192.168.1.10" and deploy["port"] == _bound_port(client)
        assert client.get(f"{HUBS}/{hub_id}/callback-device").json()["device_id"] == 3
        assert client.get(SERVER).json()["callback_listener"]["bound"] is True

        # The record is persisted on the hub row.
        rows = json.loads((tmp_path / "hubs.json").read_text(encoding="utf-8"))["hubs"]
        assert rows[0]["callback_device"]["device_id"] == 3 and rows[0]["callback_device"]["pending"] is None

        port = _bound_port(client)
        with client.websocket_connect(EVENTS) as ws:
            hello = ws.receive_json()
            assert hello["instance_id"] == client.get(SERVER).json()["instance_id"]
            assert _post(port, f"/launch/{HUB_ID}/3/0/short") == 200
            msg = ws.receive_json()
            assert msg["type"] == "press" and msg["hub_id"] == hub_id and msg["seq"] == 1
            assert (msg["device_id"], msg["command_id"], msg["slot"], msg["label"]) == (3, 1, 1, "Play")
            assert msg["press_type"] == "short" and msg["resolution"] == "deployed" and msg["transport"] == "http"
            assert msg["source"] == LOOPBACK
            assert _post(port, f"/launch/{HUB_ID}/3/1/long") == 200
            msg = ws.receive_json()
            assert (msg["seq"], msg["command_id"], msg["label"], msg["press_type"]) == (2, 2 + N, "Hold", "long")
            # Unknown slot and unknown device still arrive, marked as such.
            assert _post(port, f"/launch/{HUB_ID}/3/{N}/short") == 200
            assert ws.receive_json()["resolution"] == "unknown_slot"
            assert _post(port, f"/launch/{HUB_ID}/9/0/short") == 200
            msg = ws.receive_json()
            assert msg["resolution"] == "unknown_device" and msg["label"] is None and msg["command_id"] is None

        page = client.get(f"{HUBS}/{hub_id}/presses").json()
        assert page["instance_id"] == hello["instance_id"] and page["last_seq"] == 4 and page["expired"] is False
        assert [p["seq"] for p in page["presses"]] == [1, 2, 3, 4]
        page = client.get(f"{HUBS}/{hub_id}/presses", params={"after": 2}).json()
        assert [p["seq"] for p in page["presses"]] == [3, 4] and page["expired"] is False
        assert client.get(f"{HUBS}/{hub_id}/callback-device").json()["last_press"]["seq"] == 3   # the unknown-device press is not ours

        # The listener's gate: a bad path, an unknown action id, a GET.
        assert _post(port, "/keypress/Home") == 404
        assert _post(port, "/launch/ffffffffffff/3/0/short") == 404
        assert _post(port, f"/launch/{HUB_ID}/3/0/short", method="GET") == 405


def test_source_gate_and_forwarded_header(tmp_path: Path) -> None:
    client, factory = _rig(tmp_path, trusted_proxies=(LOOPBACK,))
    with client:
        # The hub's address is not the loopback the test connects from.
        hub_id, proxy = _hub(client, factory, host="192.168.1.50")
        _deploy(client, hub_id)
        port = _bound_port(client)
        assert _post(port, f"/launch/{HUB_ID}/3/0/short") == 403
        # Through a trusted proxy, the forwarded client is what the gate sees.
        assert _post(port, f"/launch/{HUB_ID}/3/0/short", headers={"X-Forwarded-For": "192.168.1.50, 10.0.0.1"}) == 200
        assert _post(port, f"/launch/{HUB_ID}/3/0/short", headers={"X-Forwarded-For": "192.168.1.51"}) == 403
        presses = client.get(f"{HUBS}/{hub_id}/presses").json()["presses"]
        assert len(presses) == 1 and presses[0]["source"] == "192.168.1.50"


def test_ring_overflow_reports_expired(tmp_path: Path) -> None:
    ring = PressRing(size=3)
    client, factory = _rig(tmp_path, ring=ring)
    with client:
        hub_id, proxy = _hub(client, factory)
        _deploy(client, hub_id)
        port = _bound_port(client)
        for _ in range(5):
            assert _post(port, f"/launch/{HUB_ID}/3/0/short") == 200
        page = client.get(f"{HUBS}/{hub_id}/presses", params={"after": 0}).json()
        assert [p["seq"] for p in page["presses"]] == [3, 4, 5] and page["expired"] is True
        page = client.get(f"{HUBS}/{hub_id}/presses", params={"after": 2}).json()
        assert [p["seq"] for p in page["presses"]] == [3, 4, 5] and page["expired"] is False
        page = client.get(f"{HUBS}/{hub_id}/presses", params={"after": 5}).json()
        assert page["presses"] == [] and page["expired"] is False


# -- the 409 / failed-job split --------------------------------------------------------


def test_deploy_refusals_are_immediate(tmp_path: Path) -> None:
    client, factory = _rig(tmp_path)
    with client:
        hub_id, proxy = _hub(client, factory)
        _deploy(client, hub_id)
        r = client.post(f"{HUBS}/{hub_id}/callback-device", json={"name": "Again"})
        assert r.status_code == 409 and r.json()["type"] == "callback_device_exists"
        r = client.post(f"{HUBS}/{hub_id}/callback-device", json={"name": "x", "power_on_slot": 1, "input_slots": [1]})
        assert r.status_code in (409, 422)
        assert client.post(f"{HUBS}/nope/callback-device", json={}).status_code == 404
        assert client.get(f"{HUBS}/nope/presses").status_code == 404


def test_x1_needs_port_8060(tmp_path: Path) -> None:
    client, factory = _rig(tmp_path, port=0)
    with client:
        hub_id, proxy = _hub(client, factory)
        proxy.model = "X1"
        r = client.post(f"{HUBS}/{hub_id}/callback-device", json={"name": "Server"})
        assert r.status_code == 409 and r.json()["type"] == "callback_port_x1"
        assert proxy.wifi_deploys == []


def test_update_in_place_and_the_declined_job(tmp_path: Path) -> None:
    client, factory = _rig(tmp_path)
    with client:
        hub_id, proxy = _hub(client, factory)
        _deploy(client, hub_id)
        r = client.put(f"{HUBS}/{hub_id}/callback-device", json={"name": "Server", "slots": [{"label": "Start"}]})
        assert r.status_code == 202
        job = _wait(client, hub_id, r.json()["job_id"])
        assert job["status"] == "done" and job["result"]["labels"]["1"] == "Start"
        update = proxy.wifi_updates[-1]
        assert update["deployment"].labels[1] == "Play" and update["spec"].slots[0].label == "Start"
        record = client.get(f"{HUBS}/{hub_id}/callback-device").json()
        assert record["labels"]["1"] == "Start" and record["pending"] is None

        proxy.wifi_update_error = WifiUpdateDeclined("drift", command_ids=[3])
        r = client.put(f"{HUBS}/{hub_id}/callback-device", json={"name": "Server", "slots": [{"label": "Other"}]})
        assert r.status_code == 202
        job = _wait(client, hub_id, r.json()["job_id"])
        assert job["status"] == "failed" and job["error"]["type"] == "callback_update_declined"
        assert job["error"]["status"] == 409 and "3" in job["error"]["detail"]
        assert client.get(f"{HUBS}/{hub_id}/callback-device").json()["pending"] is None

        proxy.wifi_update_error = WifiUpdateFailed("command_rename", completed_steps=1)
        r = client.put(f"{HUBS}/{hub_id}/callback-device", json={"name": "Server", "slots": [{"label": "Other"}]})
        job = _wait(client, hub_id, r.json()["job_id"])
        assert job["status"] == "failed" and job["error"]["type"] == "callback_update_failed" and job["error"]["status"] == 502


def test_remove_refuses_references_unless_forced(tmp_path: Path) -> None:
    client, factory = _rig(tmp_path)
    with client:
        hub_id, proxy = _hub(client, factory)
        record = _deploy(client, hub_id)
        dev = record["device_id"]
        # Activity 101 lists device 1 as a member (fake default); make it reference ours.
        proxy.fetched.add(101)
        proxy.edited_entities[("activity", 101)] = {
            **proxy._entity("activity", 101, "Watch TV"),
            "referenced_source_device_ids": [1, dev],
            "button_bindings": [{"button_id": 0xB6, "device_id": dev, "command_id": 1}],
        }
        r = client.delete(f"{HUBS}/{hub_id}/callback-device")
        assert r.status_code == 409 and r.json()["type"] == "callback_device_referenced"
        assert "101" in r.json()["detail"] and "binding" in r.json()["detail"]
        r = client.delete(f"{HUBS}/{hub_id}/callback-device", params={"force": "true"})
        assert r.status_code == 202
        job = _wait(client, hub_id, r.json()["job_id"])
        assert job["status"] == "done" and job["result"]["hub_device_removed"] is True
        assert ("remove_device", (dev,)) in proxy.intents
        assert client.get(f"{HUBS}/{hub_id}/callback-device").status_code == 404
        state = _until(lambda: (lambda s: s if not s["wanted"] else None)(client.get(f"{SERVER}/callback-listener").json()))
        assert state["bound"] is False
        assert client.get(f"{HUBS}/{hub_id}/presses").json()["presses"] == []


# -- stale detection and redeploy ----------------------------------------------------------


def test_purged_device_goes_stale_and_redeploys(tmp_path: Path) -> None:
    client, factory = _rig(tmp_path)
    with client:
        hub_id, proxy = _hub(client, factory)
        dev = _deploy(client, hub_id)["device_id"]
        port = _bound_port(client)
        with client.websocket_connect(EVENTS) as ws:
            ws.receive_json()
            # The app purges the device: it leaves the catalog and the snapshot moves.
            proxy.devices_data = [d for d in proxy.devices_data if d.device_id != dev]
            client.portal.call(functools.partial(proxy._emit_snapshot_changed, device_ids=(dev,)))
            record = _until(lambda: (lambda r: r if r["stale"] else None)(client.get(f"{HUBS}/{hub_id}/callback-device").json()))
            assert record["deployed"] is False
            kinds = []
            while len(kinds) < 2:
                msg = ws.receive_json()
                if msg["type"] == "server_event":
                    kinds.append(msg["kind"])
                elif msg["type"] == "hub_event":
                    kinds.append(msg["event"]["kind"])
            assert "callback_device_stale" in kinds
            # The listener stays up: a press from a not-yet-purged binding still arrives, marked stale.
            assert client.get(f"{SERVER}/callback-listener").json()["bound"] is True
            assert _post(port, f"/launch/{HUB_ID}/{dev}/0/short") == 200
            assert ws.receive_json()["resolution"] == "stale"

        r = client.put(f"{HUBS}/{hub_id}/callback-device", json={"name": "Server"})
        assert r.status_code == 409 and r.json()["type"] == "callback_device_stale"
        r = client.post(f"{HUBS}/{hub_id}/callback-device/redeploy")
        assert r.status_code == 202
        job = _wait(client, hub_id, r.json()["job_id"])
        assert job["status"] == "done" and job["result"]["stale"] is False
        assert len(proxy.wifi_deploys) == 2 and job["result"]["adopted"] is False   # a fresh create (ids may be reused)
        assert client.post(f"{HUBS}/{hub_id}/callback-device/redeploy").status_code == 409

        # A device that comes back under a verified identity clears the flag without a redeploy.
        new_dev = job["result"]["device_id"]
        proxy.devices_data = [d for d in proxy.devices_data if d.device_id != new_dev]
        client.portal.call(functools.partial(proxy._emit_snapshot_changed, device_ids=(new_dev,)))
        _until(lambda: client.get(f"{HUBS}/{hub_id}/callback-device").json()["stale"])
        from sofabaton import Device
        proxy.devices_data.append(Device(device_id=new_dev, name="Server", brand="m3tac0de", device_class="wifi_ip",
                                         device_class_code=0x1C, power_state=None, idle_behavior=None))
        client.portal.call(functools.partial(proxy._emit_snapshot_changed, device_ids=(new_dev,)))
        _until(lambda: not client.get(f"{HUBS}/{hub_id}/callback-device").json()["stale"])


def test_removing_a_stale_record_never_deletes_the_device_that_reused_its_id(tmp_path: Path) -> None:
    """CR-S2-1: the app purged our device and the hub gave its id to an
    unrelated TV. Deleting the stale record forgets it; the TV stays, and
    the TV's activities are not reported as references of ours."""
    client, factory = _rig(tmp_path)
    with client:
        hub_id, proxy = _hub(client, factory)
        dev = _deploy(client, hub_id)["device_id"]
        proxy.devices_data = [d for d in proxy.devices_data if d.device_id != dev]
        client.portal.call(functools.partial(proxy._emit_snapshot_changed, device_ids=(dev,)))
        _until(lambda: client.get(f"{HUBS}/{hub_id}/callback-device").json()["stale"])

        # A TV now holds the id, used by activity 101. The fake keys device
        # blocks and payloads by id: drop ours so the TV is really a
        # different device (brand, name and first record).
        from sofabaton import Device
        proxy.device_blocks.pop(dev, None)
        for key in [k for k in proxy.payloads if k[0] == dev]:
            proxy.payloads.pop(key)
        proxy.devices_data.append(Device(device_id=dev, name="Living Room TV", brand="Samsung", device_class="ir",
                                         device_class_code=0x01, power_state=None, idle_behavior=None))
        proxy.fetched.add(101)
        proxy.edited_entities[("activity", 101)] = {
            **proxy._entity("activity", 101, "Watch TV"),
            "referenced_source_device_ids": [1, dev],
            "button_bindings": [{"button_id": 0xB6, "device_id": dev, "command_id": 1}],
        }
        client.portal.call(functools.partial(proxy._emit_snapshot_changed, device_ids=(dev,)))
        assert client.get(f"{HUBS}/{hub_id}/callback-device").json()["stale"] is True

        r = client.delete(f"{HUBS}/{hub_id}/callback-device")
        assert r.status_code == 202, r.json()
        job = _wait(client, hub_id, r.json()["job_id"])
        assert job["status"] == "done" and job["result"]["hub_device_removed"] is False
        assert ("remove_device", (dev,)) not in proxy.intents
        assert any(d.device_id == dev for d in proxy.devices_data)
        assert client.get(f"{HUBS}/{hub_id}/callback-device").status_code == 404


# -- restart recovery ---------------------------------------------------------------------


def _hubs_json(tmp_path: Path) -> list[dict]:
    return json.loads((tmp_path / "hubs.json").read_text(encoding="utf-8"))["hubs"]


def _write_pending(tmp_path: Path, record: dict) -> None:
    doc = json.loads((tmp_path / "hubs.json").read_text(encoding="utf-8"))
    doc["hubs"][0]["callback_device"] = record
    (tmp_path / "hubs.json").write_text(json.dumps(doc), encoding="utf-8")


def _spec_dict(name="Server"):
    from sofabaton import WifiDeviceSpec, WifiSlotSpec
    return WifiDeviceSpec(name=name, slots=(WifiSlotSpec("Play"),)).normalized().to_dict()


def test_boot_adopts_a_pending_create_that_landed(tmp_path: Path) -> None:
    client, factory = _rig(tmp_path)
    with client:
        _hub(client, factory)
    _write_pending(tmp_path, {"device_id": None, "spec": _spec_dict(), "target": {"host": "192.168.1.10", "port": 8060, "action_id": HUB_ID},
                              "pending": {"op": "create", "started_at": "2026-09-11T00:00:00+00:00"}})

    def on_build(proxy):
        from sofabaton import WifiDeviceSpec
        proxy.mac = MAC
        proxy.place_wifi_device(7, WifiDeviceSpec.from_dict(_spec_dict()), host="192.168.1.10", port=8060)

    client, factory = _rig(tmp_path, on_build=on_build)
    with client:
        record = client.get(f"{HUBS}/{HUB_ID}/callback-device").json()
        assert record["device_id"] == 7 and record["adopted"] is True and record["pending"] is None
        assert record["target"]["host"] == "192.168.1.10" and record["labels"]["1"] == "Play"
        assert client.get(f"{SERVER}/callback-listener").json()["wanted"] is True
        assert factory.latest(LOOPBACK).wifi_deploys == []                  # no second device


def test_boot_keeps_a_pending_create_it_cannot_verify_yet(tmp_path: Path) -> None:
    """CR-S2-3: at boot the hub has not dialled back, so the identity read
    fails; the landed create stays pending and is adopted once ready."""
    client, factory = _rig(tmp_path)
    with client:
        _hub(client, factory)
    _write_pending(tmp_path, {"device_id": None, "spec": _spec_dict(), "target": {"host": "192.168.1.10", "port": 8060, "action_id": HUB_ID},
                              "pending": {"op": "create", "started_at": "2026-09-11T00:00:00+00:00"}})

    def on_build(proxy):
        from sofabaton import WifiDeviceSpec
        proxy.mac = MAC
        proxy.offline_until_ready = True
        proxy.place_wifi_device(7, WifiDeviceSpec.from_dict(_spec_dict()), host="192.168.1.10", port=8060)

    client, factory = _rig(tmp_path, on_build=on_build)
    with client:
        record = client.get(f"{HUBS}/{HUB_ID}/callback-device").json()
        assert record["device_id"] is None and record["pending"]["op"] == "create"
        client.portal.call(factory.latest(LOOPBACK).ready, MAC)
        _until(lambda: client.get(f"{HUBS}/{HUB_ID}/callback-device").json()["device_id"] == 7)
        record = client.get(f"{HUBS}/{HUB_ID}/callback-device").json()
        assert record["adopted"] is True and record["pending"] is None
        assert factory.latest(LOOPBACK).wifi_deploys == []


def test_boot_drops_a_pending_create_that_never_landed(tmp_path: Path) -> None:
    client, factory = _rig(tmp_path)
    with client:
        _hub(client, factory)
    _write_pending(tmp_path, {"device_id": None, "spec": _spec_dict(), "target": {"host": "192.168.1.10", "port": 8060, "action_id": HUB_ID},
                              "pending": {"op": "create", "started_at": "2026-09-11T00:00:00+00:00"}})
    client, factory = _rig(tmp_path, on_build=lambda proxy: setattr(proxy, "mac", MAC))
    with client:
        assert client.get(f"{HUBS}/{HUB_ID}/callback-device").status_code == 404
        assert _hubs_json(tmp_path)[0].get("callback_device") is None
        assert client.get(f"{SERVER}/callback-listener").json()["wanted"] is False


def test_boot_settles_pending_update_and_delete(tmp_path: Path) -> None:
    client, factory = _rig(tmp_path)
    with client:
        _hub(client, factory)
    base = {"device_id": 7, "spec": _spec_dict(), "target": {"host": "192.168.1.10", "port": 8060, "action_id": HUB_ID},
            "labels": {"1": "Play"}, "hub_version": "X1S"}

    def with_device(proxy):
        from sofabaton import WifiDeviceSpec
        proxy.mac = MAC
        proxy.place_wifi_device(7, WifiDeviceSpec.from_dict(_spec_dict()), host="192.168.1.10", port=8060)

    _write_pending(tmp_path, {**base, "pending": {"op": "update", "started_at": "x", "spec": _spec_dict("Renamed")}})
    client, factory = _rig(tmp_path, on_build=with_device)
    with client:
        record = client.get(f"{HUBS}/{HUB_ID}/callback-device").json()
        assert record["pending"] is None and record["device_id"] == 7      # the next update resumes via drift

    _write_pending(tmp_path, {**base, "pending": {"op": "delete", "started_at": "x"}})
    client, factory = _rig(tmp_path, on_build=with_device)
    with client:
        record = client.get(f"{HUBS}/{HUB_ID}/callback-device").json()
        assert record["pending"] is None and record["device_id"] == 7      # the delete never landed: kept

    _write_pending(tmp_path, {**base, "pending": {"op": "delete", "started_at": "x"}})
    client, factory = _rig(tmp_path, on_build=lambda proxy: setattr(proxy, "mac", MAC))
    with client:
        assert client.get(f"{HUBS}/{HUB_ID}/callback-device").status_code == 404   # landed: dropped


def test_deploy_adopts_an_orphan_instead_of_duplicating(tmp_path: Path) -> None:
    def on_build(proxy):
        from sofabaton import WifiDeviceSpec
        proxy.mac = MAC
        proxy.place_wifi_device(7, WifiDeviceSpec.from_dict(_spec_dict("Old name")), host="192.168.1.10", port=8060)

    client, factory = _rig(tmp_path, on_build=on_build)
    with client:
        hub_id, proxy = _hub(client, factory)
        record = _deploy(client, hub_id, {"name": "Whatever"})
        assert record["adopted"] is True and record["device_id"] == 7 and record["spec"]["name"] == "Old name"
        assert proxy.wifi_deploys == []


# -- the listener's retry loop ------------------------------------------------------------------


def test_listener_retries_a_taken_port_and_can_be_retried_now(tmp_path: Path) -> None:
    blocker = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    blocker.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 0)
    blocker.bind((LOOPBACK if False else "0.0.0.0", 0))
    blocker.listen(1)
    taken = blocker.getsockname()[1]
    client, factory = _rig(tmp_path, port=taken)
    try:
        with client:
            hub_id, proxy = _hub(client, factory)
            with client.websocket_connect(EVENTS) as ws:
                ws.receive_json()
                record = _deploy(client, hub_id)
                assert record["device_id"] == 3                                  # the deploy still succeeded
                state = client.get(f"{SERVER}/callback-listener").json()
                assert state["wanted"] and not state["bound"] and state["last_error"] and state["next_retry_at"]
                seen = []
                while "callback_listener_failed" not in seen:
                    msg = ws.receive_json()
                    if msg["type"] == "server_event":
                        seen.append(msg["kind"])
                blocker.close()
                state = client.post(f"{SERVER}/callback-listener/retry").json()
                assert state["bound"] and state["bound_port"] == taken and state["last_error"] is None
                while "callback_listener_started" not in seen:
                    msg = ws.receive_json()
                    if msg["type"] == "server_event":
                        seen.append(msg["kind"])
    finally:
        try:
            blocker.close()
        except OSError:
            pass


def test_listener_backoff_binds_on_its_own(tmp_path: Path, monkeypatch) -> None:
    import sofabaton_server.callbacks as callbacks_mod
    monkeypatch.setattr(callbacks_mod, "RETRY_MIN_SECONDS", 0.05)
    monkeypatch.setattr(callbacks_mod, "RETRY_MAX_SECONDS", 0.2)
    blocker = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    blocker.bind(("0.0.0.0", 0))
    blocker.listen(1)
    taken = blocker.getsockname()[1]
    client, factory = _rig(tmp_path, port=taken)
    try:
        with client:
            hub_id, proxy = _hub(client, factory)
            _deploy(client, hub_id)
            assert client.get(f"{SERVER}/callback-listener").json()["bound"] is False
            blocker.close()
            state = _until(lambda: (lambda s: s if s["bound"] else None)(client.get(f"{SERVER}/callback-listener").json()))
            assert state["bound_port"] == taken and state["next_retry_at"] is None
    finally:
        try:
            blocker.close()
        except OSError:
            pass
