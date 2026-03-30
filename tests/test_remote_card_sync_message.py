from pathlib import Path


def test_failed_sync_message_branch_precedes_sync_needed_branch() -> None:
    source = Path("custom_components/sofabaton_x1s/www/remote-card.js").read_text(
        encoding="utf-8",
    )

    failed_branch = 'else if (syncStatus === "failed") {'
    failed_message = 'syncState.message || "Last sync failed."'
    sync_needed_branch = "else if (syncNeeded) {"
    sync_needed_message = (
        '"Command config changes need to be synced to the hub."'
    )

    failed_branch_index = source.index(failed_branch)
    sync_needed_branch_index = source.index(sync_needed_branch)

    assert failed_branch_index < sync_needed_branch_index
    assert failed_message in source
    assert sync_needed_message in source


def test_x2_requests_are_tied_to_confirmed_current_activity_changes() -> None:
    source = Path("custom_components/sofabaton_x1s/www/remote-card.js").read_text(
        encoding="utf-8",
    )

    assert 'console.debug("[SofabatonRemoteCard][X2] confirmed activity change"' in source
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

    assert "this._hubAssignedKeysCache" not in source
    assert "this._hubMacrosCache" not in source
    assert "this._hubFavoritesCache" not in source
    assert "_hubRequestActivityData(activityId, missing = null)" not in source
    assert "_hubResetActivityRequests(activityId)" not in source
