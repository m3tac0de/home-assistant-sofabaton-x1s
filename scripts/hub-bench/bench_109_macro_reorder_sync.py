"""Chunk 2 — end-to-end sync_activity validation for the macro-reorder fix.

Plan: docs/internal/macro-reorder-bench-plan.md (chunk 2).

Drives ``proxy.sync_activity(baseline=…, edited=…)`` with synthetic bundles
that mirror the frontend exactly (the editor renumbers ALL quick-access
button_ids positionally, 1..N interleaved across favorites and macros). Each
scenario asserts BOTH on the pure plan (``build_activity_sync_plan``) and on
the live hub after the write.

  S1  pure macro move (tail->head): NO macro_write/macro_delete; order correct;
      macro record byte-identical.
  S2  move + rename in one edit: one macro_write at the BASELINE key id, no
      delete; steps byte-identical, name changed.
  S3  new macro inserted mid-list at a proposal id occupied by a live favorite:
      allocator picks a free id; the `new` order entry follows the remap.
  S4  macro-target binding survives a move: binding row unchanged, still
      addresses the surviving macro key id.
  S5  stale regression: a second sync (favorite swap) right after a move does
      NOT fail at stale_check.

Fixture (Bench Test 0x68, torn down at the end): 2 favorites + 1 user macro.

Usage: bench_109_macro_reorder_sync.py <ip> <X1|X1S|X2> <tag> [act_id=0x68]
"""

from __future__ import annotations

import copy
import sys
import time

from bench_common import connect, save_json, setup_logging
from x1slib.activity_sync import build_activity_sync_plan

HOST = sys.argv[1]
HUB_VERSION = sys.argv[2]
TAG = sys.argv[3]
ACT_ID = int(sys.argv[4], 0) if len(sys.argv) > 4 else 0x68
POWER_ON, POWER_OFF = 198, 199
MACRO_NAME = "Bench RO Macro"
BIND_BUTTON = 174  # UP hard button

log_path = setup_logging(f"macro-sync-{TAG}")
print(f"frame log: {log_path}")
art: dict[str, object] = {}
fail = 0


def check(label, ok, detail=""):
    global fail
    if not ok:
        fail += 1
    print(f"  CHECK[{label}]: {'OK' if ok else 'FAIL'} {('— ' + detail) if detail else ''}")
    art[f"check-{label}"] = {"ok": bool(ok), "detail": detail}


def _progress(**p):
    pass


def bundle(payload):
    return {"devices": [], "activities": [copy.deepcopy(payload)]}


def sync(name, base_payload, edited_payload):
    result = proxy.sync_activity(
        baseline=bundle(base_payload), edited=bundle(edited_payload),
        activity_id=ACT_ID, progress_callback=_progress,
    )
    art[f"sync-{name}"] = result
    print(f"  sync[{name}] -> {result}")
    return result


def plan_kinds(base_payload, edited_payload):
    plan = build_activity_sync_plan(bundle(base_payload), bundle(edited_payload), ACT_ID)
    return plan, [s.kind for s in plan]


def steps_tuple(steps):
    return [(int(s.get("device_id", 0)), int(s.get("command_id", 0)),
             int(s.get("button_code", 0)), int(s.get("duration", 0)), int(s.get("delay", 0)))
            for s in (steps or [])]


def cap():
    """Fresh real backup capture (restore point / stale baseline)."""
    p = proxy.backup_activity(ACT_ID)
    if not isinstance(p, dict):
        raise SystemExit("backup_activity failed")
    return p


def user_macros(p):
    return {int(m.get("button_id", 0)): {"name": m.get("name"), "steps": steps_tuple(m.get("steps"))}
            for m in (p or {}).get("macros") or []
            if int(m.get("button_id", 0)) not in (POWER_ON, POWER_OFF)}


def fav_rows(p):
    return [(int(r.get("button_id", 0)), int(r.get("device_id", 0)), int(r.get("command_id", 0)))
            for r in (p or {}).get("favorite_slots") or []]


def macro_slot_hex(name):
    for r in proxy.get_cached_macro_records(ACT_ID):
        if r.label == name:
            return r.key_id & 0xFF, r.raw_label_slot.hex(), len(r.key_sequence)
    return None, None, None


def bindings(p):
    return [dict(b) for b in (p or {}).get("button_bindings") or []]


def build_edited(base_payload, order, *, rename=None):
    """order: list of ('fav',(dev,cmd)) | ('macro', name) | ('newmacro', {name,steps}).

    Assigns positional button_ids 1..N (favorites + macros interleaved),
    mirroring the editor. `rename` maps existing macro name -> new name.
    Power macros keep their fixed ids. Macro-target bindings are rewritten to
    the macro's new positional id (as the real frontend does)."""
    ed = copy.deepcopy(base_payload)
    act_id = int((ed.get("device") or {}).get("device_id"))
    favs_by_content = {(int(f["device_id"]), int(f["command_id"])): f
                       for f in ed.get("favorite_slots") or []}
    macros_by_name = {m.get("name"): m for m in ed.get("macros") or []
                      if int(m.get("button_id", 0)) not in (POWER_ON, POWER_OFF)}
    power = [m for m in ed.get("macros") or [] if int(m.get("button_id", 0)) in (POWER_ON, POWER_OFF)]
    out_favs, out_macros = [], []
    macro_oldid_to_pos = {}
    pos = 1
    for item in order:
        if item[0] == "fav":
            row = dict(favs_by_content[item[1]]); row["button_id"] = pos; out_favs.append(row)
        elif item[0] == "macro":
            src = macros_by_name[item[1]]
            row = dict(src)
            macro_oldid_to_pos[int(src.get("button_id"))] = pos
            if rename and item[1] in rename:
                row["name"] = rename[item[1]]
            row["button_id"] = pos
            out_macros.append(row)
        elif item[0] == "newmacro":
            row = dict(item[1]); row["button_id"] = pos; out_macros.append(row)
        pos += 1
    ed["favorite_slots"] = out_favs
    ed["macros"] = power + out_macros
    # Rewrite macro-target bindings to positional macro ids.
    new_bindings = []
    for b in ed.get("button_bindings") or []:
        b = dict(b)
        if int(b.get("device_id", 0)) == act_id and int(b.get("command_id", 0)) in macro_oldid_to_pos:
            b["command_id"] = macro_oldid_to_pos[int(b["command_id"])]
        if int(b.get("long_press_device_id", 0) or 0) == act_id and \
                int(b.get("long_press_command_id", 0) or 0) in macro_oldid_to_pos:
            b["long_press_command_id"] = macro_oldid_to_pos[int(b["long_press_command_id"])]
        new_bindings.append(b)
    ed["button_bindings"] = new_bindings
    return ed


proxy = connect(HOST, HUB_VERSION)
made_favs: list[tuple[int, int]] = []
made_binding = False
try:
    # ── chunk-start capture (restore target) ────────────────────────────
    start = cap()
    start_favs = {(d, c) for _b, d, c in fav_rows(start)}
    start_user_macros = user_macros(start)
    print(f"chunk-start: favs={sorted(start_favs)} user_macros={list(start_user_macros)}")

    # ── fixture: 2 favorites (from power steps) + 1 user macro ───────────
    on_row = next(m for m in start.get("macros") or [] if int(m.get("button_id", 0)) == POWER_ON)
    off_row = next(m for m in start.get("macros") or [] if int(m.get("button_id", 0)) == POWER_OFF)
    on_step = steps_tuple(on_row.get("steps"))[0]
    off_step = steps_tuple(off_row.get("steps"))[0]
    fav1_src, fav2_src = (on_step[0], on_step[1]), (off_step[0], off_step[1])
    if fav1_src == fav2_src:
        raise SystemExit("power steps collide; can't make 2 favs")
    cur = start
    for src in (fav1_src, fav2_src):
        if any((d, c) == src for _b, d, c in fav_rows(cur)):
            continue
        # X1 sometimes returns None from command_to_favorite even though the
        # write lands — verify by re-read rather than trusting the return.
        proxy.command_to_favorite(ACT_ID, src[0], src[1])
        time.sleep(1.0)
        cur = cap()
        if not any((d, c) == src for _b, d, c in fav_rows(cur)):
            raise SystemExit(f"command_to_favorite{src} did not land")
        made_favs.append(src)
    cur = cap()
    if not user_macros(cur):
        used = {POWER_ON, POWER_OFF} | {b for b, _d, _c in fav_rows(cur)}
        proposed = next(k for k in range(1, 200) if k not in used)
        ed = copy.deepcopy(cur)
        ed["macros"] = list(ed.get("macros") or []) + [{
            "button_id": proposed, "name": MACRO_NAME,
            "steps": [
                {"device_id": on_step[0], "command_id": on_step[1], "button_code": on_step[2],
                 "duration": on_step[3], "delay": on_step[4]},
                {"device_id": off_step[0], "command_id": off_step[1], "button_code": off_step[2],
                 "duration": off_step[3], "delay": off_step[4]},
            ],
        }]
        r = sync("fixture-macro", cur, ed)
        if r.get("status") != "success":
            raise SystemExit(f"fixture macro create failed: {r}")
    cur = cap()
    um = user_macros(cur)
    macro_key = sorted(um)[0]
    favs = fav_rows(cur)
    fav1_id = next(b for b, d, c in favs if (d, c) == fav1_src)
    fav2_id = next(b for b, d, c in favs if (d, c) == fav2_src)
    print(f"fixture ready: macro key={macro_key} name={MACRO_NAME!r} "
          f"fav1(id={fav1_id},{fav1_src}) fav2(id={fav2_id},{fav2_src})")

    # ══ S1 — pure macro move (tail -> head) ═════════════════════════════
    print("\n== S1 pure move ==")
    base = cap()
    base_key, base_slot, base_nsteps = macro_slot_hex(MACRO_NAME)
    edited = build_edited(base, [("macro", MACRO_NAME), ("fav", fav1_src), ("fav", fav2_src)])
    plan, kinds = plan_kinds(base, edited)
    art["S1-plan"] = kinds
    check("S1-no-macro-write", "macro_write" not in kinds, f"kinds={kinds}")
    check("S1-no-macro-delete", "macro_delete" not in kinds, f"kinds={kinds}")
    check("S1-has-order", "favorite_order" in kinds, f"kinds={kinds}")
    r = sync("S1", base, edited)
    check("S1-success", r.get("status") == "success", str(r))
    order = proxy.request_favorites_order(ACT_ID) or []
    slot_by_id = {fid: s for fid, s in order}
    check("S1-macro-slot1", slot_by_id.get(macro_key) == 1, f"order={order}")
    now_key, now_slot, now_nsteps = macro_slot_hex(MACRO_NAME)
    check("S1-record-byte-identical",
          now_key == base_key and now_slot == base_slot and now_nsteps == base_nsteps,
          f"key {base_key}->{now_key} slot_equal={now_slot == base_slot} nsteps {base_nsteps}->{now_nsteps}")

    # ══ S2 — move + rename in one edit (head -> tail, renamed) ══════════
    print("\n== S2 move + rename ==")
    base = cap()
    base_key, base_slot, base_nsteps = macro_slot_hex(MACRO_NAME)
    new_name = "Bench RO Macro v2"
    # Move macro to head AND rename in one edit (baseline reports it at the
    # button_id tail, so head is a genuine move).
    edited = build_edited(base, [("macro", MACRO_NAME), ("fav", fav1_src), ("fav", fav2_src)],
                          rename={MACRO_NAME: new_name})
    plan, kinds = plan_kinds(base, edited)
    art["S2-plan"] = kinds
    mw = [s for s in plan if s.kind == "macro_write"]
    check("S2-one-macro-write", len(mw) == 1, f"kinds={kinds}")
    check("S2-macro-write-baseline-id",
          bool(mw) and int(mw[0].payload.get("button_id")) == macro_key,
          f"write button_id={mw[0].payload.get('button_id') if mw else None} baseline={macro_key}")
    check("S2-has-order", "favorite_order" in kinds, f"kinds={kinds}")
    check("S2-no-macro-delete", "macro_delete" not in kinds, f"kinds={kinds}")
    r = sync("S2", base, edited)
    check("S2-success", r.get("status") == "success", str(r))
    now_key, now_slot, now_nsteps = macro_slot_hex(new_name)
    check("S2-same-key-renamed", now_key == macro_key, f"key {macro_key}->{now_key}")
    check("S2-steps-identical", now_nsteps == base_nsteps, f"nsteps {base_nsteps}->{now_nsteps}")
    order = proxy.request_favorites_order(ACT_ID) or []
    check("S2-macro-slot1", {fid: s for fid, s in order}.get(macro_key) == 1, f"order={order}")
    check("S2-only-one-user-macro", len(user_macros(cap())) == 1, str(user_macros(cap())))
    # rename back so later scenarios use MACRO_NAME
    base = cap()
    edited = build_edited(base, [("macro", new_name), ("fav", fav1_src), ("fav", fav2_src)],
                          rename={new_name: MACRO_NAME})
    sync("S2-rename-back", base, edited)

    # ══ S3 — new macro mid-list, proposal id occupied by a live fav ═════
    print("\n== S3 new macro mid-list ==")
    base = cap()
    new_macro = {"name": "Bench RO New",
                 "steps": [{"device_id": on_step[0], "command_id": on_step[1],
                            "button_code": on_step[2], "duration": on_step[3], "delay": on_step[4]}]}
    # order: fav1(pos1), NEW(pos2 == fav2's live id collision target), fav2(pos3), macro(pos4)
    edited = build_edited(base, [("fav", fav1_src), ("newmacro", new_macro),
                                 ("fav", fav2_src), ("macro", MACRO_NAME)])
    plan, kinds = plan_kinds(base, edited)
    art["S3-plan"] = kinds
    new_writes = [s for s in plan if s.kind == "macro_write" and s.payload.get("new")]
    order_steps = [s for s in plan if s.kind == "favorite_order"]
    check("S3-new-macro-write", len(new_writes) == 1 and int(new_writes[0].payload["button_id"]) == 2,
          f"new_writes={[s.payload.get('button_id') for s in new_writes]}")
    check("S3-order-has-new-macro",
          bool(order_steps) and any(e.get("kind") == "macro" and e.get("new")
                                    for e in order_steps[0].payload.get("order") or []),
          f"order={order_steps[0].payload.get('order') if order_steps else None}")
    r = sync("S3", base, edited)
    check("S3-success", r.get("status") == "success", str(r))
    after = cap()
    ums = user_macros(after)
    new_key = next((k for k, v in ums.items() if v["name"] == "Bench RO New"), None)
    check("S3-new-readable", new_key is not None, f"user_macros={ums}")
    check("S3-allocated-not-live-fav", new_key not in (fav1_id, fav2_id),
          f"new_key={new_key} live_favs=({fav1_id},{fav2_id})")
    order = proxy.request_favorites_order(ACT_ID) or []
    slot_by_id = {fid: s for fid, s in order}
    check("S3-new-in-order-pos2", slot_by_id.get(new_key) == 2, f"new_key={new_key} order={order}")
    # remove the new macro to keep the fixture simple for S4/S5
    base = cap()
    edited = build_edited(base, [("fav", fav1_src), ("fav", fav2_src), ("macro", MACRO_NAME)])
    sync("S3-cleanup-newmacro", base, edited)

    # ══ S4 — macro-target binding survives a move ═══════════════════════
    print("\n== S4 macro-target binding ==")
    rb = proxy.command_to_button(ACT_ID, BIND_BUTTON, ACT_ID, macro_key)
    print(f"  command_to_button(btn={BIND_BUTTON} -> macro {macro_key}) -> {rb}")
    made_binding = bool(rb)
    time.sleep(1.0)
    base = cap()
    base_binds = [b for b in bindings(base)
                  if int(b.get("device_id", 0)) == ACT_ID and int(b.get("command_id", 0)) == macro_key]
    check("S4-binding-present", bool(base_binds), f"bindings={bindings(base)}")
    # move macro to head; binding follows to positional id, plan normalizes back
    edited = build_edited(base, [("macro", MACRO_NAME), ("fav", fav1_src), ("fav", fav2_src)])
    plan, kinds = plan_kinds(base, edited)
    art["S4-plan"] = kinds
    check("S4-no-binding-write", "binding_write" not in kinds, f"kinds={kinds}")
    check("S4-no-macro-write", "macro_write" not in kinds, f"kinds={kinds}")
    r = sync("S4", base, edited)
    check("S4-success", r.get("status") == "success", str(r))
    after = cap()
    after_binds = [b for b in bindings(after)
                   if int(b.get("device_id", 0)) == ACT_ID and int(b.get("command_id", 0)) == macro_key]
    check("S4-binding-intact", bool(after_binds),
          f"still targets macro {macro_key}? bindings={bindings(after)}")
    order = proxy.request_favorites_order(ACT_ID) or []
    check("S4-macro-still-key", macro_key in {fid for fid, _s in order}, f"order={order}")

    # ══ S5 — stale regression: 2nd sync (fav swap) right after a move ═══
    print("\n== S5 stale regression ==")
    base = cap()
    # A genuine macro move (baseline reports the macro at the button_id tail,
    # so head is a real reorder) — the write whose old delete+recreate caused
    # the stale-preflight failure.
    edited = build_edited(base, [("macro", MACRO_NAME), ("fav", fav1_src), ("fav", fav2_src)])
    r1 = sync("S5-move", base, edited)
    check("S5-move-success", r1.get("status") == "success", str(r1))
    check("S5-move-reordered", "favorite_order" in (art.get("sync-S5-move", {}) or {}).get("counters", {}),
          f"counters={r1.get('counters')}")
    base2 = cap()  # recapture immediately after the move
    edited2 = build_edited(base2, [("fav", fav2_src), ("fav", fav1_src), ("macro", MACRO_NAME)])
    r2 = sync("S5-favswap", base2, edited2)
    check("S5-not-stale", r2.get("failed_at") != "stale_check", str(r2))
    check("S5-favswap-success", r2.get("status") == "success", str(r2))

    print(f"\n==== {'ALL PASS' if fail == 0 else str(fail) + ' CHECK(S) FAILED'} ====")

finally:
    print("\nteardown ...")
    try:
        if made_binding:
            # delete the S4 binding (0x0210 key delete on the activity)
            try:
                proxy._activity_sync_delete_key(ACT_ID, BIND_BUTTON)
                print(f"  deleted binding button {BIND_BUTTON}")
            except Exception as e:  # noqa: BLE001
                print(f"  binding delete error: {e}")
            time.sleep(1.0)
        cur = cap()
        # delete every user macro not in the chunk-start capture
        extra_macros = [k for k in user_macros(cur) if k not in start_user_macros]
        if extra_macros:
            edited = copy.deepcopy(cur)
            edited["macros"] = [m for m in edited.get("macros") or []
                                if int(m.get("button_id", 0)) not in extra_macros]
            try:
                sync("teardown-macros", cur, edited)
            except Exception as e:  # noqa: BLE001
                print(f"  macro teardown error: {e}")
            cur = cap()
        # Delete every favorite not in the chunk-start baseline (robust to the
        # X1 None-return and to any orphan a prior aborted run left behind).
        # Reseat the order table first when it is empty, else delete_favorite's
        # order-fetch guard bails.
        for _ in range(8):
            extra = [(b, d, c) for b, d, c in fav_rows(cur) if (d, c) not in start_favs]
            if not extra:
                break
            if proxy.request_favorites_order(ACT_ID) is None:
                ids = [b for b, _d, _c in fav_rows(cur)]
                proxy.reset_ack_queues()
                proxy._send_step(step_name="td-reseat-61", family=0x61,
                                 payload=proxy._build_favorites_reorder_payload(ACT_ID & 0xFF, ids),
                                 ack_opcode=0x0103)
                proxy._send_step(step_name="td-reseat-65", family=0x65,
                                 payload=bytes([ACT_ID & 0xFF]), ack_opcode=0x0103)
                proxy.clear_entity_cache(ACT_ID, clear_buttons=False, clear_favorites=True, clear_macros=False)
                proxy.state.activity_favorites_order.pop(ACT_ID & 0xFF, None)
                proxy._activity_map_complete.discard(ACT_ID & 0xFF)
                proxy.request_activity_mapping(ACT_ID)
                time.sleep(1.0)
                cur = cap()
                continue
            fid, d, c = extra[0]
            proxy.delete_favorite(ACT_ID, fid)
            print(f"  deleted favorite ({d},{c}) fav_id={fid}")
            time.sleep(1.0)
            proxy.request_favorites_order(ACT_ID)
            cur = cap()
        final = cap()
        clean = ({(d, c) for _b, d, c in fav_rows(final)} == start_favs
                 and user_macros(final).keys() == start_user_macros.keys())
        check("teardown-clean", clean,
              f"favs={sorted({(d, c) for _b, d, c in fav_rows(final)})} (start {sorted(start_favs)}); "
              f"user_macros={list(user_macros(final))} (start {list(start_user_macros)})")
    except Exception as e:  # noqa: BLE001
        print(f"  teardown error: {e}")
        art["teardown-error"] = str(e)
    art["fail_count"] = fail
    save_json(f"macro-sync-{TAG}", art)
    proxy.stop()
    print("disconnected")
