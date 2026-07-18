"""Sequencer-validation: set_hub_name round-trip (hub_name exchange).

Reads the current hub name, renames to "<name> SEQ", verifies the echoed
name, and restores the original. First live run of the hub_name exchange
scope (family 0x14 send + wait_for_ack_family_low inside one scope).

Usage: bench_122_seq_hubname.py <ip> <X1|X1S|X2> <tag>
"""

from __future__ import annotations

import sys

from bench_common import connect, save_json, setup_logging

HOST = sys.argv[1]
HUB_VERSION = sys.argv[2]
TAG = sys.argv[3]

log_path = setup_logging(f"seq-hubname-{TAG}")
print(f"logging to {log_path}")

checks: list[tuple[str, bool, str]] = []


def check(label: str, ok: bool, detail: str = "") -> None:
    checks.append((label, bool(ok), detail))
    print(f"  {'OK  ' if ok else 'FAIL'} {label}" + (f" — {detail}" if detail else ""))


proxy = connect(HOST, HUB_VERSION)
artifacts: dict = {"host": HOST}
original = None
try:
    info, ready = proxy.fetch_banner_info(force_refresh=True, timeout=5.0)
    original = str(info.get("name") or "").strip()
    check("GATE: banner name readable", bool(original), f"name={original!r} ready={ready}")
    if not original:
        raise SystemExit("no hub name to rename; refusing")

    temp_name = f"{original} SEQ"[:20]
    ok = proxy.set_hub_name(temp_name)
    check("set_hub_name(temp) acked", ok, f"temp={temp_name!r}")

    cached = str(proxy.get_banner_info().get("name") or "")
    check("cached name updated", cached == temp_name, f"cached={cached!r}")

    ok = proxy.set_hub_name(original)
    check("set_hub_name(original) acked", ok, f"restore={original!r}")
    cached = str(proxy.get_banner_info().get("name") or "")
    check("original name restored", cached == original, f"cached={cached!r}")

    artifacts.update({"original": original, "temp": temp_name})
finally:
    artifacts["checks"] = [{"label": l, "ok": ok, "detail": d} for l, ok, d in checks]
    save_json(f"seq-hubname-{TAG}", artifacts)
    proxy.stop()
    print("disconnected")

failed = [c for c in checks if not c[1]]
print(f"\n{len(checks) - len(failed)}/{len(checks)} checks passed")
if failed:
    sys.exit(1)
