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
        real_hub_ip=hub.host,
        mdns_instance=hub.name,
        mdns_txt=hub.txt,               # carries HVER -> X1/X1S/X2 classification
        hub_version=hub.hub_version,
    )
    proxy.on_activity_change(lambda new, old, name: print(f"activity -> {name}"))

    async with proxy:
        activities = await proxy.activities()      # {id: {name, active, ...}}
        for dev_id in await proxy.devices():
            print(dev_id, await proxy.commands(dev_id))   # {code: label}

        await proxy.start_activity(next(iter(activities)))

asyncio.run(main())
```

The reads return data directly — a cached result comes back immediately,
otherwise the call fetches from the hub and awaits completion. The whole
app-builder surface is a handful of coroutines: `activities()`,
`devices()`, `commands(dev)`, `buttons(ent)`, `macros(act)`,
`favorites(act)` to read; `press(ent, button)`, `start_activity(act)`,
`stop_activity(act)`, `find_remote()` to control.

A synchronous core (`X1Proxy`, `discover_hubs`) is also available for
scripts and REPL use; the async class is a facade over it (its raw
`get_*` snapshot getters are reachable via `proxy.sync`).

A CLI ships as a console script:

```
sofapython discover                # scan the LAN for hubs
sofapython run --hub 192.168.1.50  # proxy + interactive shell
x1> status
x1> activities
x1> send 101 POWER_ON
```

Runnable examples (discovery, minimal proxy, reading per-entity detail —
commands/macros/favorites, and building an HTTP callback listener on top
of the library) live in
[`sofapython/examples/`](https://github.com/m3tac0de/home-assistant-sofabaton-x1s/tree/main/sofapython/examples).

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
