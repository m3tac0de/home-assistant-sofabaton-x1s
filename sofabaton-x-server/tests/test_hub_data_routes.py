"""S2: reads and control on one hub, and the error mapping table."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from sofabaton import FetchTimeoutError, HubBusyError, HubNotConnectedError

from sofabaton_server import API_PREFIX
from sofabaton_server.app import create_app
from sofabaton_server.config import Settings
from sofabaton_server.manager import HubManager

from fakes import Factory, no_network_discovery

HUBS = f"{API_PREFIX}/hubs"


@pytest.fixture
def rig(tmp_path: Path):
    factory = Factory()
    settings = Settings(data_dir=tmp_path)
    manager = HubManager(settings, proxy_factory=factory)
    with TestClient(create_app(settings, manager=manager, discovery=no_network_discovery(settings, manager))) as client:
        assert client.post(HUBS, json={"host": "192.168.1.50"}).status_code == 201
        yield client, factory.latest("192.168.1.50")


def test_status_info_and_catalog_reads(rig) -> None:
    client, proxy = rig
    h = f"{HUBS}/192.168.1.50"

    r = client.get(f"{h}/status")
    assert r.status_code == 200 and r.json()["enabled"] is True and r.json()["status"]["mode"] == "control"

    proxy.mac = "E2:6A:44:86:1B:45"
    info = client.get(f"{h}/info").json()
    assert info["known"] is True and info["mac"] == "E2:6A:44:86:1B:45"

    acts = client.get(f"{h}/activities").json()
    assert [a["activity_id"] for a in acts] == [101, 102] and acts[0]["name"] == "Watch TV"

    devs = client.get(f"{h}/devices").json()
    assert [(d["device_id"], d["power_state"]) for d in devs] == [(1, 0), (2, 1)]
    assert proxy.refreshes == 0
    client.get(f"{h}/devices?refresh=true")
    assert proxy.refreshes == 1 and proxy.catalog_clears == 0   # a forced re-read, never a clear

    assert client.get(f"{h}/devices/1/commands").json() == [
        {"command_id": 1, "label": "Power"}, {"command_id": 2, "label": "Mute"}]
    buttons = client.get(f"{h}/entities/101/buttons").json()
    assert buttons[0]["name"] == "UP" and buttons[0]["long_press_device_id"] is None
    assert (buttons[1]["long_press_device_id"], buttons[1]["long_press_command_id"]) == (2, 5)
    assert client.get(f"{h}/activities/101/macros").json() == [{"command_id": 200, "label": "All On"}]
    assert client.get(f"{h}/activities/101/favorites").json() == [{"device_id": 1, "command_id": 1, "label": "Power"}]
    assert client.get(f"{h}/activity").json() is None


def test_device_power_state_is_a_fresh_read(rig) -> None:
    client, proxy = rig
    h = f"{HUBS}/192.168.1.50"
    assert proxy.refreshes == 0
    r = client.get(f"{h}/devices/2/power-state")
    assert r.status_code == 200 and r.json() == {"device_id": 2, "power_state": 1}
    assert proxy.refreshes == 1, "every call re-reads the device list"
    assert client.get(f"{h}/devices/1/power-state").json() == {"device_id": 1, "power_state": 0}
    assert proxy.refreshes == 2
    # A row without a parseable record reads as null, never as off.
    proxy.devices_data[0] = proxy.devices_data[0].__class__(**{**proxy.devices_data[0].to_dict(), "power_state": None})
    assert client.get(f"{h}/devices/1/power-state").json()["power_state"] is None
    r = client.get(f"{h}/devices/99/power-state")
    assert r.status_code == 404 and r.json()["type"] == "device_not_found"
    proxy.fail_with = FetchTimeoutError("no burst")
    assert client.get(f"{h}/devices/2/power-state").status_code == 504


def test_unknown_entities_are_404_not_timeouts(rig) -> None:
    client, _ = rig
    h = f"{HUBS}/192.168.1.50"
    r = client.get(f"{h}/devices/99/commands")
    assert r.status_code == 404 and r.json()["type"] == "device_not_found"
    r = client.get(f"{h}/activities/999/macros")
    assert r.status_code == 404 and r.json()["type"] == "activity_not_found"
    r = client.get(f"{h}/entities/7/buttons")
    assert r.status_code == 404 and r.json()["type"] == "entity_not_found"
    r = client.post(f"{h}/activities/999/start")
    assert r.status_code == 404
    r = client.get(f"{HUBS}/nope/activities")
    assert r.status_code == 404 and r.json()["type"] == "hub_not_found"


def test_control_accepted_and_refused(rig) -> None:
    client, proxy = rig
    h = f"{HUBS}/192.168.1.50"

    r = client.post(f"{h}/activities/101/start")
    assert r.status_code == 200 and r.json() == {"accepted": True, "mode": "control"}
    assert client.get(f"{h}/activity").json() == {"activity_id": 101, "name": "Watch TV"}

    r = client.post(f"{h}/send", json={"entity_id": 1, "command_id": 2})
    assert r.status_code == 200 and ("send", (1, 2)) in proxy.sent

    r = client.post(f"{h}/find-remote")
    assert r.status_code == 200

    r = client.post(f"{h}/resync-remote")
    assert r.status_code == 200 and ("resync", ()) in proxy.sent

    r = client.post(f"{h}/activities/101/stop")
    assert r.status_code == 200 and client.get(f"{h}/activity").json() is None

    proxy.refuse = True                                         # an app took the hub
    r = client.post(f"{h}/send", json={"entity_id": 1, "command_id": 2})
    assert r.status_code == 409 and r.json()["type"] == "send_refused" and r.json()["mode"] == "observe"

    r = client.post(f"{h}/send", json={"entity_id": -1, "command_id": 2})
    assert r.status_code == 422                                 # body validation


def test_library_errors_map_to_the_table(rig) -> None:
    client, proxy = rig
    h = f"{HUBS}/192.168.1.50"
    for err, status, type_ in (
        (HubBusyError("app holds the hub"), 409, "hub_busy"),
        (HubNotConnectedError("no session"), 503, "hub_not_connected"),
        (FetchTimeoutError("no reply"), 504, "hub_timeout"),
    ):
        proxy.fail_with = err
        r = client.get(f"{h}/activities")
        assert (r.status_code, r.json()["type"]) == (status, type_), r.text
        assert r.json()["hub_id"] == "192.168.1.50"
    proxy.fail_with = None


def test_disabled_hub_reads_are_409(rig) -> None:
    client, _ = rig
    h = f"{HUBS}/192.168.1.50"
    assert client.post(f"{h}/disable").status_code == 200
    r = client.get(f"{h}/activities")
    assert r.status_code == 409 and r.json()["type"] == "hub_disabled"
    r = client.get(f"{h}/status")
    assert r.status_code == 200 and r.json()["enabled"] is False and r.json()["status"] is None


def test_refused_refresh_keeps_the_cached_devices(rig) -> None:
    # Review finding: ?refresh used to clear the catalog before asking the
    # hub, so a refresh refused while an app held the hub left the server
    # with no devices at all. The library's fetch-then-prune refresh raises
    # and leaves the last catalog readable.
    client, proxy = rig
    h = f"{HUBS}/192.168.1.50"
    proxy.fail_with = HubBusyError("app client holds the hub")
    r = client.get(f"{h}/devices?refresh=true")
    assert r.status_code == 409 and r.json()["type"] == "hub_busy"
    assert proxy.catalog_clears == 0
    proxy.fail_with = None
    assert [d["device_id"] for d in client.get(f"{h}/devices").json()] == [1, 2]
