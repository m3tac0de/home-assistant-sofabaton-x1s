#!/usr/bin/env python3
"""Read per-entity detail: commands, macros and favorites.

The top-level catalogs (``activities`` / ``devices``) only list
entities; the interesting data hangs off each one:

  * devices    -> commands  (the IR/BT/WiFi codes you can send)
  * activities -> macros     (multi-step sequences)
  * activities -> favorites  (the quick-access ordering)

This is a *control-mode* example: it needs to own the hub (no official
app connected through the proxy), so it waits for
``wait_until_controllable()`` before reading. Each read returns its data
directly — the first read of a cold entity fetches from the hub and
awaits the reply.
"""

import asyncio

from sofapython import AsyncX1Proxy, async_discover_hubs


async def main() -> None:
    hubs = await async_discover_hubs(timeout=5.0)
    if not hubs:
        raise SystemExit("no hub found")
    hub = hubs[0]
    print(f"reading {hub.name} ({hub.hub_version}) at {hub.host}\n")

    proxy = AsyncX1Proxy(
        real_hub_ip=hub.host,
        mdns_instance=hub.name,
        mdns_txt=hub.txt,
        hub_version=hub.hub_version,
    )

    async with proxy:
        # Own the hub before reading (no app attached, hub connected).
        if not await proxy.wait_until_controllable(timeout=30):
            raise SystemExit("hub not controllable (not connected, or an app is attached)")

        # --- commands on each device -------------------------------------
        print("== DEVICES ==")
        for dev_id, dev in sorted((await proxy.devices()).items()):
            commands = await proxy.commands(dev_id)
            print(f"[{dev_id}] {dev.get('name', '?')}: {len(commands)} commands")
            for code, label in sorted(commands.items()):
                print(f"    0x{code:04X}  {label}")

        # --- macros and favorites on each activity -----------------------
        print("\n== ACTIVITIES ==")
        for act_id, act in sorted((await proxy.activities()).items()):
            print(f"[{act_id}] {act.get('name', '?')}")

            for macro in await proxy.macros(act_id):
                # macro dicts carry {'command_id': int, 'label': str}
                print(f"    macro: {macro.get('label', '')} (id={macro.get('command_id')})")

            # favorites -> [(fav_id, slot), ...] sorted by slot, or
            # TimeoutError if the hub doesn't answer. The fav_id
            # cross-references a macro command_id or a button; resolve
            # labels against the macros above / proxy.buttons(act_id).
            try:
                favorites = await proxy.favorites(act_id)
            except TimeoutError:
                favorites = []
            if favorites:
                order = ", ".join(f"slot {slot}=0x{fid:02X}" for fid, slot in favorites)
                print(f"    favorites: {order}")


if __name__ == "__main__":
    asyncio.run(main())
