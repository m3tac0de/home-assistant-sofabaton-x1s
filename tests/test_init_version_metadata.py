from custom_components.sofabaton_x1s.__init__ import (
    _inspect_frontend_dir,
    _reconcile_version_metadata,
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
