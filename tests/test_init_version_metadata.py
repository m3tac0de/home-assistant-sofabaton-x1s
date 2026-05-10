import asyncio
from pathlib import Path
from types import SimpleNamespace

from homeassistant.components import frontend
from custom_components.sofabaton_x1s.__init__ import (
    _async_get_remote_card_version,
    _async_unregister_lovelace_resources,
    _async_sync_lovelace_resources,
    _build_frontend_module_specs,
    _frontend_loader_url,
    _get_lovelace_resource_mode,
    _inspect_frontend_dir,
    _reconcile_version_metadata,
    async_unload_entry,
    async_setup,
)


def test_reconcile_backfills_hver_for_existing_manual_entry() -> None:
    version, data, opts, changed = _reconcile_version_metadata(
        {
            "name": "Hub",
            "mdns_txt": {"MAC": "aa:bb", "NAME": "Hub"},
            "mdns_version": "X1S",
        },
        {"mdns_version": "X1S"},
    )

    assert changed is True
    assert version == "X1S"
    assert data["mdns_txt"]["HVER"] == "2"
    assert data["mdns_version"] == "X1S"
    assert opts["mdns_version"] == "X1S"


def test_reconcile_prefers_hver_over_stale_stored_version() -> None:
    version, data, opts, changed = _reconcile_version_metadata(
        {
            "mdns_txt": {"HVER": "2", "MAC": "aa:bb"},
            "mdns_version": "X1",
        },
        {"mdns_version": "X1"},
    )

    assert changed is True
    assert version == "X1S"
    assert data["mdns_version"] == "X1S"
    assert opts["mdns_version"] == "X1S"


def test_reconcile_keeps_entry_unchanged_when_already_consistent() -> None:
    version, data, opts, changed = _reconcile_version_metadata(
        {
            "mdns_txt": {"HVER": "1", "MAC": "aa:bb"},
            "mdns_version": "X1",
        },
        {"mdns_version": "X1", "proxy_udp_port": 8102},
    )

    assert changed is False
    assert version == "X1"
    assert data["mdns_txt"]["HVER"] == "1"
    assert opts["proxy_udp_port"] == 8102


def test_reconcile_does_not_backfill_hver_without_confident_source() -> None:
    version, data, opts, changed = _reconcile_version_metadata(
        {
            "mdns_txt": {"MAC": "aa:bb"},
        },
        {},
    )

    assert version == "X1"
    assert changed is True
    assert "HVER" not in data["mdns_txt"]
    assert data["mdns_version"] == "X1"
    assert opts["mdns_version"] == "X1"


def test_inspect_frontend_dir_returns_contents_for_existing_directory(tmp_path) -> None:
    frontend_dir = tmp_path / "www"
    frontend_dir.mkdir()
    (frontend_dir / "card-loader.js").write_text("console.log('ok');", encoding="utf-8")
    (frontend_dir / "editor.js").write_text("console.log('editor');", encoding="utf-8")

    abs_path, exists, contents = _inspect_frontend_dir(frontend_dir)

    assert abs_path == str(frontend_dir.resolve())
    assert exists is True
    assert set(contents) == {"card-loader.js", "editor.js"}


def test_inspect_frontend_dir_handles_missing_directory(tmp_path) -> None:
    frontend_dir = tmp_path / "missing"

    abs_path, exists, contents = _inspect_frontend_dir(frontend_dir)

    assert abs_path == str(frontend_dir.resolve())
    assert exists is False
    assert contents == []


class _FakeHass:
    def __init__(self, *, lovelace=None) -> None:
        self.data = {}
        if lovelace is not None:
            self.data["lovelace"] = lovelace
        self.bus = SimpleNamespace(async_listen_once=lambda *args, **kwargs: None)
        self.http = SimpleNamespace(async_register_static_paths=self._register_static_paths)
        self.config = SimpleNamespace(path=lambda *parts: str(Path("config").joinpath(*parts)))
        self.config_entries = SimpleNamespace(async_unload_platforms=self._async_unload_platforms)
        self.services = SimpleNamespace(async_remove=self._async_remove_service)
        self._registered_static_paths = []
        self._removed_services = []

    async def async_add_executor_job(self, func, *args):
        return func(*args)

    async def _register_static_paths(self, paths):
        self._registered_static_paths.extend(paths)

    async def _async_unload_platforms(self, entry, platforms):
        return True

    def _async_remove_service(self, domain, service):
        self._removed_services.append((domain, service))


class _FakeResources:
    def __init__(self, items, *, loaded: bool = True) -> None:
        self.loaded = loaded
        self._items = [dict(item) for item in items]
        self.created = []
        self.updated = []
        self.deleted = []

    def async_items(self):
        return [dict(item) for item in self._items]

    async def async_create_item(self, payload):
        next_id = max([int(item.get("id", 0)) for item in self._items] or [0]) + 1
        item = {"id": next_id, **payload}
        self._items.append(item)
        self.created.append(dict(item))
        return item

    async def async_update_item(self, item_id, payload):
        for index, item in enumerate(self._items):
            if item.get("id") == item_id:
                updated = {**item, **payload}
                self._items[index] = updated
                self.updated.append((item_id, dict(payload)))
                return updated
        raise KeyError(item_id)

    async def async_delete_item(self, item_id):
        self._items = [item for item in self._items if item.get("id") != item_id]
        self.deleted.append(item_id)


class _FakeLovelace:
    def __init__(self, resources, *, resource_mode=None, mode=None) -> None:
        self.resources = resources
        self.resource_mode = resource_mode
        self.mode = mode


def test_get_lovelace_resource_mode_prefers_resource_mode() -> None:
    hass = _FakeHass(lovelace=_FakeLovelace(None, resource_mode="storage", mode="yaml"))

    assert _get_lovelace_resource_mode(hass) == "storage"


def test_get_lovelace_resource_mode_falls_back_to_mode() -> None:
    hass = _FakeHass(lovelace=_FakeLovelace(None, resource_mode=None, mode="yaml"))

    assert _get_lovelace_resource_mode(hass) == "yaml"


def test_frontend_loader_url_keeps_tools_version_and_remote_flag() -> None:
    assert (
        _frontend_loader_url("0.5.7", False, remote_version="0.1.6")
        == "/sofabaton_x1s/www/card-loader.js?v=0.5.7&inject_remote=0&remote_v=0.1.6"
    )


def test_build_frontend_module_specs_can_skip_bundled_remote_card() -> None:
    specs = _build_frontend_module_specs(
        tools_version="0.5.7",
        remote_version="0.1.6",
        include_remote_card=False,
    )

    assert specs == [
        {
            "name": "Sofabaton Control Panel",
            "filename": "tools-card.js",
            "version": "0.5.7",
        }
    ]


def test_async_get_remote_card_version_reads_source_constant() -> None:
    version = asyncio.run(_async_get_remote_card_version(_FakeHass()))

    assert version == "0.1.6"


def test_async_sync_lovelace_resources_creates_and_updates_expected_modules() -> None:
    resources = _FakeResources(
        [
            {
                "id": 1,
                "res_type": "module",
                "url": "/sofabaton_x1s/www/tools-card.js?v=0.5.6",
            }
        ]
    )
    hass = _FakeHass(lovelace=_FakeLovelace(resources, resource_mode="storage"))
    modules = _build_frontend_module_specs(
        tools_version="0.5.7",
        remote_version="0.1.6",
        include_remote_card=True,
    )

    asyncio.run(_async_sync_lovelace_resources(hass, modules))

    assert resources.updated == [
        (1, {"res_type": "module", "url": "/sofabaton_x1s/www/tools-card.js?v=0.5.7"})
    ]
    assert resources.created == [
        {
            "id": 2,
            "res_type": "module",
            "url": "/sofabaton_x1s/www/remote-card.js?v=0.1.6",
        }
    ]
    assert resources.deleted == []


def test_async_sync_lovelace_resources_removes_stale_bundled_remote_resource() -> None:
    resources = _FakeResources(
        [
            {
                "id": 1,
                "res_type": "module",
                "url": "/sofabaton_x1s/www/tools-card.js?v=0.5.7",
            },
            {
                "id": 2,
                "res_type": "module",
                "url": "/sofabaton_x1s/www/remote-card.js?v=0.1.6",
            },
        ]
    )
    hass = _FakeHass(lovelace=_FakeLovelace(resources, resource_mode="storage"))
    modules = _build_frontend_module_specs(
        tools_version="0.5.7",
        remote_version="0.1.6",
        include_remote_card=False,
    )

    asyncio.run(_async_sync_lovelace_resources(hass, modules))

    assert resources.created == []
    assert resources.updated == []
    assert resources.deleted == [2]


def test_async_unregister_lovelace_resources_removes_all_bundled_entries() -> None:
    resources = _FakeResources(
        [
            {
                "id": 1,
                "res_type": "module",
                "url": "/sofabaton_x1s/www/tools-card.js?v=0.5.7",
            },
            {
                "id": 2,
                "res_type": "module",
                "url": "/sofabaton_x1s/www/remote-card.js?v=0.1.6",
            },
            {
                "id": 3,
                "res_type": "module",
                "url": "/hacsfiles/other-card.js",
            },
        ]
    )
    hass = _FakeHass(lovelace=_FakeLovelace(resources, resource_mode="storage"))

    asyncio.run(_async_unregister_lovelace_resources(hass))

    assert resources.deleted == [1, 2]


def test_async_setup_uses_storage_mode_resource_registration(monkeypatch) -> None:
    hass = _FakeHass(lovelace=_FakeLovelace(_FakeResources([], loaded=True), resource_mode="storage"))
    registered_modules = []
    added_loader_urls = []

    monkeypatch.setattr(
        "custom_components.sofabaton_x1s.__init__._async_has_community_remote_card",
        lambda hass: asyncio.sleep(0, result=False),
    )
    monkeypatch.setattr(
        "custom_components.sofabaton_x1s.__init__._inspect_frontend_dir",
        lambda frontend_dir: (str(frontend_dir.resolve()), True, ["tools-card.js", "remote-card.js"]),
    )
    monkeypatch.setattr(
        "custom_components.sofabaton_x1s.__init__._async_get_integration_version",
        lambda hass: asyncio.sleep(0, result="0.5.7"),
    )
    monkeypatch.setattr(
        "custom_components.sofabaton_x1s.__init__._async_get_remote_card_version",
        lambda hass: asyncio.sleep(0, result="0.1.6"),
    )

    async def _capture_modules(_hass, modules, **kwargs):
        registered_modules.append(modules)

    monkeypatch.setattr(
        "custom_components.sofabaton_x1s.__init__._async_register_storage_mode_resources",
        _capture_modules,
    )
    monkeypatch.setattr(frontend, "add_extra_js_url", lambda hass, url: added_loader_urls.append(url))

    assert asyncio.run(async_setup(hass, {})) is True
    assert registered_modules == [[
        {
            "name": "Sofabaton Control Panel",
            "filename": "tools-card.js",
            "version": "0.5.7",
        },
        {
            "name": "Sofabaton Virtual Remote",
            "filename": "remote-card.js",
            "version": "0.1.6",
        },
    ]]
    assert added_loader_urls == []


def test_async_setup_uses_loader_fallback_outside_storage_mode(monkeypatch) -> None:
    hass = _FakeHass(lovelace=_FakeLovelace(_FakeResources([], loaded=True), resource_mode="yaml"))
    registered_modules = []
    added_loader_urls = []

    monkeypatch.setattr(
        "custom_components.sofabaton_x1s.__init__._async_has_community_remote_card",
        lambda hass: asyncio.sleep(0, result=False),
    )
    monkeypatch.setattr(
        "custom_components.sofabaton_x1s.__init__._inspect_frontend_dir",
        lambda frontend_dir: (str(frontend_dir.resolve()), True, ["tools-card.js", "remote-card.js", "card-loader.js"]),
    )
    monkeypatch.setattr(
        "custom_components.sofabaton_x1s.__init__._async_get_integration_version",
        lambda hass: asyncio.sleep(0, result="0.5.7"),
    )
    monkeypatch.setattr(
        "custom_components.sofabaton_x1s.__init__._async_get_remote_card_version",
        lambda hass: asyncio.sleep(0, result="0.1.6"),
    )

    async def _capture_modules(_hass, modules, **kwargs):
        registered_modules.append(modules)

    monkeypatch.setattr(
        "custom_components.sofabaton_x1s.__init__._async_register_storage_mode_resources",
        _capture_modules,
    )
    monkeypatch.setattr(frontend, "add_extra_js_url", lambda hass, url: added_loader_urls.append(url))

    assert asyncio.run(async_setup(hass, {})) is True
    assert registered_modules == []
    assert added_loader_urls == [
        "/sofabaton_x1s/www/card-loader.js?v=0.5.7&inject_remote=1&remote_v=0.1.6"
    ]


def test_async_unload_entry_unregisters_frontend_resources_when_last_hub_is_removed(monkeypatch) -> None:
    resources = _FakeResources(
        [
            {
                "id": 1,
                "res_type": "module",
                "url": "/sofabaton_x1s/www/tools-card.js?v=0.5.7",
            }
        ]
    )
    hass = _FakeHass(lovelace=_FakeLovelace(resources, resource_mode="storage"))
    hass.data["sofabaton_x1s"] = {
        "frontend_registered": True,
        "entry-1": SimpleNamespace(entry_id="entry-1", async_stop=_async_noop),
    }
    entry = SimpleNamespace(entry_id="entry-1")
    listener = SimpleNamespace(async_remove_hub=_async_noop)

    monkeypatch.setattr(
        "custom_components.sofabaton_x1s.__init__._get_hubs",
        lambda domain_data: [],
    )
    monkeypatch.setattr(
        "custom_components.sofabaton_x1s.__init__.async_teardown_diagnostics",
        lambda hass: None,
    )
    monkeypatch.setattr(
        "custom_components.sofabaton_x1s.__init__.async_disable_hex_logging_capture",
        lambda hass, entry_id: None,
    )
    monkeypatch.setattr(
        "custom_components.sofabaton_x1s.__init__._async_persist_hub_cache",
        _async_true,
    )
    monkeypatch.setattr(
        "custom_components.sofabaton_x1s.__init__.async_get_roku_listener",
        lambda hass: asyncio.sleep(0, result=listener),
    )

    assert asyncio.run(async_unload_entry(hass, entry)) is True
    assert resources.deleted == [1]
    assert hass.data["sofabaton_x1s"]["frontend_registered"] is False


async def _async_noop(*args, **kwargs):
    return None


async def _async_true(*args, **kwargs):
    return True
