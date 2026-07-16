"""Chunk 1 — quick-access macro-reorder protocol probe.

Plan: docs/internal/macro-reorder-bench-plan.md (chunk 1).

Answers, on a live hub, the protocol questions the unit tests cannot:
  Q1  Does the hub accept a family-0x61 sort page that MIXES a macro key id
      with favorite fav_ids, written by us?
  Q2  Does 0x61 renumber key ids to slot positions, or keep ids stable with
      a separate slot table? (Gates a possible follow-up fix.)
  Q3  Is a single-entry 0x61 page accepted?
  P4  User visual check: does the remote/app show the new order?

Fixture (built on Bench Test 0x68, torn down at the end):
  - 2 command favorites (sourced from the POWER_ON / POWER_OFF macro steps,
    which reference real member-device commands)
  - 1 user macro at a free key id (created via the engine's own sync path)

Every write is restored: favorites deleted, user macro deleted, final
backup diffed against the chunk-start capture. Nothing but Bench Test is
touched.

Usage:
    bench_108_macro_order_probe.py <ip> <X1|X1S|X2> <tag> [act_id=0x68]

P4 pause: after the P1 mixed write the script blocks until a marker file
    out/GO-<tag>
appears (or 900 s elapse). Look at the physical remote / app, confirm the
new order, then create that file to continue.
"""

from __future__ import annotations

import copy
import sys
import time

from bench_common import BENCH_DIR, connect, save_json, setup_logging

HOST = sys.argv[1]
HUB_VERSION = sys.argv[2]
TAG = sys.argv[3]
ACT_ID = int(sys.argv[4], 0) if len(sys.argv) > 4 else 0x68

POWER_ON = 198
POWER_OFF = 199
USER_MACRO_NAME = "Bench RO Macro"

log_path = setup_logging(f"macro-order-{TAG}")
print(f"frame log: {log_path}")

art: dict[str, object] = {}


def _progress(**payload):
    print(
        f"      [{payload.get('phase')}] {payload.get('message')} "
        f"({payload.get('completed_steps')}/{payload.get('total_steps')})"
    )


def _steps_tuple(steps):
    return [
        (
            int(s.get("device_id", 0)),
            int(s.get("command_id", 0)),
            int(s.get("button_code", 0)),
            int(s.get("duration", 0)),
            int(s.get("delay", 0)),
        )
        for s in (steps or [])
    ]


def _macro_record_ids(proxy):
    """key_id -> label for cached macro records (includes POWER_*)."""
    return {
        r.key_id & 0xFF: r.label for r in proxy.get_cached_macro_records(ACT_ID)
    }


def _macro_record_slots(proxy):
    """key_id -> raw label-slot hex (byte-identity check)."""
    return {
        r.key_id & 0xFF: r.raw_label_slot.hex()
        for r in proxy.get_cached_macro_records(ACT_ID)
    }


def _fav_slots(payload):
    """(fav_id, dev, cmd) tuples from a backup payload's favorite_slots."""
    return [
        (int(r.get("button_id", 0)), int(r.get("device_id", 0)), int(r.get("command_id", 0)))
        for r in (payload or {}).get("favorite_slots") or []
    ]


def _user_macros(payload):
    """button_id -> (name, steps) for NON-power macros in a backup payload."""
    out = {}
    for r in (payload or {}).get("macros") or []:
        bid = int(r.get("button_id", 0))
        if bid in (POWER_ON, POWER_OFF):
            continue
        out[bid] = {"name": r.get("name"), "steps": _steps_tuple(r.get("steps"))}
    return out


def capture(label: str) -> dict:
    payload = proxy.backup_activity(ACT_ID)
    if not isinstance(payload, dict):
        raise SystemExit(f"[{label}] backup_activity failed")
    order = proxy.request_favorites_order(ACT_ID)
    snap = {
        "favorite_slots": _fav_slots(payload),
        "favorites_order": order,
        "macro_record_ids": _macro_record_ids(proxy),
        "macro_record_slots": _macro_record_slots(proxy),
        "user_macros": _user_macros(payload),
        "state_macros": proxy.state.get_activity_macros(ACT_ID),
    }
    art[f"snap-{label}"] = snap
    print(f"  [{label}] favs(fav_id,dev,cmd)={snap['favorite_slots']}")
    print(f"  [{label}] 0x0162 order(fav_id,slot)={order}")
    print(f"  [{label}] macro records(key->label)={snap['macro_record_ids']}")
    print(f"  [{label}] user macros(key->name)="
          f"{ {k: v['name'] for k, v in snap['user_macros'].items()} }")
    return payload


def bundle(payload):
    return {"devices": [], "activities": [copy.deepcopy(payload)]}


def sync(name, baseline_payload, edited_payload):
    print(f"  sync[{name}] ...")
    result = proxy.sync_activity(
        baseline=bundle(baseline_payload),
        edited=bundle(edited_payload),
        activity_id=ACT_ID,
        progress_callback=_progress,
    )
    print(f"  sync[{name}] result={result}")
    art[f"sync-{name}"] = result
    if result.get("status") != "success":
        save_json(f"macro-order-{TAG}", art)
        raise SystemExit(f"sync {name} failed: {result}")


def check(label, ok, detail):
    print(f"  CHECK[{label}]: {'OK' if ok else 'FAIL'} — {detail}")
    art[f"check-{label}"] = {"ok": bool(ok), "detail": detail}


proxy = connect(HOST, HUB_VERSION)
created_fav_srcs: list[tuple[int, int]] = []
created_macro_key: int | None = None
made_macro = False
try:
    # ── Baseline capture (restore point) ────────────────────────────────
    baseline_payload = capture("baseline")
    base_user_macros = _user_macros(baseline_payload)
    base_fav_srcs = {(d, c) for _f, d, c in _fav_slots(baseline_payload)}
    if base_user_macros or _fav_slots(baseline_payload):
        # Leftover from an aborted prior run — surface loudly and proceed to
        # build on top; cleanup at the end removes everything we know we made.
        print("  NOTE: Bench Test already has favorites/user-macros before setup:")
        print("        favs=", _fav_slots(baseline_payload), " macros=", base_user_macros)

    # Source commands for the two favorites come from the power macros' steps
    # (guaranteed-valid member-device commands).
    on_row = next((m for m in baseline_payload.get("macros") or []
                   if int(m.get("button_id", 0)) == POWER_ON), None)
    off_row = next((m for m in baseline_payload.get("macros") or []
                    if int(m.get("button_id", 0)) == POWER_OFF), None)
    if not on_row or not off_row:
        raise SystemExit("expected POWER_ON/POWER_OFF macros on Bench Test")
    on_step = (_steps_tuple(on_row.get("steps")) or [None])[0]
    off_step = (_steps_tuple(off_row.get("steps")) or [None])[0]
    if not on_step or not off_step:
        raise SystemExit("power macros have no steps to source favorites from")
    fav1_src = (on_step[0], on_step[1])    # (device_id, command_id)
    fav2_src = (off_step[0], off_step[1])
    if fav1_src == fav2_src:
        raise SystemExit(f"power-on/off steps collide {fav1_src}; can't make 2 distinct favs")
    print(f"  favorite sources: fav1={fav1_src} fav2={fav2_src}")

    # ── Fixture: 2 favorites (direct engine op) ─────────────────────────
    for src in (fav1_src, fav2_src):
        already = any((d, c) == src for _fid, d, c in _fav_slots(proxy.backup_activity(ACT_ID)))
        if already:
            print(f"  favorite {src} already present; skipping create")
            continue
        r = proxy.command_to_favorite(ACT_ID, src[0], src[1])
        print(f"  command_to_favorite{src} -> {r}")
        if not r:
            raise SystemExit(f"command_to_favorite{src} failed")
        created_fav_srcs.append(src)
        time.sleep(1.0)

    fixt_after_favs = proxy.backup_activity(ACT_ID)
    fav_rows = _fav_slots(fixt_after_favs)
    fav_ids = {}
    for fid, d, c in fav_rows:
        if (d, c) == fav1_src:
            fav_ids["fav1"] = fid
        elif (d, c) == fav2_src:
            fav_ids["fav2"] = fid
    if "fav1" not in fav_ids or "fav2" not in fav_ids:
        raise SystemExit(f"could not resolve fav ids from {fav_rows}")
    print(f"  hub-assigned fav ids: {fav_ids}")

    # ── Fixture: 1 user macro via the engine's sync path ────────────────
    if base_user_macros:
        created_macro_key = sorted(base_user_macros)[0]
        print(f"  reusing existing user macro at key {created_macro_key}")
    else:
        # Free key id: avoid power macros + favorite ids.
        used = {POWER_ON, POWER_OFF} | {fid for fid, _d, _c in fav_rows}
        proposed = next(k for k in range(1, 200) if k not in used)
        edited = copy.deepcopy(fixt_after_favs)
        edited["macros"] = list(edited.get("macros") or []) + [{
            "button_id": proposed,
            "name": USER_MACRO_NAME,
            "steps": [
                {"device_id": on_step[0], "command_id": on_step[1],
                 "button_code": on_step[2], "duration": on_step[3], "delay": on_step[4]},
                {"device_id": off_step[0], "command_id": off_step[1],
                 "button_code": off_step[2], "duration": off_step[3], "delay": off_step[4]},
            ],
        }]
        sync("create-user-macro", fixt_after_favs, edited)
        after = proxy.backup_activity(ACT_ID)
        landed = _user_macros(after)
        if not landed:
            raise SystemExit("user macro did not land")
        created_macro_key = sorted(landed)[0]
        made_macro = True
        print(f"  user macro landed at key {created_macro_key} (proposed {proposed})")

    # ── Probe ───────────────────────────────────────────────────────────
    before = capture("before-probe")
    macro_key = created_macro_key
    fav1_id = fav_ids["fav1"]
    fav2_id = fav_ids["fav2"]
    requested = [macro_key, fav1_id, fav2_id]  # macro first (tail->head style)
    print(f"  P1 requested mixed order (macro,fav1,fav2) = {requested}")

    # P1 (Q1): mixed 0x61 page written by us.
    res = proxy.reorder_favorites(ACT_ID, requested)
    print(f"  P1 reorder_favorites -> {res}")
    art["P1-result"] = res
    check("P1-ack", bool(res) and res.get("status") == "success",
          f"reorder_favorites returned {res}")

    after1 = capture("after-P1")
    order1 = after1  # snap already stored
    read_order = art["snap-after-P1"]["favorites_order"] or []
    # Expected: three entries, macro at slot 1, favorites at 2/3.
    slot_by_id = {fid: slot for fid, slot in read_order}
    check("P1-macro-in-order", macro_key in slot_by_id,
          f"macro key {macro_key} in 0x0162 order? order={read_order}")
    check("P1-slot-1-macro", slot_by_id.get(macro_key) == 1,
          f"macro key {macro_key} slot={slot_by_id.get(macro_key)} (want 1)")
    check("P1-three-entries", len(read_order) >= 3,
          f"order has {len(read_order)} entries: {read_order}")

    # P2 (Q2): renumber vs slot-table. Compare ids before/after a
    # non-identity reorder.
    before_macro_ids = set(art["snap-before-probe"]["macro_record_ids"])
    after_macro_ids = set(art["snap-after-P1"]["macro_record_ids"])
    macro_key_stable = macro_key in after_macro_ids
    fav_rows_after = art["snap-after-P1"]["favorite_slots"]
    fav_ids_after = {(_d, _c): _fid for _fid, _d, _c in fav_rows_after}
    fav1_stable = fav_ids_after.get(fav1_src) == fav1_id
    fav2_stable = fav_ids_after.get(fav2_src) == fav2_id
    # The order read-back ids: do they equal the requested ids (stable) or
    # were they rewritten to 1..N slot positions (renumber)?
    order_ids = [fid for fid, _slot in read_order]
    renumbered_to_slots = sorted(order_ids) == list(range(1, len(order_ids) + 1)) \
        and set(order_ids) != set(requested)
    q2 = {
        "macro_key_before": sorted(before_macro_ids),
        "macro_key_after": sorted(after_macro_ids),
        "macro_key_stable": macro_key_stable,
        "fav_ids_before": {"fav1": fav1_id, "fav2": fav2_id},
        "fav_ids_after": {"fav1": fav_ids_after.get(fav1_src),
                          "fav2": fav_ids_after.get(fav2_src)},
        "fav_ids_stable": bool(fav1_stable and fav2_stable),
        "order_ids_readback": order_ids,
        "requested_ids": requested,
        "looks_renumbered": bool(renumbered_to_slots),
    }
    art["Q2"] = q2
    verdict = ("SLOT-TABLE (ids stable)"
               if macro_key_stable and fav1_stable and fav2_stable and not renumbered_to_slots
               else "RENUMBER (ids changed) — follow-up needed")
    print(f"  Q2 verdict: {verdict}")
    print(f"     detail: {q2}")
    check("Q2-ids-stable", macro_key_stable and fav1_stable and fav2_stable,
          f"macro_stable={macro_key_stable} fav1={fav1_stable} fav2={fav2_stable}")
    art["Q2-verdict"] = verdict

    # ── P4 pause: user visual check ─────────────────────────────────────
    go = BENCH_DIR / f"GO-{TAG}"
    go.unlink(missing_ok=True)
    print()
    print("=" * 68)
    print(f"P4 VISUAL CHECK — Bench Test order is now: macro(key {macro_key})"
          f", fav {fav1_id}, fav {fav2_id}")
    print("Look at the physical remote / Sofabaton app 'Macro & Favorite Keys'")
    print(f"for Bench Test. Then create  {go}  to continue.")
    print("(auto-continues after 900 s)")
    print("=" * 68, flush=True)
    deadline = time.time() + 900
    while time.time() < deadline and not go.exists():
        time.sleep(1.0)
    go.unlink(missing_ok=True)
    art["P4-continued"] = True

    # P3 (Q3): single-entry 0x61 page.
    res3 = proxy.reorder_favorites(ACT_ID, [macro_key])
    print(f"  P3 single-entry reorder_favorites([{macro_key}]) -> {res3}")
    art["P3-result"] = res3
    read_order3 = proxy.request_favorites_order(ACT_ID) or []
    art["P3-order-readback"] = read_order3
    check("P3-single-entry-ack", bool(res3) and res3.get("status") == "success",
          f"single-entry page result={res3}; order after={read_order3}")

    print("PROBE COMPLETE — proceeding to teardown.")

finally:
    # ── Teardown: remove everything we created, restore baseline ────────
    print("teardown ...")
    try:
        cur = proxy.backup_activity(ACT_ID)
        # Delete user macro (only if WE made it) via sync delete edit.
        if made_macro and created_macro_key is not None and created_macro_key in _user_macros(cur):
            edited = copy.deepcopy(cur)
            edited["macros"] = [
                r for r in edited.get("macros") or []
                if int(r.get("button_id", 0)) != created_macro_key
            ]
            try:
                sync("teardown-del-macro", cur, edited)
            except SystemExit as e:
                print(f"  macro teardown sync failed: {e}")
            cur = proxy.backup_activity(ACT_ID)
        # Delete the favorites we created. P3's single-entry macro-only page
        # empties the favorites-order table; delete_favorite then bails at its
        # order-fetch guard (request_favorites_order -> None). Reseat the order
        # table directly first so the guard passes.
        rows = _fav_slots(cur)
        remaining_srcs = [s for s in created_fav_srcs
                          if any((d, c) == s for _f, d, c in rows)]
        if remaining_srcs and proxy.request_favorites_order(ACT_ID) is None:
            fav_ids_now = [f for f, _d, _c in rows]
            proxy.reset_ack_queues()
            proxy._send_step(
                step_name=f"teardown-reseat-61[act=0x{ACT_ID & 0xFF:02X}]",
                family=0x61,
                payload=proxy._build_favorites_reorder_payload(ACT_ID & 0xFF, fav_ids_now),
                ack_opcode=0x0103,
            )
            proxy._send_step(
                step_name=f"teardown-reseat-65[act=0x{ACT_ID & 0xFF:02X}]",
                family=0x65,
                payload=bytes([ACT_ID & 0xFF]),
                ack_opcode=0x0103,
            )
            proxy.clear_entity_cache(ACT_ID, clear_buttons=False,
                                     clear_favorites=True, clear_macros=False)
            proxy.state.activity_favorites_order.pop(ACT_ID & 0xFF, None)
            proxy._activity_map_complete.discard(ACT_ID & 0xFF)
            proxy.request_activity_mapping(ACT_ID)
            time.sleep(1.0)
            cur = proxy.backup_activity(ACT_ID)
        for src in created_fav_srcs:
            rows = _fav_slots(cur)
            fid = next((f for f, d, c in rows if (d, c) == src), None)
            if fid is None:
                continue
            r = proxy.delete_favorite(ACT_ID, fid)
            print(f"  delete_favorite fav_id={fid} src={src} -> {r}")
            time.sleep(1.0)
            proxy.request_favorites_order(ACT_ID)
            cur = proxy.backup_activity(ACT_ID)

        final = proxy.backup_activity(ACT_ID)
        final_fav_srcs = {(d, c) for _f, d, c in _fav_slots(final)}
        clean = (final_fav_srcs == base_fav_srcs
                 and _user_macros(final) == base_user_macros)
        art["teardown-final"] = {
            "favorite_slots": _fav_slots(final),
            "user_macros": _user_macros(final),
        }
        check("teardown-clean", clean,
              f"fav_srcs={sorted(final_fav_srcs)} (baseline {sorted(base_fav_srcs)}) "
              f"user_macros={_user_macros(final)} (baseline {base_user_macros})")
    except Exception as e:  # noqa: BLE001
        print(f"  teardown error: {e}")
        art["teardown-error"] = str(e)
    path = save_json(f"macro-order-{TAG}", art)
    print("artifacts:", path)
    proxy.stop()
    print("disconnected")
