# Hubitat integration example

A native Hubitat app and four Groovy drivers for **sofabaton-x-server**.
The Python server runs on a separate computer; Hubitat connects to its REST
API and WebSocket. No Home Assistant, MQTT broker, Maker API token or inbound
Hubitat HTTP endpoint is needed.

**Example for server 0.2.1 / API 1.** Until 0.2.1 is published, install
both packages from a repository checkout as described in the server README.
The sources are compiled and behavior-tested with
Groovy 2.4.21 and a simulated Hubitat environment. Installation, Hubitat's
sandbox, actual asynchronous HTTP/WebSocket behavior, and physical devices
still require validation on a Hubitat hub. Do not interpret the local tests
as hardware certification.

## What it provides

- One app installation and one WebSocket bridge per server, supporting
  multiple registered X1/X1S/X2 hubs.
- A hub device with current activity, availability, control status,
  `startActivity`, `sendCommand`, `allOff`, `findRemote`, and `refresh`.
- Standard activity `Switch` devices selected by the user. Physical-remote
  activity changes update these devices too.
- One ten-button device per selected hub, with `PushableButton` and
  `HoldableButton` events from existing server callback slots.
- Reconnect backoff, event-gap reconciliation, press deduplication, and
  rejection of HTTP snapshots made obsolete by newer events.

This example follows the recommended integration scope: consume registered
hubs and callback devices, and keep setup in the server's control panel.
The button device consumes only `/callback-device` (Wifi Device key
`default`). It ignores other keyed devices, including ones created by the
panel's Add button; use the starter setup below to create `default` first.
Use its Hub view to find command IDs and its Remote view for the full
remote and layout editor. The instructions below cover the separate,
one-time callback setup needed to receive button presses.

## 1. Start the server

**Fully close the official Sofabaton app on all phones/tablets first.**
While it is connected directly to the hub, the hub does not advertise and
the server cannot discover it. Keep the app closed through registration
and the first control test.

Follow the [server setup](../../README.md#run) and
[starter guide](../../docs/getting-started.md). Run one server for all your
hubs and connect Hubitat to that server. If a hub is already managed by
Home Assistant or another proxy, disable it there before registering it here.

On the server host:

```sh
python -m pip install "sofabaton-x-server>=0.2.1,<0.3"
sofabaton-x-server
```

Open `http://<server>:8480/` and add the physical hub through the **hub picker**
in the top dock. If it does not appear, check that the official app is closed
and scan again.
Wait until the hub has a stable MAC ID
and `catalog_ready: true`. After setup, the official app can connect
through the proxy; close it again before sending commands or changing
configuration from the server or Hubitat.

The Hubitat app needs the **server host's** base URL, for example
`http://192.168.1.10:8480`, not the physical hub's IP. Reserve both LAN
addresses in DHCP. A reverse-proxy prefix is supported, such as
`https://home.example/sofabaton`; do not append `/api/v1`. This example does
not supply authentication headers or bypass TLS certificate validation.

The server currently has no built-in authentication. Keep it on a trusted
LAN. Hubitat connects to TCP 8480 by default. Callback presses also require
the physical SofaBaton hub to reach TCP 8060 **on the server**, while the
server's normal discovery and hub-connection ports must remain reachable.
For containers, use the documented [Linux host-network recipe](../../README.md#docker).

## 2. Install the Hubitat code

In Hubitat's web interface, open **Drivers Code**, choose **New Driver**,
paste each complete file into its own entry, and save:

1. [SofabatonXServerBridge.groovy](SofabatonXServerBridge.groovy)
2. [SofabatonXHub.groovy](SofabatonXHub.groovy)
3. [SofabatonXActivity.groovy](SofabatonXActivity.groovy)
4. [SofabatonXButtons.groovy](SofabatonXButtons.groovy)

Then open **Apps Code**, choose **New App**, paste
[SofabatonXServerApp.groovy](SofabatonXServerApp.groovy), and save. Open
**Apps → Add User App → SofaBaton X Server**.

Do not manually create devices or change their drivers. The app creates
and owns its bridge and the selected hub/activity/button devices.

## 3. Select devices

1. Enter the server base URL and click **Connect / reload hubs**.
2. Wait a few seconds, then reopen the app page to see the asynchronously
   loaded hub list. Select the hubs to expose.
3. Click **Load selected hubs**. Reopen the page after the catalogs load.
4. Select the activity switches you want, leave the ten-button remote
   enabled if desired, then click **Apply device selection** and **Done**.

The app only offers the permanent, lowercase MAC hub IDs. If no hubs
appear, check server registration/readiness and the bridge's `lastError`.
Device IDs include the app ID, hub MAC and activity ID, so renaming an
activity does not create a second device. Existing device labels are
preserved; rename them in Hubitat if desired.

Deselecting keeps devices and their last state, marks them `unselected`,
and blocks their outgoing controls. **Delete deselected devices** explicitly
removes them; first update any rules or dashboards using them. Uninstalling
the app removes its child devices but does not change the SofaBaton hub or
delete its server callback configuration.

The app binds its devices to one server URL. Use a new app installation
when switching servers. For a URL-only migration of the same server,
reinstallation is currently required; first account for rules referencing
the old child devices.

## 4. Make the remote trigger Hubitat

**Ordinary IR and Bluetooth button presses are not observable.** The remote
must execute a callback command that calls the server. The server forwards
that call to Hubitat over WebSocket.

The [first-press walkthrough](../../docs/getting-started.md#3-receive-your-first-remote-press)
provides a runnable setup command. For example, from the repository root:

```sh
python sofabaton-x-server/examples/starter.py --server http://192.168.1.10:8480 --hub-id e26a44861b45 setup-presses --activity 101 --button PLAY
```

Replace the example addresses/IDs with values from your server. **This
replaces PLAY's existing short and long assignments in activity 101.**
Choose an activity/button whose assignments you intend to replace. It
creates a callback device if missing or reuses the existing first slot.
Wait for setup to finish successfully and for the remote to synchronize.

In the Hubitat app, click **Load selected hubs** to load the callback
record. Select that activity on the physical remote, then press the chosen
button:

| Server callback | Hubitat event |
| --- | --- |
| Slot 1 short (command 1) | `pushed: 1` |
| Slot 1 long (command 11) | `held: 1` |
| Slot N short (command N, 1..10) | `pushed: N` |
| Slot N long (command N+10, 11..20) | `held: N` |

Use Button Controller or Rule Machine to map those events to lights,
scenes, or other actions. The `buttonLabels` attribute contains the server's
command-label map, and `lastButtonLabel` describes the latest event. Slots
are shared across the hub: the same slot assigned in different activities
produces the same Hubitat button number. Use different slots when different
actions are required. No release or double-tap events are synthesized.

For additional slots, edit that same default device in the panel's
**Wifi Commands** tab, use the
[callback API](../../docs/platform-integration.md#10-button-events) and
server configuration routes, or bind the deployed callback commands in
the official app. Preserve the complete callback specification when editing
labels. The Hubitat example never automatically rewrites your bindings.

The button device's **Push** and **Hold** commands generate *digital Hubitat
events* for testing rules; they do not send commands to SofaBaton. Actual
callback presses are emitted as *physical* events. Every distinct press
generates an event, even if the button number equals the previous one.

## Activity and command behavior

- Activity `on()` starts that activity, unless it is already active.
- Activity `off()` reads current status and stops only that activity if it
  is still running. Turning off an inactive tile does not stop another activity.
- `allOff()` reads status and stops the current activity. It does not send
  power-off to every independently operated device.
- Switches change on a server observation, not on HTTP acceptance. They
  describe SofaBaton's activity state, not measured equipment power.
- When disconnected/disabled, devices retain the last known switch state
  and advertise their unavailability separately. `observe` means the official
  app owns control through the proxy; cached observations still work.
- Every control request checks current `enabled`, `controllable`, and
  `catalog_ready`. Commands are refused when unavailable, with a reason in
  the hub device's `lastCommand` attribute. Accepted sends are not proof
  that the AV equipment acted.
- There is a small unavoidable interval between checking status and sending
  a stop: API 1 has no atomic "stop only if still current" operation. A
  concurrent remote activity change during that interval cannot be fully
  guarded by a client.

For direct command sending, find IDs in the panel's **Hub** view (or
the starter client's `devices` and `commands --device <id>` actions), then use the hub device's
`sendCommand(entityId, commandId)` command in Hubitat. Device and command
IDs must always stay paired. `startActivity(activityId)` and `findRemote()`
are also available as custom commands in rules.

## Recovery and limitations

The bridge reconnects with exponential backoff from 1 to 60 seconds and
checks the API version in the WebSocket hello. After reconnects, dropped
messages, relevant events, or sequence gaps, it rereads the hub list,
status, activity catalogs and callback records. A five-minute reconciliation
also reads those inexpensive endpoints. It never schedules a full structural
snapshot refresh or sends commands as a connection probe.

Events invalidate older in-flight HTTP reads. A control preflight invalidated
by a concurrent hub event is aborted; the user can try again. Presses are
deduplicated by server boot `instance_id` and global press sequence. The
sequence resets on a new server instance. **Missed button presses are never
replayed**, so an outage cannot cause old button actions to run on reconnection.

Control POSTs are never automatically retried. After an HTTP timeout the
outcome may be uncertain; inspect the actual device state. Asynchronous
responses from a previous WebSocket generation are discarded. Detailed
device/command catalogs and full snapshots are not persisted in Hubitat.

If presses do not arrive, check the app's callback status, server
`callback_listener.bound`, and the callback record's `target` versus
`effective_destination`. A stale callback device must be repaired on the
server and reloaded. Also check that the activity/button really calls the
deployed callback command rather than the original IR/Bluetooth command.

## Local validation

Run from the repository root with Groovy 2.4.21:

```sh
groovy sofabaton-x-server/examples/hubitat/tests/HubitatExampleTest.groovy
```

Or use an existing Java runtime and the Apache Groovy `groovy-all-2.4.21.jar`:

```sh
java -cp /path/to/groovy-all-2.4.21.jar groovy.ui.GroovyMain sofabaton-x-server/examples/hubitat/tests/HubitatExampleTest.groovy
```

The test compiles the app and all four drivers and runs their actual methods
against simulated devices, events, timers and HTTP responses. It covers
activity synchronization, inactive-switch stop protection, command payloads,
observe-mode refusal, uncertain POST failures, stale HTTP responses, short
and long presses, duplicates, multiple hubs, disconnects, server restart,
unselection/cleanup and incompatible API versions. It does not execute
Hubitat's metadata/UI DSL or its sandbox/network implementation.

Before relying on the example, install all five sources on Hubitat and verify:

1. One activity switched in each direction, including a change from the remote.
2. Two repeated short presses and one long press trigger the expected rules.
3. Opening the official app shows observe mode and blocks outgoing commands.
4. Restarting the server and Hubitat restores state without replaying buttons.
5. An inactive activity switch cannot stop the current activity.

References: [server integration contract](../../docs/platform-integration.md),
[Hubitat WebSocket interface](https://docs2.hubitat.com/en/developer/interfaces/websocket-interface),
[Hubitat's simple SofaBaton button example](https://github.com/hubitat/HubitatPublic/blob/master/examples/drivers/sofabatonX1S.groovy).
