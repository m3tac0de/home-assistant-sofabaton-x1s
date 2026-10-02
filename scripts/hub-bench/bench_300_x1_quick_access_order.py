"""X1 quick-access order: restore writes the table whole, writers repair it.

Finding 2026-09-30 (Marcel's X1): the activity restore staged a one-entry
family-0x61 order per favorite and never listed macro shortcuts, so a
restored activity kept records its order table left out; the remote drew
each at the slot equal to its id, covering another entry, and left the last
row empty. The fix: the restore stages the table as it stands and ends with
one write of the captured order; every X1 order writer puts back live
records the table leaves out.

Non-destructive for the real activities: the restore is checked on a COPY
of one activity (restore_activity appends it), the repair on that copy
after breaking its order on purpose. The real activities are only read,
unless --repair-real is given. The HA X1 entry must be disabled first
(scripts/hub-bench/ha_entry.py) and re-enabled after.

Usage:
    python bench_300_x1_quick_access_order.py <ip> <tag> [--source 0x65] [--keep] [--repair-real]
    python bench_300_x1_quick_access_order.py <ip> <tag> --cleanup

--keep leaves the copy on the hub (and resyncs the remote) for a look at
the physical remote; --cleanup deletes it.
"""

from __future__ import annotations

import sys
import time

from bench_common import connect, save_json, setup_logging

HOST = sys.argv[1]
TAG = sys.argv[2]
ARGS = sys.argv[3:]
COPY_NAME = "Bench QA order"


def _arg(name: str, default: str) -> str:
    return ARGS[ARGS.index(name) + 1] if name in ARGS else default


SOURCE = int(_arg("--source", "0x65"), 0)
checks: list[tuple[str, bool, str]] = []


def check(name: str, ok: bool, detail: str = "") -> bool:
    checks.append((name, ok, detail))
    print(f"[{'PASS' if ok else 'FAIL'}] {name}{': ' + detail if detail else ''}")
    return ok


def activities(proxy) -> dict[int, str]:
    proxy._refresh_catalog("activities", timeout=15.0)
    deadline = time.time() + 10
    acts: dict = {}
    while time.time() < deadline:
        acts, ready = proxy.get_activities(force_refresh=False)
        if ready:
            break
        time.sleep(0.3)
    return {int(k): (v.get("name") if isinstance(v, dict) else str(v)) for k, v in (acts or {}).items()}


def quick_access(proxy, act: int) -> dict:
    """Live records (fresh keymap + macros read) and the order table."""

    live = proxy._x1_live_quick_access_ids(act)
    order = proxy.request_favorites_order(act)
    order_ids = [fav_id for fav_id, _slot in sorted(order or [], key=lambda pair: pair[1])]
    return {
        "live": sorted(live) if live is not None else None,
        "order": order_ids if order is not None else None,
        "unlisted": sorted(set(live or ()) - set(order_ids)) if live is not None and order is not None else None,
    }


def find_copy(proxy) -> int | None:
    return next((act for act, name in activities(proxy).items() if name == COPY_NAME), None)


def main() -> int:
    log_path = setup_logging(f"qa-order-{TAG}")
    print(f"logging to {log_path}")
    proxy = connect(HOST, "X1")
    try:
        if "--cleanup" in ARGS:
            copy_id = find_copy(proxy)
            if copy_id is None:
                print("no bench copy on the hub")
                return 0
            result = proxy.delete_device(copy_id)
            print("delete copy:", result)
            time.sleep(3)
            check("copy deleted", find_copy(proxy) is None)
            proxy.resync_remote()
            return 0 if all(ok for _n, ok, _d in checks) else 1

        # 1. Read every real activity (read-only).
        names = activities(proxy)
        if COPY_NAME in names.values():
            print(f"{COPY_NAME!r} already on the hub: run --cleanup first")
            return 2
        before = {act: quick_access(proxy, act) for act in sorted(names)}
        for act, state in before.items():
            print(f"act 0x{act:02X} {names[act]!r}: {state}")
        save_json(f"qa-order-{TAG}-before", {"activities": names, "quick_access": {f"0x{a:02X}": s for a, s in before.items()}})

        # 2. Restore a copy of the source activity and check its table.
        payload = proxy.backup_activity(SOURCE)
        if not payload:
            print(f"could not back up activity 0x{SOURCE:02X}")
            return 2
        save_json(f"qa-order-{TAG}-source", payload)
        payload["device"]["name"] = COPY_NAME
        refs = payload.get("referenced_source_device_ids") or []
        device_id_map = {int(d): int(d) for d in refs if int(d) < 0x65}
        captured = list(payload.get("favorites_order") or [])
        print("captured favorites_order:", captured)
        result = proxy.restore_activity(payload, device_id_map=device_id_map, send_remote_sync=False)
        print("restore_activity:", result)
        if not check("copy restored", bool(result) and result.get("status") == "success", str(result)):
            return 1
        copy_id = int(result["activity_id"]) & 0xFF
        restored = quick_access(proxy, copy_id)
        print(f"copy 0x{copy_id:02X}: {restored}")
        source_live = before[SOURCE]["live"] or []
        check("copy holds as many records as the source", len(restored["live"] or []) == len(source_live),
              f"{restored['live']} vs {source_live}")
        check("copy's order lists every record once",
              restored["unlisted"] == [] and len(restored["order"] or []) == len(set(restored["order"] or [])),
              str(restored))

        # 3. Break the copy's order the way the old restore did (leave one
        #    record out), then let a reorder repair it.
        order = list(restored["order"] or [])
        if len(order) >= 2:
            dropped = order[1]
            partial = [fav_id for fav_id in order if fav_id != dropped]
            proxy.reset_ack_queues()
            step = proxy._send_step(step_name="bench-break-61", family=0x61,
                                    payload=proxy._build_favorites_reorder_payload(copy_id, partial), ack_opcode=0x0103)
            step2 = proxy._send_step(step_name="bench-break-65", family=0x65, payload=bytes([copy_id]), ack_opcode=0x0103)
            broken = quick_access(proxy, copy_id)
            print("broken:", broken)
            check("order broken on purpose", step.ok and step2.ok and broken["unlisted"] == [dropped], str(broken))
            repaired = proxy.reorder_favorites(copy_id, broken["order"], refresh_after_write=False)
            print("reorder (repair):", repaired)
            after = quick_access(proxy, copy_id)
            print("after repair:", after)
            check("repair lists every record", after["unlisted"] == [], str(after))
            check("repaired record back at the slot it was drawn at",
                  (after["order"] or []).index(dropped) == min(dropped - 1, len(after["order"]) - 1) if after["order"] else False,
                  f"{dropped} in {after['order']}")
        else:
            check("source has two or more quick-access entries", False, str(order))

        # 4. Optional: repair the real activities that leave records out.
        if "--repair-real" in ARGS:
            for act, state in before.items():
                if state["unlisted"]:
                    print(f"repairing act 0x{act:02X}: order {state['order']} leaves out {state['unlisted']}")
                    proxy.reorder_favorites(act, state["order"], refresh_after_write=False)
                    fixed = quick_access(proxy, act)
                    check(f"real act 0x{act:02X} repaired", fixed["unlisted"] == [], str(fixed))

        after_all = {act: quick_access(proxy, act) for act in sorted(names)}
        untouched = [act for act in names if "--repair-real" not in ARGS and after_all[act] != before[act]]
        check("real activities untouched", not untouched, str(untouched))
        save_json(f"qa-order-{TAG}-after", {f"0x{a:02X}": s for a, s in after_all.items()})

        if "--keep" in ARGS:
            proxy.resync_remote()
            print(f"kept {COPY_NAME!r} (0x{copy_id:02X}) and resynced the remote; --cleanup deletes it")
        else:
            proxy.delete_device(copy_id)
            time.sleep(3)
            check("copy deleted", find_copy(proxy) is None)
            if "--repair-real" in ARGS:
                proxy.resync_remote()
    finally:
        proxy.stop()
        print("disconnected")
        failed = [name for name, ok, _d in checks if not ok]
        print(f"{len(checks) - len(failed)}/{len(checks)} checks passed" + (f"; FAILED: {failed}" if failed else ""))
    return 0 if all(ok for _n, ok, _d in checks) else 1


if __name__ == "__main__":
    sys.exit(main())
