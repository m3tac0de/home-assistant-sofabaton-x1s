"""The per-entity cache tables and the clear paths derived from them (R6, CR-L4a-12).

Adding a table means registering it in ``lib/entity_tables.py``; these
tests fail when a table is not registered, when a clear path leaves an
entity behind, or when a persisted table does not survive the cache
document.
"""

from __future__ import annotations

import re

import pytest

from custom_components.sofabaton_x1s.lib.entity_tables import (
    ENTITY_TABLES,
    WRITE_GROUPS,
    EntityTable,
)
from custom_components.sofabaton_x1s.lib.macros import MacroKeyEntry, MacroRecord
from custom_components.sofabaton_x1s.lib.state_helpers import ActivityCache
from custom_components.sofabaton_x1s.lib.x1_proxy import X1Proxy

DEV, DEV_OTHER = 0x05, 0x06
ACT, ACT_OTHER = 0x66, 0x67

# ActivityCache attributes that are not keyed by entity id.
NOT_PER_ENTITY = {"current_activity", "current_activity_hint", "generation", "app_activations"}


def _proxy() -> X1Proxy:
    return X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)


def _ids_for(table: EntityTable) -> list[int]:
    ids = []
    if "device" in table.kinds:
        ids += [DEV, DEV_OTHER]
    if "activity" in table.kinds:
        ids += [ACT, ACT_OTHER]
    return ids


def _seed(proxy: X1Proxy) -> None:
    for table in ENTITY_TABLES:
        container = table.get(proxy)
        for ent in _ids_for(table):
            if table.shape == "pair_keyed":
                container[(ent, 1)] = object()
            elif table.shape == "value_sets":
                container.setdefault((1, 2), set()).add(ent)
            elif isinstance(container, dict):
                container[ent] = object()
            else:
                container.add(ent)


def _holds(proxy: X1Proxy, table: EntityTable, ent: int) -> bool:
    container = table.get(proxy)
    if table.shape == "pair_keyed":
        return any(key[0] == ent for key in container)
    if table.shape == "value_sets":
        return any(ent in members for members in container.values())
    return ent in container


def test_every_per_entity_state_table_is_registered() -> None:
    registered = {table.name for table in ENTITY_TABLES}
    for attr in vars(ActivityCache()):
        if attr in NOT_PER_ENTITY:
            continue
        if attr == "detail_fetched_at":
            assert {"state.detail_fetched_at.device", "state.detail_fetched_at.activity"} <= registered
            continue
        assert f"state.{attr}" in registered, f"ActivityCache.{attr} is not in ENTITY_TABLES"


def test_every_request_and_completion_set_is_registered() -> None:
    registered = {table.name for table in ENTITY_TABLES}
    proxy = _proxy()
    for attr in vars(proxy):
        if re.fullmatch(r"_pending_\w+_requests|_\w+_complete", attr):
            assert attr in registered, f"X1Proxy.{attr} is not in ENTITY_TABLES"


def test_every_registered_table_exists_on_a_real_proxy() -> None:
    proxy = _proxy()
    for table in ENTITY_TABLES:
        table.get(proxy)
        if table.lock:
            assert hasattr(proxy, table.lock), table.name


@pytest.mark.parametrize(("kind", "ent", "other"), [("device", DEV, DEV_OTHER), ("activity", ACT, ACT_OTHER)])
def test_clear_cached_entity_detail_leaves_nothing_of_the_entity(kind: str, ent: int, other: int) -> None:
    proxy = _proxy()
    _seed(proxy)
    generation = proxy.state.generation

    proxy.clear_cached_entity_detail(ent, kind=kind)

    for table in ENTITY_TABLES:
        if kind in table.kinds:
            assert not _holds(proxy, table, ent), f"{table.name} kept {kind} 0x{ent:02X}"
            assert _holds(proxy, table, other), f"{table.name} lost the neighbour 0x{other:02X}"
        else:
            for untouched in _ids_for(table):
                assert _holds(proxy, table, untouched), f"{table.name} lost 0x{untouched:02X}"
    assert proxy.state.generation > generation


def test_wipe_all_cached_state_empties_every_table() -> None:
    proxy = _proxy()
    _seed(proxy)

    proxy.wipe_all_cached_state()

    for table in ENTITY_TABLES:
        assert not table.get(proxy), f"{table.name} survived the wipe"


def test_clear_entity_cache_clears_exactly_the_write_groups() -> None:
    proxy = _proxy()
    _seed(proxy)

    proxy.clear_entity_cache(ACT, clear_buttons=True, clear_favorites=True, clear_macros=True)

    for table in ENTITY_TABLES:
        if "activity" not in table.kinds:
            continue
        if table.group in WRITE_GROUPS:
            assert not _holds(proxy, table, ACT), f"{table.name} kept 0x{ACT:02X}"
        else:
            assert _holds(proxy, table, ACT), f"{table.name} lost 0x{ACT:02X}"
        assert _holds(proxy, table, ACT_OTHER), f"{table.name} lost the neighbour"


def test_clear_entity_cache_keeps_the_command_catalog_on_request() -> None:
    proxy = _proxy()
    _seed(proxy)

    proxy.clear_entity_cache(DEV, clear_buttons=True, clear_commands=False)

    for table in ENTITY_TABLES:
        if table.group == "commands" and "device" in table.kinds:
            assert _holds(proxy, table, DEV), table.name
        if table.group == "buttons":
            assert not _holds(proxy, table, DEV), table.name


def _seed_persisted(proxy: X1Proxy) -> None:
    state = proxy.state
    state.devices[DEV] = {"device_id": DEV, "name": "TV"}
    state.ip_devices[DEV] = {"name": "TV"}
    state.activities[ACT] = {"name": "Watch"}
    state.commands[DEV] = {1: "Power"}
    state.command_metadata[DEV] = {1: {"library_type": 13, "button_code": 7}}
    state.device_key_sorts[DEV] = {"order": 1}
    state.buttons[ACT] = {1, 2}
    state.button_details[ACT] = {1: {"device_id": DEV, "command_id": 1}}
    state.activity_command_refs[ACT] = {(DEV, 1)}
    state.activity_favorite_slots[ACT] = [{"button_id": 1, "device_id": DEV, "command_id": 1, "source": "cache"}]
    state.activity_members[ACT] = {DEV}
    state.activity_favorite_labels[ACT] = {(DEV, 1): "Power"}
    state.activity_favorites_order[ACT] = [(1, 0)]
    state.activity_macros[ACT] = [{"button_id": 3, "label": "Movie"}]
    state.device_input_records[DEV] = {"entries": []}
    state.ip_buttons[DEV] = {1: {"label": "Up"}}
    state.detail_fetched_at["device"][DEV] = "2026-09-30T12:00:00+00:00"
    state.detail_fetched_at["activity"][ACT] = "2026-09-30T12:00:00+00:00"
    # The import derives these from the tables above; a fetch sets them.
    proxy._commands_complete.add(DEV)
    proxy._macros_complete.add(ACT)
    proxy._macro_records_cache[(ACT, 3)] = MacroRecord(
        activity_id=ACT,
        key_id=3,
        label="Movie",
        key_sequence=(MacroKeyEntry(device_id=DEV, key_id=1, fid=0, duration=0, delay=255),),
        raw_label_slot=b"",
    )


def test_every_persisted_table_survives_the_cache_document() -> None:
    source = _proxy()
    _seed_persisted(source)
    document = source.export_cache_state()

    for table in ENTITY_TABLES:
        if table.persisted:
            assert document.get(table.persisted), f"{table.persisted} missing from the export"

    target = _proxy()
    target.import_cache_state(document)
    again = target.export_cache_state()
    document.pop("generation")
    again.pop("generation")
    assert again == document
