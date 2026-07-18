"""Wifi Commands program chunk 5: re-sync cycle, rollback, single-member GC.

Plan: docs/internal/wifi-commands-bench-plan.md (chunk 5). Starts from
the chunk-4 deployment (device + activity edits left in place;
``out/wifi-c4-deploy-<tag>.json`` carries the device id and the
pre-deploy activity baselines used for sweep comparisons).

Phases:

A. **Re-sync step 1 = managed-device delete**: delete the deployed
   device, wait out the late GC, then verify the sweep — device gone,
   favorites/bindings/macro steps referencing it swept, touched
   activities byte-identical to their pre-deploy baselines, untouched
   activity still pristine. **Documents the single-member-GC answer**:
   is Bench Test (0x68) purged by the delete that starts every
   routine re-sync?
B. **Re-deploy** (create → add ×2 → favorites ×5 + reorder → bindings
   → resync) and verify the activities heal with no duplicates or
   leftovers.
C. **Delete again** → activities must return to pre-deploy baselines a
   second time (the re-sync cycle is idempotent).
D. **Rollback probe**: create a fresh device, drive
   ``add_device_to_activity`` against a nonexistent activity id (the
   orchestrator's rollback trigger), confirm it fails cleanly with no
   partial writes, delete the half-deployed device, catalog back at
   baseline.

Cleanup after this script: re-run ``bench_63_bench_test_restore.py``
(every phase's delete purges single-member Bench Test), then compare
the catalog against the chunk-1 bundle (done here in the final phase).

Usage:
    python bench_85_wifi_resync.py <ip> <X1|X1S> <tag>
"""

from __future__ import annotations

import copy
import json
import sys
import time

from bench_common import BENCH_DIR, connect, save_json, setup_logging
from bench_wifi_listener import local_ip_toward

from x1slib.protocol_const import ButtonName

HOST = sys.argv[1]
HUB_VERSION = sys.argv[2]
TAG = sys.argv[3]
# --resume <dev_hex>: skip phases A + B-deploy (hub already carries the
# re-deployed device, e.g. after the transport BufferError crash) and
# continue from the heal verification.
RESUME_DEV = None
if "--resume" in sys.argv:
    RESUME_DEV = int(sys.argv[sys.argv.index("--resume") + 1], 0)

LISTENER_PORT = 8060
DEVICE_NAME = "Bench Wifi C4"
BRAND_NAME = "m3-benchwifi-c4deploy000000"
SLOT_NAMES = [
    "Bench One", "Bench Two", "Bench Three", "Bench Four", "Bench Five",
    "Bench Six", "Bench Seven", "Bench Eight", "Bench Nine", "Bench Ten",
]
POWER_ON_ID = 1
POWER_OFF_ID = 2
INPUT_IDS = [3]
LONG_PRESS_OFFSET = 10
ACT_A = 0x65
ACT_B = 0x66
ACT_UNTOUCHED = 0x67
BENCH_TEST_ACTIVITY = 0x68
NONEXISTENT_ACT = 0x70
FAVORITE_CMD_IDS = [1, 2, 3, 4, 5]

log_path = setup_logging(f"wifi-c5-resync-{TAG}")
print(f"logging to {log_path}")

c4 = json.loads((BENCH_DIR / f"wifi-c4-deploy-{TAG}.json").read_text(encoding="utf-8"))
DEPLOYED_DEV = int(c4["deployment"]["device_id"])
pre_acts = {int(k, 16): v for k, v in c4["pre_activities"].items()}
c1_bundle = json.loads((BENCH_DIR / f"wifi-c1-bundle-{TAG}.json").read_text(encoding="utf-8"))
c1_devices = {
    int((d.get("device") or {}).get("device_id") or 0): str((d.get("device") or {}).get("name"))
    for d in c1_bundle.get("devices") or []
}
c1_activities = {
    int((a.get("device") or {}).get("device_id") or 0): str((a.get("device") or {}).get("name"))
    for a in c1_bundle.get("activities") or []
}


def build_command_defs() -> list[dict]:
    defs: list[dict] = []
    for idx, name in enumerate(SLOT_NAMES):
        defs.append({"display_name": name, "trigger_name": name, "press_type": "short", "command_index": idx})
    for idx, name in enumerate(SLOT_NAMES):
        defs.append({"display_name": f"{name} Long Press", "trigger_name": name, "press_type": "long", "command_index": idx})
    return defs


BENCH_BUTTONS = (ButtonName.RED, ButtonName.BLUE)  # deploy-target hard buttons


def canon(payload: dict) -> str:
    # power_state in the activity header is the live active flag
    # (runtime, hub-owned), not configuration — excluded like the
    # capture timestamps.
    def strip(node):
        if isinstance(node, dict):
            return {
                k: strip(v)
                for k, v in node.items()
                if k not in ("captured_at", "fetched_at", "power_state")
            }
        if isinstance(node, list):
            return [strip(v) for v in node]
        return node

    return json.dumps(strip(copy.deepcopy(payload)), sort_keys=True)


def canon_diff_note(a: dict, b: dict) -> str:
    ca, cb = canon(a), canon(b)
    if ca == cb:
        return "equal"
    for key in sorted(set(a) | set(b)):
        if key in ("captured_at", "fetched_at"):
            continue
        if canon({"k": a.get(key)}) != canon({"k": b.get(key)}):
            return f"first differing top-level key: {key!r}"
    return "differs (nested)"


checks: list[tuple[str, bool, str]] = []


def check(label: str, ok: bool, detail: str = "") -> None:
    checks.append((label, bool(ok), detail))
    print(f"  {'OK  ' if ok else 'FAIL'} {label}" + (f" — {detail}" if detail else ""))


def snapshot_catalog(proxy) -> tuple[dict, dict]:
    proxy.request_devices()
    proxy.request_activities()
    deadline = time.time() + 20
    devs = acts = None
    while time.time() < deadline:
        devs, devs_ready = proxy.get_devices()
        acts, acts_ready = proxy.get_activities(force_refresh=False)
        if devs_ready and acts_ready:
            break
        time.sleep(0.5)
    return dict(devs or {}), dict(acts or {})


def deploy(proxy, dev: int) -> bool:
    """Chunk-4 deploy tail: add ×2 → favorites ×5 + reorder → bindings → resync."""
    input_map = {ACT_B: INPUT_IDS[0]}
    for act in sorted([ACT_A, ACT_B]):
        r = proxy.add_device_to_activity(act, dev, input_cmd_id=input_map.get(act))
        check(f"re-deploy: add_device_to_activity 0x{act:02X}", bool(r), f"{r}")
        if not r:
            return False
    proxy.get_commands_for_entity(dev, fetch_if_missing=True)
    deadline = time.time() + 10
    while time.time() < deadline and dev not in getattr(proxy, "_commands_complete", set()):
        time.sleep(0.3)
    new_fav_ids: list[int] = []
    for cid in FAVORITE_CMD_IDS:
        r = proxy.command_to_favorite(ACT_A, dev, cid, refresh_after_write=False)
        if r and r.get("fav_id") is not None:
            new_fav_ids.append(int(r["fav_id"]))
    check("re-deploy: 5 favorites added", len(new_fav_ids) == 5, f"{new_fav_ids}")
    all_order = proxy.request_favorites_order(ACT_A)
    if all_order:
        new_set = set(new_fav_ids)
        pre_existing = [f for f, _s in sorted(all_order, key=lambda x: x[1]) if f not in new_set]
        r = proxy.reorder_favorites(ACT_A, pre_existing + new_fav_ids, refresh_after_write=False)
        check("re-deploy: reorder", bool(r), f"{r}")
    r = proxy.command_to_button(
        ACT_A, ButtonName.RED, dev, 1,
        long_press_device_id=dev, long_press_command_id=1 + LONG_PRESS_OFFSET,
        refresh_after_write=False,
    )
    check("re-deploy: RED binding", bool(r), f"{r}")
    r = proxy.command_to_button(ACT_B, ButtonName.BLUE, dev, 2, refresh_after_write=False)
    check("re-deploy: BLUE binding", bool(r), f"{r}")
    check("re-deploy: resync_remote", bool(proxy.resync_remote(HUB_VERSION)), "")
    return True


def _is_noop_binding(row: dict) -> bool:
    """Placeholder rows bound to nothing (known app/hub residue pattern)."""
    return (row.get("command_id") in (None, 0)) and (
        row.get("long_press_command_id") in (None, 0)
    )


def _strip_noop_bindings(payload: dict) -> dict:
    out = copy.deepcopy(payload)
    out["button_bindings"] = [
        b for b in out.get("button_bindings") or [] if not _is_noop_binding(b)
    ]
    return out


def _strip_bench_button_rows(payload: dict) -> dict:
    """Drop binding rows on the deploy-target buttons from a compare.

    The deploy OVERWRITES whatever those buttons held, and the delete
    sweep then removes the row entirely (X1S finding, this chunk) — so
    a pre-existing binding on a deploy-target button is permanently
    lost across a re-sync cycle. The bench repairs them from the
    baselines in the final phase; comparisons in between exclude the
    two rows and report them separately.
    """
    out = copy.deepcopy(payload)
    out["button_bindings"] = [
        b
        for b in out.get("button_bindings") or []
        if int(b.get("button_id", -1)) not in BENCH_BUTTONS
    ]
    return out


def verify_swept(proxy, label: str) -> dict[int, dict]:
    """Post-delete re-reads: touched activities back at pre-deploy baselines.

    Strict byte-identity first; if only no-op binding rows differ (the
    sweep nulls swept bindings instead of deleting the rows — same
    residue shape the app leaves when a user clears a binding, see
    bench_compare._is_noop_binding), that is hub-owned residue, not a
    deploy leftover, and passes the tolerant check.
    """
    out: dict[int, dict] = {}
    for act in (ACT_A, ACT_B, ACT_UNTOUCHED):
        payload = proxy.backup_activity(act)
        check(f"{label}: re-read 0x{act:02X}", isinstance(payload, dict))
        if not isinstance(payload, dict):
            continue
        out[act] = payload
        artifacts.setdefault("sweep_rereads", {})[f"{label}-0x{act:02X}"] = payload
        base = pre_acts.get(act)
        if base is None:
            check(f"{label}: 0x{act:02X} baseline available", False)
            continue
        strict = canon(base) == canon(payload)
        if strict:
            check(f"{label}: 0x{act:02X} byte-identical to pre-deploy baseline", True, "equal")
            continue
        tolerant = canon(
            _strip_noop_bindings(_strip_bench_button_rows(base))
        ) == canon(_strip_noop_bindings(_strip_bench_button_rows(payload)))
        pre_rows = {json.dumps(b, sort_keys=True) for b in base.get("button_bindings") or []}
        post_rows = {json.dumps(b, sort_keys=True) for b in payload.get("button_bindings") or []}
        detail = (
            f"added={sorted(post_rows - pre_rows)} removed={sorted(pre_rows - post_rows)}"
            if pre_rows != post_rows
            else canon_diff_note(base, payload)
        )
        check(
            f"{label}: 0x{act:02X} identical modulo deploy-target button rows",
            tolerant,
            detail[:400],
        )
    return out


bench_ip = local_ip_toward(HOST)
proxy = connect(HOST, HUB_VERSION)
artifacts: dict = {"host": HOST, "hub_version": HUB_VERSION, "deployed_dev": DEPLOYED_DEV}
try:
    devs0, acts0 = snapshot_catalog(proxy)
    print(f"catalog at start: {len(devs0)} devices, {len(acts0)} activities")
    start_dev = RESUME_DEV if RESUME_DEV is not None else DEPLOYED_DEV
    check(
        "deployment present at start",
        start_dev in devs0,
        f"dev=0x{start_dev:02X} bench-test={'present' if BENCH_TEST_ACTIVITY in acts0 else 'absent'}",
    )
    bench_test_before = BENCH_TEST_ACTIVITY in acts0
    baseline_devs = sorted(set(devs0) - {start_dev})

    if RESUME_DEV is None:
        # ================= Phase A: the re-sync's opening delete =============
        print(f"\nPhase A: delete managed device 0x{DEPLOYED_DEV:02X} (re-sync step 1)...")
        r = proxy.delete_device(DEPLOYED_DEV)
        artifacts["delete_1"] = r
        check("A: delete_device success", bool(r) and r.get("status") == "success", f"{r}")
        print("  waiting 12s for the late GC sweep...")
        time.sleep(12.0)
        devs1, acts1 = snapshot_catalog(proxy)
        check("A: device gone from catalog", DEPLOYED_DEV not in devs1, f"{sorted(devs1)}")
        bench_test_after = BENCH_TEST_ACTIVITY in acts1
        artifacts["single_member_gc"] = {
            "bench_test_before_delete": bench_test_before,
            "bench_test_after_delete": bench_test_after,
        }
        print(
            f"  SINGLE-MEMBER-GC ANSWER: Bench Test (0x68) "
            f"{'PURGED by the re-sync delete' if bench_test_before and not bench_test_after else 'survived' if bench_test_after else 'was already absent'}"
        )
        check(
            "A: protected multi-member activities survive the sweep",
            all(a in acts1 for a in (ACT_A, ACT_B, ACT_UNTOUCHED)),
            f"{sorted(acts1)}",
        )
        verify_swept(proxy, "A(sweep)")

        # ================= Phase B: re-deploy (re-sync step 2) ===============
        print("\nPhase B: recreate + re-deploy...")
        r = proxy.create_wifi_device(
            device_name=DEVICE_NAME,
            commands=build_command_defs(),
            request_port=LISTENER_PORT,
            brand_name=BRAND_NAME,
            power_on_command_id=POWER_ON_ID,
            power_off_command_id=POWER_OFF_ID,
            input_command_ids=INPUT_IDS,
        )
        check("B: recreate succeeded", bool(r) and r.get("status") == "success", f"{r}")
        if not r or r.get("status") != "success":
            raise SystemExit("recreate failed; stopping")
        dev2 = int(r["device_id"])
        print(f"  re-created device: 0x{dev2:02X}")
        artifacts["redeploy_device_id"] = dev2
        if not deploy(proxy, dev2):
            raise SystemExit("re-deploy failed; stopping")
    else:
        dev2 = RESUME_DEV
        print(f"\nresuming at heal verification with deployed dev=0x{dev2:02X}")
        artifacts["redeploy_device_id"] = dev2

    # heal verification: no duplicates or leftovers
    post_a = proxy.backup_activity(ACT_A)
    post_b = proxy.backup_activity(ACT_B)
    artifacts["heal_act_a"] = post_a
    artifacts["heal_act_b"] = post_b
    ok_shape = isinstance(post_a, dict) and isinstance(post_b, dict)
    check("B: heal re-reads returned", ok_shape)
    if ok_shape:
        dev_favs = [s for s in post_a.get("favorite_slots") or [] if int(s.get("device_id", 0)) == dev2]
        check(
            "B: exactly 5 favorites, no duplicates",
            len(dev_favs) == 5 and {int(s.get("command_id", 0)) for s in dev_favs} == set(FAVORITE_CMD_IDS),
            f"{[(s.get('command_id'), s.get('button_id')) for s in dev_favs]}",
        )
        red_rows = [b for b in post_a.get("button_bindings") or [] if int(b.get("button_id", -1)) == ButtonName.RED]
        blue_rows = [b for b in post_b.get("button_bindings") or [] if int(b.get("button_id", -1)) == ButtonName.BLUE]
        check(
            "B: single RED binding, short 1 + long 11",
            len(red_rows) == 1
            and int(red_rows[0].get("device_id", 0)) == dev2
            and int(red_rows[0].get("command_id", 0)) == 1
            and int(red_rows[0].get("long_press_command_id") or 0) == 11,
            json.dumps(red_rows),
        )
        check(
            "B: single BLUE binding, short 2",
            len(blue_rows) == 1
            and int(blue_rows[0].get("device_id", 0)) == dev2
            and int(blue_rows[0].get("command_id", 0)) == 2,
            json.dumps(blue_rows),
        )
        for act_payload, act_label, want_idx in ((post_a, "0x65", 0), (post_b, "0x66", 1)):
            for key, want_n in ((0xC6, 2), (0xC7, 1)):  # ON: power+input steps, OFF: power
                rows = [
                    s
                    for m in act_payload.get("macros") or []
                    if m.get("button_id", m.get("key_id")) == key
                    for s in m.get("steps") or []
                    if int(s.get("device_id", -1)) == dev2
                ]
                check(
                    f"B: {act_label} macro 0x{key:02X} has exactly {want_n} device step(s)",
                    len(rows) == want_n,
                    json.dumps(rows),
                )
        members_a = post_a.get("referenced_source_device_ids") or []
        check("B: no duplicate members", len(members_a) == len(set(members_a)), f"{members_a}")

    # ================= Phase C: delete again (cycle idempotence) =============
    print(f"\nPhase C: delete re-deployed device 0x{dev2:02X}...")
    r = proxy.delete_device(dev2)
    check("C: delete_device success", bool(r) and r.get("status") == "success", f"{r}")
    time.sleep(12.0)
    verify_swept(proxy, "C(2nd sweep)")

    # ================= Phase D: rollback probe ===============================
    print("\nPhase D: rollback probe (add to nonexistent activity)...")
    r = proxy.create_wifi_device(
        device_name="Bench Rollback",
        commands=build_command_defs()[:2],  # minimal profile
        request_port=LISTENER_PORT,
        brand_name="m3-benchwifi-rollback000000",
    )
    check("D: half-deploy create succeeded", bool(r) and r.get("status") == "success", f"{r}")
    dev3 = int(r["device_id"]) if r and r.get("status") == "success" else None
    if dev3 is not None:
        r_add = proxy.add_device_to_activity(NONEXISTENT_ACT, dev3)
        check(
            "D: add to nonexistent activity fails cleanly",
            not r_add,
            f"result={r_add}",
        )
        act_a_after = proxy.backup_activity(ACT_A)
        check(
            "D: no partial writes on real activities",
            isinstance(act_a_after, dict)
            and canon(_strip_noop_bindings(_strip_bench_button_rows(act_a_after)))
            == canon(_strip_noop_bindings(_strip_bench_button_rows(pre_acts[ACT_A]))),
            canon_diff_note(pre_acts[ACT_A], act_a_after or {}),
        )
        r = proxy.delete_device(dev3)
        check("D: rollback delete success", bool(r) and r.get("status") == "success", f"{r}")
        time.sleep(8.0)

    # ================= final: catalog vs chunk-1 bundle ======================
    devs_f, acts_f = snapshot_catalog(proxy)
    got_devices = {k: str((v or {}).get("name")) for k, v in devs_f.items()}
    check(
        "FINAL: device catalog matches chunk-1 bundle",
        got_devices == c1_devices,
        f"got={sorted(got_devices.items())}" if got_devices != c1_devices else f"{len(got_devices)} devices",
    )
    expected_acts = {k: v for k, v in c1_activities.items() if k != BENCH_TEST_ACTIVITY}
    got_acts = {k: str((v or {}).get("name")) for k, v in acts_f.items() if k != BENCH_TEST_ACTIVITY}
    check(
        "FINAL: activities match chunk-1 bundle (Bench Test handled by bench_63)",
        got_acts == expected_acts,
        f"got={sorted(got_acts.items())}",
    )
    # ================= repair: pre-existing bindings on target buttons ======
    # The deploy overwrote whatever RED/BLUE held and the sweeps deleted
    # the rows; restore the pre-deploy rows from the baselines.
    print("\nrepair: restoring pre-deploy bindings on deploy-target buttons...")
    repaired = []
    for act, btn in ((ACT_A, ButtonName.RED), (ACT_B, ButtonName.BLUE)):
        row = next(
            (
                b
                for b in pre_acts[act].get("button_bindings") or []
                if int(b.get("button_id", -1)) == btn
            ),
            None,
        )
        if row is None:
            print(f"  0x{act:02X} btn {btn}: no pre-deploy binding, nothing to repair")
            continue
        kw = {}
        if row.get("long_press_device_id") and row.get("long_press_command_id"):
            kw = dict(
                long_press_device_id=int(row["long_press_device_id"]),
                long_press_command_id=int(row["long_press_command_id"]),
            )
        r = proxy.command_to_button(
            act, btn, int(row["device_id"]), int(row["command_id"]),
            refresh_after_write=False, **kw,
        )
        repaired.append((act, btn))
        check(f"repair: 0x{act:02X} button {btn} restored", bool(r), f"{row} -> {r}")
    if repaired:
        proxy.resync_remote(HUB_VERSION)
        for act in sorted({a for a, _b in repaired}):
            payload = proxy.backup_activity(act)
            check(
                f"repair: 0x{act:02X} byte-identical to pre-deploy baseline",
                isinstance(payload, dict) and canon(payload) == canon(pre_acts[act]),
                canon_diff_note(pre_acts[act], payload or {}),
            )

    artifacts["bench_test_present_at_end"] = BENCH_TEST_ACTIVITY in acts_f
    print(
        f"Bench Test at end: {'present' if BENCH_TEST_ACTIVITY in acts_f else 'purged (run bench_63)'}"
    )
finally:
    artifacts["checks"] = [
        {"label": label, "ok": ok, "detail": detail} for label, ok, detail in checks
    ]
    path = save_json(f"wifi-c5-resync-{TAG}", artifacts)
    print("artifacts saved:", path)
    proxy.stop()
    print("disconnected")

failed = [c for c in checks if not c[1]]
print(f"\n{len(checks) - len(failed)}/{len(checks)} checks passed")
if failed:
    sys.exit(1)
