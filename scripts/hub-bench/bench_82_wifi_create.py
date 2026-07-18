"""Wifi Commands program chunk 3: create_wifi_device pipelines, both variants.

Plan: docs/internal/wifi-commands-bench-plan.md (chunk 3).

Drives the lib entry point ``create_wifi_device`` with the exact profile
shape ``hub.async_sync_command_config`` builds for a full deploy:

- 20 command defs (10 named short slots, then the 10 "<name> Long Press"
  long slots, ``command_index`` 0..9 each — hub.py:3224-3243);
- ``power_on_command_id=1`` / ``power_off_command_id=2``;
- ``input_command_ids=[3]``;
- managed brand tag with the reserved bench key
  (``m3-benchwifi-<hash>``).

X1S runs the virtual-ip pipeline (family-0x0E DEFINE_IP_CMD records,
0xD508 identity-publish finalize, IP power configuration); X1 runs the
Roku-replay pipeline (0x4E2X slot records at key ids 0x18..0x2B, device
record carries the callback IP, port implicitly 8060).

Verification is by ``backup_device`` re-read (20 records, labels,
callback paths/host/port, power rows, input record) plus a live fire of
slot 1 through the integration-shape listener (chunk 2 proved one
accepted response = exactly one callback).

Cleanup: delete the device. The delete sweep purges single-member
"Bench Test" (0x68) — re-run ``bench_63_bench_test_restore.py`` after.

Usage:
    python bench_82_wifi_create.py <ip> <X1|X1S> <tag>
"""

from __future__ import annotations

import json
import sys
import time

from bench_common import connect, save_json, setup_logging
from bench_wifi_listener import BenchWifiListener, local_ip_toward

HOST = sys.argv[1]
HUB_VERSION = sys.argv[2]
TAG = sys.argv[3]

LISTENER_PORT = 8060  # X1 Roku replay has no port field; 8060 is implicit
DEVICE_NAME = "Bench Wifi C3"
BRAND_NAME = "m3-benchwifi-c3bench0000000"
SLOT_NAMES = [
    "Bench One", "Bench Two", "Bench Three", "Bench Four", "Bench Five",
    "Bench Six", "Bench Seven", "Bench Eight", "Bench Nine", "Bench Ten",
]
POWER_ON_ID = 1
POWER_OFF_ID = 2
INPUT_IDS = [3]
PROTECTED_ACTIVITIES = [0x65, 0x66, 0x67]
BENCH_TEST_ACTIVITY = 0x68
POWER_KEYS = {0xC6, 0xC7}  # ButtonName.POWER_ON / POWER_OFF

log_path = setup_logging(f"wifi-c3-create-{TAG}")
print(f"logging to {log_path}")


def build_command_defs() -> list[dict]:
    """Port of the deploy-slot expansion in hub.async_sync_command_config."""
    defs: list[dict] = []
    for idx, name in enumerate(SLOT_NAMES):
        defs.append(
            {
                "display_name": name,
                "trigger_name": name,
                "press_type": "short",
                "command_index": idx,
            }
        )
    for idx, name in enumerate(SLOT_NAMES):
        defs.append(
            {
                "display_name": f"{name} Long Press",
                "trigger_name": name,
                "press_type": "long",
                "command_index": idx,
            }
        )
    return defs


def expected_command_id(i: int) -> int:
    """Hub-side command id for command_defs[i].

    Both variants: 1..20. The X1 Roku replay *writes* its 0x0E records
    at key ids 0x18..0x2B, but the hub's command table re-exposes them
    as ids 1..20 (first live observation, this chunk) — same numbering
    the X1S virtual-ip flow uses, and the id space REQ_ACTIVATE takes.
    """
    return i + 1


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
new_id = None
try:
    devs0, acts0 = snapshot_catalog(proxy)
    print(f"baseline catalog: {len(devs0)} devices, {len(acts0)} activities")
    action_id = proxy._stable_hub_action_id()
    artifacts["action_id"] = action_id
    print(f"hub action id: {action_id}")

    # ------------------------------------------------------------ create
    command_defs = build_command_defs()
    artifacts["command_defs"] = command_defs
    print(f"create_wifi_device: 20 slots, power on/off={POWER_ON_ID}/{POWER_OFF_ID}, inputs={INPUT_IDS}...")
    t0 = time.time()
    result = proxy.create_wifi_device(
        device_name=DEVICE_NAME,
        commands=command_defs,
        request_port=LISTENER_PORT,
        brand_name=BRAND_NAME,
        power_on_command_id=POWER_ON_ID,
        power_off_command_id=POWER_OFF_ID,
        input_command_ids=INPUT_IDS,
    )
    elapsed = time.time() - t0
    artifacts["create_result"] = result
    check(
        "GATE: create_wifi_device succeeded",
        bool(result) and result.get("status") == "success",
        f"{elapsed:.1f}s result={result}",
    )
    if not result or result.get("status") != "success":
        raise SystemExit("create failed; stopping")
    new_id = int(result["device_id"])
    check("assigned id is fresh", new_id not in devs0, f"dev=0x{new_id:02X}")

    # ------------------------------------------------------------ re-read
    print(f"re-reading device 0x{new_id:02X} (backup_device include_blobs=True)...")
    reread = proxy.backup_device(new_id, include_blobs=True)
    artifacts["reread"] = reread
    check("re-read returned payload", isinstance(reread, dict))
    if not isinstance(reread, dict):
        raise SystemExit("re-read failed; stopping")

    block = reread.get("device") or {}
    check("device name", block.get("name") == DEVICE_NAME, repr(block.get("name")))
    check("device brand (managed tag)", block.get("brand") == BRAND_NAME, repr(block.get("brand")))
    expected_class = "wifi_roku" if HUB_VERSION == "X1" else "wifi_ip"
    check(
        "device class per variant",
        block.get("device_class") == expected_class,
        repr(block.get("device_class")),
    )
    if HUB_VERSION == "X1":
        check(
            "X1 device record carries callback IP",
            block.get("ip_address") == bench_ip,
            repr(block.get("ip_address")),
        )

    cmds = {int(c["command_id"]): c for c in reread.get("commands") or []}
    check("GATE: 20 command records present", len(cmds) == 20, f"ids={sorted(cmds)}")

    label_problems: list[str] = []
    path_problems: list[str] = []
    hostport_problems: list[str] = []
    for i, spec in enumerate(command_defs):
        cid = expected_command_id(i)
        row = cmds.get(cid)
        if row is None:
            label_problems.append(f"missing command id {cid}")
            continue
        want_label = spec["display_name"]
        if str(row.get("name") or "").strip() != want_label:
            label_problems.append(f"id {cid}: {row.get('name')!r} != {want_label!r}")
        decoded = ((row.get("restore_data") or {}).get("decoded") or {})
        fields = decoded.get("fields") or {}
        got_path = str(fields.get("path") or "")
        want_tail = f"launch/{action_id}/{new_id}/{spec['command_index']}/{spec['press_type']}"
        if got_path.lstrip("/") != want_tail:
            path_problems.append(f"id {cid}: path {got_path!r} != .../{want_tail!r}")
        if HUB_VERSION != "X1":
            if fields.get("host") != bench_ip or int(fields.get("port") or 0) != LISTENER_PORT:
                hostport_problems.append(
                    f"id {cid}: {fields.get('host')}:{fields.get('port')}"
                )
    artifacts["label_problems"] = label_problems
    artifacts["path_problems"] = path_problems
    artifacts["hostport_problems"] = hostport_problems
    check("all 20 labels correct", not label_problems, "; ".join(label_problems[:3]))
    check(
        "GATE: all 20 callback paths correct (idx + press_type)",
        not path_problems,
        "; ".join(path_problems[:3]),
    )
    if HUB_VERSION != "X1":
        check(
            "all records target bench listener host:port",
            not hostport_problems,
            "; ".join(hostport_problems[:3]),
        )

    # power configuration: the family-0x12 POWER_ON/POWER_OFF rows come
    # back in the device-scope macro table.
    power_rows = {}
    for row in reread.get("macros") or []:
        key = row.get("key_id", row.get("button_id", row.get("key")))
        if key in POWER_KEYS:
            power_rows[int(key)] = row
    artifacts["power_rows"] = power_rows
    check(
        "power rows present (0xC6 + 0xC7)",
        set(power_rows) == POWER_KEYS,
        f"found={sorted(hex(k) for k in power_rows)}",
    )
    power_targets_ok = True
    power_detail = []
    for key, want_cmd in ((0xC6, POWER_ON_ID), (0xC7, POWER_OFF_ID)):
        row = power_rows.get(key)
        if row is None:
            power_targets_ok = False
            continue
        row_json = json.dumps(row)
        seq = row.get("key_sequence") or row.get("steps") or []
        step_keys = [
            s.get("command_id", s.get("key_id", s.get("key")))
            for s in seq
            if isinstance(s, dict)
        ]
        if step_keys != [want_cmd]:
            power_targets_ok = False
            power_detail.append(f"0x{key:02X}: steps={step_keys} raw={row_json[:120]}")
    check(
        "power rows target commands 1/2",
        power_targets_ok,
        "; ".join(power_detail),
    )

    input_record = reread.get("input_record")
    artifacts["input_record"] = input_record
    input_json = json.dumps(input_record or {})
    check(
        "input record present with slot-3 label",
        isinstance(input_record, dict) and "Bench Three" in input_json,
        input_json[:200],
    )

    # ------------------------------------------------------------ live fire
    slot1 = expected_command_id(0)
    print(f"live-firing slot 1 (key 0x{slot1:02X}) through mode=ok listener...")
    listener.clear()
    proxy.send_command(new_id, slot1)
    hits = listener.wait_for_hits(1, timeout=10.0)
    time.sleep(3.0)
    hits = listener.snapshot()
    artifacts["live_fire"] = hits
    want_path = f"/launch/{action_id}/{new_id}/0/short"
    check("GATE: live fire produced a callback", bool(hits), f"{len(hits)} hit(s)")
    if hits:
        got = {(h["method"], h["path"]) for h in hits}
        check(
            "live-fire path exact",
            {p for _, p in got} == {want_path},
            f"got={sorted(got)} want path={want_path}",
        )
        check(
            "single delivery (no storm; integration shape accepted)",
            len(hits) <= 2,
            f"{len(hits)} hit(s)",
        )

    # ------------------------------------------------------------ cleanup
    print(f"deleting device 0x{new_id:02X}...")
    del_result = proxy.delete_device(new_id)
    artifacts["delete_result"] = del_result
    check(
        "delete_device success",
        bool(del_result) and del_result.get("status") == "success",
        f"result={del_result}",
    )
    new_id = None
    devs1, acts1 = snapshot_catalog(proxy)
    check(
        "device catalog back at baseline",
        sorted(devs1) == sorted(devs0),
        f"before={sorted(devs0)} after={sorted(devs1)}",
    )
    for act in PROTECTED_ACTIVITIES:
        check(
            f"activity 0x{act:02X} untouched",
            act in acts1 and (acts0.get(act) or {}).get("name") == (acts1.get(act) or {}).get("name"),
            f"{(acts1.get(act) or {}).get('name')!r}",
        )
    artifacts["bench_test_present_after_delete"] = BENCH_TEST_ACTIVITY in acts1
    print(
        f"Bench Test (0x68) after delete: "
        f"{'present' if BENCH_TEST_ACTIVITY in acts1 else 'purged (expected; run bench_63)'}"
    )
finally:
    listener.stop()
    artifacts["checks"] = [
        {"label": label, "ok": ok, "detail": detail} for label, ok, detail in checks
    ]
    path = save_json(f"wifi-c3-create-{TAG}", artifacts)
    print("artifacts saved:", path)
    proxy.stop()
    print("disconnected")

failed = [c for c in checks if not c[1]]
print(f"\n{len(checks) - len(failed)}/{len(checks)} checks passed")
if failed:
    sys.exit(1)
