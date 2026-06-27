#!/usr/bin/env python3
"""Create a WiFi-IP device from scratch by restoring a hand-built bundle.

The restore engine doesn't care whether a bundle came off a real hub or
was written by hand — it lays down whatever devices and commands the JSON
describes. That makes ``restore_hub_bundle`` a way to *provision* a
brand-new IP device: one whose buttons fire arbitrary HTTP requests at any
endpoint on your network (a smart plug's REST API, a Home Assistant
webhook, a media player, ...).

This is more open-ended than ``create_wifi_device``, which only writes the
fixed "launch app N" callback pattern. Here every command carries its own
method, path, content-type and body.

How a command is described
--------------------------
Each command is a structured ``decoded`` block — host, port, method, path,
optional content-type and body — marked ``"edited": True``. That flag is the
backup format's "I hand-wrote these fields" signal: on restore the engine
re-encodes the block to the exact wire bytes the hub stores (the same
canonical writer a backup round-trips against) and round-trip-checks it
before writing, so we never have to compute the byte blob ourselves.

``data_hex`` is still required to be present and non-empty by the restore
validator, but for an edited row it's only a placeholder — the bytes
actually written come from ``decoded``. For ``wifi_ip`` rows the codec
selector (``library_type``) is ``0x1C`` and the ``command_code`` is
all-zeros — both taken straight from real captures.

Notes
-----
* IP-generic devices are an X1S/X2 class; X1 firmware uses a different
  (Roku-style) WiFi class, so run this against an X1S or X2 hub.
* Restore writes to the hub, so the proxy must own it — no official app
  connected through it.
* ``host`` is the *target* of each request (the device you're controlling),
  not the proxy. Point it wherever the HTTP endpoint actually lives.
"""

import asyncio

from sofabaton import (
    DEVICE_BACKUP_SCHEMA_VERSION,
    DEVICE_CLASS_WIFI_IP,
    HUB_BUNDLE_SCHEMA_VERSION,
    AsyncXProxy,
    async_discover_hubs,
)


# --- target device the new IP device will control -------------------------
# Example: a Home Assistant instance reachable on the LAN. Swap these for
# whatever HTTP endpoint you actually want the remote's buttons to hit.
TARGET_HOST = "192.168.1.50"
TARGET_PORT = 8123


def ip_command(
    command_id: int,
    name: str,
    *,
    method: str,
    path: str,
    host: str = TARGET_HOST,
    port: int = TARGET_PORT,
    content_type: str = "",
    body: str = "",
) -> dict:
    """Build one ``wifi_ip`` command row for a device bundle.

    The ``decoded`` block is the human-editable description of the HTTP
    request. ``"edited": True`` tells restore to re-encode it to wire bytes
    (and round-trip-check it) before writing, so we never build the blob by
    hand. ``trailer_hex`` is empty for a freshly authored command (a
    captured row carries a 1-byte record checksum here; an empty trailer
    round-trips cleanly for a from-scratch row).
    """

    decoded = {
        "class": DEVICE_CLASS_WIFI_IP,
        "edited": True,              # hand-authored -> restore re-encodes it
        "trailer_hex": "",
        "fields": {
            "host": host,
            "port": port,
            "method": method,
            "path": path,
            "header": "",            # extra header lines, "\r\n"-joined
            "content_type": content_type,
            "body": body,            # Content-Length is computed from this
        },
    }
    return {
        "command_id": command_id,
        "name": name,
        "restore_data": {
            "transport": "hub_code_record",
            "library_type": 0x1C,                  # wifi_ip codec selector
            "command_code": "00 00 00 00 00 00",   # as captured on real rows
            # Required non-empty by the restore validator, but only a
            # placeholder: with edited=True the bytes actually written are
            # re-encoded from `decoded` above.
            "data_hex": "00",
            "decoded": decoded,
        },
    }


def build_ip_device_bundle() -> dict:
    """Assemble a one-device ``hub_bundle`` describing a WiFi-IP device."""

    device_payload = {
        "kind": "device_backup",
        "schema_version": DEVICE_BACKUP_SCHEMA_VERSION,
        "complete": True,
        "device": {
            # Source id — the hub assigns the real one on restore and the
            # returned device_id_map tells you what it became.
            "device_id": 0x10,
            "name": "REST Device",
            "brand": "m3tac0de",
            "device_class": DEVICE_CLASS_WIFI_IP,
            "device_class_code": 0x1C,
            "code_type": 0x1C,       # IP-generic device record
            "device_type": 0x10,
            "icon": 1,
            "input_mode": 2,         # source-list style (typical for wifi)
            "power_style": 0,
            "tail_marker": 1,        # observed on wifi_ip device records
            "poll_time": 0,
        },
        "commands": [
            # A GET with no body...
            ip_command(
                1, "Ping",
                method="GET",
                path="/api/",
            ),
            # ...and a POST carrying a JSON body. Content-Length is derived
            # from the body, so you never set it yourself.
            ip_command(
                2, "Bedroom Light On",
                method="POST",
                path="/api/webhook/bedroom_light_on",
                content_type="application/json",
                body='{"state": "on"}',
            ),
            ip_command(
                3, "Bedroom Light Off",
                method="POST",
                path="/api/webhook/bedroom_light_off",
                content_type="application/json",
                body='{"state": "off"}',
            ),
        ],
        # No button_bindings / macros / inputs: the commands are fired
        # directly with proxy.send(device_id, command_id).
        "button_bindings": [],
        "macros": [],
        "input_record": None,
        "key_sort": None,
    }

    return {
        "kind": "hub_bundle",
        "schema_version": HUB_BUNDLE_SCHEMA_VERSION,
        "complete": True,
        "hub": {"name": "hand-built", "note": "WiFi-IP device from scratch"},
        "devices": [device_payload],
        "activities": [],
    }


async def main() -> None:
    hubs = await async_discover_hubs(timeout=5.0)
    if not hubs:
        raise SystemExit("no hub found")
    hub = hubs[0]

    proxy = AsyncXProxy(hub_ip=hub.host)   # the hub's IP is all you need

    bundle = build_ip_device_bundle()

    async with proxy:
        # Restore writes to the hub, so own it first (no app attached).
        if not await proxy.wait_until_controllable(timeout=30):
            raise SystemExit("hub not controllable (not connected, or an app is attached)")

        result = await proxy.restore_hub_bundle(bundle)
        if result.get("status") != "success":
            raise SystemExit(f"restore failed: {result}")

        # device_id_map: source id (string) -> the id the hub assigned.
        new_id = int(result["device_id_map"]["16"])
        print(f"created WiFi-IP device -> hub device_id {new_id}")
        print(f"  restored devices: {result['restored_devices']}")

        # Fire one of the freshly-created commands. send() makes the hub
        # perform the HTTP callback we described above.
        await proxy.send(new_id, 1)
        print(f"sent command 1 (Ping) on device {new_id}")


if __name__ == "__main__":
    asyncio.run(main())
