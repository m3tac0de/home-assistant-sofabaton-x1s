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


def _valid_ipv4(value: str) -> bool:
    parts = value.split(".")
    if len(parts) != 4:
        return False
    try:
        return all(0 <= int(part) <= 255 for part in parts)
    except ValueError:
        return False


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


def _editable_macro_rows(activity: Mapping[str, Any]) -> list[dict[str, Any]]:
    """Non-power macro rows in display order (button_id ascending)."""
    rows = [
        dict(row)
        for row in activity.get("macros") or []
        if isinstance(row, Mapping) and _int(row.get("button_id")) not in _POWER_MACRO_BUTTON_IDS
    ]
    rows.sort(key=lambda row: _int(row.get("button_id")))
    return rows


def _quick_access_rank(activity: Mapping[str, Any]) -> dict[int, int]:
    """Map ``button_id`` → display rank from the activity's ``favorites_order``
    (hub ids in family-0x61 slot order).

    Favorites and macro shortcuts share one fav-id namespace and are displayed
    in slot order, which a reorder rewrites WITHOUT renumbering the button_ids.
    ``favorites_order`` is that slot order; an entry whose button_id is absent
    from it ranks after every listed one (see :func:`_quick_access_sort_key`).
    Absent/empty (older baselines, the device path) → an empty map, i.e. pure
    button_id ordering, matching the pre-order-aware behaviour.
    """
    order = activity.get("favorites_order") or []
    return {_int(fav_id) & 0xFF: index for index, fav_id in enumerate(order)}


def _quick_access_sort_key(button_id: int, rank: Mapping[int, int]) -> tuple[int, int]:
    """Sort key ordering quick-access entries by their ``favorites_order`` rank,
    then by button_id. Unranked entries (not in ``favorites_order``) sort after
    every ranked one, so freshly-added shortcuts append at the tail."""
    bid = _int(button_id) & 0xFF
    return (rank.get(bid, len(rank) + bid), bid)


class MacroPairing:
    """Baseline↔edit identity mapping for an activity's editable macros.

    On the hub a macro shortcut's stable identity is its key id (captured
    into ``button_id``), but the editor renumbers quick-access button_ids
    positionally on every reorder — the same reality favorites deal with.
    Favorites recover identity through their content ``(device_id,
    command_id)``; macros have no single command, so identity is recovered
    by matching content in passes: exact (name + steps) first, then
    steps-only (a rename), then name-only (a steps edit). Whatever remains
    unmatched is genuinely new (edit side) or deleted (baseline side).
    """

    def __init__(self, base_activity: Mapping[str, Any], edit_activity: Mapping[str, Any]) -> None:
        base_rows = _editable_macro_rows(base_activity)
        edit_rows = _editable_macro_rows(edit_activity)
        unmatched_base = list(base_rows)
        remaining_edit = list(edit_rows)
        pairs: list[tuple[dict[str, Any], dict[str, Any]]] = []

        def _take(key_fn: Any, key: Any) -> dict[str, Any] | None:
            for index, candidate in enumerate(unmatched_base):
                if key_fn(candidate) == key:
                    return unmatched_base.pop(index)
            return None

        key_fns = (
            lambda row: (str(row.get("name") or ""), _macro_steps_signature(row)),
            _macro_steps_signature,
            lambda row: str(row.get("name") or "") or None,
        )
        for key_fn in key_fns:
            still: list[dict[str, Any]] = []
            for edit_row in remaining_edit:
                key = key_fn(edit_row)
                match = None if key is None else _take(key_fn, key)
                if match is None:
                    still.append(edit_row)
                else:
                    pairs.append((match, edit_row))
            remaining_edit = still

        pairs.sort(key=lambda pair: _int(pair[0].get("button_id")))
        self.pairs = pairs
        self.new_rows = remaining_edit
        self.deleted_rows = unmatched_base
        # Edit-side positional id → baseline hub id, for matched macros.
        # Macro-target binding rows and the quick-access order resolve
        # through this so positional renumbering never leaks to the wire.
        self.edit_to_base_id = {
            _int(edit_row.get("button_id")): _int(base_row.get("button_id"))
            for base_row, edit_row in pairs
        }
        self.new_edit_ids = {_int(row.get("button_id")) for row in remaining_edit}


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


def _command_payload_edited(command: Mapping[str, Any]) -> bool:
    """True when the user hand-edited this command's payload in the live
    editor. The signal is an explicit marker, not a baseline-vs-edited byte
    diff: the live bundle is blob-free, so a fetched-but-unedited payload
    must not look like a change. A structured edit sets
    ``restore_data.decoded.edited`` (the existing restore convention, which
    the executor re-encodes); a raw-hex edit sets ``restore_data.edited``."""
    restore_data = command.get("restore_data")
    if not isinstance(restore_data, Mapping):
        return False
    if bool(restore_data.get("edited")):
        return True
    decoded = restore_data.get("decoded")
    return isinstance(decoded, Mapping) and bool(decoded.get("edited"))


def _command_is_new(command: Mapping[str, Any]) -> bool:
    """True when this command row is a live-editor *addition*: a row the
    add-command dialog appended with an explicit ``restore_data.new``
    marker. Captured bundles never carry the marker, so the device-sync
    scope guard can ignore flagged rows (the ``command_add`` planner owns
    them) while still rejecting unflagged id-set changes."""
    restore_data = command.get("restore_data")
    return isinstance(restore_data, Mapping) and bool(restore_data.get("new"))


def _idle_mode(device: Mapping[str, Any]) -> int | None:
    block = device.get("device") or {}
    raw = block.get("idle_behavior")
    if raw is None:
        raw = block.get("power_mode")
    return None if raw is None else _int(raw) & 0xFF


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

    # Macro identity is positional in the edited bundle (the editor renumbers
    # quick-access button_ids on every reorder); recover it once by content
    # and share the pairing with every planner that references macro ids.
    pairing = MacroPairing(base_activity, edit_activity)

    _plan_device_side(baseline, edited, activity_id, prereq, idle)
    _plan_membership(base_activity, edit_activity, _devices_by_id(edited), members)
    _plan_macros(base_activity, edit_activity, activity_id, macros, macro_pairing=pairing)
    _plan_bindings(base_activity, edit_activity, activity_id, bindings, macro_pairing=pairing)
    _plan_favorites(base_activity, edit_activity, activity_id, favorites, macro_pairing=pairing)
    _plan_rename(base_activity, edit_activity, activity_id, rename)

    plan = [*prereq, *members, *macros, *bindings, *favorites, *idle, *rename]
    if plan:
        plan.append(SyncStep(kind="remote_sync", label="Refreshing the remote…", payload={"activity_id": activity_id}))
    return plan


def build_device_sync_plan(
    baseline: Mapping[str, Any],
    edited: Mapping[str, Any],
    device_id: int,
    *,
    allow_command_removal: bool = False,
) -> list[SyncStep]:
    """Device-scoped counterpart of :func:`build_activity_sync_plan`.

    The live *device* editor may change a device's key rows (macros —
    including the power-on/off sequences — and button bindings), its
    idle/power byte, its input records, its command records (payload
    overwrites, renames, and additions flagged ``restore_data.new``),
    its name and brand, and its head ``ip_address``. Everything else (other head
    config, other devices, every activity) must be byte-identical
    between the two bundles.

    ``allow_command_removal`` (W7, Wifi Events device only — the HA layer
    gates it by brand) additionally accepts command rows PRESENT in the
    baseline but absent from the edited bundle, planning a
    ``command_delete`` per removed id (ordered last; the hub cascades
    referencing favorites/bindings and removes macro steps in place).
    Regular devices keep rejecting any id-set change.

    Key-row steps reuse the activity planners verbatim: the ``activity_id``
    payload field is the *keymap entity id* the 0x3E / 0x0210 / macro-save
    primitives address, which on this path is the device id (the hub's key
    tables split device vs activity purely by the id range).
    """

    device_id = _int(device_id)
    base_dev = _devices_by_id(baseline).get(device_id)
    edit_dev = _devices_by_id(edited).get(device_id)
    if base_dev is None or edit_dev is None:
        raise ValueError("the edited device is missing from one of the bundles")

    _assert_device_sync_in_scope(
        baseline, edited, device_id, allow_command_removal=allow_command_removal
    )

    prereq: list[SyncStep] = []
    macros: list[SyncStep] = []
    bindings: list[SyncStep] = []
    idle: list[SyncStep] = []
    rename: list[SyncStep] = []
    deletes: list[SyncStep] = []

    # Command-record writes first — adds, payloads, and renames precede the
    # key rows (bindings / macros) that reference them.
    _plan_device_command_adds(base_dev, edit_dev, device_id, prereq)
    _plan_device_payloads(base_dev, edit_dev, device_id, prereq)
    _plan_device_command_renames(base_dev, edit_dev, device_id, prereq)
    if allow_command_removal:
        _plan_device_command_deletes(base_dev, edit_dev, device_id, deletes)

    base_inputs = _input_entries(base_dev)
    edit_inputs = _input_entries(edit_dev)
    if edit_inputs is not None and _canonical(edit_inputs) != _canonical(base_inputs):
        prereq.append(
            SyncStep(
                kind="inputs_write",
                label=f"Updating inputs on device {device_id}…",
                target_device_id=device_id,
                payload={"device_id": device_id, "entries": list(edit_inputs)},
            )
        )

    _plan_macros(base_dev, edit_dev, device_id, macros)
    _plan_bindings(base_dev, edit_dev, device_id, bindings, default_device_id=device_id)

    base_idle = _idle_mode(base_dev)
    edit_idle = _idle_mode(edit_dev)
    if edit_idle is not None and edit_idle != base_idle:
        idle.append(
            SyncStep(
                kind="idle_behavior",
                label="Updating automatic power control…",
                target_device_id=device_id,
                payload={"device_id": device_id, "mode": edit_idle},
            )
        )

    base_name = str((base_dev.get("device") or {}).get("name") or "")
    edit_name = str((edit_dev.get("device") or {}).get("name") or "")
    base_brand = str((base_dev.get("device") or {}).get("brand") or "")
    edit_brand = str((edit_dev.get("device") or {}).get("brand") or "")
    if base_name != edit_name or base_brand != edit_brand:
        # The brand slot rides along in the same record rewrite: for managed
        # Wifi Devices the HA layer stamps a refreshed m3-<key>-<hash> brand
        # into the edited bundle so a rename keeps the hub-side brand hash in
        # step with the command-config store.
        payload: dict[str, Any] = {"device_id": device_id, "name": edit_name}
        if base_brand != edit_brand:
            payload["brand"] = edit_brand
        rename.append(
            SyncStep(
                kind="device_rename",
                label="Renaming the device…",
                target_device_id=device_id,
                payload=payload,
            )
        )

    base_ip = str((base_dev.get("device") or {}).get("ip_address") or "")
    edit_ip = str((edit_dev.get("device") or {}).get("ip_address") or "")
    if base_ip != edit_ip:
        # An empty string clears the IP (the tail marker is emitted zeroed);
        # anything else must be a well-formed dotted-quad so the record
        # builder never silently drops a malformed value on the wire.
        if edit_ip and not _valid_ipv4(edit_ip):
            raise ValueError(f"ip_address {edit_ip!r} is not a dotted-decimal IPv4 address")
        rename.append(
            SyncStep(
                kind="device_ip",
                label="Updating the IP address…",
                target_device_id=device_id,
                payload={"device_id": device_id, "ip_address": edit_ip},
            )
        )

    # Deletes go LAST: every other write lands on records that still exist,
    # and the hub's delete-time cascade sweeps refs after the final state of
    # the surviving rows is already written.
    return [*prereq, *macros, *bindings, *idle, *rename, *deletes]


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
        raise ValueError(f"edited bundle added device 0x{dev_id:02X} (out-of-scope changes)")
    for dev_id in set(base_devs) & set(edit_devs):
        if _device_core_signature(base_devs[dev_id]) != _device_core_signature(edit_devs[dev_id]):
            raise ValueError(f"edited bundle changed device 0x{dev_id:02X} outside allowed fields (out-of-scope changes)")


# Bundle keys on a device the live device editor is allowed to mutate; the
# rest of the device payload must stay byte-identical (plus the idle/power
# byte inside the "device" block, popped below). Capture metadata is not
# config — two captures of the same hub state must produce equal signatures.
_DEVICE_SYNC_MUTABLE_KEYS = frozenset({"macros", "button_bindings", "input_record"})
_DEVICE_SYNC_VOLATILE_KEYS = frozenset({"captured_at", "fetched_at", "complete", "payload_profile", "key_sort"})


def _device_immutable_signature(
    device: Mapping[str, Any],
    *,
    command_id_filter: frozenset[int] | None = None,
) -> str:
    trimmed = {
        key: value
        for key, value in device.items()
        if key not in _DEVICE_SYNC_MUTABLE_KEYS and key not in _DEVICE_SYNC_VOLATILE_KEYS
    }
    block = dict(trimmed.get("device") or {})
    block.pop("idle_behavior", None)
    block.pop("power_mode", None)
    # The name and brand (device_rename step) and head IP (device_ip step)
    # are live-editable fields; exclude them from the signature so an edit
    # to any of them stays in scope.
    block.pop("name", None)
    block.pop("brand", None)
    block.pop("ip_address", None)
    trimmed["device"] = block
    # A command's *payload* (command_payload step) and *name* (command_rename
    # step) are both live-editable, so normalize each command to its id alone
    # — dropping restore_data and name — before signing. A payload overwrite or
    # a rename stays in scope while a command add/delete (id-set change) still
    # trips the guard. The blob-free baseline and the fetched-payload edited
    # bundle both collapse to the same id list here.
    # Rows flagged ``restore_data.new`` are live-editor additions handled by
    # the ``command_add`` planner, so they are excluded here: an add stays in
    # scope while an unflagged id-set change (or any delete) still trips.
    # ``command_id_filter`` (W7 removal mode) narrows both signatures to the
    # edited bundle's id set, making removals invisible to the comparison
    # while an unflagged ADD (edited-only id) still trips.
    commands = trimmed.get("commands")
    if commands is not None:
        ids = [
            _int(cmd.get("command_id")) for cmd in commands if not _command_is_new(cmd)
        ]
        if command_id_filter is not None:
            ids = [cid for cid in ids if cid in command_id_filter]
        trimmed["commands"] = sorted(ids)
    return _canonical(trimmed)


def _plan_device_command_deletes(
    base_dev: Mapping[str, Any],
    edit_dev: Mapping[str, Any],
    device_id: int,
    out: list[SyncStep],
) -> None:
    """Emit a ``command_delete`` for each command the editor removed (W7,
    events device only). The executor's ``_sync_step_command_delete`` is
    the bench-validated FAMILY_FAV_DELETE primitive — the hub cascades
    referencing favorites/bindings and removes macro steps in place (an
    emptied macro is removed)."""

    edit_ids = {_int(cmd.get("command_id")) for cmd in edit_dev.get("commands") or []}
    for command in base_dev.get("commands") or []:
        command_id = _int(command.get("command_id"))
        if command_id in edit_ids:
            continue
        out.append(
            SyncStep(
                kind="command_delete",
                label=f"Removing a command on device {device_id}…",
                target_device_id=device_id,
                payload={"device_id": device_id, "command_id": command_id},
            )
        )


def _assert_device_sync_in_scope(
    baseline: Mapping[str, Any],
    edited: Mapping[str, Any],
    device_id: int,
    *,
    allow_command_removal: bool = False,
) -> None:
    base_acts = _activities_by_id(baseline)
    edit_acts = _activities_by_id(edited)
    if set(base_acts) != set(edit_acts):
        raise ValueError("edited bundle adds or removes an activity (out-of-scope changes)")
    for act_id, edited_act in edit_acts.items():
        if _canonical(edited_act) != _canonical(base_acts.get(act_id)):
            raise ValueError(f"edited bundle changed activity 0x{act_id:02X} (out-of-scope changes)")

    base_devs = _devices_by_id(baseline)
    edit_devs = _devices_by_id(edited)
    if set(base_devs) != set(edit_devs):
        raise ValueError("edited bundle adds or removes a device (out-of-scope changes)")
    for dev_id, edited_dev in edit_devs.items():
        if dev_id == device_id:
            continue
        if _canonical(edited_dev) != _canonical(base_devs.get(dev_id)):
            raise ValueError(f"edited bundle changed a different device 0x{dev_id:02X} (out-of-scope changes)")
    command_id_filter: frozenset[int] | None = None
    if allow_command_removal:
        command_id_filter = frozenset(
            _int(cmd.get("command_id"))
            for cmd in edit_devs[device_id].get("commands") or []
        )
    if _device_immutable_signature(
        base_devs[device_id], command_id_filter=command_id_filter
    ) != _device_immutable_signature(
        edit_devs[device_id], command_id_filter=command_id_filter
    ):
        raise ValueError(
            f"edited bundle changed device 0x{device_id:02X} outside the live-editable fields (out-of-scope changes)"
        )


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


def _plan_device_command_adds(
    base_dev: Mapping[str, Any],
    edit_dev: Mapping[str, Any],
    device_id: int,
    out: list[SyncStep],
) -> None:
    """Emit a ``command_add`` for each command the live editor appended.

    An added row is one whose id is absent from the baseline device and
    whose ``restore_data`` carries the add-command dialog's ``new: true``
    marker (unflagged additions never get here — the scope guard rejects
    them). The full ``restore_data`` rides the step; the executor resolves
    the record bytes (synthesizing a descriptive-IR blob, re-encoding a
    decoded block, or using ``data_hex`` verbatim) and persists a fresh
    family-0x0E record at the row's provisional command id.
    """
    base_ids = {_int(cmd.get("command_id")) for cmd in base_dev.get("commands") or []}
    for command in edit_dev.get("commands") or []:
        command_id = _int(command.get("command_id"))
        if command_id in base_ids:
            continue
        if not _command_is_new(command):
            continue
        out.append(
            SyncStep(
                kind="command_add",
                label=f"Adding a command on device {device_id}…",
                target_device_id=device_id,
                payload={
                    "device_id": device_id,
                    "command_id": command_id,
                    "command_name": str(command.get("name") or ""),
                    "restore_data": dict(command.get("restore_data") or {}),
                },
            )
        )


def _plan_device_payloads(
    base_dev: Mapping[str, Any],
    edit_dev: Mapping[str, Any],
    device_id: int,
    out: list[SyncStep],
) -> None:
    """Emit an in-place ``command_payload`` overwrite for each command whose
    payload the user edited (see :func:`_command_payload_edited`).

    Only commands that already exist on the baseline device are eligible —
    the overwrite lands on an existing slot; adding a command is out of scope
    for the live editor. The full edited ``restore_data`` rides the step; the
    executor resolves the final bytes (re-encoding a structured edit, or using
    ``data_hex`` for a raw edit) and preserves the command's ``button_code`` /
    ``library_type`` / label from cached hub state.
    """
    base_ids = {_int(cmd.get("command_id")) for cmd in base_dev.get("commands") or []}
    for command in edit_dev.get("commands") or []:
        command_id = _int(command.get("command_id"))
        if command_id not in base_ids:
            continue
        if not _command_payload_edited(command):
            continue
        out.append(
            SyncStep(
                kind="command_payload",
                label=f"Updating command payload on device {device_id}…",
                target_device_id=device_id,
                payload={
                    "device_id": device_id,
                    "command_id": command_id,
                    "command_name": str(command.get("name") or ""),
                    "restore_data": dict(command.get("restore_data") or {}),
                },
            )
        )


def _plan_device_command_renames(
    base_dev: Mapping[str, Any],
    edit_dev: Mapping[str, Any],
    device_id: int,
    out: list[SyncStep],
) -> None:
    """Emit a ``command_rename`` for each command whose name changed.

    A rename is the same in-place ``0x0E`` record rewrite as a payload edit,
    with a changed label and the command's *current* payload preserved (the
    executor fetches those bytes). A command that *also* has a payload edit is
    skipped here — its ``command_payload`` step already carries the new label,
    so it is written once, not twice.
    """
    base_names = _command_names(base_dev)
    for command in edit_dev.get("commands") or []:
        command_id = _int(command.get("command_id"))
        if command_id not in base_names:
            continue
        if _command_payload_edited(command):
            continue
        new_name = str(command.get("name") or "")
        if new_name == base_names.get(command_id, new_name):
            continue
        out.append(
            SyncStep(
                kind="command_rename",
                label=f"Renaming a command on device {device_id}…",
                target_device_id=device_id,
                payload={"device_id": device_id, "command_id": command_id, "name": new_name},
            )
        )


def _member_input_cmd_id(
    edit_activity: Mapping[str, Any],
    device: Mapping[str, Any] | None,
) -> int | None:
    """Resolve the input the editor chose for a *new* member (BUG #8).

    The "Set input" dialog stores the choice as the ``duration`` byte of the
    member's ``(device, 0xC5)`` step in the power-on macro — a 1-based ordinal
    into the device's ``input_record``. The ``member_replay`` executor
    (``add_device_to_activity``) rebuilds that 0xC5 row from scratch, so the
    ordinal must ride the step as the input's *command id* (the executor
    re-resolves it against the live hub) or the choice is silently written
    as "no input" (duration 0).
    """
    device_id = _device_id_of(device) if device is not None else 0
    ordinal = 0
    for macro in edit_activity.get("macros") or []:
        if _int(macro.get("button_id")) != POWER_ON_MACRO_BUTTON_ID:
            continue
        for step in macro.get("steps") or []:
            if (
                _int(step.get("device_id")) == device_id
                and _int(step.get("command_id")) == DEVICE_INPUT_REF_COMMAND
            ):
                ordinal = _int(step.get("duration"))
                break
        break
    if ordinal <= 0:
        return None
    for entry in _input_entries(device) or []:
        if isinstance(entry, Mapping) and _int(entry.get("input_index")) == ordinal:
            command_id = _int(entry.get("command_id"))
            return command_id if command_id > 0 else None
    return None


def _plan_membership(
    base_activity: Mapping[str, Any],
    edit_activity: Mapping[str, Any],
    devices_by_id: Mapping[int, Mapping[str, Any]],
    out: list[SyncStep],
) -> None:
    activity_id = _activity_id_of(edit_activity)
    added = _member_device_ids(edit_activity) - _member_device_ids(base_activity)
    for dev_id in sorted(added):
        payload: dict[str, Any] = {"activity_id": activity_id, "device_id": dev_id}
        input_cmd_id = _member_input_cmd_id(edit_activity, devices_by_id.get(dev_id))
        if input_cmd_id is not None:
            payload["input_cmd_id"] = input_cmd_id
        out.append(
            SyncStep(
                kind="member_replay",
                label="Adding a device to the activity…",
                target_device_id=dev_id,
                payload=payload,
            )
        )


def _macro_write_step(
    activity_id: int,
    button_id: int,
    macro: Mapping[str, Any],
    *,
    new: bool = False,
) -> SyncStep:
    payload: dict[str, Any] = {
        "activity_id": activity_id,
        "button_id": button_id,
        "name": str(macro.get("name") or ""),
        "steps": list(macro.get("steps") or []),
    }
    if new:
        payload["new"] = True
    return SyncStep(kind="macro_write", label=_macro_label(button_id), payload=payload)


def _macro_rows_differ(base_macro: Mapping[str, Any], edit_macro: Mapping[str, Any]) -> bool:
    steps_changed = _macro_steps_signature(base_macro) != _macro_steps_signature(edit_macro)
    # A rename changes only the macro's label (steps untouched), so the
    # name must be compared too — a name-only edit still needs a write.
    name_changed = str(base_macro.get("name") or "") != str(edit_macro.get("name") or "")
    return steps_changed or name_changed


def _plan_macros(
    base_activity: Mapping[str, Any],
    edit_activity: Mapping[str, Any],
    activity_id: int,
    out: list[SyncStep],
    *,
    macro_pairing: MacroPairing | None = None,
) -> None:
    base_macros = _rows_by_button(base_activity.get("macros"))
    edit_macros = _rows_by_button(edit_activity.get("macros"))

    if macro_pairing is None:
        # Device scope: nothing renumbers a device's macro key ids, so
        # button_id is a stable identity and the plain by-id diff applies.
        for button_id in sorted(edit_macros):
            macro = edit_macros[button_id]
            base_macro = base_macros.get(button_id)
            if base_macro is not None and not _macro_rows_differ(base_macro, macro):
                continue
            out.append(_macro_write_step(activity_id, button_id, macro))
        for button_id in sorted(set(base_macros) - set(edit_macros)):
            if button_id in _POWER_MACRO_BUTTON_IDS:
                continue
            out.append(
                SyncStep(
                    kind="macro_delete",
                    label="Removing a custom action…",
                    payload={"activity_id": activity_id, "button_id": button_id},
                )
            )
        return

    # Activity scope. Power macros (198/199) are fixed wire ids outside the
    # editor's positional renumbering, so they keep the by-id diff. A fresh
    # activity's baseline legitimately lacks them and they are never flagged
    # ``new`` — diverting their write to an allocated quick-access id broke
    # the from-scratch power-on overwrite (BUG #8).
    for button_id in sorted(set(edit_macros) & _POWER_MACRO_BUTTON_IDS):
        macro = edit_macros[button_id]
        base_macro = base_macros.get(button_id)
        if base_macro is not None and not _macro_rows_differ(base_macro, macro):
            continue
        out.append(_macro_write_step(activity_id, button_id, macro))

    # Editable macros are matched by content (see MacroPairing): a pure
    # quick-access move is a no-op for the macro record — the baseline key
    # id stays the macro's wire identity and only the order step moves it.
    for base_macro, edit_macro in macro_pairing.pairs:
        if not _macro_rows_differ(base_macro, edit_macro):
            continue
        out.append(_macro_write_step(activity_id, _int(base_macro.get("button_id")), edit_macro))

    for macro in macro_pairing.new_rows:
        # A macro the baseline never had. Its button_id is a *proposal*
        # from the editor's renumbered client view; on the hub, favorites
        # and macro shortcuts share one fav-id namespace, so the executor
        # must allocate the real id against live hub occupancy (BUG #5:
        # a proposed id landing on a surviving favorite's fav_id silently
        # overwrites that favorite).
        out.append(
            _macro_write_step(activity_id, _int(macro.get("button_id")), macro, new=True)
        )

    for macro in macro_pairing.deleted_rows:
        # A removed user macro is a key-row delete (0x0210), same primitive
        # as favorite delete. Power macros never reach here (filtered out of
        # the pairing).
        out.append(
            SyncStep(
                kind="macro_delete",
                label="Removing a custom action…",
                payload={"activity_id": activity_id, "button_id": _int(macro.get("button_id"))},
            )
        )


def _macro_label(button_id: int) -> str:
    if button_id == POWER_ON_MACRO_BUTTON_ID:
        return "Updating start sequence…"
    if button_id == POWER_OFF_MACRO_BUTTON_ID:
        return "Updating end sequence…"
    return "Updating a custom action…"


def _normalize_binding_macro_refs(
    row: Mapping[str, Any],
    activity_id: int,
    edit_to_base_id: Mapping[int, int],
) -> dict[str, Any]:
    """Rewrite a binding row's macro references from the editor's positional
    macro ids back to the baseline hub key ids. A macro-target binding stores
    ``device_id = the activity's own id`` and ``command_id = the macro's
    button_id`` — which, in an edited bundle, is a display position."""
    updated = dict(row)
    if _int(updated.get("device_id")) == activity_id:
        command_id = _int(updated.get("command_id"))
        if command_id in edit_to_base_id:
            updated["command_id"] = edit_to_base_id[command_id]
    if _int(updated.get("long_press_device_id")) == activity_id:
        lp_command_id = _int(updated.get("long_press_command_id"))
        if lp_command_id in edit_to_base_id:
            updated["long_press_command_id"] = edit_to_base_id[lp_command_id]
    return updated


def _plan_bindings(
    base_activity: Mapping[str, Any],
    edit_activity: Mapping[str, Any],
    activity_id: int,
    out: list[SyncStep],
    *,
    default_device_id: int | None = None,
    macro_pairing: MacroPairing | None = None,
) -> None:
    # Device-scope binding rows carry no device_id — the source device is
    # implicitly the device itself; ``default_device_id`` supplies it.
    base_bindings = _rows_by_button(base_activity.get("button_bindings"))
    edit_bindings = _rows_by_button(edit_activity.get("button_bindings"))
    if macro_pairing is not None and macro_pairing.edit_to_base_id:
        edit_bindings = {
            button_id: _normalize_binding_macro_refs(row, activity_id, macro_pairing.edit_to_base_id)
            for button_id, row in edit_bindings.items()
        }
    for button_id in sorted(edit_bindings):
        binding = edit_bindings[button_id]
        base_binding = base_bindings.get(button_id)
        if base_binding is not None and _canonical(base_binding) == _canonical(binding):
            continue
        device_id = _int(binding.get("device_id")) or _int(default_device_id or 0)
        long_press_command_id = _int(binding.get("long_press_command_id"))
        long_press_device_id = _int(binding.get("long_press_device_id"))
        if long_press_command_id and not long_press_device_id:
            long_press_device_id = _int(default_device_id or 0)
        out.append(
            SyncStep(
                kind="binding_write",
                label="Writing button assignments…",
                target_device_id=device_id or None,
                payload={
                    "activity_id": activity_id,
                    "button_id": button_id,
                    "device_id": device_id,
                    "command_id": _int(binding.get("command_id")),
                    "long_press_device_id": long_press_device_id,
                    "long_press_command_id": long_press_command_id,
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
    *,
    macro_pairing: MacroPairing | None = None,
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
    # The payload carries the favorite's content next to the baseline fav_id
    # so the executor can re-resolve the target against the hub's *live*
    # fav ids when the baseline id turns out stale (the editor renumbers
    # button_ids positionally, and a rebase fallback can promote that
    # renumbered view to baseline — deleting by a stale id would remove the
    # wrong favorite).
    for fav_id, content, _row in base:
        if content not in edit_content_set:
            out.append(
                SyncStep(
                    kind="favorite_delete",
                    label="Removing a shortcut…",
                    payload={
                        "activity_id": activity_id,
                        "button_id": fav_id,
                        "device_id": content[0],
                        "command_id": content[1],
                    },
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
    # Reorder: the desired final order covers the WHOLE quick-access list —
    # favorites and macro shortcuts share one fav-id namespace, and the
    # family-0x61 sort page rewrites the entire order table, so an order
    # step naming only the favorites would drop every macro from the table.
    # Favorites are expressed as content (the hub assigns fav_ids to added
    # favorites; the executor resolves content to live fav_ids after the
    # adds land). Macros are expressed by their baseline hub key id (the
    # editor's positional ids are recovered via the pairing); NEW macros
    # carry the editor's proposal plus ``new`` so the executor follows the
    # id the allocator actually assigned.
    #
    # Ordering identity tokens: position in the edited bundle is the
    # (renumbered) button_id for favorites and macros alike.
    macro_pairing = macro_pairing or MacroPairing({}, {})
    base_id_by_edit_id = macro_pairing.edit_to_base_id
    deleted_macro_ids = {_int(row.get("button_id")) for row in macro_pairing.deleted_rows}

    def _macro_token(edit_button_id: int) -> tuple[str, Any]:
        if edit_button_id in base_id_by_edit_id:
            return ("macro", base_id_by_edit_id[edit_button_id])
        return ("macro_new", edit_button_id)

    edit_rank = _quick_access_rank(edit_activity)
    base_rank = _quick_access_rank(base_activity)

    edit_entries: list[tuple[int, tuple[str, Any]]] = [
        (bid, ("favorite", content)) for bid, content, _row in edit
    ]
    for row in _editable_macro_rows(edit_activity):
        edit_entries.append((_int(row.get("button_id")), _macro_token(_int(row.get("button_id")))))
    edit_entries.sort(key=lambda item: _quick_access_sort_key(item[0], edit_rank))
    desired_order = [token for _bid, token in edit_entries]

    # What add/delete alone would produce: survivors kept in their baseline
    # order, additions appended in edited order.
    base_entries: list[tuple[int, tuple[str, Any]]] = [
        (bid, ("favorite", content)) for bid, content, _row in base if content in edit_content_set
    ]
    for row in _editable_macro_rows(base_activity):
        base_id = _int(row.get("button_id"))
        if base_id not in deleted_macro_ids:
            base_entries.append((base_id, ("macro", base_id)))
    base_entries.sort(key=lambda item: _quick_access_sort_key(item[0], base_rank))
    survivor_tokens = [token for _bid, token in base_entries]
    added_tokens = [
        token
        for _bid, token in edit_entries
        if (token[0] == "favorite" and token[1] not in base_fav_id_by_content)
        or token[0] == "macro_new"
    ]
    natural_order = survivor_tokens + added_tokens

    # A NEW macro always forces an order write even at the natural tail
    # position: the activity-scope macro save registers the key row but not
    # its sort-table entry (the vendor app follows every macro create with a
    # family-0x61 sort page + commit), so without it the new shortcut has no
    # slot in the hub's order table.
    has_new_macro = bool(macro_pairing.new_rows)
    if desired_order and (desired_order != natural_order or has_new_macro):
        order_payload: list[dict[str, Any]] = []
        for token in desired_order:
            if token[0] == "favorite":
                device_id, command_id = token[1]
                order_payload.append(
                    {"kind": "favorite", "device_id": device_id, "command_id": command_id}
                )
            elif token[0] == "macro":
                order_payload.append({"kind": "macro", "button_id": token[1]})
            else:
                order_payload.append({"kind": "macro", "button_id": token[1], "new": True})
        out.append(
            SyncStep(
                kind="favorite_order",
                label="Reordering shortcuts…",
                payload={"activity_id": activity_id, "order": order_payload},
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
