#!/usr/bin/env python3
"""Build a WiFi-command HTTP listener ON TOP of sofabaton.

Executing HTTP callbacks is deliberately out of scope for the library —
it only carries the protocol side. This sketch shows the full pattern
the Home Assistant integration implements with its Roku-style listener:

1. ``create_wifi_device`` provisions a virtual "network callback" device
   on the hub. Each command slot is bound to an HTTP request the hub
   will fire at ``<this machine>:<request_port>`` when the user presses
   the button on the remote.
2. The requests look like Roku ECP launches::

       POST /launch/<action_id>/<device_id>/<command_index>/<press_type>

   so a tiny HTTP server + path parser is all an application needs to
   turn remote presses into arbitrary actions.

The proxy is driven through the asyncio facade; the stdlib HTTP server
is blocking, so it runs in the loop's executor.
"""

import asyncio
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from sofabaton import AsyncXProxy, async_discover_hubs

LISTEN_PORT = 8060

COMMANDS = [
    {"display_name": "Lights On", "trigger_name": "Lights On", "press_type": "short", "command_index": 0},
    {"display_name": "Lights Off", "trigger_name": "Lights Off", "press_type": "short", "command_index": 1},
]

_LAUNCH_RE = re.compile(r"^/launch/(\d+)/(\d+)/(\d+)/(short|long)$")


class HubCallbackHandler(BaseHTTPRequestHandler):
    def do_POST(self):  # noqa: N802 - stdlib API
        match = _LAUNCH_RE.match(self.path)
        if match:
            action_id, device_id, command_index, press_type = match.groups()
            slot = int(command_index)
            name = COMMANDS[slot]["trigger_name"] if slot < len(COMMANDS) else f"slot {slot}"
            print(f"remote pressed: {name} ({press_type}) [device {device_id}]")
            # ... do something real here: toggle lights, call an API, ...
        self.send_response(200)
        self.end_headers()

    def log_message(self, *args):  # quiet the default request logging
        pass


async def main() -> None:
    loop = asyncio.get_running_loop()
    hubs = await async_discover_hubs(timeout=5.0)
    if not hubs:
        raise SystemExit("no hub found")
    hub = hubs[0]

    proxy = AsyncXProxy(
        hub_ip=hub.host,
        mdns_instance=hub.name,
        mdns_txt=hub.txt,
        hub_version=hub.hub_version,
    )
    server = ThreadingHTTPServer(("0.0.0.0", LISTEN_PORT), HubCallbackHandler)
    async with proxy:
        # Provisioning writes to the hub, so own it first (no app attached).
        if not await proxy.wait_until_controllable(timeout=30):
            raise SystemExit("hub not controllable (not connected, or an app is attached)")

        # One-time provisioning (idempotent re-runs update the device).
        created = await proxy.create_wifi_device(
            device_name="My Bridge",
            commands=COMMANDS,
            request_port=LISTEN_PORT,
        )
        print("wifi device:", created)

        print(f"listening for hub callbacks on :{LISTEN_PORT} — Ctrl+C to stop")
        try:
            # serve_forever() blocks, so run it in the executor; shut it
            # down (from this thread) on cancellation / Ctrl+C.
            await loop.run_in_executor(None, server.serve_forever)
        finally:
            server.shutdown()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
