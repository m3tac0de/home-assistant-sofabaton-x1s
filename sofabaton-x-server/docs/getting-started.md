# Getting started with Sofabaton X Server

Set up the server, add your hub, try the web remote and save your first
backup. You can do all of this in the browser after installation; no
Home Assistant installation or integration code is needed.

If you are building a client, continue with
[Build an integration](first-integration.md) once your hub is working.

## Before you start

- A Sofabaton **X1, X1S or X2** hub connected to your network.
- A computer on that network that can stay running, with **Python 3.11+**,
  or Docker on Linux. Run one server for all your hubs.
- A browser on that computer or another device on your network.

**Fully close the official Sofabaton app on every phone or tablet before
initial setup.** A hub connected directly to the app stops advertising
itself. Keep the app closed until registration and your first control
test are complete, including when adding a hub by address.

If Home Assistant or another proxy already manages the hub, disable that
hub there before adding it to this server. The hub has one client
connection for these tools to share.

The server has no built-in authentication. Keep it on a trusted LAN, or
use an [authenticating reverse proxy](running-server.md#behind-a-reverse-proxy-tls).

## 1. Install and start the server

With Python 3.11+ installed, run:

```sh
python -m pip install "sofabaton-x-server>=0.2.1,<0.3"
sofabaton-x-server
```

The protocol library and web interface are included. Leave the server
running while you use the panel. The default data directory is `./data`
in the directory where you started it; start it from that same directory
next time, or set a fixed location with `--data-dir`.

For Docker, use the [Linux host-network recipe](running-server.md#docker).
For a source checkout, install from the repository root as described in
[Running the server](running-server.md#run).

Open `http://localhost:8480/` on the server computer. From another computer,
phone or tablet, use `http://<server>:8480/`, replacing `<server>` with the
server computer's IP address. This is the computer running the server,
not the physical hub's address.

## 2. Add your hub

1. Open the **hub picker** at the top of the control panel.
2. Wait for your hub to appear among discovered hubs, then select **Add**.
3. If it does not appear, confirm the official app is fully closed and
   scan again. Choose **Add by address…** to enter the physical hub's IP.
4. Select the registered hub and wait for it to connect and load its
   devices and activities. Open **Hub** to see them.

Repeat for any other hubs using the same server. Use the picker to switch
between them. You do not need a separate installation for each hub.

## 3. Try the web remote

1. Open **Remote → Card** with your hub selected.
2. Start an existing activity or send a command to a configured device.
3. Check that your equipment responds.

Controls may be unavailable while the hub is connecting, another operation
is running, or the official app is connected. Wait for the operation to
finish and close the app before testing again.

For a remote on its own, open `http://<server>:8480/ui/remote/`, select
your hub and bookmark the resulting page. You can use this on a phone,
tablet or wall panel. **Remote → Layout** in the control panel lets you
customize the web remote and save its layout for that hub.

## 4. Save your first backup

1. Open **Backup → Make**.
2. Select **Entire hub** and choose **Start backup**.
3. Wait for **Backup completed**, then choose **Download backup**.
4. Keep the downloaded file somewhere you can find it again.

**The downloaded file is your backup.** The server keeps a completed
download available for five minutes, or until another backup starts on
that hub, it is discarded, or the server restarts. It does not keep a
backup archive. Saving the server's data directory does not replace this
hub backup.

## 5. Make yourself at home

- **Hub → Devices**: browse and edit commands, button assignments and
  device configuration.
- **Hub → Activities**: edit favorites, buttons, macros, power sequences
  and inputs.
- **Remote → Layout**: arrange and style your web remote.
- **Backup → Edit / Restore**: edit a downloaded backup or restore
  selected devices and activities.

For live configuration edits, review your draft and use **Sync to Hub**.
Wait for completion and let the physical remote finish synchronizing
before testing its buttons. See [Managing your hubs](managing-hubs.md)
for the differences between drafts, hub configuration and server settings.

Keep the server running and preserve its data directory. See
[storage and upgrades](running-server.md#storage-and-upgrades) for keeping
the installation across restarts and updates.

## Using the official app after setup

The server provides a local proxy so the official Sofabaton app can still
connect. While the app is connected through it, the server observes the
session and pauses its own control commands and configuration writes.
Close the app when you want to control or edit through the server again.
To keep the app away from a hub, use **Turn app proxy off** in **Hub
settings**.

If you changed configuration in the app, refresh the affected devices or
activities in **Hub** before editing them in the panel.

## If something does not work

| Symptom | First check |
| --- | --- |
| The panel will not open | Confirm the server is running. Try `http://localhost:8480/` on its computer. From another device, use that computer's LAN address and allow TCP 8480 through its firewall. |
| A hub is missing from discovery | Fully close the official app everywhere, then scan again. Check that the server and hub can communicate on the LAN. |
| A registered hub will not connect | Check the hub address, power and network, and disable any other proxy managing it. Allow the hub to reach the server on TCP 8200 by default. |
| Controls or Sync to Hub are unavailable | Close the official app; wait for the current operation and initial loading to finish. Check the hub's connection state. |
| The panel shows old configuration | Close the official app, then refresh the affected row or use **Refresh all** in Hub. |
| Equipment does not respond | Confirm the selected activity or device and command, and check that the equipment can receive the hub's signal. |
| The backup download expired | Create a new backup and download it as soon as it completes. |
| A write failed or was interrupted | Read the reported outcome and refresh the hub before deciding what to do next. Some changes may already have reached the hub; see [interrupted changes](managing-hubs.md#if-a-change-is-interrupted). |

For ports, containers and proxy configuration, see
[Running the server](running-server.md). For help, include your server
version, hub model and firmware, installation method and relevant logs in
an [issue](https://github.com/m3tac0de/home-assistant-sofabaton-x1s/issues).
