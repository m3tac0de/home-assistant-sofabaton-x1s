"""Canonical views of a hub bundle and of the integration's HA stores.

Everything is keyed by id, never by name: a rename then changes one
``name`` field instead of moving a whole subtree, and references
(``"<device>/<command>"``) stay stable when a referenced entity is renamed.
Names are looked up again only when a finding is rendered.

What is left out, and why (``bench_compare.py`` holds the same rules):

- capture metadata (``captured_at``, ``fetched_at``, ``complete``,
  ``payload_profile``, ``schema_version``, ``kind``, ``editable``);
- the per-entity ``sort`` byte: the hub renumbers it on every create and
  delete, so the display order it encodes is compared instead (``order``);
- the header ``power_state``: a runtime flag;
- a macro step's synthetic ``button_code`` (0x4E20 + command id);
- the duration of a power-reference step (198/199): the X1S rewrites it
  from the device configuration;
- the 0xC5 input step's "no input" duration, 0 and 255 being the same;
- no-op binding rows (command 0, no long press): app residue;
- a missing key-sort table (None) vs an empty one (""): same meaning.

For the HA stores, the live progress fields of a Wifi Commands device
(``status``, ``current_step``, ...) and the derived ``activity_labels`` map
are left out.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

SYNTH_FID_BASE = 0x4E20
POWER_ON_KEY = 198
POWER_OFF_KEY = 199
INPUT_KEY = 197

_BLOCK_DROP = {"device_id", "sort", "power_state"}
_ROW_KEEP_OUT = {
    "kind", "schema_version", "captured_at", "complete", "payload_profile",
    "fetched_at", "editable", "device",
}
_WIFI_PROGRESS = {"status", "current_step", "total_steps", "message", "activity_labels"}


def ref(device_id: Any, command_id: Any) -> str | None:
    if device_id in (None, 0) and command_id in (None, 0):
        return None
    return f"{device_id}/{command_id}"


def _key(value: Any) -> str:
    return str(int(value)) if isinstance(value, (int, float)) or str(value).isdigit() else str(value)


def _digest(value: Any) -> str:
    return hashlib.sha1(json.dumps(value, sort_keys=True).encode()).hexdigest()[:12]


def _head(block: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in block.items() if k not in _BLOCK_DROP}


def _commands(rows: list[dict[str, Any]] | None) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for row in rows or []:
        entry: dict[str, Any] = {}
        for k, v in row.items():
            if k == "command_id":
                continue
            if k == "restore_data" and isinstance(v, dict):
                entry["data"] = _digest({kk: vv for kk, vv in v.items() if kk != "decoded"})
            else:
                entry[k] = v
        out[_key(row.get("command_id"))] = entry
    return out


def _bindings(rows: list[dict[str, Any]] | None, own_device: Any = None) -> dict[str, Any]:
    """Binding rows by button id. On a device's own page the bundle leaves
    the device id out (it is the device itself): ``own_device`` fills it in,
    as the persisted cache spells it."""

    out: dict[str, Any] = {}
    for row in rows or []:
        dev = row.get("device_id") if row.get("device_id") is not None else own_device
        long_dev = row.get("long_press_device_id")
        long_dev = long_dev if long_dev is not None else dev
        short = ref(dev, row.get("command_id")) if row.get("command_id") else None
        long = ref(long_dev, row.get("long_press_command_id")) if row.get("long_press_command_id") else None
        if short is None and long is None:
            continue
        out[_key(row.get("button_id"))] = {"button": row.get("button_name"), "short": short, "long": long}
    return out


def _step(step: dict[str, Any]) -> dict[str, Any]:
    command_id = step.get("command_id")
    out: dict[str, Any] = {"ref": ref(step.get("device_id"), command_id)}
    code = step.get("button_code")
    if code not in (None, 0) and code != SYNTH_FID_BASE + int(command_id or 0):
        out["code"] = code
    duration = step.get("duration")
    if command_id in (POWER_ON_KEY, POWER_OFF_KEY):
        duration = None
    elif command_id == INPUT_KEY and duration == 255:
        duration = 0
    if duration is not None:
        out["duration"] = duration
    out["delay"] = step.get("delay")
    return out


def _macros(rows: list[dict[str, Any]] | None) -> dict[str, Any]:
    return {
        _key(row.get("button_id")): {
            "name": row.get("name"),
            "steps": [_step(s) for s in row.get("steps") or []],
        }
        for row in rows or []
    }


def display_order(rows: list[dict[str, Any]] | None) -> list[int]:
    """Ids in display order: the sort byte first, rows without one (0) after
    them by id (``aio._catalog_order_key``, the rule ``bench_compare`` uses)."""

    keyed = []
    for row in rows or []:
        block = row.get("device") or {}
        sort = int(block.get("sort") or 0)
        entity_id = int(block.get("device_id") or 0)
        keyed.append(((0, sort, entity_id) if sort else (1, 0, entity_id), entity_id))
    return [entity_id for _k, entity_id in sorted(keyed)]


def _shortcuts(row: dict[str, Any]) -> list[str]:
    """The activity's quick-access list in order: favorites as
    ``fav:<dev>/<cmd>``, macro shortcuts as ``macro:<key>``. Ids missing from
    the order table come last, marked ``unordered:``."""

    favs = {int(f.get("button_id") or 0): ref(f.get("device_id"), f.get("command_id"))
            for f in row.get("favorite_slots") or []}
    macro_keys = {int(m.get("button_id") or 0) for m in row.get("macros") or []}
    order = [int(i) for i in row.get("favorites_order") or []]
    out = []
    for qid in order:
        if qid in favs and qid in macro_keys:
            # One id space: a favorite and a macro on the same key is the
            # restore bug #7 shape (favorite slots clobbering macro keys).
            out.append(f"collision:{qid}")
        elif qid in favs:
            out.append(f"fav:{favs[qid]}")
        elif qid in macro_keys:
            out.append(f"macro:{qid}")
        else:
            out.append(f"dangling:{qid}")
    for qid in sorted(favs):
        if qid not in order:
            out.append(f"unordered:fav:{favs[qid]}")
    return out


def _extras(row: dict[str, Any], handled: set[str]) -> dict[str, Any]:
    """Row fields this module has no rule for, kept verbatim so a change to
    them still shows up."""

    return {k: v for k, v in row.items() if k not in _ROW_KEEP_OUT and k not in handled}


def normalize_bundle(bundle: dict[str, Any] | None) -> dict[str, Any]:
    """A ``hub_bundle`` (structural cache bundle or a full export) in
    canonical form."""

    if not bundle:
        return {"devices": {}, "activities": {}, "order": {"devices": [], "activities": []}}
    devices: dict[str, Any] = {}
    for row in bundle.get("devices") or []:
        block = row.get("device") or {}
        handled = {"commands", "key_sort", "input_record", "button_bindings", "macros"}
        entry = {
            "head": _head(block),
            "commands": _commands(row.get("commands")),
            # A device without a key-sort table: the persistent cache keeps
            # None, a fresh read gives "" (seen on the X1's Wifi Events
            # device, 2026-10-16). Same meaning.
            "key_sort": (row.get("key_sort") or {}).get("msg_hex") or "",
            "inputs": {k: v for k, v in (row.get("input_record") or {}).items() if k != "device_id"},
            "bindings": _bindings(row.get("button_bindings"), own_device=block.get("device_id")),
            "macros": _macros(row.get("macros")),
        }
        extra = _extras(row, handled)
        if extra:
            entry["extra"] = extra
        devices[_key(block.get("device_id"))] = entry
    activities: dict[str, Any] = {}
    for row in bundle.get("activities") or []:
        block = row.get("device") or {}
        handled = {"button_bindings", "favorite_slots", "macros", "referenced_source_device_ids",
                   "favorites_order"}
        entry = {
            "head": _head(block),
            "members": sorted(int(i) for i in row.get("referenced_source_device_ids") or []),
            "bindings": _bindings(row.get("button_bindings")),
            "favorites": {_key(f.get("button_id")): ref(f.get("device_id"), f.get("command_id"))
                          for f in row.get("favorite_slots") or []},
            "shortcuts": _shortcuts(row),
            "macros": _macros(row.get("macros")),
        }
        extra = _extras(row, handled)
        if extra:
            entry["extra"] = extra
        activities[_key(block.get("device_id"))] = entry
    return {
        "devices": devices,
        "activities": activities,
        "order": {
            "devices": display_order(bundle.get("devices")),
            "activities": display_order(bundle.get("activities")),
        },
    }


def normalize_ha(command_devices: dict[str, Any] | None, wifi_events: dict[str, Any] | None,
                 hub_event_actions: dict[str, Any] | None) -> dict[str, Any]:
    """The integration's own stores for one hub: Wifi Commands devices (with
    their sync state), Wifi Events and hub event actions."""

    wifi: dict[str, Any] = {}
    for row in (command_devices or {}).get("devices") or []:
        entry = {k: v for k, v in row.items()
                 if k not in _WIFI_PROGRESS and k not in ("commands", "device_key")}
        # A slot's activity list is a set: the card keeps it in click order.
        entry["slots"] = {str(i): {**slot, **({"activities": sorted(slot["activities"])}
                                              if isinstance(slot.get("activities"), list) else {})}
                          for i, slot in enumerate(row.get("commands") or [])}
        wifi[str(row.get("device_key"))] = entry
    events_raw = dict(wifi_events or {})
    events = {_key(e.get("slot_index")): {k: v for k, v in e.items() if k != "slot_index"}
              for e in events_raw.pop("events", None) or []}
    events_raw.pop("mqtt_available", None)
    return {
        "wifi": wifi,
        "events": {"record": events_raw, "slots": events},
        "event_actions": hub_event_actions or {},
    }


# -- labels ---------------------------------------------------------------------------------------


def labeler(world: dict[str, Any]) -> dict[str, str]:
    """Id -> name tables from a snapshot, for rendering findings."""

    names: dict[str, str] = {}
    hub = world.get("hub") or world.get("cache") or {}
    for kind in ("devices", "activities"):
        for entity_id, entry in (hub.get(kind) or {}).items():
            names[entity_id] = str((entry.get("head") or {}).get("name"))
            for command_id, command in (entry.get("commands") or {}).items():
                names[f"{entity_id}/{command_id}"] = f"{names[entity_id]}/{command.get('name')}"
    return names


# -- HA entities ----------------------------------------------------------------------------------

#: Entities whose state is a momentary pulse or a log of recent traffic, not
#: configuration: their changes say nothing about a step.
_PULSE_SUFFIXES = ("_wifi_commands",)
_PULSE_ATTRS = {"recent", "timestamp"}


def normalize_entities(states: list[dict[str, Any]], entity_ids: set[str]) -> dict[str, Any]:
    """One hub's entities as ``entity_id -> {state, attrs}``.

    ``cache_generation`` is left out (it is the generation layer of its
    own). A button's state is the time it was last pressed, so only its
    availability is kept.
    """

    out: dict[str, Any] = {}
    for st in states:
        entity_id = st.get("entity_id")
        if entity_id not in entity_ids or entity_id.endswith(_PULSE_SUFFIXES):
            continue
        state = st.get("state")
        if entity_id.startswith("button."):
            state = "unavailable" if state == "unavailable" else "available"
        attrs = {k: v for k, v in (st.get("attributes") or {}).items()
                 if k != "cache_generation" and k not in _PULSE_ATTRS}
        out[entity_id] = {"state": state, "attrs": attrs}
    return out


def generation_of(states: list[dict[str, Any]], remote_entity: str) -> int | None:
    for st in states:
        if st.get("entity_id") == remote_entity:
            value = (st.get("attributes") or {}).get("cache_generation")
            return int(value) if value is not None else None
    return None


# -- the persisted cache --------------------------------------------------------------------------


def _detail_bindings(details: dict[str, Any] | None, own_device: Any = None) -> dict[str, Any]:
    rows = [{"button_id": int(button), **(row or {})} for button, row in (details or {}).items()]
    return {k: {"short": v["short"], "long": v["long"]} for k, v in _bindings(rows, own_device).items()}


def normalize_persisted(entry: dict[str, Any] | None) -> dict[str, Any]:
    """One hub's entry of the persistent cache store (what HA loads after a
    restart), in the cache layer's paths, for the fields both carry: names,
    command names, bindings (short/long), favorites, key-sort tables and
    the display order."""

    entry = entry or {}
    details = entry.get("button_details") or {}
    commands = entry.get("commands") or {}
    key_sorts = entry.get("device_key_sorts") or {}
    favorites = entry.get("activity_favorite_slots") or {}
    devices = {}
    for dev_id, dev in (entry.get("devices") or {}).items():
        devices[_key(dev_id)] = {
            "head": {"name": dev.get("name")},
            "commands": {_key(cid): {"name": name} for cid, name in (commands.get(dev_id) or {}).items()},
            "bindings": _detail_bindings(details.get(dev_id), int(dev_id)),
            "key_sort": (key_sorts.get(dev_id) or {}).get("msg_hex") or "",
        }
    activities = {}
    for act_id, act in (entry.get("activities") or {}).items():
        activities[_key(act_id)] = {
            "head": {"name": act.get("name")},
            "bindings": _detail_bindings(details.get(act_id)),
            "favorites": {_key(f.get("button_id")): ref(f.get("device_id"), f.get("command_id"))
                          for f in favorites.get(act_id) or []},
        }
    return {"devices": devices, "activities": activities, "order": {
        "devices": _persisted_order(entry.get("devices")),
        "activities": _persisted_order(entry.get("activities")),
    }}


def _persisted_order(records: dict[str, Any] | None) -> list[int]:
    """Display order from the stored records: the sort byte is byte 6 of
    the record body (``devices.build_device_create_payload``)."""

    rows = []
    for entity_id, rec in (records or {}).items():
        try:
            sort = bytes.fromhex(str((rec or {}).get("raw_body_hex") or ""))[6]
        except (ValueError, IndexError):
            sort = 0
        rows.append({"device": {"device_id": int(entity_id), "sort": sort}})
    return display_order(rows)


def project_like_persisted(world: dict[str, Any]) -> dict[str, Any]:
    """The cache (or hub) layer cut down to what :func:`normalize_persisted`
    carries, so the two compare path for path."""

    devices = {}
    for dev_id, dev in (world.get("devices") or {}).items():
        devices[dev_id] = {
            "head": {"name": (dev.get("head") or {}).get("name")},
            "commands": {cid: {"name": c.get("name")} for cid, c in (dev.get("commands") or {}).items()},
            "bindings": {b: {"short": v["short"], "long": v["long"]} for b, v in (dev.get("bindings") or {}).items()},
            "key_sort": dev.get("key_sort") or "",
        }
    activities = {}
    for act_id, act in (world.get("activities") or {}).items():
        activities[act_id] = {
            "head": {"name": (act.get("head") or {}).get("name")},
            "bindings": {b: {"short": v["short"], "long": v["long"]} for b, v in (act.get("bindings") or {}).items()},
            "favorites": dict(act.get("favorites") or {}),
        }
    return {"devices": devices, "activities": activities, "order": dict(world.get("order") or {})}
