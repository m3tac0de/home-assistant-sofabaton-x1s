"""The three host-side ports: settings layers, the proxies, and /server/settings."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

from fastapi.testclient import TestClient

from sofabaton import HubConfig

from sofabaton_server import API_PREFIX
from sofabaton_server.app import create_app
from sofabaton_server.cli import build_parser, settings_from_args
from sofabaton_server.config import Settings, load_settings
from sofabaton_server.manager import HubManager

from fakes import Factory, no_network_discovery

URL = f"{API_PREFIX}/server/settings"


def _app(settings: Settings):
    manager = HubManager(settings, proxy_factory=Factory())
    return create_app(settings, manager=manager, discovery=no_network_discovery(settings, manager))


def test_port_defaults_match_the_integration(tmp_path: Path) -> None:
    s = load_settings(environ={}, data_dir=tmp_path)
    assert (s.hub_listen_port, s.app_discovery_port, s.callback_port) == (8200, 8102, 8060)
    assert s.pinned == frozenset()
    assert "pinned" not in s.to_dict()


def test_env_and_cli_pin_their_settings(tmp_path: Path) -> None:
    s = load_settings(cli={"hub_listen_port": 8300}, environ={"SOFABATON_APP_DISCOVERY_PORT": "8103"}, data_dir=tmp_path)
    assert (s.hub_listen_port, s.app_discovery_port) == (8300, 8103)
    assert {"hub_listen_port", "app_discovery_port"} <= s.pinned
    assert "callback_port" not in s.pinned


def test_cli_flags_for_the_ports(tmp_path: Path, monkeypatch) -> None:
    for name in ("SOFABATON_HUB_LISTEN_PORT", "SOFABATON_APP_DISCOVERY_PORT"):
        monkeypatch.delenv(name, raising=False)
    args = build_parser().parse_args(
        ["--data-dir", str(tmp_path), "--hub-listen-port", "8201", "--app-discovery-port", "8104"]
    )
    s = settings_from_args(args)
    assert (s.hub_listen_port, s.app_discovery_port) == (8201, 8104)


def test_server_ports_override_the_hub_record(tmp_path: Path) -> None:
    factory = Factory()

    async def main():
        m = HubManager(Settings(data_dir=tmp_path, hub_listen_port=8201, app_discovery_port=8103), proxy_factory=factory)
        await m.start()
        await m.add(HubConfig(host="192.168.1.50", hub_listen_port=8200, app_discovery_port=8102))
        cfg = factory.latest("192.168.1.50").config
        assert (cfg.hub_listen_port, cfg.app_discovery_port) == (8201, 8103)
        await m.stop()

    asyncio.run(main())


def test_get_reports_running_and_configured(tmp_path: Path) -> None:
    (tmp_path / "server.json").write_text(json.dumps({"callback_port": 8061}), encoding="utf-8")
    settings = Settings(data_dir=tmp_path, pinned=frozenset({"app_discovery_port"}))
    with TestClient(_app(settings)) as client:
        body = client.get(URL).json()
    assert body["hub_listen_port"] == {"running": 8200, "configured": 8200, "default": 8200, "pinned": False}
    assert body["app_discovery_port"]["pinned"] is True
    assert body["callback_port"]["configured"] == 8061 and body["callback_port"]["running"] == 8060
    assert body["restart_required"] is True


def test_put_writes_server_json_and_keeps_other_keys(tmp_path: Path) -> None:
    (tmp_path / "server.json").write_text(json.dumps({"log_level": "debug"}), encoding="utf-8")
    with TestClient(_app(Settings(data_dir=tmp_path))) as client:
        response = client.put(URL, json={"hub_listen_port": 8210, "app_discovery_port": 8102})
        assert response.status_code == 200, response.text
        body = response.json()
    assert body["hub_listen_port"]["configured"] == 8210 and body["hub_listen_port"]["running"] == 8200
    assert body["restart_required"] is True
    saved = json.loads((tmp_path / "server.json").read_text(encoding="utf-8"))
    # Unchanged values are not written; the operator's other keys survive.
    assert saved == {"log_level": "debug", "hub_listen_port": 8210}
    assert load_settings(environ={}, data_dir=tmp_path).hub_listen_port == 8210


def test_put_refuses_pinned_and_conflicting_ports(tmp_path: Path) -> None:
    settings = Settings(data_dir=tmp_path, pinned=frozenset({"callback_port"}))
    with TestClient(_app(settings)) as client:
        pinned = client.put(URL, json={"callback_port": 8070})
        assert pinned.status_code == 409 and pinned.json()["type"] == "setting_pinned"
        same = client.put(URL, json={"callback_port": 8060})           # unchanged: fine
        assert same.status_code == 200
        clash = client.put(URL, json={"hub_listen_port": 8060})
        assert clash.status_code == 422 and clash.json()["type"] == "port_conflict"
        api = client.put(URL, json={"hub_listen_port": settings.port})
        assert api.status_code == 422 and api.json()["type"] == "port_conflict"
        bad = client.put(URL, json={"app_discovery_port": 70000})
        assert bad.status_code == 422 and bad.json()["type"] == "validation_error"
    assert not (tmp_path / "server.json").exists()
