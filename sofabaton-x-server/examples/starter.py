#!/usr/bin/env python3
"""Use a registered hub: send commands and watch state or remote presses.

Register and manage hubs in the server's control panel first. See
docs/first-integration.md. This client uses HTTP/WebSocket, not a hub connection.
The listen action additionally uses websockets (included with the server's
uvicorn[standard] dependency). Optional one-time setup writes a callback device if missing and
replaces both bindings of the explicitly selected activity button.
Requests are never automatically retried. Listen ends on disconnection;
production reconnect/catch-up guidance is in docs/platform-integration.md.
"""

import argparse
import json
import time
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode, urlsplit, urlunsplit
from urllib.request import Request, urlopen


class ApiError(RuntimeError):
    def __init__(self, status, problem):
        self.status = status
        self.problem = problem
        super().__init__(f"HTTP {status}: {json.dumps(problem)}")


class Client:
    def __init__(self, server):
        self.api = server.rstrip("/") + "/api/v1"

    def request(self, method, path, body=None, *, headers=None):
        data = None if body is None else json.dumps(body).encode("utf-8")
        request = Request(
            self.api + path, data=data, method=method,
            headers={"Accept": "application/json", "Content-Type": "application/json", **(headers or {})},
        )
        try:
            with urlopen(request, timeout=30) as response:
                return json.load(response)
        except HTTPError as err:
            text = err.read().decode("utf-8", errors="replace")
            try:
                problem = json.loads(text)
            except ValueError:
                problem = {"detail": text}
            raise ApiError(err.code, problem) from err

    def ready(self, hub, *, timeout=30):
        deadline = time.monotonic() + timeout
        while True:
            view = self.request("GET", hub + "/status")
            if not view["enabled"]:
                raise RuntimeError("Hub is disabled; enable it before sending or setting up presses")
            status = view.get("status") or {}
            if status.get("controllable") and status.get("catalog_ready"):
                return
            if time.monotonic() >= deadline:
                raise TimeoutError(f"Hub is not ready: {status}. Close the official app and check connectivity")
            time.sleep(0.5)

    def wait_job(self, hub, job, *, timeout=900):
        job_id = job["job_id"]
        print(f"Following job {job_id} ({job['kind']})", flush=True)
        deadline = time.monotonic() + timeout
        while job["status"] in ("queued", "running"):
            if time.monotonic() >= deadline:
                raise TimeoutError(f"Job {job_id} is still pending; inspect it before another write")
            time.sleep(0.5)
            job = self.request("GET", hub + "/jobs/" + quote(job_id, safe=""))
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
        client.wait_job(hub, job)
        record = client.request("GET", callback_path)
    if record.get("stale") or record.get("pending") or not record.get("deployed"):
        raise RuntimeError(f"Callback device needs attention: {json.dumps(record)}")
    listener = client.request("GET", "/server/callback-listener")
    if not listener["bound"]:
        raise RuntimeError(f"Callback device exists, but its listener is not bound: {json.dumps(listener)}")

    # The row-edit endpoint needs complete activity detail. Follow its refresh job.
    client.wait_job(hub, client.request("POST", hub + "/snapshot/refresh", {"activity_id": activity_id}))
    snapshot = client.request("GET", hub + "/snapshot")
    device_id = record["device_id"]
    binding_path = f"{hub}/activities/{activity_id}/buttons/{quote(button, safe='')}"
    job = client.request("PUT", binding_path, {
        "device_id": device_id, "command_id": 1,
        "long_press": {"device_id": device_id, "command_id": 11},
    }, headers={"If-Match": f'"{snapshot["snapshot_id"]}"'})
    client.wait_job(hub, job)
    print(f"Ready: activity {activity_id}, button {button}, callback device {device_id}")
    print(f"Short: {record['labels']['1']}; long: {record['labels']['11']}")
    print("Destination already deployed:", json.dumps(record["target"]))
    print("Run listen, select this activity on the remote, then press the button.")


def event_url(api, hub_id):
    parts = urlsplit(api)
    return urlunsplit((
        "wss" if parts.scheme == "https" else "ws", parts.netloc,
        parts.path + "/events", urlencode({"hub_id": hub_id}), "",
    ))


def listen(client, hub_id):
    try:
        from websockets.sync.client import connect
        from websockets.exceptions import WebSocketException
    except ImportError as err:
        raise RuntimeError('Install the listener dependency: python -m pip install "websockets>=12"') from err
    url = event_url(client.api, hub_id)
    print(f"Listening on {url}; Ctrl+C to stop", flush=True)
    try:
        with connect(url, open_timeout=10) as connection:
            for raw in connection:
                event = json.loads(raw)
                if event["type"] == "hello":
                    print("Connected to server instance", event["instance_id"], flush=True)
                elif event["type"] in ("hub_event", "server_event"):
                    # Update platform state here; activity events need no callback device.
                    print(json.dumps(event), flush=True)
                elif event["type"] == "press":
                    print(json.dumps(event, indent=2), flush=True)
                    if event["resolution"] == "deployed":
                        # All managed Wifi Devices on this hub reach this stream.
                        # Match device_key ("default" for setup-presses) plus
                        # device_id/command_id/press_type before dispatching an action.
                        print(f"PRESS: {event['label']} ({event['press_type']})", flush=True)
                elif event["type"] == "dropped":
                    print("Events were lost; re-read hub state. For missed presses, use your replay policy and GET /hubs/{hub_id}/presses?after=<last press seq>.", flush=True)
    except WebSocketException as err:
        raise RuntimeError(f"WebSocket disconnected: {err}. Reconcile press history before reconnecting") from err
    print("Connection closed. Reconcile press history before restarting the listener.")


def run(client, args):
    if args.action == "hubs":
        print(json.dumps(client.request("GET", "/hubs"), indent=2))
        return
    hub = "/hubs/" + quote(args.hub_id, safe="")
    if args.action == "listen":
        listen(client, args.hub_id)  # Receiving callbacks does not require control mode.
        return
    client.ready(hub)
    if args.action in ("devices", "activities"):
        print(json.dumps(client.request("GET", hub + "/" + args.action), indent=2))
    elif args.action == "commands":
        print(json.dumps(client.request("GET", f"{hub}/devices/{args.device}/commands"), indent=2))
    elif args.action == "send":
        result = client.request("POST", hub + "/send", {"entity_id": args.device, "command_id": args.command})
        if not result.get("accepted"):
            raise RuntimeError(f"Command was not accepted: {result}")
        print(json.dumps(result, indent=2))
        print("Accepted for sending. Check the equipment for the physical result.")
    elif args.action == "setup-presses":
        setup_presses(client, hub, args.activity, args.button)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--server", default="http://localhost:8480", help="Server base URL, without /api/v1")
    parser.add_argument("--hub-id", help="Registered hub ID from the hubs action; use the MAC form once available")
    actions = parser.add_subparsers(dest="action", required=True)
    for action in ("hubs", "devices", "activities", "listen"):
        actions.add_parser(action)
    commands = actions.add_parser("commands", help="List command IDs and labels for a device")
    commands.add_argument("--device", type=int, required=True)
    send = actions.add_parser("send", help="Send one real command to the selected device")
    send.add_argument("--device", type=int, required=True)
    send.add_argument("--command", type=int, required=True)
    setup = actions.add_parser("setup-presses", help="Create/reuse callbacks and replace the selected button's short/long bindings")
    setup.add_argument("--activity", type=int, required=True)
    setup.add_argument("--button", required=True, help="Chosen ButtonName alias (for example PLAY) or numeric code")
    args = parser.parse_args()
    if args.action != "hubs" and not args.hub_id:
        parser.error("--hub-id is required for this action; run hubs first")
    try:
        run(Client(args.server), args)
    except KeyboardInterrupt:
        pass
    except (RuntimeError, OSError, URLError) as err:
        parser.exit(1, f"{err}\nNo automatic retry was made. Inspect any pending jobs before repeating a write.\n")


if __name__ == "__main__":
    main()
