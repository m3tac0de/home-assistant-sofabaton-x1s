"""Hub core: construction, proxy wiring and the initial sync (hub.py)."""

import asyncio
from types import SimpleNamespace

import custom_components.sofabaton_x1s.hub_identity as hub_identity_module
from custom_components.sofabaton_x1s.hub import SofabatonHub
from custom_components.sofabaton_x1s.const import HUB_VERSION_X1S
from tests.hub_fakes import FakeDeviceRegistry, FakeHass


def test_async_initial_sync_fetches_banner_first_and_persists_cache(monkeypatch):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hass = FakeHass(loop)

    class _Store:
        enabled = True

        def __init__(self):
            self.saved = []

        async def async_set_hub_cache(self, entry_id, payload):
            self.saved.append((entry_id, payload))

    store = _Store()

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
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
        data={
            "name": "hub-name",
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

    calls: list[str] = []
    discovery_updates: list[tuple[dict[str, str], str | None]] = []
    device_registry = FakeDeviceRegistry(
        SimpleNamespace(id="device-1", name="hub-name", name_by_user=None)
    )

    def _fetch_banner_info(*, force_refresh=True, timeout=2.0):
        calls.append("banner")
        info = {
            "model": "X2",
            "production_batch": "20221120",
            "firmware_version": 8,
            "name": "X2 HUB",
        }
        hub._proxy._banner_info = dict(info)
        return (info, True)

    def _get_activities(*, force_refresh=True):
        calls.append(f"activities:{force_refresh}")
        return ({}, False)

    def _get_devices(*, force_refresh=False, **_k):
        calls.append(f"devices:{force_refresh}")
        return ({}, False)

    async def _get_store():
        return store

    monkeypatch.setattr(hub._proxy, "fetch_banner_info", _fetch_banner_info)
    monkeypatch.setattr(hub._proxy, "get_activities", _get_activities)
    monkeypatch.setattr(hub._proxy, "get_devices", _get_devices)
    monkeypatch.setattr(hub, "_async_get_persistent_cache_store", _get_store)
    monkeypatch.setattr(hub_identity_module.dr, "async_get", lambda hass: device_registry)
    monkeypatch.setattr(
        hub._proxy,
        "update_discovery_identity",
        lambda *, mdns_txt, hub_version: discovery_updates.append((dict(mdns_txt), hub_version)) or True,
    )

    loop.run_until_complete(hub._async_initial_sync())

    assert calls == ["banner", "devices:True", "activities:True"]
    assert hub.banner_model == "X2"
    assert hub.production_batch == "20221120"
    assert hub.hub_firmware_version == 8
    assert hub.name == "X2 HUB"
    assert hub.version == "X2"
    assert hub.mdns_txt["NAME"] == "X2 HUB"
    assert hub.mdns_txt["HVER"] == "3"
    assert hub.mdns_txt["AVER"] == "8"
    assert entry.data["name"] == "X2 HUB"
    assert entry.data["mdns_version"] == "X2"
    assert entry.data["mdns_txt"]["NAME"] == "X2 HUB"
    assert entry.options["mdns_version"] == "X2"
    assert discovery_updates[-1][0]["NAME"] == "X2 HUB"
    assert discovery_updates[-1][1] == "X2"
    # The identity sync publishes the authoritative name and then mirrors
    # the hub's reported firmware onto the device (surfaced on the device
    # page and in diagnostics).
    assert device_registry.updated == [
        ("device-1", {"name": "X2 HUB"}),
        ("device-1", {"sw_version": "8"}),
    ]
    assert store.saved
    assert store.saved[-1][1]["banner_info"]["firmware_version"] == 8

    loop.close()


def test_hub_create_proxy_uses_explicit_hub_version() -> None:
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
        version=HUB_VERSION_X1S,
    )

    assert hub._proxy.hub_version == HUB_VERSION_X1S

    loop.close()
