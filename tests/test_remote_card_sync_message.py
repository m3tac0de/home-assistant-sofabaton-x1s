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
