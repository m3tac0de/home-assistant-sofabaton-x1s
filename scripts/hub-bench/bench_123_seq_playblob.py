"""Sequencer-validation: IR blob playback (play_blob exchange).

Fetches a real stored IR blob from a sacrificial device via the 0x020C
dump, then replays it with play_ir_blob — the first live run of the
play_blob exchange scope (family-0x0F chunk stream + final ack in ONE
scope, chunks back-to-back with no per-chunk quiesce).

Usage: bench_123_seq_playblob.py <ip> <X1|X1S|X2> <tag> <dev_id> <cmd_id>
"""

from __future__ import annotations

import sys

from bench_common import connect, save_json, setup_logging

HOST = sys.argv[1]
HUB_VERSION = sys.argv[2]
TAG = sys.argv[3]
DEV_ID = int(sys.argv[4], 0)
CMD_ID = int(sys.argv[5], 0)

log_path = setup_logging(f"seq-playblob-{TAG}")
print(f"logging to {log_path}")

checks: list[tuple[str, bool, str]] = []


def check(label: str, ok: bool, detail: str = "") -> None:
    checks.append((label, bool(ok), detail))
    print(f"  {'OK  ' if ok else 'FAIL'} {label}" + (f" — {detail}" if detail else ""))


proxy = connect(HOST, HUB_VERSION)
artifacts: dict = {"host": HOST, "device": DEV_ID, "command": CMD_ID}
try:
    dump = proxy.request_ir_command_dump(DEV_ID, CMD_ID, timeout=10.0)
    rows = (dump or {}).get("commands") or []
    row = next((r for r in rows if int(r.get("command_id", -1)) == CMD_ID), None)
    blob_hex = (row or {}).get("ir_blob_hex")
    check(
        "GATE: blob fetched",
        bool(row) and bool(row.get("complete")) and bool(blob_hex),
        f"rows={len(rows)} complete={(row or {}).get('complete')} blob={len(blob_hex or '')//3 + 1 if blob_hex else 0}B",
    )
    if not blob_hex:
        raise SystemExit("no blob to play")

    blob = bytes.fromhex(blob_hex.replace(" ", ""))
    ok = proxy.play_ir_blob(blob)
    check("play_ir_blob acked (all chunks + no late reject)", ok, f"{len(blob)}B blob")
    artifacts["blob_len"] = len(blob)

    # Second replay proves the scope drains cleanly and is reusable.
    ok = proxy.play_ir_blob(blob)
    check("second playback acked", ok)
finally:
    artifacts["checks"] = [{"label": l, "ok": ok, "detail": d} for l, ok, d in checks]
    save_json(f"seq-playblob-{TAG}", artifacts)
    proxy.stop()
    print("disconnected")

failed = [c for c in checks if not c[1]]
print(f"\n{len(checks) - len(failed)}/{len(checks)} checks passed")
if failed:
    sys.exit(1)
