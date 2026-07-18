"""In-place deploy program chunk 1: recon + in-place confirmation pass.

Plan: docs/internal/wifi-inplace-deploy-plan.md (bench chunk 1).

Deploys a full bench wifi device the current way (bench_83 sequence:
create 20 slots / power 1,2 / input [3] -> add to 0x65 + 0x66(input) ->
warm cache -> 2 favorites + RED binding on 0x65 -> resync), proves the
deploy live-fires, then runs the plan's three yellow rows IN PLACE
against it:

  A. power-row rewrite: a single family-0x12 row re-keys POWER_ON from
     command 1 to command 4 (no head write, no 0x41, no activity write);
     a live ACT_B power transition must fire command 4's callback.
  B. input-record rewrite: re-run ``_apply_wifi_input_configuration``
     with input [5] instead of [3]; the activity-side (dev,0xC5,ordinal)
     macro step is untouched (ordinal stays 1), so the transition must
     now fire command 5's input callback.
  C. brand-field head rewrite: ``_sync_step_device_rename`` with a new
     ``m3-benchwifi-*`` brand hash; catalog re-read must show the new
     brand (the wire fact behind ``get_managed_command_hashes``), body
     diff confined to the brand window + checksum, and callbacks must
     still fire afterwards.

Between every step the touched activities are byte-compared against
their post-deploy baselines (in-place means ZERO activity writes) and
the untouched activities (0x67, Bench Test 0x68) against pre-deploy.

Takes a full disaster-recovery bundle first (skippable on reruns with a
4th arg ``skipbundle``). **Leaves the deployment in place** for chunk 2
(command-delete discovery). Reserved bench brand key ``m3-benchwifi-``.

Usage:
    python bench_111_inplace_recon.py <ip> <X1|X1S> <tag> [skipbundle]
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

from x1slib.protocol_const import ButtonName

HOST = sys.argv[1]
HUB_VERSION = sys.argv[2]
TAG = sys.argv[3]
SKIP_BUNDLE = len(sys.argv) > 4 and sys.argv[4] == "skipbundle"

LISTENER_PORT = 8060
DEVICE_NAME = "Bench Wifi IP1"
BRAND_OLD = "m3-benchwifi-inplace0000001"
BRAND_NEW = "m3-benchwifi-inplace0000002"
SLOT_NAMES = [
    "Bench One", "Bench Two", "Bench Three", "Bench Four", "Bench Five",
    "Bench Six", "Bench Seven", "Bench Eight", "Bench Nine", "Bench Ten",
]
POWER_ON_ID = 1
POWER_OFF_ID = 2
INPUT_IDS = [3]
NEW_POWER_ON_ID = 4
NEW_INPUT_IDS = [5]
LONG_PRESS_OFFSET = 10

ACT_A = 0x65  # favorites + RED binding
ACT_B = 0x66  # input activity, drives the live transitions
UNTOUCHED = [0x67, 0x68]

SLOT_WIDTH = 60 if HUB_VERSION.upper() in ("X1S", "X2") else 30
NAME_OFF = 29
BRAND_OFF = NAME_OFF + SLOT_WIDTH
BRAND_END = BRAND_OFF + SLOT_WIDTH

RECOVERY_DIR = Path.home() / "x1s-bench-recovery"

log_path = setup_logging(f"inplace-c1-{TAG}")
print(f"logging to {log_path}")


def build_command_defs() -> list[dict]:
    defs: list[dict] = []
    for idx, name in enumerate(SLOT_NAMES):
        defs.append({"display_name": name, "trigger_name": name, "press_type": "short", "command_index": idx})
    for idx, name in enumerate(SLOT_NAMES):
        defs.append({"display_name": f"{name} Long Press", "trigger_name": name, "press_type": "long", "command_index": idx})
    return defs


DEFS = build_command_defs()


def canon(payload: dict) -> str:
    """Canonical JSON with capture-time metadata stripped, for byte-compare."""

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


def snapshot_devices(proxy) -> dict[int, dict]:
    proxy._refresh_catalog("devices", timeout=15.0)
    time.sleep(0.6)
    out = {}
    for dev_id, info in proxy.state.entities("device").items():
        out[int(dev_id)] = {
            "name": info.get("name"),
            "brand": info.get("brand"),
            "raw_body": bytes(info["raw_body"]).hex() if isinstance(info.get("raw_body"), (bytes, bytearray)) else None,
        }
    return out


def head_diff(hex_a: str | None, hex_b: str | None) -> list[int] | None:
    if not hex_a or not hex_b:
        return None
    a, b = bytes.fromhex(hex_a), bytes.fromhex(hex_b)
    if len(a) != len(b):
        return [-1]
    return [i for i in range(len(a)) if a[i] != b[i]]


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
    # ---------------- recovery bundle (disaster recovery, chunk-1 ritual)
    if SKIP_BUNDLE:
        print("recovery bundle SKIPPED (skipbundle arg)")
    else:
        print("taking full recovery bundle (include_blobs=True)... this can take a while")
        bundle = proxy.backup_hub_bundle(include_blobs=True)
        ok = isinstance(bundle, dict) and bundle.get("kind") == "hub_bundle"
        check("GATE: recovery bundle captured", ok, f"kind={bundle.get('kind') if isinstance(bundle, dict) else bundle!r}")
        if not ok:
            raise SystemExit("recovery bundle failed; refusing to mutate")
        bpath = save_json(f"inplace-c1-bundle-{TAG}", bundle)
        RECOVERY_DIR.mkdir(exist_ok=True)
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        shutil.copy2(bpath, RECOVERY_DIR / f"inplace-c1-bundle-{TAG}-{stamp}.json")
        print(f"bundle saved: {bpath} (+ recovery copy in {RECOVERY_DIR})")

    # ---------------- baseline catalog + gates
    devs0 = snapshot_devices(proxy)
    proxy.request_activities()
    time.sleep(1.0)
    acts0, _ready = proxy.get_activities(force_refresh=False)
    acts0 = dict(acts0 or {})
    print(f"baseline catalog: {len(devs0)} devices, {len(acts0)} activities")
    for act in (ACT_A, ACT_B):
        check(f"GATE: bench activity 0x{act:02X} present", act in acts0, f"{(acts0.get(act) or {}).get('name')!r}")
    if ACT_A not in acts0 or ACT_B not in acts0:
        raise SystemExit("bench activities missing; aborting before any write")
    action_id = proxy._stable_hub_action_id()
    artifacts["action_id"] = action_id

    pre_acts: dict[int, dict] = {}
    for act in sorted({ACT_A, ACT_B, *UNTOUCHED} & set(acts0)):
        print(f"pre-capture activity 0x{act:02X}...")
        payload = proxy.backup_activity(act)
        if not isinstance(payload, dict):
            raise SystemExit(f"pre-capture failed for activity 0x{act:02X}")
        pre_acts[act] = payload
    artifacts["pre_activities"] = {f"0x{k:02X}": v for k, v in pre_acts.items()}

    # ---------------- deploy the current way (bench_83 sequence)
    print("create_wifi_device (20 slots, power 1/2, input [3])...")
    result = proxy.create_wifi_device(
        device_name=DEVICE_NAME,
        commands=DEFS,
        request_port=LISTENER_PORT,
        brand_name=BRAND_OLD,
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

    def path_for(cid: int) -> str:
        return f"/launch/{action_id}/{dev}/{cid - 1}/short"

    input_map = {ACT_B: INPUT_IDS[0]}
    for act in sorted([ACT_A, ACT_B]):
        r = proxy.add_device_to_activity(act, dev, input_cmd_id=input_map.get(act))
        check(f"GATE: add_device_to_activity 0x{act:02X}", bool(r), f"{r}")
        if not r:
            raise SystemExit("activity add failed; stopping (deployment partially applied)")

    proxy.get_commands_for_entity(dev, fetch_if_missing=True)
    deadline = time.time() + 10
    while time.time() < deadline and dev not in getattr(proxy, "_commands_complete", set()):
        time.sleep(0.3)

    fav_ids = []
    for cid in (1, 2):
        r = proxy.command_to_favorite(ACT_A, dev, cid, refresh_after_write=False)
        fav_id = (r or {}).get("fav_id")
        if fav_id is not None:
            fav_ids.append(int(fav_id))
        check(f"favorite add cmd {cid}", bool(r), f"{r}")
    artifacts["fav_ids"] = fav_ids

    r = proxy.command_to_button(
        ACT_A, ButtonName.RED, dev, 1,
        long_press_device_id=dev,
        long_press_command_id=1 + LONG_PRESS_OFFSET,
        refresh_after_write=False,
    )
    check("command_to_button ACT_A RED short+long", bool(r), f"{r}")

    r = proxy.resync_remote(HUB_VERSION)
    check("resync_remote after deploy", bool(r), f"{r}")

    # ---------------- live-fire helper (transition-only semantics)
    def drive_cycle(label: str, expect_on: set[str], expect_off: set[str]) -> None:
        print(f"[{label}] settle OFF...")
        proxy.send_command(ACT_B, ButtonName.POWER_OFF)
        time.sleep(8.0)
        listener.clear()
        print(f"[{label}] ACT_B ON...")
        proxy.send_command(ACT_B, ButtonName.POWER_ON)
        time.sleep(12.0)
        on_paths = [h["path"] for h in listener.snapshot()]
        artifacts[f"hits_on_{label}"] = on_paths
        check(f"GATE {label}: ON fires exactly {sorted(expect_on)}", set(on_paths) == expect_on, f"got={on_paths}")
        listener.clear()
        print(f"[{label}] ACT_B OFF...")
        proxy.send_command(ACT_B, ButtonName.POWER_OFF)
        time.sleep(12.0)
        off_paths = [h["path"] for h in listener.snapshot()]
        artifacts[f"hits_off_{label}"] = off_paths
        check(f"GATE {label}: OFF fires exactly {sorted(expect_off)}", set(off_paths) == expect_off, f"got={off_paths}")

    # ---------------- baseline: deploy is live
    drive_cycle(
        "baseline",
        {path_for(POWER_ON_ID), path_for(INPUT_IDS[0])},
        {path_for(POWER_OFF_ID)},
    )

    # ---------------- post-deploy baselines for the in-place phase
    devs1 = snapshot_devices(proxy)
    head0 = (devs1.get(dev) or {}).get("raw_body")
    check("post-deploy head record captured", bool(head0), f"len={len(head0 or '') // 2}")
    artifacts["head_post_deploy"] = head0
    base_acts: dict[int, dict] = {}
    for act in (ACT_A, ACT_B):
        base_acts[act] = proxy.backup_activity(act)
        if not isinstance(base_acts[act], dict):
            raise SystemExit(f"post-deploy capture failed for 0x{act:02X}")
    artifacts["post_deploy_activities"] = {f"0x{k:02X}": v for k, v in base_acts.items()}

    def acts_stable(label: str) -> None:
        for act in (ACT_A, ACT_B):
            post = proxy.backup_activity(act)
            check(
                f"{label}: activity 0x{act:02X} byte-identical (zero activity writes)",
                isinstance(post, dict) and canon(base_acts[act]) == canon(post),
                "capture-metadata-stripped JSON equality",
            )

    # ================= yellow row A: power-row 0xC6 in-place rewrite
    print(f"\n=== A. power-row rewrite: POWER_ON cmd {POWER_ON_ID} -> {NEW_POWER_ON_ID} (single 0x12 row) ===")
    payload = proxy._build_device_power_binding_payload(
        device_id=dev, button_id=ButtonName.POWER_ON, command_id=NEW_POWER_ON_ID,
    )
    proxy.reset_ack_queues()
    step = proxy._send_step(
        step_name="inplace-power-row[POWER_ON]",
        family=0x12,
        payload=payload,
        ack_opcode=0x0112,
        ack_first_byte=ButtonName.POWER_ON,
        ack_fallback_opcodes=(0x0103,),
    )
    check("GATE A: bare 0x12 power-row write ACKed", step.ok, f"{step.outcome}")

    devs_a = snapshot_devices(proxy)
    diff_a = head_diff(head0, (devs_a.get(dev) or {}).get("raw_body"))
    check("A: head record untouched by power-row write", diff_a == [], f"diff_indices={diff_a}")
    acts_stable("A")
    drive_cycle(
        "after-power-rewrite",
        {path_for(NEW_POWER_ON_ID), path_for(INPUT_IDS[0])},
        {path_for(POWER_OFF_ID)},
    )

    # ================= yellow row B: input-record in-place rewrite
    print(f"\n=== B. input-record rewrite: input {INPUT_IDS} -> {NEW_INPUT_IDS} ===")
    proxy.reset_ack_queues()
    ok = proxy._apply_wifi_input_configuration(
        device_id=dev,
        device_name=DEVICE_NAME,
        ip_address=proxy.get_routed_local_ip(),
        brand_name=BRAND_OLD,
        commands=DEFS,
        input_command_ids=NEW_INPUT_IDS,
    )
    check("GATE B: input-record rewrite accepted", bool(ok), f"{ok}")

    devs_b = snapshot_devices(proxy)
    head_b = (devs_b.get(dev) or {}).get("raw_body")
    diff_b = head_diff(head0, head_b)
    # X1 re-finalizes the head record inside the input config; the rebuilt
    # body must reproduce the post-create head byte-for-byte. X1S/X2 never
    # touches the head here.
    check("B: head record byte-identical after input rewrite", diff_b == [], f"diff_indices={diff_b}")
    acts_stable("B")
    drive_cycle(
        "after-input-rewrite",
        {path_for(NEW_POWER_ON_ID), path_for(NEW_INPUT_IDS[0])},
        {path_for(POWER_OFF_ID)},
    )

    # ================= yellow row C: brand-field head rewrite (commit marker)
    print(f"\n=== C. brand head rewrite: {BRAND_OLD} -> {BRAND_NEW} ===")
    head_pre_c = head_b or head0
    ok = proxy._sync_step_device_rename({"device_id": dev, "name": DEVICE_NAME, "brand": BRAND_NEW})
    check("GATE C: brand head rewrite ACKed", bool(ok), f"{ok}")
    time.sleep(0.6)

    devs_c = snapshot_devices(proxy)
    tgt = devs_c.get(dev) or {}
    check("C: catalog re-read shows new brand (managed-hash source)", tgt.get("brand") == BRAND_NEW, f"brand={tgt.get('brand')!r}")
    check("C: device name unchanged", tgt.get("name") == DEVICE_NAME, f"name={tgt.get('name')!r}")
    diff_c = head_diff(head_pre_c, tgt.get("raw_body"))
    outside = None
    if diff_c is not None:
        body_len = len(bytes.fromhex(head_pre_c)) if head_pre_c else 0
        outside = [i for i in diff_c if not (BRAND_OFF <= i < BRAND_END) and i != body_len - 1]
    check("C: body diff confined to brand window + checksum", diff_c is not None and outside == [], f"diff={diff_c} outside={outside}")
    artifacts["brand_diff_indices"] = diff_c
    other_ok = all(
        (devs_c.get(d) or {}).get("raw_body") == (devs_b.get(d) or {}).get("raw_body")
        for d in devs_b
        if d != dev
    ) and set(devs_b) == set(devs_c)
    check("C: every other device record untouched", other_ok)
    acts_stable("C")
    drive_cycle(
        "after-brand-rewrite",
        {path_for(NEW_POWER_ON_ID), path_for(NEW_INPUT_IDS[0])},
        {path_for(POWER_OFF_ID)},
    )

    # ---------------- close: remote coherence + untouched activities
    r = proxy.resync_remote(HUB_VERSION)
    check("final resync_remote", bool(r), f"{r}")
    for act in UNTOUCHED:
        if act not in pre_acts:
            continue
        post = proxy.backup_activity(act)
        check(
            f"GATE: untouched activity 0x{act:02X} byte-identical to pre-deploy",
            isinstance(post, dict) and canon(pre_acts[act]) == canon(post),
            "capture-metadata-stripped JSON equality",
        )

    artifacts["deployment"] = {
        "device_id": dev,
        "device_name": DEVICE_NAME,
        "brand": BRAND_NEW,
        "power_on": NEW_POWER_ON_ID,
        "power_off": POWER_OFF_ID,
        "inputs": NEW_INPUT_IDS,
        "activities": [ACT_A, ACT_B],
        "fav_ids": fav_ids,
        "left_deployed_for_chunk2": True,
    }
    print(f"\nDEPLOYMENT LEFT IN PLACE for chunk 2: dev=0x{dev:02X} brand={BRAND_NEW}")
finally:
    listener.stop()
    artifacts["checks"] = [{"label": l, "ok": ok, "detail": d} for l, ok, d in checks]
    path = save_json(f"inplace-c1-{TAG}", artifacts)
    print("artifacts saved:", path)
    proxy.stop()
    print("disconnected")

failed = [c for c in checks if not c[1]]
print(f"\n{len(checks) - len(failed)}/{len(checks)} checks passed")
if failed:
    sys.exit(1)
