"""BUG #4 probe, phase D: does member-add trigger role-page derivation?

bench_104 proved bare 0x3E binding writes + remote sync never spawn or
drop role-page slots. The remaining candidate from the BUG #4 flow is the
member machinery: ``add_device_to_activity`` (0xC5 replay + power-macro
growth + activity finalize). This bench adds FireTV (dev 4) as a member
of 107 WITHOUT writing any bindings, then watches whether the hub spawns
(4,0)/(4,21) keymap slots on its own; then removes the member again via
the sync engine (power-macro rewrite) and restores 107.

Usage: python bench_106_roleslot_member_add.py <ip> <X1|X1S|X2> <tag>
"""

from __future__ import annotations

import copy
import sys
import time

from bench_common import connect, save_json, setup_logging

HOST = sys.argv[1]
HUB_VERSION = sys.argv[2]
TAG = sys.argv[3]

ACT = 107
DEV = 4

log_path = setup_logging(f"roleslot-member-{TAG}")
print(f"logging to {log_path}", flush=True)

artifacts: dict[str, object] = {"events": []}
events: list[dict] = artifacts["events"]  # type: ignore[assignment]

proxy = connect(HOST, HUB_VERSION)

raw_history: list[dict] = []
_orig_replace = proxy.state.replace_keymap_rows


def _capture(act_lo: int, row_stream: bytes) -> None:
    raw_history.append({"ts": time.strftime("%H:%M:%S"), "act": act_lo, "raw": row_stream.hex()})
    _orig_replace(act_lo, row_stream)


proxy.state.replace_keymap_rows = _capture
artifacts["raw_history"] = raw_history


def read_keymap(entity: int) -> dict[int, dict]:
    proxy.clear_entity_cache(entity, clear_buttons=True, clear_favorites=True)
    proxy.get_buttons_for_entity(entity, fetch_if_missing=True)
    t0 = time.time()
    while time.time() - t0 < 12 and entity not in proxy.state.buttons:
        time.sleep(0.3)
    return {int(k): dict(v) for k, v in (proxy.state.button_details.get(entity) or {}).items()}


def fmt(details: dict[int, dict]) -> str:
    parts = []
    for btn in sorted(details):
        v = details[btn]
        parts.append(f"0x{btn:02X}->({v['device_id']},{v['command_id']})")
    return "{" + ", ".join(parts) + "}"


def note(label: str, **extra) -> None:
    evt = {"ts": time.strftime("%H:%M:%S"), "label": label, **extra}
    events.append(evt)
    print(f"[{evt['ts']}] {label}" + (f" {extra}" if extra else ""), flush=True)
    save_json(f"roleslot-member-{TAG}", artifacts)


def poll(phase: str, minutes: float) -> dict[int, dict]:
    prev = read_keymap(ACT)
    note(f"{phase}: poll start", act=fmt(prev))
    for i in range(int(minutes * 60 / 15)):
        time.sleep(15)
        cur = read_keymap(ACT)
        if cur != prev:
            note(f"{phase}: TRANSITION at cycle {i+1}", before=fmt(prev), after=fmt(cur))
            prev = cur
    note(f"{phase}: poll end", act=fmt(prev))
    return prev


def macro_view():
    return [
        {"key_id": r.key_id & 0xFF, "label": r.label,
         "steps": [(e.device_id, e.key_id, e.duration, e.delay) for e in r.key_sequence]}
        for r in proxy.get_cached_macro_records(ACT)
    ]


try:
    baseline_backup = proxy.backup_activity(ACT)
    if not isinstance(baseline_backup, dict) or baseline_backup.get("complete") is not True:
        raise SystemExit(f"baseline capture incomplete: {baseline_backup and baseline_backup.get('complete')}")
    artifacts["baseline_backup"] = copy.deepcopy(baseline_backup)
    note("baseline", act=fmt(read_keymap(ACT)), macros=macro_view(),
         members=sorted(proxy.state.get_activity_members(ACT & 0xFF) or []))

    ok = proxy.add_device_to_activity(ACT, DEV)
    note("member add issued", ok=ok is not None)
    note("immediate read", act=fmt(read_keymap(ACT)), macros=macro_view(),
         members=sorted(proxy.state.get_activity_members(ACT & 0xFF) or []))
    poll("post-member-add", 5)

    proxy.request_activity_mapping(ACT)
    note("remote sync issued")
    poll("post-remote-sync", 6)

    # ── restore: sync back to the captured baseline ──────────────────
    current = proxy.backup_activity(ACT)
    artifacts["pre_restore_backup"] = copy.deepcopy(current)
    result = proxy.sync_activity(
        baseline={"devices": [], "activities": [current]},
        edited={"devices": [], "activities": [copy.deepcopy(baseline_backup)]},
        activity_id=ACT,
    )
    note("restore sync", result=result)

    # Sweep any leftover dev-4 keymap rows the export could not see
    # (command 0 placeholders) or the sync did not remove.
    final = read_keymap(ACT)
    for btn, row in sorted(final.items()):
        if int(row.get("device_id", 0)) == DEV:
            ok = proxy._activity_sync_delete_key(ACT, btn)
            note(f"sweep delete 0x{btn:02X}", ok=bool(ok))
    proxy.request_activity_mapping(ACT)
    time.sleep(3)
    note("post-restore", act=fmt(read_keymap(ACT)), macros=macro_view(),
         members=sorted(proxy.state.get_activity_members(ACT & 0xFF) or []))
finally:
    save_json(f"roleslot-member-{TAG}", artifacts)
    proxy.stop()
    print("disconnected", flush=True)
