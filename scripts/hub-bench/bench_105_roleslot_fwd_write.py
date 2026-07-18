"""BUG #4 probe, phase C: write the FWD role binding explicitly.

BUG #4's sequence began with a playback-role binding write that included
FWD 0xBD -> (dev 4, cmd 21) — matching dev 4's device-mode page — after
which the hub held the slot as (4,0) and only materialized (4,21) minutes
later. This bench isolates that: write exactly that one binding, read the
keymap back immediately (does the hub store 0 or 21?), remote-sync, poll,
then delete the row and restore 107 to empty.

Usage: python bench_105_roleslot_fwd_write.py <ip> <X1|X1S|X2> <tag>
"""

from __future__ import annotations

import sys
import time

from bench_common import connect, save_json, setup_logging

HOST = sys.argv[1]
HUB_VERSION = sys.argv[2]
TAG = sys.argv[3]

ACT = 107
DEV = 4
BTN_FWD = 0xBD
CMD_FWD = 21

log_path = setup_logging(f"roleslot-fwd-{TAG}")
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
    save_json(f"roleslot-fwd-{TAG}", artifacts)


try:
    note("baseline", act=fmt(read_keymap(ACT)), dev4=fmt(read_keymap(DEV)))

    ok = proxy.command_to_button(ACT, BTN_FWD, DEV, CMD_FWD, refresh_after_write=False)
    note("wrote FWD binding", ok=bool(ok))
    note("immediate read", act=fmt(read_keymap(ACT)))

    proxy.request_activity_mapping(ACT)
    note("remote sync issued")
    prev = read_keymap(ACT)
    note("post-sync read", act=fmt(prev))
    for i in range(24):  # 6 min @ 15s
        time.sleep(15)
        cur = read_keymap(ACT)
        if cur != prev:
            note(f"TRANSITION at cycle {i+1}", before=fmt(prev), after=fmt(cur))
            prev = cur

    # cleanup: delete any physical-button rows on 107 (favorites stay)
    from x1slib.protocol_const import BUTTONNAME_BY_CODE  # noqa: E402
    final = read_keymap(ACT)
    for btn in sorted(final):
        if btn in BUTTONNAME_BY_CODE:
            ok = proxy._activity_sync_delete_key(ACT, btn)
            note(f"cleanup delete 0x{btn:02X}", ok=bool(ok))
    proxy.request_activity_mapping(ACT)
    time.sleep(3)
    note("post-cleanup", act=fmt(read_keymap(ACT)))
finally:
    save_json(f"roleslot-fwd-{TAG}", artifacts)
    proxy.stop()
    print("disconnected", flush=True)
