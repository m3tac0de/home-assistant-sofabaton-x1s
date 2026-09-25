# Sofabaton X Server

**Manage your Sofabaton hubs from your browser.**

Sofabaton X Server is a self-hosted management application for **X1, X1S,
and X2** hubs. Configure devices and activities, edit commands and button
assignments, back up and restore your configuration, and control your
equipment with the built-in web remote.

Run one server for all your hubs. Open it from a computer, phone or tablet
on your network. **No Home Assistant installation is required.** Its local
HTTP and WebSocket API also lets you connect your hubs to automation
platforms and build your own integrations.

> Unofficial community project; not affiliated with or endorsed by Sofabaton.

[Get started](https://github.com/m3tac0de/home-assistant-sofabaton-x1s/blob/main/sofabaton-x-server/docs/getting-started.md) ·
[Manage your hubs](https://github.com/m3tac0de/home-assistant-sofabaton-x1s/blob/main/sofabaton-x-server/docs/managing-hubs.md) ·
[Run the server](https://github.com/m3tac0de/home-assistant-sofabaton-x1s/blob/main/sofabaton-x-server/docs/running-server.md) ·
[Build an integration](https://github.com/m3tac0de/home-assistant-sofabaton-x1s/blob/main/sofabaton-x-server/docs/first-integration.md)

## Control panel

| What you want to do | Where to start |
| --- | --- |
| Add a hub or switch between hubs | The hub picker at the top of the panel |
| Edit devices, commands and IR payloads | **Hub → Devices** |
| Change activity buttons, favorites, macros, power sequences and inputs | **Hub → Activities** |
| Create, edit or restore a backup | **Backup → Make / Edit / Restore** |
| Control equipment and customize your web remote | **Remote → Card / Layout** |
| Set up remote buttons for an integration to use | **Wifi Commands** |

Review configuration changes before **Sync to Hub** writes them. The panel
shows progress and prevents competing writes while another hub operation
or the official Sofabaton app owns control.

Follow the [hub management guide](https://github.com/m3tac0de/home-assistant-sofabaton-x1s/blob/main/sofabaton-x-server/docs/managing-hubs.md)
for editing, synchronization, backups and Wifi Commands.

## Run

You need a Sofabaton X1, X1S or X2 hub, a computer that can stay running
on its network, and **Python 3.11+** or Docker on Linux.

**Fully close the official Sofabaton app on all phones and tablets before
setup.** If another proxy, including the Home Assistant integration,
already manages the hub, disable that hub there first.

Install the server and start it (the protocol library is included):

```sh
python -m pip install "sofabaton-x-server>=0.2.2,<0.3"
sofabaton-x-server
```

Open `http://<server>:8480/`, or `http://localhost:8480/` on the server
computer. Add your hub through the hub picker, try **Remote**, then create
and download your first backup.

The [getting-started guide](https://github.com/m3tac0de/home-assistant-sofabaton-x1s/blob/main/sofabaton-x-server/docs/getting-started.md)
walks through each step. Keep the server's data directory across restarts.
The server has no built-in authentication; use it on a trusted LAN or
behind an authenticating reverse proxy.

<!-- Keep earlier deployment links and bookmarks useful. -->
<a id="docker"></a>
<a id="behind-a-reverse-proxy-tls"></a>
<a id="settings"></a>
<a id="security"></a>

For [Docker](https://github.com/m3tac0de/home-assistant-sofabaton-x1s/blob/main/sofabaton-x-server/docs/running-server.md#docker),
[networking and reverse proxies](https://github.com/m3tac0de/home-assistant-sofabaton-x1s/blob/main/sofabaton-x-server/docs/running-server.md#behind-a-reverse-proxy-tls),
[settings](https://github.com/m3tac0de/home-assistant-sofabaton-x1s/blob/main/sofabaton-x-server/docs/running-server.md#settings),
and [storage and upgrades](https://github.com/m3tac0de/home-assistant-sofabaton-x1s/blob/main/sofabaton-x-server/docs/running-server.md#storage-and-upgrades),
see **Running the server**.

## Using the official Sofabaton app

After setup, the official app can connect through the server's local
proxy. The hub normally accepts one client connection; the server holds
that connection and presents a virtual hub to the app.

While the app is connected, the server observes the session and pauses
control and configuration writes. Close the app to return control to the
panel and your integrations. After editing in the app, refresh the affected
devices or activities in the panel.

<a id="ir-payloads-backup-restore"></a>

## Back up and restore

Use **Backup → Make** to save your entire hub or selected devices, then
download the result. Edit a backup file in the browser or restore selected
devices and activities through **Backup → Edit / Restore**.

The downloaded file is your backup; the server keeps no backup archive.
See [back up and restore](https://github.com/m3tac0de/home-assistant-sofabaton-x1s/blob/main/sofabaton-x-server/docs/managing-hubs.md#back-up-and-restore)
for the steps and restore options. For command payloads, see the
[IR reference](https://github.com/m3tac0de/home-assistant-sofabaton-x1s/blob/main/sofabaton-x-server/docs/api-reference.md#ir-payloads-backup-restore).

## Web remote

Use **Remote** in the panel, or open `http://<server>:8480/ui/remote/`
for a standalone remote. Select a hub, bookmark the page, or add it to
your phone's home screen. Customize its buttons and layout in
**Remote → Layout** and save the configuration for that hub.

See the [web remote guide](https://github.com/m3tac0de/home-assistant-sofabaton-x1s/blob/main/sofabaton-x-server/docs/web-remote.md)
for layout options, device mode and dashboard embedding.

<a id="wifi-commands"></a>
<a id="button-events"></a>
<a id="mqtt"></a>

## Connect an automation platform

The server provides activity control, command sending, hub state and
remote-button events for integrations. **Wifi Commands** lets you assign
selected remote buttons to events an integration can receive. An
integration must receive those events and run the actions in your platform.

The [Hubitat example](https://github.com/m3tac0de/home-assistant-sofabaton-x1s/blob/main/sofabaton-x-server/examples/hubitat/README.md)
demonstrates activity switches, command actions and button events.
Developers can use the same API to build integrations for other platforms.

For setup, see [Wifi Commands](https://github.com/m3tac0de/home-assistant-sofabaton-x1s/blob/main/sofabaton-x-server/docs/managing-hubs.md#wifi-commands).
For delivery details, see the [button-event](https://github.com/m3tac0de/home-assistant-sofabaton-x1s/blob/main/sofabaton-x-server/docs/api-reference.md#button-events)
and [MQTT reference](https://github.com/m3tac0de/home-assistant-sofabaton-x1s/blob/main/sofabaton-x-server/docs/api-reference.md#mqtt).

<!-- Earlier reference anchors remain entry points to the moved material. -->
<a id="api"></a>
<a id="snapshot"></a>
<a id="jobs"></a>
<a id="writes"></a>
<a id="whole-document-writes"></a>
<a id="recovery-and-retention"></a>
<a id="discovery"></a>
<a id="events-websocket"></a>

## Build an integration

Use the server as the starting point for a platform integration. Let users
configure their hubs in the panel, then select those hubs in your client.
Your integration can focus on controls, state and automations, and link
back to management and the web remote.

- [Build an integration](https://github.com/m3tac0de/home-assistant-sofabaton-x1s/blob/main/sofabaton-x-server/docs/first-integration.md): activity controls, synchronized state, command actions and remote-button triggers, with an optional runnable client.
- [Platform integration guide](https://github.com/m3tac0de/home-assistant-sofabaton-x1s/blob/main/sofabaton-x-server/docs/platform-integration.md): production behavior, errors, reconnection and optional editing flows.
- [API reference](https://github.com/m3tac0de/home-assistant-sofabaton-x1s/blob/main/sofabaton-x-server/docs/api-reference.md): snapshots, jobs, writes, recovery, IR payloads, backups, discovery and events.
- [OpenAPI document](https://github.com/m3tac0de/home-assistant-sofabaton-x1s/blob/main/sofabaton-x-server/openapi.json): the committed contract for generated clients. A running server also serves interactive docs at `/api/v1/docs`.

## Help and releases

Start with [setup troubleshooting](https://github.com/m3tac0de/home-assistant-sofabaton-x1s/blob/main/sofabaton-x-server/docs/getting-started.md#if-something-does-not-work).
For a bug report, [open an issue](https://github.com/m3tac0de/home-assistant-sofabaton-x1s/issues)
with your server version, hub model and firmware, installation method,
relevant logs and steps to reproduce the problem.

This README describes **0.2.2**, using **API 1** and
**sofabaton-x >=0.2.2,<0.3**. Read the
[changelog and upgrade notes](https://github.com/m3tac0de/home-assistant-sofabaton-x1s/blob/main/sofabaton-x-server/CHANGELOG.md)
when updating. This release adds an X2 number pad, optional update checks,
per-hub app-proxy controls and firmware guidance, and fixes hub display
order and discovery by the official app.

## Development

See [server development](https://github.com/m3tac0de/home-assistant-sofabaton-x1s/blob/main/sofabaton-x-server/docs/development.md)
for building the UI, tests, OpenAPI generation and releases.
