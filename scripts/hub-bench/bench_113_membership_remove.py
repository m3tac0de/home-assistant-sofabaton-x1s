"""In-place deploy program chunk 3: remove-device-from-activity.

Plan: docs/internal/wifi-inplace-deploy-plan.md (bench chunk 3).

Membership removal is NOT a dedicated opcode (live-hub-testing.md
"Membership removal = rewrite power macros (no 0x024F)"): the device is
dropped from an activity by rewriting the activity's POWER_ON macro
(family 0x12) without that device's power/input ref steps. Per the
2026-07-11 addendum the firmware then cascade-removes the device from the
OTHER power macro, the member table, and its keymap bindings. This bench
validates that cascade for a managed WIFI device.

Deploys a fresh bench device T into TWO activities — ACT_A (0x65, with an
input on T) and ACT_B (0x66, no input) — plus a favorite (cmd 3) and a
RED short/long binding on T in ACT_A. Then removes T from ACT_A by
rewriting ONLY its POWER_ON macro (drop T's rows, preserve the raw label
slot). Verifies:

  - ACT_A member table no longer lists T; other members intact;
  - ACT_A POWER_ON has no T rows; surviving members' rows preserved;
  - ACT_A POWER_OFF no longer lists T (firmware cascade) — if it still
    does, a second POWER_OFF rewrite is issued and the cascade noted
    incomplete;
  - T's RED binding in ACT_A is gone (cascade); T's favorite fate is
    recorded (may dangle → planner deletes favorites explicitly);
  - ACT_B is byte-identical (T still a member there);
  - device T and all 12 commands survive (membership removal ≠ delete).

Cleans up by deleting T (byte-compares the catalog back to baseline).
Takes a full recovery bundle first (skip with 4th arg ``skipbundle``).

Usage:
    python bench_113_membership_remove.py <ip> <X1|X1S> <tag> [skipbundle]
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

from x1slib.macros import build_macro_save_payload
from x1slib.protocol_const import OP_REQ_MACRO_LABELS, ButtonName

HOST = sys.argv[1]
HUB_VERSION = sys.argv[2]
TAG = sys.argv[3]
SKIP_BUNDLE = len(sys.argv) > 4 and sys.argv[4] == "skipbundle"

LISTENER_PORT = 8060
DEVICE_NAME = "Bench Wifi Mem"
BRAND_NAME = "m3-benchwifi-member00000001"
SLOT_NAMES = ["Mem One", "Mem Two", "Mem Three", "Mem Four", "Mem Five", "Mem Six"]
POWER_ON_ID = 1
POWER_OFF_ID = 2
INPUT_IDS = [6]
LONG_OFFSET = len(SLOT_NAMES)
FAV_CMD = 3
BIND_LONG = FAV_CMD + LONG_OFFSET  # 9

ACT_A = 0x65   # T removed from here (has input + favorite + binding)
ACT_B = 0x66   # T stays here — must be byte-identical after
UNTOUCHED = 0x67

RECOVERY_DIR = Path.home() / "x1s-bench-recovery"

log_path = setup_logging(f"memrm-c3-{TAG}")
print(f"logging to {log_path}")


def build_command_defs() -> list[dict]:
    defs: list[dict] = []
    for idx, name in enumerate(SLOT_NAMES):
        defs.append({"display_name": name, "trigger_name": name, "press_type": "short", "command_index": idx})
    for idx, name in enumerate(SLOT_NAMES):
        defs.append({"display_name": f"{name} Long", "trigger_name": name, "press_type": "long", "command_index": idx})
    return defs


def canon(payload: dict) -> str:
    def strip(node):
        if isinstance(node, dict):
            return {k: strip(v) for k, v in node.items() if k not in ("captured_at", "fetched_at")}
        if isinstance(node, list):
            return [strip(v) for v in node]
        return node

    return json.dumps(strip(copy.deepcopy(payload)), sort_keys=True)


checks: list[tuple[str, bool, str]] = []


def check(label: str, ok: bool, detail: str = "") -> None:
    checks.append((label, bool(ok), detail))
    print(f"  {'OK  ' if ok else 'FAIL'} {label}" + (f" — {detail}" if detail else ""))


def fresh_commands(proxy, dev: int, timeout: float = 8.0) -> set[int]:
    for _ in range(4):
        proxy.state.commands.pop(dev, None)
        proxy._commands_complete.discard(dev)
        proxy.get_commands_for_entity(dev, fetch_if_missing=True)
        deadline = time.time() + timeout
        while time.time() < deadline and dev not in proxy._commands_complete:
            time.sleep(0.3)
        cmds, _ready = proxy.get_commands_for_entity(dev, fetch_if_missing=False)
        if cmds:
            return set(cmds)
        time.sleep(1.0)
    return set()


def macro_steps(act_payload: dict, macro_key: int) -> list[dict]:
    for m in act_payload.get("macros") or []:
        if m.get("button_id", m.get("key_id")) == macro_key:
            return list(m.get("steps") or [])
    return []


def dev_in_macro(act_payload: dict, macro_key: int, dev: int) -> list[dict]:
    return [s for s in macro_steps(act_payload, macro_key) if int(s.get("device_id", -1)) == dev]


def survivor_steps(act_payload: dict, macro_key: int, dev: int) -> list[tuple]:
    """Steps NOT belonging to dev, as comparable tuples (0xC5 duration is
    hub-normalized 0<->255 so it is excluded from the survivor signature)."""
    out = []
    for s in macro_steps(act_payload, macro_key):
        if int(s.get("device_id", -1)) == dev:
            continue
        cmd = int(s.get("command_id", 0))
        dur = None if cmd == 0xC5 else int(s.get("duration", 0))
        out.append((int(s.get("device_id", 0)), cmd, dur, int(s.get("delay", 0))))
    return out


def remove_from_activity_power_on(proxy, act: int, dev: int, button: int) -> object:
    """Rewrite one power macro of ``act`` dropping every row for ``dev``,
    preserving the raw label slot. Returns the save ack or None."""
    proxy.reset_ack_queues()
    proxy._send_cmd_frame(OP_REQ_MACRO_LABELS, bytes([act & 0xFF, button & 0xFF]))
    rec = proxy.wait_for_macro_record(act, button, timeout=5.0)
    if rec is None:
        return None
    filtered = tuple(e for e in rec.key_sequence if e.is_delay_only or (e.device_id & 0xFF) != (dev & 0xFF))
    payload = build_macro_save_payload(
        activity_id=act,
        key_id=button,
        key_sequence=filtered,
        label="POWER_ON" if button == ButtonName.POWER_ON else "POWER_OFF",
        hub_version=HUB_VERSION,
        label_slot=rec.raw_label_slot or None,
    )
    ack = proxy._send_paged_macro_save(payload=payload, macro_button=button, ack_timeout=5.0)
    proxy.clear_entity_cache(act, clear_buttons=True, clear_favorites=True, clear_macros=True)
    return {"before_rows": len(rec.key_sequence), "after_rows": len(filtered), "ack": repr(ack)}


proxy = connect(HOST, HUB_VERSION)
artifacts: dict = {"host": HOST, "hub_version": HUB_VERSION}
dev = None
try:
    # ---------------- recovery bundle
    if SKIP_BUNDLE:
        print("recovery bundle SKIPPED")
    else:
        print("taking full recovery bundle (include_blobs=True)...")
        bundle = proxy.backup_hub_bundle(include_blobs=True)
        ok = isinstance(bundle, dict) and bundle.get("kind") == "hub_bundle"
        check("GATE: recovery bundle captured", ok, f"kind={bundle.get('kind') if isinstance(bundle, dict) else bundle!r}")
        if not ok:
            raise SystemExit("recovery bundle failed; refusing to mutate")
        bpath = save_json(f"memrm-c3-bundle-{TAG}", bundle)
        RECOVERY_DIR.mkdir(exist_ok=True)
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        shutil.copy2(bpath, RECOVERY_DIR / f"memrm-c3-bundle-{TAG}-{stamp}.json")
        print(f"bundle saved: {bpath}")

    # ---------------- baseline + gates
    proxy.request_activities()
    time.sleep(1.0)
    acts0, _ready = proxy.get_activities(force_refresh=False)
    acts0 = dict(acts0 or {})
    proxy._refresh_catalog("devices", timeout=15.0)
    time.sleep(0.6)
    devs_before = {int(d) for d in proxy.state.entities("device")}
    for act in (ACT_A, ACT_B):
        check(f"GATE: activity 0x{act:02X} present", act in acts0, f"{(acts0.get(act) or {}).get('name')!r}")
    if ACT_A not in acts0 or ACT_B not in acts0:
        raise SystemExit("bench activities missing")
    pre_untouched = proxy.backup_activity(UNTOUCHED) if UNTOUCHED in acts0 else None

    # ---------------- deploy T into both activities
    print("create_wifi_device (6 short + 6 long, power 1/2, input [6])...")
    result = proxy.create_wifi_device(
        device_name=DEVICE_NAME, commands=build_command_defs(), request_port=LISTENER_PORT,
        brand_name=BRAND_NAME, power_on_command_id=POWER_ON_ID, power_off_command_id=POWER_OFF_ID,
        input_command_ids=INPUT_IDS,
    )
    check("GATE: create succeeded", bool(result) and result.get("status") == "success", f"{result}")
    if not result or result.get("status") != "success":
        raise SystemExit("create failed")
    dev = int(result["device_id"])
    print(f"bench device T: 0x{dev:02X}")

    ra = proxy.add_device_to_activity(ACT_A, dev, input_cmd_id=INPUT_IDS[0])
    rb = proxy.add_device_to_activity(ACT_B, dev)
    check("GATE: add T to ACT_A (input)", bool(ra), f"{ra}")
    check("GATE: add T to ACT_B", bool(rb), f"{rb}")
    if not ra or not rb:
        raise SystemExit("activity add failed")

    proxy.get_commands_for_entity(dev, fetch_if_missing=True)
    deadline = time.time() + 10
    while time.time() < deadline and dev not in getattr(proxy, "_commands_complete", set()):
        time.sleep(0.3)

    proxy.command_to_favorite(ACT_A, dev, FAV_CMD, refresh_after_write=False)
    proxy.command_to_button(
        ACT_A, ButtonName.RED, dev, FAV_CMD,
        long_press_device_id=dev, long_press_command_id=BIND_LONG, refresh_after_write=False,
    )
    proxy.resync_remote(HUB_VERSION)

    cmds0 = fresh_commands(proxy, dev)
    check("GATE: T deployed with 12 commands", cmds0 == set(range(1, 13)), f"{sorted(cmds0)}")

    a_pre = proxy.backup_activity(ACT_A)
    b_pre = proxy.backup_activity(ACT_B)
    artifacts["act_a_pre"], artifacts["act_b_pre"] = a_pre, b_pre
    members_a_pre = set(a_pre.get("referenced_source_device_ids") or [])
    check("GATE: T in ACT_A member table", dev in members_a_pre, f"{sorted(members_a_pre)}")
    check("GATE: T in ACT_A POWER_ON + POWER_OFF", bool(dev_in_macro(a_pre, 0xC6, dev)) and bool(dev_in_macro(a_pre, 0xC7, dev)))
    on_survivors_pre = survivor_steps(a_pre, 0xC6, dev)
    off_survivors_pre = survivor_steps(a_pre, 0xC7, dev)

    # ================= remove T from ACT_A: rewrite POWER_ON only
    print(f"\n=== remove T (0x{dev:02X}) from ACT_A via POWER_ON rewrite (cascade test) ===")
    rr = remove_from_activity_power_on(proxy, ACT_A, dev, ButtonName.POWER_ON)
    artifacts["poweron_rewrite"] = rr
    check("GATE: POWER_ON rewrite issued", rr is not None, f"{rr}")
    time.sleep(1.5)

    a_post = proxy.backup_activity(ACT_A)
    artifacts["act_a_post"] = a_post
    members_a_post = set(a_post.get("referenced_source_device_ids") or [])
    check("GATE: T removed from ACT_A member table", dev not in members_a_post, f"{sorted(members_a_post)}")
    check("GATE: other ACT_A members intact", members_a_post == members_a_pre - {dev}, f"pre={sorted(members_a_pre)} post={sorted(members_a_post)}")
    check("GATE: T gone from ACT_A POWER_ON", not dev_in_macro(a_post, 0xC6, dev), json.dumps(dev_in_macro(a_post, 0xC6, dev)))

    cascade_off = not dev_in_macro(a_post, 0xC7, dev)
    check("cascade: T auto-removed from ACT_A POWER_OFF (firmware)", cascade_off, json.dumps(dev_in_macro(a_post, 0xC7, dev)))
    if not cascade_off:
        print("  POWER_OFF cascade did NOT fire; issuing explicit POWER_OFF rewrite")
        rr2 = remove_from_activity_power_on(proxy, ACT_A, dev, ButtonName.POWER_OFF)
        artifacts["poweroff_rewrite"] = rr2
        time.sleep(1.5)
        a_post = proxy.backup_activity(ACT_A)
        artifacts["act_a_post_2"] = a_post
        check("GATE: T gone from ACT_A POWER_OFF after explicit rewrite", not dev_in_macro(a_post, 0xC7, dev))
    artifacts["cascade_power_off"] = cascade_off

    # surviving members byte-stable (0xC5 duration tolerated)
    check("GATE: ACT_A POWER_ON survivors byte-stable", survivor_steps(a_post, 0xC6, dev) == on_survivors_pre,
          f"pre={on_survivors_pre} post={survivor_steps(a_post, 0xC6, dev)}")
    check("GATE: ACT_A POWER_OFF survivors byte-stable", survivor_steps(a_post, 0xC7, dev) == off_survivors_pre,
          f"pre={off_survivors_pre} post={survivor_steps(a_post, 0xC7, dev)}")

    # binding cascade + favorite fate
    bind_after = [b for b in (a_post.get("button_bindings") or []) if int(b.get("device_id", 0)) == dev]
    fav_after = [s for s in (a_post.get("favorite_slots") or []) if int(s.get("device_id", 0)) == dev]
    artifacts["binding_after"], artifacts["favorite_after"] = bind_after, fav_after
    check("cascade: T's RED binding auto-removed from ACT_A", not bind_after, json.dumps(bind_after))
    print(f"  T favorite rows remaining in ACT_A: {len(fav_after)} (dangling -> planner deletes explicitly)" if fav_after
          else "  T favorite auto-removed from ACT_A")

    # ACT_B untouched
    b_post = proxy.backup_activity(ACT_B)
    artifacts["act_b_post"] = b_post
    check("GATE: ACT_B byte-identical (T still a member there)", canon(b_pre) == canon(b_post))
    check("GATE: T still in ACT_B member table", dev in set(b_post.get("referenced_source_device_ids") or []))

    # device + commands survive
    cmds1 = fresh_commands(proxy, dev)
    check("GATE: T device + 12 commands survive membership removal", cmds1 == set(range(1, 13)), f"{sorted(cmds1)}")

    proxy.resync_remote(HUB_VERSION)
finally:
    if dev is not None:
        print(f"\ncleanup: delete_device(0x{dev:02X})")
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
            check("GATE: cleanup — device catalog back to baseline", devs_after == devs_before, f"before={sorted(devs_before)} after={sorted(devs_after or set())}")
            if pre_untouched is not None:
                post_untouched = proxy.backup_activity(UNTOUCHED)
                check(f"GATE: untouched activity 0x{UNTOUCHED:02X} byte-identical", canon(pre_untouched) == canon(post_untouched))
        except Exception as exc:  # noqa: BLE001
            check("cleanup delete_device", False, f"{exc}")
    artifacts["checks"] = [{"label": l, "ok": ok, "detail": d} for l, ok, d in checks]
    path = save_json(f"memrm-c3-{TAG}", artifacts)
    print("artifacts saved:", path)
    proxy.stop()
    print("disconnected")

failed = [c for c in checks if not c[1]]
print(f"\n{len(checks) - len(failed)}/{len(checks)} checks passed")
if failed:
    sys.exit(1)
