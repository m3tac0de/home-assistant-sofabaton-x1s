"""Backup/restore program chunk 5: HA-action blob trailer gate.

Builds a wifi_ip device payload exactly the way the backup editor
provisions HA-action hosts (``buildHaHostEntry`` / ``buildHaActionCommandRow``
in ``www/src/tabs/backup-state.ts``): command blobs rendered by
``renderHaActionDataHex`` carry NO 1-byte inner-record trailer, unlike
real hub-dumped wifi_ip records (tests/test_wifi_ip_apps_backup_roundtrip.py).

Gate (docs/protocol/live-hub-testing.md "Pending validation: HA-action
blobs without inner-record trailer"):
  1. family-0x0E save pages acked ``0x0103/0x00`` (not ``0x0C``) —
     ``restore_device`` succeeding proves this, since command-write
     steps declare 0x0C as a reject byte and any reject fails the run;
  2. triggering the restored command fires the HTTP callback at the
     configured host:port with the expected ``/launch/ha/...`` path —
     validated here without touching the remote by pointing the target
     at a local HTTP listener and sending OP_REQ_ACTIVATE
     (``proxy.send_command``).

If the hub rejects trailer-less records the fix belongs in
``build_command_write_steps`` (outer-record checksum), not the TS writer.

Cleanup deletes the restored device; per chunk 3 the device-delete sweep
purges the single-member "Bench Test" activity, so re-run
``bench_63_bench_test_restore.py`` afterwards.

Usage:
    python bench_69_ha_action.py <ip> <X1S> <tag> [listener_port]
"""

from __future__ import annotations

import http.server
import json
import socket
import sys
import threading
import time
import urllib.parse

from bench_common import connect, save_json, setup_logging
from bench_compare import compare_device_backup

HOST = sys.argv[1]
HUB_VERSION = sys.argv[2]
TAG = sys.argv[3]
LISTENER_PORT = int(sys.argv[4]) if len(sys.argv) > 4 else 8060

DEVICE_NAME = "Bench HA Host"
PROTECTED_ACTIVITIES = [0x65, 0x66, 0x67]  # 0x68 Bench Test is expected to be purged
BENCH_TEST_ACTIVITY = 0x68
SOURCE_DEVICE_ID = 1  # bundle-time id; remapped by the hub on restore
HA_ACTION_LIBRARY_TYPE = 0x1C

log_path = setup_logging(f"br-haact-{TAG}")
print(f"logging to {log_path}")


# ---------------------------------------------------------------- listener
class _Capture(http.server.BaseHTTPRequestHandler):
    hits: list[dict] = []

    def _record(self):
        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length) if length else b""
        _Capture.hits.append(
            {
                "method": self.command,
                "path": self.path,
                "client": self.client_address[0],
                "host_header": self.headers.get("Host"),
                "content_type": self.headers.get("Content-Type"),
                "body": body.decode("ascii", "replace"),
                "at": time.time(),
            }
        )
        self.send_response(200)
        self.send_header("Content-Length", "0")
        self.end_headers()

    do_GET = do_POST = _record

    def log_message(self, *args):  # quiet
        pass


def local_ip_toward(hub_ip: str) -> str:
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect((hub_ip, 9))
        return s.getsockname()[0]
    finally:
        s.close()


# ------------------------------------------------------ editor-shape payload
def render_ha_action_data_hex(host: str, port: int, path: str) -> str:
    """Port of renderHaActionDataHex (backup-state.ts) — NO inner trailer."""
    text = (
        f"POST {path} HTTP/1.1\r\n"
        f"Host:{host}:{port}\r\n"
        "Content-Type:application/x-www-form-urlencoded\r\n"
        "\r\n"
    )
    text_bytes = text.encode("ascii")
    ip_bytes = bytes(int(part) & 0xFF for part in host.split("."))
    blob = (
        ip_bytes
        + port.to_bytes(2, "big")
        + len(text_bytes).to_bytes(2, "big")
        + text_bytes
    )
    return blob.hex(" ")


def ha_action_command_row(device_id: int, command_id: int, name: str, host: str, port: int) -> dict:
    """Port of buildHaActionCommandRow (backup-state.ts)."""
    path = f"/launch/ha/{device_id}/{urllib.parse.quote(name)}/short"
    code = (0x4E20 + (command_id & 0xFF)) & 0xFFFFFFFFFFFF
    return {
        "command_id": command_id,
        "name": name,
        "restore_data": {
            "transport": "hub_code_record",
            "library_type": HA_ACTION_LIBRARY_TYPE,
            "command_code": code.to_bytes(6, "big").hex(" "),
            "data_hex": render_ha_action_data_hex(host, port, path),
            "decoded": {
                "class": "wifi_ip",
                "fields": {
                    "host": host,
                    "port": port,
                    "method": "POST",
                    "path": path,
                    "header": "",
                    "content_type": "application/x-www-form-urlencoded",
                    "body": "",
                },
                "trailer_hex": "",
                "edited": False,
            },
        },
    }


def ha_host_payload(host: str, port: int) -> dict:
    """Port of buildHaHostEntry (backup-state.ts) wrapped as a device_backup."""
    return {
        "kind": "device_backup",
        "schema_version": 4,
        "ha_action_host": True,
        "device": {
            "device_id": SOURCE_DEVICE_ID,
            "name": DEVICE_NAME,
            "brand": "m3tac0de",
            "device_class": "wifi_ip",
            "device_class_code": 0x1C,
            "icon": 1,
            "sort": 99,
            "code_type": 0x1C,
            "device_type": 0x10,
            "code_id_hex": " ".join(["00"] * 16),
            "hide": 0,
            "input_flag": 0,
            "channel": 0,
            "power_state": 0,
            "poll_time": 0,
            "input_mode": 2,
            "power_mode": 0,
            "power_style": 0,
            "share_mode": 0,
            "tail_marker": 1,
        },
        "commands": [
            ha_action_command_row(SOURCE_DEVICE_ID, 1, "Bench Action", host, port),
            ha_action_command_row(SOURCE_DEVICE_ID, 2, "Bench Action Two", host, port),
        ],
        "button_bindings": [],
        "macros": [],
    }


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


# ---------------------------------------------------------------- run
bench_ip = local_ip_toward(HOST)
server = http.server.ThreadingHTTPServer(("0.0.0.0", LISTENER_PORT), _Capture)
threading.Thread(target=server.serve_forever, daemon=True).start()
print(f"HTTP listener on {bench_ip}:{LISTENER_PORT}")

payload = ha_host_payload(bench_ip, LISTENER_PORT)
expected_paths = {
    1: f"/launch/ha/{SOURCE_DEVICE_ID}/Bench%20Action/short",
    2: f"/launch/ha/{SOURCE_DEVICE_ID}/Bench%20Action%20Two/short",
}

proxy = connect(HOST, HUB_VERSION)
artifacts: dict = {
    "host": HOST,
    "hub_version": HUB_VERSION,
    "bench_ip": bench_ip,
    "listener_port": LISTENER_PORT,
    "payload": payload,
}
new_id = None
try:
    devs0, acts0 = snapshot_catalog(proxy)
    print(f"baseline catalog: {len(devs0)} devices, {len(acts0)} activities")
    # informational: prior runs' cleanup may have purged single-member 0x68
    print(f"Bench Test (0x68) at start: {'present' if BENCH_TEST_ACTIVITY in acts0 else 'absent (purged by earlier device-delete; bench_63 re-restores)'}")
    artifacts["bench_test_present_at_start"] = BENCH_TEST_ACTIVITY in acts0

    # ---- restore: THE trailer gate. Command-write steps declare 0x0C as
    # a reject byte, so success == every 0x0E page acked 0x0103/0x00.
    print(f"restoring editor-shaped HA-action host {DEVICE_NAME!r}...")
    t0 = time.time()
    result = proxy.restore_device(payload)
    elapsed = time.time() - t0
    artifacts["restore_result"] = result
    check(
        "GATE: restore accepted (0x0E pages acked 0x0103/0x00, no 0x0C)",
        bool(result) and result.get("status") == "success",
        f"{elapsed:.1f}s result={result}",
    )
    if not result or result.get("status") != "success":
        raise SystemExit("restore failed; stopping")

    new_id = int(result["device_id"])
    cmd_map = {int(k): int(v) for k, v in (result.get("command_id_map") or {}).items()}
    check("assigned id is fresh", new_id not in devs0, f"new_id=0x{new_id:02X}")
    check("both commands mapped", len(cmd_map) == 2, f"map={cmd_map}")

    # ---- re-read + round-trip compare
    print(f"re-reading restored device 0x{new_id:02X}...")
    reread = proxy.backup_device(new_id, include_blobs=True)
    artifacts["reread"] = reread
    check("re-read returned payload", isinstance(reread, dict))
    if isinstance(reread, dict):
        problems, notes = compare_device_backup(
            payload, reread,
            command_id_map=cmd_map,
            expected_name=DEVICE_NAME,
            hub_version=HUB_VERSION,
        )
        artifacts["compare_problems"] = problems
        artifacts["compare_notes"] = notes
        # Keys the hub re-read carries but the editor-shaped source never
        # sets (idle_behavior, inputs_configured, ...) are shape diffs,
        # not round-trip failures.
        shape_only = [p for p in problems if "source=None" in p]
        problems = [p for p in problems if "source=None" not in p]
        notes.extend(f"{p} (absent from editor payload)" for p in shape_only)
        artifacts["compare_shape_only"] = shape_only
        for note in notes:
            print(f"  note: {note}")
        for item in problems:
            print("  problem:", item)
        # Focused blob check: stored record must be the trailer-less body
        # byte-for-byte (persist tail is split off by the exporter).
        dst_cmds = {int(c["command_id"]): c for c in reread.get("commands") or []}
        for src_cmd in payload["commands"]:
            src_id = int(src_cmd["command_id"])
            dst = dst_cmds.get(cmd_map.get(src_id, -1)) or {}
            dst_rd = dst.get("restore_data") or {}
            check(
                f"command {src_id} blob byte-equal (trailer-less)",
                dst_rd.get("data_hex") == src_cmd["restore_data"]["data_hex"],
                f"tail={dst_rd.get('persist_tail_hex')!r}",
            )
        check("full round-trip compare", not problems, f"{len(problems)} problem(s)")

    # ---- live-fire: OP_REQ_ACTIVATE the restored command, expect the
    # hub to POST the callback to our listener.
    # One REQ_ACTIVATE on a wifi_ip command makes the hub repeat the HTTP
    # callback ~10/s indefinitely (no key-up exists on this opcode path;
    # observed runs 1-2, where command 1's spam drowned command 2's
    # window). Command 1's path was already proven in runs 1-2, so this
    # run fires ONLY command 2, then probes whether key_code=0x00 acts
    # as a release that stops the repeat.
    src_id = 2
    hub_cmd = cmd_map.get(src_id, src_id)
    _Capture.hits.clear()
    print(f"live-firing command {src_id} (hub key 0x{hub_cmd:02X})...")
    sent = proxy.send_command(new_id, hub_cmd)
    deadline = time.time() + 10
    while time.time() < deadline:
        time.sleep(0.2)
    hits = list(_Capture.hits)
    artifacts[f"live_fire_{src_id}"] = {"sent": sent, "hits": hits}
    check(
        f"GATE: command {src_id} HTTP callback received",
        bool(hits),
        f"{len(hits)} request(s) in 10s" if hits else "no request within 10s",
    )
    if hits:
        got = {(h["method"], h["path"]) for h in hits}
        check(
            f"command {src_id} callback method+path",
            got == {("POST", expected_paths[src_id])},
            f"got={sorted(got)} x{len(hits)} (expected POST {expected_paths[src_id]})",
        )

    # ---- release probe: does key_code 0x00 stop the hub-side repeat?
    print("release probe: sending key_code 0x00...")
    proxy.send_command(new_id, 0)
    time.sleep(3.0)
    _Capture.hits.clear()
    time.sleep(6.0)
    after_release = len(_Capture.hits)
    artifacts["release_probe"] = {"hits_in_6s_after_release": after_release}
    check(
        "repeat stops after key_code=0x00",
        after_release == 0,
        f"{after_release} request(s) in 6s post-release",
    )

    # ---- cleanup: delete the host device
    print(f"deleting restored device 0x{new_id:02X}...")
    del_result = proxy.delete_device(new_id)
    artifacts["delete_result"] = del_result
    check(
        "delete_device returned success",
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
    # Expected chunk-3 behavior: the sweep purges single-member Bench Test.
    print(
        f"Bench Test (0x68) after delete: {'present' if BENCH_TEST_ACTIVITY in acts1 else 'purged (expected; re-run bench_63)'}"
    )
    artifacts["bench_test_present_after_delete"] = BENCH_TEST_ACTIVITY in acts1
finally:
    server.shutdown()
    artifacts["checks"] = [
        {"label": label, "ok": ok, "detail": detail} for label, ok, detail in checks
    ]
    path = save_json(f"br-haact-{TAG}", artifacts)
    print("artifacts saved:", path)
    proxy.stop()
    print("disconnected")

failed = [c for c in checks if not c[1]]
print(f"\n{len(checks) - len(failed)}/{len(checks)} checks passed")
if failed:
    sys.exit(1)
