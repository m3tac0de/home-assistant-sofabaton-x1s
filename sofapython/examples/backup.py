#!/usr/bin/env python3
"""Back up a hub's configuration to JSON, and restore it.

A *backup* is not the same as a cache snapshot: it is a deliberate,
schema-versioned (``schema_version``), hand-editable capture of the
hub's restorable configuration — devices, commands, keymaps, macros,
favorites, IR blobs. It is the exact input ``restore_hub_bundle`` reads
back, and restore refuses a payload whose schema doesn't match.

Backup fetches from the hub, so it only works while the proxy owns the
hub (no official app connected through it).
"""

import asyncio
import json

from sofapython import AsyncX1Proxy, async_discover_hubs


async def main() -> None:
    hubs = await async_discover_hubs(timeout=5.0)
    if not hubs:
        raise SystemExit("no hub found")
    hub = hubs[0]

    proxy = AsyncX1Proxy(
        hub_ip=hub.host,
        mdns_instance=hub.name,
        mdns_txt=hub.txt,
        hub_version=hub.hub_version,
    )

    async with proxy:
        # Backup fetches from the hub, so own it first (no app attached).
        if not await proxy.wait_until_controllable(timeout=30):
            raise SystemExit("hub not controllable (not connected, or an app is attached)")

        # Whole-hub bundle (every device + activity). Pass device_ids=[...]
        # to back up only specific devices.
        bundle = await proxy.backup_hub_bundle()
        with open("hub_backup.json", "w", encoding="utf-8") as fh:
            json.dump(bundle, fh, indent=2)
        print(
            f"wrote hub_backup.json: schema v{bundle['schema_version']}, "
            f"{len(bundle['devices'])} devices, {len(bundle['activities'])} activities, "
            f"complete={bundle['complete']}"
        )

        # ... later, to restore onto a hub:
        # with open("hub_backup.json", encoding="utf-8") as fh:
        #     await proxy.restore_hub_bundle(json.load(fh))


if __name__ == "__main__":
    asyncio.run(main())
