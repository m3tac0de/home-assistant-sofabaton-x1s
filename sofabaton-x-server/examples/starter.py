#!/usr/bin/env python3
"""Use registered hubs: control activities, send commands and inspect events.

Register and manage hubs in the server's control panel first. See
docs/first-integration.md. This client uses HTTP/WebSocket, not a hub connection.
The listen action additionally uses websockets (included with the server's
uvicorn[standard] dependency). Configure Wifi Devices in the panel; this
example never provisions devices or changes button assignments.
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
                raise RuntimeError("Hub is disabled; enable it before sending commands")
            status = view.get("status") or {}
            if status.get("controllable") and status.get("catalog_ready"):
                return
            if time.monotonic() >= deadline:
                raise TimeoutError(f"Hub is not ready: {status}. Close the official app and check connectivity")
            time.sleep(0.5)


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
                    print(json.dumps(event), flush=True)
                    if event["type"] == "hub_event" and event["event"]["kind"] == "activity_changed":
                        payload = event["event"]["payload"]
                        # Feed the reported activity into platform state, regardless
                        # of whether our client or the physical remote changed it.
                        print(f"ACTIVITY: {payload['activity_id']} ({payload['name']})", flush=True)
                elif event["type"] == "press":
                    print(json.dumps(event, indent=2), flush=True)
                    if event["resolution"] == "deployed":
                        # All managed Wifi Devices on this hub reach this stream.
                        # Match the selected device_key from /wifi-devices plus
                        # device_id/command_id/press_type before dispatching an action.
                        print(f"PRESS: {event['label']} ({event['press_type']})", flush=True)
                elif event["type"] == "dropped":
                    print("Events were lost; re-read hub state. For missed presses, use your replay policy and GET /hubs/{hub_id}/presses?after=<last press seq>.", flush=True)
    except WebSocketException as err:
        raise RuntimeError(f"WebSocket disconnected: {err}. Reconcile press history before reconnecting") from err
    print("Connection closed. Reconcile press history before restarting the listener.")


def run(client, args):
    if args.action in ("server", "hubs"):
        print(json.dumps(client.request("GET", "/" + args.action), indent=2))
        return
    hub = "/hubs/" + quote(args.hub_id, safe="")
    if args.action == "listen":
        listen(client, args.hub_id)  # Receiving callbacks does not require control mode.
        return
    if args.action in ("send", "start", "stop"):
        client.ready(hub)
    if args.action in ("status", "devices", "activities", "wifi-devices"):
        print(json.dumps(client.request("GET", hub + "/" + args.action), indent=2))
    elif args.action == "commands":
        print(json.dumps(client.request("GET", f"{hub}/devices/{args.device}/commands"), indent=2))
    elif args.action in ("send", "start", "stop"):
        if args.action == "send":
            result = client.request("POST", hub + "/send", {"entity_id": args.device, "command_id": args.command})
        else:
            result = client.request("POST", f"{hub}/activities/{args.activity}/{args.action}")
        if not result.get("accepted"):
            raise RuntimeError(f"Command was not accepted: {result}")
        print(json.dumps(result, indent=2))
        print("Accepted for sending. Watch activity events or read status; check equipment for the physical result.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--server", default="http://localhost:8480", help="Server base URL, without /api/v1")
    parser.add_argument("--hub-id", help="Registered hub ID from the hubs action; use the MAC form once available")
    actions = parser.add_subparsers(dest="action", required=True)
    for action in ("server", "hubs", "status", "devices", "activities", "wifi-devices", "listen"):
        actions.add_parser(action)
    commands = actions.add_parser("commands", help="List command IDs and labels for a device")
    commands.add_argument("--device", type=int, required=True)
    send = actions.add_parser("send", help="Send one real command to the selected device")
    send.add_argument("--device", type=int, required=True)
    send.add_argument("--command", type=int, required=True)
    for action in ("start", "stop"):
        activity = actions.add_parser(action, help=f"{action.capitalize()} an activity")
        activity.add_argument("--activity", type=int, required=True)
    args = parser.parse_args()
    if args.action not in ("server", "hubs") and not args.hub_id:
        parser.error("--hub-id is required for this action; run hubs first")
    try:
        run(Client(args.server), args)
    except KeyboardInterrupt:
        pass
    except (RuntimeError, OSError, URLError) as err:
        parser.exit(1, f"{err}\nNo automatic retry was made. Check hub state before repeating a command.\n")


if __name__ == "__main__":
    main()
