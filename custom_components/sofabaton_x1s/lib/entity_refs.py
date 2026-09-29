"""The one walk over the entity references inside a ``hub_bundle`` document.

The document planner (``hub_sync``), the entity planner (``activity_sync``)
and restore all need "which entities does this row point at". They read it
here, so a new reference site is added once and the planners cannot
disagree about what counts (CR-L5-9).
"""

from __future__ import annotations

from typing import Any, Collection, Iterator, Mapping, Optional

__all__ = ["MACRO_DELAY_SENTINEL", "iter_entity_references", "is_entity_ref"]

# A macro step whose device byte is 0xFF is a delay row, not a reference.
MACRO_DELAY_SENTINEL = 0xFF


def is_entity_ref(value: Any) -> bool:
    """True for a real entity id (an int that is not 0 and not a bool)."""

    return isinstance(value, int) and not isinstance(value, bool) and value != 0


def _entity_id(row: Mapping[str, Any]) -> Optional[int]:
    block = row.get("device")
    if not isinstance(block, Mapping) or "device_id" not in block:
        return None
    raw = block.get("device_id")
    if isinstance(raw, bool) or not isinstance(raw, int):
        return None
    return raw


def iter_entity_references(
    document: Mapping[str, Any],
    *,
    exclude_sites: Collection[str] = (),
) -> Iterator[tuple[tuple[str, int], str, int]]:
    """Yield ``(referrer, site, target_id)`` for every entity reference
    inside the entities of ``document``.

    Sites: ``favorite`` (``favorite_slots[].device_id``), ``binding``
    (``button_bindings[].device_id``), ``binding_long_press``
    (``long_press_device_id``), ``macro_step`` (``macros[].steps[].device_id``,
    a device or a cross-activity reference; delay steps skipped),
    ``referenced_source`` (the derived ``referenced_source_device_ids``
    list). ``exclude_sites`` leaves sites out: membership is the direct
    references, without the derived ``referenced_source`` mirror. A row's
    own id is not a reference. Device rows are walked too (device-level
    bindings and macros exist on the hub)."""

    skip = set(exclude_sites)
    for kind, key in (("device", "devices"), ("activity", "activities")):
        rows = document.get(key)
        for row in rows if isinstance(rows, list) else ():
            if not isinstance(row, Mapping):
                continue
            self_id = _entity_id(row)
            if self_id is None:
                continue
            referrer = (kind, self_id)
            if "favorite" not in skip:
                for fav in row.get("favorite_slots") or []:
                    if isinstance(fav, Mapping) and is_entity_ref(fav.get("device_id")):
                        yield referrer, "favorite", int(fav["device_id"])
            for binding in row.get("button_bindings") or []:
                if not isinstance(binding, Mapping):
                    continue
                if "binding" not in skip and is_entity_ref(binding.get("device_id")):
                    yield referrer, "binding", int(binding["device_id"])
                if "binding_long_press" not in skip and is_entity_ref(binding.get("long_press_device_id")):
                    yield referrer, "binding_long_press", int(binding["long_press_device_id"])
            if "macro_step" not in skip:
                for macro in row.get("macros") or []:
                    if not isinstance(macro, Mapping):
                        continue
                    for step in macro.get("steps") or []:
                        if not isinstance(step, Mapping):
                            continue
                        target = step.get("device_id")
                        if is_entity_ref(target) and int(target) != MACRO_DELAY_SENTINEL:
                            yield referrer, "macro_step", int(target)
            if "referenced_source" not in skip:
                for target in row.get("referenced_source_device_ids") or []:
                    if is_entity_ref(target):
                        yield referrer, "referenced_source", int(target)
