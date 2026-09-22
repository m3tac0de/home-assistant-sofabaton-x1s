#!/usr/bin/env python3
"""Read a stored command using sofabaton-x 0.2.1's typed payload API.

Connects directly to a physical hub; stop another proxy/server for that hub
and close the official app first. This only reads and prints; it does not
play, save or replace the command. Select IDs from catalog_details.py.
"""

import argparse
import asyncio
import json

from sofabaton import AsyncXProxy, CommandRecord, HubConfig, IrPayload, NetworkCommand


def describe(payload: IrPayload | NetworkCommand | CommandRecord | None) -> dict:
    if payload is None:
        return {"type": "missing"}
    # Only IrPayload has IR-specific attributes such as kind/carrier_hz.
    if isinstance(payload, IrPayload):
        return {"type": "IrPayload", **payload.to_dict()}
    if isinstance(payload, NetworkCommand):
        return {"type": "NetworkCommand", "hex": payload.hex, **payload.to_dict()}
    return {"type": "CommandRecord", **payload.to_dict()}


async def read(args: argparse.Namespace) -> None:
    proxy = AsyncXProxy.from_config(HubConfig(host=args.hub))
    async with proxy:
        if not await proxy.wait_until_ready(timeout=30):
            raise RuntimeError("Hub catalogs are not ready; check connectivity and close the official app")
        if not await proxy.wait_until_controllable(timeout=30):
            raise RuntimeError("The official app holds the hub")
        payload = await proxy.read_payload(args.device, args.command)
        print(json.dumps(describe(payload), indent=2))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--hub", required=True, help="Physical hub IPv4 address")
    parser.add_argument("--device", required=True, type=int)
    parser.add_argument("--command", required=True, type=int)
    asyncio.run(read(parser.parse_args()))


if __name__ == "__main__":
    main()
