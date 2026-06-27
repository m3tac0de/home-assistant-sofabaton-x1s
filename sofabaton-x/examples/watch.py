#!/usr/bin/env python3
"""Watch a live session: a real-time feed of hub events.

The proxy sits between the hub and the official Sofabaton app, so it sees
the hub's events whether or not the app is connected through it. That's
the point of this demo: every activity switch, OTA update and hub up/down
is surfaced here regardless of the app. Attach the app and use your
remote, or leave the app closed entirely — either way the events show up.
(``on_client_state_change`` is the one signal that depends on the app: it
fires when the app connects to or disconnects from the proxy.)

When the app *is* connected it owns the hub, so this is *observe mode*:
you can watch but not issue commands (reads come from cache, and
``press``/``start_activity`` would be refused). With no app attached the
proxy owns the hub and you can both watch and control it — see
``minimal_proxy.py``.

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

    # The hub's IP is all that's required. Events surface with or without
    # the app. To let the official app connect *through* the proxy (so you
    # can watch it drive the hub), add the hub's mDNS identity so the proxy
    # advertises itself exactly like the hub:
    #     mdns_instance=hub.name, mdns_txt=hub.txt
    proxy = AsyncXProxy(hub_ip=hub.host)

    async def on_activity(new_id, old_id, name):
        print(f"activity -> {name or '?'}  (id {old_id} -> {new_id})")

    proxy.on_activity_change(on_activity)
    proxy.on_client_state_change(lambda up: print("app:", "connected" if up else "gone"))
    proxy.on_hub_state_change(lambda up: print("hub:", "up" if up else "down"))
    proxy.on_ota_update(lambda *a, **k: print("hub OTA update in progress"))

    async with proxy:
        # Wait until the proxy is up and the hub has connected to it — until
        # the hub is attached there are no events to surface. (This is also
        # when the proxy starts advertising over mDNS so the official app can
        # find it, but that's optional. Returns False if the hub never
        # connects.)
        if not await proxy.wait_until_discoverable(timeout=30):
            raise SystemExit("hub never connected")
        # Read what's already running right now (live state, no fetch —
        # works whether or not an app is attached).
        running = await proxy.current_activity()
        print(f"currently running: {running['name'] if running else '(nothing)'}")
        print(f"watching {hub.name} — events show up with or without the app connected; Ctrl+C to stop")
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
