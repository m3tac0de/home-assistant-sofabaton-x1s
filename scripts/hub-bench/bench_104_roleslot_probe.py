"""BUG #4 probe, phase B: when does the hub rewrite role-page keymap slots?

Reproduces the UI-bench scenario on a clean bench activity (107):

1. baseline: keymap snapshot (expected empty)
2. write playback bindings 0xBC->(dev4,27) and 0xBB->(dev4,29) via 0x3E,
   deliberately NOT writing 0xBD (FWD) — snapshot, then poll ~4 min with
   NO remote sync (does the hub spawn the (4,0)/(4,21) slot by itself?)
3. remote sync (request_activity_mapping) — poll ~8 min watching 0xBD
4. perturb: add + remove an unrelated Xbox channel binding (0xB7), remote
   sync, poll ~8 min (does 0xBD de/re-materialize?)
5. cleanup: delete every remaining keymap row on 107, remote sync, verify

Every keymap read logs parsed rows AND raw 18-byte records with a
timestamp; transitions are printed as they happen. Artifacts are saved
incrementally to out/roleslot-probe-<tag>.json.

Usage: python bench_104_roleslot_probe.py <ip> <X1|X1S|X2> <tag>
"""

from __future__ import annotations

import sys
import time

from bench_common import connect, save_json, setup_logging

HOST = sys.argv[1]
HUB_VERSION = sys.argv[2]
TAG = sys.argv[3]

ACT = 107
DEV_FIRETV = 4
DEV_XBOX = 7
BTN_PLAY = 0xBC   # play/pause -> dev4 cmd 27
BTN_REW = 0xBB    # -> dev4 cmd 29
BTN_FWD = 0xBD    # deliberately NOT written; dev4 device map has cmd 21
BTN_CHUP = 0xB7

log_path = setup_logging(f"roleslot-probe-{TAG}")
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
    """Fresh keymap fetch for an entity; returns parsed button_details."""
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
        lp = f" lp=({v.get('long_press_device_id')},{v.get('long_press_command_id')})" if v.get("long_press_device_id") else ""
        parts.append(f"0x{btn:02X}->({v['device_id']},{v['command_id']}){lp}")
    return "{" + ", ".join(parts) + "}"


def note(label: str, **extra) -> None:
    evt = {"ts": time.strftime("%H:%M:%S"), "label": label, **extra}
    events.append(evt)
    print(f"[{evt['ts']}] {label}" + (f" {extra}" if extra else ""), flush=True)
    save_json(f"roleslot-probe-{TAG}", artifacts)


def poll(phase: str, minutes: float, *, dev_every: int = 4) -> None:
    """Poll ACT keymap every 15s; log transitions; every Nth cycle also read
    the FireTV device-mode keymap (is the DEVICE page flipping too?)."""
    prev_act = read_keymap(ACT)
    prev_dev = read_keymap(DEV_FIRETV)
    note(f"{phase}: poll start", act=fmt(prev_act), dev4=fmt(prev_dev))
    cycles = int(minutes * 60 / 15)
    for i in range(cycles):
        time.sleep(15)
        cur = read_keymap(ACT)
        if cur != prev_act:
            note(f"{phase}: ACT TRANSITION at cycle {i+1}", before=fmt(prev_act), after=fmt(cur))
            prev_act = cur
        if (i + 1) % dev_every == 0:
            cur_dev = read_keymap(DEV_FIRETV)
            if cur_dev != prev_dev:
                note(f"{phase}: DEV4 TRANSITION at cycle {i+1}", before=fmt(prev_dev), after=fmt(cur_dev))
                prev_dev = cur_dev
    note(f"{phase}: poll end", act=fmt(prev_act), dev4=fmt(prev_dev))


try:
    # ── 1. baseline ──────────────────────────────────────────────────
    base = read_keymap(ACT)
    note("baseline", act=fmt(base))
    if base:
        note("WARNING: 107 not empty at start — proceeding anyway")

    # ── 2. playback binding writes, NO remote sync ───────────────────
    ok1 = proxy.command_to_button(ACT, BTN_PLAY, DEV_FIRETV, 27, refresh_after_write=False)
    ok2 = proxy.command_to_button(ACT, BTN_REW, DEV_FIRETV, 29, refresh_after_write=False)
    note("wrote playback bindings", play=bool(ok1), rew=bool(ok2))
    note("post-write snapshot", act=fmt(read_keymap(ACT)))
    poll("no-remote-sync", 4)

    # ── 3. remote sync ───────────────────────────────────────────────
    proxy.request_activity_mapping(ACT)
    note("remote sync issued")
    poll("post-remote-sync", 8)

    # ── 4. perturb: unrelated Xbox channel binding add + remove ─────
    dev7 = read_keymap(DEV_XBOX)
    chup_cmd = (dev7.get(BTN_CHUP) or {}).get("command_id") or 1
    ok = proxy.command_to_button(ACT, BTN_CHUP, DEV_XBOX, int(chup_cmd), refresh_after_write=False)
    note("xbox channel binding added", ok=bool(ok), cmd=int(chup_cmd))
    proxy.request_activity_mapping(ACT)
    note("remote sync issued")
    poll("post-xbox-add", 5)

    ok = proxy._activity_sync_delete_key(ACT, BTN_CHUP)
    note("xbox channel binding removed", ok=bool(ok))
    proxy.request_activity_mapping(ACT)
    note("remote sync issued")
    poll("post-xbox-remove", 8)

    # ── 5. cleanup: delete every remaining row on 107 ────────────────
    final = read_keymap(ACT)
    for btn in sorted(final):
        ok = proxy._activity_sync_delete_key(ACT, btn)
        note(f"cleanup delete 0x{btn:02X}", ok=bool(ok))
    proxy.request_activity_mapping(ACT)
    time.sleep(3)
    note("post-cleanup", act=fmt(read_keymap(ACT)))
finally:
    save_json(f"roleslot-probe-{TAG}", artifacts)
    proxy.stop()
    print("disconnected", flush=True)
