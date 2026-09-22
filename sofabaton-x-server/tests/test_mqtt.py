"""The mqtt transport (server panel wifi commands plan, section 7): the
broker settings come from the command line and the environment only and
the password shows up nowhere; the small MQTT client against a fake
broker that speaks the real protocol (credentials, subscribe, keepalive,
reconnect); and the service end to end: an X2 is offered the transport, a
deploy names no address and needs no listener, the hub's publish on
``<MAC>/up`` comes out as the same ``press``, retained and foreign
messages are dropped."""

from __future__ import annotations

import asyncio
import json
import threading
import time
from pathlib import Path

import pytest

from sofabaton import WIFI_SLOT_COUNT as N

from sofabaton_server import mqtt_client
from sofabaton_server.cli import build_parser, settings_from_args
from sofabaton_server.config import Settings, load_settings
from sofabaton_server.mqtt_client import MqttSubscriber, encode_str, packet, read_packet

from test_callbacks import EVENTS, HUB_ID, HUBS, LOOPBACK, MAC, SERVER, _hub, _rig, _until, _wait

TOPIC = "E26A44861B45/up"


# -- a broker that speaks enough MQTT 3.1.1 ----------------------------------------------------------------


class FakeBroker:
    """One thread, its own loop: accepts clients, checks credentials, records
    subscriptions, answers pings, and publishes what a test tells it to."""

    def __init__(self, *, username: str | None = None, password: str | None = None) -> None:
        self.username, self.password = username, password
        self.connects: list[dict] = []
        self.subscriptions: list[str] = []
        self.unsubscriptions: list[str] = []
        self.pings = 0
        self.port = 0
        self._writers: list[asyncio.StreamWriter] = []
        self._loop = asyncio.new_event_loop()
        self._ready = threading.Event()
        self._thread = threading.Thread(target=self._serve, daemon=True)
        self._server: asyncio.AbstractServer | None = None

    def __enter__(self) -> "FakeBroker":
        self._thread.start()
        assert self._ready.wait(5)
        return self

    def __exit__(self, *exc) -> None:
        self.stop()

    def _serve(self) -> None:
        asyncio.set_event_loop(self._loop)
        self._server = self._loop.run_until_complete(asyncio.start_server(self._client, LOOPBACK, self.port))
        self.port = self._server.sockets[0].getsockname()[1]
        self._ready.set()
        self._loop.run_forever()

    def stop(self) -> None:
        if not self._loop.is_running():
            return

        async def close() -> None:
            self._server.close()
            for writer in self._writers:
                writer.close()

        asyncio.run_coroutine_threadsafe(close(), self._loop).result(5)
        self._loop.call_soon_threadsafe(self._loop.stop)
        self._thread.join(5)

    def drop_clients(self) -> None:
        asyncio.run_coroutine_threadsafe(self._drop(), self._loop).result(5)

    async def _drop(self) -> None:
        for writer in self._writers:
            writer.close()
        self._writers.clear()

    def publish(self, topic: str, payload: dict | bytes, *, retain: bool = False) -> None:
        raw = payload if isinstance(payload, bytes) else json.dumps(payload).encode()
        data = packet((3 << 4) | (1 if retain else 0), encode_str(topic) + raw)

        async def send() -> None:
            for writer in self._writers:
                writer.write(data)
                await writer.drain()

        asyncio.run_coroutine_threadsafe(send(), self._loop).result(5)

    async def _client(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        try:
            first, body = await read_packet(reader)
            assert first >> 4 == 1
            flags = body[7]
            offset = 10
            fields = []
            for present in (True, flags & 0x80, flags & 0x40):
                if present:
                    size = int.from_bytes(body[offset:offset + 2], "big")
                    fields.append(body[offset + 2:offset + 2 + size].decode())
                    offset += 2 + size
                else:
                    fields.append(None)
            client_id, username, password = fields
            self.connects.append({"client_id": client_id, "username": username, "password": password,
                                  "keepalive": int.from_bytes(body[8:10], "big")})
            ok = (self.username is None) or (username == self.username and password == self.password)
            writer.write(packet(2 << 4, bytes([0, 0 if ok else 4])))
            await writer.drain()
            if not ok:
                writer.close()
                return
            self._writers.append(writer)
            while True:
                first, body = await read_packet(reader)
                kind = first >> 4
                if kind in (8, 10):
                    offset, topics = 2, []
                    while offset < len(body):
                        size = int.from_bytes(body[offset:offset + 2], "big")
                        topics.append(body[offset + 2:offset + 2 + size].decode())
                        offset += 2 + size + (1 if kind == 8 else 0)
                    (self.subscriptions if kind == 8 else self.unsubscriptions).extend(topics)
                    writer.write(packet((9 if kind == 8 else 11) << 4, body[0:2] + (bytes(len(topics)) if kind == 8 else b"")))
                elif kind == 12:
                    self.pings += 1
                    writer.write(packet(13 << 4))
                elif kind == 14:
                    break
                await writer.drain()
        except (asyncio.IncompleteReadError, ConnectionError, AssertionError):
            pass
        finally:
            if writer in self._writers:
                self._writers.remove(writer)
            writer.close()


# -- settings: flags and environment only, the password nowhere ---------------------------------------------


def test_mqtt_settings_come_from_flags_and_environment_only(tmp_path: Path) -> None:
    env = {"SOFABATON_MQTT_HOST": "broker.lan", "SOFABATON_MQTT_USERNAME": "hub", "SOFABATON_MQTT_PASSWORD": "s3cret",
           "SOFABATON_MQTT_TLS": "true"}
    settings = load_settings(environ=env, data_dir=tmp_path)
    assert (settings.mqtt_host, settings.mqtt_username, settings.mqtt_password, settings.mqtt_tls) == ("broker.lan", "hub", "s3cret", True)
    assert settings.mqtt_effective_port == 8883 and load_settings(environ={"SOFABATON_MQTT_HOST": "b"}, data_dir=tmp_path).mqtt_effective_port == 1883
    # The password is in nothing the server prints: not the settings dump, not the repr.
    assert "s3cret" not in json.dumps(settings.to_dict()) and settings.to_dict()["mqtt_password_set"] is True
    assert "s3cret" not in repr(settings)
    # Flags win over the environment; the password can come from a file (container secrets).
    secret = tmp_path / "mqtt-password"
    secret.write_text("from-a-file\n", encoding="utf-8")
    args = build_parser().parse_args(["--data-dir", str(tmp_path), "--mqtt-host", "10.0.0.5", "--mqtt-port", "1884",
                                      "--mqtt-password-file", str(secret), "--mqtt-username", "cli"])
    import os
    from unittest import mock
    with mock.patch.dict(os.environ, {"SOFABATON_MQTT_HOST": "broker.lan"}, clear=False):
        flagged = settings_from_args(args)
    assert (flagged.mqtt_host, flagged.mqtt_port, flagged.mqtt_username, flagged.mqtt_password) == ("10.0.0.5", 1884, "cli", "from-a-file")

    # server.json never carries them: a file that does is refused, with the reason.
    (tmp_path / "server.json").write_text(json.dumps({"mqtt_host": "broker.lan", "mqtt_password": "oops"}), encoding="utf-8")
    with pytest.raises(ValueError, match="do not belong in a file"):
        load_settings(environ={}, data_dir=tmp_path)
    (tmp_path / "server.json").unlink()
    from sofabaton_server.config import write_settings_file
    with pytest.raises(ValueError, match="do not belong in a file"):
        write_settings_file(tmp_path, {"mqtt_password": "oops"})
    assert not (tmp_path / "server.json").exists()

    for bad in ({"mqtt_username": "hub"}, {"mqtt_host": "b", "mqtt_tls_insecure": True}, {"mqtt_host": "b", "mqtt_port": 0},
                {"mqtt_host": "b", "mqtt_password": "x", "mqtt_password_file": secret}):
        with pytest.raises(ValueError):
            Settings(data_dir=tmp_path, **bad)


# -- the client ---------------------------------------------------------------------------------------------------


def test_the_client_subscribes_pings_reconnects_and_reports_a_refusal(monkeypatch) -> None:
    async def main(broker: FakeBroker) -> None:
        got: list[tuple] = []
        states: list[str] = []
        client = MqttSubscriber(host=LOOPBACK, port=broker.port, username="hub", password="s3cret", client_id="test-client",
                                on_message=lambda *m: got.append(m), on_state=states.append, keepalive=1, retry_min=0.05, retry_max=0.1)
        assert client.state().wanted is False and client.connected is False       # no topic, no connection
        await client.set_topics({TOPIC})
        await _wait_for(lambda: client.connected and broker.subscriptions == [TOPIC])
        assert broker.connects[0] == {"client_id": "test-client", "username": "hub", "password": "s3cret", "keepalive": 1}
        broker.publish(TOPIC, {"device_id": 3, "key_id": 1})
        broker.publish(TOPIC, {"device_id": 3, "key_id": 2}, retain=True)
        await _wait_for(lambda: len(got) == 2)
        assert got[0] == (TOPIC, b'{"device_id": 3, "key_id": 1}', False) and got[1][2] is True
        await _wait_for(lambda: broker.pings >= 1)                                  # keepalive
        # A second hub's topic is added on the live connection; dropping one unsubscribes it.
        await client.set_topics({TOPIC, "FC012C39D390/up"})
        await _wait_for(lambda: "FC012C39D390/up" in broker.subscriptions)
        await client.set_topics({TOPIC})
        await _wait_for(lambda: broker.unsubscriptions == ["FC012C39D390/up"])
        # The broker goes away and comes back: the client reconnects and subscribes again, by itself.
        broker.drop_clients()
        await _wait_for(lambda: len(broker.connects) >= 2 and broker.subscriptions.count(TOPIC) >= 2 and client.connected)
        assert "mqtt_failed" in states and states.count("mqtt_connected") >= 2
        state = client.state()
        assert (state.configured, state.connected, state.host, state.username, state.topics) == (True, True, LOOPBACK, "hub", (TOPIC,))
        assert not hasattr(state, "password")
        # No topic left: the connection goes.
        await client.set_topics(set())
        assert client.connected is False and client.state().wanted is False

        refused = MqttSubscriber(host=LOOPBACK, port=broker.port, username="hub", password="wrong", on_message=lambda *m: None,
                                 retry_min=0.05, retry_max=0.1)
        await refused.set_topics({TOPIC})
        await _wait_for(lambda: refused.state().last_error is not None)
        assert refused.state().last_error == "bad user name or password" and refused.connected is False
        await refused.stop()

        unconfigured = MqttSubscriber(host=None, on_message=lambda *m: None)
        await unconfigured.set_topics({TOPIC})
        assert unconfigured.state().configured is False and unconfigured.connected is False

    async def _wait_for(predicate, timeout: float = 5.0) -> None:
        deadline = time.monotonic() + timeout
        while not predicate():
            assert time.monotonic() < deadline, "condition not met in time"
            await asyncio.sleep(0.01)

    with FakeBroker(username="hub", password="s3cret") as broker:
        asyncio.run(main(broker))


# -- the service ------------------------------------------------------------------------------------------------------


def _x2(proxy) -> None:
    proxy.model = "X2"


def _create(client, hub_id, body):
    r = client.post(f"{HUBS}/{hub_id}/wifi-devices", json=body)
    assert r.status_code == 202, r.text
    job = _wait(client, hub_id, r.json()["job_id"])
    assert job["status"] == "done", job
    return job["result"]


def test_an_x2_with_a_broker_gets_mqtt_devices_whose_presses_arrive_from_the_topic(tmp_path: Path) -> None:
    with FakeBroker(username="hub", password="s3cret") as broker:
        client, factory = _rig(tmp_path, mqtt_host=LOOPBACK, mqtt_port=broker.port, mqtt_username="hub", mqtt_password="s3cret")
        with client:
            hub_id, proxy = _hub(client, factory)
            # Not an X2: http only, and asking for mqtt anyway is refused with the reason.
            assert client.get(f"{HUBS}/{hub_id}/wifi-devices").json()["transports"] == ["http"]
            r = client.post(f"{HUBS}/{hub_id}/wifi-devices", json={"name": "Lights", "transport": "mqtt"})
            assert r.status_code == 409 and r.json()["type"] == "mqtt_unavailable" and "X2" in r.json()["detail"]
            _x2(proxy)
            assert client.get(f"{HUBS}/{hub_id}/wifi-devices").json()["transports"] == ["mqtt", "http"]   # the faster one first
            info = client.get(SERVER).json()
            assert "mqtt" in info["features"] and info["mqtt"]["configured"] is True and info["mqtt"]["connected"] is False
            assert "s3cret" not in json.dumps(info) and "password" not in info["mqtt"]

            device = _create(client, hub_id, {"name": "Lights", "transport": "mqtt", "slots": [{"label": "On"}, {"label": "Off", "long_label": "All off"}]})
            key, dev = device["key"], device["device_id"]
            assert device["transport"] == "mqtt" and device["target"] is None and device["effective_destination"] is None
            assert device["mqtt_topic"] == TOPIC and device["spec"]["brand"] == f"c0-{key}"
            deploy = proxy.wifi_deploys[-1]
            assert deploy["transport"] == "mqtt" and deploy["host"] is None and deploy["port"] is None
            # No listener for a device that calls nothing; a broker subscription instead.
            assert client.get(f"{SERVER}/callback-listener").json()["wanted"] is False
            _until(lambda: broker.subscriptions == [TOPIC])
            mqtt = _until(lambda: (lambda s: s if s["connected"] else None)(client.get(f"{SERVER}/mqtt").json()))
            assert mqtt["topics"] == [TOPIC] and mqtt["host"] == LOOPBACK and "password" not in mqtt
            row = json.loads((tmp_path / "hubs.json").read_text(encoding="utf-8"))["hubs"][0]
            assert row["wifi_devices"][key]["transport"] == "mqtt" and "s3cret" not in json.dumps(row)

            with client.websocket_connect(EVENTS) as ws:
                ws.receive_json()
                broker.publish(TOPIC, {"device_id": dev, "key_id": 2, "stale": "replay"}, retain=True)   # a broker replaying: never a press
                broker.publish(TOPIC, {"device_id": 99, "key_id": 1})                                  # someone's own MQTT device from the app
                broker.publish(TOPIC, b"not json")
                broker.publish(TOPIC, {"device_id": dev, "key_id": 1})
                msg = _next_press(ws)
                got = (msg["seq"], msg["transport"], msg["device_key"], msg["device_id"], msg["slot"], msg["command_id"], msg["label"], msg["press_type"])
                assert got == (1, "mqtt", key, dev, 1, 1, "On", "short")
                assert msg["resolution"] == "deployed" and msg["source"] == ""
                broker.publish(TOPIC, {"device_id": dev, "key_id": 2 + N})                              # the long record of slot 2
                msg = _next_press(ws)
                assert (msg["slot"], msg["command_id"], msg["label"], msg["press_type"]) == (2, 2 + N, "All off", "long")
                broker.publish(TOPIC, {"device_id": dev, "key_id": 2 * N + 5})
                assert _next_press(ws)["resolution"] == "unknown_slot"
            assert [p["transport"] for p in client.get(f"{HUBS}/{hub_id}/presses").json()["presses"]] == ["mqtt"] * 3

            # An in-place update keeps the transport; an http device next to it brings the listener up.
            r = client.put(f"{HUBS}/{hub_id}/wifi-devices/{key}", json={"name": "Lamps", "slots": [{"label": "Toggle"}]})
            job = _wait(client, hub_id, r.json()["job_id"])
            assert job["status"] == "done" and job["result"]["transport"] == "mqtt" and job["result"]["target"] is None
            assert proxy.wifi_updates[-1]["deployment"].transport == "mqtt" and proxy.wifi_updates[-1]["deployment"].target is None
            http = _create(client, hub_id, {"name": "Blinds"})
            assert http["transport"] == "http" and http["target"]["host"] == "192.168.1.10" and http["mqtt_topic"] is None
            assert client.get(f"{SERVER}/callback-listener").json()["wanted"] is True

            # Removing the mqtt device ends the subscription and the connection.
            r = client.delete(f"{HUBS}/{hub_id}/wifi-devices/{key}")
            assert _wait(client, hub_id, r.json()["job_id"])["status"] == "done"
            _until(lambda: client.get(f"{SERVER}/mqtt").json()["connected"] is False)
            assert client.get(f"{SERVER}/mqtt").json()["wanted"] is False


def _next_press(ws) -> dict:
    while True:
        msg = ws.receive_json()
        if msg["type"] == "press":
            return msg


def test_without_a_broker_mqtt_is_not_offered_and_a_lost_device_redeploys_over_mqtt(tmp_path: Path) -> None:
    client, factory = _rig(tmp_path)
    with client:
        hub_id, proxy = _hub(client, factory)
        _x2(proxy)
        assert client.get(f"{HUBS}/{hub_id}/wifi-devices").json()["transports"] == ["http"]
        r = client.post(f"{HUBS}/{hub_id}/wifi-devices", json={"name": "Lights", "transport": "mqtt"})
        assert r.status_code == 409 and "--mqtt-host" in r.json()["detail"]
        info = client.get(SERVER).json()
        assert "mqtt" not in info["features"] and info["mqtt"]["configured"] is False

    with FakeBroker() as broker:
        import functools
        client, factory = _rig(tmp_path, mqtt_host=LOOPBACK, mqtt_port=broker.port, on_build=lambda p: (setattr(p, "mac", MAC), _x2(p)))
        with client:
            proxy = factory.latest(LOOPBACK)
            client.portal.call(proxy.ready, MAC)
            device = _create(client, HUB_ID, {"name": "Lights", "transport": "mqtt", "slots": [{"label": "On"}]})
            key, dev = device["key"], device["device_id"]
            # The app deletes it: stale, then Redeploy writes an mqtt device again (no port rule, no address).
            proxy.devices_data = [d for d in proxy.devices_data if d.device_id != dev]
            client.portal.call(functools.partial(proxy._emit_snapshot_changed, device_ids=(dev,)))
            _until(lambda: client.get(f"{HUBS}/{HUB_ID}/wifi-devices/{key}").json()["stale"])
            r = client.post(f"{HUBS}/{HUB_ID}/wifi-devices/{key}/redeploy")
            job = _wait(client, HUB_ID, r.json()["job_id"])
            assert job["status"] == "done" and job["result"]["transport"] == "mqtt" and job["result"]["stale"] is False
            assert [d["transport"] for d in proxy.wifi_deploys] == ["mqtt", "mqtt"]
            # The same id coming back is only ours when it is the mqtt device the record describes.
            new_dev = job["result"]["device_id"]
            proxy.devices_data = [d for d in proxy.devices_data if d.device_id != new_dev]
            client.portal.call(functools.partial(proxy._emit_snapshot_changed, device_ids=(new_dev,)))
            _until(lambda: client.get(f"{HUBS}/{HUB_ID}/wifi-devices/{key}").json()["stale"])
            from sofabaton import WifiDeviceSpec
            spec = WifiDeviceSpec.from_dict(job["result"]["spec"])
            proxy.place_wifi_device(new_dev, spec, brand=spec.brand, device_class="wifi_mqtt")
            client.portal.call(functools.partial(proxy._emit_snapshot_changed, device_ids=(new_dev,)))
            _until(lambda: not client.get(f"{HUBS}/{HUB_ID}/wifi-devices/{key}").json()["stale"])
