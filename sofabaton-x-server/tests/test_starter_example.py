"""Exercise the server starter against real routes with a fake hub."""

import importlib.util
import io
import json
import sys
from dataclasses import replace
from pathlib import Path
from types import SimpleNamespace
from urllib.error import HTTPError
from urllib.parse import urlsplit
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from sofabaton import ButtonName
from sofabaton_server.app import create_app
from sofabaton_server.config import Settings
from sofabaton_server.manager import HubManager
from fakes import Factory, no_network_discovery

spec = importlib.util.spec_from_file_location("starter_example", Path(__file__).parents[1] / "examples/starter.py")
starter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(starter)

spec = importlib.util.spec_from_file_location(
    "provision_example", Path(__file__).parents[1] / "examples/provision_callback.py")
provision = importlib.util.module_from_spec(spec)
with patch.dict(sys.modules, {"starter": starter}):
    spec.loader.exec_module(provision)

spec = importlib.util.spec_from_file_location(
    "edit_example", Path(__file__).parents[1] / "examples/edit_activity.py")
edit_example = importlib.util.module_from_spec(spec)
spec.loader.exec_module(edit_example)

HUB_ID = "e26a44861b45"
HUB = "/hubs/" + HUB_ID


@pytest.fixture(params=[False, True], ids=["open", "token"])
def rig(tmp_path, monkeypatch, request):
    settings = Settings(data_dir=tmp_path, callback_port=0)
    factory = Factory()
    manager = HubManager(settings, proxy_factory=factory)
    app = create_app(settings, manager=manager, discovery=no_network_discovery(settings, manager))
    with TestClient(app) as api:
        assert api.post("/api/v1/hubs", json={"host": "127.0.0.1"}).status_code == 201
        proxy = factory.latest("127.0.0.1")
        api.portal.call(proxy.ready, "E2:6A:44:86:1B:45")
        monkeypatch.delenv("SOFABATON_TOKEN", raising=False)
        if request.param:
            app.state.auth.setup("admin", "example test password")
            _info, token = app.state.auth.create_token("Examples")
            monkeypatch.setenv("SOFABATON_TOKEN", token)
        requests = []

        def urlopen(request, timeout):
            requests.append(request)
            response = api.request(request.method, urlsplit(request.full_url).path,
                                   content=request.data, headers=dict(request.headers))
            if response.status_code >= 400:
                raise HTTPError(request.full_url, response.status_code, "error", response.headers,
                                io.BytesIO(response.content))
            return io.BytesIO(response.content)

        monkeypatch.setattr(starter, "urlopen", urlopen)
        monkeypatch.setattr(edit_example, "urlopen", urlopen)
        yield starter.Client("http://testserver"), proxy, requests


def test_activity_edit_example_applies_with_environment_token(rig):
    _client, proxy, requests = rig
    edit_example.edit(edit_example.Client("http://testserver"),
                      SimpleNamespace(hub_id=HUB_ID, activity=101, name="Example movie", apply=True))
    assert len(proxy.syncs) == 1
    assert proxy.syncs[0]["entity_id"] == 101
    assert any(r.method == "PUT" for r in requests)


@pytest.mark.parametrize("rig", [True], indirect=True)
def test_claimed_server_control_needs_no_token_but_provisioning_does(rig):
    client, proxy, requests = rig
    assert client.token
    client.token = None
    starter.run(client, SimpleNamespace(action="start", hub_id=HUB_ID, activity=101))
    assert proxy.sent == [("start", (101,))]
    with pytest.raises(starter.ApiError) as error:
        provision.setup_presses(client, HUB, 101, "PLAY")
    assert error.value.status == 401
    assert error.value.problem["type"] == "auth_required"
    assert not proxy.wifi_deploys


@pytest.mark.parametrize("example", ["edit", "provision"])
def test_write_examples_refuse_unsupported_firmware_before_writes(rig, monkeypatch, example):
    client, proxy, requests = rig
    original_status = proxy.status

    async def unsupported_status():
        return replace(await original_status(), firmware_unsupported=True)

    monkeypatch.setattr(proxy, "status", unsupported_status)
    with pytest.raises(RuntimeError, match="Update the hub firmware"):
        if example == "edit":
            edit_example.edit(edit_example.Client("http://testserver"),
                              SimpleNamespace(hub_id=HUB_ID, activity=101, name="Movie", apply=True))
        else:
            provision.setup_presses(client, HUB, 101, "PLAY")
    assert all(r.method == "GET" for r in requests)
    assert not proxy.syncs and not proxy.wifi_deploys


def test_catalog_selection_and_send_use_the_selected_pair(rig, capsys):
    client, proxy, requests = rig
    starter.run(client, SimpleNamespace(action="devices", hub_id=HUB_ID))
    devices = json.loads(capsys.readouterr().out)
    device_id = devices[1]["device_id"]
    starter.run(client, SimpleNamespace(action="commands", hub_id=HUB_ID, device=device_id))
    command_id = json.loads(capsys.readouterr().out)[1]["command_id"]
    starter.run(client, SimpleNamespace(action="send", hub_id=HUB_ID, device=device_id, command=command_id))
    assert proxy.sent == [("send", (device_id, command_id))]
    assert len([r for r in requests if r.method == "POST"]) == 1


def test_activity_controls_and_reported_state(rig, capsys):
    client, proxy, requests = rig
    starter.run(client, SimpleNamespace(action="activities", hub_id=HUB_ID))
    activity_id = json.loads(capsys.readouterr().out)[0]["activity_id"]
    starter.run(client, SimpleNamespace(action="start", hub_id=HUB_ID, activity=activity_id))
    capsys.readouterr()
    starter.run(client, SimpleNamespace(action="status", hub_id=HUB_ID))
    assert json.loads(capsys.readouterr().out)["status"]["running_activity"]["activity_id"] == activity_id
    starter.run(client, SimpleNamespace(action="stop", hub_id=HUB_ID, activity=activity_id))
    capsys.readouterr()
    starter.run(client, SimpleNamespace(action="status", hub_id=HUB_ID))
    assert json.loads(capsys.readouterr().out)["status"]["running_activity"] is None
    assert proxy.sent == [("start", (activity_id,)), ("stop", (activity_id,))]
    writes = [r for r in requests if r.method != "GET"]
    assert len(writes) == 2
    assert all(r.method == "POST" and r.data is None for r in writes)
    assert not proxy.wifi_deploys


def test_status_and_cached_catalog_are_readable_while_app_owns_control(rig, capsys):
    client, proxy, requests = rig
    proxy.refuse = True
    starter.run(client, SimpleNamespace(action="status", hub_id=HUB_ID))
    assert json.loads(capsys.readouterr().out)["status"]["mode"] == "observe"
    starter.run(client, SimpleNamespace(action="activities", hub_id=HUB_ID))
    assert json.loads(capsys.readouterr().out)
    assert all(r.method == "GET" for r in requests)


def test_disabled_hub_status_is_still_readable(rig, capsys):
    client, proxy, requests = rig
    client.request("POST", HUB + "/disable")
    starter.run(client, SimpleNamespace(action="status", hub_id=HUB_ID))
    status = json.loads(capsys.readouterr().out)
    assert status["enabled"] is False and status["status"] is None


def test_control_refused_after_readiness_check_is_not_retried(rig, monkeypatch):
    client, proxy, requests = rig
    monkeypatch.setattr(client, "ready", lambda hub: setattr(proxy, "refuse", True))
    with pytest.raises(starter.ApiError) as error:
        starter.run(client, SimpleNamespace(action="start", hub_id=HUB_ID, activity=101))
    assert error.value.status == 409
    assert len([r for r in requests if r.method == "POST"]) == 1


def test_setup_follows_jobs_binds_returned_id_and_reuses_device(rig):
    client, proxy, requests = rig
    provision.setup_presses(client, HUB, 101, "PLAY")
    provision.setup_presses(client, HUB, 101, "PLAY")
    assert len(proxy.wifi_deploys) == 1
    device_id = proxy.wifi_deploys[0]["device_id"]
    snapshot = client.request("GET", HUB + "/snapshot")
    activity = next(a for a in snapshot["activities"] if a["device"]["device_id"] == 101)
    row = next(b for b in activity["button_bindings"] if b["button_id"] == int(ButtonName.PLAY))
    assert (row["device_id"], row["command_id"]) == (device_id, 1)
    assert (row["long_press_device_id"], row["long_press_command_id"]) == (device_id, 11)
    binding_requests = [r for r in requests if r.method == "PUT"]
    assert all(r.get_header("If-match", "").startswith('"') for r in binding_requests)


def test_failed_deploy_is_not_retried_or_followed_by_binding(rig):
    client, proxy, requests = rig
    proxy.reject_intents = True
    with pytest.raises(RuntimeError, match="Job did not succeed"):
        provision.setup_presses(client, HUB, 101, "PLAY")
    assert len([r for r in requests if r.method == "POST"]) == 1
    assert not any(r.method == "PUT" for r in requests)


def test_unknown_activity_stops_before_creating_a_callback(rig):
    client, proxy, requests = rig
    with pytest.raises(RuntimeError, match="Unknown activity"):
        provision.setup_presses(client, HUB, 199, "PLAY")
    assert not any(r.method != "GET" for r in requests)


def test_unknown_hub_is_not_mistaken_for_missing_callback(rig):
    client, proxy, requests = rig
    with pytest.raises(starter.ApiError) as error:
        provision.setup_presses(client, "/hubs/unknown", 101, "PLAY")
    assert error.value.problem["type"] == "hub_not_found"
    assert not any(r.method != "GET" for r in requests)


def test_listener_uses_prefix_and_dispatches_only_deployed_presses(monkeypatch, capsys):
    from websockets.sync import client as ws_client

    frames = [
        {"type": "hello", "instance_id": "test-instance"},
        {"type": "hub_event", "event": {"kind": "activity_changed", "payload": {"activity_id": 102, "name": "Music"}}},
        {"type": "hub_event", "event": {"kind": "activity_changed", "payload": {"activity_id": None, "name": None}}},
        {"type": "press", "device_key": "a1b2c3d4", "resolution": "deployed", "label": "Demo", "press_type": "short"},
        {"type": "press", "resolution": "stale", "label": "Old", "press_type": "long"},
        {"type": "dropped", "count": 1},
    ]

    class Connection:
        def __enter__(self): return iter(json.dumps(frame) for frame in frames)
        def __exit__(self, *args): pass

    def connect(url, **kwargs):
        assert url == "wss://server.example/prefix/api/v1/events?hub_id=hub+id"
        return Connection()

    monkeypatch.setattr(ws_client, "connect", connect)
    starter.listen(starter.Client("https://server.example/prefix/"), "hub id")
    output = capsys.readouterr().out
    assert "Connected to server instance test-instance" in output
    assert '"kind": "activity_changed"' in output
    assert "ACTIVITY: 102 (Music)" in output
    assert "ACTIVITY: None (None)" in output
    assert "PRESS: Demo (short)" in output and "PRESS: Old" not in output
    assert "Events were lost" in output
