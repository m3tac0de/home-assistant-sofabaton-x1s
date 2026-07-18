# sofabaton-x — Python Library

[![PyPI](https://img.shields.io/pypi/v/sofabaton-x)](https://pypi.org/project/sofabaton-x/)
[![Python versions](https://img.shields.io/pypi/pyversions/sofabaton-x)](https://pypi.org/project/sofabaton-x/)
[![License: MIT](https://img.shields.io/pypi/l/sofabaton-x)](https://github.com/m3tac0de/home-assistant-sofabaton-x1s/blob/main/LICENSE)

Unofficial Python library for **Sofabaton X1 / X1S / X2** universal remote
hubs: a reverse-engineered protocol implementation and a man-in-the-middle
**proxy** that sits between the hub and the official mobile app.

This is the protocol engine extracted from the
[Home Assistant Sofabaton X integration](https://github.com/m3tac0de/home-assistant-sofabaton-x1s);
the integration is its reference consumer.

> **Disclaimer:** this project is not affiliated with or endorsed by
> Sofabaton. The protocol was reverse-engineered from network captures;
> behavior may break with future hub firmware.

## What it does

- **Proxy** a physical hub: the library advertises itself via mDNS exactly
  like a real hub, the official app connects to it, and every frame is
  relayed, decoded and observable. The hub keeps working with the app while
  your application gets full visibility and control.
- **Catalogs**: read activities, devices, buttons, commands, macros and
  favorites from the hub's wire protocol.
- **Control**: send button/command presses, switch activities, trigger
  find-my-remote.
- **Provisioning** (protocol side): create/update/delete devices and
  activities, including virtual WiFi/IP devices.
- **Backup / restore**: export and restore hub configuration.
- **Live editing**: diff an edited backup bundle against the captured
  baseline and sync the difference to the hub as targeted in-place writes
  (activity- or device-scoped), with a pure plan builder for dry-run
  previews.
- **Events**: subscribe to hub/app connection state, activity changes,
  OTA progress and catalog updates.

Deliberately **out of scope**: executing the HTTP callbacks that virtual
WiFi/IP devices define (e.g. a Roku-style ECP listener). The library carries
the protocol artifacts for those features so applications can build them on
top — the Home Assistant integration does exactly that.

## Install

```
pip install sofabaton-x
```

Python 3.11+. The only dependency is
[python-zeroconf](https://pypi.org/project/zeroconf/) (mDNS advertising and
hub discovery).

## Quickstart

Find a hub, then proxy it. Blocking work runs in the event loop's
executor and callbacks (plain functions or coroutines) are delivered on
the loop, so application code never touches the engine threads:

```python
import asyncio
from sofabaton import AsyncXProxy, async_discover_hubs

async def main():
    hubs = await async_discover_hubs(timeout=5.0)   # physical hubs; proxies filtered
    if not hubs:
        print("No Sofabaton hub found on this network.")
        return
    hub = hubs[0]

    proxy = AsyncXProxy(hub_ip=hub.host)   # the hub's IP is all you need
    proxy.on_activity_change(lambda new, old, name: print(f"activity -> {name}"))

    async with proxy:
        await proxy.wait_until_controllable()      # own the hub (see below)

        for act_id, act in (await proxy.activities()).items():
            print(f"activity {act_id}: {act['name']}")

        for dev_id, dev in (await proxy.devices()).items():
            for cmd in await proxy.commands(dev_id):   # [{command_id, label}]
                print(f"device {dev_id} ({dev['name']}): "
                      f"command {cmd['command_id']} = {cmd['label']}")

        # Fires one real command — command 5 on device 1. Pick your own
        # (entity_id, command_id) pair from the listing printed above.
        await proxy.send(1, 5)

asyncio.run(main())
```

`hub_ip` is the only required argument; everything else has a sensible
default and the hub model is confirmed from the connect banner. The one
thing worth adding is the proxy's mDNS identity — pass
`mdns_instance=hub.name` and `mdns_txt=hub.txt` so the proxy advertises
itself **exactly like the hub it fronts**, letting the official Sofabaton
app keep working while pointed at the proxy. Skip them and the proxy still
reads and controls the hub fine; it just advertises under a generic name:

```python
proxy = AsyncXProxy(
    hub_ip=hub.host,
    mdns_instance=hub.name,   # advertise as the hub, so the app finds the proxy
    mdns_txt=hub.txt,         # carries HVER -> X1/X1S/X2 classification
)
```

### Ports

The proxy has two network faces. Apart from `hub_ip`, every port defaults
to the right value — you usually only touch `hub_listen_port` to avoid a
local collision:

| Argument             | Default | Side | What it is                                                                |
| -------------------- | ------- | ---- | ------------------------------------------------------------------------- |
| `hub_ip`             | —       | hub  | the physical hub's IPv4 address                                           |
| `hub_port`           | 8102    | hub  | UDP port **on the hub** we send `CALL_ME` to (protocol-fixed)             |
| `hub_listen_port`    | 8200    | hub  | TCP port **on this host** the hub connects back to                        |
| `app_discovery_port` | 8102    | app  | UDP port **on this host** the app finds + calls us on (keep 8102 for iOS) |

The hub model (X1/X1S/X2) is confirmed from the connect banner, so
`hub_version` is only a pre-connect hint. See
[`docs/networking.md`](https://github.com/m3tac0de/home-assistant-sofabaton-x1s/blob/main/docs/networking.md)
for the complete port map and firewall guidance.

Everything is keyed on **`(entity_id, command_id)`** — you browse to get
those ids, then `send(entity_id, command_id)`. The reads return them
directly (cached if available, else fetched):

| read                         | returns                                        |
| ---------------------------- | ---------------------------------------------- |
| `activities()` / `devices()` | `{id: {name, ...}}`                            |
| `commands(device_id)`        | `[{command_id, label}]`                        |
| `macros(activity_id)`        | `[{command_id, label}]`                        |
| `favorites(activity_id)`     | `[{device_id, command_id, label}]`             |
| `buttons(entity_id)`         | `[{button_code, name, device_id, command_id}]` |
| `current_activity()`         | `{activity_id, name}` or `None` when idle      |

`current_activity()` is the exception to the table above — it reads the
hub's **live** running-activity state (no fetch) and works in observe mode
too; subscribe to changes with `on_activity_change(cb)`.

Control: `send(entity_id, command_id)` (alias `press`),
`start_activity(act)`, `stop_activity(act)`, `find_remote()`.

### Two modes

The proxy sits transparently between the hub and the official app, which
gives it two distinct modes:

- **Observe** — the app is connected through the proxy. You watch
  activity changes (`current_activity()` / `on_activity_change`), connects
  and OTA events in real time, but the app owns the hub, so you can't issue
  commands. Gate on `await proxy.wait_connected()`.
- **Control** — no app attached; the proxy owns the hub, so reads fetch
  fresh and commands/backup work. Gate on
  `await proxy.wait_until_controllable()`.

`start()` only spawns the transport; the connect handshake happens
afterwards, so await the matching readiness primitive before reading or
acting (otherwise a read raises with the reason — hub not connected, or
an app holds it).

The mode is not fixed at startup — it follows the app. If the official
app connects while you hold control, you are demoted to observe mode
immediately: `send()` / `start_activity()` return `False` (refused, not
raised), and reads still serve cached data but raise `RuntimeError` when
they would need a fresh hub fetch. When the app disconnects, control
returns on its own. Both waiters are plain state predicates, so a
long-running application can simply re-await
`wait_until_controllable()` whenever a send comes back `False`.

## Live editing

Editing is bundle-based: capture a backup as the baseline, modify a copy,
and sync. The engine diffs the two bundles into an ordered plan of
targeted in-place writes (nothing is deleted-and-restored), re-reads the
entity first to detect concurrent changes, and applies the steps serially,
each gated on the hub's acknowledgement:

Both sync scopes take a `hub_bundle` pair — capture the baseline with
`backup_hub_bundle`; `include_blobs=False` skips the slow IR-payload dump
(the editor never needs blobs):

```python
import copy

baseline = await proxy.backup_hub_bundle(include_blobs=False)
edited = copy.deepcopy(baseline)
# ... modify `edited`: rename the activity, rebind buttons, edit macros,
#     favorites, membership ...

# Optional dry run: the pure planner shows exactly what a sync would write.
from sofabaton import build_activity_sync_plan
for step in build_activity_sync_plan(baseline, edited, activity_id=101):
    print(step.kind, "-", step.label)

result = await proxy.sync_activity(
    baseline=baseline, edited=edited, activity_id=101,
    progress_callback=lambda **p: print(p.get("message")),
)
assert result["status"] == "success", result["message"]
```

`sync_device` / `build_device_sync_plan` are the device-scoped
counterparts (command adds and renames, payload edits, idle behaviour,
input records) with the same bundle-pair contract. A failed sync reports
where it stopped (`failed_at`, `completed_steps`) rather than raising;
`failed_at: "stale_check"` means the entity changed on the hub after the
baseline was captured — re-capture and re-apply your edit. The planner
refuses (with `ValueError`, surfaced as `failed_at: "plan"`) any bundle
difference outside the entity being edited, so an editor bug cannot
silently rewrite unrelated configuration.

A CLI ships as a console script:

```
sofabaton discover                   # scan the LAN for hubs
sofabaton run --hub-ip 192.168.1.50  # proxy + interactive shell
x> status
x> activities
x> commands 1                        # list (command_id, label) for device 1
x> send 1 5                          # numeric ids, exactly like the Python API
x> send 101 POWER_ON                 # the CLI also resolves button names to codes
```

The last form is a CLI convenience: `send` (alias `press`) accepts either
a numeric command/button code or a `ButtonName` alias like `POWER_ON`.
The Python API itself is numeric-only — `send(entity_id, command_id)` —
with the `ButtonName` constants importable from the package root when
you want named button codes.

Runnable examples — discovery, watching a live session, taking control
of a hub, reading per-entity detail (commands/macros/favorites),
schema-versioned backup/restore, provisioning a WiFi-IP device from
scratch via restore, and building an HTTP callback listener on top of the
library — live in
[`sofabaton-x/examples/`](https://github.com/m3tac0de/home-assistant-sofabaton-x1s/tree/main/sofabaton-x/examples).

## Protocol & networking docs

This library is a reverse-engineered implementation; the wire protocol and
network topology are documented in the repository:

- **Protocol reference** —
  [`docs/protocol/`](https://github.com/m3tac0de/home-assistant-sofabaton-x1s/tree/main/docs/protocol):
  [connection flow](https://github.com/m3tac0de/home-assistant-sofabaton-x1s/blob/main/docs/protocol/connection-flow.md),
  [frame format](https://github.com/m3tac0de/home-assistant-sofabaton-x1s/blob/main/docs/protocol/frame-format.md),
  [opcodes](https://github.com/m3tac0de/home-assistant-sofabaton-x1s/blob/main/docs/protocol/opcodes.md),
  [data structures](https://github.com/m3tac0de/home-assistant-sofabaton-x1s/blob/main/docs/protocol/data-structures.md),
  [hub versions](https://github.com/m3tac0de/home-assistant-sofabaton-x1s/blob/main/docs/protocol/hub-versions.md)
  and more.
- **Networking guide** —
  [`docs/networking.md`](https://github.com/m3tac0de/home-assistant-sofabaton-x1s/blob/main/docs/networking.md):
  the full port map, the two proxy faces, firewall rules and VLAN caveats.

## Stability

Names importable from the package root — `from sofabaton import ...`,
the set listed in `sofabaton.__all__` — are the supported API and follow
semver. Everything else (`sofabaton.opcode_handlers`, frame parsing,
wire schemas, the `proxy_*` mixin modules) is internal and may change
between minor releases. The public surface is async-first by design:
`AsyncXProxy` is the supported entry point, and the underlying
synchronous engine (reachable via `AsyncXProxy.sync` when you need the
raw surface) is internal and not semver-covered. The library raises
stdlib exceptions (`ValueError` for malformed/unclassifiable input,
`RuntimeError` / `TimeoutError` for transport and ack failures); there
are no custom exception types. Until 1.0, pin a minor version.

## Issues & release notes

Bugs and feature requests go to the shared
[issue tracker](https://github.com/m3tac0de/home-assistant-sofabaton-x1s/issues).
For standalone library issues, include the command you ran, the terminal
output or traceback, the package and Python versions, and a small
reproduction snippet if possible.

Library versions are tagged `sofabaton-x-vX.Y.Z`; release notes live on
the
[GitHub releases page](https://github.com/m3tac0de/home-assistant-sofabaton-x1s/releases).

## License

MIT — see [LICENSE](https://github.com/m3tac0de/home-assistant-sofabaton-x1s/blob/main/LICENSE).
