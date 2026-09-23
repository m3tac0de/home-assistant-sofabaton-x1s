# Managing your hubs

Open `http://<server>:8480/` and select a hub in the picker at the top.
If you have not added a hub yet, follow [Getting started](getting-started.md).

[Edit configuration](#edit-devices-and-activities) ·
[Back up and restore](#back-up-and-restore) · [Web remote](web-remote.md) ·
[Wifi Commands](#wifi-commands) · [Hub and server settings](#hub-and-server-settings)

## Edit devices and activities

Open **Hub → Devices** or **Hub → Activities** and choose an entry.
The panel reads from its cached copy of the hub configuration. Use the
row's refresh action, or **Refresh all**, when you need a fresh read,
especially after editing in the official app.

In a device, you can edit its name, commands and payloads, button
assignments, power behavior and inputs. In an activity, you can edit its
devices, favorites, buttons, macros, power sequences and inputs.

1. Refresh the entry if needed, then open its editor.
2. Make your changes in the draft.
3. Review the changes and choose **Sync to Hub**.
4. Wait for the operation to finish. Allow the physical remote to
   synchronize before testing its updated configuration.

Deleting a command also removes its references on the hub. Assigning a
command to an occupied button can replace that button's existing assignment.

The official app and the server take turns controlling the hub. Close
the app before synchronizing; the panel prevents competing writes while
the app or another hub operation owns control.

### Where changes are saved

| Change | When it takes effect | Where it is kept |
| --- | --- | --- |
| A live device or activity draft | **Sync to Hub** writes the reviewed changes | The hub after synchronization; an unsynced draft is not a backup |
| Web remote layout | **Save** in **Remote → Layout** | The server's data directory, per hub; reload other open web remotes to pick it up |
| An edited backup | Download the edited file; use **Restore** to apply it | Your downloaded file; editing it does not change the live hub |
| Server listener ports | Restart the server after saving | Server settings; command-line and environment overrides take priority |

The hub pushes configuration changes to its physical remotes. If a remote
missed an update, open **Hub settings** from the cog menu and use
**Sync remote** after the current operation has finished. This asks the
physical remote to synchronize; it does not save an unfinished editor draft.

### If a change is interrupted

A failed or cancelled operation may have already changed part of the hub.
Read the reported outcome, then refresh and inspect the affected
configuration before retrying. **Resume** is available for some stopped
operations, but uncertain creates can be repeated; it is not a guarantee
that no duplicate will be made. Abrupt server restarts do not automatically
resume interrupted writes.

For the precise limits and retained records, see
[recovery and retention](api-reference.md#recovery-and-retention).

## Back up and restore

### Save a backup

Open **Backup → Make**, choose **Entire hub** or **Selected devices**, and
select **Start backup**. When it finishes, choose **Download backup** and
keep the file. A whole-hub backup includes activities, devices and command
payloads needed for restore.

Download promptly: the bundle is available for five minutes, or until
another backup starts on the same hub, it is discarded, or the server
restarts. **The server does not keep a backup archive.** Its persistent
cache and saved server settings are not a restorable hub backup.

### Edit a backup file

Open **Backup → Edit** and choose a backup file. Edit its devices,
activities, commands, payloads, buttons, order or hub name, then download
the edited result. This work stays in the browser and does not write to
the live hub. The loaded file is kept in the browser for an hour; download
your changes before leaving or reloading the page.

### Restore devices or activities

Open **Backup → Restore**, choose your backup file and select the devices
and activities to restore. Selecting an activity brings along the devices
it requires. Review the selection before choosing **Start restore**.

**Erase existing devices and activities** removes the hub's current
configuration before rebuilding it. Choose it only when you intend to
replace that configuration, and save a current backup first. A failed
restore can leave partial results, including an erased hub if erasure
succeeded before rebuilding failed. Inspect the outcome before retrying.

## Wifi Commands

Wifi Commands lets selected physical remote buttons deliver events to an
integration. The hub does not report ordinary IR or Bluetooth button
presses. A managed **Wifi Device** provides ten command slots you can
place on buttons, favorites or in activity behavior.

1. Open **Wifi Commands → Wifi Devices** and choose **Add**. This deploys
   an empty device immediately and opens its editor.
2. Give the device and its command slots useful names. A fresh slot shows
   **Make Command**.
3. Choose each command's physical button, long press, favorite and
   activities as needed. You can also configure power and input roles.
4. Review the draft and choose **Sync to Hub**.
5. Let the physical remote synchronize, then select the activity and press
   the assigned button. The corresponding device row and command tile
   light up in the panel when the event arrives.

An integration must receive the event and run the action in your
automation platform. Creating a Wifi Device alone does not create that
automation. See the [Hubitat example](../examples/hubitat/README.md) or
[Build an integration](first-integration.md#5-add-remote-button-automation-triggers).

HTTP delivery works on all supported hub models and needs the hub to
reach the server's callback listener, normally TCP **8060**. X1 always
uses 8060. X2 can use MQTT when the server is configured with the same
broker as the hub in the official app. MQTT configuration belongs to
[server startup settings](running-server.md#settings).

You can manage up to five Wifi Devices per hub, including the legacy
callback device used by the Hubitat example. A device missing from the
hub shows **Missing from hub** and offers **Redeploy**. For HTTP devices,
check the destination shown below the slots if the server's address has
changed or presses do not arrive.

Server-managed Wifi Devices and those created by the Home Assistant
integration belong to their respective systems; moving a hub between
them does not transfer the devices' automation behavior. See the
[Wifi Commands reference](api-reference.md#wifi-commands) for transport,
binding and model-specific details.

## Hub and server settings

Use the hub picker's **⋯** menu to enable, disable or remove a registered
hub, or retry a failed start. **Hub settings** in the cog menu shows the
selected hub's details and connection state. Removing a registration
forgets the server's cached state and saved web remote layout; it is
different from erasing the hub's devices and activities.

**Turn app proxy off** in **Hub settings** stops offering that hub to the
official Sofabaton app while the server keeps controlling it; **Turn app
proxy on** offers it again. The choice is kept per hub. An app that is
already connected stays until it disconnects. With the proxy off for
every hub, the server stops listening for the app altogether (its UDP
discovery port, 8102 by default, is closed).

**Server settings** in the cog menu shows server status and listener
settings. Port changes apply after restarting the server. Values supplied
through environment variables or command-line flags are pinned and must
be changed there. See [Running the server](running-server.md).

For diagnosis or integration development, open **Debug → Event stream**
to inspect live events, or **Debug → API console** to make API requests
and follow their progress. Neither is needed for everyday hub management.
