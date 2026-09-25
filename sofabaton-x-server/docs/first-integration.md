# Build an integration with Sofabaton X Server

Build a client that exposes hub activities, commands and automation
triggers in your platform. The server already manages hub connections,
configuration, backups and the web remote. Your client can consume those
capabilities over HTTP and WebSocket, in any language.

This guide uses **API 1**, with **server 0.2.2** as its baseline.
Use the [OpenAPI document](../openapi.json) for complete schemas and the
[changelog](../CHANGELOG.md) for release-specific changes.

## Decide what your integration owns

A useful first integration lets a user select a registered hub, start and
stop its activities, and see changes made with the physical remote.
Command actions and remote-button automation triggers can follow.

| The server handles | Your integration handles |
| --- | --- |
| Hub discovery, registration and connections | Connecting to a server and selecting registered hubs |
| Device, activity and Wifi Device configuration | Platform controls, state and automation triggers |
| The management UI and web remote | Links to those interfaces |
| HTTP or MQTT delivery from managed Wifi Devices | Consuming their WebSocket press events |

Users should complete [server setup](getting-started.md) first. If no hubs
are registered, link them to `<server base URL>/ui/` and let them reload
your hub selection afterwards. Removing your integration should remove
its own entities and selections, leaving shared server registrations and
Wifi Devices in place.

The examples below use `http://192.168.1.10:8480` and hub
`e26a44861b45`. Replace these and all activity/device/command IDs with
values from your server. **JSON responses are excerpts showing the fields
used in the walkthrough**, unless stated otherwise.

## 1. Connect to a server and select hubs

Ask for the **server base URL**, not the physical hub address. Preserve a
reverse-proxy prefix if present; exclude `/api/v1` from the saved base URL.
Automatic server discovery over mDNS is optional.

Validate the connection:

```http
GET /api/v1/server
```

```json
{
  "version": "0.2.2",
  "api_version": "1",
  "instance_id": "example-server-instance"
}
```

Check the API generation before using its contract. Keep `instance_id`
for event tracking: it changes when the server restarts. Then list
**registered** hubs:

```http
GET /api/v1/hubs
```

```json
[
  {
    "hub_id": "e26a44861b45",
    "hub_name": "Living room",
    "config": {"name": null},
    "enabled": true
  }
]
```

Offer the hubs for selection, using `config.name` when set, then
`hub_name`, then the ID as a fallback. Store IDs, not display names.
Use the stable MAC-based hub ID; a newly registered hub can initially have
a host-based ID that changes on connection. Handle `hub_rekeyed` by
reloading registrations and updating the selection.

One server supports multiple hubs. One WebSocket can receive events for
all selected hubs. See [server discovery and URL rules](platform-integration.md#1-find-the-server)
for mDNS, proxy prefixes and generated-client configuration.

## 2. Expose activity controls

Read the selected hub's activity catalog:

```http
GET /api/v1/hubs/e26a44861b45/activities
```

```json
[
  {"activity_id": 101, "name": "Watch TV", "active": false},
  {"activity_id": 102, "name": "Listen to music", "active": false}
]
```

Create a platform control for each activity the user selects. Key it by
server, hub and activity ID; use the name as its label. You might expose
a selector or individual activity switches, depending on your platform.

To start Watch TV, send this request with no body:

```http
POST /api/v1/hubs/e26a44861b45/activities/101/start
```

The acceptance response is:

```json
{"accepted": true, "mode": "control"}
```

To stop that activity, use
`POST /api/v1/hubs/e26a44861b45/activities/101/stop`, also with no body.
For switch-style controls, only send a stop when the user turns off the
currently running activity; receiving state updates for other switches
must not generate additional commands.

**Acceptance is not the final activity state or proof that the equipment
responded.** Confirm state through status and events. These control calls
do not require snapshots, configuration writes or jobs.

## 3. Keep platform state synchronized

Subscribe to the event stream **before** reading initial status:

```text
ws://192.168.1.10:8480/api/v1/events?hub_id=e26a44861b45
```

Use `wss` for an HTTPS server. Repeat `hub_id` to select multiple hubs,
or omit the filter for all hubs. The opening `hello` message includes
`api_version`, `instance_id` and hub summaries; it does not contain full
activity state.

Read initial state with:

```http
GET /api/v1/hubs/e26a44861b45/status
```

```json
{
  "hub_id": "e26a44861b45",
  "enabled": true,
  "status": {
    "hub_connected": true,
    "app_connected": false,
    "mode": "control",
    "controllable": true,
    "catalog_ready": true,
    "running_activity": {"activity_id": 101, "name": "Watch TV"}
  }
}
```

Set your activity selector to 101, or mark its switch on and the others
off. An available hub with `running_activity: null` has no running
activity. Keep availability separate from activity state:

| Observed state | Platform behavior |
| --- | --- |
| Server unreachable, hub disabled, `status: null`, or `hub_connected: false` | Mark unavailable; do not treat last-known activity as current or infer that the equipment is off |
| `mode: "observe"` / `controllable: false` while the official app is connected | Continue displaying reported state, but disable sending and explain that the app owns control |
| Connected with `catalog_ready: false` | Show initialization; wait before offering catalog-dependent controls |
| Connected, controllable and ready | Offer controls, while still handling refusals from individual requests |

An activity change arrives as:

```json
{
  "type": "hub_event",
  "hub_id": "e26a44861b45",
  "event": {
    "seq": 42,
    "kind": "activity_changed",
    "payload": {
      "activity_id": 102,
      "previous_activity_id": 101,
      "name": "Listen to music"
    }
  }
}
```

Update the platform to activity 102, regardless of whether your client,
the physical remote or another client caused the change. A null
`activity_id` means no activity is running. Do not send another command
in response to this state update.

Also handle `hub_state`, `app_state`, `status_changed` and
`catalog_ready` by reconciling availability and control status.
On `activity_list_updated`, reload the activity list. Handle registration
changes from `server_event`: disable/remove makes a selected hub
unavailable; enable/rekey requires reloading its state.

Events can arrive while an HTTP read is in flight. Reconcile those events
with the response so an older read cannot overwrite newer state. For
example, track a local revision for the state being fetched; if relevant
events change it during a read, discard that response and schedule a new
read. That local revision is separate from the server's sequence counters.

**First milestone:** start an activity from your platform, then switch
activities with the physical remote and see your platform update. Do
this before adding command actions or button triggers.

## 4. Add command actions

Let users browse devices and each device's commands:

```http
GET /api/v1/hubs/e26a44861b45/devices
GET /api/v1/hubs/e26a44861b45/devices/7/commands
```

The command list uses labels for display and IDs for sending:

```json
[
  {"command_id": 3, "label": "Volume up"},
  {"command_id": 4, "label": "Volume down"}
]
```

Keep the device and command IDs together. To send device 7's command 3:

```http
POST /api/v1/hubs/e26a44861b45/send
Content-Type: application/json

{"entity_id": 7, "command_id": 3}
```

It returns the same acceptance shape as activity control. Generic IR
commands do not provide confirmation that the target equipment acted.
Do not automatically retry a timed-out send: the command may already
have taken effect.

<a id="3-receive-your-first-remote-press"></a>

## 5. Add remote-button automation triggers

The hub does **not** report ordinary IR or Bluetooth button presses.
To trigger your platform, a remote button must execute a command on a
managed **Wifi Device**.

Have the user configure a Wifi Device and its assignments in
[the panel's Wifi Commands tab](managing-hubs.md#wifi-commands), synchronize
it to the hub, and let the physical remote finish synchronizing. Your
client can list the configured devices with:

```http
GET /api/v1/hubs/e26a44861b45/wifi-devices
```

Offer entries from the response's `devices` array. Each record provides
a `key`, hub `device_id` and command `labels`; store the selected
identity and command mapping. Treat stale or undeployed records as
needing attention in the panel. Do not assume the key is `default`.

The same WebSocket used for activity state delivers presses. For example:

```json
{
  "type": "press",
  "seq": 18,
  "hub_id": "e26a44861b45",
  "device_key": "a1b2c3d4",
  "device_id": 8,
  "command_id": 1,
  "slot": 1,
  "label": "Movie lights",
  "press_type": "short",
  "resolution": "deployed",
  "transport": "http",
  "source": "192.168.1.50",
  "received_at": "2026-09-23T12:00:00+00:00"
}
```

Map this to a platform button event or automation trigger. Match the
selected hub, device key, deployed device ID, command ID and press type;
labels can change and should not be identifiers. Dispatch
`resolution: "deployed"`; report other resolutions for diagnosis rather
than firing an unrecognized action. Re-read the device record after
redeployment before adopting a changed hub device ID.

HTTP and X2 MQTT delivery produce the same press interface. Your client
does not need an inbound HTTP listener or a separate MQTT subscription.
Delivery setup and broker settings belong to the server and hub.

Test by pressing the assigned button in the selected activity and
observing the platform trigger. Activity changes remain separate
`hub_event` messages and need no Wifi Device.

<a id="before-shipping-your-integration"></a>

## 6. Prepare for real use

- **Reconnect and reconcile.** Reconnect with backoff. After reconnecting,
  a `dropped` message or a hub-event sequence gap, reload registrations,
  status and the catalogs your client uses. Hub events have no replay.
  Respect changes made in the panel; do not automatically re-register or
  enable a hub.
- **Separate event counters.** `hub_event.event.seq` belongs to a hub's
  proxy and resets when that proxy is recreated. `press.seq` belongs to
  the server instance. Deduplicate presses by `(instance_id, seq)` and
  reset press tracking when the instance changes.
- **Choose a missed-press policy.** Either skip missed triggers or use the
  bounded `GET /hubs/{id}/presses?after=<seq>` history. Account for expired
  history and avoid unexpectedly executing old actions on reconnection.
- **Handle failures at the request.** Readiness can change between a
  status check and a send. A `409` with `send_refused` or `hub_busy`
  should cause you to read status and explain the refusal. Handle
  disabled/removed hubs and connection failures as availability changes.
  Do not blindly retry commands with uncertain outcomes.
- **Link to management.** Offer `<server base URL>/ui/` and
  `<server base URL>/ui/remote/?hub=<URL-encoded hub ID>`. Keep shared hub
  configuration in the server unless your integration explicitly offers
  configuration editing.
- **Support the deployment.** The server has no built-in authentication.
  If the operator uses an authenticating reverse proxy, your client must
  support its authentication for both HTTP and WebSocket connections.

See the [platform integration guide](platform-integration.md) for precise
[error handling](platform-integration.md#4-read-and-control),
[event recovery](platform-integration.md#5-events) and optional editing
workflows. The [API reference](api-reference.md) and
[OpenAPI document](../openapi.json) describe the full surface.

## Optional runnable Python example

The [starter client](../examples/starter.py) lets you inspect these
exchanges without implementing a platform client first. Python is not
required by your integration; use your platform's own HTTP/WebSocket tools.

From a repository checkout, with Python 3.11+, run:

```sh
python sofabaton-x-server/examples/starter.py --server http://192.168.1.10:8480 server
python sofabaton-x-server/examples/starter.py --server http://192.168.1.10:8480 hubs
python sofabaton-x-server/examples/starter.py --server http://192.168.1.10:8480 --hub-id e26a44861b45 activities
python sofabaton-x-server/examples/starter.py --server http://192.168.1.10:8480 --hub-id e26a44861b45 status
```

For listening, install `websockets>=12` in the client environment (it is
already included with the server installation). In one terminal:

```sh
python -m pip install "websockets>=12"
python sofabaton-x-server/examples/starter.py --server http://192.168.1.10:8480 --hub-id e26a44861b45 listen
```

In another, start and stop an activity:

```sh
python sofabaton-x-server/examples/starter.py --server http://192.168.1.10:8480 --hub-id e26a44861b45 start --activity 101
python sofabaton-x-server/examples/starter.py --server http://192.168.1.10:8480 --hub-id e26a44861b45 stop --activity 101
```

The listener prints activity changes and presses from all managed Wifi
Devices on the selected hub. Try the physical remote too. Use
`devices`, `commands --device 7`, `send --device 7 --command 3` and
`wifi-devices` to inspect the optional capabilities.

The script sends real control commands, but does not provision devices or
edit button assignments. It prints events rather than maintaining a
complete platform state model, does not automatically retry requests, and
stops on disconnect. Implement the lifecycle behavior above in your client.

The [Hubitat example](../examples/hubitat/README.md) illustrates platform
entities and reconnection handling, but currently consumes only the legacy
`default` callback device. Its separate
[callback provisioning example](callback-provisioning.md) exists for that
limitation; it is not a prerequisite for integrating with panel-configured
Wifi Devices. The Hubitat README describes its validation limits.
