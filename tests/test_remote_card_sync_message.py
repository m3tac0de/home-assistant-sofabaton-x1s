from pathlib import Path


def test_remote_card_x1s_notice_points_users_to_control_panel() -> None:
    source = Path("custom_components/sofabaton_x1s/www/remote-card.js").read_text(
        encoding="utf-8",
    )

    assert 'sectionTitle.textContent = "Wifi Commands Moved";' in source
    assert "Sofabaton Control Panel card" in source


def test_remote_card_no_longer_calls_wifi_commands_backend() -> None:
    source = Path("custom_components/sofabaton_x1s/www/remote-card.js").read_text(
        encoding="utf-8",
    )

    assert "sofabaton_x1s/command_config/get" not in source
    assert "sofabaton_x1s/command_config/set" not in source
    assert "sofabaton_x1s/command_sync/progress" not in source
    assert 'callService("sofabaton_x1s", "sync_command_config"' not in source
    assert 'type: "sofabaton_x1s/hub/set_version"' not in source


def test_x2_requests_are_tied_to_confirmed_current_activity_changes() -> None:
    source = Path("custom_components/sofabaton_x1s/www/remote-card.js").read_text(
        encoding="utf-8",
    )

    assert "if (activityId != null) {" in source
    assert "if (this._x2LastFetchedActivityId !== confirmedActivityId) {" in source
    assert "this._x2LastFetchedActivityId = confirmedActivityId;" in source
    assert "this._hubRequestAssignedKeys(confirmedActivityId);" in source
    assert "this._hubRequestMacroKeys(confirmedActivityId);" in source
    assert "this._hubRequestFavoriteKeys(confirmedActivityId);" in source


def test_x2_fetch_trigger_no_longer_depends_on_activity_state_gate() -> None:
    source = Path("custom_components/sofabaton_x1s/www/remote-card.js").read_text(
        encoding="utf-8",
    )

    assert "if (activityId != null && this._isActivityOn(activityId, activities)) {" not in source
    assert "Do not gate this on activities[].state" in source


def test_x2_activity_data_requests_bypass_request_seen_dedupe() -> None:
    source = Path("custom_components/sofabaton_x1s/www/remote-card.js").read_text(
        encoding="utf-8",
    )

    assert 'this._hubEnqueueCommand(' in source
    assert '["type:request_assigned_keys", "activity_id:" + Number(activityId)]' in source
    assert '["type:request_macro_keys", "activity_id:" + Number(activityId)]' in source
    assert '["type:request_favorite_keys", "activity_id:" + Number(activityId)]' in source
    assert '"req:assigned:" + String(activityId)' not in source
    assert '"req:macro:" + String(activityId)' not in source
    assert '"req:fav:" + String(activityId)' not in source


def test_x2_baseline_removes_frontend_cache_fallback_and_retry_logic() -> None:
    source = Path("custom_components/sofabaton_x1s/www/remote-card.js").read_text(
        encoding="utf-8",
    )

    assert "this._hubAssignedKeysCache = this._hubAssignedKeysCache || {};" in source
    assert "this._hubMacrosCache = this._hubMacrosCache || {};" in source
    assert "this._hubFavoritesCache = this._hubFavoritesCache || {};" in source
    assert "_hubRequestActivityData(activityId, missing = null)" not in source
    assert "_hubResetActivityRequests(activityId)" not in source


def test_x2_display_cache_is_restored_without_reintroducing_request_gating() -> None:
    source = Path("custom_components/sofabaton_x1s/www/remote-card.js").read_text(
        encoding="utf-8",
    )

    assert "Cache last-known" in source
    assert "this._hubAssignedKeysCache[actKey] = Array.isArray(v) ? v : [];" in source
    assert "this._hubMacrosCache[actKey] = Array.isArray(v) ? v : [];" in source
    assert "this._hubFavoritesCache[actKey] = Array.isArray(v) ? v : [];" in source
    assert "? (this._hubMacrosCache[actKey] ?? [])" in source
    assert "? (this._hubFavoritesCache[actKey] ?? [])" in source
    assert "? (this._hubAssignedKeysCache[actKey] ?? null)" in source
    assert "this._hubRequestAssignedKeys(confirmedActivityId);" in source
    assert "this._hubRequestMacroKeys(confirmedActivityId);" in source
    assert "this._hubRequestFavoriteKeys(confirmedActivityId);" in source
