#!/usr/bin/env python3
"""Refresh, preview and optionally rename one activity through the facade.

Install sofabaton-x >=0.2.1,<0.3 first (see README). This connects directly to the
physical hub; stop any other proxy/server managing that hub before running.
Preview performs hub reads; --apply also writes.
Example: python edit_activity.py --hub 192.168.1.50 --activity 101 --name Movie
"""

import argparse
import asyncio

from sofabaton import (
    AsyncXProxy,
    HubConfig,
    SnapshotOutdatedError,
    build_activity_sync_plan,
    edits,
)


async def edit(args: argparse.Namespace) -> None:
    proxy = AsyncXProxy.from_config(HubConfig(host=args.hub))
    async with proxy:
        if not await proxy.wait_until_controllable(timeout=30):
            raise RuntimeError("Hub is offline or held by the official app")
        if not await proxy.wait_until_ready(timeout=30):
            raise RuntimeError("Initial catalogs did not become ready")

        snapshot = await proxy.refresh(activity_id=args.activity)
        entity = snapshot.entity("activity", args.activity)
        if entity is None or not entity.editable:
            raise RuntimeError("Activity is unknown or its detail could not be read in full")
        edited = edits.rename_activity(snapshot.bundle, args.activity, args.name)
        plan = build_activity_sync_plan(snapshot.bundle, edited, args.activity)
        for step in plan:
            print(f"{step.kind}: {step.label}")
        if not plan:
            print("The activity already has that name")
            return
        if not args.apply:
            print("Preview only. Add --apply to write the change")
            return

        try:
            result = await proxy.sync_activity(
                baseline=snapshot.bundle,
                edited=edited,
                activity_id=args.activity,
                snapshot_id=snapshot.snapshot_id,
                strict=True,  # refuse an unreadable or incomplete live preflight
                progress=lambda p: print(p.phase, p.message),
            )
        except SnapshotOutdatedError as err:
            raise RuntimeError("Snapshot moved: refresh and reapply the rename") from err
        if not result.ok:
            print("Current snapshot:", (await proxy.snapshot()).snapshot_id)
            if result.failed_at == "stale_check":
                raise RuntimeError(
                    f"Live preflight refused: {result.message}; "
                    "refresh and reapply the rename after resolving the read or change conflict"
                )
            raise RuntimeError(
                f"Sync failed at {result.failed_at} after {result.completed_steps} steps; "
                "inspect the current configuration before retrying"
            )
        current = await proxy.snapshot()
        entity = current.entity("activity", args.activity)
        print("Saved:", entity.name if entity else "activity no longer present")
        print("Snapshot:", current.snapshot_id)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--hub", required=True, help="Physical hub IPv4 address")
    parser.add_argument("--activity", type=int, choices=range(101, 256), metavar="ID", required=True)
    parser.add_argument("--name", required=True)
    parser.add_argument("--apply", action="store_true", help="Write the previewed edit")
    args = parser.parse_args()
    asyncio.run(edit(args))


if __name__ == "__main__":
    main()
