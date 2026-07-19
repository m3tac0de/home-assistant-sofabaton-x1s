"""Power-macro row coverage, retargeted from the withdrawn direct-write
services onto the reused sync engine.

Branch history: an earlier iteration of this work (PR #262) added two
dedicated services, ``set_device_power_binding`` and ``set_power_macro``,
that called ``build_macro_save_payload`` directly and sent it as a single
``execute_exchange`` frame. The maintainer's review kept the test file's
intent but not its target: that direct-write path regresses three
behaviors the live Control Panel editor's sync engine already has to get
right —

1. macro saves above 18 rows need the paged write (``_send_paged_macro_save``);
   a single-frame send delivers only page 1 of a payload whose own header
   declares two,
2. activity-scope saves must reuse the hub's ``raw_label_slot`` bytes or a
   freshly built slot can be rejected with status ``0x0c``,
3. the final ``0x0112`` ack does not always echo the button id, so a strict
   first-byte match can report failure on a write that actually succeeded.

This branch drops the two dedicated services and exposes the editor's own
engine instead (``sync_from_snapshot`` / ``export_snapshot`` — see
``tests/test_sync_from_snapshot_service.py``), so paging, label-slot reuse,
and ack tolerance come along for free rather than needing to be
reimplemented and re-guarded against regressing.

What survives here from the withdrawn test file:

* the frame-level ``build_macro_save_payload`` shape assertions — ported
  as direct builder tests (no proxy, no service, no ``execute_exchange``
  stub) instead of assertions about what a service handler happened to
  call the builder with,
* the row-count boundary from review point #1 above, encoded as a direct
  regression test of ``build_macro_save_payload``'s own ``total_pages``
  math,
* one sync-engine-level test proving an activity-scope power macro that
  crosses that boundary produces a payload the engine's own
  ``_send_paged_macro_save`` will page correctly (see
  ``tests/test_x1_proxy.py`` for proof that function then walks every
  declared page and tolerates the ack).

What does not survive (no equivalent needed):

* "skips the omitted row" / "rejects X1" / "no-op when client connected" —
  these guarded the withdrawn methods' own bespoke preconditions. The
  reused engine's equivalent protections are structural, not per-method:
  an omitted row is simply an unedited macro (no diff, no step — see
  ``test_noop_returns_success_without_writes`` in
  ``tests/test_activity_sync_exec.py``); "unavailable" is a single shared
  gate in ``sync_activity``/``sync_device``
  (``test_unavailable_when_cannot_issue_commands``); the engine does not
  special-case X1 at all (device-scope power rows there go through the
  OP_3212 device-create builder, not ``build_macro_save_payload``, on
  every hub version alike — see
  ``test_device_macro_write_uses_the_single_page_device_builder``).
* input-validation ValueErrors for a bespoke ``steps``/``button`` shape —
  the sync engine takes a full ``hub_bundle`` diff instead of an ad hoc
  step list, so the equivalent protection lives in bundle validation
  (e.g. ``_missing_shutdown_row`` in ``tests/test_activity_sync_ws.py``,
  which rejects an edit that empties a power macro's steps entirely).
"""

from __future__ import annotations

import copy

from custom_components.sofabaton_x1s.const import HUB_VERSION_X1, HUB_VERSION_X1S
from custom_components.sofabaton_x1s.lib.macros import MacroKeyEntry, build_macro_save_payload
from custom_components.sofabaton_x1s.lib.protocol_const import ButtonName

from tests.test_activity_sync_exec import FakeProxy
from tests.test_activity_sync_plan import ACTIVITY_ID, _activity, base_bundle

# ---------------------------------------------------------------------------
# build_macro_save_payload: byte shape (ported from the withdrawn services'
# execute_exchange-capture assertions)
# ---------------------------------------------------------------------------


def test_build_macro_save_payload_matches_device_power_binding_row_shape() -> None:
    """Shape a device's POWER_ON/POWER_OFF row write used to assert via the
    withdrawn ``set_device_power_binding`` proxy method: outer marker, a
    single page declared, entity id, button id, and a one-entry key
    sequence naming the bound command."""

    for button_id, command_id, label in (
        (ButtonName.POWER_ON, 25, "POWER_ON"),
        (ButtonName.POWER_OFF, 26, "POWER_OFF"),
    ):
        payload = build_macro_save_payload(
            activity_id=5,
            key_id=button_id,
            key_sequence=[
                MacroKeyEntry(device_id=5, key_id=command_id, fid=0, duration=0, delay=0)
            ],
            label=label,
            hub_version=HUB_VERSION_X1S,
        )
        # outer [0x01][seq_be16] + body [0x01][pages_be16][ent][key][count]
        assert payload[0] == 0x01
        assert payload[3] == 0x01
        assert payload[4:6] == b"\x00\x01"  # single page
        assert payload[6] == 5
        assert payload[7] == button_id
        assert payload[8] == 1
        row = payload[9:19]
        assert row[0] == 5  # device_id
        assert row[1] == command_id  # key_id (bound command)


def test_build_macro_save_payload_matches_activity_power_macro_row_shape() -> None:
    """Shape an activity-scope multi-device power macro used to assert via
    the withdrawn ``set_power_macro`` proxy method: one entry per step, in
    the order supplied."""

    steps = [
        {"device_id": 1, "command_id": 198, "duration": 0, "delay": 0},
        {"device_id": 2, "command_id": 198, "duration": 0, "delay": 0},
        {"device_id": 1, "command_id": 197, "duration": 2, "delay": 0},
        {"device_id": 2, "command_id": 197, "duration": 0, "delay": 0},
    ]
    payload = build_macro_save_payload(
        activity_id=101,
        key_id=ButtonName.POWER_ON,
        key_sequence=[
            MacroKeyEntry(
                device_id=s["device_id"],
                key_id=s["command_id"],
                fid=0,
                duration=s["duration"],
                delay=s["delay"],
            )
            for s in steps
        ],
        label="",
        hub_version=HUB_VERSION_X1S,
    )
    assert payload[6] == 101
    assert payload[7] == ButtonName.POWER_ON
    assert payload[8] == len(steps)
    for index, step in enumerate(steps):
        row = payload[9 + index * 10 : 19 + index * 10]
        assert row[0] == step["device_id"]
        assert row[1] == step["command_id"]
        assert row[8] == step["duration"]


# ---------------------------------------------------------------------------
# build_macro_save_payload: total_pages boundary (maintainer review point #1)
# ---------------------------------------------------------------------------


def _n_step_power_on_payload(n: int, *, hub_version: str = HUB_VERSION_X1S) -> bytes:
    return build_macro_save_payload(
        activity_id=101,
        key_id=ButtonName.POWER_ON,
        key_sequence=[
            MacroKeyEntry(device_id=(i % 255) + 1, key_id=0xC6, fid=0, duration=0, delay=0xFF)
            for i in range(n)
        ],
        label="POWER_ON",
        hub_version=hub_version,
    )


def test_build_macro_save_payload_stays_single_page_at_eighteen_rows() -> None:
    payload = _n_step_power_on_payload(18)
    assert payload[4:6] == b"\x00\x01"


def test_build_macro_save_payload_declares_two_pages_at_nineteen_rows() -> None:
    """The maintainer's review point #1, as a direct regression test: a
    macro save above 18 rows needs the paged write. ``build_macro_save_payload``
    itself gets this right — it declares ``total_pages`` from the actual
    body length — so the boundary sits exactly where the review said it
    would. What the withdrawn services got wrong was downstream of this:
    they handed this payload to a single ``execute_exchange`` frame instead
    of ``_send_paged_macro_save``, so a 19+ step macro announced two pages
    and delivered one. See
    ``test_engine_macro_write_pages_a_nineteen_step_power_macro`` below and
    ``tests/test_x1_proxy.py::test_build_paged_macro_save_payloads_matches_multiframe_shape``
    / ``test_send_paged_macro_save_waits_for_each_chunk_ack`` for proof the
    reused engine's sender does not repeat that mistake."""

    payload = _n_step_power_on_payload(19)
    assert payload[4:6] == b"\x00\x02"


def test_build_macro_save_payload_page_boundary_holds_on_x1_too() -> None:
    """X1's shorter (30-byte, vs. 60-byte on X1S/X2) label slot moves the
    exact row count where the boundary sits (21/22 rather than 18/19) but
    not the existence of a boundary — confirms it is a property of the
    row count against the 247-byte page chunk on every hub version, not a
    X1S/X2-only concern (the withdrawn ``set_power_macro``/
    ``set_device_power_binding`` refused to run on X1 at all; the builder
    itself never had that restriction)."""

    below = _n_step_power_on_payload(21, hub_version=HUB_VERSION_X1)
    above = _n_step_power_on_payload(22, hub_version=HUB_VERSION_X1)
    assert below[4:6] == b"\x00\x01"
    assert above[4:6] == b"\x00\x02"


# ---------------------------------------------------------------------------
# sync engine macro-save step: the reused engine pages a large power macro
# ---------------------------------------------------------------------------


def test_engine_macro_write_pages_a_nineteen_step_power_macro() -> None:
    """``ActivitySyncMixin.sync_activity``'s macro_write step hands
    ``_send_paged_macro_save`` a payload built the same way the builder
    tests above verify — so a power macro that grows past the 18-row
    boundary during an edit is paged correctly by construction, without
    the sync engine needing any special casing for macro size."""

    base = base_bundle()
    edited = copy.deepcopy(base)
    _activity(edited)["macros"][0]["steps"] = [
        {"device_id": (i % 255) + 1, "command_id": 0xC6, "button_code": 0, "duration": 0, "delay": 255}
        for i in range(19)
    ]
    proxy = FakeProxy(fresh_activity=_activity(base))

    result = proxy.sync_activity(baseline=base, edited=edited, activity_id=ACTIVITY_ID)

    assert result["status"] == "success"
    macro_call = next(c for c in proxy.calls if c[0] == "macro_write")
    button_id, payload = macro_call[1]
    assert button_id == 198  # POWER_ON
    assert payload[4:6] == b"\x00\x02"
    assert payload[8] == 19
