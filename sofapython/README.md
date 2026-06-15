# sofapython

Unofficial Python library for **Sofabaton X1 / X1S / X2** universal remote
hubs: a reverse-engineered protocol implementation and a man-in-the-middle
**proxy** that sits between the hub and the official mobile app.

This is the protocol engine extracted from the
[Home Assistant Sofabaton X1S integration](https://github.com/m3tac0de/home-assistant-sofabaton-x1s);
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
- **Events**: subscribe to hub/app connection state, activity changes,
  OTA progress and catalog updates.

Deliberately **out of scope**: executing the HTTP callbacks that virtual
WiFi/IP devices define (e.g. a Roku-style ECP listener). The library carries
the protocol artifacts for those features so applications can build them on
top — the Home Assistant integration does exactly that.

## Install

```
pip install sofapython
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
from sofapython import AsyncX1Proxy, async_discover_hubs

async def main():
    hubs = await async_discover_hubs(timeout=5.0)   # physical hubs; proxies filtered
    hub = hubs[0]

    proxy = AsyncX1Proxy(
        hub_ip=hub.host,                # the physical hub's IP
        mdns_instance=hub.name,
        mdns_txt=hub.txt,               # carries HVER -> X1/X1S/X2 classification
        hub_version=hub.hub_version,    # optional; the connect banner confirms it
    )
    proxy.on_activity_change(lambda new, old, name: print(f"activity -> {name}"))

    async with proxy:
        await proxy.wait_until_controllable()      # own the hub (see below)
        activities = await proxy.activities()      # {id: {name, active, ...}}
        for dev_id in await proxy.devices():
            for cmd in await proxy.commands(dev_id):   # [{command_id, label}]
                await proxy.send(dev_id, cmd["command_id"])   # fire a command

        await proxy.start_activity(next(iter(activities)))

asyncio.run(main())
```

### Ports

The proxy has two network faces. Apart from `hub_ip`, every port defaults
to the right value — you usually only touch `hub_listen_port` to avoid a
local collision:

| Argument | Default | Side | What it is |
|----------|---------|------|------------|
| `hub_ip` | — | hub | the physical hub's IPv4 address |
| `hub_port` | 8102 | hub | UDP port **on the hub** we send `CALL_ME` to (protocol-fixed) |
| `hub_listen_port` | 8200 | hub | TCP port **on this host** the hub connects back to |
| `app_discovery_port` | 8102 | app | UDP port **on this host** the app finds + calls us on (keep 8102 for iOS) |

The hub model (X1/X1S/X2) is confirmed from the connect banner, so
`hub_version` is only a pre-connect hint. See
[`docs/networking.md`](https://github.com/m3tac0de/home-assistant-sofabaton-x1s/blob/main/docs/networking.md)
for the complete port map and firewall guidance.

Everything is keyed on **`(entity_id, command_id)`** — you browse to get
those ids, then `send(entity_id, command_id)`. The reads return them
directly (cached if available, else fetched):

| read | returns |
|------|---------|
| `activities()` / `devices()` | `{id: {name, ...}}` |
| `commands(device_id)` | `[{command_id, label}]` |
| `macros(activity_id)` | `[{command_id, label}]` |
| `favorites(activity_id)` | `[{device_id, command_id, label}]` |
| `buttons(entity_id)` | `[{button_code, name, device_id, command_id}]` |

Control: `send(entity_id, command_id)` (alias `press`),
`start_activity(act)`, `stop_activity(act)`, `find_remote()`.

### Two modes

The proxy sits transparently between the hub and the official app, which
gives it two distinct modes:

- **Observe** — the app is connected through the proxy. You watch
  activity changes, connects and OTA events in real time, but the app
  owns the hub, so you can't issue commands. Gate on
  `await proxy.wait_connected()`.
- **Control** — no app attached; the proxy owns the hub, so reads fetch
  fresh and commands/backup work. Gate on
  `await proxy.wait_until_controllable()`.

`start()` only spawns the transport; the connect handshake happens
afterwards, so await the matching readiness primitive before reading or
acting (otherwise a read raises with the reason — hub not connected, or
an app holds it).

A synchronous core (`X1Proxy`, `discover_hubs`) is also available for
scripts and REPL use; the async class is a facade over it (its raw
`get_*` snapshot getters are reachable via `proxy.sync`).

A CLI ships as a console script:

```
sofapython discover                   # scan the LAN for hubs
sofapython run --hub-ip 192.168.1.50  # proxy + interactive shell
x1> status
x1> activities
x1> send 101 POWER_ON
```

Runnable examples — discovery, watching a live session (observe mode),
taking control of a hub, reading per-entity detail
(commands/macros/favorites), schema-versioned backup/restore, and
building an HTTP callback listener on top of the library — live in
[`sofapython/examples/`](https://github.com/m3tac0de/home-assistant-sofabaton-x1s/tree/main/sofapython/examples).

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

Names importable from the package root — `from sofapython import ...`,
the set listed in `sofapython.__all__` — are the supported API and follow
semver. Everything else (`sofapython.opcode_handlers`, frame parsing,
wire schemas, the `proxy_*` mixin modules) is internal and may change
between minor releases. The library raises stdlib exceptions
(`ValueError` for malformed/unclassifiable input, `RuntimeError` /
`TimeoutError` for transport and ack failures); there are no custom
exception types. Until 1.0, pin a minor version.

## License

MIT — see [LICENSE](https://github.com/m3tac0de/home-assistant-sofabaton-x1s/blob/main/LICENSE).
