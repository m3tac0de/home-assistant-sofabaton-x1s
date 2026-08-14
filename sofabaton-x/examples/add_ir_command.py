#!/usr/bin/env python3
"""Add an IR command with a custom hex payload to an existing device.

Every IR command the hub stores is just a payload: the bytes it replays
out of the blaster when the command runs. ``persist_ir_blob`` writes one
new command onto a device you already have -- it uploads the payload
(the same paged family-0x0E wire format the official app uses), picks
the first free command id unless you pass one explicitly, and registers
the command in the device's display order so it shows up when browsing
the device on the physical remote.

Where payloads come from
------------------------
The payload below is a raw learned/database-style IR capture, written
as hex bytes. You can obtain payloads like this from the Home Assistant
Control Panel's payload editor (fetch any existing command and copy the
hex), from a backup bundle's ``data_hex`` fields, or by converting codes
with IrScrutinizer. ``docs/command_payloads.md`` in the repository
covers the formats and how to obtain and share them. ``bytes.fromhex``
ignores whitespace, so a payload can be pasted in verbatim.

Test before you save
--------------------
``play_ir_blob`` fires a payload out of the blaster once WITHOUT saving
anything -- point the hub at the target device and check it reacts
before committing the command. Test and save are separate steps, exactly
like the Test button in the app's payload editor.

Notes
-----
* The target must be an IR device: the save path hard-codes the IR codec
  selector. The script refuses other device classes.
* Writes need control mode: the proxy must own the hub, with no official
  app connected through it.
* The existing command list is fetched first so the automatic id
  allocation works from the hub's authoritative occupancy view.
* A ``None`` result means the hub rejected the write or an ack timed
  out; nothing is retried automatically.
"""

import asyncio

from sofabaton import DEVICE_CLASS_IR, AsyncXProxy, async_discover_hubs


# --- what to add and where -------------------------------------------------
# Pick the device with the `devices` CLI command or proxy.devices().
DEVICE_ID = 3
COMMAND_NAME = "Custom Command"

# Raw IR payload, hex bytes. Replace with your own capture; this one is a
# learned-signal payload (carrier + mark/space timing data) as captured
# off a real hub.
PAYLOAD_HEX = """
01 20 00 10 01 00 94 ac 00 00 23 0a 00 00 11 bb 00 00 01 fa 00 00 02 40
00 00 02 25 00 00 02 45 00 00 02 25 00 00 02 40 00 00 02 0a 00 00 02 40
00 00 02 25 00 00 02 45 00 00 02 25 00 00 02 40 00 00 02 0a 00 00 02 40
00 00 02 25 00 00 06 90 00 00 02 10 00 00 06 90 00 00 02 25 00 00 02 40
00 00 02 25 00 00 02 40 00 00 02 25 00 00 06 90 00 00 02 25 00 00 06 90
00 00 02 25 00 00 02 40 00 00 02 0a 00 00 06 ab 00 00 02 0a 00 00 06 ab
00 00 02 0a 00 00 02 46 00 00 02 25 00 00 06 90 00 00 02 25 00 00 06 90
00 00 02 10 00 00 02 40 00 00 02 25 00 00 02 45 00 00 02 0a 00 00 02 40
00 00 02 25 00 00 02 40 00 00 02 25 00 00 06 90 00 00 02 25 00 00 06 90
00 00 02 25 00 00 02 40 00 00 02 0a 00 00 02 40 00 00 02 25 00 00 06 90
00 00 02 25 00 00 06 90 00 00 02 25 00 00 06 90 00 00 02 25 00 00 06 90
00 00 02 0a 00 00 02 40 00 00 02 25 00 00 a5 eb 00 00 22 da 00 00 08 d0
00 00 02 25 00 01 77 60 00 00 22 da 00 00 08 d0 00 00 02 25 00 01 77 60
00 00 00 00
"""


async def main() -> None:
    payload = bytes.fromhex(PAYLOAD_HEX)

    hubs = await async_discover_hubs(timeout=5.0)
    if not hubs:
        raise SystemExit("no hub found")

    proxy = AsyncXProxy(hub_ip=hubs[0].host)
    async with proxy:
        # Writes go to the hub, so own it first (no app attached).
        if not await proxy.wait_until_controllable(timeout=30):
            raise SystemExit("hub not controllable (not connected, or an app is attached)")

        devices = await proxy.devices()
        device = devices.get(DEVICE_ID)
        if device is None:
            raise SystemExit(f"device {DEVICE_ID} not found on the hub")
        device_class = device.get("device_class")
        if device_class not in (None, DEVICE_CLASS_IR):
            raise SystemExit(
                f"device {DEVICE_ID} ({device.get('name')}) is {device_class!r}, "
                "not IR -- persist_ir_blob only writes the IR codec"
            )

        # Fetch the current command list so the automatic command-id
        # allocation sees the hub's real slot occupancy.
        existing = await proxy.commands(DEVICE_ID)
        print(f"device {DEVICE_ID} ({device.get('name')}) has {len(existing)} command(s)")

        # Fire the payload once without saving anything: the IR-command
        # equivalent of a dry run.
        if not await proxy.play_ir_blob(payload):
            raise SystemExit("test playback refused (control mode?) or rejected by the hub")
        print("test playback sent -- check the target device reacted")

        result = await proxy.persist_ir_blob(
            device_id=DEVICE_ID,
            command_name=COMMAND_NAME,
            blob=payload,
        )
        if result is None:
            raise SystemExit("save failed: the hub rejected the write or an ack timed out")

        command_id = result["command_id"]
        print(
            f"saved {result['command_name']!r} as command_id {command_id} "
            f"({result['page_count']} page(s) written)"
        )

        # The new command is a first-class citizen immediately: fire it.
        await proxy.send(DEVICE_ID, command_id)
        print(f"sent command {command_id} on device {DEVICE_ID}")


if __name__ == "__main__":
    asyncio.run(main())
