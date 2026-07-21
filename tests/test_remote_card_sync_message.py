from pathlib import Path


def _remote_card_ts() -> str:
    return Path("custom_components/sofabaton_x1s/www/src/remote-card.ts").read_text(
        encoding="utf-8",
    )


def _remote_card_hub_ts() -> str:
    return Path("custom_components/sofabaton_x1s/www/src/remote-card-hub.ts").read_text(
        encoding="utf-8",
    )


def _remote_card_state_ts() -> str:
    return Path("custom_components/sofabaton_x1s/www/src/remote-card-state.ts").read_text(
        encoding="utf-8",
    )


def _remote_card_store_ts() -> str:
    return Path(
        "custom_components/sofabaton_x1s/www/src/state/remote-card-store.ts"
    ).read_text(encoding="utf-8")


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
    assert "if (this.x2LastFetchedActivityId !== confirmedActivityId) {" in source
    assert "this.x2LastFetchedActivityId = confirmedActivityId;" in source
    assert "this.hubRequestAssignedKeys(confirmedActivityId);" in source
    assert "this.hubRequestMacroKeys(confirmedActivityId);" in source
    assert "this.hubRequestFavoriteKeys(confirmedActivityId);" in source


def test_x2_fetch_trigger_no_longer_depends_on_activity_state_gate() -> None:
    # The fetch trigger lives in the Lit store since the shadow-DOM
    # refactor; the legacy card (and its explanatory comment) is gone.
    source = _remote_card_store_ts()

    assert "if (activityId != null && this._isActivityOn(activityId, activities)) {" not in source
    assert "if (activityId != null && this.isActivityOn(activityId, activities)) {" not in source
    assert "// X2 baseline behavior: on each confirmed current_activity_id change," in source


def test_x2_activity_data_requests_bypass_request_seen_dedupe() -> None:
    source = _remote_card_hub_ts()

    assert "return [\"type:request_assigned_keys\", `activity_id:${Number(activityId)}`];" in source
    assert "return [\"type:request_macro_keys\", `activity_id:${Number(activityId)}`];" in source
    assert "return [\"type:request_favorite_keys\", `activity_id:${Number(activityId)}`];" in source
    assert '"req:assigned:" + String(activityId)' not in source
    assert '"req:macro:" + String(activityId)' not in source
    assert '"req:fav:" + String(activityId)' not in source


def test_x2_baseline_removes_frontend_cache_fallback_and_retry_logic() -> None:
    source = _remote_card_store_ts()

    assert "hubAssignedKeysCache: this.hubAssignedKeysCache || {}," in source
    assert "hubMacrosCache: this.hubMacrosCache || {}," in source
    assert "hubFavoritesCache: this.hubFavoritesCache || {}," in source
    assert "hubRequestActivityData" not in source
    assert "hubResetActivityRequests" not in source


def test_x2_display_cache_is_restored_without_reintroducing_request_gating() -> None:
    source = _remote_card_state_ts()

    assert "nextAssignedCache[actKey] = Array.isArray(v) ? v : [];" in source
    assert "nextMacrosCache[actKey] = Array.isArray(v) ? v : [];" in source
    assert "nextFavoritesCache[actKey] = Array.isArray(v) ? v : [];" in source
    assert "(nextMacrosCache[actKey] ?? [])" in source
    assert "(nextFavoritesCache[actKey] ?? [])" in source
    assert "(nextAssignedCache[actKey] ?? null)" in source
