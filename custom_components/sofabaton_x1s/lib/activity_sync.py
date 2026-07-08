"""Pure diff → write-plan builder for the live Activities editor (Phase L4).

Turns a ``{baseline, edited}`` ``hub_bundle`` pair into an ordered list of
:class:`SyncStep` records describing the **targeted in-place writes** needed
to make the hub match ``edited`` for one activity. It is the authoritative
plan (the frontend's ``activity-diff.ts`` is display-only); the executor in
``proxy_activity_sync.py`` walks these steps and dispatches each to an
existing driver.

Design invariants (docs/internal/live-activity-editor-plan.md §6.2):

* **Pure / executor-free** — no I/O, fully unit-testable against fixture
  bundle pairs with golden plan outputs.
* **Scope guard** — every difference between the two bundles must be
  attributable to the edited activity or a known device-side effect
  (idle behaviour, input records, command renames, HA-action hosts). Any
  other device/activity change raises ``ValueError`` — the defence against
  an editor bug silently rewriting unrelated config.
* **Record-level granularity** — a macro / binding / favorite that is
  identical between baseline and edited produces no step.
* **Write ordering** mirrors the vendor traces / restore ordering.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Mapping

# ── Wire constants (kept local so this module stays import-light/pure) ──
POWER_ON_MACRO_BUTTON_ID = 198
POWER_OFF_MACRO_BUTTON_ID = 199
_POWER_MACRO_BUTTON_IDS = frozenset({POWER_ON_MACRO_BUTTON_ID, POWER_OFF_MACRO_BUTTON_ID})
# Power/input reference command ids used inside the flat power macros.
DEVICE_POWER_ON_REF_COMMAND = 0xC6
DEVICE_POWER_OFF_REF_COMMAND = 0xC7
DEVICE_INPUT_REF_COMMAND = 0xC5
# Shared entity-id space: activity ids live at >= 0x65 (cross-activity chain
# steps reference them by a device byte in that range).
ACTIVITY_ID_BASE = 0x65


@dataclass(frozen=True)
class SyncStep:
    """One in-place write against the hub, resolved from the bundle diff."""

    kind: str
    label: str
    target_device_id: int | None = None
    payload: Mapping[str, Any] = field(default_factory=dict)


# ── Bundle accessors (operate on raw hub_bundle dicts) ─────────────────


def _int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _activity_id_of(activity: Mapping[str, Any]) -> int:
    return _int((activity.get("device") or {}).get("device_id"))


def _device_id_of(device: Mapping[str, Any]) -> int:
    return _int((device.get("device") or {}).get("device_id"))


def _find_activity(bundle: Mapping[str, Any], activity_id: int) -> dict[str, Any] | None:
    for activity in bundle.get("activities") or []:
        if _activity_id_of(activity) == activity_id:
            return dict(activity)
    return None


def _devices_by_id(bundle: Mapping[str, Any]) -> dict[int, dict[str, Any]]:
    result: dict[int, dict[str, Any]] = {}
    for device in bundle.get("devices") or []:
        result[_device_id_of(device)] = dict(device)
    return result


def _activities_by_id(bundle: Mapping[str, Any]) -> dict[int, dict[str, Any]]:
    return {_activity_id_of(a): dict(a) for a in bundle.get("activities") or []}


def _rows_by_button(rows: Any) -> dict[int, dict[str, Any]]:
    result: dict[int, dict[str, Any]] = {}
    for row in rows or []:
        result[_int(row.get("button_id"))] = dict(row)
    return result


def _canonical(value: Any) -> str:
    return json.dumps(value, sort_keys=True, default=str)


def _macro_steps_signature(macro: Mapping[str, Any]) -> str:
    """Order-sensitive, name-independent signature of a macro's steps."""
    steps = []
    for step in macro.get("steps") or []:
        steps.append(
            [
                _int(step.get("device_id")),
                _int(step.get("command_id")),
                _int(step.get("button_code")),
                _int(step.get("duration")),
                _int(step.get("delay")),
            ]
        )
    return _canonical(steps)


def _member_device_ids(activity: Mapping[str, Any]) -> set[int]:
    """Devices this activity references (power refs, favorites, bindings,
    real macro command steps) — excluding the activity's own id."""
    self_id = _activity_id_of(activity)
    ids: set[int] = set()

    def _add(value: Any) -> None:
        did = _int(value)
        # Ids >= ACTIVITY_ID_BASE are cross-activity chain references (an
        # activity byte), not source devices, and must not be treated as
        # activity members.
        if 0 < did < ACTIVITY_ID_BASE and did != self_id:
            ids.add(did)

    for macro in activity.get("macros") or []:
        for step in macro.get("steps") or []:
            _add(step.get("device_id"))
    for fav in activity.get("favorite_slots") or []:
        _add(fav.get("device_id"))
    for binding in activity.get("button_bindings") or []:
        _add(binding.get("device_id"))
        _add(binding.get("long_press_device_id"))
    return ids


# ── Device-side scope helpers ──────────────────────────────────────────

# Fields on a device that the activity editor is *allowed* to change as a
# side effect (idle behaviour, input records, command renames). Everything
# else on a device must be byte-identical between baseline and edited.


def _device_core_signature(device: Mapping[str, Any]) -> str:
    """Signature of a device excluding the editor's allowed side-effects
    (idle behaviour, input records, command *names*)."""
    block = dict(device.get("device") or {})
    block.pop("idle_behavior", None)
    block.pop("power_mode", None)
    commands = [
        [_int(cmd.get("command_id")), _canonical(cmd.get("restore_data"))]
        for cmd in device.get("commands") or []
    ]
    core = {
        "device": _canonical(block),
        "commands": commands,
        "button_bindings": _canonical(device.get("button_bindings")),
        "macros": _canonical(device.get("macros")),
    }
    return _canonical(core)


def _command_names(device: Mapping[str, Any]) -> dict[int, str]:
    return {
        _int(cmd.get("command_id")): str(cmd.get("name") or "")
        for cmd in device.get("commands") or []
    }


def _idle_mode(device: Mapping[str, Any]) -> int | None:
    block = device.get("device") or {}
    raw = block.get("idle_behavior")
    if raw is None:
        raw = block.get("power_mode")
    return None if raw is None else _int(raw) & 0xFF


def _is_ha_action_host(device: Mapping[str, Any]) -> bool:
    return bool(device.get("ha_action_host"))


def _input_entries(device: Mapping[str, Any]) -> Any:
    record = device.get("input_record")
    if not isinstance(record, Mapping):
        return None
    return record.get("entries")


# ── Plan builder ───────────────────────────────────────────────────────


def build_activity_sync_plan(
    baseline: Mapping[str, Any],
    edited: Mapping[str, Any],
    activity_id: int,
) -> list[SyncStep]:
    """Compute the minimal ordered write plan. Raises ``ValueError`` with a
    user-readable reason on an out-of-scope diff or a missing activity."""

    activity_id = _int(activity_id)
    base_activity = _find_activity(baseline, activity_id)
    edit_activity = _find_activity(edited, activity_id)
    if base_activity is None or edit_activity is None:
        raise ValueError("the edited activity is missing from one of the bundles")

    _assert_in_scope(baseline, edited, activity_id)

    prereq: list[SyncStep] = []
    members: list[SyncStep] = []
    macros: list[SyncStep] = []
    bindings: list[SyncStep] = []
    favorites: list[SyncStep] = []
    idle: list[SyncStep] = []
    rename: list[SyncStep] = []

    _plan_device_side(baseline, edited, activity_id, prereq, idle)
    _plan_membership(base_activity, edit_activity, members)
    _plan_macros(base_activity, edit_activity, activity_id, macros)
    _plan_bindings(base_activity, edit_activity, activity_id, bindings)
    _plan_favorites(base_activity, edit_activity, activity_id, favorites)
    _plan_rename(base_activity, edit_activity, activity_id, rename)

    plan = [*prereq, *members, *macros, *bindings, *favorites, *idle, *rename]
    if plan:
        plan.append(SyncStep(kind="remote_sync", label="Refreshing the remote…", payload={"activity_id": activity_id}))
    return plan


# ── Scope guard ────────────────────────────────────────────────────────


def _assert_in_scope(baseline: Mapping[str, Any], edited: Mapping[str, Any], activity_id: int) -> None:
    base_acts = _activities_by_id(baseline)
    edit_acts = _activities_by_id(edited)
    if set(base_acts) != set(edit_acts):
        raise ValueError("edited bundle adds or removes an activity (out-of-scope changes)")
    for act_id, edited_act in edit_acts.items():
        if act_id == activity_id:
            continue
        if _canonical(edited_act) != _canonical(base_acts.get(act_id)):
            raise ValueError(f"edited bundle changed a different activity 0x{act_id:02X} (out-of-scope changes)")

    base_devs = _devices_by_id(baseline)
    edit_devs = _devices_by_id(edited)
    added = set(edit_devs) - set(base_devs)
    removed = set(base_devs) - set(edit_devs)
    for dev_id in removed:
        raise ValueError(f"edited bundle removed device 0x{dev_id:02X} (out-of-scope changes)")
    for dev_id in added:
        if not _is_ha_action_host(edit_devs[dev_id]):
            raise ValueError(f"edited bundle added non-HA device 0x{dev_id:02X} (out-of-scope changes)")
    for dev_id in set(base_devs) & set(edit_devs):
        if _device_core_signature(base_devs[dev_id]) != _device_core_signature(edit_devs[dev_id]):
            raise ValueError(f"edited bundle changed device 0x{dev_id:02X} outside allowed fields (out-of-scope changes)")


# ── Category planners ──────────────────────────────────────────────────


def _plan_device_side(
    baseline: Mapping[str, Any],
    edited: Mapping[str, Any],
    activity_id: int,
    prereq: list[SyncStep],
    idle: list[SyncStep],
) -> None:
    base_devs = _devices_by_id(baseline)
    edit_devs = _devices_by_id(edited)
    for dev_id in sorted(edit_devs):
        edited_dev = edit_devs[dev_id]
        base_dev = base_devs.get(dev_id)
        # Command renames (device-global; a favorite "rename" rewrites the
        # device command). Prereq — command records first.
        base_names = _command_names(base_dev) if base_dev else {}
        for cmd_id, name in _command_names(edited_dev).items():
            if base_dev is not None and base_names.get(cmd_id, name) != name:
                prereq.append(
                    SyncStep(
                        kind="command_rename",
                        label=f"Renaming command on device {dev_id}…",
                        target_device_id=dev_id,
                        payload={"device_id": dev_id, "command_id": cmd_id, "name": name},
                    )
                )
        # Input record additions (side effect of the input picker).
        base_inputs = _input_entries(base_dev) if base_dev else None
        edit_inputs = _input_entries(edited_dev)
        if edit_inputs is not None and _canonical(edit_inputs) != _canonical(base_inputs):
            prereq.append(
                SyncStep(
                    kind="inputs_write",
                    label=f"Updating inputs on device {dev_id}…",
                    target_device_id=dev_id,
                    payload={"device_id": dev_id, "entries": list(edit_inputs)},
                )
            )
        # Idle behaviour (device-global). Ordered late (after favorites).
        base_idle = _idle_mode(base_dev) if base_dev else None
        edit_idle = _idle_mode(edited_dev)
        if edit_idle is not None and edit_idle != base_idle:
            idle.append(
                SyncStep(
                    kind="idle_behavior",
                    label=f"Updating idle behaviour on device {dev_id}…",
                    target_device_id=dev_id,
                    payload={"device_id": dev_id, "mode": edit_idle},
                )
            )


def _plan_membership(
    base_activity: Mapping[str, Any],
    edit_activity: Mapping[str, Any],
    out: list[SyncStep],
) -> None:
    activity_id = _activity_id_of(edit_activity)
    added = _member_device_ids(edit_activity) - _member_device_ids(base_activity)
    for dev_id in sorted(added):
        out.append(
            SyncStep(
                kind="member_replay",
                label="Adding a device to the activity…",
                target_device_id=dev_id,
                payload={"activity_id": activity_id, "device_id": dev_id},
            )
        )


def _plan_macros(
    base_activity: Mapping[str, Any],
    edit_activity: Mapping[str, Any],
    activity_id: int,
    out: list[SyncStep],
) -> None:
    base_macros = _rows_by_button(base_activity.get("macros"))
    edit_macros = _rows_by_button(edit_activity.get("macros"))
    for button_id in sorted(edit_macros):
        macro = edit_macros[button_id]
        base_macro = base_macros.get(button_id)
        if base_macro is not None:
            steps_changed = _macro_steps_signature(base_macro) != _macro_steps_signature(macro)
            # A rename changes only the macro's label (steps untouched), so the
            # name must be compared too — a name-only edit still needs a write.
            name_changed = str(base_macro.get("name") or "") != str(macro.get("name") or "")
            if not steps_changed and not name_changed:
                continue
        label = _macro_label(button_id)
        out.append(
            SyncStep(
                kind="macro_write",
                label=label,
                payload={
                    "activity_id": activity_id,
                    "button_id": button_id,
                    "name": str(macro.get("name") or ""),
                    "steps": list(macro.get("steps") or []),
                },
            )
        )
    for button_id in sorted(set(base_macros) - set(edit_macros)):
        # Power macros are mandatory and never removed; a removed user macro
        # is a key-row delete (0x0210), same primitive as favorite delete.
        if button_id in _POWER_MACRO_BUTTON_IDS:
            continue
        out.append(
            SyncStep(
                kind="macro_delete",
                label="Removing a custom action…",
                payload={"activity_id": activity_id, "button_id": button_id},
            )
        )


def _macro_label(button_id: int) -> str:
    if button_id == POWER_ON_MACRO_BUTTON_ID:
        return "Updating start sequence…"
    if button_id == POWER_OFF_MACRO_BUTTON_ID:
        return "Updating end sequence…"
    return "Updating a custom action…"


def _plan_bindings(
    base_activity: Mapping[str, Any],
    edit_activity: Mapping[str, Any],
    activity_id: int,
    out: list[SyncStep],
) -> None:
    base_bindings = _rows_by_button(base_activity.get("button_bindings"))
    edit_bindings = _rows_by_button(edit_activity.get("button_bindings"))
    for button_id in sorted(edit_bindings):
        binding = edit_bindings[button_id]
        base_binding = base_bindings.get(button_id)
        if base_binding is not None and _canonical(base_binding) == _canonical(binding):
            continue
        out.append(
            SyncStep(
                kind="binding_write",
                label="Writing button assignments…",
                target_device_id=_int(binding.get("device_id")) or None,
                payload={
                    "activity_id": activity_id,
                    "button_id": button_id,
                    "device_id": _int(binding.get("device_id")),
                    "command_id": _int(binding.get("command_id")),
                    "long_press_device_id": _int(binding.get("long_press_device_id")),
                    "long_press_command_id": _int(binding.get("long_press_command_id")),
                },
            )
        )
    for button_id in sorted(set(base_bindings) - set(edit_bindings)):
        out.append(
            SyncStep(
                kind="binding_delete",
                label="Clearing a button assignment…",
                payload={"activity_id": activity_id, "button_id": button_id},
            )
        )


def _favorite_entries(
    activity: Mapping[str, Any],
) -> list[tuple[int, tuple[int, int], Mapping[str, Any]]]:
    """Favorites in display order (button_id ascending) as
    ``(button_id, (device_id, command_id), row)``.

    On the hub a favorite's stable identity is its ``fav_id``, captured into
    ``button_id``. But the editor reassigns ``button_id`` positionally on every
    edit, so in an *edited* bundle ``button_id`` is only a display position —
    the durable identity is the favorite's content ``(device_id, command_id)``.
    """
    entries: list[tuple[int, tuple[int, int], Mapping[str, Any]]] = []
    for row in activity.get("favorite_slots") or []:
        if not isinstance(row, Mapping):
            continue
        entries.append(
            (_int(row.get("button_id")), (_int(row.get("device_id")), _int(row.get("command_id"))), row)
        )
    entries.sort(key=lambda item: item[0])
    return entries


def _plan_favorites(
    base_activity: Mapping[str, Any],
    edit_activity: Mapping[str, Any],
    activity_id: int,
    out: list[SyncStep],
) -> None:
    # Favorites are matched by content, then mapped back to the hub fav_id via
    # the baseline (whose button_id == the hub fav_id at capture). The editor's
    # positional button_ids in the edited bundle are ignored.
    base = _favorite_entries(base_activity)
    edit = _favorite_entries(edit_activity)
    base_fav_id_by_content: dict[tuple[int, int], int] = {}
    for fav_id, content, _row in base:
        base_fav_id_by_content.setdefault(content, fav_id)
    edit_contents = [content for _bid, content, _row in edit]
    edit_content_set = set(edit_contents)

    # Deletes first (frees the ordering): baseline content no longer present.
    for fav_id, content, _row in base:
        if content not in edit_content_set:
            out.append(
                SyncStep(
                    kind="favorite_delete",
                    label="Removing a shortcut…",
                    payload={"activity_id": activity_id, "button_id": fav_id},
                )
            )
    # Adds: edited content with no baseline counterpart (the hub assigns the
    # new fav_id, so no button_id is sent).
    for _bid, content, row in edit:
        if content not in base_fav_id_by_content:
            device_id, command_id = content
            out.append(
                SyncStep(
                    kind="favorite_add",
                    label="Adding a shortcut…",
                    target_device_id=device_id or None,
                    payload={
                        "activity_id": activity_id,
                        "device_id": device_id,
                        "command_id": command_id,
                        "name": str(row.get("name") or ""),
                    },
                )
            )
    # Reorder: the hub assigns fav_ids to added favorites, so the desired final
    # order is expressed as *content* and resolved to live fav_ids by the
    # executor after the adds land (re-read). Emit it only when the edited order
    # differs from what add/delete alone would produce — survivors kept in their
    # baseline order with adds appended — i.e. a genuine reorder or a
    # non-tail insertion.
    added_contents = [content for _bid, content, _row in edit if content not in base_fav_id_by_content]
    natural_order = [content for _bid, content, _row in base if content in edit_content_set] + added_contents
    desired_order = edit_contents
    if len(desired_order) > 1 and desired_order != natural_order:
        out.append(
            SyncStep(
                kind="favorite_order",
                label="Reordering shortcuts…",
                payload={
                    "activity_id": activity_id,
                    "order_content": [[dev, cmd] for dev, cmd in desired_order],
                },
            )
        )


def _plan_rename(
    base_activity: Mapping[str, Any],
    edit_activity: Mapping[str, Any],
    activity_id: int,
    out: list[SyncStep],
) -> None:
    base_name = str((base_activity.get("device") or {}).get("name") or "")
    edit_name = str((edit_activity.get("device") or {}).get("name") or "")
    if base_name != edit_name:
        out.append(
            SyncStep(
                kind="activity_rename",
                label="Renaming the activity…",
                payload={"activity_id": activity_id, "name": edit_name},
            )
        )
