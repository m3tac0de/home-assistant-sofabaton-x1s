#!/usr/bin/env python3
"""Optional legacy HTTP callback provisioning for the Hubitat example.

This writes hub configuration and replaces the selected activity button's
short and long assignments. Normal integrations consume Wifi Devices already
configured in the panel. See docs/callback-provisioning.md.
"""

import argparse
import json
import time
from urllib.error import URLError
from urllib.parse import quote

from starter import ApiError, Client


def wait_job(client, hub, job, *, timeout=900):
    job_id = job["job_id"]
    print(f"Following job {job_id} ({job['kind']})", flush=True)
    deadline = time.monotonic() + timeout
    while job["status"] in ("queued", "running"):
        if time.monotonic() >= deadline:
            raise TimeoutError(f"Job {job_id} is still pending; inspect it before another write")
        time.sleep(0.5)
        job = client.request("GET", hub + "/jobs/" + quote(job_id, safe=""))
    if job["status"] != "done":
        raise RuntimeError(f"Job did not succeed: {json.dumps(job)}. Inspect hub state before retrying")
    return job.get("result")


def setup_presses(client, hub, activity_id, button):
    """Create/reuse the default HTTP device and bind its slot 1 short/long.

    Keyed devices created through the Wifi Commands panel are separate.
    This example intentionally uses /callback-device (key "default").
    """
    # Read the activity before creating anything, so a wrong activity ID stops early.
    activities = client.request("GET", hub + "/activities")
    if not any(a["activity_id"] == activity_id for a in activities):
        raise RuntimeError("Unknown activity ID; use the activities action to select one")
    callback_path = hub + "/callback-device"
    try:
        record = client.request("GET", callback_path)
    except ApiError as err:
        if err.status != 404 or err.problem.get("type") != "callback_device_not_found":
            raise
        job = client.request("POST", callback_path, {
            "name": "Starter callbacks", "slots": [{"label": "Demo", "long_label": "Demo Long"}],
        })
        wait_job(client, hub, job)
        record = client.request("GET", callback_path)
    if record.get("stale") or record.get("pending") or not record.get("deployed"):
        raise RuntimeError(f"Callback device needs attention: {json.dumps(record)}")
    listener = client.request("GET", "/server/callback-listener")
    if not listener["bound"]:
        raise RuntimeError(f"Callback device exists, but its listener is not bound: {json.dumps(listener)}")

    # The row-edit endpoint needs complete activity detail. Follow its refresh job.
    wait_job(client, hub, client.request("POST", hub + "/snapshot/refresh", {"activity_id": activity_id}))
    snapshot = client.request("GET", hub + "/snapshot")
    device_id = record["device_id"]
    binding_path = f"{hub}/activities/{activity_id}/buttons/{quote(button, safe='')}"
    job = client.request("PUT", binding_path, {
        "device_id": device_id, "command_id": 1,
        "long_press": {"device_id": device_id, "command_id": 11},
    }, headers={"If-Match": f'"{snapshot["snapshot_id"]}"'})
    wait_job(client, hub, job)
    print(f"Ready: activity {activity_id}, button {button}, callback device {device_id}")
    print(f"Short: {record['labels']['1']}; long: {record['labels']['11']}")
    print("Destination already deployed:", json.dumps(record["target"]))
    print("Run starter.py listen for this hub, select this activity on the remote, then press the button.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--server", default="http://localhost:8480", help="Server base URL, without /api/v1")
    parser.add_argument("--hub-id", required=True, help="Registered hub ID")
    parser.add_argument("--activity", type=int, required=True)
    parser.add_argument("--button", required=True, help="ButtonName alias (for example PLAY) or numeric code")
    args = parser.parse_args()
    client = Client(args.server)
    hub = "/hubs/" + quote(args.hub_id, safe="")
    try:
        client.ready(hub)
        setup_presses(client, hub, args.activity, args.button)
    except KeyboardInterrupt:
        pass
    except (RuntimeError, OSError, URLError) as err:
        parser.exit(1, f"{err}\nNo automatic retry was made. Inspect pending jobs before another write.\n")


if __name__ == "__main__":
    main()
