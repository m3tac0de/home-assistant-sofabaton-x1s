"""X2 numeric-keypad binding recon (read-only, no writes).

The X2 remote's on-screen numpad (0-9, "-", E) can be bound per device and
per activity in the app. Our keymap parser only keeps rows whose button code
is a known ``ButtonName``, so those rows never reach the cache. This dumps
the raw 18-byte keymap records for the Denon AVC device (dev 9, numpad keys
bound in the app) and every activity, with the command labels of every
device a record points at, so the numpad codes can be read off.

Usage: python bench_260_x2_numpad_recon.py <ip> <tag> [dev ...]
"""

from __future__ import annotations

import sys
import time

from bench_common import connect, save_json, setup_logging

HOST = sys.argv[1]
TAG = sys.argv[2]
DEVICES = [int(x) for x in sys.argv[3:]] or [9]

log_path = setup_logging(f"x2-numpad-recon-{TAG}")
print(f"logging to {log_path}", flush=True)

REC = 18
KNOWN = {0x97, 0x98, 0x99, 0x9A, 0x9B, 0x9C, 0x9D, *range(0xAE, 0xC2), 0xC6, 0xC7}

proxy = connect(HOST, "X2")

raw_keymaps: dict[int, bytes] = {}
_orig_replace = proxy.state.replace_keymap_rows


def _capture(ent_lo: int, row_stream: bytes) -> None:
    raw_keymaps[ent_lo] = bytes(row_stream)
    _orig_replace(ent_lo, row_stream)


proxy.state.replace_keymap_rows = _capture


def wait(pred, secs=15.0):
    t0 = time.time()
    while time.time() - t0 < secs:
        if pred():
            return True
        time.sleep(0.3)
    return False


def labels_for(dev: int) -> dict:
    proxy.get_commands_for_entity(dev, fetch_if_missing=True)
    wait(lambda: dev in proxy._commands_complete, 20)
    labels, _ = proxy.get_commands_for_entity(dev, fetch_if_missing=False)
    return {int(k): v for k, v in (labels or {}).items()}


def keymap_for(ent: int) -> bytes | None:
    raw_keymaps.pop(ent, None)
    proxy.get_buttons_for_entity(ent, fetch_if_missing=True)
    wait(lambda: ent in raw_keymaps, 20)
    return raw_keymaps.get(ent)


def decode(stream: bytes | None, label_cache: dict[int, dict]) -> list[dict]:
    rows = []
    if not stream:
        return rows
    for off in range(0, len(stream) - len(stream) % REC, REC):
        r = stream[off : off + REC]
        dev, cmd = r[2], r[9]
        if dev and dev not in label_cache:
            label_cache[dev] = labels_for(dev)
        rows.append({
            "hex": r.hex(" "),
            "ent": r[0],
            "code": r[1],
            "code_hex": f"0x{r[1]:02X}",
            "known": r[1] in KNOWN,
            "dev": dev,
            "cmd": cmd,
            "cmd_label": label_cache.get(dev, {}).get(cmd),
            "lp_dev": r[10],
            "lp_cmd": r[17],
        })
    tail = len(stream) % REC
    if tail:
        rows.append({"tail_hex": stream[-tail:].hex(" ")})
    return rows


try:
    proxy.request_devices()
    proxy.request_activities()
    wait(lambda: proxy.get_devices()[1] and proxy.get_activities(force_refresh=False)[1], 20)
    devs, _ = proxy.get_devices()
    acts, _ = proxy.get_activities(force_refresh=False)
    name = lambda v: v.get("name") if isinstance(v, dict) else v  # noqa: E731
    print("devices:", {int(k): name(v) for k, v in (devs or {}).items()})
    print("activities:", {int(k): name(v) for k, v in (acts or {}).items()})

    label_cache: dict[int, dict] = {}
    out: dict = {"devices": {}, "activities": {}}
    for ent, bucket in [(d, "devices") for d in DEVICES] + [
        (int(a), "activities") for a in sorted(acts or {})
    ]:
        stream = keymap_for(ent)
        rows = decode(stream, label_cache)
        out[bucket][ent] = {"raw": stream.hex() if stream else None, "rows": rows}
        print(f"\n== {bucket[:-1]} {ent}: {len(stream or b'')} bytes, {len(rows)} rows")
        for row in rows:
            if "tail_hex" in row:
                print("   tail", row["tail_hex"])
                continue
            flag = "   " if row["known"] else "NEW"
            print(f"   {flag} code {row['code']:3d} {row['code_hex']}  -> dev {row['dev']} cmd {row['cmd']} "
                  f"{row['cmd_label']!r}  lp {row['lp_dev']}/{row['lp_cmd']}   [{row['hex']}]")
    out["labels"] = label_cache
    print("\nsaved", save_json(f"x2-numpad-recon-{TAG}", out))
finally:
    proxy.stop()
