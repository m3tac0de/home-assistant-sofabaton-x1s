"""The X2's Matter buttons as hub events (docs/internal/matter-events-plan.md).

Registry shapes and the Matter record are the ones read from a real HA with
a linked X2 (2026-11-08).
"""

from __future__ import annotations

import asyncio
import logging
import types
from datetime import datetime, timedelta, timezone

import pytest

import conftest  # noqa: F401
from custom_components.sofabaton_x1s import hub_matter_events as hme
from custom_components.sofabaton_x1s import matter_link
from custom_components.sofabaton_x1s.command_config import normalize_matter_event_actions
from custom_components.sofabaton_x1s.const import DOMAIN, HUB_VERSION_X2
from custom_components.sofabaton_x1s.lib.protocol_const import MATTER_DEVICE_ID

INSTANCE = "A9F0BB37AB2F5665-000000000000001A"
HUB_MAC = "fc012c39d390"
RECORD = {
    "server": "X1-HUB-39d390.local.",
    "addresses": ["192.168.2.123", "fdc1:30aa:3625:530c:fe01:2cff:fe39:d390", "fe80::fe01:2cff:fe39:d390"],
}


# -- matter_link: pure parts ------------------------------------------------------------------


def test_instance_name_comes_from_the_device_identifier() -> None:
    identifiers = {("matter", f"deviceid_{INSTANCE}-MatterNodeDevice"), ("matter", "serial_cafe85ff")}
    assert matter_link.matter_instance_name(identifiers) == INSTANCE
    assert matter_link.matter_instance_name({("matter", "serial_cafe85ff")}) is None
    assert matter_link.matter_instance_name({("hue", f"deviceid_{INSTANCE}-MatterNodeDevice")}) is None


def test_button_number_reads_the_endpoint_then_the_name() -> None:
    uid = f"{INSTANCE}-MatterNodeDevice-3-GenericSwitch-59-1"
    assert matter_link.button_number(uid, None) == 3
    assert matter_link.button_number("other", "Button (8)") == 8
    assert matter_link.button_number(f"{INSTANCE}-MatterNodeDevice-0-MatterUpdate-40-9", "Firmware") is None
    assert matter_link.button_number("x", "Button (9)") is None


def test_eui64_addresses_decode_to_the_hub_mac() -> None:
    assert matter_link.mac_from_eui64("fe80::fe01:2cff:fe39:d390") == HUB_MAC
    assert matter_link.mac_from_eui64("fdc1:30aa:3625:530c:fe01:2cff:fe39:d390%eth0") == HUB_MAC
    assert matter_link.mac_from_eui64("fdc1:30aa:3625:530c:419d:2ed6:e468:c428") is None
    assert matter_link.mac_from_eui64("192.168.2.123") is None


@pytest.mark.parametrize(
    ("record", "mac", "host", "expected"),
    [
        (RECORD, HUB_MAC, None, True),
        (RECORD, "fc:01:2c:39:d3:90", None, True),
        ({"server": "X1-HUB-39d390.local.", "addresses": []}, HUB_MAC, None, True),
        ({"server": "FC012C39D390.local.", "addresses": []}, HUB_MAC, None, True),
        ({"server": "other.local.", "addresses": ["192.168.2.123"]}, HUB_MAC, "192.168.2.123", True),
        (RECORD, "e26a44861b45", "192.168.2.151", False),
        ({"server": "X1-HUB-39d390.local.", "addresses": []}, None, None, False),
    ],
)
def test_record_matches_hub(record, mac, host, expected) -> None:
    assert matter_link.record_matches_hub(record, mac=mac, host=host) is expected


def test_actions_keep_only_set_buttons_and_press_types() -> None:
    raw = {
        "1": {"multi_press_1": {"action": "perform-action", "perform_action": "light.toggle"}},
        "2": {"multi_press_1": {"action": "perform-action"}},  # the no-op default
        "9": {"multi_press_1": {"action": "perform-action", "perform_action": "light.toggle"}},
        "x": {},
        "3": {"tap": {"action": "perform-action", "perform_action": "light.toggle"}},
    }
    assert normalize_matter_event_actions(raw) == {
        "1": {"multi_press_1": {"action": "perform-action", "perform_action": "light.toggle"}},
    }


# -- registries ---------------------------------------------------------------------------


def _device(device_id: str, *, instance: str = INSTANCE, model: str = "SofaBatonX2", disabled=None):
    return types.SimpleNamespace(
        id=device_id,
        name="SofaBatonX2",
        name_by_user="Matter device 4",
        manufacturer="SofaBaton",
        model=model,
        identifiers={("matter", f"deviceid_{instance}-MatterNodeDevice"), ("matter", "serial_x")},
        disabled_by=disabled,
    )


def _entity(device_id: str, number: int, *, instance: str = INSTANCE, kind: str = "GenericSwitch-59-1", domain="event"):
    return types.SimpleNamespace(
        entity_id=f"{domain}.matter_device_{device_id}_button_{number}",
        unique_id=f"{instance}-MatterNodeDevice-{number}-{kind}",
        platform="matter",
        original_name=f"Button ({number})",
        capabilities={"event_types": ["multi_press_1", "multi_press_2", "long_press", "long_release"]},
        disabled_by=None,
        device_id=device_id,
    )


def _patch_registries(monkeypatch, devices: list, entities: list) -> types.SimpleNamespace:
    from homeassistant.helpers import device_registry as dr
    from homeassistant.helpers import entity_registry as er

    device_reg = types.SimpleNamespace(devices={device.id: device for device in devices})
    entity_reg = types.SimpleNamespace(entities=entities)
    monkeypatch.setattr(dr, "async_get", lambda hass=None: device_reg, raising=False)
    monkeypatch.setattr(er, "async_get", lambda hass=None: entity_reg, raising=False)
    monkeypatch.setattr(
        er,
        "async_entries_for_device",
        lambda registry, device_id, include_disabled_entities=False: [e for e in registry.entities if e.device_id == device_id],
        raising=False,
    )
    return types.SimpleNamespace(states=types.SimpleNamespace(get=lambda entity_id: None))


def test_find_devices_reads_the_buttons(monkeypatch) -> None:
    entities = [_entity("dev1", n) for n in range(1, 9)]
    entities.append(_entity("dev1", 1, kind="IdentifyButton-3-1", domain="button"))
    entities.append(_entity("dev1", 0, kind="MatterUpdate-40-9", domain="update"))
    devices = [_device("dev1"), _device("other", model="Hue bulb")]
    hass = _patch_registries(monkeypatch, devices, entities)

    found = matter_link.find_sofabaton_matter_devices(hass)

    assert [device.device_id for device in found] == ["dev1"]
    assert found[0].instance == INSTANCE
    assert found[0].name == "Matter device 4"
    assert sorted(found[0].buttons) == list(range(1, 9))
    assert found[0].buttons[3].entity_id == "event.matter_device_dev1_button_3"
    assert found[0].buttons[3].event_types == ("multi_press_1", "multi_press_2", "long_press", "long_release")


# -- the hub mixin ------------------------------------------------------------------------


class _Store:
    def __init__(self, actions=None, choice=None) -> None:
        self.actions = actions or {}
        self.choice = choice

    def get_matter_event_actions(self, entry_id):
        return self.actions

    def get_matter_device_choice(self, entry_id):
        return self.choice


class _Hub(hme.HubMatterEventsMixin):
    def __init__(self, hass, *, mac=HUB_MAC, host="192.168.2.123", linked=True) -> None:
        self.hass = hass
        self.entry_id = "entry-x2"
        self.version = HUB_VERSION_X2
        self.mac = mac
        self.host = host
        self.devices = (
            {MATTER_DEVICE_ID: {"name": "Matter", "device_class": "matter", "device_class_code": 0x1F}} if linked else {}
        )
        self._log = logging.getLogger("test_matter_events")
        self._proxy = types.SimpleNamespace(
            get_commands_for_entity=lambda ent, fetch_if_missing=False: ({1: "Lights", 2: "Button 2"}, True)
        )
        self.hub_events: list[dict] = []
        self.ran: list[dict] = []
        self._last_ip_command = None
        self._matter_events_init()

    def _notify_hub_event(self, event):
        self.hub_events.append(event)

    async def _async_execute_action_config(self, action):
        self.ran.append(action)


def _hass(monkeypatch, *, devices, entities, hubs=1):
    hass = _patch_registries(monkeypatch, devices, entities)
    hass.data = {DOMAIN: {}}
    tasks: list = []
    hass.async_create_task = lambda coro: tasks.append(coro)
    hass.tasks = tasks
    for index in range(hubs):
        hass.data[DOMAIN][f"other-{index}"] = types.SimpleNamespace(version=HUB_VERSION_X2, _matter_link=None)
    return hass


def _patch_store(monkeypatch, store) -> None:
    async def _get(hass):
        return store

    monkeypatch.setattr(hme, "async_get_command_config_store", _get)


def _patch_records(monkeypatch, records: dict) -> list[str]:
    asked: list[str] = []

    async def _read(hass, instance):
        asked.append(instance)
        return records.get(instance)

    monkeypatch.setattr(hme, "async_read_matter_record", _read)
    return asked


def test_the_matter_record_picks_this_hubs_device_among_two(monkeypatch) -> None:
    other = "53B0D917E512E612-0000000000000007"
    devices = [_device("dev-other", instance=other), _device("dev1")]
    entities = [_entity("dev-other", 1, instance=other), _entity("dev1", 1)]
    hass = _hass(monkeypatch, devices=devices, entities=entities, hubs=2)
    _patch_store(monkeypatch, _Store())
    _patch_records(monkeypatch, {INSTANCE: RECORD, other: {"server": "X1-HUB-aabbcc.local.", "addresses": []}})
    tracked: list = []
    monkeypatch.setattr(hme, "async_track_state_change_event", lambda hass, ids, action: tracked.append(ids) or (lambda: None))

    hub = _Hub(hass)
    asyncio.run(hub._async_refresh_matter_link())

    view = hub.matter_events_view()
    assert view["available"] is True
    assert view["device"]["id"] == "dev1"
    assert view["buttons"][0] == {
        "button": 1,
        "name": "Lights",
        "entity_id": "event.matter_device_dev1_button_1",
        "event_types": ["multi_press_1", "multi_press_2", "long_press", "long_release"],
    }
    assert tracked == [["event.matter_device_dev1_button_1"]]


def test_no_match_with_two_x2_hubs_asks_for_a_choice(monkeypatch) -> None:
    hass = _hass(monkeypatch, devices=[_device("dev1")], entities=[_entity("dev1", 1)], hubs=2)
    _patch_store(monkeypatch, _Store())
    _patch_records(monkeypatch, {})

    hub = _Hub(hass)
    asyncio.run(hub._async_refresh_matter_link())

    view = hub.matter_events_view()
    assert view["available"] is False
    assert view["reason"] == "ambiguous"
    assert view["candidates"] == [{"id": "dev1", "name": "Matter device 4"}]


def test_one_x2_and_one_matter_device_link_without_a_record(monkeypatch) -> None:
    hass = _hass(monkeypatch, devices=[_device("dev1")], entities=[_entity("dev1", 1)], hubs=0)
    _patch_store(monkeypatch, _Store())
    _patch_records(monkeypatch, {})

    hub = _Hub(hass)
    hass.data[DOMAIN]["entry-x2"] = hub
    asyncio.run(hub._async_refresh_matter_link())

    assert hub.matter_events_view()["available"] is True


@pytest.mark.parametrize(
    ("linked", "devices", "reason"),
    [(False, ["dev1"], "hub_not_linked"), (True, [], "no_matter_device")],
)
def test_the_section_stays_hidden(monkeypatch, linked, devices, reason) -> None:
    hass = _hass(
        monkeypatch,
        devices=[_device(d) for d in devices],
        entities=[_entity(d, 1) for d in devices],
    )
    _patch_store(monkeypatch, _Store())
    _patch_records(monkeypatch, {INSTANCE: RECORD})

    hub = _Hub(hass, linked=linked)
    asyncio.run(hub._async_refresh_matter_link())

    assert hub.matter_events_view()["available"] is False
    assert hub.matter_events_view()["reason"] == reason


def _state(entity_id: str, when: datetime | str, event_type: str = "multi_press_1"):
    value = when if isinstance(when, str) else when.isoformat()
    return types.SimpleNamespace(entity_id=entity_id, state=value, attributes={"event_type": event_type})


def _linked_hub(monkeypatch, actions=None) -> _Hub:
    hass = _hass(monkeypatch, devices=[_device("dev1")], entities=[_entity("dev1", 1), _entity("dev1", 2)])
    _patch_store(monkeypatch, _Store(actions=actions))
    _patch_records(monkeypatch, {INSTANCE: RECORD})
    sent: list = []
    monkeypatch.setattr(hme, "async_dispatcher_send", lambda hass, signal: sent.append(signal))
    hub = _Hub(hass)
    hub.sent = sent
    asyncio.run(hub._async_refresh_matter_link())
    return hub


def test_a_press_runs_the_action_pulses_the_sensor_and_lights_the_row(monkeypatch) -> None:
    action = {"action": "perform-action", "perform_action": "light.toggle"}
    hub = _linked_hub(monkeypatch, actions={"1": {"long_press": action}})
    entity = "event.matter_device_dev1_button_1"
    now = datetime.now(timezone.utc)

    hub._on_matter_button_state(
        types.SimpleNamespace(data={"old_state": _state(entity, now - timedelta(hours=1)), "new_state": _state(entity, now, "long_press")})
    )
    for task in hub.hass.tasks:
        asyncio.run(task)

    assert hub.ran == [action]
    assert hub.hub_events == [{"type": "matter", "button": 1, "event_type": "long_press"}]
    record = hub._last_ip_command
    assert (record["entity_name"], record["command_label"], record["press_type"], record["transport"]) == (
        "Matter", "Lights", "long", "matter",
    )
    assert record["command_index"] is None
    assert len(hub.sent) == 1


@pytest.mark.parametrize(
    "case",
    ["restored", "unchanged", "unknown", "unavailable", "not_ours"],
)
def test_no_press_without_a_fresh_event(monkeypatch, case) -> None:
    hub = _linked_hub(monkeypatch, actions={"1": {"multi_press_1": {"action": "perform-action", "perform_action": "x.y"}}})
    entity = "event.matter_device_dev1_button_1"
    now = datetime.now(timezone.utc)
    old = _state(entity, now - timedelta(hours=1))
    new = {
        "restored": _state(entity, now - timedelta(hours=1, seconds=-1)),
        "unchanged": old,
        "unknown": _state(entity, "unknown"),
        "unavailable": _state(entity, "unavailable"),
        "not_ours": _state("event.someone_else", now),
    }[case]
    old_state = None if case == "restored" else old

    hub._on_matter_button_state(types.SimpleNamespace(data={"old_state": old_state, "new_state": new}))

    assert hub.hass.tasks == []
    assert hub.hub_events == []
    assert hub._last_ip_command is None


@pytest.mark.parametrize(
    ("press_type", "state"),
    [("short", "Matter/Lights"), ("long", "Matter/Lights/longpress"), ("double", "Matter/Lights/doublepress"), ("release", "Matter/Lights/release")],
)
def test_the_sensor_names_every_matter_press_type(press_type, state) -> None:
    from custom_components.sofabaton_x1s.sensor import SofabatonIpCommandsSensor

    sensor = SofabatonIpCommandsSensor.__new__(SofabatonIpCommandsSensor)
    sensor._display_command = {"entity_name": "Matter", "command_label": "Lights", "press_type": press_type}
    assert sensor.state == state
