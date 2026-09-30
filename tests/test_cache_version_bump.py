"""Phase 6 guardrail: the persistent cache schema version must be at
least 2. Phase 6 reshapes the state surface enough that any older
cache file is no longer safe to load, so we bump the version and let
HomeAssistant's :class:`Store` discard pre-bump payloads on read.
"""

from __future__ import annotations

from custom_components.sofabaton_x1s.cache_store import CACHE_STORE_VERSION


def test_cache_store_version_bumped_for_phase_6() -> None:
    assert CACHE_STORE_VERSION >= 2, (
        "Phase 6 reshapes the cached state; bump CACHE_STORE_VERSION so old "
        "caches are discarded on load."
    )


def test_a_major_bump_purges_the_hubs_but_keeps_the_opt_in() -> None:
    """CR-H2-6: the migration used to switch the cache off for every user."""

    import asyncio

    from custom_components.sofabaton_x1s.cache_store import _MigratingStore

    old = {"enabled": True, "hubs": {"entry-1": {"devices": {"1": {}}}}}
    migrated = asyncio.run(_MigratingStore._async_migrate_func(None, 1, 0, old))  # type: ignore[arg-type]
    assert migrated == {"enabled": True, "hubs": {}}

    migrated = asyncio.run(_MigratingStore._async_migrate_func(None, 1, 0, {"hubs": {}}))  # type: ignore[arg-type]
    assert migrated == {"enabled": False, "hubs": {}}
