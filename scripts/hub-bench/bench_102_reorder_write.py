"""Validate X1Proxy.reorder_activities against the live hub.

Connects in control mode, prints the current activity order (names + sort
bytes), writes the order given on the command line through our own
family-0x51 implementation, and prints the read-back. Run after
bench_101 captured the app's write so this bench also restores the
pre-demo order.

    .venv-py313\\Scripts\\python.exe scripts\\hub-bench\\bench_102_reorder_write.py <ip> <X1|X1S|X2> <tag> <id,id,...>

ids are decimal or 0x.. activity ids in the desired display order.
"""

from __future__ import annotations

import sys

from bench_common import connect, save_json, setup_logging


def _snapshot(proxy) -> dict:
    rows = {}
    for act_lo, details in sorted(proxy.state.activities.items()):
        if not isinstance(details, dict):
            continue
        raw_body = details.get("raw_body")
        sort_byte = None
        if isinstance(raw_body, (bytes, bytearray)) and len(raw_body) > 6:
            sort_byte = int(raw_body[6])
        rows[f"0x{act_lo:02X}"] = {"id": act_lo, "name": details.get("name"), "sort": sort_byte}
    return rows


def main() -> None:
    if len(sys.argv) < 5:
        print(__doc__)
        raise SystemExit(2)
    host, hub_version, tag = sys.argv[1], sys.argv[2], sys.argv[3]
    ordered = [int(part, 0) & 0xFF for part in sys.argv[4].split(",") if part.strip()]

    log_path = setup_logging(f"reorder-write-{tag}")
    print(f"frame log: {log_path}")

    proxy = connect(host, hub_version)
    try:
        if not proxy._request_activities_and_wait():
            raise RuntimeError("activities catalog did not load")
        print("before:")
        for key, row in _snapshot(proxy).items():
            print(f"    {key} sort={row['sort']} name={row['name']!r}")

        print(f"writing order: {[f'0x{a:02X}' for a in ordered]}")
        result = proxy.reorder_activities(ordered)
        print(f"result: {result}")

        after = _snapshot(proxy)
        save_json(f"reorder-write-after-{tag}", after)
        print("after:")
        for key, row in after.items():
            print(f"    {key} sort={row['sort']} name={row['name']!r}")

        expected = {act_lo: position for position, act_lo in enumerate(ordered, start=1)}
        mismatches = [
            key for key, row in after.items() if expected.get(row["id"]) != row["sort"]
        ]
        print("MATCH: hub order == requested order" if not mismatches else f"MISMATCH on {mismatches}")
    finally:
        proxy.stop()


if __name__ == "__main__":
    main()
