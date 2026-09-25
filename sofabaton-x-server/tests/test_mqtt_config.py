"""The MQTT broker as the control panel manages it (mqtt_config.py,
routes_mqtt.py): stored in mqtt.json only by a signed-in admin, the
password write-only and dropped when the destination moves, the command
line and environment still in charge when they set it, applied live, and
the Test button against a broker that speaks the real protocol."""

from __future__ import annotations

import json
import os
from pathlib import Path

from sofabaton_server import API_PREFIX
from sofabaton_server.auth import AuthStore

from test_callbacks import HUB_ID, HUBS, LOOPBACK, MAC, SERVER, _hub, _rig, _until
from test_mqtt import TOPIC, FakeBroker, _create, _x2

CONFIG = f"{API_PREFIX}/server/mqtt/config"
TEST = f"{API_PREFIX}/server/mqtt/test"
PASSWORD = "correct horse"


def _signed_in(tmp_path: Path, **settings):
    """A claimed server and a client signed in to its panel."""

    store = AuthStore(tmp_path)
    if not store.claimed:
        store.setup("admin", PASSWORD)
    client, factory = _rig(tmp_path, **settings)
    return client, factory


def _login(client) -> None:
    assert client.post(f"{API_PREFIX}/auth/login", json={"username": "admin", "password": PASSWORD}).status_code == 200


def test_unclaimed_reads_but_cannot_set_a_broker(tmp_path: Path) -> None:
    client, _factory = _rig(tmp_path)
    with client:
        view = client.get(CONFIG).json()
        assert view["source"] == "none" and view["editable"] is True and view["password_set"] is False
        r = client.put(CONFIG, json={"host": "broker.lan"})
        assert r.status_code == 409 and r.json()["type"] == "not_claimed"
        assert client.post(TEST, json={"host": "broker.lan"}).status_code == 409
    assert not (tmp_path / "mqtt.json").exists()


def test_a_signed_in_admin_sets_the_broker_and_it_applies_live(tmp_path: Path) -> None:
    with FakeBroker(username="hub", password="s3cret") as broker:
        client, factory = _signed_in(tmp_path)
        with client:
            _login(client)
            hub_id, proxy = _hub(client, factory)
            _x2(proxy)
            assert client.get(f"{HUBS}/{hub_id}/wifi-devices").json()["transports"] == ["http"]      # no broker yet
            body = {"host": LOOPBACK, "port": broker.port, "username": "hub", "password": "s3cret"}
            view = client.put(CONFIG, json=body).json()
            assert (view["source"], view["password_set"], view["effective_port"]) == ("panel", True, broker.port)
            assert "s3cret" not in json.dumps(view)
            # Live: the transport is offered at once, and a device subscribes without a restart.
            assert client.get(f"{HUBS}/{hub_id}/wifi-devices").json()["transports"] == ["mqtt", "http"]
            info = client.get(SERVER).json()
            assert "mqtt" in info["features"] and "s3cret" not in json.dumps(info)
            _create(client, hub_id, {"name": "Lights", "transport": "mqtt", "slots": [{"label": "On"}]})
            _until(lambda: broker.subscriptions == [TOPIC])
            assert broker.connects[-1]["password"] == "s3cret"
            assert client.get(CONFIG).json()["devices_using"] == 1
        stored = json.loads((tmp_path / "mqtt.json").read_text(encoding="utf-8"))
        assert stored["password"] == "s3cret" and stored["host"] == LOOPBACK       # in the clear, by design
        if os.name != "nt":
            assert (tmp_path / "mqtt.json").stat().st_mode & 0o777 == 0o600
        assert not (tmp_path / "server.json").exists() or "s3cret" not in (tmp_path / "server.json").read_text(encoding="utf-8")

        # A restart reads mqtt.json back.
        client, factory = _rig(tmp_path, on_build=lambda p: (setattr(p, "mac", MAC), _x2(p)))
        with client:
            client.portal.call(factory.latest(LOOPBACK).ready, MAC)
            assert client.get(CONFIG).json()["source"] == "panel"
            _until(lambda: len(broker.subscriptions) >= 2)


def test_moving_the_destination_drops_the_stored_password(tmp_path: Path) -> None:
    client, _factory = _signed_in(tmp_path)
    with client:
        _login(client)
        client.put(CONFIG, json={"host": "broker.lan", "username": "hub", "password": "s3cret"})
        # Same destination, password left out: kept.
        kept = client.put(CONFIG, json={"host": "broker.lan", "username": "hub", "client_id": "sofa-1"}).json()
        assert kept["password_set"] is True and kept["password_dropped"] is False and kept["client_id"] == "sofa-1"
        # Somewhere else without a new password: dropped, never sent to the new place.
        for change in ({"host": "evil.lan", "username": "hub"}, {"host": "broker.lan", "username": "hub", "port": 1884},
                       {"host": "broker.lan", "username": "other"}):
            client.put(CONFIG, json={"host": "broker.lan", "username": "hub", "password": "s3cret"})
            moved = client.put(CONFIG, json=change).json()
            assert moved["password_set"] is False and moved["password_dropped"] is True, change
        assert "s3cret" not in (tmp_path / "mqtt.json").read_text(encoding="utf-8")
        # Moving with a new password is fine; an empty one clears it.
        assert client.put(CONFIG, json={"host": "evil.lan", "username": "hub", "password": "new"}).json()["password_set"] is True
        assert client.put(CONFIG, json={"host": "evil.lan", "username": "hub", "password": ""}).json()["password_set"] is False


def test_the_test_button_uses_the_same_rules(tmp_path: Path) -> None:
    with FakeBroker(username="hub", password="s3cret") as broker:
        client, _factory = _signed_in(tmp_path)
        with client:
            _login(client)
            here = {"host": LOOPBACK, "port": broker.port, "username": "hub"}
            ok = client.post(TEST, json={**here, "password": "s3cret"}).json()
            assert ok["ok"] is True and ok["error"] is None
            assert broker.connects[-1]["client_id"].startswith("sofabaton-x-server-test-")
            bad = client.post(TEST, json={**here, "password": "wrong"}).json()
            assert bad == {**bad, "ok": False, "error": "bad user name or password"}
            client.put(CONFIG, json={**here, "password": "s3cret"})
            assert client.post(TEST, json=here).json()["ok"] is True                       # the stored password, same place
            count = len(broker.connects)
            elsewhere = client.post(TEST, json={**here, "port": 1}).json()                # moved: no password goes along
            assert elsewhere["ok"] is False and len(broker.connects) == count
        assert json.loads((tmp_path / "mqtt.json").read_text(encoding="utf-8"))["port"] == broker.port   # a test saves nothing


def test_tokens_cannot_touch_the_broker(tmp_path: Path) -> None:
    store = AuthStore(tmp_path)
    store.setup("admin", PASSWORD)
    _info, token = store.create_token("Hubitat")
    client, _factory = _rig(tmp_path)
    with client:
        auth = {"Authorization": f"Bearer {token}"}
        for method, url in (("put", CONFIG), ("post", TEST)):
            r = getattr(client, method)(url, json={"host": "evil.lan"}, headers=auth)
            assert r.status_code == 403 and r.json()["type"] == "admin_required"
        assert client.delete(CONFIG, headers=auth).status_code == 403
        assert client.get(CONFIG).status_code == 200                                     # reading is free, no secret in it


def test_startup_settings_own_the_broker(tmp_path: Path) -> None:
    (tmp_path / "mqtt.json").write_text(json.dumps({"schema": 1, "host": "panel.lan", "tls": False, "tls_insecure": False}), encoding="utf-8")
    client, _factory = _signed_in(tmp_path, mqtt_host="startup.lan", mqtt_username="hub", mqtt_password="env-secret",
                                  pinned=frozenset({"mqtt_host", "mqtt_username", "mqtt_password"}))
    with client:
        _login(client)
        view = client.get(CONFIG).json()
        assert (view["source"], view["editable"], view["host"], view["password_set"]) == ("startup", False, "startup.lan", True)
        assert "env-secret" not in json.dumps(view)
        for r in (client.put(CONFIG, json={"host": "x.lan"}), client.delete(CONFIG)):
            assert r.status_code == 409 and r.json()["type"] == "setting_pinned"


def test_validation_and_removal(tmp_path: Path) -> None:
    client, _factory = _signed_in(tmp_path)
    with client:
        _login(client)
        for body in ({"host": "mqtt://broker.lan"}, {"host": "  "}, {"host": "b.lan", "tls_ca": "/ca.pem"},
                     {"host": "b.lan", "tls_insecure": True}, {"host": "b.lan", "password": "p"},
                     {"host": "b.lan", "tls": True, "tls_ca": str(tmp_path / "missing.pem")},
                     {"host": "b.lan", "client_id": "has space"}):
            r = client.put(CONFIG, json=body)
            assert r.status_code == 422 and r.json()["type"] in ("invalid_mqtt_config", "validation_error"), body
        (tmp_path / "ca.pem").write_text("-----BEGIN CERTIFICATE-----\n", encoding="utf-8")
        tls = client.put(CONFIG, json={"host": "b.lan", "tls": True, "tls_ca": str(tmp_path / "ca.pem")}).json()
        assert tls["effective_port"] == 8883 and tls["port"] is None
        assert client.delete(CONFIG).status_code == 204
        assert client.get(CONFIG).json()["source"] == "none" and not (tmp_path / "mqtt.json").exists()
        assert client.get(SERVER).json()["mqtt"]["configured"] is False
