#!/usr/bin/env python3
"""Run a proxy in front of a physical hub and send a command.

The proxy advertises itself via mDNS exactly like the hub it fronts,
so the official Sofabaton app keeps working — pointed at the proxy —
while this process observes and injects traffic.

Discovery feeds the proxy: the TXT records of the discovered hub tell
the proxy which variant (X1/X1S/X2) to speak.

This uses the asyncio facade (``AsyncX1Proxy``): blocking calls run in
the event loop's executor and listener callbacks — plain functions or
coroutines — are delivered on the loop, so you never touch the engine
threads. A synchronous ``X1Proxy`` with the same surface is also
available if you prefer.
"""

import asyncio

from sofapython import AsyncX1Proxy, ButtonName, async_discover_hubs


async def main() -> None:
    hubs = await async_discover_hubs(timeout=5.0)
    if not hubs:
        raise SystemExit("no hub found; pass the IP/TXT manually instead")
    hub = hubs[0]
    print(f"proxying {hub.name} ({hub.hub_version}) at {hub.host}")

    proxy = AsyncX1Proxy(
        real_hub_ip=hub.host,
        mdns_instance=hub.name,
        mdns_txt=hub.txt,          # carries HVER -> variant classification
        hub_version=hub.hub_version,
    )

    proxy.on_hub_state_change(lambda up: print("hub:", "up" if up else "down"))
    proxy.on_client_state_change(lambda up: print("app:", "connected" if up else "gone"))

    async def on_activity(new_id, old_id, name):   # coroutine callbacks work too
        print(f"activity -> {name} ({new_id})")

    proxy.on_activity_change(on_activity)
    proxy.on_burst_end("activities", lambda *a, **k: print("activity catalog updated"))

    async with proxy:
        # Catalogs are fetched from the hub when no real app is connected.
        activities = await proxy.activities()
        print("activities:", {aid: info.get("name") for aid, info in activities.items()})

        devices = await proxy.devices()
        print("devices:", {did: info.get("name") for did, info in devices.items()})

        if activities:
            target = next(iter(activities))
            # Press a button on an activity or device. Returns False if
            # refused (a real app client is connected through the proxy).
            if await proxy.press(target, ButtonName.OK):
                print(f"sent OK to {target}")
            # Switching activities is a named operation:
            #   await proxy.start_activity(target)
            #   await proxy.stop_activity(target)


if __name__ == "__main__":
    asyncio.run(main())
