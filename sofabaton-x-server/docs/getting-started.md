# Your first integration

This guide targets **sofabaton-x-server 0.2.1 / API 1**.

Start with **sofabaton-x-server**. It manages hub connections and provides
HTTP and WebSocket APIs for clients in any language. Use its built-in
management UI (the **control panel**) for setup, catalog browsing and
diagnostics, and its web remote for everyday control.

Your integration can stay small: let users select an already registered
hub, expose the actions and state your platform needs, and map remote
callback presses to automations. Link to the server for management and
the remote UI. Hub discovery, registration and configuration editors are
optional features for your client.

## 1. Set up the server

**Run one server for all your hubs.** Add each hub to that server in the
control panel; your integration uses the same server URL for all of them.

**Before starting, fully close the official Sofabaton app on every phone
or tablet that could connect to this hub.** While the app is connected
directly to the hub, the hub stops advertising itself. The server cannot
discover it during that time, even on the same LAN. Keep the app closed
through discovery, registration and the first control test.

If a hub is already managed by Home Assistant or another proxy, disable
that hub there before registering it with this server.

Use Python 3.11+ on a host on the hub's LAN:

```sh
python -m pip install "sofabaton-x-server>=0.2.1,<0.3"
sofabaton-x-server
```

Open `http://<server>:8480/` (or `http://localhost:8480/` on that host).

1. Open the **hub picker** in the top dock, wait for the hub to appear,
   then click **Add**. If it is missing, confirm the app is fully closed and
   scan again. Use **Add by address…** to enter the physical hub's IP;
   manual entry does not replace closing the app.
2. Wait for the hub to be controllable with its catalogs ready.
3. In **Remote**, test an activity or command. Its layout editor saves the
   remote's settings on the server.
4. In **Hub**, look up activity, device and command IDs. **Events** shows
   the live stream; **API** lets you try requests and follow their jobs.

Repeat these steps in the same panel for your other hubs.

After setup, the official app can connect **through the proxy**. That is
a different situation: the server keeps its hub connection but switches
to observe mode while the app owns control. Close the app again before
sending server commands or changing configuration.

Keep the server running. Use a persistent data directory (`--data-dir`)
so registrations and settings survive restarts. `--hub <physical IP>` is
an alternative for first startup only: it seeds hubs when `hubs.json`
does not exist. Later, add hubs through the panel.

For a checkout, run `python -m pip install . ./sofabaton-x-server` from
the repository root instead of the PyPI install. For Docker, follow the
[Linux host-network recipe](../README.md#docker). The server has no
built-in authentication; keep it on a trusted LAN or behind an
authenticating reverse proxy.

### Connect your client

Ask for the **server base URL**, for example `http://192.168.1.10:8480`,
then list registered hubs with `GET /api/v1/hubs`. Let the user choose one
and store its `hub_id`. Wait for the stable MAC form (such as
`e26a44861b45`); an initial IP-based ID can change after the first connection.

The [starter client](../examples/starter.py) makes these calls visible.
The commands below run from a repository checkout; the examples are not
installed as commands by pip. They default to `http://localhost:8480`:

```sh
python sofabaton-x-server/examples/starter.py hubs
```

For another host, put `--server` **before the action**:

```sh
python sofabaton-x-server/examples/starter.py --server http://192.168.1.10:8480 hubs
```

Pass the server's address, not the physical hub's. Exclude `/api/v1` from
the base URL; preserve a reverse-proxy prefix if there is one. All IDs
below are examples: replace them with values from your own hub.

## 2. Send your first command

In the panel's **Hub** view, choose a device and copy its device ID
and a command ID. You can also list them from the starter client:

```sh
python sofabaton-x-server/examples/starter.py --hub-id e26a44861b45 devices
python sofabaton-x-server/examples/starter.py --hub-id e26a44861b45 commands --device 7
```

Keep the **device ID and command ID together**. If device `7`, command `3`
is the command you want to test, send it:

```sh
python sofabaton-x-server/examples/starter.py --hub-id e26a44861b45 send --device 7 --command 3
```

This calls `POST /api/v1/hubs/{hub_id}/send` with
`{"entity_id":7,"command_id":3}`. The response
`{"accepted":true,"mode":"control"}` confirms acceptance for sending;
check the equipment for the physical result. No snapshot, backup or job
is needed for a send.

### What your integration needs

Implement the operations your platform exposes. Paths below are relative
to `<server base URL>/api/v1`.

| Need | Call or link |
| --- | --- |
| Select a registered hub | `GET /hubs` |
| Read availability and current activity | `GET /hubs/{id}/status`; read `enabled` and the nested `status` (which can be null) |
| Offer activity switches | `GET /hubs/{id}/activities`; use `POST /hubs/{id}/activities/{aid}/start` and `POST /hubs/{id}/activities/{aid}/stop` |
| Send a selected command | `POST /hubs/{id}/send` with `entity_id` and `command_id` |
| Update state and receive callbacks | WebSocket `/events?hub_id={id}`; handle `hub_event`, `server_event` and `press` |
| Open management | `<server base URL>/ui/` |
| Open the remote | `<server base URL>/ui/remote/?hub={id}` (URL-encode the hub ID) |

An activity-only integration needs no callback device; continue to
[Before shipping](#before-shipping-your-integration). Add remote presses
when you want buttons to trigger platform actions.

## 3. Receive your first remote press

**The hub does not report ordinary IR or Bluetooth button presses.** To
trigger your platform, a remote button must run a command on a managed
Wifi Device. It delivers the press to the server over HTTP or, on X2,
MQTT. The server forwards a WebSocket `press` event. Your client does not
need its own HTTP listener or MQTT subscription.

### Set up callbacks once

In **Wifi Commands**, add a Wifi Device, edit a slot, choose its physical
button and activities, and use **Sync to Hub**. X2 can use MQTT when the
server and the Sofabaton app are configured with the same broker; otherwise
use HTTP. Your client receives the same WebSocket `press` events for both.

The setup command below creates or reuses the legacy HTTP callback device
(key `default`), which is also used by the Hubitat example. It does not
select a keyed device created with the panel's Add button. Keep this setup
separate from your integration's normal startup.

Choose an existing activity ID in **Hub** (or run the starter's
`activities` action). The following example uses activity `101` and
`PLAY`. **It replaces that button's short and long assignments in that
activity.** Choose a button you intend to reassign, then close the official
app before running:

```sh
python sofabaton-x-server/examples/starter.py --hub-id e26a44861b45 setup-presses --activity 101 --button PLAY
```

The script creates a callback device if missing, or reuses its first slot
and existing labels. It waits for each job to finish and prints the
device ID, labels and deployed destination. `202 Accepted` starts a job;
only `status: "done"` means the setup succeeded.

The hub must reach the server's callback listener on TCP **8060** by
default; your client uses the API/WebSocket port **8480**. The X1 always
uses 8060. Allow the physical remote to finish synchronizing its configuration.

### Listen and dispatch

The listener uses `websockets`, included with the server installation.
On a separate client machine, install it with
`python -m pip install "websockets>=12"`. Other starter actions use only
Python's standard library.

```sh
python sofabaton-x-server/examples/starter.py --hub-id e26a44861b45 listen
```

Wait for `Connected to server instance …`, select the chosen activity
on the physical remote, and press the assigned button. A new setup prints
`PRESS: Demo (short)` along with the complete event. Holding the button
uses command `11` and `press_type: "long"`; a short press uses command `1`.

In `listen()`, replace the dispatch comment with your platform action.
The listener prints presses from **all** managed Wifi Devices on the selected
hub. Before dispatching real actions, match `hub_id`, `device_key` (for
example `default`), `device_id`, `command_id` and `press_type`; labels are
display text and can change. The example dispatches only
`resolution: "deployed"` and prints other records for diagnosis.
Activity changes arrive separately as
`hub_event` with `event.kind: "activity_changed"`.

## Before shipping your integration

- Reconnect with backoff and re-read selected hubs, status and the catalogs
  you use. Handle hubs disabled, removed or changed through the panel.
  Keep last-known state separate from availability.
- Check failures even after a readiness check: the official app can take
  control between requests. Do not automatically retry a timed-out control
  command; its physical effect may already have happened.
- Choose a missed-press policy. The starter stops on disconnect. Production
  clients can use bounded press history, or deliberately skip missed actions
  to avoid executing old button presses. De-duplicate by `(instance_id, seq)`
  and reset tracking after a server restart. See the
  [event lifecycle](platform-integration.md#5-events).

The [Hubitat example](../examples/hubitat/README.md) demonstrates this small
integration scope with activity switches, command sending and button events.
The [platform guide](platform-integration.md) covers the production contract
and optional setup/editing APIs.

## If something does not work

| Symptom | First check |
| --- | --- |
| Physical hub missing from discovery | Fully close the official app on all phones/tablets, then scan again. A hub connected directly to the app does not advertise. |
| Client lists no registered hubs | Add one in the panel's hub picker after closing the app. `--hub` only seeds a new data directory. |
| `hub_not_found` | Re-read `/hubs`; an initial IP-based ID may have changed to the MAC. |
| Not ready, `hub_busy` or `send_refused` | Close the official app; check hub connectivity and that no other proxy owns it. |
| Send accepted, no equipment response | Verify the device/command pair and equipment reachability. |
| Setup job fails | Inspect the job's `error` and partial `result` before another write. |
| Listening, but no press arrives | Check the assignment, selected activity and remote sync; inspect the callback record's `target` and `GET /api/v1/server/callback-listener` (`bound`). Another service may own port 8060. |

See the [networking guide](../../docs/networking.md) for ports and firewalls.
