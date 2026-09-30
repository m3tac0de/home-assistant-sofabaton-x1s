"""Hub identity, firmware repair and model (hub_identity.py)."""

import asyncio
import json
import re
from pathlib import Path
from types import SimpleNamespace

import custom_components.sofabaton_x1s.hub as hub_module
import custom_components.sofabaton_x1s.hub_identity as hub_identity_module
from custom_components.sofabaton_x1s.hub import SofabatonHub, get_hub_model
from tests.hub_fakes import FakeDeviceRegistry, FakeHass


def test_update_firmware_state_raises_and_clears_outdated_repair(monkeypatch):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
        "entry-id",
        "X2 HUB",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )
    entry = SimpleNamespace(
        entry_id="entry-id",
        data={"mac": "aa:bb:cc:dd:ee:ff"},
        options={},
        title="title",
    )
    hass._entries["entry-id"] = entry

    device_registry = FakeDeviceRegistry(
        SimpleNamespace(id="device-1", name="X2 HUB", name_by_user=None)
    )
    monkeypatch.setattr(hub_identity_module.dr, "async_get", lambda hass: device_registry)

    created = []
    deleted = []
    monkeypatch.setattr(
        hub_identity_module.ir,
        "async_create_issue",
        lambda hass, domain, issue_id, **kwargs: created.append((domain, issue_id, kwargs)),
    )
    monkeypatch.setattr(
        hub_identity_module.ir,
        "async_delete_issue",
        lambda hass, domain, issue_id: deleted.append((domain, issue_id)),
    )

    hub.version = "X2"
    hub.name = "X2 HUB"
    hub.hub_firmware_version = 7  # X2 floor is 8

    loop.run_until_complete(hub._async_update_firmware_state())

    assert deleted == []
    assert len(created) == 1
    domain, issue_id, kwargs = created[0]
    assert domain == hub_module.DOMAIN
    assert issue_id == "outdated_firmware_entry-id"
    assert kwargs["is_fixable"] is False
    assert kwargs["severity"] == hub_identity_module.ir.IssueSeverity.WARNING
    assert kwargs["translation_key"] == "outdated_firmware"
    assert kwargs["translation_placeholders"] == {
        "name": "X2 HUB",
        "model": "X2",
        "installed": "7",
        "recommended": "8",
    }
    # The installed firmware is mirrored onto the device even while outdated.
    assert device_registry.updated == [("device-1", {"sw_version": "7"})]

    # The placeholders must line up with the repair text in en.json; a
    # rename on either side silently breaks the rendered issue.
    translations = json.loads(
        (
            Path(__file__).resolve().parents[1]
            / "custom_components"
            / "sofabaton_x1s"
            / "translations"
            / "en.json"
        ).read_text(encoding="utf-8")
    )
    repair_text = translations["issues"]["outdated_firmware"]
    referenced = set(
        re.findall(r"\{(\w+)\}", repair_text["title"] + repair_text["description"])
    )
    assert referenced == set(kwargs["translation_placeholders"])

    # Hub reports the recommended firmware -> the repair clears.
    hub.hub_firmware_version = 8
    loop.run_until_complete(hub._async_update_firmware_state())

    assert len(created) == 1  # no second issue raised
    assert deleted == [(hub_module.DOMAIN, "outdated_firmware_entry-id")]
    assert device_registry.updated[-1] == ("device-1", {"sw_version": "8"})

    loop.close()


def test_async_sync_authoritative_identity_skips_device_registry_rename_when_name_matches(monkeypatch):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
        "entry-id",
        "X2 HUB",
        "127.0.0.1",
        1234,
        {"MAC": "aa:bb:cc:dd:ee:ff"},
        9999,
        10000,
        True,
        False,
    )
    entry = SimpleNamespace(
        entry_id="entry-id",
        data={
            "name": "X2 HUB",
            "host": "127.0.0.1",
            "port": 1234,
            "mac": "aa:bb:cc:dd:ee:ff",
            "mdns_txt": {"MAC": "aa:bb:cc:dd:ee:ff"},
            "mdns_version": "X1",
        },
        options={"mdns_version": "X1"},
        title="old title",
    )
    hass._entries["entry-id"] = entry

    rename_calls = []
    monkeypatch.setattr(
        hub,
        "_async_update_device_registry_name",
        lambda next_name: rename_calls.append(next_name) or asyncio.sleep(0),
    )
    monkeypatch.setattr(hub._proxy, "update_discovery_identity", lambda **kwargs: True)

    loop.run_until_complete(
        hub._async_sync_authoritative_identity(
            {
                "model": "X2",
                "production_batch": "20221120",
                "firmware_version": 8,
                "name": "X2 HUB",
            }
        )
    )

    assert rename_calls == []

    loop.close()


def test_get_hub_model_prefers_mdns_hver_over_stale_version() -> None:
    entry = SimpleNamespace(
        data={"mdns_txt": {"HVER": "2"}, "mdns_version": "X1"},
        options={"mdns_version": "X1"},
    )

    assert get_hub_model(entry) == "X1S"
