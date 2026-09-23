# Server API reference

Reference for HTTP/WebSocket clients. Start with
[your first integration](first-integration.md) for a working client, or
[Getting started](getting-started.md) to use the management application.
The API generation is **1**; see the [changelog](../CHANGELOG.md) for release changes.

[API](#api) · [Snapshot](#snapshot) · [Jobs](#jobs) · [Writes](#writes) ·
[Whole-document writes](#whole-document-writes) · [Recovery](#recovery-and-retention) ·
[IR and backups](#ir-payloads-backup-restore) · [Button events](#button-events) ·
[Wifi Commands](#wifi-commands) · [Discovery](#discovery) · [Events](#events-websocket)

## API

For a minimal client, use hub selection, status, control and events as
described in the [starter guide](https://github.com/m3tac0de/home-assistant-sofabaton-x1s/blob/main/sofabaton-x-server/docs/first-integration.md).
The sections below are a reference for optional features as well as the
core API; implementing the full surface is not required.

`GET /api/v1/server` identifies the server. The OpenAPI document is at
`/api/v1/openapi.json` (interactive docs at `/api/v1/docs`). Every
operation has a stable `operationId`, and public models are named
components. Job results and editable entity tables contain open objects;
clients must interpret them according to the operation. Errors are one shape,
`Problem` (`type`, `title`, `status`, `detail`, `hub_id`, `mode`).

Paths beginning `/hubs`, `/server` or `/events` below are relative to
`/api/v1`. `{id}` and `{hub_id}` both mean the registered hub ID, not a
device or activity ID. An ellipsis (`...`) abbreviates the preceding
hub/entity path; it is not an executable URL.
For an executable refresh/preview/apply workflow, see
[the integration guide](https://github.com/m3tac0de/home-assistant-sofabaton-x1s/blob/main/sofabaton-x-server/docs/platform-integration.md#8-complete-edit-workflow).

Catalog reads (`.../activities`, `.../devices`, `.../devices/{did}/commands`,
`.../entities/{eid}/buttons`, `.../activities/{aid}/macros` and `/favorites`)
serve cached data when available and fetch missing detail when needed;
an uncached read therefore requires control mode. `.../activities` and
`.../devices` list in the hub's display order (what `PUT .../order` writes,
as the remote and the app show it), each row carrying that position as
`sort` (`0` when the record has none). `GET .../devices?refresh=true`
re-reads the device list. `GET .../devices/{did}/power-state` is the one
read that always goes to the hub: it re-reads the list and returns that
device's power byte (`0` / `1`, `null` when the row has no parseable
record, `504` when the hub never answers), which is what a remote UI needs
before it fires a power toggle. `Button` rows carry the hub's long-press
pair (`long_press_device_id` / `long_press_command_id`, both `null` when
the button has none); send the pair like any other command.

## Web remote configuration

The server stores a per-hub JSON document for the web remote's layout:

```text
GET    /hubs/{id}/ui/remote-card        the document (null until one is stored)
PUT    /hubs/{id}/ui/remote-card        {"document": {...}} replaces it (64 KB max)
DELETE /hubs/{id}/ui/remote-card        back to the card's defaults
```

The document holds the same keys as the Home Assistant card's YAML,
minus `entity`, `theme` and Home Assistant actions (custom favourites
that call a Home Assistant action are dropped; those that name a hub
command stay). See the [web remote guide](web-remote.md) for the visual
editor and URL parameters. The UI pages and their assets are outside the
API contract; the configuration document routes are in OpenAPI.
The control panel lives at `/ui/`; `/` and legacy `/harness` redirect there.

## Snapshot

`GET /api/v1/hubs/{id}/snapshot` is the hub's structural configuration
(devices, activities, commands, bindings, macros, favorites; no IR
payloads) projected from the library's cache with **no hub traffic**.
`snapshot_id` identifies the configuration content and is stable when that
content survives a restart. Send this revision, quoted, as `If-Match` when
editing. The response's HTTP `ETag` is an opaque cache validator: retain it
verbatim for `If-None-Match`, which returns 304 only when the whole
representation is unchanged. Do not assume the ETag and configuration
revision are equal; provenance (`fetched_at`, `complete`, `editable`)
changes the ETag without changing the configuration revision, so a poll
that gets 200 with the same `snapshot_id` is a provenance change.
Every entity carries `complete`,
`editable` and `fetched_at`. These describe the server's copy, not the
hub: the hub can be edited outside this server at any time (the vendor
app, another client) and does not say so, so the server gives no
freshness verdict. Show `fetched_at` and offer a refresh; the
`app_state` event with `connected: false` (a vendor-app session through
the proxy just ended) is one good moment for that offer.

The library reads initial catalogs automatically when the hub connects.
`POST /hubs/{id}/snapshot/refresh` with
`{"device_id": 5}` or `{"activity_id": 101}` re-reads one entity; an
empty body re-reads the whole hub, which can take tens of seconds to
minutes depending on its configuration. Treat it as a user action.
Detailed refreshes are explicit; backups and write reconciliation also
read hub data. The server saves the library's state document on
`snapshot_changed` and when stopping a hub, and imports it before starting
the hub. This preserves previously fetched detail and its completeness
flags. A partial cache remains partial; absent or unreadable state starts
cold. Check `editable` before editing rather than assuming a restart made
the snapshot complete.

| Document | Use |
| --- | --- |
| Snapshot | Cached structural configuration; edit a copy and sync. It is not restorable. |
| Full backup bundle | Configuration plus command payloads; retain the whole bundle for restore. |
| State document | Opaque library cache persisted by the server; do not edit or submit it to restore. |
| Job | In-memory progress and outcome of one operation; lost on restart. |
| Apply record | Persistent documents, item outcomes and ID mappings for a document write; recovery and retention limits apply below. |

## Jobs

Anything that holds the hub for more than a moment answers `202` with a
job record: structural refresh, configuration writes, learn, backup,
restore and erase. Follow
it on the event stream (`job_event` messages carry the full record:
`status`, the last `progress`, the `result` or a `Problem` in `error`)
or poll `GET /hubs/{id}/jobs/{job_id}`; `GET /hubs/{id}/jobs` lists
recent ones, and every hub view (`GET /hubs`, `GET /hubs/{id}`) carries
`active_job` (queued or running now) and `last_job` (the newest finished
one, whatever its outcome), so one list call tells a client what each
hub is doing. One exception to "the full record": a backup's `bundle`
runs to megabytes, so only `GET /hubs/{id}/jobs/{job_id}` and the
download route carry it; the stream, the job list and the hub views show
the rest of that result (see [IR payloads, backup, restore](#ir-payloads-backup-restore)).
A finished backup job is announced again on the stream when its bundle is
downloaded, dropped or expires. One job runs per hub at a time (`409 hub_job_running`). Reads
are not rejected merely because a job runs, but a read that needs hub
traffic can wait or fail; keep the hub idle during IR learning.
Check the job's `cancellable` field before requesting cancellation with
`DELETE /hubs/{id}/jobs/{job_id}`:

| Operation | Cancellable | Stopping point |
| --- | --- | --- |
| Whole-hub refresh | yes | after the entity in flight |
| Single-entity refresh | no | runs to completion |
| IR learn | yes | ends the capture wait |
| Whole-document `sync_hub` / `resume_apply` | yes | after draining the item in flight |
| Row edits, intents, callback writes, backup, restore, erase | no | runs to completion |

Cancellation can remain pending while the current entity/item finishes.
Repeating the request while cancellation is pending changes nothing. Wait
for terminal status before another operation; disable/remove is refused
while a job holds the hub. A graceful stop requests cancellation of
cancellable work and waits for non-cancellable writes, with a bounded drain
timeout. It does not guarantee completion after an abrupt process exit.

`202` means accepted, not successful. Terminal states are `done`, `failed`
and `cancelled`. On failure inspect both `error` and `result`, which may
describe partial changes. Job records are in memory and only recent ones
are retained; after a server restart, reconcile against a fresh snapshot
rather than assuming a lost job succeeded or failed.

## Writes

Two shapes, both jobs:

- **Intents** say what to change and the server derives the edit from
  the current snapshot: `POST .../activities/{aid}/rename`, `PUT
  .../activities/{aid}/buttons/{button}` (a code or a `ButtonName`
  alias such as `VOL_UP`, with an optional long press) and `DELETE` on
  the same path, `POST` / `DELETE` / `PUT .../favorites[/order]`,
  `POST .../devices/{did}/rename`, `POST .../commands/{cid}/rename`,
  `PUT .../devices/{did}/idle-behavior`; and the whole-entity ones:
  `POST /hubs/{id}/devices` (empty device of a class the hub can create), `POST
  /hubs/{id}/activities`, `DELETE /hubs/{id}/devices/{did}`, `DELETE /hubs/{id}/activities/{aid}`,
  `PUT /hubs/{id}/devices/order`, `PUT /hubs/{id}/activities/order`, `PUT /hubs/{id}/name`.
  `If-Match` is optional and honours the snapshot's `snapshot_id` revision.
- **Row edits** for an editor that works on the document: change one
  `activities[]` or `devices[]` element of the snapshot, preview with
  `POST .../plan`, then `PUT` it back with `If-Match` (required: `428`
  without it, `412` when the snapshot moved). Only the named entity may
  differ from the snapshot (`422 out_of_scope`). One exception: an
  activity edit that picks an input for a device appends to that
  device's `input_record`, so `PUT /activities/{aid}` (and its plan
  route) accepts an optional `devices` list next to the activity's own
  fields, holding the `devices[]` elements the edit touched. They are
  applied with the activity in the same job; only a device's input
  record, idle behaviour and command names may differ. A device PUT and
  its plan preview allow command removal: omitted commands are deleted,
  their references are cascaded by the hub and display order is rewritten.
  Input writes append entries; removal and reordering of existing input
  entries are not applied, even if the job succeeds.

`If-Match` compares the cached configuration revision. Sync-based row edits
and intents also re-read the target before writing, but compare only
device bindings/macros and activity bindings/macros/favorites, with
normalization exceptions. Names, payloads and device-head fields are not
fully compared. A detected difference fails with `sync_failed` at
`stale_check`. These routes use the library's `strict=False` default, so an
unreadable or incomplete preflight can allow the write to proceed. There is
no REST strict-mode option for row edits. Whole-document sync requires
complete live reads, but uses the same limited comparison tables.
Whole-entity operations (create, delete, reorder, hub rename, restore) use their own validation;
they do not all perform this live baseline comparison. Configuration writes
are refused up front while an app holds the hub (`409 hub_busy`).

The `device_class` on create is a protocol class, not an appliance category
such as TV or receiver:

| Hub | Creatable classes |
| --- | --- |
| X1 | `ir`, `wifi_roku`, `wifi_hue`, `wifi_sonos` |
| X1S | X1 classes plus `wifi_ip` |
| X2 | X1S classes plus `wifi_mqtt` |

Payloads and device fields must match the class/model. This table describes
implemented create support; see the [bench notes](https://github.com/m3tac0de/home-assistant-sofabaton-x1s/blob/main/docs/protocol/live-hub-testing.md)
for which workflows have been tested on hardware.

## Whole-document writes

An editor that changes many things at once puts the whole edited
snapshot back: `PUT /api/v1/hubs/{id}/snapshot` with the document
`GET /hubs/{id}/snapshot` returned, edited, and the quoted `snapshot_id` in `If-Match`
(required). New devices and activities carry a negative placeholder id
of the client's choosing (every reference to them uses the same negative
id; the hub assigns the real one and the result's `id_map` says which);
a removed entity must be removed from every activity in the same
document; array order is display order. `POST /hubs/{id}/snapshot/plan` previews
the ordered items without writing and performs structural validation
shared with `PUT` (`422 dangling_reference` / `out_of_scope` /
`invalid_request`, `409 entity_not_editable` / `snapshot_incomplete`).

A successful preview does not validate every command's wire encoding or
guarantee hub acceptance. The [integration guide](https://github.com/m3tac0de/home-assistant-sofabaton-x1s/blob/main/sofabaton-x-server/docs/platform-integration.md#editing-the-whole-document)
shows the distinct REST payload and document `restore_data` formats.

The `PUT` answers `202` with a cancellable `sync_hub` job. The server
requires live reads of affected entities before the first write, then runs
items in order in one batch. Requested remote-sync triggers and snapshot
notifications are coalesced: at most one explicit trigger when required;
an unchanged document can finish without a change event. Follow the job's
terminal status to determine completion.

Apply records are saved under `data/applies/<hub_id>/` after each item and
when a created ID becomes known. Read them with `GET /hubs/{id}/applies`
or `GET /hubs/{id}/applies/{apply_id}`; `DELETE` on the latter forgets the
record, not the hub changes.

### Recovery and retention

| Outcome | Job status | Apply status | Next step |
| --- | --- | --- | --- |
| All items completed | `done` | `success` | adopt the resulting snapshot |
| Partial, uncertain or refused item | `failed`, error `apply_stopped` | `stopped` | inspect item outcomes and hub state before recovery |
| Cancellation drained by the apply runner | `cancelled` | `cancelled` | inspect the drained item's outcome before recovery |
| Abrupt server restart | in-memory job lost | last persisted status, possibly `queued`/`running` | refresh and reconcile; no automatic restart recovery |

`POST /hubs/{id}/applies/{apply_id}/resume` accepts stopped or cancelled
records. **Resume is not currently duplicate-safe for uncertain creates**:
lost acknowledgements/readback can cause a create to repeat, and a crash
checkpoint can omit an in-flight write. Do not automatically resume these
cases. Preserve the record, refresh and inspect the hub, and construct a
new edit from that reconciled state when the intended changes are clear.
Records left `queued` or `running` by an abrupt restart are not reconciled
on startup and the resume endpoint rejects them. See the
[library limitations](https://github.com/m3tac0de/home-assistant-sofabaton-x1s/blob/main/sofabaton-x/README.md#current-document-write-limitations).

An `Idempotency-Key` can make a repeated `PUT` of the same document return
the existing job view (`200`), but **control and `If-Match` checks run before
key lookup**. The original retry can therefore return `412` after the first
write changes the revision. Check jobs and apply records after a timeout;
do not blindly resubmit the old document with a newer revision. Once those
checks pass, reusing a key with a different document returns
`409 apply_key_reused`. Keys cease to protect against repeated submission
when their apply record is deleted or pruned.

`apply_keep` (default 20) limits terminal records per hub: **`success`,
`stopped` and `cancelled` all count**, so even a resumable record can be
pruned. `queued`/`running` records are not automatically pruned. Export any
record needed for diagnosis before deleting it or allowing retention to
remove it.

## IR payloads, backup, restore

A code in any format your platform has (`{"pronto": ...}`,
`{"descriptor": "P:NEC1 D:4 S:5 F:21"}`, `{"timings_us": [...],
"carrier_hz": 38000}`, or the hub's own `{"hex": ...}`) can be fired
once with `POST /hubs/{id}/play`, saved as a new command with `POST
.../devices/{did}/commands`, or written over an existing one with `PUT
.../commands/{cid}/payload`; `GET .../commands/{cid}/payload` reads what
the hub holds for a command of any device class, with `kind` `raw` or
`descriptive` (IR), `network` (a decoded wifi request) or `record` (a
Bluetooth key, a `wifi_mqtt` record). Only IR payloads play. `POST /hubs/{id}/learn` arms the hub's receiver and
returns the captured code as the job result. The play, command-create and
command-payload PUT routes accept **IR formats only**; the GET payload
response is not a valid write body. For non-IR edits, use command-row
`restore_data` in a device or whole-document PUT, preserving the stored
metadata and class-appropriate fields.

`POST /hubs/{id}/backup` reads a full, restorable bundle as a job
(minutes). The server keeps no backup archive: it holds the finished
bundle in memory for **five minutes** so the client can take it, and the
file the client saves is the backup. While it is held, read it from the
job record (`GET /hubs/{id}/jobs/{job_id}`, `result.bundle`) or download
it as a file with `GET /hubs/{id}/jobs/{job_id}/bundle` (an attachment
named `<date>_<time>_<hub name>.json`; as often as needed). Drop it early
with `DELETE /hubs/{id}/jobs/{job_id}/bundle` once saved. Another backup
on the same hub replaces it at once, so a hub never holds more than one
bundle. Next to `bundle`, the result carries `filename`, `activities` and
`devices` (counts), `captured_at`, `payload_profile`, `bundle_available`,
`bundle_expires_at`, `bundle_downloaded` and `bundle_expired`; after the
bundle is gone the download route answers `410 bundle_expired`.
`POST /hubs/{id}/restore` with
`{"bundle": ..., "replace": true}` erases first and then writes the
bundle back. The bundle and its entity references are validated before erase.
With `replace` omitted or false, restore is additive and assigns new ids.
Structural snapshots and backups made with `include_blobs: false` are not
restorable. Keep the complete full-backup bundle, not just its job header.

`POST /hubs/{id}/erase` and a replacing restore are whole-hub destructive
operations. Device/activity deletion and payload replacement can also remove
existing configuration. A failed restore is not rolled back: inspect its
result (`failed_at`, restored counts, `device_id_map`, `snapshot_id`, and
`erased`: a replacing restore that fails after its erase leaves an empty or
partial hub, reported as `502`) and the current snapshot before recovery.
Choose recovery after inspecting that state. Repeating a replacing restore
erases again; an additive retry can duplicate entities. While a restore,
sync or another exclusive configuration operation holds a hub, a read that
needs hub traffic waits instead of interrupting it. The read answers
`504 hub_timeout` if that wait times out. If a write request times out, check the hub's jobs
before submitting it again.

## Button events

The hubs never report presses of IR or Bluetooth commands, but a Wifi
device's commands call an address when pressed. The server turns that
into button events: it deploys a **callback device** on a hub, a managed
Wifi device whose commands call the server's own listener, and relays
every press to your platform.

```
POST /hubs/{id}/callback-device        {"name": "Server", "slots": [{"label": "Play"}, {"label": "Pause"}]}
GET  /hubs/{id}/callback-device        the record: device_id, labels, target, stale, effective_destination
PUT  /hubs/{id}/callback-device        rename slots or change the power / input hooks in place (a job)
DELETE /hubs/{id}/callback-device      remove it from the hub and forget it (409 while activities reference it; ?force=true)
POST /hubs/{id}/callback-device/redeploy   deploy a stale one again from its stored spec
GET  /hubs/{id}/presses?after=<seq>    the catch-up view of the press stream
GET  /server/callback-listener         the listener's state; POST .../retry tries to bind it now
```

`PUT /hubs/{id}/callback-device` replaces the **complete desired spec**.
Omitted slots become defaults; omitted power/input hooks are cleared. To
rename safely, copy `name`, `slots`, `power_on_slot`, `power_off_slot` and
`input_slots` from the GET response's `spec`, change the intended fields,
and PUT all five back. Preserved IDs and generic bindings do not imply
preservation of omitted spec fields. The integration guide includes a
[copy-and-edit example](https://github.com/m3tac0de/home-assistant-sofabaton-x1s/blob/main/sofabaton-x-server/docs/platform-integration.md#10-button-events).

Hook slots are one-based (`1..10`); the callback URL uses a zero-based
index (`0..9`). The `press.slot` field is one-based when resolved.

Every deploy writes all ten slots (unnamed ones are `Button n`), each as
a short and a long press record: command ids `1..10` and `11..20`. Bind
them like any command with the generic routes (`PUT
/hubs/{id}/activities/{aid}/buttons/{button}`, favorites, activity membership); an
in-place update preserves independently created bindings except when a
new slot assignment replaces the same button, or removing a spec-owned
activity membership makes the hub drop that device's rows. On the X1S and X2,
`power_on_slot` / `power_off_slot` fire when an activity powers on or
off and `input_slots` are offered as activity-start inputs; the X1
ignores both (its firmware fires one power and one input callback per
transition regardless) and always calls port 8060.

Presses arrive as `press` messages on `/events` and in `GET
/hubs/{id}/presses`. Both carry `device_key` and the same `seq`, a counter of this server
instance; de-duplicate across the two channels by it, and after a
reconnect or a `dropped` message fetch `?after=<last seq you saw>`.
`expired: true` means presses newer than that were already evicted from
the ring (100 per hub); accept the gap. The `hello` message and `GET
/server` carry an `instance_id`: when it changes the server restarted,
the ring is empty and the sequence started over. `resolution` says how a
press matched the record: `deployed`, `stale` (the record is flagged
stale, see below), `unknown_slot`, `unknown_device`; nothing is dropped.

The listener is a separate plain-HTTP port (8060 by default, the same
default as the Home Assistant integration and Emulated Roku, so only
one of them can own it on a host). It runs while any hub has a callback
device, accepts only the hub's own address (or the forwarded client when
the peer is a `--trusted-proxy`) and answers every request at once; the
hub retries anything it dislikes. A port in use is not fatal: the deploy
still succeeds, `callback_listener_failed` is announced, `GET
/server/callback-listener` shows the error and the next retry, the
server keeps retrying with backoff, and `POST
/server/callback-listener/retry` tries at once.

Failures split two ways. An immediate `409` is something the record
alone decides: `callback_device_exists`, `callback_device_stale`,
`callback_device_not_stale`, `callback_device_referenced` (the detail
names the activities and reference kinds), `callback_port_x1`. Anything
that needs the hub happens inside the accepted job and fails it with a
coded error: `callback_update_declined` (a record's label matches
neither what was deployed nor what you asked, so the device was edited
elsewhere; or the planner refused the diff; nothing was written) and
`callback_update_failed` (the hub rejected a step; the next update with
the same spec resumes).

If the device disappears from the hub (deleted in the Sofabaton app, an
erase), the record is marked `stale` (`callback_device_stale` server
event), presses that still arrive are tagged `resolution: "stale"`, and
`redeploy` creates it again from the stored spec. The server verifies
identity (brand, name and the callback path inside the first record)
before it clears the flag on its own. Every create, update and delete
writes its intent to `hubs.json` before the hub is touched; at boot and
before every deploy the server reconciles it, and a device it created
but forgot (a crash before the save, a lost data directory) is adopted
by that same identity check instead of being created twice
(`adopted: true` on the record).

## Wifi Commands

A hub can hold several of these managed devices. The callback device
above is one of them, under the reserved key `default`; the others are
**Wifi Devices**, each under a key the server mints, and the control
panel's Wifi Commands tab is built on them:

```
GET  /hubs/{id}/wifi-devices                  {devices, max_devices, transports, effective_destination}
POST /hubs/{id}/wifi-devices                  deploy a new one (a job); the result is its record, with its `key`
GET  /hubs/{id}/wifi-devices/{key}            one record
PUT  /hubs/{id}/wifi-devices/{key}            the complete desired spec, in place (a job)
DELETE /hubs/{id}/wifi-devices/{key}          remove it (409 while activities reference it; ?force=true)
POST /hubs/{id}/wifi-devices/{key}/redeploy   a stale one again from its stored spec
```

Bodies, records, jobs, problem types, stale detection and recovery are
the callback device's, per key; `/wifi-devices/default` and
`/callback-device` are the same record. What the keys add:

- A hub holds at most `max_devices` records (5, the callback device
  included); one more is a `409 wifi_device_limit`.
- A keyed device carries the brand `c0-<key>` on the hub. The Home
  Assistant integration marks its own Wifi Devices `m3-<key>-<hash>`, so
  a hub that has met both never has one side adopt, edit or delete the
  other's devices. The two are not interchangeable: a device made here
  does nothing in Home Assistant and the reverse.
- A `press` carries `device_key`, the key of the device it resolved to
  (`null` for an `unknown_device`), next to `device_id` and `slot`.
- A slot can say where its command goes, as a slot of the Home Assistant
  card does. Next to `label` and `long_label`: `favorite` and `button` (a
  hub button code, the `button_code` of `GET .../buttons`) apply in every
  activity of `activities`; `long_press` also binds the slot's long
  record (command `slot + 10`) to that button's long press;
  `input_activity_id` makes the command that activity's input, performed
  while it starts (X1S/X2). One slot per button and one slot per input
  activity; a power slot cannot also be an input. Invalid IDs and
  conflicting claims are `422`. Normalization clears `activities` when
  neither `favorite` nor `button` is set, and clears `long_press` without
  a button. The update writes these in place with the rest of the spec: the device
  joins the activities it names, and its own page gets the buttons, which
  is what lets an activity pick it as its volume or navigation device.
  Ownership is by history: the server removes a favorite, a button or a
  membership only when an earlier spec of this device put it there. A new
  slot assignment can replace an existing button assignment. One consequence to
  know: a spec that stops naming an activity leaves it, and the hub then
  drops every row of the device in that activity. An activity id the hub
  does not have fails the job with `callback_update_declined`
  (`activity: ...`). `DELETE` asks for `?force=true` only for references
  the device's own slots did not make.
- Every record and the create body carry `transport`: `"http"` or
  `"mqtt"`. The list's `transports` says what a new device on this hub
  may use, the preferred one first; see [MQTT](#mqtt). It is fixed at
  deploy: changing it is a delete and a new device. The POST default is
  `"http"`, even when `transports` lists MQTT first; send `"transport":
  "mqtt"` explicitly. PUT ignores `transport` and retains the deployed one.
  `POST /callback-device` always deploys HTTP.

### MQTT

An X2 can deliver presses through an MQTT broker instead of calling the
server. It needs
no callback listener, no callback address and no port 8060 involved. The
device's command records are inert; at press time the hub publishes
`{"device_id": <hub device id>, "key_id": <command id>}` to `<MAC>/up`
(the MAC in upper-case hex, QoS 0, not retained) on **the broker set in
the Sofabaton app**. Start the server with the same broker
(`--mqtt-host`, see [Settings](running-server.md#settings)) and:

- `GET /hubs/{id}/wifi-devices` answers `transports: ["mqtt", "http"]`
  for an X2 whose MAC is known, `["http"]` for every other hub and for a
  server without a broker. `POST /wifi-devices` with `"transport":
  "mqtt"` anywhere else is a `409 mqtt_unavailable` that says why.
- An mqtt record has `target: null` and `mqtt_topic: "<MAC>/up"`. The
  callback listener is only wanted while an `http` device exists.
- The server subscribes to the topic while a device uses it (one
  connection, one subscription per hub; `GET /server/mqtt` and the `mqtt`
  block of `GET /server` show `configured`, `connected`, the topics and
  the last error). It never publishes. It reconnects with backoff.
- A press comes out as the same `press` message with `transport:
  "mqtt"` and an empty `source`. `key_id` 1..10 is a short press of that
  slot, 11..20 the long press. A retained message is never a press and is
  dropped; so is a publish from a device the server does not manage (your
  own MQTT devices made in the Sofabaton app share the topic).
- Everything else is the same: in-place updates, slot bindings, stale and
  redeploy, delete. There is no link test: whether the hub reaches the
  broker is between the hub, the app and the broker. If presses do not
  arrive, check the broker settings in the app first.

In the panel, **Add** deploys an empty device at once and opens it. The
detail view edits a draft (the device's name, the power ON / OFF commands
and, per slot, the card's dialog: name, favorite, physical button, long
press, activities, activity input) and **Sync to Hub** writes it in place
with one `PUT`. Taking a button another slot holds moves it; taking one
another Wifi Device holds also clears it from that device, with a second
`PUT` after the first. A slot nobody touched (`Button n`) shows as **Make
Command**; clearing a slot returns it to that. The tiles carry the card's
meta line: a heart, the button's icon, the long-press icon and "in N
activities", or the power or input role. A device the hub lost shows **Missing from hub** and
offers **Redeploy**. The line under the slots says which address the
device calls; when the server's address has changed since the deploy, or
the listener is not running, the view says so there.

## Discovery

The physical hub stops advertising while the official app is connected
directly to it. Close the app before discovery and initial registration;
repeated scans cannot find a hub that is not advertising. A previously
seen entry can remain in the discovery table, so `present: false` does not
by itself mean the hub is offline. Use registered hub status for availability.

The server browses for hubs for as long as it runs and keeps a table of
what it has seen: `GET /api/v1/discovery/hubs` lists physical hubs
(`key` is the MAC when the advertisement carries one, else the host),
whether each is currently advertised (`present`), and the configured
hub it matches (`registered_hub_id`) if any. `POST /api/v1/discovery/scan`
with `{"timeout": 5}` listens for that long and returns the table, for
platforms that want a synchronous answer. Advertisements from this
server's own proxies are recognised and left out. New and vanished hubs
arrive on the event stream as `hub_discovered` / `hub_lost`.

To register a discovered hub, `POST /api/v1/hubs` with the entry's
`config` object. A record from your platform's own mDNS stack works the
same way: pass `host`, and `mac`, `name`, `txt` and `hub_version` when
you have them; filter out advertisements carrying `HA_PROXY=1` (they
are proxies, and the server refuses them with a pointer to the hub they
front).

The server advertises itself as `_sofabaton-x._tcp.local.` with TXT
`version`, `api`, `path`, `hubs` (count) and, when `--advertise-url` is
set, `base_url`. Use `base_url` when present, otherwise
`http://<SRV host>:<SRV port>`, as the **server base URL**. Append `path` to
obtain the **API root** for hand-written calls. Generated clients use the
server base URL because OpenAPI operation paths already include `/api/v1`.
Preserve a reverse-proxy prefix and avoid appending `/api/v1` twice.

## Events (WebSocket)

`ws://<server>:8480/api/v1/events` streams every hub's events on one
connection; add `?hub_id=<id>` (repeatable) to narrow it. Messages are
JSON objects discriminated by `type`:

| type | payload |
| --- | --- |
| `hello` | once on connect: `server_version`, `api_version`, `instance_id`, `hubs` (`hub_id`, `enabled`) |
| `hub_event` | `hub_id` and the library `event` (`seq`, `kind`, `payload`): `activity_changed`, `activity_list_updated`, `hub_state`, `app_state`, `status_changed`, `catalog_ready`, `snapshot_changed`, `ota` |
| `server_event` | `hub_id` and `kind`: hub lifecycle/discovery events (`hub_added`, `hub_removed`, `hub_enabled`, `hub_disabled`, `hub_rekeyed`, `hub_discovered`, `hub_lost`) and callback events (`callback_device_stale`, `callback_device_restored`, `callback_listener_started`, `callback_listener_failed`) |
| `job_event` | `hub_id` and the `job` record, excluding a backup's `result.bundle`, on every transition: queued, running, each progress report, done / failed / cancelled |
| `press` | a button press delivered over HTTP or MQTT: `device_key`, `seq` (the server-instance press sequence, shared with `GET /hubs/{id}/presses`), `hub_id`, `device_id`, `command_id`, `slot`, `label`, `press_type` (`short` / `long`), `resolution`, `transport`, `source`, `received_at` (see Button events) |
| `dropped` | `count` of older messages discarded because this client fell behind; sent before the next message that gets through |

`hub_event.event.seq` is the library's per-proxy counter, passed through
untouched. A gap means events were lost in a bounded queue; either the
library's consumer or the WebSocket client can fall behind. `press.seq` is
a separate server-instance-wide counter shared with press history; use
`(instance_id, seq)` to de-duplicate presses.
`hub_rekeyed` is the one to watch after registering by host: the id
becomes the hub's MAC once its banner is read. Disabling a hub is
announced by `hub_disabled` alone (its proxy is gone before any link
event could be relayed); enabling it creates a new proxy whose
`hub_event.event.seq` starts over. A hub transport reconnect alone does not
reset that proxy counter. On reconnect, a `dropped` message or a sequence gap,
re-read the hub list, status, relevant snapshots and outstanding jobs;
hub and job events have no replay history. Presses have the bounded
catch-up history described above. Inbound text is ignored.
The message types are published as components in the OpenAPI document
(`WsHello`, `WsHubEvent`, `WsServerEvent`, `WsJobEvent`, `WsPress`, `WsDropped`)
for generators.

Writing a platform integration? Start with
[docs/platform-integration.md](https://github.com/m3tac0de/home-assistant-sofabaton-x1s/blob/main/sofabaton-x-server/docs/platform-integration.md): finding
the server and the hubs, the endpoint rule, the error table, the event
stream, pairing with registered hubs, and optional snapshot, job and editing
flows.
