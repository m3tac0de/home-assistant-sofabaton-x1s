"""Wifi Events W0 gate: member-less ref writes via the REAL activity-sync
engine + macro-step delete cascade (W0.2).

Plan: docs/internal/wifi-events-plan.md (§4 gate W0, §11 findings).

Deploys a small events-profile wifi device (4 short + 4 long, no power,
no inputs, attached to NO activity), then drives ``proxy.sync_activity``
— the production plan builder + executor — with an edited bundle that
references the member-less device from ACT_A exactly the way the live
editor will:

* a favorite on cmd 2,
* a RED hard-button binding on cmd 3 with the long leg on cmd 3+N,
* a NEW user macro with one command step on cmd 4
  (step shape: button_code = 0x4E20 + cmd, delay 0xFF — mirrors
  addActivityMacroCommandStep),
* power-macro ref rows appended the way reconcileActivityPowerMacros
  does: (dev, 0xC6) + (dev, 0xC5, dur 0) on POWER_ON, (dev, 0xC7) on
  POWER_OFF (button_code 0, delay 0xFF).

Gates: plan builds (member_replay emitted), sync succeeds, re-read shows
favorite + binding + macro + membership + ref rows, and a direct fire of
cmd 2 still delivers its callback (record integrity after the writes).

Discovery (recorded, not gated): delete wifi cmd 4 (the macro-step
target) via family 0x10 and observe the macro step's fate — bench_112
confirmed favorites + bindings cascade on the hub; macro-step rows were
never checked (drives §5's delete-confirm wording).

Cleanup: sync ACT_A back to its pre-bench block via a second
``sync_activity`` (restores favorites/bindings/macros/power rows),
delete the bench device, then gate on catalog baseline + ACT_A
byte-identical to the pre-bench capture.

Usage:
    python bench_141_events_memberless_refs.py <ip> <X1|X1S> <tag> [skipbundle]
"""

from __future__ import annotations

import copy
import json
import shutil
import sys
import time
from datetime import datetime
from pathlib import Path

from bench_common import connect, save_json, setup_logging
from bench_wifi_listener import BenchWifiListener, local_ip_toward

from x1slib.protocol_const import FAMILY_FAV_DELETE, ButtonName

HOST = sys.argv[1]
HUB_VERSION = sys.argv[2]
TAG = sys.argv[3]
SKIP_BUNDLE = "skipbundle" in sys.argv[4:]

LISTENER_PORT = 8060
DEVICE_NAME = "Bench Events Ref"
BRAND_NAME = "m3-benchwifi-membrefs0000001"
SLOT_NAMES = ["Ref One", "Ref Two", "Ref Three", "Ref Four"]
N = len(SLOT_NAMES)

ACT_A = 0x65
UNTOUCHED = 0x67
FAV_CMD = 2
BIND_CMD = 3
BIND_LONG = BIND_CMD + N  # long law: short + N
STEP_CMD = 4
MACRO_NAME = "Bench Ev Macro"

SYNTHETIC_CODE_BASE = 0x4E20  # backup-state.ts synthesizeCommandCode
STEP_DELAY = 0xFF             # POWER_STEP_DEFAULT_DELAY / command-step delay

RECOVERY_DIR = Path.home() / "x1s-bench-recovery"

log_path = setup_logging(f"evrefs-{TAG}")
print(f"logging to {log_path}")

checks: list[tuple[str, bool, str]] = []


def check(label: str, ok: bool, detail: str = "") -> None:
    checks.append((label, bool(ok), detail))
    print(f"  {'OK  ' if ok else 'FAIL'} {label}" + (f" — {detail}" if detail else ""))


def build_command_defs() -> list[dict]:
    defs: list[dict] = []
    for idx, name in enumerate(SLOT_NAMES):
        defs.append({"display_name": name, "trigger_name": name, "press_type": "short", "command_index": idx})
    for idx, name in enumerate(SLOT_NAMES):
        defs.append({"display_name": f"{name} Long", "trigger_name": name, "press_type": "long", "command_index": idx})
    return defs


def canon(payload) -> str:
    def strip(node):
        if isinstance(node, dict):
            return {k: strip(v) for k, v in node.items() if k not in ("captured_at", "fetched_at")}
        if isinstance(node, list):
            return [strip(v) for v in node]
        return node

    return json.dumps(strip(copy.deepcopy(payload)), sort_keys=True)


def find_activity(bundle: dict, act_id: int) -> dict | None:
    for act in bundle.get("activities") or []:
        if int((act.get("device") or {}).get("device_id", 0)) == act_id:
            return act
    return None


def next_quick_access_button_id(activity: dict) -> int:
    """Mirror of backup-state.ts nextQuickAccessButtonId."""
    top = 0
    for slot in activity.get("favorite_slots") or []:
        bid = int(slot.get("button_id") or 0)
        if bid > 0 and bid not in (198, 199) and bid > top:
            top = bid
    for macro in activity.get("macros") or []:
        bid = int(macro.get("button_id") or 0)
        if bid > 0 and bid not in (198, 199) and bid > top:
            top = bid
    return top + 1


def power_step(dev: int, command_id: int, duration: int = 0) -> dict:
    return {"device_id": dev, "command_id": command_id, "button_code": 0,
            "duration": duration & 0xFF, "delay": STEP_DELAY}


def build_edited(baseline: dict, dev: int) -> dict:
    """Apply the editor-equivalent transforms to a deep copy of baseline."""
    edited = copy.deepcopy(baseline)
    activity = find_activity(edited, ACT_A)
    if activity is None:
        raise SystemExit("ACT_A missing from baseline bundle")

    # favorite on FAV_CMD (content is identity; button_id is a position)
    bid = next_quick_access_button_id(activity)
    activity.setdefault("favorite_slots", []).append(
        {"button_id": bid, "device_id": dev, "command_id": FAV_CMD, "name": ""}
    )

    # RED binding, short BIND_CMD + long BIND_LONG
    bindings = activity.setdefault("button_bindings", [])
    red = int(ButtonName.RED)
    bindings[:] = [row for row in bindings if int(row.get("button_id") or 0) != red]
    bindings.append({
        "button_id": red, "device_id": dev, "command_id": BIND_CMD,
        "long_press_device_id": dev, "long_press_command_id": BIND_LONG,
    })

    # NEW user macro with TWO command steps (STEP_CMD then FAV_CMD, both on
    # the bench device) — so the delete-cascade probe can tell "hub removes
    # the whole macro" apart from "hub removes the step and prunes an
    # emptied macro" (X1S run 01 had one step: macro_gone=True, ambiguous).
    activity.setdefault("macros", []).append({
        "button_id": next_quick_access_button_id(activity),
        "name": MACRO_NAME,
        "steps": [
            {"device_id": dev, "command_id": STEP_CMD,
             "button_code": SYNTHETIC_CODE_BASE + STEP_CMD,
             "duration": 0, "delay": STEP_DELAY},
            {"device_id": dev, "command_id": FAV_CMD,
             "button_code": SYNTHETIC_CODE_BASE + FAV_CMD,
             "duration": 0, "delay": STEP_DELAY},
        ],
    })

    # power-macro ref rows, reconcileActivityPowerMacros-style
    for macro in activity.get("macros") or []:
        mbid = int(macro.get("button_id") or 0)
        steps = macro.setdefault("steps", [])
        if mbid == 198:
            steps.append(power_step(dev, 0xC6))
            steps.append(power_step(dev, 0xC5, 0))
        elif mbid == 199:
            steps.append(power_step(dev, 0xC7))
    return edited


bench_ip = local_ip_toward(HOST)
listener = BenchWifiListener(LISTENER_PORT, mode="ok").start()
print(f"listener on {bench_ip}:{LISTENER_PORT} mode=ok")

proxy = connect(HOST, HUB_VERSION)
artifacts: dict = {"host": HOST, "hub_version": HUB_VERSION, "bench_ip": bench_ip}
dev = None
devs_before: set[int] = set()
act_pre = None
try:
    # ---------------- recovery bundle
    if SKIP_BUNDLE:
        print("recovery bundle SKIPPED")
    else:
        print("taking full recovery bundle (include_blobs=True)...")
        bundle = proxy.backup_hub_bundle(include_blobs=True)
        ok = isinstance(bundle, dict) and bundle.get("kind") == "hub_bundle"
        check("GATE: recovery bundle captured", ok)
        if not ok:
            raise SystemExit("recovery bundle failed; refusing to mutate")
        bpath = save_json(f"evrefs-bundle-{TAG}", bundle)
        RECOVERY_DIR.mkdir(exist_ok=True)
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        shutil.copy2(bpath, RECOVERY_DIR / f"evrefs-bundle-{TAG}-{stamp}.json")
        print(f"bundle saved: {bpath}")

    # ---------------- baseline catalog + pre-bench activity capture
    proxy._refresh_catalog("devices", timeout=15.0)
    time.sleep(0.6)
    devs_before = {int(d) for d in proxy.state.entities("device")}
    print(f"baseline: {len(devs_before)} devices")
    action_id = proxy._stable_hub_action_id()
    act_pre = proxy.backup_activity(ACT_A)
    check("GATE: ACT_A readable", isinstance(act_pre, dict), f"{type(act_pre)}")
    if not isinstance(act_pre, dict):
        raise SystemExit("ACT_A capture failed")
    pre_untouched = proxy.backup_activity(UNTOUCHED)

    # ---------------- deploy the member-less events-profile device
    print(f"create_wifi_device ({N} short + {N} long, no power/inputs/activities)...")
    result = proxy.create_wifi_device(
        device_name=DEVICE_NAME,
        commands=build_command_defs(),
        request_port=LISTENER_PORT,
        brand_name=BRAND_NAME,
        power_on_command_id=None,
        power_off_command_id=None,
        input_command_ids=None,
    )
    created_ok = bool(result) and result.get("status") == "success"
    check("GATE: create succeeded", created_ok, f"{result}")
    if not created_ok:
        raise SystemExit("create failed")
    dev = int(result["device_id"])
    print(f"bench device: 0x{dev:02X} (member of no activity)")

    # ---------------- structural baseline + edited bundles
    print("capturing structural baseline bundle (include_blobs=False)...")
    baseline = proxy.backup_hub_bundle(include_blobs=False)
    check("GATE: baseline bundle contains bench device",
          any(int((d.get("device") or {}).get("device_id", 0)) == dev for d in baseline.get("devices") or []))
    edited = build_edited(baseline, dev)
    artifacts["edited_activity"] = find_activity(edited, ACT_A)

    # plan preview (pure) — assert member_replay is in the plan
    from x1slib.activity_sync import build_activity_sync_plan
    plan = build_activity_sync_plan(baseline, edited, ACT_A)
    kinds = [s.kind for s in plan]
    artifacts["plan_kinds"] = kinds
    check("plan: member_replay emitted", "member_replay" in kinds, f"{kinds}")
    check("plan: macro_write x3 (198/199/new)", kinds.count("macro_write") == 3, f"{kinds}")
    check("plan: binding_write + favorite_add", "binding_write" in kinds and "favorite_add" in kinds, f"{kinds}")

    # ---------------- the real sync
    print("sync_activity (production plan + executor)...")
    outcome = proxy.sync_activity(baseline=baseline, edited=edited, activity_id=ACT_A)
    artifacts["sync_outcome"] = outcome
    check("GATE: sync_activity success", (outcome or {}).get("status") == "success", f"{outcome}")
    if (outcome or {}).get("status") != "success":
        raise SystemExit("sync failed")

    # ---------------- verify hub state
    act_post = proxy.backup_activity(ACT_A)
    artifacts["act_after_sync"] = act_post
    favs = [s for s in (act_post.get("favorite_slots") or []) if int(s.get("device_id", 0)) == dev]
    check("favorite present (content match)",
          any(int(s.get("command_id", 0)) == FAV_CMD for s in favs), f"{favs}")
    red_rows = [b for b in (act_post.get("button_bindings") or [])
                if int(b.get("button_id", 0)) == int(ButtonName.RED)]
    check("RED binding short+long",
          any(int(b.get("device_id", 0)) == dev and int(b.get("command_id", 0)) == BIND_CMD
              and int(b.get("long_press_device_id", 0) or 0) == dev
              and int(b.get("long_press_command_id", 0) or 0) == BIND_LONG for b in red_rows),
          f"{red_rows}")
    user_macros = [m for m in (act_post.get("macros") or [])
                   if str(m.get("name") or "") == MACRO_NAME]
    check("new macro present with dev step",
          any(any(int(s.get("device_id", 0)) == dev and int(s.get("command_id", 0)) == STEP_CMD
                  for s in (m.get("steps") or [])) for m in user_macros),
          f"{user_macros}")
    pow_on = [m for m in (act_post.get("macros") or []) if int(m.get("button_id", 0)) == 198]
    pow_off = [m for m in (act_post.get("macros") or []) if int(m.get("button_id", 0)) == 199]
    has_c6 = any(any(int(s.get("device_id", 0)) == dev and int(s.get("command_id", 0)) == 0xC6
                     for s in (m.get("steps") or [])) for m in pow_on)
    has_c7 = any(any(int(s.get("device_id", 0)) == dev and int(s.get("command_id", 0)) == 0xC7
                     for s in (m.get("steps") or [])) for m in pow_off)
    check("power macros carry (dev,0xC6)/(dev,0xC7) rows", has_c6 and has_c7)

    # record callback still intact after all the key-row writes
    listener.clear()
    print(f"fire cmd {FAV_CMD} — 10s window")
    proxy.send_command(dev, FAV_CMD)
    time.sleep(10.0)
    paths = [h["path"] for h in listener.snapshot()]
    artifacts["fire_after_sync"] = paths
    check("callback after sync", paths == [f"/launch/{action_id}/{dev}/{FAV_CMD - 1}/short"], f"got={paths}")

    # ---------------- discovery: macro-step fate on command delete
    print(f"\n=== discovery: delete wifi cmd {STEP_CMD} (the macro-step target) ===")
    # bench_112 X1 nuance: the bare command_id form can no-op — fall back to
    # the raw stored-key id (0x17 + id, the 0x18.. table) on X1.
    delete_ok = False
    delete_method = None
    for label, key in (("id", STEP_CMD), ("rawkey", 0x17 + STEP_CMD)):
        if label == "rawkey" and HUB_VERSION.upper() != "X1":
            break
        proxy.reset_ack_queues()
        step = proxy._send_step(
            step_name=f"cmd-delete-10[dev=0x{dev:02X} key=0x{key:02X}]{label}",
            family=FAMILY_FAV_DELETE,
            payload=bytes([dev & 0xFF, key & 0xFF]),
            ack_opcode=0x0103,
            timeout=5.0,
        )
        time.sleep(1.5)
        # fresh read — pop the cached table first (bench_112 fresh_commands
        # pattern) or fetch_if_missing sees the stale pre-delete list
        proxy.state.commands.pop(dev, None)
        proxy._commands_complete.discard(dev)
        proxy.get_commands_for_entity(dev, fetch_if_missing=True)
        read_deadline = time.time() + 8.0
        while time.time() < read_deadline and dev not in proxy._commands_complete:
            time.sleep(0.3)
        cmds_now, _ready = proxy.get_commands_for_entity(dev, fetch_if_missing=False)
        if step.ok and STEP_CMD not in set(cmds_now or {}):
            delete_ok, delete_method = True, label
            break
    artifacts["delete_method"] = delete_method
    check("delete removed the record", delete_ok, f"method={delete_method}")
    time.sleep(1.5)
    act_del = proxy.backup_activity(ACT_A)
    artifacts["act_after_cmd_delete"] = act_del
    macros_after = [m for m in (act_del.get("macros") or []) if str(m.get("name") or "") == MACRO_NAME]
    step_rows = [s for m in macros_after for s in (m.get("steps") or [])
                 if int(s.get("device_id", 0)) == dev and int(s.get("command_id", 0)) == STEP_CMD]
    survivor_rows = [s for m in macros_after for s in (m.get("steps") or [])
                     if int(s.get("device_id", 0)) == dev and int(s.get("command_id", 0)) == FAV_CMD]
    macro_gone = not macros_after
    print(f"  macro-step fate: macro_gone={macro_gone} dangling_cmd{STEP_CMD}_rows={len(step_rows)} "
          f"surviving_cmd{FAV_CMD}_rows={len(survivor_rows)}")
    artifacts["macro_step_fate"] = {"macro_gone": macro_gone, "dangling_step_rows": len(step_rows),
                                    "surviving_other_step_rows": len(survivor_rows),
                                    "macros_after": macros_after}
    # favorites/bindings on OTHER commands must be untouched (cascade scoped to cmd 4)
    favs2 = [s for s in (act_del.get("favorite_slots") or []) if int(s.get("device_id", 0)) == dev]
    check("favorite (cmd 2) untouched by cmd-4 delete",
          any(int(s.get("command_id", 0)) == FAV_CMD for s in favs2), f"{favs2}")
    check("discovery: activity re-read coherent after delete", isinstance(act_del, dict))
finally:
    # ---------------- cleanup: restore ACT_A, delete device, verify
    try:
        if dev is not None and act_pre is not None:
            print("\ncleanup: sync ACT_A back to its pre-bench block")
            fresh = proxy.backup_hub_bundle(include_blobs=False)
            restored = copy.deepcopy(fresh)
            acts = restored.get("activities") or []
            for i, act in enumerate(acts):
                if int((act.get("device") or {}).get("device_id", 0)) == ACT_A:
                    acts[i] = copy.deepcopy(act_pre)
                    break
            outcome = proxy.sync_activity(baseline=fresh, edited=restored, activity_id=ACT_A)
            check("cleanup: restore sync success", (outcome or {}).get("status") == "success", f"{outcome}")
    except Exception as exc:  # noqa: BLE001
        check("cleanup restore sync", False, f"{exc}")
    if dev is not None:
        print(f"cleanup: delete_device(0x{dev:02X})")
        try:
            devs_after = None
            deadline = time.time() + 30
            while time.time() < deadline:
                proxy.delete_device(dev)
                time.sleep(2.0)
                proxy._refresh_catalog("devices", timeout=15.0)
                time.sleep(0.4)
                devs_after = {int(d) for d in proxy.state.entities("device")}
                if dev not in devs_after:
                    break
            check("GATE: cleanup — device catalog back to baseline", devs_after == devs_before,
                  f"before={sorted(devs_before)} after={sorted(devs_after or set())}")
            act_final = proxy.backup_activity(ACT_A)
            check("GATE: ACT_A byte-identical to pre-bench", canon(act_final) == canon(act_pre))
            if pre_untouched is not None:
                post_untouched = proxy.backup_activity(UNTOUCHED)
                check(f"GATE: untouched activity 0x{UNTOUCHED:02X} byte-identical",
                      canon(pre_untouched) == canon(post_untouched))
        except Exception as exc:  # noqa: BLE001
            check("cleanup delete_device", False, f"{exc}")
    listener.stop()
    artifacts["checks"] = [{"label": l, "ok": ok, "detail": d} for l, ok, d in checks]
    path = save_json(f"evrefs-{TAG}", artifacts)
    print("artifacts saved:", path)
    proxy.stop()
    print("disconnected")

failed = [c for c in checks if not c[1]]
print(f"\n{len(checks) - len(failed)}/{len(checks)} checks passed")
if failed:
    sys.exit(1)
