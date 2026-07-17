"""Pure diff → write-plan builder for in-place Wifi Command re-sync (P1/P2).

Turns a ``(baseline, desired)`` pair of :class:`ManagedWifiSnapshot` records
into an ordered list of :class:`SyncStep` writes that edit the already-deployed
managed Wifi Device *in place* — instead of the create-new → add-to-activities
→ delete-old replace path. Because the device id never changes, anything the
user attached to the managed device in the app (extra activity memberships,
favorites, hard-button bindings, macro steps) keeps working.

Also home to the two pure snapshot adapters:

* :func:`desired_snapshot_from_config` — store command-config payload →
  desired snapshot, reproducing the deploy path's slot expansion and
  favorite / binding / input / membership derivation exactly.
* :func:`baseline_snapshot_from_bundle` — live structural bundle reads →
  baseline snapshot (field shapes grounded against a real managed device:
  ``scripts/hub-bench/out/shape-dump-x1s.json``).

Design invariants (mirrors ``activity_sync.build_device_sync_plan``):

* **Pure / executor-free** — no I/O; fully unit-testable against fixture
  snapshot pairs. The wire executors live in ``proxy_activity_sync.py``.
* **Executor order** — command records first (adds, renames, deletes), then
  the device power rows and input record, then per-activity membership /
  favorite / binding diffs, then the head name+brand commit LAST (the commit
  marker: an interrupted deploy leaves the brand hash unwritten so the device
  reads out-of-step and re-offers sync).
* **Fallback, never guess** — a diff the in-place path must not attempt
  (removing an activity's last member, a device-id mismatch) returns a
  :class:`WifiInplacePlan` with ``fallback_reason`` set and no steps, so the
  caller drops back to the replace path.

Every wire primitive these steps map to is live-validated on X1 + X1S
(docs/protocol/live-hub-testing.md, "in-place wifi deploy" bench program).

Step ``kind`` values reuse the activity/device-sync vocabulary where one
exists (``command_rename``, ``member_replay``, ``favorite_add/delete``,
``binding_write/delete``); five are specific to this path:

* ``command_delete``    — ``FAMILY_FAV_DELETE [dev, command_id]`` (chunk 2)
* ``wifi_power_config`` — family-0x12 power-row rewrite (chunk 1)
* ``wifi_input_config`` — device input-record rewrite (chunk 1)
* ``membership_remove`` — POWER_ON macro rewrite dropping the device (chunk 3)
* ``wifi_head_commit``  — wifi-aware head write carrying ``wifi_power_state``
  (chunk 4; a generic ``device_rename`` would break X1S delivery)
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Mapping, Sequence

from .activity_sync import (
    DEVICE_INPUT_REF_COMMAND,
    POWER_ON_MACRO_BUTTON_ID,
    POWER_OFF_MACRO_BUTTON_ID,
    SyncStep,
)

__all__ = [
    "WifiCommandSlot",
    "WifiActivityRefs",
    "ManagedWifiSnapshot",
    "WifiInplacePlan",
    "build_wifi_inplace_plan",
    "derive_device_level_bindings",
    "desired_snapshot_from_config",
    "baseline_snapshot_from_bundle",
]

# Deploy constants (mirror hub.py's _WIFI_COMMAND_SLOT_COUNT / long offset —
# kept local so this module stays pure and import-light).
WIFI_COMMAND_SLOT_COUNT = 10
WIFI_COMMAND_LONG_PRESS_OFFSET = 10


@dataclass(frozen=True)
class WifiCommandSlot:
    """One command record on the managed device, keyed by its hub command id.

    Wifi command records are positional — the callback path embeds the slot
    index, which never changes while the id is stable — so the only in-place
    record dimensions are label (→ ``command_rename``) and existence
    (→ ``command_add`` / ``command_delete``). ``payload_key`` is retained as
    an escape hatch for a future payload-bearing class; leave it constant and
    no ``command_payload`` step is ever emitted.
    """

    command_id: int
    label: str
    payload_key: str = "wifi"
    press_type: str = "short"


@dataclass(frozen=True)
class WifiActivityRefs:
    """How the managed device is referenced inside one activity.

    ``input_ordinal`` is the 1-based position into the device's input list
    selected for this activity (0 = no input) — the ``duration`` byte of the
    ``(dev, 0xC5)`` step inside the activity's POWER_ON macro. Comparing
    ordinals (not command ids) is deliberate: re-pointing the device input
    LIST while ordinals stay put needs no activity write (bench chunk 1).

    ``favorites`` maps the device's favorited command ids to their hub
    ``fav_id`` (the ``button_id`` of the favorite row; 0 when unknown — the
    desired side). ``bindings`` rows are
    ``(button_id, command_id, long_press_command_id|None)``.

    ``member_count`` (baseline only) is the total number of member devices in
    the activity including this one; it gates the last-member fallback.
    """

    activity_id: int
    input_ordinal: int = 0
    favorites: Mapping[int, int] = field(default_factory=dict)
    bindings: tuple[tuple[int, int, int | None], ...] = ()
    member_count: int = 1


@dataclass(frozen=True)
class ManagedWifiSnapshot:
    """Normalized view of a managed Wifi Device — baseline (live read) or
    desired (store config). Both sides share this shape so the diff is
    symmetric.

    ``input_command_ids`` is the device's ordered input list (ordinal ``n``
    selects ``input_command_ids[n-1]``).

    ``device_bindings`` are the device's OWN device-page key rows —
    ``(button_id, command_id, long_press_command_id|None)`` — the bindings
    that make the device selectable as a role-group controller (volume,
    navigation, …) in activity editors. On the desired side these are
    derived from the config (:func:`derive_device_level_bindings`).
    """

    device_id: int
    device_name: str
    brand: str
    power_on_command_id: int | None = None
    power_off_command_id: int | None = None
    input_command_ids: tuple[int, ...] = ()
    slots: Mapping[int, WifiCommandSlot] = field(default_factory=dict)
    activities: Mapping[int, WifiActivityRefs] = field(default_factory=dict)
    device_bindings: tuple[tuple[int, int, int | None], ...] = ()


@dataclass(frozen=True)
class WifiInplacePlan:
    """Result of the diff: an ordered step list, or a fallback verdict.

    ``fallback_reason`` non-empty means the in-place path declines this diff
    and the caller must use the replace path; ``steps`` is then empty. An
    empty ``steps`` with no ``fallback_reason`` is a clean no-op.
    """

    steps: tuple[SyncStep, ...] = ()
    fallback_reason: str | None = None

    @property
    def is_fallback(self) -> bool:
        return self.fallback_reason is not None


def _fallback(reason: str) -> WifiInplacePlan:
    return WifiInplacePlan(steps=(), fallback_reason=reason)


# ── The diff ─────────────────────────────────────────────────────────────


def build_wifi_inplace_plan(
    baseline: ManagedWifiSnapshot,
    desired: ManagedWifiSnapshot,
    *,
    deployed: ManagedWifiSnapshot | None = None,
) -> WifiInplacePlan:
    """Diff ``baseline`` (current live device state) against ``desired``
    (target from the store config) and return the in-place write plan.

    ``deployed`` — the expansion of the store's frozen last-deployed config —
    scopes the OWNERSHIP of per-activity references (favorites, hard-button
    bindings, activity memberships):

    * **desired wins where it speaks** — a reference the desired config names
      is written regardless of the live value (a foreign edit on that exact
      spot is deliberately overwritten: the user just issued a newer
      instruction for it);
    * **deployed history decides what we clean up** — a reference is only
      *deleted* when the deployed expansion shows we created it and the
      desired config no longer wants it;
    * **everything else is untouchable** — references made outside the
      Wifi Commands config (the Sofabaton app, the live activity editor)
      are never planned away.

    With ``deployed=None`` the diff is symmetric (baseline-minus-desired
    deletes) — the pure two-snapshot comparison for standalone library use.
    The integration always passes the deployed expansion.

    The device's own substance (command records, power rows, the input
    record, the head) is exclusively ours regardless of ``deployed``.
    """

    if baseline.device_id != desired.device_id:
        return _fallback(
            f"managed device id changed ({baseline.device_id} → {desired.device_id})"
        )
    dev = baseline.device_id

    command_steps: list[SyncStep] = []
    power_steps: list[SyncStep] = []
    input_steps: list[SyncStep] = []
    device_binding_steps: list[SyncStep] = []
    member_steps: list[SyncStep] = []
    favorite_steps: list[SyncStep] = []
    binding_steps: list[SyncStep] = []
    membership_remove_steps: list[SyncStep] = []
    head_steps: list[SyncStep] = []

    # ── 1. command records: adds → renames/payloads → deletes ────────────
    base_ids = set(baseline.slots)
    des_ids = set(desired.slots)

    for cid in sorted(des_ids - base_ids):
        slot = desired.slots[cid]
        command_steps.append(
            SyncStep(
                kind="command_add",
                label=f"Adding command “{slot.label}”…",
                target_device_id=dev,
                payload={"device_id": dev, "command_id": cid, "command_name": slot.label},
            )
        )

    for cid in sorted(base_ids & des_ids):
        b_slot = baseline.slots[cid]
        d_slot = desired.slots[cid]
        if b_slot.payload_key != d_slot.payload_key:
            command_steps.append(
                SyncStep(
                    kind="command_payload",
                    label=f"Updating command “{d_slot.label}”…",
                    target_device_id=dev,
                    payload={"device_id": dev, "command_id": cid, "command_name": d_slot.label},
                )
            )
        elif b_slot.label != d_slot.label:
            command_steps.append(
                SyncStep(
                    kind="command_rename",
                    label=f"Renaming command to “{d_slot.label}”…",
                    target_device_id=dev,
                    payload={"device_id": dev, "command_id": cid, "name": d_slot.label},
                )
            )

    for cid in sorted(base_ids - des_ids):
        command_steps.append(
            SyncStep(
                kind="command_delete",
                label=f"Removing command “{baseline.slots[cid].label}”…",
                target_device_id=dev,
                payload={"device_id": dev, "command_id": cid},
            )
        )

    # ── 2. power on/off command ids ──────────────────────────────────────
    if (baseline.power_on_command_id, baseline.power_off_command_id) != (
        desired.power_on_command_id,
        desired.power_off_command_id,
    ):
        power_steps.append(
            SyncStep(
                kind="wifi_power_config",
                label="Updating power control…",
                target_device_id=dev,
                payload={
                    "device_id": dev,
                    "power_on_command_id": desired.power_on_command_id,
                    "power_off_command_id": desired.power_off_command_id,
                },
            )
        )

    # ── 3. device input record (the ordered input list) ──────────────────
    if tuple(baseline.input_command_ids) != tuple(desired.input_command_ids):
        input_steps.append(
            SyncStep(
                kind="wifi_input_config",
                label="Updating input configuration…",
                target_device_id=dev,
                payload={
                    "device_id": dev,
                    "input_command_ids": list(desired.input_command_ids),
                    "labels": {
                        cid: slot.label for cid, slot in sorted(desired.slots.items())
                    },
                },
            )
        )

    # ── 3b. device-page key bindings (role-group capability rows) ────────
    # Same keymap primitives as activity bindings — the KeyToKey table is
    # uniform, addressed here with the device's own id. Ownership follows
    # the same rule: desired keys are written over whatever is live, only
    # keys WE deployed are cleaned up, foreign device-page rows survive.
    _diff_bindings(
        dev,
        dev,  # keymap entity id = the device itself
        baseline.device_bindings,
        desired.device_bindings,
        device_binding_steps,
        owned_buttons=(
            {row[0] for row in deployed.device_bindings}
            if deployed is not None
            else None
        ),
    )

    # ── 4. per-activity refs ─────────────────────────────────────────────
    base_acts = baseline.activities
    des_acts = desired.activities
    # Ownership scope for deletes: with a deployed expansion, only references
    # WE created are ever cleaned up; without one (pure two-snapshot use) the
    # baseline itself is the scope (symmetric diff).
    owned_acts = deployed.activities if deployed is not None else base_acts

    def _input_cmd_for(ordinal: int) -> int | None:
        if ordinal <= 0 or ordinal > len(desired.input_command_ids):
            return None
        return desired.input_command_ids[ordinal - 1]

    def _owned_refs(act_id: int) -> WifiActivityRefs:
        return owned_acts.get(act_id) or WifiActivityRefs(activity_id=act_id)

    # kept activities — diff refs in place
    for act_id in sorted(set(base_acts) & set(des_acts)):
        b = base_acts[act_id]
        d = des_acts[act_id]

        if b.input_ordinal != d.input_ordinal:
            # The activity-side (dev,0xC5) ordinal lives inside the POWER_ON
            # macro; add_device_to_activity replays the member list and
            # rewrites it (the validated primitive for exactly this).
            member_steps.append(
                SyncStep(
                    kind="member_replay",
                    label="Updating input selection…",
                    target_device_id=dev,
                    payload={
                        "activity_id": act_id,
                        "device_id": dev,
                        "input_cmd_id": _input_cmd_for(d.input_ordinal),
                    },
                )
            )

        owned = _owned_refs(act_id)
        _diff_favorites(dev, act_id, b.favorites, d.favorites, favorite_steps,
                        owned_command_ids=set(owned.favorites))
        _diff_bindings(dev, act_id, b.bindings, d.bindings, binding_steps,
                       owned_buttons={row[0] for row in owned.bindings})

    # added activities — join + set refs
    for act_id in sorted(set(des_acts) - set(base_acts)):
        d = des_acts[act_id]
        member_steps.append(
            SyncStep(
                kind="member_replay",
                label="Adding to an activity…",
                target_device_id=dev,
                payload={
                    "activity_id": act_id,
                    "device_id": dev,
                    "input_cmd_id": _input_cmd_for(d.input_ordinal),
                },
            )
        )
        _diff_favorites(dev, act_id, {}, d.favorites, favorite_steps,
                        owned_command_ids=set())
        _diff_bindings(dev, act_id, (), d.bindings, binding_steps,
                       owned_buttons=set())

    # removed activities — drop membership (favorites/bindings cascade
    # hub-side; bench chunk 3). Only memberships WE deployed are removed:
    # an activity the user added the device to outside the config is foreign
    # and stays untouched.
    for act_id in sorted((set(base_acts) & set(owned_acts)) - set(des_acts)):
        b = base_acts[act_id]
        if b.member_count <= 1:
            # Removing the last member empties the activity → hub GCs it.
            # The in-place path must not do that; fall back to replace.
            return _fallback(
                f"removing the device from activity {act_id} would empty it "
                "(last member); replace-path required"
            )
        membership_remove_steps.append(
            SyncStep(
                kind="membership_remove",
                label="Removing from an activity…",
                target_device_id=dev,
                payload={"device_id": dev, "activity_id": act_id},
            )
        )

    # ── 5. head commit (name + brand) LAST — the commit marker ───────────
    # Distinct from the generic device_rename: the wifi head write must carry
    # wifi_power_state from the current head, else is_power_configured flips
    # and activity delivery breaks on X1S (bench chunk 4).
    if baseline.device_name != desired.device_name or baseline.brand != desired.brand:
        head_steps.append(
            SyncStep(
                kind="wifi_head_commit",
                label="Saving the device…",
                target_device_id=dev,
                payload={
                    "device_id": dev,
                    "name": desired.device_name,
                    "brand": desired.brand,
                },
            )
        )

    steps = (
        *command_steps,
        *power_steps,
        *input_steps,
        *device_binding_steps,
        *member_steps,
        *favorite_steps,
        *binding_steps,
        *membership_remove_steps,
        *head_steps,
    )
    return WifiInplacePlan(steps=tuple(steps))


def _diff_favorites(
    dev: int,
    act_id: int,
    base: Mapping[int, int],
    desired: Mapping[int, int],
    out: list[SyncStep],
    *,
    owned_command_ids: set[int] | None = None,
) -> None:
    # Deletes are scoped to OUR favorites (the deployed expansion) so that
    # favorites created outside the config survive; None = symmetric diff.
    delete_scope = set(base) if owned_command_ids is None else (owned_command_ids & set(base))
    for cid in sorted(delete_scope - set(desired)):
        out.append(
            SyncStep(
                kind="favorite_delete",
                label="Removing a favorite…",
                target_device_id=dev,
                payload={
                    "activity_id": act_id,
                    "device_id": dev,
                    "command_id": cid,
                    # the hub fav_id from the baseline read; the executor
                    # re-resolves by content when it is stale.
                    "button_id": int(base[cid]),
                },
            )
        )
    for cid in sorted(set(desired) - set(base)):
        out.append(
            SyncStep(
                kind="favorite_add",
                label="Adding a favorite…",
                target_device_id=dev,
                payload={"activity_id": act_id, "device_id": dev, "command_id": cid},
            )
        )


def _diff_bindings(
    dev: int,
    act_id: int,
    base: Sequence[tuple[int, int, int | None]],
    desired: Sequence[tuple[int, int, int | None]],
    out: list[SyncStep],
    *,
    owned_buttons: set[int] | None = None,
) -> None:
    base_by_button = {row[0]: row for row in base}
    des_by_button = {row[0]: row for row in desired}
    # Deletes are scoped to OUR buttons (the deployed expansion); a foreign
    # binding on an unclaimed button survives. A button the desired config
    # names is always written below — desired wins where it speaks.
    delete_scope = (
        set(base_by_button)
        if owned_buttons is None
        else (owned_buttons & set(base_by_button))
    )
    for button in sorted(delete_scope - set(des_by_button)):
        out.append(
            SyncStep(
                kind="binding_delete",
                label="Clearing a button…",
                target_device_id=dev,
                payload={"activity_id": act_id, "button_id": button},
            )
        )
    for button in sorted(des_by_button):
        row = des_by_button[button]
        if base_by_button.get(button) == row:
            continue  # unchanged
        _button, command_id, long_command_id = row
        out.append(
            SyncStep(
                kind="binding_write",
                label="Assigning a button…",
                target_device_id=dev,
                payload={
                    "activity_id": act_id,
                    "device_id": dev,
                    "button_id": button,
                    "command_id": command_id,
                    "long_press_device_id": dev if long_command_id else None,
                    "long_press_command_id": long_command_id,
                },
            )
        )


# ── Adapters ─────────────────────────────────────────────────────────────


def derive_device_level_bindings(
    commands: Sequence[Mapping[str, Any]],
    *,
    hard_button_codes: Mapping[str, int],
    slot_count: int = WIFI_COMMAND_SLOT_COUNT,
    long_press_offset: int = WIFI_COMMAND_LONG_PRESS_OFFSET,
) -> tuple[tuple[int, int, int | None], ...]:
    """Derive the device-page key bindings implied by a command config.

    A command assigned to a hard button also gets that key bound on the
    managed device's OWN page when the claim is unambiguous — i.e. the
    button is claimed by exactly one command across the device's slots.
    (Two commands may legitimately claim the same button for different
    activities; no device-level row can represent that, so ambiguous keys
    are skipped and keep working per-activity exactly as before.)

    Device-page bindings are what make the device selectable as a
    role-group controller (volume, navigation, playback, channel) in
    activity editors, and they respond to direct presses on the remote's
    device page. Returns ``(button_id, command_id, long_command_id|None)``
    rows ordered by button id.
    """

    claims: dict[int, list[tuple[int, int | None]]] = {}
    for idx, slot in enumerate(list(commands)[:slot_count]):
        if not isinstance(slot, Mapping):
            continue
        hard_button = str(slot.get("hard_button") or "").strip().lower()
        if not hard_button:
            continue
        button_code = hard_button_codes.get(hard_button)
        if not button_code:
            continue
        command_id = idx + 1
        long_id = (
            command_id + long_press_offset
            if bool(slot.get("long_press_enabled"))
            else None
        )
        claims.setdefault(int(button_code), []).append((command_id, long_id))

    return tuple(
        (button, rows[0][0], rows[0][1])
        for button, rows in sorted(claims.items())
        if len(rows) == 1
    )


def desired_snapshot_from_config(
    config: Mapping[str, Any],
    *,
    device_id: int,
    device_name: str,
    brand: str,
    hard_button_codes: Mapping[str, int],
    slot_count: int = WIFI_COMMAND_SLOT_COUNT,
    long_press_offset: int = WIFI_COMMAND_LONG_PRESS_OFFSET,
) -> ManagedWifiSnapshot:
    """Store command-config payload → desired :class:`ManagedWifiSnapshot`.

    Reproduces the deploy path's derivations exactly (hub.py's slot
    expansion, referenced-activity collection, favorite / hard-button /
    input mapping):

    * short command id = slot index + 1; long id = short + offset; every
      slot expands to both records with the store name (or the
      ``Command {n}`` default) and the ``… Long Press`` suffix;
    * the device input list = slot command ids with ``input_activity_id``
      set, in slot order; an activity's ordinal = position of the FIRST
      slot that selected it (``setdefault`` semantics);
    * a slot's ``activities`` list is only honoured while the slot is a
      favorite or has a hard button (issue #258);
    * membership = activities referenced by favorites / hard buttons /
      input assignments.

    ``hard_button_codes`` is the HA layer's name→code map (kept an argument
    so this module stays pure).
    """

    raw_commands = config.get("commands")
    commands: list[Mapping[str, Any]] = [
        slot for slot in (raw_commands or []) if isinstance(slot, Mapping)
    ][:slot_count]

    slots: dict[int, WifiCommandSlot] = {}
    names: list[str] = []
    for idx, slot in enumerate(commands):
        name = str(slot.get("name") or f"Command {idx + 1}").strip() or f"Command {idx + 1}"
        names.append(name)
    # Deploys always write every slot (defaults included): 1..N short then
    # N+1..2N long — grounded against a live managed device.
    for idx in range(len(commands)):
        short_id = idx + 1
        slots[short_id] = WifiCommandSlot(command_id=short_id, label=names[idx])
        long_id = idx + 1 + long_press_offset
        slots[long_id] = WifiCommandSlot(
            command_id=long_id, label=f"{names[idx]} Long Press", press_type="long"
        )

    # device input list + per-activity ordinal (first-slot-wins)
    input_command_ids: list[int] = []
    activity_input_ordinal: dict[int, int] = {}
    for idx, slot in enumerate(commands):
        raw_act = str(slot.get("input_activity_id") or "").strip()
        if not raw_act:
            continue
        try:
            act_id = int(raw_act)
        except (TypeError, ValueError):
            continue
        input_command_ids.append(idx + 1)
        activity_input_ordinal.setdefault(act_id, len(input_command_ids))

    # per-activity favorites / bindings + referenced membership
    favorites: dict[int, dict[int, int]] = {}
    bindings: dict[int, list[tuple[int, int, int | None]]] = {}
    referenced: set[int] = set(activity_input_ordinal)
    for idx, slot in enumerate(commands):
        command_id = idx + 1
        is_favorite = bool(slot.get("add_as_favorite"))
        hard_button = str(slot.get("hard_button") or "").strip().lower()
        button_code = hard_button_codes.get(hard_button) if hard_button else None
        if not is_favorite and not hard_button:
            continue
        slot_acts: list[int] = []
        for act in slot.get("activities") or []:
            try:
                slot_acts.append(int(act))
            except (TypeError, ValueError):
                continue
        referenced.update(slot_acts)
        for act_id in slot_acts:
            if is_favorite:
                favorites.setdefault(act_id, {})[command_id] = 0
            if button_code:
                long_id = (
                    command_id + long_press_offset
                    if bool(slot.get("long_press_enabled"))
                    else None
                )
                bindings.setdefault(act_id, []).append((button_code, command_id, long_id))

    activities = {
        act_id: WifiActivityRefs(
            activity_id=act_id,
            input_ordinal=activity_input_ordinal.get(act_id, 0),
            favorites=favorites.get(act_id, {}),
            bindings=tuple(bindings.get(act_id, ())),
        )
        for act_id in sorted(referenced)
    }

    power_on = config.get("power_on_command_id")
    power_off = config.get("power_off_command_id")
    return ManagedWifiSnapshot(
        device_id=int(device_id),
        device_name=str(device_name),
        brand=str(brand),
        power_on_command_id=int(power_on) if power_on is not None else None,
        power_off_command_id=int(power_off) if power_off is not None else None,
        input_command_ids=tuple(input_command_ids),
        slots=slots,
        activities=activities,
        device_bindings=derive_device_level_bindings(
            commands,
            hard_button_codes=hard_button_codes,
            slot_count=slot_count,
            long_press_offset=long_press_offset,
        ),
    )


def baseline_snapshot_from_bundle(
    device_entry: Mapping[str, Any],
    activity_entries: Sequence[Mapping[str, Any]],
) -> ManagedWifiSnapshot:
    """Live structural reads → baseline :class:`ManagedWifiSnapshot`.

    ``device_entry`` is one ``device_backup`` block (``backup_device`` /
    a ``hub_bundle`` device entry, blob-free is fine); ``activity_entries``
    are ``activity_backup`` payloads for every activity that may reference
    the device. Field shapes grounded against a live managed wifi device.
    """

    dev_block = device_entry.get("device") or {}
    device_id = int(dev_block.get("device_id") or 0)

    slots: dict[int, WifiCommandSlot] = {}
    for row in device_entry.get("commands") or []:
        if not isinstance(row, Mapping) or row.get("command_id") is None:
            continue
        cid = int(row.get("command_id"))
        label = str(row.get("command_label") or row.get("name") or "")
        slots[cid] = WifiCommandSlot(command_id=cid, label=label)

    # device input list: input_record entries ordered by input_index
    input_command_ids: list[int] = []
    entries = (device_entry.get("input_record") or {}).get("entries") or []
    for entry in sorted(
        (e for e in entries if isinstance(e, Mapping)),
        key=lambda e: int(e.get("input_index") or 0),
    ):
        if entry.get("command_id") is not None:
            input_command_ids.append(int(entry.get("command_id")))

    # power ids: the device-scope 198/199 macros' single row
    power_on: int | None = None
    power_off: int | None = None
    for macro in device_entry.get("macros") or []:
        if not isinstance(macro, Mapping):
            continue
        button = int(macro.get("button_id", macro.get("key_id", 0)) or 0)
        steps = [s for s in macro.get("steps") or [] if isinstance(s, Mapping)]
        first_cmd = int(steps[0].get("command_id") or 0) if steps else 0
        if button == POWER_ON_MACRO_BUTTON_ID and first_cmd:
            power_on = first_cmd
        elif button == POWER_OFF_MACRO_BUTTON_ID and first_cmd:
            power_off = first_cmd

    activities: dict[int, WifiActivityRefs] = {}
    for act in activity_entries:
        if not isinstance(act, Mapping):
            continue
        members = [int(m) for m in act.get("referenced_source_device_ids") or []]
        if device_id not in members:
            continue
        act_id = int((act.get("device") or {}).get("device_id") or 0)
        if not act_id:
            continue

        input_ordinal = 0
        for macro in act.get("macros") or []:
            if int(macro.get("button_id", macro.get("key_id", 0)) or 0) != POWER_ON_MACRO_BUTTON_ID:
                continue
            for step in macro.get("steps") or []:
                if (
                    int(step.get("device_id") or 0) == device_id
                    and int(step.get("command_id") or 0) == DEVICE_INPUT_REF_COMMAND
                ):
                    input_ordinal = int(step.get("duration") or 0)
                    # the hub lazily normalizes "no input" 0 ↔ 255
                    if input_ordinal == 0xFF:
                        input_ordinal = 0
                    break

        favorites = {
            int(slot.get("command_id") or 0): int(slot.get("button_id") or 0)
            for slot in act.get("favorite_slots") or []
            if int(slot.get("device_id") or 0) == device_id and slot.get("command_id")
        }
        bindings = tuple(
            (
                int(row.get("button_id") or 0),
                int(row.get("command_id") or 0),
                int(row["long_press_command_id"])
                if row.get("long_press_command_id")
                else None,
            )
            for row in act.get("button_bindings") or []
            if int(row.get("device_id") or 0) == device_id
        )
        activities[act_id] = WifiActivityRefs(
            activity_id=act_id,
            input_ordinal=input_ordinal,
            favorites=favorites,
            bindings=bindings,
            member_count=len(members),
        )

    device_bindings = tuple(
        (
            int(row.get("button_id") or 0),
            int(row.get("command_id") or 0),
            int(row["long_press_command_id"]) if row.get("long_press_command_id") else None,
        )
        for row in device_entry.get("button_bindings") or []
        if isinstance(row, Mapping) and row.get("button_id")
    )

    return ManagedWifiSnapshot(
        device_id=device_id,
        device_name=str(dev_block.get("name") or ""),
        brand=str(dev_block.get("brand") or ""),
        power_on_command_id=power_on,
        power_off_command_id=power_off,
        input_command_ids=tuple(input_command_ids),
        slots=slots,
        activities=activities,
        device_bindings=device_bindings,
    )
