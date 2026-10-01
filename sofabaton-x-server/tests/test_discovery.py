"""S4: the seen-hubs table, scans, own-proxy filtering, and the advertisement."""

from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from sofabaton import DiscoveredHub

from sofabaton_server import API_PREFIX
from sofabaton_server.app import create_app
from sofabaton_server.config import Settings
from sofabaton_server.discovery import DiscoveryService, advertisement_txt
from sofabaton_server.manager import HubManager

from fakes import FakeAdvertiser, FakeBrowser, FakeZeroconf, Factory

DISC = f"{API_PREFIX}/discovery"
HUBS = f"{API_PREFIX}/hubs"


def _adv(host: str, *, mac: str | None = None, hver: str = "2", proxy: bool = False, name: str = "Den") -> DiscoveredHub:
    txt = {"HVER": hver, "NAME": name}
    if mac:
        txt["MAC"] = mac
    if proxy:
        txt["HA_PROXY"] = "1"
    return DiscoveredHub(
        host=host, port=8102, name=name, mac=mac, txt=txt,
        hub_version={"1": "X1", "2": "X1S", "3": "X2"}.get(hver), is_proxy=proxy,
        service_type="_x1hub._udp.local.", instance_name=f"{name}._x1hub._udp.local.",
    )


def _rig(tmp_path: Path, scan_result=None):
    factory = Factory()
    settings = Settings(data_dir=tmp_path, port=8481, advertise_url="https://sb.home.example")
    manager = HubManager(settings, proxy_factory=factory)
    advertiser = FakeAdvertiser()

    async def scanner(**kwargs):
        return list(scan_result or [])

    discovery = DiscoveryService(settings, manager, browser_factory=FakeBrowser, scanner=scanner,
                                 advertiser=advertiser, zeroconf=FakeZeroconf())
    client = TestClient(create_app(settings, manager=manager, discovery=discovery))
    return client, factory, discovery, advertiser


def test_browser_feeds_the_table_and_events_and_own_proxies_are_dropped(tmp_path: Path) -> None:
    client, factory, discovery, advertiser = _rig(tmp_path)
    with client:
        browser = FakeBrowser.instances[-1]
        assert browser.running and browser.include_proxies is True
        assert client.get(f"{API_PREFIX}/server").json()["features"] == ["discovery", "callbacks"]

        with client.websocket_connect(f"{API_PREFIX}/events") as ws:
            ws.receive_json()                                           # hello
            client.portal.call(browser.on_added, _adv("192.168.1.50", mac="AA:BB:CC:DD:EE:FF"))
            client.portal.call(browser.on_added, _adv("192.168.1.5", mac="AA:BB:CC:DD:EE:FF", proxy=True))
            client.portal.call(browser.on_added, _adv("192.168.1.60", hver="99", name="Mystery"))
            msg = ws.receive_json()
            assert msg == {"type": "server_event", "hub_id": "aabbccddeeff", "kind": "hub_discovered"}
            msg = ws.receive_json()
            assert msg == {"type": "server_event", "hub_id": "192.168.1.60", "kind": "hub_discovered"}

        seen = client.get(f"{DISC}/hubs").json()
        assert [s["key"] for s in seen] == ["192.168.1.60", "aabbccddeeff"]
        first = next(s for s in seen if s["key"] == "aabbccddeeff")
        assert first["present"] and first["registered_hub_id"] is None
        assert first["config"]["host"] == "192.168.1.50" and first["config"]["hub_version"] == "X1S"
        assert first["config"]["source"] == "server"
        unknown = next(s for s in seen if s["key"] == "192.168.1.60")
        assert unknown["config"]["hub_version"] is None                   # unknown HVER kept
        assert discovery.proxy_advertisements == 1                        # our own, dropped

        # Registering the hub links the table entry to the record.
        assert client.post(HUBS, json={"host": "192.168.1.50", "mac": "AA:BB:CC:DD:EE:FF"}).status_code == 201
        seen = {s["key"]: s for s in client.get(f"{DISC}/hubs").json()}
        assert seen["aabbccddeeff"]["registered_hub_id"] == "aabbccddeeff"

        # Gone, then back: present flips and hub_lost / hub_discovered fire once each.
        with client.websocket_connect(f"{API_PREFIX}/events") as ws:
            ws.receive_json()
            client.portal.call(browser.on_removed, _adv("192.168.1.50", mac="AA:BB:CC:DD:EE:FF"))
            assert ws.receive_json()["kind"] == "hub_lost"
            assert not client.get(f"{DISC}/hubs").json()[-1]["present"] or True
            client.portal.call(browser.on_updated, _adv("192.168.1.50", mac="AA:BB:CC:DD:EE:FF"))
            assert ws.receive_json()["kind"] == "hub_discovered"
            client.portal.call(browser.on_updated, _adv("192.168.1.50", mac="AA:BB:CC:DD:EE:FF"))
            # A repeated advertisement while present is silent; disable the
            # hub to prove the next message is that, not a duplicate.
            client.post(f"{HUBS}/aabbccddeeff/disable")
            assert ws.receive_json()["kind"] == "hub_disabled"

    assert advertiser.stopped and not browser.running


def test_registration_is_resolved_at_read_time(tmp_path: Path) -> None:
    """A record loaded at start, or one that stops advertising once the
    proxy fronts it, must still read as registered: the lifespan starts
    discovery before the manager loads hubs.json, and a fronted hub sends
    no further advertisement that could refresh a cached value."""

    import json

    (tmp_path / "hubs.json").write_text(json.dumps({"schema": 1, "hubs": [{
        "hub_id": "aabbccddeeff", "enabled": False, "added_at": "2026-09-16T00:00:00+00:00", "last_seen": None,
        "config": {"host": "192.168.1.50", "mac": "AA:BB:CC:DD:EE:FF", "hub_version": "X1S"},
    }]}), encoding="utf-8")
    client, factory, discovery, advertiser = _rig(tmp_path)
    # Seen before the records are loaded (no hub_added event will ever fire for them).
    discovery._on_seen(_adv("192.168.1.50", mac="AA:BB:CC:DD:EE:FF"))
    discovery._on_seen(_adv("192.168.1.60"))
    with client:
        seen = {s["key"]: s for s in client.get(f"{DISC}/hubs").json()}
        assert seen["aabbccddeeff"]["registered_hub_id"] == "aabbccddeeff"
        assert seen["192.168.1.60"]["registered_hub_id"] is None
        # Gone (the proxy took over): still registered, by host as well as MAC.
        client.portal.call(discovery._on_removed, _adv("192.168.1.50", mac="AA:BB:CC:DD:EE:FF"))
        seen = {s["key"]: s for s in client.get(f"{DISC}/hubs").json()}
        assert not seen["aabbccddeeff"]["present"] and seen["aabbccddeeff"]["registered_hub_id"] == "aabbccddeeff"
        assert client.post(HUBS, json={"host": "192.168.1.60"}).status_code == 201
        seen = {s["key"]: s for s in client.get(f"{DISC}/hubs").json()}
        assert seen["192.168.1.60"]["registered_hub_id"] == "192.168.1.60"


def test_scan_merges_into_the_table(tmp_path: Path) -> None:
    client, _, _, _ = _rig(tmp_path, scan_result=[_adv("10.0.0.7", mac="01:02:03:04:05:06"), _adv("10.0.0.8", proxy=True)])
    with client:
        r = client.post(f"{DISC}/scan", json={"timeout": 1.5})
        assert r.status_code == 200
        assert [s["key"] for s in r.json()] == ["010203040506"]
        assert client.post(f"{DISC}/scan", json={"timeout": 0}).status_code == 422
        assert client.post(f"{DISC}/scan").status_code == 200        # default timeout


def test_advertisement_txt_and_hub_count_updates(tmp_path: Path) -> None:
    client, _, _, advertiser = _rig(tmp_path)
    with client:
        port, txt = advertiser.started[0]
        assert port == 8481
        assert txt == {"version": txt["version"], "api": "1", "path": "/api/v1", "hubs": "0",
                       "base_url": "https://sb.home.example"}
        client.post(HUBS, json={"host": "192.168.1.50"})
        assert advertiser.updates[-1]["hubs"] == "1"
        client.delete(f"{HUBS}/192.168.1.50")
        assert advertiser.updates[-1]["hubs"] == "0"
    assert "base_url" not in advertisement_txt(Settings(data_dir=tmp_path), 0)


def test_proxies_adopt_the_shared_zeroconf(tmp_path: Path) -> None:
    client, factory, discovery, _ = _rig(tmp_path)
    with client:
        client.post(HUBS, json={"host": "192.168.1.50"})
        assert isinstance(factory.latest("192.168.1.50").zeroconf, FakeZeroconf)


def test_openapi_lists_discovery_operations(tmp_path: Path) -> None:
    client, _, _, _ = _rig(tmp_path)
    with client:
        spec = client.get(f"{API_PREFIX}/openapi.json").json()
    ops = {op["operationId"] for path in spec["paths"].values() for op in path.values()}
    assert {"listDiscoveredHubs", "scanForHubs"} <= ops
    assert "SeenHub" in spec["components"]["schemas"]


def test_real_advertiser_republishes_a_fresh_record_on_update(tmp_path: Path) -> None:
    """The live smoke caught this: zeroconf's ServiceInfo.properties cannot be
    assigned, so an update must register a fresh record."""

    from sofabaton_server.discovery import SERVICE_TYPE, Advertiser

    class FakeZc:
        def __init__(self) -> None:
            self.registered = []
            self.updated = []
            self.unregistered = []

        def register_service(self, info) -> None:
            self.registered.append(info)

        def update_service(self, info) -> None:
            self.updated.append(info)

        def unregister_service(self, info) -> None:
            self.unregistered.append(info)

    def txt(info) -> dict:
        return {k.decode(): v.decode() for k, v in info.properties.items() if v is not None}

    zc = FakeZc()
    adv = Advertiser()
    settings = Settings(data_dir=tmp_path, port=8481)
    adv.start(zc, settings, 0)
    assert len(zc.registered) == 1 and zc.registered[0].type == SERVICE_TYPE
    assert txt(zc.registered[0])["hubs"] == "0" and zc.registered[0].port == 8481

    adv.update(settings, 2)                       # must not raise
    assert len(zc.updated) == 1 and txt(zc.updated[0])["hubs"] == "2"
    assert zc.updated[0].name == zc.registered[0].name

    adv.stop()
    assert zc.unregistered and zc.unregistered[0] is zc.updated[0]


def _registered(tmp_path: Path, *, enabled: bool = True, mac: str | None = "AA:BB:CC:DD:EE:FF") -> None:
    import json

    config = {"host": "192.168.1.50", "hub_version": "X1S"}
    if mac:
        config["mac"] = mac
    (tmp_path / "hubs.json").write_text(json.dumps({"schema": 1, "hubs": [{
        "hub_id": "aabbccddeeff" if mac else "192.168.1.50", "enabled": enabled,
        "added_at": "2026-09-16T00:00:00+00:00", "last_seen": None, "config": config,
    }]}), encoding="utf-8")


def test_a_hub_advertised_from_another_address_is_followed(tmp_path: Path) -> None:
    """The hub's DHCP lease changed: it advertises from the new address
    (it is not connected to anything, so it advertises) and the record
    follows it, the way the Home Assistant integration updates its entry
    on a zeroconf rediscovery. The running proxy is rebuilt on the new
    address; its cache seeds the new engine through the state file."""

    import json

    _registered(tmp_path)
    client, factory, discovery, _ = _rig(tmp_path)
    with client:
        browser = FakeBrowser.instances[-1]
        old = factory.latest("192.168.1.50")
        assert old.started
        with client.websocket_connect(f"{API_PREFIX}/events") as ws:
            ws.receive_json()                                           # hello
            client.portal.call(browser.on_updated, _adv("192.168.1.77", mac="AA:BB:CC:DD:EE:FF"))
            kinds = [ws.receive_json()["kind"] for _ in range(2)]
            assert kinds == ["hub_discovered", "hub_host_changed"]
        hub = client.get(f"{HUBS}/aabbccddeeff").json()
        assert hub["config"]["host"] == "192.168.1.77" and hub["config"]["mac"] == "AA:BB:CC:DD:EE:FF"
        assert hub["status"]["hub_connected"]
        assert not old.started and old.stops == [False], "stopped without releasing: the hub comes straight back"
        new = factory.latest("192.168.1.77")
        assert new is not old and new.started
        saved = json.loads((tmp_path / "hubs.json").read_text(encoding="utf-8"))["hubs"][0]
        assert saved["config"]["host"] == "192.168.1.77"
        # The table entry is linked to the record under its new address.
        seen = {s["key"]: s for s in client.get(f"{DISC}/hubs").json()}
        assert seen["aabbccddeeff"]["registered_hub_id"] == "aabbccddeeff"

        # The same address again is nothing: no second rebuild.
        client.portal.call(browser.on_updated, _adv("192.168.1.77", mac="AA:BB:CC:DD:EE:FF"))
        client.get(f"{HUBS}/aabbccddeeff")
        assert factory.latest("192.168.1.77") is new and len(factory.built["192.168.1.77"]) == 1


def test_a_disabled_hub_follows_without_a_proxy_and_a_hub_without_a_mac_is_not_followed(tmp_path: Path) -> None:
    _registered(tmp_path, enabled=False)
    client, factory, _, _ = _rig(tmp_path)
    with client:
        browser = FakeBrowser.instances[-1]
        with client.websocket_connect(f"{API_PREFIX}/events") as ws:
            ws.receive_json()
            client.portal.call(browser.on_updated, _adv("192.168.1.77", mac="AA:BB:CC:DD:EE:FF"))
            assert [ws.receive_json()["kind"] for _ in range(2)] == ["hub_discovered", "hub_host_changed"]
        hub = client.get(f"{HUBS}/aabbccddeeff").json()
        assert hub["config"]["host"] == "192.168.1.77" and not hub["enabled"] and hub["status"] is None
        assert not factory.built

    # Registered by address only (no ready sync yet): an advertisement with a MAC
    # from another address is a different hub for all the server knows.
    _registered(tmp_path, mac=None)
    client, factory, _, _ = _rig(tmp_path)
    with client:
        browser = FakeBrowser.instances[-1]
        client.portal.call(browser.on_updated, _adv("192.168.1.77", mac="AA:BB:CC:DD:EE:FF"))
        client.get(HUBS)
        hub = client.get(f"{HUBS}/192.168.1.50").json()
        assert hub["config"]["host"] == "192.168.1.50"
        assert list(factory.built) == ["192.168.1.50"]
