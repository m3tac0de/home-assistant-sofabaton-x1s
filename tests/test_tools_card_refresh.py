from pathlib import Path


def test_tools_card_fingerprint_includes_cache_generation() -> None:
    source = Path("custom_components/sofabaton_x1s/www/tools-card.js").read_text(
        encoding="utf-8",
    )

    assert "attrs.cache_generation" in source
    assert 'return `${id};${attrs.entry_id || ""};${state};${attrs.proxy_client_connected ? "1" : "0"};${Number(attrs.cache_generation || 0)}`;' in source


def test_remote_entity_exposes_cache_generation_attribute() -> None:
    source = Path("custom_components/sofabaton_x1s/remote.py").read_text(
        encoding="utf-8",
    )

    assert '"cache_generation": self._hub.cache_generation,' in source


def test_tools_card_coalesces_generation_driven_reloads() -> None:
    source = Path("custom_components/sofabaton_x1s/www/tools-card.js").read_text(
        encoding="utf-8",
    )

    assert "_didHubGenerationChange(this._lastObservedGenerations, generationSnapshot)" in source
    assert "this._staleData = true;" in source
    assert "this._lastObservedGenerations = generationSnapshot;" in source
    assert "_cacheGenerationSnapshot()" in source
    assert "this._loadingStatePromise" in source


def test_tools_card_flushes_pending_reload_after_manual_refresh() -> None:
    source = Path("custom_components/sofabaton_x1s/www/tools-card.js").read_text(
        encoding="utf-8",
    )

    assert source.count("this._staleData = false;") >= 3


def test_tools_card_manual_refresh_suppresses_generation_driven_follow_up_reload() -> None:
    source = Path("custom_components/sofabaton_x1s/www/tools-card.js").read_text(
        encoding="utf-8",
    )

    assert "this._refreshGraceUntil = Date.now() + 10000;" in source
    assert "Date.now() > this._refreshGraceUntil &&" in source


def test_tools_card_includes_three_tabs_and_no_cache_footer() -> None:
    source = Path("custom_components/sofabaton_x1s/www/tools-card.js").read_text(
        encoding="utf-8",
    )

    assert '{ id: "hub", label: "Hub", disabled: false }' in source
    assert '{ id: "settings", label: "Settings", disabled: false }' in source
    assert '{ id: "cache", label: "Cache", disabled: !this._persistentCacheEnabled() }' in source
    assert "cache-footer" not in source
    assert 'class="tab-btn${this._selectedTab === tab.id ? " active" : ""}${tab.disabled ? " tab-disabled" : ""}"' in source


def test_tools_card_disabled_cache_copy_points_to_settings_tab() -> None:
    source = Path("custom_components/sofabaton_x1s/www/tools-card.js").read_text(
        encoding="utf-8",
    )

    assert "Enable it from the Settings tab to browse cached activities and devices." in source


def test_tools_card_settings_tiles_use_cache_heading_style_and_no_status_labels() -> None:
    source = Path("custom_components/sofabaton_x1s/www/tools-card.js").read_text(
        encoding="utf-8",
    )

    assert '<div class="acc-title">Configuration</div>' in source
    assert "setting-status" not in source
    assert '"Enabled"' not in source
    assert '"Available"' not in source


def test_tools_card_setting_tiles_are_clickable_and_actions_support_disabled_state() -> None:
    source = Path("custom_components/sofabaton_x1s/www/tools-card.js").read_text(
        encoding="utf-8",
    )

    assert 'attrs: `data-setting-tile="persistent_cache"`' in source
    assert 'root.querySelectorAll("[data-setting-tile]").forEach((tile) => {' in source
    assert 'if (ev.target.closest("ha-switch")) return;' in source
    assert 'classes: `action${canFind ? "" : " disabled"}`' in source
    assert 'classes: `action${canSync ? "" : " disabled"}`' in source
    assert 'tile.addEventListener("pointerdown", () => {' in source
    assert 'tile.classList.add("pressed");' in source


def test_tools_card_setting_and_action_presses_patch_settings_ui_in_place() -> None:
    source = Path("custom_components/sofabaton_x1s/www/tools-card.js").read_text(
        encoding="utf-8",
    )

    assert "async _loadControlPanelState()" in source
    assert "_syncSettingsTabUi()" in source
    assert "_syncTabButtonsUi()" in source
    assert source.count("this._syncSettingsTabUi();") >= 6
    assert "await this._loadControlPanelState();" in source
    assert "if (sw.checked !== checked) sw.checked = checked;" in source
    assert 'tile.classList.remove("disabled");' in source


def test_tools_card_uses_live_hub_and_proxy_state_for_settings_availability() -> None:
    source = Path("custom_components/sofabaton_x1s/www/tools-card.js").read_text(
        encoding="utf-8",
    )

    assert "_remoteAttrsForHub(hub)" in source
    assert "_remoteAvailableForHub(hub)" in source
    assert 'const state = String(stateObj?.state || "").toLowerCase();' in source
    assert "typeof attrs.proxy_client_connected === \"boolean\"" in source
    assert "return this._remoteAvailableForHub(hub);" in source
    assert "const currentHub = this._selectedHub();" in source


def test_tools_card_hub_overview_includes_connection_status_tiles() -> None:
    source = Path("custom_components/sofabaton_x1s/www/tools-card.js").read_text(
        encoding="utf-8",
    )

    assert "Hub connected" in source
    assert "Hub not connected" in source
    assert "proxy client is connected" in source


def test_tools_card_hub_and_settings_tabs_are_scrollable() -> None:
    source = Path("custom_components/sofabaton_x1s/www/tools-card.js").read_text(
        encoding="utf-8",
    )

    assert ".tab-panel.scrollable {" in source
    assert "overflow-y: auto;" in source
    assert '<div class="tab-panel scrollable">' in source
