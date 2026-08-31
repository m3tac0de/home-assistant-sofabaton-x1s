"""IR0 bench chunk A2: Denon golden cross-check aid.

Two modes:

  fetch <dev_id> <cmd_id>
      Dump a stored (known-working) IR command via 0x020C, print the raw
      blob hex, and try to extract the carrier + µs timing sequence by
      probing candidate word offsets (exporter layout vs hub-capture
      layout differ in their headers). Saves everything to JSON so the
      session can diff against library-rendered timings offline.

  play <json_path>
      Rebuild a blob from a previously fetched (or hand-edited) timing
      sequence via build_raw_ir_blob_body and play it one-shot. Lets us
      prove "hub-captured timings -> converter -> photons" equivalence at
      the physical AVR before trusting library-rendered frames.

Usage:
  bench_159_denon_crosscheck.py <ip> <X1|X1S|X2> <tag> fetch <dev_id> <cmd_id>
  bench_159_denon_crosscheck.py <ip> <X1|X1S|X2> <tag> play <json_path>
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from bench_common import connect, save_json, setup_logging

sys.path.insert(
    0,
    str(Path(__file__).resolve().parents[2] / "custom_components" / "sofabaton_x1s"),
)
from lib.blob_decoders import build_raw_ir_blob_body  # noqa: E402

HOST = sys.argv[1]
HUB_VERSION = sys.argv[2]
TAG = sys.argv[3]
MODE = sys.argv[4]

log_path = setup_logging(f"denon-crosscheck-{TAG}")
print(f"logging to {log_path}")


def probe_timing_layout(blob: bytes) -> list[dict]:
    """Try candidate offsets for the carrier + BE32 timing run.

    The validated exporter layout is header(6) + carrier BE32 at [6:10] +
    words at [10:]. Hub-captured database blobs have been observed with
    different headers (lib.proxy_ir_blob._looks_like_x1_database_capture_blob),
    so probe a few starts and report every candidate whose words all land
    in a plausible duration range until a zero terminator.
    """

    candidates = []
    for carrier_off, carrier_width in (
        (6, 2),  # hub-captured layout: BE16 carrier at [6:8] (e.g. 94 cf)
        (2, 4),
        (4, 4),
        (6, 4),  # exporter layout: BE32 carrier at [6:10]
        (8, 2),
        (8, 4),
    ):
        if carrier_off + carrier_width > len(blob):
            continue
        carrier = int.from_bytes(
            blob[carrier_off : carrier_off + carrier_width], "big"
        )
        if not 20_000 <= carrier <= 500_000:
            continue
        words_off = carrier_off + carrier_width
        words = []
        pos = words_off
        while pos + 4 <= len(blob):
            value = int.from_bytes(blob[pos : pos + 4], "big")
            pos += 4
            if value == 0:
                break
            words.append(value)
        plausible = words and all(20 <= w <= 1_000_000 for w in words)
        if plausible:
            candidates.append(
                {
                    "carrier_offset": carrier_off,
                    "carrier_hz": carrier,
                    "header_hex": blob[:carrier_off].hex(),
                    "timings_us": words,
                    "trailing_hex": blob[pos:].hex(),
                }
            )
    return candidates


artifacts: dict = {"host": HOST, "mode": MODE}

if MODE == "fetch":
    dev_id = int(sys.argv[5], 0)
    cmd_id = int(sys.argv[6], 0)
    artifacts.update({"device": dev_id, "command": cmd_id})
    proxy = connect(HOST, HUB_VERSION)
    try:
        dump = proxy.request_ir_command_dump(dev_id, cmd_id, timeout=10.0)
    finally:
        proxy.stop()
        print("disconnected")
    rows = (dump or {}).get("commands") or []
    row = next((r for r in rows if int(r.get("command_id", -1)) == cmd_id), None)
    blob_hex = (row or {}).get("ir_blob_hex")
    if not blob_hex:
        print(f"FAIL: no blob for dev {dev_id} cmd {cmd_id} (rows={len(rows)})")
        sys.exit(1)
    blob = bytes.fromhex(blob_hex.replace(" ", ""))
    print(f"blob: {len(blob)}B, label={((row or {}).get('label') or '?')!r}")
    print(blob_hex)
    candidates = probe_timing_layout(blob)
    artifacts.update({"blob_hex": blob_hex, "layout_candidates": candidates})
    for c in candidates:
        print(
            f"  candidate @carrier_off={c['carrier_offset']}: "
            f"{c['carrier_hz']} Hz, {len(c['timings_us'])} timings, "
            f"header={c['header_hex']}"
        )
    if not candidates:
        print("  no plausible timing layout found; diff by hand from blob_hex")
    out = save_json(f"denon-crosscheck-{TAG}", artifacts)
    print(f"saved {out if out else 'artifacts json'}")

elif MODE == "play":
    payload = json.loads(Path(sys.argv[5]).read_text(encoding="utf-8"))
    source = payload["layout_candidates"][0] if "layout_candidates" in payload else payload
    timings = [int(v) for v in source["timings_us"]]
    carrier = int(source["carrier_hz"])
    blob = build_raw_ir_blob_body(timings, carrier)
    print(f"rebuilt blob: {len(blob)}B from {len(timings)} timings @ {carrier} Hz")
    proxy = connect(HOST, HUB_VERSION)
    try:
        ok = proxy.play_ir_blob(blob)
        print(f"play: {'ACKED' if ok else 'REJECTED'}")
        artifacts.update({"blob_len": len(blob), "acked": bool(ok)})
    finally:
        save_json(f"denon-crosscheck-{TAG}", artifacts)
        proxy.stop()
        print("disconnected")
    print("\nOperator: note whether the AVR responded.")
    if not ok:
        sys.exit(1)

else:
    raise SystemExit(f"unknown mode: {MODE}")
