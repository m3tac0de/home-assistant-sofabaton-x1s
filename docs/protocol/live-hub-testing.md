# Live Hub Protocol Testing

This note is for future debugging sessions that need to validate a wire-level
idea against a real hub without first wiring it into Home Assistant.

## Setup

Use a hub IP on the local network and run experiments from the repository root.
Keep Home Assistant actions, backups, and command syncs idle while testing so
the hub sees only the frame under test.

```python
import time

from custom_components.sofabaton_x1s.lib.x1_proxy import X1Proxy
from custom_components.sofabaton_x1s.const import HUB_VERSION_X2

proxy = X1Proxy(
    "192.168.x.y",
    hub_version=HUB_VERSION_X2,
    proxy_enabled=False,
    diag_dump=True,
    diag_parse=True,
)

proxy.start()
try:
    time.sleep(2.0)
    print(proxy.poll_x2_remote_battery(timeout=2.0))
finally:
    proxy.stop()
```

For product code, keep hub requests flowing through `enqueue_cmd` or a higher
level hub method that uses it. Direct `_send_cmd_frame` calls are useful for
short experiments only.

## X2 Remote Battery

X2 hubs expose a remote status row through `OP_REQ_REMOTE_STATUS` with payload
`00`. The current implementation polls that row only when the command scheduler
is idle, then caches `decoded.battery` as the remote battery percentage.

X1 and X1S hubs do not currently expose a confirmed live remote battery value
through the same request path. Do not surface a battery sensor for those models
unless a separate live network behavior is verified.

## Logging Checklist

- Capture request opcode, payload, and raw reply hex.
- Record hub model, hub firmware version when known, and whether a mobile app
  or Home Assistant operation was connected.
- Repeat the same request after a known state change when testing a value that
  should vary, such as battery level.
- Prefer neutral field names in notes and code until the field meaning is
  validated by behavior.

## Pending validation: HA-action blobs without inner-record trailer

The backup editor synthesizes `wifi_ip` command blobs for Home Assistant
actions (`renderHaActionDataHex` in `www/src/tabs/backup-state.ts`) with
NO 1-byte inner-record trailer — real hub-dumped records carry one (see
`tests/test_wifi_ip_apps_backup_roundtrip.py`), computed over the outer
command record by the hub. Replay is length-prefixed (`data[6:8]`
declares the HTTP text length), so the trailer should be inert for
sending, but two things need a live-hub check after restoring a bundle
containing an editor-provisioned HA action:

1. The family-0x0E save pages are acked `0x0103/0x00` (not `0x0C`).
2. Pressing the restored shortcut fires the HTTP callback at the
   configured `host:port` with the expected `/launch/ha/...` path.

If the hub rejects trailer-less records, the fix belongs in the restore
path (compute the outer-record checksum in `build_command_write_steps`),
not in the TS writer.
