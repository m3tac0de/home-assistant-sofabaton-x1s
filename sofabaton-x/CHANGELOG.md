# Changelog

Changes to the standalone `sofabaton-x` library, with migration guidance
for applications using its public API. Server changes are documented
separately in the [server documentation](../sofabaton-x-server/README.md).

<!-- Keep release notes here. Before pushing a release tag, add the version
and date, update the README notice and install instructions, and start a new
Unreleased section. Link breaking releases to their migration guidance.
Preserve previous entries. Tags trigger PyPI publication, not GitHub Releases. -->

## Unreleased

- `AsyncXProxy.sync_device` takes `allow_command_removal`: with it, command
  rows present in the baseline but absent from the edit are deleted on the
  hub (the hub cascades their references) and the device's display-sort
  table is rewritten once. The default stays refusing removals as out of
  scope. The server's `PUT /hubs/{id}/devices/{did}` and its plan preview
  pass it, so the control panel's device editor can delete commands as the
  Home Assistant card does.

## 0.2.0 (2026-09-16)

`AsyncXProxy` now provides typed reads, status, events and configuration
editing so applications can use the supported facade for common hub
operations. This release also brings IR learning and conversion, managed
callback devices, whole-document editing, and connection/recovery fixes
that had not previously reached PyPI.

**Breaking changes from 0.1.x:** the migration guidance below uses 0.1.5
as its baseline. Before 1.0, minor releases may change the public API;
pin to `sofabaton-x>=0.2,<0.3` until ready to adopt the next minor version.

### Breaking changes and migration

**Catalog reads return typed objects.** `activities()` and `devices()`
now return lists of `Activity` and `Device` objects, sorted by ID, instead
of dictionaries keyed by ID. `commands()`, `buttons()`, `macros()` and
`favorites()` return lists of typed objects instead of dictionaries.
Use attributes for fields and `.to_dict()` when you need a dictionary.

```python
# 0.1.x
activities = await proxy.activities()
for activity_id, activity in activities.items():
    print(activity_id, activity["name"])

# 0.2.0
for activity in await proxy.activities():
    print(activity.activity_id, activity.name)
```

`current_activity()` still returns a dictionary or `None`.

**Reads can raise typed errors.** A read that needs hub traffic raises
`HubBusyError` when the official app owns control, `HubNotConnectedError`
when disconnected, or `FetchTimeoutError` when the reply does not arrive.
They inherit from `RuntimeError` or `TimeoutError`, so handlers for those
base classes continue to work. Cached reads can still work in observe mode.

**Sync uses typed progress and results.** For `sync_activity()` and
`sync_device()`, replace `progress_callback=` with `progress=`. The callback
receives one `WriteProgress` object instead of keyword arguments. The
return value is a `SyncResult`, so use `result.ok` instead of
`result["status"] == "success"`.

```python
def on_progress(event):
    print(event.to_dict())

result = await proxy.sync_activity(
    baseline=snapshot.bundle,
    edited=edited_bundle,
    activity_id=activity_id,
    snapshot_id=snapshot.snapshot_id,
    strict=True,
    progress=on_progress,
)
if not result.ok:
    print(result.failed_at)
```

Sync requires a complete, editable snapshot of the target. Refresh the
target before editing if needed. Pass the snapshot's `snapshot_id` to
reject changes based on an outdated revision. Handle
`SnapshotIncompleteError` and `SnapshotOutdatedError` as well as checking
`result.ok`. A disconnected hub or an app-held hub now raises
`HubNotConnectedError` or `HubBusyError` instead of returning an
`"unavailable"` result. See the [editing example](examples/edit_activity.py) for the
snapshot, preview and apply flow.

The live preflight compares selected bindings, macros and favorites; it
does not detect every outside edit. `strict=True` also refuses an unreadable
or incomplete preflight; the default is `False`. Neither setting makes a
write atomic or rolls back a partial result.

**Initial catalog sync is enabled by default.** `AsyncXProxy(...)` and
`AsyncXProxy.from_config(...)` now read hub identity, devices and activities
when the hub connects. Pass `initial_sync=False` if your application owns
that work. `AsyncXProxy.wrap(...)` still defaults to `initial_sync=False`.
Use `wait_until_ready()` to wait for the automatic sync and check its
boolean result before using the catalogs.

**Write methods raise on failure.** `set_hub_name()` and
`reorder_activities()` now return `None` on success. Remove checks that
treat a falsey return value as failure; handle the documented exceptions
instead. Sync and restore retain explicit result objects whose `.ok`
must be checked.

**Several engine delegates are no longer exposed on `AsyncXProxy`.** Use
the facade operations below. These are migration paths; argument and
return types can differ from the old methods.

| Removed facade delegate | Migration path |
| --- | --- |
| `get_banner_info()` | `hub_info()` returns a typed `HubInfo`. |
| `backup_hub_bundle()` | `backup()` returns a bundle. |
| `restore_hub_bundle()` | `restore(bundle)` returns a `RestoreResult`; use `replace=True` when replacing the hub configuration. |
| `erase_configuration()` | `erase()`. |
| `create_activity()` | `add_activity(name)` returns the new activity ID. |
| `delete_device()` | `remove_device(device_id)`. |
| `play_ir_blob()` | `play(payload)` accepts an `IrPayload` or bytes. |
| `request_ir_command_dump()` | `read_payload(device_id, command_id)` returns an `IrPayload` or `None`. |
| `persist_ir_blob()` | Apply `edits.add_command()` to a bundle, then `sync_device()`. |
| `command_to_button()` | Apply `edits.bind_button()` to a bundle, then `sync_activity()`. |
| `command_to_favorite()`, `delete_favorite()`, `reorder_favorites()` | Apply `edits.add_favorite()`, `edits.remove_favorite()` or `edits.reorder_favorites()` to a bundle, then `sync_activity()`. |
| `add_device_to_activity()` | Edit activity membership in a bundle, then `sync_activity()`. |
| `create_wifi_device()` | Use `deploy_wifi_device(WifiDeviceSpec(...))` for managed callback devices. For generic network devices, use `add_device()` plus `NetworkCommand`/edit helpers, or `restore(bundle)` for complete provisioning. |

The [library README](README.md) documents the current facade and its
exceptions. Direct engine access through `.sync` is internal and has no
compatibility guarantee.

### Added

- **Hub configuration:** `HubConfig` accepts manual addresses, library
  discovery results, foreign mDNS advertisements and dictionaries.
  `is_proxy` identifies proxy advertisements; `AsyncXProxy.from_config()`
  creates the connection from the record.
- **Status and identity:** `status()` returns `HubStatus`, including
  connection state, control mode, running activity and catalog readiness.
  `hub_info()` returns typed banner information. `Device` includes power
  state as of the last devices fetch, device class and idle behavior.
- **Events:** `events()` yields typed `HubEvent` objects for activity,
  connection, mode, catalog, snapshot and OTA changes. Consumers have
  bounded queues; dropped events are counted in `events_dropped` and
  visible as sequence gaps. Existing `on_*` callbacks remain available.
- **Catalog readiness and refresh:** automatic initial sync reads hub
  identity, devices and activities. `wait_until_ready()` reports completion;
  `activities(refresh=True)` and `devices(refresh=True)` re-read their lists.
- **Snapshots and persistence:** `snapshot()` projects cached structural
  configuration without hub traffic. `snapshot_id` is its content revision;
  entity completeness, editability and `fetched_at` describe the cached copy,
  not guaranteed freshness. `refresh()` explicitly reads one entity or the
  whole hub, with progress and cancellation between entities. Detailed
  catalog reads, backups and write reconciliation also populate the cache.
  `export_state()` / `import_state()` carry an opaque, versioned cache
  document across restarts; the application owns storage.
- **Configuration edits:** pure helpers in `sofabaton.edits` cover names,
  bindings, favorites, command payloads and idle behavior. Entity plan
  builders preview changes before `sync_activity()` / `sync_device()` apply
  them. Facade methods also create, remove and reorder devices/activities,
  rename the hub, and perform backup, restore and erase.
- **Whole-document writes:** `build_hub_sync_plan()` previews and
  `sync_hub()` applies changes across a hub bundle, resolving negative
  placeholder IDs for new entities. `ApplyState` records progress and ID
  mappings; applications must persist checkpoints themselves. Resume has
  [known limitations](README.md#current-document-write-limitations), including
  possible duplicate creates after uncertain writes. There is no rollback.
  `batch_writes()` coalesces requested remote-sync triggers and snapshot
  notifications. An unchanged document need not trigger either; use the
  returned result to determine completion.
- **IR payloads:** `IrPayload` converts Pronto hex, raw timings, descriptive
  IR codes and stored payload bytes. `read_payload()`, `play()`, `learn_ir()`
  and `cancel_learn()` provide reads, playback and capture through the facade.
  The edit helpers save new or replacement command payloads.
- **Network commands and callbacks:** `NetworkCommand` builds HTTP, Roku,
  Hue and Sonos payloads for the edit helpers, with device-class validation.
  `deploy_wifi_device(WifiDeviceSpec(...))` creates a ten-slot callback device
  with short/long commands and supported power/input hooks;
  `update_wifi_device()` updates it while preserving generic bindings,
  favorites and memberships. Keep the returned `WifiDeployment` and handle
  `WifiUpdateDeclined` / `WifiUpdateFailed`. The application supplies the
  callback listener; `sofabaton-x-server` provides one for server clients.
  `local_address()` returns the routed local IPv4 address toward the hub.
- **Long presses:** `Button.long_press_device_id` and
  `Button.long_press_command_id` identify the held command, or are both
  `None` when absent. These fields also appear in `to_dict()`.
- **Hub release:** `stop(release_hub=True)` releases a hub for direct use
  by the official app while established sessions for other hubs remain
  connected through the shared listener.
- **CLI and examples:** the shell gains `snapshot`, `refresh`, `rename`,
  `bind`, `unbind`, `hubname` and document `apply`; `status` includes identity
  and mode. Backup, restore and IR playback use the facade. New examples
  cover [typed events](examples/watch_events.py),
  [platform discovery](examples/from_platform_discovery.py) and
  [previewing/applying an activity edit](examples/edit_activity.py).

### Fixed

- Initial sync retries after an incomplete attempt and restarts correctly
  after a quick disconnect/reconnect. An old session cannot mark a new one
  ready.
- Refused or timed-out catalog refreshes preserve the previously committed
  catalog instead of clearing it before a successful response.
- Saved state preserves activity quick-access display order, keeping the
  corresponding snapshot revision stable across export/import.
- Missing key-sort replies for supported network devices no longer leave
  them permanently incomplete and uneditable. This includes Sonos on X1.
- Cancelling a whole-hub refresh waits for the current entity read to finish
  before releasing the operation.
- Reorders fetch missing catalogs and refuse unknown device record types.
  Command creation reads an incomplete command table before allocating an
  ID, preventing accidental reuse of occupied slots after a cold start.
- Replacing restore validates the bundle before erasing. This catches
  invalid input before destructive work, but cannot guarantee hub acceptance
  or prevent a later failure. `RestoreResult` correctly carries restored
  counts, per-entity records and engine failure information. Partial restores
  are not rolled back; retrying an additive restore can create duplicates.
- X1 callback-device renames preserve the deployed address; the X1 still
  requires callback port 8060. Bulk writes coalesce remote-sync requests.
- Shared-listener shutdown takes effect promptly, and warnings for
  unrecognized hub connections are rate-limited.
- Transport monitoring handles high file-descriptor numbers instead of
  silently stalling ([#279](https://github.com/m3tac0de/home-assistant-sofabaton-x1s/issues/279)).
  The X2 external activity-state path preserves a queued acknowledgement
  refresh, avoiding unnecessary command delays
  ([#282](https://github.com/m3tac0de/home-assistant-sofabaton-x1s/issues/282)).
  Shutdown avoids closing sockets while the bridge is registering them
  ([#283](https://github.com/m3tac0de/home-assistant-sofabaton-x1s/issues/283)).
  External activity-state ingestion remains an engine-level integration
  hook; it is not a named `AsyncXProxy` method.

### Removed

- The old facade delegates listed in the migration table above. The engine
  still has those operations, but direct `.sync` access is internal.
- The CLI `addir` command and `add_ir_command.py` example. Use `IrPayload`
  with `edits.add_command()` and `sync_device()` to save an IR command.
  `testir` remains available for one-time playback.

### Packaging

- The source distribution includes this changelog, and package metadata
  links to it. Removed an obsolete source-distribution entry for an internal
  document that was not packaged.

## Earlier releases

Published versions are listed in the
[PyPI release history](https://pypi.org/project/sofabaton-x/#history).
Their source is identified by repository tags named `sofabaton-x-vX.Y.Z`.
