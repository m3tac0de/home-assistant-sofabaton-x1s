"""S1 (web-remote plan): the web remote page, its assets, and the per-hub
card configuration document."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from sofabaton_server import API_PREFIX
from sofabaton_server.app import create_app
from sofabaton_server.config import Settings
from sofabaton_server.manager import HubManager
from sofabaton_server.routes_ui import EMBED_DIR, MAX_DOCUMENT_BYTES, PANEL_DIR, REMOTE_DIR

from fakes import Factory, no_network_discovery

HUBS = f"{API_PREFIX}/hubs"


@pytest.fixture
def rig(tmp_path: Path):
    factory = Factory()
    settings = Settings(data_dir=tmp_path)
    manager = HubManager(settings, proxy_factory=factory)
    app = create_app(settings, manager=manager, discovery=no_network_discovery(settings, manager))
    with TestClient(app) as client:
        assert client.post(HUBS, json={"host": "192.168.1.50"}).status_code == 201
        yield client, manager, tmp_path


def test_page_assets_ship_in_the_package() -> None:
    for name in ("index.html", "remote-web.js", "manifest.webmanifest", "icon.svg"):
        assert (REMOTE_DIR / name).is_file(), name
    html = (REMOTE_DIR / "index.html").read_text(encoding="utf-8")
    assert "<sofabaton-remote-web>" in html and 'src="remote-web.js"' in html
    bundle = (REMOTE_DIR / "remote-web.js").read_text(encoding="utf-8")
    assert "sofabaton-remote-web" in bundle and "/api/v1" in bundle
    for name in ("index.html", "panel.js"):
        assert (PANEL_DIR / name).is_file(), name
    html = (PANEL_DIR / "index.html").read_text(encoding="utf-8")
    assert "<sofabaton-server-panel>" in html and 'src="panel.js"' in html
    bundle = (PANEL_DIR / "panel.js").read_text(encoding="utf-8")
    assert "sofabaton-server-panel" in bundle and "/api/v1" in bundle
    embed = (EMBED_DIR / "sofabaton-remote.js").read_text(encoding="utf-8")
    assert '"sofabaton-remote"' in embed and "/ui/embed/" in embed and "/api/v1" in embed


def test_embed_asset_is_public_for_every_origin(rig) -> None:
    """Remote embed plan, E4: the module script other dashboards load
    cross-origin carries ``*``; the API keeps the listed-origin rule."""

    client, _, _ = rig
    js = client.get("/ui/embed/sofabaton-remote.js")
    assert js.status_code == 200 and js.headers["content-type"].startswith("text/javascript")
    assert js.headers["access-control-allow-origin"] == "*"
    assert js.headers["cache-control"] == "no-cache" and js.headers["etag"]
    # An unlisted origin gets the script (and nothing on the API).
    foreign = client.get("/ui/embed/sofabaton-remote.js", headers={"Origin": "https://dash.example"})
    assert foreign.status_code == 200 and foreign.headers["access-control-allow-origin"] == "*"
    assert "access-control-allow-origin" not in client.get(HUBS, headers={"Origin": "https://dash.example"}).headers
    # A revalidation is CORS-checked too.
    again = client.get("/ui/embed/sofabaton-remote.js", headers={
        "if-none-match": js.headers["etag"], "Origin": "https://dash.example"})
    assert again.status_code == 304 and again.headers["access-control-allow-origin"] == "*"
    # Only the bundle is reachable under /ui/embed/.
    assert client.get("/ui/embed/routes_ui.py").status_code == 404
    assert client.get("/ui/embed/nope.js").json()["type"] == "ui_asset_not_found"
    assert client.get("/ui/embed", follow_redirects=False).status_code == 404


def test_embed_asset_keeps_a_single_origin_header_for_a_listed_origin(tmp_path: Path) -> None:
    """The CORS middleware echoes a listed origin on every response; the
    embed asset already carries ``*`` and a second value would make the
    browser reject the script."""

    dash = "http://nas:8123"
    factory = Factory()
    settings = Settings(data_dir=tmp_path, allowed_origins=(dash,))
    manager = HubManager(settings, proxy_factory=factory)
    app = create_app(settings, manager=manager, discovery=no_network_discovery(settings, manager))
    with TestClient(app) as client:
        js = client.get("/ui/embed/sofabaton-remote.js", headers={"Origin": dash})
        assert js.status_code == 200
        assert js.headers.get_list("access-control-allow-origin") == ["*"]
        assert client.get(HUBS, headers={"Origin": dash}).headers.get_list("access-control-allow-origin") == [dash]
        assert client.get("/ui/remote/remote-web.js", headers={"Origin": dash}).headers["access-control-allow-origin"] == dash


def test_root_and_harness_redirect_to_the_panel(rig) -> None:
    client, _, _ = rig
    for path in ("/", "/harness", "/ui"):
        r = client.get(path, follow_redirects=False)
        assert r.status_code == 307 and r.headers["location"] == "/ui/", path
    r = client.get("/ui/")
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/html")
    assert "<sofabaton-server-panel>" in r.text
    assert r.headers["cache-control"] == "no-cache" and r.headers["etag"]
    js = client.get("/ui/panel.js")
    assert js.status_code == 200 and js.headers["content-type"].startswith("text/javascript")
    # The panel's allow-list is its own: the remote's files are not under /ui/.
    assert client.get("/ui/remote-web.js").status_code == 404
    assert client.get("/ui/routes_ui.py").status_code == 404


def test_ui_remote_redirects_to_the_page(rig) -> None:
    client, _, _ = rig
    r = client.get("/ui/remote", follow_redirects=False)
    assert r.status_code == 307 and r.headers["location"] == "/ui/remote/"
    r = client.get("/ui/remote/")
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/html")
    assert "<sofabaton-remote-web>" in r.text
    assert r.headers["cache-control"] == "no-cache" and r.headers["etag"]


def test_assets_are_served_with_types_and_revalidation(rig) -> None:
    client, _, _ = rig
    js = client.get("/ui/remote/remote-web.js")
    assert js.status_code == 200 and js.headers["content-type"].startswith("text/javascript")
    manifest = client.get("/ui/remote/manifest.webmanifest")
    assert manifest.status_code == 200 and manifest.headers["content-type"] == "application/manifest+json"
    assert json.loads(manifest.text)["start_url"] == "./"
    icon = client.get("/ui/remote/icon.svg")
    assert icon.status_code == 200 and icon.headers["content-type"] == "image/svg+xml"
    again = client.get("/ui/remote/remote-web.js", headers={"if-none-match": js.headers["etag"]})
    assert again.status_code == 304
    # Only the allow-listed files are reachable.
    assert client.get("/ui/remote/routes_ui.py").status_code == 404
    assert client.get("/ui/remote/../routes_ui.py").status_code == 404
    assert client.get("/ui/remote/nope.js").json()["type"] == "ui_asset_not_found"


def test_panel_manifest_installs_the_page(rig) -> None:
    """State plan decision 10: the panel installs to a phone's home screen
    like the remote does; its icon is the remote's, served already."""

    client, _, _ = rig
    manifest = client.get("/ui/manifest.webmanifest")
    assert manifest.status_code == 200 and manifest.headers["content-type"] == "application/manifest+json"
    body = json.loads(manifest.text)
    assert body["start_url"] == "./" and body["scope"] == "./" and body["display"] == "standalone"
    assert body["icons"][0]["src"] == "remote/icon.svg"
    assert client.get("/ui/remote/icon.svg").status_code == 200
    assert 'rel="manifest" href="manifest.webmanifest"' in client.get("/ui/").text
    assert client.get("/ui/manifest.webmanifest", headers={"if-none-match": manifest.headers["etag"]}).status_code == 304


def test_page_routes_are_outside_the_api_contract(rig) -> None:
    client, _, _ = rig
    spec = client.get(f"{API_PREFIX}/openapi.json").json()
    assert not any(path.startswith("/ui") or path in ("/", "/harness") for path in spec["paths"])
    assert f"/api/v1/hubs/{{hub_id}}/ui/remote-card" in spec["paths"]


def test_remote_card_document_round_trip(rig) -> None:
    client, manager, data_dir = rig
    h = f"{HUBS}/192.168.1.50/ui/remote-card"

    r = client.get(h)
    assert r.status_code == 200 and r.json() == {"hub_id": "192.168.1.50", "document": None, "updated_at": None}

    document = {"show_dpad": True, "group_order": ["activity", "dpad"], "device_mode": {"enabled": True}}
    r = client.put(h, json={"document": document})
    assert r.status_code == 200, r.text
    assert r.json()["document"] == document and r.json()["updated_at"]
    stored = json.loads(manager.ui_documents.path("192.168.1.50").read_text(encoding="utf-8"))
    assert stored["document"] == document and stored["kind"] == "sofabaton_remote_card_document"
    assert manager.ui_documents.path("192.168.1.50").parent == data_dir

    # A PUT replaces the whole document; an empty object is a valid reset.
    assert client.put(h, json={"document": {}}).json()["document"] == {}
    assert client.get(h).json()["document"] == {}

    r = client.delete(h)
    assert r.status_code == 204
    assert client.get(h).json()["document"] is None
    assert client.delete(h).status_code == 204, "deleting twice is fine"


def test_remote_card_document_validation(rig) -> None:
    client, _, _ = rig
    h = f"{HUBS}/192.168.1.50/ui/remote-card"
    assert client.put(h, json={"document": []}).status_code == 422
    assert client.put(h, json={"document": "x"}).status_code == 422
    assert client.put(h, json={}).status_code == 422
    big = {"notes": "x" * (MAX_DOCUMENT_BYTES + 1)}
    r = client.put(h, json={"document": big})
    assert r.status_code == 413 and r.json()["type"] == "ui_document_too_large"
    for method in ("get", "put", "delete"):
        kwargs = {"json": {"document": {}}} if method == "put" else {}
        r = getattr(client, method)(f"{HUBS}/nope/ui/remote-card", **kwargs)
        assert r.status_code == 404 and r.json()["type"] == "hub_not_found", method


def test_document_follows_the_hub_through_removal(rig) -> None:
    client, manager, _ = rig
    h = f"{HUBS}/192.168.1.50"
    assert client.put(f"{h}/ui/remote-card", json={"document": {"show_dpad": False}}).status_code == 200
    path = manager.ui_documents.path("192.168.1.50")
    assert path.exists()
    assert client.delete(h).status_code in (200, 204)
    assert not path.exists(), "removing the hub removes its document"
