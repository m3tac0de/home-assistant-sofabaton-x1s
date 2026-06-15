#!/usr/bin/env python3
"""Watch a live session: react to what the user does on their remote.

This is the proxy's signature trick. Point the official Sofabaton app at
this proxy (it's advertised over mDNS like a real hub), then use your
remote normally — every activity switch, app connect/disconnect and OTA
event is surfaced here in real time. You observe a *live* session
without the app noticing anything changed.

This is *observe mode*: while the app is connected it owns the hub, so
you can watch but not issue commands (reads come from cache, and
``press``/``start_activity`` would be refused). To take control instead,
disconnect the app and see ``minimal_proxy.py``.

Callbacks may be plain functions or coroutines; either way they are
delivered on the event loop.
"""

import asyncio

from sofabaton import AsyncXProxy, async_discover_hubs


async def main() -> None:
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

    async def on_activity(new_id, old_id, name):
        print(f"activity -> {name or '?'}  (id {old_id} -> {new_id})")

    proxy.on_activity_change(on_activity)
    proxy.on_client_state_change(lambda up: print("app:", "connected" if up else "gone"))
    proxy.on_hub_state_change(lambda up: print("hub:", "up" if up else "down"))
    proxy.on_ota_update(lambda *a, **k: print("hub OTA update in progress"))

    async with proxy:
        # Wait until the proxy is advertising itself over mDNS — that's what
        # lets the official app discover it and point at it. Until then there
        # is nothing to watch. (Returns False if the hub never connects.)
        if not await proxy.wait_until_discoverable(timeout=30):
            raise SystemExit("hub never connected")
        print(f"watching {hub.name} — point the app here and use your remote; Ctrl+C to stop")
        try:
            while True:
                await asyncio.sleep(3600)
        except (KeyboardInterrupt, asyncio.CancelledError):
            pass


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
