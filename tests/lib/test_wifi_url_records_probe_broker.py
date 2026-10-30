"""URL records on X2 Wifi devices (decoded and edited, as the Sofabaton
app writes them), the hub's broker link, and the delivery probe.

Pure helpers first, then the engine (never started: no sockets, outbound
frames go nowhere) and the facade over it with the wire stubbed.
"""

from __future__ import annotations

import asyncio
import importlib
import importlib.util
import sys
import types
from pathlib import Path

import pytest

LIB_DIR = Path(__file__).resolve().parents[2] / "custom_components" / "sofabaton_x1s" / "lib"


def _load_lib() -> types.ModuleType:
    name = "sofabaton_wifi_url_test_pkg"
    if name in sys.modules:
        return sys.modules[name]
    spec = importlib.util.spec_from_file_location(
        name, LIB_DIR / "__init__.py", submodule_search_locations=[str(LIB_DIR)]
    )
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


_pkg = _load_lib()
aio = importlib.import_module(f"{_pkg.__name__}.aio")
blob = importlib.import_module(f"{_pkg.__name__}.blob_decoders")
edits = importlib.import_module(f"{_pkg.__name__}.edits")
errors = importlib.import_module(f"{_pkg.__name__}.errors")
hub_mqtt = importlib.import_module(f"{_pkg.__name__}.proxy_hub_mqtt")
payloads = importlib.import_module(f"{_pkg.__name__}.payloads")
frame_decode = importlib.import_module(f"{_pkg.__name__}.proxy_frame_decode")
wifi = importlib.import_module(f"{_pkg.__name__}.wifi_device")
x1_proxy_mod = importlib.import_module(f"{_pkg.__name__}.x1_proxy")

BASE = "https://192.168.2.50:8123/api/webhook/abc123"
_N = wifi.WIFI_SLOT_COUNT


# ---------------------------------------------------------------------------
# Decoding URL records on a wifi_ip device, and the facade's command type
# ---------------------------------------------------------------------------


def _url_body(**kw) -> bytes:
    return blob.render_wifi_https_blob_body(url=kw.get("url", BASE), method=kw.get("method", "POST"),
                                            headers=kw.get("headers", [("Content-Type", "application/json")]),
                                            body=kw.get("body", "{}"))


def test_wifi_ip_decoder_reads_url_records_and_round_trips() -> None:
    data = _url_body() + bytes([0x5E])

    decoded = blob.try_decode_blob("wifi_ip", data)

    assert decoded["class"] == "wifi_ip"
    assert decoded["fields"] == {"url": BASE, "method": "POST",
                                 "headers": [["Content-Type", "application/json"]], "body": "{}"}
    assert decoded["trailer_hex"] == "5e"
    assert blob.encode_decoded_blob(decoded) == data
    text = blob.format_decoded_for_display(decoded)
    assert f"url: {BASE}" in text and "header: Content-Type: application/json" in text


def test_wifi_ip_decoder_still_reads_request_text_records() -> None:
    data = blob.render_wifi_ip_blob_body(host="10.0.0.2", port=8060, method="POST", path="/launch/a/1/0/short",
                                         content_type="application/x-www-form-urlencoded") + bytes([0xF1])

    decoded = blob.try_decode_blob("wifi_ip", data)

    assert decoded["fields"]["host"] == "10.0.0.2" and "url" not in decoded["fields"]
    assert blob.encode_decoded_blob(decoded) == data


def test_payload_from_body_types_a_url_record_as_a_url_command() -> None:
    body = _url_body()

    command = payloads.payload_from_body("wifi_ip", body)

    assert isinstance(command, payloads.NetworkCommand) and command.is_url
    assert command.library_type == 0x21 and command.blob == body
    row = command.to_command_row(3, "Hook")
    assert row["restore_data"]["library_type"] == 0x21


def test_network_command_url_constructor() -> None:
    command = payloads.NetworkCommand.url(url=BASE, method="put", headers=[("X-A", "1")], body="b")

    assert command.fields == {"url": BASE, "method": "PUT", "headers": [["X-A", "1"]], "body": "b"}
    assert command.library_type == 0x21
    assert payloads.NetworkCommand.http(host="10.0.0.2", port=80, method="GET", path="/").library_type == 0x1C
    with pytest.raises(ValueError):
        payloads.NetworkCommand.url(url=BASE, method="DELETE")
    with pytest.raises(ValueError):
        payloads.NetworkCommand.url(url="not a url")


def test_set_command_payload_takes_the_record_type_from_the_command_kind() -> None:
    old_text = blob.render_wifi_ip_blob_body(host="10.0.0.2", port=8060, method="POST", path="/x")
    bundle = {"devices": [{"device": {"device_id": 4, "device_class": "wifi_ip", "name": "HA"},
                           "commands": [{"command_id": 1, "name": "Hook",
                                         "restore_data": {"transport": "hub_code_record", "library_type": 0x1C,
                                                          "button_code": 77, "data_hex": old_text.hex()}}]}],
              "activities": []}

    edited = edits.set_command_payload(bundle, 4, 1, payloads.NetworkCommand.url(url=BASE))

    restore = edited["devices"][0]["commands"][0]["restore_data"]
    assert restore["library_type"] == 0x21 and restore["button_code"] == 77


# ---------------------------------------------------------------------------
# Engine: the broker link, redaction
# ---------------------------------------------------------------------------


class _Sock:
    pass


def _engine(hub_version: str = "X2"):
    engine = x1_proxy_mod.X1Proxy("127.0.0.1", hub_version=hub_version, proxy_enabled=False)
    with engine.transport._hub_lock:
        engine.transport._hub_sock = _Sock()
    engine._notify_hub_state(True)
    return engine


def _seed_commands(engine, dev: int, ids, *, library_type: int = 0x1C) -> None:
    engine.state.commands[dev] = {cid: f"Slot {cid}" for cid in ids}
    for cid in ids:
        engine.state.command_metadata[dev][cid] = {"button_code": 1000 + cid, "library_type": library_type}
    engine._commands_complete.add(dev)


# The broker-setup frame for 192.168.31.88:1883, MAC DF:64:24:77:A7:65 and
# root123 / root123 (a known-good frame).
_KNOWN_SETUP_FRAME = bytes.fromhex(
    "a5 5a 2c 73 00 2a c0 a8 1f 58 07 5b df 64 24 77 a7 65 07"
    " 00 72 00 6f 00 6f 00 74 00 31 00 32 00 33 07"
    " 00 72 00 6f 00 6f 00 74 00 31 00 32 00 33 b5"
)


def test_setup_payload_builds_the_known_frame() -> None:
    payload = hub_mqtt.build_hub_mqtt_setup_payload(
        broker_ip="192.168.31.88", broker_port=1883, hub_mac="DF:64:24:77:A7:65", username="root123",
        password="root123",
    )
    engine = x1_proxy_mod.X1Proxy("127.0.0.1", hub_version="X2", proxy_enabled=False)

    frame = engine._build_frame((len(payload) << 8) | 0x73, payload)

    assert frame == _KNOWN_SETUP_FRAME


@pytest.mark.parametrize("kw", [
    {"broker_ip": "core-mosquitto"},
    {"broker_port": 0},
    {"hub_mac": ""},
    {"username": "u" * 61},
    {"username": "u" * 60, "password": "p" * 60},   # over the one-byte frame length
])
def test_setup_payload_refuses(kw) -> None:
    args = {"broker_ip": "192.168.2.50", "broker_port": 1883, "hub_mac": "aabbccddeeff", "username": "u",
            "password": "p"} | kw
    with pytest.raises(ValueError):
        hub_mqtt.build_hub_mqtt_setup_payload(**args)


@pytest.mark.parametrize("kw, code", [
    ({"broker_ip": "999.1.2.3"}, "broker_invalid_host"),
    ({"broker_port": 65536}, "broker_invalid_port"),
    ({"username": "u" * 61}, "broker_username_too_long"),
    ({"password": "p" * 61}, "broker_password_too_long"),
    ({"username": "u" * 60, "password": "p" * 60}, "broker_credentials_too_long"),
])
def test_broker_validation_exposes_codes_without_credential_values(kw, code) -> None:
    args = {"broker_ip": "192.168.2.50", "broker_port": 1883, "hub_mac": "aabbccddeeff",
            "username": "private-user", "password": "private-password"} | kw
    with pytest.raises(hub_mqtt.HubMqttValidationError) as error:
        hub_mqtt.build_hub_mqtt_setup_payload(**args)
    assert error.value.code == code
    assert args["username"] not in str(error.value)
    assert args["password"] not in str(error.value)


def _answer_with(engine, monkeypatch, reply: bytes | None, sent: list) -> None:
    def send(family, payload):
        sent.append((family, bytes(payload)))
        if reply is not None:
            engine.notify_ack(((len(reply) << 8) | 0x74), reply)

    monkeypatch.setattr(engine, "_send_family_frame", send)


def test_query_hub_mqtt_status(monkeypatch) -> None:
    engine = _engine()
    sent: list = []
    _answer_with(engine, monkeypatch, b"\x01", sent)
    assert engine.query_hub_mqtt_status(timeout=0.5) is True
    assert sent == [(0x74, b"")]
    _answer_with(engine, monkeypatch, b"\x00", sent)
    assert engine.query_hub_mqtt_status(timeout=0.5) is False
    _answer_with(engine, monkeypatch, None, sent)
    assert engine.query_hub_mqtt_status(timeout=0.2) is None
    assert _engine("X1S").query_hub_mqtt_status(timeout=0.1) is None


def test_set_hub_mqtt_broker(monkeypatch) -> None:
    engine = _engine()
    monkeypatch.setattr(engine, "get_banner_info", lambda: {"mac": "AABBCCDDEEFF"})
    sent: list = []
    _answer_with(engine, monkeypatch, b"\x00", sent)

    result = engine.set_hub_mqtt_broker(broker_ip="192.168.2.50", broker_port=1883, username="ha",
                                        password="secret", timeout=0.5)

    assert result == {"connected": False}
    family, payload = sent[0]
    assert family == 0x73 and payload[2:6] == bytes([192, 168, 2, 50]) and payload[8:14] == bytes.fromhex("aabbccddeeff")
    with pytest.raises(ValueError):
        _engine("X1S").set_hub_mqtt_broker(broker_ip="192.168.2.50", broker_port=1883, username="", password="")


def test_the_broker_status_reply_reaches_the_waiting_request() -> None:
    engine = _engine()
    engine._log_frames("H→A", [(0x0174, b"\xa5\x5a\x01\x74\x01\x15", b"\x01", 0, 0)])

    assert engine.wait_for_ack_family_low(0x74, timeout=0.1) == (0x0174, b"\x01")


def test_frame_dumps_mask_the_broker_setup_payload() -> None:
    other = bytes.fromhex("a5 5a 01 74 01 15")
    dump = frame_decode._hexdump(other + _KNOWN_SETUP_FRAME + other)

    assert "72 00 6f" not in dump   # no UTF-16 'ro' of the login left
    assert dump.startswith("a5 5a 01 74 01 15 a5 5a 2c 73 ** **")
    assert dump.endswith("** a5 5a 01 74 01 15")
    assert dump.count("**") == 0x2C + 1   # the payload and its checksum
    assert hub_mqtt.redact_wire_hex(other) == other.hex(" ")


# ---------------------------------------------------------------------------
# Facade: the probe, the broker methods
# ---------------------------------------------------------------------------


def _facade(monkeypatch, hub_version="X2"):
    engine = _engine(hub_version)
    monkeypatch.setattr(engine, "_stable_hub_action_id", lambda: "aabbccddeeff")

    async def no_reread(self, device_ids, activity_ids, *, refresh_catalog=False, **kw):
        return None

    monkeypatch.setattr(aio.AsyncXProxy, "_reread_after_write", no_reread)
    return engine


def _http_deployment(hub_version="X2"):
    spec = wifi.WifiDeviceSpec(name="HA").normalized()
    return wifi.WifiDeployment(device_id=4, spec=spec, target=wifi.WifiTarget("192.168.2.50", 8060, "aabbccddeeff"),
                               labels=wifi.labels_from_spec(spec), hub_version=hub_version)


def test_probe_reports_delivery_and_latency(monkeypatch) -> None:
    async def main():
        engine = _facade(monkeypatch)
        presses: list = []
        monkeypatch.setattr(engine, "send_command", lambda dev, cmd: presses.append((dev, cmd)) or True)
        proxy = aio.AsyncXProxy.wrap(engine)
        loop = asyncio.get_running_loop()

        arrived = loop.create_future()
        loop.call_later(0.05, arrived.set_result, None)
        probe = await proxy.probe_wifi_delivery(_http_deployment(), arrived=arrived, timeout=2.0)
        assert probe.sent and probe.delivered and 0.0 < probe.latency_s < 2.0
        assert presses == [(4, wifi.WIFI_PROBE_COMMAND_ID)]

        never = loop.create_future()
        probe = await proxy.probe_wifi_delivery(_http_deployment(), arrived=never, timeout=0.1)
        assert probe.sent and not probe.delivered and probe.latency_s is None and never.cancelled()

        monkeypatch.setattr(engine, "send_command", lambda dev, cmd: False)
        refused = loop.create_future()
        probe = await proxy.probe_wifi_delivery(_http_deployment(), arrived=refused, timeout=1.0)
        assert not probe.sent and not probe.delivered and refused.cancelled()

    asyncio.run(main())


def test_facade_broker_methods(monkeypatch) -> None:
    async def main():
        engine = _facade(monkeypatch)
        monkeypatch.setattr(engine, "query_hub_mqtt_status", lambda timeout=3.0: True)
        calls: list = []
        monkeypatch.setattr(engine, "set_hub_mqtt_broker", lambda **kw: calls.append(kw) or {"connected": True})
        proxy = aio.AsyncXProxy.wrap(engine)

        assert await proxy.hub_mqtt_status() is True
        assert await proxy.set_hub_mqtt_broker(host="192.168.2.50", port=1883, username="ha", password="pw") is True
        assert calls == [{"broker_ip": "192.168.2.50", "broker_port": 1883, "username": "ha", "password": "pw"}]

        monkeypatch.setattr(engine, "set_hub_mqtt_broker", lambda **kw: None)
        with pytest.raises(errors.HubRejectedError):
            await proxy.set_hub_mqtt_broker(host="192.168.2.50", port=1883, username="ha", password="pw")

        x1s = _facade(monkeypatch, "X1S")
        with pytest.raises(ValueError):
            await aio.AsyncXProxy.wrap(x1s).set_hub_mqtt_broker(host="192.168.2.50", port=1883, username="",
                                                                 password="")

    asyncio.run(main())


# ---------------------------------------------------------------------------
# The sync executor writes a wifi_ip record with its kind's type
# ---------------------------------------------------------------------------


def test_payload_step_takes_the_type_from_a_url_edit(monkeypatch) -> None:
    engine = _engine()
    _seed_commands(engine, 4, [1])   # cached as a request-text record (0x1C)
    calls: list[dict] = []
    monkeypatch.setattr(engine, "overwrite_command_payload", lambda **kw: calls.append(kw) or {"status": "success"})
    command = payloads.NetworkCommand.url(url=BASE)

    ok = engine._sync_step_command_payload({
        "device_id": 4, "command_id": 1, "command_name": "Hook",
        "restore_data": {"transport": "hub_code_record", "library_type": 0x1C, "button_code": 1001,
                         "data_hex": command.blob.hex(), "decoded": command.decoded},
    })

    assert ok
    assert calls[0]["library_type"] == 0x21 and calls[0]["library_data"] == command.blob
    assert calls[0]["button_code"] == 1001


def test_add_step_takes_the_type_from_a_url_command(monkeypatch) -> None:
    engine = _engine()
    _seed_commands(engine, 4, [1])   # the device's other records are 0x1C
    calls: list[dict] = []
    monkeypatch.setattr(engine, "persist_command_record", lambda **kw: calls.append(kw) or {"status": "success"})
    monkeypatch.setattr(engine, "_register_command_in_device_sort", lambda **kw: None)
    row = payloads.NetworkCommand.url(url=BASE).to_command_row(5, "Hook")

    ok = engine._sync_step_command_add({"device_id": 4, "command_id": 5, "command_name": "Hook",
                                        "restore_data": row["restore_data"]})

    assert ok and calls[0]["library_type"] == 0x21 and calls[0]["command_id"] == 5

