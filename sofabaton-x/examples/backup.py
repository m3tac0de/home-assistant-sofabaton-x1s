#!/usr/bin/env python3
"""Back up a hub's configuration to JSON, and restore it.

A *backup* is not the same as a cache snapshot: it is a deliberate,
schema-versioned (``schema_version``), hand-editable capture of the
hub's restorable configuration — devices, commands, keymaps, macros,
favorites, IR blobs. It is the input ``AsyncXProxy.restore`` reads
back, and restore refuses a payload whose schema doesn't match.

Backup fetches from the hub, so it only works while the proxy owns the
hub (no official app connected through it).
"""

import asyncio
import json

from sofabaton import AsyncXProxy, async_discover_hubs


async def main() -> None:
    hubs = await async_discover_hubs(timeout=5.0)
    if not hubs:
        raise SystemExit("no hub found")
    hub = hubs[0]

    proxy = AsyncXProxy(hub_ip=hub.host)   # the hub's IP is all you need

    async with proxy:
        # Backup fetches from the hub, so own it first (no app attached).
        if not await proxy.wait_until_controllable(timeout=30):
            raise SystemExit("hub not controllable (not connected, or an app is attached)")

        # Whole-hub bundle: every device + activity.
        bundle = await proxy.backup()

        # To back up only specific devices, pass device_ids. A device-only
        # bundle carries no activities (activities reference devices, so a
        # partial set isn't independently restorable):
        #   bundle = await proxy.backup(device_ids=[5, 7])

        with open("hub_backup.json", "w", encoding="utf-8") as fh:
            json.dump(bundle, fh, indent=2)
        print(
            f"wrote hub_backup.json: schema v{bundle['schema_version']}, "
            f"{len(bundle['devices'])} devices, {len(bundle['activities'])} activities, "
            f"complete={bundle['complete']}"
        )

        # ... later, to restore onto a hub. The bundle is plain JSON, so
        # restoring a subset is just pruning its 'devices'/'activities'
        # lists before handing it back. Preserve all device and activity
        # dependencies referenced by the entities you keep:
        #
        #   with open("hub_backup.json", encoding="utf-8") as fh:
        #       bundle = json.load(fh)
        #
        #   # Keep only the devices/activities you want (omit a filter to
        #   # keep all of that kind). Note: an activity references devices
        #   # by id, so keep every device its buttons/macros/favorites
        #   # point at, or restore validation will reject the bundle.
        #   keep_devices = {5, 7}
        #   bundle["devices"] = [
        #       d for d in bundle["devices"]
        #       if d["device"]["device_id"] in keep_devices
        #   ]
        #
        #   # The facade validates before erasing. Do not erase separately.
        #   # replace=False creates additional entities with new ids instead.
        #   result = await proxy.restore(bundle, replace=True)
        #   if not result.ok:
        #       print("Restore stopped at", result.failed_at, "hub erased:", result.erased)
        #       print("Completed:", result.restored_devices, "devices,",
        #             result.restored_activities, "activities")
        #       print("Current snapshot:", (await proxy.snapshot()).to_dict())
        #       # No automatic retry: partial writes remain, and an additive
        #       # retry could duplicate entities. Inspect the hub first.
        #       raise RuntimeError("Restore did not complete")
        #   print("New device ids:", result.device_id_map)


if __name__ == "__main__":
    asyncio.run(main())
