"""Wifi Commands program chunk 4: full deploy-sequence replay.

Plan: docs/internal/wifi-commands-bench-plan.md (chunk 4).

Mirrors the ``hub.async_sync_command_config`` wire order at lib level
(hub.py:3250-3478):

  create_wifi_device (20 slots, power 1/2, input [3])
  → add_device_to_activity(ACT_A) + add_device_to_activity(ACT_B,
    input_cmd_id=3)  [sorted order, input only on its activity]
  → warm device command cache
  → command_to_favorite ×5 on ACT_A (commands 1..5,
    refresh_after_write=False), collecting hub-assigned fav_ids
  → request_favorites_order + reorder_favorites (pre-existing in
    current slot order first, new fav_ids in add order — the 5th+
    favorite must land a display slot)
  → command_to_button: ACT_A RED = cmd 1 short + cmd 11 long
    (long-press pair, offset 10), ACT_B BLUE = cmd 2 short only
  → resync_remote

Verification per activity re-read (``backup_activity``): member table
gained the device; POWER_ON/POWER_OFF macros gained rows for it; the
input activity gained the 0xC5 input row; favorites (incl. the 5th)
hold display slots; bindings present. Untouched activities (0x67 +
Bench Test 0x68) must be byte-identical modulo capture timestamps.

Then drives ACT_B on/off over TCP (``send_command(act, POWER_ON/OFF)``
— HA's production path) and asserts the listener receives the wifi
device's power-on + input callbacks, then the power-off callback,
with the exact paths.

**Leaves the deployment in place** (device + activity edits) for
chunk 5's re-sync/rollback probes. No cleanup, no Bench Test restore
needed (nothing is deleted).

Usage:
    python bench_83_wifi_deploy.py <ip> <X1|X1S> <tag>
"""

from __future__ import annotations

import copy
import json
import sys
import time

from bench_common import connect, save_json, setup_logging
from bench_wifi_listener import BenchWifiListener, local_ip_toward

from x1slib.protocol_const import ButtonName

HOST = sys.argv[1]
HUB_VERSION = sys.argv[2]
TAG = sys.argv[3]

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
LONG_PRESS_OFFSET = 10  # hub.py _WIFI_COMMAND_LONG_PRESS_OFFSET

ACT_A = 0x65  # favorites + RED binding (short+long pair)
ACT_B = 0x66  # input activity (input_cmd_id=3) + BLUE binding
UNTOUCHED = [0x67, 0x68]
FAVORITE_CMD_IDS = [1, 2, 3, 4, 5]

log_path = setup_logging(f"wifi-c4-deploy-{TAG}")
print(f"logging to {log_path}")


def build_command_defs() -> list[dict]:
    defs: list[dict] = []
    for idx, name in enumerate(SLOT_NAMES):
        defs.append({"display_name": name, "trigger_name": name, "press_type": "short", "command_index": idx})
    for idx, name in enumerate(SLOT_NAMES):
        defs.append({"display_name": f"{name} Long Press", "trigger_name": name, "press_type": "long", "command_index": idx})
    return defs


def canon(payload: dict) -> str:
    """Canonical JSON with capture-time metadata stripped, for byte-compare."""

    def strip(node):
        if isinstance(node, dict):
            return {
                k: strip(v)
                for k, v in node.items()
                if k not in ("captured_at", "fetched_at")
            }
        if isinstance(node, list):
            return [strip(v) for v in node]
        return node

    return json.dumps(strip(copy.deepcopy(payload)), sort_keys=True)


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


def rows_for_device(rows: list, dev: int) -> list:
    """Macro steps / binding rows that reference the device id."""
    out = []
    for row in rows or []:
        blob = json.dumps(row)
        if f'"device_id": {dev}' in blob:
            out.append(row)
    return out


bench_ip = local_ip_toward(HOST)
listener = BenchWifiListener(LISTENER_PORT, mode="ok").start()
print(f"listener on {bench_ip}:{LISTENER_PORT} mode=ok")

proxy = connect(HOST, HUB_VERSION)
artifacts: dict = {
    "host": HOST,
    "hub_version": HUB_VERSION,
    "bench_ip": bench_ip,
    "listener_port": LISTENER_PORT,
}
try:
    devs0, acts0 = snapshot_catalog(proxy)
    print(f"baseline catalog: {len(devs0)} devices, {len(acts0)} activities")
    action_id = proxy._stable_hub_action_id()
    artifacts["action_id"] = action_id

    # ---------------- pre-state: touched + untouched activity baselines
    pre_acts: dict[int, dict] = {}
    for act in sorted({ACT_A, ACT_B, *UNTOUCHED}):
        print(f"pre-capture activity 0x{act:02X}...")
        payload = proxy.backup_activity(act)
        if not isinstance(payload, dict):
            raise SystemExit(f"pre-capture failed for activity 0x{act:02X}")
        pre_acts[act] = payload
    artifacts["pre_activities"] = {f"0x{k:02X}": v for k, v in pre_acts.items()}

    # ---------------- step 1: create
    print("create_wifi_device (20 slots, power 1/2, input [3])...")
    result = proxy.create_wifi_device(
        device_name=DEVICE_NAME,
        commands=build_command_defs(),
        request_port=LISTENER_PORT,
        brand_name=BRAND_NAME,
        power_on_command_id=POWER_ON_ID,
        power_off_command_id=POWER_OFF_ID,
        input_command_ids=INPUT_IDS,
    )
    artifacts["create_result"] = result
    check("GATE: create succeeded", bool(result) and result.get("status") == "success", f"{result}")
    if not result or result.get("status") != "success":
        raise SystemExit("create failed; stopping")
    dev = int(result["device_id"])
    print(f"wifi device: 0x{dev:02X}")

    # ---------------- step 2: add to activities (sorted; input on ACT_B)
    input_map = {ACT_B: INPUT_IDS[0]}
    add_ok = True
    for act in sorted([ACT_A, ACT_B]):
        print(f"add_device_to_activity act=0x{act:02X} input_cmd_id={input_map.get(act)}...")
        r = proxy.add_device_to_activity(act, dev, input_cmd_id=input_map.get(act))
        artifacts[f"add_result_0x{act:02X}"] = r
        ok = bool(r)
        add_ok = add_ok and ok
        check(f"add_device_to_activity 0x{act:02X}", ok, f"{r}")
    if not add_ok:
        raise SystemExit("activity add failed; stopping (deployment partially applied)")

    # ---------------- step 3: warm device command cache (hub.py:3326)
    proxy.get_commands_for_entity(dev, fetch_if_missing=True)
    deadline = time.time() + 10
    while time.time() < deadline and dev not in getattr(proxy, "_commands_complete", set()):
        time.sleep(0.3)

    # ---------------- step 4: favorites ×5 on ACT_A
    new_fav_ids: list[int] = []
    for cid in FAVORITE_CMD_IDS:
        r = proxy.command_to_favorite(ACT_A, dev, cid, refresh_after_write=False)
        fav_id = (r or {}).get("fav_id")
        print(f"  command_to_favorite cmd={cid} -> fav_id={fav_id}")
        if fav_id is not None:
            new_fav_ids.append(int(fav_id))
        check(f"favorite add cmd {cid}", bool(r), f"{r}")
    artifacts["new_fav_ids"] = new_fav_ids
    check("5 fav_ids collected", len(new_fav_ids) == 5, f"{new_fav_ids}")

    # ---------------- step 5: explicit reorder (pre-existing first)
    all_order = proxy.request_favorites_order(ACT_A)
    artifacts["fav_order_before_reorder"] = all_order
    check("favorites order readable", all_order is not None, f"{all_order}")
    if all_order:
        new_set = set(new_fav_ids)
        pre_existing = [f for f, _s in sorted(all_order, key=lambda x: x[1]) if f not in new_set]
        final_order = pre_existing + new_fav_ids
        r = proxy.reorder_favorites(ACT_A, final_order, refresh_after_write=False)
        artifacts["reorder_result"] = r
        check("reorder_favorites", bool(r), f"final_order={final_order} -> {r}")

    # ---------------- step 6: button bindings
    r = proxy.command_to_button(
        ACT_A, ButtonName.RED, dev, 1,
        long_press_device_id=dev,
        long_press_command_id=1 + LONG_PRESS_OFFSET,
        refresh_after_write=False,
    )
    check("command_to_button ACT_A RED short+long", bool(r), f"{r}")
    r = proxy.command_to_button(ACT_B, ButtonName.BLUE, dev, 2, refresh_after_write=False)
    check("command_to_button ACT_B BLUE short", bool(r), f"{r}")

    # ---------------- step 7: resync remote
    r = proxy.resync_remote(HUB_VERSION)
    check("resync_remote", bool(r), f"{r}")

    # ================= verification by re-read =================
    post_acts: dict[int, dict] = {}
    for act in sorted({ACT_A, ACT_B, *UNTOUCHED}):
        print(f"post-capture activity 0x{act:02X}...")
        payload = proxy.backup_activity(act)
        check(f"re-read activity 0x{act:02X}", isinstance(payload, dict))
        if isinstance(payload, dict):
            post_acts[act] = payload
    artifacts["post_activities"] = {f"0x{k:02X}": v for k, v in post_acts.items()}

    for act in (ACT_A, ACT_B):
        pre, post = pre_acts[act], post_acts.get(act) or {}
        label = f"0x{act:02X}"
        members_pre = set(pre.get("referenced_source_device_ids") or [])
        members_post = set(post.get("referenced_source_device_ids") or [])
        check(
            f"{label}: member table gained wifi device",
            dev in members_post and members_post - {dev} == members_pre - {dev},
            f"pre={sorted(members_pre)} post={sorted(members_post)}",
        )
        # The activity power macros reference each member's own POWER
        # buttons: a (dev, 198) step in POWER_ON and (dev, 199) in
        # POWER_OFF, which the hub resolves through the device's
        # family-0x12 power bindings (cmd 1 / cmd 2). The 0xC5 input
        # reference is a (dev, 197, input_index) step INSIDE the
        # POWER_ON macro, written for every member — input_index 0
        # means "no input selected".
        def dev_steps(act_payload: dict, macro_key: int) -> list[dict]:
            for m in act_payload.get("macros") or []:
                if m.get("button_id", m.get("key_id")) == macro_key:
                    return [
                        s for s in m.get("steps") or []
                        if int(s.get("device_id", -1)) == dev
                    ]
            return []

        on_steps = dev_steps(post, 0xC6)
        off_steps = dev_steps(post, 0xC7)
        check(
            f"{label}: POWER_ON macro gained (dev, 0xC6) step",
            any(int(s.get("command_id", 0)) == 0xC6 for s in on_steps),
            json.dumps(on_steps),
        )
        check(
            f"{label}: POWER_OFF macro gained (dev, 0xC7) step",
            any(int(s.get("command_id", 0)) == 0xC7 for s in off_steps),
            json.dumps(off_steps),
        )

    # 0xC5 input step (inside POWER_ON): index = input ordinal on the
    # input activity, 0 elsewhere.
    for act, want_index in ((ACT_A, 0), (ACT_B, 1)):
        post = post_acts.get(act) or {}
        input_steps = [
            s
            for m in post.get("macros") or []
            if m.get("button_id", m.get("key_id")) == 0xC6
            for s in m.get("steps") or []
            if int(s.get("device_id", -1)) == dev and int(s.get("command_id", 0)) == 0xC5
        ]
        check(
            f"0x{act:02X}: 0xC5 input step present with index {want_index}",
            len(input_steps) == 1 and int(input_steps[0].get("duration", -1)) == want_index,
            json.dumps(input_steps),
        )

    # favorites on ACT_A: 5 new entries, each with a display slot
    fav_slots = (post_acts.get(ACT_A) or {}).get("favorite_slots") or []
    dev_favs = [s for s in fav_slots if int(s.get("device_id", 0)) == dev]
    artifacts["dev_favorites_reread"] = dev_favs
    check(
        "ACT_A: 5 wifi-command favorites present",
        len(dev_favs) == 5 and {int(s.get("command_id", 0)) for s in dev_favs} == set(FAVORITE_CMD_IDS),
        f"{[(s.get('command_id'), s.get('button_id')) for s in dev_favs]}",
    )
    order_after = proxy.request_favorites_order(ACT_A)
    artifacts["fav_order_after"] = order_after
    slots_assigned = {f: s for f, s in (order_after or [])}
    check(
        "ACT_A GATE: all 5 favorites hold display slots (incl. 5th+)",
        all(f in slots_assigned for f in new_fav_ids),
        f"order={order_after} new={new_fav_ids}",
    )
    if order_after:
        tail = [f for f, _s in sorted(order_after, key=lambda x: x[1])][-len(new_fav_ids):]
        check(
            "ACT_A: new favorites occupy the tail slots in add order",
            tail == new_fav_ids,
            f"tail={tail} expected={new_fav_ids}",
        )

    # bindings
    def find_binding(act: int, button: int) -> dict | None:
        for b in (post_acts.get(act) or {}).get("button_bindings") or []:
            if int(b.get("button_id", -1)) == button:
                return b
        return None

    red = find_binding(ACT_A, ButtonName.RED)
    check(
        "ACT_A RED binding: short cmd 1 + long cmd 11 on device",
        bool(red)
        and int(red.get("device_id", 0)) == dev
        and int(red.get("command_id", 0)) == 1
        and int(red.get("long_press_command_id") or 0) == 1 + LONG_PRESS_OFFSET,
        json.dumps(red or {})[:200],
    )
    blue = find_binding(ACT_B, ButtonName.BLUE)
    check(
        "ACT_B BLUE binding: short cmd 2, no long press",
        bool(blue)
        and int(blue.get("device_id", 0)) == dev
        and int(blue.get("command_id", 0)) == 2
        and not int(blue.get("long_press_command_id") or 0),
        json.dumps(blue or {})[:200],
    )

    # untouched activities byte-identical
    for act in UNTOUCHED:
        pre, post = pre_acts.get(act), post_acts.get(act)
        check(
            f"GATE: untouched activity 0x{act:02X} byte-identical",
            pre is not None and post is not None and canon(pre) == canon(post),
            "capture-metadata-stripped JSON equality",
        )

    # ================= TCP drive: ACT_B on / off =================
    want = {
        "on_power": f"/launch/{action_id}/{dev}/{POWER_ON_ID - 1}/short",
        "on_input": f"/launch/{action_id}/{dev}/{INPUT_IDS[0] - 1}/short",
        "off_power": f"/launch/{action_id}/{dev}/{POWER_OFF_ID - 1}/short",
    }
    # The hub only runs the power macros on a real state TRANSITION
    # (chunk-4 x1s finding: a stale-ACTIVE activity made the ON a
    # no-op). Settle to idle first; ignore whatever the settle emits.
    print(f"pre-settle: deactivating 0x{ACT_B:02X} and clearing listener...")
    proxy.send_command(ACT_B, ButtonName.POWER_OFF)
    time.sleep(8.0)

    print(f"driving activity 0x{ACT_B:02X} ON over TCP...")
    listener.clear()
    proxy.send_command(ACT_B, ButtonName.POWER_ON)
    time.sleep(12.0)
    on_hits = listener.snapshot()
    artifacts["activity_on_hits"] = on_hits
    on_paths = [h["path"] for h in on_hits]
    print(f"  ON callbacks: {on_paths}")
    check(
        "GATE: activity-on delivers power-on + input callbacks",
        set(on_paths) == {want["on_power"], want["on_input"]},
        f"got={on_paths} want={sorted(want.values())[:2]}",
    )

    print(f"driving activity 0x{ACT_B:02X} OFF over TCP...")
    listener.clear()
    proxy.send_command(ACT_B, ButtonName.POWER_OFF)
    time.sleep(12.0)
    off_hits = listener.snapshot()
    artifacts["activity_off_hits"] = off_hits
    off_paths = [h["path"] for h in off_hits]
    print(f"  OFF callbacks: {off_paths}")
    check(
        "GATE: activity-off delivers power-off callback",
        set(off_paths) == {want["off_power"]},
        f"got={off_paths} want={want['off_power']}",
    )

    artifacts["deployment"] = {
        "device_id": dev,
        "device_name": DEVICE_NAME,
        "brand": BRAND_NAME,
        "activities": [ACT_A, ACT_B],
        "input_activity": ACT_B,
        "new_fav_ids": new_fav_ids,
        "bindings": {"ACT_A": "RED cmd1+long11", "ACT_B": "BLUE cmd2"},
        "left_deployed_for_chunk5": True,
    }
    print(f"\nDEPLOYMENT LEFT IN PLACE for chunk 5: dev=0x{dev:02X} on 0x{ACT_A:02X}+0x{ACT_B:02X}")
finally:
    listener.stop()
    artifacts["checks"] = [
        {"label": label, "ok": ok, "detail": detail} for label, ok, detail in checks
    ]
    path = save_json(f"wifi-c4-deploy-{TAG}", artifacts)
    print("artifacts saved:", path)
    proxy.stop()
    print("disconnected")

failed = [c for c in checks if not c[1]]
print(f"\n{len(checks) - len(failed)}/{len(checks)} checks passed")
if failed:
    sys.exit(1)
