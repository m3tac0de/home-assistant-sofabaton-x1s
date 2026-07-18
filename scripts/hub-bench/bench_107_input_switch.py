"""Does an activity-input callback fire on a direct A->B switch? (#258)

Validated so far (live-hub-testing.md "Hub behaviors discovered"):
driving activity on/off over TCP delivers the wifi device's power-on +
input callbacks on idle->active and the power-off callback on
active->idle. NOT yet exercised: a direct switch between two
activities that BOTH contain the wifi device, each with a different
input command. Issue #258's use case (one always-on device, per-
activity source switching) hinges on the answer:

  - input fires on A->B  -> per-activity inputs can satisfy the use
    case (source switches even though the device stays on);
  - input does NOT fire  -> only remote-side macro execution covers
    activity switches, and the HA-side "action on activity change"
    feature is the only reliable answer.

Sequence (all TCP, HA's production path):

  1. pre-capture backup_activity(ACT_A/ACT_B) baselines
  2. create_wifi_device (20 slots, power 1/2, inputs [3, 4])
  3. add_device_to_activity(ACT_A, dev, input_cmd_id=3)
     add_device_to_activity(ACT_B, dev, input_cmd_id=4)
  4. ensure both idle, then transitions with listener snapshots:
       T1 idle -> A   expect power-on (idx 0) + input 3 (idx 2)
       T2 A -> B      THE QUESTION: input 4 (idx 3)? power rows?
       T3 B -> idle   expect power-off (idx 1)
  5. cleanup: delete_device (hub cascade strips both activities),
     re-read + canon-compare both activities against the baselines
     (report-only; X1S hub-owned bytes may differ, see
     live-hub-testing.md "X1S hub-owned bytes").

Both target activities must already contain at least one other device
(so the delete sweep cannot GC them) and be idle at start.

Usage:
    python bench_107_input_switch.py <ip> <X1|X1S> <tag> <act_a> <act_b>
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
ACT_A = int(sys.argv[4], 0)
ACT_B = int(sys.argv[5], 0)

LISTENER_PORT = 8060
DEVICE_NAME = "Bench Wifi C107"
BRAND_NAME = "m3-benchwifi-c107switch0000"
SLOT_NAMES = [
    "Bench One", "Bench Two", "Bench Three", "Bench Four", "Bench Five",
    "Bench Six", "Bench Seven", "Bench Eight", "Bench Nine", "Bench Ten",
]
POWER_ON_ID = 1
POWER_OFF_ID = 2
INPUT_IDS = [3, 4]
INPUT_FOR = {ACT_A: 3, ACT_B: 4}

log_path = setup_logging(f"wifi-c107-switch-{TAG}")
print(f"logging to {log_path}")


def build_command_defs() -> list[dict]:
    defs: list[dict] = []
    for idx, name in enumerate(SLOT_NAMES):
        defs.append({"display_name": name, "trigger_name": name, "press_type": "short", "command_index": idx})
    for idx, name in enumerate(SLOT_NAMES):
        defs.append({"display_name": f"{name} Long Press", "trigger_name": name, "press_type": "long", "command_index": idx})
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


def referenced_devices(payload) -> set[int]:
    """Device ids referenced anywhere in an activity backup payload.

    ``backup_activity`` does not fetch the member table; the power-macro /
    binding rows reference every member device, which is what the GC-safety
    gate needs (the delete sweep only GCs activities left with zero devices).
    """

    out: set[int] = set()

    def walk(node) -> None:
        if isinstance(node, dict):
            value = node.get("device_id")
            if isinstance(value, int):
                out.add(value)
            for child in node.values():
                walk(child)
        elif isinstance(node, list):
            for child in node:
                walk(child)

    walk(payload)
    return out


def activity_states(proxy) -> dict[int, str]:
    proxy.request_activities()
    deadline = time.time() + 15
    while time.time() < deadline:
        acts, ready = proxy.get_activities(force_refresh=False)
        if ready:
            return {k: str((v or {}).get("state") or "") for k, v in (acts or {}).items()}
        time.sleep(0.5)
    return {}


bench_ip = local_ip_toward(HOST)
listener = BenchWifiListener(LISTENER_PORT, mode="ok").start()
print(f"listener on {bench_ip}:{LISTENER_PORT} mode=ok")

proxy = connect(HOST, HUB_VERSION)
artifacts: dict = {
    "host": HOST,
    "hub_version": HUB_VERSION,
    "bench_ip": bench_ip,
    "act_a": ACT_A,
    "act_b": ACT_B,
    "transitions": [],
}
dev = None
try:
    action_id = proxy._stable_hub_action_id()
    artifacts["action_id"] = action_id

    # ---------------- pre-state
    pre_acts: dict[int, dict] = {}
    for act in (ACT_A, ACT_B):
        print(f"pre-capture activity 0x{act:02X}...")
        payload = proxy.backup_activity(act)
        if not isinstance(payload, dict):
            raise SystemExit(f"pre-capture failed for activity 0x{act:02X}")
        pre_acts[act] = payload
        members = sorted(referenced_devices(payload))
        print(f"  referenced devices: {members}")
        if len(members) < 1:
            raise SystemExit(
                f"activity 0x{act:02X} references no devices; refusing (delete sweep would GC it)"
            )
    artifacts["pre_activities"] = {f"0x{k:02X}": v for k, v in pre_acts.items()}

    states = activity_states(proxy)
    artifacts["states_at_start"] = {hex(k): v for k, v in states.items()}
    print(f"states at start: { {hex(k): v for k, v in states.items()} }")

    # ---------------- create + assign
    print("create_wifi_device (20 slots, power 1/2, inputs [3, 4])...")
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
    print(f"wifi device id = 0x{dev:02X} ({dev})")

    for act in (ACT_A, ACT_B):
        r = proxy.add_device_to_activity(act, dev, input_cmd_id=INPUT_FOR[act])
        artifacts[f"add_result_0x{act:02X}"] = r
        check(f"GATE: add to 0x{act:02X} (input cmd {INPUT_FOR[act]})", bool(r), f"{r}")
        if not r:
            raise SystemExit("add_device_to_activity failed; stopping")

    # ---------------- transitions
    def wait_current(expected: int | None, timeout: float = 12.0) -> bool:
        """Poll the realtime-tracked current activity (op 0x10 driven)."""
        deadline = time.time() + timeout
        while time.time() < deadline:
            current = proxy.state.current_activity
            if expected is None:
                if current not in (ACT_A, ACT_B):
                    return True
            elif current == expected:
                return True
            time.sleep(0.5)
        return False

    def transition(label: str, act: int, key: int, expected: int | None, settle: float = 10.0) -> set[str]:
        listener.clear()
        print(f"{label}: send_command(0x{act:02X}, 0x{key:02X})...")
        proxy.send_command(act, key)
        landed = wait_current(expected)
        if not landed:
            print("  no realtime state change; re-sending once...")
            proxy.send_command(act, key)
            landed = wait_current(expected)
        time.sleep(settle)  # let straggler callbacks arrive
        hits = listener.snapshot()
        entry = {
            "label": label,
            "act": act,
            "key": key,
            "hits": hits,
            "landed": landed,
            "current_after": proxy.state.current_activity,
        }
        artifacts["transitions"].append(entry)
        got = {h["path"] for h in hits}
        print(f"  -> landed={landed} current={proxy.state.current_activity} callbacks={sorted(got)}")
        return got

    def path(cmd_id: int) -> str:
        return f"/launch/{action_id}/{dev}/{cmd_id - 1}/short"

    # settle to idle if needed
    if proxy.state.current_activity in (ACT_A, ACT_B):
        transition(
            f"pre-settle: deactivate 0x{proxy.state.current_activity:02X}",
            proxy.state.current_activity,
            ButtonName.POWER_OFF,
            None,
        )

    got_t1 = transition("T1 idle -> A", ACT_A, ButtonName.POWER_ON, ACT_A)
    check(
        "T1: power-on + input3 delivered",
        got_t1 == {path(POWER_ON_ID), path(3)},
        f"got={sorted(got_t1)}",
    )
    if proxy.state.current_activity != ACT_A:
        raise SystemExit(
            "activity A never became current; T2 would not be a real A->B switch — aborting"
        )

    got_t2 = transition("T2 A -> B (direct switch)", ACT_B, ButtonName.POWER_ON, ACT_B)
    artifacts["t2_input4_fired"] = path(4) in got_t2
    artifacts["t2_power_rows"] = sorted(
        p for p in got_t2 if p in (path(POWER_ON_ID), path(POWER_OFF_ID))
    )
    print(f"T2 RESULT: input4={'FIRED' if path(4) in got_t2 else 'did NOT fire'}; "
          f"power rows seen: {artifacts['t2_power_rows'] or 'none'}")

    got_t3 = transition("T3 B -> idle", ACT_B, ButtonName.POWER_OFF, None)
    check("T3: power-off delivered", path(POWER_OFF_ID) in got_t3, f"got={sorted(got_t3)}")

    verdict = (
        "input callback FIRES on direct A->B switch (shared device)"
        if path(4) in got_t2
        else "input callback does NOT fire on direct A->B switch"
    )
    artifacts["verdict"] = verdict
    print("VERDICT:", verdict)
finally:
    # ---------------- cleanup: delete device, compare activities
    try:
        if dev is not None:
            print(f"cleanup: delete_device(0x{dev:02X})...")
            del_result = proxy.delete_device(dev)
            artifacts["delete_result"] = del_result
            time.sleep(5)  # purge can land late (live-hub-testing.md)
            for act in (ACT_A, ACT_B):
                post = proxy.backup_activity(act)
                same = isinstance(post, dict) and canon(post) == canon(pre_acts[act])
                artifacts[f"post_matches_baseline_0x{act:02X}"] = same
                check(
                    f"cleanup: activity 0x{act:02X} back to baseline (report-only)",
                    same,
                    "" if same else "diff vs pre-capture; inspect artifacts",
                )
    except Exception as exc:  # noqa: BLE001 - cleanup is best-effort, report and keep artifacts
        print(f"cleanup error: {exc!r}")
        artifacts["cleanup_error"] = repr(exc)
    listener.stop()
    artifacts["checks"] = [{"label": l, "ok": ok, "detail": d} for l, ok, d in checks]
    path_ = save_json(f"wifi-c107-switch-{TAG}", artifacts)
    print("artifacts saved:", path_)
    proxy.stop()
    print("disconnected")
