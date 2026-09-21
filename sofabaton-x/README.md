# sofabaton-x — Python Library

> **0.2.0 has breaking changes from 0.1.x.** This README describes the
> 0.2 API. Existing 0.1.x consumers should read the
> [changelog and migration guide](https://github.com/m3tac0de/home-assistant-sofabaton-x1s/blob/main/sofabaton-x/CHANGELOG.md#020-2026-09-16)
> before upgrading.

[![PyPI](https://img.shields.io/pypi/v/sofabaton-x)](https://pypi.org/project/sofabaton-x/)
[![Python versions](https://img.shields.io/pypi/pyversions/sofabaton-x)](https://pypi.org/project/sofabaton-x/)
[![License: MIT](https://img.shields.io/pypi/l/sofabaton-x)](https://github.com/m3tac0de/home-assistant-sofabaton-x1s/blob/main/LICENSE)

Unofficial Python library for **Sofabaton X1 / X1S / X2** universal remote
hubs: a reverse-engineered protocol implementation and a man-in-the-middle
**proxy** that sits between the hub and the official mobile app.

This is the protocol engine extracted from the
[Home Assistant Sofabaton X integration](https://github.com/m3tac0de/home-assistant-sofabaton-x1s);
the integration is its reference consumer.

**Building your first integration? Start with the
[server starter guide](https://github.com/m3tac0de/home-assistant-sofabaton-x1s/blob/main/sofabaton-x-server/docs/getting-started.md).**
The server manages this library and supplies a management UI, web remote
and HTTP/WebSocket APIs. Your platform can select registered hubs and map
actions and events without rebuilding setup or remote screens. Use the
library directly when embedding the hub connection in a Python application;
your application then owns persistence and any callback listener.

> **Disclaimer:** this project is not affiliated with or endorsed by
> Sofabaton. The protocol was reverse-engineered from network captures;
> behavior may break with future hub firmware.

[Install](#install) · [Quickstart](#quickstart) · [Editing](#snapshots-and-live-editing) ·
[Whole-document writes](#editing-the-whole-document) · [Managed callbacks](#managed-wifi-devices) ·
[CLI and examples](#cli-and-examples) · [Stability](#stability)

## What it does

- **Proxy** a physical hub: the library advertises itself via mDNS exactly
  like a real hub, the official app connects to it, and every frame is
  relayed, decoded and observable. The hub keeps working with the app while
  your application observes the traffic. While the app is attached, it
  owns the session and the proxy refuses writes and control commands.
- **Catalogs**: read activities, devices (with live power state),
  buttons, commands, macros and favorites as typed results.
- **Control**: send button/command presses, switch activities, trigger
  find-my-remote.
- **Status and events**: typed connection status and hub identity, and
  one event stream for activity changes, catalog updates, hub and app
  link state, OTA and mode flips. The hub's own activity-state MQTT
  publishes (X2) can be fed back in as an external state source.
- **Configuration as data**: one hub record for every intake path,
  whether the library discovered the hub, a foreign mDNS stack did, a
  user typed an address, or it arrived as a REST body.
- **Backup / restore**: export and restore hub configuration, including
  provisioning supported device classes from a validated hand-built bundle
  with payloads appropriate to the hub model.
- **Snapshots and live editing**: project the hub configuration from the
  cache at no hub cost, diff an edited copy against it and sync the
  difference to the hub as targeted in-place writes
  (activity- or device-scoped), with a pure plan builder for dry-run
  previews.
- **IR payloads**: play a raw payload once, learn a code from a physical
  remote through the hub's IR receiver, and convert between the hub's
  stored formats, Pronto hex and raw timings through `IrPayload` and the
  async facade. Save or replace payloads through the edit helpers and sync.

Deliberately **out of scope**: executing the HTTP or MQTT callbacks that
network-class devices define (e.g. a Roku-style ECP listener). The
library carries the protocol artifacts for those features. The server and
Home Assistant integration provide their own listeners on top.

## Install

```
python -m pip install "sofabaton-x>=0.2,<0.3"
```

For existing applications still on the 0.1.x API, stay on that series
until you have migrated:

```
python -m pip install "sofabaton-x>=0.1,<0.2"
```

Python 3.11+. The only dependency is
[python-zeroconf](https://pypi.org/project/zeroconf/) (mDNS advertising and
hub discovery).

## Quickstart

**Fully close the official Sofabaton app before discovering a hub.** While
the app is connected directly to it, the hub stops advertising and
`async_discover_hubs()` cannot find it. Keep the app closed through the
first connection and control test. If a server or another proxy already
manages the hub, release it there before trying these direct-library
examples. For server integrations, one server manages all your hubs.

Blocking work runs in the event loop's executor and callbacks (plain
functions or coroutines) are delivered on
the loop, so application code never touches the engine threads:

```python
import asyncio
from sofabaton import AsyncXProxy, HubConfig, async_discover_hubs

async def main():
    hubs = await async_discover_hubs(timeout=5.0)   # physical hubs; proxies filtered
    if not hubs:
        print("No hub found. Fully close the official Sofabaton app, then scan again.")
        return
    hub = hubs[0]

    proxy = AsyncXProxy.from_config(HubConfig.from_discovered(hub))
    proxy.on_activity_change(lambda new, old, name: print(f"activity -> {name}"))

    async with proxy:
        if not await proxy.wait_until_controllable():   # own the hub (see below)
            raise RuntimeError("Hub did not become controllable")

        for act in await proxy.activities():           # list[Activity]
            print(f"activity {act.activity_id}: {act.name}")

        for dev in await proxy.devices():              # list[Device]
            for cmd in await proxy.commands(dev.device_id):   # list[Command]
                print(f"device {dev.device_id} ({dev.name}): "
                      f"command {cmd.command_id} = {cmd.label}")

        # To send, choose a (device_id, command_id) pair from the listing
        # whose physical effect you want, then uncomment and replace the IDs:
        # if not await proxy.send(1, 5):
        #     raise RuntimeError("Command refused; check the hub mode")

asyncio.run(main())
```

`HubConfig.from_discovered()` preserves the hub's address and mDNS identity
so the official app can find the proxy. For manual entry,
`AsyncXProxy(hub_ip="192.168.1.50")` is enough; the hub model is confirmed
from its connect banner. Without mDNS identity it advertises under a
generic name. You can also pass the discovered identity explicitly:

```python
proxy = AsyncXProxy(
    hub_ip=hub.host,
    mdns_instance=hub.name,   # advertise as the hub, so the app finds the proxy
    mdns_txt=hub.txt,         # carries HVER -> X1/X1S/X2 classification
)
```

### Configuration as data

Every way a hub can reach your application produces the same record, a
`HubConfig` dataclass that round-trips through a plain dict (a REST body,
a config file) and builds the proxy:

```python
from sofabaton import AsyncXProxy, HubConfig

cfg = HubConfig(host="192.168.1.50")                    # manual entry: host is enough
cfg = HubConfig.from_discovered(hub)                    # from async_discover_hubs / HubBrowser
cfg = HubConfig.from_advertisement(                     # from a foreign mDNS stack's record
    service_type, instance_name, host=host, port=port, properties=txt_properties,
)
cfg = HubConfig.from_dict(json_body)                    # from a REST body or config file

proxy = AsyncXProxy.from_config(cfg)                    # same as AsyncXProxy(**cfg.proxy_kwargs())
```

`from_advertisement` accepts what mDNS libraries hand out (bytes or str
keys and values) and raises `ValueError` for anything that is not a
Sofabaton hub advertisement. An unrecognised `HVER` does not reject the
record: `hub_version` stays `None` and the connect banner settles it.
`is_proxy` is `True` when the record describes one of *your own* proxy
advertisements (they mimic hubs by design and carry the `HA_PROXY` TXT
key); use it to map such a record back to the hub you already front
instead of proxying a proxy. `source` (`"server"`, `"client"`,
`"manual"`) is informational.

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
those ids, then `send(entity_id, command_id)`. The reads return typed
dataclasses (each with a `to_dict()`), cached if available, else fetched:

| read                     | returns                                                                                  |
| ------------------------ | ---------------------------------------------------------------------------------------- |
| `activities()`           | `list[Activity]`: `activity_id`, `name`, `active`, `needs_confirm`                       |
| `devices()`              | `list[Device]`: `device_id`, `name`, `brand`, `device_class`, `device_class_code`, `power_state`, `idle_behavior` |
| `commands(device_id)`    | `list[Command]`: `command_id`, `label`                                                   |
| `macros(activity_id)`    | `list[Macro]`: `command_id`, `label`                                                     |
| `favorites(activity_id)` | `list[Favorite]`: `device_id`, `command_id`, `label`                                     |
| `buttons(entity_id)`     | `list[Button]`: `button_code`, `name`, `device_id`, `command_id`, `long_press_device_id`, `long_press_command_id` |
| `current_activity()`     | `{activity_id, name}` or `None` when idle                                                |

Lists are sorted by id. `Device.power_state` is the hub's live power byte
(0 off, 1 on) as of the last devices fetch, or `None` when the row carried
no parseable record; the hub commits it with a short lag after a power
command, so it is not an instantaneous read. `activities(refresh=True)`
and `devices(refresh=True)` re-read the list from the hub (fresh power
bytes included). The engine is fetch-then-prune: a refresh that cannot
be issued or never lands raises the typed error and the cached list
stays readable; nothing is cleared first.

`current_activity()` is the exception to the table above — it reads the
hub's **live** running-activity state (no fetch) and works in observe mode
too; subscribe to changes with `on_activity_change(cb)`.

Two typed status reads sit beside the catalog reads, both returning
dataclasses with a `to_dict()`:

| status read                | returns                                                                                              |
| -------------------------- | ---------------------------------------------------------------------------------------------------- |
| `status()`                 | `HubStatus`: `hub_connected`, `app_connected`, `controllable`, `mode`, `hub_version`, `proxy_enabled`, `running_activity`, cached counts, `catalog_ready` |
| `hub_info(refresh=False)`  | `HubInfo`: `known`, `model`, `name`, `mac`, `firmware_version`, `production_batch` (from the connect banner) |

`status()` is a pure state read and works in every mode; `mode` is
`"disconnected"`, `"observe"` or `"control"` and explains why a send was
refused. `hub_info()` serves the banner known from the session and only
re-reads it on `refresh=True`, which needs control mode.

A read that has to fetch and cannot raises a typed error: `HubBusyError`
(an app holds the hub), `HubNotConnectedError` (no hub session), or
`FetchTimeoutError` (the reply never landed). They subclass `RuntimeError`
and `TimeoutError`, so existing `except` clauses keep working.

Control: `send(entity_id, command_id)` (alias `press`),
`start_activity(act)`, `stop_activity(act)`, `find_remote()`.

### Events

Every engine listener is also available as one typed stream:

```python
async for event in proxy.events():          # HubEvent(seq, kind, payload)
    print(event.seq, event.kind, event.to_dict()["payload"])
```

| kind                    | payload                                            |
| ----------------------- | -------------------------------------------------- |
| `activity_changed`      | `ActivityChanged`: `activity_id`, `previous_activity_id`, `name` (`activity_id` is `None` when the hub powered off) |
| `activity_list_updated` | none (re-read `activities()`)                      |
| `hub_state` / `app_state` | `ConnectionState`: `connected`                   |
| `status_changed`        | `StatusChanged`: `mode`, `previous_mode` (derived; fires once per mode flip) |
| `catalog_ready`         | `CatalogReady`: `ready` (the connect-time initial sync finished, or the session dropped) |
| `snapshot_changed`      | `SnapshotChanged`: `snapshot_id`, `engine_generation`, `device_ids`, `activity_ids` (a refresh landed, a write was rebased, or the cache was imported) |
| `ota`                   | none (the hub goes silent for a few minutes)       |

Each consumer gets its own bounded queue (`maxsize=256` by default). A
consumer that falls behind loses the oldest events rather than stalling
the engine; drops are counted in `proxy.events_dropped` and show up as a
gap in `seq`. The `on_*` registrations keep working alongside the stream.

### Two modes

Initial discovery requires the official app to be disconnected from the
physical hub so the hub advertises. Once the proxy is connected, the app
can connect through it and the modes below apply.

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

Every time the hub connects, the proxy also runs a small **initial
sync** on its own: it reads the connect banner, the device list and the
activity list, so that minimum is always cached for the session (and
`hub_info()` / `activities()` / `devices()` never need a fetch of their
own afterwards). `await proxy.wait_until_ready()` resolves once that has
happened; `status().catalog_ready` mirrors it and the `catalog_ready`
event announces it. The sync needs control mode, so with an app already
attached it runs as soon as the app lets go. Pass `initial_sync=False`
to the constructor to opt out (an application that runs its own
connect-time sync, as the Home Assistant integration does).

To release one hub so the official app can reach it directly again, use
`await proxy.stop(release_hub=True)`. This briefly closes the shared listener
to stop that hub retrying the proxy; established sessions for other hubs
remain connected. Use plain `stop()` for application shutdown.

The mode is not fixed at startup — it follows the app. If the official
app connects while you hold control, you are demoted to observe mode
immediately: `send()` / `start_activity()` return `False` (refused, not
raised), and reads still serve cached data but raise `RuntimeError` when
they would need a fresh hub fetch. When the app disconnects, control
returns on its own. Both waiters are plain state predicates, so a
long-running application can simply re-await
`wait_until_controllable()` whenever a send comes back `False`.

## Snapshots and live editing

The **snapshot** is the hub's structural configuration (devices,
activities, commands, bindings, macros, favorites; everything but the IR
payload blobs) as the library's cache holds it. `snapshot()` projects it
with **no hub traffic**, in every mode, as a `HubSnapshot`:

```python
snap = await proxy.snapshot()
snap.snapshot_id          # configuration content hash, used as the edit revision
snap.complete             # every entity fetched in full
for e in snap.devices + snap.activities:
    print(e.kind, e.entity_id, e.name, e.complete, e.editable, e.fetched_at)
snap.bundle               # the structural hub_bundle dict the sync takes as baseline
snap.to_dict()            # the bundle with the header merged in (one JSON document)
```

The initial sync fills the catalogs automatically; detailed reads,
backups and sync reconciliation populate further cache entries.
`refresh(device_id=5)` or `refresh(activity_id=101)` explicitly re-reads one
entity (a few bursts); `refresh()` alone re-reads both catalogs once and
then every device and activity. A whole-hub read can take **minutes**, so
treat it as a user action, report its `progress` (a `WriteProgress` per
entity) and expect to cancel it between entities. Nothing in the library
starts a whole-hub refresh on its own. A refresh publishes
`snapshot_changed`; configuration writes rebase the snapshot and announce
changes. Cancellation of a whole-hub refresh finishes the current entity
before releasing the operation, then publishes the detail read so far.

The content hash excludes provenance such as `fetched_at`: it can change
without a new `snapshot_id`. Importing saved state preserves its detail
and completeness; a partial cache remains partial after a restart.

The cache is a last-known copy, and only the user can say whether it is
still current. The hub can be edited outside this library at any time
(the vendor app, another client, a restore) and never says so; the
library deliberately reports no freshness verdict. `fetched_at` is the
age of each entity's copy, a refresh is the only way to bring it up to
date. Sync re-reads the target before writing, but compares only the
selected tables described below; it cannot detect every outside edit.
An `app_state` event with `connected=False` means a
vendor-app session through the proxy just ended: one visible occasion,
among many invisible ones, on which to offer a refresh.

To keep the cache warm across restarts, persist the state document (the
library never touches disk):

```python
doc = await proxy.export_state()        # opaque, versioned JSON document
...                                     # next run, before start():
snap = await proxy.import_state(doc)    # StateDocumentError if unreadable
```

Editing is bundle-based: take a snapshot as the baseline, modify a copy
of its bundle, and sync. The engine diffs the two bundles into an ordered
plan of targeted in-place writes (nothing is deleted-and-restored),
re-reads selected entity tables to detect some concurrent changes, applies
the steps serially, each gated on the hub's acknowledgement, and re-reads the entity
afterwards so the next snapshot reflects the hub:

```python
import copy

snap = await proxy.snapshot()
baseline = snap.bundle
edited = copy.deepcopy(baseline)
# ... modify `edited`: rename the activity, rebind buttons, edit macros,
#     favorites, membership ...

# Optional dry run: the pure planner shows exactly what a sync would write.
from sofabaton import build_activity_sync_plan
for step in build_activity_sync_plan(baseline, edited, activity_id=101):
    print(step.kind, "-", step.label)

result = await proxy.sync_activity(
    baseline=baseline, edited=edited, activity_id=101,
    snapshot_id=snap.snapshot_id,          # refused if the cached revision moved
    strict=True,                          # also refuse incomplete/unreadable preflight
    progress=lambda p: print(p.phase, p.message),   # WriteProgress, on the loop
)
if not result.ok:
    raise RuntimeError(f"Sync stopped at {result.failed_at}: {result.message}")
```

`sync_device` / `build_device_sync_plan` are the device-scoped
counterparts (command adds and renames, payload edits, idle behaviour,
input records) with the same bundle-pair contract. Two guards run before
anything is written: a `snapshot_id` that is no longer current raises
`SnapshotOutdatedError`, and a baseline entity that is not `editable`
(never fetched, or fetched incomplete) raises `SnapshotIncompleteError`;
refresh the entity and edit again. A failed sync reports where it stopped
(`failed_at`, `completed_steps`) in the `SyncResult` rather than raising;
`failed_at: "stale_check"` means the live preflight refused the edit:
selected tables changed, or, with `strict=True`, the read was unreadable or
incomplete. Inspect `message` and `preflight`; `wrote_nothing` tells you
no step reached the hub. The planner refuses (with `ValueError`, surfaced as `failed_at:
"plan"`) any bundle difference outside the entity being edited, so an
editor bug cannot silently rewrite unrelated configuration.

The live comparison covers device **bindings and macros**, and activity
**bindings, macros and favorites**, with normalization of power durations
and role-page bindings. It does not compare all names, command payloads or
device-head fields. `sync_device` and `sync_activity` default to
`strict=False`, which can proceed when the preflight cannot be read in full;
pass `strict=True` to refuse those reads. Neither setting provides an atomic
transaction or protection against every concurrent edit.

| Document | Purpose and persistence |
| --- | --- |
| Structural snapshot | Cached configuration and provenance; edit a copy for sync. Contains no restorable command blobs. |
| Full backup bundle | Configuration plus payloads; keep the whole bundle for restore. Restore creates new IDs. |
| Exported state | Opaque, versioned cache document; persist and import it without editing. It is not a backup or an apply checkpoint. |
| Apply state | Both edit documents, item outcomes and ID mappings; persist for an interrupted document write, subject to the limits below. |

### Editing the whole document

An editor that changes many things at once hands back the **whole**
snapshot document and lets the library own the transition: order,
id allocation, batching of remote-sync requests, and what happens when the
run stops halfway. A new device or activity carries a negative
placeholder id of your choosing (and every reference to it uses that
same negative id); a removed entity must be removed from every activity
in the same document; the array order of `devices` / `activities` is
the display order. `build_hub_sync_plan` validates the document with no
hub traffic and previews the items. This checks structure and supported
edits, not every payload's encoding or whether the hub will accept a write.
`sync_hub` runs the items inside one batch, with at most one explicit
remote-sync trigger when required. Snapshot notifications are coalesced;
an unchanged document is a successful no-op and need not emit an event.
Affected entities must pass strict live reads before the first write;
the comparisons still cover only the selected tables described above.
Use the returned result, not an event, to determine completion:

```python
import copy
from sofabaton import ApplyState, DocumentError, build_hub_sync_plan

snap = await proxy.snapshot()
desired = copy.deepcopy(snap.bundle)
desired["hub"]["name"] = "Loft"
desired["devices"].append({"device": {"device_id": -1, "name": "Projector", "device_class": "ir"},
                           "commands": [], "button_bindings": [], "macros": []})
try:
    plan = build_hub_sync_plan(
        snap.bundle, desired, hub_version=(await proxy.status()).hub_version,
    )
except DocumentError as err:
    print(err.code, err)  # dangling_reference, out_of_scope, ...
    raise                # do not submit a document whose preview failed
for item in plan.items:
    print(item.index, item.kind, item.entity_id or item.placeholder_id, item.label)

# In-memory illustration only. For recovery, atomically save each document
# to durable storage in your on_state callback; the library never saves it.
records: list[dict] = []
result = await proxy.sync_hub(
    baseline=snap.bundle, desired=desired, snapshot_id=snap.snapshot_id,
    progress=lambda p: print(p.item_index, p.phase, p.message),
    on_state=lambda state: records.append(copy.deepcopy(state.to_dict())),
)
print(result.status, result.id_map, result.remote_sync)      # HubSyncResult
for item in result.items:
    print(item.kind, item.status, item.completed_steps, item.total_steps, item.message)
```

Every item ends `done`, `partial` (some steps landed), `uncertain` (a
write went out and no answer followed), `failed` (refused before its
first write), `not_attempted` or `cancelled`; the first non-`done` item
stops the run and nothing is rolled back. `on_state` receives the
`ApplyState` after every item (and right after a created entity's id is
known). After inspecting the resulting hub state and the limitations below,
a stopped or cancelled run can be continued with
`sync_hub(state=ApplyState.from_dict(doc))`. It re-reads affected entities
and re-plans remaining work. Cancelling the awaiting task drains the item
in flight before stopping. In the CLI: `snapshot out=D0.json`,
edit a copy, `apply D1.json baseline=D0.json plan`, then without `plan`
to write; `apply resume=D1.json.apply.json` continues.

#### Current document-write limitations

Resume is not yet a guarantee against duplicate creates. A create whose
acknowledgement or readback was lost can be repeated even when an ID mapping
was recorded. Also, a running item's state is not always emitted before
dispatch, so the last saved checkpoint can say `not_attempted` after its
write reached the hub. Do not automatically resume an uncertain create or
a checkpoint from an abrupt interruption. Preserve the checkpoint, refresh
and inspect the hub, then construct a new edit against the reconciled
snapshot when the intended changes are clear. There is no rollback.

The server adds persistent apply records but has further
[restart and retry limitations](https://github.com/m3tac0de/home-assistant-sofabaton-x1s/blob/main/sofabaton-x-server/README.md#recovery-and-retention).

### Edit helpers

The common row edits are pure functions in `sofabaton.edits`: each takes
a snapshot bundle and returns an edited copy for the sync, so a script
does not have to know the row shapes. `rename_activity`, `rename_device`,
`bind_button` (with an optional long press), `clear_button`,
`add_favorite`, `remove_favorite`, `reorder_favorites`, `rename_command`,
`set_idle_behavior`, `set_command_payload`, and `add_command` (which returns
the edited bundle and an available command id):

```python
from sofabaton import ButtonName, edits

snap = await proxy.snapshot()
edited = edits.bind_button(snap.bundle, 101, ButtonName.VOL_UP, device_id=7, command_id=3,
                           long_press=(7, 4))
result = await proxy.sync_activity(baseline=snap.bundle, edited=edited, activity_id=101,
                                   snapshot_id=snap.snapshot_id, strict=True)
if not result.ok:
    raise RuntimeError(f"Sync stopped at {result.failed_at}: {result.message}")
```

### Intents

Whole-entity writes a bundle diff cannot express are explicit coroutines.
They raise `HubBusyError` / `HubNotConnectedError` when the hub cannot be
written, `ValueError` for bad input, and `HubRejectedError` when the hub
refused or did not acknowledge; each ends with a rebase and a
`snapshot_changed` event:

```python
device_id = await proxy.add_device("Ceiling fan", "ir")   # empty IR device, hub-assigned id
activity_id = await proxy.add_activity("Read")
removed = await proxy.remove_device(device_id)            # DeviceRemoved: impacted activities
await proxy.remove_activity(activity_id)
await proxy.reorder_devices([7, 5, 8])                     # every device, once
await proxy.reorder_activities([102, 101])
await proxy.set_hub_name("Living room")
bundle = await proxy.backup(progress=print)                # full, restorable (minutes)
result = await proxy.restore(bundle, replace=False)        # RestoreResult; replace=True erases first
await proxy.erase()                                        # everything, final
```

These are separate operations, not a script to run in sequence. Whole-entity
intents use their own validation; the live baseline comparison described
above belongs to `sync_activity` / `sync_device`.

`backup()` includes command payloads by default. A structural snapshot or
`backup(include_blobs=False)` cannot be restored. `restore(bundle)` is
additive: it creates entities with new hub-assigned ids. Use
`restore(bundle, replace=True)` to validate the bundle before erasing and
rebuilding the hub; do not call `erase()` separately to implement replace.
Inspect `RestoreResult.ok`, `failed_at`, `restored_devices`,
`restored_activities`, `device_id_map` and `snapshot_id`. A partial restore
is not rolled back; inspect the resulting snapshot before deciding how to
recover. Retrying an additive restore can create duplicates.

### IR payloads

`IrPayload` is one command's stored payload. Build it from the formats
codes circulate in, read it back from the hub, fire it once, or capture it
from the original remote; saving one as a new command is a row edit:

```python
from sofabaton import IrPayload, edits

# A complete descriptor; choose a code appropriate to your device.
p = IrPayload.from_descriptor("P:NEC1 D:4 S:5 F:21")
await proxy.play(p)                     # emits IR once; nothing is saved

# Or capture from the original remote. Keep the hub idle while learning.
p = await proxy.learn_ir(timeout=30)    # IrLearnError if no usable capture
snap = await proxy.refresh(device_id=5)
edited, command_id = edits.add_command(snap.bundle, 5, p, "Learned key")
result = await proxy.sync_device(
    baseline=snap.bundle, edited=edited, device_id=5,
    snapshot_id=snap.snapshot_id,
)
if not result.ok:
    raise RuntimeError(f"Save failed at {result.failed_at}: {result.message}")
print("Saved command", command_id)
```

`IrPayload.from_pronto(text)`, `from_raw_timings(timings_us, carrier_hz)`
and `from_hex(text)` accept the other input formats. `cancel_learn()` ends an
active capture wait.

### Reading a stored payload

`read_payload(device_id, command_id)` reads any command's stored payload and
types it by the device's class. It returns `None` when nothing is stored.

| Device class | Returned type |
| --- | --- |
| IR, RF | `IrPayload` |
| `wifi_ip`, `wifi_roku`, `wifi_hue`, `wifi_sonos` | `NetworkCommand` (see below) |
| Bluetooth, `wifi_mqtt`, anything undecodable | `CommandRecord` |

All three have `blob`, `hex`, `to_command_row()` and `to_dict()`, and the edit
helpers save any of them on a device of the same class. A `CommandRecord`'s
`fields` holds the structured form where the class has one (`wifi_mqtt`:
`device_id` and `command_id`, which the hub ignores) and is `None` otherwise.
Only an `IrPayload` can be passed to `play()`:

```python
from sofabaton import IrPayload

p = await proxy.read_payload(5, 2)
if isinstance(p, IrPayload):
    await proxy.play(p)
elif p is not None:
    print(type(p).__name__, p.hex)
```

### Network commands

Wifi devices (`wifi_ip` on X1S and X2, `wifi_roku` everywhere, `wifi_hue`,
`wifi_sonos`) store a request the hub renders at press time. `NetworkCommand`
is that request in structured form; the same edit helpers save it, and the
class must match the device's class or the helper refuses before anything is
planned:

```python
from sofabaton import NetworkCommand, edits

device_id = await proxy.add_device("Home automation", "wifi_ip")   # X1S / X2
hook = NetworkCommand.http(host="192.168.1.20", port=8123, method="POST",
                           path="/api/webhook/lights", content_type="application/json",
                           body='{"state": "toggle"}')
snap = await proxy.refresh(device_id=device_id)
edited, command_id = edits.add_command(snap.bundle, device_id, hook, "Lights")
result = await proxy.sync_device(
    baseline=snap.bundle, edited=edited, device_id=device_id,
    snapshot_id=snap.snapshot_id, strict=True,
)
if not result.ok:
    raise RuntimeError(f"Sync stopped at {result.failed_at}: {result.message}")
```

`NetworkCommand.roku("keypress/Home")` is a Roku ECP path; the Roku device head
carries the target address (set the device block's `ip_address` in the bundle
and sync the device) and the hub always POSTs to port 8060.
`NetworkCommand.hue(path, body_block)` and `.sonos(path, body_block)` cover the
two REST-over-head-address classes. `set_command_payload` takes a
`NetworkCommand` too. A command read back with `read_payload` keeps the
record's opaque trailer bytes in `trailer_hex`, so its `blob` is exactly what
the hub stores.

### Managed wifi devices

A *managed* wifi device is one you create so the remote can call you:
`WIFI_SLOT_COUNT` slots, each a short and a long press record whose callback
path is `launch/<hub action id>/<device id>/<slot index>/<short|long>`, all
pointing at one host and port. Deploy one from a `WifiDeviceSpec`, keep the
returned `WifiDeployment`, and edit it in place later:

```python
from dataclasses import replace
from sofabaton import (
    ButtonName, edits, WifiDeviceSpec, WifiSlotSpec,
    WifiUpdateDeclined, WifiUpdateFailed,
)

spec = WifiDeviceSpec(name="Server", slots=(WifiSlotSpec("Play"), WifiSlotSpec("Pause")),
                      power_on_slot=1, input_slots=(2,))
deployment = await proxy.deploy_wifi_device(spec, host="192.168.1.10", port=8060)
deployment_document = deployment.to_dict()  # persist this in your application

# Bind the commands with the generic helpers; the update below never touches those.
snap = await proxy.refresh(activity_id=101)
edited = edits.bind_button(snap.bundle, 101, ButtonName.PLAY, device_id=deployment.device_id, command_id=1)
result = await proxy.sync_activity(
    baseline=snap.bundle, edited=edited, activity_id=101,
    snapshot_id=snap.snapshot_id, strict=True,
)
if not result.ok:
    raise RuntimeError(f"Binding stopped at {result.failed_at}: {result.message}")

# Updates replace the complete spec. Copy the normalized deployed spec so
# power/input hooks, the other slots and the brand survive this rename.
slots = list(deployment.spec.slots)
slots[0] = replace(slots[0], label="Start", long_label="Start Long")
updated_spec = replace(deployment.spec, slots=tuple(slots))
try:
    deployment = await proxy.update_wifi_device(deployment, updated_spec)
except WifiUpdateDeclined as err:  # nothing written by this update
    raise RuntimeError(f"Update declined; inspect the deployment: {err}") from err
except WifiUpdateFailed as err:    # some steps may have landed
    raise RuntimeError(f"Update incomplete; retain the desired spec and inspect: {err}") from err
deployment_document = deployment.to_dict()  # persist the successful update
```

Both deploy and update take a **complete desired specification**. Omitted
slots become `Button n` / `Button n Long`; omitted power/input hooks are
cleared. Preserving device/command IDs and generic bindings does not preserve
omitted spec fields. Hook slots are **1..10**; callback path indexes are
**0..9**. Short command IDs are `1..10`, long IDs `11..20`.

A slot can also say where its command goes, so the bindings travel with
the spec instead of being made one by one:

```python
WifiSlotSpec("Lights", favorite=True, button=ButtonName.VOL_UP, long_press=True, activities=(101, 102))
WifiSlotSpec("Movie scene", input_activity_id=101)   # performed while activity 101 starts (X1S/X2)
```

`favorite` and `button` apply in every activity of `activities`;
`long_press` also binds the slot's long record to that button's long press.
One slot per button and one slot per input activity, a power slot is never
an input, and `activities` is only kept while `favorite` or `button` is
set (`normalized()` raises `ValueError` otherwise). `deploy_wifi_device`
creates the device and applies the references as its first update;
`update_wifi_device` writes them in place, joining the activities they
name and giving the device's own page the buttons. The planner's ownership
rule decides what is ever removed: only a favorite, a button or an activity
membership that an earlier spec of this device put there, never one made
with the generic helpers or in the Sofabaton app. A spec that stops naming
an activity leaves it, and the hub then drops every row of the device in
that activity. An activity the hub does not have is a `WifiUpdateDeclined`
with `reason="activity"`.

Every slot is written, defaults included. The
callback target never changes in place: a new address is a remove and a new
deploy. The X1 always calls port 8060 and ignores the power and input hooks.
`update_wifi_device` refuses (`WifiUpdateDeclined`) when a record's label
matches neither what the deployment wrote nor what the new spec asks, so an
edit made in the Sofabaton app is never silently overwritten; a record that
already carries the new label is an interrupted update being resumed. A write
the hub rejects raises `WifiUpdateFailed` (a `HubRejectedError`) and the next
update with the same spec resumes.

## CLI and examples

A CLI ships as a console script:

Close the official app before `discover` or the first `run`; a hub
connected directly to the app does not advertise.

```
sofabaton discover                   # scan the LAN for hubs
sofabaton run --hub-ip 192.168.1.50  # proxy + interactive shell
x> status
x> activities
x> commands 1                        # list (command_id, label) for device 1
x> send 1 5                          # numeric ids, exactly like the Python API
x> send 101 POWER_ON                 # the CLI also resolves button names to codes
x> testir 01 20 00 10 01 00 94 ac .. # fire a raw IR payload once (nothing saved)
x> snapshot                          # every device/activity + completeness / editability
x> refresh act=101                   # re-read one entity (refresh alone = whole hub, slow)
x> rename act 101 Movie night        # snapshot, edit, sync
x> bind 101 VOL_UP 7 3 7 4           # button -> device 7 command 3, long press command 4
x> unbind 101 VOL_UP
x> hubname Den
x> backup hub.json                   # save a full bundle
x> restore hub.json                  # additive restore: creates new entities
x> restore hub.json erase            # replacing restore: validates, then erases
```

For command sending, the CLI's `send` (alias `press`) accepts either
a numeric command/button code or a `ButtonName` alias like `POWER_ON`.
The Python API itself is numeric-only — `send(entity_id, command_id)` —
with the `ButtonName` constants importable from the package root when
you want named button codes.

`testir` works with raw IR payload hex (the bytes a command replays, as
shown in a backup's `data_hex` fields) and plays it once without saving;
in the Python API this is `play(IrPayload.from_hex(...))`.

Install the library, then download the example files or use a repository
checkout. Run the paths below from the repository root. These examples
connect directly to physical hubs; use the server examples when a server
already manages your hub. Examples that discover hubs choose the first result.

| Example in [sofabaton-x/examples](https://github.com/m3tac0de/home-assistant-sofabaton-x1s/tree/main/sofabaton-x/examples) | Purpose |
| --- | --- |
| `discover.py` | List physical hubs without connecting to them. |
| `minimal_proxy.py` | Connect and list activities/devices; sending is commented out. |
| `watch_events.py` / `watch.py` | Observe typed events / individual callbacks. |
| `catalog_details.py` | Fetch commands, macros and favorites. |
| `from_platform_discovery.py` | Turn a platform's mDNS record into a proxy configuration; replace the sample record. |
| `edit_activity.py` | Preview a rename; write only with `--apply`. |
| `backup.py` | Save a full backup; restore code is commented out. |
| `restore_ip_device.py` | Advanced: create a real network device and send its Ping command; edit the target settings first. |
| `wifi_http_listener.py` | Advanced: sketch a hub-facing callback listener; the server already supplies one. |

For a complete facade edit workflow, run
[`examples/edit_activity.py`](https://github.com/m3tac0de/home-assistant-sofabaton-x1s/blob/main/sofabaton-x/examples/edit_activity.py) with a hub address,
activity id and name. It connects, refreshes that entity, previews the plan
and, with `--apply`, syncs and checks the result:

```sh
python sofabaton-x/examples/edit_activity.py --hub 192.168.1.50 --activity 101 --name "Movie night"
python sofabaton-x/examples/edit_activity.py --hub 192.168.1.50 --activity 101 --name "Movie night" --apply
```

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

Model support describes implemented protocol paths, not proof that every
operation has been exercised on every firmware. The
[live-hub testing notes](https://github.com/m3tac0de/home-assistant-sofabaton-x1s/blob/main/docs/protocol/live-hub-testing.md) record the
bench coverage and outstanding checks. In particular, the document-write
bench covers X1/X1S; equivalent X2 and server-route coverage is still pending.

## Stability

Names importable from the package root — `from sofabaton import ...`,
the set listed in `sofabaton.__all__` — are the supported API and follow
semver. Everything else (`sofabaton.opcode_handlers`, frame parsing,
wire schemas, the `proxy_*` mixin modules) is internal and may change
between minor releases. The public surface is async-first by design:
`AsyncXProxy` is the supported entry point, and the underlying
synchronous engine (reachable via `AsyncXProxy.sync` when you need the
raw surface) is internal and not semver-covered. Prefer the named facade
methods in this README; compatibility delegates and direct engine access
are for advanced consumers. Until 1.0, pin a minor version.

The facade exports these typed exceptions, all subclasses of stdlib
exceptions. Plain `ValueError` also reports malformed input or unsupported
operations. Readiness waiters return a boolean; control sends may return
`False`; sync and restore can return unsuccessful results. Check those
values as well as catching exceptions.

| exception | base | response |
| --- | --- | --- |
| `HubBusyError` | `RuntimeError` | wait until the app releases the hub |
| `HubNotConnectedError` | `RuntimeError` | wait for reconnection before retrying |
| `FetchTimeoutError` | `TimeoutError` | a read timed out; retain cached data and retry with backoff |
| `SnapshotIncompleteError` | `ValueError` | refresh the target entity before editing |
| `SnapshotOutdatedError` | `ValueError` | obtain a new snapshot and reapply the intended edit |
| `StateDocumentError` | `ValueError` | discard the unreadable state document and start cold |
| `HubRejectedError` | `RuntimeError` | inspect hub state before retrying a write; its outcome may be uncertain |
| `IrLearnError` | `RuntimeError` | inspect `state`; retry capture with the hub idle if appropriate |

## Issues & release notes

Bugs and feature requests go to the shared
[issue tracker](https://github.com/m3tac0de/home-assistant-sofabaton-x1s/issues).
For standalone library issues, include the command you ran, the terminal
output or traceback, the package and Python versions, and a small
reproduction snippet if possible.

See the [changelog](https://github.com/m3tac0de/home-assistant-sofabaton-x1s/blob/main/sofabaton-x/CHANGELOG.md)
for library changes and migration instructions. Pushing a tag named
`sofabaton-x-vX.Y.Z` triggers automated publication to PyPI. Published versions
are listed in the [PyPI release history](https://pypi.org/project/sofabaton-x/#history).

## License

MIT — see [LICENSE](https://github.com/m3tac0de/home-assistant-sofabaton-x1s/blob/main/LICENSE).
