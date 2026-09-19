# Integrating an automation platform with sofabaton-x-server

> Written for sofabaton-x-server 0.2.0 (`api 1`). Before 1.0 a minor
> release may still change the surface; the release notes say when.

For authors of a Homey app, a Hubitat driver, an openHAB binding, or any
other client. The server fronts one or more Sofabaton X1 / X1S / X2 hubs
on the user's LAN and exposes them over HTTP and one WebSocket. Generate
your client from [`../openapi.json`](../openapi.json); this page covers what
the document cannot say.

For a first implementation, begin with
[your first integration](getting-started.md). Let users set up hubs in the
server's control panel, then select those registered hubs in your platform.
You can deliver activity switches, command actions and remote-button
automations without implementing hub registration or a configuration editor.

For that scope, read [hub selection](#2-find-hubs),
[control and errors](#4-read-and-control), [events](#5-events),
[pairing](#6-pair-a-hub) and [button events](#10-button-events).
Sections 7–9 cover optional editing features. Link users to
`<server base URL>/ui/` for management and to the
[web remote](#11-give-users-a-remote) for a ready-made control UI.

## 1. Find the server

Accepting a server base URL is enough for a first integration. For optional
automatic discovery, the server advertises `_sofabaton-x._tcp.local.` over
mDNS. TXT fields:

| key | meaning |
| --- | --- |
| `version` | server version |
| `api` | API version (`1`); bump means generated clients must be re-checked |
| `path` | API prefix (`/api/v1`) |
| `hubs` | number of configured hubs |
| `base_url` | present when `--advertise-url` is set; the server base URL clients should use |

Use `base_url` when present, otherwise `http://<SRV host>:<SRV port>`,
as the **server base URL**. Append TXT `path` (currently `/api/v1`) for
the **API root**. Trim a trailing slash; preserve any reverse-proxy prefix.

| deployment | server base URL | API root |
| --- | --- | --- |
| direct | `http://192.168.1.10:8480` | `http://192.168.1.10:8480/api/v1` |
| reverse proxy | `https://home.example/sofabaton` | `https://home.example/sofabaton/api/v1` |

Paths beginning `/hubs`, `/server` or `/events` below are relative to the
API root; paths beginning `/api/v1` already include that prefix. `{id}`
and `{hub_id}` both mean the registered hub ID. Ellipses abbreviate the
preceding hub/entity path and must be expanded before making a request.
OpenAPI operation paths already include `/api/v1`, so configure generated clients
with the server base URL instead. A WebSocket uses the API root plus
`/events`, changing `http` to `ws` or `https` to `wss`. Always offer a
manual server URL as well; some networks block multicast.

`GET /api/v1/server` returns server/API versions, `instance_id`, features
and runtime settings. Check `api_version` before using the contract.

There is **no authentication** in v1. The server is a LAN service; the
operator is told not to expose it beyond the LAN.

## 2. Find hubs

**Use `GET /api/v1/hubs` to list registered hubs.** Offer those to the user,
including their enabled/available state. If none are registered, link to
the control panel's Hubs view and offer to reload the list after setup.
Listing physical discoveries is not the same as listing registered hubs.

**Before physical hub discovery or registration, tell the user to fully close
the official Sofabaton app.** A hub connected directly to the app stops
advertising and cannot be discovered by the server or your own mDNS stack.
Keep the app closed until the server has connected and completed setup,
including when entering an IP manually. If a scan finds nothing, make
closing the app the first troubleshooting step. `present` describes an
advertisement, not hub availability; use registered hub status for that.

If your platform also offers hub setup, choose one of these intake paths:

1. **Ask the server.** `GET /api/v1/discovery/hubs` is the live table of
   hubs the server has seen (`present` says whether the advertisement is
   current; `registered_hub_id` links to a configured hub). `POST
   /api/v1/discovery/scan` with `{"timeout": 5}` listens for that long
   first, for a synchronous answer.
2. **Your own mDNS.** Hubs advertise `_x1hub._udp.local.` (X1, X1S) and
   `_sofabaton_hub._udp.local.` (X2). Pass what you saw to `POST
   /api/v1/hubs`: `host`, plus `mac`, `name`, `txt` and `hub_version`
   when you have them. **Skip advertisements whose TXT carries
   `HA_PROXY=1`**: those are proxies (this server's or Home Assistant's)
   that mimic hubs on purpose. If you send one anyway the server refuses
   it with 409 and, when it knows, the id of the hub it fronts.
3. **Manual.** `POST /api/v1/hubs` with `{"host": "192.168.1.50"}`. Host
   is the only required field; the server confirms the model from the
   hub itself.

## 3. Register and identify

Registration belongs to the server and can be done in its panel. A client
that offers registration itself uses `POST /api/v1/hubs`, which returns
the record. If no MAC was supplied, `hub_id` starts as the host string;
after the first connection confirms the MAC it becomes lower-case hex
with no separators. Watch for `hub_rekeyed` on the event stream, or re-read
`GET /api/v1/hubs` after `status.catalog_ready` turns true. Store the
MAC form. Do not register a second hub just to select it in your platform.

`enabled` is the user's switch: `POST /api/v1/hubs/{id}/disable` keeps
the record but disconnects, so the official Sofabaton app can talk to
the hub directly again; `/enable` reconnects. Catalog reads and control on a
disabled hub answer 409 `hub_disabled`. The status endpoint remains readable:
its body contains `hub_id`, `enabled` and `status` (null when no proxy runs).
Disable/remove are refused with
409 `hub_job_running` while a job owns the hub; wait for it, or request
cancellation if its `cancellable` flag is true.

## 4. Read and control

Everything is keyed on `(entity_id, command_id)`: activities have ids
from 101 through 255, devices from 1 through 100. Browse to get the ids,
then send. Control calls return an acceptance response immediately;
configuration edits use jobs (section 7).

| what | call |
| --- | --- |
| status (mode, running activity, `catalog_ready`) | `GET /hubs/{id}/status` |
| identity (model, name, MAC, firmware) | `GET /hubs/{id}/info` |
| activities / devices | `GET /hubs/{id}/activities`, `GET /hubs/{id}/devices` (`?refresh=true` re-reads that list; devices include power state) |
| a device's commands | `GET /hubs/{id}/devices/{dev}/commands` |
| buttons bound on an entity | `GET /hubs/{id}/entities/{ent}/buttons` |
| an activity's macros / favorites | `GET /hubs/{id}/activities/{act}/macros`, `.../favorites` |
| running activity | `GET /hubs/{id}/activity` (null when idle) |
| switch activity | `POST /hubs/{id}/activities/{act}/start`, `.../stop` |
| send a command | `POST /hubs/{id}/send` `{entity_id, command_id}` |
| beep the remote | `POST /hubs/{id}/find-remote` |

`mode` explains refusals: `control` (the server owns the hub),
`observe` (the official app is attached through the proxy; reads work
from cache, sends are refused with 409 `send_refused`), `disconnected`.

Errors are `Problem` bodies (`type`, `title`, `status`, `detail`,
`hub_id`, `mode`):

| status | type | what to do |
| --- | --- | --- |
| 404 | `hub_not_found`, `device_not_found`, `activity_not_found`, `entity_not_found` | fix the id |
| 409 | `hub_disabled` | show unavailable; let the user enable it in the panel |
| 409 | `hub_busy`, `send_refused` | read status and report the reason; the app may hold control or the mode may have changed |
| 503 | `hub_not_connected` | the hub is offline or reconnecting; retry with backoff |
| 503 | `hub_start_failed` | the hub's proxy could not start (a port in use); the record is kept, retry `/enable` after fixing the host |
| 504 | `hub_timeout` | a read timed out; retry with backoff; for an uncertain write, inspect jobs and hub state first |
| 422 | `validation_error`, `invalid_hub_config` | fix the request (`detail` names the field) |
| 409 | `entity_not_editable` | refresh the target entity before editing |
| 409 | `hub_job_running` | wait for the active job to finish |
| 409 | `job_not_cancellable` | the operation cannot be cancelled or has already finished; read its status |
| 409 | `ir_learn_failed` | inspect the reason; retry capture with the hub idle when appropriate |
| 412 | `snapshot_outdated` | get a new snapshot and reapply the user's intended edit |
| 428 | `if_match_required` | send the quoted snapshot revision in `If-Match` |
| 422 | `invalid_request`, `invalid_payload`, `out_of_scope` | fix the input; inspect `detail` for the rejected edit or payload |
| 502 | `hub_rejected` | a write was refused or not acknowledged; inspect state before retrying |
| 409 / 502 | `sync_failed`, `restore_failed` | inspect the failed job's `error` and partial `result`; reconcile before another write |
| 404 | `job_not_found` | the job is unknown, expired, or lost across restart; inspect the snapshot |

Once a request returns `202`, operation failures are reported in the job,
not as a later HTTP error from the original request. Polling a failed job
still returns HTTP 200: its `status` is `failed` and `error.status` carries
the mapped failure code. Neither an HTTP timeout nor a missing job proves
that the hub was unchanged. Never blindly retry creates or restores.

A filter passed as `?hub_id=<host>` on the event stream follows the hub
when it is re-keyed to its MAC, so a client that subscribed right after
registering by host sees `hub_rekeyed` and everything after it.

## 5. Events

One WebSocket at the URL derived in section 1, for example
`ws://192.168.1.10:8480/api/v1/events` (`?hub_id=` to narrow, repeatable).
Messages are JSON with a `type`:

- `hello` (once): server version, API version, `instance_id`, the hub list.
- `hub_event`: `hub_id` and `event` (`seq`, `kind`, `payload`). Kinds:
  `activity_changed` (payload `activity_id`, `previous_activity_id`,
  `name`; `activity_id` null means powered off), `activity_list_updated`
  (re-read activities), `hub_state` / `app_state` (`connected`),
  `status_changed` (`mode`, `previous_mode`), `catalog_ready` (`ready`),
  `snapshot_changed` (`snapshot_id`, `engine_generation`, affected ids;
  re-read the snapshot), and `ota` (the hub goes silent for a few
  minutes). `app_state` with `connected: false` means a vendor-app
  session through the proxy just ended and is a good moment to offer a
  refresh.
- `server_event`: `hub_id` and `kind`: `hub_added`, `hub_removed`,
  `hub_enabled`, `hub_disabled`, `hub_rekeyed`, `hub_discovered`,
  `hub_lost`, `callback_device_stale`, `callback_device_restored`,
  `callback_listener_started`, `callback_listener_failed`.
- `job_event`: `hub_id` and the full `job` record on queueing, starting,
  progress updates and completion (`done`, `failed` or `cancelled`).
- `press`: a button press the hub delivered to the server's callback
  listener (section 10): `seq`, `hub_id`, `device_id`, `command_id`,
  `slot`, `label`, `press_type` (`short` / `long`), `resolution`,
  `transport`, `source`, `received_at`.
- `dropped`: `count` older messages were discarded because your client
  fell behind; re-read hub records, status, relevant snapshots and jobs.

`hub_event.event.seq` belongs to the library proxy and restarts when a
new proxy is created (enable or server restart), not on an ordinary hub
transport reconnect. `press.seq` is a separate server-instance-wide
counter shared with press history; track `(instance_id, seq)` for presses.
Job events have no library sequence number.

Reconnect with backoff on close. After reconnecting, a `dropped` message
or a hub-event sequence gap, reconcile hub records, status and the catalogs
your integration uses. Reconcile snapshots and outstanding jobs only if
your client uses those features. Changes in the panel are external changes
to your client: handle removal/disable as unavailability, and reload on
enable or rekey. Do not re-register or re-enable a hub automatically.
Hub/job events have no replay; presses have the bounded history described
in section 10. Message schemas are OpenAPI components
`WsHello`, `WsHubEvent`, `WsServerEvent`, `WsJobEvent`, `WsPress` and
`WsDropped`.

## 6. Pair a hub

1. Ask for the server base URL; optionally discover it over mDNS.
2. Check `GET /api/v1/server`, then offer registered hubs from
   `GET /api/v1/hubs`. Link to `/ui/` for adding or managing them.
3. Save the selected MAC hub IDs. Subscribe to `/events`, then read status
   and the catalogs you expose. Reconcile events that arrive during those
   reads so an older response does not overwrite newer state.
4. Expose platform actions and automation triggers. Offer links to
   management and `/ui/remote/?hub=<id>` for the full remote.

Unpairing from your platform should remove its local selection/entities;
leave the server registration and shared callback device in place. Other
clients may still use them. A registration wizard, enable/disable controls
or callback editor can be added later if your platform benefits from them.


## 7. Snapshots and jobs

`GET /hubs/{id}/snapshot` is the hub's configuration as one document,
projected from the library's cache with no hub traffic. Keep two values:

- `snapshot_id` in the body is the configuration revision. Send it quoted
  as `If-Match` when editing, for example `If-Match: "<snapshot_id>"`.
- HTTP `ETag` is an opaque response validator that also covers provenance
  (`fetched_at`, `complete`, `editable`), so a conditional read returns
  200 when only provenance changed. Send it back unchanged as
  `If-None-Match` for conditional reads. Do not substitute it for the edit
  revision or assume that both values are equal. The ETag is currently
  accepted for compatibility, but `snapshot_id` is the documented edit token.

Provenance can change without a new configuration revision. The server
never claims the cache is current: the hub can be edited outside it at any
time without notice, so `fetched_at` is the age of each entity's copy and
the decision to refresh is the user's. A 304 means the cached
representation is what the server holds, not that the hub agrees. Entities
that were never read in full carry `editable: false`; ask for a read
with `POST /hubs/{id}/snapshot/refresh` (`{"device_id": 5}` or
`{"activity_id": 101}`; an empty body reads the whole hub, which takes
tens of seconds to minutes and should be a user action). Initial catalogs
are read automatically. Persistence preserves previously fetched detail;
it does not make incomplete detail complete after a restart.

A refresh answers `202` with a job. Follow it on `/events` (`job_event`
messages carry the full job record: `status`, the last `progress`, the
`result` or a `Problem` in `error`) or poll `GET /hubs/{id}/jobs/{job_id}`.
One job runs per hub at a time. Inspect `cancellable` before requesting
`DELETE /hubs/{id}/jobs/{job_id}`: whole-hub refresh and IR learn are
cancellable, as are document writes (`sync_hub` / `resume_apply`) between
items. The current entity/item is drained before cancellation completes.
Single-entity refreshes, row edits, intents, callback writes, backup,
restore and erase run to completion. Wait for terminal status before
another job. The [server operation table](../README.md#jobs) is the
cancellation reference.

Only recent jobs are retained, in memory. Persist the hub id and any
outstanding job id in your client, but reconcile after server restart.
Cached reads can continue while a job runs; reads needing hub traffic may
wait or fail. In particular, other traffic can interrupt an IR capture.


## 8. Complete edit workflow

If your platform offers configuration editing, use the intent routes for
common changes: `POST /hubs/{id}/activities/{aid}/rename`,
`PUT /hubs/{id}/activities/{aid}/buttons/VOL_UP` with `{"device_id": 7,
"command_id": 3}` (add `"long_press": {...}` for the held press),
`DELETE` on the same path to clear, `POST .../favorites`, `PUT
.../favorites/order`, `POST /hubs/{id}/devices/{did}/rename`, and the
whole-entity ones (`POST /hubs/{id}/devices`, `DELETE /hubs/{id}/devices/{did}`, `POST
/hubs/{id}/activities`, `DELETE /hubs/{id}/activities/{aid}`, `PUT /hubs/{id}/devices/order`, `PUT
/hubs/{id}/activities/order`, `PUT /hubs/{id}/name`). Every write answers `202` with a job; follow it as described
above. Send the quoted `snapshot_id` as `If-Match` when your UI showed the
user a snapshot; the server refuses with `412` if it moved.

An editor that shows the whole configuration works on the document
instead: read `GET /hubs/{id}/snapshot`, change one activity or device element,
preview with `POST /hubs/{id}/activities/{aid}/plan`, then `PUT` the
element back with `If-Match` (required here). Only the entity you name
may differ from the snapshot; anything else is `422 out_of_scope`.

An activity edit can reach into a device: choosing the input a device
switches to when the activity starts adds an entry to that device's
`input_record`. Send those device elements in an optional `devices`
list inside the activity body (`{...activity, "devices": [device, ...]}`).
The server applies them with the activity in one job. Only a device's
input record, idle behaviour and command names may differ; any other
device change is `422 out_of_scope`.

The cache revision check and the hub check serve different purposes.
Sync-based edits compare device bindings/macros and activity
bindings/macros/favorites, with normalization exceptions; they do not
compare every name, payload or device-head field. A detected difference
fails with `sync_failed` at `stale_check`. Server row edits use non-strict
preflight: an unreadable/incomplete read can allow the write to proceed.
Whole-document sync requires complete live reads, but uses the same
limited table comparisons. See [write validation](../README.md#writes).
Whole-entity intents use their own validation, not this same baseline comparison.
An edit also needs `editable: true`; refresh the entity if necessary.

For example, renaming activity 101 on a registered hub follows these calls
(all paths here are complete, before any reverse-proxy prefix):

| step | request | response/action |
| --- | --- | --- |
| ready | `GET /api/v1/hubs/{hub_id}/status` | check `enabled`; wait for `status.catalog_ready` and `status.controllable` |
| fetch detail | `POST /api/v1/hubs/{hub_id}/snapshot/refresh` with `{"activity_id":101}` | `202` with `job_id`; poll to `done` |
| baseline | `GET /api/v1/hubs/{hub_id}/snapshot` | save `snapshot_id`; copy the activity 101 element |
| edit | change the copy's `device.name` to `Movie night` | preserve its other fields |
| preview | `POST /api/v1/hubs/{hub_id}/activities/101/plan` with that element | plan with `step_count` and `steps` |
| apply | `PUT /api/v1/hubs/{hub_id}/activities/101` with the same element and quoted revision in `If-Match` | `202`; follow the returned job |
| reconcile | `GET /api/v1/hubs/{hub_id}/snapshot` after completion | adopt the hub's resulting state |

A `202` response includes a job record, for example these identifying
fields (timestamps and other fields omitted here):

```json
{"job_id":"abc123","hub_id":"e26a44861b45","kind":"sync_activity","status":"queued","cancellable":false}
```

`GET /api/v1/hubs/e26a44861b45/jobs/abc123` returns that job's current
record. A successful sync finishes with `status: "done"` and a `result`
containing `status: "success"`, `completed_steps` and `snapshot_id`. A
failure finishes with `status: "failed"`; `error` explains it and `result`
may retain partial completion information. A cancelled job has
`status: "cancelled"`. Handle all three terminal states.

The runnable [REST example](../examples/edit_activity.py) performs this
workflow using only Python's standard library, including readiness and job
polling. It previews by default; `--apply` submits the change:

```sh
python sofabaton-x-server/examples/edit_activity.py --server http://localhost:8480 --hub-id e26a44861b45 --activity 101 --name "Movie night"
python sofabaton-x-server/examples/edit_activity.py --server http://localhost:8480 --hub-id e26a44861b45 --activity 101 --name "Movie night" --apply
```

On `snapshot_outdated` or a sync's `stale_check` failure, refresh the target,
obtain a new snapshot and reapply the intended change. Do not resend the old
edited document with a new revision: that could overwrite changes made
elsewhere. On a failure after writing starts, inspect the partial result
and current snapshot before constructing another edit.


### Editing the whole document

When one user action changes several entities (a new device, the
activities that use it, an old device removed, a reorder), send the
whole edited document instead of a sequence of jobs and let the server
own the transition:

| step | request | response/action |
| --- | --- | --- |
| baseline | `GET /api/v1/hubs/{hub_id}/snapshot` | save `snapshot_id`; edit a copy of the document |
| new entities | give each a negative `device.device_id` (`-1`, `-2`, ...) and reference it by that id everywhere | the hub assigns the real ids |
| preview | `POST /api/v1/hubs/{hub_id}/snapshot/plan` with the document | ordered `items`, `notes` to confirm, `live_check_count` re-reads |
| apply | `PUT /api/v1/hubs/{hub_id}/snapshot` with the document, `If-Match` and an `Idempotency-Key` | `202`; follow the `sync_hub` job |
| result | the finished job's `result` | `status`, per-item outcomes, `id_map`, `apply_id` |
| stopped | job `failed` with `apply_stopped`, or `cancelled` | inspect the apply record and hub; follow the recovery limits below before deciding whether to resume |

Rules the server enforces before any hub traffic: a removed entity must
be removed from every activity in the same document (`422
dangling_reference`), every edited entity must be `editable` (`409
entity_not_editable`), a device deletion needs every activity read in
full (`409 snapshot_incomplete`), and each entity's change must be one
the live editor supports (`422 out_of_scope`). Array order is display
order. New command rows use stored-record `restore_data`, which is
**different from a REST command-create request**.

For `POST /hubs/{id}/devices/{did}/commands`, the request is:

```json
{"name": "Power", "payload": {"descriptor": "P:NEC1 D:4 S:5 F:21"}}
```

Inside an edited document's `commands` array, an equivalent new IR row is:

```json
{
  "command_id": 1,
  "name": "Power",
  "restore_data": {
    "transport": "hub_code_record",
    "library_type": 13,
    "button_code": 0,
    "data_hex": "0013000011009470503a4e45433120443a3420533a3520463a323100000000",
    "new": true,
    "decoded": {
      "class": "ir",
      "fields": {"descriptor": "P:NEC1 D:4 S:5 F:21"}
    }
  }
}
```

The library constructs this row with:

```python
from sofabaton import IrPayload

row = IrPayload.from_descriptor("P:NEC1 D:4 S:5 F:21").to_command_row(1, "Power")
```

Choose a free command ID in the target device; `restore_data.new: true`
marks a command addition. Do not place `{descriptor: ...}` directly in
`restore_data`. Preview currently checks structure and supported diffs,
not every wire payload: an incorrectly encoded payload can pass preview
and fail during execution. Preserve stored metadata when editing existing
rows, or construct payloads through the library's conversion helpers.

The run stops at the first item that does not end `done`; earlier items
may have landed and nothing is rolled back. Read
`GET /hubs/{id}/applies/{apply_id}` for each item's status and ID mapping.
Cancellation finishes the item in flight and normally leaves a cancelled
apply record.

**Do not automatically resume an uncertain create or a record interrupted
by a process exit.** Creates can duplicate on resume, the saved checkpoint
can omit an in-flight write, and records left `queued`/`running` after a
restart are not accepted by the resume route. The original idempotent PUT
can also fail `412` before its key is recognized. Preserve the record and
reconcile hub state before another edit. The
[recovery and retention reference](../README.md#recovery-and-retention)
explains eligible resume states, idempotency boundaries and pruning of
stopped/cancelled records.

Use job completion to determine success: an unchanged document can finish
without a remote-sync trigger or `snapshot_changed` event.

## 9. IR codes, backup and restore

A code in any format your platform has (`{"pronto": "..."}`,
`{"descriptor": "P:NEC1 D:4 S:5 F:21"}`, `{"timings_us": [...],
"carrier_hz": 38000}`, or the hub's own `{"hex": "..."}`) can be fired
once with `POST /hubs/{id}/play`, saved as a new command with `POST
/hubs/{id}/devices/{did}/commands` (`{"name": ..., "payload": {...}}`),
or written over an existing command with `PUT .../commands/{cid}/payload`.
`GET .../commands/{cid}/payload` reads what the hub holds for a command
of any device class; `kind` is `raw` or `descriptive` for IR, `network` for
a decoded wifi request and `record` for any other body (a Bluetooth key, a
`wifi_mqtt` record), and `decoded` carries the structured fields where the
class has them. `POST
/hubs/{id}/learn` arms the hub's receiver and returns the captured code
as the job result; cancel the job to stop waiting.

`POST /hubs/{id}/play` returns an immediate acceptance response; it is not
a configuration job. Keep the hub idle while learning, since other hub
traffic can interrupt capture.

`POST /hubs/{id}/backup` returns a full bundle in the completed job's
`result.bundle`; keep that whole document as a file. A structural snapshot
or a backup with `include_blobs: false` cannot be restored. `POST
/hubs/{id}/restore` with `{"bundle": ..., "replace": true}` validates
the bundle and its references, erases, then rebuilds the configuration.
With `replace` false or omitted, restore creates additional entities with
new ids. `POST /hubs/{id}/erase` wipes the hub.

Replacing restore and erase affect the whole hub; delete endpoints and
payload replacement can also remove data. Explain the affected scope in
your client before the user commits the operation. Restore has no rollback:
inspect `failed_at`, restored counts, `device_id_map` and the
snapshot before recovery. Never automatically retry an additive restore.

## 10. Button events

For an integration that consumes an existing setup, read
`GET /hubs/{id}/callback-device`, handle `press` messages and map the stable
hub/device/command IDs to platform actions. Labels are display text. Missing
or stale callback configuration should lead users to setup or repair, not
trigger automatic deployment on every connection. Activity-state events
work without a callback device.

The panel's API view can run the routes below, but 0.2.0 has no dedicated
callback or binding editor. The [starter setup command](getting-started.md#3-receive-your-first-remote-press)
handles a first slot; deployed commands can also be assigned in the official
app. If you choose to manage callbacks in your client:

1. `POST /api/v1/hubs/{id}/callback-device` with the slot labels your
   users will see (up to ten; every slot is written, unnamed ones as
   `Button n`). The job result is the record: `device_id` and `labels`
   (command ids `1..10` short, `11..20` long).
2. Let the user bind those commands with the generic edit routes, or do
   it for them: a hard button in an activity, a favorite, activity
   membership. Nothing else is needed; the hub calls the server when the
   user presses. Close the official app before server-side writes.
3. Handle `press` messages on `/events`: `device_id` and `command_id`
   identify the slot, `label` is what you named it, `press_type` tells
   short from long. Ignore `resolution` values other than `deployed` if
   you only want presses that match what you deployed.
4. Choose whether to replay missed presses or skip them to avoid delayed
   actions. Keep `(instance_id, seq)` of the last press you handled. On
   reconnect, or after a `dropped` message, `GET
   /api/v1/hubs/{id}/presses?after=<seq>` returns what you missed, oldest
   first; `expired: true` means the ring no longer reaches back that far.
   A different `instance_id` (in `hello` and `GET /api/v1/server`) means
   the server restarted: the sequence started over and there is no
   history from the previous instance. Track a cursor per hub: `seq` is
   global, but history is per hub. When replaying, subscribe first, buffer
   live presses while fetching history, merge by sequence and de-duplicate
   before dispatching. An expired history means accepting a gap; it is not
   a durable event log.
5. Update with `PUT /hubs/{id}/callback-device` and a **complete desired
   spec**, copied from the current GET response. Omitted slots become
   defaults and omitted power/input hooks are cleared. Generic bindings
   survive because device and command IDs stay. A failed job with
   `callback_update_declined` means the device was edited outside the
   server (or the planner refused the diff); show the detail and reconcile
   the device before another write. Removing and redeploying can change IDs
   and require rebinding. `stale: true` on the record (and the
   `callback_device_stale` server event) means the hub lost the device;
   offer `POST /hubs/{id}/callback-device/redeploy`.

For example, after fetching `GET /hubs/{id}/callback-device` into `record`,
build the PUT body without dropping hooks or the remaining slots:

```python
import copy

fields = ("name", "slots", "power_on_slot", "power_off_slot", "input_slots")
body = {key: copy.deepcopy(record["spec"][key]) for key in fields}
body["slots"][0]["label"] = "Start"
body["slots"][0]["long_label"] = "Start Long"
# PUT body to /api/v1/hubs/{hub_id}/callback-device; follow the returned job.
```

Hook slots and resolved `press.slot` values are **1..10**; callback path
indexes are **0..9**. Short command IDs are `1..10`, long IDs `11..20`.

Inside a container on a bridge network the hubs cannot reach the
server's own address; the operator sets `--callback-host` to the Docker
host's LAN address and publishes the callback port. These settings alone
do not solve discovery or hub dial-back: see the [Linux deployment recipe](../README.md#docker).
Show `target` (the destination already deployed) and
`effective_destination` (what a new deploy would use now) from the record
when a deploy produces no presses, and the listener state from `GET /api/v1/server` when
`callback_listener.bound` is false (the port is usually taken by a Home
Assistant install or Emulated Roku on the same host).

## 11. Give users a remote

You do not have to build a remote control UI. The server serves the
Sofabaton remote card as a page at `<server base URL>/ui/remote/?hub=<hub id>`
(see the README's "Web remote" section): activity switching, every hard
key the hub maps for the running activity, macros, favourites, and
device mode with each device's command list, kept current from the
server's own event stream. It is the same card the Home Assistant
integration ships, so the two look and behave alike.

How to hand it to your users depends on what your platform can show:

| platform can | do this |
| --- | --- |
| frame a URL in a dashboard (Hubitat dashboards, openHAB MainUI webview, Node-RED dashboards, Home Assistant's iframe card) | frame `/ui/remote/?hub=<hub id>`; add `zoom=` for a wall panel |
| open a URL (Homey, SmartThings, a phone) | link to the page; it carries a web manifest, so "Add to Home Screen" gives an app-like window |
| neither | let users open it in a browser on the LAN; the id is `hub_id` from `GET /hubs` |

Two things to know before you link it:

- **No authentication.** The page has the same reach as the API. Tell
  users to keep the server on the LAN or behind an authenticating
  reverse proxy, never port-forwarded.
- **Layout is per hub, stored on the server.** `GET/PUT/DELETE
  /hubs/{id}/ui/remote-card` holds the card's configuration document
  (which key groups show, their order, device mode, shortcuts, custom
  favourites, hold-to-repeat, key style); absent means the card's
  defaults. Link to the control panel's Remote view (`/ui/`) to edit it.
  Implement those document routes only if you want an additional layout
  editor inside your platform.

The page is not part of the API contract; only the document routes are.
