"""IR0 bench chunk A: play HA infrared-protocols signals through the hub.

Renders IR commands from the ``infrared-protocols`` pip library (the code
source behind HA's Infrared platform consumers), converts them to the
Sofabaton raw blob layout via ``build_raw_ir_blob_body``, and plays them
one-shot via ``play_ir_blob``. Physical device response is the check: the
operator watches the target device and reports.

Settles (docs/internal/ha-infrared-plan.md, IR0):
  - trailing-gap padding value (library frames end on a mark)
  - per-protocol repeat policy (Sony likely needs repeats)
  - whether the hub accepts an odd (mark-terminated) word count at all

Requires ``pip install infrared-protocols`` in the bench venv.

Usage:
  bench_158_ir_library_play.py <ip> <X1|X1S|X2> <tag> samsung <CODE> [opts]
  bench_158_ir_library_play.py <ip> <X1|X1S|X2> <tag> pronto <hexfile> [opts]
  bench_158_ir_library_play.py <ip> <X1|X1S|X2> <tag> timings <csvfile> <carrier_hz> [opts]

  samsung POWER            SamsungTVCode member name (codes.samsung.tv)
  pronto file.txt          file holding a space-separated Pronto hex string
  timings file.csv 38000   file holding comma/whitespace-separated signed µs

Options:
  --repeat N     repeat_count passed to to_command() (samsung mode; default 0)
  --gap US       trailing gap µs when the sequence ends on a mark
                 (default RAW_IR_DEFAULT_TRAILING_GAP_US); --gap none sends
                 the odd-count body unpadded (acceptance probe)
  --times N      play the blob N times, 0.6 s apart (default 1)
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

from bench_common import connect, save_json, setup_logging

sys.path.insert(
    0,
    str(Path(__file__).resolve().parents[2] / "custom_components" / "sofabaton_x1s"),
)
from lib.blob_decoders import (  # noqa: E402
    RAW_IR_DEFAULT_TRAILING_GAP_US,
    build_raw_ir_blob_body,
)

HOST = sys.argv[1]
HUB_VERSION = sys.argv[2]
TAG = sys.argv[3]
MODE = sys.argv[4]
rest = sys.argv[5:]


def opt(name: str, default: str | None = None) -> str | None:
    if name in rest:
        return rest[rest.index(name) + 1]
    return default


REPEAT = int(opt("--repeat", "0") or 0)
GAP_RAW = opt("--gap", str(RAW_IR_DEFAULT_TRAILING_GAP_US))
TIMES = int(opt("--times", "1") or 1)

log_path = setup_logging(f"ir-library-play-{TAG}")
print(f"logging to {log_path}")

artifacts: dict = {
    "host": HOST,
    "mode": MODE,
    "args": rest,
    "repeat": REPEAT,
    "gap": GAP_RAW,
}


def render_timings() -> tuple[list[int], int, str]:
    """Return (signed µs timings, carrier_hz, human label) per mode."""
    if MODE == "samsung":
        from infrared_protocols.codes.samsung.tv import SamsungTVCode

        code = SamsungTVCode[rest[0]]
        cmd = code.to_command(repeat_count=REPEAT)
        return list(cmd.get_raw_timings()), int(cmd.modulation), f"samsung {code.name}"
    if MODE == "pronto":
        from infrared_protocols.commands.pronto import ProntoCommand

        hex_text = Path(rest[0]).read_text(encoding="utf-8").strip()
        cmd = ProntoCommand.from_pronto_hex(hex_text)
        if REPEAT:
            cmd.repeat_count = REPEAT
        return list(cmd.get_raw_timings()), int(cmd.modulation), f"pronto {rest[0]}"
    if MODE == "timings":
        text = Path(rest[0]).read_text(encoding="utf-8")
        values = [int(v) for v in text.replace(",", " ").split()]
        return values, int(rest[1]), f"timings {rest[0]}"
    raise SystemExit(f"unknown mode: {MODE}")


timings, carrier, label = render_timings()
odd = len(timings) % 2 == 1
print(f"{label}: {len(timings)} timings ({'odd' if odd else 'even'}), carrier {carrier} Hz")

if GAP_RAW == "none":
    # Acceptance probe: append nothing; inline the (live-validated
    # 2026-08-31) layout with the unpadded odd word count.
    body = bytearray()
    body += (4 * len(timings)).to_bytes(2, "big")
    body += b"\x00\x00\x00\x00"
    body += carrier.to_bytes(2, "big")
    for value in timings:
        body += abs(int(value)).to_bytes(4, "big")
    body += b"\x00\x00\x00\x00"
    blob = bytes(body)
else:
    blob = build_raw_ir_blob_body(timings, carrier, trailing_gap_us=int(GAP_RAW))

blob_hex = " ".join(f"{b:02x}" for b in blob)
print(f"blob: {len(blob)}B")
print(blob_hex)
artifacts.update(
    {"label": label, "carrier": carrier, "timing_count": len(timings), "blob_hex": blob_hex}
)

proxy = connect(HOST, HUB_VERSION)
results = []
try:
    for i in range(TIMES):
        if i:
            time.sleep(0.6)
        t0 = time.monotonic()
        ok = proxy.play_ir_blob(blob)
        elapsed = time.monotonic() - t0
        results.append({"ok": bool(ok), "seconds": round(elapsed, 3)})
        print(f"  play {i + 1}/{TIMES}: {'ACKED' if ok else 'REJECTED'} in {elapsed:.3f}s")
finally:
    artifacts["plays"] = results
    save_json(f"ir-library-play-{TAG}", artifacts)
    proxy.stop()
    print("disconnected")

print("\nOperator: note whether the physical device responded.")
if not all(r["ok"] for r in results):
    sys.exit(1)
