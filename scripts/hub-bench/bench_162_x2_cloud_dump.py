"""Dump the descriptive (P:) command strings of cloud-catalog devices on an X2.

Lists the hub's devices, picks those whose name matches a substring, dumps
every IR command blob (0x020C) and prints the descriptor strings so they
can be fed to bench_160 ``descrsweep`` (with --reset-raw/--canary) for a
photon decode. Raw-blob commands are reported as such.

Usage:
  bench_162_x2_cloud_dump.py <ip> <X2> <tag> <name-substring> [--sweep-file PATH]

  --sweep-file PATH   also write a descrsweep input file (one descriptor per
                      line, '# device / command' comments)
"""

from __future__ import annotations

import sys
import time
from pathlib import Path
from typing import Any

from bench_common import connect, save_json, setup_logging

if len(sys.argv) < 5:
    raise SystemExit(__doc__)

HOST, HUB_VERSION, TAG, NEEDLE = sys.argv[1:5]
rest = sys.argv[5:]
SWEEP_FILE = Path(rest[rest.index("--sweep-file") + 1]) if "--sweep-file" in rest else None

log_path = setup_logging(f"x2-cloud-dump-{TAG}")
print(f"logging to {log_path}")


def descriptor_of(blob: bytes) -> str | None:
    """Descriptive blobs carry the ASCII 'P:...' text after an 8-byte header."""
    if len(blob) < 10:
        return None
    text = blob[8:].split(b"\x00", 1)[0]
    if text.startswith(b"P:"):
        try:
            return text.decode("ascii").strip()
        except UnicodeDecodeError:
            return None
    idx = blob.find(b"P:")
    if idx >= 0:
        try:
            return blob[idx:].split(b"\x00", 1)[0].decode("ascii").strip()
        except UnicodeDecodeError:
            return None
    return None


proxy = connect(HOST, HUB_VERSION)
artifacts: dict[str, Any] = {"host": HOST, "needle": NEEDLE, "devices": []}
sweep_lines: list[str] = []
try:
    devices: dict[int, dict] = {}
    deadline = time.time() + 30
    while time.time() < deadline:
        devices, ready = proxy.get_devices()
        if ready and devices:
            break
        time.sleep(0.5)
    print(f"{len(devices)} devices on the hub")
    matches = {
        dev_id: dev for dev_id, dev in devices.items()
        if NEEDLE.lower() in str(dev.get("name") or dev.get("label") or "").lower()
    }
    if not matches:
        print("no device matches; names on the hub:")
        for dev_id, dev in devices.items():
            print(f"  {dev_id}: {dev.get('name') or dev.get('label')!r}")
        raise SystemExit(1)
    for dev_id, dev in matches.items():
        name = dev.get("name") or dev.get("label")
        extra = {k: v for k, v in dev.items() if k not in ("name", "label")}
        print(f"\n== device {dev_id} ({dev_id:#04x}): {name!r}  {extra}")
        names: dict[int, str] = {}
        cdeadline = time.time() + 15
        while time.time() < cdeadline:
            names, complete = proxy.get_commands_for_entity(dev_id)
            if complete:
                break
            time.sleep(0.5)
        dump = proxy.request_ir_command_dump(dev_id, timeout=10.0) or {}
        rows = dump.get("commands") or {}
        if isinstance(rows, dict):
            rows = list(rows.values())
        print(f"   {len(names)} command names, {len(rows)} dumped blobs")
        dev_out: dict[str, Any] = {"device_id": dev_id, "name": name, "raw": dev, "commands": []}
        for row in sorted(rows, key=lambda r: int(r.get("command_id", 0))):
            cid = int(row.get("command_id", 0))
            blob = row.get("ir_blob_hex") or row.get("blob") or b""
            if isinstance(blob, str):
                blob = bytes.fromhex(blob.replace(" ", ""))
            desc = descriptor_of(bytes(blob))
            label = row.get("label") or names.get(cid)
            entry = {"command_id": cid, "label": label, "descriptor": desc,
                     "blob_len": len(blob), "blob_hex": bytes(blob).hex(),
                     "keys": sorted(row.keys())}
            dev_out["commands"].append(entry)
            print(f"   {cid:3d} {str(label):24s} {desc or '(raw ' + str(len(blob)) + 'B)'}")
            if desc:
                sweep_lines.append(f"# {name} / {label} (cmd {cid})")
                sweep_lines.append(f"{desc} |")
        artifacts["devices"].append(dev_out)
finally:
    out = save_json(f"x2-cloud-dump-{TAG}", artifacts)
    proxy.stop()
    print(f"\nsaved {out}")
    if SWEEP_FILE and sweep_lines:
        SWEEP_FILE.write_text("\n".join(sweep_lines) + "\n", encoding="utf-8")
        print(f"sweep file {SWEEP_FILE} ({sum(1 for l in sweep_lines if not l.startswith('#'))} descriptors)")
