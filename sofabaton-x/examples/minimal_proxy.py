#!/usr/bin/env python3
"""Take control of a hub: proxy it, read its catalog, switch an activity.

The proxy advertises itself via mDNS exactly like the hub it fronts, so
the official Sofabaton app keeps working — pointed at the proxy — while
this process observes and injects traffic.

This is a *control-mode* example: the interesting operations (fresh
reads, sending commands, switching activities) require the proxy to own
the hub, which means the hub is connected AND no official app is
attached. ``wait_until_controllable()`` blocks until that holds. To
instead *watch* a live session while the app is connected, see
``watch.py``.

Uses the asyncio facade (``AsyncXProxy``): blocking calls run in the
loop's executor and callbacks are delivered on the loop.
"""

import asyncio

from sofabaton import AsyncXProxy, async_discover_hubs


async def main() -> None:
    hubs = await async_discover_hubs(timeout=5.0)
    if not hubs:
        raise SystemExit("no hub found; pass the IP/TXT manually instead")
    hub = hubs[0]
    print(f"proxying {hub.name} ({hub.hub_version}) at {hub.host}")

    # The hub's IP is the only required argument: ports default to the
    # right values and the hub model is confirmed from the connect banner.
    # (To also advertise the proxy to the official app exactly like the
    # hub, pass mdns_instance=hub.name, mdns_txt=hub.txt — see watch.py.)
    proxy = AsyncXProxy(hub_ip=hub.host)

    proxy.on_hub_state_change(lambda up: print("hub:", "up" if up else "down"))
    proxy.on_client_state_change(lambda up: print("app:", "connected" if up else "gone"))

    async with proxy:
        if not await proxy.wait_until_controllable(timeout=30):
            raise SystemExit("hub not controllable (not connected, or an app is attached)")

        # Bring the proxy's mDNS advertisement up so the official app can
        # keep working while pointed at it. The reads/commands below would
        # work without this, but the proxy stays invisible to the app until
        # it advertises.
        await proxy.wait_until_discoverable(timeout=5)

        activities = await proxy.activities()
        print("activities:", {aid: info.get("name") for aid, info in activities.items()})

        devices = await proxy.devices()
        print("devices:", {did: info.get("name") for did, info in devices.items()})

        if activities:
            target = next(iter(activities))
            # Switch to an activity (sends its power-on). Returns False if
            # refused. Other control verbs: proxy.press(ent, button),
            # proxy.stop_activity(act), proxy.find_remote().
            if await proxy.start_activity(target):
                print(f"started activity {target} ({activities[target].get('name')})")


if __name__ == "__main__":
    asyncio.run(main())
