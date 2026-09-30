"""One registry of the proxy's per-entity cache tables (R6, CR-L4a-12).

Every table the proxy keeps per device or activity id is declared here
once, with the entity kinds it holds and the group it belongs to. The
clear paths derive from it instead of listing tables by hand:

* :meth:`CacheBackupMixin.clear_cached_entity_detail` forgets one id in
  every table of its kind (the prune of ids a catalog read no longer
  returns, which must leave nothing behind for a reused id);
* :meth:`CacheBackupMixin.wipe_all_cached_state` clears every table (an
  erase);
* :meth:`CatalogMixin.clear_entity_cache` forgets one id in the groups a
  write invalidated (``commands``, ``buttons``, ``favorites``,
  ``macros``).

A new table is added here, or ``tests/lib/test_entity_tables.py`` fails.
Device and activity ids never overlap (activities start at 0x65), so a
table that holds both kinds is cleared by id alone.
"""

from __future__ import annotations

from contextlib import nullcontext
from dataclasses import dataclass
from typing import Any, Callable, Iterable, Literal

Shape = Literal["keyed", "pair_keyed", "value_sets"]

DEVICE = frozenset({"device"})
ACTIVITY = frozenset({"activity"})
BOTH = frozenset({"device", "activity"})

# The groups clear_entity_cache takes, by its flag names.
WRITE_GROUPS = ("commands", "buttons", "favorites", "macros")


@dataclass(frozen=True)
class EntityTable:
    """One per-entity table on the proxy.

    ``shape`` says how an id lives in the container: ``keyed`` (a dict key
    or set member), ``pair_keyed`` (the first half of a tuple key) or
    ``value_sets`` (a member of the value sets, e.g. the activities
    waiting on a favorite label). ``cached`` marks hub data, as opposed to
    request and completion bookkeeping. ``persisted`` is the table's key
    in the cache document (``export_cache_state``), None when not stored.
    """

    name: str
    kinds: frozenset[str]
    group: str
    get: Callable[[Any], Any]
    shape: Shape = "keyed"
    lock: str | None = None
    cached: bool = True
    persisted: str | None = None

    def _locked(self, proxy: Any):
        return getattr(proxy, self.lock) if self.lock else nullcontext()

    def forget(self, proxy: Any, ent_lo: int) -> None:
        with self._locked(proxy):
            container = self.get(proxy)
            if self.shape == "keyed":
                if isinstance(container, dict):
                    container.pop(ent_lo, None)
                else:
                    container.discard(ent_lo)
            elif self.shape == "pair_keyed":
                for key in [k for k in container if (k[0] & 0xFF) == ent_lo]:
                    del container[key]
            else:
                for key in list(container):
                    container[key].discard(ent_lo)
                    if not container[key]:
                        del container[key]

    def clear(self, proxy: Any) -> None:
        with self._locked(proxy):
            self.get(proxy).clear()

    def ids(self, proxy: Any) -> set[int]:
        """The entity ids a ``keyed`` table holds."""
        with self._locked(proxy):
            return {int(key) & 0xFF for key in self.get(proxy)}


def _state(attr: str) -> Callable[[Any], Any]:
    return lambda proxy: getattr(proxy.state, attr)


def _proxy(attr: str) -> Callable[[Any], Any]:
    return lambda proxy: getattr(proxy, attr)


def _fetched_at(kind: str) -> Callable[[Any], Any]:
    return lambda proxy: proxy.state.detail_fetched_at[kind]


ENTITY_TABLES: tuple[EntityTable, ...] = (
    # Name catalogs.
    EntityTable("state.devices", DEVICE, "catalog", _state("devices"), persisted="devices"),
    EntityTable("state.ip_devices", DEVICE, "catalog", _state("ip_devices"), persisted="ip_devices"),
    EntityTable("state.activities", ACTIVITY, "catalog", _state("activities"), persisted="activities"),
    EntityTable("_activity_row_payloads", ACTIVITY, "catalog", _proxy("_activity_row_payloads"), cached=False),
    # Command catalog (REQ_COMMANDS and the key-sort pages).
    EntityTable("state.commands", BOTH, "commands", _state("commands"), persisted="commands"),
    EntityTable("state.command_metadata", BOTH, "commands", _state("command_metadata"), persisted="command_metadata"),
    EntityTable("state.device_key_sorts", DEVICE, "commands", _state("device_key_sorts"), persisted="device_key_sorts"),
    EntityTable("_commands_complete", BOTH, "commands", _proxy("_commands_complete"), cached=False),
    EntityTable("_pending_command_requests", BOTH, "commands", _proxy("_pending_command_requests"), cached=False),
    # Keymaps.
    EntityTable("state.buttons", BOTH, "buttons", _state("buttons"), persisted="buttons"),
    EntityTable("state.button_details", BOTH, "buttons", _state("button_details"), persisted="button_details"),
    EntityTable("_pending_button_requests", BOTH, "buttons", _proxy("_pending_button_requests"), cached=False),
    # Activity map: members, favorites and the labels they show.
    EntityTable("state.activity_command_refs", ACTIVITY, "favorites", _state("activity_command_refs"), persisted="activity_command_refs"),
    EntityTable("state.activity_favorite_slots", ACTIVITY, "favorites", _state("activity_favorite_slots"), persisted="activity_favorite_slots"),
    EntityTable("state.activity_members", ACTIVITY, "favorites", _state("activity_members"), persisted="activity_members"),
    EntityTable("state.activity_favorite_labels", ACTIVITY, "favorites", _state("activity_favorite_labels"), persisted="activity_favorite_labels"),
    EntityTable("_favorite_label_requests", ACTIVITY, "favorites", _proxy("_favorite_label_requests"), shape="value_sets", cached=False),
    EntityTable("_pending_activity_map_requests", ACTIVITY, "favorites", _proxy("_pending_activity_map_requests"), cached=False),
    EntityTable("_activity_map_complete", ACTIVITY, "favorites", _proxy("_activity_map_complete"), cached=False),
    # Quick-access order (family 0x61); a favorites write re-reads it separately.
    EntityTable("state.activity_favorites_order", ACTIVITY, "favorites_order", _state("activity_favorites_order"), persisted="activity_favorites_order"),
    # Macros.
    EntityTable("state.activity_macros", ACTIVITY, "macros", _state("activity_macros"), persisted="activity_macros"),
    EntityTable("_macro_records_cache", BOTH, "macros", _proxy("_macro_records_cache"), shape="pair_keyed", lock="_macro_payload_lock", persisted="macro_records"),
    EntityTable("_macros_complete", BOTH, "macros", _proxy("_macros_complete"), cached=False),
    EntityTable("_pending_macro_requests", BOTH, "macros", _proxy("_pending_macro_requests"), cached=False),
    # Device records read on demand.
    EntityTable("state.device_input_records", DEVICE, "inputs", _state("device_input_records"), persisted="device_input_records"),
    EntityTable("state.ip_buttons", DEVICE, "ip", _state("ip_buttons"), persisted="ip_buttons"),
    EntityTable("_idle_behavior_values", DEVICE, "idle", _proxy("_idle_behavior_values"), lock="_idle_behavior_lock"),
    EntityTable("_idle_behavior_absent", DEVICE, "idle", _proxy("_idle_behavior_absent"), lock="_idle_behavior_lock", cached=False),
    # Fetch provenance.
    EntityTable("state.detail_fetched_at.device", DEVICE, "provenance", _fetched_at("device"), cached=False, persisted="detail_fetched_at"),
    EntityTable("state.detail_fetched_at.activity", ACTIVITY, "provenance", _fetched_at("activity"), cached=False, persisted="detail_fetched_at"),
)


def forget_entity(
    proxy: Any,
    ent_id: int,
    *,
    kind: str | None = None,
    groups: Iterable[str] | None = None,
) -> None:
    """Forget one id in every table of ``kind`` (any kind when None),
    limited to ``groups`` when given."""

    ent_lo = int(ent_id) & 0xFF
    wanted = None if groups is None else set(groups)
    for table in ENTITY_TABLES:
        if kind is not None and kind not in table.kinds:
            continue
        if wanted is not None and table.group not in wanted:
            continue
        table.forget(proxy, ent_lo)


def clear_entity_tables(proxy: Any) -> None:
    """Empty every registered table."""

    for table in ENTITY_TABLES:
        table.clear(proxy)


def cached_detail_ids(proxy: Any, kind: str) -> set[int]:
    """Ids that hold cached hub detail of ``kind`` outside the name catalog."""

    ids: set[int] = set()
    for table in ENTITY_TABLES:
        if table.kinds == frozenset({kind}) and table.cached and table.group != "catalog" and table.shape == "keyed":
            ids |= table.ids(proxy)
    return ids


__all__ = [
    "ENTITY_TABLES",
    "WRITE_GROUPS",
    "EntityTable",
    "cached_detail_ids",
    "clear_entity_tables",
    "forget_entity",
]
