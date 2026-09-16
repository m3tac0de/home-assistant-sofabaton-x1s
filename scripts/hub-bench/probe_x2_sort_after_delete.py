"""X2 'MQTT test' (dev 1) probe for the family-0x61 display-sort table around
command add / delete, through the deployed HA integration.

Run 1 (2026-09-16, before the fix) showed: our add registration wrote an
all-0xFF table with the new command at 0x00 (the command-list record's
0xFF "unpositioned" byte was taken for a position), and the hub KEPT the
deleted command's slot after a delete.

Run 2 (after the fix + the command_sort_rewrite plan step):
  add a command  -> table must list every command with positions 1..n
                    (no 0x00/0xFF, no id that is not on the device)
  delete cmd     -> plan ends [..., command_delete, command_sort_rewrite];
                    table must drop the id and read 1..n again, order kept.

Usage: python probe_x2_sort_after_delete.py [--tag T]
"""
import asyncio, copy, json, subprocess, sys, importlib.util

TAG = sys.argv[sys.argv.index("--tag") + 1] if "--tag" in sys.argv else "probe-sort"
sys.argv = ["x", "-", "-"]
spec = importlib.util.spec_from_file_location("b", "bench_240_command_delete_ha.py"); b = importlib.util.module_from_spec(spec); spec.loader.exec_module(b)
DEV = 1
checks = []


def check(label, ok, detail=""):
    checks.append((label, bool(ok), detail))
    print(f"  {'OK  ' if ok else 'FAIL'} {label}" + (f" -- {detail}" if detail else ""))


def pairs(msg_hex):
    raw = bytes.fromhex((msg_hex or "").replace(" ", ""))
    return [(raw[i], raw[i + 1]) for i in range(0, len(raw) - 1, 2)]


def well_formed(table, cmds):
    """Every command exactly once, positions exactly 1..n, no sentinels."""
    ids = [c for c, _ in table]
    pos = sorted(p for _, p in table)
    return sorted(ids) == sorted(cmds) and pos == list(range(1, len(cmds) + 1))


async def read(ha, entry):
    r, _ = await ha.call({"type": "sofabaton_x1s/persistent_cache/refresh", "entry_id": entry, "kind": "device", "target_id": DEV}, timeout=240)
    assert r.get("success"), r
    bundle = await b.structural_bundle(ha, entry)
    row = b.device_row(bundle, DEV)
    cmds = sorted(c["command_id"] for c in row.get("commands") or [])
    ks = (row.get("key_sort") or {}).get("msg_hex") or ""
    return bundle, cmds, pairs(ks)


async def main():
    async with b.HaWs() as ha:
        hub = await b.pick(ha, "01KKSY1K"); entry = hub["entry_id"]
        bundle, cmds, table = await read(ha, entry)
        print("before: commands", cmds, "sort", table)
        new_id = max(cmds) + 1
        edited = copy.deepcopy(bundle)
        erow = b.device_row(edited, DEV)
        erow["commands"].append({"command_id": new_id, "name": f"Bench sort {new_id}", "restore_data": {
            "transport": "hub_code_record", "new": True,
            "decoded": {"class": "wifi_mqtt", "trailer_hex": "", "edited": True, "fields": {"device_id": DEV, "command_id": new_id}}}})
        r, _ = await ha.call({"type": "sofabaton_x1s/device/sync", "entry_id": entry, "device_id": DEV, "baseline": bundle, "edited": edited}, timeout=240)
        check("add: device/sync accepted", r.get("success") is True, str(r.get("error")))
        op = await b.wait_op(ha, entry, "device_sync")
        check("add: device_sync finished", op.get("status") == "success", f"{op.get('status')} {op.get('message')}")
        bundle, cmds, table = await read(ha, entry)
        print("after add: commands", cmds, "sort", table)
        check("add: new command on the device", new_id in cmds, str(cmds))
        check("add: sort table lists every command once with positions 1..n", well_formed(table, cmds), str(table))
        check("add: new command is last", table and max(table, key=lambda p: p[1])[0] == new_id, str(table))
        order_before = [c for c, _ in sorted(table, key=lambda p: p[1])]
    victim = cmds[0]
    print(f"\n--- deleting command {victim} via bench_240 ---")
    out = subprocess.run([sys.executable, "bench_240_command_delete_ha.py", "01KKSY1K", TAG, "--device", str(DEV), "--command", str(victim)], capture_output=True, text=True)
    lines = out.stdout.splitlines()
    print("\n".join(l for l in lines if l.startswith("  OK") or l.startswith("  FAIL") or "checks passed" in l or l.startswith("  plan")))
    plan_line = next((l for l in lines if l.startswith("  plan")), "")
    check("delete: plan ends with command_delete, command_sort_rewrite", plan_line.rstrip().endswith("'command_delete', 'command_sort_rewrite']"), plan_line.strip())
    check("delete: bench_240 all green", "FAIL" not in out.stdout and out.returncode == 0, f"rc={out.returncode}")
    async with b.HaWs() as ha:
        hub = await b.pick(ha, "01KKSY1K"); entry = hub["entry_id"]
        bundle, cmds, table = await read(ha, entry)
        print("after delete: commands", cmds, "sort", table)
        check("delete: victim gone from the sort table", all(c != victim for c, _ in table), str(table))
        check("delete: sort table lists every command once with positions 1..n", well_formed(table, cmds), str(table))
        order_after = [c for c, _ in sorted(table, key=lambda p: p[1])]
        check("delete: surviving order preserved", order_after == [c for c in order_before if c != victim], f"{order_before} -> {order_after}")
    failed = [c for c in checks if not c[1]]
    print(f"\n{len(checks) - len(failed)}/{len(checks)} probe checks passed")
    return 1 if failed else 0


raise SystemExit(asyncio.run(main()))
