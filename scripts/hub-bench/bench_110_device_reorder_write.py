"""Validate X1Proxy.reorder_devices against the live hub.

Connects in control mode, prints the current device order (names + sort
bytes + record-kind markers), writes the order given on the command line
through our own family-0x11 implementation, and prints the read-back.
Run twice per hub: once with a permuted order, once with the original
order to restore it.

    .venv-py313\\Scripts\\python.exe scripts\\hub-bench\\bench_110_device_reorder_write.py <ip> <X1|X1S|X2> <tag> <id,id,...>

ids are decimal or 0x.. device ids in the desired display order.
Pass "snapshot" instead of the id list to only print the current order.
"""

from __future__ import annotations

import sys

from bench_common import connect, save_json, setup_logging


def _snapshot(proxy) -> dict:
    rows = {}
    for dev_lo, details in sorted(proxy.state.devices.items()):
        if not isinstance(details, dict):
            continue
        raw_body = details.get("raw_body")
        sort_byte = None
        kind = None
        if isinstance(raw_body, (bytes, bytearray)) and len(raw_body) > 6:
            kind = int(raw_body[3])
            sort_byte = int(raw_body[6])
        rows[f"0x{dev_lo:02X}"] = {
            "id": dev_lo,
            "name": details.get("name"),
            "kind": kind,
            "sort": sort_byte,
        }
    return rows


def main() -> None:
    if len(sys.argv) < 5:
        print(__doc__)
        raise SystemExit(2)
    host, hub_version, tag = sys.argv[1], sys.argv[2], sys.argv[3]
    snapshot_only = sys.argv[4].strip().lower() == "snapshot"
    ordered = (
        []
        if snapshot_only
        else [int(part, 0) & 0xFF for part in sys.argv[4].split(",") if part.strip()]
    )

    log_path = setup_logging(f"device-reorder-{tag}")
    print(f"frame log: {log_path}")

    proxy = connect(host, hub_version)
    try:
        if not proxy._request_devices_and_wait():
            raise RuntimeError("devices catalog did not load")
        before = _snapshot(proxy)
        save_json(f"device-reorder-before-{tag}", before)
        print("before:")
        for key, row in before.items():
            print(f"    {key} kind={row['kind']} sort={row['sort']} name={row['name']!r}")
        if snapshot_only:
            return

        print(f"writing order: {[f'0x{d:02X}' for d in ordered]}")
        result = proxy.reorder_devices(ordered)
        print(f"result: {result}")

        after = _snapshot(proxy)
        save_json(f"device-reorder-after-{tag}", after)
        print("after:")
        for key, row in after.items():
            print(f"    {key} kind={row['kind']} sort={row['sort']} name={row['name']!r}")

        expected = {dev_lo: position for position, dev_lo in enumerate(ordered, start=1)}
        mismatches = [
            key for key, row in after.items() if expected.get(row["id"]) != row["sort"]
        ]
        print("MATCH: hub order == requested order" if not mismatches else f"MISMATCH on {mismatches}")
    finally:
        proxy.stop()


if __name__ == "__main__":
    main()
