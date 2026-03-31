from pathlib import Path


def test_tools_card_fingerprint_includes_cache_generation() -> None:
    source = Path("custom_components/sofabaton_x1s/www/tools-card.js").read_text(
        encoding="utf-8",
    )

    assert "attrs.cache_generation" in source
    assert 'return `${id};${attrs.entry_id || ""};${attrs.proxy_client_connected ? "1" : "0"};${Number(attrs.cache_generation || 0)}`;' in source


def test_remote_entity_exposes_cache_generation_attribute() -> None:
    source = Path("custom_components/sofabaton_x1s/remote.py").read_text(
        encoding="utf-8",
    )

    assert '"cache_generation": self._hub.cache_generation,' in source


def test_tools_card_coalesces_generation_driven_reloads() -> None:
    source = Path("custom_components/sofabaton_x1s/www/tools-card.js").read_text(
        encoding="utf-8",
    )

    assert "const AUTO_RELOAD_BUFFER_MS =" in source
    assert "_didHubGenerationChange(this._lastObservedGenerations, generationSnapshot)" in source
    assert "this._scheduleAutoReload();" in source
    assert "this._pendingAutoReload = true;" in source
    assert "window.clearTimeout(this._autoReloadTimer);" in source
    assert "}, AUTO_RELOAD_BUFFER_MS);" in source
    assert "this._loadingStatePromise" in source


def test_tools_card_flushes_pending_reload_after_manual_refresh() -> None:
    source = Path("custom_components/sofabaton_x1s/www/tools-card.js").read_text(
        encoding="utf-8",
    )

    assert source.count("this._flushAutoReload();") >= 3


def test_tools_card_manual_refresh_suppresses_generation_driven_follow_up_reload() -> None:
    source = Path("custom_components/sofabaton_x1s/www/tools-card.js").read_text(
        encoding="utf-8",
    )

    assert "this._suppressAutoReload = true;" in source
    assert "this._suppressAutoReload = false;" in source
    assert "this._pendingAutoReload = false;" in source
    assert "!this._suppressAutoReload &&" in source
