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

from copy import deepcopy
from dataclasses import dataclass, field
from typing import Any, Callable, Collection, Mapping, Sequence

from .activity_sync import (
    DEVICE_INPUT_REF_COMMAND,
    DEVICE_POWER_OFF_REF_COMMAND,
    DEVICE_POWER_ON_REF_COMMAND,
    POWER_ON_MACRO_BUTTON_ID,
    _editable_macro_rows,
    _quick_access_rank,
    _quick_access_sort_key,
    POWER_OFF_MACRO_BUTTON_ID,
    SyncStep,
    build_activity_sync_plan,
)

__all__ = [
    "WifiCommandSlot",
    "WifiActivityRefs",
    "ManagedWifiSnapshot",
    "WifiInplacePlan",
    "LiveSlotClassification",
    "COMMAND_RECORD_STEP_KINDS",
    "REFERENCED_RECORD_STEP_KINDS",
    "build_wifi_inplace_plan",
    "classify_live_slots",
    "derive_device_level_bindings",
    "desired_snapshot_from_config",
    "baseline_snapshot_from_bundle",
    "clone_wifi_record_for_add",
    "retarget_long_record_refs",
    "wifi_events_retarget_steps",
]

# Deploy constants (mirror hub.py's _WIFI_COMMAND_SLOT_COUNT / long offset —
# kept local so this module stays pure and import-light).
WIFI_COMMAND_SLOT_COUNT = 10
WIFI_COMMAND_LONG_PRESS_OFFSET = 10

# Step kinds that write the device's command table: its commands are read
# back after any of them.
COMMAND_RECORD_STEP_KINDS = frozenset(
    {"command_add", "command_rename", "command_payload", "command_delete"}
)
# The ones that change or remove a record something else may name. Every
# activity naming the device holds resolved copies of those records (labels,
# codes, the rows a delete cascades into), so those activities are read back
# too. A command_add is left out: nothing references a command that is new.
REFERENCED_RECORD_STEP_KINDS = frozenset({"command_rename", "command_payload", "command_delete"})


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

    ``target_host`` is the callback address carried by the device head
    (the X1 Roku head stores the target IP; the X1S/X2 virtual-IP head
    stores none, every record carries its own). The baseline adapter reads
    it from the ``device_backup`` block; a desired snapshot that names one
    makes the head commit write exactly that address instead of the
    routed local IP, so a rename never moves a deployed callback target
    (review 2026-09-11, point 1). ``None`` on the desired side keeps the
    executor's historical behaviour (the Home Assistant path).
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
    target_host: str | None = None


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


@dataclass(frozen=True)
class LiveSlotClassification:
    """How the live command records compare with the last deploy.

    ``drift``: records matching neither the deployed nor the desired label
    (a foreign edit, e.g. the Sofabaton app). ``resumed``: records already
    matching the desired label (an interrupted run of our own; the planner
    diffs against the live read, so re-running resumes it). ``missing``:
    deployed records absent on the hub. Each caller sets its own policy for
    ``missing`` (the HA path lets the planner re-add them).
    """

    drift: tuple[int, ...]
    resumed: tuple[int, ...]
    missing: tuple[int, ...]


def classify_live_slots(
    live_slots: Mapping[int, WifiCommandSlot],
    expected_labels: Mapping[int, str],
    desired_slots: Mapping[int, WifiCommandSlot],
    *,
    label_key: Callable[[str], str],
) -> LiveSlotClassification:
    """Classify every live record against the deployed expansion.

    Labels are compared through ``label_key`` (how the hub stores them: a
    "<20-char name> Long Press" label reads back cut to the slot and is not
    drift).
    """

    drift: list[int] = []
    resumed: list[int] = []
    for cid, slot in live_slots.items():
        live = label_key(slot.label)
        expected = expected_labels.get(cid)
        if expected is not None and label_key(expected) == live:
            continue
        desired = desired_slots.get(cid)
        if desired is not None and label_key(desired.label) == live:
            resumed.append(cid)
            continue
        drift.append(cid)
    missing = sorted(cid for cid in expected_labels if cid not in live_slots)
    return LiveSlotClassification(tuple(sorted(drift)), tuple(sorted(resumed)), tuple(missing))


def _fallback(reason: str) -> WifiInplacePlan:
    return WifiInplacePlan(steps=(), fallback_reason=reason)


# ── The diff ─────────────────────────────────────────────────────────────


def build_wifi_inplace_plan(
    baseline: ManagedWifiSnapshot,
    desired: ManagedWifiSnapshot,
    *,
    deployed: ManagedWifiSnapshot | None = None,
    label_key: Callable[[str], str] | None = None,
) -> WifiInplacePlan:
    """Diff ``baseline`` (current live device state) against ``desired``
    (target from the store config) and return the in-place write plan.

    ``label_key`` projects a command label onto what the hub actually
    stores (the fixed-width slot, see ``commands.hub_command_label``);
    the rename diff compares projected labels so a desired name that only
    differs from the live one past the slot boundary is not a rename.
    Rename steps still carry the full desired name. ``None`` compares
    labels verbatim.

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
    _label_key = label_key if label_key is not None else (lambda text: text)

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
        elif _label_key(b_slot.label) != _label_key(d_slot.label):
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
                # command_name is progress-only (the delete write ignores it):
                # it lets the control panel name the command in its own locale.
                payload={
                    "device_id": dev,
                    "command_id": cid,
                    "command_name": baseline.slots[cid].label,
                },
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
    # Same keymap primitives as activity bindings — the binding table is
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
                label="Adding the device to an activity…",
                target_device_id=dev,
                # "join" is progress-only (the replay write ignores it): it
                # distinguishes joining an activity from the kept-activity
                # input rewrite above, which shares this step kind.
                payload={
                    "activity_id": act_id,
                    "device_id": dev,
                    "input_cmd_id": _input_cmd_for(d.input_ordinal),
                    "join": True,
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
                label="Removing the device from an activity…",
                target_device_id=dev,
                payload={"device_id": dev, "activity_id": act_id},
            )
        )

    # ── 5. head commit (name + brand) LAST — the commit marker ───────────
    # Distinct from the generic device_rename: the wifi head write must carry
    # wifi_power_state from the current head, else is_power_configured flips
    # and activity delivery breaks on X1S (bench chunk 4).
    if baseline.device_name != desired.device_name or baseline.brand != desired.brand:
        head_payload: dict[str, Any] = {
            "device_id": dev,
            "name": desired.device_name,
            "brand": desired.brand,
        }
        # Only a desired target pins the head address; without one the
        # executor keeps writing the routed local IP (the HA path, where
        # the head IP was the routed IP at deploy and follows it since).
        if desired.target_host:
            head_payload["ip_address"] = str(desired.target_host)
        head_steps.append(
            SyncStep(
                kind="wifi_head_commit",
                label="Saving the device…",
                target_device_id=dev,
                payload=head_payload,
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
    long_records: bool = True,
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

    ``long_records=False`` expands each slot to its short record only: the
    Wifi Events layout, one record per event
    (docs/internal/wifi-events-single-record-plan.md).

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
        if not long_records:
            continue
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
        target_host=str(dev_block.get("ip_address") or "") or None,
    )


# ── Wifi Events long-record retirement ──────────────────────────────────
#
# docs/internal/wifi-events-single-record-plan.md §3.3. The Wifi Events
# device used to carry a long record per event (short id + slot_count).
# Deleting one the hub still references makes the hub cascade the
# reference away silently, so every reference to a long record is moved
# onto its event's record first.


def _retarget(row: dict[str, Any], dev_key: str, cmd_key: str, device_id: int, slot_count: int) -> bool:
    try:
        dev = int(row[dev_key])
        cmd = int(row[cmd_key])
    except (KeyError, TypeError, ValueError):
        return False
    if dev != device_id or not (slot_count < cmd <= 2 * slot_count):
        return False
    row[cmd_key] = cmd - slot_count
    return True


def retarget_long_record_refs(
    activity: Mapping[str, Any],
    *,
    device_id: int,
    slot_count: int,
) -> tuple[dict[str, Any], bool]:
    """Copy of one activity entry with every reference to a long record of
    *device_id* (``slot_count < id <= 2 * slot_count``) moved to its short
    record (``id - slot_count``). Returns ``(edited, changed)``.

    Written over every reference site (favorites, both binding legs, macro
    steps), although the card only ever bound long records as a binding's
    long leg: the Sofabaton app may have used them anywhere.
    """

    edited = deepcopy(dict(activity))
    changed = False
    for fav in edited.get("favorite_slots") or []:
        if isinstance(fav, dict):
            changed |= _retarget(fav, "device_id", "command_id", device_id, slot_count)
    for binding in edited.get("button_bindings") or []:
        if isinstance(binding, dict):
            changed |= _retarget(binding, "device_id", "command_id", device_id, slot_count)
            changed |= _retarget(
                binding, "long_press_device_id", "long_press_command_id", device_id, slot_count
            )
    for macro in edited.get("macros") or []:
        if not isinstance(macro, dict):
            continue
        for step in macro.get("steps") or []:
            if isinstance(step, dict):
                changed |= _retarget(step, "device_id", "command_id", device_id, slot_count)
    return edited, changed


def wifi_events_retarget_steps(
    activity_entries: Sequence[Mapping[str, Any]],
    *,
    device_id: int,
    slot_count: int,
) -> tuple[SyncStep, ...]:
    """The activity writes that move long-record references onto their
    events' records, for every activity in *activity_entries* (live
    ``backup_activity`` reads). Empty when nothing references a long record.

    Each activity is diffed by the activity sync planner against its own
    retargeted copy, so the writes are exactly the ones the live activity
    editor would issue. The per-activity remote sync is dropped: the caller
    resyncs the remote once at the end of its batch. Raises ``ValueError``
    when an activity cannot be planned; the caller must then write nothing.
    """

    steps: list[SyncStep] = []
    for entry in activity_entries:
        if not isinstance(entry, Mapping):
            continue
        edited, changed = retarget_long_record_refs(
            entry, device_id=device_id, slot_count=slot_count
        )
        if not changed:
            continue
        activity_id = int((entry.get("device") or {}).get("device_id") or 0)
        plan = build_activity_sync_plan(
            {"activities": [dict(entry)], "devices": []},
            {"activities": [edited], "devices": []},
            activity_id,
        )
        steps.extend(step for step in plan if step.kind != "remote_sync")
    return tuple(steps)


# ── Moving references onto a replacement device ─────────────────────────
#
# docs/internal/wifi-events-transport-plan.md §4. A transport switch (and
# any other replace of a managed Wifi Device) creates the new device and
# deletes the old one; the hub cascades every reference to the deleted
# device away. The command ids are fixed by the layout, so moving each
# reference from the old device id to the new one, before the delete,
# keeps favorites, bindings and macro steps that the slot config never
# knew about (the activity editor made them).


def _int(value: Any) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def _ref_on(row: Mapping[str, Any], dev_key: str, device_id: int) -> bool:
    return _int(row.get(dev_key)) == int(device_id)


def _retarget_device(
    row: dict[str, Any],
    dev_key: str,
    cmd_key: str,
    *,
    old_device_id: int,
    new_device_id: int,
    fold_long_ids_at: int | None,
) -> bool:
    try:
        dev = int(row[dev_key])
        cmd = int(row[cmd_key])
    except (KeyError, TypeError, ValueError):
        return False
    if dev != old_device_id:
        return False
    row[dev_key] = new_device_id
    if fold_long_ids_at is not None and fold_long_ids_at < cmd <= 2 * fold_long_ids_at:
        # Wifi Events: a long record of the pre-single-record layout has no
        # counterpart on the new device; its event's record does.
        row[cmd_key] = cmd - fold_long_ids_at
    return True


#: The rows that make a device a member of an activity: its power-on,
#: power-off and input reference steps in the power macros. The hub
#: cascades a device's favorites and bindings away the moment it loses
#: its last power reference (activity-sync bench 2026-07-11, and bench_311
#: 2026-10-06 where that cascade ran ahead of the favorite deletes).
_MEMBERSHIP_REF_COMMANDS = frozenset(
    {DEVICE_INPUT_REF_COMMAND, DEVICE_POWER_ON_REF_COMMAND, DEVICE_POWER_OFF_REF_COMMAND}
)


def _step_key(step: Mapping[str, Any]) -> tuple[int, int]:
    return (int(step.get("device_id") or 0), int(step.get("command_id") or 0))


def retarget_device_refs(
    activity: Mapping[str, Any],
    *,
    old_device_id: int,
    new_device_id: int,
    fold_long_ids_at: int | None = None,
    membership: str = "move",
    keep_favorites: Collection[int] = (),
    keep_bindings: Collection[int] = (),
) -> tuple[dict[str, Any], bool]:
    """Copy of one activity entry with every reference to *old_device_id*
    moved onto *new_device_id* at the same command id. Returns
    ``(edited, changed)``.

    Same four reference sites as :func:`retarget_long_record_refs`
    (favorites, both binding legs, macro steps). ``fold_long_ids_at`` is
    the Wifi Events slot count: a reference to a long record of the old
    layout (``N < id <= 2N``) lands on the event's record (``id - N``).

    ``membership`` decides what happens to the old device's membership
    rows in the power macros (:data:`_MEMBERSHIP_REF_COMMANDS`):

    * ``"keep"``: they stay as they are. This is the form to WRITE while
      the old device still exists: moving its last power reference makes
      the hub drop the device from the activity, favorites and bindings
      included, before the favorite writes reach it.
    * ``"move"``: they move like every other row, and the copies that
      add_device_to_activity appended for the new device are dropped, so
      the new device takes the old one's position in the sequences. This
      is the DESIRED shape, written once the old device is gone.

    ``keep_favorites`` (command ids) and ``keep_bindings`` (button ids) are
    references left on the old device: the delete cascades them away. A
    replace leaves there what the last deploy made and the slot config no
    longer wants (:func:`replace_ref_dispositions`).
    """

    edited = deepcopy(dict(activity))
    kept_favorites = {int(c) for c in keep_favorites}
    kept_bindings = {int(b) for b in keep_bindings}
    changed = False
    old_id = int(old_device_id)
    kwargs = {
        "old_device_id": old_id,
        "new_device_id": int(new_device_id),
        "fold_long_ids_at": fold_long_ids_at,
    }
    for fav in edited.get("favorite_slots") or []:
        if isinstance(fav, dict):
            if _ref_on(fav, "device_id", old_id) and _int(fav.get("command_id")) in kept_favorites:
                continue
            changed |= _retarget_device(fav, "device_id", "command_id", **kwargs)
    for binding in edited.get("button_bindings") or []:
        if isinstance(binding, dict):
            if _int(binding.get("button_id")) in kept_bindings:
                continue
            changed |= _retarget_device(binding, "device_id", "command_id", **kwargs)
            changed |= _retarget_device(
                binding, "long_press_device_id", "long_press_command_id", **kwargs
            )
    for macro in edited.get("macros") or []:
        if not isinstance(macro, dict):
            continue
        steps = [step for step in macro.get("steps") or [] if isinstance(step, dict)]
        moved: set[int] = set()
        for step in steps:
            key = _step_key(step)
            if membership == "keep" and key[0] == old_id and key[1] in _MEMBERSHIP_REF_COMMANDS:
                continue
            if _retarget_device(step, "device_id", "command_id", **kwargs):
                moved.add(id(step))
        if not moved or membership != "move":
            continue
        moved_keys = {_step_key(step) for step in steps if id(step) in moved}
        kept: list[dict[str, Any]] = []
        for step in steps:
            key = _step_key(step)
            if id(step) not in moved and key in moved_keys and key[1] in _MEMBERSHIP_REF_COMMANDS:
                changed = True
                continue
            kept.append(step)
        macro["steps"] = kept
    return edited, changed


def _quick_access_order_step(activity_id: int, edited: Mapping[str, Any]) -> SyncStep:
    """A ``favorite_order`` step writing the WHOLE quick-access table of
    *edited* (favorites by content, macro shortcuts by key id) in its
    ``favorites_order`` rank, as the activity planner would."""

    rank = _quick_access_rank(edited)
    entries: list[tuple[int, dict[str, Any]]] = []
    for row in edited.get("favorite_slots") or []:
        if not isinstance(row, Mapping):
            continue
        entries.append((
            int(row.get("button_id") or 0),
            {"kind": "favorite", "device_id": int(row.get("device_id") or 0), "command_id": int(row.get("command_id") or 0)},
        ))
    for row in _editable_macro_rows(edited):
        bid = int(row.get("button_id") or 0)
        entries.append((bid, {"kind": "macro", "button_id": bid}))
    entries.sort(key=lambda item: _quick_access_sort_key(item[0], rank))
    return SyncStep(
        kind="favorite_order",
        label="Reordering shortcuts…",
        payload={"activity_id": activity_id, "order": [token for _bid, token in entries]},
    )


def _activity_plan_steps(entry: Mapping[str, Any], edited: Mapping[str, Any]) -> list[SyncStep]:
    activity_id = int((entry.get("device") or {}).get("device_id") or 0)
    plan = build_activity_sync_plan(
        {"activities": [dict(entry)], "devices": []},
        {"activities": [dict(edited)], "devices": []},
        activity_id,
    )
    # Membership is the caller's: the replacement joined the activity
    # before this read, and the planner derives members from references,
    # so a device it sees referenced for the first time would get a
    # redundant add_device_to_activity replay here.
    steps = [step for step in plan if step.kind not in ("remote_sync", "member_replay")]
    # A moved favorite is a delete plus an add, and each add stages a sort
    # page that names only the favorites added so far: entries of other
    # devices drop out of the order table (bench_312, X2, 2026-10-06). The
    # planner writes the order only when the natural order differs, so a
    # retarget always closes its favorite moves with the whole table.
    kinds = {step.kind for step in steps}
    if ("favorite_add" in kinds or "favorite_delete" in kinds) and "favorite_order" not in kinds:
        steps.append(_quick_access_order_step(activity_id, edited))
    return steps


def wifi_device_retarget_steps(
    activity_entries: Sequence[Mapping[str, Any]],
    *,
    old_device_id: int,
    new_device_id: int,
    fold_long_ids_at: int | None = None,
    membership: str = "keep",
    keep: Mapping[int, tuple[Collection[int], Collection[int]]] | None = None,
) -> tuple[SyncStep, ...]:
    """The activity writes that move every reference to *old_device_id*
    onto *new_device_id*, for every activity in *activity_entries* (live
    ``backup_activity`` reads taken AFTER the new device joined them).
    Empty when nothing references the old device.

    Each activity is diffed by the activity sync planner against its own
    retargeted copy, so the writes are exactly the ones the live activity
    editor would issue. The per-activity remote sync is dropped: the caller
    resyncs the remote once at the end of its batch. Raises ``ValueError``
    when an activity cannot be planned; the caller must then write nothing.
    The default keeps the old device's membership rows (see
    :func:`retarget_device_refs`); the sequence positions are restored by
    :func:`wifi_membership_order_steps` after the delete. ``keep`` maps an
    activity id to the ``(favorite command ids, binding button ids)`` left
    on the old device there.
    """

    steps: list[SyncStep] = []
    for entry in activity_entries:
        if not isinstance(entry, Mapping):
            continue
        kept_favorites, kept_bindings = (keep or {}).get(
            _int((entry.get("device") or {}).get("device_id")), ((), ())
        )
        edited, changed = retarget_device_refs(
            entry,
            old_device_id=old_device_id,
            new_device_id=new_device_id,
            fold_long_ids_at=fold_long_ids_at,
            membership=membership,
            keep_favorites=kept_favorites,
            keep_bindings=kept_bindings,
        )
        if not changed:
            continue
        steps.extend(_activity_plan_steps(entry, edited))
    return tuple(steps)


@dataclass(frozen=True)
class ReplaceRefDispositions:
    """What a replace does with each reference to the old device.

    ``keep`` maps an activity id to ``(favorite command ids, binding button
    ids)`` left on the old device, for its delete to cascade away.
    ``carried_favorites`` ``(activity, command id)`` and ``carried_bindings``
    ``(activity, button id)`` are moved references that already are what the
    slot config writes, so the config's own write is skipped for them (a
    favorite add would append a second copy). Every other moved reference
    is foreign to the slot config, and its write, where it has one, runs.
    """

    keep: Mapping[int, tuple[frozenset[int], frozenset[int]]]
    carried_favorites: frozenset[tuple[int, int]]
    carried_bindings: frozenset[tuple[int, int]]


def replace_ref_dispositions(
    activity_entries: Sequence[Mapping[str, Any]],
    *,
    old_device_id: int,
    owned: ManagedWifiSnapshot | None,
    desired: ManagedWifiSnapshot,
) -> ReplaceRefDispositions:
    """Sort the old device's favorites and bindings for a replace.

    *owned* is the last deploy's expansion (the deployed snapshot through
    :func:`desired_snapshot_from_config`, ``None`` when there is none) and
    *desired* the slot config's. The in-place path's ownership rule
    applies: only references the last deploy made may be planned away;
    references made in the activity editor or the Sofabaton app always move.

    * A favorite the last deploy made and the config no longer wants is
      kept (dropped with the old device). One the config wants is carried.
    * A binding that already is the config's (same command, and the long
      press the config sets, or none it owns) is carried. A binding at a
      button the config writes differently is kept: the config's write
      replaces it. A binding the last deploy made at a button the config
      no longer binds is kept. Everything else moves as it is.
    """

    old_id = int(old_device_id)
    keep: dict[int, tuple[frozenset[int], frozenset[int]]] = {}
    carried_favorites: set[tuple[int, int]] = set()
    carried_bindings: set[tuple[int, int]] = set()
    for entry in activity_entries:
        if not isinstance(entry, Mapping):
            continue
        act_id = _int((entry.get("device") or {}).get("device_id"))
        owned_refs = owned.activities.get(act_id) if owned is not None else None
        desired_refs = desired.activities.get(act_id)
        owned_favs = set(owned_refs.favorites) if owned_refs else set()
        desired_favs = set(desired_refs.favorites) if desired_refs else set()
        owned_binds = {b[0]: b for b in owned_refs.bindings} if owned_refs else {}
        desired_binds = {b[0]: b for b in desired_refs.bindings} if desired_refs else {}
        keep_favs: set[int] = set()
        keep_buttons: set[int] = set()

        for fav in entry.get("favorite_slots") or []:
            if not isinstance(fav, Mapping) or not _ref_on(fav, "device_id", old_id):
                continue
            command_id = _int(fav.get("command_id"))
            if command_id in desired_favs:
                carried_favorites.add((act_id, command_id))
            elif command_id in owned_favs:
                keep_favs.add(command_id)

        for row in entry.get("button_bindings") or []:
            if not isinstance(row, Mapping):
                continue
            short_on_old = _ref_on(row, "device_id", old_id)
            long_on_old = _ref_on(row, "long_press_device_id", old_id)
            if not (short_on_old or long_on_old):
                continue
            button_id = _int(row.get("button_id"))
            command_id = _int(row.get("command_id"))
            long_id = _int(row.get("long_press_command_id")) if _int(row.get("long_press_device_id")) else 0
            mine = owned_binds.get(button_id)
            short_owned = short_on_old and mine is not None and mine[1] == command_id
            long_owned = long_on_old and mine is not None and mine[2] is not None and mine[2] == long_id
            want = desired_binds.get(button_id)
            if want is not None:
                short_matches = short_on_old and want[1] == command_id
                if want[2] is None:
                    # No long press from the config: any it does not own may stay.
                    long_matches = not long_id or not long_owned
                else:
                    long_matches = long_on_old and long_id == want[2]
                if short_matches and long_matches:
                    carried_bindings.add((act_id, button_id))
                else:
                    keep_buttons.add(button_id)
            elif short_owned or long_owned:
                keep_buttons.add(button_id)

        if keep_favs or keep_buttons:
            keep[act_id] = (frozenset(keep_favs), frozenset(keep_buttons))
    return ReplaceRefDispositions(
        keep=keep,
        carried_favorites=frozenset(carried_favorites),
        carried_bindings=frozenset(carried_bindings),
    )


def wifi_membership_order_steps(
    pre_entries: Sequence[Mapping[str, Any]],
    post_entries: Sequence[Mapping[str, Any]],
    *,
    old_device_id: int,
    new_device_id: int,
    fold_long_ids_at: int | None = None,
) -> tuple[SyncStep, ...]:
    """The power-macro rewrites that put the new device where the old one
    stood in each activity's power sequences, planned against the reads
    taken AFTER the old device was deleted (*post_entries*).

    *pre_entries* are the reads from before the move (old device present);
    their macros, retargeted with ``membership="move"``, are the desired
    sequences. The hub's delete already removed the old device's rows, and
    add_device_to_activity appended the new device's rows at the end; this
    diff moves them up. Activities that are not in both reads are skipped,
    and so is a macro whose live step set differs from the desired one (a
    row the hub added or dropped since the pre-read is never written back
    from a stale copy).
    """

    desired_by_act: dict[int, dict[int, list[dict[str, Any]]]] = {}
    for entry in pre_entries:
        if not isinstance(entry, Mapping):
            continue
        edited, changed = retarget_device_refs(
            entry,
            old_device_id=old_device_id,
            new_device_id=new_device_id,
            fold_long_ids_at=fold_long_ids_at,
            membership="move",
        )
        if not changed:
            continue
        act_id = int((entry.get("device") or {}).get("device_id") or 0)
        desired_by_act[act_id] = {
            int(m.get("button_id") or 0): [dict(s) for s in m.get("steps") or [] if isinstance(s, dict)]
            for m in edited.get("macros") or []
            if isinstance(m, dict)
        }
    steps: list[SyncStep] = []
    for entry in post_entries:
        if not isinstance(entry, Mapping):
            continue
        act_id = int((entry.get("device") or {}).get("device_id") or 0)
        desired = desired_by_act.get(act_id)
        if desired is None:
            continue
        edited = deepcopy(dict(entry))
        new_macros: list[Any] = []
        for macro in edited.get("macros") or []:
            want = desired.get(int(macro.get("button_id") or 0)) if isinstance(macro, dict) else None
            if want is None:
                new_macros.append(macro)
                continue
            live_keys = sorted(_step_key(s) for s in macro.get("steps") or [] if isinstance(s, dict))
            if live_keys != sorted(_step_key(s) for s in want):
                new_macros.append(macro)
                continue
            new_macros.append({**macro, "steps": want})
        edited["macros"] = new_macros
        steps.extend(_activity_plan_steps(entry, edited))
    return tuple(steps)


# ── Re-adding a missing command record ──────────────────────────────────
#
# A full-table deploy only adds a record the hub no longer has: one a
# device-editor sync or a Wifi Event delete removed. The generic
# ``command_add`` step writes record bytes from ``restore_data``; a
# managed Wifi record is a sibling's record with its own callback, so the
# bytes are a sibling's decoded block with the callback path swapped.


def clone_wifi_record_for_add(
    template: Mapping[str, Any],
    *,
    template_tail: str,
    new_tail: str,
    command_id: int,
) -> dict[str, Any] | None:
    """A ``command_add`` ``restore_data`` cloned from a sibling record.

    *template* is the sibling's decoded block (``decoded`` of a blob
    fetch). Path-bearing classes (``wifi_ip``, ``wifi_roku``) must end in
    *template_tail*, the sibling's own launch path, which is replaced by
    *new_tail*. A ``wifi_mqtt`` body is inert (the hub publishes its own
    ids), so only its nominal command id follows. Returns ``None`` when the
    template does not have the expected shape: the caller then writes
    nothing rather than a record with someone else's callback.
    """

    decoded = deepcopy(dict(template))
    fields = decoded.get("fields")
    if not isinstance(fields, dict):
        return None
    if "path" in fields:
        path = str(fields.get("path") or "")
        if not template_tail or not path.endswith(template_tail):
            return None
        fields["path"] = path[: len(path) - len(template_tail)] + new_tail
    elif "command_id" in fields:
        fields["command_id"] = int(command_id) & 0xFF
    else:
        return None
    decoded["edited"] = True
    return {"decoded": decoded}
