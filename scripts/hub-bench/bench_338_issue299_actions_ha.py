"""Issue #299 actions through the REAL HA path, X1S only.

Drives the deployed Home Assistant's own service calls (REST) and reads
the results back through HA (export_snapshot, fetch_blob). Everything it
writes is scratch and removed at the end:

1. create_activity "Bench 299" (icon 11) -> an id from 101; export_snapshot
   carries it with that name and icon;
2. delete_activity on it -> export_snapshot no longer has it;
3. create_device "Bench 299 HTTP" (wifi_ip) -> an id; export_snapshot
   carries it as a wifi_ip device;
4. set_wifi_command adds "B299 Power": POST to an IPv4 URL with a query,
   Content-Type and one more header, a body -> request text; fetch_blob
   decodes exactly those fields under that label;
5. set_wifi_command overwrites it: GET, another host and path, renamed
   "B299 Toggle" -> fetch_blob shows the new fields and label;
6. set_wifi_command refuses an https URL on the X1S (no hub I/O);
7. cleanup: delete_device on the scratch device -> gone.

Between hub writes it waits PAUSE_S: the hub refuses writes, and answers
reads incompletely, for a while after a remote-sync trigger
(hub-refuses-writes-during-remote-sync), and every write here ends with
one. The HA log since the start must hold no integration ERROR.

Usage (the bench venv has websocket-client):
    .venv-bench\\Scripts\\python.exe scripts\\hub-bench\\bench_338_issue299_actions_ha.py x1s

Report: out/bench_338_issue299_<ts>.json.
"""

from __future__ import annotations

import sys
import time

import ha_bench as hb

PAUSE_S = 90
ACTIVITY_NAME = "Bench 299"
ACTIVITY_ICON = 11
DEVICE_NAME = "Bench 299 HTTP"

if (sys.argv[1].lower() if len(sys.argv) > 1 else "") != "x1s":
    raise SystemExit("usage: bench_338_issue299_actions_ha.py x1s  (X1S only)")

tally = hb.Tally("bench_338_issue299")
check = tally.check


class _Abort(Exception):
    """A step failed that the rest depends on: go to cleanup."""


def pause(why: str) -> None:
    print(f"  ... {PAUSE_S} s pause ({why})", flush=True)
    time.sleep(PAUSE_S)


def snapshot(hub: hb.Hub) -> dict:
    status, resp = hb.service("export_snapshot", {"device": hub.device}, response=True)
    if status != 200 or not isinstance(resp, dict) or not resp.get("bundle"):
        raise RuntimeError(f"export_snapshot failed: {status} {resp!r}")
    return resp["bundle"]


def stored(hub: hb.Hub, device_id: int, command_id: int) -> dict:
    status, resp = hb.service(
        "fetch_blob", {"device": hub.device, "device_id": device_id, "command_id": command_id}, response=True
    )
    if status != 200 or not isinstance(resp, dict):
        raise RuntimeError(f"fetch_blob failed: {status} {resp!r}")
    rows = [r for r in resp.get("commands") or [] if int(r.get("command_id") or 0) == command_id]
    return rows[0] if rows else {}


def command_name(bundle: dict, device_id: int, command_id: int) -> str | None:
    device = hb.bundle_device(bundle, device_id) or {}
    for row in device.get("commands") or []:
        if int(row.get("command_id") or 0) == command_id:
            return row.get("name")
    return None


def main() -> int:
    ws = hb.wait_for_ha()
    hub = hb.resolve_hub(ws, "X1S")
    if hub.version.upper() != "X1S":
        raise SystemExit(f"refusing: hub reports {hub.version!r}")
    hub.wait_connected(ws)
    mark = hb.log_mark()
    before = snapshot(hub)
    tally.note(f"before: {len(before.get('devices') or [])} devices, {len(before.get('activities') or [])} activities")

    activity_id = 0
    device_id = 0
    try:
        tally.section("create_activity")
        status, resp = hb.service(
            "create_activity", {"device": hub.device, "name": ACTIVITY_NAME, "icon": ACTIVITY_ICON}, response=True
        )
        activity_id = int((resp or {}).get("activity_id") or 0) if status == 200 else 0
        check("create_activity answers an activity id from 101", activity_id >= 101, f"{status} {resp!r}")
        if activity_id:
            row = (hb.bundle_activity(snapshot(hub), activity_id) or {}).get("device") or {}
            check("export_snapshot carries the new activity", row.get("name") == ACTIVITY_NAME, repr(row.get("name")))
            check("the new activity has the asked icon", row.get("icon") == ACTIVITY_ICON, repr(row.get("icon")))

            pause("after the create's remote sync")
            tally.section("delete_activity")
            status, resp = hb.service("delete_activity", {"device": hub.device, "activity_id": activity_id})
            check("delete_activity answers 200", status == 200, f"{status} {resp!r}")
            gone = hb.bundle_activity(snapshot(hub), activity_id) is None
            check("export_snapshot no longer has the activity", gone)
            if gone:
                activity_id = 0
            pause("after the delete's remote sync")

        tally.section("create_device")
        status, resp = hb.service(
            "create_device", {"device": hub.device, "name": DEVICE_NAME, "device_class": "wifi_ip"}, response=True
        )
        device_id = int((resp or {}).get("device_id") or 0) if status == 200 else 0
        check("create_device answers a device id", 0 < device_id < 101, f"{status} {resp!r}")
        if not device_id:
            raise _Abort
        block = (hb.bundle_device(snapshot(hub), device_id) or {}).get("device") or {}
        check("export_snapshot carries the new wifi_ip device",
              block.get("name") == DEVICE_NAME and block.get("device_class") == "wifi_ip",
              f"{block.get('name')!r} {block.get('device_class')!r}")

        pause("after the create's remote sync")
        tally.section("set_wifi_command: add")
        status, resp = hb.service(
            "set_wifi_command",
            {
                "device": hub.device,
                "device_id": device_id,
                "name": "B299 Power",
                "url": "http://192.168.2.250:8080/api/power?x=1",
                "method": "POST",
                "headers": {"Content-Type": "application/json", "X-Bench": "299"},
                "body": '{"on":true}',
            },
            response=True,
        )
        command_id = int((resp or {}).get("command_id") or 0) if status == 200 else 0
        check("set_wifi_command adds a command", command_id > 0, f"{status} {resp!r}")
        check("the added command is request text", (resp or {}).get("record") == "request_text", repr(resp))
        if command_id:
            pause("after the sync's remote sync, before reading back")
            row = stored(hub, device_id, command_id)
            fields = (row.get("decoded") or {}).get("fields")
            check("the hub stores the added request", fields == {
                "host": "192.168.2.250", "port": 8080, "method": "POST", "path": "/api/power?x=1",
                "header": "X-Bench: 299", "content_type": "application/json", "body": '{"on":true}',
            }, repr(fields))
            check("the hub stores its label", row.get("command_label") == "B299 Power", repr(row.get("command_label")))
            check("export_snapshot carries the command",
                  command_name(snapshot(hub), device_id, command_id) == "B299 Power")

            tally.section("set_wifi_command: overwrite + rename")
            status, resp = hb.service(
                "set_wifi_command",
                {
                    "device": hub.device,
                    "device_id": device_id,
                    "command_id": command_id,
                    "name": "B299 Toggle",
                    "url": "http://192.168.2.251/toggle",
                    "headers": ["X-Bench: 299b"],
                },
                response=True,
            )
            check("set_wifi_command overwrites it", status == 200 and (resp or {}).get("command_id") == command_id,
                  f"{status} {resp!r}")
            pause("after the sync's remote sync, before reading back")
            row = stored(hub, device_id, command_id)
            fields = (row.get("decoded") or {}).get("fields")
            check("the hub stores the new request", fields == {
                "host": "192.168.2.251", "port": 80, "method": "GET", "path": "/toggle",
                "header": "X-Bench: 299b", "content_type": "", "body": "",
            }, repr(fields))
            check("the hub stores the new label", row.get("command_label") == "B299 Toggle",
                  repr(row.get("command_label")))
            after = snapshot(hub)
            check("export_snapshot follows the rename", command_name(after, device_id, command_id) == "B299 Toggle")
            commands = (hb.bundle_device(after, device_id) or {}).get("commands") or []
            check("the device holds exactly that one command", len(commands) == 1, repr(commands))

        tally.section("set_wifi_command: X1S refuses https")
        refuse_mark = hb.log_mark()
        status, _resp = hb.service(
            "set_wifi_command",
            {"device": hub.device, "device_id": device_id, "name": "B299 https", "url": "https://192.168.2.250/x"},
            response=True,
        )
        check("an https URL is refused", status != 200, str(status))
        time.sleep(3)
        check("the log says why", bool(hb.grep(hb.log_since(refuse_mark), "need an X2")))
    except _Abort:
        pass
    finally:
        tally.section("cleanup")
        if activity_id:
            status, resp = hb.service("delete_activity", {"device": hub.device, "activity_id": activity_id})
            check("leftover activity deleted", status == 200, f"{status} {resp!r}")
            pause("after the delete's remote sync")
        if device_id:
            pause("before deleting the scratch device")
            status, resp = hb.service("delete_device", {"device": hub.device, "device_id": device_id})
            check("scratch device deleted", status == 200, f"{status} {resp!r}")
            check("export_snapshot no longer has the device", hb.bundle_device(snapshot(hub), device_id) is None)
        final = snapshot(hub)
        check("device and activity counts are back",
              (len(final.get("devices") or []), len(final.get("activities") or []))
              == (len(before.get("devices") or []), len(before.get("activities") or [])))
        time.sleep(5)
        errors = hb.errors_in(hb.log_since(mark))
        check("no integration ERROR in the HA log", not errors, "\n".join(errors[:5]))
        ws.close()
    return tally.finish()


if __name__ == "__main__":
    sys.exit(main())
